import { pgTable, serial, integer, decimal, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const paymentStatusEnum = pgEnum("payment_status", [
  "pending",
  "paid",
  "on_hold",
]);

export const payrollTable = pgTable("payroll", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull(),
  month: text("month").notNull(),
  year: integer("year").notNull(),
  basicSalary: decimal("basic_salary", { precision: 12, scale: 2 }).notNull(),
  allowances: decimal("allowances", { precision: 12, scale: 2 }).notNull().default("0"),
  deductions: decimal("deductions", { precision: 12, scale: 2 }).notNull().default("0"),
  advances: decimal("advances", { precision: 12, scale: 2 }).notNull().default("0"),
  overtimeHours: decimal("overtime_hours", { precision: 5, scale: 2 }).notNull().default("0"),
  overtimePay: decimal("overtime_pay", { precision: 12, scale: 2 }).notNull().default("0"),
  taxAmount: decimal("tax_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  netSalary: decimal("net_salary", { precision: 12, scale: 2 }).notNull(),
  workingDays: integer("working_days").notNull(),
  presentDays: integer("present_days").notNull(),
  paymentStatus: paymentStatusEnum("payment_status").notNull().default("pending"),
  paidDate: text("paid_date"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertPayrollSchema = createInsertSchema(payrollTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertPayroll = z.infer<typeof insertPayrollSchema>;
export type Payroll = typeof payrollTable.$inferSelect;
