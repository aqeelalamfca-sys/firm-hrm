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
  "data_sheet",
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
  engagementContinuity: text("engagement_continuity").default("first_time"),
  auditFirmName: text("audit_firm_name"),
  auditFirmLogo: text("audit_firm_logo"),
  preparerId: integer("preparer_id"),
  preparerName: text("preparer_name"),
  reviewerId: integer("reviewer_id"),
  reviewerName: text("reviewer_name"),
  approverId: integer("approver_id"),
  approverName: text("approver_name"),
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

// ═══════════════════════════════════════════════════════════════════════════
// AUDIT ENGINE MASTER TABLES
// ═══════════════════════════════════════════════════════════════════════════

export const auditEngineMasterTable = pgTable("audit_engine_master", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").references(() => wpSessionsTable.id).notNull().unique(),
  // Engagement Identity
  engagementId: varchar("engagement_id", { length: 50 }),
  clientName: text("client_name"),
  entityType: text("entity_type"), // Pvt Ltd, Listed, NGO, Bank, etc.
  industryType: text("industry_type"), // Manufacturing, Services, Retail, etc.
  financialYearStart: text("financial_year_start"),
  financialYearEnd: text("financial_year_end"),
  reportingFramework: text("reporting_framework").default("IFRS"), // IFRS, IFRS for SMEs, etc.
  auditType: text("audit_type").default("Statutory"), // Statutory, Internal, etc.
  engagementStatus: text("engagement_status").default("Planning"), // Planning, Execution, Completed
  // Materiality
  materialityAmount: decimal("materiality_amount", { precision: 18, scale: 2 }),
  performanceMateriality: decimal("performance_materiality", { precision: 18, scale: 2 }),
  trivialityThreshold: decimal("triviality_threshold", { precision: 18, scale: 2 }),
  // Risk Flags
  riskLevelOverall: text("risk_level_overall").default("Medium"), // Low, Medium, High
  goingConcernFlag: boolean("going_concern_flag").default(false),
  fraudRiskFlag: boolean("fraud_risk_flag").default(false),
  relatedPartyFlag: boolean("related_party_flag").default(false),
  lawsRegulationFlag: boolean("laws_regulation_flag").default(false),
  componentAuditFlag: boolean("component_audit_flag").default(false),
  groupAuditFlag: boolean("group_audit_flag").default(false),
  // Systems & Methods
  itSystemType: text("it_system_type").default("ERP"), // ERP, Manual, Hybrid
  internalAuditFlag: boolean("internal_audit_flag").default(false),
  useOfExpertFlag: boolean("use_of_expert_flag").default(false),
  samplingMethod: text("sampling_method").default("MUS"), // Random, MUS, Judgmental
  dataSource: text("data_source").default("OCR"), // OCR, Manual
  // QA
  confidenceLevel: decimal("confidence_level", { precision: 5, scale: 2 }),
  exceptionFlag: boolean("exception_flag").default(false),
  // Sign-off
  preparedBy: text("prepared_by"),
  reviewedBy: text("reviewed_by"),
  approvedBy: text("approved_by"),
  // Meta
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const wpTriggerDefsTable = pgTable("wp_trigger_defs", {
  id: serial("id").primaryKey(),
  wpCode: varchar("wp_code", { length: 20 }).notNull().unique(),
  wpName: text("wp_name").notNull(),
  triggerCondition: text("trigger_condition").notNull(), // always | var:fieldName=value | risk:High | ratio:gp_percent
  triggerDescription: text("trigger_description"),
  isaReference: text("isa_reference"),
  outputFormat: text("output_format").default("Word"), // Word, Excel
  mandatoryFlag: boolean("mandatory_flag").default(true),
  category: text("category"), // Planning, Risk, Substantive, Analytical, Completion
  displayOrder: integer("display_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const wpTriggerSessionTable = pgTable("wp_trigger_session", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").references(() => wpSessionsTable.id).notNull(),
  wpCode: varchar("wp_code", { length: 20 }).notNull(),
  triggered: boolean("triggered").default(false),
  triggerReason: text("trigger_reason"),
  status: text("status").default("pending"), // pending, in_progress, completed, n_a
  preparedBy: text("prepared_by"),
  reviewedBy: text("reviewed_by"),
  completedAt: timestamp("completed_at"),
  conclusion: text("conclusion"),
  exceptionNote: text("exception_note"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const assertionLinkageTable = pgTable("assertion_linkage", {
  id: serial("id").primaryKey(),
  accountType: text("account_type").notNull(), // Asset, Liability, Revenue, Expense, Equity
  fsLineItem: text("fs_line_item"), // Receivables, Inventory, etc.
  assertion: text("assertion").notNull(), // Existence, Completeness, Valuation, etc.
  wpCode: varchar("wp_code", { length: 20 }),
  wpLink: text("wp_link"), // Human description
  testingProcedure: text("testing_procedure"),
  isaReference: text("isa_reference"),
  riskTag: text("risk_tag"),
  displayOrder: integer("display_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const samplingRulesTable = pgTable("sampling_rules", {
  id: serial("id").primaryKey(),
  riskLevel: text("risk_level").notNull(), // High, Medium, Low
  materialityBand: text("materiality_band").notNull(), // GT_PM, LTE_PM, LT_TRIVIAL
  sampleSizeMin: integer("sample_size_min").notNull(),
  sampleSizeMax: integer("sample_size_max").notNull(),
  coveragePct: decimal("coverage_pct", { precision: 5, scale: 2 }),
  samplingMethod: text("sampling_method"), // MUS, Random, Judgmental
  testingApproach: text("testing_approach"), // Full, Moderate, Analytical
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const analyticsEngineTable = pgTable("analytics_engine", {
  id: serial("id").primaryKey(),
  ratioCode: varchar("ratio_code", { length: 30 }).notNull().unique(),
  ratioName: text("ratio_name").notNull(),
  formula: text("formula").notNull(), // e.g. "GP / Sales"
  numeratorField: text("numerator_field"), // variable/account name
  denominatorField: text("denominator_field"),
  thresholdMin: decimal("threshold_min", { precision: 10, scale: 4 }),
  thresholdMax: decimal("threshold_max", { precision: 10, scale: 4 }),
  thresholdDescription: text("threshold_description"), // e.g. "±10%"
  wpTrigger: varchar("wp_trigger", { length: 20 }), // WP code to trigger if breached
  category: text("category"), // Profitability, Liquidity, Efficiency, Solvency
  displayOrder: integer("display_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const analyticsSessionTable = pgTable("analytics_session", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").references(() => wpSessionsTable.id).notNull(),
  ratioCode: varchar("ratio_code", { length: 30 }).notNull(),
  computedValue: decimal("computed_value", { precision: 15, scale: 4 }),
  priorYearValue: decimal("prior_year_value", { precision: 15, scale: 4 }),
  variance: decimal("variance", { precision: 15, scale: 4 }),
  breached: boolean("breached").default(false),
  explanation: text("explanation"),
  wpTriggered: boolean("wp_triggered").default(false),
  reviewedBy: text("reviewed_by"),
  conclusion: text("conclusion"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const controlMatrixTable = pgTable("control_matrix", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").references(() => wpSessionsTable.id).notNull(),
  processName: text("process_name").notNull(), // Sales, Purchases, Payroll, etc.
  controlDescription: text("control_description").notNull(),
  controlFrequency: text("control_frequency"), // Daily, Monthly, Per transaction
  controlOwner: text("control_owner"),
  testType: text("test_type").default("ToC"), // ToC (Test of Controls), ToD (Test of Details)
  sampleSize: integer("sample_size"),
  testingResult: text("testing_result"), // Effective, Deficient, Not Tested
  exceptionCount: integer("exception_count").default(0),
  relatedWpCode: varchar("related_wp_code", { length: 20 }),
  isaReference: text("isa_reference"),
  testedBy: text("tested_by"),
  conclusion: text("conclusion"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const evidenceLogTable = pgTable("evidence_log", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").references(() => wpSessionsTable.id).notNull(),
  wpCode: varchar("wp_code", { length: 20 }),
  headId: integer("head_id").references(() => wpHeadsTable.id),
  evidenceId: varchar("evidence_id", { length: 50 }),
  documentType: text("document_type"), // Invoice, Contract, Confirmation, etc.
  documentRef: text("document_ref"),
  source: text("source").default("Client"), // Client, External, Self-generated
  description: text("description"),
  obtainedDate: text("obtained_date"),
  verifiedFlag: boolean("verified_flag").default(false),
  verifiedBy: text("verified_by"),
  reviewerComment: text("reviewer_comment"),
  exceptionFlag: boolean("exception_flag").default(false),
  attachmentPath: text("attachment_path"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const reconEngineTable = pgTable("recon_engine", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").references(() => wpSessionsTable.id).notNull(),
  checkName: text("check_name").notNull(), // FS vs TB, TB vs GL, etc.
  sourceA: text("source_a").notNull(),
  sourceB: text("source_b").notNull(),
  amountA: decimal("amount_a", { precision: 18, scale: 2 }),
  amountB: decimal("amount_b", { precision: 18, scale: 2 }),
  difference: decimal("difference", { precision: 18, scale: 2 }),
  passed: boolean("passed").default(false),
  rule: text("rule"), // Must match, Within materiality, etc.
  notes: text("notes"),
  runAt: timestamp("run_at").defaultNow(),
});

export const wpMasterCoaTable = pgTable("wp_master_coa", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").references(() => wpSessionsTable.id).notNull(),
  accountCode: varchar("account_code", { length: 20 }).notNull(),
  parentCode: varchar("parent_code", { length: 20 }),
  accountName: text("account_name").notNull(),
  fsHead: text("fs_head"),
  fsSubHead: text("fs_sub_head"),
  accountType: text("account_type"),
  normalBalance: text("normal_balance"),
  industryTag: text("industry_tag"),
  entityTypeTag: text("entity_type_tag"),
  ifrsReference: text("ifrs_reference"),
  taxTreatment: text("tax_treatment"),
  isControlAccount: boolean("is_control_account").default(false),
  isSubLedger: boolean("is_sub_ledger").default(false),
  openingBalance: decimal("opening_balance", { precision: 15, scale: 2 }).default("0"),
  debitTotal: decimal("debit_total", { precision: 15, scale: 2 }).default("0"),
  creditTotal: decimal("credit_total", { precision: 15, scale: 2 }).default("0"),
  closingBalance: decimal("closing_balance", { precision: 15, scale: 2 }).default("0"),
  priorYearBalance: decimal("prior_year_balance", { precision: 15, scale: 2 }),
  variance: decimal("variance", { precision: 15, scale: 2 }),
  materialityTag: text("materiality_tag"),
  riskTag: text("risk_tag"),
  assertionTag: text("assertion_tag"),
  relatedPartyFlag: boolean("related_party_flag").default(false),
  cashFlowTag: text("cash_flow_tag"),
  mappingGlCode: text("mapping_gl_code"),
  mappingFsLine: text("mapping_fs_line"),
  workingPaperCode: text("working_paper_code"),
  reconciliationFlag: boolean("reconciliation_flag").default(false),
  dataSource: text("data_source"),
  confidenceScore: decimal("confidence_score", { precision: 5, scale: 2 }),
  exceptionFlag: boolean("exception_flag").default(false),
  notes: text("notes"),
  displayOrder: integer("display_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
