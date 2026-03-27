import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const departmentsTable = pgTable("departments", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  code: text("code").notNull().unique(),
  color: text("color").notNull().default("#6b7280"),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
