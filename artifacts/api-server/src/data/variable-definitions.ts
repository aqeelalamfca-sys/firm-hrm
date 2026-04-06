export type VariableCategory = "primary" | "secondary" | "ai";

// ── 116 PRIMARY variables — filled directly from template upload or session form ──
export const PRIMARY_VARIABLE_CODES = new Set<string>([
  // Entity & Constitution (15)
  "entity_name", "legal_name_as_per_secp", "short_name", "ntn", "strn",
  "entity_legal_form", "industry_sector", "financial_year_start", "financial_year_end",
  "reporting_period_start", "reporting_period_end", "functional_currency",
  "presentation_currency", "reporting_framework", "applicable_company_law",
  // Engagement Acceptance (10)
  "engagement_type", "assurance_level", "engagement_size", "first_year_audit",
  "recurring_engagement", "engagement_partner", "engagement_manager",
  "engagement_start_date", "reporting_deadline", "expected_signing_date",
  // Trial Balance & COA Aggregates (6)
  "tb_line_count", "tb_total_period_debit", "tb_total_period_credit",
  "tb_opening_balance_aggregate", "tb_closing_balance_aggregate", "audit_procedure_depth",
  // Materiality Input (1)
  "materiality_basis",
  // Financial Statements — Current Year (47)
  "cy_total_assets", "cy_non_current_assets", "cy_current_assets", "cy_fixed_assets",
  "cy_right_of_use_assets", "cy_capital_work_in_progress", "cy_intangible_assets",
  "cy_investments", "cy_long_term_loans", "cy_deposits_prepayments", "cy_inventory",
  "cy_trade_receivables", "cy_advances", "cy_other_receivables", "cy_short_term_investments",
  "cy_tax_refunds_due", "cy_cash_and_bank", "cy_total_equity", "cy_share_capital_fs",
  "cy_reserves", "cy_retained_earnings", "cy_revaluation_surplus", "cy_total_liabilities",
  "cy_non_current_liabilities", "cy_current_liabilities", "cy_long_term_borrowings",
  "cy_lease_liabilities", "cy_trade_payables", "cy_accruals", "cy_taxation_payable",
  "cy_short_term_borrowings", "cy_current_portion_long_term_debt", "cy_revenue",
  "cy_cost_of_sales", "cy_gross_profit", "cy_admin_expenses", "cy_selling_distribution_expenses",
  "cy_finance_cost", "cy_other_income", "cy_other_expenses", "cy_profit_before_tax",
  "cy_tax_expense", "cy_profit_after_tax", "cy_other_comprehensive_income",
  "cy_total_comprehensive_income", "cy_operating_cash_flow", "cy_investing_cash_flow",
  "cy_financing_cash_flow",
  // Financial Statements — Prior Year (36)
  "py_total_assets", "py_non_current_assets", "py_current_assets", "py_fixed_assets",
  "py_right_of_use_assets", "py_capital_work_in_progress", "py_intangible_assets",
  "py_investments", "py_inventory", "py_trade_receivables", "py_cash_and_bank",
  "py_total_equity", "py_share_capital_fs", "py_retained_earnings", "py_total_liabilities",
  "py_non_current_liabilities", "py_current_liabilities", "py_long_term_borrowings",
  "py_trade_payables", "py_taxation_payable", "py_revenue", "py_cost_of_sales",
  "py_gross_profit", "py_admin_expenses", "py_selling_distribution_expenses",
  "py_finance_cost", "py_other_income", "py_other_expenses", "py_profit_before_tax",
  "py_tax_expense", "py_profit_after_tax", "py_other_comprehensive_income",
  "py_total_comprehensive_income", "py_operating_cash_flow", "py_investing_cash_flow",
  "py_financing_cash_flow",
]);

// ── 44 SECONDARY variables — auto-calculated by system formulas from Primary data ──
export const SECONDARY_VARIABLE_CODES = new Set<string>([
  "principal_activity", "books_maintained_properly", "gl_available", "tb_available",
  "fs_uploaded", "prior_year_fs_available", "inventory_records_available",
  "bank_statements_available", "coa_available", "account_code_present",
  "account_name_present", "account_type", "account_classification",
  "opening_balance_present", "movement_debit_present", "movement_credit_present",
  "closing_balance_present", "tb_balanced_flag", "unmapped_accounts_count",
  "fs_mapping_completed", "control_accounts_identified", "manual_tb_adjustments_flag",
  "variance_analysis_done", "materiality_basis_amount", "overall_materiality_percent",
  "overall_materiality_amount", "performance_materiality_percent",
  "performance_materiality_amount", "trivial_threshold_percent", "trivial_threshold_amount",
  "inherent_risk_overall", "control_risk_overall", "risk_of_material_misstatement_overall",
  "fraud_risk_flag", "revenue_fraud_risk_flag", "management_override_risk_flag",
  "significant_risk_areas", "account_level_risk_mapping_done", "sampling_required",
  "population_value", "sampling_basis", "gc_losses_flag", "gc_negative_equity_flag",
  "gc_negative_operating_cashflows_flag",
]);

export interface VariableDefinition {
  variableCode: string;
  variableGroup: string;
  variableSubgroup?: string;
  variableName: string;
  variableLabel: string;
  description?: string;
  dataType: string;
  inputMode: string;
  dropdownOptionsJson?: any;
  defaultValue?: string;
  mandatoryFlag: boolean;
  editableFlag: boolean;
  aiExtractableFlag: boolean;
  reviewRequiredFlag: boolean;
  standardReference?: string;
  pakistanReference?: string;
  affectsModulesJson?: any;
  affectsWorkingPapersJson?: any;
  displayOrder: number;
  variableCategory: VariableCategory;
}

function v(code: string, group: string, subgroup: string | undefined, label: string, opts: Partial<VariableDefinition> = {}): VariableDefinition {
  return {
    variableCode: code,
    variableGroup: group,
    variableSubgroup: subgroup,
    variableName: code,
    variableLabel: label,
    dataType: opts.dataType || "text",
    inputMode: opts.inputMode || "text",
    dropdownOptionsJson: opts.dropdownOptionsJson,
    defaultValue: opts.defaultValue,
    mandatoryFlag: opts.mandatoryFlag ?? false,
    editableFlag: opts.editableFlag ?? true,
    aiExtractableFlag: opts.aiExtractableFlag ?? false,
    reviewRequiredFlag: opts.reviewRequiredFlag ?? false,
    standardReference: opts.standardReference,
    pakistanReference: opts.pakistanReference,
    affectsModulesJson: opts.affectsModulesJson,
    affectsWorkingPapersJson: opts.affectsWorkingPapersJson,
    displayOrder: opts.displayOrder || 0,
    description: opts.description,
    variableCategory: PRIMARY_VARIABLE_CODES.has(code) ? "primary"
                    : SECONDARY_VARIABLE_CODES.has(code) ? "secondary"
                    : "ai",
  };
}

const dd = (options: string[]) => options;
const M = true;
const E = true;
const AI = true;
const RV = true;

