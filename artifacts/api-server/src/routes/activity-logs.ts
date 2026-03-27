import { Router } from "express";
import { db } from "@workspace/db";
import { activityLogsTable } from "@workspace/db";
import { eq, desc, sql, and } from "drizzle-orm";
import { requireRoles, type AuthenticatedRequest } from "../middleware/auth";

const router = Router();

router.get("/", requireRoles("super_admin", "partner", "hr_admin"), async (req: AuthenticatedRequest, res) => {
  try {
    const { userId, module, action, limit: limitStr, offset: offsetStr } = req.query;
    const limit = Number(limitStr) || 50;
    const offset = Number(offsetStr) || 0;

    const conditions: any[] = [];
    if (userId) conditions.push(eq(activityLogsTable.userId, Number(userId)));
    if (module) conditions.push(eq(activityLogsTable.module, module as string));
    if (action) conditions.push(eq(activityLogsTable.action, action as any));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [logs, countResult] = await Promise.all([
      db.select()
        .from(activityLogsTable)
        .where(whereClause)
        .orderBy(desc(activityLogsTable.createdAt))
        .limit(limit)
        .offset(offset),
      db.select({ count: sql<number>`count(*)::int` })
        .from(activityLogsTable)
        .where(whereClause),
    ]);

    res.json({
      logs,
      total: countResult[0]?.count || 0,
    });
  } catch (error) {
    console.error("Error fetching activity logs:", error);
    res.status(500).json({ error: "Failed to fetch activity logs" });
  }
});

export default router;
