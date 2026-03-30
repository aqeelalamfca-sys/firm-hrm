import { Router } from "express";
import { db } from "@workspace/db";
import { employeesTable } from "@workspace/db";
import { eq, and, sql, inArray } from "drizzle-orm";
import { type AuthenticatedRequest, requireRoles } from "../middleware/auth";

const ADMIN_ROLES = ["super_admin", "hr_admin", "partner", "manager"];
const router = Router();

async function generateEmployeeCode(): Promise<string> {
  const result = await db.select({ count: sql<number>`count(*)` }).from(employeesTable);
  const count = Number(result[0].count) + 1;
  return `EMP${String(count).padStart(4, "0")}`;
}

function formatEmployee(emp: any, reportingManagerName: string | null = null) {
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
    icapRegistrationStatus: emp.icapRegistrationStatus,
    articlesEndingDate: emp.articlesEndingDate,
    articlesExtensionPeriod: emp.articlesExtensionPeriod,
    createdAt: emp.createdAt,
  };
}

router.get("/", async (req: AuthenticatedRequest, res) => {
  try {
    const { department, status } = req.query;
    const user = req.user!;
    const conditions = [];

    if (!ADMIN_ROLES.includes(user.role)) {
      if (user.employeeId) {
        conditions.push(eq(employeesTable.id, user.employeeId));
      } else {
        return res.json([]);
      }
    }

    if (department) conditions.push(eq(employeesTable.department, department as string));
    if (status) conditions.push(eq(employeesTable.status, status as any));

    const employees = conditions.length > 0
      ? await db.select().from(employeesTable).where(and(...conditions))
      : await db.select().from(employeesTable);

    const managerIds = [...new Set(employees.map(e => e.reportingManagerId).filter(Boolean))] as number[];
    const managersMap = new Map<number, string>();
    if (managerIds.length > 0) {
      const managers = await db.select().from(employeesTable).where(inArray(employeesTable.id, managerIds));
      for (const m of managers) managersMap.set(m.id, `${m.firstName} ${m.lastName}`);
    }

    res.json(employees.map(emp => formatEmployee(emp, emp.reportingManagerId ? (managersMap.get(emp.reportingManagerId) ?? null) : null)));
  } catch (error) {
    console.error("Error fetching employees:", error);
    res.status(500).json({ error: "Failed to fetch employees" });
  }
});

router.get("/:id", async (req: AuthenticatedRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const user = req.user!;

    if (!ADMIN_ROLES.includes(user.role) && user.employeeId !== id) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }

    const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, id));
    if (!emp) return res.status(404).json({ error: "Employee not found" });

    let reportingManagerName = null;
    if (emp.reportingManagerId) {
      const [manager] = await db.select().from(employeesTable).where(eq(employeesTable.id, emp.reportingManagerId));
      if (manager) reportingManagerName = `${manager.firstName} ${manager.lastName}`;
    }

    res.json(formatEmployee(emp, reportingManagerName));
  } catch (error) {
    console.error("Error fetching employee:", error);
    res.status(500).json({ error: "Failed to fetch employee" });
  }
});

router.post("/", requireRoles(...ADMIN_ROLES), async (req, res) => {
  try {
    const { firstName, lastName, email, phone, department, designation, joiningDate, salary, reportingManagerId, cnic, address, trainingPeriod, icapRegistrationStatus, articlesEndingDate, articlesExtensionPeriod } = req.body;

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
      icapRegistrationStatus: icapRegistrationStatus || null,
      articlesEndingDate: articlesEndingDate || null,
      articlesExtensionPeriod: articlesExtensionPeriod || null,
    }).returning();

    res.status(201).json({ ...emp, salary: Number(emp.salary) });
  } catch (error) {
    console.error("Error creating employee:", error);
    res.status(500).json({ error: "Failed to create employee" });
  }
});

router.put("/:id", requireRoles(...ADMIN_ROLES), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const updates: Record<string, any> = {};

    const fields = ["firstName", "lastName", "phone", "department", "designation", "status", "reportingManagerId", "address", "cnic", "trainingPeriod", "icapRegistrationStatus", "articlesEndingDate", "articlesExtensionPeriod"];
    for (const f of fields) {
      if (req.body[f] !== undefined) updates[f] = req.body[f];
    }
    if (req.body.salary !== undefined) updates.salary = req.body.salary.toString();
    updates.updatedAt = new Date();

    const [emp] = await db.update(employeesTable).set(updates).where(eq(employeesTable.id, id)).returning();
    if (!emp) return res.status(404).json({ error: "Employee not found" });

    res.json({ ...emp, salary: Number(emp.salary) });
  } catch (error) {
    console.error("Error updating employee:", error);
    res.status(500).json({ error: "Failed to update employee" });
  }
});

export default router;
