import { Router } from "express";
import { db } from "@workspace/db";
import { leavesTable, employeesTable, usersTable } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { createNotification } from "./notifications";
import { requireRoles, type AuthenticatedRequest } from "../middleware/auth";

const ADMIN_ROLES = ["super_admin", "hr_admin", "partner", "manager"];

const router = Router();

router.get("/", async (req: AuthenticatedRequest, res) => {
  try {
    const { employeeId, status } = req.query;
    const user = req.user!;

    const conditions: any[] = [];

    if (!ADMIN_ROLES.includes(user.role)) {
      if (user.employeeId) {
        conditions.push(eq(leavesTable.employeeId, user.employeeId));
      } else {
        return res.json([]);
      }
    } else if (employeeId) {
      conditions.push(eq(leavesTable.employeeId, parseInt(employeeId as string)));
    }

    if (status) conditions.push(eq(leavesTable.status, status as any));

    const records = conditions.length > 0
      ? await db.select().from(leavesTable).where(and(...conditions))
      : await db.select().from(leavesTable);

    if (records.length === 0) return res.json([]);

    const employeeIds = [...new Set(records.map((r: any) => r.employeeId))];
    const approverIds = [...new Set(records.map((r: any) => r.approvedById).filter(Boolean))] as number[];

    const [employees, users] = await Promise.all([
      db.select().from(employeesTable).where(inArray(employeesTable.id, employeeIds)),
      approverIds.length > 0
        ? db.select().from(usersTable).where(inArray(usersTable.id, approverIds))
        : Promise.resolve([]),
    ]);

    const empMap = new Map(employees.map((e: any) => [e.id, `${e.firstName} ${e.lastName}`]));
    const userMap = new Map(users.map((u: any) => [u.id, u.name]));

    const result = records.map((r: any) => ({
      id: r.id,
      employeeId: r.employeeId,
      employeeName: empMap.get(r.employeeId) ?? "Unknown",
      leaveType: r.leaveType,
      fromDate: r.fromDate,
      toDate: r.toDate,
      totalDays: r.totalDays,
      reason: r.reason,
      status: r.status,
      approvedById: r.approvedById,
      approvedByName: r.approvedById ? (userMap.get(r.approvedById) ?? null) : null,
      approvalNotes: r.approvalNotes,
      createdAt: r.createdAt,
    }));

    res.json(result.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
  } catch (error) {
    console.error("Error fetching leaves:", error);
    res.status(500).json({ error: "Failed to fetch leaves" });
  }
});

router.post("/", async (req: AuthenticatedRequest, res) => {
  try {
    const { leaveType, fromDate, toDate, reason } = req.body;
    const user = req.user!;

    let employeeId = req.body.employeeId;
    if (!ADMIN_ROLES.includes(user.role)) {
      if (!user.employeeId) {
        return res.status(400).json({ error: "No employee record linked to your account" });
      }
      employeeId = user.employeeId;
    }

    if (!employeeId || !leaveType || !fromDate || !toDate || !reason) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const from = new Date(fromDate);
    const to = new Date(toDate);
    const totalDays = Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)) + 1;

    const [record] = await db.insert(leavesTable).values({
      employeeId: parseInt(employeeId),
      leaveType,
      fromDate,
      toDate,
      totalDays,
      reason,
      status: "pending",
    }).returning();

    const [emp] = await db.select().from(employeesTable).where(eq(employeesTable.id, record.employeeId));

    res.status(201).json({
      ...record,
      employeeName: emp ? `${emp.firstName} ${emp.lastName}` : "Unknown",
      approvedByName: null,
    });
  } catch (error) {
    console.error("Error creating leave:", error);
    res.status(500).json({ error: "Failed to create leave" });
  }
});

router.put("/:id", requireRoles(...ADMIN_ROLES), async (req: AuthenticatedRequest, res) => {
  try {
    const id = parseInt(req.params.id as string);
    const { status, approvalNotes } = req.body;
    if (!status) return res.status(400).json({ error: "Status required" });

    if (status === "rejected" && !approvalNotes) {
      return res.status(400).json({ error: "Rejection reason is required" });
    }

    const reviewerUserId = req.user?.id || null;

    const [record] = await db.update(leavesTable).set({
      status,
      approvalNotes: approvalNotes || null,
      approvedById: reviewerUserId,
      updatedAt: new Date(),
    }).where(eq(leavesTable.id, id)).returning();

    if (!record) return res.status(404).json({ error: "Leave not found" });

    const [[emp], reviewer] = await Promise.all([
      db.select().from(employeesTable).where(eq(employeesTable.id, record.employeeId)),
      reviewerUserId
        ? db.select().from(usersTable).where(eq(usersTable.id, reviewerUserId)).then((r: any) => r[0])
        : Promise.resolve(null),
    ]);

    if (emp && (status === "approved" || status === "rejected")) {
      const [linkedUser] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.employeeId, record.employeeId));
      if (linkedUser) {
        const notificationMsg = status === "rejected"
          ? `Your ${record.leaveType} leave from ${record.fromDate} to ${record.toDate} has been rejected. Reason: ${approvalNotes}`
          : `Your ${record.leaveType} leave from ${record.fromDate} to ${record.toDate} has been approved${approvalNotes ? `. Note: ${approvalNotes}` : ""}`;
        await createNotification({
          userId: linkedUser.id,
          type: status === "approved" ? "leave_approved" : "leave_rejected",
          title: `Leave ${status === "approved" ? "Approved" : "Rejected"}`,
          message: notificationMsg,
          relatedEntityType: "leave",
          relatedEntityId: record.id,
        });
      }
    }

    res.json({
      ...record,
      employeeName: emp ? `${emp.firstName} ${emp.lastName}` : "Unknown",
      approvedByName: reviewer?.name ?? null,
    });
  } catch (error) {
    console.error("Error updating leave:", error);
    res.status(500).json({ error: "Failed to update leave" });
  }
});

router.delete("/:id", requireRoles(...ADMIN_ROLES), async (req: AuthenticatedRequest, res) => {
  try {
    const id = parseInt(req.params.id as string);
    const [deleted] = await db.delete(leavesTable).where(eq(leavesTable.id, id)).returning();
    if (!deleted) return res.status(404).json({ error: "Leave record not found" });
    res.json({ message: "Leave deleted successfully", id: deleted.id });
  } catch (error) {
    console.error("Error deleting leave:", error);
    res.status(500).json({ error: "Failed to delete leave" });
  }
});

export default router;
