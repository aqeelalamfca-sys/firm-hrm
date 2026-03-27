import { pgTable, serial, text, integer, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { departmentsTable } from "./departments";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const userRoleEnum = pgEnum("user_role", [
  "super_admin",
  "hr_admin",
  "finance_officer",
  "manager",
  "employee",
  "partner",
  "trainee",
]);

export const userStatusEnum = pgEnum("user_status", ["active", "inactive"]);

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  role: userRoleEnum("role").notNull().default("employee"),
  employeeId: integer("employee_id"),
  departmentId: integer("department_id").references(() => departmentsTable.id),
  phone: text("phone"),
  mobile: text("mobile"),
  cnic: text("cnic"),
  profilePicture: text("profile_picture"),
  status: userStatusEnum("user_status").notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
