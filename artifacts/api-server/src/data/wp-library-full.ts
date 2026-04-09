/**
 * FULL 274-WORKING-PAPER LIBRARY — ANA CA AUDIT SYSTEM
 * Pakistani ICAP / ISA-based audit working papers
 *
 * Controlling tags:
 *  applicableTo  — entity type tags (listed, pvt, smc, aop, bank, islamic_bank, modaraba, leasing,
 *                  insurance, ngo, public_sector, sme, gem, construction, llp, sole, branch)
 *  industry      — industry tags (manufacturing, trading, services, agriculture, it, real_estate,
 *                  energy, telecom, pharma, fmcg, textile, cement, chemical, sugar, steel)
 *  groupAuditOnly  — only for group / consolidated audits
 *  firstYearOnly   — only for first-time engagements
 *  itEnvRequired   — only where IT/ERP environment is present: ["erp","cloud","mixed"]
 *  taxRelevant     — requires active tax status (gst_registered, ntn_holder, strn_holder)
 *  specialCond     — special conditions required: going_concern, fraud_risk, related_party_heavy,
 *                    aml_risk, public_interest, donor_funded
 */

export type WpControlledBy = {
  groupAuditOnly?: boolean;
  firstYearOnly?: boolean;
  itEnvRequired?: string[];
  taxStatus?: string[];
  specialCond?: string[];
};

export type WpMeta = {
  name: string;
  isa: string;
  phase: string;
  riskLevel: string;
  assertions: string;
  fsArea: string;
  applicableTo?: string[];
  industry?: string[];
  controlledBy?: WpControlledBy;
  isCore?: boolean;
};

