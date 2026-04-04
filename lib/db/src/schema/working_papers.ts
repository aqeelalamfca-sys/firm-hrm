import { pgTable, serial, integer, text, timestamp, pgEnum, decimal, boolean, jsonb, varchar } from "drizzle-orm/pg-core";
import { clientsTable } from "./clients";

export const wpFileCategory = pgEnum("wp_file_category", [
  "financial_statements",
  "trial_balance",
  "general_ledger",
  "bank_statement",
  "sales_tax_return",
  "tax_notice",
  "schedule",
  "annexure",
  "other",
]);

export const wpFileFormat = pgEnum("wp_file_format", [
  "excel",
  "pdf",
  "image",
]);

export const wpSourceType = pgEnum("wp_source_type", [
  "native_text_pdf",
  "ocr_pdf",
  "image_ocr",
  "excel_native",
  "manual_entry",
]);

export const wpExtractionStatus = pgEnum("wp_extraction_status", [
  "pending",
  "processing",
  "completed",
  "failed",
]);

export const wpHeadStatus = pgEnum("wp_head_status", [
  "locked",
  "ready",
  "in_progress",
  "validating",
  "review",
  "approved",
  "exported",
  "completed",
]);

export const wpExceptionStatus = pgEnum("wp_exception_status", [
  "open",
  "cleared",
  "override_approved",
  "deferred",
  "not_applicable",
]);

export const wpSessionStatus = pgEnum("wp_session_status", [
  "upload",
  "extraction",
  "arranged_data",
  "variables",
  "generation",
  "export",
  "completed",
]);

