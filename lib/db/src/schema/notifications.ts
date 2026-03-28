import { pgTable, serial, text, integer, timestamp, boolean, pgEnum, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const notificationTypeEnum = pgEnum("notification_type", [
  "task_assigned",
  "task_due",
  "task_overdue",
  "task_status_changed",
  "invoice_created",
  "invoice_status_changed",
  "leave_approved",
  "leave_rejected",
  "system",
]);

export const notificationsTable = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  type: notificationTypeEnum("type").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  isRead: boolean("is_read").notNull().default(false),
  relatedEntityType: text("related_entity_type"),
  relatedEntityId: integer("related_entity_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("notifications_user_id_idx").on(t.userId),
  index("notifications_user_is_read_idx").on(t.userId, t.isRead),
  index("notifications_created_at_idx").on(t.createdAt),
]);