export const WP_LIBRARY: Record<string, WpMeta> = {

  // ══════════════════════════════════════════════════════════════════════════
  //  PHASE 1 — PRE-PLANNING  (PP-01 → PP-18)
  // ══════════════════════════════════════════════════════════════════════════
  "PP-01": { name: "Engagement Setup", isa: "ISA 210, ISA 220, ISA 300, ISA 315", phase: "Pre-Planning", riskLevel: "Medium", assertions: "N/A", fsArea: "Engagement Level", isCore: true },
  "PP-02": { name: "Entity Understanding", isa: "ISA 315", phase: "Pre-Planning", riskLevel: "Medium", assertions: "N/A", fsArea: "Engagement Level", isCore: true },
  "PP-03": { name: "Ethics & Independence", isa: "ISA 220, ISQM 1, ICAP Code of Ethics", phase: "Pre-Planning", riskLevel: "High", assertions: "N/A", fsArea: "Engagement Level", isCore: true },
  "PP-04": { name: "Acceptance & Continuance", isa: "ISA 210, ISA 220", phase: "Pre-Planning", riskLevel: "High", assertions: "N/A", fsArea: "Engagement Level", isCore: true },
  "PP-05": { name: "Engagement Letter", isa: "ISA 210", phase: "Pre-Planning", riskLevel: "Low", assertions: "N/A", fsArea: "Engagement Level", isCore: true },
  "PP-06": { name: "Completion & Sign-off", isa: "ISA 300", phase: "Pre-Planning", riskLevel: "Medium", assertions: "N/A", fsArea: "Engagement Level", isCore: true },
  "PP-07": { name: "Phase Summary", isa: "ISA 300, ISA 230", phase: "Pre-Planning", riskLevel: "Low", assertions: "N/A", fsArea: "Engagement Level", isCore: true },
  "PP-08": { name: "Client Acceptance Checklist", isa: "ISA 210, ISA 220, ISQM 1", phase: "Pre-Planning", riskLevel: "High", assertions: "N/A", fsArea: "Engagement Level", isCore: true },
  "PP-09": { name: "Independence Confirmation", isa: "ISA 220, ISQM 1, ICAP Code of Ethics", phase: "Pre-Planning", riskLevel: "High", assertions: "N/A", fsArea: "Engagement Level", isCore: true },
  "PP-10": { name: "Engagement Team Appointment & Briefing", isa: "ISA 220, ISA 300", phase: "Pre-Planning", riskLevel: "Medium", assertions: "N/A", fsArea: "Engagement Level", isCore: true },
  "PP-11": { name: "Initial Planning Meeting Minutes", isa: "ISA 300, ISA 315", phase: "Pre-Planning", riskLevel: "Medium", assertions: "N/A", fsArea: "Engagement Level", isCore: true },
  "PP-12": { name: "Understanding of Company Type Mapping", isa: "ISA 315, Companies Act 2017", phase: "Pre-Planning", riskLevel: "Medium", assertions: "N/A", fsArea: "Engagement Level", isCore: true },
  "PP-13": { name: "Applicable Regulatory Framework Mapping", isa: "ISA 250, ISA 315", phase: "Pre-Planning", riskLevel: "Medium", assertions: "N/A", fsArea: "Engagement Level", isCore: true },
  "PP-14": { name: "Predecessor Auditor Communication & WP Review", isa: "ISA 510, ISA 300", phase: "Pre-Planning", riskLevel: "High", assertions: "N/A", fsArea: "Engagement Level", controlledBy: { firstYearOnly: true } },
  "PP-15": { name: "Group Structure Mapping & Component Identification", isa: "ISA 300, ISA 600", phase: "Pre-Planning", riskLevel: "High", assertions: "C, E", fsArea: "Group Structure", controlledBy: { groupAuditOnly: true } },
  "PP-16": { name: "IT Environment Assessment — Initial Survey", isa: "ISA 315, ISA 402", phase: "Pre-Planning", riskLevel: "Medium", assertions: "N/A", fsArea: "IT Controls" },
  "PP-17": { name: "Specialist & Expert Requirements Identification", isa: "ISA 620, ISA 500", phase: "Pre-Planning", riskLevel: "Medium", assertions: "N/A", fsArea: "Engagement Level" },
  "PP-18": { name: "Initial Fraud Risk Assessment & Red Flags", isa: "ISA 240, ISA 315", phase: "Pre-Planning", riskLevel: "High", assertions: "N/A", fsArea: "Engagement Level" },

  // ══════════════════════════════════════════════════════════════════════════
  //  PHASE 2 — DATA INTAKE  (DI-01 → DI-20)
  // ══════════════════════════════════════════════════════════════════════════
  "DI-01": { name: "Upload & Data Intake", isa: "ISA 500", phase: "Data Intake", riskLevel: "Medium", assertions: "C, E", fsArea: "All FS Areas", isCore: true },
  "DI-02": { name: "Chart of Accounts Review & Classification", isa: "ISA 315, ISA 500", phase: "Data Intake", riskLevel: "Medium", assertions: "C, E, A", fsArea: "All FS Areas", isCore: true },
  "DI-03": { name: "General Ledger Download & Reconciliation", isa: "ISA 315, ISA 500", phase: "Data Intake", riskLevel: "Medium", assertions: "C, E, V", fsArea: "All FS Areas", isCore: true },
  "DI-04": { name: "FS Mapping", isa: "ISA 315, ISA 200", phase: "Data Intake", riskLevel: "Medium", assertions: "C, E, A, V", fsArea: "All FS Areas", isCore: true },
  "DI-05": { name: "Analytical Review", isa: "ISA 520", phase: "Data Intake", riskLevel: "High", assertions: "C, E, A, V, R", fsArea: "All FS Areas", isCore: true },
  "DI-06": { name: "Materiality Determination", isa: "ISA 320", phase: "Data Intake", riskLevel: "High", assertions: "N/A", fsArea: "Engagement Level", isCore: true },
  "DI-07": { name: "Risk Assessment", isa: "ISA 315", phase: "Data Intake", riskLevel: "High", assertions: "C, E, A, V, R, P", fsArea: "All FS Areas", isCore: true },
  "DI-08": { name: "Audit Population", isa: "ISA 500, ISA 530", phase: "Data Intake", riskLevel: "Medium", assertions: "C, E", fsArea: "All FS Areas", isCore: true },
  "DI-09": { name: "Sampling Design", isa: "ISA 530", phase: "Data Intake", riskLevel: "Medium", assertions: "C, E, V", fsArea: "All FS Areas", isCore: true },
  "DI-10": { name: "Confirmation Procedures", isa: "ISA 505", phase: "Data Intake", riskLevel: "High", assertions: "E, A", fsArea: "Receivables, Bank", isCore: true },
  "DI-11": { name: "Execution Datasets", isa: "ISA 500, ISA 330", phase: "Data Intake", riskLevel: "Medium", assertions: "C, E, V", fsArea: "All FS Areas", isCore: true },
  "DI-12": { name: "Reporting – Draft FS", isa: "ISA 700, ISA 200", phase: "Data Intake", riskLevel: "Medium", assertions: "P, R", fsArea: "Financial Statements", isCore: true },
  "DI-13": { name: "Data Intake Review Summary", isa: "ISA 300, ISA 230", phase: "Data Intake", riskLevel: "Low", assertions: "N/A", fsArea: "Engagement Level", isCore: true },
  "DI-14": { name: "TB Reconciliation to Draft Financial Statements", isa: "ISA 510, ISA 520", phase: "Data Intake", riskLevel: "High", assertions: "C, E, V", fsArea: "All FS Areas", isCore: true },
  "DI-15": { name: "Accounting Policy Review & Compliance Assessment", isa: "ISA 300, IAS 1, IAS 8", phase: "Data Intake", riskLevel: "Medium", assertions: "P, R", fsArea: "Financial Statements", isCore: true },
  "DI-16": { name: "Cut-off Testing & Period-end Accruals Overview", isa: "ISA 501, ISA 330", phase: "Data Intake", riskLevel: "High", assertions: "C, E, A", fsArea: "All FS Areas" },
  "DI-17": { name: "Foreign Currency Balances & Translation Review", isa: "IAS 21, ISA 330", phase: "Data Intake", riskLevel: "Medium", assertions: "V, C", fsArea: "All FS Areas" },
  "DI-18": { name: "Intercompany / Related Party Balances Initial Screen", isa: "ISA 550, ISA 315", phase: "Data Intake", riskLevel: "High", assertions: "C, E", fsArea: "All FS Areas" },
  "DI-19": { name: "Non-standard & Manual Journal Entries Pre-screen", isa: "ISA 240, ISA 315", phase: "Data Intake", riskLevel: "High", assertions: "C, E, V", fsArea: "All FS Areas" },
  "DI-20": { name: "Consolidation Entries Pre-screen", isa: "ISA 600, IFRS 10", phase: "Data Intake", riskLevel: "High", assertions: "C, E, V", fsArea: "Consolidated FS", controlledBy: { groupAuditOnly: true } },

  // ══════════════════════════════════════════════════════════════════════════
  //  PHASE 3 — INFORMATION REQUISITION  (IR-01 → IR-12)
  // ══════════════════════════════════════════════════════════════════════════
  "IR-01": { name: "IR Dashboard", isa: "ISA 230, ISA 500", phase: "Information Requisition", riskLevel: "Low", assertions: "C, E", fsArea: "All FS Areas", isCore: true },
  "IR-02": { name: "Request Register", isa: "ISA 500, ISA 230", phase: "Information Requisition", riskLevel: "Medium", assertions: "C, E", fsArea: "All FS Areas", isCore: true },
  "IR-03": { name: "Client Uploads", isa: "ISA 500, ISA 230", phase: "Information Requisition", riskLevel: "Medium", assertions: "C, E, V", fsArea: "All FS Areas", isCore: true },
  "IR-04": { name: "Procedures & Memos", isa: "ISA 230, ISA 300", phase: "Information Requisition", riskLevel: "Medium", assertions: "C, E", fsArea: "All FS Areas", isCore: true },
  "IR-05": { name: "Exceptions & Follow-ups", isa: "ISA 500, ISA 230", phase: "Information Requisition", riskLevel: "High", assertions: "C, E, V", fsArea: "All FS Areas", isCore: true },
  "IR-06": { name: "Conclusion & Sign-off", isa: "ISA 230, ISA 300", phase: "Information Requisition", riskLevel: "Low", assertions: "N/A", fsArea: "Engagement Level", isCore: true },
  "IR-07": { name: "Document Authenticity & Completeness Verification", isa: "ISA 500, ISA 240", phase: "Information Requisition", riskLevel: "High", assertions: "C, E, V", fsArea: "All FS Areas" },
  "IR-08": { name: "Bank Confirmation Letters Log & Follow-up", isa: "ISA 505, ISA 500", phase: "Information Requisition", riskLevel: "High", assertions: "E, A, V", fsArea: "Cash & Bank" },
  "IR-09": { name: "Legal Counsel Confirmation & Litigation Log", isa: "ISA 501, ISA 250", phase: "Information Requisition", riskLevel: "High", assertions: "C, E", fsArea: "Contingent Liabilities" },
  "IR-10": { name: "Management Inquiry & Inquiry Response Log", isa: "ISA 315, ISA 500", phase: "Information Requisition", riskLevel: "Medium", assertions: "C, E", fsArea: "All FS Areas" },
  "IR-11": { name: "Third-Party Confirmations Register", isa: "ISA 505, ISA 500", phase: "Information Requisition", riskLevel: "High", assertions: "E, A, C", fsArea: "Receivables, Payables" },
  "IR-12": { name: "Regulatory Filing Verification Log", isa: "ISA 250, ISA 500", phase: "Information Requisition", riskLevel: "Medium", assertions: "C, R", fsArea: "Compliance" },

  // ══════════════════════════════════════════════════════════════════════════
  //  PHASE 4 — OPENING BALANCE VERIFICATION  (OB-01 → OB-10)
  // ══════════════════════════════════════════════════════════════════════════
  "OB-01": { name: "OB Verification Dashboard", isa: "ISA 510", phase: "OB Verification", riskLevel: "High", assertions: "C, E, A", fsArea: "All Balance Sheet Items", isCore: true },
  "OB-02": { name: "OB Verification Procedures", isa: "ISA 510, ISA 500", phase: "OB Verification", riskLevel: "High", assertions: "C, E, A, V", fsArea: "All Balance Sheet Items", isCore: true },
  "OB-03": { name: "TB Verification", isa: "ISA 510, ISA 520", phase: "OB Verification", riskLevel: "High", assertions: "C, E, A, V", fsArea: "All Balance Sheet Items", isCore: true },
  "OB-04": { name: "OB Conclusion & Sign-off", isa: "ISA 510, ISA 230", phase: "OB Verification", riskLevel: "Medium", assertions: "N/A", fsArea: "Engagement Level", isCore: true },
  "OB-05": { name: "Predecessor WP Review & Audit File Handover", isa: "ISA 510, ISA 300", phase: "OB Verification", riskLevel: "High", assertions: "C, E, A", fsArea: "All Balance Sheet Items", controlledBy: { firstYearOnly: true } },
  "OB-06": { name: "Accounting Policy Changes Review", isa: "IAS 8, ISA 510, ISA 330", phase: "OB Verification", riskLevel: "Medium", assertions: "P, R, V", fsArea: "Financial Statements" },
  "OB-07": { name: "Restated & Reclassified Prior Year Balances Review", isa: "IAS 8, ISA 510, ISA 330", phase: "OB Verification", riskLevel: "High", assertions: "C, E, V", fsArea: "All Balance Sheet Items" },
  "OB-08": { name: "Opening Equity Reconciliation", isa: "ISA 510, ISA 330", phase: "OB Verification", riskLevel: "High", assertions: "C, E, V", fsArea: "Equity" },
  "OB-09": { name: "Prior Year Audit Adjustments Clearance", isa: "ISA 510, ISA 450", phase: "OB Verification", riskLevel: "High", assertions: "C, E, V", fsArea: "All Balance Sheet Items" },
  "OB-10": { name: "Going Concern Continuity Review (First Year)", isa: "ISA 570, ISA 510", phase: "OB Verification", riskLevel: "High", assertions: "N/A", fsArea: "Engagement Level", controlledBy: { firstYearOnly: true } },

  // ══════════════════════════════════════════════════════════════════════════
  //  PHASE 5 — PLANNING  (PL-01 → PL-32)
  // ══════════════════════════════════════════════════════════════════════════
  "PL-01": { name: "Financial Statements Overview", isa: "ISA 200, ISA 700", phase: "Planning", riskLevel: "Medium", assertions: "P, R", fsArea: "Financial Statements", isCore: true },
  "PL-02": { name: "Entity & Internal Controls", isa: "ISA 315, ISA 265", phase: "Planning", riskLevel: "High", assertions: "C, E, A, V, R, P", fsArea: "Entity Level", isCore: true },
  "PL-03": { name: "Risk Assessment", isa: "ISA 315, ISA 330, ISA 570", phase: "Planning", riskLevel: "High", assertions: "C, E, A, V, R, P", fsArea: "All FS Areas", isCore: true },
  "PL-04": { name: "Analytical Procedures", isa: "ISA 520", phase: "Planning", riskLevel: "High", assertions: "C, E, A, V, R", fsArea: "All FS Areas", isCore: true },
  "PL-05": { name: "Materiality", isa: "ISA 320, ISA 450", phase: "Planning", riskLevel: "High", assertions: "N/A", fsArea: "Engagement Level", isCore: true },
  "PL-06": { name: "Overall Audit Strategy & Approach", isa: "ISA 300", phase: "Planning", riskLevel: "Medium", assertions: "N/A", fsArea: "Engagement Level", isCore: true },
  "PL-07": { name: "Sampling Plan", isa: "ISA 530", phase: "Planning", riskLevel: "Medium", assertions: "C, E, V", fsArea: "All FS Areas", isCore: true },
  "PL-08": { name: "Audit Program", isa: "ISA 300, ISA 330", phase: "Planning", riskLevel: "High", assertions: "C, E, A, V, R, P", fsArea: "All FS Areas", isCore: true },
  "PL-09": { name: "Specialized Areas", isa: "ISA 550, ISA 540, ISA 600, ISA 620", phase: "Planning", riskLevel: "High", assertions: "C, E, A, V", fsArea: "Estimates, Related Parties, Group", isCore: true },
  "PL-10": { name: "TCWG Communication", isa: "ISA 260, ISA 265", phase: "Planning", riskLevel: "Medium", assertions: "N/A", fsArea: "Engagement Level", isCore: true },
  "PL-11": { name: "Quality Control", isa: "ISA 220, ISQM 1", phase: "Planning", riskLevel: "High", assertions: "N/A", fsArea: "Engagement Level", isCore: true },
  "PL-12": { name: "PSX / GEM Board Listing Compliance Planning", isa: "ISA 250, PSX Regulations", phase: "Planning", riskLevel: "High", assertions: "C, R", fsArea: "Engagement Level", applicableTo: ["listed", "gem"] },
  "PL-13": { name: "Code of Corporate Governance (CCG) 2019 Compliance Plan", isa: "ISA 250, CCG 2019", phase: "Planning", riskLevel: "High", assertions: "C, R", fsArea: "Engagement Level", applicableTo: ["listed"] },
  "PL-14": { name: "Single Member Company Specific Considerations", isa: "ISA 315, Companies Act 2017 s.2(1)(58A)", phase: "Planning", riskLevel: "Medium", assertions: "N/A", fsArea: "Engagement Level", applicableTo: ["smc"] },
  "PL-15": { name: "SBP Prudential Regulations Compliance Plan", isa: "ISA 250, SBP PRs", phase: "Planning", riskLevel: "High", assertions: "C, R", fsArea: "All FS Areas", applicableTo: ["bank", "islamic_bank"] },
  "PL-16": { name: "SECP NBFC / Leasing / Modaraba Compliance Plan", isa: "ISA 250, NBFC Rules 2003", phase: "Planning", riskLevel: "High", assertions: "C, R", fsArea: "All FS Areas", applicableTo: ["modaraba", "leasing"] },
  "PL-17": { name: "SECP Insurance Rules Compliance Plan", isa: "ISA 250, Insurance Rules 2017", phase: "Planning", riskLevel: "High", assertions: "C, R", fsArea: "All FS Areas", applicableTo: ["insurance"] },
  "PL-18": { name: "Partnership Act 1932 Compliance Plan", isa: "ISA 250, Partnership Act 1932", phase: "Planning", riskLevel: "Medium", assertions: "C, R", fsArea: "Engagement Level", applicableTo: ["aop"] },
  "PL-19": { name: "PSX / SECP Whistleblower & Vigilance Mechanism Review", isa: "ISA 250, PSX Regulations Ch.5", phase: "Planning", riskLevel: "High", assertions: "C", fsArea: "Compliance", applicableTo: ["listed"] },
  "PL-20": { name: "Dividend Distribution Risk Assessment", isa: "ISA 250, Companies Act 2017 s.83", phase: "Planning", riskLevel: "High", assertions: "V, R", fsArea: "Equity", applicableTo: ["listed", "pvt"] },
  "PL-21": { name: "SBP Banking Regulatory Compliance Risk", isa: "ISA 250, SBP PRs, BPRD", phase: "Planning", riskLevel: "High", assertions: "C, E, V", fsArea: "All FS Areas", applicableTo: ["bank", "islamic_bank"] },
  "PL-22": { name: "SECP NBFC / Leasing / Modaraba Regulatory Risk", isa: "ISA 250, NBFC Rules", phase: "Planning", riskLevel: "High", assertions: "C, V", fsArea: "All FS Areas", applicableTo: ["modaraba", "leasing"] },
  "PL-23": { name: "Insurance Compliance Risk Assessment", isa: "ISA 250, Insurance Ordinance 2000", phase: "Planning", riskLevel: "High", assertions: "C, V", fsArea: "All FS Areas", applicableTo: ["insurance"] },
  "PL-24": { name: "Partnership / AOP Unlimited Liability Risk", isa: "ISA 250, Partnership Act 1932", phase: "Planning", riskLevel: "Medium", assertions: "C, E", fsArea: "Liabilities", applicableTo: ["aop"] },
  "PL-25": { name: "IT Audit Planning & General IT Controls Assessment", isa: "ISA 315, ISA 402, COBIT", phase: "Planning", riskLevel: "High", assertions: "C, E", fsArea: "IT Controls" },
  "PL-26": { name: "Fraud Risk Assessment & Fraud Response Plan", isa: "ISA 240, ISA 315, ISA 330", phase: "Planning", riskLevel: "Significant", assertions: "C, E, V", fsArea: "All FS Areas" },
  "PL-27": { name: "Tax Compliance Risk Assessment (FBR / Provincial)", isa: "ISA 250, Income Tax Ordinance 2001, FBR", phase: "Planning", riskLevel: "High", assertions: "C, R", fsArea: "Tax Liabilities" },
  "PL-28": { name: "Anti-Money Laundering (AML/CFT) Compliance Plan", isa: "ISA 250, AML/CFT Regulations 2020", phase: "Planning", riskLevel: "High", assertions: "C, R", fsArea: "Compliance", applicableTo: ["bank", "islamic_bank", "modaraba", "insurance"] },
  "PL-29": { name: "Related Party Transactions Risk Assessment", isa: "ISA 550, ISA 315, IAS 24", phase: "Planning", riskLevel: "High", assertions: "C, E, V", fsArea: "Related Parties" },
  "PL-30": { name: "IPSAS / Public Sector Reporting Planning", isa: "ISA 250, IPSAS 1, IPSAS 17", phase: "Planning", riskLevel: "High", assertions: "C, V, R", fsArea: "Public Sector FS", applicableTo: ["public_sector"] },
  "PL-31": { name: "Environmental / ESG & Sustainability Reporting Considerations", isa: "ISA 720, ISA 250", phase: "Planning", riskLevel: "Medium", assertions: "P, R", fsArea: "Sustainability Disclosures" },
  "PL-32": { name: "Data Analytics Audit Approach Memo", isa: "ISA 315, ISA 330, ISA 500", phase: "Planning", riskLevel: "Medium", assertions: "N/A", fsArea: "Engagement Level" },

  // ══════════════════════════════════════════════════════════════════════════
  //  PHASE 6 — EXECUTION — GENERAL  (EX-01 → EX-10)
  // ══════════════════════════════════════════════════════════════════════════
  "EX-01": { name: "Planning Prerequisites", isa: "ISA 300, ISA 330", phase: "Execution", riskLevel: "Medium", assertions: "N/A", fsArea: "Engagement Level", isCore: true },
  "EX-02": { name: "ISA Compliance Status", isa: "ISA 200, ISA 500, ISA 330", phase: "Execution", riskLevel: "High", assertions: "C, E, A, V, R, P", fsArea: "All FS Areas", isCore: true },
  "EX-03": { name: "FS Head Working Papers Summary", isa: "ISA 330, ISA 500, ISA 501", phase: "Execution", riskLevel: "High", assertions: "C, E, A, V, R, P", fsArea: "All FS Areas", isCore: true },
  "EX-04": { name: "Journal Entry Testing", isa: "ISA 240, ISA 330", phase: "Execution", riskLevel: "Significant", assertions: "C, E, A, V", fsArea: "All FS Areas", isCore: true },
  "EX-05": { name: "Management Representations Working Paper", isa: "ISA 580, ISA 500", phase: "Execution", riskLevel: "High", assertions: "C, E, V", fsArea: "All FS Areas", isCore: true },
  "EX-06": { name: "TCWG Communications During Fieldwork", isa: "ISA 260, ISA 265", phase: "Execution", riskLevel: "Medium", assertions: "N/A", fsArea: "Engagement Level" },
  "EX-07": { name: "Audit Differences & Misstatements Schedule", isa: "ISA 450, ISA 330", phase: "Execution", riskLevel: "High", assertions: "C, E, V", fsArea: "All FS Areas", isCore: true },
  "EX-08": { name: "Contingent Liabilities Assessment", isa: "ISA 501, IAS 37, ISA 540", phase: "Execution", riskLevel: "High", assertions: "C, E, V", fsArea: "Contingent Liabilities" },
  "EX-09": { name: "Commitments & Contractual Obligations Review", isa: "ISA 501, IAS 37", phase: "Execution", riskLevel: "Medium", assertions: "C, E", fsArea: "Commitments" },
  "EX-10": { name: "Unusual & Complex Transactions Investigation", isa: "ISA 315, ISA 500, ISA 330", phase: "Execution", riskLevel: "High", assertions: "C, E, V", fsArea: "All FS Areas" },

  // ══════════════════════════════════════════════════════════════════════════
  //  PHASE 6 — EXECUTION — BALANCE SHEET  (EX-BS-01 → EX-BS-25)
  // ══════════════════════════════════════════════════════════════════════════
  "EX-BS-01": { name: "Cash and Bank – Confirmation & Reconciliation", isa: "ISA 330, ISA 500, ISA 501, ISA 505", phase: "Execution", riskLevel: "High", assertions: "E, A, V", fsArea: "Cash & Bank", isCore: true },
  "EX-BS-02": { name: "Inventory – Physical Count & Valuation", isa: "ISA 330, ISA 500, ISA 501", phase: "Execution", riskLevel: "High", assertions: "E, C, V, R", fsArea: "Inventories" },
  "EX-BS-03": { name: "Borrowings & Loans – Confirmation", isa: "ISA 330, ISA 500, ISA 501", phase: "Execution", riskLevel: "High", assertions: "C, E, A, V", fsArea: "Long Term Borrowings" },
  "EX-BS-04": { name: "PPE – Roll-Forward & Depreciation Test", isa: "ISA 330, ISA 500, ISA 501", phase: "Execution", riskLevel: "High", assertions: "E, C, A, V, R", fsArea: "PPE", isCore: true },
  "EX-BS-05": { name: "Trade Receivables – Confirmation & Aging", isa: "ISA 330, ISA 500, ISA 505", phase: "Execution", riskLevel: "High", assertions: "E, C, A, V, R", fsArea: "Trade Receivables" },
  "EX-BS-06": { name: "Trade and Other Payables – Confirmation & Reconciliation", isa: "ISA 330, ISA 500, ISA 501", phase: "Execution", riskLevel: "High", assertions: "C, E, A, V", fsArea: "Trade Payables" },
  "EX-BS-07": { name: "Biological Assets & Agriculture (IAS 41)", isa: "ISA 330, ISA 500, IAS 41", phase: "Execution", riskLevel: "High", assertions: "E, V", fsArea: "Biological Assets", applicableTo: ["construction"], industry: ["agriculture"] },
  "EX-BS-08": { name: "Islamic Financing Assets (Murabaha / Ijarah / Diminishing Musharaka)", isa: "ISA 330, ISA 500, AAOIFI", phase: "Execution", riskLevel: "High", assertions: "E, V, C", fsArea: "Islamic Finance Assets", applicableTo: ["islamic_bank"] },
  "EX-BS-09": { name: "Leasing Assets (Ijarah Muntahia Bittamleek)", isa: "ISA 330, ISA 500, IFRS 16", phase: "Execution", riskLevel: "High", assertions: "E, V, C", fsArea: "Leasing Assets", applicableTo: ["leasing"] },
  "EX-BS-10": { name: "Modaraba Specific Assets (Certificates / Sukuk / Mudaraba Funds)", isa: "ISA 330, ISA 500, Modaraba Rules", phase: "Execution", riskLevel: "High", assertions: "E, V", fsArea: "Modaraba Assets", applicableTo: ["modaraba"] },
  "EX-BS-11": { name: "Certificates of Investment / Sukuk Liabilities", isa: "ISA 330, ISA 500, AAOIFI", phase: "Execution", riskLevel: "High", assertions: "C, E, V", fsArea: "Islamic Liabilities", applicableTo: ["modaraba", "islamic_bank"] },
  "EX-BS-12": { name: "Insurance Policyholder Liabilities / Unearned Premium Reserve", isa: "ISA 330, ISA 540, IFRS 17", phase: "Execution", riskLevel: "High", assertions: "C, V, E", fsArea: "Insurance Liabilities", applicableTo: ["insurance"] },
  "EX-BS-13": { name: "Bank Customer Deposits / Current Accounts (SBP Prudential)", isa: "ISA 330, ISA 500, SBP PRs", phase: "Execution", riskLevel: "High", assertions: "C, E, V", fsArea: "Deposits", applicableTo: ["bank", "islamic_bank"] },
  "EX-BS-14": { name: "Intangible Assets & Goodwill Testing", isa: "ISA 330, IAS 38, IFRS 3, IAS 36", phase: "Execution", riskLevel: "High", assertions: "E, C, A, V", fsArea: "Intangible Assets" },
  "EX-BS-15": { name: "Investments in Subsidiaries, Associates & Joint Ventures", isa: "ISA 330, IAS 28, IAS 27, IFRS 11", phase: "Execution", riskLevel: "High", assertions: "E, V, C", fsArea: "Long-term Investments" },
  "EX-BS-16": { name: "Capital Work in Progress (CWIP) Review", isa: "ISA 330, IAS 16, ISA 500", phase: "Execution", riskLevel: "High", assertions: "E, C, V", fsArea: "CWIP" },
  "EX-BS-17": { name: "Long-term Deposits, Advances & Security Deposits", isa: "ISA 330, ISA 500", phase: "Execution", riskLevel: "Medium", assertions: "E, C, V", fsArea: "Long-term Deposits" },
  "EX-BS-18": { name: "Right-of-Use Assets & Lease Liabilities (IFRS 16)", isa: "ISA 330, IFRS 16, IAS 17", phase: "Execution", riskLevel: "High", assertions: "E, V, C, A", fsArea: "Right-of-Use Assets" },
  "EX-BS-19": { name: "Short-term Investments, Treasury Bills & PIBs", isa: "ISA 330, IFRS 9, SBP Rules", phase: "Execution", riskLevel: "High", assertions: "E, V, C", fsArea: "Short-term Investments" },
  "EX-BS-20": { name: "Advance Tax, Deferred Tax & Tax Refunds Due", isa: "ISA 330, IAS 12, ISA 250", phase: "Execution", riskLevel: "High", assertions: "E, V, C", fsArea: "Tax Assets" },
  "EX-BS-21": { name: "Accruals, Other Payables & Completeness Testing", isa: "ISA 330, ISA 500, ISA 501", phase: "Execution", riskLevel: "High", assertions: "C, E, A, V", fsArea: "Accruals & Payables" },
  "EX-BS-22": { name: "Deferred Tax Asset / Liability Testing", isa: "ISA 330, IAS 12, ISA 540", phase: "Execution", riskLevel: "High", assertions: "E, V, C", fsArea: "Deferred Tax" },
  "EX-BS-23": { name: "Revaluation Surplus & Revaluation Model Testing", isa: "ISA 330, IAS 16, IAS 40", phase: "Execution", riskLevel: "High", assertions: "V, C, E", fsArea: "Revaluation Surplus" },
  "EX-BS-24": { name: "Employees Provident Fund & Gratuity Testing", isa: "ISA 330, IAS 19, ISA 500", phase: "Execution", riskLevel: "High", assertions: "V, C, E", fsArea: "Staff Retirement Benefits" },
  "EX-BS-25": { name: "Defined Benefit Obligation — Actuarial Review", isa: "ISA 540, ISA 620, IAS 19", phase: "Execution", riskLevel: "High", assertions: "V, E, C", fsArea: "Defined Benefit Plans" },

  // ══════════════════════════════════════════════════════════════════════════
  //  PHASE 6 — EXECUTION — PROFIT & LOSS  (EX-PL-01 → EX-PL-14)
  // ══════════════════════════════════════════════════════════════════════════
  "EX-PL-01": { name: "Cost of Sales & Inventory Movement", isa: "ISA 330, ISA 500, ISA 501", phase: "Execution", riskLevel: "High", assertions: "C, E, A, V", fsArea: "Cost of Sales" },
  "EX-PL-02": { name: "Revenue Testing (IFRS 15)", isa: "ISA 330, ISA 500, ISA 240", phase: "Execution", riskLevel: "Significant", assertions: "C, E, A, V, R, P", fsArea: "Revenue", isCore: true },
  "EX-PL-03": { name: "Islamic Bank Income (Murabaha / Ijarah / Musharaka) Testing", isa: "ISA 330, ISA 500, AAOIFI", phase: "Execution", riskLevel: "High", assertions: "C, E, V", fsArea: "Islamic Income", applicableTo: ["islamic_bank"] },
  "EX-PL-04": { name: "Insurance Premium Revenue / Claims Expense Testing", isa: "ISA 330, ISA 500, IFRS 17", phase: "Execution", riskLevel: "High", assertions: "C, E, V, R", fsArea: "Insurance Revenue", applicableTo: ["insurance"] },
  "EX-PL-05": { name: "Finance Costs & Borrowing Costs (IAS 23) Testing", isa: "ISA 330, IAS 23, ISA 500", phase: "Execution", riskLevel: "High", assertions: "C, E, V", fsArea: "Finance Costs" },
  "EX-PL-06": { name: "Administrative & Operating Expenses Audit", isa: "ISA 330, ISA 500, ISA 501", phase: "Execution", riskLevel: "High", assertions: "C, E, V, A", fsArea: "Admin Expenses", isCore: true },
  "EX-PL-07": { name: "Payroll & Employee Benefits Verification", isa: "ISA 330, IAS 19, ISA 500", phase: "Execution", riskLevel: "High", assertions: "C, E, V", fsArea: "Payroll Expenses", isCore: true },
  "EX-PL-08": { name: "Depreciation & Amortization Verification", isa: "ISA 330, IAS 16, IAS 38", phase: "Execution", riskLevel: "High", assertions: "C, E, V, A", fsArea: "Depreciation" },
  "EX-PL-09": { name: "Other Income, Gains & Non-operating Items Testing", isa: "ISA 330, ISA 500, IFRS 15", phase: "Execution", riskLevel: "High", assertions: "C, E, V", fsArea: "Other Income" },
  "EX-PL-10": { name: "Other Expenses & Exceptional Items Testing", isa: "ISA 330, ISA 500", phase: "Execution", riskLevel: "Medium", assertions: "C, E, V", fsArea: "Other Expenses" },
  "EX-PL-11": { name: "Distribution & Selling Expenses Testing", isa: "ISA 330, ISA 500", phase: "Execution", riskLevel: "Medium", assertions: "C, E, V", fsArea: "Selling Expenses" },
  "EX-PL-12": { name: "Foreign Exchange Gains/Losses & Currency Testing", isa: "ISA 330, IAS 21, ISA 500", phase: "Execution", riskLevel: "High", assertions: "C, E, V", fsArea: "Forex Gains/Losses" },
  "EX-PL-13": { name: "Directors' Remuneration, Benefits & Perquisites", isa: "ISA 330, Companies Act 2017, ISA 550", phase: "Execution", riskLevel: "High", assertions: "C, E, V", fsArea: "Directors' Remuneration" },
  "EX-PL-14": { name: "Government Grants, Subsidies & Donations Testing", isa: "ISA 330, IAS 20, ISA 500", phase: "Execution", riskLevel: "High", assertions: "C, E, V, R", fsArea: "Grants & Subsidies" },

  // ══════════════════════════════════════════════════════════════════════════
  //  PHASE 6 — EXECUTION — INTERNAL CONTROLS  (EX-IC-01 → EX-IC-10)
  // ══════════════════════════════════════════════════════════════════════════
  "EX-IC-01": { name: "PSX Mandatory Internal Audit Function Review (CCG 2019)", isa: "ISA 610, CCG 2019", phase: "Execution", riskLevel: "High", assertions: "N/A", fsArea: "Internal Controls", applicableTo: ["listed"] },
  "EX-IC-02": { name: "SMC Director-Manager Segregation of Duties Assessment", isa: "ISA 315, Companies Act 2017 s.2(1)(58A)", phase: "Execution", riskLevel: "Medium", assertions: "N/A", fsArea: "Internal Controls", applicableTo: ["smc"] },
  "EX-IC-03": { name: "General IT Controls (GITC) Assessment", isa: "ISA 315, ISA 402, COBIT 2019", phase: "Execution", riskLevel: "High", assertions: "C, E", fsArea: "IT Controls" },
  "EX-IC-04": { name: "Application Controls Testing", isa: "ISA 315, ISA 402", phase: "Execution", riskLevel: "High", assertions: "C, E, V", fsArea: "IT Application Controls" },
  "EX-IC-05": { name: "Logical Access & User Privilege Controls Review", isa: "ISA 315, ISA 402", phase: "Execution", riskLevel: "High", assertions: "C", fsArea: "IT Access Controls" },
  "EX-IC-06": { name: "Change Management Controls Review", isa: "ISA 315, ISA 402", phase: "Execution", riskLevel: "High", assertions: "C, E", fsArea: "IT Change Controls" },
  "EX-IC-07": { name: "Business Continuity & Disaster Recovery Controls", isa: "ISA 315, ISA 402", phase: "Execution", riskLevel: "Medium", assertions: "C, E", fsArea: "IT Continuity Controls" },
  "EX-IC-08": { name: "Payroll Process Controls Assessment", isa: "ISA 315, ISA 265, ISA 330", phase: "Execution", riskLevel: "High", assertions: "C, E, V", fsArea: "Payroll Controls" },
  "EX-IC-09": { name: "Procurement-to-Pay (P2P) Process Controls", isa: "ISA 315, ISA 265, ISA 330", phase: "Execution", riskLevel: "High", assertions: "C, E, V", fsArea: "Purchase Controls" },
  "EX-IC-10": { name: "Order-to-Cash (O2C) Process Controls", isa: "ISA 315, ISA 265, ISA 330", phase: "Execution", riskLevel: "High", assertions: "C, E, V", fsArea: "Revenue Controls" },

  // ══════════════════════════════════════════════════════════════════════════
  //  PHASE 6 — EXECUTION — ESTIMATES  (EX-EST-01 → EX-EST-08)
  // ══════════════════════════════════════════════════════════════════════════
  "EX-EST-01": { name: "Insurance Actuarial Reserves (Life / Non-Life) Review", isa: "ISA 540, ISA 620, IFRS 17", phase: "Execution", riskLevel: "High", assertions: "V, E", fsArea: "Insurance Estimates", applicableTo: ["insurance"] },
  "EX-EST-02": { name: "Modaraba Management Fee & Profit Distribution Estimate", isa: "ISA 540, Modaraba Rules", phase: "Execution", riskLevel: "High", assertions: "V, C", fsArea: "Modaraba Estimates", applicableTo: ["modaraba"] },
  "EX-EST-03": { name: "Accounting Estimates Sensitivity Analysis", isa: "ISA 540, ISA 330", phase: "Execution", riskLevel: "High", assertions: "V, E, C", fsArea: "Accounting Estimates" },
  "EX-EST-04": { name: "Fair Value Measurements Review (IFRS 13)", isa: "ISA 540, IFRS 13, ISA 620", phase: "Execution", riskLevel: "High", assertions: "V, E, C", fsArea: "Fair Value Assets/Liabilities" },
  "EX-EST-05": { name: "Impairment Testing Review (IAS 36)", isa: "ISA 540, IAS 36, ISA 500", phase: "Execution", riskLevel: "High", assertions: "V, E, C", fsArea: "Non-current Assets" },
  "EX-EST-06": { name: "Warranty & Product Guarantee Provisions", isa: "ISA 540, IAS 37, ISA 500", phase: "Execution", riskLevel: "Medium", assertions: "C, E, V", fsArea: "Provisions" },
  "EX-EST-07": { name: "Litigation Claims & Legal Provisions", isa: "ISA 501, IAS 37, ISA 500", phase: "Execution", riskLevel: "High", assertions: "C, E, V", fsArea: "Legal Provisions" },
  "EX-EST-08": { name: "Environmental & Site Restoration Provisions", isa: "ISA 540, IAS 37, ISA 500", phase: "Execution", riskLevel: "High", assertions: "C, E, V", fsArea: "Environmental Provisions" },

  // ══════════════════════════════════════════════════════════════════════════
  //  PHASE 6 — EXECUTION — TAX  (EX-TAX-01 → EX-TAX-12)
  // ══════════════════════════════════════════════════════════════════════════
  "EX-TAX-01": { name: "Income Tax Reconciliation & Effective Rate Analysis", isa: "ISA 250, Income Tax Ordinance 2001, IAS 12", phase: "Execution", riskLevel: "High", assertions: "C, E, V", fsArea: "Income Tax" },
  "EX-TAX-02": { name: "Sales Tax (GST) Compliance Review", isa: "ISA 250, Sales Tax Act 1990, FBR SROs", phase: "Execution", riskLevel: "High", assertions: "C, R", fsArea: "Sales Tax Payable" },
  "EX-TAX-03": { name: "Withholding Tax (WHT) Compliance & Reconciliation", isa: "ISA 250, Income Tax Ordinance 2001", phase: "Execution", riskLevel: "High", assertions: "C, E, V", fsArea: "WHT Payable" },
  "EX-TAX-04": { name: "Super Tax Computation & Filing Verification", isa: "ISA 250, Finance Act 2022, ITO 2001 s.4C", phase: "Execution", riskLevel: "High", assertions: "C, V", fsArea: "Super Tax" },
  "EX-TAX-05": { name: "Advance Tax Installments & Adjustment Schedule", isa: "ISA 250, ITO 2001 s.147, s.147A", phase: "Execution", riskLevel: "Medium", assertions: "C, E, V", fsArea: "Advance Tax" },
  "EX-TAX-06": { name: "Provincial Sales Tax (PST) Compliance Review", isa: "ISA 250, Punjab Revenue Authority / SRB Acts", phase: "Execution", riskLevel: "High", assertions: "C, R", fsArea: "Provincial Tax" },
  "EX-TAX-07": { name: "Workers Welfare Fund (WWF) & Workers' Profit Participation Fund (WPPF)", isa: "ISA 250, WWF Ordinance 1971, Companies Profits (Workers' Participation) Act", phase: "Execution", riskLevel: "High", assertions: "C, E, V", fsArea: "Staff Obligations" },
  "EX-TAX-08": { name: "Tax Provisions, Contingent Tax Liabilities & Deferred Tax", isa: "ISA 540, IAS 12, ITO 2001", phase: "Execution", riskLevel: "High", assertions: "C, E, V", fsArea: "Tax Liabilities" },
  "EX-TAX-09": { name: "Transfer Pricing Documentation Review", isa: "ISA 250, OECD TP Guidelines, ITO 2001 s.108", phase: "Execution", riskLevel: "High", assertions: "C, V", fsArea: "Transfer Pricing", applicableTo: ["listed", "pvt"] },
  "EX-TAX-10": { name: "Tax Audit History & FBR Assessment Orders Review", isa: "ISA 250, ITO 2001, Sales Tax Act 1990", phase: "Execution", riskLevel: "High", assertions: "C, E", fsArea: "Tax Contingencies" },
  "EX-TAX-11": { name: "Minimum Tax / Alternate Corporate Tax (ACT) Computation", isa: "ISA 250, ITO 2001 s.113, s.113C", phase: "Execution", riskLevel: "High", assertions: "C, V", fsArea: "Minimum Tax" },
  "EX-TAX-12": { name: "Active Taxpayer List (ATL) Status & WHT Rate Verification", isa: "ISA 250, FBR ATL, ITO 2001", phase: "Execution", riskLevel: "Medium", assertions: "C, E", fsArea: "WHT Compliance" },

  // ══════════════════════════════════════════════════════════════════════════
  //  PHASE 6 — EXECUTION — RELATED PARTIES  (EX-RP-01 → EX-RP-06)
  // ══════════════════════════════════════════════════════════════════════════
  "EX-RP-01": { name: "Related Party Identification, Disclosure & Completeness", isa: "ISA 550, IAS 24, ISA 500", phase: "Execution", riskLevel: "High", assertions: "C, E, V", fsArea: "Related Parties" },
  "EX-RP-02": { name: "Loans To/From Directors & Associated Companies", isa: "ISA 550, Companies Act 2017 s.182, ISA 500", phase: "Execution", riskLevel: "High", assertions: "C, E, V", fsArea: "Directors' Loans" },
  "EX-RP-03": { name: "Intra-group Transactions & Eliminations Testing", isa: "ISA 550, ISA 600, IFRS 10", phase: "Execution", riskLevel: "High", assertions: "C, E, V", fsArea: "Intra-group", controlledBy: { groupAuditOnly: true } },
  "EX-RP-04": { name: "Management Fees, Service Charges & Royalties Review", isa: "ISA 550, IAS 24, ISA 500", phase: "Execution", riskLevel: "High", assertions: "C, E, V", fsArea: "Management Fees" },
  "EX-RP-05": { name: "Key Management Compensation & Benefits Disclosure", isa: "ISA 550, IAS 24, ISA 500", phase: "Execution", riskLevel: "High", assertions: "C, E, V", fsArea: "KMP Compensation" },
  "EX-RP-06": { name: "Beneficial Ownership Verification (SECP BO Regs 2018)", isa: "ISA 550, SECP BO Regulations 2018, Companies Act 2017", phase: "Execution", riskLevel: "High", assertions: "C, E", fsArea: "Ownership Disclosures" },

  // ══════════════════════════════════════════════════════════════════════════
  //  PHASE 6 — EXECUTION — PAYROLL  (EX-PAY-01 → EX-PAY-05)
  // ══════════════════════════════════════════════════════════════════════════
  "EX-PAY-01": { name: "Payroll Register Audit & Headcount Reconciliation", isa: "ISA 330, ISA 500, IAS 19", phase: "Execution", riskLevel: "High", assertions: "C, E, V", fsArea: "Payroll", isCore: true },
  "EX-PAY-02": { name: "EOBI & Social Security Contribution Compliance", isa: "ISA 250, EOBI Act 1976, Provincial SSO Acts", phase: "Execution", riskLevel: "High", assertions: "C, E, V", fsArea: "Staff Obligations" },
  "EX-PAY-03": { name: "Provident Fund Contribution Testing & Trust Compliance", isa: "ISA 250, Companies Act 2017, Income Tax Ordinance 2001", phase: "Execution", riskLevel: "High", assertions: "C, E, V", fsArea: "Provident Fund" },
  "EX-PAY-04": { name: "Gratuity Actuarial Computation & Liability Testing", isa: "ISA 540, IAS 19, ISA 620", phase: "Execution", riskLevel: "High", assertions: "V, C, E", fsArea: "Gratuity Liability" },
  "EX-PAY-05": { name: "Ghost Employee & Payroll Fraud Detection Procedures", isa: "ISA 240, ISA 315, ISA 500", phase: "Execution", riskLevel: "Significant", assertions: "C, E", fsArea: "Payroll Integrity" },

  // ══════════════════════════════════════════════════════════════════════════
  //  PHASE 6 — FS HEADS  (FH-01 → FH-06)
  // ══════════════════════════════════════════════════════════════════════════
  "FH-01": { name: "FS Heads – Execution Summary", isa: "ISA 330, ISA 500, ISA 501", phase: "FS Heads", riskLevel: "High", assertions: "C, E, A, V, R, P", fsArea: "All FS Areas", isCore: true },
  "FH-02": { name: "Statement of Financial Position — Sign-off", isa: "ISA 700, IAS 1", phase: "FS Heads", riskLevel: "High", assertions: "C, E, A, V, R", fsArea: "Balance Sheet", isCore: true },
  "FH-03": { name: "Statement of Comprehensive Income — Sign-off", isa: "ISA 700, IAS 1", phase: "FS Heads", riskLevel: "High", assertions: "C, E, A, V, R", fsArea: "P&L Statement", isCore: true },
  "FH-04": { name: "Statement of Cash Flows — Sign-off", isa: "ISA 700, IAS 7", phase: "FS Heads", riskLevel: "High", assertions: "C, E, A, V", fsArea: "Cash Flow Statement", isCore: true },
  "FH-05": { name: "Statement of Changes in Equity — Sign-off", isa: "ISA 700, IAS 1", phase: "FS Heads", riskLevel: "Medium", assertions: "C, E, V", fsArea: "Equity Statement", isCore: true },
  "FH-06": { name: "Notes to Financial Statements — Review Summary", isa: "ISA 700, ISA 720, IAS 1", phase: "FS Heads", riskLevel: "High", assertions: "P, R", fsArea: "FS Notes", isCore: true },

  // ══════════════════════════════════════════════════════════════════════════
  //  MODULE PAPERS  (M1 → M22)
  // ══════════════════════════════════════════════════════════════════════════
  "M1": { name: "Group Audit Instructions (ISA 600)", isa: "ISA 600", phase: "Planning", riskLevel: "High", assertions: "C, E, V", fsArea: "Group Audit", applicableTo: ["listed", "bank", "insurance"], controlledBy: { groupAuditOnly: true } },
  "M2": { name: "Component Auditor Review", isa: "ISA 600", phase: "Planning", riskLevel: "High", assertions: "C, E, V", fsArea: "Group Audit", applicableTo: ["listed", "bank", "insurance"], controlledBy: { groupAuditOnly: true } },
  "M3": { name: "Using the Work of Internal Audit (ISA 610)", isa: "ISA 610", phase: "Execution", riskLevel: "Medium", assertions: "N/A", fsArea: "Internal Audit", applicableTo: ["listed", "bank", "insurance"] },
  "M4": { name: "Using an Auditor's Expert (ISA 620)", isa: "ISA 620", phase: "Execution", riskLevel: "High", assertions: "V", fsArea: "Expert Reliance", applicableTo: ["bank", "insurance", "modaraba"] },
  "M5": { name: "Service Organization / SOC Review (ISA 402)", isa: "ISA 402", phase: "Execution", riskLevel: "Medium", assertions: "C, E", fsArea: "IT / Outsourced" },
  "M6": { name: "Opening Balances Review (ISA 510)", isa: "ISA 510", phase: "OB Verification", riskLevel: "High", assertions: "C, E, A", fsArea: "All Balance Sheet Items" },
  "M7": { name: "First-Year Audit Transition Memo", isa: "ISA 510, ISA 300", phase: "OB Verification", riskLevel: "High", assertions: "N/A", fsArea: "Engagement Level", controlledBy: { firstYearOnly: true } },
  "M8": { name: "Interim Review Procedures", isa: "ISA 330, ISRE 2410", phase: "Execution", riskLevel: "Medium", assertions: "C, E, V", fsArea: "All FS Areas" },
  "M9": { name: "Consolidation / Combined FS Review", isa: "ISA 600, IFRS 10", phase: "Finalization", riskLevel: "High", assertions: "C, E, V, P", fsArea: "Consolidated FS", applicableTo: ["listed", "bank"], controlledBy: { groupAuditOnly: true } },
  "M10": { name: "Donor / Grant / NGO Compliance WP", isa: "ISA 250, NGO Rules, SECP Reg", phase: "Execution", riskLevel: "High", assertions: "C, R", fsArea: "Grant Compliance", applicableTo: ["ngo"] },
  "M11": { name: "Public Sector / IPSAS Adjustments WP", isa: "ISA 250, IPSAS", phase: "Execution", riskLevel: "High", assertions: "C, V, R", fsArea: "Public Sector", applicableTo: ["public_sector"] },
  "M12": { name: "Construction / Long-term Contracts WP", isa: "ISA 330, IFRS 15.35", phase: "Execution", riskLevel: "High", assertions: "C, E, V, R", fsArea: "Revenue / WIP", applicableTo: ["construction"] },
  "M13": { name: "Capital Adequacy (CAR) & SBP Liquidity Ratios Testing", isa: "ISA 250, SBP PRs, Basel III", phase: "Execution", riskLevel: "High", assertions: "V, C", fsArea: "Regulatory Capital", applicableTo: ["bank", "islamic_bank", "insurance"] },
  "M14": { name: "Solvency & Statutory Fund Testing (SECP Insurance)", isa: "ISA 250, Insurance Ordinance 2000", phase: "Execution", riskLevel: "High", assertions: "V, C", fsArea: "Solvency", applicableTo: ["insurance"] },
  "M15": { name: "Modaraba Management Fee & Profit Distribution Schedule", isa: "ISA 540, Modaraba Companies Rules", phase: "Execution", riskLevel: "High", assertions: "V, C, R", fsArea: "Modaraba Distribution", applicableTo: ["modaraba"] },
  "M16": { name: "Simplified Materiality & Reduced Disclosure Framework", isa: "ISA 320, IFRS for SMEs", phase: "Execution", riskLevel: "Medium", assertions: "N/A", fsArea: "Engagement Level", applicableTo: ["gem", "sme"] },
  "M17": { name: "Anti-Bribery, FCPA & UNCAC Compliance Review", isa: "ISA 250, UNCAC, FCPA", phase: "Execution", riskLevel: "High", assertions: "C, R", fsArea: "Compliance" },
  "M18": { name: "KYC / AML / CFT Review (Financial Institutions)", isa: "ISA 250, AML/CFT Regulations 2020, FATF", phase: "Execution", riskLevel: "High", assertions: "C, R", fsArea: "AML Compliance", applicableTo: ["bank", "islamic_bank", "modaraba", "insurance"] },
  "M19": { name: "Cyber Security Risk & Control Assessment", isa: "ISA 315, ISA 402, NIST CSF", phase: "Execution", riskLevel: "High", assertions: "C, E", fsArea: "Cyber Security" },
  "M20": { name: "ESG / Sustainability Reporting Review", isa: "ISA 720, IFRS S1, IFRS S2", phase: "Execution", riskLevel: "Medium", assertions: "P, R", fsArea: "Sustainability Disclosures", applicableTo: ["listed"] },
  "M21": { name: "Transfer Pricing Local File & Master File Review", isa: "ISA 250, OECD TP Guidelines, ITO 2001 s.108", phase: "Execution", riskLevel: "High", assertions: "C, V", fsArea: "Transfer Pricing", applicableTo: ["listed", "pvt"] },
  "M22": { name: "PSX / SECP Additional Disclosure Compliance Check", isa: "ISA 250, PSX Regulations, Companies Act 2017", phase: "Execution", riskLevel: "High", assertions: "C, R", fsArea: "Disclosure Compliance", applicableTo: ["listed"] },

  // ══════════════════════════════════════════════════════════════════════════
  //  GOING CONCERN  (GC-01)
  // ══════════════════════════════════════════════════════════════════════════
  "GC-01": { name: "Going Concern Assessment (ISA 570)", isa: "ISA 570, IAS 1.25-26", phase: "Execution", riskLevel: "High", assertions: "N/A", fsArea: "Financial Statements", isCore: true },

  // ══════════════════════════════════════════════════════════════════════════
  //  EVIDENCE  (EV-01 → EV-08)
  // ══════════════════════════════════════════════════════════════════════════
  "EV-01": { name: "Evidence – Documents", isa: "ISA 500, ISA 230", phase: "Evidence", riskLevel: "High", assertions: "C, E, V", fsArea: "All FS Areas", isCore: true },
  "EV-02": { name: "Evidence – ISA 230 Checklist", isa: "ISA 230", phase: "Evidence", riskLevel: "High", assertions: "N/A", fsArea: "Engagement Level", isCore: true },
  "EV-03": { name: "Evidence – Stats & Links", isa: "ISA 500, ISA 330", phase: "Evidence", riskLevel: "Medium", assertions: "C, E, V", fsArea: "All FS Areas", isCore: true },
  "EV-04": { name: "Physical Evidence Inspection Log", isa: "ISA 500, ISA 501, ISA 230", phase: "Evidence", riskLevel: "High", assertions: "E, V", fsArea: "All FS Areas" },
  "EV-05": { name: "Auditor's Expert Evidence Assessment", isa: "ISA 500, ISA 620, ISA 230", phase: "Evidence", riskLevel: "High", assertions: "V, E", fsArea: "Expert Evidence" },
  "EV-06": { name: "IT-generated Evidence Reliability Assessment", isa: "ISA 500, ISA 315, ISA 402", phase: "Evidence", riskLevel: "High", assertions: "C, E", fsArea: "IT Evidence" },
  "EV-07": { name: "Contradictory Evidence Investigation", isa: "ISA 500, ISA 330, ISA 240", phase: "Evidence", riskLevel: "Significant", assertions: "C, E, V", fsArea: "All FS Areas" },
  "EV-08": { name: "Management Representations as Audit Evidence", isa: "ISA 500, ISA 580, ISA 230", phase: "Evidence", riskLevel: "High", assertions: "C, E", fsArea: "All FS Areas", isCore: true },

  // ══════════════════════════════════════════════════════════════════════════
  //  FINALIZATION  (FN-01 → FN-18)
  // ══════════════════════════════════════════════════════════════════════════
  "FN-01": { name: "Finalization – Adjusted Financial Statements", isa: "ISA 700, ISA 450", phase: "Finalization", riskLevel: "High", assertions: "P, R, V", fsArea: "Financial Statements", isCore: true },
  "FN-02": { name: "Finalization – Subsequent Events", isa: "ISA 560", phase: "Finalization", riskLevel: "High", assertions: "C, E", fsArea: "Post Balance Sheet", isCore: true },
  "FN-03": { name: "Finalization – Going Concern", isa: "ISA 570", phase: "Finalization", riskLevel: "Significant", assertions: "N/A", fsArea: "Engagement Level", isCore: true },
  "FN-04": { name: "Finalization – Completion Checklist", isa: "ISA 500, ISA 580, ISA 220", phase: "Finalization", riskLevel: "High", assertions: "N/A", fsArea: "Engagement Level", isCore: true },
  "FN-05": { name: "Finalization – Audit Summary Memorandum", isa: "ISA 700, ISA 220", phase: "Finalization", riskLevel: "High", assertions: "N/A", fsArea: "Engagement Level", isCore: true },
  "FN-06": { name: "Finalization – Notes & Disclosures", isa: "ISA 700, ISA 720", phase: "Finalization", riskLevel: "High", assertions: "P, R", fsArea: "Financial Statements", isCore: true },
  "FN-07": { name: "PSX Listing Regulations Compliance (Ch. 5, 7, 9, 13)", isa: "ISA 250, PSX Regulations", phase: "Finalization", riskLevel: "High", assertions: "C, R", fsArea: "Compliance", applicableTo: ["listed"] },
  "FN-08": { name: "SBP Prudential Regulations for Banks / DFIs", isa: "ISA 250, SBP PRs", phase: "Finalization", riskLevel: "High", assertions: "C, V", fsArea: "Regulatory Compliance", applicableTo: ["bank", "islamic_bank"] },
  "FN-09": { name: "SECP NBFC / Leasing / Modaraba Regulations", isa: "ISA 250, NBFC Rules 2003", phase: "Finalization", riskLevel: "High", assertions: "C, V", fsArea: "Regulatory Compliance", applicableTo: ["modaraba", "leasing"] },
  "FN-10": { name: "SECP Insurance Rules 2017", isa: "ISA 250, Insurance Rules 2017", phase: "Finalization", riskLevel: "High", assertions: "C, V", fsArea: "Regulatory Compliance", applicableTo: ["insurance"] },
  "FN-11": { name: "GEM Board Listing Conditions & Continuous Compliance", isa: "ISA 250, GEM Board Rules", phase: "Finalization", riskLevel: "Medium", assertions: "C, R", fsArea: "Compliance", applicableTo: ["gem"] },
  "FN-12": { name: "Partnership Act 1932 Compliance", isa: "ISA 250, Partnership Act 1932", phase: "Finalization", riskLevel: "Medium", assertions: "C", fsArea: "Compliance", applicableTo: ["aop"] },
  "FN-13": { name: "Summary of Audit Differences & Posting Decisions", isa: "ISA 450, ISA 330", phase: "Finalization", riskLevel: "High", assertions: "C, E, V", fsArea: "All FS Areas", isCore: true },
  "FN-14": { name: "Communication of Deficiencies to Management / TCWG", isa: "ISA 265, ISA 260, ISA 330", phase: "Finalization", riskLevel: "High", assertions: "N/A", fsArea: "Engagement Level", isCore: true },
  "FN-15": { name: "Final Risk Assessment & Audit Conclusion Update", isa: "ISA 330, ISA 315", phase: "Finalization", riskLevel: "High", assertions: "N/A", fsArea: "Engagement Level", isCore: true },
  "FN-16": { name: "Pre-sign-off Partner Review Checklist", isa: "ISA 220, ISQM 1", phase: "Finalization", riskLevel: "High", assertions: "N/A", fsArea: "Engagement Level", isCore: true },
  "FN-17": { name: "Analytical Procedures at Conclusion", isa: "ISA 520, ISA 700", phase: "Finalization", riskLevel: "High", assertions: "C, E, V, R", fsArea: "All FS Areas", isCore: true },
  "FN-18": { name: "Final Independence & Ethical Compliance Confirmation", isa: "ISA 220, ISQM 1, ICAP Code of Ethics", phase: "Finalization", riskLevel: "High", assertions: "N/A", fsArea: "Engagement Level", isCore: true },

  // ══════════════════════════════════════════════════════════════════════════
  //  DELIVERABLES  (DL-01 → DL-12)
  // ══════════════════════════════════════════════════════════════════════════
  "DL-01": { name: "Deliverables – Auditor's Report", isa: "ISA 700, ISA 705, ISA 706", phase: "Deliverables", riskLevel: "High", assertions: "N/A", fsArea: "Engagement Level", isCore: true },
  "DL-02": { name: "Deliverables – Export Package", isa: "ISA 230", phase: "Deliverables", riskLevel: "Low", assertions: "N/A", fsArea: "Engagement Level", isCore: true },
  "DL-03": { name: "Management Representation Letter", isa: "ISA 580", phase: "Deliverables", riskLevel: "High", assertions: "N/A", fsArea: "Engagement Level", isCore: true },
  "DL-04": { name: "SMC Member Representation Letter (Single Person)", isa: "ISA 580, Companies Act 2017", phase: "Deliverables", riskLevel: "High", assertions: "N/A", fsArea: "Engagement Level", applicableTo: ["smc"] },
  "DL-05": { name: "Partnership / AOP Representation from All Partners", isa: "ISA 580, Partnership Act 1932", phase: "Deliverables", riskLevel: "High", assertions: "N/A", fsArea: "Engagement Level", applicableTo: ["aop"] },
  "DL-06": { name: "Draft Audit Report (Unmodified / Modified)", isa: "ISA 700, ISA 705, ISA 706", phase: "Deliverables", riskLevel: "High", assertions: "N/A", fsArea: "Engagement Level", isCore: true },
  "DL-07": { name: "PSX / SECP Specified Audit Report Format", isa: "ISA 700, PSX Regulations", phase: "Deliverables", riskLevel: "High", assertions: "N/A", fsArea: "Engagement Level", applicableTo: ["listed"] },
  "DL-08": { name: "Report on Internal Control Weaknesses (Management Letter)", isa: "ISA 265, ISA 260, ISA 230", phase: "Deliverables", riskLevel: "High", assertions: "N/A", fsArea: "Engagement Level" },
  "DL-09": { name: "Long-form Report / Detailed Audit Report", isa: "ISA 700, ISA 706, SBP/SECP Requirements", phase: "Deliverables", riskLevel: "High", assertions: "N/A", fsArea: "Engagement Level", applicableTo: ["bank", "islamic_bank", "insurance"] },
  "DL-10": { name: "Agreed-Upon Procedures Report (ISRS 4400)", isa: "ISRS 4400, ISA 230", phase: "Deliverables", riskLevel: "Medium", assertions: "N/A", fsArea: "Engagement Level" },
  "DL-11": { name: "Certificate of Compliance (Regulatory Authority)", isa: "ISA 250, ISA 230", phase: "Deliverables", riskLevel: "High", assertions: "N/A", fsArea: "Engagement Level", applicableTo: ["bank", "insurance", "listed"] },
  "DL-12": { name: "Group Auditor Communication to Component Auditor", isa: "ISA 600, ISA 230", phase: "Deliverables", riskLevel: "High", assertions: "N/A", fsArea: "Group Audit", controlledBy: { groupAuditOnly: true } },

  // ══════════════════════════════════════════════════════════════════════════
  //  SECP / REGULATORY  (SECP-F29, SECP-FA, CCG-01, REG-01 → REG-05)
  // ══════════════════════════════════════════════════════════════════════════
  "SECP-F29": { name: "SECP Form 29 Compliance Review", isa: "Companies Act 2017 s.155, SECP BO Regulations 2018", phase: "Evidence & Finalization", riskLevel: "Medium", assertions: "C, E", fsArea: "Governance / Directors" },
  "SECP-FA": { name: "SECP Form A (Annual Return) Compliance", isa: "Companies Act 2017 s.130, SECP Regulations", phase: "Evidence & Finalization", riskLevel: "Medium", assertions: "C, E, P", fsArea: "Governance / Share Register" },
  "CCG-01": { name: "CCG 2019 Corporate Governance Checklist", isa: "CCG 2019 (SECP), Companies Act 2017 s.192", phase: "Evidence & Finalization", riskLevel: "Medium", assertions: "C, E, P", fsArea: "Governance", applicableTo: ["listed", "gem"] },
  "REG-01": { name: "Companies Act 2017 Annual Compliance Checklist", isa: "ISA 250, Companies Act 2017", phase: "Evidence & Finalization", riskLevel: "Medium", assertions: "C, R", fsArea: "Corporate Compliance" },
  "REG-02": { name: "FBR Tax Audit Response & Coordination WP", isa: "ISA 250, ITO 2001, Sales Tax Act 1990", phase: "Execution", riskLevel: "High", assertions: "C, E", fsArea: "Tax Audit Response" },
  "REG-03": { name: "PPRA / Public Procurement Compliance Review", isa: "ISA 250, PPRA Rules 2004", phase: "Execution", riskLevel: "High", assertions: "C, R", fsArea: "Procurement Compliance", applicableTo: ["public_sector"] },
  "REG-04": { name: "Environmental Compliance Review (PEPA 1997)", isa: "ISA 250, PEPA 1997, NEQs", phase: "Execution", riskLevel: "Medium", assertions: "C, R", fsArea: "Environmental Compliance", industry: ["manufacturing", "energy", "chemical", "cement"] },
  "REG-05": { name: "Pakistan Labour Laws Compliance Review", isa: "ISA 250, Factories Act 1934, Industrial Relations Act", phase: "Execution", riskLevel: "Medium", assertions: "C, R", fsArea: "Labour Compliance" },

  // ══════════════════════════════════════════════════════════════════════════
  //  EQCR / QUALITY REVIEW  (QR-01 → QR-04)
  // ══════════════════════════════════════════════════════════════════════════
  "QR-01": { name: "EQCR Checklist", isa: "ISA 220, ISQM 2", phase: "QR (EQCR)", riskLevel: "High", assertions: "N/A", fsArea: "Engagement Level", isCore: true },
  "QR-02": { name: "EQCR – AI Summary", isa: "ISA 220", phase: "QR (EQCR)", riskLevel: "Medium", assertions: "N/A", fsArea: "Engagement Level", isCore: true },
  "QR-03": { name: "EQCR – Partner Comments", isa: "ISA 220, ISQM 2", phase: "QR (EQCR)", riskLevel: "High", assertions: "N/A", fsArea: "Engagement Level", isCore: true },
  "QR-04": { name: "EQCR – Signed Reports", isa: "ISA 700, ISA 220", phase: "QR (EQCR)", riskLevel: "High", assertions: "N/A", fsArea: "Engagement Level", isCore: true },

  // ══════════════════════════════════════════════════════════════════════════
  //  INSPECTION  (IN-01 → IN-04)
  // ══════════════════════════════════════════════════════════════════════════
  "IN-01": { name: "Inspection – Archive", isa: "ISQM 1, ISA 230", phase: "Inspection", riskLevel: "Medium", assertions: "N/A", fsArea: "Engagement Level", isCore: true },
  "IN-02": { name: "Inspection – Sign-off Status", isa: "ISA 220, ISQM 1", phase: "Inspection", riskLevel: "Medium", assertions: "N/A", fsArea: "Engagement Level", isCore: true },
  "IN-03": { name: "Inspection – Phase Completion Summary", isa: "ISQM 1", phase: "Inspection", riskLevel: "Medium", assertions: "N/A", fsArea: "Engagement Level", isCore: true },
  "IN-04": { name: "Inspection – Risk & Audit Matters", isa: "ISA 315, ISA 330, ISQM 1", phase: "Inspection", riskLevel: "High", assertions: "N/A", fsArea: "Engagement Level", isCore: true },

  // ══════════════════════════════════════════════════════════════════════════
  //  ADDITIONAL BALANCE SHEET ITEMS  (EX-BS-26 → EX-BS-27)
  // ══════════════════════════════════════════════════════════════════════════
  "EX-BS-26": { name: "Stores, Spares & Loose Tools Inventory (Manufacturing)", isa: "ISA 330, ISA 500, IAS 2", phase: "Execution", riskLevel: "High", assertions: "E, C, V", fsArea: "Stores & Spares", industry: ["manufacturing", "energy", "textile", "cement", "chemical", "sugar", "steel"] },
  "EX-BS-27": { name: "Investment Property Testing & Fair Value (IAS 40)", isa: "ISA 330, IAS 40, IFRS 13, ISA 540", phase: "Execution", riskLevel: "High", assertions: "E, V, C", fsArea: "Investment Property" },

  // ══════════════════════════════════════════════════════════════════════════
  //  ADDITIONAL P&L ITEMS  (EX-PL-15 → EX-PL-16)
  // ══════════════════════════════════════════════════════════════════════════
  "EX-PL-15": { name: "Research & Development Costs Testing (IAS 38)", isa: "ISA 330, IAS 38, ISA 500", phase: "Execution", riskLevel: "High", assertions: "C, E, V", fsArea: "R&D Expenses", industry: ["pharma", "it", "manufacturing", "chemical"] },
  "EX-PL-16": { name: "Finance Lease Income / Ijarah Rentals (IFRS 16)", isa: "ISA 330, IFRS 16, ISA 500", phase: "Execution", riskLevel: "High", assertions: "C, E, V", fsArea: "Lease Income", applicableTo: ["leasing", "bank", "islamic_bank"] },

  // ══════════════════════════════════════════════════════════════════════════
  //  ADDITIONAL INTERNAL CONTROLS  (EX-IC-11)
  // ══════════════════════════════════════════════════════════════════════════
  "EX-IC-11": { name: "Segregation of Duties Matrix Assessment", isa: "ISA 315, ISA 265, ISA 330", phase: "Execution", riskLevel: "High", assertions: "C, E", fsArea: "Segregation of Duties" },

  // ══════════════════════════════════════════════════════════════════════════
  //  ADDITIONAL FS HEADS  (FH-07)
  // ══════════════════════════════════════════════════════════════════════════
  "FH-07": { name: "Component / Subsidiary FS Summary Review", isa: "ISA 600, ISA 330, ISA 700", phase: "FS Heads", riskLevel: "High", assertions: "C, E, V", fsArea: "Component FS", controlledBy: { groupAuditOnly: true } },

  // ══════════════════════════════════════════════════════════════════════════
  //  ADDITIONAL INSPECTION  (IN-05)
  // ══════════════════════════════════════════════════════════════════════════
  "IN-05": { name: "Inspection – Final File Assembly & Archiving", isa: "ISQM 1, ISA 230", phase: "Inspection", riskLevel: "Medium", assertions: "N/A", fsArea: "Engagement Level", isCore: true },

  // ══════════════════════════════════════════════════════════════════════════
  //  ADDITIONAL QR  (QR-05)
  // ══════════════════════════════════════════════════════════════════════════
  "QR-05": { name: "EQCR – Final Independence & Ethics Review", isa: "ISA 220, ISQM 1, ISQM 2", phase: "QR (EQCR)", riskLevel: "High", assertions: "N/A", fsArea: "Engagement Level", isCore: true },

  // ══════════════════════════════════════════════════════════════════════════
  //  ADDITIONAL DELIVERABLE  (DL-13)
  // ══════════════════════════════════════════════════════════════════════════
  "DL-13": { name: "Digital / Electronic Audit File Export & Closure", isa: "ISA 230, ISQM 1", phase: "Deliverables", riskLevel: "Low", assertions: "N/A", fsArea: "Engagement Level", isCore: true },

  // ══════════════════════════════════════════════════════════════════════════
  //  ADDITIONAL EVIDENCE  (EV-09)
  // ══════════════════════════════════════════════════════════════════════════
  "EV-09": { name: "Digital Evidence & E-signature Validation", isa: "ISA 500, ISA 315, ISA 230", phase: "Evidence", riskLevel: "High", assertions: "C, E", fsArea: "Digital Evidence" },
};

