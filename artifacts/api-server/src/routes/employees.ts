import { Router } from "express";
import { db } from "@workspace/db";
import { employeesTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";

const router = Router();

async function generateEmployeeCode(): Promise<string> {
  const result = await db.select({ count: sql<number>`count(*)` }).from(employeesTable);
  const count = Number(result[0].count) + 1;
  return `EMP${String(count).padStart(4, "0")}`;
}

router.get("/", async (req, res) => {
  const { department, status } = req.query;
  let query = db.select().from(employeesTable);

  const conditions = [];
  if (department) conditions.push(eq(employeesTable.department, department as string));
  if (status) conditions.push(eq(employeesTable.status, status as any));

  const employees = conditions.length > 0
    ? await db.select().from(employeesTable).where(and(...conditions))
    : await db.select().from(employeesTable);

  const result = await Promise.all(
    employees.map(async (emp) => {
      let reportingManagerName = null;
      if (emp.reportingManagerId) {
        const managers = await db.select().from(employeesTable).where(eq(employeesTable.id, emp.reportingManagerId));
        if (managers[0]) reportingManagerName = `${managers[0].firstName} ${managers[0].lastName}`;
      }
      return {
        id: emp.id,
        employeeCode: emp.employeeCode,
        firstName: emp.firstName,
        lastName: emp.lastName,
        email: emp.email,
        phone: emp.phone,
        department: emp.department,
        designation: emp.designation,
        joiningDate: emp.joiningDate,
        salary: Number(emp.salary),
        status: emp.status,
        reportingManagerId: emp.reportingManagerId,
        reportingManagerName,
        cnic: emp.cnic,
        address: emp.address,
        trainingPeriod: emp.trainingPeriod,
        createdAt: emp.createdAt,
      };
    })
  );

  res.json(result);
});

router.get("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const employees = await db.select().from(employeesTable).where(eq(employeesTable.id, id));
  const emp = employees[0];
  if (!emp) return res.status(404).json({ error: "Employee not found" });

  let reportingManagerName = null;
  if (emp.reportingManagerId) {
    const managers = await db.select().from(employeesTable).where(eq(employeesTable.id, emp.reportingManagerId));
    if (managers[0]) reportingManagerName = `${managers[0].firstName} ${managers[0].lastName}`;
  }

  res.json({
    id: emp.id,
    employeeCode: emp.employeeCode,
    firstName: emp.firstName,
    lastName: emp.lastName,
    email: emp.email,
    phone: emp.phone,
    department: emp.department,
    designation: emp.designation,
    joiningDate: emp.joiningDate,
    salary: Number(emp.salary),
    status: emp.status,
    reportingManagerId: emp.reportingManagerId,
    reportingManagerName,
    cnic: emp.cnic,
    address: emp.address,
    trainingPeriod: emp.trainingPeriod,
    createdAt: emp.createdAt,
  });
});

router.post("/", async (req, res) => {
  const { firstName, lastName, email, phone, department, designation, joiningDate, salary, reportingManagerId, cnic, address, trainingPeriod } = req.body;

  if (!firstName || !lastName || !email || !department || !designation || !joiningDate || !salary) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const employeeCode = await generateEmployeeCode();
  const [emp] = await db.insert(employeesTable).values({
    employeeCode,
    firstName,
    lastName,
    email,
    phone: phone || null,
    department,
    designation,
    joiningDate,
    salary: salary.toString(),
    reportingManagerId: reportingManagerId || null,
    cnic: cnic || null,
    address: address || null,
    trainingPeriod: trainingPeriod || null,
  }).returning();

  res.status(201).json({
    ...emp,
    salary: Number(emp.salary),
  });
});

router.put("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const updates: Record<string, any> = {};

  const fields = ["firstName", "lastName", "phone", "department", "designation", "status", "reportingManagerId", "address", "cnic", "trainingPeriod"];
  for (const f of fields) {
    if (req.body[f] !== undefined) updates[f === "firstName" ? "firstName" : f === "lastName" ? "lastName" : f] = req.body[f];
  }
  if (req.body.salary !== undefined) updates.salary = req.body.salary.toString();
  updates.updatedAt = new Date();

  const [emp] = await db.update(employeesTable).set(updates).where(eq(employeesTable.id, id)).returning();
  if (!emp) return res.status(404).json({ error: "Employee not found" });

  res.json({ ...emp, salary: Number(emp.salary) });
});

export default router;
