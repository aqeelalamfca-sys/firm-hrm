import { db } from "@workspace/db";
import { activityLogsTable } from "@workspace/db";

type ActionType = "create" | "update" | "delete" | "login" | "logout" | "approve" | "reject" | "status_change" | "view" | "download" | "upload";

export async function logActivity(params: {
  userId: number;
  userName: string;
  action: ActionType;
  module: string;
  entityId?: number;
  entityType?: string;
  description: string;
  oldValues?: string;
  newValues?: string;
  ipAddress?: string;
}) {
  try {
    await db.insert(activityLogsTable).values({
      userId: params.userId,
      userName: params.userName,
      action: params.action,
      module: params.module,
      entityId: params.entityId ?? null,
      entityType: params.entityType ?? null,
      description: params.description,
      oldValues: params.oldValues ?? null,
      newValues: params.newValues ?? null,
      ipAddress: params.ipAddress ?? null,
    });
  } catch (err) {
    console.error("Failed to log activity:", err);
  }
}