/** Returns total count of papers in the library */
export const WP_LIBRARY_COUNT = Object.keys(WP_LIBRARY).length;

export const WP_CATEGORIES: { key: string; name: string }[] = [
  { key: "A", name: "Pre-Planning & Engagement Acceptance" },
  { key: "B", name: "Planning, Strategy & Materiality" },
  { key: "C", name: "Risk Assessment" },
  { key: "D", name: "Analytical Procedures" },
  { key: "E", name: "Internal Controls" },
  { key: "F", name: "Substantive: Assets" },
  { key: "G", name: "Substantive: Liabilities & Equity" },
  { key: "H", name: "Substantive: Profit & Loss" },
  { key: "I", name: "Taxation" },
  { key: "J", name: "Estimates, Judgments & Fair Value" },
  { key: "K", name: "Related Parties & Compliance" },
  { key: "L", name: "Audit Evidence & Misstatements" },
  { key: "M", name: "Completion Procedures" },
  { key: "N", name: "Reporting & Opinion" },
  { key: "O", name: "Quality Control & EQCR" },
  { key: "P", name: "Archiving & File Closure" },
  { key: "Q", name: "Specialized / Conditional Templates" },
];

const ASSET_BS_CODES = new Set([
  "EX-BS-01", "EX-BS-02", "EX-BS-04", "EX-BS-05", "EX-BS-07", "EX-BS-08",
  "EX-BS-09", "EX-BS-10", "EX-BS-14", "EX-BS-15", "EX-BS-16", "EX-BS-17",
  "EX-BS-18", "EX-BS-19", "EX-BS-20", "EX-BS-26", "EX-BS-27",
]);
const LIABILITY_BS_CODES = new Set([
  "EX-BS-03", "EX-BS-06", "EX-BS-11", "EX-BS-12", "EX-BS-13",
  "EX-BS-21", "EX-BS-22", "EX-BS-23", "EX-BS-24", "EX-BS-25",
]);

