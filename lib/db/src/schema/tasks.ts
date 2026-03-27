import { pgTable, serial, text, integer, date, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { clientsTable } from "./clients";
import { engagementsTable } from "./engagements";
import { departmentsTable } from "./departments";

export const taskStatusEnum = pgEnum("task_status", [
  "pending",
  "in_progress",
  "completed",
  "delayed",
]);

export const taskPriorityEnum = pgEnum("task_priority", [
  "low",
  "medium",
  "high",
  "critical",
]);

export const tasksTable = pgTable("tasks", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  clientId: integer("client_id").references(() => clientsTable.id),
  engagementId: integer("engagement_id").references(() => engagementsTable.id),
  departmentId: integer("department_id").references(() => departmentsTable.id),
  assignedTo: integer("assigned_to").references(() => usersTable.id),
  assignedBy: integer("assigned_by").references(() => usersTable.id),
  roleLevel: text("role_level"),
  startDate: date("start_date").notNull(),
  dueDate: date("due_date").notNull(),
  status: taskStatusEnum("status").notNull().default("pending"),
  priority: taskPriorityEnum("priority").notNull().default("medium"),
  progressPercentage: integer("progress_percentage").notNull().default(0),
  remarks: text("remarks"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const taskLogActionEnum = pgEnum("task_log_action", [
  "created",
  "updated",
  "status_changed",
  "reassigned",
  "completed",
]);

export const taskLogsTable = pgTable("task_logs", {
  id: serial("id").primaryKey(),
  taskId: integer("task_id").notNull().references(() => tasksTable.id),
  action: taskLogActionEnum("action").notNull(),
  performedBy: integer("performed_by").references(() => usersTable.id),
  details: text("details"),
  oldValues: text("old_values"),
  newValues: text("new_values"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
