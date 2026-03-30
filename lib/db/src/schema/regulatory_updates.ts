import { pgTable, serial, text, integer, timestamp, boolean, pgEnum, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const regulatoryCategoryEnum = pgEnum("regulatory_category", [
  "FBR",
  "SECP",
  "PSX",
  "SBP",
]);

export const regulatoryPriorityEnum = pgEnum("regulatory_priority", [
  "high",
  "medium",
  "low",
]);

export const regulatoryUpdatesTable = pgTable("regulatory_updates", {
  id: serial("id").primaryKey(),
  category: regulatoryCategoryEnum("category").notNull(),
  text: text("text").notNull(),
  source: text("source").default("manual"),
  priority: regulatoryPriorityEnum("priority").notNull().default("medium"),
  isActive: boolean("is_active").notNull().default(true),
  createdBy: integer("created_by").references(() => usersTable.id),
  updatedBy: integer("updated_by").references(() => usersTable.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("regulatory_updates_category_idx").on(t.category),
  index("regulatory_updates_is_active_idx").on(t.isActive),
  index("regulatory_updates_created_at_idx").on(t.createdAt),
  index("regulatory_updates_priority_idx").on(t.priority),
]);

export const autoGenLogsTable = pgTable("auto_gen_logs", {
  id: serial("id").primaryKey(),
  category: regulatoryCategoryEnum("category").notNull(),
  generatedText: text("generated_text"),
  status: text("status").notNull().default("success"),
  errorMessage: text("error_message"),
  runAt: timestamp("run_at").defaultNow().notNull(),
}, (t) => [
  index("auto_gen_logs_run_at_idx").on(t.runAt),
  index("auto_gen_logs_status_idx").on(t.status),
]);

export const systemSettingsTable = pgTable("system_settings", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  description: text("description"),
  updatedBy: integer("updated_by").references(() => usersTable.id),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
