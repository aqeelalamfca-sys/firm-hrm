import { pgTable, serial, integer, text, timestamp, pgEnum, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const engagementStatusEnum = pgEnum("engagement_status", [
  "planning",
  "execution",
  "review",
  "completed",
  "on_hold",
  "cancelled",
]);

export const engagementTypeEnum = pgEnum("engagement_type", [
  "audit",
  "tax",
  "advisory",
  "accounting",
  "compliance",
  "other",
]);

export const engagementsTable = pgTable("engagements", {
  id: serial("id").primaryKey(),
  engagementCode: text("engagement_code").notNull().unique(),
  clientId: integer("client_id").notNull(),
  title: text("title").notNull(),
  type: engagementTypeEnum("type").notNull(),
  status: engagementStatusEnum("engagement_status").notNull().default("planning"),
  description: text("description"),
  startDate: date("start_date").notNull(),
  endDate: date("end_date"),
  partnerId: integer("partner_id"),
  managerId: integer("manager_id"),
  budget: text("budget"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const engagementAssignmentsTable = pgTable("engagement_assignments", {
  id: serial("id").primaryKey(),
  engagementId: integer("engagement_id").notNull(),
  employeeId: integer("employee_id").notNull(),
  role: text("role").notNull(),
  hoursAllocated: integer("hours_allocated"),
  hoursWorked: integer("hours_worked").default(0),
  notes: text("notes"),
  assignedAt: timestamp("assigned_at").defaultNow().notNull(),
});

export const insertEngagementSchema = createInsertSchema(engagementsTable).omit({
  id: true,
  engagementCode: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertEngagement = z.infer<typeof insertEngagementSchema>;
export type Engagement = typeof engagementsTable.$inferSelect;
export type EngagementAssignment = typeof engagementAssignmentsTable.$inferSelect;