export function wpCodeToCategory(code: string): string {
  if (code.startsWith("PP-")) return "A";
  if (code.startsWith("DI-")) return "B";
  if (code.startsWith("OB-")) return "B";
  if (code.startsWith("IR-")) return "L";

  if (code.startsWith("PL-")) {
    if (["PL-03", "PL-26"].includes(code)) return "C";
    if (["PL-04"].includes(code)) return "D";
    if (["PL-25"].includes(code)) return "E";
    if (["PL-27"].includes(code)) return "I";
    if (["PL-28", "PL-29", "PL-30"].includes(code)) return "K";
    return "B";
  }

  if (code.startsWith("EX-IC-")) return "E";
  if (code.startsWith("EX-EST-")) return "J";
  if (code.startsWith("EX-TAX-")) return "I";
  if (code.startsWith("EX-RP-")) return "K";
  if (code.startsWith("EX-PAY-")) return "H";
  if (code.startsWith("EX-PL-")) return "H";

  if (code.startsWith("EX-BS-")) {
    if (ASSET_BS_CODES.has(code)) return "F";
    if (LIABILITY_BS_CODES.has(code)) return "G";
    return "F";
  }

  if (code.startsWith("EX-")) {
    if (["EX-04"].includes(code)) return "L";
    if (["EX-07"].includes(code)) return "L";
    if (["EX-08", "EX-09"].includes(code)) return "G";
    if (["EX-05", "EX-06", "EX-10"].includes(code)) return "L";
    return "L";
  }

  if (code.startsWith("EV-")) return "L";
  if (code === "GC-01") return "J";
  if (code.startsWith("FH-")) return "N";
  if (code.startsWith("FN-")) return "M";
  if (code.startsWith("DL-")) return "N";
  if (code.startsWith("QR-")) return "O";
  if (code.startsWith("IN-")) return "P";
  if (code.startsWith("SECP-") || code.startsWith("CCG-") || code.startsWith("REG-")) return "K";
  if (code.startsWith("M")) return "Q";

  return "Q";
}

