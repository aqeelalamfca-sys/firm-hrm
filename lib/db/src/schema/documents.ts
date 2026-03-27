import { pgTable, serial, integer, text, timestamp, pgEnum, boolean } from "drizzle-orm/pg-core";
import { departmentsTable } from "./departments";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const documentCategoryEnum = pgEnum("document_category", [
  "trial_balance",
  "general_ledger",
  "bank_statement",
  "tax_return",
  "audit_report",
  "engagement_letter",
  "financial_statement",
  "correspondence",
  "other",
]);

export const documentsTable = pgTable("documents", {
  id: serial("id").primaryKey(),
  fileName: text("file_name").notNull(),
  originalName: text("original_name").notNull(),
  fileSize: integer("file_size").notNull(),
  mimeType: text("mime_type").notNull(),
  category: documentCategoryEnum("category").notNull().default("other"),
  departmentId: integer("department_id").references(() => departmentsTable.id),
  clientId: integer("client_id"),
  engagementId: integer("engagement_id"),
  taskId: integer("task_id"),
  description: text("description"),
  version: integer("version").notNull().default(1),
  parentDocumentId: integer("parent_document_id"),
  uploadedById: integer("uploaded_by_id").notNull(),
  filePath: text("file_path").notNull(),
  isDeleted: boolean("is_deleted").notNull().default(false),
  deletedAt: timestamp("deleted_at"),
  deletedById: integer("deleted_by_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertDocumentSchema = createInsertSchema(documentsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type Document = typeof documentsTable.$inferSelect;
