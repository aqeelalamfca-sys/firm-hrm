import { Router } from "express";
import { db } from "@workspace/db";
import { attendanceTable, employeesTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { type AuthenticatedRequest } from "../middleware/auth";

const router = Router();

async function getEmployeeName(employeeId: number) {
  const emps = await db.select().from(employeesTable).where(eq(employeesTable.id, employeeId));
  if (!emps[0]) return { name: "Unknown", code: "???" };
  return { name: `${emps[0].firstName} ${emps[0].lastName}`, code: emps[0].employeeCode };
}

router.get("/summary", async (req, res) => {
  const { month, year } = req.query;
  const employees = await db.select().from(employeesTable).where(eq(employeesTable.status, "active"));

  const summaries = await Promise.all(
    employees.map(async (emp) => {
      let records = await db.select().from(attendanceTable).where(eq(attendanceTable.employeeId, emp.id));
      if (month && year) {
        records = records.filter(r => {
          const d = new Date(r.date);
          return d.getMonth() + 1 === parseInt(month as string) && d.getFullYear() === parseInt(year as string);
        });
      }

      const totalDays = records.length;
      const presentDays = records.filter(r => r.status === "present").length;
      const absentDays = records.filter(r => r.status === "absent").length;
      const lateDays = records.filter(r => r.status === "late").length;
      const halfDays = records.filter(r => r.status === "half_day").length;
      const leaveDays = records.filter(r => r.status === "leave").length;
      const attendancePercentage = totalDays > 0 ? Math.round((presentDays + lateDays) / totalDays * 100) : 0;

      return {
        employeeId: emp.id,
        employeeName: `${emp.firstName} ${emp.lastName}`,
        employeeCode: emp.employeeCode,
        totalDays,
        presentDays,
        absentDays,
        lateDays,
        halfDays,
        leaveDays,
        attendancePercentage,
      };
    })
  );

  res.json(summaries);
});

router.get("/", async (req, res) => {
  const { employeeId, month, year } = req.query;

  let records = await db.select().from(attendanceTable);
  if (employeeId) records = records.filter(r => r.employeeId === parseInt(employeeId as string));
  if (month && year) {
    records = records.filter(r => {
      const d = new Date(r.date);
      return d.getMonth() + 1 === parseInt(month as string) && d.getFullYear() === parseInt(year as string);
    });
  }

  const result = await Promise.all(
    records.map(async (r) => {
      const { name, code } = await getEmployeeName(r.employeeId);
      return {
        id: r.id,
        employeeId: r.employeeId,
        employeeName: name,
        employeeCode: code,
        date: r.date,
        checkIn: r.checkIn,
        checkOut: r.checkOut,
        status: r.status,
        hoursWorked: r.hoursWorked ? Number(r.hoursWorked) : null,
        ipAddress: (r as any).ipAddress || null,
        notes: r.notes,
      };
    })
  );

  res.json(result.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
});

router.post("/", async (req: AuthenticatedRequest, res) => {
  const { employeeId, date, checkIn, checkOut, status, notes } = req.body;
  if (!employeeId || !date || !status) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  let hoursWorked = null;
  if (checkIn && checkOut) {
    const [inH, inM] = checkIn.split(":").map(Number);
    const [outH, outM] = checkOut.split(":").map(Number);
    hoursWorked = ((outH * 60 + outM) - (inH * 60 + inM)) / 60;
  }

  const [record] = await db.insert(attendanceTable).values({
    employeeId: parseInt(employeeId),
    date,
    checkIn: checkIn || null,
    checkOut: checkOut || null,
    status,
    hoursWorked: hoursWorked?.toString() || null,
    notes: notes || null,
    ipAddress: req.ip || null,
  }).returning();

  const { name, code } = await getEmployeeName(record.employeeId);
  res.status(201).json({
    id: record.id,
    employeeId: record.employeeId,
    employeeName: name,
    employeeCode: code,
    date: record.date,
    checkIn: record.checkIn,
    checkOut: record.checkOut,
    status: record.status,
    hoursWorked: record.hoursWorked ? Number(record.hoursWorked) : null,
    ipAddress: (record as any).ipAddress || null,
    notes: record.notes,
  });
});

router.put("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const { checkIn, checkOut, status, notes } = req.body;
  
  const updates: Record<string, any> = { updatedAt: new Date() };
  if (checkIn !== undefined) updates.checkIn = checkIn;
  if (checkOut !== undefined) updates.checkOut = checkOut;
  if (status !== undefined) updates.status = status;
  if (notes !== undefined) updates.notes = notes;

  if (checkIn && checkOut) {
    const [inH, inM] = checkIn.split(":").map(Number);
    const [outH, outM] = checkOut.split(":").map(Number);
    updates.hoursWorked = (((outH * 60 + outM) - (inH * 60 + inM)) / 60).toString();
  }

  const [record] = await db.update(attendanceTable).set(updates).where(eq(attendanceTable.id, id)).returning();
  if (!record) return res.status(404).json({ error: "Attendance record not found" });

  const { name, code } = await getEmployeeName(record.employeeId);
  res.json({
    id: record.id,
    employeeId: record.employeeId,
    employeeName: name,
    employeeCode: code,
    date: record.date,
    checkIn: record.checkIn,
    checkOut: record.checkOut,
    status: record.status,
    hoursWorked: record.hoursWorked ? Number(record.hoursWorked) : null,
    notes: record.notes,
  });
});

export default router;