export const VARIABLE_DEFINITIONS: VariableDefinition[] = [
  // ═══════════════════════════════════════════════════════════════════════════
  // GROUP 1 — Entity and Constitution
  // ═══════════════════════════════════════════════════════════════════════════
  v("entity_name", "Entity & Constitution", "Basic Info", "Entity Name", { dataType: "text", inputMode: "text", mandatoryFlag: M, aiExtractableFlag: AI, displayOrder: 1 }),
  v("legal_name_as_per_secp", "Entity & Constitution", "Basic Info", "Legal Name (SECP)", { dataType: "text", inputMode: "text", aiExtractableFlag: AI, pakistanReference: "SECP Registration", displayOrder: 2 }),
  v("short_name", "Entity & Constitution", "Basic Info", "Short Name", { dataType: "text", inputMode: "text", displayOrder: 3 }),
  v("ntn", "Entity & Constitution", "Tax IDs", "NTN", { dataType: "text", inputMode: "text", mandatoryFlag: M, aiExtractableFlag: AI, pakistanReference: "FBR NTN", displayOrder: 4 }),
  v("strn", "Entity & Constitution", "Tax IDs", "STRN", { dataType: "text", inputMode: "text", aiExtractableFlag: AI, pakistanReference: "SRB/PRA STRN", displayOrder: 5 }),
  v("secp_registration_no", "Entity & Constitution", "Registration", "SECP Registration No.", { dataType: "text", inputMode: "text", aiExtractableFlag: AI, pakistanReference: "Companies Act 2017 s.15", displayOrder: 6 }),
  v("incorporation_date", "Entity & Constitution", "Registration", "Incorporation Date", { dataType: "date", inputMode: "date", aiExtractableFlag: AI, displayOrder: 7 }),
  v("commencement_date", "Entity & Constitution", "Registration", "Commencement Date", { dataType: "date", inputMode: "date", aiExtractableFlag: AI, displayOrder: 8 }),
  v("entity_legal_form", "Entity & Constitution", "Legal Form", "Legal Form", { dataType: "text", inputMode: "dropdown", dropdownOptionsJson: dd(["Private Limited","Public Limited (Unlisted)","Public Limited (Listed)","Single Member","LLP","AOP","Sole Proprietor","NGO/NPO","Trust","Government Entity","Branch Office"]), mandatoryFlag: M, aiExtractableFlag: AI, displayOrder: 9 }),
  v("listed_status", "Entity & Constitution", "Legal Form", "Listed Status", { dataType: "text", inputMode: "dropdown", dropdownOptionsJson: dd(["Listed","Unlisted"]), aiExtractableFlag: AI, affectsWorkingPapersJson: ["eqcr","reporting"], displayOrder: 10 }),
  v("public_interest_entity_flag", "Entity & Constitution", "Legal Form", "Public Interest Entity", { dataType: "boolean", inputMode: "toggle", affectsWorkingPapersJson: ["eqcr","reporting"], displayOrder: 11 }),
  v("principal_activity", "Entity & Constitution", "Operations", "Principal Activity", { dataType: "text", inputMode: "text", mandatoryFlag: M, aiExtractableFlag: AI, displayOrder: 12 }),
  v("industry_sector", "Entity & Constitution", "Operations", "Industry Sector", { dataType: "text", inputMode: "dropdown", dropdownOptionsJson: dd(["Manufacturing","Services","Trading","Construction","IT/Software","Financial Services","Healthcare","Education","Energy","Textiles","FMCG","Real Estate","Agriculture","Telecommunications","Other"]), aiExtractableFlag: AI, displayOrder: 13 }),
  v("registered_address", "Entity & Constitution", "Addresses", "Registered Address", { dataType: "text", inputMode: "textarea", aiExtractableFlag: AI, displayOrder: 14 }),
  v("business_address", "Entity & Constitution", "Addresses", "Business Address", { dataType: "text", inputMode: "textarea", aiExtractableFlag: AI, displayOrder: 15 }),
  v("principal_place_of_business", "Entity & Constitution", "Addresses", "Principal Place of Business", { dataType: "text", inputMode: "textarea", aiExtractableFlag: AI, displayOrder: 16 }),
  v("branch_offices_flag", "Entity & Constitution", "Addresses", "Branch Offices Exist", { dataType: "boolean", inputMode: "toggle", displayOrder: 17 }),
  v("number_of_branches", "Entity & Constitution", "Addresses", "Number of Branches", { dataType: "number", inputMode: "number", displayOrder: 18 }),
  v("financial_year_start", "Entity & Constitution", "Reporting Period", "Financial Year Start", { dataType: "date", inputMode: "date", mandatoryFlag: M, aiExtractableFlag: AI, displayOrder: 19 }),
  v("financial_year_end", "Entity & Constitution", "Reporting Period", "Financial Year End", { dataType: "date", inputMode: "date", mandatoryFlag: M, aiExtractableFlag: AI, displayOrder: 20 }),
  v("reporting_period_start", "Entity & Constitution", "Reporting Period", "Reporting Period Start", { dataType: "date", inputMode: "date", mandatoryFlag: M, aiExtractableFlag: AI, displayOrder: 21 }),
  v("reporting_period_end", "Entity & Constitution", "Reporting Period", "Reporting Period End", { dataType: "date", inputMode: "date", mandatoryFlag: M, aiExtractableFlag: AI, displayOrder: 22 }),
  v("functional_currency", "Entity & Constitution", "Currency", "Functional Currency", { dataType: "text", inputMode: "dropdown", dropdownOptionsJson: dd(["PKR","USD","GBP","EUR","AED","SAR","CNY","JPY","Other"]), defaultValue: "PKR", aiExtractableFlag: AI, displayOrder: 23 }),
  v("presentation_currency", "Entity & Constitution", "Currency", "Presentation Currency", { dataType: "text", inputMode: "dropdown", dropdownOptionsJson: dd(["PKR","USD","GBP","EUR","AED","SAR","CNY","JPY","Other"]), defaultValue: "PKR", displayOrder: 24 }),
  v("reporting_framework", "Entity & Constitution", "Framework", "Reporting Framework", { dataType: "text", inputMode: "dropdown", dropdownOptionsJson: dd(["IFRS","IFRS for SMEs","AFRS","Fourth Schedule","Fifth Schedule"]), mandatoryFlag: M, defaultValue: "IFRS", displayOrder: 25 }),
  v("applicable_company_law", "Entity & Constitution", "Framework", "Applicable Company Law", { dataType: "text", inputMode: "dropdown", dropdownOptionsJson: dd(["Companies Act 2017","Companies Ordinance 1984","LLP Act 2017","Trust Act 1882","Societies Registration Act 1860","Other"]), defaultValue: "Companies Act 2017", pakistanReference: "Companies Act 2017", displayOrder: 26 }),
  v("tax_jurisdiction", "Entity & Constitution", "Tax", "Tax Jurisdiction", { dataType: "text", inputMode: "dropdown", dropdownOptionsJson: dd(["Pakistan (Federal + Provincial)","Pakistan (Federal Only)","Pakistan (Provincial Only)","Multiple Jurisdictions"]), defaultValue: "Pakistan (Federal + Provincial)", displayOrder: 27 }),
  v("group_entity_flag", "Entity & Constitution", "Group", "Group Entity", { dataType: "boolean", inputMode: "toggle", displayOrder: 28 }),
  v("parent_entity_name", "Entity & Constitution", "Group", "Parent Entity Name", { dataType: "text", inputMode: "text", aiExtractableFlag: AI, displayOrder: 29 }),
  v("subsidiary_flag", "Entity & Constitution", "Group", "Has Subsidiaries", { dataType: "boolean", inputMode: "toggle", displayOrder: 30 }),
  v("associate_flag", "Entity & Constitution", "Group", "Has Associates", { dataType: "boolean", inputMode: "toggle", displayOrder: 31 }),
  v("joint_venture_flag", "Entity & Constitution", "Group", "Has Joint Ventures", { dataType: "boolean", inputMode: "toggle", displayOrder: 32 }),
  v("foreign_operations_flag", "Entity & Constitution", "Group", "Foreign Operations", { dataType: "boolean", inputMode: "toggle", displayOrder: 33 }),

  // ═══════════════════════════════════════════════════════════════════════════
  // GROUP 2 — Ownership and Governance
  // ═══════════════════════════════════════════════════════════════════════════
  v("share_capital", "Ownership & Governance", "Capital Structure", "Share Capital", { dataType: "number", inputMode: "currency", aiExtractableFlag: AI, displayOrder: 1 }),
  v("authorized_capital", "Ownership & Governance", "Capital Structure", "Authorized Capital", { dataType: "number", inputMode: "currency", aiExtractableFlag: AI, displayOrder: 2 }),
  v("paid_up_capital", "Ownership & Governance", "Capital Structure", "Paid-up Capital", { dataType: "number", inputMode: "currency", aiExtractableFlag: AI, displayOrder: 3 }),
  v("classes_of_shares", "Ownership & Governance", "Capital Structure", "Classes of Shares", { dataType: "text", inputMode: "dropdown", dropdownOptionsJson: dd(["Ordinary Shares Only","Ordinary + Preference","Multiple Classes","Other"]), aiExtractableFlag: AI, displayOrder: 4 }),
  v("number_of_shareholders", "Ownership & Governance", "Shareholders", "Number of Shareholders", { dataType: "number", inputMode: "number", aiExtractableFlag: AI, displayOrder: 5 }),
  v("shareholder_pattern_available", "Ownership & Governance", "Shareholders", "Shareholder Pattern Available", { dataType: "boolean", inputMode: "toggle", displayOrder: 6 }),
  v("beneficial_owners_identified", "Ownership & Governance", "Shareholders", "Beneficial Owners Identified", { dataType: "boolean", inputMode: "toggle", pakistanReference: "Companies Act 2017 s.123A", displayOrder: 7 }),
  v("board_exists", "Ownership & Governance", "Board", "Board of Directors Exists", { dataType: "boolean", inputMode: "toggle", defaultValue: "true", displayOrder: 8 }),
  v("number_of_directors", "Ownership & Governance", "Board", "Number of Directors", { dataType: "number", inputMode: "number", aiExtractableFlag: AI, displayOrder: 9 }),
  v("ceo_name", "Ownership & Governance", "Key Personnel", "CEO Name", { dataType: "text", inputMode: "text", aiExtractableFlag: AI, displayOrder: 10 }),
  v("cfo_name", "Ownership & Governance", "Key Personnel", "CFO Name", { dataType: "text", inputMode: "text", aiExtractableFlag: AI, displayOrder: 11 }),
  v("company_secretary", "Ownership & Governance", "Key Personnel", "Company Secretary", { dataType: "text", inputMode: "text", aiExtractableFlag: AI, displayOrder: 12 }),
  v("audit_committee_exists", "Ownership & Governance", "Governance Bodies", "Audit Committee Exists", { dataType: "boolean", inputMode: "toggle", standardReference: "ISA 260", displayOrder: 13 }),
  v("internal_audit_function_exists", "Ownership & Governance", "Governance Bodies", "Internal Audit Function", { dataType: "boolean", inputMode: "toggle", standardReference: "ISA 610", displayOrder: 14 }),
  v("governance_level", "Ownership & Governance", "Governance Bodies", "Governance Level", { dataType: "text", inputMode: "rating_level", dropdownOptionsJson: dd(["Strong","Adequate","Weak","Not Assessed"]), displayOrder: 15 }),
  v("key_management_personnel", "Ownership & Governance", "Key Personnel", "Key Management Personnel", { dataType: "text", inputMode: "textarea", displayOrder: 16 }),
  v("related_parties_exist", "Ownership & Governance", "Related Parties", "Related Parties Exist", { dataType: "boolean", inputMode: "toggle", standardReference: "ISA 550", affectsWorkingPapersJson: ["related_parties"], displayOrder: 17 }),
  v("related_parties_list", "Ownership & Governance", "Related Parties", "Related Parties List", { dataType: "textarea", inputMode: "textarea", displayOrder: 18 }),
  v("minutes_available", "Ownership & Governance", "Records", "Minutes Available", { dataType: "boolean", inputMode: "toggle", displayOrder: 19 }),
  v("board_minutes_reviewed", "Ownership & Governance", "Records", "Board Minutes Reviewed", { dataType: "boolean", inputMode: "toggle", displayOrder: 20 }),
  v("agm_held", "Ownership & Governance", "Records", "AGM Held", { dataType: "boolean", inputMode: "toggle", pakistanReference: "Companies Act 2017 s.132", displayOrder: 21 }),
  v("statutory_registers_available", "Ownership & Governance", "Records", "Statutory Registers Available", { dataType: "boolean", inputMode: "toggle", displayOrder: 22 }),

  // ═══════════════════════════════════════════════════════════════════════════
  // GROUP 3 — Engagement Acceptance & Continuance
  // ═══════════════════════════════════════════════════════════════════════════
  v("engagement_type", "Engagement Acceptance", "Engagement Setup", "Engagement Type", { dataType: "text", inputMode: "dropdown", dropdownOptionsJson: dd(["statutory_audit","limited_review","group_audit"]), mandatoryFlag: M, displayOrder: 1 }),
  v("assurance_level", "Engagement Acceptance", "Engagement Setup", "Assurance Level", { dataType: "text", inputMode: "dropdown", dropdownOptionsJson: dd(["Reasonable","Limited","None"]), defaultValue: "Reasonable", displayOrder: 2 }),
  v("first_year_audit", "Engagement Acceptance", "History", "First Year Audit", { dataType: "boolean", inputMode: "toggle", affectsWorkingPapersJson: ["ob_verification"], displayOrder: 3 }),
  v("recurring_engagement", "Engagement Acceptance", "History", "Recurring Engagement", { dataType: "boolean", inputMode: "toggle", displayOrder: 4 }),
  v("previous_auditor", "Engagement Acceptance", "History", "Previous Auditor", { dataType: "text", inputMode: "text", standardReference: "ISA 510", displayOrder: 5 }),
  v("predecessor_communication_done", "Engagement Acceptance", "History", "Predecessor Communication Done", { dataType: "boolean", inputMode: "toggle", standardReference: "ISA 510", displayOrder: 6 }),
  v("client_acceptance_approved", "Engagement Acceptance", "Acceptance", "Client Acceptance Approved", { dataType: "boolean", inputMode: "toggle", mandatoryFlag: M, standardReference: "ISQM 1", displayOrder: 7 }),
  v("continuance_approved", "Engagement Acceptance", "Acceptance", "Continuance Approved", { dataType: "boolean", inputMode: "toggle", displayOrder: 8 }),
  v("independence_confirmed", "Engagement Acceptance", "Ethics", "Independence Confirmed", { dataType: "boolean", inputMode: "toggle", mandatoryFlag: M, standardReference: "IESBA Code", displayOrder: 9 }),
  v("ethical_compliance_confirmed", "Engagement Acceptance", "Ethics", "Ethical Compliance Confirmed", { dataType: "boolean", inputMode: "toggle", standardReference: "IESBA Code", displayOrder: 10 }),
  v("conflict_check_completed", "Engagement Acceptance", "Ethics", "Conflict Check Completed", { dataType: "boolean", inputMode: "toggle", displayOrder: 11 }),
  v("engagement_letter_signed", "Engagement Acceptance", "Terms", "Engagement Letter Signed", { dataType: "boolean", inputMode: "toggle", mandatoryFlag: M, standardReference: "ISA 210", displayOrder: 12 }),
  v("terms_of_engagement_agreed", "Engagement Acceptance", "Terms", "Terms of Engagement Agreed", { dataType: "boolean", inputMode: "toggle", standardReference: "ISA 210", displayOrder: 13 }),
  v("management_integrity_risk", "Engagement Acceptance", "Risk", "Management Integrity Risk", { dataType: "text", inputMode: "risk_level", dropdownOptionsJson: dd(["Low","Medium","High"]), reviewRequiredFlag: RV, displayOrder: 14 }),
  v("client_risk_category", "Engagement Acceptance", "Risk", "Client Risk Category", { dataType: "text", inputMode: "risk_level", dropdownOptionsJson: dd(["Low","Medium","High"]), displayOrder: 15 }),
  v("restricted_scope_flag", "Engagement Acceptance", "Scope", "Restricted Scope", { dataType: "boolean", inputMode: "toggle", affectsWorkingPapersJson: ["reporting"], displayOrder: 16 }),
  v("eqcr_required", "Engagement Acceptance", "Quality", "EQCR Required", { dataType: "boolean", inputMode: "toggle", standardReference: "ISQM 1 / ISA 220", affectsWorkingPapersJson: ["eqcr"], displayOrder: 17 }),
  v("specialist_required", "Engagement Acceptance", "Resources", "Specialist Required", { dataType: "boolean", inputMode: "toggle", standardReference: "ISA 620", displayOrder: 18 }),
  v("component_auditor_required", "Engagement Acceptance", "Resources", "Component Auditor Required", { dataType: "boolean", inputMode: "toggle", standardReference: "ISA 600", displayOrder: 19 }),
  v("engagement_partner", "Engagement Acceptance", "Team", "Engagement Partner", { dataType: "text", inputMode: "text", mandatoryFlag: M, displayOrder: 20 }),
  v("engagement_manager", "Engagement Acceptance", "Team", "Engagement Manager", { dataType: "text", inputMode: "text", displayOrder: 21 }),
  v("engagement_team_members", "Engagement Acceptance", "Team", "Team Members", { dataType: "textarea", inputMode: "textarea", displayOrder: 22 }),
  v("reviewer", "Engagement Acceptance", "Team", "Reviewer", { dataType: "text", inputMode: "text", displayOrder: 23 }),
  v("approver", "Engagement Acceptance", "Team", "Approver", { dataType: "text", inputMode: "text", displayOrder: 24 }),
  v("engagement_start_date", "Engagement Acceptance", "Timeline", "Engagement Start Date", { dataType: "date", inputMode: "date", displayOrder: 25 }),
  v("reporting_deadline", "Engagement Acceptance", "Timeline", "Reporting Deadline", { dataType: "date", inputMode: "date", displayOrder: 26 }),
  v("expected_signing_date", "Engagement Acceptance", "Timeline", "Expected Signing Date", { dataType: "date", inputMode: "date", displayOrder: 27 }),
  v("engagement_size", "Engagement Acceptance", "Profile", "Engagement Size", { dataType: "text", inputMode: "dropdown", dropdownOptionsJson: dd(["Small","Medium","Large","Very Large"]), displayOrder: 28 }),

  // ═══════════════════════════════════════════════════════════════════════════
  // GROUP 4 — Accounting & Records Environment
  // ═══════════════════════════════════════════════════════════════════════════
  v("accounting_software", "Accounting & Records", "IT Environment", "Accounting Software", { dataType: "text", inputMode: "dropdown", dropdownOptionsJson: dd(["QuickBooks","Sage","Xero","SAP","Oracle","Tally","Custom ERP","Manual Books","Other"]), aiExtractableFlag: AI, displayOrder: 1 }),
  v("erp_name", "Accounting & Records", "IT Environment", "ERP Name", { dataType: "text", inputMode: "text", aiExtractableFlag: AI, displayOrder: 2 }),
  v("books_maintained_properly", "Accounting & Records", "Quality", "Books Maintained Properly", { dataType: "boolean", inputMode: "toggle", standardReference: "Companies Act 2017 s.220", displayOrder: 3 }),
  v("manual_or_system", "Accounting & Records", "IT Environment", "Manual or System", { dataType: "text", inputMode: "dropdown", dropdownOptionsJson: dd(["Fully Automated","Semi-Automated","Manual"]), displayOrder: 4 }),
  v("gl_available", "Accounting & Records", "Availability", "GL Available", { dataType: "boolean", inputMode: "toggle", mandatoryFlag: M, displayOrder: 5 }),
  v("tb_available", "Accounting & Records", "Availability", "TB Available", { dataType: "boolean", inputMode: "toggle", mandatoryFlag: M, displayOrder: 6 }),
  v("fs_uploaded", "Accounting & Records", "Availability", "FS Uploaded", { dataType: "boolean", inputMode: "toggle", mandatoryFlag: M, displayOrder: 7 }),
  v("prior_year_fs_available", "Accounting & Records", "Availability", "Prior Year FS Available", { dataType: "boolean", inputMode: "toggle", displayOrder: 8 }),
  v("prior_year_audit_file_available", "Accounting & Records", "Availability", "Prior Year Audit File Available", { dataType: "boolean", inputMode: "toggle", displayOrder: 9 }),
  v("fixed_asset_register_available", "Accounting & Records", "Availability", "Fixed Asset Register Available", { dataType: "boolean", inputMode: "toggle", displayOrder: 10 }),
  v("inventory_records_available", "Accounting & Records", "Availability", "Inventory Records Available", { dataType: "boolean", inputMode: "toggle", displayOrder: 11 }),
  v("payroll_records_available", "Accounting & Records", "Availability", "Payroll Records Available", { dataType: "boolean", inputMode: "toggle", displayOrder: 12 }),
  v("tax_records_available", "Accounting & Records", "Availability", "Tax Records Available", { dataType: "boolean", inputMode: "toggle", displayOrder: 13 }),
  v("bank_statements_available", "Accounting & Records", "Availability", "Bank Statements Available", { dataType: "boolean", inputMode: "toggle", displayOrder: 14 }),
  v("voucher_support_available", "Accounting & Records", "Availability", "Voucher Support Available", { dataType: "boolean", inputMode: "toggle", displayOrder: 15 }),
  v("digital_document_quality", "Accounting & Records", "Quality", "Digital Document Quality", { dataType: "text", inputMode: "rating_level", dropdownOptionsJson: dd(["Excellent","Good","Fair","Poor"]), displayOrder: 16 }),
  v("ocr_quality_score", "Accounting & Records", "Quality", "OCR Quality Score", { dataType: "number", inputMode: "percentage", aiExtractableFlag: AI, displayOrder: 17 }),
  v("missing_records_flag", "Accounting & Records", "Quality", "Missing Records", { dataType: "boolean", inputMode: "toggle", reviewRequiredFlag: RV, displayOrder: 18 }),
  v("records_reliability_score", "Accounting & Records", "Quality", "Records Reliability Score", { dataType: "text", inputMode: "risk_level", dropdownOptionsJson: dd(["High","Medium","Low"]), reviewRequiredFlag: RV, displayOrder: 19 }),

  // ═══════════════════════════════════════════════════════════════════════════
  // GROUP 5 — Trial Balance & COA Structure
  // ═══════════════════════════════════════════════════════════════════════════
  v("coa_available", "Trial Balance & COA", "Structure", "COA Available", { dataType: "boolean", inputMode: "toggle", displayOrder: 1 }),
  v("account_code_present", "Trial Balance & COA", "Structure", "Account Codes Present", { dataType: "boolean", inputMode: "toggle", displayOrder: 2 }),
  v("account_name_present", "Trial Balance & COA", "Structure", "Account Names Present", { dataType: "boolean", inputMode: "toggle", displayOrder: 3 }),
  v("account_type", "Trial Balance & COA", "Mapping", "Account Type Classification", { dataType: "text", inputMode: "dropdown", dropdownOptionsJson: dd(["4-digit COA","5-digit COA","Custom","None"]), displayOrder: 4 }),
  v("account_classification", "Trial Balance & COA", "Mapping", "Account Classification Done", { dataType: "boolean", inputMode: "toggle", displayOrder: 5 }),
  v("opening_balance_present", "Trial Balance & COA", "Balances", "Opening Balance Present", { dataType: "boolean", inputMode: "toggle", displayOrder: 6 }),
  v("movement_debit_present", "Trial Balance & COA", "Balances", "Movement Debit Present", { dataType: "boolean", inputMode: "toggle", displayOrder: 7 }),
  v("movement_credit_present", "Trial Balance & COA", "Balances", "Movement Credit Present", { dataType: "boolean", inputMode: "toggle", displayOrder: 8 }),
  v("closing_balance_present", "Trial Balance & COA", "Balances", "Closing Balance Present", { dataType: "boolean", inputMode: "toggle", displayOrder: 9 }),
  v("tb_balanced_flag", "Trial Balance & COA", "Validation", "TB Balanced", { dataType: "boolean", inputMode: "toggle", reviewRequiredFlag: RV, affectsWorkingPapersJson: ["trial_balance","general_ledger"], displayOrder: 10 }),
  v("unmapped_accounts_count", "Trial Balance & COA", "Validation", "Unmapped Accounts Count", { dataType: "number", inputMode: "number", displayOrder: 11 }),
  v("unmapped_accounts_value", "Trial Balance & COA", "Validation", "Unmapped Accounts Value", { dataType: "number", inputMode: "currency", displayOrder: 12 }),
  v("fs_mapping_completed", "Trial Balance & COA", "Mapping", "FS Mapping Completed", { dataType: "boolean", inputMode: "toggle", displayOrder: 13 }),
  v("control_accounts_identified", "Trial Balance & COA", "Mapping", "Control Accounts Identified", { dataType: "boolean", inputMode: "toggle", displayOrder: 14 }),
  v("manual_tb_adjustments_flag", "Trial Balance & COA", "Adjustments", "Manual TB Adjustments", { dataType: "boolean", inputMode: "toggle", displayOrder: 15 }),
  v("adjusted_tb_flag", "Trial Balance & COA", "Adjustments", "Adjusted TB Prepared", { dataType: "boolean", inputMode: "toggle", displayOrder: 16 }),
  v("tb_line_count", "Trial Balance & COA", "Structure", "TB Line Count", { dataType: "number", inputMode: "number", displayOrder: 17 }),
  v("tb_total_period_debit", "Trial Balance & COA", "Balances", "Total Period Debit", { dataType: "number", inputMode: "currency", displayOrder: 18 }),
  v("tb_total_period_credit", "Trial Balance & COA", "Balances", "Total Period Credit", { dataType: "number", inputMode: "currency", displayOrder: 19 }),
  v("tb_opening_balance_aggregate", "Trial Balance & COA", "Balances", "Total Opening Balance", { dataType: "number", inputMode: "currency", displayOrder: 20 }),
  v("tb_closing_balance_aggregate", "Trial Balance & COA", "Balances", "Total Closing Balance", { dataType: "number", inputMode: "currency", displayOrder: 21 }),
  v("audit_procedure_depth", "Trial Balance & COA", "Audit Depth", "Dominant Procedure Depth", { dataType: "text", inputMode: "dropdown", dropdownOptionsJson: dd(["Expanded","Standard","Basic"]), displayOrder: 22 }),
  v("high_priority_gl_count", "Trial Balance & COA", "GL Generation", "High-Priority GL Accounts", { dataType: "number", inputMode: "number", displayOrder: 23 }),

  // ═══════════════════════════════════════════════════════════════════════════
  // GROUP 6 — Financial Statement Figures (CY + PY)
  // ═══════════════════════════════════════════════════════════════════════════
  ...[
    ["total_assets", "Total Assets"], ["non_current_assets", "Non-Current Assets"], ["current_assets", "Current Assets"],
    ["fixed_assets", "Fixed Assets (PPE)"], ["right_of_use_assets", "Right-of-Use Assets"], ["capital_work_in_progress", "Capital Work in Progress"],
    ["intangible_assets", "Intangible Assets"], ["investments", "Investments"], ["long_term_loans", "Long-Term Loans & Advances"],
    ["deposits_prepayments", "Deposits & Prepayments"], ["inventory", "Inventory"], ["trade_receivables", "Trade Receivables"],
    ["advances", "Advances"], ["other_receivables", "Other Receivables"], ["short_term_investments", "Short-Term Investments"],
    ["tax_refunds_due", "Tax Refunds Due"], ["cash_and_bank", "Cash & Bank Balances"],
    ["total_equity", "Total Equity"], ["share_capital_fs", "Share Capital (FS)"], ["reserves", "Reserves"],
    ["retained_earnings", "Retained Earnings"], ["revaluation_surplus", "Revaluation Surplus"],
    ["total_liabilities", "Total Liabilities"], ["non_current_liabilities", "Non-Current Liabilities"], ["current_liabilities", "Current Liabilities"],
    ["long_term_borrowings", "Long-Term Borrowings"], ["lease_liabilities", "Lease Liabilities"],
    ["trade_payables", "Trade Payables"], ["accruals", "Accrued Liabilities"], ["taxation_payable", "Taxation Payable"],
    ["short_term_borrowings", "Short-Term Borrowings"], ["current_portion_long_term_debt", "Current Portion of LT Debt"],
    ["revenue", "Revenue"], ["cost_of_sales", "Cost of Sales"], ["gross_profit", "Gross Profit"],
    ["admin_expenses", "Administrative Expenses"], ["selling_distribution_expenses", "Selling & Distribution Expenses"],
    ["finance_cost", "Finance Cost"], ["other_income", "Other Income"], ["other_expenses", "Other Expenses"],
    ["profit_before_tax", "Profit Before Tax"], ["tax_expense", "Tax Expense"], ["profit_after_tax", "Profit After Tax"],
    ["other_comprehensive_income", "Other Comprehensive Income"], ["total_comprehensive_income", "Total Comprehensive Income"],
    ["operating_cash_flow", "Operating Cash Flow"], ["investing_cash_flow", "Investing Cash Flow"], ["financing_cash_flow", "Financing Cash Flow"],
  ].flatMap(([code, label], i) => [
    v(`cy_${code}`, "Financial Statements", "Current Year", `CY ${label}`, { dataType: "number", inputMode: "currency", aiExtractableFlag: AI, displayOrder: i * 2 + 1 }),
    v(`py_${code}`, "Financial Statements", "Prior Year", `PY ${label}`, { dataType: "number", inputMode: "currency", aiExtractableFlag: AI, displayOrder: i * 2 + 2 }),
  ]),
  v("variance_analysis_done", "Financial Statements", "Variances", "Variance Analysis Done", { dataType: "boolean", inputMode: "toggle", displayOrder: 200 }),

  // ═══════════════════════════════════════════════════════════════════════════
  // GROUP 7 — Materiality
  // ═══════════════════════════════════════════════════════════════════════════
  v("materiality_basis", "Materiality", "Overall", "Materiality Basis", { dataType: "text", inputMode: "dropdown", dropdownOptionsJson: dd(["Revenue","Total Assets","Profit Before Tax","Equity","Total Expenses"]), mandatoryFlag: M, standardReference: "ISA 320", displayOrder: 1 }),
  v("materiality_basis_amount", "Materiality", "Overall", "Materiality Basis Amount", { dataType: "number", inputMode: "currency", mandatoryFlag: M, aiExtractableFlag: AI, displayOrder: 2 }),
  v("benchmark_reason", "Materiality", "Overall", "Benchmark Reason", { dataType: "text", inputMode: "textarea", mandatoryFlag: M, standardReference: "ISA 320.A4", displayOrder: 3 }),
  v("overall_materiality_percent", "Materiality", "Overall", "Overall Materiality %", { dataType: "number", inputMode: "percentage", mandatoryFlag: M, displayOrder: 4 }),
  v("overall_materiality_amount", "Materiality", "Overall", "Overall Materiality Amount", { dataType: "number", inputMode: "currency", mandatoryFlag: M, displayOrder: 5 }),
  v("performance_materiality_percent", "Materiality", "Performance", "Performance Materiality %", { dataType: "number", inputMode: "percentage", mandatoryFlag: M, standardReference: "ISA 320.11", displayOrder: 6 }),
  v("performance_materiality_amount", "Materiality", "Performance", "Performance Materiality Amount", { dataType: "number", inputMode: "currency", mandatoryFlag: M, displayOrder: 7 }),
  v("trivial_threshold_percent", "Materiality", "Trivial", "Trivial Threshold %", { dataType: "number", inputMode: "percentage", standardReference: "ISA 450.A2", displayOrder: 8 }),
  v("trivial_threshold_amount", "Materiality", "Trivial", "Trivial Threshold Amount", { dataType: "number", inputMode: "currency", displayOrder: 9 }),
  v("specific_materiality_required", "Materiality", "Specific", "Specific Materiality Required", { dataType: "boolean", inputMode: "toggle", standardReference: "ISA 320.10", displayOrder: 10 }),
  v("specific_materiality_areas", "Materiality", "Specific", "Specific Materiality Areas", { dataType: "textarea", inputMode: "textarea", displayOrder: 11 }),
  v("materiality_revision_flag", "Materiality", "Revision", "Materiality Revised", { dataType: "boolean", inputMode: "toggle", standardReference: "ISA 320.12", displayOrder: 12 }),
  v("revised_materiality_reason", "Materiality", "Revision", "Revised Materiality Reason", { dataType: "text", inputMode: "textarea", displayOrder: 13 }),

  // ═══════════════════════════════════════════════════════════════════════════
  // GROUP 8 — Risk Assessment
  // ═══════════════════════════════════════════════════════════════════════════
  v("inherent_risk_overall", "Risk Assessment", "Overall Risk", "Inherent Risk (Overall)", { dataType: "text", inputMode: "risk_level", dropdownOptionsJson: dd(["Low","Medium","High"]), mandatoryFlag: M, standardReference: "ISA 315", displayOrder: 1 }),
  v("control_risk_overall", "Risk Assessment", "Overall Risk", "Control Risk (Overall)", { dataType: "text", inputMode: "risk_level", dropdownOptionsJson: dd(["Low","Medium","High"]), mandatoryFlag: M, standardReference: "ISA 315", displayOrder: 2 }),
  v("risk_of_material_misstatement_overall", "Risk Assessment", "Overall Risk", "RMM (Overall)", { dataType: "text", inputMode: "risk_level", dropdownOptionsJson: dd(["Low","Medium","High"]), mandatoryFlag: M, standardReference: "ISA 315", displayOrder: 3 }),
  v("fraud_risk_flag", "Risk Assessment", "Fraud Risk", "Fraud Risk Identified", { dataType: "boolean", inputMode: "toggle", mandatoryFlag: M, standardReference: "ISA 240", reviewRequiredFlag: RV, displayOrder: 4 }),
  v("revenue_fraud_risk_flag", "Risk Assessment", "Fraud Risk", "Revenue Fraud Risk", { dataType: "boolean", inputMode: "toggle", defaultValue: "true", standardReference: "ISA 240.26", displayOrder: 5 }),
  v("management_override_risk_flag", "Risk Assessment", "Fraud Risk", "Management Override Risk", { dataType: "boolean", inputMode: "toggle", defaultValue: "true", standardReference: "ISA 240.31", displayOrder: 6 }),
  v("going_concern_risk_flag", "Risk Assessment", "Business Risk", "Going Concern Risk", { dataType: "boolean", inputMode: "toggle", standardReference: "ISA 570", affectsWorkingPapersJson: ["going_concern"], reviewRequiredFlag: RV, displayOrder: 7 }),
  v("related_party_risk_flag", "Risk Assessment", "Business Risk", "Related Party Risk", { dataType: "boolean", inputMode: "toggle", standardReference: "ISA 550", displayOrder: 8 }),
  v("litigation_risk_flag", "Risk Assessment", "Business Risk", "Litigation Risk", { dataType: "boolean", inputMode: "toggle", displayOrder: 9 }),
  v("tax_risk_flag", "Risk Assessment", "Business Risk", "Tax Risk", { dataType: "boolean", inputMode: "toggle", displayOrder: 10 }),
  v("compliance_risk_flag", "Risk Assessment", "Business Risk", "Compliance Risk", { dataType: "boolean", inputMode: "toggle", displayOrder: 11 }),
  v("going_concern_indicator_count", "Risk Assessment", "Going Concern", "Going Concern Indicator Count", { dataType: "number", inputMode: "number", displayOrder: 12 }),
  v("significant_risk_areas", "Risk Assessment", "Significant Risks", "Significant Risk Areas", { dataType: "textarea", inputMode: "textarea", mandatoryFlag: M, standardReference: "ISA 315.28", displayOrder: 13 }),
  v("risk_assessment_summary", "Risk Assessment", "Summary", "Risk Assessment Summary", { dataType: "textarea", inputMode: "textarea", displayOrder: 14 }),
  v("assertion_level_risk_required", "Risk Assessment", "Assertion Level", "Assertion-Level Risk Required", { dataType: "boolean", inputMode: "toggle", standardReference: "ISA 315.26", displayOrder: 15 }),
  v("account_level_risk_mapping_done", "Risk Assessment", "Assertion Level", "Account-Level Risk Mapping Done", { dataType: "boolean", inputMode: "toggle", displayOrder: 16 }),

  // ═══════════════════════════════════════════════════════════════════════════
  // GROUP 9 — Internal Controls
  // ═══════════════════════════════════════════════════════════════════════════
  v("control_environment_rating", "Internal Controls", "Environment", "Control Environment Rating", { dataType: "text", inputMode: "rating_level", dropdownOptionsJson: dd(["Strong","Adequate","Weak"]), standardReference: "ISA 315.14", displayOrder: 1 }),
  v("segregation_of_duties", "Internal Controls", "Design", "Segregation of Duties", { dataType: "text", inputMode: "dropdown", dropdownOptionsJson: dd(["Adequate","Inadequate","N/A"]), displayOrder: 2 }),
  v("authorization_controls", "Internal Controls", "Design", "Authorization Controls", { dataType: "text", inputMode: "dropdown", dropdownOptionsJson: dd(["Adequate","Inadequate","N/A"]), displayOrder: 3 }),
  v("access_controls", "Internal Controls", "IT Controls", "Access Controls", { dataType: "text", inputMode: "dropdown", dropdownOptionsJson: dd(["Adequate","Inadequate","N/A"]), displayOrder: 4 }),
  v("it_general_controls", "Internal Controls", "IT Controls", "IT General Controls", { dataType: "text", inputMode: "dropdown", dropdownOptionsJson: dd(["Adequate","Inadequate","N/A"]), standardReference: "ISA 315.A132", displayOrder: 5 }),
  v("application_controls", "Internal Controls", "IT Controls", "Application Controls", { dataType: "text", inputMode: "dropdown", dropdownOptionsJson: dd(["Adequate","Inadequate","N/A"]), displayOrder: 6 }),
  v("bank_payment_controls", "Internal Controls", "Process Controls", "Bank/Payment Controls", { dataType: "text", inputMode: "dropdown", dropdownOptionsJson: dd(["Adequate","Inadequate","N/A"]), displayOrder: 7 }),
  v("procurement_controls", "Internal Controls", "Process Controls", "Procurement Controls", { dataType: "text", inputMode: "dropdown", dropdownOptionsJson: dd(["Adequate","Inadequate","N/A"]), displayOrder: 8 }),
  v("sales_controls", "Internal Controls", "Process Controls", "Sales Controls", { dataType: "text", inputMode: "dropdown", dropdownOptionsJson: dd(["Adequate","Inadequate","N/A"]), displayOrder: 9 }),
  v("payroll_controls", "Internal Controls", "Process Controls", "Payroll Controls", { dataType: "text", inputMode: "dropdown", dropdownOptionsJson: dd(["Adequate","Inadequate","N/A"]), displayOrder: 10 }),
  v("inventory_controls", "Internal Controls", "Process Controls", "Inventory Controls", { dataType: "text", inputMode: "dropdown", dropdownOptionsJson: dd(["Adequate","Inadequate","N/A"]), displayOrder: 11 }),
  v("journal_entry_controls", "Internal Controls", "Process Controls", "Journal Entry Controls", { dataType: "text", inputMode: "dropdown", dropdownOptionsJson: dd(["Adequate","Inadequate","N/A"]), standardReference: "ISA 240.32", displayOrder: 12 }),
  v("controls_documented", "Internal Controls", "Testing", "Controls Documented", { dataType: "boolean", inputMode: "toggle", displayOrder: 13 }),
  v("walkthrough_completed", "Internal Controls", "Testing", "Walkthrough Completed", { dataType: "boolean", inputMode: "toggle", standardReference: "ISA 315.A151", displayOrder: 14 }),
  v("toc_planned", "Internal Controls", "Testing", "Test of Controls Planned", { dataType: "boolean", inputMode: "toggle", standardReference: "ISA 330.8", affectsWorkingPapersJson: ["controls_testing"], displayOrder: 15 }),
  v("controls_reliance_planned", "Internal Controls", "Testing", "Controls Reliance Planned", { dataType: "boolean", inputMode: "toggle", standardReference: "ISA 330", displayOrder: 16 }),
  v("control_deficiencies_identified", "Internal Controls", "Deficiencies", "Control Deficiencies Identified", { dataType: "boolean", inputMode: "toggle", standardReference: "ISA 265", displayOrder: 17 }),
  v("significant_deficiency_flag", "Internal Controls", "Deficiencies", "Significant Deficiency", { dataType: "boolean", inputMode: "toggle", standardReference: "ISA 265.8", reviewRequiredFlag: RV, displayOrder: 18 }),
  v("material_weakness_flag", "Internal Controls", "Deficiencies", "Material Weakness", { dataType: "boolean", inputMode: "toggle", standardReference: "ISA 265", reviewRequiredFlag: RV, displayOrder: 19 }),

  // ═══════════════════════════════════════════════════════════════════════════
  // GROUP 10 — Sampling
  // ═══════════════════════════════════════════════════════════════════════════
  v("sampling_required", "Sampling", "Setup", "Sampling Required", { dataType: "boolean", inputMode: "toggle", standardReference: "ISA 530", displayOrder: 1 }),
  v("population_count", "Sampling", "Population", "Population Count", { dataType: "number", inputMode: "number", displayOrder: 2 }),
  v("population_value", "Sampling", "Population", "Population Value", { dataType: "number", inputMode: "currency", displayOrder: 3 }),
  v("key_item_count", "Sampling", "Key Items", "Key Item Count", { dataType: "number", inputMode: "number", displayOrder: 4 }),
  v("key_item_value", "Sampling", "Key Items", "Key Item Value", { dataType: "number", inputMode: "currency", displayOrder: 5 }),
  v("sample_method", "Sampling", "Method", "Sample Method", { dataType: "text", inputMode: "dropdown", dropdownOptionsJson: dd(["Random","Systematic","Monetary Unit","Haphazard","Block","Judgmental"]), standardReference: "ISA 530.A13", displayOrder: 6 }),
  v("sample_size", "Sampling", "Method", "Sample Size", { dataType: "number", inputMode: "number", displayOrder: 7 }),
  v("expected_misstatement", "Sampling", "Parameters", "Expected Misstatement", { dataType: "number", inputMode: "currency", displayOrder: 8 }),
  v("tolerable_misstatement", "Sampling", "Parameters", "Tolerable Misstatement", { dataType: "number", inputMode: "currency", standardReference: "ISA 530.A3", displayOrder: 9 }),
  v("confidence_level", "Sampling", "Parameters", "Confidence Level", { dataType: "number", inputMode: "dropdown", dropdownOptionsJson: dd(["90","95","99"]), defaultValue: "95", displayOrder: 10 }),
  v("selection_interval", "Sampling", "Parameters", "Selection Interval", { dataType: "number", inputMode: "number", displayOrder: 11 }),
  v("stratification_used", "Sampling", "Method", "Stratification Used", { dataType: "boolean", inputMode: "toggle", standardReference: "ISA 530.A6", displayOrder: 12 }),
  v("sampling_basis", "Sampling", "Method", "Sampling Basis", { dataType: "text", inputMode: "dropdown", dropdownOptionsJson: dd(["Value-based","Volume-based","Risk-based","Combined"]), displayOrder: 13 }),
  v("sample_generated_by_ai", "Sampling", "AI", "Sample Generated by AI", { dataType: "boolean", inputMode: "toggle", displayOrder: 14 }),
  v("sample_reviewed_by_user", "Sampling", "AI", "Sample Reviewed by User", { dataType: "boolean", inputMode: "toggle", displayOrder: 15 }),

  // ═══════════════════════════════════════════════════════════════════════════
  // GROUP 11 — Analytical Procedures
  // ═══════════════════════════════════════════════════════════════════════════
  v("planning_analytics_performed", "Analytical Procedures", "Planning", "Planning Analytics Performed", { dataType: "boolean", inputMode: "toggle", standardReference: "ISA 315.B17", displayOrder: 1 }),
  v("substantive_analytics_planned", "Analytical Procedures", "Substantive", "Substantive Analytics Planned", { dataType: "boolean", inputMode: "toggle", standardReference: "ISA 520", displayOrder: 2 }),
  v("final_analytics_performed", "Analytical Procedures", "Final", "Final Analytics Performed", { dataType: "boolean", inputMode: "toggle", standardReference: "ISA 520.6", displayOrder: 3 }),
  v("ratio_analysis_required", "Analytical Procedures", "Methods", "Ratio Analysis Required", { dataType: "boolean", inputMode: "toggle", displayOrder: 4 }),
  v("trend_analysis_required", "Analytical Procedures", "Methods", "Trend Analysis Required", { dataType: "boolean", inputMode: "toggle", displayOrder: 5 }),
  v("monthwise_analysis_required", "Analytical Procedures", "Methods", "Month-wise Analysis Required", { dataType: "boolean", inputMode: "toggle", displayOrder: 6 }),
  v("expectation_developed", "Analytical Procedures", "Expectation", "Expectation Developed", { dataType: "boolean", inputMode: "toggle", standardReference: "ISA 520.5", displayOrder: 7 }),
  v("threshold_for_investigation", "Analytical Procedures", "Expectation", "Investigation Threshold", { dataType: "number", inputMode: "number", displayOrder: 8 }),
  v("unusual_fluctuations_identified", "Analytical Procedures", "Results", "Unusual Fluctuations Identified", { dataType: "boolean", inputMode: "toggle", reviewRequiredFlag: RV, displayOrder: 9 }),
  v("analytics_conclusion", "Analytical Procedures", "Results", "Analytics Conclusion", { dataType: "textarea", inputMode: "textarea", displayOrder: 10 }),

  // ═══════════════════════════════════════════════════════════════════════════
  // GROUP 12 — Tax & Statutory Compliance
  // ═══════════════════════════════════════════════════════════════════════════
  v("income_tax_return_filed", "Tax & Compliance", "Income Tax", "Income Tax Return Filed", { dataType: "boolean", inputMode: "toggle", aiExtractableFlag: AI, pakistanReference: "Income Tax Ordinance 2001 s.114", displayOrder: 1 }),
  v("sales_tax_return_filed", "Tax & Compliance", "Sales Tax", "Sales Tax Return Filed", { dataType: "boolean", inputMode: "toggle", aiExtractableFlag: AI, displayOrder: 2 }),
  v("withholding_statements_filed", "Tax & Compliance", "Withholding", "Withholding Statements Filed", { dataType: "boolean", inputMode: "toggle", pakistanReference: "ITO 2001 s.165", displayOrder: 3 }),
  v("annual_return_filed", "Tax & Compliance", "SECP", "Annual Return Filed (SECP)", { dataType: "boolean", inputMode: "toggle", pakistanReference: "Companies Act 2017 s.130", displayOrder: 4 }),
  v("secp_forms_filed", "Tax & Compliance", "SECP", "SECP Forms Filed", { dataType: "boolean", inputMode: "toggle", displayOrder: 5 }),
  v("sales_tax_applicable", "Tax & Compliance", "Sales Tax", "Sales Tax Applicable", { dataType: "boolean", inputMode: "toggle", aiExtractableFlag: AI, affectsWorkingPapersJson: ["sales_tax_wp"], displayOrder: 6 }),
  v("further_tax_applicable", "Tax & Compliance", "Sales Tax", "Further Tax Applicable", { dataType: "boolean", inputMode: "toggle", pakistanReference: "Sales Tax Act 1990 s.3(1A)", displayOrder: 7 }),
  v("minimum_tax_applicable", "Tax & Compliance", "Income Tax", "Minimum Tax Applicable", { dataType: "boolean", inputMode: "toggle", pakistanReference: "ITO 2001 s.113", displayOrder: 8 }),
  v("final_tax_regime_flag", "Tax & Compliance", "Income Tax", "Final Tax Regime", { dataType: "boolean", inputMode: "toggle", pakistanReference: "ITO 2001", displayOrder: 9 }),
  v("normal_tax_regime_flag", "Tax & Compliance", "Income Tax", "Normal Tax Regime", { dataType: "boolean", inputMode: "toggle", displayOrder: 10 }),
  v("deferred_tax_applicable", "Tax & Compliance", "Income Tax", "Deferred Tax Applicable", { dataType: "boolean", inputMode: "toggle", standardReference: "IAS 12", displayOrder: 11 }),
  v("current_tax_provision", "Tax & Compliance", "Amounts", "Current Tax Provision", { dataType: "number", inputMode: "currency", aiExtractableFlag: AI, displayOrder: 12 }),
  v("advance_tax", "Tax & Compliance", "Amounts", "Advance Tax", { dataType: "number", inputMode: "currency", aiExtractableFlag: AI, displayOrder: 13 }),
  v("withholding_tax_deducted", "Tax & Compliance", "Amounts", "WHT Deducted", { dataType: "number", inputMode: "currency", aiExtractableFlag: AI, displayOrder: 14 }),
  v("withholding_tax_paid", "Tax & Compliance", "Amounts", "WHT Paid", { dataType: "number", inputMode: "currency", aiExtractableFlag: AI, displayOrder: 15 }),
  v("sales_tax_input", "Tax & Compliance", "Sales Tax Amounts", "Sales Tax Input", { dataType: "number", inputMode: "currency", aiExtractableFlag: AI, displayOrder: 16 }),
  v("sales_tax_output", "Tax & Compliance", "Sales Tax Amounts", "Sales Tax Output", { dataType: "number", inputMode: "currency", aiExtractableFlag: AI, displayOrder: 17 }),
  v("sales_tax_payable_or_refundable", "Tax & Compliance", "Sales Tax Amounts", "Sales Tax Payable/Refundable", { dataType: "number", inputMode: "currency", aiExtractableFlag: AI, displayOrder: 18 }),
  v("tax_litigation_exists", "Tax & Compliance", "Disputes", "Tax Litigation Exists", { dataType: "boolean", inputMode: "toggle", reviewRequiredFlag: RV, displayOrder: 19 }),
  v("notices_received", "Tax & Compliance", "Disputes", "Notices Received", { dataType: "boolean", inputMode: "toggle", aiExtractableFlag: AI, displayOrder: 20 }),
  v("tax_exposure_estimated", "Tax & Compliance", "Disputes", "Tax Exposure Estimated", { dataType: "number", inputMode: "currency", displayOrder: 21 }),
  v("non_compliance_identified", "Tax & Compliance", "Disputes", "Non-Compliance Identified", { dataType: "boolean", inputMode: "toggle", reviewRequiredFlag: RV, displayOrder: 22 }),

  // ═══════════════════════════════════════════════════════════════════════════
  // GROUP 13 — Related Parties
  // ═══════════════════════════════════════════════════════════════════════════
  v("related_party_register_available", "Related Parties", "Register", "Related Party Register Available", { dataType: "boolean", inputMode: "toggle", standardReference: "ISA 550", displayOrder: 1 }),
  v("related_party_transactions_exist", "Related Parties", "Transactions", "RP Transactions Exist", { dataType: "boolean", inputMode: "toggle", standardReference: "ISA 550.16", displayOrder: 2 }),
  v("related_party_balances_exist", "Related Parties", "Balances", "RP Balances Exist", { dataType: "boolean", inputMode: "toggle", displayOrder: 3 }),
  v("directors_loan_exists", "Related Parties", "Transactions", "Directors Loan Exists", { dataType: "boolean", inputMode: "toggle", pakistanReference: "Companies Act 2017 s.182", displayOrder: 4 }),
  v("sponsor_transactions_exist", "Related Parties", "Transactions", "Sponsor Transactions Exist", { dataType: "boolean", inputMode: "toggle", displayOrder: 5 }),
  v("common_control_transactions_exist", "Related Parties", "Transactions", "Common Control Transactions", { dataType: "boolean", inputMode: "toggle", displayOrder: 6 }),
  v("arm_length_support_available", "Related Parties", "Evidence", "Arm's Length Support Available", { dataType: "boolean", inputMode: "toggle", standardReference: "ISA 550.A35", displayOrder: 7 }),
  v("disclosure_complete_flag", "Related Parties", "Disclosure", "RP Disclosure Complete", { dataType: "boolean", inputMode: "toggle", standardReference: "IAS 24", reviewRequiredFlag: RV, displayOrder: 8 }),

  // ═══════════════════════════════════════════════════════════════════════════
  // GROUP 14 — Laws & Regulations
  // ═══════════════════════════════════════════════════════════════════════════
  v("companies_act_applicable", "Laws & Regulations", "Applicable Laws", "Companies Act Applicable", { dataType: "boolean", inputMode: "toggle", defaultValue: "true", pakistanReference: "Companies Act 2017", displayOrder: 1 }),
  v("ifrs_applicable", "Laws & Regulations", "Standards", "IFRS Applicable", { dataType: "boolean", inputMode: "toggle", displayOrder: 2 }),
  v("ifrs_for_smes_applicable", "Laws & Regulations", "Standards", "IFRS for SMEs Applicable", { dataType: "boolean", inputMode: "toggle", displayOrder: 3 }),
  v("sector_regulator", "Laws & Regulations", "Regulators", "Sector Regulator", { dataType: "text", inputMode: "dropdown", dropdownOptionsJson: dd(["SECP","SBP","PTA","NEPRA","OGRA","PEMRA","PSX","None","Other"]), displayOrder: 4 }),
  v("sector_specific_compliance_required", "Laws & Regulations", "Compliance", "Sector-Specific Compliance Required", { dataType: "boolean", inputMode: "toggle", displayOrder: 5 }),
  v("licenses_required", "Laws & Regulations", "Licenses", "Licenses Required", { dataType: "boolean", inputMode: "toggle", displayOrder: 6 }),
  v("licenses_valid", "Laws & Regulations", "Licenses", "Licenses Valid", { dataType: "boolean", inputMode: "toggle", displayOrder: 7 }),
  v("legal_cases_exist", "Laws & Regulations", "Legal", "Legal Cases Exist", { dataType: "boolean", inputMode: "toggle", standardReference: "ISA 250", reviewRequiredFlag: RV, displayOrder: 8 }),
  v("contingent_liabilities_exist", "Laws & Regulations", "Legal", "Contingent Liabilities Exist", { dataType: "boolean", inputMode: "toggle", standardReference: "IAS 37", displayOrder: 9 }),
  v("non_compliance_with_laws_flag", "Laws & Regulations", "Compliance", "Non-Compliance with Laws", { dataType: "boolean", inputMode: "toggle", standardReference: "ISA 250", reviewRequiredFlag: RV, displayOrder: 10 }),

  // ═══════════════════════════════════════════════════════════════════════════
  // GROUP 15 — Audit Evidence & Confirmations
  // ═══════════════════════════════════════════════════════════════════════════
  v("external_confirmations_required", "Audit Evidence", "Confirmations", "External Confirmations Required", { dataType: "boolean", inputMode: "toggle", standardReference: "ISA 505", affectsWorkingPapersJson: ["confirmations"], displayOrder: 1 }),
  v("bank_confirmations_sent", "Audit Evidence", "Bank", "Bank Confirmations Sent", { dataType: "boolean", inputMode: "toggle", displayOrder: 2 }),
  v("bank_confirmations_received", "Audit Evidence", "Bank", "Bank Confirmations Received", { dataType: "boolean", inputMode: "toggle", displayOrder: 3 }),
  v("receivable_confirmations_sent", "Audit Evidence", "Receivables", "Receivable Confirmations Sent", { dataType: "boolean", inputMode: "toggle", displayOrder: 4 }),
  v("receivable_confirmations_received", "Audit Evidence", "Receivables", "Receivable Confirmations Received", { dataType: "boolean", inputMode: "toggle", displayOrder: 5 }),
  v("payable_confirmations_sent", "Audit Evidence", "Payables", "Payable Confirmations Sent", { dataType: "boolean", inputMode: "toggle", displayOrder: 6 }),
  v("payable_confirmations_received", "Audit Evidence", "Payables", "Payable Confirmations Received", { dataType: "boolean", inputMode: "toggle", displayOrder: 7 }),
  v("legal_letter_sent", "Audit Evidence", "Legal", "Legal Letter Sent", { dataType: "boolean", inputMode: "toggle", standardReference: "ISA 501", displayOrder: 8 }),
  v("legal_letter_received", "Audit Evidence", "Legal", "Legal Letter Received", { dataType: "boolean", inputMode: "toggle", displayOrder: 9 }),
  v("physical_verification_done", "Audit Evidence", "Physical", "Physical Verification Done", { dataType: "boolean", inputMode: "toggle", standardReference: "ISA 501.4", displayOrder: 10 }),
  v("management_representation_letter_received", "Audit Evidence", "MRL", "MRL Received", { dataType: "boolean", inputMode: "toggle", mandatoryFlag: M, standardReference: "ISA 580", displayOrder: 11 }),
  v("subsequent_events_review_done", "Audit Evidence", "Subsequent Events", "Subsequent Events Reviewed", { dataType: "boolean", inputMode: "toggle", standardReference: "ISA 560", displayOrder: 12 }),
  v("minutes_review_done", "Audit Evidence", "Minutes", "Minutes Review Done", { dataType: "boolean", inputMode: "toggle", displayOrder: 13 }),
  v("journal_testing_done", "Audit Evidence", "Journal Testing", "Journal Testing Done", { dataType: "boolean", inputMode: "toggle", standardReference: "ISA 240.32", displayOrder: 14 }),
  v("evidence_sufficiency_rating", "Audit Evidence", "Assessment", "Evidence Sufficiency Rating", { dataType: "text", inputMode: "pass_fail", dropdownOptionsJson: dd(["Sufficient","Insufficient"]), standardReference: "ISA 330.26", displayOrder: 15 }),
  v("evidence_appropriateness_rating", "Audit Evidence", "Assessment", "Evidence Appropriateness Rating", { dataType: "text", inputMode: "pass_fail", dropdownOptionsJson: dd(["Appropriate","Inappropriate"]), standardReference: "ISA 500.7", displayOrder: 16 }),

  // ═══════════════════════════════════════════════════════════════════════════
  // GROUP 16 — Going Concern
  // ═══════════════════════════════════════════════════════════════════════════
  v("going_concern_basis_used", "Going Concern", "Basis", "Going Concern Basis Used", { dataType: "boolean", inputMode: "toggle", defaultValue: "true", standardReference: "ISA 570", displayOrder: 1 }),
  v("gc_losses_flag", "Going Concern", "Indicators", "Recurring Losses", { dataType: "boolean", inputMode: "toggle", aiExtractableFlag: AI, displayOrder: 2 }),
  v("gc_negative_equity_flag", "Going Concern", "Indicators", "Negative Equity", { dataType: "boolean", inputMode: "toggle", aiExtractableFlag: AI, displayOrder: 3 }),
  v("gc_negative_operating_cashflows_flag", "Going Concern", "Indicators", "Negative Operating Cash Flows", { dataType: "boolean", inputMode: "toggle", aiExtractableFlag: AI, displayOrder: 4 }),
  v("gc_default_on_loans_flag", "Going Concern", "Indicators", "Default on Loans", { dataType: "boolean", inputMode: "toggle", displayOrder: 5 }),
  v("gc_overdue_liabilities_flag", "Going Concern", "Indicators", "Overdue Liabilities", { dataType: "boolean", inputMode: "toggle", displayOrder: 6 }),
  v("gc_management_plans_available", "Going Concern", "Management Plans", "Management Plans Available", { dataType: "boolean", inputMode: "toggle", standardReference: "ISA 570.16", displayOrder: 7 }),
  v("gc_financial_support_available", "Going Concern", "Support", "Financial Support Available", { dataType: "boolean", inputMode: "toggle", displayOrder: 8 }),
  v("gc_material_uncertainty_flag", "Going Concern", "Assessment", "Material Uncertainty", { dataType: "boolean", inputMode: "toggle", standardReference: "ISA 570.18", reviewRequiredFlag: RV, affectsWorkingPapersJson: ["reporting"], displayOrder: 9 }),
  v("gc_disclosure_adequate_flag", "Going Concern", "Disclosure", "GC Disclosure Adequate", { dataType: "boolean", inputMode: "toggle", standardReference: "ISA 570.20", displayOrder: 10 }),
  v("going_concern_conclusion", "Going Concern", "Conclusion", "Going Concern Conclusion", { dataType: "text", inputMode: "conclusion", dropdownOptionsJson: dd(["No Material Uncertainty","Material Uncertainty — Adequate Disclosure","Material Uncertainty — Inadequate Disclosure","Inappropriate Basis"]), standardReference: "ISA 570", reviewRequiredFlag: RV, displayOrder: 11 }),

  // ═══════════════════════════════════════════════════════════════════════════
  // GROUP 17 — Misstatements & Adjustments
  // ═══════════════════════════════════════════════════════════════════════════
  v("identified_misstatements_count", "Misstatements", "Identified", "Identified Misstatements Count", { dataType: "number", inputMode: "number", displayOrder: 1 }),
  v("identified_misstatements_value", "Misstatements", "Identified", "Identified Misstatements Value", { dataType: "number", inputMode: "currency", displayOrder: 2 }),
  v("corrected_misstatements_value", "Misstatements", "Corrected", "Corrected Misstatements Value", { dataType: "number", inputMode: "currency", displayOrder: 3 }),
  v("uncorrected_misstatements_value", "Misstatements", "Uncorrected", "Uncorrected Misstatements Value", { dataType: "number", inputMode: "currency", standardReference: "ISA 450.11", reviewRequiredFlag: RV, displayOrder: 4 }),
  v("clearly_trivial_items_value", "Misstatements", "Trivial", "Clearly Trivial Items Value", { dataType: "number", inputMode: "currency", standardReference: "ISA 450.A2", displayOrder: 5 }),
  v("proposed_adjusting_entries_count", "Misstatements", "Adjustments", "Proposed Adjustments Count", { dataType: "number", inputMode: "number", displayOrder: 6 }),
  v("passed_adjustments_count", "Misstatements", "Adjustments", "Passed Adjustments Count", { dataType: "number", inputMode: "number", displayOrder: 7 }),
  v("waived_adjustments_count", "Misstatements", "Adjustments", "Waived Adjustments Count", { dataType: "number", inputMode: "number", displayOrder: 8 }),
  v("misstatement_material_flag", "Misstatements", "Assessment", "Misstatements Material", { dataType: "boolean", inputMode: "toggle", standardReference: "ISA 450.11", reviewRequiredFlag: RV, displayOrder: 9 }),
  v("summary_of_uncorrected_misstatements_done", "Misstatements", "Summary", "Summary of Uncorrected Done", { dataType: "boolean", inputMode: "toggle", standardReference: "ISA 450.12", displayOrder: 10 }),

  // ═══════════════════════════════════════════════════════════════════════════
  // GROUP 18 — Completion & Reporting
  // ═══════════════════════════════════════════════════════════════════════════
  v("all_planned_procedures_completed", "Completion & Reporting", "Completion", "All Planned Procedures Completed", { dataType: "boolean", inputMode: "toggle", displayOrder: 1 }),
  v("review_completed", "Completion & Reporting", "Review", "Review Completed", { dataType: "boolean", inputMode: "toggle", standardReference: "ISA 220.30", displayOrder: 2 }),
  v("partner_review_completed", "Completion & Reporting", "Review", "Partner Review Completed", { dataType: "boolean", inputMode: "toggle", standardReference: "ISA 220.31", displayOrder: 3 }),
  v("eqcr_completed", "Completion & Reporting", "EQCR", "EQCR Completed", { dataType: "boolean", inputMode: "toggle", standardReference: "ISQM 2", displayOrder: 4 }),
  v("final_analytics_completed", "Completion & Reporting", "Final Analytics", "Final Analytics Completed", { dataType: "boolean", inputMode: "toggle", standardReference: "ISA 520.6", displayOrder: 5 }),
  v("subsequent_events_cleared", "Completion & Reporting", "Subsequent Events", "Subsequent Events Cleared", { dataType: "boolean", inputMode: "toggle", standardReference: "ISA 560", displayOrder: 6 }),
  v("contingencies_reviewed", "Completion & Reporting", "Contingencies", "Contingencies Reviewed", { dataType: "boolean", inputMode: "toggle", standardReference: "IAS 37", displayOrder: 7 }),
  v("going_concern_finalized", "Completion & Reporting", "Going Concern", "Going Concern Finalized", { dataType: "boolean", inputMode: "toggle", standardReference: "ISA 570", displayOrder: 8 }),
  v("mrl_signed", "Completion & Reporting", "MRL", "MRL Signed", { dataType: "boolean", inputMode: "toggle", mandatoryFlag: M, standardReference: "ISA 580", displayOrder: 9 }),
  v("fs_disclosures_reviewed", "Completion & Reporting", "Disclosures", "FS Disclosures Reviewed", { dataType: "boolean", inputMode: "toggle", displayOrder: 10 }),
  v("report_type", "Completion & Reporting", "Report", "Report Type", { dataType: "text", inputMode: "dropdown", dropdownOptionsJson: dd(["Independent Auditor's Report","Review Report","Compilation Report"]), mandatoryFlag: M, displayOrder: 11 }),
  v("audit_opinion", "Completion & Reporting", "Opinion", "Audit Opinion", { dataType: "text", inputMode: "conclusion", dropdownOptionsJson: dd(["Unmodified","Qualified","Adverse","Disclaimer"]), mandatoryFlag: M, standardReference: "ISA 700/705", reviewRequiredFlag: RV, displayOrder: 12 }),
  v("emphasis_of_matter_flag", "Completion & Reporting", "Paragraphs", "Emphasis of Matter", { dataType: "boolean", inputMode: "toggle", standardReference: "ISA 706", displayOrder: 13 }),
  v("other_matter_flag", "Completion & Reporting", "Paragraphs", "Other Matter", { dataType: "boolean", inputMode: "toggle", standardReference: "ISA 706", displayOrder: 14 }),
  v("key_audit_matters_flag", "Completion & Reporting", "KAM", "Key Audit Matters", { dataType: "boolean", inputMode: "toggle", standardReference: "ISA 701", displayOrder: 15 }),
  v("modified_opinion_basis", "Completion & Reporting", "Opinion", "Modified Opinion Basis", { dataType: "textarea", inputMode: "textarea", standardReference: "ISA 705", displayOrder: 16 }),
  v("reporting_framework_disclosed", "Completion & Reporting", "Disclosures", "Reporting Framework Disclosed", { dataType: "boolean", inputMode: "toggle", displayOrder: 17 }),
  v("report_date", "Completion & Reporting", "Dates", "Report Date", { dataType: "date", inputMode: "date", mandatoryFlag: M, displayOrder: 18 }),
  v("signing_partner_name", "Completion & Reporting", "Signatory", "Signing Partner Name", { dataType: "text", inputMode: "text", mandatoryFlag: M, displayOrder: 19 }),

  // ═══════════════════════════════════════════════════════════════════════════
  // GROUP 19 — Quality Control, Archiving & Inspection
  // ═══════════════════════════════════════════════════════════════════════════
  v("engagement_quality_objectives_met", "QC & Inspection", "Quality", "Quality Objectives Met", { dataType: "boolean", inputMode: "toggle", standardReference: "ISQM 1", displayOrder: 1 }),
  v("consultation_required", "QC & Inspection", "Consultation", "Consultation Required", { dataType: "boolean", inputMode: "toggle", displayOrder: 2 }),
  v("consultation_completed", "QC & Inspection", "Consultation", "Consultation Completed", { dataType: "boolean", inputMode: "toggle", displayOrder: 3 }),
  v("independence_reconfirmed", "QC & Inspection", "Independence", "Independence Reconfirmed", { dataType: "boolean", inputMode: "toggle", standardReference: "IESBA Code", displayOrder: 4 }),
  v("differences_of_opinion_flag", "QC & Inspection", "Issues", "Differences of Opinion", { dataType: "boolean", inputMode: "toggle", standardReference: "ISA 220.18", displayOrder: 5 }),
  v("archiving_due_date", "QC & Inspection", "Archiving", "Archiving Due Date", { dataType: "date", inputMode: "date", standardReference: "ISQM 1", displayOrder: 6 }),
  v("file_archived", "QC & Inspection", "Archiving", "File Archived", { dataType: "boolean", inputMode: "toggle", displayOrder: 7 }),
  v("archiving_completed_date", "QC & Inspection", "Archiving", "Archiving Completed Date", { dataType: "date", inputMode: "date", displayOrder: 8 }),
  v("inspection_ready_flag", "QC & Inspection", "Inspection", "Inspection Ready", { dataType: "boolean", inputMode: "toggle", displayOrder: 9 }),
  v("unresolved_review_notes_count", "QC & Inspection", "Open Items", "Unresolved Review Notes", { dataType: "number", inputMode: "number", displayOrder: 10 }),
  v("unresolved_exceptions_count", "QC & Inspection", "Open Items", "Unresolved Exceptions", { dataType: "number", inputMode: "number", displayOrder: 11 }),

  // ═══════════════════════════════════════════════════════════════════════════
  // GROUP 20 — Workflow & Sign-offs
  // ═══════════════════════════════════════════════════════════════════════════
  v("preparer_name", "Workflow & Sign-offs", "Preparer", "Preparer Name", { dataType: "text", inputMode: "text", displayOrder: 1 }),
  v("preparer_designation", "Workflow & Sign-offs", "Preparer", "Preparer Designation", { dataType: "text", inputMode: "text", displayOrder: 2 }),
  v("preparation_date", "Workflow & Sign-offs", "Preparer", "Preparation Date", { dataType: "date", inputMode: "date", displayOrder: 3 }),
  v("reviewer_name", "Workflow & Sign-offs", "Reviewer", "Reviewer Name", { dataType: "text", inputMode: "text", displayOrder: 4 }),
  v("reviewer_designation", "Workflow & Sign-offs", "Reviewer", "Reviewer Designation", { dataType: "text", inputMode: "text", displayOrder: 5 }),
  v("review_date", "Workflow & Sign-offs", "Reviewer", "Review Date", { dataType: "date", inputMode: "date", displayOrder: 6 }),
  v("approver_name", "Workflow & Sign-offs", "Approver", "Approver Name", { dataType: "text", inputMode: "text", displayOrder: 7 }),
  v("approver_designation", "Workflow & Sign-offs", "Approver", "Approver Designation", { dataType: "text", inputMode: "text", displayOrder: 8 }),
  v("approval_date", "Workflow & Sign-offs", "Approver", "Approval Date", { dataType: "date", inputMode: "date", displayOrder: 9 }),
  v("variable_pack_status", "Workflow & Sign-offs", "Status", "Variable Pack Status", { dataType: "text", inputMode: "status", dropdownOptionsJson: dd(["Draft","In Review","Reviewed","Locked","Reopened"]), defaultValue: "Draft", displayOrder: 10 }),
  v("variable_pack_locked", "Workflow & Sign-offs", "Status", "Variable Pack Locked", { dataType: "boolean", inputMode: "toggle", displayOrder: 11 }),
  v("lock_reason", "Workflow & Sign-offs", "Status", "Lock Reason", { dataType: "text", inputMode: "textarea", displayOrder: 12 }),
  v("reopen_reason", "Workflow & Sign-offs", "Status", "Reopen Reason", { dataType: "text", inputMode: "textarea", displayOrder: 13 }),
  v("current_stage", "Workflow & Sign-offs", "Progress", "Current Stage", { dataType: "text", inputMode: "status", dropdownOptionsJson: dd(["Upload","Extraction","Variables","Generation","Export","Completed"]), displayOrder: 14 }),
  v("current_substage", "Workflow & Sign-offs", "Progress", "Current Substage", { dataType: "text", inputMode: "text", displayOrder: 15 }),
];

