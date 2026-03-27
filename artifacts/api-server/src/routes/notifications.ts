import { Router } from "express";
import { db } from "@workspace/db";
import { notificationsTable } from "@workspace/db";
import { eq, desc, and, sql } from "drizzle-orm";
import type { AuthenticatedRequest } from "../middleware/auth";

const router = Router();

router.get("/", async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const rawLimit = Number(req.query.limit);
    const limit = isNaN(rawLimit) || rawLimit < 1 ? 50 : Math.min(rawLimit, 100);
    const unreadOnly = req.query.unread === "true";

    const conditions = [eq(notificationsTable.userId, userId)];
    if (unreadOnly) conditions.push(eq(notificationsTable.isRead, false));

    const notifications = await db
      .select()
      .from(notificationsTable)
      .where(and(...conditions))
      .orderBy(desc(notificationsTable.createdAt))
      .limit(limit);

    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(notificationsTable)
      .where(and(eq(notificationsTable.userId, userId), eq(notificationsTable.isRead, false)));

    res.json({ notifications, unreadCount: Number(countResult.count) });
  } catch (error) {
    console.error("Error fetching notifications:", error);
    res.status(500).json({ error: "Failed to fetch notifications" });
  }
});

router.put("/:id/read", async (req: AuthenticatedRequest, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid notification ID" });
    const [updated] = await db
      .update(notificationsTable)
      .set({ isRead: true })
      .where(and(eq(notificationsTable.id, id), eq(notificationsTable.userId, req.user!.id)))
      .returning();

    if (!updated) return res.status(404).json({ error: "Notification not found" });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: "Failed to mark notification as read" });
  }
});

router.put("/read-all", async (req: AuthenticatedRequest, res) => {
  try {
    await db
      .update(notificationsTable)
      .set({ isRead: true })
      .where(and(eq(notificationsTable.userId, req.user!.id), eq(notificationsTable.isRead, false)));

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to mark all as read" });
  }
});

export async function createNotification(data: {
  userId: number;
  type: "task_assigned" | "task_due" | "task_overdue" | "task_status_changed" | "invoice_created" | "invoice_status_changed" | "leave_approved" | "leave_rejected" | "system";
  title: string;
  message: string;
  relatedEntityType?: string;
  relatedEntityId?: number;
}) {
  try {
    await db.insert(notificationsTable).values({
      userId: data.userId,
      type: data.type,
      title: data.title,
      message: data.message,
      relatedEntityType: data.relatedEntityType || null,
      relatedEntityId: data.relatedEntityId || null,
    });
  } catch (error) {
    console.error("Error creating notification:", error);
  }
}

export default router;
