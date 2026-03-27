import { Router } from "express";
import { db } from "@workspace/db";
import { payrollTable, employeesTable, attendanceTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const router = Router();

router.get("/", async (req, res) => {
  const { month, year } = req.query;
  let records = await db.select().from(payrollTable);
  if (month) records = records.filter(r => r.month === month);
  if (year) records = records.filter(r => r.year === parseInt(year as string));

  const result = await Promise.all(
    records.map(async (r) => {
      const emps = await db.select().from(employeesTable).where(eq(employeesTable.id, r.employeeId));
      const emp = emps[0];
      return {
        id: r.id,
        employeeId: r.employeeId,
        employeeName: emp ? `${emp.firstName} ${emp.lastName}` : "Unknown",
        employeeCode: emp?.employeeCode || "???",
        month: r.month,
        year: r.year,
        basicSalary: Number(r.basicSalary),
        allowances: Number(r.allowances),
        deductions: Number(r.deductions),
        advances: Number(r.advances),
        netSalary: Number(r.netSalary),
        workingDays: r.workingDays,
        presentDays: r.presentDays,
        paymentStatus: r.paymentStatus,
        paidDate: r.paidDate,
        notes: r.notes,
      };
    })
  );

  res.json(result);
});

router.get("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const records = await db.select().from(payrollTable).where(eq(payrollTable.id, id));
  const r = records[0];
  if (!r) return res.status(404).json({ error: "Payroll record not found" });

  const emps = await db.select().from(employeesTable).where(eq(employeesTable.id, r.employeeId));
  const emp = emps[0];

  res.json({
    id: r.id,
    employeeId: r.employeeId,
    employeeName: emp ? `${emp.firstName} ${emp.lastName}` : "Unknown",
    employeeCode: emp?.employeeCode || "???",
    month: r.month,
    year: r.year,
    basicSalary: Number(r.basicSalary),
    allowances: Number(r.allowances),
    deductions: Number(r.deductions),
    advances: Number(r.advances),
    netSalary: Number(r.netSalary),
    workingDays: r.workingDays,
    presentDays: r.presentDays,
    paymentStatus: r.paymentStatus,
    paidDate: r.paidDate,
    notes: r.notes,
  });
});

router.post("/", async (req, res) => {
  const { month, year } = req.body;
  if (!month || !year) return res.status(400).json({ error: "Month and year required" });

  const employees = await db.select().from(employeesTable).where(eq(employeesTable.status, "active"));

  const workingDays = 26; // Standard working days per month

  const records = await Promise.all(
    employees.map(async (emp) => {
      const existingPayroll = await db.select().from(payrollTable)
        .where(and(eq(payrollTable.employeeId, emp.id), eq(payrollTable.month, month), eq(payrollTable.year, parseInt(year))));
      
      if (existingPayroll.length > 0) return null;

      const attRecords = await db.select().from(attendanceTable).where(eq(attendanceTable.employeeId, emp.id));
      const monthAttendance = attRecords.filter(r => {
        const d = new Date(r.date);
        const [mn, yr] = month.split("-");
        return d.getMonth() + 1 === parseInt(mn) && d.getFullYear() === parseInt(yr);
      });

      const presentDays = monthAttendance.filter(r => r.status === "present" || r.status === "late").length;
      const basicSalary = Number(emp.salary);
      const perDaySalary = basicSalary / workingDays;
      const netSalary = presentDays > 0 ? (perDaySalary * presentDays) : basicSalary;

      const [record] = await db.insert(payrollTable).values({
        employeeId: emp.id,
        month,
        year: parseInt(year),
        basicSalary: basicSalary.toString(),
        allowances: "0",
        deductions: "0",
        advances: "0",
        netSalary: netSalary.toFixed(2),
        workingDays,
        presentDays: presentDays || workingDays,
        paymentStatus: "pending",
      }).returning();

      return {
        id: record.id,
        employeeId: emp.id,
        employeeName: `${emp.firstName} ${emp.lastName}`,
        employeeCode: emp.employeeCode,
        month: record.month,
        year: record.year,
        basicSalary: Number(record.basicSalary),
        allowances: Number(record.allowances),
        deductions: Number(record.deductions),
        advances: Number(record.advances),
        netSalary: Number(record.netSalary),
        workingDays: record.workingDays,
        presentDays: record.presentDays,
        paymentStatus: record.paymentStatus,
        paidDate: record.paidDate,
        notes: record.notes,
      };
    })
  );

  res.status(201).json(records.filter(Boolean));
});

export default router;