export const wpSessionsTable = pgTable("wp_sessions", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").references(() => clientsTable.id),
  clientName: text("client_name").notNull(),
  engagementYear: text("engagement_year").notNull(),
  entityType: text("entity_type"),
  ntn: text("ntn"),
  strn: text("strn"),
  periodStart: text("period_start"),
  periodEnd: text("period_end"),
  reportingFramework: text("reporting_framework").default("IFRS"),
  engagementType: text("engagement_type").default("statutory_audit"),
  status: wpSessionStatus("status").notNull().default("upload"),
  currentHeadIndex: integer("current_head_index").default(0),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const wpUploadedFilesTable = pgTable("wp_uploaded_files", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").references(() => wpSessionsTable.id).notNull(),
  fileName: text("file_name").notNull(),
  originalName: text("original_name").notNull(),
  fileSize: integer("file_size"),
  mimeType: text("mime_type"),
  category: wpFileCategory("category").notNull(),
  format: wpFileFormat("format").notNull(),
  sourceType: wpSourceType("source_type"),
  pageCount: integer("page_count"),
  sheetCount: integer("sheet_count"),
  isValid: boolean("is_valid").default(true),
  validationErrors: text("validation_errors"),
  fileData: text("file_data"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const wpExtractionRunsTable = pgTable("wp_extraction_runs", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").references(() => wpSessionsTable.id).notNull(),
  fileId: integer("file_id").references(() => wpUploadedFilesTable.id),
  status: wpExtractionStatus("extraction_status").notNull().default("pending"),
  sourceType: wpSourceType("source_type"),
  totalPages: integer("total_pages"),
  processedPages: integer("processed_pages").default(0),
  rawText: text("raw_text"),
  structuredData: jsonb("structured_data"),
  errorMessage: text("error_message"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const wpExtractedFieldsTable = pgTable("wp_extracted_fields", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").references(() => wpSessionsTable.id).notNull(),
  extractionRunId: integer("extraction_run_id").references(() => wpExtractionRunsTable.id),
  category: text("category").notNull(),
  fieldName: text("field_name").notNull(),
  extractedValue: text("extracted_value"),
  finalValue: text("final_value"),
  confidence: decimal("confidence", { precision: 5, scale: 2 }),
  sourceFile: text("source_file"),
  sourceSheet: text("source_sheet"),
  sourcePageNo: integer("source_page_no"),
  isOverridden: boolean("is_overridden").default(false),
  isApproved: boolean("is_approved").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const wpArrangedDataTable = pgTable("wp_arranged_data", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").references(() => wpSessionsTable.id).notNull(),
  tab: text("tab").notNull(),
  rowIndex: integer("row_index").notNull().default(0),
  sourceFile: text("source_file"),
  sourceSheetPage: text("source_sheet_page"),
  fieldName: text("field_name").notNull(),
  extractedValue: text("extracted_value"),
  confidence: decimal("confidence", { precision: 5, scale: 2 }),
  overrideValue: text("override_value"),
  finalApprovedValue: text("final_approved_value"),
  isApproved: boolean("is_approved").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const wpVariableDefinitionsTable = pgTable("wp_variable_definitions", {
  id: serial("id").primaryKey(),
  variableCode: varchar("variable_code", { length: 100 }).notNull().unique(),
  variableGroup: text("variable_group").notNull(),
  variableSubgroup: text("variable_subgroup"),
  variableName: text("variable_name").notNull(),
  variableLabel: text("variable_label").notNull(),
  description: text("description"),
  dataType: text("data_type").notNull().default("text"),
  inputMode: text("input_mode").default("text"),
  dropdownOptionsJson: jsonb("dropdown_options_json"),
  defaultValue: text("default_value"),
  mandatoryFlag: boolean("mandatory_flag").default(false),
  editableFlag: boolean("editable_flag").default(true),
  aiExtractableFlag: boolean("ai_extractable_flag").default(false),
  reviewRequiredFlag: boolean("review_required_flag").default(false),
  standardReference: text("standard_reference"),
  pakistanReference: text("pakistan_reference"),
  affectsModulesJson: jsonb("affects_modules_json"),
  affectsWorkingPapersJson: jsonb("affects_working_papers_json"),
  displayOrder: integer("display_order").default(0),
  activeFlag: boolean("active_flag").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const wpVariablesTable = pgTable("wp_variables", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").references(() => wpSessionsTable.id).notNull(),
  variableCode: varchar("variable_code", { length: 100 }).notNull(),
  category: text("category").notNull(),
  variableName: text("variable_name").notNull(),
  autoFilledValue: text("auto_filled_value"),
  userEditedValue: text("user_edited_value"),
  finalValue: text("final_value"),
  rawExtractedValue: text("raw_extracted_value"),
  normalizedValue: text("normalized_value"),
  confidence: decimal("confidence", { precision: 5, scale: 2 }),
  sourceType: text("source_type"),
  sourceFileId: integer("source_file_id"),
  sourceSheet: text("source_sheet"),
  sourcePage: integer("source_page"),
  reviewStatus: text("review_status").default("pending"),
  isLocked: boolean("is_locked").default(false),
  lockedAt: timestamp("locked_at"),
  lockedBy: integer("locked_by"),
  editedBy: integer("edited_by"),
  editedAt: timestamp("edited_at"),
  reasonForChange: text("reason_for_change"),
  versionNo: integer("version_no").default(1),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const wpVariableChangeLogTable = pgTable("wp_variable_change_log", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").references(() => wpSessionsTable.id).notNull(),
  variableId: integer("variable_id").references(() => wpVariablesTable.id),
  variableCode: varchar("variable_code", { length: 100 }),
  fieldName: text("field_name").notNull(),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  editedBy: integer("edited_by"),
  reason: text("reason"),
  sourceOfChange: text("source_of_change").default("manual"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const wpVariableDependencyRulesTable = pgTable("wp_variable_dependency_rules", {
  id: serial("id").primaryKey(),
  triggerVariableCode: varchar("trigger_variable_code", { length: 100 }).notNull(),
  conditionExpression: text("condition_expression"),
  impactedVariableCodesJson: jsonb("impacted_variable_codes_json"),
  impactedWorkingPapersJson: jsonb("impacted_working_papers_json"),
  impactedCalculationsJson: jsonb("impacted_calculations_json"),
  impactedRiskAreasJson: jsonb("impacted_risk_areas_json"),
  activeFlag: boolean("active_flag").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const wpExceptionLogTable = pgTable("wp_exception_log", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").references(() => wpSessionsTable.id).notNull(),
  headIndex: integer("head_index"),
  exceptionType: text("exception_type").notNull(),
  severity: text("severity").notNull().default("medium"),
  title: text("title").notNull(),
  description: text("description"),
  status: wpExceptionStatus("exception_log_status").notNull().default("open"),
  resolvedBy: integer("resolved_by"),
  resolvedAt: timestamp("resolved_at"),
  resolution: text("resolution"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const wpTrialBalanceLinesTable = pgTable("wp_trial_balance_lines", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").references(() => wpSessionsTable.id).notNull(),
  accountCode: text("account_code").notNull(),
  accountName: text("account_name").notNull(),
  classification: text("classification"),
  fsLineMapping: text("fs_line_mapping"),
  debit: decimal("debit", { precision: 15, scale: 2 }).default("0"),
  credit: decimal("credit", { precision: 15, scale: 2 }).default("0"),
  balance: decimal("balance", { precision: 15, scale: 2 }).default("0"),
  priorYearBalance: decimal("prior_year_balance", { precision: 15, scale: 2 }),
  source: text("source").default("deterministic"),
  confidence: decimal("confidence", { precision: 5, scale: 2 }),
  isApproved: boolean("is_approved").default(false),
  hasException: boolean("has_exception").default(false),
  exceptionNote: text("exception_note"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const wpGlAccountsTable = pgTable("wp_gl_accounts", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").references(() => wpSessionsTable.id).notNull(),
  accountCode: text("account_code").notNull(),
  accountName: text("account_name").notNull(),
  accountType: text("account_type"),
  openingBalance: decimal("opening_balance", { precision: 15, scale: 2 }).default("0"),
  closingBalance: decimal("closing_balance", { precision: 15, scale: 2 }).default("0"),
  totalDebit: decimal("total_debit", { precision: 15, scale: 2 }).default("0"),
  totalCredit: decimal("total_credit", { precision: 15, scale: 2 }).default("0"),
  tbDebit: decimal("tb_debit", { precision: 15, scale: 2 }).default("0"),
  tbCredit: decimal("tb_credit", { precision: 15, scale: 2 }).default("0"),
  isReconciled: boolean("is_reconciled").default(false),
  isSynthetic: boolean("is_synthetic").default(false),
  generationRationale: text("generation_rationale"),
  transactionCountNote: text("transaction_count_note"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const wpGlEntriesTable = pgTable("wp_gl_entries", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").references(() => wpSessionsTable.id).notNull(),
  glAccountId: integer("gl_account_id").references(() => wpGlAccountsTable.id),
  entryDate: text("entry_date").notNull(),
  voucherNo: text("voucher_no"),
  narration: text("narration"),
  debit: decimal("debit", { precision: 15, scale: 2 }).default("0"),
  credit: decimal("credit", { precision: 15, scale: 2 }).default("0"),
  runningBalance: decimal("running_balance", { precision: 15, scale: 2 }),
  month: integer("month"),
  isSynthetic: boolean("is_synthetic").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const wpHeadsTable = pgTable("wp_heads", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").references(() => wpSessionsTable.id).notNull(),
  headIndex: integer("head_index").notNull(),
  headName: text("head_name").notNull(),
  status: wpHeadStatus("head_status").notNull().default("locked"),
  papersIncluded: jsonb("papers_included"),
  outputType: text("output_type"),
  generatedAt: timestamp("generated_at"),
  validatedAt: timestamp("validated_at"),
  approvedAt: timestamp("approved_at"),
  approvedBy: integer("approved_by"),
  exportedAt: timestamp("exported_at"),
  exceptionsCount: integer("exceptions_count").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const wpHeadDocumentsTable = pgTable("wp_head_documents", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").references(() => wpSessionsTable.id).notNull(),
  headId: integer("head_id").references(() => wpHeadsTable.id).notNull(),
  paperCode: text("paper_code").notNull(),
  paperName: text("paper_name").notNull(),
  content: text("content"),
  outputFormat: text("output_format").default("word"),
  status: text("document_status").default("pending"),
  generatedAt: timestamp("generated_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const wpExportJobsTable = pgTable("wp_export_jobs", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").references(() => wpSessionsTable.id).notNull(),
  headId: integer("head_id").references(() => wpHeadsTable.id),
  exportType: text("export_type").notNull().default("head"),
  format: text("format"),
  fileName: text("file_name"),
  status: text("export_job_status").default("pending"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});