export const VARIABLE_GROUPS = [
  "Entity & Constitution",
  "Ownership & Governance",
  "Engagement Acceptance",
  "Accounting & Records",
  "Trial Balance & COA",
  "Financial Statements",
  "Materiality",
  "Risk Assessment",
  "Internal Controls",
  "Sampling",
  "Analytical Procedures",
  "Tax & Compliance",
  "Related Parties",
  "Laws & Regulations",
  "Audit Evidence",
  "Going Concern",
  "Misstatements",
  "Completion & Reporting",
  "QC & Inspection",
  "Workflow & Sign-offs",
];

export const EXTRACTION_FIELD_TO_VARIABLE_MAP: Record<string, string> = {
  name: "entity_name",
  entity_name: "entity_name",
  company_name: "entity_name",
  ntn: "ntn",
  strn: "strn",
  secp_no: "secp_registration_no",
  incorporation_date: "incorporation_date",
  legal_form: "entity_legal_form",
  principal_activity: "principal_activity",
  industry: "industry_sector",
  registered_address: "registered_address",
  business_address: "business_address",
  financial_year_start: "financial_year_start",
  financial_year_end: "financial_year_end",
  period_start: "reporting_period_start",
  period_end: "reporting_period_end",
  currency: "functional_currency",
  framework: "reporting_framework",
  ceo: "ceo_name",
  cfo: "cfo_name",
  secretary: "company_secretary",
  authorized_capital: "authorized_capital",
  paid_up_capital: "paid_up_capital",
  share_capital: "share_capital",
  number_of_directors: "number_of_directors",
  total_assets: "cy_total_assets",
  non_current_assets: "cy_non_current_assets",
  current_assets: "cy_current_assets",
  fixed_assets: "cy_fixed_assets",
  intangible_assets: "cy_intangible_assets",
  investments: "cy_investments",
  inventory: "cy_inventory",
  trade_receivables: "cy_trade_receivables",
  cash_and_bank: "cy_cash_and_bank",
  total_equity: "cy_total_equity",
  retained_earnings: "cy_retained_earnings",
  total_liabilities: "cy_total_liabilities",
  non_current_liabilities: "cy_non_current_liabilities",
  current_liabilities: "cy_current_liabilities",
  long_term_borrowings: "cy_long_term_borrowings",
  trade_payables: "cy_trade_payables",
  revenue: "cy_revenue",
  cost_of_sales: "cy_cost_of_sales",
  gross_profit: "cy_gross_profit",
  admin_expenses: "cy_admin_expenses",
  selling_expenses: "cy_selling_distribution_expenses",
  finance_cost: "cy_finance_cost",
  other_income: "cy_other_income",
  profit_before_tax: "cy_profit_before_tax",
  net_profit_before_tax: "cy_profit_before_tax",
  tax_expense: "cy_tax_expense",
  net_profit: "cy_profit_after_tax",
  profit_after_tax: "cy_profit_after_tax",
  operating_cash_flow: "cy_operating_cash_flow",
  investing_cash_flow: "cy_investing_cash_flow",
  financing_cash_flow: "cy_financing_cash_flow",
  address: "registered_address",
  entity_type: "entity_legal_form",
  listed_status: "listed_status",
  engagement_type: "engagement_type",
  equity: "cy_total_equity",
  reserves: "cy_retained_earnings",
  operating_expenses: "cy_admin_expenses",
  operating_profit: "cy_operating_profit",
  prior_year_revenue: "py_revenue",
  prior_year_total_assets: "py_total_assets",
  prior_year_equity: "py_total_equity",
  prior_year_net_profit: "py_profit_after_tax",
  py_total_assets: "py_total_assets",
  py_revenue: "py_revenue",
  py_profit_before_tax: "py_profit_before_tax",
  py_profit_after_tax: "py_profit_after_tax",
  py_total_equity: "py_total_equity",
  output_tax: "sales_tax_output",
  input_tax: "sales_tax_input",
  net_sales_tax: "sales_tax_payable_or_refundable",
  wht_deducted: "withholding_tax_deducted",
  tax_period_from: "sales_tax_period_from",
  tax_period_to: "sales_tax_period_to",
  current_tax_provision: "current_tax_provision",
  advance_tax: "advance_tax",
  withholding_tax: "withholding_tax_deducted",
  sales_tax_input: "sales_tax_input",
  sales_tax_output: "sales_tax_output",
  sales_tax_payable: "sales_tax_payable_or_refundable",
  sales_tax_applicable: "sales_tax_applicable",
  income_tax_return_filed: "income_tax_return_filed",
  sales_tax_return_filed: "sales_tax_return_filed",
};

