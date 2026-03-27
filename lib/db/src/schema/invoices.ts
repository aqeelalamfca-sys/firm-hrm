import { pgTable, serial, integer, text, decimal, timestamp, pgEnum, date, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const serviceTypeEnum = pgEnum("service_type", [
  "audit",
  "tax",
  "advisory",
  "accounting",
  "other",
]);

export const invoiceStatusEnum = pgEnum("invoice_status", [
  "draft",
  "approved",
  "issued",
  "paid",
  "overdue",
  "cancelled",
]);

export const recurringFrequencyEnum = pgEnum("recurring_frequency", [
  "monthly",
  "quarterly",
  "yearly",
]);

export const invoicesTable = pgTable("invoices", {
  id: serial("id").primaryKey(),
  invoiceNumber: text("invoice_number").notNull().unique(),
  clientId: integer("client_id").notNull(),
  engagementId: integer("engagement_id"),
  serviceType: serviceTypeEnum("service_type").notNull(),
  description: text("description").notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  tax: decimal("tax", { precision: 12, scale: 2 }).notNull().default("0"),
  whtAmount: decimal("wht_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  gstAmount: decimal("gst_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  totalAmount: decimal("total_amount", { precision: 12, scale: 2 }).notNull(),
  issueDate: date("issue_date").notNull(),
  dueDate: date("due_date").notNull(),
  status: invoiceStatusEnum("status").notNull().default("draft"),
  paidAmount: decimal("paid_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  paidDate: text("paid_date"),
  isRecurring: boolean("is_recurring").default(false),
  recurringFrequency: recurringFrequencyEnum("recurring_frequency"),
  nextGenerationDate: date("next_generation_date"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertInvoiceSchema = createInsertSchema(invoicesTable).omit({
  id: true,
  invoiceNumber: true,
  status: true,
  paidAmount: true,
  paidDate: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
export type Invoice = typeof invoicesTable.$inferSelect;