export function getWpsByCategory(): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const cat of WP_CATEGORIES) {
    result[cat.key] = [];
  }
  for (const code of Object.keys(WP_LIBRARY)) {
    const cat = wpCodeToCategory(code);
    if (result[cat]) result[cat].push(code);
  }
  return result;
}

/**
 * WP VISIBILITY ENGINE
 * Determines whether a WP should be recommended / visible based on session context
 */
export type SessionContext = {
  entityTypeTags: string[];         // from entityTypeToTags()
  industryTags: string[];           // from industryType dropdown
  isFirstYear: boolean;
  isGroupAudit: boolean;
  itEnvironmentTags: string[];      // ["erp","cloud","standalone","manual","mixed"]
  taxStatusTags: string[];          // ["gst_registered","ntn_holder","strn_holder","at_risk"]
  specialConditionTags: string[];   // ["going_concern","fraud_risk","related_party_heavy","aml_risk","donor_funded"]
  engagementType: string;
  reportingFramework: string;
};

export function isWpApplicable(code: string, meta: WpMeta, ctx: SessionContext): { applicable: boolean; reason: string; recommended: boolean } {
  const reasons: string[] = [];
  let applicable = true;
  let recommended = true;

  // Core WPs are always applicable
  if (meta.isCore) {
    return { applicable: true, reason: "Core mandatory working paper", recommended: true };
  }

  // Entity type filter
  if (meta.applicableTo && meta.applicableTo.length > 0) {
    const hasMatch = meta.applicableTo.some(tag => ctx.entityTypeTags.includes(tag));
    if (!hasMatch) {
      return { applicable: false, reason: `Not applicable to entity type (requires: ${meta.applicableTo.join(", ")})`, recommended: false };
    }
    reasons.push(`Entity type match: ${meta.applicableTo.filter(t => ctx.entityTypeTags.includes(t)).join(", ")}`);
  }

  // Industry filter
  if (meta.industry && meta.industry.length > 0) {
    const hasMatch = meta.industry.some(tag => ctx.industryTags.includes(tag));
    if (!hasMatch) {
      applicable = false;
      recommended = false;
      return { applicable: false, reason: `Industry-specific: requires ${meta.industry.join(", ")}`, recommended: false };
    }
    reasons.push(`Industry match: ${meta.industry.filter(t => ctx.industryTags.includes(t)).join(", ")}`);
  }

  // Controlled by conditions
  if (meta.controlledBy) {
    const cb = meta.controlledBy;

    // First year only
    if (cb.firstYearOnly && !ctx.isFirstYear) {
      return { applicable: false, reason: "First-year engagement only", recommended: false };
    }
    if (cb.firstYearOnly && ctx.isFirstYear) {
      reasons.push("First-year engagement — required");
      recommended = true;
    }

    // Group audit only
    if (cb.groupAuditOnly && !ctx.isGroupAudit) {
      return { applicable: false, reason: "Group / consolidated audit only", recommended: false };
    }
    if (cb.groupAuditOnly && ctx.isGroupAudit) {
      reasons.push("Group audit — required");
      recommended = true;
    }

    // IT environment
    if (cb.itEnvRequired && cb.itEnvRequired.length > 0) {
      const hasMatch = cb.itEnvRequired.some(tag => ctx.itEnvironmentTags.includes(tag));
      if (!hasMatch) {
        applicable = false;
        recommended = false;
        return { applicable: false, reason: `IT environment required: ${cb.itEnvRequired.join(", ")}`, recommended: false };
      }
    }

    // Tax status
    if (cb.taxStatus && cb.taxStatus.length > 0) {
      const hasMatch = cb.taxStatus.some(tag => ctx.taxStatusTags.includes(tag));
      if (!hasMatch) {
        applicable = false;
        recommended = false;
        return { applicable: false, reason: `Tax status required: ${cb.taxStatus.join(", ")}`, recommended: false };
      }
    }

    // Special conditions
    if (cb.specialCond && cb.specialCond.length > 0) {
      const hasMatch = cb.specialCond.some(tag => ctx.specialConditionTags.includes(tag));
      if (!hasMatch) {
        applicable = false;
        recommended = false;
        return { applicable: false, reason: `Special conditions required: ${cb.specialCond.join(", ")}`, recommended: false };
      }
    }
  }

  // Engagement type filters
  if (code.startsWith("M9") && ctx.engagementType !== "group_audit") {
    // M9 consolidation — still applicable for group, just note it
    if (!ctx.isGroupAudit) recommended = false;
  }

  const reason = reasons.length > 0 ? reasons.join("; ") : "Generally applicable";
  return { applicable, reason, recommended };
}