export const DEPENDENCY_RULES = [
  { trigger: "listed_status", condition: "listed_status === 'Listed'", impacts: ["eqcr_required"], wpImpacts: ["eqcr","reporting"] },
  { trigger: "public_interest_entity_flag", condition: "public_interest_entity_flag === 'true'", impacts: ["eqcr_required"], wpImpacts: ["eqcr","reporting"] },
  { trigger: "first_year_audit", condition: "first_year_audit === 'true'", impacts: [], wpImpacts: ["ob_verification"] },
  { trigger: "sales_tax_applicable", condition: "sales_tax_applicable === 'true'", impacts: ["sales_tax_input","sales_tax_output","sales_tax_payable_or_refundable"], wpImpacts: ["sales_tax_wp"] },
  { trigger: "related_parties_exist", condition: "related_parties_exist === 'true'", impacts: ["related_party_register_available","related_party_transactions_exist"], wpImpacts: ["related_parties"] },
  { trigger: "going_concern_risk_flag", condition: "going_concern_risk_flag === 'true'", impacts: ["gc_management_plans_available","gc_material_uncertainty_flag","going_concern_conclusion"], wpImpacts: ["going_concern"] },
  { trigger: "external_confirmations_required", condition: "external_confirmations_required === 'true'", impacts: ["bank_confirmations_sent","receivable_confirmations_sent"], wpImpacts: ["confirmations"] },
  { trigger: "controls_reliance_planned", condition: "controls_reliance_planned === 'true'", impacts: ["toc_planned","walkthrough_completed","controls_documented"], wpImpacts: ["controls_testing"] },
  { trigger: "audit_opinion", condition: "audit_opinion !== 'Unmodified'", impacts: ["modified_opinion_basis"], wpImpacts: ["reporting"] },
  { trigger: "materiality_basis_amount", condition: "materiality_basis_amount changed", impacts: ["overall_materiality_amount","performance_materiality_amount","trivial_threshold_amount"], wpImpacts: ["materiality_memo","planning_memo"] },
];
