import { pgTable, serial, text, integer, decimal, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { departmentsTable } from "./departments";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const clientStatusEnum = pgEnum("client_status", ["active", "inactive"]);

export const clientsTable = pgTable("clients", {
  id: serial("id").primaryKey(),
  clientCode: text("client_code").notNull().unique(),
  name: text("name").notNull(),
  contactPerson: text("contact_person").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  address: text("address"),
  industry: text("industry"),
  ntn: text("ntn"),
  registrationNo: text("registration_no"),
  departmentId: integer("department_id").references(() => departmentsTable.id),
  status: clientStatusEnum("status").notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertClientSchema = createInsertSchema(clientsTable).omit({
  id: true,
  clientCode: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertClient = z.infer<typeof insertClientSchema>;
export type Client = typeof clientsTable.$inferSelect;