/** Map industry dropdown value to industry tags */
export function industryToTags(industryType: string | null | undefined): string[] {
  const it = (industryType || "").toLowerCase();
  const tags: string[] = [];
  if (it.includes("manufactur")) tags.push("manufacturing");
  if (it.includes("trading") || it.includes("wholesale") || it.includes("retail")) tags.push("trading");
  if (it.includes("service") || it.includes("consulting") || it.includes("professional")) tags.push("services");
  if (it.includes("agricultur") || it.includes("farming") || it.includes("poultry") || it.includes("livestock")) tags.push("agriculture");
  if (it.includes("information") || it.includes("software") || it.includes("tech") || it.includes("it ")) tags.push("it");
  if (it.includes("real estate") || it.includes("property") || it.includes("construction")) tags.push("real_estate");
  if (it.includes("energy") || it.includes("power") || it.includes("electricity") || it.includes("oil") || it.includes("gas")) tags.push("energy");
  if (it.includes("telecom") || it.includes("telecommunication")) tags.push("telecom");
  if (it.includes("pharma") || it.includes("pharmaceutical") || it.includes("health")) tags.push("pharma");
  if (it.includes("fmcg") || it.includes("consumer goods") || it.includes("beverage")) tags.push("fmcg");
  if (it.includes("textile") || it.includes("garment") || it.includes("spinning")) tags.push("textile");
  if (it.includes("cement")) tags.push("cement");
  if (it.includes("chemical") || it.includes("fertiliz")) tags.push("chemical");
  if (it.includes("sugar")) tags.push("sugar");
  if (it.includes("steel") || it.includes("iron") || it.includes("metal")) tags.push("steel");
  return tags;
}

/** Map IT environment dropdown value to tags */
export function itEnvToTags(itEnv: string | null | undefined): string[] {
  const it = (itEnv || "").toLowerCase();
  if (!it) return [];
  if (it === "erp" || it.includes("erp") || it.includes("sap") || it.includes("oracle") || it.includes("microsoft dynamics")) return ["erp"];
  if (it === "cloud" || it.includes("cloud") || it.includes("saas")) return ["cloud", "erp"];
  if (it === "standalone" || it.includes("standalone") || it.includes("desktop") || it.includes("tally") || it.includes("quickbooks")) return ["standalone"];
  if (it === "manual" || it.includes("manual") || it.includes("excel only")) return ["manual"];
  if (it === "mixed" || it.includes("mixed") || it.includes("hybrid")) return ["mixed", "erp"];
  return ["standalone"];
}
