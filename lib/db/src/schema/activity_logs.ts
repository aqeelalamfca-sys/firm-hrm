import { pgTable, serial, integer, text, timestamp, pgEnum, index } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const activityActionEnum = pgEnum("activity_action", [
  "create",
  "update",
  "delete",
  "login",
  "logout",
  "approve",
  "reject",
  "status_change",
  "view",
  "download",
  "upload",
]);

export const activityLogsTable = pgTable("activity_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  userName: text("user_name").notNull(),
  action: activityActionEnum("action").notNull(),
  module: text("module").notNull(),
  entityId: integer("entity_id"),
  entityType: text("entity_type"),
  description: text("description").notNull(),
  oldValues: text("old_values"),
  newValues: text("new_values"),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("activity_logs_user_id_idx").on(t.userId),
  index("activity_logs_module_idx").on(t.module),
  index("activity_logs_created_at_idx").on(t.createdAt),
]);

export type ActivityLog = typeof activityLogsTable.$inferSelect;
