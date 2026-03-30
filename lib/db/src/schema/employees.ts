import { pgTable, serial, text, integer, decimal, timestamp, pgEnum, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const employeeStatusEnum = pgEnum("employee_status", [
  "active",
  "inactive",
  "on_leave",
  "terminated",
]);

export const employeesTable = pgTable("employees", {
  id: serial("id").primaryKey(),
  employeeCode: text("employee_code").notNull().unique(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email").notNull().unique(),
  phone: text("phone"),
  department: text("department").notNull(),
  designation: text("designation").notNull(),
  joiningDate: date("joining_date").notNull(),
  salary: decimal("salary", { precision: 12, scale: 2 }).notNull(),
  status: employeeStatusEnum("status").notNull().default("active"),
  reportingManagerId: integer("reporting_manager_id"),
  cnic: text("cnic"),
  address: text("address"),
  trainingPeriod: text("training_period"),
  icapRegistrationStatus: text("icap_registration_status"),
  articlesEndingDate: date("articles_ending_date"),
  articlesExtensionPeriod: text("articles_extension_period"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertEmployeeSchema = createInsertSchema(employeesTable).omit({
  id: true,
  employeeCode: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertEmployee = z.infer<typeof insertEmployeeSchema>;
export type Employee = typeof employeesTable.$inferSelect;
