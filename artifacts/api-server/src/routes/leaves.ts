import { Router } from "express";
import { db } from "@workspace/db";
import { leavesTable, employeesTable, usersTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { createNotification } from "./notifications";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const { employeeId, status } = req.query;

    let records = await db.select().from(leavesTable);
    if (employeeId) records = records.filter(r => r.employeeId === parseInt(employeeId as string));
    if (status) records = records.filter(r => r.status === status);

    if (records.length === 0) return res.json([]);

    const employeeIds = [...new Set(records.map(r => r.employeeId))];
    const approverIds = [...new Set(records.map(r => r.approvedById).filter(Boolean))] as number[];

    const [employees, users] = await Promise.all([
      db.select().from(employeesTable).where(inArray(employeesTable.id, employeeIds)),
      approverIds.length > 0
        ? db.select().from(usersTable).where(inArray(usersTable.id, approverIds))
        : Promise.resolve([]),
    ]);

    const empMap = new Map(employees.map(e => [e.id, `${e.firstName} ${e.lastName}`]));
    const userMap = new Map(users.map(u => [u.id, u.name]));

    const result = records.map(r => ({
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

    res.json(result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
  } catch (error) {
    console.error("Error fetching leaves:", error);
    res.status(500).json({ error: "Failed to fetch leaves" });
  }
});

router.post("/", async (req, res) => {
  try {
    const { employeeId, leaveType, fromDate, toDate, reason } = req.body;
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

router.put("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { status, approvalNotes } = req.body;
    if (!status) return res.status(400).json({ error: "Status required" });

    if (status === "rejected" && !approvalNotes) {
      return res.status(400).json({ error: "Rejection reason is required" });
    }

    const reviewerUserId = (req as any).user?.id || null;

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
        ? db.select().from(usersTable).where(eq(usersTable.id, reviewerUserId)).then(r => r[0])
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

export default router;
