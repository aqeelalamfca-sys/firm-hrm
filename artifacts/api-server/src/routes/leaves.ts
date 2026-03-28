import { Router } from "express";
import { db } from "@workspace/db";
import { leavesTable, employeesTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { createNotification } from "./notifications";

const router = Router();

router.get("/", async (req, res) => {
  const { employeeId, status } = req.query;
  let records = await db.select().from(leavesTable);
  if (employeeId) records = records.filter(r => r.employeeId === parseInt(employeeId as string));
  if (status) records = records.filter(r => r.status === status);

  const result = await Promise.all(
    records.map(async (r) => {
      const emps = await db.select().from(employeesTable).where(eq(employeesTable.id, r.employeeId));
      const emp = emps[0];
      let approvedByName = null;
      if (r.approvedById) {
        const [reviewer] = await db.select().from(usersTable).where(eq(usersTable.id, r.approvedById));
        if (reviewer) {
          approvedByName = reviewer.name;
        } else {
          const approvers = await db.select().from(employeesTable).where(eq(employeesTable.id, r.approvedById));
          if (approvers[0]) approvedByName = `${approvers[0].firstName} ${approvers[0].lastName}`;
        }
      }
      return {
        id: r.id,
        employeeId: r.employeeId,
        employeeName: emp ? `${emp.firstName} ${emp.lastName}` : "Unknown",
        leaveType: r.leaveType,
        fromDate: r.fromDate,
        toDate: r.toDate,
        totalDays: r.totalDays,
        reason: r.reason,
        status: r.status,
        approvedById: r.approvedById,
        approvedByName,
        approvalNotes: r.approvalNotes,
        createdAt: r.createdAt,
      };
    })
  );

  res.json(result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
});

router.post("/", async (req, res) => {
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

  const emps = await db.select().from(employeesTable).where(eq(employeesTable.id, record.employeeId));
  const emp = emps[0];

  res.status(201).json({
    ...record,
    employeeName: emp ? `${emp.firstName} ${emp.lastName}` : "Unknown",
    approvedByName: null,
  });
});

router.put("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const { status, approvalNotes } = req.body;
  if (!status) return res.status(400).json({ error: "Status required" });

  if (status === "rejected" && !approvalNotes) {
    return res.status(400).json({ error: "Rejection reason is required" });
  }

  const reviewerUserId = (req as any).user?.id || null;

  const updates: Record<string, any> = {
    status,
    approvalNotes: approvalNotes || null,
    approvedById: reviewerUserId,
    updatedAt: new Date(),
  };

  const [record] = await db.update(leavesTable).set(updates).where(eq(leavesTable.id, id)).returning();
  if (!record) return res.status(404).json({ error: "Leave not found" });

  const emps = await db.select().from(employeesTable).where(eq(employeesTable.id, record.employeeId));
  const emp = emps[0];

  let approvedByName = null;
  if (reviewerUserId) {
    const [reviewer] = await db.select().from(usersTable).where(eq(usersTable.id, reviewerUserId));
    if (reviewer) approvedByName = reviewer.name;
  }

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
    approvedByName,
  });
});

export default router;
