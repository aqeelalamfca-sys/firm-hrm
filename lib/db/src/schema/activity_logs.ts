import { pgTable, serial, integer, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
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
});

export type ActivityLog = typeof activityLogsTable.$inferSelect;
