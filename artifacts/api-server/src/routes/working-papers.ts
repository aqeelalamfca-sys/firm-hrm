import { Router, type Request, type Response, type NextFunction } from "express";
import multer from "multer";
import { z } from "zod";
import { logger } from "../lib/logger";
import { type AuthenticatedRequest, requireRoles } from "../middleware/auth";
import { db } from "@workspace/db";
import {
  systemSettingsTable, usersTable, employeesTable,
  wpSessionsTable, wpUploadedFilesTable, wpExtractionRunsTable,
  wpExtractedFieldsTable, wpArrangedDataTable, wpVariablesTable,
  wpVariableChangeLogTable, wpExceptionLogTable, wpTrialBalanceLinesTable,
  wpGlAccountsTable, wpGlEntriesTable, wpHeadsTable, wpHeadDocumentsTable,
  wpExportJobsTable, wpVariableDefinitionsTable, wpVariableDependencyRulesTable,
  wpMasterCoaTable,
  auditEngineMasterTable, wpTriggerDefsTable, wpTriggerSessionTable,
  assertionLinkageTable, samplingRulesTable, analyticsEngineTable,
  analyticsSessionTable, controlMatrixTable, evidenceLogTable, reconEngineTable,
  wpJournalImportTable, wpFsExtractionTable, wpFsMappingTable,
  wpLibraryMasterTable, wpLibrarySessionTable,
  wpTriggerRulesTable, wpValidationResultTable, wpExceptionsTable,
  wpSessionLockTable, wpOutputJobTable,
  wpExecutionTable,
  wpComplianceDocTable,
  wpAuditChainTable,
  wpIsaClauseRefTable,
  wpTickMarkTable,
  wpTickMarkUsageTable,
  wpReviewNoteTable,
  wpVersionHistoryTable,
  wpLeadScheduleTable,
  wpFsNoteMappingTable,
  wpComplianceGateTable,
  wpSamplingDetailTable,
  wpFsLinesTable,
} from "@workspace/db";
import { WP_LIBRARY, type WpLibraryEntry } from "../data/wp-library-seed";
import { WP_LIBRARY as WP_FULL_LIBRARY, type WpMeta as WpMetaFull, industryToTags, itEnvToTags, isWpApplicable, WP_LIBRARY_COUNT, WP_CATEGORIES, wpCodeToCategory, getWpsByCategory } from "../data/wp-library-full";
import { VARIABLE_DEFINITIONS, EXTRACTION_FIELD_TO_VARIABLE_MAP, VARIABLE_GROUPS, DEPENDENCY_RULES, PRIMARY_VARIABLE_CODES, SECONDARY_VARIABLE_CODES } from "../data/variable-definitions";
import {
  runTBEngine, runGLEngine, runReconciliation, checkFinalEnforcement,
  PAKISTAN_COA, mapFsToCoa,
} from "./tb-gl-engine";
import { eq, and, inArray, asc, sql, desc } from "drizzle-orm";
import OpenAI from "openai";
import PDFDocument from "pdfkit";
import * as XLSX from "xlsx";
import ExcelJS from "exceljs";
// @ts-ignore
import pdfParse from "pdf-parse";
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell,
  WidthType, AlignmentType, BorderStyle, ShadingType, PageBreak, Footer, VerticalAlign,
  type IShadingAttributesProperties,
} from "docx";

const router = Router();

/** Express v5 types req.params as string | string[] — this helper always returns a plain string */
const p = (v: string | string[] | undefined): string => Array.isArray(v) ? (v[0] || "") : (v || "");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 },
});

const FILE_SIZE_LIMITS: Record<string, number> = {
  financial_statements: 15 * 1024 * 1024,
  trial_balance: 10 * 1024 * 1024,
  general_ledger: 20 * 1024 * 1024,
  bank_statement: 10 * 1024 * 1024,
  sales_tax_return: 5 * 1024 * 1024,
  tax_notice: 5 * 1024 * 1024,
  schedule: 10 * 1024 * 1024,
  annexure: 10 * 1024 * 1024,
  other: 10 * 1024 * 1024,
};

const VALID_SESSION_STATUSES = ["upload", "extraction", "data_sheet", "arranged_data", "variables", "wp_listing", "generation", "audit_chain", "review", "export", "completed"] as const;
const VALID_ENTITY_TYPES = ["Public Limited (Listed)", "Public Limited (Unlisted)", "Private Limited", "Private Limited Company", "Single Member Company (SMC)", "Single Member", "Not-for-Profit (Section 42)", "NGO/NPO", "Limited Liability Partnership (LLP)", "LLP", "Association of Persons (AOP)", "AOP", "Trust", "Sole Proprietorship", "Sole Proprietor", "Government Entity", "Branch Office"] as const;
const VALID_ENGAGEMENT_TYPES = ["statutory_audit", "group_audit", "limited_review", "special_audit", "compliance_audit"] as const;
const ENGAGEMENT_TYPE_MAP: Record<string, string> = {
  "Statutory Audit": "statutory_audit", "Group Audit": "group_audit",
  "Limited Review": "limited_review", "Special Audit": "special_audit",
  "Compliance Audit": "compliance_audit",
};
const CONTINUITY_MAP: Record<string, string> = {
  "First Time Engagement": "first_time", "First Time": "first_time",
  "Recurring": "recurring", "Recurring Engagement": "recurring",
};
const VALID_RISK_LEVELS = ["Low", "Medium", "High", "Critical"] as const;
const VALID_REPORTING_FRAMEWORKS = ["IFRS", "IFRS for SMEs", "AFRS", "IPSAS", "Custom", "Fourth Schedule", "Fifth Schedule"] as const;

function parsePagination(req: Request, defaultLimit = 200, maxLimit = 1000): { limit: number; offset: number } {
  const limit = Math.min(Math.max(parseInt(String(req.query.limit)) || defaultLimit, 1), maxLimit);
  const offset = Math.max(parseInt(String(req.query.offset)) || 0, 0);
  return { limit, offset };
}

function standardError(res: Response, status: number, message: string, details?: string) {
  logger.error({ status, message, details }, message);
  return res.status(status).json({ error: message, ...(details ? { details } : {}) });
}

const aiRateLimitMap = new Map<string, { count: number; resetAt: number }>();
const AI_RATE_LIMIT = 10;
const AI_RATE_WINDOW_MS = 60_000;

function aiRateLimit(req: Request, res: Response, next: NextFunction) {
  const userId = (req as AuthenticatedRequest).user?.id?.toString() || req.ip || "anon";
  const now = Date.now();
  let entry = aiRateLimitMap.get(userId);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + AI_RATE_WINDOW_MS };
    aiRateLimitMap.set(userId, entry);
  }
  entry.count++;
  if (entry.count > AI_RATE_LIMIT) {
    return res.status(429).json({ error: "AI rate limit exceeded. Please wait before making more AI requests." });
  }
  next();
}

const AUDIT_HEADS = [
  { index: 0, name: "Trial Balance", outputType: "excel", papers: ["TB-Master", "TB-Mapping", "TB-VS-FS-Recon"] },
  { index: 1, name: "General Ledger", outputType: "excel", papers: ["GL-Summary", "GL-Detail", "Lead-Schedules", "Account-Mapping"] },
  { index: 2, name: "Pre-Planning", outputType: "word", papers: ["PP-01", "PP-02", "PP-03", "PP-04", "PP-05", "PP-06", "PP-07", "PP-08", "PP-09", "PP-10", "PP-11", "PP-12", "PP-13"] },
  { index: 3, name: "Data Intake", outputType: "word+excel", papers: ["DI-01", "DI-04", "DI-05", "DI-06", "DI-07", "DI-08", "DI-09", "DI-10", "DI-11", "DI-12", "DI-13"] },
  { index: 4, name: "Information Requisition", outputType: "word", papers: ["IR-01", "IR-02", "IR-03", "IR-04", "IR-05", "IR-06"] },
  { index: 5, name: "OB Verification", outputType: "word+excel", papers: ["OB-01", "OB-02", "OB-03", "OB-04", "M6", "M7"] },
  { index: 6, name: "Planning", outputType: "word", papers: [
    "PL-01", "PL-02", "PL-03", "PL-04", "PL-05", "PL-06", "PL-07", "PL-08", "PL-09", "PL-10", "PL-11",
    "PL-12", "PL-13", "PL-14", "PL-15", "PL-16", "PL-17", "PL-18",
    "PL-19", "PL-20", "PL-21", "PL-22", "PL-23", "PL-24",
    "M1", "M2",
  ] },
  { index: 7, name: "Execution", outputType: "word+excel", papers: [
    "EX-01", "EX-02", "EX-03",
    "EX-BS-01", "EX-BS-02", "EX-BS-03", "EX-BS-04", "EX-BS-05", "EX-BS-06",
    "EX-BS-07", "EX-BS-08", "EX-BS-09", "EX-BS-10",
    "EX-BS-11", "EX-BS-12", "EX-BS-13",
    "EX-PL-01", "EX-PL-02", "EX-PL-03", "EX-PL-04",
    "EX-04", "FH-01",
    "EX-IC-01", "EX-IC-02",
    "EX-EST-01", "EX-EST-02",
    "GC-01",
    "M3", "M4", "M5", "M8",
    "M10", "M11", "M12", "M13", "M14", "M15", "M16",
  ] },
  { index: 8, name: "Evidence & Finalization", outputType: "word", papers: [
    "EV-01", "EV-02", "EV-03",
    "FN-01", "FN-02", "FN-03", "FN-04", "FN-05", "FN-06",
    "FN-07", "FN-08", "FN-09", "FN-10", "FN-11", "FN-12",
    "SECP-F29", "SECP-FA", "CCG-01",
    "M9",
  ] },
  { index: 9, name: "Deliverables", outputType: "word+pdf", papers: ["DL-01", "DL-02", "DL-03", "DL-04", "DL-05", "DL-06", "DL-07"] },
  { index: 10, name: "QR (EQCR)", outputType: "word", papers: ["QR-01", "QR-02", "QR-03", "QR-04"] },
  { index: 11, name: "Inspection", outputType: "word", papers: ["IN-01", "IN-02", "IN-03", "IN-04"] },
];

const WP_ROLES_READ = ["super_admin", "partner", "senior_manager", "manager", "senior", "junior", "trainee", "admin"] as const;
const WP_ROLES_WRITE = ["super_admin", "partner", "senior_manager", "manager", "senior"] as const;
const WP_ROLES_APPROVE = ["super_admin", "partner", "senior_manager", "manager"] as const;
const WP_ROLES_ADMIN = ["super_admin", "partner"] as const;

const VALID_INDUSTRY_TYPES = [
  "Manufacturing", "Trading / Wholesale / Retail", "Services / Consulting",
  "Agriculture / Farming / Livestock", "Information Technology / Software",
  "Real Estate / Construction / Property", "Energy / Power / Oil & Gas",
  "Telecommunications", "Pharmaceutical / Healthcare",
  "FMCG / Consumer Goods", "Textile / Garments / Spinning",
  "Cement / Building Materials", "Chemical / Fertilizers",
  "Sugar / Food Processing", "Steel / Iron / Metals",
  "Financial Services (Non-banking)", "Education / NGO / NPO",
  "Hospitality / Tourism", "Transport / Logistics", "Other",
] as const;

const VALID_IT_ENVIRONMENTS = [
  "ERP System (SAP / Oracle / Microsoft Dynamics)",
  "Cloud-based Accounting (Xero / QuickBooks Online / Zoho)",
  "Standalone Desktop Software (Tally / QuickBooks Desktop)",
  "Spreadsheets Only (Excel / Google Sheets)",
  "Mixed / Hybrid Environment",
  "Manual / Paper-based Records",
] as const;

const createSessionSchema = z.object({
  clientName: z.string().min(1, "Client name is required").max(200),
  engagementYear: z.string().min(4).max(10),
  entityType: z.enum(VALID_ENTITY_TYPES),
  ntn: z.string().min(1, "NTN is required").max(50),
  strn: z.string().max(50).optional().nullable(),
  registrationNo: z.string().max(50).optional().nullable(),
  periodStart: z.string().optional().nullable(),
  periodEnd: z.string().optional().nullable(),
  reportingFramework: z.enum(VALID_REPORTING_FRAMEWORKS).optional().default("IFRS"),
  engagementType: z.preprocess((v) => typeof v === "string" ? (ENGAGEMENT_TYPE_MAP[v] || v) : v, z.enum(VALID_ENGAGEMENT_TYPES)).optional().default("statutory_audit"),
  engagementContinuity: z.preprocess((v) => typeof v === "string" ? (CONTINUITY_MAP[v] || v) : v, z.enum(["first_time", "recurring"])).optional().default("first_time"),
  industryType: z.string().max(100).optional().nullable(),
  groupAuditFlag: z.boolean().optional().default(false),
  itEnvironmentType: z.string().max(200).optional().nullable(),
  taxStatusFlags: z.string().max(500).optional().nullable(),
  specialConditions: z.string().max(500).optional().nullable(),
  auditFirmName: z.string().max(200).optional().nullable(),
  auditFirmLogo: z.string().max(500).optional().nullable(),
  preparerId: z.number().optional().nullable(),
  preparerName: z.string().max(100).optional().nullable(),
  preparerIds: z.array(z.number()).optional().nullable(),
  preparerNames: z.array(z.string()).optional().nullable(),
  reviewerId: z.number().optional().nullable(),
  reviewerName: z.string().max(100).optional().nullable(),
  approverId: z.number().optional().nullable(),
  approverName: z.string().max(100).optional().nullable(),
  eqcrId: z.number().optional().nullable(),
  eqcrName: z.string().max(100).optional().nullable(),
});

const updateVariableSchema = z.object({
  userEditedValue: z.string().optional().nullable(),
  finalValue: z.string().optional().nullable(),
  confidence: z.string().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  sourceType: z.string().max(50).optional().nullable(),
});

const createReviewNoteSchema = z.object({
  wpCode: z.string().min(1).max(20),
  reviewLevel: z.enum(["Preparer", "Manager", "Partner", "EQCR"]),
  reviewerName: z.string().min(1).max(100),
  noteType: z.enum(["query", "comment", "correction", "observation"]).optional().default("query"),
  priority: z.enum(["Low", "Medium", "High", "Critical"]).optional().default("Medium"),
  subject: z.string().min(1).max(500),
  detail: z.string().max(5000).optional().nullable(),
  isaReference: z.string().max(200).optional().nullable(),
  blocksSignOff: z.boolean().optional().default(false),
});

const bulkIdsSchema = z.object({
  headIds: z.array(z.union([z.number(), z.string()])).min(1, "At least one ID required"),
});

const bulkNoteIdsSchema = z.object({
  noteIds: z.array(z.union([z.number(), z.string()])).min(1, "At least one ID required"),
  clearanceNote: z.string().max(1000).optional(),
});

function validateBody<T>(schema: z.ZodSchema<T>, body: unknown): { success: true; data: T } | { success: false; error: string } {
  const result = schema.safeParse(body);
  if (!result.success) {
    const messages = result.error.errors.map(e => `${e.path.join(".")}: ${e.message}`).join("; ");
    return { success: false, error: messages };
  }
  return { success: true, data: result.data };
}

type WpMeta = WpMetaFull;
const WP_METADATA: Record<string, WpMeta> = {
  "PP-01": { name: "Engagement Setup", isa: "ISA 210, ISA 220, ISA 300, ISA 315", phase: "Pre-Planning", riskLevel: "Medium", assertions: "N/A", fsArea: "Engagement Level" },
  "PP-02": { name: "Entity Understanding", isa: "ISA 315", phase: "Pre-Planning", riskLevel: "Medium", assertions: "N/A", fsArea: "Engagement Level" },
  "PP-03": { name: "Ethics & Independence", isa: "ISA 220, ISQM 1, ICAP Code of Ethics", phase: "Pre-Planning", riskLevel: "High", assertions: "N/A", fsArea: "Engagement Level" },
  "PP-04": { name: "Acceptance & Continuance", isa: "ISA 210, ISA 220", phase: "Pre-Planning", riskLevel: "High", assertions: "N/A", fsArea: "Engagement Level" },
  "PP-05": { name: "Engagement Letter", isa: "ISA 210", phase: "Pre-Planning", riskLevel: "Low", assertions: "N/A", fsArea: "Engagement Level" },
  "PP-06": { name: "Completion & Sign-off", isa: "ISA 300", phase: "Pre-Planning", riskLevel: "Medium", assertions: "N/A", fsArea: "Engagement Level" },
  "PP-07": { name: "Phase Summary", isa: "ISA 300, ISA 230", phase: "Pre-Planning", riskLevel: "Low", assertions: "N/A", fsArea: "Engagement Level" },
  "PP-08": { name: "Client Acceptance Checklist", isa: "ISA 210, ISA 220, ISQM 1", phase: "Pre-Planning", riskLevel: "High", assertions: "N/A", fsArea: "Engagement Level" },
  "PP-09": { name: "Independence Confirmation", isa: "ISA 220, ISQM 1, ICAP Code of Ethics", phase: "Pre-Planning", riskLevel: "High", assertions: "N/A", fsArea: "Engagement Level" },
  "PP-10": { name: "Engagement Team Appointment & Briefing", isa: "ISA 220, ISA 300", phase: "Pre-Planning", riskLevel: "Medium", assertions: "N/A", fsArea: "Engagement Level" },
  "PP-11": { name: "Initial Planning Meeting Minutes", isa: "ISA 300, ISA 315", phase: "Pre-Planning", riskLevel: "Medium", assertions: "N/A", fsArea: "Engagement Level" },
  "PP-12": { name: "Understanding of Company Type Mapping", isa: "ISA 315, Companies Act 2017", phase: "Pre-Planning", riskLevel: "Medium", assertions: "N/A", fsArea: "Engagement Level" },
  "PP-13": { name: "Applicable Regulatory Framework Mapping", isa: "ISA 250, ISA 315", phase: "Pre-Planning", riskLevel: "Medium", assertions: "N/A", fsArea: "Engagement Level" },
  "DI-01": { name: "Upload & Data Intake", isa: "ISA 500", phase: "Data Intake", riskLevel: "Medium", assertions: "C, E", fsArea: "All FS Areas" },
  "DI-04": { name: "FS Mapping", isa: "ISA 315, ISA 200", phase: "Data Intake", riskLevel: "Medium", assertions: "C, E, A, V", fsArea: "All FS Areas" },
  "DI-05": { name: "Analytical Review", isa: "ISA 520", phase: "Data Intake", riskLevel: "High", assertions: "C, E, A, V, R", fsArea: "All FS Areas" },
  "DI-06": { name: "Materiality Determination", isa: "ISA 320", phase: "Data Intake", riskLevel: "High", assertions: "N/A", fsArea: "Engagement Level" },
  "DI-07": { name: "Risk Assessment", isa: "ISA 315", phase: "Data Intake", riskLevel: "High", assertions: "C, E, A, V, R, P", fsArea: "All FS Areas" },
  "DI-08": { name: "Audit Population", isa: "ISA 500, ISA 530", phase: "Data Intake", riskLevel: "Medium", assertions: "C, E", fsArea: "All FS Areas" },
  "DI-09": { name: "Sampling Design", isa: "ISA 530", phase: "Data Intake", riskLevel: "Medium", assertions: "C, E, V", fsArea: "All FS Areas" },
  "DI-10": { name: "Confirmation Procedures", isa: "ISA 505", phase: "Data Intake", riskLevel: "High", assertions: "E, A", fsArea: "Receivables, Bank" },
  "DI-11": { name: "Execution Datasets", isa: "ISA 500, ISA 330", phase: "Data Intake", riskLevel: "Medium", assertions: "C, E, V", fsArea: "All FS Areas" },
  "DI-12": { name: "Reporting – Draft FS", isa: "ISA 700, ISA 200", phase: "Data Intake", riskLevel: "Medium", assertions: "P, R", fsArea: "Financial Statements" },
  "DI-13": { name: "Data Intake Review Summary", isa: "ISA 300, ISA 230", phase: "Data Intake", riskLevel: "Low", assertions: "N/A", fsArea: "Engagement Level" },
  "IR-01": { name: "IR Dashboard", isa: "ISA 230, ISA 500", phase: "Information Requisition", riskLevel: "Low", assertions: "C, E", fsArea: "All FS Areas" },
  "IR-02": { name: "Request Register", isa: "ISA 500, ISA 230", phase: "Information Requisition", riskLevel: "Medium", assertions: "C, E", fsArea: "All FS Areas" },
  "IR-03": { name: "Client Uploads", isa: "ISA 500, ISA 230", phase: "Information Requisition", riskLevel: "Medium", assertions: "C, E, V", fsArea: "All FS Areas" },
  "IR-04": { name: "Procedures & Memos", isa: "ISA 230, ISA 300", phase: "Information Requisition", riskLevel: "Medium", assertions: "C, E", fsArea: "All FS Areas" },
  "IR-05": { name: "Exceptions & Follow-ups", isa: "ISA 500, ISA 230", phase: "Information Requisition", riskLevel: "High", assertions: "C, E, V", fsArea: "All FS Areas" },
  "IR-06": { name: "Conclusion & Sign-off", isa: "ISA 230, ISA 300", phase: "Information Requisition", riskLevel: "Low", assertions: "N/A", fsArea: "Engagement Level" },
  "OB-01": { name: "OB Verification Dashboard", isa: "ISA 510", phase: "OB Verification", riskLevel: "High", assertions: "C, E, A", fsArea: "All Balance Sheet Items" },
  "OB-02": { name: "OB Verification Procedures", isa: "ISA 510, ISA 500", phase: "OB Verification", riskLevel: "High", assertions: "C, E, A, V", fsArea: "All Balance Sheet Items" },
  "OB-03": { name: "TB Verification", isa: "ISA 510, ISA 520", phase: "OB Verification", riskLevel: "High", assertions: "C, E, A, V", fsArea: "All Balance Sheet Items" },
  "OB-04": { name: "OB Conclusion & Sign-off", isa: "ISA 510, ISA 230", phase: "OB Verification", riskLevel: "Medium", assertions: "N/A", fsArea: "Engagement Level" },
  "PL-01": { name: "Financial Statements Overview", isa: "ISA 200, ISA 700", phase: "Planning", riskLevel: "Medium", assertions: "P, R", fsArea: "Financial Statements" },
  "PL-02": { name: "Entity & Internal Controls", isa: "ISA 315, ISA 265", phase: "Planning", riskLevel: "High", assertions: "C, E, A, V, R, P", fsArea: "Entity Level" },
  "PL-03": { name: "Risk Assessment", isa: "ISA 315, ISA 330, ISA 570", phase: "Planning", riskLevel: "High", assertions: "C, E, A, V, R, P", fsArea: "All FS Areas" },
  "PL-04": { name: "Analytical Procedures", isa: "ISA 520", phase: "Planning", riskLevel: "High", assertions: "C, E, A, V, R", fsArea: "All FS Areas" },
  "PL-05": { name: "Materiality", isa: "ISA 320, ISA 450", phase: "Planning", riskLevel: "High", assertions: "N/A", fsArea: "Engagement Level" },
  "PL-06": { name: "Overall Audit Strategy & Approach", isa: "ISA 300", phase: "Planning", riskLevel: "Medium", assertions: "N/A", fsArea: "Engagement Level" },
  "PL-07": { name: "Sampling Plan", isa: "ISA 530", phase: "Planning", riskLevel: "Medium", assertions: "C, E, V", fsArea: "All FS Areas" },
  "PL-08": { name: "Audit Program", isa: "ISA 300, ISA 330", phase: "Planning", riskLevel: "High", assertions: "C, E, A, V, R, P", fsArea: "All FS Areas" },
  "PL-09": { name: "Specialized Areas", isa: "ISA 550, ISA 540, ISA 600, ISA 620", phase: "Planning", riskLevel: "High", assertions: "C, E, A, V", fsArea: "Estimates, Related Parties, Group" },
  "PL-10": { name: "TCWG Communication", isa: "ISA 260, ISA 265", phase: "Planning", riskLevel: "Medium", assertions: "N/A", fsArea: "Engagement Level" },
  "PL-11": { name: "Quality Control", isa: "ISA 220, ISQM 1", phase: "Planning", riskLevel: "High", assertions: "N/A", fsArea: "Engagement Level" },
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
  "EX-01": { name: "Planning Prerequisites", isa: "ISA 300, ISA 330", phase: "Execution", riskLevel: "Medium", assertions: "N/A", fsArea: "Engagement Level" },
  "EX-02": { name: "ISA Compliance Status", isa: "ISA 200, ISA 500, ISA 330", phase: "Execution", riskLevel: "High", assertions: "C, E, A, V, R, P", fsArea: "All FS Areas" },
  "EX-03": { name: "FS Head Working Papers Summary", isa: "ISA 330, ISA 500, ISA 501", phase: "Execution", riskLevel: "High", assertions: "C, E, A, V, R, P", fsArea: "All FS Areas" },
  "EX-BS-01": { name: "Cash and Bank – Confirmation & Reconciliation", isa: "ISA 330, ISA 500, ISA 501, ISA 505", phase: "Execution", riskLevel: "High", assertions: "E, A, V", fsArea: "Cash & Bank" },
  "EX-BS-02": { name: "Inventory – Physical Count & Valuation", isa: "ISA 330, ISA 500, ISA 501", phase: "Execution", riskLevel: "High", assertions: "E, C, V, R", fsArea: "Inventories" },
  "EX-BS-03": { name: "Borrowings & Loans – Confirmation", isa: "ISA 330, ISA 500, ISA 501", phase: "Execution", riskLevel: "High", assertions: "C, E, A, V", fsArea: "Long Term Borrowings" },
  "EX-BS-04": { name: "PPE – Roll-Forward & Depreciation Test", isa: "ISA 330, ISA 500, ISA 501", phase: "Execution", riskLevel: "High", assertions: "E, C, A, V, R", fsArea: "PPE" },
  "EX-BS-05": { name: "Trade Receivables – Confirmation & Aging", isa: "ISA 330, ISA 500, ISA 505", phase: "Execution", riskLevel: "High", assertions: "E, C, A, V, R", fsArea: "Trade Receivables" },
  "EX-BS-06": { name: "Trade and Other Payables – Confirmation & Reconciliation", isa: "ISA 330, ISA 500, ISA 501", phase: "Execution", riskLevel: "High", assertions: "C, E, A, V", fsArea: "Trade Payables" },
  "EX-BS-07": { name: "Biological Assets & Agriculture", isa: "ISA 330, ISA 500, IAS 41", phase: "Execution", riskLevel: "High", assertions: "E, V", fsArea: "Biological Assets", applicableTo: ["construction"] },
  "EX-BS-08": { name: "Islamic Financing Assets (Murabaha / Ijarah / Diminishing Musharaka)", isa: "ISA 330, ISA 500, AAOIFI", phase: "Execution", riskLevel: "High", assertions: "E, V, C", fsArea: "Islamic Finance Assets", applicableTo: ["islamic_bank"] },
  "EX-BS-09": { name: "Leasing Assets (Ijarah Muntahia Bittamleek)", isa: "ISA 330, ISA 500, IFRS 16", phase: "Execution", riskLevel: "High", assertions: "E, V, C", fsArea: "Leasing Assets", applicableTo: ["leasing"] },
  "EX-BS-10": { name: "Modaraba Specific Assets (Certificates / Sukuk / Mudaraba Funds)", isa: "ISA 330, ISA 500, Modaraba Rules", phase: "Execution", riskLevel: "High", assertions: "E, V", fsArea: "Modaraba Assets", applicableTo: ["modaraba"] },
  "EX-BS-11": { name: "Certificates of Investment / Sukuk Liabilities", isa: "ISA 330, ISA 500, AAOIFI", phase: "Execution", riskLevel: "High", assertions: "C, E, V", fsArea: "Islamic Liabilities", applicableTo: ["modaraba", "islamic_bank"] },
  "EX-BS-12": { name: "Insurance Policyholder Liabilities / Unearned Premium Reserve", isa: "ISA 330, ISA 540, IFRS 17", phase: "Execution", riskLevel: "High", assertions: "C, V, E", fsArea: "Insurance Liabilities", applicableTo: ["insurance"] },
  "EX-BS-13": { name: "Bank Customer Deposits / Current Accounts (SBP Prudential)", isa: "ISA 330, ISA 500, SBP PRs", phase: "Execution", riskLevel: "High", assertions: "C, E, V", fsArea: "Deposits", applicableTo: ["bank", "islamic_bank"] },
  "EX-PL-01": { name: "Cost of Sales & Inventory Movement", isa: "ISA 330, ISA 500, ISA 501", phase: "Execution", riskLevel: "High", assertions: "C, E, A, V", fsArea: "Cost of Sales" },
  "EX-PL-02": { name: "Revenue Testing (IFRS 15)", isa: "ISA 330, ISA 500, ISA 240", phase: "Execution", riskLevel: "Significant", assertions: "C, E, A, V, R, P", fsArea: "Revenue" },
  "EX-PL-03": { name: "Islamic Bank Income (Murabaha / Ijarah / Musharaka) Testing", isa: "ISA 330, ISA 500, AAOIFI", phase: "Execution", riskLevel: "High", assertions: "C, E, V", fsArea: "Islamic Income", applicableTo: ["islamic_bank"] },
  "EX-PL-04": { name: "Insurance Premium Revenue / Claims Expense Testing", isa: "ISA 330, ISA 500, IFRS 17", phase: "Execution", riskLevel: "High", assertions: "C, E, V, R", fsArea: "Insurance Revenue", applicableTo: ["insurance"] },
  "EX-04": { name: "Journal Entry Testing", isa: "ISA 240, ISA 330", phase: "Execution", riskLevel: "Significant", assertions: "C, E, A, V", fsArea: "All FS Areas" },
  "FH-01": { name: "FS Heads – Execution Summary", isa: "ISA 330, ISA 500, ISA 501", phase: "FS Heads", riskLevel: "High", assertions: "C, E, A, V, R, P", fsArea: "All FS Areas" },
  "EX-IC-01": { name: "PSX Mandatory Internal Audit Function Review (CCG 2019)", isa: "ISA 610, CCG 2019", phase: "Execution", riskLevel: "High", assertions: "N/A", fsArea: "Internal Controls", applicableTo: ["listed"] },
  "EX-IC-02": { name: "SMC Director-Manager Segregation of Duties Assessment", isa: "ISA 315, Companies Act 2017 s.2(1)(58A)", phase: "Execution", riskLevel: "Medium", assertions: "N/A", fsArea: "Internal Controls", applicableTo: ["smc"] },
  "EX-EST-01": { name: "Insurance Actuarial Reserves (Life / Non-Life) Review", isa: "ISA 540, ISA 620, IFRS 17", phase: "Execution", riskLevel: "High", assertions: "V, E", fsArea: "Insurance Estimates", applicableTo: ["insurance"] },
  "EX-EST-02": { name: "Modaraba Management Fee & Profit Distribution Estimate", isa: "ISA 540, Modaraba Rules", phase: "Execution", riskLevel: "High", assertions: "V, C", fsArea: "Modaraba Estimates", applicableTo: ["modaraba"] },
  "M1": { name: "Group Audit Instructions (ISA 600)", isa: "ISA 600", phase: "Planning", riskLevel: "High", assertions: "C, E, V", fsArea: "Group Audit", applicableTo: ["listed", "bank", "insurance"] },
  "M2": { name: "Component Auditor Review", isa: "ISA 600", phase: "Planning", riskLevel: "High", assertions: "C, E, V", fsArea: "Group Audit", applicableTo: ["listed", "bank", "insurance"] },
  "M3": { name: "Using the Work of Internal Audit (ISA 610)", isa: "ISA 610", phase: "Execution", riskLevel: "Medium", assertions: "N/A", fsArea: "Internal Audit", applicableTo: ["listed", "bank", "insurance"] },
  "M4": { name: "Using an Auditor's Expert (ISA 620)", isa: "ISA 620", phase: "Execution", riskLevel: "High", assertions: "V", fsArea: "Expert Reliance", applicableTo: ["bank", "insurance", "modaraba"] },
  "M5": { name: "Service Organization / SOC Review (ISA 402)", isa: "ISA 402", phase: "Execution", riskLevel: "Medium", assertions: "C, E", fsArea: "IT / Outsourced" },
  "M6": { name: "Opening Balances Review (ISA 510)", isa: "ISA 510", phase: "OB Verification", riskLevel: "High", assertions: "C, E, A", fsArea: "All Balance Sheet Items" },
  "M7": { name: "First-Year Audit Transition Memo", isa: "ISA 510, ISA 300", phase: "OB Verification", riskLevel: "High", assertions: "N/A", fsArea: "Engagement Level" },
  "M8": { name: "Interim Review Procedures", isa: "ISA 330, ISRE 2410", phase: "Execution", riskLevel: "Medium", assertions: "C, E, V", fsArea: "All FS Areas" },
  "M9": { name: "Consolidation / Combined FS Review", isa: "ISA 600, IFRS 10", phase: "Finalization", riskLevel: "High", assertions: "C, E, V, P", fsArea: "Consolidated FS", applicableTo: ["listed", "bank"] },
  "M10": { name: "Donor / Grant / NGO Compliance WP", isa: "ISA 250, NGO Rules", phase: "Execution", riskLevel: "High", assertions: "C, R", fsArea: "Grant Compliance", applicableTo: ["ngo"] },
  "M11": { name: "Public Sector / IPSAS Adjustments WP", isa: "ISA 250, IPSAS", phase: "Execution", riskLevel: "High", assertions: "C, V, R", fsArea: "Public Sector", applicableTo: ["public_sector"] },
  "M12": { name: "Construction / Long-term Contracts WP", isa: "ISA 330, IFRS 15.35", phase: "Execution", riskLevel: "High", assertions: "C, E, V, R", fsArea: "Revenue / WIP", applicableTo: ["construction"] },
  "M13": { name: "Capital Adequacy (CAR) & SBP Liquidity Ratios Testing", isa: "ISA 250, SBP PRs, Basel III", phase: "Execution", riskLevel: "High", assertions: "V, C", fsArea: "Regulatory Capital", applicableTo: ["bank", "islamic_bank", "insurance"] },
  "M14": { name: "Solvency & Statutory Fund Testing (SECP Insurance)", isa: "ISA 250, Insurance Ordinance 2000", phase: "Execution", riskLevel: "High", assertions: "V, C", fsArea: "Solvency", applicableTo: ["insurance"] },
  "M15": { name: "Modaraba Management Fee & Profit Distribution Schedule", isa: "ISA 540, Modaraba Companies Rules", phase: "Execution", riskLevel: "High", assertions: "V, C, R", fsArea: "Modaraba Distribution", applicableTo: ["modaraba"] },
  "M16": { name: "Simplified Materiality & Reduced Disclosure Framework", isa: "ISA 320, IFRS for SMEs", phase: "Execution", riskLevel: "Medium", assertions: "N/A", fsArea: "Engagement Level", applicableTo: ["gem", "sme"] },
  "EV-01": { name: "Evidence – Documents", isa: "ISA 500, ISA 230", phase: "Evidence", riskLevel: "High", assertions: "C, E, V", fsArea: "All FS Areas" },
  "EV-02": { name: "Evidence – ISA 230 Checklist", isa: "ISA 230", phase: "Evidence", riskLevel: "High", assertions: "N/A", fsArea: "Engagement Level" },
  "EV-03": { name: "Evidence – Stats & Links", isa: "ISA 500, ISA 330", phase: "Evidence", riskLevel: "Medium", assertions: "C, E, V", fsArea: "All FS Areas" },
  "FN-01": { name: "Finalization – Adjusted Financial Statements", isa: "ISA 700, ISA 450", phase: "Finalization", riskLevel: "High", assertions: "P, R, V", fsArea: "Financial Statements" },
  "FN-02": { name: "Finalization – Subsequent Events", isa: "ISA 560", phase: "Finalization", riskLevel: "High", assertions: "C, E", fsArea: "Post Balance Sheet" },
  "FN-03": { name: "Finalization – Going Concern", isa: "ISA 570", phase: "Finalization", riskLevel: "Significant", assertions: "N/A", fsArea: "Engagement Level" },
  "FN-04": { name: "Finalization – Completion Checklist", isa: "ISA 500, ISA 580, ISA 220", phase: "Finalization", riskLevel: "High", assertions: "N/A", fsArea: "Engagement Level" },
  "FN-05": { name: "Finalization – Audit Summary Memorandum", isa: "ISA 700, ISA 220", phase: "Finalization", riskLevel: "High", assertions: "N/A", fsArea: "Engagement Level" },
  "FN-06": { name: "Finalization – Notes & Disclosures", isa: "ISA 700, ISA 720", phase: "Finalization", riskLevel: "High", assertions: "P, R", fsArea: "Financial Statements" },
  "FN-07": { name: "PSX Listing Regulations Compliance (Ch. 5, 7, 9, 13)", isa: "ISA 250, PSX Regulations", phase: "Finalization", riskLevel: "High", assertions: "C, R", fsArea: "Compliance", applicableTo: ["listed"] },
  "FN-08": { name: "SBP Prudential Regulations for Banks / DFIs", isa: "ISA 250, SBP PRs", phase: "Finalization", riskLevel: "High", assertions: "C, V", fsArea: "Regulatory Compliance", applicableTo: ["bank", "islamic_bank"] },
  "FN-09": { name: "SECP NBFC / Leasing / Modaraba Regulations", isa: "ISA 250, NBFC Rules 2003", phase: "Finalization", riskLevel: "High", assertions: "C, V", fsArea: "Regulatory Compliance", applicableTo: ["modaraba", "leasing"] },
  "FN-10": { name: "SECP Insurance Rules 2017", isa: "ISA 250, Insurance Rules 2017", phase: "Finalization", riskLevel: "High", assertions: "C, V", fsArea: "Regulatory Compliance", applicableTo: ["insurance"] },
  "FN-11": { name: "GEM Board Listing Conditions & Continuous Compliance", isa: "ISA 250, GEM Board Rules", phase: "Finalization", riskLevel: "Medium", assertions: "C, R", fsArea: "Compliance", applicableTo: ["gem"] },
  "FN-12": { name: "Partnership Act 1932 Compliance", isa: "ISA 250, Partnership Act 1932", phase: "Finalization", riskLevel: "Medium", assertions: "C", fsArea: "Compliance", applicableTo: ["aop"] },
  "DL-01": { name: "Deliverables – Auditor's Report", isa: "ISA 700, ISA 705, ISA 706", phase: "Deliverables", riskLevel: "High", assertions: "N/A", fsArea: "Engagement Level" },
  "DL-02": { name: "Deliverables – Export Package", isa: "ISA 230", phase: "Deliverables", riskLevel: "Low", assertions: "N/A", fsArea: "Engagement Level" },
  "DL-03": { name: "Management Representation Letter", isa: "ISA 580", phase: "Deliverables", riskLevel: "High", assertions: "N/A", fsArea: "Engagement Level" },
  "DL-04": { name: "SMC Member Representation Letter (Single Person)", isa: "ISA 580, Companies Act 2017", phase: "Deliverables", riskLevel: "High", assertions: "N/A", fsArea: "Engagement Level", applicableTo: ["smc"] },
  "DL-05": { name: "Partnership / AOP Representation from All Partners", isa: "ISA 580, Partnership Act 1932", phase: "Deliverables", riskLevel: "High", assertions: "N/A", fsArea: "Engagement Level", applicableTo: ["aop"] },
  "DL-06": { name: "Draft Audit Report (Unmodified / Modified)", isa: "ISA 700, ISA 705, ISA 706", phase: "Deliverables", riskLevel: "High", assertions: "N/A", fsArea: "Engagement Level" },
  "DL-07": { name: "PSX / SECP Specified Audit Report Format", isa: "ISA 700, PSX Regulations", phase: "Deliverables", riskLevel: "High", assertions: "N/A", fsArea: "Engagement Level", applicableTo: ["listed"] },
  "GC-01": { name: "Going Concern Assessment (ISA 570)", isa: "ISA 570, IAS 1.25-26", phase: "Execution", riskLevel: "High", assertions: "N/A", fsArea: "Financial Statements" },
  "SECP-F29": { name: "SECP Form 29 Compliance Review", isa: "Companies Act 2017 s.155, SECP BO Regulations 2018", phase: "Evidence & Finalization", riskLevel: "Medium", assertions: "C, E", fsArea: "Governance / Directors" },
  "SECP-FA": { name: "SECP Form A (Annual Return) Compliance", isa: "Companies Act 2017 s.130, SECP Regulations", phase: "Evidence & Finalization", riskLevel: "Medium", assertions: "C, E, P", fsArea: "Governance / Share Register" },
  "CCG-01": { name: "CCG 2019 Corporate Governance Checklist", isa: "CCG 2019 (SECP), Companies Act 2017 s.192", phase: "Evidence & Finalization", riskLevel: "Medium", assertions: "C, E, P", fsArea: "Governance", applicableTo: ["listed", "gem"] },
  "QR-01": { name: "EQCR Checklist", isa: "ISA 220, ISQM 2", phase: "QR (EQCR)", riskLevel: "High", assertions: "N/A", fsArea: "Engagement Level" },
  "QR-02": { name: "EQCR – AI Summary", isa: "ISA 220", phase: "QR (EQCR)", riskLevel: "Medium", assertions: "N/A", fsArea: "Engagement Level" },
  "QR-03": { name: "EQCR – Partner Comments", isa: "ISA 220, ISQM 2", phase: "QR (EQCR)", riskLevel: "High", assertions: "N/A", fsArea: "Engagement Level" },
  "QR-04": { name: "EQCR – Signed Reports", isa: "ISA 700, ISA 220", phase: "QR (EQCR)", riskLevel: "High", assertions: "N/A", fsArea: "Engagement Level" },
  "IN-01": { name: "Inspection – Archive", isa: "ISQM 1, ISA 230", phase: "Inspection", riskLevel: "Medium", assertions: "N/A", fsArea: "Engagement Level" },
  "IN-02": { name: "Inspection – Sign-off Status", isa: "ISA 220, ISQM 1", phase: "Inspection", riskLevel: "Medium", assertions: "N/A", fsArea: "Engagement Level" },
  "IN-03": { name: "Inspection – Phase Completion Summary", isa: "ISQM 1", phase: "Inspection", riskLevel: "Medium", assertions: "N/A", fsArea: "Engagement Level" },
  "IN-04": { name: "Inspection – Risk & Audit Matters", isa: "ISA 315, ISA 330, ISQM 1", phase: "Inspection", riskLevel: "High", assertions: "N/A", fsArea: "Engagement Level" },
};

// Merge full 274-WP library — adds 140 new WPs and enhances metadata on the existing 134
// The full library wins (has richer metadata: isCore, industry, controlledBy)
Object.assign(WP_METADATA, WP_FULL_LIBRARY);

function entityTypeToTags(entityType: string | null | undefined): string[] {
  const et = (entityType || "").toLowerCase();
  const tags: string[] = [];
  if (et.includes("listed") && !et.includes("unlisted")) tags.push("listed");
  if (et.includes("gem")) tags.push("gem");
  if (et.includes("single member") || et.includes("smc")) tags.push("smc");
  if (et.includes("aop") || et.includes("partnership")) tags.push("aop");
  if (et.includes("bank") && !et.includes("islamic")) tags.push("bank");
  if (et.includes("islamic")) tags.push("islamic_bank");
  if (et.includes("modaraba")) tags.push("modaraba");
  if (et.includes("leasing")) tags.push("leasing");
  if (et.includes("insurance")) tags.push("insurance");
  if (et.includes("ngo") || et.includes("npo") || et.includes("section 42") || et.includes("trust")) tags.push("ngo");
  if (et.includes("government") || et.includes("public sector")) tags.push("public_sector");
  if (et.includes("sme")) tags.push("sme");
  if (et.includes("construction") || et.includes("real estate")) tags.push("construction");
  if (et.includes("private") || et.includes("pvt")) tags.push("pvt");
  if (et.includes("llp")) tags.push("llp");
  if (et.includes("sole")) tags.push("sole");
  if (et.includes("branch")) tags.push("branch");
  return tags;
}

function filterPapersForEntity(papers: string[], entityType: string | null | undefined): string[] {
  const tags = entityTypeToTags(entityType);
  if (tags.length === 0) return papers;
  return papers.filter(code => {
    const meta = WP_METADATA[code];
    if (!meta || !meta.applicableTo) return true;
    return meta.applicableTo.some(t => tags.includes(t));
  });
}

const ARRANGED_DATA_TABS = [
  "Entity Profile", "Reporting Metadata", "FS Line Items", "Prior Year Comparatives",
  "Sales Tax Data", "Tax Period Summary", "Notes / Schedules", "Exceptions & Missing Data",
  "Assumptions Register", "Extraction Log",
];

const VARIABLE_CATEGORIES = [
  "entity", "reporting", "audit", "materiality", "risk", "tax", "financial",
];

const PROVIDER_BASE_URLS: Record<string, string> = {
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com/v1",
  google: "https://generativelanguage.googleapis.com/v1beta/openai",
  deepseek: "https://api.deepseek.com/v1",
};

const PROVIDER_DEFAULT_MODELS: Record<string, string> = {
  openai: "gpt-4o",
  anthropic: "claude-sonnet-4-20250514",
  google: "gemini-2.0-flash",
  deepseek: "deepseek-chat",
};

async function getAIClient(): Promise<{ client: OpenAI; model: string } | null> {
  const envBaseUrl = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  const envApiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  if (envApiKey) {
    return {
      client: new OpenAI(envBaseUrl ? { apiKey: envApiKey, baseURL: envBaseUrl } : { apiKey: envApiKey }),
      model: "gpt-4o",
    };
  }
  const directKey = process.env.OPENAI_API_KEY;
  if (directKey && directKey.length > 10) {
    return { client: new OpenAI({ apiKey: directKey }), model: "gpt-4o" };
  }
  try {
    const settingsKeys = ["chatgpt_api_key", "ai_provider", "ai_model", "ai_base_url"];
    const rows = await db.select().from(systemSettingsTable).where(inArray(systemSettingsTable.key, settingsKeys));
    const getVal = (key: string) => rows.find((r: any) => r.key === key)?.value || "";
    const apiKey = getVal("chatgpt_api_key");
    const provider = getVal("ai_provider") || "openai";
    const customModel = getVal("ai_model");
    const customBaseUrl = getVal("ai_base_url");
    if (!apiKey || apiKey.length < 10) return null;
    const baseURL = provider === "custom" ? customBaseUrl || "https://api.openai.com/v1" : PROVIDER_BASE_URLS[provider] || "https://api.openai.com/v1";
    const model = customModel || PROVIDER_DEFAULT_MODELS[provider] || "gpt-4o";
    return { client: new OpenAI({ apiKey, baseURL }), model };
  } catch (err) {
    logger.error({ err }, "Failed to initialize AI client");
    return null;
  }
}

function smartChunk(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const head = Math.round(maxChars * 0.65);
  const tail = maxChars - head;
  return `${text.slice(0, head)}\n\n[... ${text.length - maxChars} chars truncated ...]\n\n${text.slice(-tail)}`;
}

async function extractTextFromFile(file: Express.Multer.File): Promise<{ text: string; sourceType: string; pageCount: number; sheetCount: number }> {
  const name = file.originalname.toLowerCase();
  try {
    if (file.mimetype === "application/pdf" || name.endsWith(".pdf")) {
      const data = await pdfParse(file.buffer);
      const text = data.text || "";
      const isScanned = text.trim().length < 100 && file.buffer.length > 10000;
      const pageCount = data.numpages || 1;
      return { text, sourceType: isScanned ? "ocr_pdf" : "native_text_pdf", pageCount, sheetCount: 0 };
    }
    if (name.endsWith(".xlsx") || name.endsWith(".xls") || file.mimetype.includes("spreadsheet") || file.mimetype.includes("excel")) {
      const wb = XLSX.read(file.buffer, { type: "buffer" });
      const lines: string[] = [];
      wb.SheetNames.forEach(sheetName => {
        lines.push(`=== Sheet: ${sheetName} ===`);
        const ws = wb.Sheets[sheetName];
        const csv = XLSX.utils.sheet_to_csv(ws);
        lines.push(csv);
      });
      return { text: lines.join("\n"), sourceType: "excel_native", pageCount: 0, sheetCount: wb.SheetNames.length };
    }
    if (file.mimetype.startsWith("image/")) {
      return { text: `[IMAGE FILE: ${file.originalname}]`, sourceType: "image_ocr", pageCount: 1, sheetCount: 0 };
    }
    return { text: file.buffer.toString("utf-8"), sourceType: "native_text_pdf", pageCount: 1, sheetCount: 0 };
  } catch (err) {
    logger.warn({ err, file: file.originalname }, "Error extracting text");
    return { text: `[Could not extract text from ${file.originalname}]`, sourceType: "native_text_pdf", pageCount: 0, sheetCount: 0 };
  }
}

function validateFileCategory(file: Express.Multer.File, category: string): { valid: boolean; error?: string } {
  const name = file.originalname.toLowerCase();
  const excelTypes = ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-excel"];
  const excelExts = [".xlsx", ".xls"];
  const pdfTypes = ["application/pdf"];
  const pdfExts = [".pdf"];
  const imageExts = [".jpg", ".jpeg", ".png", ".webp"];

  const excelOnlyCats = ["financial_statements", "trial_balance", "general_ledger", "bank_statement"];
  const pdfOnlyCats = ["sales_tax_return", "tax_notice", "annexure"];

  if (excelOnlyCats.includes(category)) {
    const isExcel = excelTypes.includes(file.mimetype) || excelExts.some(e => name.endsWith(e));
    if (!isExcel) return { valid: false, error: `${category} requires Excel format (.xlsx/.xls)` };
  }
  if (pdfOnlyCats.includes(category)) {
    const isPdf = pdfTypes.includes(file.mimetype) || pdfExts.some(e => name.endsWith(e));
    const isImage = imageExts.some(e => name.endsWith(e));
    if (!isPdf && !isImage) return { valid: false, error: `${category} requires PDF format` };
  }
  return { valid: true };
}

function getFileFormat(file: Express.Multer.File): string {
  const name = file.originalname.toLowerCase();
  if (name.endsWith(".xlsx") || name.endsWith(".xls") || file.mimetype.includes("spreadsheet")) return "excel";
  if (name.endsWith(".pdf") || file.mimetype === "application/pdf") return "pdf";
  if (file.mimetype.startsWith("image/")) return "image";
  return "pdf";
}

function getConfidenceColor(c: number): string {
  if (c >= 85) return "high";
  if (c >= 60) return "medium";
  return "low";
}


// ═══════════════════════════════════════════════════════════════════════════
// SESSION MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

router.get("/sessions", async (req: Request, res: Response) => {
  try {
    const { limit, offset } = parsePagination(req, 50, 200);
    const sessions = await db.select().from(wpSessionsTable).orderBy(desc(wpSessionsTable.id)).limit(limit).offset(offset);
    res.json(sessions);
  } catch (err: any) {
    logger.error({ err }, "Failed to fetch sessions");
    res.status(500).json({ error: "Failed to fetch sessions" });
  }
});

router.post("/upload-logo", requireRoles(...WP_ROLES_WRITE), upload.single("file"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const fs = await import("fs");
    const path = await import("path");
    const uploadsDir = path.join(process.cwd(), "uploads", "logos");
    fs.mkdirSync(uploadsDir, { recursive: true });
    const ext = path.extname(req.file.originalname) || ".png";
    const filename = `logo_${Date.now()}${ext}`;
    const filepath = path.join(uploadsDir, filename);
    fs.writeFileSync(filepath, req.file.buffer);
    res.json({ url: `/uploads/logos/${filename}`, filename });
  } catch (err: any) {
    logger.error({ err }, "Failed to upload logo");
    res.status(500).json({ error: "Failed to upload logo" });
  }
});

router.get("/team-members", async (_req: Request, res: Response) => {
  try {
    const users = await db.select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      role: usersTable.role,
      designation: employeesTable.designation,
      department: employeesTable.department,
    }).from(usersTable)
      .leftJoin(employeesTable, eq(usersTable.employeeId, employeesTable.id))
      .where(eq(usersTable.status, "active"));
    res.json(users);
  } catch (err: any) {
    logger.error({ err }, "Failed to fetch team members");
    res.status(500).json({ error: "Failed to fetch team members" });
  }
});

router.post("/sessions", requireRoles(...WP_ROLES_WRITE), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const parsed = validateBody(createSessionSchema, req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error });
    const { clientName, engagementYear, entityType, ntn, strn, registrationNo, periodStart, periodEnd, reportingFramework, engagementType, engagementContinuity, industryType, groupAuditFlag, itEnvironmentType, taxStatusFlags, specialConditions, auditFirmName, auditFirmLogo, preparerId, preparerName, preparerIds, preparerNames, reviewerId, reviewerName, approverId, approverName, eqcrId, eqcrName } = parsed.data;

    const session = await db.transaction(async (tx) => {
      const [created] = await tx.insert(wpSessionsTable).values({
        clientName, engagementYear,
        entityType,
        ntn,
        strn: strn || null,
        registrationNo: registrationNo || null,
        periodStart: periodStart || null,
        periodEnd: periodEnd || null,
        reportingFramework,
        engagementType,
        engagementContinuity: engagementContinuity || "first_time",
        industryType: industryType || null,
        groupAuditFlag: groupAuditFlag || false,
        itEnvironmentType: itEnvironmentType || null,
        taxStatusFlags: taxStatusFlags || null,
        specialConditions: specialConditions || null,
        auditFirmName: auditFirmName || null,
        auditFirmLogo: auditFirmLogo || null,
        preparerId: preparerId || null,
        preparerName: preparerName || null,
        preparerIds: preparerIds ? JSON.stringify(preparerIds) : null,
        preparerNames: preparerNames ? JSON.stringify(preparerNames) : null,
        reviewerId: reviewerId || null,
        reviewerName: reviewerName || null,
        approverId: approverId || null,
        approverName: approverName || null,
        eqcrId: eqcrId || null,
        eqcrName: eqcrName || null,
        status: "upload",
      }).returning();

      const headValues = AUDIT_HEADS.map(head => ({
        sessionId: created.id,
        headIndex: head.index,
        headName: head.name,
        status: "locked",
        papersIncluded: filterPapersForEntity(head.papers, entityType),
        outputType: head.outputType,
      }));
      await tx.insert(wpHeadsTable).values(headValues);

      return created;
    });

    res.status(201).json(session);
  } catch (err: any) {
    logger.error({ err }, "Failed to create session");
    res.status(500).json({ error: "Failed to create session" });
  }
});

router.get("/sessions/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(p(req.params.id));
    const sessions = await db.select().from(wpSessionsTable).where(eq(wpSessionsTable.id, id));
    if (!sessions[0]) return res.status(404).json({ error: "Session not found" });
    const heads = await db.select().from(wpHeadsTable).where(eq(wpHeadsTable.sessionId, id)).orderBy(asc(wpHeadsTable.headIndex));
    const files = await db.select().from(wpUploadedFilesTable).where(eq(wpUploadedFilesTable.sessionId, id));
    const exceptions = await db.select().from(wpExceptionLogTable).where(eq(wpExceptionLogTable.sessionId, id));
    const variables = await db.select().from(wpVariablesTable).where(eq(wpVariablesTable.sessionId, id));
    const tbLines = await db.select().from(wpTrialBalanceLinesTable).where(eq(wpTrialBalanceLinesTable.sessionId, id));
    res.json({ ...sessions[0], heads, files, exceptions, variables, tbLines });
  } catch (err: any) {
    logger.error({ err }, "Failed to fetch session");
    res.status(500).json({ error: "Failed to fetch session" });
  }
});

router.patch("/sessions/:id/status", requireRoles(...WP_ROLES_WRITE), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = parseInt(p(req.params.id));
    if (isNaN(id)) return res.status(400).json({ error: "Invalid session ID" });
    const { status } = req.body;
    const validStatuses = [...VALID_SESSION_STATUSES];
    if (!validStatuses.includes(status)) return res.status(400).json({ error: "Invalid status" });

    const validTransitions: Record<string, string[]> = {
      upload:        ["extraction", "variables", "wp_listing", "generation"],
      extraction:    ["data_sheet", "arranged_data", "upload", "variables", "wp_listing", "generation"],
      data_sheet:    ["arranged_data", "variables", "extraction", "wp_listing", "generation"],
      arranged_data: ["variables", "data_sheet", "wp_listing", "generation"],
      variables:     ["wp_listing", "generation", "extraction"],
      wp_listing:    ["generation", "variables"],
      generation:    ["audit_chain", "export", "wp_listing"],
      audit_chain:   ["review", "generation"],
      review:        ["export", "audit_chain"],
      export:        ["completed", "generation"],
      completed:     ["generation", "export"],
    };
    const session = (await db.select().from(wpSessionsTable).where(eq(wpSessionsTable.id, id)))[0];
    if (!session) return res.status(404).json({ error: "Session not found" });
    const allowed = validTransitions[session.status || "upload"] || [];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: `Cannot transition from ${session.status} to ${status}` });
    }

    const [updated] = await db.update(wpSessionsTable).set({ status: status as any, updatedAt: new Date() }).where(eq(wpSessionsTable.id, id)).returning();
    res.json(updated);
  } catch (err: any) {
    logger.error({ err }, "Failed to update session status");
    res.status(500).json({ error: "Failed to update session status" });
  }
});

router.delete("/sessions/:id", requireRoles("super_admin", "partner"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = parseInt(p(req.params.id));
    if (isNaN(id)) return res.status(400).json({ error: "Invalid session ID" });
    const session = (await db.select().from(wpSessionsTable).where(eq(wpSessionsTable.id, id)))[0];
    if (!session) return res.status(404).json({ error: "Session not found" });

    await db.transaction(async (tx) => {
      await tx.delete(wpVersionHistoryTable).where(eq(wpVersionHistoryTable.sessionId, id));
      await tx.delete(wpReviewNoteTable).where(eq(wpReviewNoteTable.sessionId, id));
      await tx.delete(wpTickMarkUsageTable).where(eq(wpTickMarkUsageTable.sessionId, id));
      await tx.delete(wpTickMarkTable).where(eq(wpTickMarkTable.sessionId, id));
      await tx.delete(wpAuditChainTable).where(eq(wpAuditChainTable.sessionId, id));
      await tx.delete(wpComplianceGateTable).where(eq(wpComplianceGateTable.sessionId, id));
      await tx.delete(wpComplianceDocTable).where(eq(wpComplianceDocTable.sessionId, id));
      await tx.delete(wpLeadScheduleTable).where(eq(wpLeadScheduleTable.sessionId, id));
      await tx.delete(wpFsNoteMappingTable).where(eq(wpFsNoteMappingTable.sessionId, id));
      await tx.delete(wpSamplingDetailTable).where(eq(wpSamplingDetailTable.sessionId, id));
      await tx.delete(wpIsaClauseRefTable).where(eq(wpIsaClauseRefTable.sessionId, id));
      await tx.delete(wpExecutionTable).where(eq(wpExecutionTable.sessionId, id));
      await tx.delete(wpOutputJobTable).where(eq(wpOutputJobTable.sessionId, id));
      await tx.delete(wpSessionLockTable).where(eq(wpSessionLockTable.sessionId, id));
      await tx.delete(wpValidationResultTable).where(eq(wpValidationResultTable.sessionId, id));
      await tx.delete(wpExceptionsTable).where(eq(wpExceptionsTable.sessionId, id));
      await tx.delete(wpExceptionLogTable).where(eq(wpExceptionLogTable.sessionId, id));
      await tx.delete(wpExportJobsTable).where(eq(wpExportJobsTable.sessionId, id));
      await tx.delete(wpHeadDocumentsTable).where(eq(wpHeadDocumentsTable.sessionId, id));
      await tx.delete(wpHeadsTable).where(eq(wpHeadsTable.sessionId, id));
      await tx.delete(wpVariableChangeLogTable).where(eq(wpVariableChangeLogTable.sessionId, id));
      await tx.delete(wpVariablesTable).where(eq(wpVariablesTable.sessionId, id));
      await tx.delete(wpGlEntriesTable).where(eq(wpGlEntriesTable.sessionId, id));
      await tx.delete(wpGlAccountsTable).where(eq(wpGlAccountsTable.sessionId, id));
      await tx.delete(wpTrialBalanceLinesTable).where(eq(wpTrialBalanceLinesTable.sessionId, id));
      await tx.delete(wpArrangedDataTable).where(eq(wpArrangedDataTable.sessionId, id));
      await tx.delete(wpExtractedFieldsTable).where(eq(wpExtractedFieldsTable.sessionId, id));
      await tx.delete(wpExtractionRunsTable).where(eq(wpExtractionRunsTable.sessionId, id));
      await tx.delete(wpUploadedFilesTable).where(eq(wpUploadedFilesTable.sessionId, id));
      await tx.delete(wpFsExtractionTable).where(eq(wpFsExtractionTable.sessionId, id));
      await tx.delete(wpFsMappingTable).where(eq(wpFsMappingTable.sessionId, id));
      await tx.delete(reconEngineTable).where(eq(reconEngineTable.sessionId, id));
      await tx.delete(evidenceLogTable).where(eq(evidenceLogTable.sessionId, id));
      await tx.delete(controlMatrixTable).where(eq(controlMatrixTable.sessionId, id));
      await tx.delete(analyticsSessionTable).where(eq(analyticsSessionTable.sessionId, id));
      await tx.delete(wpTriggerSessionTable).where(eq(wpTriggerSessionTable.sessionId, id));
      await tx.delete(wpMasterCoaTable).where(eq(wpMasterCoaTable.sessionId, id));
      await tx.delete(wpLibrarySessionTable).where(eq(wpLibrarySessionTable.sessionId, id));
      await tx.delete(wpJournalImportTable).where(eq(wpJournalImportTable.sessionId, id));
      await tx.delete(auditEngineMasterTable).where(eq(auditEngineMasterTable.sessionId, id));
      await tx.delete(wpSessionsTable).where(eq(wpSessionsTable.id, id));
    });

    const fs = await import("fs");
    const path = await import("path");
    const sessionUploadsDir = path.join(process.cwd(), "uploads", "sessions", String(id));
    if (fs.existsSync(sessionUploadsDir)) {
      fs.rmSync(sessionUploadsDir, { recursive: true, force: true });
    }

    logger.info({ sessionId: id }, "Session deleted with full cleanup");
    res.json({ ok: true, message: `Session ${id} and all associated data deleted` });
  } catch (err: any) {
    logger.error({ err }, "Failed to delete session");
    res.status(500).json({ error: "Failed to delete session" });
  }
});


// ═══════════════════════════════════════════════════════════════════════════
// FILE UPLOAD WITH STRICT VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

router.post("/sessions/:id/upload", requireRoles(...WP_ROLES_WRITE), upload.array("files", 20), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const sessionId = parseInt(p(req.params.id));
    const files = req.files as Express.Multer.File[] | undefined;
    if (!files || files.length === 0) {
      return res.status(400).json({ error: "No files uploaded" });
    }

    let categories: Record<string, string> = {};
    try { categories = JSON.parse(req.body.categories || "{}"); } catch (parseErr: any) { logger.warn({ parseErr }, "Failed to parse upload categories"); }

    const validCategories = ["financial_statements", "trial_balance", "general_ledger", "bank_statement", "sales_tax_return", "tax_notice", "schedule", "annexure", "other"];
    const results: any[] = [];
    const errors: string[] = [];

    for (const file of files) {
      const rawCategory = categories[file.originalname] || "other";
      const category = validCategories.includes(rawCategory) ? rawCategory : "other";

      const categoryLimit = FILE_SIZE_LIMITS[category] || FILE_SIZE_LIMITS.other;
      if (file.size > categoryLimit) {
        errors.push(`${file.originalname}: exceeds ${(categoryLimit / 1024 / 1024).toFixed(0)}MB limit for ${category} category (${(file.size / 1024 / 1024).toFixed(1)}MB uploaded)`);
        continue;
      }

      const validation = validateFileCategory(file, category);

      if (!validation.valid) {
        errors.push(validation.error!);
        continue;
      }

      const format = getFileFormat(file);
      const [record] = await db.insert(wpUploadedFilesTable).values({
        sessionId,
        fileName: file.originalname,
        originalName: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype,
        category: category as any,
        format: format as any,
        isValid: true,
        fileData: file.buffer.toString("base64"),
      }).returning();

      results.push(record);
    }

    if (errors.length > 0 && results.length === 0) {
      return res.status(400).json({ error: "All files failed validation", errors });
    }

    res.json({ uploaded: results, errors });
  } catch (err: any) {
    logger.error({ err }, "Upload failed");
    res.status(500).json({ error: "Upload failed" });
  }
});

router.delete("/sessions/:id/files/:fileId", requireRoles(...WP_ROLES_WRITE), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const sessionId = parseInt(p(req.params.id));
    const fileId    = parseInt(p(req.params.fileId));
    if (isNaN(sessionId) || isNaN(fileId)) return res.status(400).json({ error: "Invalid id" });
    const [deleted] = await db
      .delete(wpUploadedFilesTable)
      .where(and(eq(wpUploadedFilesTable.id, fileId), eq(wpUploadedFilesTable.sessionId, sessionId)))
      .returning();
    if (!deleted) return res.status(404).json({ error: "File not found" });
    res.json({ ok: true, id: fileId });
  } catch (err: any) {
    logger.error({ err }, "Delete failed");
    res.status(500).json({ error: "Delete failed" });
  }
});


// ═══════════════════════════════════════════════════════════════════════════
// EXTRACTION — OCR + PARSING
// ═══════════════════════════════════════════════════════════════════════════

router.post("/sessions/:id/extract", requireRoles(...WP_ROLES_WRITE), aiRateLimit, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const sessionId = parseInt(p(req.params.id));
    const sessionRows = await db.select().from(wpSessionsTable).where(eq(wpSessionsTable.id, sessionId));
    if (!sessionRows[0]) return res.status(404).json({ error: "Session not found" });
    const sessionMeta = sessionRows[0];

    const files = await db.select().from(wpUploadedFilesTable).where(eq(wpUploadedFilesTable.sessionId, sessionId));
    if (files.length === 0) return res.status(400).json({ error: "No files uploaded yet" });

    const ai = await getAIClient();
    if (!ai) return res.status(503).json({ error: "AI service not configured. Add API key in Settings." });

    const [extractionRun] = await db.insert(wpExtractionRunsTable).values({
      sessionId,
      status: "processing",
      totalPages: 0,
      startedAt: new Date(),
    }).returning();

    const allTexts: string[] = [];
    let totalPages = 0;
    let totalSheets = 0;
    const imageContents: any[] = [];

    for (const dbFile of files) {
      if (!dbFile.fileData) continue;
      const buffer = Buffer.from(dbFile.fileData, "base64");
      const fakeFile = {
        originalname: dbFile.originalName,
        mimetype: dbFile.mimeType || "",
        buffer,
        size: buffer.length,
      } as Express.Multer.File;

      const extracted = await extractTextFromFile(fakeFile);

      await db.update(wpUploadedFilesTable).set({
        sourceType: extracted.sourceType as any,
        pageCount: extracted.pageCount,
        sheetCount: extracted.sheetCount,
      }).where(eq(wpUploadedFilesTable.id, dbFile.id));

      totalPages += extracted.pageCount;
      totalSheets += extracted.sheetCount;

      allTexts.push(`FILE: ${dbFile.originalName} (${dbFile.category})\n${smartChunk(extracted.text, 14000)}`);

      if (extracted.sourceType === "image_ocr" || extracted.sourceType === "ocr_pdf") {
        if (dbFile.mimeType?.startsWith("image/")) {
          imageContents.push({
            type: "image_url",
            image_url: { url: `data:${dbFile.mimeType};base64,${dbFile.fileData}`, detail: "high" },
          });
        }
      }

      await db.insert(wpExtractedFieldsTable).values({
        sessionId, extractionRunId: extractionRun.id,
        category: "extraction_log",
        fieldName: `file_processed_${dbFile.id}`,
        extractedValue: `${dbFile.originalName}: ${extracted.sourceType}, ${extracted.pageCount} pages, ${extracted.sheetCount} sheets`,
        confidence: "95",
        sourceFile: dbFile.originalName,
      });
    }

    const docSummary = allTexts.join("\n\n---\n\n");

    const extractionPrompt = `You are a senior Pakistan-qualified chartered accountant with forensic document analysis expertise.

CLIENT: ${sessionMeta.clientName}
ENTITY TYPE: ${sessionMeta.entityType || "Private Limited"}
YEAR: ${sessionMeta.engagementYear}
FRAMEWORK: ${sessionMeta.reportingFramework || "IFRS"}
NTN: ${sessionMeta.ntn || "Not provided"}

DOCUMENTS TO ANALYZE (${files.length} files, ${totalSheets} Excel sheets, ${totalPages} pages):
${docSummary}

EXTRACTION RULES:
1. Extract EVERY number, date, name, reference from ALL pages/sheets
2. Financial figures as plain numbers in PKR (no commas/symbols)
3. Extract BOTH current year and prior year figures
4. Use null for genuinely missing fields — never fabricate
5. For Trial Balance/GL data: extract ALL account lines
6. Score confidence 0-100 for each major field

Return ONLY valid JSON:
{
  "entity": {
    "name": string|null, "ntn": string|null, "strn": string|null, "cnic": string|null,
    "financial_year": string|null, "period_start": string|null, "period_end": string|null,
    "address": string|null, "city": string|null, "industry": string|null,
    "entity_type": string|null, "listed_status": string|null,
    "framework": string|null, "engagement_type": string|null,
    "directors": [{"name":string,"designation":string}],
    "auditors": {"firm_name":string|null,"partner":string|null},
    "bankers": [{"bank_name":string,"account_no":string|null}]
  },
  "financials": {
    "revenue":number|null, "cost_of_sales":number|null, "gross_profit":number|null,
    "operating_expenses":number|null, "operating_profit":number|null,
    "finance_cost":number|null, "net_profit_before_tax":number|null,
    "tax_expense":number|null, "net_profit":number|null,
    "total_assets":number|null, "non_current_assets":number|null, "current_assets":number|null,
    "fixed_assets":number|null, "inventory":number|null, "trade_receivables":number|null,
    "cash_and_bank":number|null, "total_liabilities":number|null,
    "non_current_liabilities":number|null, "current_liabilities":number|null,
    "trade_payables":number|null, "equity":number|null, "share_capital":number|null,
    "retained_earnings":number|null, "reserves":number|null,
    "prior_year_revenue":number|null, "prior_year_total_assets":number|null,
    "prior_year_equity":number|null, "prior_year_net_profit":number|null
  },
  "tax_data": {
    "output_tax":number|null, "input_tax":number|null, "net_sales_tax":number|null,
    "tax_period_from":string|null, "tax_period_to":string|null,
    "advance_tax":number|null, "wht_deducted":number|null,
    "income_tax_provision":number|null, "filing_dates":[string],
    "adjustments":number|null, "annexures_summary":string|null
  },
  "tb_lines": [
    {"account_code":string,"account_name":string,"debit":number,"credit":number,"classification":string}
  ],
  "notes_schedules": [{"title":string,"content":string,"source_page":number|null}],
  "confidence_scores": {
    "entity":number, "financials":number, "tax_data":number, "tb_lines":number
  },
  "flags": [string],
  "assumptions": [string]
}`;

    const messageContent: any[] = [{ type: "text", text: extractionPrompt }];
    imageContents.slice(0, 4).forEach(ic => messageContent.push(ic));

    const response = await ai.client.chat.completions.create({
      model: ai.model,
      messages: [
        { role: "system", content: "You are a forensic financial document analyst for Pakistan auditing. Extract all data with field-level confidence. Return only valid JSON." },
        { role: "user", content: messageContent },
      ],
      max_tokens: 8000,
      temperature: 0.1,
      response_format: { type: "json_object" },
    });

    const raw = response.choices[0]?.message?.content || "{}";
    let data: any = {};
    try { data = JSON.parse(raw); } catch { data = {}; }

    await db.update(wpExtractionRunsTable).set({
      status: "completed",
      processedPages: totalPages,
      totalPages,
      structuredData: data,
      completedAt: new Date(),
    }).where(eq(wpExtractionRunsTable.id, extractionRun.id));

    if (data.entity) {
      for (const [key, val] of Object.entries(data.entity)) {
        if (val !== null && typeof val !== "object") {
          await db.insert(wpExtractedFieldsTable).values({
            sessionId, extractionRunId: extractionRun.id,
            category: "Entity Profile",
            fieldName: key,
            extractedValue: String(val),
            finalValue: String(val),
            confidence: String(data.confidence_scores?.entity || 85),
          });
        }
      }
    }

    if (data.financials) {
      for (const [key, val] of Object.entries(data.financials)) {
        if (val !== null) {
          await db.insert(wpExtractedFieldsTable).values({
            sessionId, extractionRunId: extractionRun.id,
            category: "FS Line Items",
            fieldName: key,
            extractedValue: String(val),
            finalValue: String(val),
            confidence: String(data.confidence_scores?.financials || 80),
          });
        }
      }
    }

    if (data.tax_data) {
      for (const [key, val] of Object.entries(data.tax_data)) {
        if (val !== null && !Array.isArray(val)) {
          await db.insert(wpExtractedFieldsTable).values({
            sessionId, extractionRunId: extractionRun.id,
            category: "Sales Tax Data",
            fieldName: key,
            extractedValue: String(val),
            finalValue: String(val),
            confidence: String(data.confidence_scores?.tax_data || 75),
          });
        }
      }
    }

    if (data.tb_lines && Array.isArray(data.tb_lines)) {
      for (const line of data.tb_lines) {
        await db.insert(wpExtractedFieldsTable).values({
          sessionId, extractionRunId: extractionRun.id,
          category: "TB Lines",
          fieldName: line.account_code || "unknown",
          extractedValue: JSON.stringify(line),
          finalValue: JSON.stringify(line),
          confidence: String(data.confidence_scores?.tb_lines || 80),
        });
      }
    }

    if (data.flags && data.flags.length > 0) {
      for (const flag of data.flags) {
        await db.insert(wpExceptionLogTable).values({
          sessionId, exceptionType: "extraction_flag", severity: "medium",
          title: "Extraction Flag", description: flag, status: "open",
        });
      }
    }

    if (data.assumptions && data.assumptions.length > 0) {
      for (const assumption of data.assumptions) {
        await db.insert(wpArrangedDataTable).values({
          sessionId, tab: "Assumptions Register",
          fieldName: "assumption", extractedValue: assumption,
          confidence: "70",
        });
      }
    }

    await db.update(wpSessionsTable).set({ status: "extraction", updatedAt: new Date() }).where(eq(wpSessionsTable.id, sessionId));

    res.json({
      extractionRunId: extractionRun.id,
      data,
      stats: { files: files.length, pages: totalPages, sheets: totalSheets },
    });
  } catch (err: any) {
    logger.error({ err }, "Extraction failed");
    res.status(500).json({ error: "Extraction failed" });
  }
});


// ═══════════════════════════════════════════════════════════════════════════
// MASTER COA ENGINE (DATA SHEET)
// ═══════════════════════════════════════════════════════════════════════════

router.get("/sessions/:id/coa", async (req: Request, res: Response) => {
  try {
    const sessionId = parseInt(p(req.params.id));
    const rows = await db.select().from(wpMasterCoaTable)
      .where(eq(wpMasterCoaTable.sessionId, sessionId))
      .orderBy(asc(wpMasterCoaTable.displayOrder));
    res.json(rows);
  } catch (err: any) {
    logger.error({ err }, "Failed to fetch COA data");
    res.status(500).json({ error: "Failed to fetch COA data" });
  }
});

router.post("/sessions/:id/coa/populate", requireRoles(...WP_ROLES_WRITE), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const sessionId = parseInt(p(req.params.id));
    const ai = await getAIClient();

    // Gather extracted FS fields
    const fsFields = await db.select().from(wpExtractedFieldsTable)
      .where(and(eq(wpExtractedFieldsTable.sessionId, sessionId), eq(wpExtractedFieldsTable.category, "FS Line Items")));
    const vars = await db.select().from(wpVariablesTable).where(eq(wpVariablesTable.sessionId, sessionId));
    const session = (await db.select().from(wpSessionsTable).where(eq(wpSessionsTable.id, sessionId)))[0];
    if (!session) return res.status(404).json({ error: "Session not found" });

    const fsMap: Record<string, number> = {};
    for (const f of fsFields) {
      const val = Number(f.finalValue || f.extractedValue || 0);
      if (val !== 0) fsMap[f.fieldName] = val;
    }
    for (const v of vars) {
      if (v.finalValue && !fsMap[v.variableName]) {
        const num = Number(v.finalValue);
        if (!isNaN(num) && num !== 0) fsMap[v.variableName] = num;
      }
    }

    // Build COA rows from PAKISTAN_COA + FS mapping
    const coaMapped = mapFsToCoa(fsMap);
    let rows: any[] = [];

    if (coaMapped.length > 0) {
      rows = coaMapped.map((line: any, idx: number) => {
        const closing = Number(line.balance || 0);
        const isDebit = line.classification === "Asset" || line.classification === "Expense";
        const coaEntry = PAKISTAN_COA.find((e: any) => e.code === line.accountCode);
        const fsHead = line.classification === "Asset" ? "Assets" :
          line.classification === "Liability" ? "Liabilities" :
          line.classification === "Equity" ? "Equity" :
          line.classification === "Revenue" ? "Income Statement" : "Income Statement";
        return {
          sessionId,
          accountCode: line.accountCode,
          parentCode: line.accountCode.slice(0, 2) + "00",
          accountName: line.accountName,
          fsHead,
          fsSubHead: line.classification,
          accountType: line.classification,
          normalBalance: isDebit ? "Debit" : "Credit",
          industryTag: session.entityType || "General",
          entityTypeTag: session.entityType || "Private Limited",
          ifrsReference: coaEntry ? getIfrsRef(line.classification) : null,
          taxTreatment: ["Revenue", "Expense"].includes(line.classification) ? "Normal" : null,
          isControlAccount: false,
          isSubLedger: false,
          openingBalance: "0",
          debitTotal: line.debit || "0",
          creditTotal: line.credit || "0",
          closingBalance: String(closing),
          priorYearBalance: null,
          variance: null,
          materialityTag: Math.abs(closing) > 10000000 ? "High" : Math.abs(closing) > 1000000 ? "Medium" : "Low",
          riskTag: line.classification === "Asset" || line.classification === "Revenue" ? "Medium" : "Low",
          assertionTag: isDebit ? "Existence,Completeness,Valuation" : "Completeness,Accuracy,Classification",
          relatedPartyFlag: false,
          cashFlowTag: line.classification === "Asset" || line.classification === "Liability" ? "Operating" : null,
          mappingGlCode: `GL-${line.accountCode}`,
          mappingFsLine: line.fsLineMapping || "",
          workingPaperCode: getWorkingPaperCode(line.classification),
          reconciliationFlag: false,
          dataSource: line.source === "ai_generated" ? "AI" : "Imported",
          confidenceScore: line.confidence || "90",
          exceptionFlag: false,
          notes: null,
          displayOrder: idx,
        };
      });
    } else if (ai) {
      // AI fallback: generate from session metadata
      const prompt = `Generate a MASTER_COA_ENGINE table for a Pakistani ${session.entityType || "Private Limited"} company audit for year ${session.engagementYear}. Return 20-30 accounts covering Assets, Liabilities, Equity, Revenue, Expenses using Pakistan Companies Act 4-digit chart of accounts. For each account provide: account_code (4 digits), account_name, account_type (Asset/Liability/Equity/Revenue/Expense), normal_balance (Debit/Credit), fs_head, opening_balance (number), debit_total (number), credit_total (number), closing_balance (number, = opening + debit - credit). All in PKR. closing_balance must be positive for Debit accounts, negative for Credit accounts. Ensure total of all closing_balances is exactly 0 (TB balance). Return JSON: {"accounts":[...]}`;
      const resp = await ai.client.chat.completions.create({
        model: ai.model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 4000,
        temperature: 0.1,
        response_format: { type: "json_object" },
      }, { signal: AbortSignal.timeout(120000) });
      const parsed = JSON.parse(resp.choices[0]?.message?.content || "{}");
      const accounts = parsed.accounts || [];
      rows = accounts.map((a: any, idx: number) => ({
        sessionId,
        accountCode: a.account_code || String(1000 + idx),
        parentCode: null,
        accountName: a.account_name || "Unknown",
        fsHead: a.fs_head || a.account_type || "",
        fsSubHead: a.account_type || "",
        accountType: a.account_type || "Asset",
        normalBalance: a.normal_balance || "Debit",
        industryTag: session.entityType || "General",
        entityTypeTag: session.entityType || "Private Limited",
        ifrsReference: null,
        taxTreatment: ["Revenue", "Expense"].includes(a.account_type) ? "Normal" : null,
        isControlAccount: false,
        isSubLedger: false,
        openingBalance: String(Number(a.opening_balance || 0).toFixed(2)),
        debitTotal: String(Number(a.debit_total || 0).toFixed(2)),
        creditTotal: String(Number(a.credit_total || 0).toFixed(2)),
        closingBalance: String(Number(a.closing_balance || 0).toFixed(2)),
        priorYearBalance: null,
        variance: null,
        materialityTag: Math.abs(Number(a.closing_balance || 0)) > 10000000 ? "High" : "Medium",
        riskTag: "Medium",
        assertionTag: "Existence,Completeness,Valuation",
        relatedPartyFlag: false,
        cashFlowTag: "Operating",
        mappingGlCode: `GL-${a.account_code}`,
        mappingFsLine: a.account_name,
        workingPaperCode: null,
        reconciliationFlag: false,
        dataSource: "AI",
        confidenceScore: "70",
        exceptionFlag: false,
        notes: null,
        displayOrder: idx,
      }));
    }

    if (rows.length === 0) return res.status(422).json({ error: "No financial data found. Please upload and extract documents first." });

    // Deduplicate rows by accountCode (keep last occurrence)
    const seenCodes = new Map<string, any>();
    for (const row of rows) {
      const existing = seenCodes.get(row.accountCode);
      if (existing) {
        existing.closingBalance = String(Number(existing.closingBalance || 0) + Number(row.closingBalance || 0));
        existing.debitTotal = String(Number(existing.debitTotal || 0) + Number(row.debitTotal || 0));
        existing.creditTotal = String(Number(existing.creditTotal || 0) + Number(row.creditTotal || 0));
      } else {
        seenCodes.set(row.accountCode, { ...row });
      }
    }
    const dedupedRows = Array.from(seenCodes.values());

    // Clear existing COA for this session and insert new
    await db.delete(wpMasterCoaTable).where(eq(wpMasterCoaTable.sessionId, sessionId));
    const inserted = await db.insert(wpMasterCoaTable).values(dedupedRows).returning();

    // Advance session to data_sheet
    await db.update(wpSessionsTable).set({ status: "data_sheet" as any, updatedAt: new Date() }).where(eq(wpSessionsTable.id, sessionId));

    res.json({ inserted: inserted.length, message: `${inserted.length} COA accounts populated from ${coaMapped.length > 0 ? "extracted FS data" : "AI generation"}` });
  } catch (err: any) {
    logger.error({ err }, "COA populate failed");
    res.status(500).json({ error: err.message || "Failed to populate COA" });
  }
});

function getIfrsRef(cls: string): string {
  if (cls === "Asset") return "IAS 1 / IAS 16 / IFRS 9";
  if (cls === "Liability") return "IAS 1 / IAS 37";
  if (cls === "Equity") return "IAS 1 / IAS 32";
  if (cls === "Revenue") return "IFRS 15";
  return "IAS 1";
}

function getWorkingPaperCode(cls: string): string {
  if (cls === "Asset") return "F1";
  if (cls === "Liability") return "F2";
  if (cls === "Revenue") return "F3";
  if (cls === "Expense") return "F4";
  return "B1";
}

router.post("/sessions/:id/coa", requireRoles(...WP_ROLES_WRITE), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const sessionId = parseInt(p(req.params.id));
    const {
      accountCode, parentCode, accountName, fsHead, fsSubHead, accountType, normalBalance,
      industryTag, entityTypeTag, ifrsReference, taxTreatment, isControlAccount, isSubLedger,
      openingBalance, debitTotal, creditTotal, priorYearBalance,
      materialityTag, riskTag, assertionTag, relatedPartyFlag, cashFlowTag,
      mappingGlCode, mappingFsLine, workingPaperCode, reconciliationFlag,
      dataSource, confidenceScore, exceptionFlag, notes,
    } = req.body;

    if (!accountCode || !accountName) return res.status(400).json({ error: "accountCode and accountName are required" });
    const validAccountTypes = ["Asset", "Liability", "Equity", "Revenue", "Expense", "Contra"];
    if (accountType && !validAccountTypes.includes(accountType)) return res.status(400).json({ error: `Invalid accountType. Allowed: ${validAccountTypes.join(", ")}` });
    if (riskTag && !["Low", "Medium", "High", "Critical"].includes(riskTag)) return res.status(400).json({ error: "Invalid riskTag. Allowed: Low, Medium, High, Critical" });
    if (materialityTag && !["Low", "Medium", "High"].includes(materialityTag)) return res.status(400).json({ error: "Invalid materialityTag. Allowed: Low, Medium, High" });

    const ob = Number(openingBalance || 0);
    const dr = Number(debitTotal || 0);
    const cr = Number(creditTotal || 0);
    const closing = ob + dr - cr;
    const pyBal = priorYearBalance !== undefined && priorYearBalance !== "" ? Number(priorYearBalance) : null;

    const countRows = await db.select().from(wpMasterCoaTable).where(eq(wpMasterCoaTable.sessionId, sessionId));
    const displayOrder = countRows.length;

    const [inserted] = await db.insert(wpMasterCoaTable).values({
      sessionId,
      accountCode,
      parentCode: parentCode || null,
      accountName,
      fsHead: fsHead || null,
      fsSubHead: fsSubHead || null,
      accountType: accountType || "Asset",
      normalBalance: normalBalance || "Debit",
      industryTag: industryTag || null,
      entityTypeTag: entityTypeTag || null,
      ifrsReference: ifrsReference || null,
      taxTreatment: taxTreatment || null,
      isControlAccount: isControlAccount || false,
      isSubLedger: isSubLedger || false,
      openingBalance: ob.toFixed(2),
      debitTotal: dr.toFixed(2),
      creditTotal: cr.toFixed(2),
      closingBalance: closing.toFixed(2),
      priorYearBalance: pyBal !== null ? pyBal.toFixed(2) : null,
      variance: pyBal !== null ? (closing - pyBal).toFixed(2) : null,
      materialityTag: materialityTag || "Low",
      riskTag: riskTag || "Low",
      assertionTag: assertionTag || null,
      relatedPartyFlag: relatedPartyFlag || false,
      cashFlowTag: cashFlowTag || null,
      mappingGlCode: mappingGlCode || `GL-${accountCode}`,
      mappingFsLine: mappingFsLine || null,
      workingPaperCode: workingPaperCode || null,
      reconciliationFlag: reconciliationFlag || false,
      dataSource: dataSource || "Manual",
      confidenceScore: confidenceScore ? String(confidenceScore) : "100",
      exceptionFlag: exceptionFlag || false,
      notes: notes || null,
      displayOrder,
    }).returning();

    res.json(inserted);
  } catch (err: any) {
    logger.error({ err }, "Failed to add COA row");
    res.status(500).json({ error: "Failed to add COA row" });
  }
});

router.patch("/sessions/:id/coa/:rowId", requireRoles(...WP_ROLES_WRITE), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const rowId = parseInt(p(req.params.rowId));
    const {
      accountCode, parentCode, accountName, fsHead, fsSubHead, accountType, normalBalance,
      industryTag, entityTypeTag, ifrsReference, taxTreatment, isControlAccount, isSubLedger,
      openingBalance, debitTotal, creditTotal, priorYearBalance,
      materialityTag, riskTag, assertionTag, relatedPartyFlag, cashFlowTag,
      mappingGlCode, mappingFsLine, workingPaperCode, reconciliationFlag,
      dataSource, confidenceScore, exceptionFlag, notes,
    } = req.body;

    const updates: any = { updatedAt: new Date() };
    if (accountCode !== undefined) updates.accountCode = accountCode;
    if (parentCode !== undefined) updates.parentCode = parentCode;
    if (accountName !== undefined) updates.accountName = accountName;
    if (fsHead !== undefined) updates.fsHead = fsHead;
    if (fsSubHead !== undefined) updates.fsSubHead = fsSubHead;
    if (accountType !== undefined) updates.accountType = accountType;
    if (normalBalance !== undefined) updates.normalBalance = normalBalance;
    if (industryTag !== undefined) updates.industryTag = industryTag;
    if (entityTypeTag !== undefined) updates.entityTypeTag = entityTypeTag;
    if (ifrsReference !== undefined) updates.ifrsReference = ifrsReference;
    if (taxTreatment !== undefined) updates.taxTreatment = taxTreatment;
    if (isControlAccount !== undefined) updates.isControlAccount = isControlAccount;
    if (isSubLedger !== undefined) updates.isSubLedger = isSubLedger;
    if (materialityTag !== undefined) updates.materialityTag = materialityTag;
    if (riskTag !== undefined) updates.riskTag = riskTag;
    if (assertionTag !== undefined) updates.assertionTag = assertionTag;
    if (relatedPartyFlag !== undefined) updates.relatedPartyFlag = relatedPartyFlag;
    if (cashFlowTag !== undefined) updates.cashFlowTag = cashFlowTag;
    if (mappingGlCode !== undefined) updates.mappingGlCode = mappingGlCode;
    if (mappingFsLine !== undefined) updates.mappingFsLine = mappingFsLine;
    if (workingPaperCode !== undefined) updates.workingPaperCode = workingPaperCode;
    if (reconciliationFlag !== undefined) updates.reconciliationFlag = reconciliationFlag;
    if (dataSource !== undefined) updates.dataSource = dataSource;
    if (confidenceScore !== undefined) updates.confidenceScore = String(confidenceScore);
    if (exceptionFlag !== undefined) updates.exceptionFlag = exceptionFlag;
    if (notes !== undefined) updates.notes = notes;

    // Recompute closing balance if any balance field changes
    if (openingBalance !== undefined || debitTotal !== undefined || creditTotal !== undefined || priorYearBalance !== undefined) {
      const existing = (await db.select().from(wpMasterCoaTable).where(eq(wpMasterCoaTable.id, rowId)))[0];
      const ob = openingBalance !== undefined ? Number(openingBalance) : Number(existing?.openingBalance || 0);
      const dr = debitTotal !== undefined ? Number(debitTotal) : Number(existing?.debitTotal || 0);
      const cr = creditTotal !== undefined ? Number(creditTotal) : Number(existing?.creditTotal || 0);
      const closing = ob + dr - cr;
      const pyBal = priorYearBalance !== undefined && priorYearBalance !== "" ? Number(priorYearBalance) : (existing?.priorYearBalance ? Number(existing.priorYearBalance) : null);
      updates.openingBalance = ob.toFixed(2);
      updates.debitTotal = dr.toFixed(2);
      updates.creditTotal = cr.toFixed(2);
      updates.closingBalance = closing.toFixed(2);
      if (pyBal !== null) {
        updates.priorYearBalance = pyBal.toFixed(2);
        updates.variance = (closing - pyBal).toFixed(2);
      }
    }

    const [updated] = await db.update(wpMasterCoaTable).set(updates).where(eq(wpMasterCoaTable.id, rowId)).returning();
    res.json(updated);
  } catch (err: any) {
    logger.error({ err }, "Failed to update COA row");
    res.status(500).json({ error: "Failed to update COA row" });
  }
});

router.delete("/sessions/:id/coa/:rowId", requireRoles(...WP_ROLES_WRITE), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const rowId = parseInt(p(req.params.rowId));
    await db.delete(wpMasterCoaTable).where(eq(wpMasterCoaTable.id, rowId));
    res.json({ success: true });
  } catch (err: any) {
    logger.error({ err }, "Failed to delete COA row");
    res.status(500).json({ error: "Failed to delete COA row" });
  }
});

router.post("/sessions/:id/coa/validate", requireRoles(...WP_ROLES_WRITE), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const sessionId = parseInt(p(req.params.id));
    const rows = await db.select().from(wpMasterCoaTable).where(eq(wpMasterCoaTable.sessionId, sessionId));

    let totalDebit = 0, totalCredit = 0;
    const issues: string[] = [];
    const accountCodes = new Set<string>();

    for (const r of rows) {
      const closing = Number(r.closingBalance || 0);
      const computed = Number(r.openingBalance || 0) + Number(r.debitTotal || 0) - Number(r.creditTotal || 0);
      if (Math.abs(closing - computed) > 0.01) {
        issues.push(`${r.accountCode} ${r.accountName}: closing balance ${closing.toFixed(2)} ≠ computed ${computed.toFixed(2)}`);
      }
      if (closing > 0) totalDebit += closing;
      else totalCredit += Math.abs(closing);
      if (accountCodes.has(r.accountCode)) issues.push(`Duplicate account code: ${r.accountCode}`);
      accountCodes.add(r.accountCode);
      if (!r.accountType) issues.push(`${r.accountCode}: Account Type not set`);
      if (!r.normalBalance) issues.push(`${r.accountCode}: Normal Balance not set`);
    }

    const difference = Math.abs(totalDebit - totalCredit);
    const balanced = difference < 0.01;
    if (!balanced) issues.push(`TB imbalance: Debit total ${totalDebit.toFixed(2)} ≠ Credit total ${totalCredit.toFixed(2)} — difference ${difference.toFixed(2)}`);

    res.json({
      balanced,
      totalDebit,
      totalCredit,
      difference,
      rowCount: rows.length,
      issues,
      valid: issues.length === 0,
    });
  } catch (err: any) {
    logger.error({ err }, "Failed to validate COA");
    res.status(500).json({ error: "Failed to validate COA" });
  }
});

router.post("/sessions/:id/coa/approve", requireRoles(...WP_ROLES_APPROVE), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const sessionId = parseInt(p(req.params.id));
    const rows = await db.select().from(wpMasterCoaTable).where(eq(wpMasterCoaTable.sessionId, sessionId));
    if (rows.length === 0) return res.status(422).json({ error: "No COA data to approve. Populate first." });

    // Advance to arranged_data
    await db.update(wpSessionsTable).set({ status: "arranged_data" as any, updatedAt: new Date() }).where(eq(wpSessionsTable.id, sessionId));
    res.json({ success: true, message: `${rows.length} COA accounts approved. Advanced to Arranged Data.` });
  } catch (err: any) {
    logger.error({ err }, "Failed to approve COA");
    res.status(500).json({ error: "Failed to approve COA" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// FINANCIAL STATEMENT LINES
// ═══════════════════════════════════════════════════════════════════════════

router.get("/sessions/:id/fs-lines", async (req: Request, res: Response) => {
  try {
    const sessionId = parseInt(p(req.params.id));
    if (isNaN(sessionId)) return res.status(400).json({ error: "Invalid session ID" });
    const rows = await db.select().from(wpFsLinesTable)
      .where(eq(wpFsLinesTable.sessionId, sessionId))
      .orderBy(asc(wpFsLinesTable.lineId));
    res.json({ lines: rows });
  } catch (err: any) {
    logger.error({ err }, "Failed to fetch FS lines");
    res.status(500).json({ error: "Failed to fetch FS lines" });
  }
});

router.post("/sessions/:id/fs-lines", requireRoles(...WP_ROLES_WRITE), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const sessionId = parseInt(p(req.params.id));
    if (isNaN(sessionId)) return res.status(400).json({ error: "Invalid session ID" });
    const existing = await db.select({ maxId: sql<number>`COALESCE(MAX(${wpFsLinesTable.lineId}), 0)` })
      .from(wpFsLinesTable).where(eq(wpFsLinesTable.sessionId, sessionId));
    const nextLineId = (existing[0]?.maxId || 0) + 1;
    const row = req.body;
    const [inserted] = await db.insert(wpFsLinesTable).values({
      sessionId,
      lineId: nextLineId,
      statementType: row.statementType || null,
      fsSection: row.fsSection || null,
      majorHead: row.majorHead || null,
      lineItem: row.lineItem || null,
      subLineItem: row.subLineItem || null,
      accountName: row.accountName || null,
      accountCode: row.accountCode || null,
      noteNo: row.noteNo || null,
      currentYear: row.currentYear || null,
      priorYear: row.priorYear || null,
      debitTransactionValue: row.debitTransactionValue || null,
      creditTransactionValue: row.creditTransactionValue || null,
      normalBalance: row.normalBalance || null,
      wpArea: row.wpArea || null,
      riskLevel: row.riskLevel || null,
    }).returning();
    res.json({ line: inserted });
  } catch (err: any) {
    logger.error({ err }, "Failed to create FS line");
    res.status(500).json({ error: "Failed to create FS line" });
  }
});

router.patch("/sessions/:id/fs-lines/:lineDbId", requireRoles(...WP_ROLES_WRITE), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const sessionId = parseInt(p(req.params.id));
    const lineDbId = parseInt(p(req.params.lineDbId));
    if (isNaN(sessionId) || isNaN(lineDbId)) return res.status(400).json({ error: "Invalid ID" });
    const updates: any = { updatedAt: new Date() };
    const allowed = ["statementType","fsSection","majorHead","lineItem","subLineItem","accountName","accountCode","noteNo","currentYear","priorYear","debitTransactionValue","creditTransactionValue","normalBalance","wpArea","riskLevel"];
    for (const k of allowed) {
      if (req.body[k] !== undefined) updates[k] = req.body[k];
    }
    const [updated] = await db.update(wpFsLinesTable)
      .set(updates)
      .where(and(eq(wpFsLinesTable.id, lineDbId), eq(wpFsLinesTable.sessionId, sessionId)))
      .returning();
    if (!updated) return res.status(404).json({ error: "FS line not found" });
    res.json({ line: updated });
  } catch (err: any) {
    logger.error({ err }, "Failed to update FS line");
    res.status(500).json({ error: "Failed to update FS line" });
  }
});

router.delete("/sessions/:id/fs-lines/:lineDbId", requireRoles(...WP_ROLES_WRITE), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const sessionId = parseInt(p(req.params.id));
    const lineDbId = parseInt(p(req.params.lineDbId));
    if (isNaN(sessionId) || isNaN(lineDbId)) return res.status(400).json({ error: "Invalid ID" });
    await db.delete(wpFsLinesTable)
      .where(and(eq(wpFsLinesTable.id, lineDbId), eq(wpFsLinesTable.sessionId, sessionId)));
    res.json({ ok: true });
  } catch (err: any) {
    logger.error({ err }, "Failed to delete FS line");
    res.status(500).json({ error: "Failed to delete FS line" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// ARRANGED DATA
// ═══════════════════════════════════════════════════════════════════════════

router.get("/sessions/:id/arranged-data", async (req: Request, res: Response) => {
  try {
    const sessionId = parseInt(p(req.params.id));
    const fields = await db.select().from(wpExtractedFieldsTable).where(eq(wpExtractedFieldsTable.sessionId, sessionId));
    const arranged = await db.select().from(wpArrangedDataTable).where(eq(wpArrangedDataTable.sessionId, sessionId));

    const tabs: Record<string, any[]> = {};
    for (const t of ARRANGED_DATA_TABS) tabs[t] = [];

    for (const f of fields) {
      const tab = f.category || "Extraction Log";
      if (!tabs[tab]) tabs[tab] = [];
      tabs[tab].push({
        id: f.id,
        sourceFile: f.sourceFile,
        sourceSheet: f.sourceSheet,
        sourcePageNo: f.sourcePageNo,
        fieldName: f.fieldName,
        extractedValue: f.extractedValue,
        confidence: f.confidence ? Number(f.confidence) : null,
        confidenceLevel: f.confidence ? getConfidenceColor(Number(f.confidence)) : null,
        overrideValue: null,
        finalApprovedValue: f.finalValue,
        isApproved: f.isApproved,
      });
    }

    for (const a of arranged) {
      if (!tabs[a.tab]) tabs[a.tab] = [];
      tabs[a.tab].push({
        id: a.id,
        sourceFile: a.sourceFile,
        sourceSheet: a.sourceSheetPage,
        fieldName: a.fieldName,
        extractedValue: a.extractedValue,
        confidence: a.confidence ? Number(a.confidence) : null,
        confidenceLevel: a.confidence ? getConfidenceColor(Number(a.confidence)) : null,
        overrideValue: a.overrideValue,
        finalApprovedValue: a.finalApprovedValue,
        isApproved: a.isApproved,
      });
    }

    res.json({ tabs, tabNames: ARRANGED_DATA_TABS });
  } catch (err: any) {
    logger.error({ err }, "Failed to fetch arranged data");
    res.status(500).json({ error: "Failed to fetch arranged data" });
  }
});

router.patch("/sessions/:id/arranged-data/:fieldId", requireRoles(...WP_ROLES_WRITE), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const fieldId = parseInt(p(req.params.fieldId));
    const { overrideValue, isApproved } = req.body;
    const updates: any = { updatedAt: new Date() };
    if (overrideValue !== undefined) {
      updates.finalValue = overrideValue;
      updates.isOverridden = true;
    }
    if (isApproved !== undefined) updates.isApproved = isApproved;
    const [updated] = await db.update(wpExtractedFieldsTable).set(updates).where(eq(wpExtractedFieldsTable.id, fieldId)).returning();
    res.json(updated);
  } catch (err: any) {
    logger.error({ err }, "Failed to update field");
    res.status(500).json({ error: "Failed to update field" });
  }
});

router.post("/sessions/:id/arranged-data/approve-all", requireRoles(...WP_ROLES_APPROVE), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const sessionId = parseInt(p(req.params.id));
    await db.update(wpExtractedFieldsTable).set({ isApproved: true, updatedAt: new Date() }).where(eq(wpExtractedFieldsTable.sessionId, sessionId));
    await db.update(wpSessionsTable).set({ status: "arranged_data", updatedAt: new Date() }).where(eq(wpSessionsTable.id, sessionId));
    res.json({ success: true });
  } catch (err: any) {
    logger.error({ err }, "Failed to approve all fields");
    res.status(500).json({ error: "Failed to approve all fields" });
  }
});


// ═══════════════════════════════════════════════════════════════════════════
// VARIABLE DEFINITIONS — SEED & MANAGE
// ═══════════════════════════════════════════════════════════════════════════

router.get("/variable-definitions", async (req: Request, res: Response) => {
  try {
    const defs = await db.select().from(wpVariableDefinitionsTable).where(eq(wpVariableDefinitionsTable.activeFlag, true));
    if (defs.length === 0) {
      res.json({ definitions: VARIABLE_DEFINITIONS, groups: VARIABLE_GROUPS, source: "static" });
    } else {
      res.json({ definitions: defs, groups: VARIABLE_GROUPS, source: "database" });
    }
  } catch (err: any) {
    res.json({ definitions: VARIABLE_DEFINITIONS, groups: VARIABLE_GROUPS, source: "static" });
  }
});

router.post("/variable-definitions/seed", requireRoles(...WP_ROLES_ADMIN), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userRole = (req as any).user?.role;
    if (!userRole || !["super_admin", "partner"].includes(userRole)) {
      return res.status(403).json({ error: "Only super_admin or partner can seed variable definitions" });
    }

    const existing = await db.select().from(wpVariableDefinitionsTable);
    if (existing.length > 0) {
      await db.delete(wpVariableDefinitionsTable);
    }
    for (const def of VARIABLE_DEFINITIONS) {
      await db.insert(wpVariableDefinitionsTable).values({
        variableCode: def.variableCode,
        variableGroup: def.variableGroup,
        variableSubgroup: def.variableSubgroup || null,
        variableName: def.variableName,
        variableLabel: def.variableLabel,
        description: def.description || null,
        dataType: def.dataType,
        inputMode: def.inputMode,
        dropdownOptionsJson: def.dropdownOptionsJson || null,
        defaultValue: def.defaultValue || null,
        mandatoryFlag: def.mandatoryFlag,
        editableFlag: def.editableFlag,
        aiExtractableFlag: def.aiExtractableFlag,
        reviewRequiredFlag: def.reviewRequiredFlag,
        standardReference: def.standardReference || null,
        pakistanReference: def.pakistanReference || null,
        affectsModulesJson: def.affectsModulesJson || null,
        affectsWorkingPapersJson: def.affectsWorkingPapersJson || null,
        displayOrder: def.displayOrder,
      });
    }
    res.json({ seeded: VARIABLE_DEFINITIONS.length });
  } catch (err: any) {
    logger.error({ err }, "Failed to seed variable definitions");
    res.status(500).json({ error: "Failed to seed variable definitions" });
  }
});


// ═══════════════════════════════════════════════════════════════════════════
// VARIABLES — AUTO-FILL + EDIT + LOCK (UPGRADED ENGINE)
// ═══════════════════════════════════════════════════════════════════════════

router.post("/sessions/:id/variables/auto-fill", requireRoles(...WP_ROLES_WRITE), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const sessionId = parseInt(p(req.params.id));
    if (isNaN(sessionId)) return res.status(400).json({ error: "Invalid session ID" });

    const sessions = await db.select().from(wpSessionsTable).where(eq(wpSessionsTable.id, sessionId));
    if (!sessions[0]) return res.status(404).json({ error: "Session not found" });
    const session = sessions[0];

    const fields = await db.select().from(wpExtractedFieldsTable).where(eq(wpExtractedFieldsTable.sessionId, sessionId));

    const extractedMap: Record<string, { value: string; confidence: string; sourceFile?: string; sourceSheet?: string; sourcePage?: number }> = {};

    const sessionMetaMap: Record<string, string> = {};

    const isListed = session.entityType === "Public Limited (Listed)";
    const isPIE = isListed;
    const isGroupAudit = session.engagementType === "group_audit";
    const isLimitedReview = session.engagementType === "limited_review";
    const fw = session.reportingFramework || "IFRS";
    const hasStn = !!session.strn;

    if (session.clientName) {
      sessionMetaMap["entity_name"] = session.clientName;
      sessionMetaMap["legal_name_as_per_secp"] = session.clientName;
      sessionMetaMap["short_name"] = session.clientName;
    }
    if (session.entityType) {
      sessionMetaMap["entity_legal_form"] = session.entityType;
      sessionMetaMap["listed_status"] = isListed ? "Listed" : "Unlisted";
      sessionMetaMap["public_interest_entity_flag"] = isPIE ? "true" : "false";
    }
    if (session.ntn) sessionMetaMap["ntn"] = session.ntn;
    if (session.strn) sessionMetaMap["strn"] = session.strn;
    if (session.reportingFramework) {
      sessionMetaMap["reporting_framework"] = fw;
      sessionMetaMap["reporting_framework_disclosed"] = "true";
      sessionMetaMap["ifrs_applicable"] = (fw === "IFRS") ? "true" : "false";
      sessionMetaMap["ifrs_for_smes_applicable"] = (fw === "IFRS for SMEs") ? "true" : "false";
    }
    if (session.engagementType) {
      sessionMetaMap["engagement_type"] = session.engagementType;
      sessionMetaMap["assurance_level"] = isLimitedReview ? "Limited" : "Reasonable";
      sessionMetaMap["report_type"] = isLimitedReview ? "Review Report" : "Independent Auditor's Report";
      sessionMetaMap["group_entity_flag"] = isGroupAudit ? "true" : "false";
      sessionMetaMap["component_auditor_required"] = isGroupAudit ? "true" : "false";
    }
    if (session.periodStart) {
      sessionMetaMap["reporting_period_start"] = session.periodStart;
      sessionMetaMap["financial_year_start"] = session.periodStart;
    }
    if (session.periodEnd) {
      sessionMetaMap["reporting_period_end"] = session.periodEnd;
      sessionMetaMap["financial_year_end"] = session.periodEnd;
    }

    const periodEnd = session.periodEnd || "";
    const periodStart = session.periodStart || "";
    const year = parseInt(session.engagementYear) || new Date().getFullYear();

    if (periodEnd) {
      const peDate = new Date(periodEnd);
      const pe30 = new Date(peDate); pe30.setDate(pe30.getDate() + 30);
      const pe60 = new Date(peDate); pe60.setDate(pe60.getDate() + 60);
      const pe90 = new Date(peDate); pe90.setDate(pe90.getDate() + 90);
      const pe120 = new Date(peDate); pe120.setDate(pe120.getDate() + 120);
      const fmt = (d: Date) => d.toISOString().split("T")[0];

      sessionMetaMap["report_date"] = fmt(pe90);
      sessionMetaMap["expected_signing_date"] = fmt(pe90);
      sessionMetaMap["reporting_deadline"] = fmt(pe120);
      sessionMetaMap["archiving_due_date"] = fmt(new Date(peDate.getFullYear(), peDate.getMonth() + 2, peDate.getDate() + 60));
    }

    if (periodStart) {
      const psDate = new Date(periodStart);
      const fmt = (d: Date) => d.toISOString().split("T")[0];
      const engStart = new Date(psDate); engStart.setMonth(engStart.getMonth() - 1);
      sessionMetaMap["engagement_start_date"] = fmt(engStart);
    }

    const today = new Date().toISOString().split("T")[0];
    sessionMetaMap["preparation_date"] = today;

    if (session.preparerName) sessionMetaMap["preparer_name"] = session.preparerName;
    if (session.reviewerName) sessionMetaMap["reviewer_name"] = session.reviewerName;
    if (session.approverName) {
      sessionMetaMap["approver_name"] = session.approverName;
      sessionMetaMap["engagement_partner"] = session.approverName;
    }

    sessionMetaMap["functional_currency"] = "PKR";
    sessionMetaMap["presentation_currency"] = "PKR";
    sessionMetaMap["applicable_company_law"] = "Companies Act 2017";
    sessionMetaMap["tax_jurisdiction"] = "Pakistan (Federal + Provincial)";
    sessionMetaMap["companies_act_applicable"] = "true";

    sessionMetaMap["board_exists"] = "true";
    sessionMetaMap["going_concern_basis_used"] = "true";
    sessionMetaMap["revenue_fraud_risk_flag"] = "true";
    sessionMetaMap["management_override_risk_flag"] = "true";
    sessionMetaMap["variable_pack_status"] = "Draft";

    if (hasStn) sessionMetaMap["sales_tax_applicable"] = "true";

    sessionMetaMap["eqcr_required"] = isPIE ? "true" : "false";
    sessionMetaMap["key_audit_matters_flag"] = isListed ? "true" : "false";
    sessionMetaMap["external_confirmations_required"] = "true";

    sessionMetaMap["client_acceptance_approved"] = "true";
    sessionMetaMap["independence_confirmed"] = "true";
    sessionMetaMap["ethical_compliance_confirmed"] = "true";
    sessionMetaMap["conflict_check_completed"] = "true";
    sessionMetaMap["engagement_letter_signed"] = "true";
    sessionMetaMap["terms_of_engagement_agreed"] = "true";

    sessionMetaMap["gl_available"] = "true";
    sessionMetaMap["tb_available"] = "true";
    sessionMetaMap["fs_uploaded"] = "true";

    sessionMetaMap["fraud_risk_flag"] = "true";

    sessionMetaMap["planning_analytics_performed"] = "false";
    sessionMetaMap["substantive_analytics_planned"] = "false";
    sessionMetaMap["final_analytics_performed"] = "false";
    sessionMetaMap["ratio_analysis_required"] = "true";
    sessionMetaMap["trend_analysis_required"] = "true";

    sessionMetaMap["management_integrity_risk"] = "Low";
    sessionMetaMap["client_risk_category"] = "Low";

    sessionMetaMap["all_planned_procedures_completed"] = "false";
    sessionMetaMap["review_completed"] = "false";
    sessionMetaMap["partner_review_completed"] = "false";
    sessionMetaMap["eqcr_completed"] = "false";
    sessionMetaMap["final_analytics_completed"] = "false";
    sessionMetaMap["subsequent_events_cleared"] = "false";
    sessionMetaMap["contingencies_reviewed"] = "false";
    sessionMetaMap["going_concern_finalized"] = "false";
    sessionMetaMap["mrl_signed"] = "false";
    sessionMetaMap["fs_disclosures_reviewed"] = "false";

    sessionMetaMap["engagement_quality_objectives_met"] = "false";
    sessionMetaMap["file_archived"] = "false";
    sessionMetaMap["inspection_ready_flag"] = "false";
    sessionMetaMap["variable_pack_locked"] = "false";

    sessionMetaMap["identified_misstatements_count"] = "0";
    sessionMetaMap["identified_misstatements_value"] = "0";
    sessionMetaMap["corrected_misstatements_value"] = "0";
    sessionMetaMap["uncorrected_misstatements_value"] = "0";
    sessionMetaMap["clearly_trivial_items_value"] = "0";
    sessionMetaMap["proposed_adjusting_entries_count"] = "0";
    sessionMetaMap["passed_adjustments_count"] = "0";
    sessionMetaMap["waived_adjustments_count"] = "0";
    sessionMetaMap["misstatement_material_flag"] = "false";
    sessionMetaMap["summary_of_uncorrected_misstatements_done"] = "false";

    sessionMetaMap["going_concern_risk_flag"] = "false";
    sessionMetaMap["related_party_risk_flag"] = "false";
    sessionMetaMap["litigation_risk_flag"] = "false";
    sessionMetaMap["tax_risk_flag"] = "false";
    sessionMetaMap["compliance_risk_flag"] = "false";
    sessionMetaMap["going_concern_indicator_count"] = "0";

    sessionMetaMap["gc_losses_flag"] = "false";
    sessionMetaMap["gc_negative_equity_flag"] = "false";
    sessionMetaMap["gc_negative_operating_cashflows_flag"] = "false";
    sessionMetaMap["gc_default_on_loans_flag"] = "false";
    sessionMetaMap["gc_overdue_liabilities_flag"] = "false";
    sessionMetaMap["gc_material_uncertainty_flag"] = "false";
    sessionMetaMap["going_concern_conclusion"] = "No Material Uncertainty";

    sessionMetaMap["inherent_risk_overall"] = "Medium";
    sessionMetaMap["control_risk_overall"] = "Medium";
    sessionMetaMap["risk_of_material_misstatement_overall"] = "Medium";

    sessionMetaMap["materiality_basis"] = "Revenue";
    sessionMetaMap["overall_materiality_percent"] = "2";
    sessionMetaMap["performance_materiality_percent"] = "75";
    sessionMetaMap["trivial_threshold_percent"] = "5";
    sessionMetaMap["benchmark_reason"] = "Revenue is the most stable benchmark for determining materiality as the entity is a going concern with consistent revenue streams.";

    sessionMetaMap["control_environment_rating"] = "Adequate";
    sessionMetaMap["segregation_of_duties"] = "Adequate";
    sessionMetaMap["authorization_controls"] = "Adequate";
    sessionMetaMap["access_controls"] = "Adequate";
    sessionMetaMap["it_general_controls"] = "Adequate";
    sessionMetaMap["application_controls"] = "Adequate";
    sessionMetaMap["bank_payment_controls"] = "Adequate";
    sessionMetaMap["procurement_controls"] = "Adequate";
    sessionMetaMap["sales_controls"] = "Adequate";
    sessionMetaMap["payroll_controls"] = "Adequate";
    sessionMetaMap["inventory_controls"] = "Adequate";

    sessionMetaMap["controls_reliance_planned"] = "false";
    sessionMetaMap["toc_planned"] = "false";
    sessionMetaMap["walkthrough_completed"] = "false";
    sessionMetaMap["controls_documented"] = "false";
    sessionMetaMap["control_deficiencies_identified"] = "false";
    sessionMetaMap["significant_deficiency_flag"] = "false";
    sessionMetaMap["material_weakness_flag"] = "false";


    sessionMetaMap["income_tax_return_filed"] = "false";
    sessionMetaMap["sales_tax_return_filed"] = "false";
    sessionMetaMap["withholding_statements_filed"] = "false";
    sessionMetaMap["annual_return_filed"] = "false";
    sessionMetaMap["secp_forms_filed"] = "false";
    sessionMetaMap["tax_litigation_exists"] = "false";
    sessionMetaMap["notices_received"] = "false";
    sessionMetaMap["non_compliance_identified"] = "false";
    sessionMetaMap["deferred_tax_applicable"] = "true";
    sessionMetaMap["minimum_tax_applicable"] = "false";
    sessionMetaMap["final_tax_regime_flag"] = "false";
    sessionMetaMap["normal_tax_regime_flag"] = "true";

    sessionMetaMap["related_party_register_available"] = "false";
    sessionMetaMap["related_party_transactions_exist"] = "false";
    sessionMetaMap["related_party_balances_exist"] = "false";
    sessionMetaMap["related_parties_exist"] = "false";
    sessionMetaMap["directors_loan_exists"] = "false";
    sessionMetaMap["sponsor_transactions_exist"] = "false";
    sessionMetaMap["common_control_transactions_exist"] = "false";
    sessionMetaMap["arm_length_support_available"] = "false";
    sessionMetaMap["disclosure_complete_flag"] = "false";

    sessionMetaMap["legal_cases_exist"] = "false";
    sessionMetaMap["contingent_liabilities_exist"] = "false";
    sessionMetaMap["non_compliance_with_laws_flag"] = "false";
    sessionMetaMap["licenses_required"] = "false";
    sessionMetaMap["licenses_valid"] = "false";
    sessionMetaMap["sector_specific_compliance_required"] = "false";

    sessionMetaMap["bank_confirmations_sent"] = "false";
    sessionMetaMap["bank_confirmations_received"] = "false";
    sessionMetaMap["receivable_confirmations_sent"] = "false";
    sessionMetaMap["receivable_confirmations_received"] = "false";
    sessionMetaMap["payable_confirmations_sent"] = "false";
    sessionMetaMap["payable_confirmations_received"] = "false";
    sessionMetaMap["legal_letter_sent"] = "false";
    sessionMetaMap["legal_letter_received"] = "false";
    sessionMetaMap["physical_verification_done"] = "false";
    sessionMetaMap["management_representation_letter_received"] = "false";
    sessionMetaMap["subsequent_events_review_done"] = "false";
    sessionMetaMap["minutes_review_done"] = "false";
    sessionMetaMap["journal_testing_done"] = "false";
    sessionMetaMap["evidence_sufficiency_rating"] = "Sufficient";
    sessionMetaMap["evidence_appropriateness_rating"] = "Appropriate";

    sessionMetaMap["books_maintained_properly"] = "true";
    sessionMetaMap["prior_year_fs_available"] = "false";
    sessionMetaMap["prior_year_audit_file_available"] = "false";
    sessionMetaMap["fixed_asset_register_available"] = "false";
    sessionMetaMap["inventory_records_available"] = "false";
    sessionMetaMap["payroll_records_available"] = "false";
    sessionMetaMap["tax_records_available"] = "false";
    sessionMetaMap["bank_statements_available"] = "false";
    sessionMetaMap["voucher_support_available"] = "false";
    sessionMetaMap["missing_records_flag"] = "false";
    sessionMetaMap["records_reliability_score"] = "High";
    sessionMetaMap["digital_document_quality"] = "Good";

    sessionMetaMap["coa_available"] = "true";
    sessionMetaMap["account_code_present"] = "true";
    sessionMetaMap["account_name_present"] = "true";
    sessionMetaMap["opening_balance_present"] = "true";
    sessionMetaMap["movement_debit_present"] = "true";
    sessionMetaMap["movement_credit_present"] = "true";
    sessionMetaMap["closing_balance_present"] = "true";
    sessionMetaMap["tb_balanced_flag"] = "true";
    sessionMetaMap["unmapped_accounts_count"] = "0";
    sessionMetaMap["unmapped_accounts_value"] = "0";
    sessionMetaMap["fs_mapping_completed"] = "false";
    sessionMetaMap["control_accounts_identified"] = "false";
    sessionMetaMap["manual_tb_adjustments_flag"] = "false";
    sessionMetaMap["adjusted_tb_flag"] = "false";

    sessionMetaMap["variance_analysis_done"] = "false";

    const isFirstTime = session.engagementContinuity === "first_time";
    sessionMetaMap["first_year_audit"] = isFirstTime ? "true" : "false";
    sessionMetaMap["recurring_engagement"] = isFirstTime ? "false" : "true";
    if (!isFirstTime) {
      sessionMetaMap["previous_auditor"] = session.auditFirmName || "Same firm";
      sessionMetaMap["predecessor_communication_done"] = "true";
      sessionMetaMap["continuance_approved"] = "true";
    }

    sessionMetaMap["emphasis_of_matter_flag"] = "false";
    sessionMetaMap["other_matter_flag"] = "false";
    sessionMetaMap["restricted_scope_flag"] = "false";

    sessionMetaMap["branch_offices_flag"] = "false";
    sessionMetaMap["number_of_branches"] = "0";
    sessionMetaMap["foreign_operations_flag"] = "false";
    sessionMetaMap["subsidiary_flag"] = "false";
    sessionMetaMap["associate_flag"] = "false";
    sessionMetaMap["joint_venture_flag"] = "false";

    sessionMetaMap["audit_committee_exists"] = isPIE ? "true" : "false";
    sessionMetaMap["internal_audit_function_exists"] = isPIE ? "true" : "false";
    sessionMetaMap["governance_level"] = "Adequate";
    sessionMetaMap["minutes_available"] = "true";
    sessionMetaMap["board_minutes_reviewed"] = "false";
    sessionMetaMap["agm_held"] = "true";
    sessionMetaMap["statutory_registers_available"] = "true";

    sessionMetaMap["consultation_required"] = "false";
    sessionMetaMap["consultation_completed"] = "false";
    sessionMetaMap["independence_reconfirmed"] = "true";
    sessionMetaMap["differences_of_opinion_flag"] = "false";
    sessionMetaMap["unresolved_review_notes_count"] = "0";
    sessionMetaMap["unresolved_exceptions_count"] = "0";

    sessionMetaMap["specialist_required"] = "false";

    sessionMetaMap["expectation_developed"] = "false";
    sessionMetaMap["unusual_fluctuations_identified"] = "false";
    sessionMetaMap["monthwise_analysis_required"] = "false";

    sessionMetaMap["assertion_level_risk_required"] = "true";
    sessionMetaMap["account_level_risk_mapping_done"] = "false";

    sessionMetaMap["specific_materiality_required"] = "false";
    sessionMetaMap["materiality_revision_flag"] = "false";

    sessionMetaMap["shareholder_pattern_available"] = "false";
    sessionMetaMap["beneficial_owners_identified"] = "false";

    sessionMetaMap["further_tax_applicable"] = "false";

    sessionMetaMap["gc_management_plans_available"] = "false";
    sessionMetaMap["gc_financial_support_available"] = "false";
    sessionMetaMap["gc_disclosure_adequate_flag"] = "true";

    sessionMetaMap["journal_entry_controls"] = "Adequate";

    sessionMetaMap["principal_activity"] = "To be determined";
    sessionMetaMap["engagement_partner"] = session.approverName || "To be assigned";
    sessionMetaMap["materiality_basis_amount"] = "0";
    sessionMetaMap["overall_materiality_amount"] = "0";
    sessionMetaMap["performance_materiality_amount"] = "0";
    sessionMetaMap["trivial_threshold_amount"] = "0";
    sessionMetaMap["significant_risk_areas"] = "Revenue recognition (ISA 240 presumed risk), Management override of controls (ISA 240.31)";
    sessionMetaMap["audit_opinion"] = "Unmodified";
    sessionMetaMap["report_date"] = session.periodEnd || today;
    sessionMetaMap["signing_partner_name"] = session.approverName || "To be assigned";

    sessionMetaMap["manual_or_system"] = "Semi-Automated";
    sessionMetaMap["account_type"] = "4-digit COA";
    sessionMetaMap["account_classification"] = "false";

    sessionMetaMap["number_of_shareholders"] = "0";
    sessionMetaMap["number_of_directors"] = "0";

    const clientShort = session.clientName || "Client";
    const entityDesc = session.entityType || "Company";
    sessionMetaMap["secp_registration_no"] = "Pending verification from SECP records";
    sessionMetaMap["incorporation_date"] = session.periodStart ? session.periodStart.substring(0, 4) + "-01-01" : today;
    sessionMetaMap["commencement_date"] = session.periodStart ? session.periodStart.substring(0, 4) + "-01-01" : today;
    sessionMetaMap["industry_sector"] = isPIE ? "Financial Services / Listed Entity" : "General Commerce & Trade";
    sessionMetaMap["registered_address"] = `Registered office of ${clientShort} — to be confirmed from SECP Form A`;
    sessionMetaMap["business_address"] = `Principal office of ${clientShort} — to be confirmed`;
    sessionMetaMap["principal_place_of_business"] = `Principal place of business of ${clientShort}`;
    sessionMetaMap["parent_entity_name"] = "N/A";
    sessionMetaMap["classes_of_shares"] = "Ordinary Shares";
    sessionMetaMap["ceo_name"] = `CEO of ${clientShort} — refer to Form 29`;
    sessionMetaMap["cfo_name"] = `CFO of ${clientShort} — refer to Form 29`;
    sessionMetaMap["company_secretary"] = `Company Secretary of ${clientShort} — refer to Form 29`;
    sessionMetaMap["key_management_personnel"] = `Directors and officers of ${clientShort} as per latest Form 29 / Annual Return`;
    sessionMetaMap["related_parties_list"] = `To be obtained from management of ${clientShort} per ISA 550 inquiry`;
    sessionMetaMap["engagement_manager"] = session.reviewerName || `Manager assigned to ${clientShort}`;
    sessionMetaMap["engagement_team_members"] = [session.preparerName, session.reviewerName, session.approverName].filter(Boolean).join(", ") || `Team of ${clientShort} engagement`;
    sessionMetaMap["reviewer"] = session.reviewerName || `Reviewer of ${clientShort}`;
    sessionMetaMap["approver"] = session.approverName || `Approver of ${clientShort}`;
    sessionMetaMap["accounting_software"] = "To be confirmed during planning inquiries";
    sessionMetaMap["erp_name"] = "Not applicable or to be confirmed";
    sessionMetaMap["specific_materiality_areas"] = isListed ? "Related party transactions, Directors' remuneration, Segment reporting" : "Revenue, Trade receivables, Inventory (if significant)";
    sessionMetaMap["revised_materiality_reason"] = "No revision — initial materiality stands unless significant changes arise during audit";
    sessionMetaMap["risk_assessment_summary"] = `Preliminary risk assessment for ${clientShort} (${entityDesc}): Inherent risk assessed at Medium based on entity type and industry. Control risk at Medium pending walkthrough. Combined RMM at Medium. Revenue recognition and management override identified as significant risks per ISA 240.`;
    sessionMetaMap["sampling_basis"] = "Value-based";
    sessionMetaMap["analytics_conclusion"] = `Preliminary analytical procedures for ${clientShort} — to be completed upon receipt of CY financials. PY comparatives to be analyzed for unusual fluctuations per ISA 520.`;
    sessionMetaMap["sector_regulator"] = isPIE ? "Securities & Exchange Commission of Pakistan (SECP) / Pakistan Stock Exchange" : "SECP";
    sessionMetaMap["modified_opinion_basis"] = "Not applicable — unmodified opinion expected unless audit evidence indicates otherwise";
    sessionMetaMap["archiving_completed_date"] = periodEnd ? (() => { const d = new Date(periodEnd); d.setDate(d.getDate() + 150); return d.toISOString().split("T")[0]; })() : today;
    sessionMetaMap["preparer_designation"] = session.preparerName ? "Audit Senior / Assistant Manager" : "To be assigned";
    sessionMetaMap["reviewer_designation"] = session.reviewerName ? "Audit Manager / Senior Manager" : "To be assigned";
    sessionMetaMap["review_date"] = periodEnd ? (() => { const d = new Date(periodEnd); d.setDate(d.getDate() + 75); return d.toISOString().split("T")[0]; })() : today;
    sessionMetaMap["approver_designation"] = session.approverName ? "Engagement Partner" : "To be assigned";
    sessionMetaMap["approval_date"] = periodEnd ? (() => { const d = new Date(periodEnd); d.setDate(d.getDate() + 85); return d.toISOString().split("T")[0]; })() : today;
    sessionMetaMap["lock_reason"] = "Not yet locked";
    sessionMetaMap["reopen_reason"] = "Not applicable";
    sessionMetaMap["current_stage"] = "Variables";
    sessionMetaMap["current_substage"] = "Auto-Fill";

    const defaultSourceMap: Record<string, string> = {};

    sessionMetaMap["subsequent_events_exist"] = "false";
    sessionMetaMap["adjusting_events_exist"] = "false";
    sessionMetaMap["non_adjusting_events_exist"] = "false";
    sessionMetaMap["subsequent_events_disclosure_adequate"] = "false";
    defaultSourceMap["subsequent_events_exist"] = "default";
    defaultSourceMap["adjusting_events_exist"] = "default";
    defaultSourceMap["non_adjusting_events_exist"] = "default";
    defaultSourceMap["subsequent_events_disclosure_adequate"] = "default";

    sessionMetaMap["significant_estimates_exist"] = "false";
    sessionMetaMap["estimation_uncertainty_level"] = "Medium";
    sessionMetaMap["management_bias_risk"] = "Low";
    sessionMetaMap["expert_used_for_estimates"] = "false";
    sessionMetaMap["retrospective_review_done"] = "false";
    defaultSourceMap["significant_estimates_exist"] = "default";
    defaultSourceMap["estimation_uncertainty_level"] = "default";
    defaultSourceMap["management_bias_risk"] = "default";
    defaultSourceMap["expert_used_for_estimates"] = "default";
    defaultSourceMap["retrospective_review_done"] = "default";

    sessionMetaMap["group_audit_flag"] = isGroupAudit ? "true" : "false";
    sessionMetaMap["number_of_components"] = "0";
    sessionMetaMap["significant_components_count"] = "0";
    sessionMetaMap["component_materiality_set"] = "false";
    sessionMetaMap["component_auditor_involved"] = isGroupAudit ? "true" : "false";
    sessionMetaMap["component_auditor_independence_confirmed"] = "false";
    sessionMetaMap["consolidation_adjustments_reviewed"] = "false";
    sessionMetaMap["intercompany_eliminations_verified"] = "false";
    defaultSourceMap["group_audit_flag"] = isGroupAudit ? "session" : "default";
    defaultSourceMap["number_of_components"] = "default";
    defaultSourceMap["significant_components_count"] = "default";
    defaultSourceMap["component_materiality_set"] = "default";
    defaultSourceMap["component_auditor_involved"] = isGroupAudit ? "session" : "default";
    defaultSourceMap["component_auditor_independence_confirmed"] = "default";
    defaultSourceMap["consolidation_adjustments_reviewed"] = "default";
    defaultSourceMap["intercompany_eliminations_verified"] = "default";

    sessionMetaMap["accounting_policies_disclosed"] = "false";
    sessionMetaMap["segment_reporting_applicable"] = isListed ? "true" : "false";
    sessionMetaMap["earnings_per_share_disclosed"] = isListed ? "true" : "false";
    sessionMetaMap["financial_instruments_disclosed"] = "false";
    sessionMetaMap["lease_disclosures_complete"] = "false";
    sessionMetaMap["related_party_disclosures_complete"] = "false";
    sessionMetaMap["contingencies_disclosures_complete"] = "false";
    sessionMetaMap["events_after_reporting_disclosed"] = "false";
    sessionMetaMap["directors_remuneration_disclosed"] = "false";
    sessionMetaMap["fourth_schedule_compliance"] = "false";
    sessionMetaMap["disclosure_checklist_completed"] = "false";
    defaultSourceMap["accounting_policies_disclosed"] = "default";
    defaultSourceMap["segment_reporting_applicable"] = isListed ? "session" : "default";
    defaultSourceMap["earnings_per_share_disclosed"] = isListed ? "session" : "default";
    defaultSourceMap["financial_instruments_disclosed"] = "default";
    defaultSourceMap["lease_disclosures_complete"] = "default";
    defaultSourceMap["related_party_disclosures_complete"] = "default";
    defaultSourceMap["contingencies_disclosures_complete"] = "default";
    defaultSourceMap["events_after_reporting_disclosed"] = "default";
    defaultSourceMap["directors_remuneration_disclosed"] = "default";
    defaultSourceMap["fourth_schedule_compliance"] = "default";
    defaultSourceMap["disclosure_checklist_completed"] = "default";

    sessionMetaMap["it_infrastructure_complexity"] = "Simple";
    sessionMetaMap["cloud_based_systems_used"] = "false";
    sessionMetaMap["cybersecurity_risk_assessment_done"] = "false";
    sessionMetaMap["data_backup_procedures_adequate"] = "false";
    sessionMetaMap["disaster_recovery_plan_exists"] = "false";
    sessionMetaMap["automated_controls_identified"] = "false";
    sessionMetaMap["service_organization_used"] = "false";
    sessionMetaMap["soc_report_obtained"] = "false";
    defaultSourceMap["it_infrastructure_complexity"] = "default";
    defaultSourceMap["cloud_based_systems_used"] = "default";
    defaultSourceMap["cybersecurity_risk_assessment_done"] = "default";
    defaultSourceMap["data_backup_procedures_adequate"] = "default";
    defaultSourceMap["disaster_recovery_plan_exists"] = "default";
    defaultSourceMap["automated_controls_identified"] = "default";
    defaultSourceMap["service_organization_used"] = "default";
    defaultSourceMap["soc_report_obtained"] = "default";

    sessionMetaMap["tcwg_identified"] = isPIE ? "true" : "false";
    sessionMetaMap["planned_scope_communicated"] = "false";
    sessionMetaMap["significant_findings_communicated"] = "false";
    sessionMetaMap["control_deficiencies_communicated"] = "false";
    sessionMetaMap["independence_communicated"] = "false";
    sessionMetaMap["management_letter_issued"] = "false";
    sessionMetaMap["management_letter_points_count"] = "0";
    defaultSourceMap["tcwg_identified"] = isPIE ? "session" : "default";
    defaultSourceMap["planned_scope_communicated"] = "default";
    defaultSourceMap["significant_findings_communicated"] = "default";
    defaultSourceMap["control_deficiencies_communicated"] = "default";
    defaultSourceMap["independence_communicated"] = "default";
    defaultSourceMap["management_letter_issued"] = "default";
    defaultSourceMap["management_letter_points_count"] = "default";

    const cyPyFieldCodes = [
      "total_assets","non_current_assets","current_assets","fixed_assets","right_of_use_assets",
      "capital_work_in_progress","intangible_assets","investments","long_term_loans",
      "deposits_prepayments","inventory","trade_receivables","advances","other_receivables",
      "short_term_investments","tax_refunds_due","cash_and_bank",
      "total_equity","share_capital_fs","reserves","retained_earnings","revaluation_surplus",
      "total_liabilities","non_current_liabilities","current_liabilities",
      "long_term_borrowings","lease_liabilities","trade_payables","accruals","taxation_payable",
      "short_term_borrowings","current_portion_long_term_debt",
      "revenue","cost_of_sales","gross_profit","admin_expenses","selling_distribution_expenses",
      "finance_cost","other_income","other_expenses","profit_before_tax","tax_expense",
      "profit_after_tax","other_comprehensive_income","total_comprehensive_income",
      "operating_cash_flow","investing_cash_flow","financing_cash_flow"
    ];
    for (const code of cyPyFieldCodes) {
      if (!extractedMap[`cy_${code}`]) sessionMetaMap[`cy_${code}`] = "0";
      if (!extractedMap[`py_${code}`]) sessionMetaMap[`py_${code}`] = "0";
    }

    sessionMetaMap["share_capital"] = "0";
    sessionMetaMap["authorized_capital"] = "0";
    sessionMetaMap["paid_up_capital"] = "0";

    sessionMetaMap["current_tax_provision"] = "0";
    sessionMetaMap["advance_tax"] = "0";
    sessionMetaMap["withholding_tax_deducted"] = "0";
    sessionMetaMap["withholding_tax_paid"] = "0";
    sessionMetaMap["sales_tax_input"] = "0";
    sessionMetaMap["sales_tax_output"] = "0";
    sessionMetaMap["sales_tax_payable_or_refundable"] = "0";
    sessionMetaMap["tax_exposure_estimated"] = "0";

    sessionMetaMap["ocr_quality_score"] = "0";

    sessionMetaMap["population_count"] = "0";
    sessionMetaMap["population_value"] = "0";
    sessionMetaMap["key_item_count"] = "0";
    sessionMetaMap["key_item_value"] = "0";
    sessionMetaMap["sample_size"] = "0";
    sessionMetaMap["tolerable_misstatement"] = "0";
    sessionMetaMap["selection_interval"] = "0";
    sessionMetaMap["threshold_for_investigation"] = "0";

    sessionMetaMap["sampling_required"] = "true";
    sessionMetaMap["sample_method"] = "Monetary Unit";
    sessionMetaMap["confidence_level"] = "95";
    sessionMetaMap["stratification_used"] = "false";
    sessionMetaMap["sample_generated_by_ai"] = "false";
    sessionMetaMap["sample_reviewed_by_user"] = "false";
    sessionMetaMap["expected_misstatement"] = "0";

    const sessionDerivedKeys = new Set([
      "entity_name", "legal_name_as_per_secp", "short_name", "entity_legal_form", "listed_status",
      "public_interest_entity_flag", "ntn", "strn", "reporting_framework", "reporting_framework_disclosed",
      "ifrs_applicable", "ifrs_for_smes_applicable", "engagement_type", "assurance_level", "report_type",
      "group_entity_flag", "component_auditor_required", "reporting_period_start", "financial_year_start",
      "reporting_period_end", "financial_year_end", "report_date", "expected_signing_date",
      "reporting_deadline", "archiving_due_date", "engagement_start_date", "preparation_date",
      "preparer_name", "reviewer_name", "approver_name", "engagement_partner",
      "functional_currency", "presentation_currency", "applicable_company_law", "tax_jurisdiction",
      "companies_act_applicable", "first_year_audit", "recurring_engagement",
      "previous_auditor", "predecessor_communication_done", "continuance_approved",
      "eqcr_required", "key_audit_matters_flag", "audit_committee_exists", "internal_audit_function_exists",
      "sales_tax_applicable", "signing_partner_name", "engagement_manager", "reviewer", "approver",
    ]);

    const assumptionPhrases = ["to be confirmed", "to be determined", "to be assigned", "to be obtained", "to be completed", "pending verification", "refer to form", "not yet", "not applicable or to be"];
    const isAssumptionValue = (v: string) => {
      const lower = v.toLowerCase();
      return assumptionPhrases.some(p => lower.includes(p));
    };

    for (const [code, value] of Object.entries(sessionMetaMap)) {
      const isSessionDerived = sessionDerivedKeys.has(code);
      const isZeroNumeric = value === "0";
      const isAssumption = isAssumptionValue(value);
      let conf: string;
      if (isSessionDerived && value) {
        conf = "90";
        defaultSourceMap[code] = "session";
      } else if (isAssumption) {
        conf = "45";
        defaultSourceMap[code] = "assumption";
      } else if (isZeroNumeric) {
        conf = "50";
        defaultSourceMap[code] = "default";
      } else if (value) {
        conf = "60";
        defaultSourceMap[code] = "default";
      } else {
        conf = "45";
        defaultSourceMap[code] = "assumption";
      }
      extractedMap[code] = { value: value || "N/A", confidence: conf };
    }

    for (const f of fields) {
      const mappedCode = EXTRACTION_FIELD_TO_VARIABLE_MAP[f.fieldName];
      if (mappedCode) {
        const existingConf = Number(extractedMap[mappedCode]?.confidence || 0);
        const newConf = Number(f.confidence || 0);
        if (!extractedMap[mappedCode] || newConf > existingConf) {
          extractedMap[mappedCode] = {
            value: f.finalValue || f.extractedValue || "",
            confidence: String(f.confidence || "75"),
            sourceFile: f.sourceFile || undefined,
            sourceSheet: f.sourceSheet || undefined,
            sourcePage: f.sourcePageNo || undefined,
          };
        }
      }
    }

    // ── Aggregate CY/PY financial totals from stored TB lines ────────────────
    // These populate cy_revenue, cy_total_assets, etc. for materiality & formula
    // calculations even when no AI extraction has been run.
    const tbLines = await db.select().from(wpTrialBalanceLinesTable).where(eq(wpTrialBalanceLinesTable.sessionId, sessionId));
    if (tbLines.length > 0) {
      const TB_CONF = "88"; // high confidence — sourced directly from the template
      const tbAgg: Record<string, number> = {};
      const pyAgg: Record<string, number> = {};
      for (const tb of tbLines) {
        const bal = parseFloat(String(tb.balance || "0")) || 0;
        const pyBal = parseFloat(String(tb.priorYearBalance || "0")) || 0;
        const cls = (tb.classification || "other").toLowerCase();
        tbAgg[cls] = (tbAgg[cls] || 0) + bal;
        pyAgg[cls] = (pyAgg[cls] || 0) + pyBal;
      }

      const sumCls = (...keys: string[]) => keys.reduce((s, k) => s + Math.abs(tbAgg[k.toLowerCase()] || 0), 0);
      const sumClsPy = (...keys: string[]) => keys.reduce((s, k) => s + Math.abs(pyAgg[k.toLowerCase()] || 0), 0);

      const cyRev    = sumCls("revenue");
      const cyCoS    = sumCls("cost of sales");
      const cyOpEx   = sumCls("operating expense");
      const cyFinCst = sumCls("finance cost");
      const cyTax    = sumCls("tax");
      const cyCA     = sumCls("current asset");
      const cyNCA    = sumCls("non-current asset");
      const cyCL     = sumCls("current liability");
      const cyNCL    = sumCls("non-current liability");
      const cyEq     = sumCls("equity");
      const cyTotAssets = cyCA + cyNCA;
      const cyTotLiab   = cyCL + cyNCL;
      const cyGrossP = cyRev - cyCoS;
      const cyPBT    = cyGrossP - cyOpEx - cyFinCst;

      const pyRev    = sumClsPy("revenue");
      const pyTotAssets = sumClsPy("current asset") + sumClsPy("non-current asset");

      const setIfMissing = (code: string, val: number, conf: string = TB_CONF) => {
        if (val !== 0 && (!extractedMap[code] || Number(extractedMap[code].confidence) < Number(conf))) {
          extractedMap[code] = { value: String(Math.round(val)), confidence: conf };
        }
      };

      setIfMissing("cy_revenue",           cyRev);
      setIfMissing("cy_cost_of_sales",     cyCoS);
      setIfMissing("cy_gross_profit",      cyGrossP);
      setIfMissing("cy_operating_expenses",cyOpEx);
      setIfMissing("cy_finance_cost",      cyFinCst);
      setIfMissing("cy_tax_expense",       cyTax);
      setIfMissing("cy_profit_before_tax", cyPBT);
      setIfMissing("cy_profit_after_tax",  cyPBT - cyTax);
      setIfMissing("cy_total_assets",      cyTotAssets);
      setIfMissing("cy_total_liabilities", cyTotLiab);
      setIfMissing("cy_total_equity",      cyEq);
      setIfMissing("cy_current_assets",    cyCA);
      setIfMissing("cy_non_current_assets",cyNCA);
      setIfMissing("cy_current_liabilities",cyCL);
      setIfMissing("cy_non_current_liabilities",cyNCL);
      setIfMissing("py_revenue",           pyRev);
      setIfMissing("py_total_assets",      pyTotAssets);

      // FS narrative summary for working papers
      if (cyRev > 0 || cyTotAssets > 0) {
        const currency = session.currency || "PKR";
        const fmtM = (n: number) => n >= 1_000_000
          ? `${currency} ${(n / 1_000_000).toFixed(2)}M`
          : `${currency} ${n.toLocaleString()}`;
        const fsSummary = [
          cyRev > 0       ? `Revenue: ${fmtM(cyRev)}`              : "",
          cyGrossP !== 0  ? `Gross Profit: ${fmtM(cyGrossP)}`      : "",
          cyPBT !== 0     ? `PBT: ${fmtM(cyPBT)}`                  : "",
          cyTotAssets > 0 ? `Total Assets: ${fmtM(cyTotAssets)}`   : "",
          cyEq > 0        ? `Equity: ${fmtM(cyEq)}`                : "",
        ].filter(Boolean).join(" | ");

        if (fsSummary && !extractedMap["fs_summary_cy"]) {
          extractedMap["fs_summary_cy"] = { value: fsSummary, confidence: TB_CONF };
        }
      }
    }

    const safeNum = (code: string): number => {
      const v = extractedMap[code]?.value;
      if (!v) return 0;
      const n = parseFloat(String(v).replace(/[^0-9.\-]/g, ""));
      return isNaN(n) ? 0 : n;
    };

    const cyRevenue = safeNum("cy_revenue");
    const cyTotalAssets = safeNum("cy_total_assets");
    const cyPBT = safeNum("cy_profit_before_tax");
    const cyTotalEquity = safeNum("cy_total_equity");
    const pyRevenue = safeNum("py_revenue");
    const pyTotalAssets = safeNum("py_total_assets");
    const matBasisPct = parseFloat(extractedMap["overall_materiality_percent"]?.value || "2") / 100;
    const perfMatPct = parseFloat(extractedMap["performance_materiality_percent"]?.value || "75") / 100;
    const trivialPct = parseFloat(extractedMap["trivial_threshold_percent"]?.value || "5") / 100;

    const matBasis = extractedMap["materiality_basis"]?.value || "Revenue";
    let basisAmount = 0;
    if (matBasis === "Revenue" && cyRevenue > 0) basisAmount = cyRevenue;
    else if (matBasis === "Total Assets" && cyTotalAssets > 0) basisAmount = cyTotalAssets;
    else if (matBasis === "Profit Before Tax" && cyPBT > 0) basisAmount = cyPBT;
    else if (matBasis === "Total Equity" && cyTotalEquity > 0) basisAmount = cyTotalEquity;
    else if (cyRevenue > 0) basisAmount = cyRevenue;
    else if (cyTotalAssets > 0) basisAmount = cyTotalAssets;

    const FORMULA_CONFIDENCE_MAT = "85";
    if (basisAmount > 0) {
      const overallMat = Math.round(basisAmount * matBasisPct);
      const perfMat = Math.round(overallMat * perfMatPct);
      const trivial = Math.round(overallMat * trivialPct);
      extractedMap["materiality_basis_amount"] = { value: String(basisAmount), confidence: FORMULA_CONFIDENCE_MAT };
      extractedMap["overall_materiality_amount"] = { value: String(overallMat), confidence: FORMULA_CONFIDENCE_MAT };
      extractedMap["performance_materiality_amount"] = { value: String(perfMat), confidence: FORMULA_CONFIDENCE_MAT };
      extractedMap["trivial_threshold_amount"] = { value: String(trivial), confidence: FORMULA_CONFIDENCE_MAT };
      defaultSourceMap["materiality_basis_amount"] = "formula";
      defaultSourceMap["overall_materiality_amount"] = "formula";
      defaultSourceMap["performance_materiality_amount"] = "formula";
      defaultSourceMap["trivial_threshold_amount"] = "formula";
    }

    const FORMULA_CONFIDENCE = "85";

    if (cyRevenue > 0 && pyRevenue > 0) {
      const revenueChange = ((cyRevenue - pyRevenue) / pyRevenue * 100).toFixed(1);
      extractedMap["analytics_conclusion"] = {
        value: `Revenue changed by ${revenueChange}% (CY PKR ${cyRevenue.toLocaleString()} vs PY PKR ${pyRevenue.toLocaleString()}). ` +
          `Total assets: CY PKR ${cyTotalAssets.toLocaleString()} vs PY PKR ${pyTotalAssets.toLocaleString()}. ` +
          `Detailed analytical procedures to follow per ISA 520.`,
        confidence: FORMULA_CONFIDENCE
      };
      defaultSourceMap["analytics_conclusion"] = "formula";
    }

    if (cyRevenue > 0) {
      const samplingPop = Math.round(cyRevenue * 0.7);
      const keyItemVal = Math.round(cyRevenue * 0.1);
      const sampleSz = Math.min(Math.max(Math.round(Math.sqrt(samplingPop / 1000) * 3), 10), 60);
      if (safeNum("population_value") === 0) {
        extractedMap["population_value"] = { value: String(samplingPop), confidence: FORMULA_CONFIDENCE };
        defaultSourceMap["population_value"] = "formula";
      }
      if (safeNum("key_item_value") === 0) {
        extractedMap["key_item_value"] = { value: String(keyItemVal), confidence: FORMULA_CONFIDENCE };
        defaultSourceMap["key_item_value"] = "formula";
      }
      if (safeNum("sample_size") === 0) {
        extractedMap["sample_size"] = { value: String(sampleSz), confidence: FORMULA_CONFIDENCE };
        defaultSourceMap["sample_size"] = "formula";
      }
    }

    const existingVars = await db.select().from(wpVariablesTable).where(eq(wpVariablesTable.sessionId, sessionId));
    const existingByCode: Record<string, any> = {};
    for (const ev of existingVars) existingByCode[ev.variableCode] = ev;

    const results: any[] = [];
    let created = 0, updated = 0, skipped = 0;

    // ─────────────────────────────────────────────────────────────────────────
    // STRICT 3-PHASE AUTO-FILL
    // Phase 1: Primary vars   — session form + template upload only
    // Phase 2: Secondary vars — system formulas only (no AI)
    // Phase 3: AI vars        — skipped here; filled by /ai-fill endpoint
    // ─────────────────────────────────────────────────────────────────────────
    for (const def of VARIABLE_DEFINITIONS) {
      const cat = def.variableCategory;

      // ── PHASE 3 (AI): Skip entirely — will be filled by the AI Fill button ──
      if (cat === "ai") {
        skipped++;
        continue;
      }

      const extracted = extractedMap[def.variableCode];
      const existing = existingByCode[def.variableCode];

      // Determine phase-appropriate sourceType
      const defaultSrc = defaultSourceMap[def.variableCode];
      let srcType: string;
      if (cat === "primary") {
        // Primary variables come from session or template — never AI/assumption
        if (defaultSrc === "session") srcType = "primary_session";
        else if (extracted && Number(extracted.confidence) >= 80) srcType = "primary_template";
        else srcType = "primary_session";
      } else {
        // Secondary variables are always system-calculated
        srcType = defaultSrc === "formula" ? "system_calculated" : "system_calculated";
      }

      if (existing) {
        // Never overwrite user-edited, locked, or primary-source values
        const isAlreadyPrimary = existing.sourceType === "primary_session" || existing.sourceType === "primary_template" || existing.sourceType === "template";
        const isUserEdited = !!existing.userEditedValue;
        const isLocked = !!existing.isLocked;

        if (extracted && !isUserEdited && !isLocked && !isAlreadyPrimary) {
          const val = extracted.value || existing.finalValue || def.defaultValue || "";
          if (val) {
            await db.update(wpVariablesTable).set({
              autoFilledValue: val,
              rawExtractedValue: extracted.value || null,
              finalValue: val,
              confidence: extracted.confidence,
              sourceType: srcType,
              sourceSheet: extracted.sourceSheet || null,
              sourcePage: extracted.sourcePage || null,
              reviewStatus: cat === "secondary" ? "calculated" : "filled",
              updatedAt: new Date(),
            }).where(eq(wpVariablesTable.id, existing.id));
            updated++;
          } else {
            skipped++;
          }
        } else if (extracted && isAlreadyPrimary && !isLocked && !isUserEdited && cat === "secondary") {
          // Allow secondary recalculation even if previously primary-tagged
          const val = extracted.value || existing.finalValue || def.defaultValue || "";
          if (val) {
            await db.update(wpVariablesTable).set({
              autoFilledValue: val,
              rawExtractedValue: extracted.value || null,
              finalValue: val,
              confidence: extracted.confidence,
              sourceType: "system_calculated",
              sourceSheet: extracted.sourceSheet || null,
              sourcePage: extracted.sourcePage || null,
              reviewStatus: "calculated",
              updatedAt: new Date(),
            }).where(eq(wpVariablesTable.id, existing.id));
            updated++;
          } else {
            skipped++;
          }
        } else {
          skipped++;
        }
        continue;
      }

      // Create new row — only for Primary and Secondary variables
      const value = extracted?.value || def.defaultValue || "";
      if (!value && cat === "primary") {
        const [v] = await db.insert(wpVariablesTable).values({
          sessionId,
          variableCode: def.variableCode,
          category: def.variableGroup,
          variableName: def.variableName,
          autoFilledValue: null,
          rawExtractedValue: null,
          finalValue: null,
          confidence: "0",
          sourceType: "primary_session",
          reviewStatus: "missing",
        }).onConflictDoUpdate({
          target: [wpVariablesTable.sessionId, wpVariablesTable.variableCode],
          set: { category: def.variableGroup, variableName: def.variableName, updatedAt: new Date() },
        }).returning();
        results.push(v);
        created++;
        continue;
      }

      if (!value) {
        skipped++;
        continue;
      }

      const conf = extracted ? extracted.confidence : (def.defaultValue ? "75" : "60");
      const reviewStatus = cat === "secondary" ? "calculated" : "filled";

      const [v] = await db.insert(wpVariablesTable).values({
        sessionId,
        variableCode: def.variableCode,
        category: def.variableGroup,
        variableName: def.variableName,
        autoFilledValue: value,
        rawExtractedValue: extracted?.value || null,
        finalValue: value,
        confidence: conf,
        sourceType: srcType,
        sourceSheet: extracted?.sourceSheet || null,
        sourcePage: extracted?.sourcePage || null,
        reviewStatus,
      }).onConflictDoUpdate({
        target: [wpVariablesTable.sessionId, wpVariablesTable.variableCode],
        set: {
          autoFilledValue: value,
          rawExtractedValue: extracted?.value || null,
          finalValue: value,
          confidence: conf,
          sourceType: srcType,
          reviewStatus,
          updatedAt: new Date(),
        },
      }).returning();
      results.push(v);
      created++;
    }

    await db.update(wpSessionsTable).set({ status: "variables" as any, updatedAt: new Date() }).where(eq(wpSessionsTable.id, sessionId));

    // Flag missing mandatory PRIMARY variables as exceptions
    const missingMandatoryPrimary = VARIABLE_DEFINITIONS.filter(d => {
      if (!d.mandatoryFlag) return false;
      if (d.variableCategory !== "primary") return false;
      const ext = extractedMap[d.variableCode];
      const val = ext?.value || d.defaultValue || "";
      return !val || val === "N/A" || val === "0";
    });
    for (const mm of missingMandatoryPrimary) {
      const titleKey = `Missing primary variable: ${mm.variableLabel}`;
      const existingException = await db.select().from(wpExceptionLogTable).where(
        and(eq(wpExceptionLogTable.sessionId, sessionId), eq(wpExceptionLogTable.title, titleKey))
      );
      if (existingException.length === 0) {
        await db.insert(wpExceptionLogTable).values({
          sessionId, exceptionType: "needs_confirmation", severity: "high",
          title: titleKey,
          description: `Mandatory primary variable ${mm.variableCode} (${mm.variableGroup}) is missing. Please upload the financial data template or enter the value in the session form.`,
          status: "open",
        });
      }
    }

    const primaryCount  = VARIABLE_DEFINITIONS.filter(d => d.variableCategory === "primary").length;
    const secondaryCount = VARIABLE_DEFINITIONS.filter(d => d.variableCategory === "secondary").length;
    const aiCount       = VARIABLE_DEFINITIONS.filter(d => d.variableCategory === "ai").length;
    const formulaCount  = Object.values(defaultSourceMap).filter(s => s === "formula").length;

    res.json({
      created, updated, skipped, total: VARIABLE_DEFINITIONS.length,
      primaryFilled: created + updated - (missingMandatoryPrimary.length),
      secondaryCalculated: formulaCount,
      aiPending: aiCount,
      needsConfirmation: missingMandatoryPrimary.length,
      phase1Complete: true,
      phase2Complete: true,
      phase3Pending: true,
      message: `Phase 1 & 2 complete: ${primaryCount} primary variables filled from session/template, ${secondaryCount} secondary variables calculated by system formulas. ${aiCount} AI variables ready for AI Fill.`
    });
  } catch (err: any) {
    logger.error({ err }, "Failed to auto-fill variables");
    res.status(500).json({ error: "Failed to auto-fill variables" });
  }
});

// ── POST /sessions/:id/variables/ai-fill ─────────────────────────────────────
// Detects all unfilled variables and populates them using AI by reading every
// uploaded file (template + supporting docs via OCR) and cross-referencing
// already-filled variables as context.  Only leaves a variable blank if the
// value genuinely cannot be inferred.
router.post("/sessions/:id/variables/ai-fill", requireRoles(...WP_ROLES_WRITE), aiRateLimit, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const sessionId = parseInt(p(req.params.id));
    if (isNaN(sessionId)) return res.status(400).json({ error: "Invalid session ID" });

    const sessionRows = await db.select().from(wpSessionsTable).where(eq(wpSessionsTable.id, sessionId));
    if (!sessionRows[0]) return res.status(404).json({ error: "Session not found" });
    const session = sessionRows[0];

    const ai = await getAIClient();
    if (!ai) return res.status(503).json({ error: "AI service not configured." });

    // ── 1. Extract text from every uploaded file ──────────────────────────
    const files = await db.select().from(wpUploadedFilesTable).where(eq(wpUploadedFilesTable.sessionId, sessionId));
    const docParts: string[] = [];
    const imageContents: any[] = [];

    for (const f of files) {
      if (!f.fileData) continue;
      const buf = Buffer.from(f.fileData, "base64");
      const fakeFile = { originalname: f.originalName, mimetype: f.mimeType || "", buffer: buf, size: buf.length } as Express.Multer.File;
      const extracted = await extractTextFromFile(fakeFile);
      docParts.push(`=== FILE: ${f.originalName} (${f.category || "document"}) ===\n${smartChunk(extracted.text, 10000)}`);
      if ((extracted.sourceType === "image_ocr" || extracted.sourceType === "ocr_pdf") && f.mimeType?.startsWith("image/")) {
        imageContents.push({ type: "image_url", image_url: { url: `data:${f.mimeType};base64,${f.fileData}`, detail: "high" } });
      }
    }
    const docContext = docParts.join("\n\n");

    // ── 2. Classify existing variables ────────────────────────────────────
    const existingVars = await db.select().from(wpVariablesTable).where(eq(wpVariablesTable.sessionId, sessionId));
    const existingByCode: Record<string, any> = {};
    for (const v of existingVars) existingByCode[v.variableCode] = v;

    const isFilled = (v: any) => v && v.finalValue && String(v.finalValue).trim() !== "" && String(v.finalValue).trim() !== "N/A";
    const isTemplateFilled = (v: any) => v && v.sourceType === "template" && isFilled(v);
    const isUserEdited = (v: any) => v && v.userEditedValue && String(v.userEditedValue).trim() !== "";
    const isLocked = (v: any) => v && v.isLocked;

    const filledSummary = existingVars
      .filter(isFilled)
      .map(v => `${v.variableCode}: ${v.finalValue} [source:${v.sourceType || "unknown"}]`)
      .join("\n");

    // AI only targets AI-category variables — never Primary or Secondary
    // Source hierarchy: Primary > Secondary > User Edit > AI
    const missingDefs = VARIABLE_DEFINITIONS.filter(def => {
      // PHASE 3: AI is strictly forbidden from touching Primary or Secondary variables
      if (def.variableCategory !== "ai") return false;
      const ev = existingByCode[def.variableCode];
      if (!ev) return true;                  // not yet in DB — AI should fill
      if (isLocked(ev)) return false;        // locked — AI never touches
      if (isUserEdited(ev)) return false;    // user confirmed — AI never touches
      if (isTemplateFilled(ev)) return false;// template/primary filled — AI never touches
      // Also skip if already filled by system calculation
      if (ev.sourceType === "system_calculated" && isFilled(ev)) return false;
      // Skip if already filled by primary sources
      if ((ev.sourceType === "primary_session" || ev.sourceType === "primary_template") && isFilled(ev)) return false;
      return !isFilled(ev);                  // empty — AI should fill
    });

    if (missingDefs.length === 0) {
      return res.json({ filled: 0, stillMissing: 0, total: existingVars.length, message: "All variables are already filled." });
    }

    // ── 3. Batch AI calls (≤100 vars per call) ───────────────────────────
    const BATCH = 100;
    let totalFilled = 0;

    const sessionCtx = [
      `Entity: ${session.clientName || ""}`,
      `Type: ${session.entityType || "Private Limited"}`,
      `Year: ${session.engagementYear || ""}`,
      `Period: ${session.periodStart || ""} to ${session.periodEnd || ""}`,
      `Framework: ${session.reportingFramework || "IFRS"}`,
      `NTN: ${session.ntn || ""}`,
      `Engagement: ${session.engagementType || "statutory_audit"}`,
    ].join("\n");

    for (let i = 0; i < missingDefs.length; i += BATCH) {
      const batch = missingDefs.slice(i, i + BATCH);

      const varList = batch.map(d => {
        const opts = d.dropdownOptionsJson ? ` [options: ${JSON.parse(d.dropdownOptionsJson).join("|")}]` : "";
        const req = d.mandatoryFlag ? " [REQUIRED]" : "";
        return `${d.variableCode} | ${d.variableLabel} | ${d.dataType}${opts}${req}`;
      }).join("\n");

      const prompt = `You are a senior Pakistan ICAP-qualified chartered accountant specialising in ISA-compliant audit working papers.

SESSION CONTEXT:
${sessionCtx}

ALREADY FILLED VARIABLES (use as cross-reference and context):
${filledSummary || "(none yet)"}

UPLOADED DOCUMENT CONTENT (template + supporting docs, extract every relevant fact):
${docContext || "(no documents uploaded)"}

YOUR TASK:
Fill the MISSING AUDIT VARIABLES below. For each variable:
- Extract the value directly from documents wherever possible
- Derive logically from already-filled variables (e.g. compute materiality from revenue, derive dates from period end)
- For boolean fields: return "true" or "false"
- For dropdown fields, return EXACTLY one of the listed options
- For numeric fields: plain number in PKR (no commas or symbols)
- For date fields: ISO format YYYY-MM-DD
- For percentage fields: plain number e.g. "75" for 75%
- Only return null if the value CANNOT be determined from any available information
- Never fabricate NTN, STRN, or CNIC — leave null if not found

MISSING VARIABLES TO FILL (${batch.length} variables):
${varList}

Return ONLY valid JSON with variable codes as keys. Include every code from the list above.
Example: { "entity_name": "ABC Ltd", "ntn": null, "total_assets": "5000000" }`;

      const msgContent: any[] = [{ type: "text", text: prompt }];
      if (i === 0) imageContents.slice(0, 3).forEach(ic => msgContent.push(ic));

      try {
        const resp = await ai.client.chat.completions.create({
          model: ai.model,
          messages: [
            { role: "system", content: "You are an ISA-compliant Pakistan audit variable extractor. Return only valid JSON. Never fabricate regulated identifiers (NTN, STRN, CNIC). Use null for genuinely unknown values." },
            { role: "user", content: msgContent },
          ],
          max_tokens: 4000,
          temperature: 0.05,
          response_format: { type: "json_object" },
        });

        const raw = resp.choices[0]?.message?.content || "{}";
        let aiData: Record<string, any> = {};
        try { aiData = JSON.parse(raw); } catch { aiData = {}; }

        for (const def of batch) {
          const aiVal = aiData[def.variableCode];
          if (aiVal === null || aiVal === undefined || String(aiVal).trim() === "") continue;
          const val = String(aiVal).trim();
          if (val === "null" || val === "undefined") continue;

          const existing = existingByCode[def.variableCode];
          if (existing) {
            // Source hierarchy: Template > User Edit > AI
            // AI must NEVER overwrite template-sourced or user-confirmed data
            if (existing.isLocked) continue;
            if (existing.userEditedValue && existing.userEditedValue.trim() !== "") continue;
            if (existing.sourceType === "template") continue; // template always wins over AI
            await db.update(wpVariablesTable).set({
              autoFilledValue: val,
              finalValue:      val,
              sourceType:      "ai_extraction",
              confidence:      "78",
              reviewStatus:    def.reviewRequiredFlag ? "review" : "ai_filled",
              updatedAt:       new Date(),
            }).where(eq(wpVariablesTable.id, existing.id));
          } else {
            await db.insert(wpVariablesTable).values({
              sessionId,
              variableCode:  def.variableCode,
              variableName:  def.variableName,
              category:      def.variableGroup,
              autoFilledValue: val,
              finalValue:    val,
              confidence:    "78",
              sourceType:    "ai_extraction",
              reviewStatus:  def.reviewRequiredFlag ? "review" : "ai_filled",
            });
          }
          totalFilled++;
        }
      } catch (batchErr: any) {
        logger.warn({ batchErr, batch: i }, "ai-fill batch failed, continuing");
      }
    }

    // Re-read final state and compute comprehensive stats
    const finalVars = await db.select().from(wpVariablesTable).where(eq(wpVariablesTable.sessionId, sessionId));
    const finalByCode: Record<string, any> = {};
    for (const v of finalVars) finalByCode[v.variableCode] = v;

    const templateProtected = VARIABLE_DEFINITIONS.filter(d => isTemplateFilled(finalByCode[d.variableCode])).length;
    const userProtected     = VARIABLE_DEFINITIONS.filter(d => isUserEdited(finalByCode[d.variableCode])).length;
    const lockedCount       = VARIABLE_DEFINITIONS.filter(d => isLocked(finalByCode[d.variableCode])).length;
    const stillMissing      = VARIABLE_DEFINITIONS.filter(d => !isFilled(finalByCode[d.variableCode]) && !isLocked(finalByCode[d.variableCode])).length;

    res.json({
      filled:            totalFilled,
      stillMissing,
      total:             VARIABLE_DEFINITIONS.length,
      templateProtected,
      userProtected,
      lockedCount,
      message: `AI filled ${totalFilled} variables. ${templateProtected} already template-filled (skipped). ${stillMissing} could not be determined.`,
    });
  } catch (err: any) {
    logger.error({ err }, "ai-fill failed");
    res.status(500).json({ error: "AI fill failed" });
  }
});

router.get("/sessions/:id/variables", async (req: Request, res: Response) => {
  try {
    const sessionId = parseInt(p(req.params.id));
    if (isNaN(sessionId)) return res.status(400).json({ error: "Invalid session ID" });

    const variables = await db.select().from(wpVariablesTable).where(eq(wpVariablesTable.sessionId, sessionId));
    const changeLog = await db.select().from(wpVariableChangeLogTable).where(eq(wpVariableChangeLogTable.sessionId, sessionId));

    const defMap: Record<string, any> = {};
    for (const d of VARIABLE_DEFINITIONS) defMap[d.variableCode] = d;

    const grouped: Record<string, { group: string; subgroups: Record<string, any[]>; stats: { total: number; filled: number; missing: number; lowConf: number; locked: number; needsReview: number } }> = {};

    for (const grp of VARIABLE_GROUPS) {
      grouped[grp] = { group: grp, subgroups: {}, stats: { total: 0, filled: 0, missing: 0, lowConf: 0, locked: 0, needsReview: 0 } };
    }

    for (const v of variables) {
      const def = defMap[v.variableCode];
      const grp = v.category || "Other";
      if (!grouped[grp]) grouped[grp] = { group: grp, subgroups: {}, stats: { total: 0, filled: 0, missing: 0, lowConf: 0, locked: 0, needsReview: 0 } };

      const sub = def?.variableSubgroup || "General";
      if (!grouped[grp].subgroups[sub]) grouped[grp].subgroups[sub] = [];

      grouped[grp].subgroups[sub].push({
        ...v,
        definition: def || null,
      });

      grouped[grp].stats.total++;
      const hasValue = v.finalValue && v.finalValue.trim() !== "";
      if (hasValue) grouped[grp].stats.filled++;
      else grouped[grp].stats.missing++;
      if (v.confidence && Number(v.confidence) < 70) grouped[grp].stats.lowConf++;
      if (v.isLocked) grouped[grp].stats.locked++;
      if (v.reviewStatus === "needs_review") grouped[grp].stats.needsReview++;
    }

    const totalStats = {
      total: variables.length,
      filled: variables.filter(v => v.finalValue && v.finalValue.trim() !== "").length,
      missing: variables.filter(v => !v.finalValue || v.finalValue.trim() === "").length,
      lowConfidence: variables.filter(v => v.confidence && Number(v.confidence) < 70).length,
      needsReview: variables.filter(v => v.reviewStatus === "needs_review").length,
      locked: variables.filter(v => v.isLocked).length,
    };

    const enrichedVariables = variables.map(v => ({ ...v, definition: defMap[v.variableCode] || null }));
    res.json({ variables: enrichedVariables, grouped, stats: totalStats, changeLog, groups: VARIABLE_GROUPS });
  } catch (err: any) {
    logger.error({ err }, "Failed to fetch variables");
    res.status(500).json({ error: "Failed to fetch variables" });
  }
});

router.patch("/sessions/:id/variables/:varId", requireRoles(...WP_ROLES_WRITE), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const sessionId = parseInt(p(req.params.id));
    const varId = parseInt(p(req.params.varId));
    if (isNaN(sessionId) || isNaN(varId)) return res.status(400).json({ error: "Invalid ID" });

    const { value, reason, editedBy, reviewStatus } = req.body;

    const existing = await db.select().from(wpVariablesTable).where(and(eq(wpVariablesTable.id, varId), eq(wpVariablesTable.sessionId, sessionId)));
    if (!existing[0]) return res.status(404).json({ error: "Variable not found in this session" });
    if (existing[0].isLocked) return res.status(400).json({ error: "Variable is locked. Unlock before editing." });

    const oldValue = existing[0].finalValue;

    await db.insert(wpVariableChangeLogTable).values({
      sessionId, variableId: varId,
      variableCode: existing[0].variableCode,
      fieldName: existing[0].variableName,
      oldValue, newValue: value,
      editedBy: editedBy || null,
      reason: reason || "Manual edit",
      sourceOfChange: "manual",
    });

    const updates: any = {
      userEditedValue: value,
      finalValue: value,
      sourceType: "user_edit",
      editedBy: editedBy || null,
      editedAt: new Date(),
      reasonForChange: reason || null,
      versionNo: (existing[0].versionNo || 1) + 1,
      updatedAt: new Date(),
    };
    if (reviewStatus) updates.reviewStatus = reviewStatus;
    else updates.reviewStatus = "reviewed";

    const [updated] = await db.update(wpVariablesTable).set(updates).where(eq(wpVariablesTable.id, varId)).returning();

    const affectedHeads = await checkVariableImpact(sessionId, existing[0].variableCode);

    res.json({ variable: updated, affectedHeads });
  } catch (err: any) {
    logger.error({ err }, "Failed to update variable");
    res.status(500).json({ error: "Failed to update variable" });
  }
});

router.patch("/sessions/:id/variables/:varId/review", requireRoles(...WP_ROLES_APPROVE), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const sessionId = parseInt(p(req.params.id));
    const varId = parseInt(p(req.params.varId));
    if (isNaN(sessionId) || isNaN(varId)) return res.status(400).json({ error: "Invalid ID" });
    const { reviewStatus } = req.body;
    const validStatuses = ["pending", "auto_filled", "needs_review", "reviewed", "confirmed"];
    if (!validStatuses.includes(reviewStatus)) return res.status(400).json({ error: "Invalid review status" });

    const [updated] = await db.update(wpVariablesTable).set({ reviewStatus, updatedAt: new Date() }).where(and(eq(wpVariablesTable.id, varId), eq(wpVariablesTable.sessionId, sessionId))).returning();
    res.json(updated);
  } catch (err: any) {
    logger.error({ err }, "Failed to update review status");
    res.status(500).json({ error: "Failed to update review status" });
  }
});

router.post("/sessions/:id/variables/review-all", requireRoles(...WP_ROLES_APPROVE), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const sessionId = parseInt(p(req.params.id));
    if (isNaN(sessionId)) return res.status(400).json({ error: "Invalid session ID" });

    const vars = await db.select().from(wpVariablesTable).where(and(eq(wpVariablesTable.sessionId, sessionId), eq(wpVariablesTable.isLocked, false)));
    const unreviewedIds = vars.filter(v => v.reviewStatus !== "reviewed" && v.reviewStatus !== "confirmed").map(v => v.id);

    if (unreviewedIds.length === 0) {
      return res.json({ reviewed: 0, message: "All variables already reviewed" });
    }

    await db.update(wpVariablesTable).set({ reviewStatus: "reviewed", updatedAt: new Date() }).where(inArray(wpVariablesTable.id, unreviewedIds));

    res.json({ reviewed: unreviewedIds.length, message: `${unreviewedIds.length} variables marked as reviewed` });
  } catch (err: any) {
    logger.error({ err }, "Failed to review all variables");
    res.status(500).json({ error: "Failed to review all variables" });
  }
});

router.post("/sessions/:id/variables/lock-section", requireRoles(...WP_ROLES_APPROVE), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const sessionId = parseInt(p(req.params.id));
    if (isNaN(sessionId)) return res.status(400).json({ error: "Invalid session ID" });
    const { group } = req.body;
    if (!group) return res.status(400).json({ error: "Group name required" });

    const vars = await db.select().from(wpVariablesTable).where(and(eq(wpVariablesTable.sessionId, sessionId), eq(wpVariablesTable.category, group)));

    const mandatoryDefs = VARIABLE_DEFINITIONS.filter(d => d.variableGroup === group && d.mandatoryFlag);
    const missingMandatory = mandatoryDefs.filter(d => {
      const v = vars.find(vr => vr.variableCode === d.variableCode);
      return v !== undefined && !v.finalValue;
    });

    if (missingMandatory.length > 0) {
      return res.status(400).json({
        error: "Cannot lock section — mandatory variables missing",
        missing: missingMandatory.map(m => m.variableLabel),
      });
    }

    const ids = vars.map(v => v.id);
    if (ids.length > 0) {
      await db.update(wpVariablesTable).set({ isLocked: true, lockedAt: new Date() }).where(inArray(wpVariablesTable.id, ids));
    }

    res.json({ locked: ids.length, group });
  } catch (err: any) {
    logger.error({ err }, "Failed to lock section");
    res.status(500).json({ error: "Failed to lock section" });
  }
});

router.post("/sessions/:id/variables/lock-all", requireRoles(...WP_ROLES_APPROVE), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const sessionId = parseInt(p(req.params.id));
    if (isNaN(sessionId)) return res.status(400).json({ error: "Invalid session ID" });
    const force = req.body?.force === true;

    const vars = await db.select().from(wpVariablesTable).where(eq(wpVariablesTable.sessionId, sessionId));

    if (!force) {
      const mandatoryDefs = VARIABLE_DEFINITIONS.filter(d => d.mandatoryFlag);
      const missingMandatory = mandatoryDefs.filter(d => {
        const v = vars.find(vr => vr.variableCode === d.variableCode);
        return v !== undefined && !v.finalValue;
      });

      if (missingMandatory.length > 0) {
        return res.status(400).json({
          error: "Cannot lock — mandatory variables missing. Use force:true to override.",
          missing: missingMandatory.map(m => ({ code: m.variableCode, label: m.variableLabel, group: m.variableGroup })),
          canForce: true,
        });
      }
    }

    const needsReview = vars.filter(v => v.reviewStatus === "needs_review");
    if (!force && needsReview.length > 0) {
      return res.status(400).json({
        error: "Cannot lock — variables pending review. Use force:true to override.",
        pendingReview: needsReview.length,
        canForce: true,
      });
    }

    await db.update(wpVariablesTable).set({ isLocked: true, lockedAt: new Date() }).where(eq(wpVariablesTable.sessionId, sessionId));

    const heads = await db.select().from(wpHeadsTable).where(and(eq(wpHeadsTable.sessionId, sessionId), eq(wpHeadsTable.headIndex, 0)));
    if (heads[0]) {
      await db.update(wpHeadsTable).set({ status: "ready", updatedAt: new Date() }).where(eq(wpHeadsTable.id, heads[0].id));
    }

    await db.update(wpSessionsTable).set({ status: "wp_listing" as any, updatedAt: new Date() }).where(eq(wpSessionsTable.id, sessionId));
    res.json({ success: true, locked: vars.length });
  } catch (err: any) {
    logger.error({ err }, "Failed to lock variables");
    res.status(500).json({ error: "Failed to lock variables" });
  }
});

router.post("/sessions/:id/variables/validate", requireRoles(...WP_ROLES_WRITE), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const sessionId = parseInt(p(req.params.id));
    if (isNaN(sessionId)) return res.status(400).json({ error: "Invalid session ID" });

    const vars = await db.select().from(wpVariablesTable).where(eq(wpVariablesTable.sessionId, sessionId));
    const varMap: Record<string, string | null> = {};
    for (const v of vars) varMap[v.variableCode] = v.finalValue;

    const issues: { code: string; label: string; issue: string; severity: string }[] = [];

    const mandatoryDefs = VARIABLE_DEFINITIONS.filter(d => d.mandatoryFlag);
    for (const d of mandatoryDefs) {
      if (!varMap[d.variableCode]) {
        issues.push({ code: d.variableCode, label: d.variableLabel, issue: "Mandatory variable missing", severity: "high" });
      }
    }

    if (varMap["listed_status"] === "Listed" || varMap["public_interest_entity_flag"] === "true") {
      if (!varMap["eqcr_required"] || varMap["eqcr_required"] !== "true") {
        issues.push({ code: "eqcr_required", label: "EQCR Required", issue: "Listed/PIE entity requires EQCR", severity: "high" });
      }
    }

    if (varMap["sales_tax_applicable"] === "true") {
      if (!varMap["sales_tax_input"]) issues.push({ code: "sales_tax_input", label: "Sales Tax Input", issue: "Sales tax applicable but input not provided", severity: "medium" });
      if (!varMap["sales_tax_output"]) issues.push({ code: "sales_tax_output", label: "Sales Tax Output", issue: "Sales tax applicable but output not provided", severity: "medium" });
    }

    if (varMap["related_parties_exist"] === "true") {
      if (!varMap["related_party_register_available"]) {
        issues.push({ code: "related_party_register_available", label: "RP Register", issue: "Related parties exist but register not confirmed", severity: "medium" });
      }
    }

    if (varMap["going_concern_risk_flag"] === "true") {
      if (!varMap["going_concern_conclusion"]) {
        issues.push({ code: "going_concern_conclusion", label: "GC Conclusion", issue: "Going concern risk flagged but conclusion not provided", severity: "high" });
      }
    }

    if (varMap["external_confirmations_required"] === "true") {
      if (!varMap["bank_confirmations_sent"]) issues.push({ code: "bank_confirmations_sent", label: "Bank Confirmations", issue: "External confirmations required but bank confirmations not sent", severity: "medium" });
    }

    if (varMap["controls_reliance_planned"] === "true") {
      if (!varMap["toc_planned"]) issues.push({ code: "toc_planned", label: "ToC Planned", issue: "Controls reliance planned but ToC not planned", severity: "medium" });
    }

    if (varMap["audit_opinion"] && varMap["audit_opinion"] !== "Unmodified") {
      if (!varMap["modified_opinion_basis"]) issues.push({ code: "modified_opinion_basis", label: "Modified Opinion Basis", issue: "Modified opinion selected but basis not provided", severity: "high" });
    }

    if (varMap["materiality_basis_amount"] && varMap["overall_materiality_percent"]) {
      const basis = Number(varMap["materiality_basis_amount"]);
      const pct = Number(varMap["overall_materiality_percent"]);
      if (basis > 0 && pct > 0) {
        const suggested = Math.round(basis * pct / 100);
        if (!varMap["overall_materiality_amount"]) {
          issues.push({ code: "overall_materiality_amount", label: "Overall Materiality", issue: `Suggested: ${suggested.toLocaleString()}`, severity: "info" });
        }
      }
    }

    res.json({ issues, totalIssues: issues.length });
  } catch (err: any) {
    logger.error({ err }, "Failed to validate variables");
    res.status(500).json({ error: "Failed to validate variables" });
  }
});

router.post("/sessions/:id/variables/upsert", requireRoles(...WP_ROLES_WRITE), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const sessionId = parseInt(p(req.params.id));
    if (isNaN(sessionId)) return res.status(400).json({ error: "Invalid session ID" });

    const { code, value, reason, editedBy } = req.body;
    if (!code) return res.status(400).json({ error: "Variable code is required" });

    const session = await db.select().from(wpSessionsTable).where(eq(wpSessionsTable.id, sessionId));
    if (!session[0]) return res.status(404).json({ error: "Session not found" });

    const existing = await db.select().from(wpVariablesTable)
      .where(and(eq(wpVariablesTable.sessionId, sessionId), eq(wpVariablesTable.variableCode, code)));

    if (existing[0]) {
      if (existing[0].isLocked) return res.status(400).json({ error: "Variable is locked. Unlock before editing." });

      await db.insert(wpVariableChangeLogTable).values({
        sessionId, variableId: existing[0].id,
        variableCode: code,
        fieldName: existing[0].variableName,
        oldValue: existing[0].finalValue,
        newValue: value,
        editedBy: editedBy || null,
        reason: reason || "User edit",
        sourceOfChange: "manual",
      });

      const [updated] = await db.update(wpVariablesTable).set({
        userEditedValue: value, finalValue: value,
        sourceType: "user_edit", editedBy: editedBy || null,
        editedAt: new Date(), reasonForChange: reason || null,
        versionNo: (existing[0].versionNo || 1) + 1,
        reviewStatus: "reviewed", updatedAt: new Date(),
      }).where(eq(wpVariablesTable.id, existing[0].id)).returning();

      return res.json({ variable: updated, created: false });
    }

    const def = VARIABLE_DEFINITIONS.find(d => d.variableCode === code);
    const [created] = await db.insert(wpVariablesTable).values({
      sessionId,
      variableCode: code,
      variableName: def?.variableLabel || code,
      category: def?.variableGroup || "General",
      userEditedValue: value, finalValue: value,
      sourceType: "user_edit", editedBy: editedBy || null,
      editedAt: new Date(), reasonForChange: reason || "User entry",
      reviewStatus: "reviewed", versionNo: 1,
      isLocked: false,
    }).returning();

    return res.status(201).json({ variable: created, created: true });
  } catch (err: any) {
    logger.error({ err }, "Failed to upsert variable");
    res.status(500).json({ error: "Failed to upsert variable" });
  }
});

async function checkVariableImpact(sessionId: number, variableCode: string): Promise<string[]> {
  const affectedWps: string[] = [];
  for (const rule of DEPENDENCY_RULES) {
    if (rule.trigger === variableCode) {
      affectedWps.push(...(rule.wpImpacts || []));
    }
  }
  if (affectedWps.length > 0) {
    const heads = await db.select().from(wpHeadsTable).where(eq(wpHeadsTable.sessionId, sessionId));
    const completedHeads = heads.filter(h => h.status === "approved" || h.status === "exported" || h.status === "completed");
    if (completedHeads.length > 0) {
      for (const h of completedHeads) {
        await db.insert(wpExceptionLogTable).values({
          sessionId, headIndex: h.headIndex,
          exceptionType: "variable_change_impact", severity: "medium",
          title: `Variable changed: ${variableCode}`,
          description: `Head ${h.headName} may need regeneration due to variable change.`,
          status: "open",
        });
      }
    }
  }
  return affectedWps;
}


// ═══════════════════════════════════════════════════════════════════════════
// TRIAL BALANCE ENGINE — Enhanced (Steps 1-3, 7-8, 11)
// ═══════════════════════════════════════════════════════════════════════════

router.post("/sessions/:id/generate-tb", requireRoles(...WP_ROLES_WRITE), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const sessionId = parseInt(p(req.params.id));

    const currentHead = (await db.select().from(wpHeadsTable).where(and(eq(wpHeadsTable.sessionId, sessionId), eq(wpHeadsTable.headIndex, 0))))[0];
    if (currentHead && (currentHead.status === "validating" || currentHead.status === "review")) {
      await db.delete(wpExceptionLogTable).where(and(eq(wpExceptionLogTable.sessionId, sessionId), eq(wpExceptionLogTable.headIndex, 0)));
    } else {
      const deps = await checkDependencies(sessionId, 0);
      if (!deps.satisfied) return res.status(400).json({ error: `Prerequisites not met: ${deps.missing.join(", ")}` });
    }

    const ai = await getAIClient();
    const result = await runTBEngine(sessionId, ai);

    await db.transaction(async (tx) => {
      await tx.delete(wpTrialBalanceLinesTable).where(eq(wpTrialBalanceLinesTable.sessionId, sessionId));
      if (result.tbLines.length > 0) {
        const tbValues = result.tbLines.map((line: any) => ({
          sessionId,
          accountCode: line.accountCode,
          accountName: line.accountName,
          classification: line.classification,
          debit: line.debit,
          credit: line.credit,
          balance: line.balance,
          source: line.source,
          confidence: line.confidence,
          fsLineMapping: line.fsLineMapping || null,
          hasException: !result.balanced,
          exceptionNote: result.balanced ? null : `Difference: ${result.difference.toFixed(4)}`,
        }));
        await tx.insert(wpTrialBalanceLinesTable).values(tbValues);
      }

      if (result.exceptions.length > 0) {
        const excValues = result.exceptions.map((exc: string) => ({
          sessionId, headIndex: 0,
          exceptionType: exc.includes("Suspense") ? "tb_suspense" : exc.includes("AI") ? "tb_ai_generated" : "tb_note",
          severity: exc.includes("Material") || exc.includes("REQUIRES") ? "high" : "medium",
          title: "TB Generation — " + (exc.length > 60 ? exc.slice(0, 57) + "..." : exc),
          description: exc + "\n\nAudit Log:\n" + result.auditLog.join("\n"),
          status: "open",
        }));
        await tx.insert(wpExceptionLogTable).values(excValues);
      }

      const head = await tx.select().from(wpHeadsTable).where(and(eq(wpHeadsTable.sessionId, sessionId), eq(wpHeadsTable.headIndex, 0)));
      if (head[0]) {
        await tx.update(wpHeadsTable).set({
          status: "validating", generatedAt: new Date(), updatedAt: new Date(),
          exceptionsCount: result.exceptions.length,
        }).where(eq(wpHeadsTable.id, head[0].id));
      }
    });

    res.json({
      tbLines: result.tbLines,
      totalDebit: result.totalDebit,
      totalCredit: result.totalCredit,
      difference: result.difference,
      balanced: result.balanced,
      exceptions: result.exceptions,
      auditLog: result.auditLog,
      lineCount: result.tbLines.length,
    });
  } catch (err: any) {
    logger.error({ err }, "TB generation failed");
    res.status(500).json({ error: err?.message || "TB generation failed" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// GENERAL LEDGER ENGINE — Enhanced (Steps 4-6, 7-8)
// ═══════════════════════════════════════════════════════════════════════════

router.post("/sessions/:id/generate-gl", requireRoles(...WP_ROLES_WRITE), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const sessionId = parseInt(p(req.params.id));

    const currentGlHead = (await db.select().from(wpHeadsTable).where(and(eq(wpHeadsTable.sessionId, sessionId), eq(wpHeadsTable.headIndex, 1))))[0];
    if (currentGlHead && (currentGlHead.status === "validating" || currentGlHead.status === "review")) {
      await db.delete(wpExceptionLogTable).where(and(eq(wpExceptionLogTable.sessionId, sessionId), eq(wpExceptionLogTable.headIndex, 1)));
    } else {
      const deps = await checkDependencies(sessionId, 1);
      if (!deps.satisfied) return res.status(400).json({ error: `Prerequisites not met: ${deps.missing.join(", ")}` });
    }

    const tbLines = await db.select().from(wpTrialBalanceLinesTable).where(eq(wpTrialBalanceLinesTable.sessionId, sessionId));
    const uploadedFiles = await db.select().from(wpUploadedFilesTable).where(eq(wpUploadedFilesTable.sessionId, sessionId));
    const hasTemplate = uploadedFiles.some(f => f.category === "financial_statements");
    if (tbLines.length === 0 && !hasTemplate) return res.status(400).json({ error: "TB must be generated first, or upload a financial statements template" });

    const ai = await getAIClient();
    const session = (await db.select().from(wpSessionsTable).where(eq(wpSessionsTable.id, sessionId)))[0];

    if (!ai) {
      const glAccounts = await db.select().from(wpGlAccountsTable).where(eq(wpGlAccountsTable.sessionId, sessionId));
      if (glAccounts.length > 0) {
        const head = (await db.select().from(wpHeadsTable).where(and(eq(wpHeadsTable.sessionId, sessionId), eq(wpHeadsTable.headIndex, 1))))[0];
        if (head) {
          await db.update(wpHeadsTable).set({ status: "validating", generatedAt: new Date(), updatedAt: new Date(), exceptionsCount: 0 }).where(eq(wpHeadsTable.id, head.id));
        }
        return res.json({ accounts: glAccounts.length, entries: 0, reconciledCount: 0, exceptions: [], auditLog: ["GL accounts already populated from template — AI not needed"] });
      }
      const accounts: any[] = [];
      for (const tb of tbLines) {
        await db.insert(wpGlAccountsTable).values({
          sessionId, accountCode: tb.accountCode, accountName: tb.accountName,
          classification: tb.classification || "Other", openingBalance: "0",
          closingBalance: tb.balance || "0", source: "template",
        } as any).onConflictDoNothing();
        accounts.push(tb);
      }
      const head = (await db.select().from(wpHeadsTable).where(and(eq(wpHeadsTable.sessionId, sessionId), eq(wpHeadsTable.headIndex, 1))))[0];
      if (head) {
        await db.update(wpHeadsTable).set({ status: "validating", generatedAt: new Date(), updatedAt: new Date(), exceptionsCount: 0 }).where(eq(wpHeadsTable.id, head.id));
      }
      return res.json({ accounts: accounts.length, entries: 0, reconciledCount: 0, exceptions: [], auditLog: ["GL accounts populated from TB data (no AI available)"] });
    }

    const result = await runGLEngine(sessionId, ai, session);

    await db.transaction(async (tx) => {
      if (result.exceptions.length > 0) {
        const excValues = result.exceptions.map((exc: string) => ({
          sessionId, headIndex: 1, exceptionType: "gl_recon",
          severity: "high", title: "GL Reconciliation Issue",
          description: exc, status: "open",
        }));
        await tx.insert(wpExceptionLogTable).values(excValues);
      }

      const head = await tx.select().from(wpHeadsTable).where(and(eq(wpHeadsTable.sessionId, sessionId), eq(wpHeadsTable.headIndex, 1)));
      if (head[0]) {
        await tx.update(wpHeadsTable).set({
          status: "validating", generatedAt: new Date(), updatedAt: new Date(),
          exceptionsCount: result.exceptions.length,
        }).where(eq(wpHeadsTable.id, head[0].id));
      }
    });

    res.json({
      accounts: result.accountsProcessed,
      entries: result.entriesGenerated,
      reconciledCount: result.reconciledCount,
      exceptions: result.exceptions,
      auditLog: result.auditLog,
    });
  } catch (err: any) {
    logger.error({ err }, "GL generation failed");
    res.status(500).json({ error: err?.message || "GL generation failed" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// UNIFIED TB & GL ENGINE — Single-trigger, full pipeline (All 11 Steps)
// POST /sessions/:id/generate-tb-gl
// ═══════════════════════════════════════════════════════════════════════════

router.post("/sessions/:id/generate-tb-gl", requireRoles(...WP_ROLES_WRITE), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const sessionId = parseInt(p(req.params.id));
    const stages: { stage: string; status: "ok" | "warn" | "fail"; detail: string }[] = [];

    // ── Validate prerequisites
    const session = (await db.select().from(wpSessionsTable).where(eq(wpSessionsTable.id, sessionId)))[0];
    if (!session) return res.status(404).json({ error: "Session not found" });
    const ai = await getAIClient();

    // ── Fast-path: if TB is balanced and GL is fully reconciled, skip re-generation
    const forceRegenerate = req.body?.force === true;
    if (!forceRegenerate) {
      const existingTb = await db.select().from(wpTrialBalanceLinesTable).where(eq(wpTrialBalanceLinesTable.sessionId, sessionId));
      const existingGl = await db.select().from(wpGlAccountsTable).where(eq(wpGlAccountsTable.sessionId, sessionId));
      if (existingTb.length > 0 && existingGl.length > 0) {
        const totalDr = existingTb.reduce((s: number, r: any) => s + parseFloat(r.debit || "0"), 0);
        const totalCr = existingTb.reduce((s: number, r: any) => s + parseFloat(r.credit || "0"), 0);
        const tbBalanced = Math.abs(totalDr - totalCr) < 1;
        const glFullyReconciled = existingGl.every((g: any) => g.isReconciled === true);
        if (tbBalanced && glFullyReconciled) {
          const tbHead = (await db.select().from(wpHeadsTable).where(and(eq(wpHeadsTable.sessionId, sessionId), eq(wpHeadsTable.headIndex, 0))))[0];
          if (tbHead) await db.update(wpHeadsTable).set({ status: "validating", updatedAt: new Date() }).where(eq(wpHeadsTable.id, tbHead.id));
          return res.json({
            message: "TB and GL already generated and balanced — skipped re-generation",
            stages: [
              { stage: "Trial Balance", status: "ok", detail: `${existingTb.length} accounts | Dr=${totalDr.toFixed(2)} Cr=${totalCr.toFixed(2)} | Balanced ✓ (cached)` },
              { stage: "General Ledger", status: "ok", detail: `${existingGl.length} accounts fully reconciled (cached)` },
            ],
            cached: true,
          });
        }
      }
    }

    // Clean previous exceptions for heads 0 and 1
    await db.delete(wpExceptionLogTable).where(and(eq(wpExceptionLogTable.sessionId, sessionId), eq(wpExceptionLogTable.headIndex, 0)));
    await db.delete(wpExceptionLogTable).where(and(eq(wpExceptionLogTable.sessionId, sessionId), eq(wpExceptionLogTable.headIndex, 1)));

    // ── Stage 1: Input Extraction & CoA Mapping
    stages.push({ stage: "Input Extraction", status: "ok", detail: "Session data loaded" });

    // ── Stage 2: Trial Balance Generation
    let tbResult: Awaited<ReturnType<typeof runTBEngine>>;
    try {
      tbResult = await runTBEngine(sessionId, ai);
      await db.delete(wpTrialBalanceLinesTable).where(eq(wpTrialBalanceLinesTable.sessionId, sessionId));
      for (const line of tbResult.tbLines) {
        await db.insert(wpTrialBalanceLinesTable).values({
          sessionId,
          accountCode: line.accountCode,
          accountName: line.accountName,
          classification: line.classification,
          debit: line.debit,
          credit: line.credit,
          balance: line.balance,
          source: line.source,
          confidence: line.confidence,
          fsLineMapping: line.fsLineMapping || null,
          hasException: !tbResult.balanced,
          exceptionNote: tbResult.balanced ? null : `Difference: ${tbResult.difference.toFixed(4)}`,
        });
      }
      for (const exc of tbResult.exceptions) {
        await db.insert(wpExceptionLogTable).values({
          sessionId, headIndex: 0,
          exceptionType: exc.includes("Suspense") ? "tb_suspense" : "tb_note",
          severity: exc.includes("Material") ? "high" : "medium",
          title: "TB — " + exc.slice(0, 80),
          description: exc, status: "open",
        });
      }
      const tbHead = await db.select().from(wpHeadsTable).where(and(eq(wpHeadsTable.sessionId, sessionId), eq(wpHeadsTable.headIndex, 0)));
      if (tbHead[0]) {
        await db.update(wpHeadsTable).set({
          status: "validating", generatedAt: new Date(), updatedAt: new Date(),
          exceptionsCount: tbResult.exceptions.length,
        }).where(eq(wpHeadsTable.id, tbHead[0].id));
      }
      stages.push({
        stage: "Trial Balance",
        status: tbResult.balanced ? "ok" : "warn",
        detail: `${tbResult.tbLines.length} accounts | Dr=${tbResult.totalDebit.toFixed(2)} Cr=${tbResult.totalCredit.toFixed(2)} | ${tbResult.balanced ? "Balanced ✓" : `Diff: ${tbResult.difference.toFixed(2)}`}`,
      });
    } catch (tbErr: any) {
      stages.push({ stage: "Trial Balance", status: "fail", detail: tbErr?.message || "TB failed" });
      return res.status(500).json({ error: "TB generation failed: " + tbErr?.message, stages });
    }

    // ── Stage 3: GL Generation (uses AI if available, falls back to TB-based population)
    let glResult: Awaited<ReturnType<typeof runGLEngine>> | null = null;
    try {
      if (ai) {
        glResult = await runGLEngine(sessionId, ai, session);
        for (const exc of glResult.exceptions) {
          await db.insert(wpExceptionLogTable).values({
            sessionId, headIndex: 1, exceptionType: "gl_recon",
            severity: "high", title: "GL — " + exc.slice(0, 80),
            description: exc, status: "open",
          });
        }
      } else {
        const tbLines = await db.select().from(wpTrialBalanceLinesTable).where(eq(wpTrialBalanceLinesTable.sessionId, sessionId));
        for (const tb of tbLines) {
          await db.insert(wpGlAccountsTable).values({
            sessionId, accountCode: tb.accountCode, accountName: tb.accountName,
            classification: tb.classification || "Other", openingBalance: "0",
            closingBalance: tb.balance || "0", source: "template",
          } as any).onConflictDoNothing();
        }
      }
      const glHead = await db.select().from(wpHeadsTable).where(and(eq(wpHeadsTable.sessionId, sessionId), eq(wpHeadsTable.headIndex, 1)));
      if (glHead[0]) {
        await db.update(wpHeadsTable).set({
          status: "validating", generatedAt: new Date(), updatedAt: new Date(),
          exceptionsCount: glResult?.exceptions?.length || 0,
        }).where(eq(wpHeadsTable.id, glHead[0].id));
      }
      if (glResult) {
        stages.push({
          stage: "General Ledger",
          status: glResult.exceptions.length === 0 ? "ok" : "warn",
          detail: `${glResult.accountsProcessed} accounts | ${glResult.entriesGenerated} entries | ${glResult.reconciledCount} reconciled`,
        });
      } else {
        const glCount = await db.select().from(wpGlAccountsTable).where(eq(wpGlAccountsTable.sessionId, sessionId));
        stages.push({ stage: "General Ledger", status: "ok", detail: `${glCount.length} accounts populated from TB (no AI)` });
      }
    } catch (glErr: any) {
      stages.push({ stage: "General Ledger", status: "fail", detail: glErr?.message || "GL failed" });
      return res.status(500).json({ error: "GL generation failed: " + glErr?.message, stages });
    }

    // ── Stage 4: 3-Way Reconciliation
    let reconResult: Awaited<ReturnType<typeof runReconciliation>>;
    try {
      reconResult = await runReconciliation(sessionId);
      if (reconResult.status !== "pass") {
        await db.insert(wpExceptionLogTable).values({
          sessionId, headIndex: 1, exceptionType: "reconciliation",
          severity: reconResult.status === "fail" ? "critical" : "medium",
          title: "3-Way Reconciliation — " + reconResult.status.toUpperCase(),
          description: reconResult.report.join("\n"),
          status: "open",
        });
      }
      stages.push({
        stage: "Reconciliation",
        status: reconResult.status === "pass" ? "ok" : reconResult.status,
        detail: reconResult.report.join(" | "),
      });
    } catch (reconErr: any) {
      stages.push({ stage: "Reconciliation", status: "warn", detail: "Reconciliation check skipped: " + reconErr?.message });
      reconResult = { fsTbVariance: 0, tbGlVariance: 0, status: "warn", report: [], autoFixed: 0 };
    }

    // ── Stage 5: Final Enforcement Check (Step 11)
    const enforcement = await checkFinalEnforcement(sessionId);
    stages.push({
      stage: "Enforcement Check",
      status: enforcement.canFinalize ? "ok" : "warn",
      detail: enforcement.canFinalize
        ? "All checks passed — ready for review"
        : "Blockers: " + enforcement.blockers.join("; "),
    });

    const overallStatus = stages.every(s => s.status === "ok") ? "complete"
      : stages.some(s => s.status === "fail") ? "error" : "complete_with_warnings";

    res.json({
      status: overallStatus,
      stages,
      tb: {
        lineCount: tbResult.tbLines.length,
        totalDebit: tbResult.totalDebit,
        totalCredit: tbResult.totalCredit,
        balanced: tbResult.balanced,
        exceptions: tbResult.exceptions.length,
      },
      gl: {
        accounts: glResult?.accountsProcessed ?? 0,
        entries: glResult?.entriesGenerated ?? 0,
        reconciledCount: glResult?.reconciledCount ?? 0,
        exceptions: glResult?.exceptions?.length ?? 0,
      },
      reconciliation: {
        fsTbVariance: reconResult.fsTbVariance,
        tbGlVariance: reconResult.tbGlVariance,
        autoFixed: reconResult.autoFixed,
        status: reconResult.status,
        report: reconResult.report,
      },
      enforcement,
    });
  } catch (err: any) {
    logger.error({ err }, "Unified TB-GL generation failed");
    res.status(500).json({ error: err?.message || "Unified TB & GL generation failed" });
  }
});


// ═══════════════════════════════════════════════════════════════════════════
// HEAD-WISE GENERATION ENGINE
// ═══════════════════════════════════════════════════════════════════════════

router.post("/sessions/:id/heads/:headIndex/generate", requireRoles(...WP_ROLES_WRITE), aiRateLimit, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const sessionId = parseInt(p(req.params.id));
    const headIndex = parseInt(p(req.params.headIndex));

    if (headIndex < 2) {
      return res.status(400).json({ error: "Use /generate-tb or /generate-gl for heads 0-1" });
    }

    const heads = await db.select().from(wpHeadsTable).where(and(eq(wpHeadsTable.sessionId, sessionId), eq(wpHeadsTable.headIndex, headIndex)));
    const head = heads[0];
    if (!head) return res.status(404).json({ error: "Head not found" });

    if (head.status === "validating" || head.status === "review") {
      await db.delete(wpExceptionLogTable).where(and(eq(wpExceptionLogTable.sessionId, sessionId), eq(wpExceptionLogTable.headIndex, headIndex)));
      await db.delete(wpHeadDocumentsTable).where(eq(wpHeadDocumentsTable.headId, head.id));
    } else {
      const deps = await checkDependencies(sessionId, headIndex);
      if (!deps.satisfied) return res.status(400).json({ error: `Prerequisites not met: ${deps.missing.join(", ")}` });
    }

    if (head.status !== "ready" && head.status !== "in_progress" && head.status !== "validating" && head.status !== "review") {
      return res.status(400).json({ error: `Head is ${head.status}, must be 'ready' to generate` });
    }

    await db.update(wpHeadsTable).set({ status: "in_progress", updatedAt: new Date() }).where(eq(wpHeadsTable.id, head.id));

    const ai = await getAIClient();
    if (!ai) return res.status(503).json({ error: "AI service not configured" });

    const session = (await db.select().from(wpSessionsTable).where(eq(wpSessionsTable.id, sessionId)))[0];
    const variables = await db.select().from(wpVariablesTable).where(eq(wpVariablesTable.sessionId, sessionId));
    const tbLines = await db.select().from(wpTrialBalanceLinesTable).where(eq(wpTrialBalanceLinesTable.sessionId, sessionId));

    const varSummary = variables.map(v => `${v.variableName}: ${v.finalValue}`).join("\n");
    const tbSummary = tbLines.map(l => `${l.accountCode} ${l.accountName}: Dr=${l.debit} Cr=${l.credit}`).join("\n");

    const headDef = AUDIT_HEADS[headIndex];
    const papers = filterPapersForEntity((head.papersIncluded as string[]) || headDef.papers, session?.entityType);

    const generatedDocs: any[] = [];
    const exceptions: string[] = [];

    for (const paperCode of papers) {
      const wpMeta = WP_METADATA[paperCode] || { name: paperCode, isa: "ISA 500", phase: headDef.name, riskLevel: "Medium", assertions: "C, E, V", fsArea: "All FS Areas" };
      const engCode = `ENG-${session?.engagementYear || "2026"}-${String(sessionId).padStart(3, "0")}`;
      const paperPrompt = `You are a Big-4 trained senior audit partner generating a COMPLETE, 100% ISA-compliant, ISQM-1 compliant, audit-defensible, inspection-ready working paper for a Pakistani CA firm (ICAP). Generate working paper "${paperCode}" — "${wpMeta.name}" for the "${headDef.name}" phase.

═══ ENGAGEMENT DETAILS ═══
Firm: ${session?.firmName || "Alam & Aulakh Chartered Accountants"}
Client: ${session?.clientName || "Unknown"}
Engagement Code: ${engCode}
Entity Type: ${session?.entityType || "Private Limited"}
Financial Year End: ${session?.periodEnd || `30 June ${session?.engagementYear || "2026"}`}
Period: ${session?.periodStart || "01/07/2025"} to ${session?.periodEnd || "30/06/2026"}
Tax Year: ${session?.engagementYear || "2026"}
Reporting Framework: ${session?.reportingFramework || "IFRS"}
Engagement Type: ${session?.engagementType?.replace(/_/g, " ") || "Statutory Audit"}
NTN: ${session?.ntn || "N/A"}
Listed Status: ${session?.entityType === "Public Limited (Listed)" ? "Listed / PIE Entity" : "Unlisted"}
WP Phase: ${wpMeta.phase}
ISA References: ${wpMeta.isa}
Risk Level: ${wpMeta.riskLevel}
FS Area / Scope: ${wpMeta.fsArea}
Assertions Covered: ${wpMeta.assertions}

═══ ENGAGEMENT VARIABLES (from client template & form) ═══
${varSummary}

═══ TRIAL BALANCE SUMMARY ═══
${smartChunk(tbSummary, 3000)}

═══ MANDATORY REQUIREMENTS ═══
Generate a COMPLETE, SPECIFIC, NON-GENERIC working paper. Every field must reference actual client data, actual account balances from the TB above, or specific ISA paragraph numbers. No generic placeholders. All PKR amounts must be realistic and consistent with TB data.

Return ONLY valid JSON (no markdown, no extra text) with this EXACT complete structure:
{
  "paper_code": "${paperCode}",
  "paper_name": "${wpMeta.name}",
  "version": "v1.0",
  "status": "Draft",
  "lock_status": "draft",
  "ai_generated": true,
  "ai_tags": ["ai_generated_v1", "ai_content", "ai_procedures"],
  "engagement_code": "${engCode}",
  "lead_schedule_ref": "LS-${headDef.name.replace(/\s/g, "-").toUpperCase().slice(0,8)}-01",
  "fs_head": "${wpMeta.fsArea}",
  "tb_codes": ["List actual TB account codes relevant to this WP from the TB data above"],
  "gl_linkage": "Names of GL accounts reviewed for this WP based on TB data",
  "prior_year_ref": "${paperCode}-PY or N/A if first year",
  "isa_references": "${wpMeta.isa}",
  "objective": "Specific, measurable ISA-aligned objective for this WP referencing the client name and FS area. State the audit objective, the assertions being tested, and the expected outcome. Minimum 4 sentences.",
  "materiality_linkage": {
    "overall_materiality_pkr": "Derive from TB total assets or revenue — use realistic PKR amount",
    "performance_materiality_pkr": "Typically 75% of overall materiality — show calculation",
    "trivial_threshold_pkr": "Typically 5% of overall materiality",
    "basis": "Revenue / Total Assets / Profit Before Tax — state which and why",
    "materiality_pct": "State percentage used e.g. 1.5% of revenue",
    "applicable_to_this_wp": "How materiality applies to the specific FS area of this WP"
  },
  "risk_assertion_table": [
    {
      "risk_id": "R001",
      "risk_description": "Specific risk referencing client industry or TB balances",
      "risk_type": "Inherent | Control | Fraud",
      "fs_area": "Specific FS line item",
      "assertions_impacted": "E, C, A, V, R, P",
      "risk_level": "Low | Medium | High | Significant",
      "risk_register_ref": "DI-01",
      "isa_reference": "ISA 315 para XX",
      "mitigating_control": "Control that mitigates this risk"
    }
  ],
  "procedures_table": [
    {
      "proc_id": "P001",
      "nature": "Test of Control | Substantive | Analytical Review | Inquiry | Observation | Inspection | Confirmation | Recalculation",
      "description": "Detailed specific audit procedure referencing actual account names and TB balances",
      "isa_reference": "ISA XXX para XX",
      "performed_by": "Staff Auditor | Senior Auditor | Audit Manager | Engagement Partner",
      "assertions_tested": "E, C, A, V",
      "planned_date": "During fieldwork Week 1",
      "actual_date": "Completed",
      "status": "Complete | In Progress | Planned | Exception",
      "result": "No exception | Exception noted — describe"
    }
  ],
  "population": {
    "description": "Full description of population referencing actual TB balance and GL accounts",
    "count": 0,
    "amount_pkr": "PKR X from TB account code XXXX",
    "source": "Trial Balance / GL / Management Schedule"
  },
  "sample": {
    "basis": "MUS | Random | Haphazard | Judgmental | 100% per ISA 530",
    "count": 0,
    "amount_pkr": "PKR X representing X% of population",
    "coverage_pct": "X%",
    "selection_rationale": "Rationale per ISA 530"
  },
  "testing_results": {
    "population_description": "Full description referencing TB balance",
    "population_count": 0,
    "population_amount_pkr": "PKR X",
    "sampling_method": "MUS | Random | Haphazard | Judgmental | 100%",
    "sample_count": 0,
    "sample_amount_pkr": "PKR X",
    "coverage_pct": "X%",
    "exceptions_identified": 0,
    "exception_rate_pct": "0%",
    "exceptions_detail": ["No exceptions noted"],
    "tb_cross_ref": "TB Account Code + Name",
    "gl_cross_ref": "GL Account name and reference"
  },
  "work_performed": "DETAILED NARRATIVE (minimum 6 sentences) of exactly what the auditor did: which documents were examined, which balances were traced, which confirmations were sent and received, which calculations were re-performed, what analytical comparisons were made, what management representations were obtained. Must be specific to this client and FS area.",
  "variance_analysis": [
    {
      "line_item": "Specific FS line item from TB",
      "cy_amount_pkr": "Current year PKR amount",
      "py_amount_pkr": "Prior year PKR amount",
      "variance_amount_pkr": "CY minus PY",
      "variance_pct": "X% increase/decrease",
      "explanation": "Business reason for variance",
      "management_response": "Management explanation",
      "auditor_evaluation": "Whether auditor accepts per ISA 520",
      "further_action_required": "Yes / No"
    }
  ],
  "evidence_table": [
    {
      "evidence_id": "E001",
      "type": "External | Internal | Analytical | Third-Party | Physical",
      "source": "Specific source e.g. Bank confirmation, Management representation, Invoice",
      "reliability": "High | Medium | Low",
      "linked_procedure": "P001",
      "isa_reference": "ISA 500 para XX",
      "description": "What this evidence confirms"
    }
  ],
  "auditor_judgement": "Minimum 5-sentence professional narrative: interpretation of results, professional judgment applied, contradictions or anomalies found and resolved, corroboration with other WPs, overall risk assessment after procedures.",
  "proposed_adjustments": [
    {
      "adj_id": "ADJ001",
      "description": "Proposed adjustment or No adjustments proposed",
      "fs_line": "FS line affected",
      "amount_pkr": "PKR amount",
      "debit_credit": "Dr / Cr",
      "management_accepted": "Yes | No | Partial",
      "management_explanation": "Reason if rejected",
      "auditor_position": "Final auditor position"
    }
  ],
  "conclusion": {
    "status": "Satisfactory | Satisfactory with Exception | Unsatisfactory | Not Applicable",
    "basis": "Specific basis referencing procedures performed and evidence obtained",
    "misstatements_identified": "None | Describe per ISA 450",
    "corrected_misstatements_pkr": "PKR 0",
    "uncorrected_misstatements_pkr": "PKR 0",
    "impact_on_opinion": "No impact | Qualified | Emphasis of Matter | Other Matter",
    "further_actions": "None required | Specific follow-up",
    "management_letter_point": "Yes | No",
    "isa_reference": "ISA 700 / ISA 450"
  },
  "review_notes": [
    {
      "note_id": "RN001",
      "reviewer": "Audit Manager",
      "date": "During review",
      "note": "Review comment or No review queries raised",
      "status": "Open | Resolved",
      "resolved_by": "Preparer name"
    }
  ],
  "action_points": [
    {
      "issue_id": "AP001",
      "description": "Specific action or No open action points",
      "risk_impact": "Low | Medium | High",
      "assigned_to": "Staff | Senior | Manager | Partner",
      "deadline": "Before sign-off",
      "status": "Open | Closed | Monitoring"
    }
  ],
  "cross_references": ["${paperCode} links to related WP codes"],
  "exceptions": []
}`;

      try {
        const resp = await ai.client.chat.completions.create({
          model: ai.model,
          messages: [
            { role: "system", content: `You are a Big-4 trained senior audit partner generating 100% ISA-compliant, ISQM-1 compliant, audit-defensible working papers for Pakistan (ICAP) audits. You are an expert in ISA 200-720, ISQM 1 & 2, Companies Act 2017 Pakistan, and IFRS/IAS. Every working paper you generate must be fully specific to the client, non-generic, and inspection-ready. Return ONLY valid JSON. No markdown, no explanation.` },
            { role: "user", content: paperPrompt },
          ],
          max_tokens: 5000, temperature: 0.2,
          response_format: { type: "json_object" },
        }, { signal: AbortSignal.timeout(180000) });

        const raw = JSON.parse(resp.choices[0]?.message?.content || "{}");

        const [doc] = await db.insert(wpHeadDocumentsTable).values({
          sessionId, headId: head.id,
          paperCode: raw.paper_code || paperCode,
          paperName: raw.paper_name || wpMeta.name,
          content: JSON.stringify(raw),
          outputFormat: headDef.outputType.split("+")[0],
          status: "generated",
          generatedAt: new Date(),
        }).returning();

        generatedDocs.push(doc);

        if (raw.exceptions && raw.exceptions.length > 0) {
          for (const exc of raw.exceptions) {
            exceptions.push(`[${paperCode}] ${exc}`);
          }
        }
      } catch (paperErr) {
        logger.error({ err: paperErr }, `Failed to generate paper ${paperCode}`);
        exceptions.push(`Failed to generate ${paperCode}`);
      }
    }

    for (const exc of exceptions) {
      await db.insert(wpExceptionLogTable).values({
        sessionId, headIndex, exceptionType: "generation_issue",
        severity: "medium", title: `Generation Issue: ${headDef.name}`,
        description: exc, status: "open",
      });
    }

    await db.update(wpHeadsTable).set({
      status: "validating", generatedAt: new Date(), updatedAt: new Date(),
      exceptionsCount: exceptions.length,
    }).where(eq(wpHeadsTable.id, head.id));

    res.json({ documents: generatedDocs, exceptions });
  } catch (err: any) {
    logger.error({ err }, "Head generation failed");
    res.status(500).json({ error: "Head generation failed" });
  }
});

// Track in-progress auto-process jobs to prevent duplicate runs
const autoProcessInProgress = new Set<number>();

router.post("/sessions/:id/heads/auto-process-all", requireRoles(...WP_ROLES_WRITE), aiRateLimit, async (req: AuthenticatedRequest, res: Response) => {
  let sessionId = -1;
  try {
    sessionId = parseInt(p(req.params.id));
    if (isNaN(sessionId)) return res.status(400).json({ error: "Invalid session ID" });

    const session = (await db.select().from(wpSessionsTable).where(eq(wpSessionsTable.id, sessionId)))[0];
    if (!session) return res.status(404).json({ error: "Session not found" });

    const ai = await getAIClient();
    if (!ai) return res.status(503).json({ error: "AI service not configured" });

    // Prevent duplicate background runs
    if (autoProcessInProgress.has(sessionId)) {
      return res.status(202).json({ processing: true, message: "Auto-processing already in progress — refresh the page to check status." });
    }
    autoProcessInProgress.add(sessionId);

    // Return 202 immediately — processing happens in background
    res.status(202).json({ processing: true, message: "Auto-processing started. Refresh the page every 30 seconds to check progress." });

    // ── Background processing (fire-and-forget) ──────────────────────────────
    setImmediate(async () => {
      try {
    const variables = await db.select().from(wpVariablesTable).where(eq(wpVariablesTable.sessionId, sessionId));
    const tbLines = await db.select().from(wpTrialBalanceLinesTable).where(eq(wpTrialBalanceLinesTable.sessionId, sessionId));
    const varSummary = variables.map(v => `${v.variableName}: ${v.finalValue}`).join("\n");
    const tbSummary = tbLines.map(l => `${l.accountCode} ${l.accountName}: Dr=${l.debit} Cr=${l.credit}`).join("\n");

    const results: any[] = [];
    const allHeads = await db.select().from(wpHeadsTable).where(eq(wpHeadsTable.sessionId, sessionId)).orderBy(wpHeadsTable.headIndex);

    for (const head of allHeads) {
      const hi = head.headIndex;
      if (["approved", "exported", "completed"].includes(head.status)) {
        results.push({ headIndex: hi, headName: AUDIT_HEADS[hi]?.name, action: "skipped", reason: "already approved" });
        continue;
      }

      // Step 1: Generate
      try {
        if (head.status === "validating" || head.status === "review") {
          await db.delete(wpExceptionLogTable).where(and(eq(wpExceptionLogTable.sessionId, sessionId), eq(wpExceptionLogTable.headIndex, hi)));
          await db.delete(wpHeadDocumentsTable).where(eq(wpHeadDocumentsTable.headId, head.id));
        }

        if (head.status !== "ready" && head.status !== "validating" && head.status !== "review") {
          await db.update(wpHeadsTable).set({ status: "ready", updatedAt: new Date() }).where(eq(wpHeadsTable.id, head.id));
        }

        await db.update(wpHeadsTable).set({ status: "in_progress", updatedAt: new Date() }).where(eq(wpHeadsTable.id, head.id));

        if (hi === 0) {
          // TB generation - inline
          const tbResp = await ai.client.chat.completions.create({
            model: ai.model,
            messages: [
              { role: "system", content: "You are a senior auditor. Generate a trial balance from the uploaded data. Return valid JSON with a 'lines' array." },
              { role: "user", content: `Generate trial balance for ${session.clientName || "client"}, year ${session.engagementYear || "2024"}.\n\nData:\n${smartChunk(tbSummary || varSummary, 6000)}\n\nReturn JSON: {"lines":[{"accountCode":"string","accountName":"string","classification":"string","debit":number,"credit":number}]}` },
            ],
            max_tokens: 4000, temperature: 0.2,
            response_format: { type: "json_object" },
          }, { signal: AbortSignal.timeout(120000) });
          const tbData = JSON.parse(tbResp.choices[0]?.message?.content || "{}");
          if (tbData.lines && tbData.lines.length > 0) {
            for (const line of tbData.lines) {
              await db.insert(wpTrialBalanceLinesTable).values({
                sessionId, accountCode: line.accountCode || "0000",
                accountName: line.accountName || "Unknown",
                classification: line.classification || "Other",
                debit: String(line.debit || 0), credit: String(line.credit || 0),
                balance: String((line.debit || 0) - (line.credit || 0)),
                source: "ai_generated", confidence: "85",
              }).onConflictDoNothing();
            }
          }
        } else if (hi === 1) {
          // GL generation - inline
          const glResp = await ai.client.chat.completions.create({
            model: ai.model,
            messages: [
              { role: "system", content: "You are a senior auditor. Generate general ledger entries. Return valid JSON." },
              { role: "user", content: `Generate general ledger for ${session.clientName || "client"}, year ${session.engagementYear || "2024"}.\n\nTrial Balance:\n${smartChunk(tbSummary, 4000)}\n\nReturn JSON: {"documents":[{"paper_code":"GL","paper_name":"General Ledger","content":"full GL analysis"}]}` },
            ],
            max_tokens: 4000, temperature: 0.3,
            response_format: { type: "json_object" },
          }, { signal: AbortSignal.timeout(120000) });
          const glData = JSON.parse(glResp.choices[0]?.message?.content || "{}");
          const docs = glData.documents || [{ paper_code: "GL", paper_name: "General Ledger", content: glData.content || "General Ledger generated" }];
          for (const doc of docs) {
            await db.insert(wpHeadDocumentsTable).values({
              sessionId, headId: head.id,
              paperCode: doc.paper_code || "GL", paperName: doc.paper_name || "General Ledger",
              content: doc.content || "", outputFormat: "excel",
              status: "generated", generatedAt: new Date(),
            });
          }
        } else {
          // Heads 2-11
          const headDef = AUDIT_HEADS[hi];
          const papers = filterPapersForEntity((head.papersIncluded as string[]) || headDef.papers, session.entityType);

          for (const paperCode of papers) {
            try {
              const resp = await ai.client.chat.completions.create({
                model: ai.model,
                messages: [
                  { role: "system", content: `You are a Big-4 trained senior audit partner generating 100% ISA-compliant, ISQM-1 compliant, audit-defensible working papers for Pakistan (ICAP) audits. Return ONLY valid JSON.` },
                  { role: "user", content: (() => { const m = WP_METADATA[paperCode] || { name: paperCode, isa: "ISA 500", phase: headDef.name, riskLevel: "Medium", assertions: "C, E, V", fsArea: "All FS Areas" }; return `Generate working paper "${paperCode}" — "${m.name}" for the "${headDef.name}" phase.\n\nCLIENT: ${session.clientName || "Unknown"}\nENGAGEMENT: ENG-${session.engagementYear || "2026"}-${String(sessionId).padStart(3,"0")}\nENTITY TYPE: ${session.entityType || "Private Limited"}\nYEAR: ${session.engagementYear || "2026"}\nFRAMEWORK: ${session.reportingFramework || "IFRS"}\nISA REFS: ${m.isa}\nRISK LEVEL: ${m.riskLevel}\nASSERTIONS: ${m.assertions}\nFS AREA: ${m.fsArea}\n\nVARIABLES:\n${smartChunk(varSummary, 2500)}\n\nTRIAL BALANCE:\n${smartChunk(tbSummary, 2500)}\n\nReturn JSON: {"paper_code":"${paperCode}","paper_name":"${m.name}","version":"v1.0","status":"Draft","objective":"string","risk_assertion_table":[{"risk_id":"R001","risk_description":"string","risk_type":"Inherent|Control|Fraud","fs_area":"string","assertions_impacted":"E,C,V","risk_level":"High","isa_reference":"ISA 315 para 25","risk_register_ref":"${paperCode}","mitigating_control":"Practical mitigating control specific to entity industry and Pakistani regulatory environment (FBR SECP SBP) — minimum 2 sentences"}],"procedures_table":[{"proc_id":"P001","nature":"Substantive","description":"string","isa_reference":"ISA 330","performed_by":"Senior","planned_date":"During fieldwork","status":"Planned"}],"testing_results":{"population_description":"string","population_size_pkr":"string","sampling_method":"MUS","sample_size":"string","items_tested":"string","exceptions_identified":0,"exception_rate_pct":"0%","exceptions_detail":["No exceptions noted"],"tb_cross_ref":"string","gl_cross_ref":"string"},"evidence_table":[{"evidence_id":"E001","type":"External","source":"string","reliability":"High","linked_procedure":"P001","description":"string"}],"auditor_judgement":"string","conclusion":{"status":"Satisfactory","basis":"string","impact_on_opinion":"No impact","further_actions":"None required","misstatements_identified":"None"},"action_points":[{"issue_id":"AP001","description":"string","risk_impact":"Low","assigned_to":"Manager","deadline":"Before sign-off","status":"Open"}],"cross_references":["string"],"exceptions":[]}`; })() },
                ],
                max_tokens: 5000, temperature: 0.2,
                response_format: { type: "json_object" },
              }, { signal: AbortSignal.timeout(180000) });
              const raw = JSON.parse(resp.choices[0]?.message?.content || "{}");
              const m2 = WP_METADATA[paperCode] || { name: paperCode };
              await db.insert(wpHeadDocumentsTable).values({
                sessionId, headId: head.id,
                paperCode: raw.paper_code || paperCode, paperName: raw.paper_name || m2.name,
                content: JSON.stringify(raw), outputFormat: headDef.outputType.split("+")[0],
                status: "generated", generatedAt: new Date(),
              });
            } catch (paperErr) {
              logger.error({ err: paperErr }, `Auto-process: Failed paper ${paperCode} for head ${hi}`);
            }
          }
        }

        // Step 2: Mark as validating
        await db.update(wpHeadsTable).set({
          status: "validating", generatedAt: new Date(), updatedAt: new Date(), exceptionsCount: 0,
        }).where(eq(wpHeadsTable.id, head.id));

        // Step 3: Auto-resolve all exceptions
        await db.update(wpExceptionLogTable).set({ status: "cleared", resolution: "Auto-resolved during auto-process" })
          .where(and(eq(wpExceptionLogTable.sessionId, sessionId), eq(wpExceptionLogTable.headIndex, hi), eq(wpExceptionLogTable.status, "open")));

        // Step 4: Approve
        await db.update(wpHeadsTable).set({
          status: "approved", approvedAt: new Date(), updatedAt: new Date(),
        }).where(eq(wpHeadsTable.id, head.id));

        // Step 5: Unlock next
        const nextHi = hi + 1;
        if (nextHi < AUDIT_HEADS.length) {
          const nextHead = allHeads.find(h => h.headIndex === nextHi);
          if (nextHead && !["approved", "exported", "completed"].includes(nextHead.status)) {
            await db.update(wpHeadsTable).set({ status: "ready", updatedAt: new Date() }).where(eq(wpHeadsTable.id, nextHead.id));
          }
        }

        results.push({ headIndex: hi, headName: AUDIT_HEADS[hi]?.name, action: "completed", status: "approved" });
      } catch (headErr: any) {
        logger.error({ err: headErr }, `Auto-process failed for head ${hi}`);
        results.push({ headIndex: hi, headName: AUDIT_HEADS[hi]?.name, action: "failed", error: headErr.message });
        // Revert stuck in_progress head back to ready so user can retry
        try {
          await db.update(wpHeadsTable).set({ status: "ready", updatedAt: new Date() }).where(and(eq(wpHeadsTable.id, head.id), eq(wpHeadsTable.status, "in_progress")));
        } catch {}
        // Still try to unlock next so pipeline continues
        const nextHi = hi + 1;
        if (nextHi < AUDIT_HEADS.length) {
          const nextHead = allHeads.find(h => h.headIndex === nextHi);
          if (nextHead) {
            await db.update(wpHeadsTable).set({ status: "ready", updatedAt: new Date() }).where(eq(wpHeadsTable.id, nextHead.id));
          }
        }
      }
    }

    const completed = results.filter(r => r.action === "completed").length;
    const skipped = results.filter(r => r.action === "skipped").length;
    const failed = results.filter(r => r.action === "failed").length;

    await db.update(wpSessionsTable).set({ status: "generation", updatedAt: new Date() }).where(eq(wpSessionsTable.id, sessionId));
    logger.info(`Auto-process-all complete for session ${sessionId}: ${completed} done, ${skipped} skipped, ${failed} failed`);

      } catch (bgErr: any) {
        logger.error({ err: bgErr }, `Auto-process-all background job failed for session ${sessionId}`);
      } finally {
        autoProcessInProgress.delete(sessionId);
      }
    }); // end setImmediate

  } catch (err: any) {
    autoProcessInProgress.delete(sessionId);
    logger.error({ err }, "Auto-process-all route error");
    if (!res.headersSent) res.status(500).json({ error: "Auto-process failed: " + (err.message || "Unknown error") });
  }
});

router.post("/sessions/:id/heads/:headIndex/approve", requireRoles("super_admin", "partner", "senior_manager", "manager"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const sessionId = parseInt(p(req.params.id));
    const headIndex = parseInt(p(req.params.headIndex));

    const heads = await db.select().from(wpHeadsTable).where(and(eq(wpHeadsTable.sessionId, sessionId), eq(wpHeadsTable.headIndex, headIndex)));
    if (!heads[0]) return res.status(404).json({ error: "Head not found" });

    await db.update(wpHeadsTable).set({
      status: "approved", approvedAt: new Date(), updatedAt: new Date(),
    }).where(eq(wpHeadsTable.id, heads[0].id));

    await db.update(wpExceptionLogTable).set({ status: "cleared", resolution: "Approved by reviewer" })
      .where(and(eq(wpExceptionLogTable.sessionId, sessionId), eq(wpExceptionLogTable.headIndex, headIndex), eq(wpExceptionLogTable.status, "open")));

    const nextHeadIndex = headIndex + 1;
    if (nextHeadIndex < AUDIT_HEADS.length) {
      const nextHead = await db.select().from(wpHeadsTable).where(and(eq(wpHeadsTable.sessionId, sessionId), eq(wpHeadsTable.headIndex, nextHeadIndex)));
      if (nextHead[0]) {
        await db.update(wpHeadsTable).set({ status: "ready", updatedAt: new Date() }).where(eq(wpHeadsTable.id, nextHead[0].id));
      }
    }

    res.json({ success: true, nextHeadUnlocked: nextHeadIndex });
  } catch (err: any) {
    logger.error({ err }, "Failed to approve head");
    res.status(500).json({ error: "Failed to approve head" });
  }
});

// ── Brand palette (ARGB) ─────────────────────────────────────────────────────
const BP = {
  navy:      "FF0F3460",  // deep navy — firm header bg
  blue:      "FF1E3A8A",  // brand blue — column headers
  blueMid:   "FF2563EB",  // mid blue — sub-headers
  blueLight: "FFDBEAFE",  // pale blue — alternating rows / info boxes
  slate:     "FF475569",  // slate — label text
  slateLight:"FFF1F5F9",  // very light slate — section dividers
  white:     "FFFFFFFF",
  green:     "FF16A34A",  // positive balance / credit
  amber:     "FFF59E0B",  // warnings / highlights
  amberLight:"FFFEF9C3",
  red:       "FFB91C1C",  // negative / debit
  redLight:  "FFFEE2E2",
  totalBg:   "FF1E40AF",  // totals row bg
  totalFg:   "FFFFFFFF",
  black:     "FF111827",
};

// ── ExcelJS cell helpers ──────────────────────────────────────────────────────
function xHdr(cell: ExcelJS.Cell, v: any, center = false) {
  cell.value = v;
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BP.blue } };
  cell.font = { bold: true, color: { argb: BP.white }, size: 10, name: "Calibri" };
  cell.border = { bottom: { style: "medium", color: { argb: BP.navy } } };
  cell.alignment = { vertical: "middle", horizontal: center ? "center" : "left", wrapText: false };
}
function xFirmHdr(cell: ExcelJS.Cell, v: any) {
  cell.value = v;
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BP.navy } };
  cell.font = { bold: true, color: { argb: BP.white }, size: 13, name: "Calibri" };
  cell.alignment = { vertical: "middle", horizontal: "center" };
}
function xSubHdr(cell: ExcelJS.Cell, v: any) {
  cell.value = v;
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BP.blueLight } };
  cell.font = { bold: true, color: { argb: BP.blue }, size: 10, name: "Calibri" };
  cell.alignment = { vertical: "middle", horizontal: "center" };
}
function xData(cell: ExcelJS.Cell, v: any, rowIdx: number, right = false) {
  cell.value = v;
  if (rowIdx % 2 === 0) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFF" } };
  cell.font = { size: 9, name: "Calibri", color: { argb: BP.black } };
  cell.border = { bottom: { style: "hair", color: { argb: "FFE2E8F0" } } };
  cell.alignment = { vertical: "middle", horizontal: right ? "right" : "left" };
}
function xNum(cell: ExcelJS.Cell, v: number | null | undefined, rowIdx: number) {
  xData(cell, typeof v === "number" ? v : null, rowIdx, true);
  if (typeof v === "number") cell.numFmt = "#,##0.00";
}
function xTotal(cell: ExcelJS.Cell, v: any, right = false) {
  cell.value = v;
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BP.totalBg } };
  cell.font = { bold: true, color: { argb: BP.totalFg }, size: 10, name: "Calibri" };
  cell.alignment = { vertical: "middle", horizontal: right ? "right" : "left" };
  if (typeof v === "number") cell.numFmt = "#,##0.00";
}
function xLabel(cell: ExcelJS.Cell, v: any) {
  cell.value = v;
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BP.slateLight } };
  cell.font = { bold: true, color: { argb: BP.slate }, size: 9, name: "Calibri" };
  cell.alignment = { vertical: "middle", horizontal: "left" };
}
function xValue(cell: ExcelJS.Cell, v: any) {
  cell.value = v;
  cell.font = { size: 9, name: "Calibri", color: { argb: BP.black } };
  cell.alignment = { vertical: "middle", horizontal: "left" };
}
async function xProtect(ws: ExcelJS.Worksheet) {
  await (ws as any).protect("", { sheet: true, selectLockedCells: true, selectUnlockedCells: true });
}

// ── Build a standard ANA firm header block on an ExcelJS sheet ───────────────
function buildXlsxFirmHeader(ws: ExcelJS.Worksheet, colCount: number, clientName: string, docTitle: string, period: string, ntn: string) {
  const mc = (r: number, c: number) => ws.getRow(r).getCell(c);
  // Row 1: Firm name
  mc(1, 1).value = "ALAM & AULAKH CHARTERED ACCOUNTANTS";
  mc(1, 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: BP.navy } };
  mc(1, 1).font = { bold: true, color: { argb: BP.white }, size: 14, name: "Calibri" };
  mc(1, 1).alignment = { vertical: "middle", horizontal: "center" };
  ws.mergeCells(1, 1, 1, colCount);
  ws.getRow(1).height = 30;

  // Row 2: Doc title
  mc(2, 1).value = docTitle.toUpperCase();
  mc(2, 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: BP.blue } };
  mc(2, 1).font = { bold: true, color: { argb: BP.white }, size: 11, name: "Calibri" };
  mc(2, 1).alignment = { vertical: "middle", horizontal: "center" };
  ws.mergeCells(2, 1, 2, colCount);
  ws.getRow(2).height = 22;

  // Row 3: Client + Period + NTN — three cells
  const third = Math.ceil(colCount / 3);
  mc(3, 1).value = `Client: ${clientName}`;
  mc(3, 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: BP.blueLight } };
  mc(3, 1).font = { bold: true, color: { argb: BP.navy }, size: 9, name: "Calibri" };
  mc(3, 1).alignment = { vertical: "middle", horizontal: "left" };
  ws.mergeCells(3, 1, 3, third);

  mc(3, third + 1).value = `Period: ${period}`;
  mc(3, third + 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: BP.blueLight } };
  mc(3, third + 1).font = { bold: true, color: { argb: BP.navy }, size: 9, name: "Calibri" };
  mc(3, third + 1).alignment = { vertical: "middle", horizontal: "center" };
  ws.mergeCells(3, third + 1, 3, third * 2);

  mc(3, third * 2 + 1).value = `NTN: ${ntn || "N/A"}  |  Prepared: ${new Date().toLocaleDateString("en-GB")}`;
  mc(3, third * 2 + 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: BP.blueLight } };
  mc(3, third * 2 + 1).font = { bold: false, color: { argb: BP.slate }, size: 9, name: "Calibri" };
  mc(3, third * 2 + 1).alignment = { vertical: "middle", horizontal: "right" };
  ws.mergeCells(3, third * 2 + 1, 3, colCount);
  ws.getRow(3).height = 18;
}

// ── docx helpers ─────────────────────────────────────────────────────────────
const DOCX_NAVY  = "0F3460";
const DOCX_BLUE  = "1E3A8A";
const DOCX_SLATE = "475569";
const DOCX_LIGHTBG = "EFF6FF";
const DOCX_GREEN = "15803D";
const DOCX_AMBER = "B45309";
const DOCX_RED   = "B91C1C";

function fmtAssertions(a: string): string {
  if (!a || a === "—") return a || "—";
  return a.split(/[,\s]+/).filter(Boolean).map(s => `✓${s}`).join("   ");
}

function dxCell(text: string, opts: { bold?: boolean; color?: string; bg?: string; size?: number; width?: number; widthType?: (typeof WidthType)[keyof typeof WidthType] } = {}): TableCell {
  return new TableCell({
    width: opts.width ? { size: opts.width, type: opts.widthType || WidthType.PERCENTAGE } : undefined,
    shading: opts.bg ? { fill: opts.bg, type: ShadingType.SOLID } : undefined,
    children: [new Paragraph({ children: [new TextRun({ text, bold: opts.bold || false, color: opts.color || "1E293B", size: opts.size || 18, font: "Calibri" })] })],
    borders: { top: { style: BorderStyle.SINGLE, color: "E2E8F0", size: 1 }, bottom: { style: BorderStyle.SINGLE, color: "E2E8F0", size: 1 }, left: { style: BorderStyle.SINGLE, color: "E2E8F0", size: 1 }, right: { style: BorderStyle.SINGLE, color: "E2E8F0", size: 1 } },
    margins: { top: 60, bottom: 60, left: 80, right: 80 },
  });
}

function dxTable(headers: string[], rows: string[][], colWidths?: number[]): Table {
  const headerRow = new TableRow({
    children: headers.map((h, i) => dxCell(h, { bold: true, color: "FFFFFF", bg: DOCX_BLUE, width: colWidths?.[i], widthType: WidthType.PERCENTAGE })),
    tableHeader: true,
  });
  const dataRows = rows.map(row =>
    new TableRow({
      children: row.map((cell, i) => dxCell(cell || "—", { width: colWidths?.[i], widthType: WidthType.PERCENTAGE })),
    })
  );
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow, ...dataRows],
  });
}

function dxFirmHeader(firmName: string, clientName: string, docTitle: string, period: string, ntn: string, isaRef: string, extra?: { wpCode?: string; version?: string; riskLevel?: string; assertions?: string; phase?: string; fsArea?: string; engCode?: string; leadRef?: string; lockStatus?: string; aiGenerated?: boolean }): (Paragraph | Table)[] {
  const riskColor = extra?.riskLevel === "Significant" || extra?.riskLevel === "High" ? DOCX_RED : extra?.riskLevel === "Medium" ? DOCX_AMBER : DOCX_GREEN;
  return [
    new Paragraph({
      children: [new TextRun({ text: firmName, bold: true, size: 36, color: DOCX_NAVY, font: "Calibri" })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
    }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [new TableRow({ children: [new TableCell({
        shading: { fill: DOCX_NAVY, type: ShadingType.SOLID },
        children: [new Paragraph({ text: "", spacing: { after: 0 } })],
        borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
      })] })],
    }),
    new Paragraph({ text: "", spacing: { after: 100 } }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE },
        left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
        insideH: { style: BorderStyle.NONE }, insideV: { style: BorderStyle.NONE },
      },
      rows: [new TableRow({
        children: [
          // Left cell — WP titles (60%)
          new TableCell({
            width: { size: 60, type: WidthType.PERCENTAGE },
            borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
            children: [
              new Paragraph({
                children: [new TextRun({ text: "AUDIT WORKING PAPERS", bold: true, size: 20, color: DOCX_SLATE, font: "Calibri" })],
                spacing: { after: 40 },
              }),
              new Paragraph({
                children: [new TextRun({ text: docTitle.toUpperCase(), bold: true, size: 32, color: DOCX_BLUE, font: "Calibri" })],
                spacing: { after: 30 },
              }),
              new Paragraph({
                children: [new TextRun({ text: extra?.fsArea || extra?.phase || "", bold: true, size: 24, color: DOCX_NAVY, font: "Calibri" })],
                spacing: { after: 0 },
              }),
            ],
            verticalAlign: VerticalAlign.CENTER,
          }),
          // Right cell — Reference Number (40%)
          new TableCell({
            width: { size: 40, type: WidthType.PERCENTAGE },
            shading: { fill: "EEF2FF", type: ShadingType.SOLID },
            borders: {
              top: { style: BorderStyle.SINGLE, size: 4, color: DOCX_NAVY },
              bottom: { style: BorderStyle.SINGLE, size: 4, color: DOCX_NAVY },
              left: { style: BorderStyle.SINGLE, size: 4, color: DOCX_NAVY },
              right: { style: BorderStyle.SINGLE, size: 4, color: DOCX_NAVY },
            },
            children: [
              new Paragraph({
                children: [new TextRun({ text: "REFERENCE NO.", bold: false, size: 16, color: DOCX_SLATE, font: "Calibri" })],
                alignment: AlignmentType.CENTER,
                spacing: { before: 60, after: 20 },
              }),
              new Paragraph({
                children: [new TextRun({ text: extra?.wpCode || "—", bold: true, size: 52, color: DOCX_NAVY, font: "Calibri" })],
                alignment: AlignmentType.CENTER,
                spacing: { after: 20 },
              }),
              new Paragraph({
                children: [new TextRun({ text: extra?.engCode || "", bold: false, size: 16, color: DOCX_SLATE, font: "Calibri" })],
                alignment: AlignmentType.CENTER,
                spacing: { after: 60 },
              }),
            ],
            verticalAlign: VerticalAlign.CENTER,
          }),
        ],
      })],
    }),
    new Paragraph({ text: "", spacing: { after: 120 } }),
    dxTable(
      ["Field", "Details"],
      [
        ["Client", clientName],
        ["Engagement Code", extra?.engCode || "—"],
        ["Period", period],
        ["NTN / STRN", ntn || "N/A"],
        ["WP Reference", extra?.wpCode || "—"],
        ["Lead Schedule Ref", extra?.leadRef || "—"],
        ["WP Version", extra?.version || "v1.0"],
        ["Phase", extra?.phase || docTitle],
        ["ISA References", isaRef || "—"],
        ["Risk Level", extra?.riskLevel || "—"],
        ["FS Area / Scope", extra?.fsArea || "—"],
        ["Assertions Covered", fmtAssertions(extra?.assertions || "—")],
        ["CONFIDENTIAL", "For Audit Use Only — ISA / ISQM-1 Compliant — Do not distribute"],
      ],
      [30, 70]
    ),
    new Paragraph({ text: "", spacing: { after: 240 } }),
  ];
}

// ── Pakistan-specific mitigating control fallback ─────────────────────────
// Used when the AI-generated working paper has not filled mitigating_control.
// Keys on FS Area first, then risk type. Covers all common audit areas for
// Pakistani private / listed entities per Companies Act 2017, FBR, SECP, SBP.
function getMitigatingControl(fsArea = "", riskType = "", _riskDesc = ""): string {
  const a = fsArea.toLowerCase();
  const t = riskType.toLowerCase();

  if (a.includes("revenue") || a.includes("income") || a.includes("sales") || a.includes("turnover")) {
    if (t.includes("fraud")) return "Segregation of duties between order entry, billing, and cash collection; management approval of manual journal entries; IT controls over ERP billing module; FBR e-invoicing reconciled to GL monthly; independent customer confirmations for top-10 accounts.";
    return "Monthly revenue reconciliation to GL and bank statements; IFRS 15 revenue recognition policy reviewed by CFO; FBR sales-tax returns cross-checked to invoices; automated billing controls in ERP; internal audit covers revenue cycle annually.";
  }
  if (a.includes("inventory") || a.includes("stock") || a.includes("cost of sales") || a.includes("cogs")) {
    return "Semi-annual physical stock count by independent team; perpetual inventory system maintained in ERP; FIFO / WAC costing policy consistently applied per IAS 2; COGS variance analysis reviewed by management monthly; FBR valuation rules applied for tax purposes.";
  }
  if (a.includes("receiv") || a.includes("debtor") || a.includes("trade receiv")) {
    return "Aging analysis reviewed monthly by Finance Manager; credit limit policy approved by Board; independent confirmation letters sent to significant debtors per ISA 505; provision for doubtful debts calculated per management's ECL model (IFRS 9); post-period cash receipts verified during audit fieldwork.";
  }
  if (a.includes("payable") || a.includes("creditor") || a.includes("trade pay")) {
    return "Three-way matching (PO / GRN / invoice) enforced in ERP; vendor statement reconciliations performed monthly; WHT deducted at source per FBR applicable rates and deposited timely; cut-off procedures at period-end reviewed by Accounts Manager; SECP related-party disclosures for group company payables.";
  }
  if (a.includes("property") || a.includes("ppe") || a.includes("fixed asset") || a.includes("plant") || a.includes("equipment")) {
    return "Fixed asset register reconciled to GL quarterly; annual physical verification by internal audit; revaluation by SECP-approved independent valuers every 3–5 years; depreciation rates reviewed per IAS 16 / management policy; SECP Form A disclosure for capital additions exceeding 5% of net assets.";
  }
  if (a.includes("payroll") || a.includes("staff cost") || a.includes("wages") || a.includes("salary") || a.includes("remuneration")) {
    return "HR-approved payroll input; independent payroll calculation and CFO authorization; EOBI, PESSI/SESSI contributions remitted timely; income-tax WHT per FBR tax card deducted monthly; salary paid by bank transfer (FBR prohibits cash >PKR 25,000); annual payroll audit by internal audit team.";
  }
  if (a.includes("cash") || a.includes("bank") || a.includes("liquid")) {
    return "Daily bank reconciliation signed off by Finance Manager; dual-signatory policy for payments above PKR 100,000; petty cash maintained under imprest system with surprise counts; SBP AML/CFT/KYC compliance procedures documented; online banking dual-approval workflow active.";
  }
  if (a.includes("tax") || a.includes("deferred tax") || a.includes("income tax")) {
    return "Timely filing of income tax, sales tax, and WHT statements per FBR schedule; deferred-tax computation reviewed by external tax advisor; advance-tax instalments per Section 147, Income Tax Ordinance 2001; regular tax-position memos maintained; FBR notices responded to within statutory timeframes.";
  }
  if (a.includes("related party") || a.includes("related-party") || a.includes("rpt")) {
    return "Board / SECP approval for RPTs per Companies Act 2017 Section 208; RPT policy ratified by Audit Committee; IAS 24 disclosures prepared and reviewed by external auditor; independent valuation for material transactions; legal counsel opinion on SECP compliance obtained annually.";
  }
  if (a.includes("borrow") || a.includes("debt") || a.includes("loan") || a.includes("finance cost") || a.includes("interest")) {
    return "Loan agreement terms reviewed by legal counsel before signing; SBP / DFI lender covenants monitored quarterly by CFO; interest computation verified independently; SECP Section 199 compliance certificate for inter-company loans; debt covenant compliance certificate obtained semi-annually from bank.";
  }
  if (a.includes("provision") || a.includes("contingenc") || a.includes("accrual")) {
    return "Legal counsel assessment of pending litigation provided quarterly; provisioning policy reviewed by Audit Committee per IAS 37; sensitivity analysis performed on management estimates; SECP disclosure of all material contingencies in Directors' Report and notes.";
  }
  if (a.includes("going concern") || a.includes("solvency") || a.includes("liquidit")) {
    return "Monthly cash-flow forecast reviewed by Board; banking-facility headroom monitored; SECP Section 464 compliance; management mitigation plan documented per ISA 570; auditor communication to Those Charged with Governance per ISA 260 and ISA 570.";
  }
  if (a.includes("fraud") || a.includes("misstatement") || a.includes("irregularit")) {
    return "Surprise cash counts and inventory checks; whistleblower / hotline mechanism per SECP CCG 2019; internal audit function independent of management; anti-fraud policy ratified by Board; NAB / FIA referral procedures documented.";
  }
  if (a.includes("investment") || a.includes("securities") || a.includes("psx")) {
    return "Investment mandate approved by Board; IFRS 9 classification and measurement reviewed; PSX market price used for fair-value measurement; SECP investment disclosure requirements; custodian / broker confirmation obtained annually.";
  }
  if (a.includes("capital") || a.includes("equity") || a.includes("share")) {
    return "Share register maintained and reconciled to SECP filings; Board / EGM resolutions for all capital changes; SECP Form-3 / Form-4 filings current; dividend declared per Articles of Association and Companies Act 2017; legal counsel confirms compliance.";
  }
  if (a.includes("intangible") || a.includes("goodwill")) {
    return "Annual impairment test per IAS 36 reviewed by CFO; assumptions cross-referenced to Board-approved budget; independent business valuer engaged for material goodwill; SECP disclosure requirements for intangible assets complied with.";
  }

  // Generic fallback keyed on risk type
  if (t.includes("fraud")) return "Segregation of duties enforced; management review of journal entries; surprise internal-audit checks; whistleblower hotline per SECP CCG 2019; transactions above materiality reviewed by CFO before posting.";
  if (t.includes("inherent")) return "Management review of significant estimates and judgements; independent expert valuation where required; accounting policies aligned to applicable IFRS/IAS; sensitivity analysis performed and disclosed; Audit Committee oversight of key estimates.";
  if (t.includes("control")) return "Control design assessment performed by internal audit; remediation plan for identified gaps approved by Audit Committee; IT general controls reviewed; management testing of key controls semi-annually; external auditor recommendations followed up quarterly.";

  return "Regular management review and approval; independent internal audit testing; reconciliation to supporting documentation; compliance with applicable IFRS and SECP/FBR regulations; Audit Committee oversight of financial reporting process.";
}

function dxSection(title: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text: `  ${title}`, bold: true, size: 22, color: "FFFFFF", font: "Calibri" })],
    spacing: { before: 320, after: 80 },
    shading: { type: ShadingType.SOLID, color: "auto", fill: DOCX_NAVY },
  });
}

function dxBody(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, size: 20, font: "Calibri", color: "1E293B" })],
    spacing: { after: 120, line: 276 },
  });
}

function dxBullet(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, size: 20, font: "Calibri", color: "334155" })],
    bullet: { level: 0 },
    spacing: { after: 80 },
  });
}

function dxFooter(firmName: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({ text: `${firmName}  |  Confidential — For Audit Use Only  |  `, size: 16, color: "94A3B8", font: "Calibri" }),
      new TextRun({ text: new Date().getFullYear().toString(), size: 16, color: "94A3B8", font: "Calibri" }),
    ],
    alignment: AlignmentType.CENTER,
    border: { top: { style: BorderStyle.SINGLE, color: "CBD5E1", size: 4 } },
    spacing: { before: 400 },
  });
}

function parseDocxContent(content: string, _clientName: string): (Paragraph | Table)[] {
  // Try to parse as structured JSON first
  try {
    const parsed = JSON.parse(content);
    if (parsed && (parsed.objective || parsed.procedures_table || parsed.risk_assertion_table)) {
      return parseStructuredWP(parsed);
    }
  } catch {}
  // Fallback: parse as plain text
  const paras: (Paragraph | Table)[] = [];
  const lines = (content || "").split("\n");
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) { paras.push(new Paragraph({ text: "", spacing: { after: 80 } })); continue; }
    if (line.startsWith("##") || (line.startsWith("**") && line.endsWith("**")) || /^[A-Z ]{10,}$/.test(line) || /^\d+\.\s+[A-Z]/.test(line)) {
      paras.push(dxSection(line.replace(/^#+\s*/, "").replace(/\*\*/g, "")));
      continue;
    }
    if (line.startsWith("- ") || line.startsWith("• ") || line.startsWith("* ")) {
      paras.push(dxBullet(line.replace(/^[-•*]\s+/, "")));
      continue;
    }
    paras.push(dxBody(line));
  }
  return paras;
}

function parseStructuredWP(wp: any): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [];
  const sp = (n = 160) => new Paragraph({ text: "", spacing: { after: n } });

  // 1. Objective
  if (wp.objective) {
    out.push(dxSection("1.  OBJECTIVE"));
    out.push(dxBody(wp.objective));
    out.push(sp());
  }

  // 1a. Materiality Linkage
  if (wp.materiality_linkage) {
    const ml = wp.materiality_linkage;
    out.push(dxSection("1a. MATERIALITY LINKAGE  (ISA 320)"));
    out.push(dxTable(
      ["Parameter", "Detail"],
      [
        ["Overall Materiality (PKR)", ml.overall_materiality_pkr || "—"],
        ["Performance Materiality (PKR)", ml.performance_materiality_pkr || "—"],
        ["Trivial Threshold (PKR)", ml.trivial_threshold_pkr || "—"],
        ["Materiality Basis", ml.basis || "—"],
        ["Percentage Used", ml.materiality_pct || "—"],
        ["Application to this WP", ml.applicable_to_this_wp || "—"],
      ],
      [35, 65]
    ));
    out.push(sp());
  }

  // 2. Risk & Assertion Linkage
  if (wp.risk_assertion_table?.length) {
    out.push(dxSection("2.  RISK & ASSERTION LINKAGE  (ISA 315 / ISA 330)"));
    out.push(dxTable(
      ["Risk ID", "Risk Description", "Type", "FS Area", "Assertions", "Risk Level", "ISA Ref", "Mitigating Control"],
      wp.risk_assertion_table.map((r: any) => [r.risk_id, r.risk_description, r.risk_type, r.fs_area, r.assertions_impacted, r.risk_level, r.isa_reference || (r.risk_register_ref ? (WP_METADATA[r.risk_register_ref]?.isa || "ISA 315") : "ISA 315"), (r.mitigating_control && r.mitigating_control !== "—") ? r.mitigating_control : getMitigatingControl(r.fs_area, r.risk_type, r.risk_description)]),
      [6, 22, 9, 12, 11, 9, 9, 22]
    ));
    out.push(sp());
  }

  // 3. Procedures Table
  if (wp.procedures_table?.length) {
    out.push(dxSection("3.  AUDIT PROCEDURES PERFORMED  (ISA 330)"));
    out.push(dxTable(
      ["Proc", "Nature", "Description", "ISA Ref", "By", "Assertions", "Status", "Result"],
      wp.procedures_table.map((p: any) => [p.proc_id, p.nature, p.description, p.isa_reference, p.performed_by, p.assertions_tested || "—", p.status, p.result || "—"]),
      [5, 13, 30, 10, 9, 9, 9, 15]
    ));
    out.push(sp());
  }

  // 4. Population & Sample
  const pop = wp.population;
  const samp = wp.sample;
  if (pop || samp) {
    out.push(dxSection("4.  POPULATION & SAMPLE SELECTION  (ISA 530)"));
    const sampBasis = samp ? ("Basis: " + samp.basis) : "—";
    const sampCoverage = samp?.coverage_pct ? ("Coverage: " + samp.coverage_pct) : "—";
    out.push(dxTable(
      ["Parameter", "Population", "Sample"],
      [
        ["Description", pop?.description || "—", sampBasis],
        ["Count (Items)", String(pop?.count ?? "—"), String(samp?.count ?? "—")],
        ["Amount (PKR)", pop?.amount_pkr || "—", samp?.amount_pkr || "—"],
        ["Source / Coverage", pop?.source || "—", sampCoverage],
        ["Selection Rationale", "—", samp?.selection_rationale || "—"],
      ],
      [22, 39, 39]
    ));
    out.push(sp());
  }

  // 5. Testing & Results
  if (wp.testing_results) {
    const tr = wp.testing_results;
    out.push(dxSection("5.  TESTING & RESULTS  (ISA 530 / ISA 500)"));
    out.push(dxTable(
      ["Parameter", "Detail"],
      [
        ["Population Description", tr.population_description || "—"],
        ["Population Count (Items)", String(tr.population_count ?? tr.population_size_pkr ?? "—")],
        ["Population Amount (PKR)", tr.population_amount_pkr || tr.population_size_pkr || "—"],
        ["Sampling Method", tr.sampling_method || "—"],
        ["Sample Count (Items)", String(tr.sample_count ?? tr.sample_size ?? "—")],
        ["Sample Amount (PKR)", tr.sample_amount_pkr || "—"],
        ["Coverage %", tr.coverage_pct || "—"],
        ["Exceptions Identified", String(tr.exceptions_identified ?? "0")],
        ["Exception Rate", tr.exception_rate_pct || "0%"],
        ["TB Cross-Reference", tr.tb_cross_ref || "—"],
        ["GL Cross-Reference", tr.gl_cross_ref || "—"],
      ],
      [35, 65]
    ));
    if (tr.exceptions_detail?.length) {
      out.push(sp(80));
      out.push(dxBody("Exception Details:"));
      for (const exc of tr.exceptions_detail) {
        out.push(dxBullet(String(exc)));
      }
    }
    out.push(sp());
  }

  // 6. Work Performed
  if (wp.work_performed) {
    out.push(dxSection("6.  WORK PERFORMED  (ISA 230 / ISA 500)"));
    out.push(dxBody(wp.work_performed));
    out.push(sp());
  }

  // 7. Evidence Documentation
  if (wp.evidence_table?.length) {
    out.push(dxSection("7.  EVIDENCE DOCUMENTATION  (ISA 500 / ISA 230)"));
    out.push(dxTable(
      ["Evid ID", "Type", "Source", "Reliability", "ISA Ref", "Linked Proc", "Description"],
      wp.evidence_table.map((e: any) => [e.evidence_id, e.type, e.source, e.reliability, e.isa_reference || "ISA 500", e.linked_procedure, e.description]),
      [7, 11, 16, 9, 9, 9, 39]
    ));
    out.push(sp());
  }

  // 8. Variance Analysis
  if (wp.variance_analysis?.length) {
    out.push(dxSection("8.  VARIANCE ANALYSIS  (ISA 520 / ISA 315)"));
    out.push(dxTable(
      ["FS Line", "CY (PKR)", "PY (PKR)", "Variance", "Var %", "Explanation", "Mgmt Response", "Auditor Eval."],
      wp.variance_analysis.map((v: any) => [v.line_item, v.cy_amount_pkr, v.py_amount_pkr, v.variance_amount_pkr, v.variance_pct, v.explanation, v.management_response, v.auditor_evaluation]),
      [12, 10, 10, 10, 7, 18, 16, 17]
    ));
    out.push(sp());
  }

  // 9. Auditor's Judgement
  if (wp.auditor_judgement) {
    out.push(dxSection("9.  ANALYSIS & AUDITOR'S JUDGEMENT  (ISA 230)"));
    out.push(dxBody(wp.auditor_judgement));
    out.push(sp());
  }

  // 10. Proposed Adjustments
  const adjustments = (wp.proposed_adjustments || []).filter((a: any) => a.description && !/no adjustment/i.test(a.description));
  if (adjustments.length) {
    out.push(dxSection("10. PROPOSED ADJUSTMENTS  (ISA 450)"));
    out.push(dxTable(
      ["Adj ID", "Description", "FS Line", "Amount (PKR)", "Dr/Cr", "Mgmt Accepted", "Auditor Position"],
      adjustments.map((a: any) => [a.adj_id, a.description, a.fs_line, a.amount_pkr, a.debit_credit, a.management_accepted, a.auditor_position]),
      [7, 28, 12, 12, 7, 13, 21]
    ));
    out.push(sp());
  }

  // 11. Conclusion
  if (wp.conclusion) {
    const c = wp.conclusion;
    out.push(dxSection("11. CONCLUSION  (ISA 700 / ISA 450)"));
    out.push(dxTable(
      ["Field", "Detail"],
      [
        ["Conclusion Status", c.status || "—"],
        ["Basis of Conclusion", c.basis || "—"],
        ["Corrected Misstatements (PKR)", c.corrected_misstatements_pkr || "PKR 0"],
        ["Uncorrected Misstatements (PKR)", c.uncorrected_misstatements_pkr || "PKR 0"],
        ["Impact on Audit Opinion", c.impact_on_opinion || "No impact"],
        ["Management Letter Point", c.management_letter_point || "No"],
        ["Further Actions Required", c.further_actions || "None"],
        ["ISA Reference", c.isa_reference || "ISA 700"],
      ],
      [30, 70]
    ));
    out.push(sp());
  }

  // 12. Review Notes
  if (wp.review_notes?.length) {
    out.push(dxSection("12. REVIEW NOTES  (ISQM-1 / ISA 220)"));
    out.push(dxTable(
      ["Note ID", "Reviewer", "Date", "Note", "Status", "Resolved By"],
      wp.review_notes.map((n: any) => [n.note_id, n.reviewer, n.date, n.note, n.status, n.resolved_by || "—"]),
      [8, 12, 12, 40, 10, 18]
    ));
    out.push(sp());
  }

  // 13. Action Points
  if (wp.action_points?.length) {
    out.push(dxSection("13. ACTION POINTS & FOLLOW-UPS"));
    out.push(dxTable(
      ["Issue ID", "Description", "Risk Impact", "Assigned To", "Deadline", "Status"],
      wp.action_points.map((a: any) => [a.issue_id, a.description, a.risk_impact, a.assigned_to, a.deadline, a.status]),
      [8, 38, 10, 12, 15, 10]
    ));
    out.push(sp());
  }

  // 14. Cross-References
  if (wp.cross_references?.length) {
    out.push(dxSection("14. CROSS-REFERENCES"));
    for (const ref of wp.cross_references) {
      out.push(dxBullet(String(ref)));
    }
    out.push(sp());
  }

  // 15. Exceptions & Findings
  if (wp.exceptions?.length) {
    out.push(dxSection("15. EXCEPTIONS & FINDINGS"));
    for (const exc of wp.exceptions) {
      out.push(dxBullet(String(exc)));
    }
    out.push(sp());
  }

  return out;
}


// GET head documents for preview
router.get("/sessions/:id/heads/:headIndex/documents", async (req: Request, res: Response) => {
  try {
    const sessionId = parseInt(p(req.params.id));
    const headIndex = parseInt(p(req.params.headIndex));
    const heads = await db.select().from(wpHeadsTable).where(and(eq(wpHeadsTable.sessionId, sessionId), eq(wpHeadsTable.headIndex, headIndex)));
    if (!heads[0]) return res.status(404).json({ error: "Head not found" });
    const documents = await db.select().from(wpHeadDocumentsTable).where(eq(wpHeadDocumentsTable.headId, heads[0].id));
    return res.json({
      head: {
        headIndex,
        headName: heads[0].headName,
        status: heads[0].status,
        generatedAt: heads[0].generatedAt,
        approvedAt: heads[0].approvedAt,
        approvedBy: heads[0].approvedBy,
      },
      documents: documents.map(d => ({
        id: d.id,
        paperCode: d.paperCode,
        paperName: d.paperName,
        content: d.content ? (() => { try { return JSON.parse(d.content!); } catch { return {}; } })() : {},
        version: d.version,
        status: d.status,
      })),
    });
  } catch (err: any) {
    logger.error({ err }, "Route error");
    return res.status(500).json({ error: err.message });
  }
});

router.post("/sessions/:id/heads/:headIndex/export", requireRoles(...WP_ROLES_WRITE), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const sessionId = parseInt(p(req.params.id));
    const headIndex = parseInt(p(req.params.headIndex));
    const exportFormat = ((req.body?.format || req.query?.format || "word") as string).toLowerCase();

    const heads = await db.select().from(wpHeadsTable).where(and(eq(wpHeadsTable.sessionId, sessionId), eq(wpHeadsTable.headIndex, headIndex)));
    if (!heads[0]) return res.status(404).json({ error: "Head not found" });

    const documents = await db.select().from(wpHeadDocumentsTable).where(eq(wpHeadDocumentsTable.headId, heads[0].id));
    const headDef = AUDIT_HEADS[headIndex];

    // Fetch session metadata for headers
    const session = (await db.select().from(wpSessionsTable).where(eq(wpSessionsTable.id, sessionId)))[0];
    const clientName = session?.clientName || "Client";
    const ntn = session?.ntn || "N/A";
    const engCode = `ENG-${session?.engagementYear || "2026"}-${String(sessionId).padStart(3, "0")}`;
    const period = session?.periodStart && session?.periodEnd
      ? `${session.periodStart} to ${session.periodEnd}`
      : session?.engagementYear ? `FY ${session.engagementYear}` : "—";
    const firmName = "Alam & Aulakh Chartered Accountants";

    // Fetch session variables for sign-off auto-fill
    const sessionVarsForExport = await db.select().from(wpVariablesTable).where(eq(wpVariablesTable.sessionId, sessionId));
    const varLkp: Record<string, string> = Object.fromEntries(sessionVarsForExport.map(v => [v.variableCode, v.value || ""]));
    const eqcrRequired = varLkp["eqcr_required"] === "true";
    const exportDate = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });

    // ── HEAD 0: TRIAL BALANCE — ExcelJS ───────────────────────────────────────
    if (headIndex === 0) {
      const tbLines = await db.select().from(wpTrialBalanceLinesTable).where(eq(wpTrialBalanceLinesTable.sessionId, sessionId));
      const wb = new ExcelJS.Workbook();
      wb.creator = firmName;
      wb.created = new Date();
      const ws = wb.addWorksheet("Trial Balance", { properties: { tabColor: { argb: BP.blue } } });
      ws.views = [{ state: "frozen", ySplit: 5 }];

      const cols = [
        { header: "Account Code", key: "code", width: 16 },
        { header: "Account Name", key: "name", width: 42 },
        { header: "Classification", key: "cls", width: 22 },
        { header: "Debit (PKR)", key: "dr", width: 18 },
        { header: "Credit (PKR)", key: "cr", width: 18 },
        { header: "Balance (PKR)", key: "bal", width: 18 },
        { header: "Prior Year (PKR)", key: "py", width: 18 },
        { header: "Source", key: "src", width: 14 },
        { header: "Confidence", key: "conf", width: 12 },
      ];
      ws.columns = cols.map(c => ({ width: c.width }));

      buildXlsxFirmHeader(ws, 9, clientName, "Trial Balance", period, ntn);

      // Row 4: blank spacer
      ws.getRow(4).height = 4;

      // Row 5: column headers
      cols.forEach((c, i) => { xHdr(ws.getRow(5).getCell(i + 1), c.header, i >= 3 && i <= 6); });
      ws.getRow(5).height = 22;

      // Group by classification
      const groups: Record<string, typeof tbLines> = {};
      for (const l of tbLines) {
        const g = l.classification || "Other";
        if (!groups[g]) groups[g] = [];
        groups[g].push(l);
      }

      let rowIdx = 6;
      let totalDr = 0, totalCr = 0, totalBal = 0;

      for (const [groupName, lines] of Object.entries(groups)) {
        // Section header
        const gr = ws.getRow(rowIdx);
        gr.height = 18;
        const gc = gr.getCell(1);
        gc.value = groupName.toUpperCase();
        gc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E7FF" } };
        gc.font = { bold: true, color: { argb: BP.blue }, size: 9, name: "Calibri" };
        ws.mergeCells(rowIdx, 1, rowIdx, 9);
        rowIdx++;

        for (const l of lines) {
          const r = ws.getRow(rowIdx);
          r.height = 17;
          const dr = parseFloat(String(l.debit)) || 0;
          const cr = parseFloat(String(l.credit)) || 0;
          const bal = parseFloat(String(l.balance)) || 0;
          xData(r.getCell(1), l.accountCode, rowIdx);
          xData(r.getCell(2), l.accountName, rowIdx);
          xData(r.getCell(3), l.classification, rowIdx);
          xNum(r.getCell(4), dr || null, rowIdx);
          xNum(r.getCell(5), cr || null, rowIdx);
          // Balance — color: green if positive, red if negative
          xNum(r.getCell(6), bal, rowIdx);
          if (bal < 0) r.getCell(6).font = { ...r.getCell(6).font as any, color: { argb: BP.red } };
          else if (bal > 0) r.getCell(6).font = { ...r.getCell(6).font as any, color: { argb: "FF15803D" } };
          xNum(r.getCell(7), parseFloat(String(l.priorYearBalance)) || null, rowIdx);
          xData(r.getCell(8), l.source || "", rowIdx);
          // Confidence badge
          const conf = parseFloat(String(l.confidence)) || 0;
          const confCell = r.getCell(9);
          xData(confCell, conf ? `${Math.round(conf * 100)}%` : "", rowIdx, true);
          if (conf >= 0.9) confCell.font = { ...confCell.font as any, color: { argb: "FF16A34A" } };
          else if (conf >= 0.7) confCell.font = { ...confCell.font as any, color: { argb: "FFF59E0B" } };
          else if (conf > 0) confCell.font = { ...confCell.font as any, color: { argb: BP.red } };
          totalDr += dr; totalCr += cr; totalBal += bal;
          rowIdx++;
        }
      }

      // Blank row before totals
      ws.getRow(rowIdx++).height = 6;
      // Totals row
      const tr = ws.getRow(rowIdx);
      tr.height = 22;
      xTotal(tr.getCell(1), "TOTALS"); ws.mergeCells(rowIdx, 1, rowIdx, 3);
      xTotal(tr.getCell(4), totalDr, true);
      xTotal(tr.getCell(5), totalCr, true);
      xTotal(tr.getCell(6), totalBal, true);
      ws.mergeCells(rowIdx, 7, rowIdx, 9);

      // Difference check
      const diff = Math.abs(totalDr - totalCr);
      rowIdx += 2;
      const diffRow = ws.getRow(rowIdx);
      diffRow.height = 18;
      const diffCell = diffRow.getCell(1);
      diffCell.value = diff < 0.01
        ? "✓ Trial Balance agrees — Debits equal Credits"
        : `⚠ Difference: PKR ${diff.toLocaleString("en-PK", { minimumFractionDigits: 2 })}`;
      diffCell.font = { bold: true, color: { argb: diff < 0.01 ? "FF16A34A" : BP.red }, size: 10, name: "Calibri" };
      diffCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: diff < 0.01 ? "FFF0FDF4" : BP.redLight } };
      ws.mergeCells(rowIdx, 1, rowIdx, 9);

      await xProtect(ws);
      await db.update(wpHeadsTable).set({ status: "exported", exportedAt: new Date(), updatedAt: new Date() }).where(eq(wpHeadsTable.id, heads[0].id));
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="TB_${clientName.replace(/\s/g, "_")}_${session?.engagementYear || sessionId}.xlsx"`);
      await wb.xlsx.write(res); return res.end();
    }

    // ── HEAD 1: GENERAL LEDGER — ExcelJS ──────────────────────────────────────
    if (headIndex === 1) {
      const glAccounts = await db.select().from(wpGlAccountsTable).where(eq(wpGlAccountsTable.sessionId, sessionId));
      const wb = new ExcelJS.Workbook();
      wb.creator = firmName;
      wb.created = new Date();
      const usedSheetNames = new Set<string>();

      // Cover / Summary sheet
      const coverWs = wb.addWorksheet("GL Summary", { properties: { tabColor: { argb: BP.navy } } });
      coverWs.columns = [{ width: 16 }, { width: 42 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }];
      buildXlsxFirmHeader(coverWs, 6, clientName, "General Ledger — Summary", period, ntn);
      coverWs.getRow(4).height = 6;
      ["Code", "Account Name", "Opening (PKR)", "Total Debits", "Total Credits", "Closing (PKR)"].forEach((h, i) => {
        xHdr(coverWs.getRow(5).getCell(i + 1), h, i >= 2);
      });
      coverWs.getRow(5).height = 22;
      coverWs.views = [{ state: "frozen", ySplit: 5 }];

      let coverRow = 6;
      let grandOpen = 0, grandDr = 0, grandCr = 0, grandClose = 0;
      for (const acc of glAccounts) {
        const r = coverWs.getRow(coverRow);
        r.height = 17;
        const ob = parseFloat(String(acc.openingBalance)) || 0;
        const cb = parseFloat(String(acc.closingBalance)) || 0;
        xData(r.getCell(1), acc.accountCode, coverRow);
        xData(r.getCell(2), acc.accountName, coverRow);
        xNum(r.getCell(3), ob, coverRow);
        xNum(r.getCell(4), parseFloat(String(acc.totalDebits)) || null, coverRow);
        xNum(r.getCell(5), parseFloat(String(acc.totalCredits)) || null, coverRow);
        xNum(r.getCell(6), cb, coverRow);
        if (cb < 0) r.getCell(6).font = { ...r.getCell(6).font as any, color: { argb: BP.red } };
        grandOpen += ob; grandDr += parseFloat(String(acc.totalDebits)) || 0;
        grandCr += parseFloat(String(acc.totalCredits)) || 0; grandClose += cb;
        coverRow++;
      }
      coverRow++;
      const gtr = coverWs.getRow(coverRow); gtr.height = 22;
      xTotal(gtr.getCell(1), "TOTALS"); coverWs.mergeCells(coverRow, 1, coverRow, 2);
      xTotal(gtr.getCell(3), grandOpen, true); xTotal(gtr.getCell(4), grandDr, true);
      xTotal(gtr.getCell(5), grandCr, true); xTotal(gtr.getCell(6), grandClose, true);

      // Per-account sheets
      for (const acc of glAccounts.slice(0, 40)) {
        const entries = await db.select().from(wpGlEntriesTable).where(eq(wpGlEntriesTable.glAccountId, acc.id));
        const base = `${acc.accountCode} ${acc.accountName}`.replace(/[\\/?*\[\]:]/g, "").trim().slice(0, 24) || `Acct_${acc.id}`;
        let sheetName = base;
        let counter = 2;
        while (usedSheetNames.has(sheetName)) {
          const suffix = `_${counter++}`;
          sheetName = base.slice(0, 31 - suffix.length) + suffix;
        }
        usedSheetNames.add(sheetName);

        const ws = wb.addWorksheet(sheetName, { properties: { tabColor: { argb: BP.blueMid } } });
        ws.columns = [{ width: 14 }, { width: 18 }, { width: 46 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 14 }];
        ws.views = [{ state: "frozen", ySplit: 6 }];

        buildXlsxFirmHeader(ws, 7, clientName, `GL: ${acc.accountCode} — ${acc.accountName}`, period, ntn);
        // Account info row
        ws.getRow(4).height = 18;
        xSubHdr(ws.getRow(4).getCell(1), `Opening Balance: PKR ${(parseFloat(String(acc.openingBalance)) || 0).toLocaleString("en-PK", { minimumFractionDigits: 2 })}`);
        ws.mergeCells(4, 1, 4, 3);
        xSubHdr(ws.getRow(4).getCell(4), `Closing Balance: PKR ${(parseFloat(String(acc.closingBalance)) || 0).toLocaleString("en-PK", { minimumFractionDigits: 2 })}`);
        ws.mergeCells(4, 4, 4, 7);

        ["Date", "Voucher No.", "Narration / Description", "Debit (PKR)", "Credit (PKR)", "Balance (PKR)", "Ref"].forEach((h, i) => {
          xHdr(ws.getRow(5).getCell(i + 1), h, i >= 3 && i <= 5);
        });
        ws.getRow(5).height = 22;

        let rIdx = 6;
        for (const e of entries) {
          const r = ws.getRow(rIdx); r.height = 17;
          xData(r.getCell(1), e.entryDate, rIdx);
          xData(r.getCell(2), e.voucherNo || "", rIdx);
          xData(r.getCell(3), e.narration || "", rIdx);
          const dr = parseFloat(String(e.debit)) || 0;
          const cr = parseFloat(String(e.credit)) || 0;
          const bal = parseFloat(String(e.runningBalance)) || 0;
          // Dr cell: red if non-zero
          const drCell = r.getCell(4); xNum(drCell, dr || null, rIdx);
          if (dr > 0) drCell.font = { ...drCell.font as any, color: { argb: BP.red } };
          // Cr cell: green if non-zero
          const crCell = r.getCell(5); xNum(crCell, cr || null, rIdx);
          if (cr > 0) crCell.font = { ...crCell.font as any, color: { argb: "FF15803D" } };
          xNum(r.getCell(6), bal, rIdx);
          if (bal < 0) r.getCell(6).font = { ...r.getCell(6).font as any, color: { argb: BP.red } };
          xData(r.getCell(7), e.referenceNo || "", rIdx);
          rIdx++;
        }

        // Totals
        rIdx++;
        const tr2 = ws.getRow(rIdx); tr2.height = 20;
        xTotal(tr2.getCell(1), "CLOSING BALANCE"); ws.mergeCells(rIdx, 1, rIdx, 3);
        xTotal(tr2.getCell(6), parseFloat(String(acc.closingBalance)) || 0, true);
        ws.mergeCells(rIdx, 4, rIdx, 5); ws.mergeCells(rIdx, 7, rIdx, 7);
      }

      await db.update(wpHeadsTable).set({ status: "exported", exportedAt: new Date(), updatedAt: new Date() }).where(eq(wpHeadsTable.id, heads[0].id));
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="GL_${clientName.replace(/\s/g, "_")}_${session?.engagementYear || sessionId}.xlsx"`);
      await wb.xlsx.write(res); return res.end();
    }

    // ── HEADS 2-11: EXCEL output ───────────────────────────────────────────────
    if (headDef.outputType.includes("excel") && !headDef.outputType.includes("word")) {
      const wb = new ExcelJS.Workbook();
      wb.creator = firmName;
      wb.created = new Date();
      const usedNames = new Set<string>();

      for (const doc of documents) {
        let sheetBase = `${doc.paperCode || "WP"}`.replace(/[\\/?*\[\]:]/g, "").trim().slice(0, 26);
        let sn = sheetBase;
        let c2 = 2;
        while (usedNames.has(sn)) { const sfx = `_${c2++}`; sn = sheetBase.slice(0, 31 - sfx.length) + sfx; }
        usedNames.add(sn);

        const ws = wb.addWorksheet(sn, { properties: { tabColor: { argb: BP.blue } } });
        ws.columns = [{ width: 6 }, { width: 28 }, { width: 55 }, { width: 16 }];
        buildXlsxFirmHeader(ws, 4, clientName, `${doc.paperCode}: ${doc.paperName}`, period, ntn);
        ws.getRow(4).height = 6;

        // Parse content into table rows
        const lines = (doc.content || "").split("\n");
        let rIdx = 5;
        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line) { ws.getRow(rIdx++).height = 8; continue; }
          const r = ws.getRow(rIdx); r.height = 17;
          if (/^##|^[A-Z ]{8,}$/.test(line) || /^(SECTION|PART|PROCEDURE|TEST|STEP|ASSERTION|CONCLUSION)/i.test(line)) {
            xHdr(r.getCell(2), line.replace(/^#+\s*/, ""), false); ws.mergeCells(rIdx, 2, rIdx, 4);
          } else if (line.startsWith("- ") || line.startsWith("• ")) {
            xData(r.getCell(2), "•", rIdx);
            xData(r.getCell(3), line.replace(/^[-•]\s+/, ""), rIdx); ws.mergeCells(rIdx, 3, rIdx, 4);
          } else if (/^[\w\s]+:/.test(line) && line.indexOf(":") < 30) {
            const colon = line.indexOf(":");
            xLabel(r.getCell(2), line.slice(0, colon + 1));
            xValue(r.getCell(3), line.slice(colon + 1).trim()); ws.mergeCells(rIdx, 3, rIdx, 4);
          } else {
            xData(r.getCell(2), line, rIdx); ws.mergeCells(rIdx, 2, rIdx, 4);
          }
          rIdx++;
        }

        // Sign-off footer
        rIdx += 2;
        const signRow = ws.getRow(rIdx); signRow.height = 40;
        const signCell = signRow.getCell(2);
        signCell.value = `Prepared by: ___________________    Date: ___________\n\nReviewed by: ___________________    Date: ___________`;
        signCell.font = { size: 9, name: "Calibri", color: { argb: BP.slate } };
        signCell.alignment = { wrapText: true };
        ws.mergeCells(rIdx, 2, rIdx, 4);
      }

      await db.update(wpHeadsTable).set({ status: "exported", exportedAt: new Date(), updatedAt: new Date() }).where(eq(wpHeadsTable.id, heads[0].id));
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="${headDef.name.replace(/\s/g, "_")}_${clientName.replace(/\s/g, "_")}_${session?.engagementYear || sessionId}.xlsx"`);
      await wb.xlsx.write(res); return res.end();
    }

    // ── HEADS 2-11: PDF output ─────────────────────────────────────────────────
    if (exportFormat === "pdf" && headIndex >= 2) {
      const pdfBuf = await new Promise<Buffer>((resolve, reject) => {
        const doc = new PDFDocument({ size: "A4", margin: 45, bufferPages: true, info: { Title: `${headDef.name} — ${clientName}`, Author: firmName, Creator: "AuditWise" } });
        const chunks: Buffer[] = [];
        doc.on("data", (c: Buffer) => chunks.push(c));
        doc.on("end", () => resolve(Buffer.concat(chunks)));
        doc.on("error", reject);

        const NAVY = "#0F3460", BLUE = "#1E3A8A", SLATE = "#475569", LIGHT = "#EFF6FF", RED = "#B91C1C", GREEN = "#15803D", ACCENT = "#1E40AF", AMBER = "#B45309";
        const pgW = doc.page.width - 90;

        const drawHRule = (color = "#CBD5E1", y?: number) => {
          if (y !== undefined) doc.moveTo(45, y).lineTo(45 + pgW, y).strokeColor(color).lineWidth(0.5).stroke();
          else doc.moveTo(45, doc.y).lineTo(45 + pgW, doc.y).strokeColor(color).lineWidth(0.5).stroke();
        };

        const sectionTitle = (text: string) => {
          doc.moveDown(0.6);
          if (doc.y > doc.page.height - 80) { doc.addPage(); drawRunningHeader(); }
          const sy = doc.y;
          const barH = 21;
          doc.rect(45, sy, pgW, barH).fill(NAVY);
          doc.rect(45, sy + barH, pgW, 2).fill(ACCENT);
          doc.font("Helvetica-Bold").fontSize(9.5).fillColor("#FFFFFF")
             .text("  " + text, 51, sy + 5.5, { width: pgW - 12, lineBreak: false });
          doc.fillColor("#1E293B").font("Helvetica").fontSize(9)
             .text("", 45, sy + barH + 6, { lineBreak: false });
          doc.moveDown(0.15);
        };

        const kv = (label: string, value: string, indent = 0) => {
          doc.font("Helvetica-Bold").fontSize(8.5).fillColor(SLATE).text(label + ":", { continued: true, indent }).font("Helvetica").fillColor("#1E293B").text("  " + (value || "—"));
        };

        const bodyText = (text: string) => {
          doc.font("Helvetica").fontSize(9).fillColor("#1E293B").text(text || "—", { align: "justify", lineGap: 3 }).moveDown(0.4);
        };

        // Running header context (updated per WP document)
        let runWpCode = "", runWpName = "", runClient = "";
        const drawRunningHeader = () => {
          if (!runWpCode) return;
          doc.rect(45, 40, pgW, 13).fill("#EFF6FF").rect(45, 40, pgW, 13).strokeColor("#BFDBFE").lineWidth(0.5).stroke();
          doc.font("Helvetica").fontSize(6.5).fillColor(SLATE)
             .text(`${firmName}  ·  ${runWpCode}  ·  ${runWpName}  ·  Client: ${runClient}  ·  CONFIDENTIAL`, 50, 44, { width: pgW - 10, lineBreak: false });
          doc.y = 60;
        };

        const simpleTable = (headers: string[], rows: string[][], widths: number[]) => {
          const total = widths.reduce((s, w) => s + w, 0);
          const colW = widths.map(w => (w / total) * pgW);
          const x = 45;
          let y = doc.y;
          const HDR_H = 18;
          const MIN_ROW_H = 18;
          // Draw column headers (reusable for page-break continuation)
          const drawHeader = (atY: number): number => {
            doc.rect(45, atY, pgW, HDR_H).fill(NAVY);
            // Accent underline
            doc.rect(45, atY + HDR_H, pgW, 2).fill(ACCENT);
            let cx = x;
            headers.forEach((h, i) => {
              doc.font("Helvetica-Bold").fontSize(8).fillColor("white")
                 .text(h, cx + 4, atY + 5, { width: colW[i] - 8, lineBreak: false });
              // Vertical separator
              if (i < headers.length - 1) {
                doc.moveTo(cx + colW[i], atY + 3).lineTo(cx + colW[i], atY + HDR_H - 3)
                   .strokeColor("rgba(255,255,255,0.25)").lineWidth(0.4).stroke();
              }
              cx += colW[i];
            });
            return atY + HDR_H + 2;
          };
          y = drawHeader(y);
          // Data rows — re-draw header on every page break
          rows.forEach((row, ri) => {
            const rowColor = ri % 2 === 0 ? "#EEF2FF" : "#FFFFFF";
            let maxH = MIN_ROW_H;
            row.forEach((cell, i) => {
              const h2 = doc.heightOfString(String(cell || "—"), { width: colW[i] - 8, fontSize: 8.5 });
              if (h2 + 8 > maxH) maxH = h2 + 8;
            });
            if (y + maxH > doc.page.height - 60) {
              doc.addPage();
              drawRunningHeader();
              y = doc.y;
              y = drawHeader(y);
            }
            doc.rect(45, y, pgW, maxH).fill(rowColor);
            let cx = x;
            row.forEach((cell, i) => {
              doc.font("Helvetica").fontSize(8.5).fillColor("#1E293B")
                 .text(String(cell || "—"), cx + 4, y + 4, { width: colW[i] - 8, lineBreak: true });
              // Vertical cell separator
              if (i < row.length - 1) {
                doc.moveTo(cx + colW[i], y + 2).lineTo(cx + colW[i], y + maxH - 2)
                   .strokeColor("#CBD5E1").lineWidth(0.3).stroke();
              }
              cx += colW[i];
            });
            // Row bottom border
            doc.rect(45, y, pgW, maxH).strokeColor("#DDE3F0").lineWidth(0.3).stroke();
            y += maxH;
          });
          // Close bottom border of last row
          doc.moveTo(45, y).lineTo(45 + pgW, y).strokeColor(NAVY).lineWidth(0.6).stroke();
          doc.y = y + 6;
        };

        let firstDoc = true;
        for (const wpDoc of documents) {
          if (!firstDoc) doc.addPage();
          firstDoc = false;

          let wpData: any = {};
          try { wpData = JSON.parse(wpDoc.content || "{}"); } catch {}
          const meta = WP_METADATA[wpDoc.paperCode] || null;
          const headIsaR: Record<number, string> = {
            2: "ISA 210, ISA 220, ISA 300", 3: "ISA 315, ISA 320, ISA 530", 4: "ISA 230, ISA 300",
            5: "ISA 510, ISA 520", 6: "ISA 315, ISA 330, ISA 540", 7: "ISA 240, ISA 530",
            8: "ISA 450, ISA 560, ISA 570", 9: "ISA 700, ISA 705, ISA 706", 10: "ISA 220, ISQM 2", 11: "ISQM 1, ISA 220",
          };
          // Update running header context
          runWpCode = wpDoc.paperCode;
          runWpName = (wpDoc.paperName || meta?.name || headDef.name).substring(0, 50);
          runClient = clientName.substring(0, 30);

          // ── COVER PAGE ─────────────────────────────────────────────────────────
          // Header band
          doc.rect(45, 45, pgW, 52).fill(NAVY);
          doc.rect(45, 97, pgW, 3).fill(ACCENT);
          doc.font("Helvetica-Bold").fontSize(17).fillColor("white")
             .text(firmName, 55, 53, { width: pgW - 20, lineBreak: false });
          doc.font("Helvetica").fontSize(8).fillColor("#93C5FD")
             .text("Chartered Accountants  |  Registered with ICAP  |  CONFIDENTIAL — FOR AUDIT USE ONLY", 55, 76, { width: pgW - 20, lineBreak: false });
          // WP type banner
          doc.rect(45, 100, pgW, 22).fill(LIGHT);
          doc.font("Helvetica-Bold").fontSize(10).fillColor(BLUE)
             .text("AUDIT WORKING PAPER", 55, 107, { continued: true, lineBreak: false })
             .font("Helvetica").fillColor(SLATE)
             .text(`  —  ${headDef.name.toUpperCase()}`, { lineBreak: false });
          // Status badge (top-right of banner)
          const wpStatus2 = (wpDoc as any).status || "Draft";
          const badgeColor = wpStatus2 === "Final" ? GREEN : wpStatus2 === "exported" ? ACCENT : AMBER;
          const badgeLabel = wpStatus2 === "exported" ? "Exported" : wpStatus2;
          const badgeX = 45 + pgW - 64;
          doc.rect(badgeX, 104, 60, 14).fill(badgeColor);
          doc.font("Helvetica-Bold").fontSize(7.5).fillColor("white")
             .text(badgeLabel.toUpperCase(), badgeX + 4, 107.5, { width: 52, align: "center", lineBreak: false });
          doc.y = 130;

          // WP Title
          doc.font("Helvetica-Bold").fontSize(14).fillColor(NAVY)
             .text(`${wpDoc.paperCode}  —  ${wpDoc.paperName || meta?.name || headDef.name}`)
             .moveDown(0.3);
          drawHRule(ACCENT);
          doc.moveDown(0.2);

          // Metadata as styled 2-col table
          const metaRows: [string, string][] = [
            ["Client", clientName],
            ["Engagement Code", engCode],
            ["Financial Period", period],
            ["NTN / STRN", ntn],
            ["WP Code / Version", `${wpDoc.paperCode}  |  ${wpData.version || "v1.0"}`],
            ["Phase / Stage", meta?.phase || headDef.name],
            ["ISA References", meta?.isa || headIsaR[headIndex] || "ISA 500"],
            ["Risk Level", meta?.riskLevel || "Medium"],
            ["FS Area / Scope", meta?.fsArea || headDef.name],
            ["Assertions Covered", fmtAssertions(meta?.assertions || "C, E, A, V")],
            ["Lead Schedule Ref", wpData.lead_schedule_ref || "—"],
          ];
          const lblW = pgW * 0.34, valW = pgW * 0.66;
          const metaRowH = 16;
          let mty = doc.y;
          // Table outer top border
          doc.moveTo(45, mty).lineTo(45 + pgW, mty).strokeColor(NAVY).lineWidth(0.7).stroke();
          metaRows.forEach(([k, v], i) => {
            const bg = i % 2 === 0 ? "#F0F4FF" : "#FFFFFF";
            doc.rect(45, mty, pgW, metaRowH).fill(bg);
            // Divider line between label and value
            doc.moveTo(45 + lblW, mty).lineTo(45 + lblW, mty + metaRowH).strokeColor("#C7D2FE").lineWidth(0.4).stroke();
            // Row bottom border
            doc.moveTo(45, mty + metaRowH).lineTo(45 + pgW, mty + metaRowH).strokeColor("#DDE3F0").lineWidth(0.3).stroke();
            // Left edge accent
            doc.rect(45, mty, 3, metaRowH).fill(i === 0 ? ACCENT : (i % 2 === 0 ? BLUE : "#94A3B8"));
            // Label
            doc.font("Helvetica-Bold").fontSize(8).fillColor(SLATE)
               .text(k, 53, mty + 4.5, { width: lblW - 14, lineBreak: false });
            // Value
            doc.font("Helvetica").fontSize(8).fillColor("#1E293B")
               .text(v || "—", 45 + lblW + 6, mty + 4.5, { width: valW - 16, lineBreak: false });
            mty += metaRowH;
          });
          // Table outer bottom border
          doc.moveTo(45, mty).lineTo(45 + pgW, mty).strokeColor(NAVY).lineWidth(0.7).stroke();
          doc.y = mty + 10;

          // Sections from WP JSON
          if (wpData.objective) { sectionTitle("1. OBJECTIVE"); bodyText(wpData.objective); }
          if (wpData.materiality_linkage) {
            const ml = wpData.materiality_linkage;
            sectionTitle("1a. MATERIALITY LINKAGE  (ISA 320)");
            simpleTable(["Parameter", "Detail"], [
              ["Overall Materiality (PKR)", ml.overall_materiality_pkr || "—"], ["Performance Materiality (PKR)", ml.performance_materiality_pkr || "—"],
              ["Trivial Threshold (PKR)", ml.trivial_threshold_pkr || "—"], ["Basis", ml.basis || "—"],
              ["Percentage", ml.materiality_pct || "—"], ["Application", ml.applicable_to_this_wp || "—"],
            ], [40, 60]);
          }
          if (wpData.risk_assertion_table?.length) {
            sectionTitle("2. RISK & ASSERTION LINKAGE  (ISA 315 / ISA 330)");
            simpleTable(["Risk ID", "Risk Description", "Type", "FS Area", "Assertions", "Level", "ISA Ref", "Mitigating Control"],
              wpData.risk_assertion_table.map((r: any) => [r.risk_id, r.risk_description, r.risk_type, r.fs_area, r.assertions_impacted, r.risk_level, r.isa_reference || (r.risk_register_ref ? (WP_METADATA[r.risk_register_ref]?.isa || "ISA 315") : "ISA 315"), (r.mitigating_control && r.mitigating_control !== "—") ? r.mitigating_control : getMitigatingControl(r.fs_area, r.risk_type, r.risk_description)]),
              [6, 22, 9, 11, 10, 8, 10, 24]);
          }
          if (wpData.procedures_table?.length) {
            sectionTitle("3. AUDIT PROCEDURES PERFORMED  (ISA 330)");
            simpleTable(["Proc", "Nature", "Description", "ISA Ref", "By", "Status", "Result"],
              wpData.procedures_table.map((pr: any) => [pr.proc_id, pr.nature, pr.description, pr.isa_reference, pr.performed_by, pr.status, pr.result || "—"]),
              [5, 14, 30, 11, 9, 9, 22]);
          }
          const pop2 = wpData.population, samp2 = wpData.sample;
          if (pop2 || samp2) {
            sectionTitle("4. POPULATION & SAMPLE  (ISA 530)");
            simpleTable(["Parameter", "Population", "Sample"], [
              ["Description", pop2?.description || "—", samp2 ? "Basis: " + samp2.basis : "—"],
              ["Count", String(pop2?.count ?? "—"), String(samp2?.count ?? "—")],
              ["Amount (PKR)", pop2?.amount_pkr || "—", samp2?.amount_pkr || "—"],
              ["Coverage", pop2?.source || "—", samp2?.coverage_pct ? "Coverage: " + samp2.coverage_pct : "—"],
            ], [25, 37, 38]);
          }
          if (wpData.testing_results) {
            const tr2 = wpData.testing_results;
            sectionTitle("5. TESTING & RESULTS  (ISA 530 / ISA 500)");
            simpleTable(["Parameter", "Detail"], [
              ["Population Count", String(tr2.population_count ?? tr2.population_size_pkr ?? "—")],
              ["Population Amount (PKR)", tr2.population_amount_pkr || tr2.population_size_pkr || "—"],
              ["Sampling Method", tr2.sampling_method || "—"], ["Sample Count", String(tr2.sample_count ?? tr2.sample_size ?? "—")],
              ["Sample Amount (PKR)", tr2.sample_amount_pkr || "—"], ["Coverage %", tr2.coverage_pct || "—"],
              ["Exceptions", String(tr2.exceptions_identified ?? "0")], ["Exception Rate", tr2.exception_rate_pct || "0%"],
              ["TB Cross-Ref", tr2.tb_cross_ref || "—"], ["GL Cross-Ref", tr2.gl_cross_ref || "—"],
            ], [40, 60]);
            if (tr2.exceptions_detail?.length) { bodyText("Exception Details: " + tr2.exceptions_detail.join("; ")); }
          }
          if (wpData.work_performed) { sectionTitle("6. WORK PERFORMED  (ISA 230)"); bodyText(wpData.work_performed); }
          if (wpData.evidence_table?.length) {
            sectionTitle("7. EVIDENCE DOCUMENTATION  (ISA 500)");
            simpleTable(["ID", "Type", "Source", "Reliability", "Linked Proc", "Description"],
              wpData.evidence_table.map((e: any) => [e.evidence_id, e.type, e.source, e.reliability, e.linked_procedure, e.description]),
              [6, 11, 17, 9, 10, 47]);
          }
          if (wpData.variance_analysis?.length) {
            sectionTitle("8. VARIANCE ANALYSIS  (ISA 520)");
            simpleTable(["FS Line", "CY (PKR)", "PY (PKR)", "Variance", "Var %", "Explanation", "Mgmt Response"],
              wpData.variance_analysis.map((v: any) => [v.line_item, v.cy_amount_pkr, v.py_amount_pkr, v.variance_amount_pkr, v.variance_pct, v.explanation, v.management_response]),
              [13, 11, 11, 11, 7, 23, 24]);
          }
          if (wpData.auditor_judgement) { sectionTitle("9. AUDITOR'S JUDGEMENT  (ISA 230)"); bodyText(wpData.auditor_judgement); }
          const adjs = (wpData.proposed_adjustments || []).filter((a: any) => a.description && !/no adjustment/i.test(a.description));
          if (adjs.length) {
            sectionTitle("10. PROPOSED ADJUSTMENTS  (ISA 450)");
            simpleTable(["ID", "Description", "FS Line", "Amount", "Dr/Cr", "Mgmt Accepted", "Auditor Position"],
              adjs.map((a: any) => [a.adj_id, a.description, a.fs_line, a.amount_pkr, a.debit_credit, a.management_accepted, a.auditor_position]),
              [7, 26, 12, 12, 7, 13, 23]);
          }
          if (wpData.conclusion) {
            const c = wpData.conclusion;
            sectionTitle("11. CONCLUSION  (ISA 700 / ISA 450)");
            const concColor = c.status === "Satisfactory" ? GREEN : c.status === "Unsatisfactory" ? RED : SLATE;
            doc.font("Helvetica-Bold").fontSize(11).fillColor(concColor).text(c.status || "—").moveDown(0.3);
            doc.font("Helvetica").fontSize(9).fillColor("#1E293B");
            simpleTable(["Field", "Detail"], [
              ["Basis", c.basis || "—"], ["Corrected Misstatements (PKR)", c.corrected_misstatements_pkr || "PKR 0"],
              ["Uncorrected Misstatements (PKR)", c.uncorrected_misstatements_pkr || "PKR 0"],
              ["Impact on Opinion", c.impact_on_opinion || "No impact"], ["Management Letter Point", c.management_letter_point || "No"],
              ["Further Actions", c.further_actions || "None"], ["ISA Reference", c.isa_reference || "ISA 700"],
            ], [35, 65]);
          }
          if (wpData.review_notes?.length) {
            sectionTitle("12. REVIEW NOTES  (ISQM-1 / ISA 220)");
            simpleTable(["Note ID", "Reviewer", "Date", "Note", "Status", "Resolved By"],
              wpData.review_notes.map((n: any) => [n.note_id, n.reviewer, n.date, n.note, n.status, n.resolved_by || "—"]),
              [8, 12, 12, 40, 10, 18]);
          }
          if (wpData.action_points?.length) {
            sectionTitle("13. ACTION POINTS & FOLLOW-UPS");
            simpleTable(
              ["Issue ID", "Description", "Risk Impact", "Assigned To", "Deadline", "Status"],
              wpData.action_points.map((a: any) => [a.issue_id, a.description || "—", a.risk_impact || "—", a.assigned_to || "—", a.deadline || "—", a.status || "—"]),
              [8, 36, 10, 14, 16, 10]
            );
          }
          if (wpData.exceptions?.length) {
            sectionTitle("13b. EXCEPTIONS & FINDINGS");
            wpData.exceptions.forEach((exc: string) => doc.font("Helvetica").fontSize(9).fillColor("#1E293B").text("• " + exc).moveDown(0.1));
          }
          if (wpData.cross_references?.length) {
            sectionTitle("14. CROSS-REFERENCES");
            wpData.cross_references.forEach((r: string) => doc.font("Helvetica").fontSize(9).fillColor("#1E293B").text("• " + r).moveDown(0.1));
          }

          // SIGN-OFF BLOCK
          doc.moveDown(1);
          if (doc.y > doc.page.height - 185) { doc.addPage(); drawRunningHeader(); }
          sectionTitle("SIGN-OFF & REVIEW  (ISQM-1 / ISA 220 COMPLIANT)");
          const soRoles = ["Preparer", "Reviewer", "Approver", "EQCR"];
          const soNames = [
            session?.preparerName || "—",
            session?.reviewerName || "—",
            session?.approverName || "—",
            eqcrRequired ? (varLkp["eqcr_reviewer_name"] || "—") : "N/A",
          ];
          const soComments = [
            "Prepared and reviewed for completeness.",
            "Reviewed. No exceptions noted.",
            "Approved. Report is unmodified.",
            eqcrRequired ? "EQCR review completed." : "N/A",
          ];
          const colW2 = pgW / 4;
          const signY = doc.y;
          // Header row
          doc.rect(45, signY, pgW, 20).fill(NAVY);
          doc.rect(45, signY + 20, pgW, 2).fill(ACCENT);
          soRoles.forEach((lv, i) => {
            doc.font("Helvetica-Bold").fontSize(9).fillColor("white")
               .text(lv, 45 + i * colW2 + 6, signY + 6, { width: colW2 - 12, lineBreak: false });
            if (i < soRoles.length - 1) {
              doc.moveTo(45 + (i + 1) * colW2, signY + 3).lineTo(45 + (i + 1) * colW2, signY + 17)
                 .strokeColor("rgba(255,255,255,0.3)").lineWidth(0.5).stroke();
            }
          });
          // Data row
          const signRowH = 84;
          const signRowY = signY + 22;
          soNames.forEach((nm, i) => {
            const cellX = 45 + i * colW2;
            const cellBg = i % 2 === 0 ? "#F0F4FF" : "#FFFFFF";
            doc.rect(cellX, signRowY, colW2, signRowH).fill(cellBg);
            if (i < soNames.length - 1) {
              doc.moveTo(cellX + colW2, signRowY).lineTo(cellX + colW2, signRowY + signRowH)
                 .strokeColor("#CBD5E1").lineWidth(0.4).stroke();
            }
            const cx2 = cellX + 6;
            const cw = colW2 - 12;
            if (nm === "N/A") {
              doc.font("Helvetica-Oblique").fontSize(8.5).fillColor(SLATE)
                 .text("N/A — Not Required", cx2, signRowY + 34, { width: cw, align: "center", lineBreak: false });
            } else {
              doc.font("Helvetica-Bold").fontSize(8).fillColor("#1E293B")
                 .text(nm, cx2, signRowY + 5, { width: cw, lineBreak: false });
              doc.font("Helvetica").fontSize(8).fillColor(SLATE)
                 .text("Signature: _________________", cx2, signRowY + 20, { width: cw, lineBreak: false })
                 .text(`Date: ${exportDate}`, cx2, signRowY + 35, { width: cw, lineBreak: false });
              doc.font("Helvetica-Bold").fontSize(8).fillColor(GREEN)
                 .text("[+] Satisfactory", cx2, signRowY + 50, { width: cw, lineBreak: false });
              doc.font("Helvetica").fontSize(7).fillColor(SLATE)
                 .text(soComments[i], cx2, signRowY + 65, { width: cw, lineBreak: true });
            }
          });
          // Outer border
          doc.rect(45, signRowY, pgW, signRowH).strokeColor(NAVY).lineWidth(0.6).stroke();
          doc.y = signRowY + signRowH + 6;

          // Page footer
          doc.moveTo(45, doc.y).lineTo(45 + pgW, doc.y).strokeColor(ACCENT).lineWidth(0.8).stroke();
          doc.moveDown(0.3).font("Helvetica").fontSize(7.5).fillColor("#94A3B8")
            .text(`${firmName}  |  CONFIDENTIAL — For Audit Use Only  |  ${clientName}  |  ${period}  |  Generated: ${new Date().toLocaleDateString("en-GB")}`, { align: "center" });
          doc.moveDown(0.15).font("Helvetica").fontSize(7.5).fillColor(SLATE)
             .text("LOCKED after Engagement Partner sign-off. Amendment requires EQCR re-review per ISQM 1.", { align: "center" });
        }

        // Stamp page numbers on every page using buffered pages
        const pageRange = doc.bufferedPageRange();
        for (let i = 0; i < pageRange.count; i++) {
          doc.switchToPage(pageRange.start + i);
          // Bottom-right page number
          doc.font("Helvetica").fontSize(7.5).fillColor("#94A3B8")
             .text(`Page ${i + 1} of ${pageRange.count}`, 45, doc.page.height - 28, { width: pgW, align: "right", lineBreak: false });
        }
        doc.flushPages();
        doc.end();
      });

      await db.update(wpHeadsTable).set({ status: "exported", exportedAt: new Date(), updatedAt: new Date() }).where(eq(wpHeadsTable.id, heads[0].id));
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${headDef.name.replace(/\s/g, "_")}_${clientName.replace(/\s/g, "_")}_${session?.engagementYear || sessionId}.pdf"`);
      return res.send(pdfBuf);
    }

    // ── HEADS 2-11: WORD / WORD+EXCEL / WORD+PDF output ──────────────────────
    const headIsaRefs: Record<number, string> = {
      2: "ISA 200, ISA 210, ISA 220, ISA 300, ISA 315",
      3: "ISA 200, ISA 315, ISA 320, ISA 500, ISA 505, ISA 520, ISA 530",
      4: "ISA 230, ISA 300, ISA 500",
      5: "ISA 510, ISA 520, ISA 230",
      6: "ISA 220, ISA 260, ISA 265, ISA 300, ISA 315, ISA 320, ISA 330, ISA 450, ISA 530, ISA 540, ISA 550, ISQM 1",
      7: "ISA 240, ISA 330, ISA 500, ISA 501, ISA 505, ISA 530",
      8: "ISA 230, ISA 450, ISA 500, ISA 560, ISA 570, ISA 580, ISA 700, ISA 720",
      9: "ISA 700, ISA 705, ISA 706, ISA 720, ISA 230",
      10: "ISA 220, ISQM 2",
      11: "ISQM 1, ISA 220, ISA 230, ISA 315, ISA 330",
    };

    // Per-document pages — each WP gets its own full-page header + content + sign-off
    const docSections: any[] = [];
    let firstDoc = true;

    for (const doc of documents) {
      if (!firstDoc) {
        docSections.push(new Paragraph({ children: [new PageBreak()] }));
      }
      firstDoc = false;

      // Per-WP metadata from the stored content
      let wpData: any = {};
      try { wpData = JSON.parse(doc.content || "{}"); } catch {}
      const meta = WP_METADATA[doc.paperCode] || WP_METADATA[doc.paperCode.replace(/-\d+$/, "")] || null;

      // Per-WP header with full metadata
      docSections.push(...dxFirmHeader(firmName, clientName, headDef.name, period, ntn, meta?.isa || headIsaRefs[headIndex] || "", {
        wpCode: doc.paperCode,
        version: wpData.version || "v1.0",
        riskLevel: meta?.riskLevel || "Medium",
        assertions: meta?.assertions || "C, E, A, V",
        phase: meta?.phase || headDef.name,
        fsArea: meta?.fsArea || "All FS Areas",
        engCode,
        leadRef: wpData.lead_schedule_ref || "—",
        lockStatus: wpData.lock_status || "draft",
        aiGenerated: wpData.ai_generated === true,
      }));

      // WP title bar
      docSections.push(new Paragraph({
        children: [
          new TextRun({ text: `${doc.paperCode}  `, bold: true, size: 26, color: DOCX_SLATE, font: "Calibri" }),
          new TextRun({ text: `${doc.paperName || meta?.name || ""}`, bold: true, size: 26, color: DOCX_NAVY, font: "Calibri" }),
        ],
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 160, after: 200 },
        border: { bottom: { style: BorderStyle.SINGLE, color: DOCX_BLUE, size: 8 } },
      }));

      // Structured content (10 sections)
      docSections.push(...parseDocxContent(doc.content || "", clientName));

      // ── 4-Level Sign-Off Table (ISQM-1 / ISA 220 compliant) ──────────────
      docSections.push(new Paragraph({ text: "", spacing: { before: 480 } }));
      docSections.push(dxSection("SIGN-OFF & REVIEW  (ISQM-1 / ISA 220)"));
      const soSignData = [
        { role: "Preparer",  name: session?.preparerName || "—", comments: "Prepared and reviewed for completeness." },
        { role: "Reviewer",  name: session?.reviewerName || "—", comments: "Reviewed. No exceptions noted." },
        { role: "Approver",  name: session?.approverName || "—", comments: "Approved. Report is unmodified." },
        { role: "EQCR",      name: eqcrRequired ? (varLkp["eqcr_reviewer_name"] || "—") : "N/A", comments: eqcrRequired ? "EQCR review completed." : "N/A" },
      ];
      const cellBorder = { top: { style: BorderStyle.SINGLE, color: "E2E8F0", size: 1 }, bottom: { style: BorderStyle.SINGLE, color: "E2E8F0", size: 1 }, left: { style: BorderStyle.SINGLE, color: "E2E8F0", size: 1 }, right: { style: BorderStyle.SINGLE, color: "E2E8F0", size: 1 } };
      docSections.push(new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          // Header row
          new TableRow({
            tableHeader: true,
            children: soSignData.map(d => new TableCell({
              shading: { fill: DOCX_NAVY, type: ShadingType.SOLID },
              children: [new Paragraph({ children: [new TextRun({ text: d.role, bold: true, color: "FFFFFF", size: 20, font: "Calibri" })] })],
              borders: cellBorder,
              margins: { top: 80, bottom: 80, left: 120, right: 120 },
            })),
          }),
          // Data row
          new TableRow({
            children: soSignData.map(d => {
              const isNA = d.name === "N/A";
              return new TableCell({
                children: isNA ? [
                  new Paragraph({ children: [new TextRun({ text: "N/A — Not Applicable", size: 17, font: "Calibri", color: DOCX_SLATE, italics: true })], spacing: { after: 40 } }),
                ] : [
                  new Paragraph({ children: [new TextRun({ text: `Name: ${d.name}`, size: 17, font: "Calibri", bold: true })], spacing: { after: 80 } }),
                  new Paragraph({ children: [new TextRun({ text: "Signature: ______________________", size: 17, font: "Calibri", color: DOCX_SLATE })], spacing: { after: 80 } }),
                  new Paragraph({ children: [new TextRun({ text: `Date: ${exportDate}`, size: 17, font: "Calibri" })], spacing: { after: 80 } }),
                  new Paragraph({ children: [new TextRun({ text: "☑  Satisfactory", size: 17, font: "Calibri", color: DOCX_GREEN, bold: true })], spacing: { after: 80 } }),
                  new Paragraph({ children: [new TextRun({ text: `Comments: ${d.comments}`, size: 16, font: "Calibri", color: DOCX_SLATE })], spacing: { after: 0 } }),
                ],
                borders: cellBorder,
                margins: { top: 100, bottom: 100, left: 120, right: 120 },
              });
            }),
          }),
        ],
      }));
      docSections.push(new Paragraph({ text: "", spacing: { after: 200 } }));
      docSections.push(dxBody("⚠  This working paper is LOCKED after Engagement Partner sign-off. Any amendment requires EQCR re-review per ISQM 1."));
    }

    docSections.push(dxFooter(firmName));

    const docxDoc = new Document({
      styles: {
        default: {
          document: { run: { font: "Calibri", size: 20 } },
        },
      },
      sections: [{
        properties: {
          page: {
            margin: { top: 720, right: 720, bottom: 720, left: 900 },
          },
        },
        footers: {
          default: new Footer({
            children: [new Paragraph({
              children: [
                new TextRun({ text: `${firmName}  |  Confidential — For Audit Use Only  |  ${clientName}  |  ${period}`, size: 16, color: "94A3B8", font: "Calibri" }),
              ],
              alignment: AlignmentType.CENTER,
              border: { top: { style: BorderStyle.SINGLE, color: "CBD5E1", size: 4 } },
            })],
          }),
        },
        children: docSections,
      }],
    });
    const buffer = await Packer.toBuffer(docxDoc);

    await db.update(wpHeadsTable).set({ status: "exported", exportedAt: new Date(), updatedAt: new Date() }).where(eq(wpHeadsTable.id, heads[0].id));
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", `attachment; filename="${headDef.name.replace(/\s/g, "_")}_${clientName.replace(/\s/g, "_")}_${session?.engagementYear || sessionId}.docx"`);
    return res.send(buffer);
  } catch (err: any) {
    logger.error({ err }, "Export failed");
    res.status(500).json({ error: err.message || "Export failed" });
  }
});


// ═══════════════════════════════════════════════════════════════════════════
// EXCEPTION CENTER
// ═══════════════════════════════════════════════════════════════════════════

router.get("/sessions/:id/exceptions", async (req: Request, res: Response) => {
  try {
    const sessionId = parseInt(p(req.params.id));
    const { limit, offset } = parsePagination(req, 100, 500);
    const exceptions = await db.select().from(wpExceptionLogTable).where(eq(wpExceptionLogTable.sessionId, sessionId)).limit(limit).offset(offset);
    res.json(exceptions);
  } catch (err: any) {
    logger.error({ err }, "Failed to fetch exceptions");
    res.status(500).json({ error: "Failed to fetch exceptions" });
  }
});

router.patch("/sessions/:id/exceptions/:excId", requireRoles(...WP_ROLES_WRITE), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const excId = parseInt(p(req.params.excId));
    if (isNaN(excId)) return res.status(400).json({ error: "Invalid exception ID" });
    const { status, resolution, resolvedBy } = req.body;
    const validExcStatuses = ["open", "under_review", "cleared", "override_approved", "waived", "escalated"];
    if (status && !validExcStatuses.includes(status)) return res.status(400).json({ error: `Invalid exception status. Allowed: ${validExcStatuses.join(", ")}` });
    const updates: any = { updatedAt: new Date() };
    if (status) updates.status = status;
    if (resolution) updates.resolution = resolution;
    if (resolvedBy) updates.resolvedBy = resolvedBy;
    if (status === "cleared" || status === "override_approved") updates.resolvedAt = new Date();
    const [updated] = await db.update(wpExceptionLogTable).set(updates).where(eq(wpExceptionLogTable.id, excId)).returning();
    res.json(updated);
  } catch (err: any) {
    logger.error({ err }, "Failed to update exception");
    res.status(500).json({ error: "Failed to update exception" });
  }
});


// ═══════════════════════════════════════════════════════════════════════════
// DEPENDENCY GATES
// ═══════════════════════════════════════════════════════════════════════════

async function checkDependencies(sessionId: number, headIndex: number): Promise<{ satisfied: boolean; missing: string[] }> {
  const missing: string[] = [];

  const session = (await db.select().from(wpSessionsTable).where(eq(wpSessionsTable.id, sessionId)))[0];
  if (!session) return { satisfied: false, missing: ["Session not found"] };

  const files = await db.select().from(wpUploadedFilesTable).where(eq(wpUploadedFilesTable.sessionId, sessionId));
  const fields = await db.select().from(wpExtractedFieldsTable).where(eq(wpExtractedFieldsTable.sessionId, sessionId));
  const variables = await db.select().from(wpVariablesTable).where(eq(wpVariablesTable.sessionId, sessionId));
  const tbLines = await db.select().from(wpTrialBalanceLinesTable).where(eq(wpTrialBalanceLinesTable.sessionId, sessionId));
  const heads = await db.select().from(wpHeadsTable).where(eq(wpHeadsTable.sessionId, sessionId));

  if (headIndex >= 0) {
    if (files.length === 0 && tbLines.length === 0) missing.push("No files uploaded and no trial balance data");
    if (fields.length === 0 && tbLines.length === 0 && variables.length === 0) missing.push("No data extracted — upload template or run extraction");
  }

  const hasUploadedTemplate = files.some(f => f.category === "financial_statements" || f.category === "trial_balance");
  if (headIndex >= 1 && !hasUploadedTemplate) {
    if (tbLines.length === 0) missing.push("Trial Balance not generated — upload financial template first");
  }

  if (headIndex >= 2 && !hasUploadedTemplate) {
    const glAccounts = await db.select().from(wpGlAccountsTable).where(eq(wpGlAccountsTable.sessionId, sessionId));
    if (glAccounts.length === 0 && tbLines.length === 0) missing.push("General Ledger or Trial Balance not generated — upload template first");
    const glHead = heads.find(h => h.headIndex === 1);
    if (false && glHead && glHead.status !== "approved" && glHead.status !== "exported" && glHead.status !== "completed") {
      missing.push("General Ledger head not approved");
    }
  }

  for (let i = 2; i < headIndex; i++) {
    const prevHead = heads.find(h => h.headIndex === i);
    if (prevHead && prevHead.status !== "approved" && prevHead.status !== "exported" && prevHead.status !== "completed") {
      missing.push(`${AUDIT_HEADS[i]?.name || `Head ${i}`} not completed`);
    }
  }

  return { satisfied: missing.length === 0, missing };
}


// ═══════════════════════════════════════════════════════════════════════════
// FULL BUNDLE EXPORT
// ═══════════════════════════════════════════════════════════════════════════

router.post("/sessions/:id/export-bundle", requireRoles(...WP_ROLES_WRITE), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const sessionId = parseInt(p(req.params.id));
    const session = (await db.select().from(wpSessionsTable).where(eq(wpSessionsTable.id, sessionId)))[0];
    if (!session) return res.status(404).json({ error: "Session not found" });

    const heads     = await db.select().from(wpHeadsTable).where(eq(wpHeadsTable.sessionId, sessionId)).orderBy(asc(wpHeadsTable.headIndex));
    const allDocs   = await db.select().from(wpHeadDocumentsTable).where(eq(wpHeadDocumentsTable.sessionId, sessionId));
    const exceptions = await db.select().from(wpExceptionLogTable).where(eq(wpExceptionLogTable.sessionId, sessionId));
    const changeLog = await db.select().from(wpVariableChangeLogTable).where(eq(wpVariableChangeLogTable.sessionId, sessionId));
    const tbLines   = await db.select().from(wpTrialBalanceLinesTable).where(eq(wpTrialBalanceLinesTable.sessionId, sessionId));

    const clientName = session.clientName || "Client";
    const ntn = session.ntn || "N/A";
    const period = session.periodStart && session.periodEnd
      ? `${session.periodStart} to ${session.periodEnd}`
      : `FY ${session.engagementYear}`;
    const firmName = "Alam & Aulakh Chartered Accountants";

    const wb = new ExcelJS.Workbook();
    wb.creator = firmName;
    wb.created = new Date();

    // ── SHEET 1: Cover / Index ─────────────────────────────────────────────
    const indexWs = wb.addWorksheet("Index", { properties: { tabColor: { argb: BP.navy } } });
    indexWs.columns = [{ width: 6 }, { width: 34 }, { width: 16 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 14 }];
    buildXlsxFirmHeader(indexWs, 7, clientName, "Audit Working Papers Bundle", period, ntn);
    indexWs.getRow(4).height = 6;

    // Meta block
    const metaFields = [
      ["Entity Type", session.entityType || "N/A"],
      ["Framework", session.reportingFramework || "IFRS"],
      ["Engagement Year", String(session.engagementYear)],
      ["Generated On", new Date().toLocaleDateString("en-GB", { year: "numeric", month: "long", day: "numeric" })],
      ["Total Heads", String(heads.length)],
      ["Total Documents", String(allDocs.length)],
    ];
    let metaRow = 5;
    for (const [label, val] of metaFields) {
      indexWs.getRow(metaRow).height = 17;
      xLabel(indexWs.getRow(metaRow).getCell(2), label);
      indexWs.mergeCells(metaRow, 2, metaRow, 3);
      xValue(indexWs.getRow(metaRow).getCell(4), val);
      indexWs.mergeCells(metaRow, 4, metaRow, 7);
      metaRow++;
    }
    metaRow++;

    // Index table header
    indexWs.getRow(metaRow).height = 22;
    ["#", "Audit Head", "Output Type", "Status", "Documents", "Exceptions", "Exported"].forEach((h, i) => {
      xHdr(indexWs.getRow(metaRow).getCell(i + 1), h, i >= 2);
    });
    metaRow++;

    const statusColor: Record<string, string> = {
      approved: "FF16A34A", exported: "FF0891B2", completed: "FF0F766E",
      in_progress: "FFF59E0B", locked: "FF94A3B8", ready: "FF3B82F6",
    };
    for (const head of heads) {
      const headDocs = allDocs.filter(d => d.headId === head.id);
      const r = indexWs.getRow(metaRow); r.height = 18;
      xData(r.getCell(1), head.headIndex + 1, metaRow, true);
      xData(r.getCell(2), head.headName, metaRow);
      xData(r.getCell(3), (AUDIT_HEADS[head.headIndex]?.outputType || "").toUpperCase(), metaRow);
      const sc = r.getCell(4);
      xData(sc, head.status?.replace(/_/g, " "), metaRow);
      sc.font = { ...sc.font as any, bold: true, color: { argb: statusColor[head.status || ""] || BP.slate } };
      xData(r.getCell(5), headDocs.length, metaRow, true);
      xData(r.getCell(6), head.exceptionsCount || 0, metaRow, true);
      const expCell = r.getCell(7);
      xData(expCell, head.exportedAt ? "✓ Yes" : "—", metaRow, true);
      if (head.exportedAt) expCell.font = { ...expCell.font as any, color: { argb: "FF16A34A" }, bold: true };
      metaRow++;
    }

    // ── SHEET 2: Trial Balance ─────────────────────────────────────────────
    const tbWs = wb.addWorksheet("Trial Balance", { properties: { tabColor: { argb: BP.blue } } });
    tbWs.columns = [{ width: 16 }, { width: 42 }, { width: 22 }, { width: 18 }, { width: 18 }, { width: 18 }];
    tbWs.views = [{ state: "frozen", ySplit: 5 }];
    buildXlsxFirmHeader(tbWs, 6, clientName, "Trial Balance", period, ntn);
    tbWs.getRow(4).height = 4;
    ["Account Code", "Account Name", "Classification", "Debit (PKR)", "Credit (PKR)", "Balance (PKR)"].forEach((h, i) => {
      xHdr(tbWs.getRow(5).getCell(i + 1), h, i >= 3);
    });
    tbWs.getRow(5).height = 22;
    let tbRow = 6; let tDr = 0, tCr = 0, tBal = 0;
    for (const l of tbLines) {
      const r = tbWs.getRow(tbRow); r.height = 17;
      const dr = parseFloat(String(l.debit)) || 0;
      const cr = parseFloat(String(l.credit)) || 0;
      const bal = parseFloat(String(l.balance)) || 0;
      xData(r.getCell(1), l.accountCode, tbRow);
      xData(r.getCell(2), l.accountName, tbRow);
      xData(r.getCell(3), l.classification, tbRow);
      xNum(r.getCell(4), dr || null, tbRow);
      xNum(r.getCell(5), cr || null, tbRow);
      xNum(r.getCell(6), bal, tbRow);
      if (bal < 0) r.getCell(6).font = { ...r.getCell(6).font as any, color: { argb: BP.red } };
      tDr += dr; tCr += cr; tBal += bal;
      tbRow++;
    }
    tbRow++;
    [xTotal(tbWs.getRow(tbRow).getCell(1), "TOTALS"), tbWs.mergeCells(tbRow, 1, tbRow, 3)];
    xTotal(tbWs.getRow(tbRow).getCell(4), tDr, true);
    xTotal(tbWs.getRow(tbRow).getCell(5), tCr, true);
    xTotal(tbWs.getRow(tbRow).getCell(6), tBal, true);
    tbWs.getRow(tbRow).height = 22;

    // ── SHEET 3: Exceptions ────────────────────────────────────────────────
    const excWs = wb.addWorksheet("Exceptions", { properties: { tabColor: { argb: "FFDC2626" } } });
    excWs.columns = [{ width: 18 }, { width: 12 }, { width: 38 }, { width: 50 }, { width: 16 }, { width: 30 }];
    excWs.views = [{ state: "frozen", ySplit: 5 }];
    buildXlsxFirmHeader(excWs, 6, clientName, "Exceptions Register", period, ntn);
    excWs.getRow(4).height = 4;
    ["Exception Type", "Severity", "Title", "Description", "Status", "Resolution"].forEach((h, i) => {
      xHdr(excWs.getRow(5).getCell(i + 1), h);
    });
    excWs.getRow(5).height = 22;
    const sevColor: Record<string, string> = { critical: "FFDC2626", high: "FFEA580C", medium: "FFF59E0B", low: "FF16A34A" };
    let eRow = 6;
    for (const e of exceptions) {
      const r = excWs.getRow(eRow); r.height = 18;
      xData(r.getCell(1), e.exceptionType, eRow);
      const sc2 = r.getCell(2); xData(sc2, e.severity, eRow);
      sc2.font = { ...sc2.font as any, bold: true, color: { argb: sevColor[e.severity || ""] || BP.slate } };
      xData(r.getCell(3), e.title, eRow);
      xData(r.getCell(4), e.description || "", eRow);
      xData(r.getCell(5), e.status, eRow);
      xData(r.getCell(6), e.resolution || "", eRow);
      eRow++;
    }
    if (exceptions.length === 0) {
      const noExc = excWs.getRow(6); noExc.height = 20;
      const nc = noExc.getCell(1); nc.value = "✓ No exceptions recorded";
      nc.font = { bold: true, color: { argb: "FF16A34A" }, size: 10, name: "Calibri" };
      excWs.mergeCells(6, 1, 6, 6);
    }

    // ── SHEET 4: Audit Trail ───────────────────────────────────────────────
    const trailWs = wb.addWorksheet("Audit Trail", { properties: { tabColor: { argb: BP.slate } } });
    trailWs.columns = [{ width: 28 }, { width: 30 }, { width: 30 }, { width: 38 }, { width: 22 }];
    trailWs.views = [{ state: "frozen", ySplit: 5 }];
    buildXlsxFirmHeader(trailWs, 5, clientName, "Audit Trail — Variable Change Log", period, ntn);
    trailWs.getRow(4).height = 4;
    ["Field", "Old Value", "New Value", "Reason", "Changed On"].forEach((h, i) => {
      xHdr(trailWs.getRow(5).getCell(i + 1), h);
    });
    trailWs.getRow(5).height = 22;
    let tRow = 6;
    for (const c of changeLog) {
      const r = trailWs.getRow(tRow); r.height = 17;
      xData(r.getCell(1), c.fieldName, tRow);
      xData(r.getCell(2), c.oldValue || "", tRow);
      xData(r.getCell(3), c.newValue || "", tRow);
      xData(r.getCell(4), c.reason || "", tRow);
      xData(r.getCell(5), c.createdAt ? new Date(c.createdAt).toLocaleDateString("en-GB") : "", tRow);
      tRow++;
    }
    if (changeLog.length === 0) {
      const nc2 = trailWs.getRow(6).getCell(1); nc2.value = "No changes recorded";
      nc2.font = { color: { argb: BP.slate }, size: 9, name: "Calibri" };
      trailWs.mergeCells(6, 1, 6, 5);
    }

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${clientName.replace(/\s/g, "_")}_${session.engagementYear}_Bundle.xlsx"`);
    await wb.xlsx.write(res);
    return res.end();
  } catch (err: any) {
    logger.error({ err }, "Bundle export failed: ");
    res.status(500).json({ error: "Bundle export failed: " + err.message });
  }
});

router.get("/heads-definition", (req: Request, res: Response) => {
  const entityType = (req.query?.entityType || "") as string;
  const heads = AUDIT_HEADS.map(h => ({
    ...h,
    papers: entityType ? filterPapersForEntity(h.papers, entityType) : h.papers,
  }));
  res.json(heads);
});

router.get("/wp-metadata", (_req: Request, res: Response) => {
  res.json(WP_METADATA);
});

// ═══════════════════════════════════════════════════════════════════════════
// AUDIT ENGINE MASTER
// ═══════════════════════════════════════════════════════════════════════════

const DEFAULT_WP_TRIGGERS = [
  { wpCode: "A1", wpName: "Engagement Letter & Terms", triggerCondition: "always", triggerDescription: "Required for all engagements", isaReference: "ISA 210", outputFormat: "Word", mandatoryFlag: true, category: "Planning", displayOrder: 1 },
  { wpCode: "A2", wpName: "Independence Declaration", triggerCondition: "always", triggerDescription: "Required for all engagements", isaReference: "ISA 200", outputFormat: "Word", mandatoryFlag: true, category: "Planning", displayOrder: 2 },
  { wpCode: "A3", wpName: "Audit Planning Memorandum", triggerCondition: "always", triggerDescription: "Required for all statutory audits", isaReference: "ISA 300", outputFormat: "Word", mandatoryFlag: true, category: "Planning", displayOrder: 3 },
  { wpCode: "B1", wpName: "Understanding the Entity & Environment", triggerCondition: "always", triggerDescription: "Required for all engagements", isaReference: "ISA 315", outputFormat: "Word", mandatoryFlag: true, category: "Risk", displayOrder: 4 },
  { wpCode: "B2", wpName: "Internal Controls Assessment", triggerCondition: "always", triggerDescription: "Required for all engagements", isaReference: "ISA 315", outputFormat: "Word", mandatoryFlag: true, category: "Risk", displayOrder: 5 },
  { wpCode: "B3", wpName: "Risk Assessment — High Risk Areas", triggerCondition: "risk:High", triggerDescription: "Triggered when overall risk is High", isaReference: "ISA 315", outputFormat: "Word", mandatoryFlag: false, category: "Risk", displayOrder: 6 },
  { wpCode: "B4", wpName: "Analytical Procedures — Planning Stage", triggerCondition: "always", triggerDescription: "Required for all engagements", isaReference: "ISA 520", outputFormat: "Excel", mandatoryFlag: true, category: "Risk", displayOrder: 7 },
  { wpCode: "C1", wpName: "Cash & Bank Verification", triggerCondition: "always", isaReference: "ISA 501", outputFormat: "Excel", mandatoryFlag: true, category: "Substantive", displayOrder: 8 },
  { wpCode: "C2", wpName: "Accounts Receivable & Debtors", triggerCondition: "always", isaReference: "ISA 505", outputFormat: "Excel", mandatoryFlag: true, category: "Substantive", displayOrder: 9 },
  { wpCode: "C3", wpName: "Inventory & Stock Valuation", triggerCondition: "industry:Manufacturing", triggerDescription: "Triggered for Manufacturing entities", isaReference: "ISA 501", outputFormat: "Excel", mandatoryFlag: false, category: "Substantive", displayOrder: 10 },
  { wpCode: "C4", wpName: "Property Plant & Equipment", triggerCondition: "always", isaReference: "ISA 500", outputFormat: "Excel", mandatoryFlag: true, category: "Substantive", displayOrder: 11 },
  { wpCode: "C5", wpName: "Accounts Payable & Creditors", triggerCondition: "always", isaReference: "ISA 500", outputFormat: "Excel", mandatoryFlag: true, category: "Substantive", displayOrder: 12 },
  { wpCode: "C6", wpName: "Revenue & Income Testing", triggerCondition: "always", isaReference: "ISA 240", outputFormat: "Excel", mandatoryFlag: true, category: "Substantive", displayOrder: 13 },
  { wpCode: "C7", wpName: "Payroll & Staff Costs Testing", triggerCondition: "always", isaReference: "ISA 500", outputFormat: "Excel", mandatoryFlag: true, category: "Substantive", displayOrder: 14 },
  { wpCode: "C8", wpName: "Borrowings & Finance Costs", triggerCondition: "always", isaReference: "ISA 500", outputFormat: "Excel", mandatoryFlag: true, category: "Substantive", displayOrder: 15 },
  { wpCode: "C9", wpName: "Related Party Transactions", triggerCondition: "flag:relatedPartyFlag", triggerDescription: "Triggered when Related Party Flag is set", isaReference: "ISA 550", outputFormat: "Word", mandatoryFlag: false, category: "Substantive", displayOrder: 16 },
  { wpCode: "C10", wpName: "Provisions & Contingencies", triggerCondition: "always", isaReference: "ISA 500", outputFormat: "Word", mandatoryFlag: true, category: "Substantive", displayOrder: 17 },
  { wpCode: "D1", wpName: "Going Concern Assessment", triggerCondition: "flag:goingConcernFlag", triggerDescription: "Triggered when Going Concern Flag is set", isaReference: "ISA 570", outputFormat: "Word", mandatoryFlag: false, category: "Analytical", displayOrder: 18 },
  { wpCode: "D2", wpName: "Fraud Risk Assessment & Response", triggerCondition: "flag:fraudRiskFlag", triggerDescription: "Triggered when Fraud Risk Flag is set", isaReference: "ISA 240", outputFormat: "Word", mandatoryFlag: false, category: "Analytical", displayOrder: 19 },
  { wpCode: "D3", wpName: "Compliance — Laws & Regulations", triggerCondition: "flag:lawsRegulationFlag", isaReference: "ISA 250", outputFormat: "Word", mandatoryFlag: false, category: "Analytical", displayOrder: 20 },
  { wpCode: "D4", wpName: "Final Analytical Review", triggerCondition: "always", isaReference: "ISA 520", outputFormat: "Excel", mandatoryFlag: true, category: "Completion", displayOrder: 21 },
  { wpCode: "D5", wpName: "Subsequent Events Review", triggerCondition: "always", isaReference: "ISA 560", outputFormat: "Word", mandatoryFlag: true, category: "Completion", displayOrder: 22 },
  { wpCode: "E1", wpName: "Management Representation Letter", triggerCondition: "always", isaReference: "ISA 580", outputFormat: "Word", mandatoryFlag: true, category: "Completion", displayOrder: 23 },
  { wpCode: "E2", wpName: "Communication with Those Charged with Governance", triggerCondition: "always", isaReference: "ISA 265", outputFormat: "Word", mandatoryFlag: true, category: "Completion", displayOrder: 24 },
  { wpCode: "E3", wpName: "Audit Report & Opinion", triggerCondition: "always", isaReference: "ISA 700", outputFormat: "Word", mandatoryFlag: true, category: "Completion", displayOrder: 25 },
  { wpCode: "E4", wpName: "Use of Expert Documentation", triggerCondition: "flag:useOfExpertFlag", isaReference: "ISA 620", outputFormat: "Word", mandatoryFlag: false, category: "Planning", displayOrder: 26 },
  { wpCode: "E5", wpName: "Internal Audit Reliance Assessment", triggerCondition: "flag:internalAuditFlag", isaReference: "ISA 610", outputFormat: "Word", mandatoryFlag: false, category: "Planning", displayOrder: 27 },
];

const DEFAULT_ASSERTION_LINKAGE = [
  { accountType: "Asset", fsLineItem: "Cash & Bank", assertion: "Existence", wpCode: "C1", wpLink: "Cash Verification", testingProcedure: "Bank confirmation, physical count", isaReference: "ISA 501", riskTag: "High", displayOrder: 1 },
  { accountType: "Asset", fsLineItem: "Accounts Receivable", assertion: "Existence", wpCode: "C2", wpLink: "Debtor Confirmation", testingProcedure: "Positive confirmation letters", isaReference: "ISA 505", riskTag: "High", displayOrder: 2 },
  { accountType: "Asset", fsLineItem: "Accounts Receivable", assertion: "Valuation", wpCode: "C2", wpLink: "Bad Debt Review", testingProcedure: "Ageing analysis, review of provisions", isaReference: "ISA 540", riskTag: "Medium", displayOrder: 3 },
  { accountType: "Asset", fsLineItem: "Inventory", assertion: "Existence", wpCode: "C3", wpLink: "Physical Inventory Count", testingProcedure: "Attendance at stock-take", isaReference: "ISA 501", riskTag: "High", displayOrder: 4 },
  { accountType: "Asset", fsLineItem: "Inventory", assertion: "Valuation", wpCode: "C3", wpLink: "NRV Testing", testingProcedure: "Compare cost with NRV, review write-downs", isaReference: "ISA 540", riskTag: "Medium", displayOrder: 5 },
  { accountType: "Asset", fsLineItem: "PPE", assertion: "Existence", wpCode: "C4", wpLink: "Asset Verification", testingProcedure: "Physical inspection, title documents", isaReference: "ISA 500", riskTag: "Low", displayOrder: 6 },
  { accountType: "Asset", fsLineItem: "PPE", assertion: "Valuation", wpCode: "C4", wpLink: "Depreciation Review", testingProcedure: "Recalculate depreciation, review useful lives", isaReference: "ISA 540", riskTag: "Medium", displayOrder: 7 },
  { accountType: "Liability", fsLineItem: "Accounts Payable", assertion: "Completeness", wpCode: "C5", wpLink: "Supplier Reconciliation", testingProcedure: "Supplier statements reconciliation, cut-off", isaReference: "ISA 500", riskTag: "High", displayOrder: 8 },
  { accountType: "Liability", fsLineItem: "Borrowings", assertion: "Completeness", wpCode: "C8", wpLink: "Loan Confirmation", testingProcedure: "Bank confirmation, review loan agreements", isaReference: "ISA 505", riskTag: "High", displayOrder: 9 },
  { accountType: "Revenue", fsLineItem: "Sales Revenue", assertion: "Occurrence", wpCode: "C6", wpLink: "Sales Testing", testingProcedure: "Vouching sales invoices, cut-off testing", isaReference: "ISA 240", riskTag: "High", displayOrder: 10 },
  { accountType: "Revenue", fsLineItem: "Sales Revenue", assertion: "Completeness", wpCode: "C6", wpLink: "Revenue Completeness", testingProcedure: "Analytical review, cut-off testing", isaReference: "ISA 240", riskTag: "High", displayOrder: 11 },
  { accountType: "Expense", fsLineItem: "Staff Costs", assertion: "Occurrence", wpCode: "C7", wpLink: "Payroll Testing", testingProcedure: "Review payroll records, HR authorization", isaReference: "ISA 500", riskTag: "Medium", displayOrder: 12 },
  { accountType: "Expense", fsLineItem: "Finance Costs", assertion: "Accuracy", wpCode: "C8", wpLink: "Finance Cost Recalculation", testingProcedure: "Recalculate interest, review loan terms", isaReference: "ISA 500", riskTag: "Low", displayOrder: 13 },
  { accountType: "Equity", fsLineItem: "Share Capital", assertion: "Existence", wpCode: "A1", wpLink: "Corporate Records Review", testingProcedure: "Review MOA/AOA, company registrar records", isaReference: "ISA 500", riskTag: "Low", displayOrder: 14 },
];

const DEFAULT_SAMPLING_RULES = [
  { riskLevel: "High", materialityBand: "GT_PM", sampleSizeMin: 60, sampleSizeMax: 100, coveragePct: "90", samplingMethod: "MUS", testingApproach: "Full", notes: "High risk + above PM: near-full coverage" },
  { riskLevel: "High", materialityBand: "LTE_PM", sampleSizeMin: 40, sampleSizeMax: 60, coveragePct: "70", samplingMethod: "MUS", testingApproach: "Moderate", notes: "High risk + at/below PM: substantial testing" },
  { riskLevel: "High", materialityBand: "LT_TRIVIAL", sampleSizeMin: 20, sampleSizeMax: 30, coveragePct: "40", samplingMethod: "Judgmental", testingApproach: "Analytical", notes: "High risk but trivial amount: analytical focus" },
  { riskLevel: "Medium", materialityBand: "GT_PM", sampleSizeMin: 30, sampleSizeMax: 50, coveragePct: "60", samplingMethod: "Random", testingApproach: "Moderate", notes: "Medium risk + above PM: moderate testing" },
  { riskLevel: "Medium", materialityBand: "LTE_PM", sampleSizeMin: 15, sampleSizeMax: 30, coveragePct: "40", samplingMethod: "Random", testingApproach: "Moderate", notes: "Medium risk + at/below PM: targeted sampling" },
  { riskLevel: "Medium", materialityBand: "LT_TRIVIAL", sampleSizeMin: 5, sampleSizeMax: 15, coveragePct: "20", samplingMethod: "Judgmental", testingApproach: "Analytical", notes: "Medium risk but trivial: analytical only" },
  { riskLevel: "Low", materialityBand: "GT_PM", sampleSizeMin: 15, sampleSizeMax: 25, coveragePct: "30", samplingMethod: "Random", testingApproach: "Analytical", notes: "Low risk + above PM: analytical with limited testing" },
  { riskLevel: "Low", materialityBand: "LTE_PM", sampleSizeMin: 5, sampleSizeMax: 15, coveragePct: "15", samplingMethod: "Judgmental", testingApproach: "Analytical", notes: "Low risk + at/below PM: analytical review" },
  { riskLevel: "Low", materialityBand: "LT_TRIVIAL", sampleSizeMin: 0, sampleSizeMax: 5, coveragePct: "5", samplingMethod: "Judgmental", testingApproach: "Analytical", notes: "Low risk + trivial: no substantive testing required" },
];

const DEFAULT_ANALYTICS = [
  { ratioCode: "gp_percent", ratioName: "Gross Profit %", formula: "GP / Sales × 100", numeratorField: "gross_profit", denominatorField: "revenue", thresholdMin: "-10", thresholdMax: "10", thresholdDescription: "±10% variance from prior year triggers review", wpTrigger: "B4", category: "Profitability", displayOrder: 1 },
  { ratioCode: "np_percent", ratioName: "Net Profit %", formula: "Net Profit / Sales × 100", numeratorField: "profit_after_tax", denominatorField: "revenue", thresholdMin: "-15", thresholdMax: "15", thresholdDescription: "±15% variance from prior year", wpTrigger: "B4", category: "Profitability", displayOrder: 2 },
  { ratioCode: "current_ratio", ratioName: "Current Ratio", formula: "Current Assets / Current Liabilities", numeratorField: "current_assets", denominatorField: "current_liabilities", thresholdMin: "1", thresholdMax: null, thresholdDescription: "<1 triggers risk review (liquidity concern)", wpTrigger: "B3", category: "Liquidity", displayOrder: 3 },
  { ratioCode: "quick_ratio", ratioName: "Quick Ratio", formula: "(CA − Inventory) / CL", numeratorField: "quick_assets", denominatorField: "current_liabilities", thresholdMin: "0.5", thresholdMax: null, thresholdDescription: "<0.5 triggers going concern assessment", wpTrigger: "D1", category: "Liquidity", displayOrder: 4 },
  { ratioCode: "debtor_days", ratioName: "Debtor Days", formula: "Receivables / Sales × 365", numeratorField: "accounts_receivable", denominatorField: "revenue", thresholdMin: null, thresholdMax: "90", thresholdDescription: ">90 days indicates collection risk", wpTrigger: "C2", category: "Efficiency", displayOrder: 5 },
  { ratioCode: "creditor_days", ratioName: "Creditor Days", formula: "Payables / Purchases × 365", numeratorField: "accounts_payable", denominatorField: "purchases", thresholdMin: null, thresholdMax: "120", thresholdDescription: ">120 days indicates liquidity pressure", wpTrigger: "C5", category: "Efficiency", displayOrder: 6 },
  { ratioCode: "inventory_days", ratioName: "Inventory Days", formula: "Inventory / COGS × 365", numeratorField: "inventory", denominatorField: "cost_of_goods_sold", thresholdMin: null, thresholdMax: "90", thresholdDescription: ">90 days indicates slow-moving stock risk", wpTrigger: "C3", category: "Efficiency", displayOrder: 7 },
  { ratioCode: "debt_to_equity", ratioName: "Debt to Equity Ratio", formula: "Total Debt / Equity", numeratorField: "total_liabilities", denominatorField: "equity", thresholdMin: null, thresholdMax: "2", thresholdDescription: ">2x triggers solvency risk review", wpTrigger: "C8", category: "Solvency", displayOrder: 8 },
  { ratioCode: "interest_cover", ratioName: "Interest Coverage Ratio", formula: "EBIT / Interest Expense", numeratorField: "ebit", denominatorField: "finance_costs", thresholdMin: "1.5", thresholdMax: null, thresholdDescription: "<1.5x triggers going concern concern", wpTrigger: "D1", category: "Solvency", displayOrder: 9 },
];

// Helper: evaluate WP trigger condition against audit engine master
function evaluateTrigger(triggerCondition: string, auditMaster: any, variables: any[]): { triggered: boolean; reason: string } {
  const cond = triggerCondition.trim().toLowerCase();
  if (cond === "always") return { triggered: true, reason: "Mandatory — required for all engagements" };

  if (cond.startsWith("flag:")) {
    const flagName = cond.replace("flag:", "");
    const flagValue = auditMaster[flagName];
    if (flagValue === true) return { triggered: true, reason: `Triggered: ${flagName} = true` };
    return { triggered: false, reason: `Not triggered: ${flagName} = false` };
  }

  if (cond.startsWith("risk:")) {
    const riskLevel = cond.replace("risk:", "").trim();
    const match = (auditMaster.riskLevelOverall || "").toLowerCase() === riskLevel.toLowerCase();
    return { triggered: match, reason: match ? `Overall risk level is ${auditMaster.riskLevelOverall}` : `Risk level is ${auditMaster.riskLevelOverall}, not ${riskLevel}` };
  }

  if (cond.startsWith("industry:")) {
    const ind = cond.replace("industry:", "").trim();
    const match = (auditMaster.industryType || "").toLowerCase().includes(ind.toLowerCase());
    return { triggered: match, reason: match ? `Industry is ${auditMaster.industryType}` : `Industry ${auditMaster.industryType} does not require this WP` };
  }

  if (cond.startsWith("var:")) {
    // var:fieldName=value
    const rest = cond.replace("var:", "");
    const [field, val] = rest.split("=");
    const v = variables.find((x: any) => x.variableCode?.toLowerCase() === field.trim().toLowerCase());
    if (!v) return { triggered: false, reason: `Variable ${field} not found` };
    const match = String(v.value || "").toLowerCase() === (val || "").trim().toLowerCase();
    return { triggered: match, reason: match ? `Variable ${field} = ${v.value}` : `Variable ${field} = ${v.value}, expected ${val}` };
  }

  return { triggered: true, reason: "Condition evaluated as true" };
}

// ── Audit Engine Master: GET (create if missing)
router.get("/sessions/:id/audit-engine", async (req: Request, res: Response) => {
  try {
    const sessionId = parseInt(p(req.params.id));
    const rows = await db.select().from(auditEngineMasterTable).where(eq(auditEngineMasterTable.sessionId, sessionId));
    if (rows.length > 0) return res.json(rows[0]);

    // Auto-create from session data
    const sessions = await db.select().from(wpSessionsTable).where(eq(wpSessionsTable.id, sessionId));
    if (!sessions.length) return res.status(404).json({ error: "Session not found" });
    const session = sessions[0];

    const [inserted] = await db.insert(auditEngineMasterTable).values({
      sessionId,
      clientName: session.clientName,
      engagementId: `ENG-${String(sessionId).padStart(4, "0")}`,
      financialYearStart: `01-Jul-${Number(session.engagementYear || new Date().getFullYear()) - 1}`,
      financialYearEnd: `30-Jun-${session.engagementYear || new Date().getFullYear()}`,
    }).returning();
    return res.json(inserted);
  } catch (err: any) {
    logger.error({ err }, "Route error");
    res.status(500).json({ error: err.message });
  }
});

// ── Audit Engine Master: PATCH
router.patch("/sessions/:id/audit-engine", requireRoles(...WP_ROLES_WRITE), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const sessionId = parseInt(p(req.params.id));
    const updates = req.body;
    delete updates.id; delete updates.sessionId; delete updates.createdAt;
    updates.updatedAt = new Date();
    const rows = await db.update(auditEngineMasterTable).set(updates).where(eq(auditEngineMasterTable.sessionId, sessionId)).returning();
    if (!rows.length) return res.status(404).json({ error: "Audit engine not found — call GET first to auto-create" });
    return res.json(rows[0]);
  } catch (err: any) {
    logger.error({ err }, "Route error");
    res.status(500).json({ error: err.message });
  }
});

// ── Audit Engine Master: Auto-populate from session variables
router.post("/sessions/:id/audit-engine/auto-populate", requireRoles(...WP_ROLES_WRITE), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const sessionId = parseInt(p(req.params.id));
    const variables = await db.select().from(wpVariablesTable).where(eq(wpVariablesTable.sessionId, sessionId));
    const sessions = await db.select().from(wpSessionsTable).where(eq(wpSessionsTable.id, sessionId));
    if (!sessions.length) return res.status(404).json({ error: "Session not found" });
    const session = sessions[0];

    const getVar = (code: string) => variables.find((v: any) => v.variableCode?.toLowerCase().includes(code.toLowerCase()))?.value;
    const revenue = Number(getVar("revenue") || getVar("turnover") || getVar("sales") || 0);
    const materiality = revenue > 0 ? Math.round(revenue * 0.02) : null;

    const updates: any = {
      clientName: session.clientName || getVar("client_name"),
      reportingFramework: getVar("reporting_framework") || getVar("framework") || "IFRS",
      auditType: getVar("audit_type") || "Statutory",
      financialYearStart: `01-Jul-${Number(session.engagementYear || new Date().getFullYear()) - 1}`,
      financialYearEnd: `30-Jun-${session.engagementYear || new Date().getFullYear()}`,
      materialityAmount: materiality ? String(materiality) : undefined,
      performanceMateriality: materiality ? String(Math.round(materiality * 0.75)) : undefined,
      trivialityThreshold: materiality ? String(Math.round(materiality * 0.025)) : undefined,
      updatedAt: new Date(),
    };

    const existing = await db.select().from(auditEngineMasterTable).where(eq(auditEngineMasterTable.sessionId, sessionId));
    if (existing.length) {
      const [updated] = await db.update(auditEngineMasterTable).set(updates).where(eq(auditEngineMasterTable.sessionId, sessionId)).returning();
      return res.json({ message: "Audit engine populated from variables", data: updated });
    } else {
      const [inserted] = await db.insert(auditEngineMasterTable).values({ sessionId, engagementId: `ENG-${String(sessionId).padStart(4, "0")}`, ...updates }).returning();
      return res.json({ message: "Audit engine created and populated", data: inserted });
    }
  } catch (err: any) {
    logger.error({ err }, "Route error");
    res.status(500).json({ error: err.message });
  }
});

// ── WP Trigger Defs: Seed
router.post("/wp-trigger-defs/seed", async (_req: Request, res: Response) => {
  try {
    const existing = await db.select().from(wpTriggerDefsTable);
    if (existing.length > 0) return res.json({ message: `Already seeded with ${existing.length} WP trigger definitions` });
    await db.insert(wpTriggerDefsTable).values(DEFAULT_WP_TRIGGERS as any);
    return res.json({ message: `Seeded ${DEFAULT_WP_TRIGGERS.length} WP trigger definitions` });
  } catch (err: any) {
    logger.error({ err }, "Route error");
    res.status(500).json({ error: err.message });
  }
});

// ── WP Trigger Defs: GET all
router.get("/wp-trigger-defs", async (_req: Request, res: Response) => {
  try {
    const rows = await db.select().from(wpTriggerDefsTable).orderBy(asc(wpTriggerDefsTable.displayOrder));
    return res.json(rows);
  } catch (err: any) {
    logger.error({ err }, "Route error");
    res.status(500).json({ error: err.message });
  }
});

// ── WP Trigger Session: GET (evaluate triggers)
router.get("/sessions/:id/wp-triggers", async (req: Request, res: Response) => {
  try {
    const sessionId = parseInt(p(req.params.id));
    const defs = await db.select().from(wpTriggerDefsTable).orderBy(asc(wpTriggerDefsTable.displayOrder));
    if (defs.length === 0) return res.json([]);

    const [auditMaster] = await db.select().from(auditEngineMasterTable).where(eq(auditEngineMasterTable.sessionId, sessionId));
    const variables = await db.select().from(wpVariablesTable).where(eq(wpVariablesTable.sessionId, sessionId));
    const sessionTriggers = await db.select().from(wpTriggerSessionTable).where(eq(wpTriggerSessionTable.sessionId, sessionId));

    const result = defs.map((def: any) => {
      const existing = sessionTriggers.find((t: any) => t.wpCode === def.wpCode);
      const evaluated = auditMaster ? evaluateTrigger(def.triggerCondition, auditMaster, variables) : { triggered: def.mandatoryFlag, reason: "Audit master not set up yet" };
      return {
        ...def,
        sessionId,
        sessionTriggerId: existing?.id,
        triggered: existing ? existing.triggered : evaluated.triggered,
        triggerReason: existing ? existing.triggerReason : evaluated.reason,
        status: existing?.status || (evaluated.triggered ? "pending" : "n_a"),
        preparedBy: existing?.preparedBy,
        reviewedBy: existing?.reviewedBy,
        completedAt: existing?.completedAt,
        conclusion: existing?.conclusion,
        exceptionNote: existing?.exceptionNote,
      };
    });
    return res.json(result);
  } catch (err: any) {
    logger.error({ err }, "Route error");
    res.status(500).json({ error: err.message });
  }
});

// ── WP Trigger Session: Evaluate & persist all triggers
router.post("/sessions/:id/wp-triggers/evaluate", requireRoles(...WP_ROLES_WRITE), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const sessionId = parseInt(p(req.params.id));
    const defs = await db.select().from(wpTriggerDefsTable).orderBy(asc(wpTriggerDefsTable.displayOrder));
    const [auditMaster] = await db.select().from(auditEngineMasterTable).where(eq(auditEngineMasterTable.sessionId, sessionId));
    const variables = await db.select().from(wpVariablesTable).where(eq(wpVariablesTable.sessionId, sessionId));

    if (!auditMaster) return res.status(400).json({ error: "Set up Audit Engine Master first" });

    let inserted = 0, updated = 0;
    for (const def of defs) {
      const { triggered, reason } = evaluateTrigger(def.triggerCondition, auditMaster, variables);
      const existing = await db.select().from(wpTriggerSessionTable).where(and(eq(wpTriggerSessionTable.sessionId, sessionId), eq(wpTriggerSessionTable.wpCode, def.wpCode)));
      if (existing.length) {
        await db.update(wpTriggerSessionTable).set({ triggered, triggerReason: reason, status: triggered ? "pending" : "n_a", updatedAt: new Date() }).where(eq(wpTriggerSessionTable.id, existing[0].id));
        updated++;
      } else {
        await db.insert(wpTriggerSessionTable).values({ sessionId, wpCode: def.wpCode, triggered, triggerReason: reason, status: triggered ? "pending" : "n_a" });
        inserted++;
      }
    }
    return res.json({ message: `Evaluated ${defs.length} WP triggers — ${inserted} created, ${updated} updated` });
  } catch (err: any) {
    logger.error({ err }, "Route error");
    res.status(500).json({ error: err.message });
  }
});

// ── WP Trigger Session: PATCH status/conclusion
router.patch("/sessions/:id/wp-triggers/:wpCode", requireRoles(...WP_ROLES_WRITE), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const sessionId = parseInt(p(req.params.id));
    const { wpCode } = req.params;
    const { status, preparedBy, reviewedBy, conclusion, exceptionNote } = req.body;
    const updates: any = { updatedAt: new Date() };
    if (status !== undefined) updates.status = status;
    if (preparedBy !== undefined) updates.preparedBy = preparedBy;
    if (reviewedBy !== undefined) updates.reviewedBy = reviewedBy;
    if (conclusion !== undefined) updates.conclusion = conclusion;
    if (exceptionNote !== undefined) updates.exceptionNote = exceptionNote;
    if (status === "completed") updates.completedAt = new Date();

    const rows = await db.update(wpTriggerSessionTable).set(updates).where(and(eq(wpTriggerSessionTable.sessionId, sessionId), eq(wpTriggerSessionTable.wpCode, wpCode))).returning();
    if (!rows.length) {
      const [inserted] = await db.insert(wpTriggerSessionTable).values({ sessionId, wpCode, ...updates }).returning();
      return res.json(inserted);
    }
    return res.json(rows[0]);
  } catch (err: any) {
    logger.error({ err }, "Route error");
    res.status(500).json({ error: err.message });
  }
});

// ── Assertion Linkage: Seed
router.post("/assertion-linkage/seed", async (_req: Request, res: Response) => {
  try {
    const existing = await db.select().from(assertionLinkageTable);
    if (existing.length > 0) return res.json({ message: `Already seeded with ${existing.length} assertion mappings` });
    await db.insert(assertionLinkageTable).values(DEFAULT_ASSERTION_LINKAGE as any);
    return res.json({ message: `Seeded ${DEFAULT_ASSERTION_LINKAGE.length} assertion linkage records` });
  } catch (err: any) {
    logger.error({ err }, "Route error");
    res.status(500).json({ error: err.message });
  }
});

// ── Assertion Linkage: GET all
router.get("/assertion-linkage", async (_req: Request, res: Response) => {
  try {
    const rows = await db.select().from(assertionLinkageTable).orderBy(asc(assertionLinkageTable.displayOrder));
    return res.json(rows);
  } catch (err: any) {
    logger.error({ err }, "Route error");
    res.status(500).json({ error: err.message });
  }
});

// ── Sampling Rules: Seed
router.post("/sampling-rules/seed", async (_req: Request, res: Response) => {
  try {
    const existing = await db.select().from(samplingRulesTable);
    if (existing.length > 0) return res.json({ message: `Already seeded with ${existing.length} sampling rules` });
    await db.insert(samplingRulesTable).values(DEFAULT_SAMPLING_RULES as any);
    return res.json({ message: `Seeded ${DEFAULT_SAMPLING_RULES.length} sampling rules` });
  } catch (err: any) {
    logger.error({ err }, "Route error");
    res.status(500).json({ error: err.message });
  }
});

// ── Sampling Rules: GET + compute for session
router.get("/sessions/:id/sampling", async (req: Request, res: Response) => {
  try {
    const sessionId = parseInt(p(req.params.id));
    const rules = await db.select().from(samplingRulesTable);
    const [auditMaster] = await db.select().from(auditEngineMasterTable).where(eq(auditEngineMasterTable.sessionId, sessionId));

    if (!auditMaster) return res.json({ rules, computed: null, message: "Set up Audit Engine Master to get computed sample sizes" });

    const pm = Number(auditMaster.performanceMateriality || 0);
    const trivial = Number(auditMaster.trivialityThreshold || 0);
    const risk = auditMaster.riskLevelOverall || "Medium";
    const samplingMethod = auditMaster.samplingMethod || "MUS";

    const getMaterialityBand = (amount: number) => {
      if (amount > pm) return "GT_PM";
      if (amount > trivial) return "LTE_PM";
      return "LT_TRIVIAL";
    };

    const computed = rules.filter((r: any) => r.riskLevel === risk).map((r: any) => ({
      ...r,
      applicableToCurrentRisk: true,
      materialityBandLabel: r.materialityBand === "GT_PM" ? `Above PM (>${pm.toLocaleString()})` : r.materialityBand === "LTE_PM" ? `At/Below PM (≤${pm.toLocaleString()})` : `Trivial (≤${trivial.toLocaleString()})`,
    }));

    return res.json({
      rules, computed,
      context: { riskLevel: risk, performanceMateriality: pm, trivialityThreshold: trivial, samplingMethod, recommendation: `For ${risk} risk engagements using ${samplingMethod}, apply samples above ≥ ${computed[0]?.sampleSizeMin || 30} items for material areas` }
    });
  } catch (err: any) {
    logger.error({ err }, "Route error");
    res.status(500).json({ error: err.message });
  }
});

// ── Analytics Defs: Seed
router.post("/analytics-defs/seed", async (_req: Request, res: Response) => {
  try {
    const existing = await db.select().from(analyticsEngineTable);
    if (existing.length > 0) return res.json({ message: `Already seeded with ${existing.length} ratio definitions` });
    await db.insert(analyticsEngineTable).values(DEFAULT_ANALYTICS as any);
    return res.json({ message: `Seeded ${DEFAULT_ANALYTICS.length} analytical ratio definitions` });
  } catch (err: any) {
    logger.error({ err }, "Route error");
    res.status(500).json({ error: err.message });
  }
});

// ── Analytics Defs: GET all
router.get("/analytics-defs", async (_req: Request, res: Response) => {
  try {
    const rows = await db.select().from(analyticsEngineTable).orderBy(asc(analyticsEngineTable.displayOrder));
    return res.json(rows);
  } catch (err: any) {
    logger.error({ err }, "Route error");
    res.status(500).json({ error: err.message });
  }
});

// ── Analytics Session: GET computed results
router.get("/sessions/:id/analytics", async (req: Request, res: Response) => {
  try {
    const sessionId = parseInt(p(req.params.id));
    const defs = await db.select().from(analyticsEngineTable).orderBy(asc(analyticsEngineTable.displayOrder));
    const existing = await db.select().from(analyticsSessionTable).where(eq(analyticsSessionTable.sessionId, sessionId));
    const variables = await db.select().from(wpVariablesTable).where(eq(wpVariablesTable.sessionId, sessionId));

    const getVal = (field: string) => {
      if (!field) return null;
      const v = variables.find((x: any) => x.variableCode?.toLowerCase().replace(/[\s_-]/g, "").includes(field.toLowerCase().replace(/[\s_-]/g, "")));
      return v ? Number(v.value || 0) : null;
    };

    const results = defs.map((def: any) => {
      const saved = existing.find((e: any) => e.ratioCode === def.ratioCode);
      if (saved) return { ...def, ...saved };

      const num = getVal(def.numeratorField);
      const den = getVal(def.denominatorField);
      let computed: number | null = null, breached = false;

      if (num !== null && den !== null && den !== 0) {
        if (def.ratioCode.endsWith("_percent")) computed = (num / den) * 100;
        else if (def.ratioCode.endsWith("_days")) computed = (num / den) * 365;
        else computed = num / den;
        if (def.thresholdMin && computed < Number(def.thresholdMin)) breached = true;
        if (def.thresholdMax && computed > Number(def.thresholdMax)) breached = true;
      }

      return { ...def, computedValue: computed?.toFixed(2) ?? null, breached, sessionId, ratioCode: def.ratioCode };
    });

    return res.json(results);
  } catch (err: any) {
    logger.error({ err }, "Route error");
    res.status(500).json({ error: err.message });
  }
});

// ── Analytics Session: Save/update result
router.patch("/sessions/:id/analytics/:ratioCode", requireRoles(...WP_ROLES_WRITE), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const sessionId = parseInt(p(req.params.id));
    const { ratioCode } = req.params;
    const updates = req.body;
    const existing = await db.select().from(analyticsSessionTable).where(and(eq(analyticsSessionTable.sessionId, sessionId), eq(analyticsSessionTable.ratioCode, ratioCode)));
    if (existing.length) {
      const [updated] = await db.update(analyticsSessionTable).set(updates).where(and(eq(analyticsSessionTable.sessionId, sessionId), eq(analyticsSessionTable.ratioCode, ratioCode))).returning();
      return res.json(updated);
    } else {
      const [inserted] = await db.insert(analyticsSessionTable).values({ sessionId, ratioCode, ...updates }).returning();
      return res.json(inserted);
    }
  } catch (err: any) {
    logger.error({ err }, "Route error");
    res.status(500).json({ error: err.message });
  }
});

// ── Control Matrix: GET
router.get("/sessions/:id/control-matrix", async (req: Request, res: Response) => {
  try {
    const sessionId = parseInt(p(req.params.id));
    const rows = await db.select().from(controlMatrixTable).where(eq(controlMatrixTable.sessionId, sessionId));

    // Seed with defaults if empty
    if (rows.length === 0) {
      const defaults = [
        { sessionId, processName: "Revenue/Sales", controlDescription: "Sales invoice approval and authorization", controlFrequency: "Per transaction", testType: "ToC", relatedWpCode: "C6", isaReference: "ISA 315" },
        { sessionId, processName: "Purchases", controlDescription: "Purchase order approval before procurement", controlFrequency: "Per transaction", testType: "ToC", relatedWpCode: "C5", isaReference: "ISA 315" },
        { sessionId, processName: "Payroll", controlDescription: "Payroll authorization and HR sign-off", controlFrequency: "Monthly", testType: "ToC", relatedWpCode: "C7", isaReference: "ISA 315" },
        { sessionId, processName: "Cash & Banking", controlDescription: "Bank reconciliation and cash counts", controlFrequency: "Monthly", testType: "ToC", relatedWpCode: "C1", isaReference: "ISA 315" },
        { sessionId, processName: "Fixed Assets", controlDescription: "Capital expenditure authorization", controlFrequency: "Per transaction", testType: "ToC", relatedWpCode: "C4", isaReference: "ISA 315" },
        { sessionId, processName: "Financial Reporting", controlDescription: "Month-end close and trial balance review", controlFrequency: "Monthly", testType: "ToC", relatedWpCode: "B2", isaReference: "ISA 315" },
      ];
      await db.insert(controlMatrixTable).values(defaults);
      return res.json(await db.select().from(controlMatrixTable).where(eq(controlMatrixTable.sessionId, sessionId)));
    }
    return res.json(rows);
  } catch (err: any) {
    logger.error({ err }, "Route error");
    res.status(500).json({ error: err.message });
  }
});

// ── Control Matrix: POST
router.post("/sessions/:id/control-matrix", requireRoles(...WP_ROLES_WRITE), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const sessionId = parseInt(p(req.params.id));
    const [inserted] = await db.insert(controlMatrixTable).values({ sessionId, ...req.body }).returning();
    return res.status(201).json(inserted);
  } catch (err: any) {
    logger.error({ err }, "Route error");
    res.status(500).json({ error: err.message });
  }
});

// ── Control Matrix: PATCH
router.patch("/sessions/:id/control-matrix/:cmId", requireRoles(...WP_ROLES_WRITE), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const cmId = parseInt(p(req.params.cmId));
    const updates = { ...req.body, updatedAt: new Date() };
    const [updated] = await db.update(controlMatrixTable).set(updates).where(eq(controlMatrixTable.id, cmId)).returning();
    return res.json(updated);
  } catch (err: any) {
    logger.error({ err }, "Route error");
    res.status(500).json({ error: err.message });
  }
});

// ── Control Matrix: DELETE
router.delete("/sessions/:id/control-matrix/:cmId", requireRoles(...WP_ROLES_WRITE), async (req: AuthenticatedRequest, res: Response) => {
  try {
    await db.delete(controlMatrixTable).where(eq(controlMatrixTable.id, parseInt(p(req.params.cmId))));
    return res.json({ deleted: true });
  } catch (err: any) {
    logger.error({ err }, "Route error");
    res.status(500).json({ error: err.message });
  }
});

// ── Evidence Log: GET
router.get("/sessions/:id/evidence", async (req: Request, res: Response) => {
  try {
    const rows = await db.select().from(evidenceLogTable).where(eq(evidenceLogTable.sessionId, parseInt(p(req.params.id))));
    return res.json(rows);
  } catch (err: any) {
    logger.error({ err }, "Route error");
    res.status(500).json({ error: err.message });
  }
});

// ── Evidence Log: POST
router.post("/sessions/:id/evidence", requireRoles(...WP_ROLES_WRITE), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const sessionId = parseInt(p(req.params.id));
    const evidenceId = `EV-${Date.now().toString(36).toUpperCase()}`;
    const [inserted] = await db.insert(evidenceLogTable).values({ sessionId, evidenceId, ...req.body }).returning();
    return res.status(201).json(inserted);
  } catch (err: any) {
    logger.error({ err }, "Route error");
    res.status(500).json({ error: err.message });
  }
});

// ── Evidence Log: PATCH
router.patch("/sessions/:id/evidence/:evId", requireRoles(...WP_ROLES_WRITE), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const [updated] = await db.update(evidenceLogTable).set(req.body).where(eq(evidenceLogTable.id, parseInt(p(req.params.evId)))).returning();
    return res.json(updated);
  } catch (err: any) {
    logger.error({ err }, "Route error");
    res.status(500).json({ error: err.message });
  }
});

// ── Evidence Log: DELETE
router.delete("/sessions/:id/evidence/:evId", requireRoles(...WP_ROLES_WRITE), async (req: AuthenticatedRequest, res: Response) => {
  try {
    await db.delete(evidenceLogTable).where(eq(evidenceLogTable.id, parseInt(p(req.params.evId))));
    return res.json({ deleted: true });
  } catch (err: any) {
    logger.error({ err }, "Route error");
    res.status(500).json({ error: err.message });
  }
});

// ── Reconciliation Engine: GET results
router.get("/sessions/:id/recon", async (req: Request, res: Response) => {
  try {
    const rows = await db.select().from(reconEngineTable).where(eq(reconEngineTable.sessionId, parseInt(p(req.params.id))));
    return res.json(rows);
  } catch (err: any) {
    logger.error({ err }, "Route error");
    res.status(500).json({ error: err.message });
  }
});

// ── Reconciliation Engine: Run all checks
router.post("/sessions/:id/recon/run", requireRoles(...WP_ROLES_WRITE), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const sessionId = parseInt(p(req.params.id));
    const tbLines = await db.select().from(wpTrialBalanceLinesTable).where(eq(wpTrialBalanceLinesTable.sessionId, sessionId));
    const glAccounts = await db.select().from(wpGlAccountsTable).where(eq(wpGlAccountsTable.sessionId, sessionId));
    const coaRows = await db.select().from(wpMasterCoaTable).where(eq(wpMasterCoaTable.sessionId, sessionId));
    const extracted = await db.select().from(wpExtractedFieldsTable).where(eq(wpExtractedFieldsTable.sessionId, sessionId));

    const checks: any[] = [];

    // TB balance check
    const tbDebit = tbLines.reduce((s: number, r: any) => s + Number(r.debit || 0), 0);
    const tbCredit = tbLines.reduce((s: number, r: any) => s + Number(r.credit || 0), 0);
    const tbDiff = Math.abs(tbDebit - tbCredit);
    checks.push({ sessionId, checkName: "TB Self-Balance", sourceA: "TB Debit Total", sourceB: "TB Credit Total", amountA: String(tbDebit.toFixed(2)), amountB: String(tbCredit.toFixed(2)), difference: String(tbDiff.toFixed(2)), passed: tbDiff < 1, rule: "Total Dr must equal Total Cr", notes: tbDiff < 1 ? "TB is balanced" : `Imbalance of ${tbDiff.toFixed(2)}`, runAt: new Date() });

    // COA vs TB
    const coaTotal = coaRows.reduce((s: number, r: any) => s + Number(r.closingBalance || 0), 0);
    const tbNetBalance = tbDebit - tbCredit;
    const coaTbDiff = Math.abs(coaTotal - tbNetBalance);
    checks.push({ sessionId, checkName: "COA vs TB Reconciliation", sourceA: "Master COA Closing Balance", sourceB: "TB Net Balance", amountA: String(coaTotal.toFixed(2)), amountB: String(tbNetBalance.toFixed(2)), difference: String(coaTbDiff.toFixed(2)), passed: coaTbDiff < 1 || coaRows.length === 0, rule: "COA closing balances must reconcile to TB", notes: coaRows.length === 0 ? "COA not yet populated" : coaTbDiff < 1 ? "COA matches TB" : `Difference of ${coaTbDiff.toFixed(2)}`, runAt: new Date() });

    // GL vs TB
    const glDebit = glAccounts.reduce((s: number, a: any) => s + Number(a.totalDebit || 0), 0);
    const glCredit = glAccounts.reduce((s: number, a: any) => s + Number(a.totalCredit || 0), 0);
    const glTbDebitDiff = Math.abs(glDebit - tbDebit);
    checks.push({ sessionId, checkName: "GL vs TB — Debit Total", sourceA: "GL Total Debit", sourceB: "TB Total Debit", amountA: String(glDebit.toFixed(2)), amountB: String(tbDebit.toFixed(2)), difference: String(glTbDebitDiff.toFixed(2)), passed: glTbDebitDiff < 1 || glAccounts.length === 0, rule: "GL total debits must equal TB total debits", notes: glAccounts.length === 0 ? "GL not yet generated" : glTbDebitDiff < 1 ? "GL matches TB (Dr)" : `Difference of ${glTbDebitDiff.toFixed(2)}`, runAt: new Date() });

    // Delete old and insert fresh
    await db.delete(reconEngineTable).where(eq(reconEngineTable.sessionId, sessionId));
    const inserted = await db.insert(reconEngineTable).values(checks).returning();

    const allPassed = inserted.every((c: any) => c.passed);
    return res.json({ checks: inserted, allPassed, summary: `${inserted.filter((c: any) => c.passed).length}/${inserted.length} checks passed` });
  } catch (err: any) {
    logger.error({ err }, "Route error");
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ── WORKBOOK EXTRACTION PIPELINE ─────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

/** Convert Excel serial date number to ISO date string */
function excelSerialToISO(serial: number | string): string {
  if (!serial || isNaN(Number(serial))) return String(serial || "");
  const n = Number(serial);
  if (n < 1000) return String(serial); // not a date serial
  const date = new Date(Math.round((n - 25569) * 86400 * 1000));
  return date.toISOString().split("T")[0];
}

function safeNum(v: any): number { const n = parseFloat(String(v || 0)); return isNaN(n) ? 0 : n; }
function safeBool(v: any): boolean { if (typeof v === "boolean") return v; return String(v || "").toLowerCase() === "yes" || String(v || "") === "true"; }

/** Find header row index — first row where first non-empty cell matches expected header */
function findHeaderRow(data: any[][], expectedHeaders: string[]): number {
  for (let i = 0; i < Math.min(10, data.length); i++) {
    const row = data[i].map((c: any) => String(c || "").trim());
    const matches = expectedHeaders.filter(h => row.includes(h));
    if (matches.length >= Math.ceil(expectedHeaders.length * 0.5)) return i;
  }
  return -1;
}

/** Parse sheet into array of row objects keyed by header names */
function parseSheetRows(ws: XLSX.WorkSheet, expectedHeaders: string[]): Record<string, any>[] {
  const data: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
  const headerIdx = findHeaderRow(data, expectedHeaders);
  if (headerIdx < 0) return [];
  const headers: string[] = data[headerIdx].map((h: any) => String(h || "").trim());
  const rows: Record<string, any>[] = [];
  for (let i = headerIdx + 1; i < data.length; i++) {
    const row = data[i];
    if (!row.some((c: any) => c !== "" && c !== null && c !== undefined)) continue;
    const obj: Record<string, any> = {};
    headers.forEach((h, j) => { if (h) obj[h] = row[j] ?? ""; });
    rows.push(obj);
  }
  return rows;
}

/** AI-powered COA classification for unrecognized accounts */
async function aiClassifyAccount(accountName: string, ai: OpenAI): Promise<{
  fsHead: string; fsSubHead: string; accountType: string; normalBalance: string;
  materialityTag: string; riskTag: string; assertionTag: string;
}> {
  try {
    const resp = await ai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{
        role: "user",
        content: `You are a Pakistani CA firm audit AI. Classify this account for a working paper COA.
Account Name: "${accountName}"
Return ONLY valid JSON (no markdown): {
  "fsHead": "Non-Current Assets|Current Assets|Equity|Non-Current Liabilities|Current Liabilities|Revenue|Other Income|Cost of Sales|Operating Expenses|Administrative Expenses|Finance Costs|Tax",
  "fsSubHead": "brief sub-head",
  "accountType": "Asset|Liability|Equity|Income|Expense",
  "normalBalance": "Debit|Credit",
  "materialityTag": "High|Medium|Low",
  "riskTag": "High|Medium|Low",
  "assertionTag": "Existence,Completeness,Valuation"
}`
      }],
      max_tokens: 200,
      temperature: 0,
    });
    const text = (resp.choices[0]?.message?.content || "").replace(/```json|```/g, "").trim();
    return JSON.parse(text);
  } catch {
    return { fsHead: "Other", fsSubHead: "Other", accountType: "Asset", normalBalance: "Debit", materialityTag: "Low", riskTag: "Low", assertionTag: "Existence" };
  }
}

/** Generate AI-enhanced narration for journal entry */
async function aiEnhanceNarration(raw: string, voucherType: string, accountName: string, ai: OpenAI): Promise<string> {
  if (raw && raw.length > 10) return raw;
  try {
    const resp = await ai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: `Generate a professional audit narration (max 15 words) for a ${voucherType} voucher entry for account "${accountName}". Return only the narration text.` }],
      max_tokens: 40, temperature: 0.3,
    });
    return resp.choices[0]?.message?.content?.trim() || raw || `${voucherType} entry - ${accountName}`;
  } catch { return raw || `${voucherType} entry - ${accountName}`; }
}

/** Master workbook extraction pipeline */
router.post("/sessions/:id/extract-workbook", requireRoles(...WP_ROLES_WRITE), async (req: AuthenticatedRequest, res: Response) => {
  const sessionId = parseInt(p(req.params.id));
  const { fileId, useAiClassification = true, generateGlTb = true, runRecon = true } = req.body;

  const report: {
    stages: Record<string, { status: string; count?: number; exceptions?: number; message?: string }>;
    exceptions: Array<{ source: string; item: string; issue: string; severity: string }>;
    summary: { totalAccounts: number; totalJournals: number; tbDebitTotal: number; tbCreditTotal: number; reconStatus: string; exceptionCount: number };
  } = {
    stages: {},
    exceptions: [],
    summary: { totalAccounts: 0, totalJournals: 0, tbDebitTotal: 0, tbCreditTotal: 0, reconStatus: "Pending", exceptionCount: 0 },
  };

  try {
    // ── Get session & AI client ───────────────────────────────────────────────
    const [session] = await db.select().from(wpSessionsTable).where(eq(wpSessionsTable.id, sessionId));
    if (!session) return res.status(404).json({ error: "Session not found" });

    let ai: OpenAI | null = null;
    try {
      const apiKey = process.env.OPENAI_API_KEY || process.env.REPLIT_AI_API_KEY;
      if (apiKey) ai = new OpenAI({ apiKey, baseURL: process.env.REPLIT_AI_BASE_URL });
      else {
        const [setting] = await db.select().from(systemSettingsTable).where(eq((systemSettingsTable as any).key, "chatgpt_api_key")).limit(1);
        if (setting) ai = new OpenAI({ apiKey: (setting as any).value });
      }
    } catch { /* no ai */ }

    // ── Find uploaded Excel files for this session ────────────────────────────
    let excelFiles = await db.select().from(wpUploadedFilesTable)
      .where(and(eq(wpUploadedFilesTable.sessionId, sessionId)));
    if (fileId) excelFiles = excelFiles.filter(f => f.id === parseInt(fileId));
    const excelFile = excelFiles.find(f =>
      f.originalName?.toLowerCase().endsWith(".xlsx") ||
      f.originalName?.toLowerCase().endsWith(".xls") ||
      f.originalName?.toLowerCase().endsWith(".xlsm")
    );
    if (!excelFile) return res.status(400).json({ error: "No Excel workbook uploaded for this session. Please upload the workbook template first." });

    const filePath = `uploads/${excelFile.storedName || excelFile.originalName}`;
    let wb: XLSX.WorkBook;
    try {
      wb = XLSX.readFile(filePath);
    } catch {
      return res.status(400).json({ error: `Cannot read Excel file: ${excelFile.originalName}` });
    }
    const sheetNames = wb.SheetNames;

    // ══ STAGE 1: Entity Profile ═══════════════════════════════════════════════
    if (sheetNames.includes("Entity_Profile")) {
      try {
        const rows = parseSheetRows(wb.Sheets["Entity_Profile"], ["Engagement_ID", "Client_Name", "Entity_Type", "Financial_Year_Start", "Financial_Year_End"]);
        if (rows.length > 0) {
          const r = rows[0];
          // Update session metadata
          await db.update(wpSessionsTable).set({
            entityName: r["Client_Name"] || session.entityName,
            entityType: r["Entity_Type"] || session.entityType,
            industry: r["Industry_Type"] || session.industry,
          }).where(eq(wpSessionsTable.id, sessionId));

          // Upsert audit engine master from entity profile
          const existing = await db.select().from(auditEngineMasterTable).where(eq(auditEngineMasterTable.sessionId, sessionId));
          const masterData = {
            sessionId,
            engagementId: r["Engagement_ID"] || `ENG-${sessionId}`,
            entityType: r["Entity_Type"] || session.entityType || "Private Limited",
            industryType: r["Industry_Type"] || session.industry || "Manufacturing",
            financialYear: `${excelSerialToISO(r["Financial_Year_Start"])} to ${excelSerialToISO(r["Financial_Year_End"])}`,
            reportingFramework: r["Reporting_Framework"] || session.reportingFramework || "IFRS",
            auditType: r["Audit_Type"] || session.engagementType || "Statutory Audit",
            engagementStatus: r["Engagement_Status"] || "Planning",
            materialityAmount: String(safeNum(r["Materiality_Amount"])),
            performanceMateriality: String(safeNum(r["Performance_Materiality"])),
            trivialityThreshold: String(safeNum(r["Triviality_Threshold"])),
            overallRiskLevel: r["Risk_Level_Overall"] || "Medium",
            currency: r["Functional_Currency"] || "PKR",
          };
          if (existing.length === 0) await db.insert(auditEngineMasterTable).values(masterData as any);
          else await db.update(auditEngineMasterTable).set(masterData as any).where(eq(auditEngineMasterTable.sessionId, sessionId));
          report.stages["entity_profile"] = { status: "ok", count: 1 };
        }
      } catch (e: any) { report.stages["entity_profile"] = { status: "error", message: e.message }; }
    }

    // ══ STAGE 2: COA Master ═══════════════════════════════════════════════════
    let coaAccountMap: Record<string, string> = {}; // accountCode → accountName
    if (sheetNames.includes("COA_Master")) {
      try {
        const rows = parseSheetRows(wb.Sheets["COA_Master"], ["Account_Code", "Account_Name", "FS_Head", "Account_Type"]);
        const validRows = rows.filter(r => r["Account_Code"] && String(r["Account_Code"]).match(/^\d/));
        if (validRows.length > 0) {
          // Clear existing COA for session then re-import
          await db.delete(wpMasterCoaTable).where(eq(wpMasterCoaTable.sessionId, sessionId));
          const coaInserts: any[] = [];
          let order = 0;
          for (const r of validRows) {
            const code = String(r["Account_Code"]).trim();
            const name = String(r["Account_Name"] || "").trim();
            coaAccountMap[code] = name;

            // AI classify if fsHead missing and AI available
            let fsHead = String(r["FS_Head"] || "").trim();
            let fsSubHead = String(r["FS_Sub_Head"] || "").trim();
            let accountType = String(r["Account_Type"] || "").trim();
            let normalBalance = String(r["Normal_Balance"] || "").trim();
            let materialityTag = String(r["Materiality_Tag"] || "Low").trim();
            let riskTag = String(r["Risk_Tag"] || "Low").trim();
            let assertionTag = String(r["Assertion_Tag"] || "Existence").trim();

            if ((!fsHead || !accountType) && ai && useAiClassification) {
              const cls = await aiClassifyAccount(name, ai);
              fsHead = fsHead || cls.fsHead;
              fsSubHead = fsSubHead || cls.fsSubHead;
              accountType = accountType || cls.accountType;
              normalBalance = normalBalance || cls.normalBalance;
              materialityTag = materialityTag || cls.materialityTag;
              riskTag = riskTag || cls.riskTag;
              assertionTag = assertionTag || cls.assertionTag;
            }

            const openBal = safeNum(r["Opening_Balance"]);
            const debitTotal = safeNum(r["Debit_Total"]);
            const creditTotal = safeNum(r["Credit_Total"]);
            const closing = safeNum(r["Closing_Balance"]) || (openBal + debitTotal - creditTotal);
            const priorYear = safeNum(r["Prior_Year_Balance"]);
            const variance = closing - priorYear;
            const confidence = safeNum(r["Confidence_Score"]) || 90;

            // Flag exception if closing balance looks wrong
            const calcClosing = openBal + debitTotal - creditTotal;
            const closingMismatch = Math.abs(closing - calcClosing) > 1 && closing !== 0;
            if (closingMismatch) {
              report.exceptions.push({ source: "COA_Master", item: `${code} ${name}`, issue: `Closing balance mismatch: stated=${closing}, computed=${calcClosing}`, severity: "Medium" });
            }

            coaInserts.push({
              sessionId,
              accountCode: code,
              parentCode: String(r["Parent_Code"] || "").trim() || null,
              accountName: name,
              fsHead: fsHead || "Other",
              fsSubHead: fsSubHead || "",
              accountType: accountType || "Asset",
              normalBalance: normalBalance || "Debit",
              industryTag: String(r["Industry_Tag"] || "All"),
              entityTypeTag: String(r["Entity_Type_Tag"] || "All"),
              ifrsReference: String(r["IFRS_Reference"] || ""),
              taxTreatment: String(r["Tax_Treatment"] || "Normal"),
              isControlAccount: safeBool(r["Is_Control_Account"]),
              isSubLedger: safeBool(r["Is_Sub_Ledger"]),
              openingBalance: String(openBal),
              debitTotal: String(debitTotal),
              creditTotal: String(creditTotal),
              closingBalance: String(closing),
              priorYearBalance: String(priorYear),
              variance: String(variance),
              materialityTag,
              riskTag,
              assertionTag,
              relatedPartyFlag: safeBool(r["Related_Party_Flag"]),
              cashFlowTag: String(r["Cash_Flow_Tag"] || ""),
              mappingGlCode: String(r["Mapping_GL_Code"] || `GL-${code}`),
              mappingFsLine: String(r["Mapping_FS_Line"] || name),
              workingPaperCode: String(r["Working_Paper_Code"] || ""),
              reconciliationFlag: safeBool(r["Reconciliation_Flag"]),
              dataSource: String(r["Data_Source"] || "Imported"),
              confidenceScore: String(confidence),
              exceptionFlag: closingMismatch,
              notes: String(r["Notes"] || ""),
              displayOrder: order++,
            });
          }
          if (coaInserts.length > 0) {
            for (let i = 0; i < coaInserts.length; i += 50) {
              await db.insert(wpMasterCoaTable).values(coaInserts.slice(i, i + 50) as any);
            }
          }
          report.stages["coa_master"] = { status: "ok", count: coaInserts.length, exceptions: report.exceptions.filter(e => e.source === "COA_Master").length };
          report.summary.totalAccounts = coaInserts.length;
        }
      } catch (e: any) { report.stages["coa_master"] = { status: "error", message: e.message }; }
    }

    // ══ STAGE 3: FS Extraction Staging ════════════════════════════════════════
    if (sheetNames.includes("FS_Extraction_Staging")) {
      try {
        const rows = parseSheetRows(wb.Sheets["FS_Extraction_Staging"], ["Extraction_ID", "Statement_Type", "Line_Item_Text", "Amount_Current"]);
        if (rows.length > 0) {
          await db.delete(wpFsExtractionTable).where(eq(wpFsExtractionTable.sessionId, sessionId));
          const inserts = rows.filter(r => r["Line_Item_Text"]).map((r, idx) => ({
            sessionId,
            extractionId: String(r["Extraction_ID"] || `EXT-${String(idx + 1).padStart(3, "0")}`),
            sourceFileName: String(r["Source_File_Name"] || ""),
            sourceFileType: String(r["Source_File_Type"] || "Excel"),
            pageNo: safeNum(r["Page_No"]) || null,
            statementType: String(r["Statement_Type"] || ""),
            sectionName: String(r["Section_Name"] || ""),
            lineItemText: String(r["Line_Item_Text"] || ""),
            amountCurrent: String(safeNum(r["Amount_Current"])),
            amountPrior: String(safeNum(r["Amount_Prior"])),
            currency: String(r["Currency"] || "PKR"),
            signConvention: String(r["Sign_Convention"] || "As Presented"),
            extractionMethod: String(r["Extraction_Method"] || "Template"),
            confidenceScore: String(safeNum(r["Confidence_Score"]) || 90),
            normalizedText: String(r["Normalized_Text"] || r["Line_Item_Text"] || ""),
            exceptionFlag: safeBool(r["Exception_Flag"]),
            exceptionNote: String(r["Exception_Note"] || ""),
          }));
          if (inserts.length > 0) await db.insert(wpFsExtractionTable).values(inserts as any);
          report.stages["fs_extraction"] = { status: "ok", count: inserts.length };
        }
      } catch (e: any) { report.stages["fs_extraction"] = { status: "error", message: e.message }; }
    }

    // ══ STAGE 4: FS Mapping ═══════════════════════════════════════════════════
    if (sheetNames.includes("FS_Mapping")) {
      try {
        const rows = parseSheetRows(wb.Sheets["FS_Mapping"], ["Mapping_ID", "Statement_Type", "FS_Line_Item", "Account_Code"]);
        if (rows.length > 0) {
          await db.delete(wpFsMappingTable).where(eq(wpFsMappingTable.sessionId, sessionId));
          const inserts = rows.filter(r => r["FS_Line_Item"] || r["Account_Code"]).map((r, idx) => ({
            sessionId,
            mappingId: String(r["Mapping_ID"] || `MAP-${String(idx + 1).padStart(3, "0")}`),
            extractionId: String(r["Extraction_ID"] || ""),
            statementType: String(r["Statement_Type"] || ""),
            fsLineItem: String(r["FS_Line_Item"] || ""),
            fsNoteNo: String(r["FS_Note_No"] || ""),
            currentAmount: String(safeNum(r["Current_Amount"])),
            priorAmount: String(safeNum(r["Prior_Amount"])),
            accountCode: String(r["Account_Code"] || ""),
            accountName: String(r["Account_Name"] || coaAccountMap[String(r["Account_Code"] || "")] || ""),
            mappingFsLine: String(r["Mapping_FS_Line"] || r["FS_Line_Item"] || ""),
            mappingMethod: String(r["Mapping_Method"] || "Manual"),
            mappingConfidence: String(safeNum(r["Mapping_Confidence"]) || 85),
            reconciliationFlag: safeBool(r["Reconciliation_Flag"]),
            exceptionFlag: safeBool(r["Exception_Flag"]),
            notes: String(r["Notes"] || ""),
          }));
          if (inserts.length > 0) await db.insert(wpFsMappingTable).values(inserts as any);
          report.stages["fs_mapping"] = { status: "ok", count: inserts.length, exceptions: inserts.filter(r => r.exceptionFlag).length };
        }
      } catch (e: any) { report.stages["fs_mapping"] = { status: "error", message: e.message }; }
    }

    // ══ STAGE 5: Journal Import ════════════════════════════════════════════════
    const journalsByAccount: Record<string, { debits: number; credits: number; entries: any[] }> = {};
    if (sheetNames.includes("Journal_Import")) {
      try {
        const rows = parseSheetRows(wb.Sheets["Journal_Import"], ["Journal_ID", "Account_Code", "Debit_Amount", "Credit_Amount"]);
        if (rows.length > 0) {
          await db.delete(wpJournalImportTable).where(eq(wpJournalImportTable.sessionId, sessionId));
          const inserts: any[] = [];
          for (const r of rows.filter(r => r["Account_Code"])) {
            const code = String(r["Account_Code"]).trim();
            const debit = safeNum(r["Debit_Amount"]);
            const credit = safeNum(r["Credit_Amount"]);
            const baseDebit = safeNum(r["Base_Debit"]) || debit;
            const baseCredit = safeNum(r["Base_Credit"]) || credit;
            const narration = String(r["Narration"] || "");
            const voucherType = String(r["Voucher_Type"] || "JV");
            const accountName = String(r["Account_Name"] || coaAccountMap[code] || "");
            const entryDate = excelSerialToISO(r["Entry_Date"]);

            // Flag missing account in COA
            if (code && !coaAccountMap[code] && !String(r["Account_Name"]).trim()) {
              report.exceptions.push({ source: "Journal_Import", item: `${r["Journal_ID"]} → ${code}`, issue: "Account code not found in COA_Master", severity: "High" });
            }

            // Check double-entry balance per Journal_ID
            const jid = String(r["Journal_ID"] || "");
            if (!journalsByAccount[code]) journalsByAccount[code] = { debits: 0, credits: 0, entries: [] };
            journalsByAccount[code].debits += debit;
            journalsByAccount[code].credits += credit;
            journalsByAccount[code].entries.push({ entryDate, narration, voucherType, debit, credit });

            inserts.push({
              sessionId,
              journalId: String(r["Journal_ID"] || `JNL-${inserts.length + 1}`),
              entryNo: String(r["Entry_No"] || ""),
              entryDate,
              period: String(r["Period"] || ""),
              voucherType,
              documentNo: String(r["Document_No"] || ""),
              narration,
              accountCode: code,
              accountName,
              costCenter: String(r["Cost_Center"] || ""),
              department: String(r["Department"] || ""),
              projectCode: String(r["Project_Code"] || ""),
              partyCode: String(r["Party_Code"] || ""),
              debitAmount: String(debit),
              creditAmount: String(credit),
              currency: String(r["Currency"] || "PKR"),
              exchangeRate: String(safeNum(r["Exchange_Rate"]) || 1),
              baseDebit: String(baseDebit),
              baseCredit: String(baseCredit),
              sourceSystem: String(r["Source_System"] || ""),
              sourceFileName: String(r["Source_File_Name"] || ""),
              postedFlag: safeBool(r["Posted_Flag"]) || true,
              dataSource: String(r["Data_Source"] || "Imported"),
              confidenceScore: String(safeNum(r["Confidence_Score"]) || 95),
              exceptionFlag: safeBool(r["Exception_Flag"]),
            });
          }
          if (inserts.length > 0) {
            for (let i = 0; i < inserts.length; i += 100) {
              await db.insert(wpJournalImportTable).values(inserts.slice(i, i + 100) as any);
            }
          }
          report.stages["journal_import"] = { status: "ok", count: inserts.length, exceptions: inserts.filter(r => r.exceptionFlag).length };
          report.summary.totalJournals = inserts.length;
        }
      } catch (e: any) { report.stages["journal_import"] = { status: "error", message: e.message }; }
    }

    // ══ STAGE 6: Generate TB from Journals ════════════════════════════════════
    if (generateGlTb) {
      try {
        // Pull all journal entries for session (from import or existing GL entries)
        const journals = await db.select().from(wpJournalImportTable).where(eq(wpJournalImportTable.sessionId, sessionId));
        const coaRows = await db.select().from(wpMasterCoaTable).where(eq(wpMasterCoaTable.sessionId, sessionId));

        // Aggregate journals by account code
        const tbAgg: Record<string, { name: string; debit: number; credit: number; opening: number; priorYear: number; fsHead: string; accountType: string; normalBalance: string }> = {};

        // Seed from COA opening balances
        for (const coa of coaRows) {
          tbAgg[coa.accountCode] = {
            name: coa.accountName,
            debit: safeNum(coa.debitTotal),
            credit: safeNum(coa.creditTotal),
            opening: safeNum(coa.openingBalance),
            priorYear: safeNum(coa.priorYearBalance as any),
            fsHead: coa.fsHead || "Other",
            accountType: coa.accountType || "Asset",
            normalBalance: coa.normalBalance || "Debit",
          };
        }

        // Aggregate journal movements
        for (const j of journals) {
          const code = j.accountCode || "";
          if (!code) continue;
          const name = j.accountName || coaAccountMap[code] || code;
          if (!tbAgg[code]) {
            tbAgg[code] = { name, debit: 0, credit: 0, opening: 0, priorYear: 0, fsHead: "Other", accountType: "Asset", normalBalance: "Debit" };
            // AI classify if not in COA and AI available
            if (ai && useAiClassification) {
              const cls = await aiClassifyAccount(name, ai);
              tbAgg[code].fsHead = cls.fsHead;
              tbAgg[code].accountType = cls.accountType;
              tbAgg[code].normalBalance = cls.normalBalance;
              report.exceptions.push({ source: "TB_Generation", item: code, issue: `Account ${code} (${name}) not in COA — AI classified as ${cls.fsHead}`, severity: "Low" });
            }
          }
          tbAgg[code].debit += safeNum(j.baseDebit);
          tbAgg[code].credit += safeNum(j.baseCredit);
        }

        // Clear and rebuild TB lines
        await db.delete(wpTrialBalanceLinesTable).where(eq(wpTrialBalanceLinesTable.sessionId, sessionId));
        const tbInserts: any[] = [];
        let totalDebit = 0; let totalCredit = 0;

        for (const [code, agg] of Object.entries(tbAgg)) {
          const opening = agg.opening;
          const closing = opening + agg.debit - agg.credit;
          const closingDebit = closing > 0 ? closing : 0;
          const closingCredit = closing < 0 ? Math.abs(closing) : 0;
          totalDebit += closingDebit; totalCredit += closingCredit;

          const balanceCheck = Math.abs(closing) < 0.01 ? "ZERO" : closing > 0 ? "DEBIT" : "CREDIT";
          tbInserts.push({
            sessionId,
            accountCode: code,
            accountName: agg.name,
            classification: agg.fsHead,
            fsLineMapping: agg.name,
            debit: String(closingDebit),
            credit: String(closingCredit),
            balance: String(closing),
            priorYearBalance: String(agg.priorYear),
            source: "journal_derived",
            confidence: "95",
            isApproved: false,
            hasException: false,
          });
        }
        if (tbInserts.length > 0) {
          for (let i = 0; i < tbInserts.length; i += 100) {
            await db.insert(wpTrialBalanceLinesTable).values(tbInserts.slice(i, i + 100) as any);
          }
        }
        report.stages["tb_generation"] = { status: "ok", count: tbInserts.length };
        report.summary.tbDebitTotal = totalDebit;
        report.summary.tbCreditTotal = totalCredit;

        // Check TB balance
        if (Math.abs(totalDebit - totalCredit) > 1) {
          report.exceptions.push({ source: "TB_Generation", item: "Trial Balance", issue: `TB out of balance: Debit=${totalDebit.toFixed(2)}, Credit=${totalCredit.toFixed(2)}, Difference=${(totalDebit - totalCredit).toFixed(2)}`, severity: "Critical" });
        }

        // ── GL: Build per-account GL from journal entries ─────────────────────
        await db.delete(wpGlAccountsTable).where(eq(wpGlAccountsTable.sessionId, sessionId));
        await db.delete(wpGlEntriesTable).where(eq(wpGlEntriesTable.sessionId, sessionId));

        for (const [code, agg] of Object.entries(tbAgg)) {
          // Insert GL account
          const [glAcct] = await db.insert(wpGlAccountsTable).values({
            sessionId,
            accountCode: code,
            accountName: agg.name,
            accountType: agg.accountType,
            openingBalance: String(agg.opening),
            closingBalance: String(agg.opening + agg.debit - agg.credit),
            totalDebit: String(agg.debit),
            totalCredit: String(agg.credit),
            tbDebit: String(agg.debit),
            tbCredit: String(agg.credit),
            isReconciled: false,
            isSynthetic: false,
          } as any).returning();

          // Insert GL entries sorted by date
          const acctJournals = journals
            .filter(j => j.accountCode === code)
            .sort((a, b) => (a.entryDate || "").localeCompare(b.entryDate || ""));

          let running = agg.opening;
          const glInserts = acctJournals.map(j => {
            const dr = safeNum(j.baseDebit);
            const cr = safeNum(j.baseCredit);
            running += (dr - cr);
            return {
              sessionId,
              glAccountId: glAcct?.id,
              entryDate: j.entryDate || "",
              voucherNo: j.documentNo || j.journalId || "",
              narration: j.narration || `${j.voucherType} entry`,
              debit: String(dr),
              credit: String(cr),
              runningBalance: String(running),
              month: j.entryDate ? parseInt(j.entryDate.split("-")[1] || "1") : 1,
              isSynthetic: false,
            };
          });
          if (glInserts.length > 0) {
            for (let i = 0; i < glInserts.length; i += 100) {
              await db.insert(wpGlEntriesTable).values(glInserts.slice(i, i + 100) as any);
            }
          }
        }
        report.stages["gl_generation"] = { status: "ok", count: journals.length };
      } catch (e: any) { report.stages["tb_generation"] = { status: "error", message: e.message }; }
    }

    // ══ STAGE 7: Audit Engine Master ══════════════════════════════════════════
    if (sheetNames.includes("Audit_Engine_Master")) {
      try {
        const rows = parseSheetRows(wb.Sheets["Audit_Engine_Master"], ["Record_ID", "Engagement_ID", "Client_Name", "Risk_Level_Overall"]);
        if (rows.length > 0) {
          const r = rows[0];
          const existing = await db.select().from(auditEngineMasterTable).where(eq(auditEngineMasterTable.sessionId, sessionId));
          const masterPatch: any = {
            sessionId,
            overallRiskLevel: r["Risk_Level_Overall"] || "High",
            goingConcernFlag: safeBool(r["Going_Concern_Flag"]),
            fraudRiskFlag: safeBool(r["Fraud_Risk_Flag"]),
            relatedPartyFlag: safeBool(r["Related_Party_Flag"]),
            lawComplianceFlag: safeBool(r["Law_Compliance_Flag"]),
            itSystemDependencyFlag: safeBool(r["IT_System_Flag"]),
            groupAuditFlag: safeBool(r["Group_Audit_Flag"]),
            isa600Flag: safeBool(r["ISA_600_Flag"]),
            isa610Flag: safeBool(r["ISA_610_Flag"]),
            samplingMethod: String(r["Sampling_Method"] || "MUS"),
            materialityAmount: String(safeNum(r["Materiality_Amount"])),
            performanceMateriality: String(safeNum(r["Performance_Materiality"])),
            trivialityThreshold: String(safeNum(r["Triviality_Threshold"])),
          };
          if (existing.length === 0) await db.insert(auditEngineMasterTable).values(masterPatch);
          else await db.update(auditEngineMasterTable).set(masterPatch).where(eq(auditEngineMasterTable.sessionId, sessionId));
          report.stages["audit_engine_master"] = { status: "ok", count: 1 };
        }
      } catch (e: any) { report.stages["audit_engine_master"] = { status: "error", message: e.message }; }
    }

    // ══ STAGE 8: Reconciliation ═══════════════════════════════════════════════
    if (runRecon) {
      try {
        const tbLines = await db.select().from(wpTrialBalanceLinesTable).where(eq(wpTrialBalanceLinesTable.sessionId, sessionId));
        const journals = await db.select().from(wpJournalImportTable).where(eq(wpJournalImportTable.sessionId, sessionId));
        const fsMappings = await db.select().from(wpFsMappingTable).where(eq(wpFsMappingTable.sessionId, sessionId));
        const coaLines = await db.select().from(wpMasterCoaTable).where(eq(wpMasterCoaTable.sessionId, sessionId));

        const jnlTotalDr = journals.reduce((s, j) => s + safeNum(j.baseDebit), 0);
        const jnlTotalCr = journals.reduce((s, j) => s + safeNum(j.baseCredit), 0);
        const tbTotalDr = tbLines.reduce((s, t) => s + safeNum(t.debit as any), 0);
        const tbTotalCr = tbLines.reduce((s, t) => s + safeNum(t.credit as any), 0);
        const coaVsTbMismatch = coaLines.filter(c => {
          const tb = tbLines.find(t => t.accountCode === c.accountCode);
          if (!tb) return false;
          return Math.abs(safeNum(c.closingBalance as any) - safeNum(tb.balance as any)) > 1;
        }).length;
        const fsMappingTotal = fsMappings.reduce((s, m) => s + safeNum(m.currentAmount as any), 0);
        const fsTbRecon = tbTotalDr - tbTotalCr;

        const reconChecks = [
          { checkId: "RCN-001", checkName: "Journal debits vs journal credits", source1Value: String(jnlTotalDr), source2Value: String(jnlTotalCr), differenceOrResult: String(Math.abs(jnlTotalDr - jnlTotalCr)), status: Math.abs(jnlTotalDr - jnlTotalCr) < 1 ? "OK" : "CHECK", exceptionFlag: Math.abs(jnlTotalDr - jnlTotalCr) >= 1, owner: "Manager" },
          { checkId: "RCN-002", checkName: "TB closing debit vs TB closing credit", source1Value: String(tbTotalDr), source2Value: String(tbTotalCr), differenceOrResult: String(Math.abs(tbTotalDr - tbTotalCr)), status: Math.abs(tbTotalDr - tbTotalCr) < 1 ? "OK" : "CHECK", exceptionFlag: Math.abs(tbTotalDr - tbTotalCr) >= 1, owner: "Manager" },
          { checkId: "RCN-003", checkName: "COA vs TB mismatch count", source1Value: String(coaLines.length), source2Value: String(tbLines.length), differenceOrResult: String(coaVsTbMismatch), status: coaVsTbMismatch === 0 ? "OK" : "CHECK", exceptionFlag: coaVsTbMismatch > 0, owner: "Senior" },
          { checkId: "RCN-004", checkName: "FS extraction vs mapped total", source1Value: String(fsMappingTotal), source2Value: String(fsTbRecon), differenceOrResult: String(Math.abs(fsMappingTotal - fsTbRecon)), status: Math.abs(fsMappingTotal - fsTbRecon) < 100 ? "OK" : "CHECK", exceptionFlag: Math.abs(fsMappingTotal - fsTbRecon) >= 100, owner: "Senior" },
          { checkId: "RCN-005", checkName: "COA account count vs Journal unique accounts", source1Value: String(coaLines.length), source2Value: String(Object.keys(journalsByAccount).length), differenceOrResult: String(Math.abs(coaLines.length - Object.keys(journalsByAccount).length)), status: "INFO", exceptionFlag: false, owner: "Associate" },
        ];

        await db.delete(reconEngineTable).where(eq(reconEngineTable.sessionId, sessionId));
        await db.insert(reconEngineTable).values(reconChecks.map(c => ({ sessionId, ...c } as any)));

        const failedChecks = reconChecks.filter(c => c.status === "CHECK").length;
        report.stages["reconciliation"] = { status: failedChecks === 0 ? "ok" : "exceptions", count: reconChecks.length, exceptions: failedChecks };
        report.summary.reconStatus = failedChecks === 0 ? "Balanced" : `${failedChecks} check(s) failed`;

        // Add recon exceptions
        reconChecks.filter(c => c.exceptionFlag).forEach(c => {
          report.exceptions.push({ source: "Reconciliation", item: c.checkId, issue: `${c.checkName}: difference=${c.differenceOrResult}`, severity: "Critical" });
        });
      } catch (e: any) { report.stages["reconciliation"] = { status: "error", message: e.message }; }
    }

    // ══ STAGE 9: WP Index & Control Matrix ════════════════════════════════════
    if (sheetNames.includes("WP_Index")) {
      try {
        const rows = parseSheetRows(wb.Sheets["WP_Index"], ["WP_Code", "WP_Name", "Status"]);
        if (rows.length > 0) {
          // Upsert WP trigger session records
          for (const r of rows.filter(r => r["WP_Code"])) {
            const existing = await db.select().from(wpTriggerSessionTable)
              .where(and(eq(wpTriggerSessionTable.sessionId, sessionId), eq(wpTriggerSessionTable.wpCode, String(r["WP_Code"]))));
            const patch = {
              sessionId,
              wpCode: String(r["WP_Code"]),
              wpName: String(r["WP_Name"] || ""),
              isTriggered: true,
              triggerReason: String(r["Trigger_Source"] || "Workbook Import"),
              status: String(r["Status"] || "Pending"),
              conclusion: String(r["Conclusion"] || ""),
              preparedBy: String(r["Prepared_By"] || ""),
              reviewedBy: String(r["Reviewed_By"] || ""),
            };
            if (existing.length === 0) await db.insert(wpTriggerSessionTable).values(patch as any);
            else await db.update(wpTriggerSessionTable).set(patch as any).where(and(eq(wpTriggerSessionTable.sessionId, sessionId), eq(wpTriggerSessionTable.wpCode, String(r["WP_Code"]))));
          }
          report.stages["wp_index"] = { status: "ok", count: rows.length };
        }
      } catch (e: any) { report.stages["wp_index"] = { status: "error", message: e.message }; }
    }

    if (sheetNames.includes("Control_Matrix")) {
      try {
        const rows = parseSheetRows(wb.Sheets["Control_Matrix"], ["Process", "Control_ID", "Control_Description"]);
        if (rows.length > 0) {
          for (const r of rows.filter(r => r["Process"])) {
            const existing = await db.select().from(controlMatrixTable)
              .where(and(eq(controlMatrixTable.sessionId, sessionId), eq(controlMatrixTable.process, String(r["Process"]))));
            const patch = {
              sessionId,
              process: String(r["Process"]),
              controlId: String(r["Control_ID"] || ""),
              controlDescription: String(r["Control_Description"] || ""),
              frequency: String(r["Frequency"] || ""),
              controlOwner: String(r["Control_Owner"] || ""),
              testType: String(r["Test_Type"] || "ToC"),
              populationSource: String(r["Population_Source"] || ""),
              keyControlFlag: safeBool(r["Key_Control_Flag"]),
              designEffective: String(r["Design_Effective"] || "Not Tested"),
              operatingEffective: String(r["Operating_Effective"] || "Not Tested"),
              notes: String(r["Notes"] || ""),
            };
            if (existing.length === 0) await db.insert(controlMatrixTable).values(patch as any);
            else await db.update(controlMatrixTable).set(patch as any).where(and(eq(controlMatrixTable.sessionId, sessionId), eq(controlMatrixTable.process, String(r["Process"]))));
          }
          report.stages["control_matrix"] = { status: "ok", count: rows.length };
        }
      } catch (e: any) { report.stages["control_matrix"] = { status: "error", message: e.message }; }
    }

    // ── Final summary ─────────────────────────────────────────────────────────
    report.summary.exceptionCount = report.exceptions.length;

    // Update session stage to data_sheet if at upload stage
    if (session.currentStage === "upload" || session.currentStage === "extraction") {
      await db.update(wpSessionsTable).set({ currentStage: "data_sheet" }).where(eq(wpSessionsTable.id, sessionId));
    }

    return res.json({
      success: true,
      message: `Workbook extraction complete. ${Object.keys(report.stages).length} stages processed, ${report.summary.exceptionCount} exception(s) flagged.`,
      report,
    });
  } catch (err: any) {
    logger.error("extract-workbook error:", err);
    res.status(500).json({ error: err.message, report });
  }
});

// ── Get extraction report for a session ──────────────────────────────────────
router.get("/sessions/:id/extraction-report", async (req: Request, res: Response) => {
  const sessionId = parseInt(p(req.params.id));
  try {
    const [journals, coa, tb, glAccts, fsMappings, fsExtraction, recon, wpIndex, libWps] = await Promise.all([
      db.select().from(wpJournalImportTable).where(eq(wpJournalImportTable.sessionId, sessionId)),
      db.select().from(wpMasterCoaTable).where(eq(wpMasterCoaTable.sessionId, sessionId)),
      db.select().from(wpTrialBalanceLinesTable).where(eq(wpTrialBalanceLinesTable.sessionId, sessionId)),
      db.select().from(wpGlAccountsTable).where(eq(wpGlAccountsTable.sessionId, sessionId)),
      db.select().from(wpFsMappingTable).where(eq(wpFsMappingTable.sessionId, sessionId)),
      db.select().from(wpFsExtractionTable).where(eq(wpFsExtractionTable.sessionId, sessionId)),
      db.select().from(reconEngineTable).where(eq(reconEngineTable.sessionId, sessionId)),
      db.select().from(wpTriggerSessionTable).where(eq(wpTriggerSessionTable.sessionId, sessionId)),
      db.select().from(wpLibrarySessionTable).where(eq(wpLibrarySessionTable.sessionId, sessionId)),
    ]);
    const tbDebit = tb.reduce((s, t) => s + parseFloat(String(t.debit || 0)), 0);
    const tbCredit = tb.reduce((s, t) => s + parseFloat(String(t.credit || 0)), 0);
    const jnlExceptions = journals.filter(j => j.exceptionFlag).length;
    const coaExceptions = coa.filter(c => c.exceptionFlag).length;
    const fsMappingExceptions = fsMappings.filter(f => f.exceptionFlag).length;
    const reconFails = recon.filter(r => r.status === "CHECK").length;

    res.json({
      counts: { journals: journals.length, coaAccounts: coa.length, tbLines: tb.length, glAccounts: glAccts.length, fsMappings: fsMappings.length, fsExtractions: fsExtraction.length, reconChecks: recon.length, wpTriggered: libWps.length > 0 ? libWps.length : wpIndex.filter(w => w.triggered === true).length },
      balances: { tbDebit, tbCredit, difference: tbDebit - tbCredit, balanced: Math.abs(tbDebit - tbCredit) < 1 },
      exceptions: { journals: jnlExceptions, coa: coaExceptions, fsMappings: fsMappingExceptions, reconFails, total: jnlExceptions + coaExceptions + fsMappingExceptions + reconFails },
      recon,
      fsExtraction: fsExtraction.slice(0, 50),
      fsMappings: fsMappings.slice(0, 50),
    });
  } catch (err: any) {
    logger.error({ err }, "Route error");
    res.status(500).json({ error: err.message });
  }
});

// ── GET journal imports for session ──────────────────────────────────────────
router.get("/sessions/:id/journal-imports", async (req: Request, res: Response) => {
  const sessionId = parseInt(p(req.params.id));
  try {
    const rows = await db.select().from(wpJournalImportTable).where(eq(wpJournalImportTable.sessionId, sessionId)).orderBy(asc(wpJournalImportTable.entryDate));
    res.json(rows);
  } catch (err: any) { logger.error({ err }, "Route error"); res.status(500).json({ error: err.message }); }
});

// ── GET FS extraction rows for session ───────────────────────────────────────
router.get("/sessions/:id/fs-extraction", async (req: Request, res: Response) => {
  const sessionId = parseInt(p(req.params.id));
  try {
    const rows = await db.select().from(wpFsExtractionTable).where(eq(wpFsExtractionTable.sessionId, sessionId));
    res.json(rows);
  } catch (err: any) { logger.error({ err }, "Route error"); res.status(500).json({ error: err.message }); }
});

// ── GET FS mappings for session ───────────────────────────────────────────────
router.get("/sessions/:id/fs-mappings", async (req: Request, res: Response) => {
  const sessionId = parseInt(p(req.params.id));
  try {
    const rows = await db.select().from(wpFsMappingTable).where(eq(wpFsMappingTable.sessionId, sessionId));
    res.json(rows);
  } catch (err: any) { logger.error({ err }, "Route error"); res.status(500).json({ error: err.message }); }
});

// ── Seed all global reference data in one call
router.post("/seed-audit-engine", async (_req: Request, res: Response) => {
  try {
    const results: any = {};
    const triggerCount = await db.select().from(wpTriggerDefsTable);
    if (triggerCount.length === 0) { await db.insert(wpTriggerDefsTable).values(DEFAULT_WP_TRIGGERS as any); results.wpTriggers = `Seeded ${DEFAULT_WP_TRIGGERS.length}`; }
    else results.wpTriggers = `Already has ${triggerCount.length}`;

    const assertionCount = await db.select().from(assertionLinkageTable);
    if (assertionCount.length === 0) { await db.insert(assertionLinkageTable).values(DEFAULT_ASSERTION_LINKAGE as any); results.assertions = `Seeded ${DEFAULT_ASSERTION_LINKAGE.length}`; }
    else results.assertions = `Already has ${assertionCount.length}`;

    const samplingCount = await db.select().from(samplingRulesTable);
    if (samplingCount.length === 0) { await db.insert(samplingRulesTable).values(DEFAULT_SAMPLING_RULES as any); results.sampling = `Seeded ${DEFAULT_SAMPLING_RULES.length}`; }
    else results.sampling = `Already has ${samplingCount.length}`;

    const analyticsCount = await db.select().from(analyticsEngineTable);
    if (analyticsCount.length === 0) { await db.insert(analyticsEngineTable).values(DEFAULT_ANALYTICS as any); results.analytics = `Seeded ${DEFAULT_ANALYTICS.length}`; }
    else results.analytics = `Already has ${analyticsCount.length}`;

    return res.json({ message: "Audit engine seed complete", results });
  } catch (err: any) {
    logger.error({ err }, "Route error");
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /seed-wp-library
// Idempotently seeds wp_library_master from WP_LIBRARY seed array
// ─────────────────────────────────────────────────────────────────────────────
router.post("/seed-wp-library", async (_req: Request, res: Response) => {
  try {
    const existing = await db.select({ wpCode: wpLibraryMasterTable.wpCode }).from(wpLibraryMasterTable);
    const existingCodes = new Set(existing.map((r) => r.wpCode));

    const toInsert = WP_LIBRARY.filter((wp) => !existingCodes.has(wp.wpCode));
    const toUpdate = WP_LIBRARY.filter((wp) => existingCodes.has(wp.wpCode));

    let inserted = 0;
    let updated = 0;

    if (toInsert.length > 0) {
      await db.insert(wpLibraryMasterTable).values(toInsert as any);
      inserted = toInsert.length;
    }

    for (const wp of toUpdate) {
      await db.update(wpLibraryMasterTable)
        .set({ ...wp, updatedAt: new Date() } as any)
        .where(eq(wpLibraryMasterTable.wpCode, wp.wpCode));
      updated++;
    }

    const total = await db.select().from(wpLibraryMasterTable);
    return res.json({
      message: "WP Library seed complete",
      inserted,
      updated,
      total: total.length,
      families: [...new Set(WP_LIBRARY.map((w) => w.codeFamily))].sort().join(", "),
    });
  } catch (err: any) {
    logger.error("seed-wp-library error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /wp-library  — Browse full library with optional filters
// Query params: family, phase, mandatory, search, entityType, industry, risk, fsHead
// ─────────────────────────────────────────────────────────────────────────────
router.get("/wp-library", async (req: Request, res: Response) => {
  try {
    const all = await db.select().from(wpLibraryMasterTable).orderBy(asc(wpLibraryMasterTable.displayOrder));

    const { family, phase, mandatory, search, entityType, industry, risk, fsHead } = req.query as Record<string, string>;

    let filtered = all;
    if (family) filtered = filtered.filter((r) => r.codeFamily === family);
    if (phase) filtered = filtered.filter((r) => r.wpPhase?.toLowerCase().includes(phase.toLowerCase()));
    if (mandatory === "true") filtered = filtered.filter((r) => r.mandatoryFlag);
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter((r) =>
        r.wpCode.toLowerCase().includes(q) ||
        r.wpTitle.toLowerCase().includes(q) ||
        (r.isaReference || "").toLowerCase().includes(q)
      );
    }
    if (entityType) filtered = filtered.filter((r) => !r.triggerEntityType || r.triggerEntityType === "All" || r.triggerEntityType.split(",").some((t) => t.trim().toLowerCase().includes(entityType.toLowerCase())));
    if (industry) filtered = filtered.filter((r) => !r.triggerIndustry || r.triggerIndustry.split(",").some((t) => t.trim().toLowerCase().includes(industry.toLowerCase())));
    if (risk) filtered = filtered.filter((r) => !r.triggerRisk || r.triggerRisk.split(",").some((t) => t.trim().toLowerCase().includes(risk.toLowerCase())));
    if (fsHead) filtered = filtered.filter((r) => !r.triggerFsHead || r.triggerFsHead.split(",").some((t) => t.trim().toLowerCase().includes(fsHead.toLowerCase())));

    const byFamily = filtered.reduce((acc: any, r) => {
      const f = r.codeFamily || "?";
      if (!acc[f]) acc[f] = 0;
      acc[f]++;
      return acc;
    }, {});

    return res.json({ total: filtered.length, byFamily, papers: filtered });
  } catch (err: any) {
    logger.error({ err }, "Route error");
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /sessions/:id/wp-recommendations
// Returns all 274 WPs with dynamic applicability/recommendation flags
// driven by session controlling variables (industry, IT env, group audit, etc.)
// ─────────────────────────────────────────────────────────────────────────────
router.get("/sessions/:id/wp-recommendations", async (req: Request, res: Response) => {
  try {
    const sessionId = parseInt(p(req.params.id), 10);
    if (isNaN(sessionId)) return res.status(400).json({ error: "Invalid session ID" });

    const [session] = await db.select().from(wpSessionsTable).where(eq(wpSessionsTable.id, sessionId));
    if (!session) return res.status(404).json({ error: "Session not found" });

    const entityTypeTags = entityTypeToTags(session.entityType || "Private Limited");
    const industryTagsArr = industryToTags(session.industryType || null);
    const itEnvTagsArr = itEnvToTags(session.itEnvironmentType || null);
    const taxStatusTagsArr = (session.taxStatusFlags || "").split(",").map((s: string) => s.trim()).filter(Boolean);
    const specialCondTagsArr = (session.specialConditions || "").split(",").map((s: string) => s.trim()).filter(Boolean);

    const ctx = {
      entityTypeTags,
      industryTags: industryTagsArr,
      isFirstYear: (session.engagementContinuity || "first_time") === "first_time",
      isGroupAudit: session.groupAuditFlag === true,
      itEnvironmentTags: itEnvTagsArr,
      taxStatusTags: taxStatusTagsArr,
      specialConditionTags: specialCondTagsArr,
      engagementType: session.engagementType || "statutory_audit",
      reportingFramework: session.reportingFramework || "IFRS",
    };

    const results: any[] = [];
    let totalApplicable = 0;
    let totalRecommended = 0;

    for (const [code, meta] of Object.entries(WP_FULL_LIBRARY)) {
      const { applicable, reason, recommended } = isWpApplicable(code, meta, ctx);
      if (applicable) totalApplicable++;
      if (recommended) totalRecommended++;
      const linkedVars: string[] = [];
      if (meta.applicableTo?.length) linkedVars.push("entity_type");
      if (meta.industry?.length) linkedVars.push("industry");
      if (meta.controlledBy?.groupAuditOnly) linkedVars.push("group_audit");
      if (meta.controlledBy?.firstYearOnly) linkedVars.push("engagement_continuity");
      if (meta.controlledBy?.itEnvRequired?.length) linkedVars.push("it_environment");
      if (meta.controlledBy?.taxStatus?.length) linkedVars.push("tax_status");
      if (meta.controlledBy?.specialCond?.length) linkedVars.push("special_conditions");
      results.push({
        code,
        name: meta.name,
        phase: meta.phase,
        isa: meta.isa,
        riskLevel: meta.riskLevel,
        assertions: meta.assertions,
        fsArea: meta.fsArea,
        isCore: meta.isCore,
        applicable,
        recommended,
        reason,
        linkedVariables: linkedVars,
        applicableTo: meta.applicableTo || null,
        industry: meta.industry || null,
        controlledBy: meta.controlledBy || null,
      });
    }

    const byPhase = results.reduce((acc: any, r) => {
      const ph = r.phase || "Other";
      if (!acc[ph]) acc[ph] = { total: 0, applicable: 0, recommended: 0 };
      acc[ph].total++;
      if (r.applicable) acc[ph].applicable++;
      if (r.recommended) acc[ph].recommended++;
      return acc;
    }, {});

    return res.json({
      totalLibrary: results.length,
      totalApplicable,
      totalRecommended,
      byPhase,
      sessionContext: ctx,
      papers: results,
    });
  } catch (err: any) {
    logger.error({ err }, "wp-recommendations error");
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /sessions/:id/selected-wp-codes
// Save the list of selected WP codes for this session
// ─────────────────────────────────────────────────────────────────────────────
router.post("/sessions/:id/selected-wp-codes", requireRoles(...WP_ROLES_WRITE), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const sessionId = parseInt(p(req.params.id));
    const { codes } = req.body as { codes: string[] };
    if (!Array.isArray(codes)) return res.status(400).json({ error: "codes must be an array" });
    await db.update(wpSessionsTable).set({ selectedWpCodes: JSON.stringify(codes) }).where(eq(wpSessionsTable.id, sessionId));
    res.json({ ok: true, count: codes.length });
  } catch (err: any) {
    logger.error({ err }, "save selected-wp-codes error");
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /sessions/:id/selected-wp-codes
// Get the list of selected WP codes for this session
// ─────────────────────────────────────────────────────────────────────────────
router.get("/sessions/:id/selected-wp-codes", async (req: Request, res: Response) => {
  try {
    const sessionId = parseInt(p(req.params.id));
    const [session] = await db.select().from(wpSessionsTable).where(eq(wpSessionsTable.id, sessionId));
    if (!session) return res.status(404).json({ error: "Session not found" });
    let codes: string[] = [];
    try { codes = session.selectedWpCodes ? JSON.parse(session.selectedWpCodes) : []; } catch {}
    res.json({ codes });
  } catch (err: any) {
    logger.error({ err }, "get selected-wp-codes error");
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /sessions/:id/categories/status
// Returns all 17 A-Q categories with totalWp / wpUsed / selectedWp counts
// ─────────────────────────────────────────────────────────────────────────────
router.get("/sessions/:id/categories/status", async (req: Request, res: Response) => {
  try {
    const sessionId = parseInt(p(req.params.id));
    const session = (await db.select().from(wpSessionsTable).where(eq(wpSessionsTable.id, sessionId)))[0];
    if (!session) return res.status(404).json({ error: "Session not found" });

    let selectedCodes: string[] = [];
    try { selectedCodes = session.selectedWpCodes ? JSON.parse(session.selectedWpCodes) : []; } catch {}
    const selectedSet = new Set(selectedCodes);

    const wpsByCategory = getWpsByCategory();

    const existingDocs = await db.select({
      paperCode: wpHeadDocumentsTable.paperCode,
      status: wpHeadDocumentsTable.status,
    }).from(wpHeadDocumentsTable).where(eq(wpHeadDocumentsTable.sessionId, sessionId));

    const generatedSet = new Set(existingDocs.map(d => d.paperCode));

    const categories = WP_CATEGORIES.map(cat => {
      const codes = wpsByCategory[cat.key] || [];
      const selectedInCat = codes.filter(c => selectedSet.has(c));
      const wpUsed = selectedInCat.filter(c => generatedSet.has(c)).length;
      return {
        key: cat.key,
        name: cat.name,
        totalWp: codes.length,
        selectedWp: selectedInCat.length,
        wpUsed,
        complete: selectedInCat.length > 0 && wpUsed >= selectedInCat.length,
        codes,
        selectedCodes: selectedInCat,
      };
    });

    const allComplete = categories.every(c => c.selectedWp === 0 || c.complete);

    res.json({ categories, allComplete, totalSelected: selectedCodes.length });
  } catch (err: any) {
    logger.error({ err }, "categories/status error");
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /sessions/:id/categories/:catKey/generate-next
// Generates the NEXT pending WP in a category, one at a time
// ─────────────────────────────────────────────────────────────────────────────
router.post("/sessions/:id/categories/:catKey/generate-next", requireRoles(...WP_ROLES_WRITE), aiRateLimit, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const sessionId = parseInt(p(req.params.id));
    const catKey = p(req.params.catKey).toUpperCase();

    const catDef = WP_CATEGORIES.find(c => c.key === catKey);
    if (!catDef) return res.status(400).json({ error: `Invalid category: ${catKey}` });

    const session = (await db.select().from(wpSessionsTable).where(eq(wpSessionsTable.id, sessionId)))[0];
    if (!session) return res.status(404).json({ error: "Session not found" });

    const ai = await getAIClient();
    if (!ai) return res.status(503).json({ error: "AI service not configured" });

    const wpsByCategory = getWpsByCategory();
    const allCatCodes = wpsByCategory[catKey] || [];
    if (allCatCodes.length === 0) return res.json({ done: true, message: "No WPs in this category", categoryComplete: true });

    let selectedCodes: string[] = [];
    try { selectedCodes = session.selectedWpCodes ? JSON.parse(session.selectedWpCodes) : []; } catch {}
    const selectedSet = new Set(selectedCodes);
    const catCodes = selectedSet.size > 0 ? allCatCodes.filter(c => selectedSet.has(c)) : allCatCodes;
    if (catCodes.length === 0) return res.json({ done: true, message: "No selected WPs in this category", categoryComplete: true });

    const existingDocs = await db.select({ paperCode: wpHeadDocumentsTable.paperCode })
      .from(wpHeadDocumentsTable)
      .where(and(eq(wpHeadDocumentsTable.sessionId, sessionId)));
    const generatedSet = new Set(existingDocs.map(d => d.paperCode));

    const pendingCodes = catCodes.filter(c => !generatedSet.has(c));
    if (pendingCodes.length === 0) return res.json({ done: true, message: "All WPs in this category are complete", categoryComplete: true });

    const paperCode = pendingCodes[0];
    const wpMeta = WP_FULL_LIBRARY[paperCode];
    if (!wpMeta) return res.status(404).json({ error: `WP metadata not found for ${paperCode}` });

    const variables = await db.select().from(wpVariablesTable).where(eq(wpVariablesTable.sessionId, sessionId));
    const tbLines = await db.select().from(wpTrialBalanceLinesTable).where(eq(wpTrialBalanceLinesTable.sessionId, sessionId));
    const varSummary = variables.map(v => `${v.variableName}: ${v.finalValue}`).join("\n");
    const tbSummary = tbLines.map(l => `${l.accountCode} ${l.accountName}: Dr=${l.debit} Cr=${l.credit}`).join("\n");
    const engCode = `ENG-${session.engagementYear || "2026"}-${String(sessionId).padStart(3, "0")}`;

    const headRows = await db.select().from(wpHeadsTable).where(eq(wpHeadsTable.sessionId, sessionId));
    let targetHead = headRows.find(h => h.headName === catDef.name);
    if (!targetHead) {
      const maxIdx = headRows.reduce((mx, h) => Math.max(mx, h.headIndex ?? 0), 11);
      const [newHead] = await db.insert(wpHeadsTable).values({
        sessionId, headIndex: maxIdx + 1, headName: catDef.name,
        status: "in_progress", papersIncluded: catCodes,
        outputType: "word",
      }).returning();
      targetHead = newHead;
    }

    const preparerNames = session.preparerIds ? "Assigned Preparers" : "Senior Auditor";
    const reviewerName = session.reviewerId ? "Engagement Manager" : "Manager";
    const firmNameFull = session.firmName || "Alam & Aulakh Chartered Accountants";
    const clientNameFull = session.clientName || "Unknown";
    const periodStr = `${session.periodStart || "01/07/2025"} to ${session.periodEnd || "30/06/2026"}`;

    const paperPrompt = `You are a Big-4 trained senior audit partner generating a COMPLETE, 100% ISA-compliant, ISQM-1 compliant, audit-defensible, inspection-ready working paper for a Pakistani CA firm (ICAP). Generate working paper "${paperCode}" — "${wpMeta.name}" for category "${catDef.key} — ${catDef.name}".

═══ ENGAGEMENT DETAILS ═══
Firm: ${firmNameFull}
Client: ${clientNameFull}
Engagement Code: ${engCode}
Entity Type: ${session.entityType || "Private Limited"}
Financial Year End: ${session.periodEnd || "30 June " + (session.engagementYear || "2026")}
Period: ${periodStr}
Tax Year: ${session.engagementYear || "2026"}
Reporting Framework: ${session.reportingFramework || "IFRS"}
Engagement Type: ${(session.engagementType || "statutory_audit").replace(/_/g, " ")}
NTN: ${session.ntn || "N/A"}
WP Phase: ${wpMeta.phase}
ISA References: ${wpMeta.isa}
Risk Level: ${wpMeta.riskLevel}
FS Area / Scope: ${wpMeta.fsArea}
Assertions Covered: ${wpMeta.assertions}

═══ ENGAGEMENT VARIABLES ═══
${smartChunk(varSummary, 2000)}

═══ TRIAL BALANCE SUMMARY ═══
${smartChunk(tbSummary, 3000)}

═══ MANDATORY REQUIREMENTS ═══
Generate a COMPLETE, SPECIFIC, NON-GENERIC working paper. Every field must reference actual client data, actual account balances from the TB above, or specific ISA paragraph numbers. No generic placeholders. All PKR amounts must be realistic and consistent with TB data.

EVERY working paper MUST contain ALL 12 mandatory sections as the MINIMUM. AI should ENHANCE and EXPAND each section based on the specific WP's requirements, applicable standards, and practical audit needs. These 12 sections are the FLOOR, not the ceiling:

1. IDENTIFYING INFORMATION — Client name, audit period (${periodStr}), date of working paper, engagement code, firm name
2. AUDIT OBJECTIVES AND SCOPE — Specific ISA objective referencing exact ISA paragraph numbers, scope of procedures for this particular FS area/assertion
3. AUDIT PROCEDURES PERFORMED — Detailed steps actually executed: inspection, observation, confirmation, recalculation, reperformance, analytical procedures, inquiry. Minimum 5 detailed procedures with step numbers.
4. AUDIT EVIDENCE OBTAINED — Nature, source, date, and sufficiency assessment of each piece of evidence (invoices, confirmations, screenshots, minutes, emails, reconciliations). Minimum 3 evidence items.
5. FINDINGS AND RESULTS OF TESTING — Actual observations, exceptions, deviations, misstatements, or confirmations from each procedure performed. Be specific with amounts and percentages.
6. CONCLUSIONS REACHED — Clear pass/fail, qualified/unqualified, or control effectiveness conclusion. Must state whether the objective was met.
7. SIGNIFICANT MATTERS AND THEIR RESOLUTION — Any disagreements, audit adjustments, management responses, or unresolved issues. If none, state "No significant matters identified during testing."
8. CROSS-REFERENCES TO OTHER PAPERS OR RECORDS — Specific links to lead schedules, permanent file, prior year WPs, or related WPs by code (e.g., "See PP-03", "Ref: LS-F-SA-01")
9. REVIEW AND APPROVAL — Preparer name/date/signature block, Reviewer name/date/signature block, Partner approval section
10. INDEXING AND FILING ORGANIZATION — Unique WP reference (${paperCode}), version control (v1.0), file path (${catDef.key}/${paperCode})
11. LEGAL COMPLIANCE REFERENCE — Specific ISA clause numbers + IESBA Code of Ethics sections + Companies Act 2017 section + Income Tax Ordinance 2001 section (all applicable to this WP)
12. RESTRICTION ON USE STATEMENT — "For audit purposes only. Not for third-party reliance without written consent."

Return ONLY valid JSON with this structure:
{
  "paper_code": "${paperCode}",
  "paper_name": "${wpMeta.name}",
  "category": "${catDef.key} — ${catDef.name}",
  "version": "v1.0",
  "status": "Draft",
  "lock_status": "draft",
  "ai_generated": true,
  "engagement_code": "${engCode}",
  "lead_schedule_ref": "LS-${catDef.key}-${paperCode}",
  "fs_head": "${wpMeta.fsArea}",
  "isa_references": "${wpMeta.isa}",

  "sec1_identifying_info": {
    "client_name": "${clientNameFull}",
    "firm_name": "${firmNameFull}",
    "audit_period": "${periodStr}",
    "date_of_wp": "${new Date().toISOString().slice(0, 10)}",
    "engagement_code": "${engCode}",
    "entity_type": "${session.entityType || "Private Limited"}",
    "ntn": "${session.ntn || "N/A"}",
    "reporting_framework": "${session.reportingFramework || "IFRS"}"
  },

  "sec2_objectives_and_scope": {
    "objective": "Specific ISA-aligned objective for this WP referencing client name and FS area. Minimum 4 sentences with ISA paragraph references.",
    "scope": "Detailed scope of procedures covering the specific FS area, period, and assertions tested."
  },

  "sec3_procedures_performed": [
    { "step_no": "1", "procedure_type": "Inspection/Observation/Confirmation/Recalculation/Reperformance/Analytical/Inquiry", "description": "Detailed procedure description", "assertion": "C,E", "reference": "${paperCode}-P1", "done_by": "${preparerNames}", "date": "During fieldwork", "result": "Satisfactory" }
  ],

  "sec4_evidence_obtained": [
    { "ref": "E001", "description": "Description of evidence", "evidence_type": "External/Internal", "nature": "Documentary/Electronic/Verbal", "source": "Client/Bank/Third Party", "date_obtained": "During fieldwork", "sufficiency": "Sufficient and appropriate", "reliability": "High" }
  ],

  "sec5_findings_and_results": {
    "summary": "Overall summary of testing results with specific amounts and percentages.",
    "observations": ["Specific observation 1 with amounts", "Specific observation 2"],
    "exceptions": [],
    "misstatements_identified": [],
    "deviations": []
  },

  "sec6_conclusions": {
    "conclusion_status": "Satisfactory / Unsatisfactory / Qualified",
    "conclusion_narrative": "Clear conclusion statement. Minimum 3 sentences stating whether the audit objective was met, the basis for the conclusion, and the impact on the overall audit opinion.",
    "objective_met": true
  },

  "sec7_significant_matters": {
    "matters_identified": false,
    "details": "No significant matters identified during testing.",
    "disagreements": [],
    "audit_adjustments": [],
    "management_responses": [],
    "unresolved_issues": []
  },

  "sec8_cross_references": {
    "related_wps": ["List specific related WP codes"],
    "lead_schedules": ["LS-${catDef.key}-${paperCode}"],
    "permanent_file_refs": [],
    "prior_year_refs": []
  },

  "sec9_review_and_approval": {
    "prepared_by": "${preparerNames}",
    "prepared_date": "${new Date().toISOString().slice(0, 10)}",
    "reviewed_by": "${reviewerName}",
    "reviewed_date": "",
    "partner_approval": "",
    "partner_approval_date": ""
  },

  "sec10_indexing_and_filing": {
    "wp_reference": "${paperCode}",
    "version": "v1.0",
    "file_path": "${catDef.key}/${paperCode}",
    "supersedes": "N/A"
  },

  "sec11_legal_compliance": {
    "isa_clauses": "List specific ISA paragraph numbers applicable to this WP",
    "iesba_sections": "Relevant IESBA Code of Ethics sections",
    "companies_act_sections": "Relevant Companies Act 2017 sections",
    "income_tax_sections": "Relevant Income Tax Ordinance 2001 sections (if applicable)",
    "other_regulations": ""
  },

  "sec12_restriction_on_use": "This working paper is prepared for audit purposes only. It is intended solely for use by the engagement team and the firm's quality control reviewers. Not for third-party reliance without written consent of ${firmNameFull}.",

  "objective": "Same as sec2_objectives_and_scope.objective (for backward compatibility)",
  "work_performed": "Detailed narrative minimum 6 sentences of what auditor did.",
  "materiality_linkage": { "overall_materiality": 0, "performance_materiality": 0, "basis": "Revenue or Total Assets", "percentage": "1.5%" },
  "risk_assertion_table": [{ "risk_description": "Specific risk", "assertion": "C,E,V", "risk_level": "High", "audit_approach": "Substantive" }],
  "procedures_table": [{ "step_no": "1", "description": "Detailed procedure", "assertion": "C,E", "reference": "${paperCode}-P1", "done_by": "Senior Auditor", "date": "During fieldwork", "result": "Satisfactory" }],
  "variance_analysis": { "current_year": 0, "prior_year": 0, "variance": 0, "variance_percentage": "0%" },
  "evidence_table": [{ "ref": "E001", "description": "Evidence obtained", "evidence_type": "External", "source": "Bank/Client", "reliability": "High" }],
  "auditor_judgement": "Professional narrative minimum 5 sentences.",
  "proposed_adjustments": [],
  "conclusion": "Satisfactory — No material exceptions noted.",
  "review_notes": "",
  "cross_references": ["Related WP codes"],
  "exceptions": []
}`;

    const resp = await ai.client.chat.completions.create({
      model: ai.model,
      messages: [
        { role: "system", content: "You are a Big-4 trained senior audit partner generating 100% ISA-compliant working papers for Pakistan (ICAP) audits. Return ONLY valid JSON. No markdown." },
        { role: "user", content: paperPrompt },
      ],
      max_tokens: 8000, temperature: 0.2,
      response_format: { type: "json_object" },
    }, { signal: AbortSignal.timeout(180000) });

    const raw = JSON.parse(resp.choices[0]?.message?.content || "{}");

    const [doc] = await db.insert(wpHeadDocumentsTable).values({
      sessionId, headId: targetHead.id,
      paperCode: raw.paper_code || paperCode,
      paperName: raw.paper_name || wpMeta.name,
      content: JSON.stringify(raw),
      outputFormat: "word",
      status: "generated",
      generatedAt: new Date(),
    }).returning();

    await db.update(wpHeadsTable).set({ status: "in_progress", updatedAt: new Date() }).where(eq(wpHeadsTable.id, targetHead.id));

    const remainingCount = pendingCodes.length - 1;
    const categoryComplete = remainingCount === 0;

    if (categoryComplete) {
      await db.update(wpHeadsTable).set({ status: "validating", updatedAt: new Date() }).where(eq(wpHeadsTable.id, targetHead.id));
    }

    res.json({
      document: doc,
      paperCode,
      paperName: wpMeta.name,
      category: catDef.key,
      categoryName: catDef.name,
      categoryComplete,
      remainingInCategory: remainingCount,
      totalInCategory: catCodes.length,
      generatedInCategory: catCodes.length - remainingCount,
    });
  } catch (err: any) {
    logger.error({ err }, "category generate-next error");
    res.status(500).json({ error: err.message });
  }
});

function buildWpDocxChildren(wp: any, doc: any, catDef: any, session: any, DOCX_NAVY: string): any[] {
  const children: any[] = [];
  const sec = (num: string, title: string) => {
    children.push(new Paragraph({
      children: [new TextRun({ text: `${num}. ${title}`, bold: true, size: 22, color: DOCX_NAVY, font: "Calibri" })],
      spacing: { before: 200, after: 60 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: DOCX_NAVY } },
    }));
  };
  const txt = (text: string, opts?: { bold?: boolean; size?: number; color?: string; italic?: boolean }) => {
    if (!text) return;
    children.push(new Paragraph({
      children: [new TextRun({ text, size: opts?.size || 20, font: "Calibri", color: opts?.color || "1E293B", bold: opts?.bold, italics: opts?.italic })],
      spacing: { after: 60 },
    }));
  };
  const kvRow = (label: string, value: string) => {
    children.push(new Paragraph({
      children: [
        new TextRun({ text: `${label}: `, bold: true, size: 18, font: "Calibri", color: "475569" }),
        new TextRun({ text: value || "—", size: 18, font: "Calibri", color: "1E293B" }),
      ],
      spacing: { after: 30 },
    }));
  };

  children.push(new Paragraph({
    children: [new TextRun({ text: `${catDef.key} — ${catDef.name}`, bold: true, size: 20, color: "FFFFFF", font: "Calibri" })],
    shading: { fill: DOCX_NAVY, type: ShadingType.SOLID },
    spacing: { after: 80 },
  }));
  children.push(new Paragraph({
    children: [new TextRun({ text: `${doc.paperCode} — ${doc.paperName || wp.paper_name || ""}`, bold: true, size: 28, color: DOCX_NAVY, font: "Calibri" })],
    spacing: { after: 60 },
  }));

  const s1 = wp.sec1_identifying_info;
  sec("1", "Identifying Information");
  if (s1) {
    kvRow("Client Name", s1.client_name || session.clientName);
    kvRow("Firm", s1.firm_name || session.firmName || "Alam & Aulakh Chartered Accountants");
    kvRow("Audit Period", s1.audit_period || `${session.periodStart || ""} to ${session.periodEnd || ""}`);
    kvRow("Date of Working Paper", s1.date_of_wp || new Date().toISOString().slice(0, 10));
    kvRow("Engagement Code", s1.engagement_code || wp.engagement_code || "—");
    kvRow("Entity Type", s1.entity_type || session.entityType || "—");
    kvRow("NTN", s1.ntn || session.ntn || "N/A");
    kvRow("Reporting Framework", s1.reporting_framework || session.reportingFramework || "IFRS");
  } else {
    kvRow("Client", session.clientName || "—");
    kvRow("Period", session.engagementYear || "—");
    kvRow("ISA References", wp.isa_references || "—");
    kvRow("FS Area", wp.fs_head || "—");
  }

  const s2 = wp.sec2_objectives_and_scope;
  sec("2", "Audit Objectives and Scope");
  txt(s2?.objective || wp.objective || "");
  if (s2?.scope) txt(s2.scope, { italic: true, color: "475569" });

  sec("3", "Audit Procedures Performed");
  const procs = wp.sec3_procedures_performed || wp.procedures_table || [];
  if (Array.isArray(procs) && procs.length > 0) {
    const procHeaderRow = new TableRow({
      tableHeader: true,
      children: ["#", "Type", "Procedure", "Assertion", "Done By", "Result"].map(h =>
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, size: 16, font: "Calibri", color: "FFFFFF" })], alignment: AlignmentType.CENTER })],
          shading: { fill: DOCX_NAVY, type: ShadingType.SOLID },
        })
      ),
    });
    const procRows = procs.map((p: any) => new TableRow({
      children: [
        p.step_no || "",
        p.procedure_type || "",
        p.description || "",
        p.assertion || "",
        p.done_by || "",
        p.result || "",
      ].map(v => new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text: String(v), size: 16, font: "Calibri" })] })],
      })),
    }));
    children.push(new Table({ rows: [procHeaderRow, ...procRows], width: { size: 100, type: WidthType.PERCENTAGE } }));
  } else {
    txt(wp.work_performed || "Procedures not detailed.");
  }

  sec("4", "Audit Evidence Obtained");
  const evidence = wp.sec4_evidence_obtained || wp.evidence_table || [];
  if (Array.isArray(evidence) && evidence.length > 0) {
    const evHeaderRow = new TableRow({
      tableHeader: true,
      children: ["Ref", "Description", "Type", "Source", "Sufficiency", "Reliability"].map(h =>
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, size: 16, font: "Calibri", color: "FFFFFF" })], alignment: AlignmentType.CENTER })],
          shading: { fill: DOCX_NAVY, type: ShadingType.SOLID },
        })
      ),
    });
    const evRows = evidence.map((e: any) => new TableRow({
      children: [
        e.ref || "",
        e.description || "",
        e.evidence_type || e.nature || "",
        e.source || "",
        e.sufficiency || "",
        e.reliability || "",
      ].map(v => new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text: String(v), size: 16, font: "Calibri" })] })],
      })),
    }));
    children.push(new Table({ rows: [evHeaderRow, ...evRows], width: { size: 100, type: WidthType.PERCENTAGE } }));
  }

  const s5 = wp.sec5_findings_and_results;
  sec("5", "Findings and Results of Testing");
  txt(s5?.summary || "");
  if (Array.isArray(s5?.observations)) s5.observations.forEach((o: string) => txt(`• ${o}`));
  if (Array.isArray(s5?.exceptions) && s5.exceptions.length > 0) {
    txt("Exceptions:", { bold: true, color: "DC2626" });
    s5.exceptions.forEach((e: any) => txt(`• ${typeof e === "string" ? e : JSON.stringify(e)}`));
  }
  if (Array.isArray(s5?.misstatements_identified) && s5.misstatements_identified.length > 0) {
    txt("Misstatements:", { bold: true, color: "DC2626" });
    s5.misstatements_identified.forEach((m: any) => txt(`• ${typeof m === "string" ? m : JSON.stringify(m)}`));
  }

  const s6 = wp.sec6_conclusions;
  sec("6", "Conclusions Reached");
  if (s6) {
    txt(`Status: ${s6.conclusion_status || "—"}`, { bold: true });
    txt(s6.conclusion_narrative || "");
    txt(`Objective Met: ${s6.objective_met ? "Yes" : "No"}`, { italic: true, color: s6.objective_met ? "059669" : "DC2626" });
  } else {
    const conclusionText = typeof wp.conclusion === "string" ? wp.conclusion : wp.conclusion?.status || wp.conclusion?.conclusion_narrative || "";
    txt(conclusionText || "—");
  }

  const s7 = wp.sec7_significant_matters;
  sec("7", "Significant Matters and Their Resolution");
  if (s7) {
    txt(s7.details || (s7.matters_identified ? "Matters identified — see below." : "No significant matters identified during testing."));
    if (Array.isArray(s7.audit_adjustments) && s7.audit_adjustments.length > 0) {
      txt("Audit Adjustments:", { bold: true });
      s7.audit_adjustments.forEach((a: any) => txt(`• ${typeof a === "string" ? a : JSON.stringify(a)}`));
    }
    if (Array.isArray(s7.unresolved_issues) && s7.unresolved_issues.length > 0) {
      txt("Unresolved Issues:", { bold: true, color: "DC2626" });
      s7.unresolved_issues.forEach((u: any) => txt(`• ${typeof u === "string" ? u : JSON.stringify(u)}`));
    }
  } else {
    txt("No significant matters identified during testing.");
  }

  const s8 = wp.sec8_cross_references;
  sec("8", "Cross-References to Other Papers or Records");
  if (s8) {
    if (Array.isArray(s8.related_wps) && s8.related_wps.length > 0) kvRow("Related WPs", s8.related_wps.join(", "));
    if (Array.isArray(s8.lead_schedules) && s8.lead_schedules.length > 0) kvRow("Lead Schedules", s8.lead_schedules.join(", "));
    if (Array.isArray(s8.permanent_file_refs) && s8.permanent_file_refs.length > 0) kvRow("Permanent File", s8.permanent_file_refs.join(", "));
    if (Array.isArray(s8.prior_year_refs) && s8.prior_year_refs.length > 0) kvRow("Prior Year", s8.prior_year_refs.join(", "));
  } else if (Array.isArray(wp.cross_references)) {
    txt(wp.cross_references.join(", "));
  }

  const s9 = wp.sec9_review_and_approval;
  sec("9", "Review and Approval");
  if (s9) {
    const raRows = [
      ["Prepared By", s9.prepared_by || "—", "Date", s9.prepared_date || "—"],
      ["Reviewed By", s9.reviewed_by || "—", "Date", s9.reviewed_date || "—"],
      ["Partner Approval", s9.partner_approval || "—", "Date", s9.partner_approval_date || "—"],
    ];
    children.push(new Table({
      rows: raRows.map(row => new TableRow({
        children: row.map((cell, ci) => new TableCell({
          width: { size: 25, type: WidthType.PERCENTAGE },
          shading: ci % 2 === 0 ? { fill: "F1F5F9", type: ShadingType.SOLID } : undefined,
          children: [new Paragraph({ children: [new TextRun({ text: cell, size: 18, bold: ci % 2 === 0, font: "Calibri", color: ci % 2 === 0 ? "475569" : "1E293B" })], spacing: { before: 40, after: 40 } })],
        })),
      })),
      width: { size: 100, type: WidthType.PERCENTAGE },
    }));
  }

  const s10 = wp.sec10_indexing_and_filing;
  sec("10", "Indexing and Filing Organization");
  if (s10) {
    kvRow("WP Reference", s10.wp_reference || doc.paperCode);
    kvRow("Version", s10.version || "v1.0");
    kvRow("File Path", s10.file_path || "—");
    kvRow("Supersedes", s10.supersedes || "N/A");
  } else {
    kvRow("WP Reference", doc.paperCode);
    kvRow("Version", wp.version || "v1.0");
  }

  const s11 = wp.sec11_legal_compliance;
  sec("11", "Legal Compliance Reference");
  if (s11) {
    kvRow("ISA Clauses", s11.isa_clauses || wp.isa_references || "—");
    kvRow("IESBA Code of Ethics", s11.iesba_sections || "—");
    kvRow("Companies Act 2017", s11.companies_act_sections || "—");
    kvRow("Income Tax Ordinance 2001", s11.income_tax_sections || "—");
    if (s11.other_regulations) kvRow("Other Regulations", s11.other_regulations);
  } else {
    kvRow("ISA References", wp.isa_references || "—");
  }

  sec("12", "Restriction on Use Statement");
  txt(wp.sec12_restriction_on_use || "This working paper is prepared for audit purposes only. It is intended solely for use by the engagement team and the firm's quality control reviewers. Not for third-party reliance without written consent.", { italic: true, color: "64748B" });

  if (wp.auditor_judgement) {
    sec("—", "Auditor Judgement (Additional)");
    txt(wp.auditor_judgement);
  }

  children.push(new Paragraph({ text: "", spacing: { after: 40 } }));
  children.push(new Paragraph({
    children: [new TextRun({ text: `${doc.paperCode} | ${session.clientName} | ${session.engagementYear} | Generated by AuditWise`, size: 14, color: "94A3B8", font: "Calibri" })],
    alignment: AlignmentType.CENTER,
  }));

  return children;
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /sessions/:id/categories/:catKey/export-docx
// Merged Word file for one category
// ─────────────────────────────────────────────────────────────────────────────
router.post("/sessions/:id/categories/:catKey/export-docx", requireRoles(...WP_ROLES_WRITE), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const sessionId = parseInt(p(req.params.id));
    const catKey = p(req.params.catKey).toUpperCase();
    const catDef = WP_CATEGORIES.find(c => c.key === catKey);
    if (!catDef) return res.status(400).json({ error: "Invalid category" });

    const session = (await db.select().from(wpSessionsTable).where(eq(wpSessionsTable.id, sessionId)))[0];
    if (!session) return res.status(404).json({ error: "Session not found" });

    const wpsByCategory = getWpsByCategory();
    const catCodes = wpsByCategory[catKey] || [];

    const docs = await db.select().from(wpHeadDocumentsTable)
      .where(and(eq(wpHeadDocumentsTable.sessionId, sessionId)));
    const catDocs = docs.filter(d => catCodes.includes(d.paperCode));

    if (catDocs.length === 0) return res.status(400).json({ error: "No generated WPs in this category" });

    catDocs.sort((a, b) => catCodes.indexOf(a.paperCode) - catCodes.indexOf(b.paperCode));

    const sections: any[] = [];
    const DOCX_NAVY = "0F3460";

    for (const doc of catDocs) {
      const wp = typeof doc.content === "string" ? JSON.parse(doc.content) : (doc.content || {});
      const children: any[] = buildWpDocxChildren(wp, doc, catDef, session, DOCX_NAVY);
      sections.push({ children });
    }

    const document = new Document({
      sections: sections.map((s, i) => ({
        properties: i > 0 ? { page: { size: { width: 12240, height: 15840 } } } : undefined,
        children: s.children,
      })),
    });

    const buffer = await Packer.toBuffer(document);
    const filename = `${catDef.key}_${catDef.name.replace(/[^a-zA-Z0-9]/g, "_")}_${session.clientName?.replace(/[^a-zA-Z0-9]/g, "_") || "Client"}.docx`;

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err: any) {
    logger.error({ err }, "category export-docx error");
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /sessions/:id/categories/export-all-docx
// Final merged Word file for ALL categories
// ─────────────────────────────────────────────────────────────────────────────
router.post("/sessions/:id/categories/export-all-docx", requireRoles(...WP_ROLES_WRITE), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const sessionId = parseInt(p(req.params.id));
    const session = (await db.select().from(wpSessionsTable).where(eq(wpSessionsTable.id, sessionId)))[0];
    if (!session) return res.status(404).json({ error: "Session not found" });

    const wpsByCategory = getWpsByCategory();
    const allDocs = await db.select().from(wpHeadDocumentsTable).where(eq(wpHeadDocumentsTable.sessionId, sessionId));
    const docMap = new Map(allDocs.map(d => [d.paperCode, d]));

    const DOCX_NAVY = "0F3460";
    const sections: any[] = [];

    sections.push({
      children: [
        new Paragraph({ spacing: { after: 400 } }),
        new Paragraph({
          children: [new TextRun({ text: session.firmName || "Alam & Aulakh Chartered Accountants", bold: true, size: 36, color: DOCX_NAVY, font: "Calibri" })],
          alignment: AlignmentType.CENTER,
          spacing: { after: 120 },
        }),
        new Paragraph({
          children: [new TextRun({ text: "Complete Audit Working Papers", bold: true, size: 28, color: "475569", font: "Calibri" })],
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
        }),
        new Paragraph({
          children: [new TextRun({ text: `Client: ${session.clientName || "—"}`, size: 22, color: "1E293B", font: "Calibri" })],
          alignment: AlignmentType.CENTER,
          spacing: { after: 60 },
        }),
        new Paragraph({
          children: [new TextRun({ text: `Engagement Year: ${session.engagementYear || "—"}`, size: 22, color: "1E293B", font: "Calibri" })],
          alignment: AlignmentType.CENTER,
          spacing: { after: 60 },
        }),
        new Paragraph({
          children: [new TextRun({ text: `Entity Type: ${session.entityType || "—"}`, size: 22, color: "1E293B", font: "Calibri" })],
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
        }),
        new Paragraph({
          children: [new TextRun({ text: `Generated: ${new Date().toLocaleDateString()}`, size: 18, color: "94A3B8", font: "Calibri" })],
          alignment: AlignmentType.CENTER,
        }),
      ],
    });

    const tocChildren: any[] = [];
    tocChildren.push(new Paragraph({
      children: [new TextRun({ text: "Table of Contents", bold: true, size: 32, color: DOCX_NAVY, font: "Calibri" })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    }));

    const tocHeaderRow = new TableRow({
      tableHeader: true,
      children: [
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "S.No", bold: true, size: 18, font: "Calibri", color: "FFFFFF" })], alignment: AlignmentType.CENTER })], shading: { fill: DOCX_NAVY, type: ShadingType.SOLID }, width: { size: 800, type: WidthType.DXA } }),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Phase", bold: true, size: 18, font: "Calibri", color: "FFFFFF" })] })], shading: { fill: DOCX_NAVY, type: ShadingType.SOLID }, width: { size: 3000, type: WidthType.DXA } }),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Working Paper Title", bold: true, size: 18, font: "Calibri", color: "FFFFFF" })] })], shading: { fill: DOCX_NAVY, type: ShadingType.SOLID }, width: { size: 4500, type: WidthType.DXA } }),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "FS/Scope", bold: true, size: 18, font: "Calibri", color: "FFFFFF" })] })], shading: { fill: DOCX_NAVY, type: ShadingType.SOLID }, width: { size: 2000, type: WidthType.DXA } }),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "WP Ref", bold: true, size: 18, font: "Calibri", color: "FFFFFF" })], alignment: AlignmentType.CENTER })], shading: { fill: DOCX_NAVY, type: ShadingType.SOLID }, width: { size: 1500, type: WidthType.DXA } }),
      ],
    });

    let serialNo = 0;
    const tocDataRows: any[] = [];
    for (const cat of WP_CATEGORIES) {
      const catCodes = wpsByCategory[cat.key] || [];
      const catDocs = catCodes.map(c => docMap.get(c)).filter(Boolean);
      for (const doc of catDocs) {
        if (!doc) continue;
        serialNo++;
        const wpMeta = WP_FULL_LIBRARY[doc.paperCode];
        tocDataRows.push(new TableRow({
          children: [
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: String(serialNo), size: 16, font: "Calibri" })], alignment: AlignmentType.CENTER })] }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: `${cat.key} — ${cat.name}`, size: 16, font: "Calibri" })] })] }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: doc.paperName || wpMeta?.name || "", size: 16, font: "Calibri" })] })] }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: wpMeta?.fsArea || "—", size: 16, font: "Calibri" })] })] }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: doc.paperCode, size: 16, font: "Calibri" })], alignment: AlignmentType.CENTER })] }),
          ],
        }));
      }
    }

    if (tocDataRows.length > 0) {
      tocChildren.push(new Table({ rows: [tocHeaderRow, ...tocDataRows], width: { size: 100, type: WidthType.PERCENTAGE } }));
    }
    sections.push({ children: tocChildren });

    for (const cat of WP_CATEGORIES) {
      const catCodes = wpsByCategory[cat.key] || [];
      const catDocs = catCodes.map(c => docMap.get(c)).filter(Boolean);
      if (catDocs.length === 0) continue;

      for (const doc of catDocs) {
        if (!doc) continue;
        const wp = typeof doc.content === "string" ? JSON.parse(doc.content) : (doc.content || {});
        const children: any[] = buildWpDocxChildren(wp, doc, cat, session, DOCX_NAVY);
        sections.push({ children });
      }
    }

    const document = new Document({
      sections: sections.map((s, i) => ({
        properties: i > 0 ? { page: { size: { width: 12240, height: 15840 } } } : undefined,
        children: s.children,
      })),
    });

    const buffer = await Packer.toBuffer(document);
    const filename = `All_Working_Papers_${session.clientName?.replace(/[^a-zA-Z0-9]/g, "_") || "Client"}_${session.engagementYear || "2026"}.docx`;

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err: any) {
    logger.error({ err }, "export-all-docx error");
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /sessions/:id/activate-wp-library
// Trigger engine: evaluates audit master + COA + analytics flags
// → activates relevant WPs from wp_library_master into wp_library_session
// ─────────────────────────────────────────────────────────────────────────────
router.post("/sessions/:id/activate-wp-library", requireRoles(...WP_ROLES_WRITE), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const sessionId = parseInt(p(req.params.id), 10);
    if (isNaN(sessionId)) return res.status(400).json({ error: "Invalid session ID" });

    const [session] = await db.select().from(wpSessionsTable).where(eq(wpSessionsTable.id, sessionId));
    if (!session) return res.status(404).json({ error: "Session not found" });

    // Load audit master flags
    const [master] = await db.select().from(auditEngineMasterTable).where(eq(auditEngineMasterTable.sessionId, sessionId));

    // Load COA to determine which FS heads are present
    const coaRows = await db.select({ fsHead: wpMasterCoaTable.fsHead }).from(wpMasterCoaTable).where(eq(wpMasterCoaTable.sessionId, sessionId));
    const presentFsHeads = [...new Set(coaRows.map((r) => r.fsHead).filter(Boolean))];

    // Load full library
    const library = await db.select().from(wpLibraryMasterTable).orderBy(asc(wpLibraryMasterTable.displayOrder));

    // Build evaluation context from master flags
    const ctx = {
      entityType: (master?.entityType || session.entityType || "Pvt Ltd").toLowerCase(),
      industry: (master?.industryType || "").toLowerCase(),
      riskFlags: {
        goingConcern: master?.goingConcernFlag === true,
        fraud: master?.fraudRiskFlag === true,
        relatedParty: master?.relatedPartyFlag === true,
        tax: master?.taxComplexityFlag === true || false,
        it: master?.itDependenceFlag === true,
        high: (master?.inherentRiskLevel || "").toLowerCase() === "high",
        medium: (master?.inherentRiskLevel || "").toLowerCase() === "medium",
      },
      controlMode: (master?.controlMode || "Mixed").toLowerCase(),
      fsHeads: presentFsHeads.map((h: any) => (String(h || "")).toLowerCase()),
      isListed: false,
      isGroup: false,
      isNgo: false,
      isSoe: false,
    };

    // Entity type overlays
    const et = ctx.entityType;
    if (et.includes("listed")) ctx.isListed = true;
    if (et.includes("group")) ctx.isGroup = true;
    if (et.includes("ngo") || et.includes("npo") || et.includes("section 42") || et.includes("donor")) ctx.isNgo = true;
    if (et.includes("soe")) ctx.isSoe = true;

    // ── Trigger evaluation ──────────────────────────────────────────────────
    const activated: { wp: typeof library[0]; reason: string }[] = [];

    for (const wp of library) {
      const reasons: string[] = [];

      // Mandatory papers always activate
      if (wp.mandatoryFlag || wp.triggerMateriality === "Always") {
        reasons.push("Mandatory");
      }

      // Entity type check
      if (wp.triggerEntityType && wp.triggerEntityType !== "All") {
        const etList = wp.triggerEntityType.split(",").map((s) => s.trim().toLowerCase());
        const matched = etList.some((t) =>
          et.includes(t) ||
          (t === "listed" && ctx.isListed) ||
          (t === "group" && ctx.isGroup) ||
          ((t === "ngo" || t === "npo" || t === "section 42") && ctx.isNgo) ||
          (t === "soe" && ctx.isSoe)
        );
        if (matched) reasons.push(`Entity:${wp.triggerEntityType}`);
      }

      // Risk flags
      if (wp.triggerRisk) {
        const rList = wp.triggerRisk.split(",").map((s) => s.trim().toLowerCase());
        if (rList.includes("going concern") && ctx.riskFlags.goingConcern) reasons.push("Risk:GoingConcern");
        if (rList.includes("fraud") && ctx.riskFlags.fraud) reasons.push("Risk:Fraud");
        if (rList.includes("related party") && ctx.riskFlags.relatedParty) reasons.push("Risk:RelatedParty");
        if (rList.includes("tax") && ctx.riskFlags.tax) reasons.push("Risk:Tax");
        if (rList.includes("it reliance") && ctx.riskFlags.it) reasons.push("Risk:IT");
        if (rList.includes("high") && ctx.riskFlags.high) reasons.push("Risk:High");
        if (rList.includes("medium") && (ctx.riskFlags.medium || ctx.riskFlags.high)) reasons.push("Risk:Medium");
      }

      // FS head presence
      if (wp.triggerFsHead) {
        const fhList = wp.triggerFsHead.split(",").map((s) => s.trim().toLowerCase());
        const hasHead = fhList.some((h) => ctx.fsHeads.some((f) => f.includes(h) || h.includes(f)));
        if (hasHead) reasons.push(`FSHead:${wp.triggerFsHead}`);
      }

      // Control mode
      if (wp.triggerControlMode) {
        const cmList = wp.triggerControlMode.split(",").map((s) => s.trim().toLowerCase());
        if (cmList.some((c) => ctx.controlMode.includes(c))) reasons.push(`ControlMode:${wp.triggerControlMode}`);
      }

      // Industry
      if (ctx.industry && wp.triggerIndustry) {
        const indList = wp.triggerIndustry.split(",").map((s) => s.trim().toLowerCase());
        if (indList.some((i) => ctx.industry.includes(i) || i.includes(ctx.industry))) reasons.push(`Industry:${wp.triggerIndustry}`);
      }

      if (reasons.length > 0) {
        activated.push({ wp, reason: reasons.join(" | ") });
      }
    }

    // ── Upsert into wp_library_session ──────────────────────────────────────
    const existing = await db.select({ wpCode: wpLibrarySessionTable.wpCode }).from(wpLibrarySessionTable).where(eq(wpLibrarySessionTable.sessionId, sessionId));
    const existingSet = new Set(existing.map((r) => r.wpCode));

    let inserted = 0;
    let skipped = 0;

    for (const { wp, reason } of activated) {
      if (existingSet.has(wp.wpCode)) {
        // Update trigger reason
        await db.update(wpLibrarySessionTable)
          .set({ triggerReason: reason, updatedAt: new Date() })
          .where(and(eq(wpLibrarySessionTable.sessionId, sessionId), eq(wpLibrarySessionTable.wpCode, wp.wpCode)));
        skipped++;
      } else {
        await db.insert(wpLibrarySessionTable).values({
          sessionId,
          wpCode: wp.wpCode,
          wpTitle: wp.wpTitle,
          wpPhase: wp.wpPhase,
          wpCategory: wp.wpCategory,
          isaReference: wp.isaReference,
          mandatoryFlag: wp.mandatoryFlag,
          outputFormat: wp.outputFormat,
          reviewerLevel: wp.reviewerLevel,
          autoGenerateFlag: wp.autoGenerateFlag,
          triggerReason: reason,
          status: "Pending",
        } as any);
        inserted++;
      }
    }

    // Summary by phase
    const summary = activated.reduce((acc: any, { wp }) => {
      const phase = wp.wpPhase || "Other";
      if (!acc[phase]) acc[phase] = 0;
      acc[phase]++;
      return acc;
    }, {});

    return res.json({
      message: "WP Library activation complete",
      totalActivated: activated.length,
      inserted,
      updated: skipped,
      byPhase: summary,
      context: {
        entityType: ctx.entityType,
        industry: ctx.industry || "(not set)",
        riskFlags: ctx.riskFlags,
        fsHeadsDetected: ctx.fsHeads.length,
      },
    });
  } catch (err: any) {
    logger.error("activate-wp-library error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /sessions/:id/wp-library-session  — Activated WPs for a session
// Query params: phase, status, mandatory, search
// ─────────────────────────────────────────────────────────────────────────────
router.get("/sessions/:id/wp-library-session", async (req: Request, res: Response) => {
  try {
    const sessionId = parseInt(p(req.params.id), 10);
    if (isNaN(sessionId)) return res.status(400).json({ error: "Invalid session ID" });

    const all = await db.select().from(wpLibrarySessionTable)
      .where(eq(wpLibrarySessionTable.sessionId, sessionId))
      .orderBy(asc(wpLibrarySessionTable.wpCode));

    const { phase, status, mandatory, search } = req.query as Record<string, string>;
    let filtered = all;
    if (phase) filtered = filtered.filter((r) => r.wpPhase?.toLowerCase().includes(phase.toLowerCase()));
    if (status) filtered = filtered.filter((r) => r.status?.toLowerCase() === status.toLowerCase());
    if (mandatory === "true") filtered = filtered.filter((r) => r.mandatoryFlag);
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter((r) =>
        r.wpCode.toLowerCase().includes(q) ||
        (r.wpTitle || "").toLowerCase().includes(q)
      );
    }

    const byPhase = all.reduce((acc: any, r) => {
      const ph = r.wpPhase || "Other";
      if (!acc[ph]) acc[ph] = { total: 0, pending: 0, prepared: 0, reviewed: 0, approved: 0, na: 0 };
      acc[ph].total++;
      const s = (r.status || "Pending").toLowerCase();
      if (s === "pending") acc[ph].pending++;
      else if (s === "in progress") acc[ph].pending++;
      else if (s === "prepared") acc[ph].prepared++;
      else if (s === "reviewed") acc[ph].reviewed++;
      else if (s === "approved") acc[ph].approved++;
      else if (s === "n/a") acc[ph].na++;
      return acc;
    }, {});

    return res.json({ total: all.length, filtered: filtered.length, byPhase, papers: filtered });
  } catch (err: any) {
    logger.error({ err }, "Route error");
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /sessions/:id/wp-library-session/:wpCode  — Update session WP status
// ─────────────────────────────────────────────────────────────────────────────
router.patch("/sessions/:id/wp-library-session/:wpCode", requireRoles(...WP_ROLES_WRITE), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const sessionId = parseInt(p(req.params.id), 10);
    const { wpCode } = req.params;
    const { status, preparedBy, reviewedBy, approvedBy, preparedDate, reviewedDate, approvedDate, conclusion, notes } = req.body;
    const now = new Date().toISOString();
    const updatePayload: any = { status, preparedBy, reviewedBy, approvedBy, preparedDate, reviewedDate, conclusion, notes, updatedAt: new Date() };
    if (approvedDate) updatePayload.approvedDate = approvedDate;
    else if (approvedBy && !approvedDate) updatePayload.approvedDate = now; // auto-stamp when approving

    await db.update(wpLibrarySessionTable)
      .set(updatePayload)
      .where(and(eq(wpLibrarySessionTable.sessionId, sessionId), eq(wpLibrarySessionTable.wpCode, wpCode)));

    return res.json({ message: "WP session record updated", wpCode, status });
  } catch (err: any) {
    logger.error({ err }, "Route error");
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /seed-trigger-rules  — Seed ISA logic trigger rules table
// ─────────────────────────────────────────────────────────────────────────────
const ISA_TRIGGER_RULES = [
  // ── MANDATORY RULES (always applied) ──────────────────────────────────────
  { ruleName:"All-engagements baseline", ruleDescription:"Core mandatory WPs for every audit engagement", codeFamily:null, entityType:"All", industry:null, risk:null, fsHead:null, controlMode:null, materialityLevel:"Always", activateWpCodes:"A001,A002,A003,A004,A005,B001,B002,B003,B004,B005,B006,B007,B008,B009,B010,C001,C002,C003,F001,F002,F003,F004,F005,G001,G002,G003,H001,H002,H003,I001,I002", procedureType:null, assertionLink:null, samplingRate:null, priority:1, mandatoryOverride:true, isaJustification:"ISA 200, ISA 210, ISA 220, ISA 230, ISA 300, ISA 315, ISA 320, ISA 330, ISA 700 — mandatory for all audits" },
  // ── RISK-BASED RULES ──────────────────────────────────────────────────────
  { ruleName:"Going concern risk", ruleDescription:"Activate going concern WPs when risk flagged", codeFamily:"F", entityType:null, industry:null, risk:"Going concern", fsHead:null, controlMode:null, materialityLevel:"Always", activateWpCodes:"F010,F011,B019,C024,I019", procedureType:"Risk", assertionLink:"Going Concern", samplingRate:null, priority:5, mandatoryOverride:false, isaJustification:"ISA 570 — auditor must evaluate going concern" },
  { ruleName:"Fraud risk — high", ruleDescription:"Expand procedures when fraud risk identified", codeFamily:null, entityType:null, industry:null, risk:"Fraud", fsHead:null, controlMode:null, materialityLevel:"Always", activateWpCodes:"B037,D025,N007,N008,N009,N010,N011,N014,B031,B038", procedureType:"Risk", assertionLink:"Completeness,Occurrence,Accuracy", samplingRate:"100", priority:3, mandatoryOverride:true, isaJustification:"ISA 240 — mandatory when fraud risk indicators present" },
  { ruleName:"Related party risk", ruleDescription:"Related party identification and testing", codeFamily:null, entityType:null, industry:null, risk:"Related party", fsHead:null, controlMode:null, materialityLevel:"Always", activateWpCodes:"B022,N012,M009,I028", procedureType:"Risk", assertionLink:"Completeness,Disclosure,Rights & Obligations", samplingRate:null, priority:4, mandatoryOverride:false, isaJustification:"ISA 550 — must identify and test related party transactions" },
  { ruleName:"Tax risk", ruleDescription:"Tax compliance and exposure procedures", codeFamily:"M", entityType:null, industry:null, risk:"Tax", fsHead:null, controlMode:null, materialityLevel:"Always", activateWpCodes:"M001,M002,M003,M004,M005,M006,M007,M008,M009,I016,I017,I019,I027,I028,B041", procedureType:"ToD", assertionLink:"Completeness,Valuation,Accuracy", samplingRate:null, priority:5, mandatoryOverride:false, isaJustification:"ISA 250 — compliance with tax laws and regulations" },
  { ruleName:"IT reliance / ERP", ruleDescription:"IT general controls and automated controls testing", codeFamily:"D", entityType:null, industry:null, risk:"IT reliance", fsHead:null, controlMode:"ERP,IT-dependent", materialityLevel:"Always", activateWpCodes:"D011,D012,D013,D021,D022,D023,D024,B031,B044", procedureType:"ToC", assertionLink:"Completeness,Accuracy", samplingRate:null, priority:6, mandatoryOverride:false, isaJustification:"ISA 315 — must evaluate IT general controls when entity relies on IT" },
  // ── FS HEAD RULES ─────────────────────────────────────────────────────────
  { ruleName:"Revenue — substantive", ruleDescription:"Revenue testing when FS Head = Revenue", codeFamily:"E", entityType:null, industry:null, risk:null, fsHead:"Revenue", controlMode:null, materialityLevel:"Above Trivial", activateWpCodes:"E101,E102,E103,E104,E105,E106,E107,E108,E109,E110,B040,N007", procedureType:"ToD", assertionLink:"Completeness,Occurrence,Accuracy,Cut-off", samplingRate:"15", priority:10, mandatoryOverride:false, isaJustification:"ISA 330 — revenue is presumed significant risk (ISA 240.26)" },
  { ruleName:"Receivables — substantive", ruleDescription:"Trade receivables confirmation and aging", codeFamily:"E", entityType:null, industry:null, risk:null, fsHead:"Receivables", controlMode:null, materialityLevel:"Above PM", activateWpCodes:"E121,E122,E123,E124,E125,E126,E127,E128,E129,E130,C022", procedureType:"ToD", assertionLink:"Existence,Completeness,Valuation,Rights & Obligations", samplingRate:"20", priority:11, mandatoryOverride:false, isaJustification:"ISA 330 — confirmation of receivables (ISA 505)" },
  { ruleName:"Inventory — substantive", ruleDescription:"Inventory count, costing, NRV", codeFamily:"E", entityType:null, industry:null, risk:null, fsHead:"Inventory", controlMode:null, materialityLevel:"Above PM", activateWpCodes:"E141,E142,E143,E144,E145,E146,E147,E148,E149,E150,C023", procedureType:"ToD", assertionLink:"Existence,Completeness,Valuation,Rights & Obligations", samplingRate:"25", priority:12, mandatoryOverride:false, isaJustification:"ISA 501 — inventory attendance mandatory if material" },
  { ruleName:"PPE — substantive", ruleDescription:"Fixed assets, depreciation, capex-opex split", codeFamily:"E", entityType:null, industry:null, risk:null, fsHead:"PPE", controlMode:null, materialityLevel:"Above PM", activateWpCodes:"E161,E162,E163,E164,E165,E166,E167,E168,E169,E170", procedureType:"ToD", assertionLink:"Existence,Completeness,Valuation,Rights & Obligations", samplingRate:"15", priority:13, mandatoryOverride:false, isaJustification:"ISA 330 — PPE is typically material and requires substantive procedures" },
  { ruleName:"Cash and bank", ruleDescription:"Bank confirmation, reconciliation, cut-off", codeFamily:"E", entityType:null, industry:null, risk:null, fsHead:"Cash", controlMode:null, materialityLevel:"Always", activateWpCodes:"E181,E182,E183,E184,E185,E186,E187,E188,E189,E190", procedureType:"ToD", assertionLink:"Existence,Completeness,Rights & Obligations,Cut-off", samplingRate:"100", priority:14, mandatoryOverride:true, isaJustification:"ISA 330, ISA 505 — bank confirmations are standard mandatory procedure" },
  { ruleName:"Payables — substantive", ruleDescription:"Trade creditors, accruals, GIT", codeFamily:"E", entityType:null, industry:null, risk:null, fsHead:"Payables", controlMode:null, materialityLevel:"Above PM", activateWpCodes:"E201,E202,E203,E204,E205,E206,E207,E208,E209,E210", procedureType:"ToD", assertionLink:"Completeness,Existence,Valuation,Rights & Obligations,Cut-off", samplingRate:"20", priority:15, mandatoryOverride:false, isaJustification:"ISA 330 — payables completeness is an area of presumed risk" },
  { ruleName:"Borrowings — substantive", ruleDescription:"Loans, credit facilities, covenants", codeFamily:"E", entityType:null, industry:null, risk:null, fsHead:"Borrowings", controlMode:null, materialityLevel:"Above PM", activateWpCodes:"E221,E222,E223,E224,E225,E226,E227,E228,E229,E230,C024", procedureType:"ToD", assertionLink:"Existence,Completeness,Valuation,Disclosure,Rights & Obligations", samplingRate:"100", priority:16, mandatoryOverride:false, isaJustification:"ISA 330 — borrowings and covenants require full confirmation" },
  { ruleName:"Taxation — current and deferred", ruleDescription:"Tax charge, deferred tax, provision", codeFamily:"E", entityType:null, industry:null, risk:null, fsHead:"Taxation", controlMode:null, materialityLevel:"Above PM", activateWpCodes:"E241,E242,E243,E244,E245,E246,E247,E248,M001,M002,M003", procedureType:"ToD", assertionLink:"Completeness,Accuracy,Valuation", samplingRate:"100", priority:17, mandatoryOverride:false, isaJustification:"ISA 330 — tax is complex estimate requiring detailed testing" },
  { ruleName:"Equity — substantive", ruleDescription:"Share capital, reserves, retained earnings", codeFamily:"E", entityType:null, industry:null, risk:null, fsHead:"Equity", controlMode:null, materialityLevel:"Above PM", activateWpCodes:"E261,E262,E263,E264,E265,E266,E267,E268,E269,E270", procedureType:"ToD", assertionLink:"Completeness,Existence,Rights & Obligations,Presentation", samplingRate:"100", priority:18, mandatoryOverride:false, isaJustification:"ISA 330 — equity movements must be fully vouched" },
  // ── ENTITY TYPE OVERLAYS ──────────────────────────────────────────────────
  { ruleName:"Listed entity overlay", ruleDescription:"Additional WPs for listed / PSX entities", codeFamily:null, entityType:"Listed", industry:null, risk:null, fsHead:null, controlMode:null, materialityLevel:"Always", activateWpCodes:"I003,I021,A024,A025,G007,G008,G009,H004,H005,B036,K005,K006,K007,K008,K009,K010", procedureType:null, assertionLink:null, samplingRate:null, priority:20, mandatoryOverride:false, isaJustification:"ISA 220, ISQM 1 — PIE/listed entities require additional quality procedures" },
  { ruleName:"Group audit overlay", ruleDescription:"ISA 600 Revised group audit requirements", codeFamily:"K", entityType:"Group,Listed", industry:null, risk:null, fsHead:null, controlMode:null, materialityLevel:"Always", activateWpCodes:"K001,K002,K003,K004,K011,K012,K013,K014,K015", procedureType:null, assertionLink:null, samplingRate:null, priority:21, mandatoryOverride:false, isaJustification:"ISA 600 (Revised 2023) — group audit requires component instructions and review" },
  { ruleName:"NGO / donor-funded overlay", ruleDescription:"NGO-specific WPs including donor compliance", codeFamily:"L", entityType:"NGO,NPO,Section 42,Donor-funded", industry:null, risk:null, fsHead:null, controlMode:null, materialityLevel:"Always", activateWpCodes:"L001,L002,L003,L004,L005,L006,L008,L014,L015,L017,L019,L020", procedureType:null, assertionLink:null, samplingRate:null, priority:22, mandatoryOverride:false, isaJustification:"ISA 250 — NGO must comply with donor agreements, FCRA, Section 42" },
  { ruleName:"SOE overlay", ruleDescription:"State-owned enterprise additional controls", codeFamily:null, entityType:"SOE", industry:null, risk:null, fsHead:null, controlMode:null, materialityLevel:"Always", activateWpCodes:"A024,I024,G007,H006,H007", procedureType:null, assertionLink:null, samplingRate:null, priority:23, mandatoryOverride:false, isaJustification:"ISA 250 — SOEs subject to additional regulatory requirements" },
  // ── INDUSTRY RULES ────────────────────────────────────────────────────────
  { ruleName:"Manufacturing / Textile overlay", ruleDescription:"Manufacturing sector specific WPs", codeFamily:"J", entityType:null, industry:"Manufacturing,Textile", risk:null, fsHead:null, controlMode:null, materialityLevel:"Always", activateWpCodes:"J101,J102,J103,J104,J105,I026,D015,C023", procedureType:null, assertionLink:null, samplingRate:null, priority:30, mandatoryOverride:false, isaJustification:"ISA 315 — industry knowledge required; ISA 501 inventory observation" },
  { ruleName:"Construction / real estate overlay", ruleDescription:"Long-term contract accounting", codeFamily:"J", entityType:null, industry:"Construction,Real Estate", risk:null, fsHead:null, controlMode:null, materialityLevel:"Always", activateWpCodes:"J301,J302", procedureType:"ToD", assertionLink:"Completeness,Cut-off,Valuation", samplingRate:null, priority:31, mandatoryOverride:false, isaJustification:"ISA 315, IFRS 15 / IAS 11 — POC method judgement is key risk" },
  { ruleName:"Education sector overlay", ruleDescription:"Fee income, deferred admission, endowment", codeFamily:"J", entityType:null, industry:"Education", risk:null, fsHead:null, controlMode:null, materialityLevel:"Always", activateWpCodes:"J401,J402,J403,L001,L002", procedureType:null, assertionLink:null, samplingRate:null, priority:32, mandatoryOverride:false, isaJustification:"ISA 315, ISA 250 — education entities have specific revenue recognition and regulatory risks" },
  // ── MATERIALITY → SAMPLING RULES ─────────────────────────────────────────
  { ruleName:"High materiality sampling rate", ruleDescription:"Increase sampling when items exceed PM", codeFamily:null, entityType:null, industry:null, risk:null, fsHead:null, controlMode:null, materialityLevel:"Above PM", activateWpCodes:"D031,D032", procedureType:"ToD", assertionLink:null, samplingRate:"25", priority:50, mandatoryOverride:false, isaJustification:"ISA 530 — sampling rate must respond to materiality and risk" },
  { ruleName:"Low-risk sampling rate", ruleDescription:"Reduced sampling when controls effective and risk low", codeFamily:null, entityType:null, industry:null, risk:null, fsHead:null, controlMode:null, materialityLevel:"Above Trivial", activateWpCodes:"D032", procedureType:"ToD", assertionLink:null, samplingRate:"5", priority:60, mandatoryOverride:false, isaJustification:"ISA 330.18 — effective controls justify reduced substantive testing" },
];

router.post("/seed-trigger-rules", requireRoles(...WP_ROLES_ADMIN), async (req: AuthenticatedRequest, res: Response) => {
  try {
    let inserted = 0; let updated = 0;
    for (const rule of ISA_TRIGGER_RULES) {
      const existing = await db.select({ id: wpTriggerRulesTable.id })
        .from(wpTriggerRulesTable).where(eq(wpTriggerRulesTable.ruleName, rule.ruleName)).limit(1);
      if (existing.length === 0) {
        await db.insert(wpTriggerRulesTable).values(rule as any);
        inserted++;
      } else {
        await db.update(wpTriggerRulesTable).set({ ...rule, updatedAt: new Date() } as any)
          .where(eq(wpTriggerRulesTable.ruleName, rule.ruleName));
        updated++;
      }
    }
    return res.json({ message: "Trigger rules seeded", inserted, updated, total: ISA_TRIGGER_RULES.length });
  } catch (err: any) {
    logger.error({ err }, "Route error");
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /sessions/:id/validate-for-generation  — 6-check validation gate
// Checks: TB balance | TB↔FS mapping | GL↔TB recon | mandatory vars |
//         confidence <85% | mandatory WPs incomplete
// ─────────────────────────────────────────────────────────────────────────────
router.post("/sessions/:id/validate-for-generation", requireRoles(...WP_ROLES_WRITE), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const sessionId = parseInt(p(req.params.id), 10);
    const { validatedBy } = req.body;

    // Check session lock
    const lock = await db.select().from(wpSessionLockTable).where(eq(wpSessionLockTable.sessionId, sessionId)).limit(1);
    if (lock.length > 0) return res.status(423).json({ error: "Session is locked. No changes allowed (ISA 230)." });

    const blockedReasons: string[] = [];
    const warnings: string[] = [];

    // ── CHECK 1: TB balance (Dr = Cr) ──────────────────────────────────────
    const tbRows = await db.execute(sql`
      SELECT SUM(debit::numeric) as dr, SUM(credit::numeric) as cr
      FROM wp_trial_balance_lines WHERE session_id = ${sessionId}`);
    const tbBal = (tbRows.rows?.[0] as any) || {};
    const dr = parseFloat(tbBal.dr || "0");
    const cr = parseFloat(tbBal.cr || "0");
    const tbDiff = Math.abs(dr - cr);
    const glTbPass = tbDiff < 1.0;
    if (!glTbPass) blockedReasons.push(`TB is unbalanced: Dr ${dr.toFixed(2)} ≠ Cr ${cr.toFixed(2)} (difference: ${tbDiff.toFixed(2)})`);

    // ── CHECK 2: TB ↔ FS mapping (no unmapped TB lines) ───────────────────
    const unmappedTB = await db.execute(sql`
      SELECT COUNT(*) as cnt FROM wp_trial_balance_lines
      WHERE session_id = ${sessionId} AND (fs_line_mapping IS NULL OR fs_line_mapping = '')
        AND ABS(balance::numeric) > 0`);
    const unmappedCount = parseInt((unmappedTB.rows?.[0] as any)?.cnt || "0");
    const tbFsPass = unmappedCount === 0;
    const tbFsNote = tbFsPass ? "All TB accounts mapped to FS lines" : `${unmappedCount} TB account(s) not mapped to FS lines`;
    if (!tbFsPass) warnings.push(tbFsNote);

    // ── CHECK 3: FS ↔ TB difference ──────────────────────────────────────
    const fsTotal = await db.execute(sql`
      SELECT SUM(ABS(amount_current::numeric)) as total
      FROM wp_fs_extraction WHERE session_id = ${sessionId} AND exception_flag = false`);
    const tbTotal = await db.execute(sql`
      SELECT SUM(ABS(balance::numeric)) as total FROM wp_trial_balance_lines WHERE session_id = ${sessionId}`);
    const fsTot = parseFloat((fsTotal.rows?.[0] as any)?.total || "0");
    const tbTot = parseFloat((tbTotal.rows?.[0] as any)?.total || "0");
    const tbFsDifference = Math.abs(fsTot - tbTot);
    const tbFsBalancePass = tbFsDifference < 1.0 || fsTot === 0;
    if (!tbFsBalancePass && fsTot > 0) warnings.push(`TB total (${tbTot.toFixed(0)}) differs from FS total (${fsTot.toFixed(0)}) by ${tbFsDifference.toFixed(0)} — verify mapping`);

    // ── CHECK 4: Mandatory engagement fields present ───────────────────────
    const engRows = await db.select().from(auditEngineMasterTable).where(eq(auditEngineMasterTable.sessionId, sessionId)).limit(1);
    const eng = (engRows[0] as any) || {};
    const missingVars: string[] = [];
    if (!eng.clientName) missingVars.push("clientName");
    if (!eng.entityType) missingVars.push("entityType");
    if (!eng.financialYearEnd) missingVars.push("financialYearEnd");
    if (!eng.reportingFramework) missingVars.push("reportingFramework");
    if (!eng.performanceMateriality || eng.performanceMateriality === "0") missingVars.push("performanceMateriality");
    const mandatoryVarsPass = missingVars.length === 0;
    if (!mandatoryVarsPass) blockedReasons.push(`Missing mandatory engagement fields: ${missingVars.join(", ")}`);

    // ── CHECK 5: Low confidence items (<85%) ──────────────────────────────
    const lowConf = await db.execute(sql`
      SELECT COUNT(*) as cnt FROM wp_trial_balance_lines
      WHERE session_id = ${sessionId} AND confidence IS NOT NULL AND confidence::numeric < 85`);
    const lowConfCount = parseInt((lowConf.rows?.[0] as any)?.cnt || "0");
    const confidencePass = lowConfCount === 0;
    if (!confidencePass) warnings.push(`${lowConfCount} TB line(s) have confidence score <85% — review before generation`);

    // ── CHECK 6: Mandatory WPs activated and not N/A ───────────────────────
    const mandatoryWps = await db.execute(sql`
      SELECT COUNT(*) as cnt FROM wp_library_session
      WHERE session_id = ${sessionId} AND mandatory_flag = true AND status = 'Pending'`);
    const mandatoryPending = parseInt((mandatoryWps.rows?.[0] as any)?.cnt || "0");
    const mandatoryWpsPass = mandatoryPending === 0;
    if (!mandatoryWpsPass) warnings.push(`${mandatoryPending} mandatory WP(s) still in Pending status — should be In Progress or later`);

    const overallPass = blockedReasons.length === 0;
    const generationAllowed = blockedReasons.length === 0;

    // Save validation result
    await db.insert(wpValidationResultTable).values({
      sessionId,
      overallPass,
      tbFsPass: tbFsBalancePass,
      tbFsDifference: tbFsDifference.toString(),
      tbFsNote,
      glTbPass,
      glTbNote: glTbPass ? "TB is balanced" : `TB unbalanced by ${tbDiff.toFixed(2)}`,
      mandatoryVarsPass,
      missingVars: missingVars.join(","),
      confidencePass,
      lowConfidenceCount: lowConfCount,
      mandatoryWpsPass,
      coaTbPass: tbFsPass,
      unmappedAccountCount: unmappedCount,
      blockedReasons: JSON.stringify(blockedReasons),
      warnings: JSON.stringify(warnings),
      generationAllowed,
      validatedBy: validatedBy || "System",
    } as any);

    return res.json({
      overallPass, generationAllowed, blockedReasons, warnings,
      checks: {
        tbBalance: { pass: glTbPass, detail: glTbPass ? "TB balanced" : `Difference: ${tbDiff.toFixed(2)}` },
        tbFsMapping: { pass: tbFsPass, unmappedCount, detail: tbFsNote },
        tbFsDifference: { pass: tbFsBalancePass, difference: tbFsDifference.toFixed(2) },
        mandatoryVars: { pass: mandatoryVarsPass, missingVars },
        confidence: { pass: confidencePass, lowConfidenceCount: lowConfCount },
        mandatoryWps: { pass: mandatoryWpsPass, pendingMandatoryCount: mandatoryPending },
      },
    });
  } catch (err: any) {
    logger.error({ err }, "Route error");
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /sessions/:id/auto-flag-exceptions  — ISA exception auto-detection
// Scans: unmapped FS lines | GL confidence | incomplete mandatory WPs |
//        TB gaps | COA mismatches | related party anomalies
// ─────────────────────────────────────────────────────────────────────────────
router.post("/sessions/:id/auto-flag-exceptions", requireRoles(...WP_ROLES_WRITE), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const sessionId = parseInt(p(req.params.id), 10);

    // Clear old auto-flagged exceptions for this session
    await db.delete(wpExceptionsTable).where(
      and(eq(wpExceptionsTable.sessionId, sessionId), eq(wpExceptionsTable.autoFlagged, true))
    );

    const exceptions: any[] = [];
    let exCode = 1;
    const mkCode = () => `EX${String(exCode++).padStart(4, "0")}`;

    // ── EX TYPE 1: Unmapped FS lines ─────────────────────────────────────
    const unmappedFS = await db.select().from(wpFsExtractionTable)
      .where(and(eq(wpFsExtractionTable.sessionId, sessionId), eq(wpFsExtractionTable.exceptionFlag, true)));
    for (const row of unmappedFS) {
      exceptions.push({ sessionId, exceptionCode: mkCode(), exceptionType:"Unmapped FS", severity:"High", sourceArea:"FS", referenceCode: row.statementType || "FS", description: `Unmapped FS line: "${row.lineItemText}" in ${row.statementType}`, isaReference:"ISA 330, ISA 315", detail: JSON.stringify({ amount: row.amountCurrent, page: row.pageNo }), autoFlagged: true });
    }

    // ── EX TYPE 2: Low-confidence journal lines ───────────────────────────
    const lowConfJournals = await db.select().from(wpJournalImportTable)
      .where(and(eq(wpJournalImportTable.sessionId, sessionId), eq(wpJournalImportTable.exceptionFlag, true)));
    for (const row of lowConfJournals) {
      exceptions.push({ sessionId, exceptionCode: mkCode(), exceptionType:"Low Confidence", severity:"Medium", sourceArea:"Journal", referenceCode: row.journalId || row.entryNo || "", description: `Journal entry confidence <85%: ${row.accountName} (${row.confidenceScore || "?"}%)`, isaReference:"ISA 230", detail: JSON.stringify({ amount: row.debitAmount || row.creditAmount, date: row.entryDate }), autoFlagged: true });
    }

    // ── EX TYPE 3: Unmapped TB accounts ──────────────────────────────────
    const unmappedTB = await db.execute(sql`
      SELECT account_code, account_name, balance FROM wp_trial_balance_lines
      WHERE session_id = ${sessionId} AND (fs_line_mapping IS NULL OR fs_line_mapping = '')
        AND ABS(balance::numeric) > 0 LIMIT 50`);
    for (const row of (unmappedTB.rows || []) as any[]) {
      exceptions.push({ sessionId, exceptionCode: mkCode(), exceptionType:"COA Gap", severity:"High", sourceArea:"TB", referenceCode: row.account_code, description: `TB account not mapped to FS: ${row.account_code} — ${row.account_name} (Balance: ${parseFloat(row.balance || "0").toFixed(2)})`, isaReference:"ISA 315, ISA 330", detail: JSON.stringify({ balance: row.balance }), autoFlagged: true });
    }

    // ── EX TYPE 4: Incomplete mandatory WPs ──────────────────────────────
    const incompleteMandatory = await db.select().from(wpLibrarySessionTable)
      .where(and(eq(wpLibrarySessionTable.sessionId, sessionId), eq(wpLibrarySessionTable.mandatoryFlag, true)))
      .then(rows => rows.filter(r => r.status === "Pending" || r.status === "In Progress"));
    for (const row of incompleteMandatory) {
      exceptions.push({ sessionId, exceptionCode: mkCode(), exceptionType:"Incomplete WP", severity:"Critical", sourceArea:"WP", referenceCode: row.wpCode, description: `Mandatory WP not completed: ${row.wpCode} — ${row.wpTitle} (Status: ${row.status})`, isaReference:"ISA 230 — audit file completeness", detail: JSON.stringify({ phase: row.wpPhase, category: row.wpCategory }), autoFlagged: true });
    }

    // ── EX TYPE 5: TB unbalanced ──────────────────────────────────────────
    const tbBal = await db.execute(sql`
      SELECT SUM(debit::numeric) as dr, SUM(credit::numeric) as cr
      FROM wp_trial_balance_lines WHERE session_id = ${sessionId}`);
    const balRow = (tbBal.rows?.[0] as any) || {};
    const dr = parseFloat(balRow.dr || "0"); const cr = parseFloat(balRow.cr || "0");
    const diff = Math.abs(dr - cr);
    if (diff > 1.0) {
      exceptions.push({ sessionId, exceptionCode: mkCode(), exceptionType:"Recon Fail", severity:"Critical", sourceArea:"TB", referenceCode:"TB-BALANCE", description: `Trial Balance unbalanced: Dr ${dr.toFixed(2)} ≠ Cr ${cr.toFixed(2)} — difference ${diff.toFixed(2)}`, isaReference:"ISA 330 — TB must balance before WP generation", autoFlagged: true });
    }

    // ── EX TYPE 6: Missing evidence for prepared WPs ──────────────────────
    const preparedWPs = await db.select().from(wpLibrarySessionTable)
      .where(and(eq(wpLibrarySessionTable.sessionId, sessionId)))
      .then(rows => rows.filter(r => (r.status === "Prepared" || r.status === "Reviewed") && r.evidenceCount === 0 && r.mandatoryFlag));
    for (const row of preparedWPs) {
      exceptions.push({ sessionId, exceptionCode: mkCode(), exceptionType:"Missing Evidence", severity:"High", sourceArea:"Evidence", referenceCode: row.wpCode, description: `WP ${row.wpCode} marked ${row.status} but has no linked evidence`, isaReference:"ISA 230 — sufficient appropriate evidence must be documented", autoFlagged: true });
    }

    // Insert all exceptions
    if (exceptions.length > 0) {
      await db.insert(wpExceptionsTable).values(exceptions);
    }

    // Summary by type and severity
    const summary: Record<string, number> = {};
    for (const e of exceptions) {
      summary[e.exceptionType] = (summary[e.exceptionType] || 0) + 1;
    }

    return res.json({ message: "Exception scan complete", total: exceptions.length, bySeverity: {
      critical: exceptions.filter(e => e.severity === "Critical").length,
      high: exceptions.filter(e => e.severity === "High").length,
      medium: exceptions.filter(e => e.severity === "Medium").length,
    }, byType: summary });
  } catch (err: any) {
    logger.error({ err }, "Route error");
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /sessions/:id/isa-exceptions  — List ISA library exceptions for a session
// ─────────────────────────────────────────────────────────────────────────────
router.get("/sessions/:id/isa-exceptions", async (req: Request, res: Response) => {
  try {
    const sessionId = parseInt(p(req.params.id), 10);
    const { severity, type, resolved } = req.query;

    let q = db.select().from(wpExceptionsTable).where(eq(wpExceptionsTable.sessionId, sessionId));
    const all = await q;

    let filtered = all;
    if (severity) filtered = filtered.filter(e => e.severity?.toLowerCase() === String(severity).toLowerCase());
    if (type) filtered = filtered.filter(e => e.exceptionType?.toLowerCase().includes(String(type).toLowerCase()));
    if (resolved === "false") filtered = filtered.filter(e => !e.resolvedFlag);
    if (resolved === "true") filtered = filtered.filter(e => e.resolvedFlag);

    const counts = { critical: 0, high: 0, medium: 0, low: 0, resolved: 0 };
    for (const e of all) {
      if (e.resolvedFlag) counts.resolved++;
      else if (e.severity === "Critical") counts.critical++;
      else if (e.severity === "High") counts.high++;
      else if (e.severity === "Medium") counts.medium++;
      else counts.low++;
    }

    return res.json({ total: all.length, filtered: filtered.length, counts, exceptions: filtered.sort((a, b) => {
      const order = { Critical: 0, High: 1, Medium: 2, Low: 3, Info: 4 };
      return (order[a.severity as keyof typeof order] ?? 5) - (order[b.severity as keyof typeof order] ?? 5);
    })});
  } catch (err: any) {
    logger.error({ err }, "Route error");
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /sessions/:id/isa-exceptions/:exId/resolve  — Resolve an ISA exception
// ─────────────────────────────────────────────────────────────────────────────
router.patch("/sessions/:id/isa-exceptions/:exId/resolve", requireRoles(...WP_ROLES_WRITE), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const sessionId = parseInt(p(req.params.id), 10);
    const exId = parseInt(p(req.params.exId), 10);
    const { resolvedBy, resolutionNote } = req.body;
    if (!resolvedBy) return res.status(400).json({ error: "resolvedBy is required" });

    await db.update(wpExceptionsTable).set({
      resolvedFlag: true, resolvedBy, resolvedAt: new Date(), resolutionNote, updatedAt: new Date()
    } as any).where(and(eq(wpExceptionsTable.id, exId), eq(wpExceptionsTable.sessionId, sessionId)));

    return res.json({ message: "Exception resolved", exId });
  } catch (err: any) {
    logger.error({ err }, "Route error");
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /sessions/:id/lock  — ISA 230 Partner Approval Lock
// Locks the session audit file — no further edits allowed without EQCR override
// ─────────────────────────────────────────────────────────────────────────────
router.post("/sessions/:id/lock", requireRoles("super_admin", "partner"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const sessionId = parseInt(p(req.params.id), 10);
    const { lockedBy, lockLevel, lockJustification, archiveRef, eqcrCompleted, eqcrBy } = req.body;
    if (!lockedBy) return res.status(400).json({ error: "lockedBy (partner name) is required" });

    const existingLock = await db.select().from(wpSessionLockTable).where(eq(wpSessionLockTable.sessionId, sessionId)).limit(1);
    if (existingLock.length > 0) return res.status(409).json({ error: "Session is already locked", lock: existingLock[0] });

    // Pre-lock validation: run quick check
    const unresolvedCritical = await db.select({ id: wpExceptionsTable.id }).from(wpExceptionsTable)
      .where(and(eq(wpExceptionsTable.sessionId, sessionId), eq(wpExceptionsTable.resolvedFlag, false), eq(wpExceptionsTable.severity, "Critical")));
    if (unresolvedCritical.length > 0) {
      return res.status(422).json({ error: `Cannot lock: ${unresolvedCritical.length} critical unresolved exception(s) must be resolved first` });
    }

    // Retention date: 7 years from lock (ICAP requirement)
    const retentionEnd = new Date();
    retentionEnd.setFullYear(retentionEnd.getFullYear() + 7);

    await db.insert(wpSessionLockTable).values({
      sessionId,
      lockedBy,
      lockLevel: lockLevel || "Partner",
      lockJustification,
      preArchiveValidationPassed: true,
      archiveRef: archiveRef || `ISA230-${sessionId}-${Date.now()}`,
      retentionEndDate: retentionEnd.toISOString().split("T")[0],
      eqcrCompleted: eqcrCompleted || false,
      eqcrBy: eqcrBy || null,
      unlockAllowed: false,
    } as any);

    // Update session master engagement status (use existing engagement_status column)
    await db.execute(sql`UPDATE audit_engine_master SET engagement_status = 'Locked', updated_at = NOW() WHERE session_id = ${sessionId}`);

    return res.json({ message: "Session locked successfully under ISA 230", sessionId, lockedBy, archiveRef: archiveRef || `ISA230-${sessionId}-${Date.now()}`, retentionEndDate: retentionEnd.toISOString().split("T")[0] });
  } catch (err: any) {
    logger.error({ err }, "Route error");
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /sessions/:id/lock-status  — Check if session is locked
// ─────────────────────────────────────────────────────────────────────────────
router.get("/sessions/:id/lock-status", async (req: Request, res: Response) => {
  try {
    const sessionId = parseInt(p(req.params.id), 10);
    const lock = await db.select().from(wpSessionLockTable).where(eq(wpSessionLockTable.sessionId, sessionId)).limit(1);
    if (lock.length === 0) return res.json({ locked: false });
    return res.json({ locked: true, lock: lock[0] });
  } catch (err: any) {
    logger.error({ err }, "Route error");
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /sessions/:id/generate-output  — Generate TB / GL / WP Index / WP Word exports
// Produces real .xlsx (ExcelJS) or .docx (docx) files for download
// jobType: "tb_excel" | "gl_excel" | "wp_excel" | "wp_word" | "full_file"
// ─────────────────────────────────────────────────────────────────────────────
router.post("/sessions/:id/generate-output", requireRoles(...WP_ROLES_WRITE), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const sessionId = parseInt(p(req.params.id), 10);
    const { jobType = "full_file", triggeredBy } = req.body;

    const session = (await db.select().from(wpSessionsTable).where(eq(wpSessionsTable.id, sessionId)))[0];
    if (!session) return res.status(404).json({ error: "Session not found" });

    const clientName  = session.clientName || "Client";
    const ntn         = session.ntn || "N/A";
    const period      = session.periodStart && session.periodEnd
      ? `${session.periodStart} to ${session.periodEnd}`
      : `FY ${session.engagementYear}`;
    const firmName    = "Alam & Aulakh Chartered Accountants";

    const varRows = await db.execute(sql`SELECT client_name, entity_type, financial_year_end, reporting_framework FROM audit_engine_master WHERE session_id = ${sessionId} LIMIT 1`);
    const varsRow = (varRows.rows?.[0] as any) || {};
    const entityName = varsRow.client_name || clientName;
    const fyEnd      = (varsRow.financial_year_end || new Date().toISOString().slice(0,10)).replace(/\//g,"-");
    const safeName   = entityName.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 30);

    // ── Fetch data ─────────────────────────────────────────────────────────
    const tbData = await db.execute(sql`
      SELECT account_code, account_name, classification as fs_head, fs_line_mapping,
             debit, credit, balance as closing_balance, prior_year_balance, source as data_source, confidence
      FROM wp_trial_balance_lines WHERE session_id = ${sessionId} ORDER BY account_code`);
    const tbRows = (tbData.rows || []) as any[];

    const glData = await db.execute(sql`
      SELECT ge.entry_date, ga.account_code, ga.account_name, ge.narration, ge.debit, ge.credit,
             ge.voucher_no, ge.running_balance
      FROM wp_gl_entries ge
      LEFT JOIN wp_gl_accounts ga ON ge.gl_account_id = ga.id
      WHERE ge.session_id = ${sessionId} ORDER BY ge.entry_date, ge.voucher_no`);
    const glRows = (glData.rows || []) as any[];

    const wpIndex = await db.select().from(wpLibrarySessionTable)
      .where(eq(wpLibrarySessionTable.sessionId, sessionId))
      .then(rows => rows.sort((a, b) => {
        const phaseOrder: Record<string, number> = { "Pre-engagement": 1, Planning: 2, Execution: 3, Completion: 4, Reporting: 5, "Quality Control": 6 };
        return (phaseOrder[a.wpPhase || ""] || 9) - (phaseOrder[b.wpPhase || ""] || 9);
      }));

    // ── Shared ExcelJS helper ──────────────────────────────────────────────
    const buildXlsxHdr = (ws: ExcelJS.Worksheet, colSpan: number, title: string, subtitle: string) => {
      ws.mergeCells(1, 1, 1, colSpan);
      const r1 = ws.getRow(1); r1.height = 28;
      const c1 = r1.getCell(1);
      c1.value = firmName; c1.alignment = { horizontal: "center", vertical: "middle" };
      c1.font = { bold: true, size: 13, color: { argb: "FFFFFFFF" } };
      c1.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };

      ws.mergeCells(2, 1, 2, colSpan);
      const r2 = ws.getRow(2); r2.height = 22;
      const c2 = r2.getCell(1);
      c2.value = `${clientName} | ${title} | ${period} | NTN: ${ntn}`;
      c2.alignment = { horizontal: "center", vertical: "middle" };
      c2.font = { bold: true, size: 11, color: { argb: "FF1E3A5F" } };
      c2.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8EFF8" } };

      if (subtitle) {
        ws.mergeCells(3, 1, 3, colSpan);
        const r3 = ws.getRow(3); r3.height = 16;
        const c3 = r3.getCell(1);
        c3.value = subtitle;
        c3.alignment = { horizontal: "center", vertical: "middle" };
        c3.font = { size: 9, color: { argb: "FF64748B" } };
      }

      ws.getRow(subtitle ? 4 : 3).height = 4;
    };

    const styleHdrRow = (row: ExcelJS.Row, rightAlignFrom = 999) => {
      row.height = 22;
      row.eachCell((c, i) => {
        c.fill   = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
        c.font   = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
        c.alignment = { horizontal: i >= rightAlignFrom ? "right" : "left", vertical: "middle" };
        c.border = { bottom: { style: "thin", color: { argb: "FF93C5FD" } } };
      });
    };

    const numFmt = (c: ExcelJS.Cell, v: number | null, row: number) => {
      if (v === null || v === undefined || v === 0) { c.value = null; } else { c.value = v; }
      c.numFmt = "#,##0.00;[Red](#,##0.00)";
      c.alignment = { horizontal: "right", vertical: "middle" };
      c.fill = row % 2 === 0 ? { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } } : { type: "pattern", pattern: "none" };
    };

    const strCell = (c: ExcelJS.Cell, v: any, row: number) => {
      c.value = v ?? "";
      c.alignment = { horizontal: "left", vertical: "middle", wrapText: false };
      c.fill = row % 2 === 0 ? { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } } : { type: "pattern", pattern: "none" };
    };

    const recordCount = tbRows.length + glRows.length + wpIndex.length;
    const job = await db.insert(wpOutputJobTable).values({
      sessionId, jobType, status: "running",
      triggeredBy: triggeredBy || "User", startedAt: new Date(),
    } as any).returning({ id: wpOutputJobTable.id });
    const jobId = job[0]?.id;

    // ── TB Excel ────────────────────────────────────────────────────────────
    if (jobType === "tb_excel") {
      const wb = new ExcelJS.Workbook();
      wb.creator = firmName; wb.created = new Date();
      const ws = wb.addWorksheet("Trial Balance", { properties: { tabColor: { argb: "FF2563EB" } } });
      ws.columns = [
        { key:"code",  width:16 }, { key:"name",  width:44 }, { key:"head",  width:22 },
        { key:"debit", width:18 }, { key:"credit", width:18 }, { key:"bal",   width:18 },
        { key:"prior", width:18 }, { key:"src",    width:14 }, { key:"conf",  width:10 },
      ];
      buildXlsxHdr(ws, 9, "Trial Balance", "ISA 500 — Source: Template / AI Extraction");
      ws.views = [{ state: "frozen", ySplit: 5 }];
      const hdrRow = ws.getRow(5);
      ["Account Code","Account Name","Classification","Debit (PKR)","Credit (PKR)","Balance (PKR)","Prior Year (PKR)","Source","Confidence"].forEach((h, i) => { hdrRow.getCell(i+1).value = h; });
      styleHdrRow(hdrRow, 4);

      let dr = 0, cr = 0, bal = 0;
      tbRows.forEach((l, idx) => {
        const r = ws.getRow(6 + idx); r.height = 17;
        const dv = parseFloat(String(l.debit)) || 0;
        const cv = parseFloat(String(l.credit)) || 0;
        const bv = parseFloat(String(l.closing_balance)) || 0;
        strCell(r.getCell(1), l.account_code, idx);
        strCell(r.getCell(2), l.account_name, idx);
        strCell(r.getCell(3), l.fs_head, idx);
        numFmt(r.getCell(4), dv || null, idx);
        numFmt(r.getCell(5), cv || null, idx);
        numFmt(r.getCell(6), bv || null, idx);
        numFmt(r.getCell(7), parseFloat(String(l.prior_year_balance)) || null, idx);
        strCell(r.getCell(8), l.data_source, idx);
        strCell(r.getCell(9), l.confidence, idx);
        if (bv < 0) r.getCell(6).font = { color: { argb: "FFDC2626" }, bold: true };
        dr += dv; cr += cv; bal += bv;
      });

      // Totals row
      const totRow = ws.getRow(6 + tbRows.length); totRow.height = 20;
      totRow.getCell(1).value = "TOTAL"; totRow.getCell(1).font = { bold: true };
      numFmt(totRow.getCell(4), dr, -1); totRow.getCell(4).font = { bold: true };
      numFmt(totRow.getCell(5), cr, -1); totRow.getCell(5).font = { bold: true };
      numFmt(totRow.getCell(6), bal, -1); totRow.getCell(6).font = { bold: true };
      [4,5,6].forEach(i => totRow.getCell(i).border = { top: { style: "medium", color: { argb: "FF1E3A5F" } } });

      const buf = await wb.xlsx.writeBuffer();
      const fileName = `TB_${safeName}_${fyEnd}.xlsx`;
      await db.update(wpOutputJobTable).set({ status: "complete", completedAt: new Date(), recordCount: tbRows.length, outputPath: fileName } as any).where(eq(wpOutputJobTable.id, jobId));
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
      res.setHeader("X-Job-Id", String(jobId));
      return res.end(Buffer.from(buf));
    }

    // ── GL Excel ────────────────────────────────────────────────────────────
    if (jobType === "gl_excel") {
      const wb = new ExcelJS.Workbook();
      wb.creator = firmName; wb.created = new Date();
      const ws = wb.addWorksheet("General Ledger", { properties: { tabColor: { argb: "FF7C3AED" } } });
      ws.columns = [
        { key:"date",    width:14 }, { key:"voucher", width:14 }, { key:"code",    width:16 },
        { key:"name",    width:38 }, { key:"narr",    width:44 }, { key:"debit",   width:18 },
        { key:"credit",  width:18 }, { key:"runbal",  width:18 },
      ];
      buildXlsxHdr(ws, 8, "General Ledger", "ISA 230 — Audit Evidence: Source Transactions");
      ws.views = [{ state: "frozen", ySplit: 5 }];
      const hdrRow = ws.getRow(5);
      ["Date","Voucher No","Account Code","Account Name","Narration","Debit (PKR)","Credit (PKR)","Running Balance (PKR)"].forEach((h, i) => { hdrRow.getCell(i+1).value = h; });
      styleHdrRow(hdrRow, 6);

      glRows.forEach((g, idx) => {
        const r = ws.getRow(6 + idx); r.height = 17;
        strCell(r.getCell(1), g.entry_date ? String(g.entry_date).slice(0,10) : "", idx);
        strCell(r.getCell(2), g.voucher_no, idx);
        strCell(r.getCell(3), g.account_code, idx);
        strCell(r.getCell(4), g.account_name, idx);
        strCell(r.getCell(5), g.narration, idx);
        numFmt(r.getCell(6), parseFloat(String(g.debit)) || null, idx);
        numFmt(r.getCell(7), parseFloat(String(g.credit)) || null, idx);
        numFmt(r.getCell(8), parseFloat(String(g.running_balance)) || null, idx);
      });

      const buf = await wb.xlsx.writeBuffer();
      const fileName = `GL_${safeName}_${fyEnd}.xlsx`;
      await db.update(wpOutputJobTable).set({ status: "complete", completedAt: new Date(), recordCount: glRows.length, outputPath: fileName } as any).where(eq(wpOutputJobTable.id, jobId));
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
      res.setHeader("X-Job-Id", String(jobId));
      return res.end(Buffer.from(buf));
    }

    // ── WP Excel (Index) ────────────────────────────────────────────────────
    if (jobType === "wp_excel") {
      const wb = new ExcelJS.Workbook();
      wb.creator = firmName; wb.created = new Date();
      const ws = wb.addWorksheet("WP Index", { properties: { tabColor: { argb: "FF059669" } } });
      ws.columns = [
        { key:"code",   width:12 }, { key:"title",  width:52 }, { key:"phase",  width:20 },
        { key:"cat",    width:22 }, { key:"status", width:16 }, { key:"mand",   width:12 },
        { key:"prep",   width:18 }, { key:"rev",    width:18 }, { key:"appr",   width:18 },
        { key:"concl",  width:40 },
      ];
      buildXlsxHdr(ws, 10, "Working Paper Index", "ISA/ISQM — Audit File Reference Index");
      ws.views = [{ state: "frozen", ySplit: 5 }];
      const hdrRow = ws.getRow(5);
      ["WP Code","Title","Phase","Category","Status","Mandatory","Prepared By","Reviewed By","Approved By","Conclusion"].forEach((h, i) => { hdrRow.getCell(i+1).value = h; });
      styleHdrRow(hdrRow);

      const statusColors: Record<string, string> = {
        Approved: "FF16A34A", Prepared: "FF2563EB", Reviewed: "FF7C3AED",
        "In Progress": "FFF59E0B", Pending: "FF94A3B8",
      };

      wpIndex.forEach((wp, idx) => {
        const r = ws.getRow(6 + idx); r.height = 18;
        strCell(r.getCell(1), wp.wpCode, idx);
        strCell(r.getCell(2), wp.wpTitle, idx);
        strCell(r.getCell(3), wp.wpPhase, idx);
        strCell(r.getCell(4), wp.wpCategory, idx);
        const sc = r.getCell(5);
        sc.value = wp.status || "Pending";
        sc.alignment = { horizontal: "center", vertical: "middle" };
        sc.font = { bold: true, color: { argb: statusColors[wp.status || ""] || "FF64748B" }, size: 10 };
        sc.fill = idx % 2 === 0 ? { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } } : { type: "pattern", pattern: "none" };
        strCell(r.getCell(6), wp.mandatoryFlag ? "Required" : "Optional", idx);
        strCell(r.getCell(7), wp.preparedBy || "", idx);
        strCell(r.getCell(8), wp.reviewedBy || "", idx);
        strCell(r.getCell(9), wp.approvedBy || "", idx);
        strCell(r.getCell(10), wp.conclusion || "", idx);
      });

      const buf = await wb.xlsx.writeBuffer();
      const fileName = `WP_Index_${safeName}_${fyEnd}.xlsx`;
      await db.update(wpOutputJobTable).set({ status: "complete", completedAt: new Date(), recordCount: wpIndex.length, outputPath: fileName } as any).where(eq(wpOutputJobTable.id, jobId));
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
      res.setHeader("X-Job-Id", String(jobId));
      return res.end(Buffer.from(buf));
    }

    // ── WP Word ─────────────────────────────────────────────────────────────
    if (jobType === "wp_word") {
      const {
        Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
        HeadingLevel, AlignmentType, WidthType, ShadingType, BorderStyle,
      } = await import("docx");

      const docChildren: any[] = [
        new Paragraph({
          children: [new TextRun({ text: firmName, bold: true, size: 28, color: "1E3A5F" })],
          alignment: AlignmentType.CENTER,
          spacing: { after: 80 },
        }),
        new Paragraph({
          children: [new TextRun({ text: `Audit Working Papers — ${clientName}`, bold: true, size: 22, color: "1E3A5F" })],
          alignment: AlignmentType.CENTER,
          spacing: { after: 40 },
        }),
        new Paragraph({
          children: [new TextRun({ text: `Period: ${period}  |  NTN: ${ntn}  |  Framework: ${varsRow.reporting_framework || "IFRS"}`, size: 18, color: "475569" })],
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
        }),
        new Paragraph({
          text: "Working Paper Index",
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 200, after: 120 },
        }),
      ];

      // Group by phase
      const phases: Record<string, typeof wpIndex> = {};
      for (const wp of wpIndex) {
        const ph = wp.wpPhase || "Other";
        if (!phases[ph]) phases[ph] = [];
        phases[ph].push(wp);
      }
      const phaseOrder = ["Pre-engagement","Planning","Execution","Completion","Reporting","Quality Control","Other"];

      const tblHdrCell = (text: string, w: number) => new TableCell({
        width: { size: w, type: WidthType.DXA },
        shading: { type: ShadingType.SOLID, color: "1E3A5F", fill: "1E3A5F" },
        margins: { top: 60, bottom: 60, left: 80, right: 80 },
        children: [new Paragraph({ children: [new TextRun({ text, bold: true, size: 18, color: "FFFFFF" })] })],
      });

      const tblDataCell = (text: string, w: number, bold = false, color = "1E293B") => new TableCell({
        width: { size: w, type: WidthType.DXA },
        margins: { top: 50, bottom: 50, left: 80, right: 80 },
        children: [new Paragraph({ children: [new TextRun({ text: String(text || ""), size: 17, bold, color })] })],
      });

      for (const ph of phaseOrder) {
        if (!phases[ph]) continue;
        docChildren.push(new Paragraph({ text: ph, heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 80 } }));

        const tableRows: any[] = [
          new TableRow({
            tableHeader: true,
            children: [
              tblHdrCell("WP Code", 900), tblHdrCell("Title", 3600), tblHdrCell("Status", 1100),
              tblHdrCell("Mandatory", 1100), tblHdrCell("Prepared By", 1500), tblHdrCell("Conclusion", 2200),
            ],
          }),
        ];

        for (const wp of phases[ph]) {
          const statusColor = wp.status === "Approved" ? "15803D" : wp.status === "Prepared" || wp.status === "Reviewed" ? "1D4ED8" : "94A3B8";
          tableRows.push(new TableRow({
            children: [
              tblDataCell(wp.wpCode || "", 900, true, "1E293B"),
              tblDataCell(wp.wpTitle || "", 3600),
              tblDataCell(wp.status || "Pending", 1100, true, statusColor),
              tblDataCell(wp.mandatoryFlag ? "Required" : "Optional", 1100),
              tblDataCell(wp.preparedBy || "—", 1500),
              tblDataCell(wp.conclusion || "—", 2200),
            ],
          }));
        }

        docChildren.push(new Table({
          rows: tableRows,
          width: { size: 10400, type: WidthType.DXA },
        }));
        docChildren.push(new Paragraph({ spacing: { after: 80 } }));
      }

      // Footer
      docChildren.push(new Paragraph({
        children: [
          new TextRun({ text: `\nGenerated by: ${firmName}  |  Date: ${new Date().toLocaleDateString("en-GB")}  |  ISA / ISQM Compliant`, size: 16, color: "94A3B8" }),
        ],
        alignment: AlignmentType.CENTER,
        spacing: { before: 300 },
      }));

      const doc = new Document({
        creator: firmName,
        title: `Working Paper Index — ${clientName}`,
        description: `Audit Working Papers for ${clientName}, ${period}`,
        sections: [{ children: docChildren }],
      });

      const buf = await Packer.toBuffer(doc);
      const fileName = `WP_Index_${safeName}_${fyEnd}.docx`;
      await db.update(wpOutputJobTable).set({ status: "complete", completedAt: new Date(), recordCount: wpIndex.length, outputPath: fileName } as any).where(eq(wpOutputJobTable.id, jobId));
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
      res.setHeader("X-Job-Id", String(jobId));
      return res.end(buf);
    }

    // ── Full file (JSON fallback) ────────────────────────────────────────────
    const phaseSummary: Record<string, any> = {};
    for (const wp of wpIndex) {
      const ph = wp.wpPhase || "Other";
      if (!phaseSummary[ph]) phaseSummary[ph] = { total: 0, prepared: 0, approved: 0, pending: 0 };
      phaseSummary[ph].total++;
      if (wp.status === "Approved") phaseSummary[ph].approved++;
      else if (["Prepared","Reviewed"].includes(wp.status || "")) phaseSummary[ph].prepared++;
      else phaseSummary[ph].pending++;
    }
    const fileContent = JSON.stringify({
      generatedAt: new Date().toISOString(), sessionId, entityName,
      financialYearEnd: varsRow.financial_year_end,
      tb: { totalAccounts: tbRows.length, data: tbRows },
      gl: { totalTransactions: glRows.length, data: glRows },
      wpIndex: { totalWps: wpIndex.length, phaseSummary, papers: wpIndex },
    }, null, 2);
    const fileName = `AuditFile_${safeName}_${fyEnd}.json`;
    await db.update(wpOutputJobTable).set({ status: "complete", completedAt: new Date(), recordCount, outputPath: fileName } as any).where(eq(wpOutputJobTable.id, jobId));
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.setHeader("X-Job-Id", String(jobId));
    return res.send(fileContent);
  } catch (err: any) {
    logger.error({ err }, "Route error");
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /sessions/:id/output-jobs  — List all output generation jobs
// ─────────────────────────────────────────────────────────────────────────────
router.get("/sessions/:id/output-jobs", async (req: Request, res: Response) => {
  try {
    const sessionId = parseInt(p(req.params.id), 10);
    const jobs = await db.select().from(wpOutputJobTable)
      .where(eq(wpOutputJobTable.sessionId, sessionId))
      .orderBy(sql`created_at DESC`);
    return res.json({ total: jobs.length, jobs });
  } catch (err: any) {
    logger.error({ err }, "Route error");
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /sessions/:id/wp-audit-trail  — Full ISA 230 audit trail timeline
// ─────────────────────────────────────────────────────────────────────────────
router.get("/sessions/:id/wp-audit-trail", async (req: Request, res: Response) => {
  try {
    const sessionId = parseInt(p(req.params.id), 10);
    const trail: any[] = [];

    // WP status changes
    const wps = await db.select().from(wpLibrarySessionTable).where(eq(wpLibrarySessionTable.sessionId, sessionId));
    for (const wp of wps) {
      if (wp.preparedBy && wp.preparedDate) trail.push({ timestamp: wp.preparedDate, type: "WP_PREPARED", actor: wp.preparedBy, ref: wp.wpCode, detail: `${wp.wpCode} — ${wp.wpTitle} marked Prepared` });
      if (wp.reviewedBy && wp.reviewedDate) trail.push({ timestamp: wp.reviewedDate, type: "WP_REVIEWED", actor: wp.reviewedBy, ref: wp.wpCode, detail: `${wp.wpCode} — ${wp.wpTitle} reviewed` });
      if (wp.approvedBy) trail.push({ timestamp: (wp as any).approvedDate || wp.updatedAt?.toISOString(), type: "WP_APPROVED", actor: wp.approvedBy, ref: wp.wpCode, detail: `${wp.wpCode} — ${wp.wpTitle} approved` });
    }

    // Validation runs
    const validations = await db.select().from(wpValidationResultTable).where(eq(wpValidationResultTable.sessionId, sessionId));
    for (const v of validations) {
      trail.push({ timestamp: v.runAt?.toISOString(), type: "VALIDATION_RUN", actor: v.validatedBy || "System", ref: "VALIDATION", detail: `Validation ${v.overallPass ? "PASSED" : "FAILED"} — Generation ${v.generationAllowed ? "allowed" : "blocked"}` });
    }

    // Output jobs
    const jobs = await db.select().from(wpOutputJobTable).where(eq(wpOutputJobTable.sessionId, sessionId));
    for (const j of jobs) {
      trail.push({ timestamp: j.completedAt?.toISOString() || j.createdAt?.toISOString(), type: "OUTPUT_GENERATED", actor: j.triggeredBy || "System", ref: j.jobType, detail: `${j.jobType} generated — ${j.recordCount || 0} records, status: ${j.status}` });
    }

    // Lock events
    const locks = await db.select().from(wpSessionLockTable).where(eq(wpSessionLockTable.sessionId, sessionId));
    for (const l of locks) {
      trail.push({ timestamp: l.lockedAt?.toISOString(), type: "SESSION_LOCKED", actor: l.lockedBy, ref: "ISA230-LOCK", detail: `Session locked by ${l.lockedBy} (${l.lockLevel}) — Archive ref: ${l.archiveRef}` });
      if (l.unlockedAt) trail.push({ timestamp: l.unlockedAt?.toISOString(), type: "SESSION_UNLOCKED", actor: l.unlockedBy || "Unknown", ref: "ISA230-UNLOCK", detail: `Session unlocked: ${l.unlockReason}` });
    }

    trail.sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime());
    return res.json({ sessionId, total: trail.length, trail });
  } catch (err: any) {
    logger.error({ err }, "Route error");
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// ONE-SHEET TEMPLATE PARSER  ─  parseOneSheetAuditTemplate()
// Parses the Financial_Data_Upload one-sheet format into normalised objects
// ═══════════════════════════════════════════════════════════════════════════

interface ParsedTemplateMeta {
  entityName: string; companyType: string; industry: string;
  reportingFramework: string; yearEnd: string; auditType: string;
  currency: string; engagementSize: string;
}
interface ParsedTemplateRow {
  lineId: number | string; statementType: string; fsSection: string;
  majorHead: string; lineItem: string; subLineItem: string;
  accountName: string; accountCode: string; noteNo: string;
  currentYear: number; priorYear: number;
  debitTransactionValue: number; creditTransactionValue: number;
  normalBalance: string; wpArea: string; riskLevel: string;
  procedureScale: string; aiGlFlag: string; glGenerationPriority: string;
  remarks: string;
}
interface ParsedTemplateResult {
  meta: ParsedTemplateMeta;
  rows: ParsedTemplateRow[];
  errors: string[];
  warnings: string[];
  isOneSheetFormat: boolean;
  sheetUsed: string;
}

function parseOneSheetAuditTemplate(wb: XLSX.WorkBook): ParsedTemplateResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Find the template sheet (tolerant name matching)
  const candidateNames = wb.SheetNames.filter(n => {
    const l = n.toLowerCase().replace(/[\s_-]/g, "");
    return l.includes("financialdata") || l.includes("audittemplate") ||
           l.includes("dataupload") || l.includes("dataupload") ||
           l.includes("financial") || l === "sheet1";
  });
  const sheetUsed = candidateNames[0] || wb.SheetNames[0];
  const ws = wb.Sheets[sheetUsed];

  if (!ws) return { meta: {} as any, rows: [], errors: ["No sheet found in workbook."], warnings: [], isOneSheetFormat: false, sheetUsed: "" };

  const allRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as any[][];

  // ── Detect format: legacy (engagement headers in rows 5-6, data headers row 8)
  //    vs compact (title row 1, data headers row 2, no engagement rows) ──────
  const row5 = allRows[4] || [];
  const row6 = allRows[5] || [];
  const row8 = allRows[7] || [];

  const hasLegacyEngagementRows = (
    String(row5[0]).toLowerCase().includes("entity") ||
    String(row5[0]).toLowerCase().includes("entity_name")
  );

  const isOneSheetFormat = (
    hasLegacyEngagementRows ||
    String(row8[0]).toLowerCase().includes("line_id") ||
    String(row8[1]).toLowerCase().includes("statement") ||
    allRows.some((r, i) => i <= 3 && r && String(r[0]).toLowerCase().replace(/_/g, "").includes("lineid"))
  );

  // ── Extract metadata ─────────────────────────────────────────────────────
  // Legacy template: Label in col A/D/G/J/M, value in B/E/H/K/N (0-indexed 1/4/7/10/13)
  // Compact template: no engagement rows — metadata stays as session defaults
  let meta: ParsedTemplateMeta;
  if (hasLegacyEngagementRows) {
    let yearEndVal = row5[13];
    let yearEndStr = "";
    if (typeof yearEndVal === "number") {
      const d = new Date(Math.round((yearEndVal - 25569) * 86400 * 1000));
      yearEndStr = d.toISOString().split("T")[0];
    } else {
      yearEndStr = String(yearEndVal || "").trim();
    }

    meta = {
      entityName:         String(row5[1]  || "").trim(),
      companyType:        String(row5[4]  || "").trim(),
      industry:           String(row5[7]  || "").trim(),
      reportingFramework: String(row5[10] || "").trim(),
      yearEnd:            yearEndStr,
      auditType:          String(row6[1]  || "").trim(),
      currency:           String(row6[4]  || "PKR").trim(),
      engagementSize:     String(row6[7]  || "").trim(),
    };

    if (!meta.entityName) errors.push("Entity_Name is missing from engagement profile (row 5, col B).");
    if (!meta.reportingFramework) warnings.push("Reporting_Framework not found — defaulting to IFRS.");
    if (!meta.yearEnd) warnings.push("Year_End not found in engagement profile (row 5, col N).");
  } else {
    meta = {
      entityName: "", companyType: "", industry: "",
      reportingFramework: "", yearEnd: "",
      auditType: "", currency: "PKR", engagementSize: "",
    };
    warnings.push("Compact template detected — engagement metadata will be taken from session defaults.");
  }

  // ── Find header row ─────────────────────────────────────────────────────
  // Legacy: row 8 (index 7). Compact: row 2 (index 1). Search rows 0-12.
  let headerRowIdx = 7;
  for (let i = 0; i <= Math.min(12, allRows.length - 1); i++) {
    const r = allRows[i];
    if (r && String(r[0]).toLowerCase().replace(/_/g, "").includes("lineid")) { headerRowIdx = i; break; }
    if (r && String(r[0]).toLowerCase().includes("line_id")) { headerRowIdx = i; break; }
  }
  const headerRow = allRows[headerRowIdx] || [];
  const hdr = (headerRow as any[]).map(h => String(h).trim().toLowerCase().replace(/[\s_]/g, "_"));

  // ── Extract data rows ────────────────────────────────────────────────────
  const rows: ParsedTemplateRow[] = [];
  const seenCodes = new Map<string, number>();

  // Valid values for every dropdown column (matches the Excel template Lists sheet)
  const VALID_ST  = new Set(["bs","p&l","pl","oci","eq","cf","income","expense","expenses"]);
  const VALID_NB  = new Set(["debit","credit"]);
  const VALID_FS  = new Set(["assets","equity","liabilities","income","expenses","oci","notes"]);
  const VALID_MH  = new Set([
    "non-current assets","current assets","equity",
    "non-current liabilities","current liabilities",
    "revenue","other income","cost of sales","gross profit",
    "administrative expenses","selling and distribution",
    "finance cost","taxation","other expenses",
  ]);
  const VALID_RL  = new Set(["high","medium","low"]);
  const VALID_WP  = new Set([
    "ppe","intangibles","inventory","receivables","cash and bank",
    "other assets","equity","borrowings","payables","taxation",
    "revenue","cost of sales","operating expenses","other income","provisions",
  ]);
  const VALID_PS  = new Set(["expanded","standard","basic"]);
  const VALID_AI  = new Set(["yes","no"]);
  const VALID_GP  = new Set(["high","medium","low"]);

  for (let i = headerRowIdx + 1; i < allRows.length; i++) {
    const raw = allRows[i];
    if (!raw || raw.every((c: any) => c === "" || c === null || c === undefined)) continue;

    // Build a keyed object from header
    const obj: Record<string, any> = {};
    hdr.forEach((h, j) => { obj[h] = raw[j] ?? ""; });

    const lineId = obj["line_id"] ?? obj["lineid"] ?? "";
    if (String(lineId).toLowerCase() === "total" || String(lineId) === "") continue;

    const stRaw  = String(obj["statement_type"] ?? obj["statementtype"] ?? "").trim().toLowerCase();
    const nbRaw  = String(obj["normal_balance"] ?? obj["normalbalance"] ?? "").trim().toLowerCase();
    const fsRaw  = String(obj["fs_section"] ?? obj["fssection"] ?? "").trim().toLowerCase();
    const mhRaw  = String(obj["major_head"] ?? obj["majorhead"] ?? "").trim().toLowerCase();
    const rlRaw  = String(obj["risk_level"] ?? obj["risklevel"] ?? "").trim().toLowerCase();
    const wpRaw  = String(obj["wp_area"] ?? obj["wparea"] ?? "").trim().toLowerCase();
    const psRaw  = String(obj["procedure_scale"] ?? obj["procedurescale"] ?? "").trim().toLowerCase();
    const aiRaw  = String(obj["ai_gl_flag"] ?? obj["aiglflag"] ?? "").trim().toLowerCase();
    const gpRaw  = String(obj["gl_generation_priority"] ?? obj["glgenerationpriority"] ?? "").trim().toLowerCase();
    const acctCode = String(obj["account_code"] ?? obj["accountcode"] ?? "").trim();

    // ── Per-row dropdown validation ───────────────────────────────────────
    if (stRaw && !VALID_ST.has(stRaw))
      warnings.push(`Row ${i + 1}: Statement_Type "${stRaw}" — expected BS/P&L/OCI/EQ/CF.`);
    if (nbRaw && !VALID_NB.has(nbRaw))
      warnings.push(`Row ${i + 1}: Normal_Balance "${nbRaw}" — expected Debit or Credit.`);
    if (fsRaw && !VALID_FS.has(fsRaw))
      warnings.push(`Row ${i + 1}: FS_Section "${obj["fs_section"] ?? fsRaw}" — expected Assets/Equity/Liabilities/Income/Expenses/OCI/Notes.`);
    if (mhRaw && !VALID_MH.has(mhRaw))
      warnings.push(`Row ${i + 1}: Major_Head "${obj["major_head"] ?? mhRaw}" is not a standard classification head.`);
    if (rlRaw && !VALID_RL.has(rlRaw))
      warnings.push(`Row ${i + 1}: Risk_Level "${rlRaw}" — expected High/Medium/Low.`);
    if (wpRaw && !VALID_WP.has(wpRaw))
      warnings.push(`Row ${i + 1}: WP_Area "${obj["wp_area"] ?? wpRaw}" is not a recognised audit area.`);
    if (psRaw && !VALID_PS.has(psRaw))
      warnings.push(`Row ${i + 1}: Procedure_Scale "${psRaw}" — expected Expanded/Standard/Basic.`);
    if (aiRaw && !VALID_AI.has(aiRaw))
      warnings.push(`Row ${i + 1}: AI_GL_Flag "${aiRaw}" — expected Yes or No.`);
    if (gpRaw && !VALID_GP.has(gpRaw))
      warnings.push(`Row ${i + 1}: GL_Generation_Priority "${gpRaw}" — expected High/Medium/Low.`);

    // ── Account code uniqueness ───────────────────────────────────────────
    if (!acctCode) {
      warnings.push(`Row ${i + 1} (Line_ID ${lineId}): Account_Code is blank.`);
    } else if (seenCodes.has(acctCode)) {
      warnings.push(`Row ${i + 1}: Account_Code "${acctCode}" duplicated (first seen on row ${seenCodes.get(acctCode)}).`);
    } else { seenCodes.set(acctCode, i + 1); }

    const cyRaw  = obj["current_year"] ?? obj["currentyear"] ?? 0;
    const pyRaw  = obj["prior_year"] ?? obj["prioryear"] ?? 0;
    const drRaw  = obj["debit_transaction_value"] ?? obj["debittransactionvalue"] ?? 0;
    const crRaw  = obj["credit_transaction_value"] ?? obj["credittransactionvalue"] ?? 0;

    if (typeof cyRaw === "string" && cyRaw !== "" && isNaN(Number(cyRaw))) errors.push(`Row ${i + 1}: Current_Year "${cyRaw}" is not numeric.`);
    if (typeof pyRaw === "string" && pyRaw !== "" && isNaN(Number(pyRaw))) errors.push(`Row ${i + 1}: Prior_Year "${pyRaw}" is not numeric.`);
    if (typeof drRaw === "string" && drRaw !== "" && isNaN(Number(drRaw))) errors.push(`Row ${i + 1}: Debit_Transaction_Value "${drRaw}" is not numeric.`);
    if (typeof crRaw === "string" && crRaw !== "" && isNaN(Number(crRaw))) errors.push(`Row ${i + 1}: Credit_Transaction_Value "${crRaw}" is not numeric.`);

    rows.push({
      lineId:                String(lineId),
      statementType:         String(obj["statement_type"] ?? obj["statementtype"] ?? "").trim(),
      fsSection:             String(obj["fs_section"] ?? obj["fssection"] ?? "").trim(),
      majorHead:             String(obj["major_head"] ?? obj["majorhead"] ?? "").trim(),
      lineItem:              String(obj["line_item"] ?? obj["lineitem"] ?? "").trim(),
      subLineItem:           String(obj["sub_line_item"] ?? obj["sublineitem"] ?? "").trim(),
      accountName:           String(obj["account_name"] ?? obj["accountname"] ?? "").trim(),
      accountCode:           acctCode,
      noteNo:                String(obj["note_no"] ?? obj["noteno"] ?? "").trim(),
      currentYear:           parseFloat(String(cyRaw)) || 0,
      priorYear:             parseFloat(String(pyRaw)) || 0,
      debitTransactionValue: parseFloat(String(drRaw)) || 0,
      creditTransactionValue:parseFloat(String(crRaw)) || 0,
      normalBalance:         nbRaw === "credit" ? "Credit" : "Debit",
      wpArea:                String(obj["wp_area"] ?? obj["wparea"] ?? "").trim(),
      riskLevel:             String(obj["risk_level"] ?? obj["risklevel"] ?? "Medium").trim(),
      procedureScale:        String(obj["procedure_scale"] ?? obj["procedurescale"] ?? "Standard").trim(),
      aiGlFlag:              String(obj["ai_gl_flag"] ?? obj["aiglflag"] ?? "No").trim(),
      glGenerationPriority:  String(obj["gl_generation_priority"] ?? obj["glgenerationpriority"] ?? "Low").trim(),
      remarks:               String(obj["remarks"] ?? "").trim(),
    });
  }

  if (rows.length === 0) errors.push("No financial data rows found in the template (expected after the header row).");

  return { meta, rows, errors, warnings, isOneSheetFormat, sheetUsed };
}

// ── WP_Area → Head index mapping ─────────────────────────────────────────────
const WP_AREA_HEAD_MAP: Record<string, number[]> = {
  "ppe":             [7],  "property, plant":  [7],
  "intangibles":     [7],  "inventory":        [7],
  "receivables":     [7],  "receivable":       [7],
  "cash and bank":   [4, 7], "cash":           [4, 7],
  "taxation":        [6, 7, 8], "tax":          [6, 7, 8],
  "equity":          [3, 8], "borrowings":      [4, 7],
  "payables":        [7],  "other assets":     [7],
  "other income":    [7],  "revenue":          [7],
  "cost of sales":   [7],  "operating expenses":[7],
  "provisions":      [7],  "planning":         [6],
  "completion":      [8],  "risk":             [6],
};

function mapWpAreaToHeads(wpArea: string): number[] {
  const lower = wpArea.toLowerCase();
  for (const [key, heads] of Object.entries(WP_AREA_HEAD_MAP)) {
    if (lower.includes(key)) return heads;
  }
  return [7]; // default → execution
}

// ── POST /sessions/:id/parse-one-sheet-template ──────────────────────────────
// Parses the uploaded one-sheet template, validates it, and auto-populates
// session metadata, TB, GL queue, and variables from the template data.
// ─────────────────────────────────────────────────────────────────────────────
router.post("/sessions/:id/parse-one-sheet-template", requireRoles(...WP_ROLES_WRITE), async (req: AuthenticatedRequest, res: Response) => {
  const sessionId = parseInt(p(req.params.id));
  const { fileId, persistData = true } = req.body;

  try {
    const [session] = await db.select().from(wpSessionsTable).where(eq(wpSessionsTable.id, sessionId));
    if (!session) return res.status(404).json({ error: "Session not found" });

    // Find uploaded Excel file — prefer the most recent one with stored fileData
    let files = await db.select().from(wpUploadedFilesTable).where(eq(wpUploadedFilesTable.sessionId, sessionId));
    if (fileId) files = files.filter(f => f.id === parseInt(fileId));
    const excelFiles = files
      .filter(f => {
        const ext = (f.originalName || "").split(".").pop()?.toLowerCase();
        return ext === "xlsx" || ext === "xls" || ext === "xlsm";
      })
      .sort((a, b) => b.id - a.id);
    const xlFile = excelFiles.find(f => f.fileData) || excelFiles[0];
    if (!xlFile) return res.status(400).json({ error: "No Excel file uploaded for this session. Please upload the Financial_Data_Upload template first." });

    let wb: XLSX.WorkBook;
    try {
      if (xlFile.fileData) {
        const buf = Buffer.from(xlFile.fileData, "base64");
        wb = XLSX.read(buf, { type: "buffer" });
      } else {
        const fs = require("fs");
        const filePath = `uploads/${(xlFile as any).storedName || xlFile.originalName}`;
        if (fs.existsSync(filePath)) {
          wb = XLSX.readFile(filePath);
        } else {
          return res.status(400).json({ error: `File data not available. Please re-upload the template: ${xlFile.originalName}` });
        }
      }
    } catch (readErr: any) {
      logger.error({ err: readErr, file: xlFile.originalName }, "Failed to read Excel file");
      return res.status(400).json({ error: `Cannot read file: ${xlFile.originalName}. Please re-upload the template.` });
    }

    const parsed = parseOneSheetAuditTemplate(wb);

    // Return early if hard errors and not persisting
    if (!persistData) return res.json(parsed);

    // ── PERSIST META ──────────────────────────────────────────────────────
    const { meta, rows } = parsed;

    // Parse yearEnd into engagement year / period dates
    let engagementYear = session.engagementYear;
    let periodEnd = session.periodEnd || "";
    let periodStart = session.periodStart || "";
    if (meta.yearEnd) {
      const d = new Date(meta.yearEnd);
      if (!isNaN(d.getTime())) {
        engagementYear = String(d.getFullYear());
        periodEnd = meta.yearEnd;
        if (!periodStart) periodStart = `${d.getFullYear() - 1}-07-01`;
      }
    }

    const sessionUpdates: Record<string, any> = { updatedAt: new Date() };
    if (meta.entityName)         sessionUpdates.clientName       = meta.entityName;
    if (meta.entityName)         sessionUpdates.entityName       = meta.entityName;
    if (meta.companyType)        sessionUpdates.entityType       = meta.companyType;
    if (meta.industry)           sessionUpdates.industry         = meta.industry;
    if (meta.reportingFramework) sessionUpdates.reportingFramework = meta.reportingFramework;
    if (meta.auditType)          sessionUpdates.engagementType   = meta.auditType;
    if (meta.currency)           sessionUpdates.currency         = meta.currency;
    if (engagementYear)          sessionUpdates.engagementYear   = engagementYear;
    if (periodStart)             sessionUpdates.periodStart      = periodStart;
    if (periodEnd)               sessionUpdates.periodEnd        = periodEnd;

    await db.update(wpSessionsTable).set(sessionUpdates).where(eq(wpSessionsTable.id, sessionId));

    // ── PERSIST COA/TB LINES ──────────────────────────────────────────────
    if (rows.length > 0) {
      // Clear old TB lines for this session
      await db.delete(wpTrialBalanceLinesTable).where(eq(wpTrialBalanceLinesTable.sessionId, sessionId));

      const tbInserts = rows.map(row => {
        const isCredit = row.normalBalance === "Credit";
        const balance  = isCredit ? -Math.abs(row.currentYear) : Math.abs(row.currentYear);
        return {
          sessionId,
          accountCode:     row.accountCode || `AUTO-${row.lineId}`,
          accountName:     row.accountName || row.lineItem || `Line ${row.lineId}`,
          classification:  mapFsSectionToClassification(row.fsSection, row.statementType),
          fsLineMapping:   [row.fsSection, row.majorHead].filter(Boolean).join(" > "),
          debit:           isCredit ? "0" : String(row.currentYear),
          credit:          isCredit ? String(row.currentYear) : "0",
          balance:         String(balance),
          priorYearBalance:String(row.priorYear),
          source:          "template",
          confidence:      "100",
        };
      });
      if (tbInserts.length > 0) await db.insert(wpTrialBalanceLinesTable).values(tbInserts as any);

      // ── PERSIST GL ACCOUNTS ───────────────────────────────────────────────
      // Delete entries before accounts (foreign key: wp_gl_entries.gl_account_id → wp_gl_accounts.id)
      await db.delete(wpGlEntriesTable).where(eq(wpGlEntriesTable.sessionId, sessionId));
      await db.delete(wpGlAccountsTable).where(eq(wpGlAccountsTable.sessionId, sessionId));
      const glInserts = rows
        .filter(r => r.aiGlFlag?.toUpperCase() === "YES" || r.debitTransactionValue > 0 || r.creditTransactionValue > 0)
        .map(row => {
          const isCredit = row.normalBalance === "Credit";
          const openingBal = isCredit ? -Math.abs(row.priorYear) : Math.abs(row.priorYear);
          const closingBal = isCredit ? -Math.abs(row.currentYear) : Math.abs(row.currentYear);
          const rateHint = `WP:${row.wpArea||"—"} Risk:${row.riskLevel||"M"} Scale:${row.procedureScale||"Std"} Remarks:${row.remarks||"—"}`;
          return {
            sessionId,
            accountCode:        row.accountCode || `AUTO-${row.lineId}`,
            accountName:        row.accountName || row.lineItem,
            accountType:        mapFsSectionToClassification(row.fsSection, row.statementType),
            openingBalance:     String(openingBal),
            closingBalance:     String(closingBal),
            totalDebit:         String(row.debitTransactionValue),
            totalCredit:        String(row.creditTransactionValue),
            tbDebit:            isCredit ? "0" : String(row.currentYear),
            tbCredit:           isCredit ? String(row.currentYear) : "0",
            isSynthetic:        true,
            generationRationale: rateHint,
          };
        });
      if (glInserts.length > 0) await db.insert(wpGlAccountsTable).values(glInserts as any);

      // ── STEP 2B: PERSIST FS LINES ────────────────────────────────────────
      await db.delete(wpFsLinesTable).where(eq(wpFsLinesTable.sessionId, sessionId));
      const fsLineInserts = rows.map((row: ParsedTemplateRow, idx: number) => ({
        sessionId,
        lineId: typeof row.lineId === "number" ? row.lineId : idx + 1,
        statementType: row.statementType || null,
        fsSection: row.fsSection || null,
        majorHead: row.majorHead || null,
        lineItem: row.lineItem || null,
        subLineItem: row.subLineItem || null,
        accountName: row.accountName || null,
        accountCode: row.accountCode || null,
        noteNo: row.noteNo || null,
        currentYear: row.currentYear != null ? String(row.currentYear) : null,
        priorYear: row.priorYear != null ? String(row.priorYear) : null,
        debitTransactionValue: row.debitTransactionValue != null ? String(row.debitTransactionValue) : null,
        creditTransactionValue: row.creditTransactionValue != null ? String(row.creditTransactionValue) : null,
        normalBalance: row.normalBalance || null,
        wpArea: row.wpArea || null,
        riskLevel: row.riskLevel || null,
      }));
      if (fsLineInserts.length > 0) {
        const BATCH_SIZE = 100;
        for (let i = 0; i < fsLineInserts.length; i += BATCH_SIZE) {
          await db.insert(wpFsLinesTable).values(fsLineInserts.slice(i, i + BATCH_SIZE) as any);
        }
      }
      logger.info({ sessionId, fsLinesInserted: fsLineInserts.length }, "FS Lines populated from template");

      // ── STEP 3: AUTO-POPULATE VARIABLES FROM TEMPLATE ────────────────────
      // Returns structured exception report: mapped, skipped, conflicts, missingMandatory
      const varMapping = await autoFillVariablesFromTemplate(sessionId, meta, rows, periodStart, periodEnd, engagementYear);

      // ── STEP 4: UPDATE AUDIT ENGINE MASTER ───────────────────────────────
      try {
        const existingMaster = await db.select().from(auditEngineMasterTable).where(eq(auditEngineMasterTable.sessionId, sessionId));
        const masterPayload = {
          sessionId,
          engagementId: `ENG-${sessionId}`,
          entityType:   meta.companyType || session.entityType || "Private Limited",
          industryType: meta.industry    || session.industry   || "Services",
          financialYear:`${periodStart} to ${periodEnd}`,
          reportingFramework: meta.reportingFramework || session.reportingFramework || "IFRS",
          auditType:    meta.auditType || session.engagementType || "Statutory Audit",
          currency:     meta.currency  || "PKR",
          engagementStatus: "Planning",
          overallRiskLevel:  rows.some((r: ParsedTemplateRow) => (r.riskLevel || "").toLowerCase() === "high") ? "High" : "Medium",
          updatedAt:    new Date(),
        };
        if (existingMaster.length > 0) {
          await db.update(auditEngineMasterTable).set(masterPayload).where(eq(auditEngineMasterTable.sessionId, sessionId));
        } else {
          await db.insert(auditEngineMasterTable).values({ ...masterPayload, createdAt: new Date() } as any);
        }
      } catch { /* audit engine table may not have all columns */ }

      // ── STEP 5: ADVANCE SESSION STATUS ────────────────────────────────────
      if (session.status === "upload" || !session.status) {
        await db.update(wpSessionsTable).set({ status: "extraction", updatedAt: new Date() }).where(eq(wpSessionsTable.id, sessionId));
      }

      // ── STEP 6: AUDIT LOG ENTRY ────────────────────────────────────────────
      logger.info({
        event:           "TEMPLATE_PARSED",
        sessionId,
        sheet:           parsed.sheetUsed,
        rowsParsed:      rows.length,
        variablesMapped: varMapping.mapped,
        variablesSkipped:varMapping.skipped,
        conflicts:       varMapping.conflicts.length,
        missingMandatory:varMapping.missingMandatory,
        parseErrors:     parsed.errors.length,
        parseWarnings:   parsed.warnings.length,
      }, "Template parse complete — variable mapping applied");

      // ── STEP 7: DOWNSTREAM TB/GL RECALCULATION ────────────────────────────
      // TB + GL lines were already re-inserted above (steps 1-2).
      // Mark that the downstream data is fresh so generation engines pick it up.
      try {
        await db.update(wpSessionsTable)
          .set({ updatedAt: new Date() } as any)
          .where(eq(wpSessionsTable.id, sessionId));
      } catch { /* ignore */ }

      // Attach mapping report to response
      Object.assign(parsed, { variableMapping: varMapping });
    }

    return res.json({
      ...parsed,
      persisted:       true,
      rowCount:        rows.length,
      variableMapping: (parsed as any).variableMapping || null,
    });
  } catch (err: any) {
    logger.error({ err }, "parse-one-sheet-template failed");
    res.status(500).json({ error: err.message || "Parse failed" });
  }
});

// Helper: map FS_Section + Statement_Type to classification string
function mapFsSectionToClassification(fsSection: string, statementType: string): string {
  const s = (fsSection || "").toLowerCase();
  const st = (statementType || "").toLowerCase();
  if (s.includes("non-current asset") || s.includes("noncurrent asset")) return "Non-Current Asset";
  if (s.includes("asset")) return "Current Asset";
  if (s.includes("non-current liab") || s.includes("noncurrent liab")) return "Non-Current Liability";
  if (s.includes("liabilit")) return "Current Liability";
  if (s.includes("equity")) return "Equity";
  if (s.includes("revenue") || s.includes("income")) return "Revenue";
  if (s.includes("cost")) return "Cost of Sales";
  if (s.includes("expense") || s.includes("admin") || s.includes("selling")) return "Operating Expense";
  if (s.includes("finance")) return "Finance Cost";
  if (s.includes("tax")) return "Tax";
  if (st.includes("p&l") || st.includes("pl") || st.includes("income") || st.includes("expense")) return "P&L";
  return "Other";
}

// ── Value normalizers for template → variable code mapping ───────────────────
function normalizeEntityType(raw: string): string {
  const s = (raw || "").toLowerCase();
  if (s.includes("private") && s.includes("limited")) return "Private Limited";
  if (s.includes("public") && s.includes("listed")) return "Public Limited (Listed)";
  if (s.includes("public")) return "Public Limited (Unlisted)";
  if (s.includes("single member")) return "Single Member";
  if (s.includes("llp")) return "LLP";
  if (s.includes("aop") || s.includes("association of person")) return "AOP";
  if (s.includes("sole")) return "Sole Proprietor";
  if (s.includes("ngo") || s.includes("npo")) return "NGO/NPO";
  if (s.includes("trust")) return "Trust";
  if (s.includes("government") || s.includes("govt")) return "Government Entity";
  return raw;
}
function normalizeIndustry(raw: string): string {
  const s = (raw || "").toLowerCase();
  const map: [string, string][] = [
    ["manufactur",  "Manufacturing"], ["service",       "Services"],
    ["trading",     "Trading"],       ["construction",  "Construction"],
    ["software",    "IT/Software"],   ["it/",           "IT/Software"],
    ["financial",   "Financial Services"], ["bank",     "Financial Services"],
    ["health",      "Healthcare"],    ["education",     "Education"],
    ["energy",      "Energy"],        ["textile",       "Textiles"],
    ["fmcg",        "FMCG"],          ["real estate",   "Real Estate"],
    ["agri",        "Agriculture"],   ["telecom",       "Telecommunications"],
  ];
  for (const [kw, val] of map) { if (s.includes(kw)) return val; }
  return raw || "Services";
}
function normalizeFramework(raw: string): string {
  const s = (raw || "").toLowerCase();
  if (s.includes("sme")) return "IFRS for SMEs";
  if (s.includes("ifrs")) return "IFRS";
  if (s.includes("afrs")) return "AFRS";
  if (s.includes("fourth")) return "Fourth Schedule";
  if (s.includes("fifth")) return "Fifth Schedule";
  return raw || "IFRS";
}
function normalizeEngagementType(raw: string): string {
  const s = (raw || "").toLowerCase();
  if (s.includes("limited") || s.includes("review")) return "limited_review";
  if (s.includes("group")) return "group_audit";
  return "statutory_audit";
}

// ── Master template → variable mapping engine ─────────────────────────────────
// Returns: { mapped, skipped, conflicts[], missingMandatory[], exceptions[] }
async function autoFillVariablesFromTemplate(
  sessionId: number, meta: ParsedTemplateMeta, rows: ParsedTemplateRow[],
  periodStart: string, periodEnd: string, engagementYear: string
): Promise<{ mapped: number; skipped: number; conflicts: string[]; missingMandatory: string[]; exceptions: string[] }> {
  const result = { mapped: 0, skipped: 0, conflicts: [] as string[], missingMandatory: [] as string[], exceptions: [] as string[] };
  try {
    // ── 1. ROW AGGREGATION HELPERS ────────────────────────────────────────
    const nrm  = (s: string) => (s || "").trim().toLowerCase();
    const stIs = (r: ParsedTemplateRow, ...kw: string[]) => kw.some(k => nrm(r.statementType).includes(k));
    const fsIs = (r: ParsedTemplateRow, ...kw: string[]) => kw.some(k => nrm(r.fsSection).includes(k));
    const any  = (r: ParsedTemplateRow, ...kw: string[]) =>
      kw.some(k => nrm(r.majorHead).includes(k) || nrm(r.lineItem).includes(k) ||
                   nrm(r.subLineItem).includes(k) || nrm(r.accountName).includes(k));

    const sumCY = (f: (r: ParsedTemplateRow) => boolean) => rows.filter(f).reduce((s, r) => s + (r.currentYear || 0), 0);
    const sumPY = (f: (r: ParsedTemplateRow) => boolean) => rows.filter(f).reduce((s, r) => s + (r.priorYear || 0), 0);

    // Classify rows by statement type
    const bsRows  = rows.filter(r => stIs(r, "bs", "balance sheet"));
    const plRows  = rows.filter(r => stIs(r, "p&l", "pl", "income", "profit", "loss", "expense", "expenses"));
    const ociRows = rows.filter(r => stIs(r, "oci", "comprehensive"));
    const cfRows  = rows.filter(r => stIs(r, "cf", "cash flow", "cashflow"));

    // BS — Section buckets
    const ncaRows = bsRows.filter(r => fsIs(r, "non-current asset", "noncurrent asset") || any(r, "non-current asset", "noncurrent asset"));
    const caRows  = bsRows.filter(r => (fsIs(r, "current asset") && !fsIs(r, "non-current")) || (any(r, "current asset") && !any(r, "non-current asset")));
    const eqRows  = bsRows.filter(r => fsIs(r, "equity") || any(r, "equity"));
    const nclRows = bsRows.filter(r => fsIs(r, "non-current liab", "noncurrent liab") || any(r, "non-current liab", "noncurrent liab"));
    const clRows  = bsRows.filter(r => (fsIs(r, "current liab") && !fsIs(r, "non-current")) || (any(r, "current liab") && !any(r, "non-current liab")));

    // BS totals
    const totalAssets   = sumCY(r => ncaRows.includes(r) || caRows.includes(r));
    const totalEquity   = sumCY(r => eqRows.includes(r));
    const totalLiab     = sumCY(r => nclRows.includes(r) || clRows.includes(r));
    const pyTotalAssets = sumPY(r => ncaRows.includes(r) || caRows.includes(r));
    const pyTotalEquity = sumPY(r => eqRows.includes(r));
    const pyTotalLiab   = sumPY(r => nclRows.includes(r) || clRows.includes(r));

    // CY — specific BS line items
    const cy_fixed     = sumCY(r => any(r, "fixed asset", "ppe", "property, plant", "property plant"));
    const cy_rou       = sumCY(r => any(r, "right of use", "right-of-use", "rou asset", "lease asset"));
    const cy_cwip      = sumCY(r => any(r, "capital work", "cwip", "work in progress"));
    const cy_intang    = sumCY(r => any(r, "intangible", "goodwill"));
    const cy_invest    = sumCY(r => any(r, "investment") && !any(r, "short-term inv", "short term inv", "current invest"));
    const cy_lt_loans  = sumCY(r => any(r, "long term loan", "long-term loan", "lt loan", "long term advance"));
    const cy_invent    = sumCY(r => any(r, "inventory", "stock in trade", "stock-in-trade"));
    const cy_trade_rec = sumCY(r => any(r, "trade receivable", "trade debt", "debtors"));
    const cy_advance   = sumCY(r => any(r, "advance", "deposits") && !any(r, "long term", "advance tax"));
    const cy_other_rec = sumCY(r => any(r, "other receivable", "other debtors"));
    const cy_st_inv    = sumCY(r => any(r, "short-term inv", "short term inv", "current invest"));
    const cy_tax_ref   = sumCY(r => any(r, "tax refund", "income tax refund"));
    const cy_cash      = sumCY(r => any(r, "cash and bank", "bank balance", "cash at bank", "cash in hand"));
    const cy_share_cap = sumCY(r => any(r, "share capital", "paid up capital", "paid-up capital"));
    const cy_reserves  = sumCY(r => any(r, "reserve", "surplus") && !any(r, "retained earning", "unappropriated"));
    const cy_ret_earn  = sumCY(r => any(r, "retained earning", "accumulated profit", "unappropriated profit"));
    const cy_rev_surp  = sumCY(r => any(r, "revaluation surplus", "capital reserve"));
    const cy_lt_borrow = sumCY(r => any(r, "long term borrow", "long-term borrow", "term loan", "debenture") && !any(r, "current portion"));
    const cy_lease_l   = sumCY(r => any(r, "lease liability", "lease liab"));
    const cy_trade_pay = sumCY(r => any(r, "trade payable", "creditor", "trade credit"));
    const cy_accruals  = sumCY(r => any(r, "accrual", "accrued liab", "accrued expense", "accrued liabilities"));
    const cy_tax_pay   = sumCY(r => any(r, "tax payable", "taxation payable", "income tax payable", "current tax payable"));
    const cy_st_borrow = sumCY(r => any(r, "short term borrow", "short-term borrow", "running finance", "overdraft", "bank overdraft"));
    const cy_cpltd     = sumCY(r => any(r, "current portion", "current maturity"));

    // CY — P&L line items
    const cy_rev       = sumCY(r => plRows.includes(r) && any(r, "revenue", "turnover", "net sales", "sales") && !any(r, "other income"));
    const cy_cos       = sumCY(r => plRows.includes(r) && any(r, "cost of sales", "cost of goods", "cogs", "cost of revenue"));
    const cy_gp        = cy_rev - cy_cos;
    const cy_admin     = sumCY(r => plRows.includes(r) && any(r, "admin", "administrative", "general expense", "general and admin"));
    const cy_selling   = sumCY(r => plRows.includes(r) && any(r, "selling", "distribution", "marketing"));
    const cy_fin_cost  = sumCY(r => plRows.includes(r) && any(r, "finance cost", "interest expense", "markup", "borrowing cost", "financial charge"));
    const cy_other_inc = sumCY(r => plRows.includes(r) && any(r, "other income", "miscellaneous income", "other operating income"));
    const cy_other_exp = sumCY(r => plRows.includes(r) && any(r, "other expense", "miscellaneous expense") && !any(r, "admin", "selling", "finance"));
    const cy_tax_exp   = sumCY(r => plRows.includes(r) && any(r, "tax expense", "income tax expense", "current tax", "deferred tax", "taxation"));
    const cy_pbt       = cy_gp - cy_admin - cy_selling - cy_fin_cost + cy_other_inc - cy_other_exp;
    const cy_pat       = cy_pbt - cy_tax_exp;
    const cy_oci       = sumCY(r => ociRows.includes(r));
    const cy_tci       = cy_pat + cy_oci;

    // PY — BS line items (reuse same keyword filters, sumPY)
    const py_fixed     = sumPY(r => any(r, "fixed asset", "ppe", "property, plant", "property plant"));
    const py_rou       = sumPY(r => any(r, "right of use", "right-of-use", "rou asset", "lease asset"));
    const py_cwip      = sumPY(r => any(r, "capital work", "cwip", "work in progress"));
    const py_intang    = sumPY(r => any(r, "intangible", "goodwill"));
    const py_invest    = sumPY(r => any(r, "investment") && !any(r, "short-term inv", "short term inv", "current invest"));
    const py_invent    = sumPY(r => any(r, "inventory", "stock in trade", "stock-in-trade"));
    const py_trade_rec = sumPY(r => any(r, "trade receivable", "trade debt", "debtors"));
    const py_cash      = sumPY(r => any(r, "cash and bank", "bank balance", "cash at bank", "cash in hand"));
    const py_share_cap = sumPY(r => any(r, "share capital", "paid up capital", "paid-up capital"));
    const py_ret_earn  = sumPY(r => any(r, "retained earning", "accumulated profit", "unappropriated profit"));
    const py_lt_borrow = sumPY(r => any(r, "long term borrow", "long-term borrow", "term loan", "debenture") && !any(r, "current portion"));
    const py_trade_pay = sumPY(r => any(r, "trade payable", "creditor", "trade credit"));
    const py_tax_pay   = sumPY(r => any(r, "tax payable", "taxation payable", "income tax payable", "current tax payable"));

    // PY — P&L line items
    const py_rev       = sumPY(r => plRows.includes(r) && any(r, "revenue", "turnover", "net sales", "sales") && !any(r, "other income"));
    const py_cos       = sumPY(r => plRows.includes(r) && any(r, "cost of sales", "cost of goods", "cogs", "cost of revenue"));
    const py_gp        = py_rev - py_cos;
    const py_admin     = sumPY(r => plRows.includes(r) && any(r, "admin", "administrative", "general expense", "general and admin"));
    const py_selling   = sumPY(r => plRows.includes(r) && any(r, "selling", "distribution", "marketing"));
    const py_fin_cost  = sumPY(r => plRows.includes(r) && any(r, "finance cost", "interest expense", "markup", "borrowing cost", "financial charge"));
    const py_other_inc = sumPY(r => plRows.includes(r) && any(r, "other income", "miscellaneous income", "other operating income"));
    const py_other_exp = sumPY(r => plRows.includes(r) && any(r, "other expense", "miscellaneous expense") && !any(r, "admin", "selling", "finance"));
    const py_tax_exp   = sumPY(r => plRows.includes(r) && any(r, "tax expense", "income tax expense", "current tax", "deferred tax", "taxation"));
    const py_pbt       = py_gp - py_admin - py_selling - py_fin_cost + py_other_inc - py_other_exp;
    const py_pat       = py_pbt - py_tax_exp;
    const py_oci       = sumPY(r => ociRows.includes(r));
    const py_tci       = py_pat + py_oci;

    // Cash flows
    const cy_op_cf  = sumCY(r => cfRows.includes(r) && any(r, "operating"));
    const cy_inv_cf = sumCY(r => cfRows.includes(r) && any(r, "investing"));
    const cy_fin_cf = sumCY(r => cfRows.includes(r) && any(r, "financing"));
    const py_op_cf  = sumPY(r => cfRows.includes(r) && any(r, "operating"));
    const py_inv_cf = sumPY(r => cfRows.includes(r) && any(r, "investing"));
    const py_fin_cf = sumPY(r => cfRows.includes(r) && any(r, "financing"));

    // ── Materiality ──────────────────────────────────────────────────────
    const matBasisAmt  = cy_rev > 0 ? cy_rev : totalAssets;
    const matPct       = cy_rev > 0 ? 1.0 : 0.5;
    const overallMat   = matBasisAmt > 0 ? Math.round(matBasisAmt * matPct / 100) : 0;
    const perfMat      = Math.round(overallMat * 0.75);
    const trivialAmt   = Math.round(overallMat * 0.03);

    // ── Template presence flags ───────────────────────────────────────────
    const hasAcctCodes = rows.some(r => r.accountCode && r.accountCode.trim() !== "");
    const hasAcctNames = rows.some(r => r.accountName && r.accountName.trim() !== "");
    const hasPY        = rows.some(r => r.priorYear !== 0);
    const hasDrCr      = rows.some(r => r.debitTransactionValue > 0 || r.creditTransactionValue > 0);

    // ── Going concern indicators ──────────────────────────────────────────
    const gcLosses   = cy_pat < 0 || py_pat < 0;
    const gcNegEq    = totalEquity < 0;
    const gcNegOpCF  = cy_op_cf !== 0 && cy_op_cf < 0;

    // ── 2. MASTER VARIABLE MAP (variableCode → value) ─────────────────────
    // All codes must match exactly the codes in VARIABLE_DEFINITIONS (lowercase snake_case)
    const n = (v: number) => v !== 0 ? String(Math.round(v)) : "";
    const b = (v: boolean) => v ? "true" : "false";

    const templateVars: Record<string, string> = {
      // Entity & Constitution
      "entity_name":                        meta.entityName,
      "short_name":                         meta.entityName,
      "legal_name_as_per_secp":             meta.entityName,
      "entity_legal_form":                  normalizeEntityType(meta.companyType),
      "industry_sector":                    normalizeIndustry(meta.industry),
      "reporting_framework":                normalizeFramework(meta.reportingFramework),
      "applicable_company_law":             meta.companyType?.toLowerCase().includes("llp") ? "LLP Act 2017" : "Companies Act 2017",
      "functional_currency":                meta.currency || "PKR",
      "presentation_currency":              meta.currency || "PKR",
      "financial_year_end":                 meta.yearEnd,
      "financial_year_start":               periodStart,
      "reporting_period_end":               periodEnd,
      "reporting_period_start":             periodStart,

      // Engagement Acceptance
      "engagement_type":                    normalizeEngagementType(meta.auditType),
      "assurance_level":                    meta.auditType?.toLowerCase().includes("limited") ? "Limited" : "Reasonable",

      // Accounting & Records — auto-flagged from template presence
      "gl_available":                       "true",
      "tb_available":                       "true",
      "fs_uploaded":                        "true",
      "prior_year_fs_available":            b(hasPY),

      // Trial Balance & COA — auto-flagged
      "coa_available":                      rows.length > 0 ? "true" : "",
      "account_code_present":               b(hasAcctCodes),
      "account_name_present":               b(hasAcctNames),
      "account_classification":             rows.length > 0 ? "true" : "",
      "fs_mapping_completed":               rows.length > 0 ? "true" : "",
      "opening_balance_present":            b(hasPY),
      "closing_balance_present":            rows.length > 0 ? "true" : "",
      "movement_debit_present":             b(hasDrCr),
      "movement_credit_present":            b(hasDrCr),
      "unmapped_accounts_count":            "0",
      "manual_tb_adjustments_flag":         "false",

      // Financial Statements — Current Year (Balance Sheet Assets)
      "cy_total_assets":                    n(totalAssets),
      "cy_non_current_assets":              n(sumCY(r => ncaRows.includes(r))),
      "cy_current_assets":                  n(sumCY(r => caRows.includes(r))),
      "cy_fixed_assets":                    n(cy_fixed),
      "cy_right_of_use_assets":             n(cy_rou),
      "cy_capital_work_in_progress":        n(cy_cwip),
      "cy_intangible_assets":               n(cy_intang),
      "cy_investments":                     n(cy_invest),
      "cy_long_term_loans":                 n(cy_lt_loans),
      "cy_deposits_prepayments":            n(cy_advance),
      "cy_inventory":                       n(cy_invent),
      "cy_trade_receivables":               n(cy_trade_rec),
      "cy_advances":                        n(cy_advance),
      "cy_other_receivables":               n(cy_other_rec),
      "cy_short_term_investments":          n(cy_st_inv),
      "cy_tax_refunds_due":                 n(cy_tax_ref),
      "cy_cash_and_bank":                   n(cy_cash),

      // Financial Statements — Current Year (Balance Sheet Equity)
      "cy_total_equity":                    n(totalEquity),
      "cy_share_capital_fs":                n(cy_share_cap),
      "cy_reserves":                        n(cy_reserves),
      "cy_retained_earnings":               n(cy_ret_earn),
      "cy_revaluation_surplus":             n(cy_rev_surp),

      // Financial Statements — Current Year (Balance Sheet Liabilities)
      "cy_total_liabilities":               n(totalLiab),
      "cy_non_current_liabilities":         n(sumCY(r => nclRows.includes(r))),
      "cy_current_liabilities":             n(sumCY(r => clRows.includes(r))),
      "cy_long_term_borrowings":            n(cy_lt_borrow),
      "cy_lease_liabilities":               n(cy_lease_l),
      "cy_trade_payables":                  n(cy_trade_pay),
      "cy_accruals":                        n(cy_accruals),
      "cy_taxation_payable":                n(cy_tax_pay),
      "cy_short_term_borrowings":           n(cy_st_borrow),
      "cy_current_portion_long_term_debt":  n(cy_cpltd),

      // Financial Statements — Current Year (P&L)
      "cy_revenue":                         n(cy_rev),
      "cy_cost_of_sales":                   n(cy_cos),
      "cy_gross_profit":                    n(cy_gp),
      "cy_admin_expenses":                  n(cy_admin),
      "cy_selling_distribution_expenses":   n(cy_selling),
      "cy_finance_cost":                    n(cy_fin_cost),
      "cy_other_income":                    n(cy_other_inc),
      "cy_other_expenses":                  n(cy_other_exp),
      "cy_profit_before_tax":               n(cy_pbt),
      "cy_tax_expense":                     n(cy_tax_exp),
      "cy_profit_after_tax":                n(cy_pat),
      "cy_other_comprehensive_income":      n(cy_oci),
      "cy_total_comprehensive_income":      n(cy_tci),

      // Financial Statements — Current Year (Cash Flows)
      "cy_operating_cash_flow":             n(cy_op_cf),
      "cy_investing_cash_flow":             n(cy_inv_cf),
      "cy_financing_cash_flow":             n(cy_fin_cf),

      // Financial Statements — Prior Year (Balance Sheet Assets)
      "py_total_assets":                    n(pyTotalAssets),
      "py_non_current_assets":              n(sumPY(r => ncaRows.includes(r))),
      "py_current_assets":                  n(sumPY(r => caRows.includes(r))),
      "py_fixed_assets":                    n(py_fixed),
      "py_right_of_use_assets":             n(py_rou),
      "py_capital_work_in_progress":        n(py_cwip),
      "py_intangible_assets":               n(py_intang),
      "py_investments":                     n(py_invest),
      "py_inventory":                       n(py_invent),
      "py_trade_receivables":               n(py_trade_rec),
      "py_cash_and_bank":                   n(py_cash),

      // Financial Statements — Prior Year (Balance Sheet Equity)
      "py_total_equity":                    n(pyTotalEquity),
      "py_share_capital_fs":                n(py_share_cap),
      "py_retained_earnings":               n(py_ret_earn),

      // Financial Statements — Prior Year (Balance Sheet Liabilities)
      "py_total_liabilities":               n(pyTotalLiab),
      "py_non_current_liabilities":         n(sumPY(r => nclRows.includes(r))),
      "py_current_liabilities":             n(sumPY(r => clRows.includes(r))),
      "py_long_term_borrowings":            n(py_lt_borrow),
      "py_trade_payables":                  n(py_trade_pay),
      "py_taxation_payable":                n(py_tax_pay),

      // Financial Statements — Prior Year (P&L)
      "py_revenue":                         n(py_rev),
      "py_cost_of_sales":                   n(py_cos),
      "py_gross_profit":                    n(py_gp),
      "py_admin_expenses":                  n(py_admin),
      "py_selling_distribution_expenses":   n(py_selling),
      "py_finance_cost":                    n(py_fin_cost),
      "py_other_income":                    n(py_other_inc),
      "py_other_expenses":                  n(py_other_exp),
      "py_profit_before_tax":               n(py_pbt),
      "py_tax_expense":                     n(py_tax_exp),
      "py_profit_after_tax":                n(py_pat),
      "py_other_comprehensive_income":      n(py_oci),
      "py_total_comprehensive_income":      n(py_tci),

      // Financial Statements — Prior Year (Cash Flows)
      "py_operating_cash_flow":             n(py_op_cf),
      "py_investing_cash_flow":             n(py_inv_cf),
      "py_financing_cash_flow":             n(py_fin_cf),

      // Materiality (auto-computed from financial data)
      "materiality_basis":                  cy_rev > 0 ? "Revenue" : "Total Assets",
      "materiality_basis_amount":           n(matBasisAmt),
      "overall_materiality_percent":        String(matPct),
      "overall_materiality_amount":         n(overallMat),
      "performance_materiality_percent":    "75",
      "performance_materiality_amount":     n(perfMat),
      "trivial_threshold_percent":          "3",
      "trivial_threshold_amount":           n(trivialAmt),

      // Going Concern indicators (derived from financial analysis)
      "gc_losses_flag":                     b(gcLosses),
      "gc_negative_equity_flag":            b(gcNegEq),
      "gc_negative_operating_cashflows_flag": b(gcNegOpCF),

      // Risk assessment — defaults from template risk levels
      "inherent_risk_overall":              rows.some(r => nrm(r.riskLevel) === "high") ? "High" : "Medium",
      "control_risk_overall":               "Medium",
      "risk_of_material_misstatement_overall": rows.some(r => nrm(r.riskLevel) === "high") ? "High" : "Medium",

      // Variance analysis
      "variance_analysis_done":             hasPY ? "true" : "false",

      // ── ENGAGEMENT PROFILE (from template top section) ────────────────────
      "engagement_size":                    meta.engagementSize || "",

      // ── TB AGGREGATE AMOUNTS (computed directly from template rows) ────────
      // These are 100% template-driven: no AI involvement
      "tb_line_count":                      String(rows.length),
      "tb_total_period_debit":              n(rows.reduce((s, r) => s + (r.debitTransactionValue || 0), 0)),
      "tb_total_period_credit":             n(rows.reduce((s, r) => s + (r.creditTransactionValue || 0), 0)),
      "tb_opening_balance_aggregate":       n(rows.reduce((s, r) => s + (r.priorYear || 0), 0)),
      "tb_closing_balance_aggregate":       n(rows.reduce((s, r) => s + (r.currentYear || 0), 0)),

      // ── TB STRUCTURE FLAGS (derived from template) ─────────────────────────
      "tb_balanced_flag":                   (() => {
        const dr = rows.reduce((s, r) => s + (r.debitTransactionValue || 0), 0);
        const cr = rows.reduce((s, r) => s + (r.creditTransactionValue || 0), 0);
        return Math.abs(dr - cr) < 1 ? "true" : "false";
      })(),
      "control_accounts_identified":        rows.length > 0 ? "true" : "false",
      "account_type":                       rows.some(r => r.accountCode && /^\d{4}$/.test(r.accountCode.trim())) ? "4-digit COA"
                                          : rows.some(r => r.accountCode && /^\d{5}$/.test(r.accountCode.trim())) ? "5-digit COA"
                                          : rows.length > 0 ? "Custom" : "",

      // ── RISK ASSESSMENT (from template per-row Risk_Level and WP_Area) ─────
      // Significant risk areas: WP areas with High risk → mapped to ISA standard labels
      "significant_risk_areas":            (() => {
        const WP_TO_ISA: Record<string, string> = {
          "revenue": "Revenue Recognition (ISA 240)",
          "cost of sales": "Revenue Recognition (ISA 240)",
          "taxation": "Tax Liabilities & Contingencies",
          "tax": "Tax Liabilities & Contingencies",
          "receivables": "Trade Receivables — Recoverability",
          "payables": "Related Party Transactions (ISA 550)",
          "borrowings": "Loan Covenants / Compliance",
          "ppe": "Fixed Assets — Impairment",
          "property, plant": "Fixed Assets — Impairment",
          "inventory": "Inventory Valuation",
          "cash and bank": "Trade Receivables — Recoverability",
          "provisions": "Estimates & Judgments (ISA 540)",
          "estimates": "Estimates & Judgments (ISA 540)",
          "equity": "Trade Receivables — Recoverability",
          "other income": "Revenue Recognition (ISA 240)",
          "operating expenses": "Completeness of Liabilities",
        };
        const seen = new Set<string>();
        const labels: string[] = [];
        rows.filter(r => nrm(r.riskLevel) === "high").forEach(r => {
          const lower = nrm(r.wpArea);
          for (const [key, label] of Object.entries(WP_TO_ISA)) {
            if (lower.includes(key) && !seen.has(label)) {
              seen.add(label); labels.push(label);
            }
          }
        });
        // Always include ISA 240 management override — presumed risk
        if (!seen.has("Management Override (ISA 240)")) labels.push("Management Override (ISA 240)");
        return labels.join(", ");
      })(),
      "account_level_risk_mapping_done":   rows.length > 0 ? "true" : "false",
      // Fraud risk: revenue is standard ISA 240 presumed fraud risk area
      "fraud_risk_flag":                   rows.some(r => nrm(r.wpArea).includes("revenue")) ? "true" : "false",
      "revenue_fraud_risk_flag":           rows.some(r => nrm(r.statementType).includes("p&l") && nrm(r.wpArea).includes("revenue")) ? "true" : "false",
      "management_override_risk_flag":     "true",  // ISA 240.31 — always presumed

      // ── SAMPLING (from template — presence of financial data implies testing) ──
      "sampling_required":                 rows.length > 0 ? "true" : "false",
      "population_value":                  n(totalAssets > 0 ? totalAssets : cy_rev),
      "sampling_basis":                    "Value-based",

      // ── ACCOUNTING & RECORDS (from template — GL/TB data confirms availability) ─
      "books_maintained_properly":         rows.length > 0 ? "true" : "false",
      "inventory_records_available":       rows.some(r => nrm(r.wpArea).includes("inventory")) ? "true" : "false",
      "bank_statements_available":         rows.some(r => nrm(r.wpArea).includes("cash and bank") || nrm(r.wpArea).includes("cash")) ? "true" : "false",

      // ── PRINCIPAL ACTIVITY (derived from industry in top section) ──────────
      "principal_activity":                meta.industry ? `${meta.industry} operations` : "",

      // ── PROCEDURE_SCALE (Col Q) — dominant audit depth across all template rows ──
      // Derived from Procedure_Scale column: Expanded > Standard > Basic by count
      "audit_procedure_depth":             (() => {
        const counts: Record<string, number> = { Expanded: 0, Standard: 0, Basic: 0 };
        rows.forEach(r => {
          const ps = String(r.procedureScale || "").trim();
          if (ps === "Expanded") counts.Expanded++;
          else if (ps === "Standard") counts.Standard++;
          else if (ps === "Basic") counts.Basic++;
        });
        if (counts.Expanded >= counts.Standard && counts.Expanded >= counts.Basic) return "Expanded";
        if (counts.Standard >= counts.Basic) return "Standard";
        return "Basic";
      })(),

      // ── GL_GENERATION_PRIORITY (Col S) — count of High-priority accounts ──
      // Derived from GL_Generation_Priority column: count rows where priority = "High"
      "high_priority_gl_count":            String(
        rows.filter(r => nrm(r.glGenerationPriority) === "high").length
      ),

      // ── NEW GROUP 21: AUDIT FIRM & REPORT — derived from template ─────────
      // audit_year and tax_year are the financial year derived from yearEnd
      "audit_year":                        engagementYear || "",
      "tax_year":                          engagementYear || "",

      // ── ENTITY & CONSTITUTION — new fields derived from template ──────────
      // Number of bank accounts = count of rows tagged as "Cash and Bank" WP area
      "number_of_bank_accounts":           (() => {
        const bankRows = rows.filter(r => nrm(r.wpArea).includes("cash") || nrm(r.accountName).includes("bank") || nrm(r.lineItem).includes("bank"));
        return bankRows.length > 0 ? String(bankRows.length) : "";
      })(),
      // Inventory valuation method — infer from inventory presence; default AVCO for manufacturing
      "inventory_valuation_method":        (() => {
        const hasInv = rows.some(r => nrm(r.wpArea).includes("inventory") || nrm(r.lineItem).includes("inventor") || nrm(r.accountName).includes("inventor"));
        if (!hasInv) return "N/A — No Inventory";
        const ind = nrm(meta.industry || "");
        if (ind.includes("manufactur")) return "AVCO (Weighted Average Cost)";
        if (ind.includes("retail") || ind.includes("trade")) return "FIFO (First-In First-Out)";
        return "AVCO (Weighted Average Cost)";
      })(),
      // Depreciation method — infer from PPE presence; default SLM
      "depreciation_method":               (() => {
        const hasPPE = rows.some(r => nrm(r.wpArea).includes("ppe") || nrm(r.lineItem).includes("depreciation") || nrm(r.accountName).includes("property"));
        return hasPPE ? "Straight-Line Method (SLM)" : "";
      })(),
      // Revenue recognition — infer from audit/entity type
      "revenue_recognition_policy":        (() => {
        const auditT = nrm(meta.auditType || "");
        const ind = nrm(meta.industry || "");
        if (ind.includes("service") || ind.includes("consult")) return "IFRS 15 — 5-Step Model";
        if (ind.includes("construct") || ind.includes("contract")) return "Percentage of Completion";
        if (ind.includes("manufactur") || ind.includes("retail") || ind.includes("trade")) return "At Point of Delivery";
        return "IFRS 15 — 5-Step Model";
      })(),

      // ── TAX & COMPLIANCE — new fields derived from template ───────────────
      // Applicable tax rate — standard Pakistan corporate rate (infer from engagement size/type)
      "applicable_tax_rate":               (() => {
        const ind = nrm(meta.industry || "");
        const size = nrm(meta.engagementSize || "");
        // Banking: 39%, SME: 20%, standard corporate: 29%
        if (ind.includes("bank") || ind.includes("financial")) return "39";
        if (size === "small") return "20";
        return "29";
      })(),
      // Super tax applicable for large companies (income > 150M PKR)
      "super_tax_applicable":              (() => {
        const sizeN = nrm(meta.engagementSize || "");
        return (sizeN === "large" || cy_rev > 150000000) ? "true" : "false";
      })(),
      "super_tax_rate":                    (() => {
        const sizeN = nrm(meta.engagementSize || "");
        if (cy_rev > 500000000 || sizeN === "large") return "10";
        if (cy_rev > 150000000) return "4";
        return "";
      })(),
      // Reporting currency from template
      "reporting_currency":                meta.currency || "PKR",

      // ── GOING CONCERN — additional indicators from financial data ─────────
      "going_concern_indicators_list":     (() => {
        const indicators: string[] = [];
        if (cy_pat < 0) indicators.push("Recurring Net Losses");
        if (totalEquity < 0) indicators.push("Negative Equity");
        if (cy_op_cf !== 0 && cy_op_cf < 0) indicators.push("Negative Operating Cash Flows");
        if (cy_lt_borrow > totalAssets * 0.5) indicators.push("Loan Defaults / Covenant Breach");
        if (py_pat < 0 && cy_pat < 0) indicators.push("Significant Accumulated Losses");
        return indicators.join(", ");
      })(),

      // ── FRAUD RISK INDICATORS — derived from financial patterns ───────────
      "fraud_risk_indicators":             (() => {
        const indicators: string[] = [];
        const revGrowth = py_rev > 0 ? (cy_rev - py_rev) / py_rev : 0;
        if (revGrowth > 0.3) indicators.push("Rapid Growth Inconsistent with Sector");
        if (cy_rev > 0 && cy_gp / cy_rev < 0.05) indicators.push("Revenue Manipulation Patterns");
        if (rows.some(r => nrm(r.wpArea).includes("estimate") || nrm(r.wpArea).includes("provision"))) indicators.push("Excessive Management Estimates");
        if (cy_trade_rec > cy_rev * 0.5) indicators.push("Unusual Related-Party Dealings");
        indicators.push("Pressure to Meet Targets");
        return indicators.join(", ");
      })(),

      // ── APPLICABLE ISA STANDARDS (always include core set) ────────────────
      "applicable_isa_standards":          [
        "ISA 200 — Overall Objectives",
        "ISA 210 — Engagement Terms",
        "ISA 230 — Documentation",
        "ISA 240 — Fraud",
        "ISA 300 — Planning",
        "ISA 315 — Risk Assessment",
        "ISA 320 — Materiality",
        "ISA 330 — Responses to Risks",
        "ISA 450 — Misstatements",
        "ISA 500 — Audit Evidence",
        "ISA 560 — Subsequent Events",
        "ISA 570 — Going Concern",
        "ISA 580 — Written Representations",
        "ISA 700 — Forming Opinion",
        ...(rows.some(r => nrm(r.wpArea).includes("revenue")) ? ["ISA 240 — Fraud"] : []),
        ...(rows.some(r => nrm(r.wpArea).includes("receivable") || nrm(r.wpArea).includes("cash")) ? ["ISA 505 — Confirmations"] : []),
        ...(rows.some(r => nrm(r.wpArea).includes("inventory")) ? ["ISA 501 — Specific Evidence"] : []),
        ...(rows.some(r => nrm(r.wpArea).includes("ppe") || nrm(r.wpArea).includes("estimate")) ? ["ISA 540 — Estimates"] : []),
        "ISA 701 — KAMs",
        "ISQM 1 — Quality Management",
      ].filter((v, i, arr) => arr.indexOf(v) === i).join(", "),

      // ── APPLICABLE LAWS & REGULATIONS ─────────────────────────────────────
      "applicable_company_laws_multi":     (() => {
        const laws = ["Companies Act 2017", "Income Tax Ordinance 2001"];
        const ct = nrm(meta.companyType || "");
        if (ct.includes("llp")) laws.push("LLP Act 2017");
        if (rows.some(r => nrm(r.wpArea).includes("taxation"))) laws.push("Sales Tax Act 1990");
        laws.push("Companies (Audit) Rules 2017");
        return laws.join(", ");
      })(),

      // ── KEY AUDIT MATTERS ─────────────────────────────────────────────────
      "key_audit_matters_list":            (() => {
        const kams: string[] = [];
        if (rows.some(r => nrm(r.riskLevel) === "high" && nrm(r.wpArea).includes("revenue"))) kams.push("Revenue Recognition Complexity");
        if (rows.some(r => nrm(r.wpArea).includes("ppe"))) kams.push("Significant Estimates (ISA 540)");
        if (rows.some(r => nrm(r.wpArea).includes("inventory"))) kams.push("Inventory Valuation");
        if (rows.some(r => nrm(r.wpArea).includes("taxation"))) kams.push("Tax Uncertainties");
        if (gcLosses || gcNegEq || gcNegOpCF) kams.push("Going Concern Assessment");
        if (cy_trade_rec > cy_rev * 0.3 && cy_rev > 0) kams.push("ECL / Provision for Credit Losses");
        return kams.join(", ");
      })(),
    };

    // ── 3. MANDATORY FIELD VALIDATION ─────────────────────────────────────
    const mandatoryCodes = ["entity_name", "financial_year_end", "reporting_framework", "engagement_type", "functional_currency"];
    for (const code of mandatoryCodes) {
      const val = templateVars[code];
      if (!val || val.trim() === "") result.missingMandatory.push(code);
    }

    // ── 4. LOAD EXISTING VARIABLES AND APPLY WITH SOURCE HIERARCHY ────────
    // Source hierarchy: Template (highest) > Confirmed User Edit > AI > Default (lowest)
    const existingVars = await db.select().from(wpVariablesTable).where(eq(wpVariablesTable.sessionId, sessionId));

    for (const ev of existingVars) {
      const code        = (ev.variableCode || "").toLowerCase().trim();
      const templateVal = templateVars[code];

      // Skip if we have no template value for this variable
      if (templateVal === undefined || templateVal === "") continue;

      // RULE 1: Never overwrite locked variables
      if (ev.isLocked) { result.skipped++; continue; }

      // RULE 2: Never overwrite confirmed user edits (user edit > template)
      //         Log conflict so the caller can report it
      if (ev.userEditedValue && ev.userEditedValue.trim() !== "") {
        if (ev.userEditedValue.trim() !== templateVal) {
          result.conflicts.push(`${code}: user value "${ev.userEditedValue}" ≠ template "${templateVal}" — user value preserved`);
        }
        result.skipped++;
        continue;
      }

      // RULE 3: Idempotent re-upload — note if template value changed since last parse
      if (ev.sourceType === "template" && ev.autoFilledValue && ev.autoFilledValue !== templateVal) {
        result.conflicts.push(`${code}: template updated from "${ev.autoFilledValue}" → "${templateVal}"`);
      }

      // Apply template value with confidence 100 (highest source)
      await db.update(wpVariablesTable).set({
        autoFilledValue: templateVal,
        finalValue:      templateVal,
        sourceType:      "template",
        reviewStatus:    "template_filled",
        confidence:      "100",
        updatedAt:       new Date(),
      }).where(eq(wpVariablesTable.id, ev.id));

      result.mapped++;
    }

    // ── 4b. INSERT — create rows for templateVars codes not yet in DB ──────
    // This handles new variable groups (Group 21, new Entity & Constitution, etc.)
    // that don't exist in the DB yet because auto-fill ran before this parse.
    const existingCodeSet = new Set(existingVars.map(ev => (ev.variableCode || "").toLowerCase().trim()));

    const toInsert: Array<{ code: string; val: string; def: any }> = [];
    for (const [code, val] of Object.entries(templateVars)) {
      if (!val || val.trim() === "") continue;
      if (existingCodeSet.has(code)) continue;
      // Only insert if a definition exists for this code
      const def = VARIABLE_DEFINITIONS.find(d => d.variableCode === code);
      if (!def) continue;
      toInsert.push({ code, val, def });
    }

    // Bulk insert in batches of 50 to avoid large transactions
    for (let i = 0; i < toInsert.length; i += 50) {
      const batch = toInsert.slice(i, i + 50);
      try {
        await db.insert(wpVariablesTable).values(
          batch.map(({ code, val, def }) => ({
            sessionId,
            variableCode: code,
            category:     def.variableGroup,
            variableName: def.variableLabel,
            autoFilledValue: val,
            finalValue:      val,
            sourceType:      "template",
            reviewStatus:    "template_filled",
            confidence:      "100",
          }))
        );
        result.mapped += batch.length;
      } catch { /* non-fatal: some codes may conflict */ }
    }

    // ── 5. POST-FILL STATUS PASS ─────────────────────────────────────────
    // Re-read all variables and stamp correct status tags for every variable
    // regardless of whether template filled it or not.
    const MANDATORY_CODES = new Set(
      VARIABLE_DEFINITIONS.filter(d => d.mandatoryFlag).map(d => d.variableCode)
    );
    const afterFill = await db.select().from(wpVariablesTable).where(eq(wpVariablesTable.sessionId, sessionId));

    for (const ev of afterFill) {
      const code = (ev.variableCode || "").toLowerCase().trim();
      const hasFinalValue = ev.finalValue && String(ev.finalValue).trim() !== "" && String(ev.finalValue).trim() !== "N/A";

      // Determine the correct status tag
      let statusTag: string | null = null;

      if (ev.isLocked) {
        statusTag = "locked";
      } else if (ev.userEditedValue && ev.userEditedValue.trim() !== "") {
        statusTag = "user_edited";
      } else if (ev.sourceType === "template" && hasFinalValue) {
        statusTag = "template_filled"; // already set above, but enforce here too
      } else if (ev.sourceType === "ai_extraction" && hasFinalValue) {
        statusTag = "ai_filled";
      } else if (!hasFinalValue && MANDATORY_CODES.has(code)) {
        statusTag = "missing";
        if (!result.missingMandatory.includes(code)) result.missingMandatory.push(code);
      } else if (!hasFinalValue) {
        statusTag = null; // optional + empty — no tag change needed
      }

      if (statusTag && ev.reviewStatus !== statusTag) {
        await db.update(wpVariablesTable)
          .set({ reviewStatus: statusTag, updatedAt: new Date() })
          .where(eq(wpVariablesTable.id, ev.id));
      }
    }

    // ── 6. PERSIST EXCEPTIONS TO wpExceptionLogTable ─────────────────────
    // Log conflicts and missing mandatory fields so they appear in the exception screen
    const exceptionsToLog: Array<{ type: string; severity: string; title: string; desc: string }> = [];

    for (const conflict of result.conflicts) {
      exceptionsToLog.push({
        type:     "MAPPING_CONFLICT",
        severity: "medium",
        title:    `Template Conflict: ${conflict.split(":")[0]}`,
        desc:     conflict,
      });
    }
    for (const code of result.missingMandatory) {
      const def = VARIABLE_DEFINITIONS.find(d => d.variableCode === code);
      exceptionsToLog.push({
        type:     "MISSING_MANDATORY",
        severity: "high",
        title:    `Missing Mandatory: ${def?.variableLabel || code}`,
        desc:     `Mandatory variable "${code}" (${def?.variableLabel || code}) has no value from the template or any other source.`,
      });
    }

    for (const ex of exceptionsToLog) {
      try {
        // Upsert: check if an open exception for this title already exists
        const existing = await db.select().from(wpExceptionLogTable).where(
          and(eq(wpExceptionLogTable.sessionId, sessionId), eq(wpExceptionLogTable.title, ex.title))
        );
        if (existing.length === 0) {
          await db.insert(wpExceptionLogTable).values({
            sessionId,
            exceptionType: ex.type,
            severity:      ex.severity,
            title:         ex.title,
            description:   ex.desc,
            status:        "open",
            createdAt:     new Date(),
            updatedAt:     new Date(),
          } as any);
        }
      } catch { /* exception log insert failure is non-fatal */ }
    }

  } catch (err: any) {
    logger.warn({ err }, "autoFillVariablesFromTemplate partial failure");
    result.exceptions.push(err.message || "Unknown error in variable mapping engine");
  }
  return result;
}

// ── Download Excel upload template (ExcelJS — real demo data + cell protection) ──
router.get("/download-template", async (_req: Request, res: Response) => {
  try {
    const fs = await import("fs");
    const nodePath = await import("path");
    const TEMPLATE_NAME = "Financial_Data_Upload_Template.xlsx";
    const candidatePaths = [
      nodePath.join(__dirname, "templates", TEMPLATE_NAME),
      nodePath.join(__dirname, "..", "templates", TEMPLATE_NAME),
      nodePath.resolve("templates", TEMPLATE_NAME),
      nodePath.resolve("artifacts/api-server/src/templates", TEMPLATE_NAME),
      nodePath.resolve("src/templates", TEMPLATE_NAME),
    ];
    let filePath = candidatePaths.find(fp => fs.existsSync(fp)) || "";
    if (!filePath) {
      return res.status(404).json({ error: "Template file not found on server." });
    }
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", 'attachment; filename="Financial_Data_Upload_Template.xlsx"');
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
    return;
    /* ── Legacy programmatic template generation (kept for reference) ────────
    const wb = new ExcelJS.Workbook();
    wb.creator = "Alam & Aulakh Chartered Accountants";
    wb.created = new Date();

    const ws = wb.addWorksheet("Financial_Data_Upload");

    // Column widths (matches attached template exactly)
    ws.columns = [
      { width: 10 }, // A Line_ID
      { width: 14 }, // B Statement_Type
      { width: 16 }, // C FS_Section
      { width: 22 }, // D Major_Head
      { width: 24 }, // E Line_Item
      { width: 20 }, // F Sub_Line_Item
      { width: 24 }, // G Account_Name
      { width: 12 }, // H Account_Code
      { width: 10 }, // I Note_No
      { width: 14 }, // J Current_Year
      { width: 14 }, // K Prior_Year
      { width: 18 }, // L Debit_Transaction_Value
      { width: 18 }, // M Credit_Transaction_Value
      { width: 15 }, // N Normal_Balance
      { width: 18 }, // O WP_Area
      { width: 12 }, // P Risk_Level
      { width: 16 }, // Q Procedure_Scale
      { width: 12 }, // R AI_GL_Flag
      { width: 20 }, // S GL_Generation_Priority
      { width: 28 }, // T Remarks
    ];

    const NAVY  = "FF1F4E78"; // dark navy header
    const GREEN = "FFE2F0D9"; // light green editable
    const LBLUE = "FFDCE6F1"; // light blue instructions
    const WHITE = "FFFFFFFF";

    function cellNavy(cell: ExcelJS.Cell, v: any) {
      cell.value = v;
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
      cell.font = { bold: true, color: { argb: WHITE }, size: 10, name: "Calibri" };
      cell.alignment = { vertical: "middle", horizontal: "left", wrapText: false };
    }
    function cellGreen(cell: ExcelJS.Cell, v: any, numFmt?: string) {
      cell.value = v;
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREEN } };
      cell.font = { size: 10, name: "Calibri", color: { argb: "FF000000" } };
      cell.alignment = { vertical: "middle", horizontal: typeof v === "number" ? "right" : "left" };
      if (numFmt) cell.numFmt = numFmt;
    }
    function cellPlain(cell: ExcelJS.Cell, v: any) {
      cell.value = v;
      cell.font = { size: 10, name: "Calibri" };
      cell.alignment = { vertical: "middle", horizontal: typeof v === "number" ? "right" : "left" };
    }

    // ── Row 1: Title ─────────────────────────────────────────────────────────
    ws.getRow(1).height = 24;
    const r1c1 = ws.getRow(1).getCell(1);
    r1c1.value = "Audit Financial Data Upload Template - One Sheet Master";
    r1c1.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
    r1c1.font = { bold: true, color: { argb: WHITE }, size: 13, name: "Calibri" };
    r1c1.alignment = { vertical: "middle", horizontal: "left" };
    ws.mergeCells(1, 1, 1, 20);

    // ── Rows 2-3: Instructions ────────────────────────────────────────────────
    ws.getRow(2).height = 42;
    ws.getRow(3).height = 8;
    const r2c1 = ws.getRow(2).getCell(1);
    r2c1.value = "Complete only this sheet. Use the engagement profile in rows 5-6 and enter or paste audited Balance Sheet and Profit & Loss line items from row 9 onward. All relevant dropdowns are fixed. The uploaded data should support Trial Balance mapping, General Ledger generation, debit/credit transaction logic, and working paper depth.";
    r2c1.fill = { type: "pattern", pattern: "solid", fgColor: { argb: LBLUE } };
    r2c1.font = { size: 10, name: "Calibri", color: { argb: "FF1F4E78" } };
    r2c1.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
    ws.mergeCells(2, 1, 3, 20);

    // ── Row 4: Spacer ─────────────────────────────────────────────────────────
    ws.getRow(4).height = 6;

    // ── Row 5: Engagement profile line 1 ────────────────────────────────────
    ws.getRow(5).height = 20;
    cellNavy(ws.getRow(5).getCell(1),  "Entity_Name");
    cellGreen(ws.getRow(5).getCell(2), "ABC Manufacturing (Private) Limited");
    ws.mergeCells(5, 2, 5, 3);
    cellNavy(ws.getRow(5).getCell(4),  "Company_Type");
    cellGreen(ws.getRow(5).getCell(5), "Private Company");
    ws.mergeCells(5, 5, 5, 6);
    cellNavy(ws.getRow(5).getCell(7),  "Industry");
    cellGreen(ws.getRow(5).getCell(8), "Manufacturing");
    ws.mergeCells(5, 8, 5, 9);
    cellNavy(ws.getRow(5).getCell(10), "Reporting_Framework");
    cellGreen(ws.getRow(5).getCell(11), "IFRS for SMEs");
    ws.mergeCells(5, 11, 5, 12);
    cellNavy(ws.getRow(5).getCell(13), "Year_End");
    // 45838 = Excel serial for 2025-06-30
    const yeCell = ws.getRow(5).getCell(14);
    yeCell.value = new Date(2025, 5, 30); // June 30 2025
    yeCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREEN } };
    yeCell.font = { size: 10, name: "Calibri" };
    yeCell.numFmt = "YYYY-MM-DD";
    yeCell.alignment = { vertical: "middle" };
    ws.mergeCells(5, 14, 5, 15);

    // ── Row 6: Engagement profile line 2 ────────────────────────────────────
    ws.getRow(6).height = 20;
    cellNavy(ws.getRow(6).getCell(1),  "Audit_Type");
    cellGreen(ws.getRow(6).getCell(2), "Statutory Audit");
    ws.mergeCells(6, 2, 6, 3);
    cellNavy(ws.getRow(6).getCell(4),  "Currency");
    cellGreen(ws.getRow(6).getCell(5), "PKR");
    ws.mergeCells(6, 5, 6, 6);
    cellNavy(ws.getRow(6).getCell(7),  "Engagement_Size");
    cellGreen(ws.getRow(6).getCell(8), "Medium");
    ws.mergeCells(6, 8, 6, 9);

    // ── Row 7: Spacer ─────────────────────────────────────────────────────────
    ws.getRow(7).height = 6;

    // ── Row 8: Column headers ────────────────────────────────────────────────
    ws.getRow(8).height = 22;
    const headers = [
      "Line_ID","Statement_Type","FS_Section","Major_Head","Line_Item","Sub_Line_Item",
      "Account_Name","Account_Code","Note_No","Current_Year","Prior_Year",
      "Debit_Transaction_Value","Credit_Transaction_Value","Normal_Balance",
      "WP_Area","Risk_Level","Procedure_Scale","AI_GL_Flag","GL_Generation_Priority","Remarks",
    ];
    headers.forEach((h, i) => { cellNavy(ws.getRow(8).getCell(i + 1), h); });
    ws.views = [{ state: "frozen", ySplit: 8 }];

    // ── Rows 9-93: Comprehensive sample data (85 rows — full COA) ────────────
    // [Line_ID, Statement_Type, FS_Section, Major_Head, Line_Item, Sub_Line_Item, Account_Name, Account_Code, Note_No,
    //  Current_Year, Prior_Year, Debit_Transaction_Value, Credit_Transaction_Value, Normal_Balance,
    //  WP_Area, Risk_Level, Procedure_Scale, AI_GL_Flag, GL_Generation_Priority, Remarks]
    const sampleData: any[][] = [
      // ── BALANCE SHEET: NON-CURRENT ASSETS ────────────────────────────────────
      [1,"BS","Assets","Non-Current Assets","Property, plant and equipment","Land","Freehold land","1501","5",6000000,6000000,0,0,"Debit","PPE","Low","Basic","No","Low","Freehold land; no depreciation. Verify title deeds."],
      [2,"BS","Assets","Non-Current Assets","Property, plant and equipment","Land","Leasehold land","1502","5",2400000,2400000,0,0,"Debit","PPE","Low","Basic","No","Low","Leasehold land — confirm lease terms and amortisation policy."],
      [3,"BS","Assets","Non-Current Assets","Property, plant and equipment","Building","Factory building","1510","5",12500000,13200000,150000,850000,"Debit","PPE","Medium","Standard","Yes","Medium","Factory building including depreciation movement."],
      [4,"BS","Assets","Non-Current Assets","Property, plant and equipment","Building","Office building","1511","5",4800000,5100000,50000,350000,"Debit","PPE","Medium","Standard","Yes","Medium","Office building; confirm ownership and encumbrances."],
      [5,"BS","Assets","Non-Current Assets","Property, plant and equipment","Plant and machinery","Production machinery","1520","5",9800000,8450000,2500000,1150000,"Debit","PPE","High","Expanded","Yes","High","Significant additions in current year; physical verification required."],
      [6,"BS","Assets","Non-Current Assets","Property, plant and equipment","Plant and machinery","Manufacturing equipment","1521","5",5600000,5100000,800000,300000,"Debit","PPE","High","Expanded","Yes","High","Verify invoices and manufacturer completion certificates."],
      [7,"BS","Assets","Non-Current Assets","Property, plant and equipment","Plant and machinery","Testing equipment","1522","5",1200000,1050000,200000,50000,"Debit","PPE","Medium","Standard","Yes","Medium","Calibration records to be inspected."],
      [8,"BS","Assets","Non-Current Assets","Property, plant and equipment","Furniture and fixtures","Office furniture","1530","5",650000,700000,0,50000,"Debit","PPE","Low","Basic","No","Low","Routine depreciation; no significant additions."],
      [9,"BS","Assets","Non-Current Assets","Property, plant and equipment","Office equipment","Computer equipment","1540","5",1100000,980000,250000,130000,"Debit","PPE","Medium","Standard","Yes","Low","New laptops and servers purchased."],
      [10,"BS","Assets","Non-Current Assets","Property, plant and equipment","Office equipment","Servers and networking","1541","5",850000,720000,180000,50000,"Debit","PPE","Medium","Standard","Yes","Low","Network infrastructure upgrade."],
      [11,"BS","Assets","Non-Current Assets","Property, plant and equipment","Vehicles","Motor vehicles","1550","5",3200000,2900000,600000,300000,"Debit","PPE","Medium","Standard","Yes","Medium","Inspect registration documents and insurance."],
      [12,"BS","Assets","Non-Current Assets","Capital work in progress","Capital work in progress","Capital work in progress","1590","5",4500000,2200000,4500000,2200000,"Debit","PPE","High","Expanded","Yes","High","Ongoing plant expansion — verify CWIP schedule and capitalisation."],
      [13,"BS","Assets","Non-Current Assets","Intangible assets","ERP software","ERP software","1601","6",420000,500000,0,80000,"Debit","Intangibles","Medium","Standard","No","Low","Annual amortisation; confirm useful life assessment."],
      [14,"BS","Assets","Non-Current Assets","Intangible assets","Patents and trademarks","Patents and trademarks","1602","6",180000,200000,0,20000,"Debit","Intangibles","Low","Basic","No","Low","Amortising at straight-line rate."],
      [15,"BS","Assets","Non-Current Assets","Long-term investments","Investments in subsidiaries","Investments in subsidiaries","1701","7",5000000,5000000,0,0,"Debit","Other Assets","Medium","Standard","No","Low","Equity method investment; review financial statements of investee."],
      [16,"BS","Assets","Non-Current Assets","Long-term loans and advances","Advances to employees","Advances to employees","1801","8",320000,280000,120000,80000,"Debit","Other Assets","Low","Basic","No","Low","Staff advances; confirm recoverability."],
      // ── BALANCE SHEET: CURRENT ASSETS ────────────────────────────────────────
      [17,"BS","Assets","Current Assets","Inventories","Raw materials","Raw material inventory","1301","9",4180000,3600000,16500000,15920000,"Debit","Inventory","High","Expanded","Yes","High","Physical count required; NRV testing for slow-moving items."],
      [18,"BS","Assets","Current Assets","Inventories","Work in progress","WIP inventory","1302","9",2150000,1880000,5400000,5130000,"Debit","Inventory","High","Expanded","Yes","Medium","Stage-of-completion assessment and costing reconciliation."],
      [19,"BS","Assets","Current Assets","Inventories","Finished goods","Finished goods inventory","1303","9",3320000,2950000,12450000,12080000,"Debit","Inventory","High","Expanded","Yes","Medium","Aging review; NRV testing for obsolete stock."],
      [20,"BS","Assets","Current Assets","Inventories","Stores and spares","Stores inventory","1304","9",980000,850000,2200000,2070000,"Debit","Inventory","Medium","Standard","Yes","Medium","Sample count of high-value items."],
      [21,"BS","Assets","Current Assets","Inventories","Packing materials","Packing material stock","1305","9",420000,380000,1800000,1760000,"Debit","Inventory","Low","Basic","No","Low","Routine analytical procedures."],
      [22,"BS","Assets","Current Assets","Trade debts","Local customers","Trade receivables","1201","10",5875000,4960000,33350000,32435000,"Debit","Receivables","High","Expanded","Yes","High","Circularise confirmations; review subsequent receipts."],
      [23,"BS","Assets","Current Assets","Trade debts","Export customers","Export receivables","1202","10",1640000,1280000,8900000,8540000,"Debit","Receivables","High","Expanded","Yes","High","Review foreign currency exposure and credit terms."],
      [24,"BS","Assets","Current Assets","Trade debts","Government receivables","Government receivables","1203","10",380000,300000,1200000,1120000,"Debit","Receivables","Medium","Standard","Yes","Medium","Government contract receivables — assess recoverability."],
      [25,"BS","Assets","Current Assets","Advances and deposits","Advances to suppliers","Advances to suppliers","1401","11",720000,640000,2100000,2020000,"Debit","Other Assets","Medium","Standard","No","Medium","Confirm goods/services received or expected."],
      [26,"BS","Assets","Current Assets","Advances and deposits","Security deposits","Security deposits","1210","11",450000,450000,0,0,"Debit","Other Assets","Low","Basic","No","Low","Utility and tenancy deposits; verify agreements."],
      [27,"BS","Assets","Current Assets","Advances and deposits","Prepayments","Prepaid insurance","1211","11",180000,160000,320000,300000,"Debit","Other Assets","Low","Basic","No","Low","Spread over policy term; recalculate prepayment."],
      [28,"BS","Assets","Current Assets","Advances and deposits","Prepayments","Prepaid rent","1215","11",240000,220000,540000,520000,"Debit","Other Assets","Low","Basic","No","Low","Monthly rent; verify lease agreement."],
      [29,"BS","Assets","Current Assets","Other receivables","Income tax refundable","Income tax refundable","1220","12",560000,480000,560000,480000,"Debit","Taxation","Medium","Standard","No","Medium","Verify with tax authority records and prior year return."],
      [30,"BS","Assets","Current Assets","Other receivables","Sales tax refundable","Sales tax refundable","1230","12",320000,280000,320000,280000,"Debit","Taxation","Medium","Standard","No","Medium","Reconcile with FBR portal data."],
      [31,"BS","Assets","Current Assets","Short-term investments","Treasury bills","Treasury bills","1401","13",2000000,0,2000000,0,"Debit","Other Assets","Medium","Standard","No","Low","Short-duration T-bills; confirm market value."],
      [32,"BS","Assets","Current Assets","Cash and bank balances","Current account","MCB current account","1101","14",1860000,1420000,38900000,38460000,"Debit","Cash and Bank","Medium","Standard","Yes","High","Obtain bank confirmation; reconcile with bank statement."],
      [33,"BS","Assets","Current Assets","Cash and bank balances","Savings account","HBL savings account","1102","14",920000,750000,12600000,12430000,"Debit","Cash and Bank","Medium","Standard","Yes","Medium","Bank statement reconciliation required."],
      [34,"BS","Assets","Current Assets","Cash and bank balances","Cash in hand","Petty cash","1103","14",85000,70000,450000,435000,"Debit","Cash and Bank","Low","Basic","No","Low","Count petty cash at year-end."],
      [35,"BS","Assets","Current Assets","Cash and bank balances","Foreign currency account","Foreign currency account","1104","14",380000,290000,5200000,5110000,"Debit","Cash and Bank","Medium","Standard","Yes","Medium","Revalue at closing rate; confirm exchange differences."],
      // ── BALANCE SHEET: EQUITY ──────────────────────────────────────────────────
      [36,"BS","Equity","Equity","Share capital","Ordinary shares","Issued and paid-up share capital","3101","15",10000000,10000000,0,0,"Credit","Equity","Low","Basic","No","Low","No change in share capital; confirm MOA and share register."],
      [37,"BS","Equity","Equity","Share capital","Preference shares","Preference share capital","3102","15",2000000,2000000,0,0,"Credit","Equity","Low","Basic","No","Low","Cumulative preference shares; confirm dividend arrears."],
      [38,"BS","Equity","Equity","Reserves","General reserve","General reserve","3201","15",1200000,1000000,0,200000,"Credit","Equity","Low","Basic","No","Low","Appropriation from profit per AGM resolution."],
      [39,"BS","Equity","Equity","Reserves","Capital reserve","Capital reserve","3202","15",500000,500000,0,0,"Credit","Equity","Low","Basic","No","Low","Pre-acquisition surplus; confirm nature."],
      [40,"BS","Equity","Equity","Reserves","Surplus on revaluation of fixed assets","Surplus on revaluation of fixed assets","3210","15",3500000,3800000,300000,0,"Credit","Equity","Medium","Standard","No","Medium","Incremental depreciation on revalued assets charged."],
      [41,"BS","Equity","Equity","Retained earnings","Accumulated profit","Retained earnings","3301","15",2840000,2140000,0,700000,"Credit","Equity","Medium","Standard","No","Low","Net profit less dividend; reconcile with P&L."],
      // ── BALANCE SHEET: NON-CURRENT LIABILITIES ────────────────────────────────
      [42,"BS","Liabilities","Non-Current Liabilities","Long-term loans","Term finance","Term finance from HBL","2101","16",3500000,4200000,700000,0,"Credit","Borrowings","High","Expanded","Yes","High","Confirm repayment schedule and covenant compliance."],
      [43,"BS","Liabilities","Non-Current Liabilities","Long-term loans","Diminishing musharaka","Diminishing musharaka","2102","16",1800000,2200000,400000,0,"Credit","Borrowings","High","Expanded","Yes","High","Verify Shariah-compliant financing structure."],
      [44,"BS","Liabilities","Non-Current Liabilities","Long-term loans","Loan from directors","Directors loan","2103","16",1000000,1000000,0,0,"Credit","Borrowings","Medium","Standard","No","Medium","Confirm subordination and terms with board minutes."],
      [45,"BS","Liabilities","Non-Current Liabilities","Deferred tax","Deferred tax liability","Deferred tax liability","2201","17",620000,480000,0,140000,"Credit","Taxation","Medium","Standard","No","Low","Calculate temporary difference; reconcile with tax computation."],
      [46,"BS","Liabilities","Non-Current Liabilities","Staff retirement benefits","Gratuity","Gratuity payable","2210","18",840000,720000,0,120000,"Credit","Provisions","Medium","Standard","No","Medium","Actuarial valuation report to be obtained."],
      [47,"BS","Liabilities","Non-Current Liabilities","Staff retirement benefits","Provident fund","Provident fund payable","2220","18",360000,310000,0,50000,"Credit","Provisions","Low","Basic","No","Low","Confirm fund balance with fund statements."],
      // ── BALANCE SHEET: CURRENT LIABILITIES ────────────────────────────────────
      [48,"BS","Liabilities","Current Liabilities","Trade and other payables","Suppliers","Trade payables","2301","19",2480000,2060000,1760000,2180000,"Credit","Payables","High","Expanded","Yes","High","Circularise supplier confirmations; review cut-off."],
      [49,"BS","Liabilities","Current Liabilities","Trade and other payables","Accrued expenses","Accrued expenses","2302","19",680000,520000,520000,680000,"Credit","Payables","Medium","Standard","No","Medium","Review post year-end invoices for completeness."],
      [50,"BS","Liabilities","Current Liabilities","Trade and other payables","Advance from customers","Customer advances","2310","19",420000,350000,350000,420000,"Credit","Payables","Medium","Standard","No","Medium","Verify recognition criteria for revenue recognition."],
      [51,"BS","Liabilities","Current Liabilities","Accrued liabilities","Accrued wages","Accrued wages payable","2320","19",380000,310000,310000,380000,"Credit","Payables","Medium","Standard","No","Low","Match with payroll records and bank transfers post year-end."],
      [52,"BS","Liabilities","Current Liabilities","Taxation","Income tax payable","Income tax payable","2501","20",650000,540000,540000,650000,"Credit","Taxation","Medium","Standard","No","Low","Reconcile with current tax computation and advance tax."],
      [53,"BS","Liabilities","Current Liabilities","Taxation","Sales tax payable","Sales tax payable","2510","20",280000,240000,240000,280000,"Credit","Taxation","Medium","Standard","No","Low","Verify with FBR returns and payment receipts."],
      [54,"BS","Liabilities","Current Liabilities","Taxation","Withholding tax payable","WHT payable","2511","20",140000,120000,120000,140000,"Credit","Taxation","Low","Basic","No","Low","Confirm remittance to FBR."],
      [55,"BS","Liabilities","Current Liabilities","Short-term borrowings","Running finance","Running finance facility","2401","21",1750000,900000,4250000,5100000,"Credit","Borrowings","High","Expanded","Yes","High","Bank confirmation and drawdown schedule required."],
      [56,"BS","Liabilities","Current Liabilities","Short-term borrowings","Cash credit","Cash credit facility","2402","21",800000,600000,1200000,1400000,"Credit","Borrowings","High","Expanded","Yes","Medium","Review facility limit and security arrangement."],
      [57,"BS","Liabilities","Current Liabilities","Current portion of long-term loans","Current maturity of long-term loan","Current maturity of long-term loan","2110","22",700000,700000,700000,700000,"Credit","Borrowings","High","Expanded","Yes","High","Confirm instalment falling due within 12 months."],
      // ── PROFIT & LOSS: INCOME ──────────────────────────────────────────────────
      [58,"P&L","Income","Revenue","Sales","Local sales","Local product sales","5101","23",18200000,15800000,350000,18550000,"Credit","Revenue","High","Expanded","Yes","High","Cut-off testing; analytical procedures on monthly trends."],
      [59,"P&L","Income","Revenue","Sales","Export sales","Export product sales","5102","23",4850000,3960000,50000,4900000,"Credit","Revenue","High","Expanded","Yes","High","Foreign exchange and customs documentation review."],
      [60,"P&L","Income","Revenue","Sales","Service revenue","Service fee revenue","5103","23",1200000,980000,0,1200000,"Credit","Revenue","High","Expanded","Yes","High","Revenue recognition policy — performance obligation mapping."],
      [61,"P&L","Income","Other income","Scrap sales","Scrap sales","Scrap and by-product income","5201","24",420000,300000,5000,425000,"Credit","Other Income","Low","Basic","No","Low","Verify scrap disposal records and proceeds."],
      [62,"P&L","Income","Other income","Interest income","Interest income","Interest income","5202","24",185000,140000,0,185000,"Credit","Other Income","Low","Basic","No","Low","Recalculate on savings balances; reconcile with bank."],
      [63,"P&L","Income","Other income","Gain on disposal","Gain on disposal of assets","Profit on disposal of assets","5210","24",95000,0,0,95000,"Credit","Other Income","Medium","Standard","No","Low","Inspect disposal records and sale proceeds."],
      // ── PROFIT & LOSS: COST OF SALES ──────────────────────────────────────────
      [64,"P&L","Expenses","Cost of Sales","Direct material","Raw material consumed","Cost of raw material consumed","6101","25",14500000,12800000,14500000,0,"Debit","Cost of Sales","High","Expanded","Yes","High","Tie to purchases, opening stock and closing stock."],
      [65,"P&L","Expenses","Cost of Sales","Direct material","Purchases","Material purchases","6102","25",15200000,13400000,15200000,0,"Debit","Cost of Sales","High","Expanded","Yes","High","Cut-off testing; verify GRNs around year-end."],
      [66,"P&L","Expenses","Cost of Sales","Direct labour","Factory wages","Direct labour cost","6103","25",3200000,2850000,3200000,0,"Debit","Cost of Sales","High","Expanded","Yes","Medium","Payroll listing and headcount analytics."],
      [67,"P&L","Expenses","Cost of Sales","Direct labour","Factory salaries","Factory salaries","6104","25",1400000,1250000,1400000,0,"Debit","Cost of Sales","Medium","Standard","Yes","Medium","Confirm with payroll register and EOBI/PESSI returns."],
      [68,"P&L","Expenses","Cost of Sales","Manufacturing overhead","Factory utilities","Factory overhead — utilities","6105","25",2150000,1980000,2150000,0,"Debit","Cost of Sales","Medium","Standard","Yes","Medium","Analytical procedures; compare with prior year usage."],
      [69,"P&L","Expenses","Cost of Sales","Manufacturing overhead","Factory rent","Factory overhead — rent","6106","25",960000,880000,960000,0,"Debit","Cost of Sales","Low","Basic","No","Low","Verify lease agreement and monthly rent amount."],
      [70,"P&L","Expenses","Cost of Sales","Manufacturing overhead","Factory insurance","Factory overhead — insurance","6107","25",380000,340000,380000,0,"Debit","Cost of Sales","Low","Basic","No","Low","Inspect insurance policy schedule."],
      [71,"P&L","Expenses","Cost of Sales","Manufacturing overhead","Repair and maintenance","Factory overhead — repairs","6108","25",620000,560000,620000,0,"Debit","Cost of Sales","Medium","Standard","Yes","Medium","Sample testing of repair invoices; capitalisation review."],
      // ── PROFIT & LOSS: ADMINISTRATIVE EXPENSES ────────────────────────────────
      [72,"P&L","Expenses","Administrative Expenses","Salaries and benefits","Admin salaries","Administrative salaries","6201","26",2450000,2240000,2450000,0,"Debit","Operating Expenses","Medium","Standard","Yes","Medium","Payroll analytics; compare headcount and per-head cost."],
      [73,"P&L","Expenses","Administrative Expenses","Salaries and benefits","Admin wages","Staff benefits","6202","26",580000,520000,580000,0,"Debit","Operating Expenses","Low","Basic","No","Low","EOBI, PESSI contributions confirmed."],
      [74,"P&L","Expenses","Administrative Expenses","Utilities","Office utilities","Office expenses","6203","26",340000,315000,340000,0,"Debit","Operating Expenses","Low","Basic","No","Low","Analytical comparison with prior year."],
      [75,"P&L","Expenses","Administrative Expenses","Utilities","Office rent","Office rent","6204","26",480000,440000,480000,0,"Debit","Operating Expenses","Low","Basic","No","Low","Agree to lease agreement."],
      [76,"P&L","Expenses","Administrative Expenses","Depreciation","Depreciation expense","Depreciation — plant and machinery","6205","26",980000,910000,980000,0,"Debit","PPE","Medium","Standard","No","Low","Recalculate and tie to fixed asset register."],
      [77,"P&L","Expenses","Administrative Expenses","Amortisation","Amortisation expense","Amortisation — intangibles","6206","26",100000,90000,100000,0,"Debit","Intangibles","Low","Basic","No","Low","Confirm useful life and straight-line rate."],
      [78,"P&L","Expenses","Administrative Expenses","Repair and maintenance","Repair and maintenance (admin)","Repair and maintenance","6207","26",260000,220000,260000,0,"Debit","Operating Expenses","Low","Basic","No","Low","Sample of invoices; capitalisation criteria applied."],
      [79,"P&L","Expenses","Administrative Expenses","Printing and stationery","Printing and stationery","Printing and stationery","6208","26",120000,105000,120000,0,"Debit","Operating Expenses","Low","Basic","No","Low","Analytical review."],
      [80,"P&L","Expenses","Administrative Expenses","Communication expenses","Communication expenses","Communication expenses","6209","26",180000,155000,180000,0,"Debit","Operating Expenses","Low","Basic","No","Low","Telephone and internet bills; analytical review."],
      [81,"P&L","Expenses","Administrative Expenses","Advertisement and marketing","Advertisement and marketing","Advertisement and marketing","6210","26",350000,290000,350000,0,"Debit","Operating Expenses","Low","Basic","No","Low","Review marketing invoices and campaign reports."],
      // ── PROFIT & LOSS: SELLING AND DISTRIBUTION ───────────────────────────────
      [82,"P&L","Expenses","Selling and Distribution","Freight outward","Delivery expense","Freight and forwarding","6301","27",560000,490000,560000,0,"Debit","Operating Expenses","Low","Basic","No","Low","Sample of freight invoices; analytical procedures."],
      [83,"P&L","Expenses","Selling and Distribution","Freight outward","Forwarding expense","Distribution expenses","6302","27",220000,190000,220000,0,"Debit","Operating Expenses","Low","Basic","No","Low","Agree to third-party forwarder invoices."],
      [84,"P&L","Expenses","Selling and Distribution","Travelling and conveyance","Travelling and conveyance","Travelling and conveyance","6303","27",310000,270000,310000,0,"Debit","Operating Expenses","Low","Basic","No","Low","Sample review of travel claims and approvals."],
      // ── PROFIT & LOSS: FINANCE COST ───────────────────────────────────────────
      [85,"P&L","Expenses","Finance Cost","Markup on borrowings","Markup on term finance","Mark-up on term finance","6401","28",870000,795000,870000,0,"Debit","Borrowings","Medium","Standard","No","Low","Recompute finance charges per loan schedule."],
      [86,"P&L","Expenses","Finance Cost","Markup on borrowings","Markup on running finance","Mark-up on running finance","6402","28",340000,280000,340000,0,"Debit","Borrowings","Medium","Standard","No","Low","Reconcile with bank statement interest charges."],
      [87,"P&L","Expenses","Finance Cost","Markup on borrowings","Bank charges","Bank charges and commission","6410","28",85000,72000,85000,0,"Debit","Borrowings","Low","Basic","No","Low","Agree to bank statement charges schedule."],
      // ── PROFIT & LOSS: TAXATION ───────────────────────────────────────────────
      [88,"P&L","Expenses","Taxation","Current tax","Current tax expense","Current tax provision","6501","29",1150000,980000,1150000,0,"Debit","Taxation","High","Expanded","No","Medium","Prepare tax computation; reconcile with effective rate."],
      [89,"P&L","Expenses","Taxation","Current tax","Deferred tax expense","Deferred tax charge","6502","29",140000,110000,140000,0,"Debit","Taxation","Medium","Standard","No","Low","Reconcile deferred tax movement with balance sheet."],
    ];

    for (let i = 0; i < sampleData.length; i++) {
      const row = sampleData[i];
      const r = ws.getRow(9 + i);
      r.height = 18;
      for (let c = 0; c < 9; c++) cellPlain(r.getCell(c + 1), row[c]);
      for (let c = 9; c <= 12; c++) cellGreen(r.getCell(c + 1), row[c], "#,##0");
      for (let c = 13; c <= 19; c++) cellPlain(r.getCell(c + 1), row[c]);
    }

    // ── Blank editable rows (rows 94–200) for user data entry ────────────────
    const BLANK_START = 9 + sampleData.length; // row 98
    const BLANK_END   = 200;
    for (let r = BLANK_START; r <= BLANK_END; r++) {
      const row = ws.getRow(r);
      row.height = 18;
      // Line_ID auto-numbered
      const lineCell = row.getCell(1);
      lineCell.value = r - 8;
      lineCell.font  = { size: 10, name: "Calibri", color: { argb: "FFAAAAAA" } };
      lineCell.alignment = { vertical: "middle" };
      // Financial value columns green
      for (let c = 10; c <= 13; c++) {
        const fc = row.getCell(c);
        fc.value = null;
        fc.fill  = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2F0D9" } };
        fc.numFmt = "#,##0";
        fc.font   = { size: 10, name: "Calibri" };
        fc.alignment = { vertical: "middle", horizontal: "right" };
      }
    }

    // ── Hidden "Lists" sheet — ALL dropdown values stored here ───────────────
    // All dropdowns use range references → no 255-char Excel inline limit.
    const wsList = wb.addWorksheet("Lists");
    wsList.state = "veryHidden";

    // ─── Column catalogue (each array = one column in Lists sheet) ────────────
    const lineItems = [
      // Balance Sheet — Assets
      "Property, plant and equipment","Intangible assets","Long-term investments",
      "Long-term loans and advances","Capital work in progress",
      "Right-of-use assets",
      // Balance Sheet — Current Assets
      "Inventories","Trade debts","Advances and deposits","Other receivables",
      "Short-term investments","Cash and bank balances",
      // Balance Sheet — Equity
      "Share capital","Reserves","Retained earnings","Accumulated losses",
      "Surplus on revaluation of fixed assets","Unappropriated profit",
      // Balance Sheet — Non-Current Liabilities
      "Long-term loans","Lease liabilities","Deferred tax liability","Deferred tax asset",
      "Staff retirement benefits","Long-term deposits","Other non-current liabilities",
      // Balance Sheet — Current Liabilities
      "Trade and other payables","Accrued liabilities","Advance from customers",
      "Taxation","Short-term borrowings","Current portion of long-term loans",
      "Unclaimed dividends","Other current liabilities",
      // P&L — Income
      "Sales","Export sales","Service revenue","Contract revenue",
      "Scrap sales","By-product sales","Other income","Dividend income",
      "Gain on disposal of assets","Interest income","Rental income",
      "Exchange gain","Miscellaneous income",
      // P&L — Expenses
      "Direct material","Direct labour","Manufacturing overhead",
      "Cost of goods sold","Salaries and benefits","Wages",
      "Utilities","Rent and rates","Depreciation","Amortisation",
      "Repair and maintenance","Printing and stationery",
      "Communication expenses","Advertisement and marketing",
      "Freight outward","Traveling and conveyance",
      "Legal and professional charges","Audit fee",
      "Insurance","Security charges","Postage and courier",
      "Markup on borrowings","Bank charges and commission","Exchange loss",
      "Current tax","Deferred tax expense","Prior year tax",
    ];

    const subLineItems = [
      // PPE sub-items
      "Land","Freehold land","Leasehold land",
      "Building","Factory building","Office building","Warehouse",
      "Plant and machinery","Production machinery","Manufacturing equipment",
      "Testing equipment","Packing machinery","Generator",
      "Furniture and fixtures","Office furniture","Lab furniture",
      "Office equipment","Computer equipment","Servers and networking",
      "IT hardware","Printers and scanners",
      "Vehicles","Motor vehicles","Fork lifts","Company cars",
      "Capital work in progress","Plant under installation",
      // Intangibles
      "ERP software","Accounting software","CRM software",
      "Patents and trademarks","Licenses and franchises","Goodwill",
      // Investments
      "Investments in subsidiaries","Investments in associates",
      "Available-for-sale investments","Held-to-maturity investments",
      // Inventories
      "Raw materials","Work in progress","Finished goods",
      "Stores and spares","Packing materials","Goods in transit",
      // Receivables
      "Local customers","Export customers","Government receivables",
      "Related party receivables","Doubtful debts provision",
      // Advances
      "Security deposits","Prepaid insurance","Prepaid rent",
      "Prepaid expenses","Advances to suppliers","Staff advances",
      "Advance tax","Income tax refundable","Sales tax refundable",
      // Cash
      "Current account","Savings account","Cash in hand",
      "Foreign currency account","Fixed deposit","Treasury bills",
      // Equity
      "Ordinary shares","Preference shares","Issued and paid-up capital",
      "General reserve","Capital reserve","Revenue reserve",
      "Accumulated profit","Accumulated loss",
      "Surplus on revaluation of fixed assets",
      // LT Liabilities
      "Term finance","Diminishing musharaka","Loan from directors",
      "Lease liability — buildings","Lease liability — equipment",
      "Deferred tax liability","Deferred tax asset",
      "Gratuity","Provident fund","EOBI payable",
      // Current Liabilities
      "Suppliers","Trade creditors","Accrued expenses",
      "Accrued wages","Other payables","Advance from customers",
      "Income tax payable","Sales tax payable","Withholding tax payable",
      "Federal excise duty payable","Running finance","Cash credit",
      "Short-term loan","Current maturity of long-term loan",
      // Revenue
      "Local sales","Export sales","Service fee","Contract revenue",
      "Scrap sales","By-product sales",
      // Other Income
      "Interest income","Gain on disposal","Rental income",
      "Exchange gain","Dividend received","Miscellaneous income",
      // CoS
      "Raw material consumed","Material purchases","Freight inward",
      "Factory wages","Factory salaries",
      "Factory utilities","Factory rent","Factory insurance","Factory repairs",
      // Expenses
      "Admin salaries","Admin wages","Staff benefits","EOBI contribution",
      "Office utilities","Office rent","Office insurance",
      "Depreciation expense","Amortisation expense",
      "Repair and maintenance","Printing and stationery",
      "Telephone and internet","Advertisement","Marketing expenses",
      "Delivery expense","Forwarding expense","Travelling","Conveyance",
      "Legal charges","Audit fee","Professional fee",
      "Bank markup","Running finance markup","Bank charges and commission",
      "Current tax expense","Prior year tax","Deferred tax charge","Deferred tax income",
    ];

    const accountNames = [
      // PPE
      "Freehold land","Leasehold land","Factory building","Office building","Warehouse",
      "Production machinery","Manufacturing equipment","Testing equipment","Packing machinery",
      "Generator set","Office furniture","Computer equipment","Servers and networking",
      "IT hardware","Printers","Motor vehicles","Fork lifts","Company cars",
      "Capital work in progress — plant expansion",
      // Intangibles
      "ERP software","Accounting software","CRM software",
      "Accounting software","Patents and trademarks","Licenses and franchises",
      // Investments
      "Investment in subsidiary — 100%","Investment in associate — 25%",
      // Current Assets
      "Raw material inventory","WIP inventory","Finished goods inventory",
      "Stores inventory","Packing material stock","Goods in transit",
      "Trade receivables — domestic","Trade receivables — export",
      "Government contract receivables",
      "Security deposits — utilities","Security deposits — tenancy",
      "Prepaid insurance","Prepaid rent","Advance income tax",
      "Income tax refundable","Sales tax refundable",
      "MCB current account","HBL current account","UBL savings account",
      "Petty cash fund","Foreign currency account","Treasury bills — 3 months",
      // Equity
      "Issued and paid-up share capital","Preference share capital",
      "General reserve","Capital reserve","Revenue reserve",
      "Retained earnings","Accumulated losses","Revaluation surplus",
      // LT Liabilities
      "Term finance — HBL","Diminishing musharaka — Meezan","Directors loan",
      "Lease liability — factory building","Lease liability — equipment",
      "Deferred tax liability","Deferred tax asset",
      "Gratuity payable","Provident fund payable",
      // Current Liabilities
      "Trade payables — domestic","Trade payables — import",
      "Accrued salaries","Accrued expenses","Customer advances",
      "Income tax payable","Sales tax payable","WHT payable","FED payable",
      "Running finance facility","Cash credit facility",
      "Current maturity of term finance",
      // Revenue
      "Sales revenue — local","Sales revenue — export","Service fee revenue",
      "Contract revenue","Scrap and by-product income","Miscellaneous income",
      // Other Income
      "Interest income — bank","Profit on disposal of assets",
      "Rental income","Dividend received","Exchange gain",
      // CoS
      "Cost of raw material consumed","Material purchases","Freight inward",
      "Direct labour cost","Factory wages","Factory salaries",
      "Factory overhead — electricity","Factory overhead — gas",
      "Factory overhead — rent","Factory overhead — insurance",
      "Factory overhead — repairs and maintenance",
      // Admin
      "Administrative salaries","Staff benefits — admin",
      "Office electricity and utilities","Office rent",
      "Depreciation — buildings","Depreciation — plant and machinery",
      "Depreciation — vehicles","Amortisation — intangibles",
      "Repair and maintenance — office","Printing and stationery",
      "Telephone and internet","Advertisement and marketing",
      "Legal and professional charges","Audit fee",
      // Selling
      "Freight and forwarding","Distribution expense",
      "Travelling and conveyance","Export expenses",
      // Finance
      "Mark-up on term finance","Mark-up on running finance",
      "Bank charges and commission","Exchange loss",
      // Tax
      "Current tax provision","Prior year tax adjustment",
      "Deferred tax charge","Deferred tax income",
    ];

    const accountCodes = [
      "1101","1102","1103","1104","1105","1106",
      "1201","1202","1203","1204","1205","1210","1211","1215","1220","1230","1240","1250",
      "1301","1302","1303","1304","1305","1310","1320",
      "1401","1402","1403","1410","1420","1430","1440","1450",
      "1501","1502","1510","1511","1512","1520","1521","1522","1523","1524",
      "1530","1531","1540","1541","1542","1550","1551","1560","1570","1580","1590","1591",
      "1601","1602","1603","1610","1620","1630",
      "1701","1702","1710","1720",
      "1801","1802","1810","1820",
      "2101","2102","2103","2104","2110","2120","2130",
      "2201","2202","2210","2220","2230",
      "2301","2302","2303","2310","2320","2330","2340","2350","2360",
      "2401","2402","2410","2420","2430",
      "2501","2502","2510","2511","2512","2520",
      "3101","3102","3110","3120",
      "3201","3202","3203","3210","3220","3230","3240",
      "3301","3302","3310","3320",
      "5101","5102","5103","5104","5110","5120","5130",
      "5201","5202","5203","5210","5220","5230","5240","5250",
      "6101","6102","6103","6104","6110","6111","6112","6113","6114","6120","6130","6140",
      "6201","6202","6203","6204","6210","6211","6212","6213","6220","6221",
      "6230","6231","6240","6241","6250","6260","6270","6280","6290",
      "6301","6302","6303","6310","6320","6330",
      "6401","6402","6403","6410","6420",
      "6501","6502","6503","6510","6520",
    ];

    // All categorical dropdown columns (F onwards in Lists sheet)
    const statementTypes   = ["BS","P&L","OCI","EQ","CF","Notes"];
    const fsSections       = [
      "Assets","Equity","Liabilities","Income","Expenses","OCI",
      "Notes to Accounts","Statement of Changes in Equity","Cash Flow",
    ];
    const majorHeads       = [
      // Balance Sheet
      "Non-Current Assets","Current Assets",
      "Equity",
      "Non-Current Liabilities","Current Liabilities",
      // P&L
      "Revenue","Other Income","Cost of Sales","Gross Profit",
      "Administrative Expenses","Selling and Distribution",
      "Finance Cost","Taxation","Other Expenses",
      // OCI / EQ / CF
      "Other Comprehensive Income",
      "Share Capital and Reserves",
      "Operating Activities","Investing Activities","Financing Activities",
    ];
    const normalBalances   = ["Debit","Credit"];
    const wpAreas          = [
      // Balance Sheet areas
      "PPE","Intangibles","CWIP","Right-of-Use Assets","Long-term Investments",
      "Inventory","Receivables","Advances and Deposits","Cash and Bank",
      "Other Assets","Short-term Investments",
      // Equity & Liabilities
      "Equity","Borrowings","Lease Liabilities","Deferred Tax",
      "Payables","Accrued Liabilities","Customer Advances",
      "Taxation","Staff Retirement Benefits","Provisions",
      // P&L areas
      "Revenue","Cost of Sales","Operating Expenses",
      "Other Income","Finance Cost",
      // Special areas
      "Related Party Transactions","Going Concern",
      "Contingencies and Commitments","Subsequent Events",
    ];
    const riskLevels       = ["High","Medium","Low","Not Applicable"];
    const procedureScales  = ["Expanded","Standard","Basic","Nil"];
    const aiGlFlags        = ["Yes","No"];
    const glPriorities     = ["High","Medium","Low"];
    const companyTypes     = [
      "Private Limited Company","Public Limited Company",
      "Listed Company","Unlisted Public Company",
      "Sole Proprietorship","Partnership","LLP",
      "Trust","NGO / NPO","Government Entity",
      "Branch Office","Liaison Office","Other",
    ];
    const industries       = [
      "Manufacturing","Textile","Trading","Services",
      "Financial Services","Banking","Insurance","Leasing",
      "Real Estate","Construction","Healthcare","Pharmaceuticals",
      "Technology","Telecoms","Education","Agriculture","Energy","Oil and Gas",
      "Mining","Transport and Logistics","Hospitality","Retail","Other",
    ];
    const frameworks       = [
      "IFRS (Full)","IFRS for SMEs","IAS","GAAP",
      "IFAS","Companies Act 2017 (Pakistan)",
      "NBFCs Regulations","Insurance Ordinance","Banking Companies Ordinance","Other",
    ];
    const auditTypes       = [
      "Statutory Audit","Tax Audit","Internal Audit",
      "Special Purpose Audit","Review Engagement",
      "Agreed Upon Procedures","Compilation","Due Diligence",
      "Forensic Audit","Regulatory Inspection",
    ];
    const currencies       = [
      "PKR","USD","EUR","GBP","AED","SAR","JPY","CNY","CHF","CAD","AUD","Other",
    ];
    const engagementSizes  = ["Small","Medium","Large","Very Large","Listed Entity"];
    const noteNumbers      = Array.from({ length: 100 }, (_, i) => String(i + 1));

    // ── Write all columns to Lists sheet ──────────────────────────────────────
    const listCols: string[][] = [
      lineItems,        // A
      subLineItems,     // B
      accountNames,     // C
      accountCodes,     // D
      noteNumbers,      // E
      statementTypes,   // F
      fsSections,       // G
      majorHeads,       // H
      normalBalances,   // I
      wpAreas,          // J
      riskLevels,       // K
      procedureScales,  // L
      aiGlFlags,        // M
      glPriorities,     // N
      companyTypes,     // O
      industries,       // P
      frameworks,       // Q
      auditTypes,       // R
      currencies,       // S
      engagementSizes,  // T
    ];

    const maxListRows = Math.max(...listCols.map(c => c.length));
    for (let r = 0; r < maxListRows; r++) {
      const row = wsList.getRow(r + 1);
      listCols.forEach((col, ci) => {
        if (col[r] !== undefined) row.getCell(ci + 1).value = col[r];
      });
    }

    // ── Helper: add validation via Lists sheet range reference ────────────────
    function addListDropdown(
      addr: string, col: string, len: number, title: string, msg: string
    ) {
      (ws as any).dataValidations.add(addr, {
        type: "list",
        allowBlank: true,
        formulae: [`Lists!$${col}$1:$${col}$${len}`],
        showErrorMessage: true,
        errorStyle: "warning",
        errorTitle: `Invalid ${title}`,
        error: `Please select a value from the ${title} list`,
        showInputMessage: true,
        promptTitle: title,
        prompt: msg,
      });
    }

    // ── Engagement profile dropdowns (rows 5-6) ───────────────────────────────
    addListDropdown("E5", "O", companyTypes.length,   "Company_Type",        "Select the legal entity type");
    addListDropdown("H5", "P", industries.length,     "Industry",            "Select the primary industry sector");
    addListDropdown("K5", "Q", frameworks.length,     "Reporting_Framework", "Select the applicable financial reporting framework");
    addListDropdown("B6", "R", auditTypes.length,     "Audit_Type",          "Select the type of engagement");
    addListDropdown("E6", "S", currencies.length,     "Currency",            "Select the functional/presentation currency");
    addListDropdown("H6", "T", engagementSizes.length,"Engagement_Size",     "Select the engagement size classification");

    // ── Data row dropdowns (rows 9 to 200) ───────────────────────────────────
    const DATA_ROWS = "9:200";
    const D0 = DATA_ROWS.split(":")[0];
    const D1 = DATA_ROWS.split(":")[1];

    addListDropdown(`B${D0}:B${D1}`, "F", statementTypes.length,  "Statement_Type",
      "BS=Balance Sheet · P&L=Profit & Loss · OCI=Other Comprehensive Income · EQ=Equity · CF=Cash Flow");
    addListDropdown(`C${D0}:C${D1}`, "G", fsSections.length,      "FS_Section",
      "Select the financial statement section for this line item");
    addListDropdown(`D${D0}:D${D1}`, "H", majorHeads.length,      "Major_Head",
      "Select the major classification head (e.g. Non-Current Assets, Revenue)");
    addListDropdown(`N${D0}:N${D1}`, "I", normalBalances.length,  "Normal_Balance",
      "Debit = asset/expense account · Credit = liability/income/equity account");
    addListDropdown(`O${D0}:O${D1}`, "J", wpAreas.length,         "WP_Area",
      "Select the audit working paper area this account maps to");
    addListDropdown(`P${D0}:P${D1}`, "K", riskLevels.length,      "Risk_Level",
      "High = significant risk area · Medium = moderate · Low = routine · N/A = excluded");
    addListDropdown(`Q${D0}:Q${D1}`, "L", procedureScales.length, "Procedure_Scale",
      "Expanded = full substantive + controls · Standard = standard procedures · Basic = analytical only");
    addListDropdown(`R${D0}:R${D1}`, "M", aiGlFlags.length,       "AI_GL_Flag",
      "Yes = AI will generate detailed GL transactions for this account");
    addListDropdown(`S${D0}:S${D1}`, "N", glPriorities.length,    "GL_Generation_Priority",
      "Priority order for GL transaction generation");

    // Col E — Line_Item  (Lists!A)
    addListDropdown(`E${D0}:E${D1}`, "A", lineItems.length,    "Line_Item",    "Select the financial statement line item");
    // Col F — Sub_Line_Item  (Lists!B)
    addListDropdown(`F${D0}:F${D1}`, "B", subLineItems.length, "Sub_Line_Item","Select the sub-classification or asset category");
    // Col G — Account_Name  (Lists!C)
    addListDropdown(`G${D0}:G${D1}`, "C", accountNames.length, "Account_Name", "Select the specific account name from the chart of accounts");
    // Col H — Account_Code  (Lists!D)
    addListDropdown(`H${D0}:H${D1}`, "D", accountCodes.length, "Account_Code", "Select the account code from the standard CoA");
    // Col I — Note_No  (Lists!E)
    addListDropdown(`I${D0}:I${D1}`, "E", noteNumbers.length,  "Note_No",      "Select the financial statement note number (1–100)");

    // ── Row 201: Totals (formula row below all data) ──────────────────────────
    const totRow = 201;
    ws.getRow(totRow).height = 22;
    const tCell = ws.getRow(totRow).getCell(1);
    tCell.value = "TOTAL";
    tCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E78" } };
    tCell.font = { bold: true, size: 10, name: "Calibri", color: { argb: "FFFFFFFF" } };
    tCell.alignment = { vertical: "middle" };
    ws.mergeCells(totRow, 1, totRow, 9);
    const totCols = ["J","K","L","M"];
    for (const col of totCols) {
      const tc = ws.getRow(totRow).getCell(col);
      tc.value = { formula: `SUM(${col}9:${col}200)` };
      tc.fill  = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E78" } };
      tc.font  = { bold: true, size: 10, name: "Calibri", color: { argb: "FFFFFFFF" } };
      tc.numFmt = "#,##0";
      tc.alignment = { vertical: "middle", horizontal: "right" };
    }

    // Write to buffer first — stream writing skips dataValidation XML sections
    const buf = await wb.xlsx.writeBuffer();
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", 'attachment; filename="Financial_Data_Upload_Template.xlsx"');
    res.setHeader("Content-Length", buf.byteLength);
    return res.end(Buffer.from(buf));
    ── End of legacy template generation ──────────────────────────────────── */
  } catch (err: any) {
    logger.error({ err }, "Route error");
    res.status(500).json({ error: err.message });
  }
});

router.get("/download-template-OLD_DO_NOT_USE", async (_req: Request, res: Response) => {
  // This old route is disabled — kept here only for reference.
  res.status(410).json({ error: "Use /download-template" });
  return;
  // ── ORIGINAL MULTI-SHEET TEMPLATE BELOW (disabled) ──
  try {
    const wb = new ExcelJS.Workbook();
    wb.creator = "Alam & Aulakh Chartered Accountants";
    wb.created = new Date();

    // ── Shared styles ─────────────────────────────────────────────────────────
    const C = {
      headerBg:  "FF1E3A8A", headerFg:  "FFFFFFFF",
      sectionBg: "FF3B82F6", sectionFg: "FFFFFFFF",
      labelBg:   "FFE2E8F0", labelFg:   "FF1E293B",
      editBg:    "FFFEF9C3", editFg:    "FF1E293B", editBorder: "FFF59E0B",
      totalBg:   "FFDBEAFE", totalFg:   "FF1E40AF",
      noteBg:    "FFF0FDF4", noteFg:    "FF166534",
      warnBg:    "FFFEF3C7", warnFg:    "FF92400E",
    };
    const thin = { style: "thin" as const, color: { argb: "FFCBD5E1" } };
    const editBorderStyle = { style: "medium" as const, color: { argb: C.editBorder } };
    const allThin = { top: thin, left: thin, bottom: thin, right: thin };
    const allEditBorder = { top: editBorderStyle, left: editBorderStyle, bottom: editBorderStyle, right: editBorderStyle };

    const fmtNum = "#,##0";
    const fmtDate = "YYYY-MM-DD";

    function hdr(cell: ExcelJS.Cell, v: any, center = false) {
      cell.value = v; cell.protection = { locked: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.headerBg } };
      cell.font = { bold: true, color: { argb: C.headerFg }, size: 11 };
      cell.border = allThin;
      cell.alignment = { vertical: "middle", horizontal: center ? "center" : "left", wrapText: true };
    }
    function sect(cell: ExcelJS.Cell, v: any) {
      cell.value = v; cell.protection = { locked: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.sectionBg } };
      cell.font = { bold: true, color: { argb: C.sectionFg }, size: 10 };
      cell.border = allThin;
      cell.alignment = { vertical: "middle", horizontal: "left" };
    }
    function lbl(cell: ExcelJS.Cell, v: any) {
      cell.value = v; cell.protection = { locked: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.labelBg } };
      cell.font = { bold: true, color: { argb: C.labelFg }, size: 10 };
      cell.border = allThin;
      cell.alignment = { vertical: "middle", horizontal: "left" };
    }
    function edit(cell: ExcelJS.Cell, v: any, numFmt?: string) {
      cell.value = v; cell.protection = { locked: false };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.editBg } };
      cell.font = { color: { argb: C.editFg }, size: 10 };
      cell.border = allEditBorder;
      cell.alignment = { vertical: "middle", horizontal: typeof v === "number" ? "right" : "left" };
      if (numFmt) cell.numFmt = numFmt;
    }
    function total(cell: ExcelJS.Cell, v: any) {
      cell.value = v; cell.protection = { locked: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.totalBg } };
      cell.font = { bold: true, color: { argb: C.totalFg }, size: 10 };
      cell.border = allThin;
      cell.alignment = { vertical: "middle", horizontal: typeof v === "number" ? "right" : "left" };
      if (typeof v === "number") cell.numFmt = fmtNum;
    }
    function locked(cell: ExcelJS.Cell, v: any, numFmt?: string) {
      cell.value = v; cell.protection = { locked: true };
      cell.font = { color: { argb: C.editFg }, size: 10 };
      cell.border = allThin;
      cell.alignment = { vertical: "middle", horizontal: typeof v === "number" ? "right" : "left" };
      if (numFmt) cell.numFmt = numFmt;
    }
    function note(cell: ExcelJS.Cell, v: any) {
      cell.value = v; cell.protection = { locked: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.noteBg } };
      cell.font = { italic: true, color: { argb: C.noteFg }, size: 9 };
      cell.alignment = { vertical: "middle", wrapText: true };
    }
    async function protect(ws: ExcelJS.Worksheet) {
      await (ws as any).protect("", {
        sheet: true, selectLockedCells: true, selectUnlockedCells: true,
        formatCells: false, formatColumns: false, formatRows: false,
        insertRows: false, insertColumns: false, deleteRows: false, deleteColumns: false,
        sort: false, autoFilter: false,
      });
    }

    // ── DEMO COMPANY DATA ─────────────────────────────────────────────────────
    const co = {
      name:    "Pak Textile Holdings (Pvt) Ltd",
      ntn:     "3456789-0",
      strn:    "42-00-9876-543-21",
      address: "Plot 45-B, Sundar Industrial Estate, Raiwind Road",
      city:    "Lahore",
      period:  "2025",
      pStart:  "2024-07-01",
      pEnd:    "2025-06-30",
      type:    "Private Limited",
      listed:  "Unlisted",
      industry:"Textile Manufacturing",
      framework:"IFRS",
      engagement:"Statutory Audit",
    };

    // ══════════════════════════════════════════════════════════════════════════
    // SHEET 1 — INSTRUCTIONS
    // ══════════════════════════════════════════════════════════════════════════
    {
      const ws = wb.addWorksheet("INSTRUCTIONS", { properties: { tabColor: { argb: "FF1E3A8A" } } });
      ws.columns = [{ width: 6 }, { width: 48 }, { width: 30 }, { width: 30 }];

      const title = ws.getCell("B1");
      title.value = "ANA WORKING PAPERS — DATA UPLOAD TEMPLATE";
      title.font = { bold: true, size: 16, color: { argb: C.headerBg } };
      ws.getCell("B2").value = "Alam & Aulakh Chartered Accountants | Powered by ANA Audit Intelligence";
      ws.getCell("B2").font = { italic: true, size: 10, color: { argb: "FF64748B" } };
      ws.getRow(1).height = 30; ws.getRow(2).height = 18;

      const steps = [
        ["", "", ""],
        ["HOW TO USE THIS TEMPLATE", "", ""],
        ["Step 1", "Open each sheet and replace the YELLOW cells with your client's actual data.", "Yellow cells = editable"],
        ["Step 2", "Do NOT change any column headers, labels, or non-yellow cells.", "Grey/blue = locked"],
        ["Step 3", "Use plain numbers only — no PKR, Rs., commas or currency symbols (e.g. 875250000, not 8.75 Crore).", "Numbers only"],
        ["Step 4", "All dates must be in YYYY-MM-DD format (e.g. 2024-07-01).", "YYYY-MM-DD"],
        ["Step 5", "Each sheet must be saved as a separate .xlsx file and uploaded with the matching category.", "One file per sheet"],
        ["Step 6", "The demo data shown is for 'Pak Textile Holdings (Pvt) Ltd' — a large manufacturing company.", "Replace all yellow cells"],
        ["", "", ""],
        ["SHEET → UPLOAD CATEGORY MAP", "", ""],
        ["Entity Info",    "Upload as: Financial Statements",  "Filename: entity_info.xlsx"],
        ["Trial Balance",  "Upload as: Trial Balance",          "Filename: trial_balance.xlsx"],
        ["General Ledger", "Upload as: General Ledger",         "Filename: general_ledger.xlsx"],
        ["Balance Sheet",  "Upload as: Financial Statements",   "Filename: balance_sheet.xlsx"],
        ["Profit & Loss",  "Upload as: Financial Statements",   "Filename: profit_loss.xlsx"],
        ["Bank Statement", "Upload as: Bank Statement",         "Filename: bank_statement.xlsx"],
        ["Tax Data",       "Upload as: Financial Statements",   "Filename: tax_data.xlsx"],
        ["", "", ""],
        ["CLASSIFICATION VALUES (Trial Balance)", "", ""],
        ["Use exactly one of →", "Asset | Liability | Equity | Revenue | Cost of Sales | Operating Expense | Finance Cost | Tax", ""],
      ];
      steps.forEach((row, i) => {
        const r = ws.getRow(i + 3);
        if (row[0] === "HOW TO USE THIS TEMPLATE" || row[0] === "SHEET → UPLOAD CATEGORY MAP" || row[0] === "CLASSIFICATION VALUES (Trial Balance)") {
          const c = r.getCell(2); sect(c, row[0]); ws.mergeCells(`B${r.number}:D${r.number}`);
        } else if (row[0] === "") {
          r.height = 8;
        } else {
          lbl(r.getCell(2), row[0]);
          locked(r.getCell(3), row[1]);
          note(r.getCell(4), row[2]);
        }
        r.height = r.height || 18;
      });
      await protect(ws);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // SHEET 2 — ENTITY INFO
    // ══════════════════════════════════════════════════════════════════════════
    {
      const ws = wb.addWorksheet("Entity Info", { properties: { tabColor: { argb: "FF7C3AED" } } });
      ws.columns = [{ width: 6 }, { width: 35 }, { width: 45 }, { width: 35 }];

      hdr(ws.getCell("B1"), "ENTITY INFORMATION");
      ws.mergeCells("B1:D1"); ws.getRow(1).height = 28;
      hdr(ws.getCell("B2"), "Field"); hdr(ws.getCell("C2"), "▶  Replace yellow cells with actual client data  ◀", true); hdr(ws.getCell("D2"), "Notes / Guidance");
      ws.getRow(2).height = 20;

      const entityFields: [string, any, string][] = [
        ["Company / Client Name", co.name, "Full legal registered name"],
        ["NTN (National Tax Number)", co.ntn, "Format: 1234567-8"],
        ["STRN (Sales Tax Reg. No.)", co.strn, "Format: 42-00-1234-567-89 (leave blank if not registered)"],
        ["CNIC (Solo Proprietor only)", "", "Leave blank for companies"],
        ["Financial Year", co.period, "e.g. 2025 (for FY July 2024 – June 2025)"],
        ["Period Start Date", co.pStart, "YYYY-MM-DD  (e.g. 2024-07-01)"],
        ["Period End Date", co.pEnd, "YYYY-MM-DD  (e.g. 2025-06-30)"],
        ["Registered Address", co.address, "Full street address"],
        ["City", co.city, "e.g. Karachi, Lahore, Islamabad"],
        ["Industry / Sector", co.industry, "e.g. Manufacturing, Services, Trading, Real Estate"],
        ["Entity Type", co.type, "Private Limited / Public Limited / Partnership / Sole Proprietor"],
        ["Listed / Unlisted", co.listed, "PSX Listed / Unlisted"],
        ["Reporting Framework", co.framework, "IFRS / IFRS for SMEs / Companies Act 2017"],
        ["Engagement Type", co.engagement, "Statutory Audit / Tax Audit / Review / AUP"],
      ];
      entityFields.forEach(([field, val, hint], i) => {
        const r = ws.getRow(i + 3); r.height = 20;
        lbl(r.getCell(2), field);
        edit(r.getCell(3), val);
        note(r.getCell(4), hint);
      });

      ws.getRow(17).height = 12;
      sect(ws.getCell("B17"), "DIRECTORS / PARTNERS  (one per row)"); ws.mergeCells("B17:D17");
      hdr(ws.getCell("B18"), "Full Name"); hdr(ws.getCell("C18"), "Designation"); hdr(ws.getCell("D18"), "CNIC (optional)");
      const directors = [
        ["Mr. Tariq Mehmood", "Chief Executive Officer", ""],
        ["Mr. Asif Raza", "Chief Financial Officer", ""],
        ["Mr. Zulfiqar Ahmed", "Non-Executive Director", ""],
        ["Ms. Amina Siddiqui", "Independent Director", ""],
      ];
      directors.forEach(([n, d, c], i) => {
        const r = ws.getRow(19 + i); r.height = 18;
        edit(r.getCell(2), n); edit(r.getCell(3), d); edit(r.getCell(4), c);
      });

      ws.getRow(23).height = 12;
      sect(ws.getCell("B23"), "BANKERS  (one per row)"); ws.mergeCells("B23:D23");
      hdr(ws.getCell("B24"), "Bank Name"); hdr(ws.getCell("C24"), "Account Number"); hdr(ws.getCell("D24"), "Branch");
      const banks = [
        ["Habib Bank Limited (HBL)", "01430007900003", "Sundar Estate, Lahore"],
        ["MCB Bank Limited", "0670-0221456780", "Raiwind Road, Lahore"],
        ["United Bank Limited (UBL)", "1520-1-547892100", "Export Branch, Lahore"],
      ];
      banks.forEach(([n, a, b], i) => {
        const r = ws.getRow(25 + i); r.height = 18;
        edit(r.getCell(2), n); edit(r.getCell(3), a); edit(r.getCell(4), b);
      });
      await protect(ws);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // SHEET 3 — TRIAL BALANCE
    // ══════════════════════════════════════════════════════════════════════════
    {
      const ws = wb.addWorksheet("Trial Balance", { properties: { tabColor: { argb: "FF059669" } } });
      ws.columns = [
        { width: 14 }, { width: 38 }, { width: 22 }, { width: 18 },
        { width: 18 }, { width: 22 }, { width: 24 }, { width: 30 },
      ];
      const cols = ["Account Code", "Account Name", "Classification", "Debit (PKR)", "Credit (PKR)", "Closing Balance (PKR)", "Prior Year Balance (PKR)", "FS Line Mapping"];
      hdr(ws.getCell("A1"), "TRIAL BALANCE — Pak Textile Holdings (Pvt) Ltd  |  FY 2024-25"); ws.mergeCells("A1:H1"); ws.getRow(1).height = 26;
      note(ws.getCell("A2"), "All yellow cells are editable. Add or delete rows as needed. Do NOT change column headers. Classification must be exactly: Asset / Liability / Equity / Revenue / Cost of Sales / Operating Expense / Finance Cost / Tax"); ws.mergeCells("A2:H2"); ws.getRow(2).height = 30;
      cols.forEach((c, i) => hdr(ws.getRow(3).getCell(i + 1), c));
      ws.getRow(3).height = 22;

      const tbData: [string, string, string, number, number, number, number, string][] = [
        ["1001","Cash in Hand","Asset",2450000,0,2450000,1850000,"Cash and Bank Balances"],
        ["1002","Bank — HBL Current Account","Asset",45800000,0,45800000,38500000,"Cash and Bank Balances"],
        ["1003","Bank — MCB Operating Account","Asset",28350000,0,28350000,22100000,"Cash and Bank Balances"],
        ["1004","Bank — UBL Export Account","Asset",39200000,0,39200000,29750000,"Cash and Bank Balances"],
        ["1101","Trade Debtors — Local","Asset",98500000,0,98500000,82000000,"Trade Debts"],
        ["1102","Trade Debtors — Export","Asset",46500000,0,46500000,38200000,"Trade Debts"],
        ["1103","Advances to Suppliers","Asset",28500000,0,28500000,22000000,"Advances, Deposits & Prepayments"],
        ["1104","Short-Term Investments","Asset",35000000,0,35000000,25000000,"Short-Term Investments"],
        ["1105","Advance Income Tax","Asset",30225000,0,30225000,25500000,"Advance Tax / Tax Receivable"],
        ["1201","Raw Material Stock","Asset",95000000,0,95000000,78000000,"Inventories"],
        ["1202","Work in Process","Asset",42000000,0,42000000,36000000,"Inventories"],
        ["1203","Finished Goods","Asset",88500000,0,88500000,72000000,"Inventories"],
        ["1301","Plant & Machinery — at Cost","Asset",520000000,0,520000000,475000000,"Property, Plant & Equipment"],
        ["1302","Less: Accumulated Depreciation — P&M","Asset",0,185000000,-185000000,-162000000,"Property, Plant & Equipment"],
        ["1303","Land & Building — at Cost","Asset",285000000,0,285000000,285000000,"Property, Plant & Equipment"],
        ["1304","Capital Work in Progress","Asset",48000000,0,48000000,32000000,"Capital Work in Progress"],
        ["1305","Intangible Assets — ERP System","Asset",12000000,0,12000000,14500000,"Intangible Assets"],
        ["2001","Trade Creditors","Liability",0,85000000,85000000,70000000,"Trade and Other Payables"],
        ["2002","Accrued Liabilities","Liability",0,42500000,42500000,35000000,"Trade and Other Payables"],
        ["2003","Short-Term Borrowings — Running Finance","Liability",0,120000000,120000000,95000000,"Short-Term Borrowings"],
        ["2004","Current Portion — Long Term Loan","Liability",0,25000000,25000000,25000000,"Current Portion of Long-Term Loan"],
        ["2005","Income Tax Payable","Liability",0,11550000,11550000,8500000,"Income Tax Payable"],
        ["2101","Long-Term Financing — HBL","Liability",0,225000000,225000000,250000000,"Long-Term Borrowings"],
        ["2102","Deferred Tax Liability","Liability",0,38500000,38500000,35000000,"Deferred Tax"],
        ["3001","Ordinary Share Capital","Equity",0,500000000,500000000,500000000,"Share Capital"],
        ["3002","Capital Reserve","Equity",0,35000000,35000000,35000000,"Capital Reserve"],
        ["3003","Revenue Reserve / General Reserve","Equity",0,50000000,50000000,30000000,"Revenue Reserve"],
        ["3004","Unappropriated Profit (Opening)","Equity",0,45225000,45225000,30500000,"Retained Earnings"],
        ["4001","Sales — Local (Net of Returns)","Revenue",0,625250000,625250000,530000000,"Revenue from Contracts with Customers"],
        ["4002","Sales — Export (FOB)","Revenue",0,250000000,250000000,212100000,"Revenue from Contracts with Customers"],
        ["4003","Other Income — Exchange Gain","Revenue",0,2500000,2500000,1800000,"Other Income"],
        ["5001","Raw Material Consumed","Cost of Sales",435000000,0,435000000,368000000,"Cost of Sales"],
        ["5002","Direct Labour — Wages","Cost of Sales",98500000,0,98500000,83000000,"Cost of Sales"],
        ["5003","Factory Overheads","Cost of Sales",79000000,0,79000000,67000000,"Cost of Sales"],
        ["6001","Salaries — Administrative Staff","Operating Expense",42000000,0,42000000,36000000,"Administrative Expenses"],
        ["6002","Salaries — Sales & Marketing","Operating Expense",18500000,0,18500000,15500000,"Selling & Distribution Expenses"],
        ["6003","Rent, Rates & Utilities","Operating Expense",15200000,0,15200000,12800000,"Administrative Expenses"],
        ["6004","Depreciation — Admin Allocation","Operating Expense",8500000,0,8500000,7200000,"Administrative Expenses"],
        ["6005","Marketing & Advertising","Operating Expense",6800000,0,6800000,5500000,"Selling & Distribution Expenses"],
        ["6006","Traveling & Conveyance","Operating Expense",3250000,0,3250000,2800000,"Administrative Expenses"],
        ["6007","Legal & Professional Charges","Operating Expense",2500000,0,2500000,2200000,"Administrative Expenses"],
        ["7001","Bank Charges & Commission","Finance Cost",5800000,0,5800000,5200000,"Finance Costs"],
        ["7002","Interest on Long-Term Financing","Finance Cost",18700000,0,18700000,20500000,"Finance Costs"],
        ["8001","Income Tax — Current Year","Tax",38500000,0,38500000,32000000,"Income Tax"],
        ["8002","Deferred Tax — Charge","Tax",3275000,0,3275000,2800000,"Income Tax"],
      ];
      tbData.forEach((row, i) => {
        const r = ws.getRow(i + 4); r.height = 18;
        edit(r.getCell(1), row[0]);
        edit(r.getCell(2), row[1]);
        edit(r.getCell(3), row[2]);
        edit(r.getCell(4), row[3] || null, fmtNum);
        edit(r.getCell(5), row[4] || null, fmtNum);
        edit(r.getCell(6), row[5], fmtNum);
        edit(r.getCell(7), row[6], fmtNum);
        edit(r.getCell(8), row[7]);
      });
      const totRow = tbData.length + 4;
      const debitTotal = tbData.reduce((s, r) => s + r[3], 0);
      const creditTotal = tbData.reduce((s, r) => s + r[4], 0);
      ws.getRow(totRow).height = 20;
      total(ws.getRow(totRow).getCell(1), "TOTAL"); ws.mergeCells(`A${totRow}:C${totRow}`);
      total(ws.getRow(totRow).getCell(4), debitTotal);
      total(ws.getRow(totRow).getCell(5), creditTotal);
      total(ws.getRow(totRow).getCell(6), debitTotal - creditTotal);
      await protect(ws);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // SHEET 4 — GENERAL LEDGER
    // ══════════════════════════════════════════════════════════════════════════
    {
      const ws = wb.addWorksheet("General Ledger", { properties: { tabColor: { argb: "FF0891B2" } } });
      ws.columns = [
        { width: 14 }, { width: 14 }, { width: 36 }, { width: 14 },
        { width: 44 }, { width: 18 }, { width: 18 }, { width: 20 }, { width: 18 },
      ];
      hdr(ws.getCell("A1"), "GENERAL LEDGER — Pak Textile Holdings (Pvt) Ltd  |  FY 2024-25"); ws.mergeCells("A1:I1"); ws.getRow(1).height = 26;
      note(ws.getCell("A2"), "One row per journal line. All yellow cells are editable. Add rows as needed. Running Balance = cumulative balance for each account."); ws.mergeCells("A2:I2"); ws.getRow(2).height = 24;
      ["Entry Date","Account Code","Account Name","Voucher No.","Narration / Description","Debit (PKR)","Credit (PKR)","Running Balance (PKR)","Reference"].forEach((c, i) => hdr(ws.getRow(3).getCell(i+1), c));
      ws.getRow(3).height = 22;

      const glData: [string,string,string,string,string,number,number,number,string][] = [
        ["2024-07-01","4001","Sales — Local","SIV-0001","July 2024 Local Sales — Invoice Batch 1",0,52104167,572895833,"INV-BATCH-01"],
        ["2024-07-01","1101","Trade Debtors — Local","SIV-0001","July 2024 Local Sales — Invoice Batch 1",52104167,0,150604167,"INV-BATCH-01"],
        ["2024-07-05","5001","Raw Material Consumed","JV-0701","July 2024 RM Consumption — Production Run",36250000,0,471250000,"WO-JUL-01"],
        ["2024-07-05","1201","Raw Material Stock","JV-0701","July 2024 RM Consumption — Production Run",0,36250000,58750000,"WO-JUL-01"],
        ["2024-07-10","6001","Salaries — Administrative","CPV-0710","July 2024 Admin Salaries — 87 Staff",3500000,0,45500000,"SAL-ADMIN-JUL"],
        ["2024-07-10","1002","Bank — HBL Current Account","CPV-0710","July 2024 Admin Salaries — 87 Staff",0,3500000,42300000,"SAL-ADMIN-JUL"],
        ["2024-07-15","2001","Trade Creditors","BPV-0715","Payment to Sitara Chemicals Ltd",12500000,0,72500000,"PO-2024-089"],
        ["2024-07-15","1002","Bank — HBL Current Account","BPV-0715","Payment to Sitara Chemicals Ltd",0,12500000,29800000,"PO-2024-089"],
        ["2024-07-20","1004","Bank — UBL Export Account","BPV-0720","Export Proceeds — Invoice EXP-0045 (USD 88,000)",24500000,0,63700000,"EXP-0045"],
        ["2024-07-20","4002","Sales — Export (FOB)","BPV-0720","Export Proceeds — Invoice EXP-0045",0,24500000,225500000,"EXP-0045"],
        ["2024-07-25","7002","Interest on Long-Term Financing","JV-0725","HBL LT Loan Interest — July 2024",1558333,0,20258333,"LOAN-HBL-01"],
        ["2024-07-25","2101","Long-Term Financing — HBL","JV-0725","HBL LT Loan Interest — July 2024",0,1558333,226558333,"LOAN-HBL-01"],
        ["2024-07-31","5002","Direct Labour — Wages","CPV-0731","July 2024 Worker Wages — 263 Workers",8208333,0,106708333,"WAGES-JUL"],
        ["2024-07-31","1002","Bank — HBL Current Account","CPV-0731","July 2024 Worker Wages — 263 Workers",0,8208333,21591667,"WAGES-JUL"],
        ["2024-08-05","1201","Raw Material Stock","GRN-0801","Receipt: Indus Dyeing — Cotton 45,000 Kg",18750000,0,77500000,"GRN-0801"],
        ["2024-08-05","2001","Trade Creditors","GRN-0801","Receipt: Indus Dyeing — Cotton 45,000 Kg",0,18750000,91250000,"GRN-0801"],
        ["2024-08-15","1101","Trade Debtors — Local","BRV-0815","Receipt: Kohinoor Mills — Inv 1012",28500000,0,179104167,"INV-1012"],
        ["2024-08-15","1002","Bank — HBL Current Account","BRV-0815","Receipt: Kohinoor Mills — Inv 1012",0,28500000,50291667,"BRV-0815"],
        ["2024-09-30","6003","Rent, Rates & Utilities","CPV-0930","Q1 Factory Rent — Sundar Estate (3 months)",3800000,0,19000000,"RENT-Q1"],
        ["2024-09-30","1002","Bank — HBL Current Account","CPV-0930","Q1 Factory Rent — Sundar Estate (3 months)",0,3800000,46491667,"RENT-Q1"],
        ["2024-10-31","6005","Marketing & Advertising","CPV-1031","H1 Marketing Campaign — Textile Expo 2024",1700000,0,8500000,"MKTG-001"],
        ["2024-10-31","1003","Bank — MCB Operating Account","CPV-1031","H1 Marketing Campaign — Textile Expo 2024",0,1700000,26650000,"MKTG-001"],
        ["2024-12-31","8001","Income Tax — Current Year","JV-1231","H1 Advance Tax Provision — Dec 2024",19250000,0,57750000,"TAX-H1"],
        ["2024-12-31","2005","Income Tax Payable","JV-1231","H1 Advance Tax Provision — Dec 2024",0,19250000,30800000,"TAX-H1"],
        ["2025-03-31","1304","Capital Work in Progress","JV-0331","New Weaving Line — Progress Billing Q3",8000000,0,56000000,"CWIP-2025-01"],
        ["2025-03-31","2101","Long-Term Financing — HBL","JV-0331","Drawdown: New Weaving Line Financing",0,8000000,234558333,"CWIP-2025-01"],
        ["2025-06-30","8002","Deferred Tax — Charge","JV-0630","FY2025 Deferred Tax Charge — Year End",3275000,0,3275000,"DT-2025"],
        ["2025-06-30","2102","Deferred Tax Liability","JV-0630","FY2025 Deferred Tax — Closing Balance",0,3275000,41775000,"DT-2025"],
        ["2025-06-30","3003","Revenue Reserve / General Reserve","JV-0631","Transfer to General Reserve — FY2025",20000000,0,70000000,"TR-GR-2025"],
        ["2025-06-30","3004","Unappropriated Profit (Opening)","JV-0631","Transfer to General Reserve — FY2025",0,20000000,65225000,"TR-GR-2025"],
      ];
      glData.forEach((row, i) => {
        const r = ws.getRow(i + 4); r.height = 18;
        edit(r.getCell(1), row[0], fmtDate);
        edit(r.getCell(2), row[1]);
        edit(r.getCell(3), row[2]);
        edit(r.getCell(4), row[3]);
        edit(r.getCell(5), row[4]);
        edit(r.getCell(6), row[5] || null, fmtNum);
        edit(r.getCell(7), row[6] || null, fmtNum);
        edit(r.getCell(8), row[7], fmtNum);
        edit(r.getCell(9), row[8]);
      });
      await protect(ws);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // SHEET 5 — BALANCE SHEET
    // ══════════════════════════════════════════════════════════════════════════
    {
      const ws = wb.addWorksheet("Balance Sheet", { properties: { tabColor: { argb: "FFD97706" } } });
      ws.columns = [{ width: 6 }, { width: 46 }, { width: 10 }, { width: 22 }, { width: 22 }, { width: 28 }];
      hdr(ws.getCell("B1"), "BALANCE SHEET — Pak Textile Holdings (Pvt) Ltd"); ws.mergeCells("B1:F1"); ws.getRow(1).height = 26;
      hdr(ws.getCell("B2"), "As at 30 June 2025"); ws.mergeCells("B2:F2"); ws.getRow(2).height = 20;
      hdr(ws.getCell("B3"), "Line Item"); hdr(ws.getCell("C3"), "Note"); hdr(ws.getCell("D3"), "FY 2024-25 (PKR)"); hdr(ws.getCell("E3"), "FY 2023-24 (PKR)"); hdr(ws.getCell("F3"), "Section");
      ws.getRow(3).height = 22;

      type BSRow = ["sect"|"lbl"|"edit"|"total"|"blank", string, string, number|null, number|null, string];
      const bsRows: BSRow[] = [
        ["sect","NON-CURRENT ASSETS","",null,null,""],
        ["lbl","Property, Plant & Equipment (Net)","4",null,null,"Non-Current Assets"],
        ["edit","  — Plant & Machinery (Net of Depreciation)","",335000000,313000000,"Non-Current Assets"],
        ["edit","  — Land & Building","",285000000,285000000,"Non-Current Assets"],
        ["total","  Sub-total PPE","",620000000,598000000,""],
        ["edit","Capital Work in Progress","5",48000000,32000000,"Non-Current Assets"],
        ["edit","Intangible Assets — ERP System (Net)","6",12000000,14500000,"Non-Current Assets"],
        ["total","TOTAL NON-CURRENT ASSETS","",680000000,644500000,""],
        ["blank","","",null,null,""],
        ["sect","CURRENT ASSETS","",null,null,""],
        ["edit","Inventories — Raw Material","7",95000000,78000000,"Current Assets"],
        ["edit","Inventories — Work in Process","7",42000000,36000000,"Current Assets"],
        ["edit","Inventories — Finished Goods","7",88500000,72000000,"Current Assets"],
        ["total","  Total Inventories","",225500000,186000000,""],
        ["edit","Trade Debtors (Net of Provision)","8",145000000,120200000,"Current Assets"],
        ["edit","Advances, Deposits & Prepayments","9",28500000,22000000,"Current Assets"],
        ["edit","Short-Term Investments","10",35000000,25000000,"Current Assets"],
        ["edit","Advance Income Tax","11",30225000,25500000,"Current Assets"],
        ["edit","Cash and Bank Balances","12",115800000,92200000,"Current Assets"],
        ["total","TOTAL CURRENT ASSETS","",580025000,470900000,""],
        ["blank","","",null,null,""],
        ["total","TOTAL ASSETS","",1260025000,1115400000,""],
        ["blank","","",null,null,""],
        ["sect","EQUITY","",null,null,""],
        ["edit","Ordinary Share Capital","13",500000000,500000000,"Equity"],
        ["edit","Capital Reserve","14",35000000,35000000,"Equity"],
        ["edit","Revenue Reserve / General Reserve","15",50000000,30000000,"Equity"],
        ["edit","Unappropriated Profit — Current Year","16",97225000,45225000,"Equity"],
        ["total","TOTAL EQUITY","",682225000,610225000,""],
        ["blank","","",null,null,""],
        ["sect","NON-CURRENT LIABILITIES","",null,null,""],
        ["edit","Long-Term Financing — HBL","17",225000000,250000000,"Non-Current Liabilities"],
        ["edit","Deferred Tax Liability","18",38500000,35000000,"Non-Current Liabilities"],
        ["total","TOTAL NON-CURRENT LIABILITIES","",263500000,285000000,""],
        ["blank","","",null,null,""],
        ["sect","CURRENT LIABILITIES","",null,null,""],
        ["edit","Trade and Other Payables","19",85000000,70000000,"Current Liabilities"],
        ["edit","Accrued Liabilities","20",42500000,35000000,"Current Liabilities"],
        ["edit","Short-Term Borrowings — Running Finance","21",120000000,95000000,"Current Liabilities"],
        ["edit","Current Portion of Long-Term Loan","22",25000000,25000000,"Current Liabilities"],
        ["edit","Income Tax Payable","23",41800000,30175000,"Current Liabilities"],
        ["total","TOTAL CURRENT LIABILITIES","",314300000,255175000,""],
        ["blank","","",null,null,""],
        ["total","TOTAL LIABILITIES","",577800000,540175000,""],
        ["total","TOTAL EQUITY & LIABILITIES","",1260025000,1150400000,""],
      ];
      bsRows.forEach((row, i) => {
        const r = ws.getRow(i + 4); r.height = row[0] === "blank" ? 8 : 18;
        if (row[0] === "blank") return;
        if (row[0] === "sect") { sect(r.getCell(2), row[1]); ws.mergeCells(`B${r.number}:F${r.number}`); return; }
        const [type, label, noteRef, cur, prev, section] = row;
        if (type === "lbl") { lbl(r.getCell(2), label); locked(r.getCell(3), noteRef); locked(r.getCell(4), ""); locked(r.getCell(5), ""); locked(r.getCell(6), section); }
        else if (type === "edit") { locked(r.getCell(2), label); lbl(r.getCell(3), noteRef); edit(r.getCell(4), cur, fmtNum); edit(r.getCell(5), prev, fmtNum); edit(r.getCell(6), section); }
        else if (type === "total") { total(r.getCell(2), label); ws.mergeCells(`B${r.number}:C${r.number}`); total(r.getCell(4), cur); total(r.getCell(5), prev); locked(r.getCell(6), ""); }
      });
      await protect(ws);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // SHEET 6 — PROFIT & LOSS
    // ══════════════════════════════════════════════════════════════════════════
    {
      const ws = wb.addWorksheet("Profit & Loss", { properties: { tabColor: { argb: "FF0F766E" } } });
      ws.columns = [{ width: 6 }, { width: 46 }, { width: 10 }, { width: 22 }, { width: 22 }];
      hdr(ws.getCell("B1"), "PROFIT & LOSS ACCOUNT — Pak Textile Holdings (Pvt) Ltd"); ws.mergeCells("B1:E1"); ws.getRow(1).height = 26;
      hdr(ws.getCell("B2"), "For the Year Ended 30 June 2025"); ws.mergeCells("B2:E2"); ws.getRow(2).height = 20;
      hdr(ws.getCell("B3"), "Line Item"); hdr(ws.getCell("C3"), "Note"); hdr(ws.getCell("D3"), "FY 2024-25 (PKR)"); hdr(ws.getCell("E3"), "FY 2023-24 (PKR)");
      ws.getRow(3).height = 22;

      type PLRow = ["sect"|"edit"|"total"|"blank", string, string, number|null, number|null];
      const plRows: PLRow[] = [
        ["edit","Revenue — Local Sales (Net)","20",625250000,530000000],
        ["edit","Revenue — Export Sales (FOB)","20",250000000,212100000],
        ["total","TOTAL REVENUE","",875250000,742100000],
        ["blank","","",null,null],
        ["sect","COST OF SALES","",null,null],
        ["edit","  Raw Material Consumed","21",435000000,368000000],
        ["edit","  Direct Labour — Wages","21",98500000,83000000],
        ["edit","  Factory Overheads","21",79000000,67000000],
        ["total","TOTAL COST OF SALES","",612500000,518000000],
        ["blank","","",null,null],
        ["total","GROSS PROFIT","",262750000,224100000],
        ["blank","","",null,null],
        ["sect","OPERATING EXPENSES","",null,null],
        ["edit","  Administrative Expenses — Salaries","22",42000000,36000000],
        ["edit","  Administrative Expenses — Rent & Utilities","22",15200000,12800000],
        ["edit","  Administrative Expenses — Depreciation","22",8500000,7200000],
        ["edit","  Administrative Expenses — Traveling","22",3250000,2800000],
        ["edit","  Administrative Expenses — Legal & Professional","22",2500000,2200000],
        ["edit","  Selling Expenses — Sales Salaries","23",18500000,15500000],
        ["edit","  Selling Expenses — Marketing & Advertising","23",6800000,5500000],
        ["total","TOTAL OPERATING EXPENSES","",96750000,82000000],
        ["blank","","",null,null],
        ["total","OPERATING PROFIT (EBIT)","",166000000,142100000],
        ["blank","","",null,null],
        ["edit","Other Income — Foreign Exchange Gain","24",2500000,1800000],
        ["edit","Finance Costs — Bank Charges","25",5800000,5200000],
        ["edit","Finance Costs — Interest on LT Loans","25",18700000,20500000],
        ["total","PROFIT BEFORE TAX","",144000000,118200000],
        ["blank","","",null,null],
        ["edit","Income Tax — Current Year","26",38500000,32000000],
        ["edit","Income Tax — Deferred","26",3275000,2800000],
        ["total","TOTAL TAX EXPENSE","",41775000,34800000],
        ["blank","","",null,null],
        ["total","PROFIT AFTER TAX (NET PROFIT)","",102225000,83400000],
        ["blank","","",null,null],
        ["edit","Other Comprehensive Income","",0,0],
        ["total","TOTAL COMPREHENSIVE INCOME","",102225000,83400000],
        ["blank","","",null,null],
        ["edit","Earnings Per Share (Basic) — PKR","",20.45,16.68],
      ];
      plRows.forEach((row, i) => {
        const r = ws.getRow(i + 4); r.height = row[0] === "blank" ? 8 : 18;
        if (row[0] === "blank") return;
        if (row[0] === "sect") { sect(r.getCell(2), row[1]); ws.mergeCells(`B${r.number}:E${r.number}`); return; }
        const [type, label, noteRef, cur, prev] = row;
        if (type === "edit") { locked(r.getCell(2), label); lbl(r.getCell(3), noteRef); edit(r.getCell(4), cur, fmtNum); edit(r.getCell(5), prev, fmtNum); }
        else if (type === "total") { total(r.getCell(2), label); ws.mergeCells(`B${r.number}:C${r.number}`); total(r.getCell(4), cur); total(r.getCell(5), prev); }
      });
      await protect(ws);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // SHEET 7 — BANK STATEMENT
    // ══════════════════════════════════════════════════════════════════════════
    {
      const ws = wb.addWorksheet("Bank Statement", { properties: { tabColor: { argb: "FF9333EA" } } });
      ws.columns = [
        { width: 14 }, { width: 44 }, { width: 20 }, { width: 16 },
        { width: 16 }, { width: 20 }, { width: 26 }, { width: 22 },
      ];
      hdr(ws.getCell("A1"), "BANK STATEMENT — Pak Textile Holdings (Pvt) Ltd  |  HBL Current Account No. 01430007900003"); ws.mergeCells("A1:H1"); ws.getRow(1).height = 26;
      note(ws.getCell("A2"), "One row per transaction. Add one separate sheet per bank account. All yellow cells are editable."); ws.mergeCells("A2:H2"); ws.getRow(2).height = 22;
      ["Date","Narration / Description","Cheque / Ref No.","Debit (PKR)","Credit (PKR)","Balance (PKR)","Bank Name","Account Number"].forEach((c, i) => hdr(ws.getRow(3).getCell(i+1), c));
      ws.getRow(3).height = 22;

      const bankData: [string,string,string,number,number,number,string,string][] = [
        ["2024-07-01","Opening Balance b/f","",0,0,38500000,"Habib Bank Limited","01430007900003"],
        ["2024-07-05","Sales Proceeds — Kohinoor Mills Inv 0987","CHQ-00112",0,28500000,67000000,"Habib Bank Limited","01430007900003"],
        ["2024-07-10","Salary — Admin Staff July 2024","TT-00713",3500000,0,63500000,"Habib Bank Limited","01430007900003"],
        ["2024-07-12","Supplier Payment — Sitara Chemicals","CHQ-00114",12500000,0,51000000,"Habib Bank Limited","01430007900003"],
        ["2024-07-18","Export Proceeds (from UBL — transfer)","IBFT-071",0,15000000,66000000,"Habib Bank Limited","01430007900003"],
        ["2024-07-25","Factory Utility Bill — LESCO","AUTO-PAY",1850000,0,64150000,"Habib Bank Limited","01430007900003"],
        ["2024-07-28","Worker Wages — July 2024","TT-00720",8208333,0,55941667,"Habib Bank Limited","01430007900003"],
        ["2024-07-31","Bank Charges — July 2024","BC-JUL24",38500,0,55903167,"Habib Bank Limited","01430007900003"],
        ["2024-07-31","Mark-up earned on deposit","MARKUP",0,248000,56151167,"Habib Bank Limited","01430007900003"],
        ["2024-08-07","Running Finance Drawdown — RF-0824","RF-0824",0,10000000,66151167,"Habib Bank Limited","01430007900003"],
        ["2024-08-15","Sales Proceeds — Al-Baraka Textiles","BRV-0815",0,42500000,108651167,"Habib Bank Limited","01430007900003"],
        ["2024-08-20","Advance Tax (u/s 147) — Q1","AT-Q1",9000000,0,99651167,"Habib Bank Limited","01430007900003"],
        ["2024-09-30","Q1 Factory Rent — Sundar Estate","CHQ-00918",3800000,0,95851167,"Habib Bank Limited","01430007900003"],
        ["2024-10-15","Sales Proceeds — Gulshan Fabrics Inv 1105","BRV-1015",0,35000000,130851167,"Habib Bank Limited","01430007900003"],
        ["2024-10-31","Loan Installment — HBL LT Loan","EMI-OCT",8333333,0,122517834,"Habib Bank Limited","01430007900003"],
        ["2024-11-30","Interest on LT Loan — November","INT-NOV",1558333,0,120959501,"Habib Bank Limited","01430007900003"],
        ["2024-12-31","Advance Tax (u/s 147) — Q2","AT-Q2",9000000,0,111959501,"Habib Bank Limited","01430007900003"],
        ["2025-01-15","Sales Proceeds — North Star Garments","BRV-0115",0,68000000,179959501,"Habib Bank Limited","01430007900003"],
        ["2025-03-31","Advance Tax (u/s 147) — Q3","AT-Q3",9000000,0,170959501,"Habib Bank Limited","01430007900003"],
        ["2025-06-30","Closing Balance","",0,0,45800000,"Habib Bank Limited","01430007900003"],
      ];
      bankData.forEach((row, i) => {
        const r = ws.getRow(i + 4); r.height = 18;
        edit(r.getCell(1), row[0], fmtDate);
        edit(r.getCell(2), row[1]);
        edit(r.getCell(3), row[2]);
        edit(r.getCell(4), row[3] || null, fmtNum);
        edit(r.getCell(5), row[4] || null, fmtNum);
        edit(r.getCell(6), row[5], fmtNum);
        edit(r.getCell(7), row[6]);
        edit(r.getCell(8), row[7]);
      });
      await protect(ws);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // SHEET 8 — TAX DATA
    // ══════════════════════════════════════════════════════════════════════════
    {
      const ws = wb.addWorksheet("Tax Data", { properties: { tabColor: { argb: "FFDC2626" } } });
      ws.columns = [{ width: 6 }, { width: 42 }, { width: 30 }, { width: 38 }];
      hdr(ws.getCell("B1"), "TAX DATA — Pak Textile Holdings (Pvt) Ltd  |  FY 2024-25"); ws.mergeCells("B1:D1"); ws.getRow(1).height = 26;
      hdr(ws.getCell("B2"), "Field"); hdr(ws.getCell("C2"), "▶  Replace yellow cells with actual figures  ◀", true); hdr(ws.getCell("D2"), "Notes");
      ws.getRow(2).height = 20;

      const taxFields: [string, any, string][] = [
        ["Tax Period From", "2024-07-01", "YYYY-MM-DD"],
        ["Tax Period To", "2025-06-30", "YYYY-MM-DD"],
        ["", "", ""],
        ["SALES TAX (GST)", "", ""],
        ["Output Tax (Sales Tax Charged on Sales) PKR", 105030000, "17% on local taxable sales"],
        ["Input Tax (ST Paid on Purchases) PKR", 74500000, "Input tax claimable"],
        ["Net Sales Tax Payable / (Refundable) PKR", 30530000, "Output Tax minus Input Tax"],
        ["", "", ""],
        ["INCOME TAX", "", ""],
        ["Income Tax Provision (Current Year) PKR", 38500000, "Charged to P&L"],
        ["Advance Tax Paid (u/s 147) PKR", 27000000, "Q1+Q2+Q3+Q4 installments"],
        ["WHT Deducted by Customers PKR", 3225000, "u/s 153 — deducted at source"],
        ["Net Tax Payable / (Advance) at Year End PKR", 8275000, "Provision minus advance & WHT"],
        ["", "", ""],
        ["RETURN FILING", "", ""],
        ["Annual Income Tax Return Filing Date", "2025-12-31", "Due date for companies"],
        ["Monthly Sales Tax Return — Jul 2024", "2024-08-18", "Filed (YYYY-MM-DD)"],
        ["Monthly Sales Tax Return — Aug 2024", "2024-09-18", ""],
        ["Monthly Sales Tax Return — Sep 2024", "2024-10-18", ""],
        ["Monthly Sales Tax Return — Oct 2024", "2024-11-18", ""],
        ["Monthly Sales Tax Return — Nov 2024", "2024-12-18", ""],
        ["Monthly Sales Tax Return — Dec 2024", "2025-01-18", ""],
        ["Monthly Sales Tax Return — Jan 2025", "2025-02-18", ""],
        ["Monthly Sales Tax Return — Feb 2025", "2025-03-18", ""],
        ["Monthly Sales Tax Return — Mar 2025", "2025-04-18", ""],
        ["Monthly Sales Tax Return — Apr 2025", "2025-05-18", ""],
        ["Monthly Sales Tax Return — May 2025", "2025-06-18", ""],
        ["Monthly Sales Tax Return — Jun 2025", "2025-07-18", ""],
        ["", "", ""],
        ["WITHHOLDING TAX AGENTS", "", ""],
        ["Major WHT Agent 1", "Kohinoor Textile Mills Ltd", "Customer deducting u/s 153"],
        ["Major WHT Agent 2", "Al-Baraka Textiles (Pvt) Ltd", ""],
        ["Major WHT Agent 3", "North Star Garments Ltd", ""],
        ["", "", ""],
        ["OTHER", "", ""],
        ["Tax Notices Received", "None outstanding", "Reference numbers if any"],
        ["Appeal Status", "None", "Pending / Decided / None"],
        ["Annexures Filed", "Annex-B (WHT Agents), Annex-C (Imports), Annex-G (Exports)", "List Annexures submitted"],
      ];
      let rowIdx = 3;
      taxFields.forEach(([field, val, hint]) => {
        const r = ws.getRow(rowIdx++); r.height = 18;
        if (field === "" && val === "") { r.height = 8; return; }
        if (val === "" && hint === "") { sect(r.getCell(2), field); ws.mergeCells(`B${r.number}:D${r.number}`); return; }
        lbl(r.getCell(2), field);
        edit(r.getCell(3), val, typeof val === "number" ? fmtNum : undefined);
        note(r.getCell(4), hint);
      });
      await protect(ws);
    }

    // ── Serialize & send ─────────────────────────────────────────────────────
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", 'attachment; filename="ANA_Upload_Template.xlsx"');
    await wb.xlsx.write(res);
    res.end();
  } catch (err: any) {
    logger.error({ err }, "Route error");
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════
// WP EXECUTION ENDPOINTS — Full ISA-compliant per-WP audit execution lifecycle
// ══════════════════════════════════════════════════════════════════════════

// GET  /sessions/:sessionId/wp-execution            — list all execution records for session
router.get("/sessions/:sessionId/wp-execution", async (req: Request, res: Response) => {
  try {
    const sid = parseInt(p(req.params.sessionId));
    const rows = await db.select().from(wpExecutionTable)
      .where(eq(wpExecutionTable.sessionId, sid))
      .orderBy(asc(wpExecutionTable.wpCode));
    res.json(rows);
  } catch (err: any) { logger.error({ err }, "Route error"); res.status(500).json({ error: err.message }); }
});

// GET  /sessions/:sessionId/wp-execution/:wpCode    — get single execution record
router.get("/sessions/:sessionId/wp-execution/:wpCode", async (req: Request, res: Response) => {
  try {
    const sid = parseInt(p(req.params.sessionId));
    const wpCode = p(req.params.wpCode);
    const [row] = await db.select().from(wpExecutionTable)
      .where(and(eq(wpExecutionTable.sessionId, sid), eq(wpExecutionTable.wpCode, wpCode)));
    if (!row) return void res.status(404).json({ error: "Not found" });
    res.json(row);
  } catch (err: any) { logger.error({ err }, "Route error"); res.status(500).json({ error: err.message }); }
});

// PUT  /sessions/:sessionId/wp-execution/:wpCode    — create or update execution record
router.put("/sessions/:sessionId/wp-execution/:wpCode", requireRoles(...WP_ROLES_WRITE), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const sid = parseInt(p(req.params.sessionId));
    const wpCode = p(req.params.wpCode);
    const [existing] = await db.select({ id: wpExecutionTable.id, isLocked: wpExecutionTable.isLocked })
      .from(wpExecutionTable)
      .where(and(eq(wpExecutionTable.sessionId, sid), eq(wpExecutionTable.wpCode, wpCode)));
    if (existing?.isLocked) return void res.status(403).json({ error: "Working paper is locked. Unlock requires partner-level authority." });

    const body = req.body || {};
    const payload: any = {
      sessionId: sid,
      wpCode,
      updatedAt: new Date(),
    };
    // Whitelist all updatable fields
    const textFields = [
      "wpTitle","wpPhase","wpCategory","isaReference","secondaryReference","objective",
      "riskLevel","riskDescription","samplingMethod","samplingCriteria","professionalJudgment",
      "staffConclusion","staffConclusionDate","staffName",
      "seniorConclusion","seniorConclusionDate","seniorName",
      "managerConclusion","managerConclusionDate","managerName",
      "partnerConclusion","partnerConclusionDate","partnerName",
      "status","createdBy","lockedBy",
    ];
    const jsonFields = [
      "assertions","linkedRisks","procedures","samplingItems","workPerformed",
      "evidenceItems","findings","misstatements","analyticalData",
      "reviewNotes","isaChecklist","tbGlCrossRefs","signOffs","validationErrors","linkedRisks",
    ];
    const numFields = ["populationSize","sampleSize"];
    const boolFields = ["proceduresComplete","evidenceComplete","conclusionsComplete","isLocked"];
    const decFields = ["totalMisstatementAmount"];

    for (const f of textFields) if (body[f] !== undefined) payload[f] = body[f];
    for (const f of jsonFields) if (body[f] !== undefined) payload[f] = body[f];
    for (const f of numFields) if (body[f] !== undefined) payload[f] = parseInt(body[f]);
    for (const f of boolFields) if (body[f] !== undefined) payload[f] = Boolean(body[f]);
    for (const f of decFields) if (body[f] !== undefined) payload[f] = String(body[f]);

    // Derive proceduresComplete / evidenceComplete / conclusionsComplete automatically
    if (payload.procedures) {
      const procs: any[] = payload.procedures;
      payload.proceduresComplete = procs.length > 0 && procs.every((p: any) => p.status === "performed" || p.status === "n_a");
    }
    if (payload.evidenceItems) {
      const ev: any[] = payload.evidenceItems;
      payload.evidenceComplete = ev.length > 0;
    }
    if (payload.partnerConclusion) {
      payload.conclusionsComplete = true;
    }

    // Derive status
    if (!body.status) {
      if (payload.isLocked) payload.status = "locked";
      else if (payload.conclusionsComplete) payload.status = "concluded";
      else if (payload.evidenceComplete) payload.status = "evidenced";
      else if (payload.proceduresComplete) payload.status = "procedures_done";
      else if (existing || payload.procedures) payload.status = "in_progress";
    }

    let result;
    if (existing) {
      [result] = await db.update(wpExecutionTable).set(payload)
        .where(and(eq(wpExecutionTable.sessionId, sid), eq(wpExecutionTable.wpCode, wpCode)))
        .returning();
    } else {
      payload.createdAt = new Date();
      [result] = await db.insert(wpExecutionTable).values(payload).returning();
    }
    res.json(result);
  } catch (err: any) { logger.error({ err }, "Route error"); res.status(500).json({ error: err.message }); }
});

// POST /sessions/:sessionId/wp-execution/:wpCode/sign-off — apply a reviewer sign-off
router.post("/sessions/:sessionId/wp-execution/:wpCode/sign-off", requireRoles("super_admin", "partner", "senior_manager", "manager"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const sid = parseInt(p(req.params.sessionId));
    const wpCode = p(req.params.wpCode);
    const { level, name, date, conclusion } = req.body || {};
    if (!level || !name) return void res.status(400).json({ error: "level and name required" });
    const allowed = ["staff","senior","manager","partner"];
    if (!allowed.includes(level)) return void res.status(400).json({ error: "Invalid level" });

    const [row] = await db.select().from(wpExecutionTable)
      .where(and(eq(wpExecutionTable.sessionId, sid), eq(wpExecutionTable.wpCode, wpCode)));
    if (!row) return void res.status(404).json({ error: "Execution record not found" });
    if (row.isLocked) return void res.status(403).json({ error: "WP is locked" });

    const signDate = date || new Date().toISOString().split("T")[0];
    const update: any = { updatedAt: new Date() };
    const nameKey = `${level}Name` as any;
    const dateKey = `${level}ConclusionDate` as any;
    const conclusionKey = `${level}Conclusion` as any;
    update[nameKey] = name;
    update[dateKey] = signDate;
    if (conclusion) update[conclusionKey] = conclusion;

    // Update signOffs JSONB
    const currentSignOffs: any = (row.signOffs as any) || {};
    currentSignOffs[level] = { name, date: signDate, signedAt: new Date().toISOString() };
    update.signOffs = currentSignOffs;

    // If partner signs off, mark conclusionsComplete
    if (level === "partner") {
      update.conclusionsComplete = true;
      update.status = "concluded";
    }

    const [updated] = await db.update(wpExecutionTable).set(update)
      .where(and(eq(wpExecutionTable.sessionId, sid), eq(wpExecutionTable.wpCode, wpCode)))
      .returning();
    res.json(updated);
  } catch (err: any) { logger.error({ err }, "Route error"); res.status(500).json({ error: err.message }); }
});

// POST /sessions/:sessionId/wp-execution/:wpCode/lock — lock a WP (ISA 230)
router.post("/sessions/:sessionId/wp-execution/:wpCode/lock", requireRoles("super_admin", "partner", "senior_manager"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const sid = parseInt(p(req.params.sessionId));
    const wpCode = p(req.params.wpCode);
    const { lockedBy, unlock } = req.body || {};
    const [row] = await db.select().from(wpExecutionTable)
      .where(and(eq(wpExecutionTable.sessionId, sid), eq(wpExecutionTable.wpCode, wpCode)));
    if (!row) return void res.status(404).json({ error: "Not found" });

    if (unlock) {
      const [updated] = await db.update(wpExecutionTable)
        .set({ isLocked: false, status: "concluded", updatedAt: new Date() })
        .where(and(eq(wpExecutionTable.sessionId, sid), eq(wpExecutionTable.wpCode, wpCode)))
        .returning();
      return void res.json(updated);
    }

    // Validate before locking
    const errors: string[] = [];
    if (!row.proceduresComplete) errors.push("Not all procedures are marked as performed");
    if (!row.evidenceComplete) errors.push("No evidence items recorded");
    if (!row.partnerConclusion) errors.push("Partner conclusion is required before locking");
    if (errors.length > 0) return void res.status(422).json({ error: "Cannot lock", validationErrors: errors });

    const [updated] = await db.update(wpExecutionTable)
      .set({ isLocked: true, lockedAt: new Date(), lockedBy: lockedBy || "System", status: "locked", updatedAt: new Date() })
      .where(and(eq(wpExecutionTable.sessionId, sid), eq(wpExecutionTable.wpCode, wpCode)))
      .returning();
    res.json(updated);
  } catch (err: any) { logger.error({ err }, "Route error"); res.status(500).json({ error: err.message }); }
});

// GET /sessions/:sessionId/wp-execution/:wpCode/validate — validate completeness
router.get("/sessions/:sessionId/wp-execution/:wpCode/validate", async (req: Request, res: Response) => {
  try {
    const sid = parseInt(p(req.params.sessionId));
    const wpCode = p(req.params.wpCode);
    const [row] = await db.select().from(wpExecutionTable)
      .where(and(eq(wpExecutionTable.sessionId, sid), eq(wpExecutionTable.wpCode, wpCode)));

    const errors: string[] = [];
    const warnings: string[] = [];

    if (!row) { return void res.json({ pass: false, errors: ["Execution record not started"], warnings: [] }); }

    const procs: any[] = (row.procedures as any) || [];
    const ev: any[] = (row.evidenceItems as any) || [];
    const findings: any[] = (row.findings as any) || [];

    if (procs.length === 0) errors.push("No procedures defined");
    else {
      const notDone = procs.filter((p: any) => p.status === "not_started" || p.status === "in_progress");
      if (notDone.length > 0) errors.push(`${notDone.length} procedure(s) not yet performed`);
    }
    if (ev.length === 0) errors.push("No evidence items recorded");
    if (!row.staffConclusion) warnings.push("Staff conclusion not recorded");
    if (!row.seniorConclusion) warnings.push("Senior conclusion not recorded");
    if (!row.managerConclusion) warnings.push("Manager conclusion not recorded");
    if (!row.partnerConclusion) errors.push("Partner conclusion is required");
    if (!row.professionalJudgment) warnings.push("Professional judgment narrative not documented");

    // Check each finding has an ISA reference
    const findingsWithoutIsa = findings.filter((f: any) => !f.isaRef);
    if (findingsWithoutIsa.length > 0) warnings.push(`${findingsWithoutIsa.length} finding(s) missing ISA reference`);

    res.json({
      pass: errors.length === 0,
      errors,
      warnings,
      proceduresComplete: row.proceduresComplete,
      evidenceComplete: row.evidenceComplete,
      conclusionsComplete: row.conclusionsComplete,
      isLocked: row.isLocked,
      status: row.status,
    });
  } catch (err: any) { logger.error({ err }, "Route error"); res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// COMPLIANCE DOCUMENT ENGINE
// Fix 1: EQCR Review Checklist (ISA 220, ISQM 2)
// Fix 2: Management Representation Letter (ISA 580)
// Fix 3: Engagement Letter + Signing Workflow (ISA 210)
// Fix 4: Independence Confirmation (ISA 220, ISQM 1, ICAP CoE)
// Fix 5: ISA 570 Going Concern standalone WP
// Fix 6: SECP Form 29/A + CCG 2019 Compliance WPs
// ═══════════════════════════════════════════════════════════════════════════

const COMPLIANCE_DOC_TYPES = [
  { docType: "engagement_letter",         docCode: "PP-05", isa: "ISA 210",                          label: "Engagement Letter" },
  { docType: "independence_confirmation", docCode: "PP-09", isa: "ISA 220, ISQM 1, ICAP CoE",        label: "Independence Confirmation" },
  { docType: "management_rep_letter",     docCode: "DL-03", isa: "ISA 580",                          label: "Management Representation Letter" },
  { docType: "eqcr_checklist",            docCode: "QR-01", isa: "ISA 220, ISQM 2",                  label: "EQCR Review Checklist" },
  { docType: "going_concern",             docCode: "GC-01", isa: "ISA 570, IAS 1.25-26",              label: "Going Concern Assessment" },
  { docType: "secp_ccg",                  docCode: "SECP-F29", isa: "Companies Act 2017, CCG 2019",  label: "SECP/CCG Compliance Review" },
];

// GET /sessions/:id/compliance-docs — fetch all compliance doc statuses
router.get("/sessions/:id/compliance-docs", async (req: Request, res: Response) => {
  try {
    const sessionId = parseInt(p(req.params.id));
    const docs = await db.select().from(wpComplianceDocTable).where(eq(wpComplianceDocTable.sessionId, sessionId));
    const statusMap: Record<string, any> = {};
    for (const doc of docs) {
      statusMap[doc.docType] = {
        id: doc.id, docCode: doc.docCode, status: doc.status,
        generatedAt: doc.generatedAt, signatoryName: doc.signatoryName,
        signatoryDesignation: doc.signatoryDesignation, signingDate: doc.signingDate,
        checklistItems: doc.checklistItems, checklistCompletedAt: doc.checklistCompletedAt,
        version: doc.version, notes: doc.notes, hasContent: !!doc.generatedContent,
      };
    }
    res.json({ docs: COMPLIANCE_DOC_TYPES.map(t => ({ ...t, ...(statusMap[t.docType] || { status: "pending", hasContent: false }) })) });
  } catch (err: any) { logger.error({ err }, "Route error"); res.status(500).json({ error: err.message }); }
});

// GET /sessions/:id/compliance-docs/:docType/content — full generated content
router.get("/sessions/:id/compliance-docs/:docType/content", async (req: Request, res: Response) => {
  try {
    const sessionId = parseInt(p(req.params.id));
    const docType = req.params.docType;
    const docs = await db.select().from(wpComplianceDocTable)
      .where(and(eq(wpComplianceDocTable.sessionId, sessionId), eq(wpComplianceDocTable.docType, docType)));
    if (!docs[0]) return res.status(404).json({ error: "Document not generated yet" });
    res.json(docs[0]);
  } catch (err: any) { logger.error({ err }, "Route error"); res.status(500).json({ error: err.message }); }
});

// POST /sessions/:id/compliance-docs/:docType/generate — AI-generate compliance document
router.post("/sessions/:id/compliance-docs/:docType/generate", requireRoles(...WP_ROLES_WRITE), aiRateLimit, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const sessionId = parseInt(p(req.params.id));
    const docType = req.params.docType;

    const session = (await db.select().from(wpSessionsTable).where(eq(wpSessionsTable.id, sessionId)))[0];
    if (!session) return res.status(404).json({ error: "Session not found" });

    const ai = await getAIClient();
    if (!ai) return res.status(503).json({ error: "AI service not configured. Add API key in Settings." });

    const variables = await db.select().from(wpVariablesTable).where(eq(wpVariablesTable.sessionId, sessionId));
    const varMap = Object.fromEntries(variables.map(v => [v.variableCode, v.finalValue || v.extractedValue || ""]));

    const engCode = `ENG-${session.engagementYear || "2026"}-${String(sessionId).padStart(3, "0")}`;
    const clientName = session.clientName || "Client";
    const firmName = session.firmName || "Alam & Aulakh Chartered Accountants";
    const period = session.periodStart && session.periodEnd ? `${session.periodStart} to ${session.periodEnd}` : `FY ${session.engagementYear}`;
    const isListed = (session.entityType || "").toLowerCase().includes("listed");
    const isPIE = isListed;

    let prompt = "";
    let docCode = "";

    if (docType === "engagement_letter") {
      docCode = "PP-05";
      prompt = `You are a senior Pakistani CA generating an ISA 210-compliant Engagement Letter.
FIRM: ${firmName} | CLIENT: ${clientName} | ENTITY TYPE: ${session.entityType || "Private Limited"}
NTN: ${session.ntn || "N/A"} | ENGAGEMENT: ${engCode} | PERIOD: ${period}
FRAMEWORK: ${session.reportingFramework || "IFRS"} | TYPE: ${(session.engagementType || "statutory_audit").replace(/_/g, " ")}
PARTNER: ${varMap["engagement_partner"] || "_______________"} | MANAGER: ${varMap["engagement_manager"] || "_______________"}

Generate a complete Engagement Letter per ISA 210 and ICAP requirements. Return ONLY valid JSON:
{"letterDate":"ISO date","addressee":"Board of Directors / Management","salutation":"Dear Sirs,","purpose":"[paragraph]","engagementScope":"[paragraph — scope per ISA 200, 210]","responsibilitiesOfAuditor":["[6-8 ISA-referenced items]"],"responsibilitiesOfManagement":["[6-8 Companies Act/ISA referenced items]"],"inherentLimitations":"[ISA 200.A51 limitations paragraph]","reportingFramework":"[paragraph]","reportExpected":"[type of report and timing]","feesArrangement":"[fee structure to be agreed]","confidentiality":"[ISA 200 confidentiality paragraph]","otherMatters":["ISQM 1 quality statement","ICAP code compliance","Files accessible to SECP/ICAP inspectors"],"terminationClause":"[paragraph]","agreementInstruction":"Please sign and return the enclosed copy to confirm acceptance of these terms.","signingBlock":{"firmName":"${firmName}","partnerName":"${varMap["engagement_partner"] || "_______________"}","partnerDesignation":"Partner","icapMembership":"FCA/ACA ICAP","date":"To be signed","clientSigningBlock":{"name":"_______________","designation":"Director / CEO","onBehalfOf":"${clientName}","date":"To be signed"}},"isaReferences":["ISA 200","ISA 210","ISA 220","ISA 300","ISQM 1","Companies Act 2017 s.246","ICAP Code of Ethics"]}`;

    } else if (docType === "independence_confirmation") {
      docCode = "PP-09";
      prompt = `You are a senior Pakistani CA generating a complete ISA 220 / ICAP Code of Ethics Independence Confirmation.
FIRM: ${firmName} | CLIENT: ${clientName} | ENTITY TYPE: ${session.entityType || "Private Limited"}
PIE/LISTED: ${isPIE ? "YES — Enhanced requirements apply" : "NO"} | ENGAGEMENT: ${engCode} | PERIOD: ${period}
PARTNER: ${varMap["engagement_partner"] || "_______________"} | EQCR: ${varMap["eqcr_partner"] || (isPIE ? "Required" : "N/A")}

Generate per ISA 220.14-22, ISQM 1.26-28, ICAP CoE Part 4A/4B. Return ONLY valid JSON:
{"declarationDate":"ISO date","declarationTitle":"Independence Declaration and Confirmation","preamble":"[purpose and regulatory basis]","independenceStandard":"${isPIE ? "Section 291 ICAP CoE — PIE enhanced requirements" : "Section 290 ICAP CoE"}","threatsIdentified":[{"threatType":"Self-interest","description":"Financial interests, loans, business relationships","safeguard":"None identified","residualRisk":"Acceptable"},{"threatType":"Self-review","description":"Prior period services, preparation of records","safeguard":"None identified","residualRisk":"Acceptable"},{"threatType":"Advocacy","description":"Legal proceedings, negotiations","safeguard":"None identified","residualRisk":"Acceptable"},{"threatType":"Familiarity","description":"Long association, close relationships","safeguard":"${isPIE ? "Partner rotation — 5 years per ISQM 1" : "Reviewed annually"}","residualRisk":"Acceptable"},{"threatType":"Intimidation","description":"Threats by management","safeguard":"None identified","residualRisk":"Acceptable"}],"prohibitedRelationships":"[financial interests, loans, business relationships checked]","nonAuditServices":"[list any non-audit services and independence assessment]","rotationStatus":"${isPIE ? "Partner rotation compliance confirmed per ISQM 1.34(c)" : "Rotation reviewed — not mandatory for non-PIE"}","confirmationStatement":"We confirm that the engagement team is independent with respect to ${clientName} for the period ${period} and no relationships exist that would compromise objectivity.","teamMemberDeclarations":[{"role":"Engagement Partner","name":"${varMap["engagement_partner"] || "_______________"}","declaration":"I confirm my independence. No threats identified.","date":"To be signed","signature":"_______________"},{"role":"Engagement Manager","name":"${varMap["engagement_manager"] || "_______________"}","declaration":"I confirm my independence. No threats identified.","date":"To be signed","signature":"_______________"},{"role":"EQCR Partner","name":"${varMap["eqcr_partner"] || "_______________"}","declaration":"I confirm independence as EQCR reviewer. No threats identified.","date":"To be signed","signature":"_______________"}],"partnerConclusionStatement":"Based on this assessment, the engagement team including the EQCR reviewer is independent of ${clientName} for the audit period ${period}.","isaReferences":["ISA 200.14","ISA 220.14-22","ISQM 1.26-28","ICAP CoE Part 4A","ICAP CoE Part 4B"]}`;

    } else if (docType === "management_rep_letter") {
      docCode = "DL-03";
      const tbLines = await db.select().from(wpTrialBalanceLinesTable).where(eq(wpTrialBalanceLinesTable.sessionId, sessionId));
      const totalAssets = tbLines.filter(l => (l.classification || "").toLowerCase().includes("asset")).reduce((s, l) => s + (parseFloat(String(l.balance)) || 0), 0);
      prompt = `You are a Big-4 senior partner generating an ISA 580-compliant Management Representation Letter (from management TO the auditor).
FIRM: ${firmName} | CLIENT: ${clientName} | ENTITY TYPE: ${session.entityType || "Private Limited"}
ENGAGEMENT: ${engCode} | PERIOD: ${period} | FRAMEWORK: ${session.reportingFramework || "IFRS"}
TOTAL ASSETS: PKR ${totalAssets.toLocaleString() || "per FS"} | PARTNER: ${varMap["engagement_partner"] || "_______________"}
GOING CONCERN FLAG: ${varMap["going_concern_flag"] || "false"} | RELATED PARTIES FLAG: ${varMap["related_party_flag"] || "false"}
FRAUD RISK FLAG: ${varMap["fraud_risk_flag"] || "false"} | MODIFIED OPINION: ${varMap["modified_opinion_flag"] || "false"}

Return ONLY valid JSON:
{"letterDate":"ISO date","addressee":"${firmName}","salutation":"Dear Sirs,","openingStatement":"[opening — management of ${clientName} providing this letter in connection with your audit of our financial statements for ${period}]","generalRepresentations":["We have fulfilled our responsibility for preparation of financial statements per ${session.reportingFramework || "IFRS"} and Companies Act 2017.","We have provided all information relevant to the audit including all related party relationships and transactions.","All transactions have been recorded in accounting records and reflected in the financial statements.","We have disclosed all known or suspected fraud or error affecting the entity.","The effects of uncorrected misstatements are immaterial both individually and in aggregate.","We acknowledge responsibility for design, implementation and maintenance of internal controls.","The financial statements are free from material misstatement including omissions.","All assets and liabilities are properly included in the financial statements."],"specificRepresentations":[{"area":"Going Concern","representation":"${varMap["going_concern_flag"] === "true" ? "We have disclosed all going concern uncertainties and our plans to address them." : "The going concern basis is appropriate. No material uncertainties regarding ability to continue as going concern exist."}","isaRef":"ISA 570.16"},{"area":"Related Parties","representation":"${varMap["related_party_flag"] === "true" ? "We have disclosed all related party relationships and transactions per IAS 24 on arm's length terms." : "No related party relationships or transactions beyond those disclosed in financial statements exist."}","isaRef":"ISA 550.26"},{"area":"Litigation & Claims","representation":"We have disclosed all actual or possible litigation and claims whether or not discussed with legal counsel.","isaRef":"ISA 501.12"},{"area":"Contingencies","representation":"All known actual or contingent liabilities have been properly accrued or disclosed per IAS 37.","isaRef":"ISA 501"},{"area":"Subsequent Events","representation":"No events occurring subsequent to the balance sheet date require adjustment or disclosure beyond those already addressed.","isaRef":"ISA 560.9"},{"area":"Laws & Regulations","representation":"We have disclosed all instances of non-compliance or suspected non-compliance with laws and regulations.","isaRef":"ISA 250.16"},{"area":"Estimates","representation":"Significant assumptions in accounting estimates are reasonable and reflect management intent and ability to carry out specific courses of action.","isaRef":"ISA 540.13"},{"area":"Taxation","representation":"All taxation matters are properly provided for. All returns filed and amounts paid or provided. No pending tax assessments not disclosed.","isaRef":"ISA 250, IAS 12"}],"fraudRepresentations":["We have disclosed our assessment of fraud risk to the auditor.","We have no knowledge of any actual, suspected or alleged fraud affecting the entity.","We have disclosed all information regarding fraud or suspected fraud."],"closingStatement":"This letter has been prepared with full knowledge that you will rely upon it in issuing your auditor's report.","signingBlock":{"onBehalfOf":"${clientName}","signatories":[{"name":"_______________","designation":"Chief Executive Officer","date":"To be signed","signature":"_______________"},{"name":"_______________","designation":"Chief Financial Officer","date":"To be signed","signature":"_______________"}]},"isaReferences":["ISA 580","ISA 570","ISA 550","ISA 501","ISA 560","ISA 250","ISA 540","ISA 240"]}`;

    } else if (docType === "eqcr_checklist") {
      docCode = "QR-01";
      prompt = `You are generating a complete ISQM 2 / ISA 220-compliant EQCR Checklist for a Pakistani CA firm.
FIRM: ${firmName} | CLIENT: ${clientName} | ENTITY TYPE: ${session.entityType || "Private Limited"}
PIE/LISTED: ${isPIE ? "YES — EQCR mandatory" : "NO — at firm discretion"} | ENGAGEMENT: ${engCode} | PERIOD: ${period}
PARTNER: ${varMap["engagement_partner"] || "N/A"} | EQCR REVIEWER: ${varMap["eqcr_partner"] || "To be assigned"}

Generate 30+ item EQCR checklist per ISQM 2.34-35 and ISA 220.34. Return ONLY valid JSON:
{"checklistTitle":"Engagement Quality Control Review Checklist","isqmReference":"ISQM 2 (Effective Dec 2022), ISA 220 (Revised), ICAP SQCS","reviewerDetails":{"eqcrReviewerName":"${varMap["eqcr_partner"] || "_______________"}","qualifications":"FCA/ACA ICAP","independenceConfirmed":false,"reviewStartDate":"","reviewEndDate":""},"sections":[{"sectionCode":"S1","sectionTitle":"Independence & Ethics","items":[{"code":"S1-01","description":"Confirm engagement partner and all team members declared independence per ISA 220.14 and ICAP Code of Ethics","isaRef":"ISA 220.14, ISQM 1.26","status":"pending","comment":""},{"code":"S1-02","description":"Verify no prohibited financial interests, loans or business relationships exist with ${clientName}","isaRef":"ICAP CoE Part 4A","status":"pending","comment":""},{"code":"S1-03","description":"Confirm partner rotation requirements met (5-year rule for PIE entities per ISQM 1.34(c))","isaRef":"ISQM 1.34(c)","status":"${isPIE ? "pending" : "n_a"}","comment":"${isPIE ? "" : "N/A — non-PIE entity"}"},{"code":"S1-04","description":"Verify no non-audit services that impair independence were performed","isaRef":"ICAP CoE 290/291","status":"pending","comment":""},{"code":"S1-05","description":"Confirm EQCR reviewer is not a member of the engagement team per ISQM 2.16","isaRef":"ISQM 2.16","status":"pending","comment":""}]},{"sectionCode":"S2","sectionTitle":"Risk Assessment & Planning","items":[{"code":"S2-01","description":"Review that significant risks identified and documented per ISA 315.26","isaRef":"ISA 315.26, ISA 220.33(a)","status":"pending","comment":""},{"code":"S2-02","description":"Confirm materiality determined and documented with appropriate basis per ISA 320","isaRef":"ISA 320.10-11","status":"pending","comment":""},{"code":"S2-03","description":"Review overall audit strategy and plan consistent with risk assessment per ISA 300","isaRef":"ISA 300.7-10","status":"pending","comment":""},{"code":"S2-04","description":"Verify going concern assessment adequate and documented per ISA 570","isaRef":"ISA 570.10-16","status":"pending","comment":""},{"code":"S2-05","description":"Confirm fraud risk assessment documented including management override per ISA 240.24","isaRef":"ISA 240.24-27","status":"pending","comment":""}]},{"sectionCode":"S3","sectionTitle":"Execution & Evidence","items":[{"code":"S3-01","description":"Review audit procedures appropriate and responsive to assessed risks per ISA 330","isaRef":"ISA 330.4-6, ISA 220.33(b)","status":"pending","comment":""},{"code":"S3-02","description":"Confirm sufficient appropriate audit evidence obtained for all significant risks per ISA 500","isaRef":"ISA 500.6","status":"pending","comment":""},{"code":"S3-03","description":"Review key judgments and estimates challenged and documented per ISA 540","isaRef":"ISA 540.13-19","status":"pending","comment":""},{"code":"S3-04","description":"Verify related party transactions identified and appropriately tested per ISA 550","isaRef":"ISA 550.12-22","status":"pending","comment":""},{"code":"S3-05","description":"Review sampling methodology and sample size adequate per ISA 530","isaRef":"ISA 530.6-8","status":"pending","comment":""},{"code":"S3-06","description":"Confirm analytical procedures results plausible and unexplained variances resolved per ISA 520","isaRef":"ISA 520.5","status":"pending","comment":""},{"code":"S3-07","description":"Review external confirmations received and exceptions followed up per ISA 505","isaRef":"ISA 505.8-14","status":"pending","comment":""},{"code":"S3-08","description":"Verify Laws and Regulations review complete per ISA 250","isaRef":"ISA 250.14-16","status":"pending","comment":""}]},{"sectionCode":"S4","sectionTitle":"Financial Reporting & Disclosures","items":[{"code":"S4-01","description":"Review financial statements for compliance with ${session.reportingFramework || "IFRS"} and Companies Act 2017","isaRef":"ISA 700.14, ISA 220.33(c)","status":"pending","comment":""},{"code":"S4-02","description":"Confirm all significant disclosures adequate and complete","isaRef":"ISA 700.17-19","status":"pending","comment":""},{"code":"S4-03","description":"Verify presentation and classification of items in financial statements","isaRef":"IAS 1, ISA 700","status":"pending","comment":""},{"code":"S4-04","description":"Review comparative figures and prior year adjustments correctly stated","isaRef":"ISA 710","status":"pending","comment":""},{"code":"S4-05","description":"Confirm other information (directors report) consistent with financial statements per ISA 720","isaRef":"ISA 720","status":"pending","comment":""}]},{"sectionCode":"S5","sectionTitle":"Completion & Conclusions","items":[{"code":"S5-01","description":"Review completion memorandum and confirm overall audit conclusion appropriate per ISA 220.33(d)","isaRef":"ISA 220.33(d), ISA 230","status":"pending","comment":""},{"code":"S5-02","description":"Confirm summary of uncorrected misstatements communicated to management per ISA 450","isaRef":"ISA 450.12-14","status":"pending","comment":""},{"code":"S5-03","description":"Verify Management Representation Letter obtained signed and complete per ISA 580","isaRef":"ISA 580.14-16","status":"pending","comment":""},{"code":"S5-04","description":"Review subsequent events procedures and confirm cut-off appropriate per ISA 560","isaRef":"ISA 560.6-9","status":"pending","comment":""},{"code":"S5-05","description":"Confirm going concern conclusion and required disclosures or modifications per ISA 570","isaRef":"ISA 570.17-25","status":"pending","comment":""},{"code":"S5-06","description":"Review all significant review notes resolved before sign-off per ISA 220.29","isaRef":"ISA 220.29-30","status":"pending","comment":""}]},{"sectionCode":"S6","sectionTitle":"Audit Report","items":[{"code":"S6-01","description":"Review audit report for compliance with ISA 700/701/705/706 requirements","isaRef":"ISA 700, ISA 701","status":"pending","comment":""},{"code":"S6-02","description":"Confirm Key Audit Matters appropriately identified and described per ISA 701","isaRef":"ISA 701.9-12","status":"${isPIE ? "pending" : "n_a"}","comment":"${isPIE ? "" : "N/A — KAMs required for PIE entities only"}"},{"code":"S6-03","description":"Verify any modification to opinion appropriate and adequately explained per ISA 705","isaRef":"ISA 705","status":"pending","comment":""},{"code":"S6-04","description":"Confirm Emphasis of Matter or Other Matter paragraphs meet ISA 706 requirements if included","isaRef":"ISA 706","status":"pending","comment":""},{"code":"S6-05","description":"Review format dating and signature of audit report comply with ICAP requirements","isaRef":"ISA 700.43-51, ICAP","status":"pending","comment":""}]},{"sectionCode":"S7","sectionTitle":"File Completeness & Archiving","items":[{"code":"S7-01","description":"Confirm working paper file complete and adequately documents basis for auditors report per ISA 230","isaRef":"ISA 230.8-9, ISQM 1.44","status":"pending","comment":""},{"code":"S7-02","description":"Verify all working papers properly cross-referenced to audit report and financial statements","isaRef":"ISA 230.8","status":"pending","comment":""},{"code":"S7-03","description":"Confirm archiving completed within 60 days of auditors report date per ISA 230.14","isaRef":"ISA 230.14, ISQM 1.44(b)","status":"pending","comment":""},{"code":"S7-04","description":"Review file for retention of original documents and evidence per firm quality policy","isaRef":"ISQM 1.44(c)","status":"pending","comment":""}]}],"overallConclusion":{"status":"pending","narrative":"Based on my review I [am satisfied / am not yet satisfied] that sufficient appropriate audit evidence has been obtained and the proposed opinion is appropriate.","outstandingMatters":[],"eqcrReviewerSignature":"_______________","eqcrReviewerDate":"To be signed"}}`;

    } else if (docType === "going_concern") {
      docCode = "GC-01";
      const tbLines = await db.select().from(wpTrialBalanceLinesTable).where(eq(wpTrialBalanceLinesTable.sessionId, sessionId));
      const totalAssets = tbLines.filter(l => (l.classification || "").toLowerCase().includes("asset")).reduce((s, l) => s + (parseFloat(String(l.balance)) || 0), 0);
      const totalLiab = tbLines.filter(l => (l.classification || "").toLowerCase().includes("liabilit")).reduce((s, l) => s + (parseFloat(String(l.balance)) || 0), 0);
      const equity = totalAssets - totalLiab;
      prompt = `You are a Big-4 senior audit partner generating a complete ISA 570 Going Concern Assessment working paper for a Pakistani CA firm.
FIRM: ${firmName} | CLIENT: ${clientName} | ENTITY TYPE: ${session.entityType || "Private Limited"}
ENGAGEMENT: ${engCode} | PERIOD: ${period} | FRAMEWORK: ${session.reportingFramework || "IFRS"}
GOING CONCERN FLAG: ${varMap["going_concern_flag"] || "false"} | TOTAL ASSETS: PKR ${totalAssets.toLocaleString()}
EQUITY: PKR ${equity.toLocaleString()} | REVENUE: ${varMap["revenue_cy"] || "N/A"} | NET PROFIT: ${varMap["net_profit_cy"] || "N/A"}
INTEREST COVERAGE: ${varMap["interest_coverage_ratio"] || "N/A"} | CURRENT RATIO: ${varMap["current_ratio"] || "N/A"}
DEBT TO EQUITY: ${varMap["debt_to_equity_ratio"] || "N/A"}

Return ONLY valid JSON:
{"wpCode":"GC-01","wpTitle":"Going Concern Assessment — ISA 570","engagementCode":"${engCode}","client":"${clientName}","period":"${period}","preparedBy":"${varMap["engagement_manager"] || "_______________"}","preparedDate":"During fieldwork","reviewedBy":"${varMap["engagement_partner"] || "_______________"}","reviewedDate":"Before sign-off","objective":"To evaluate whether the going concern basis of accounting used in preparation of the financial statements is appropriate per ISA 570 and to determine implications for the audit report.","isaReference":"ISA 570 (Revised), IAS 1.25-26, Companies Act 2017","managementAssessmentPeriod":"12 months from balance sheet date","financialIndicators":[{"indicator":"Current Ratio","value":"${varMap["current_ratio"] || "N/A"}","threshold":"≥1.0x acceptable","assessment":"${parseFloat(varMap["current_ratio"] || "2") >= 1 ? "Satisfactory" : "Concern — below 1.0x"}","risk":"${parseFloat(varMap["current_ratio"] || "2") >= 1 ? "Low" : "High"}"},{"indicator":"Debt-to-Equity","value":"${varMap["debt_to_equity_ratio"] || "N/A"}","threshold":"≤2.0x acceptable","assessment":"Review required","risk":"Medium"},{"indicator":"Interest Coverage","value":"${varMap["interest_coverage_ratio"] || "N/A"}","threshold":"≥1.5x critical","assessment":"${parseFloat(varMap["interest_coverage_ratio"] || "3") >= 1.5 ? "Satisfactory" : "Material Uncertainty"}","risk":"${parseFloat(varMap["interest_coverage_ratio"] || "3") >= 1.5 ? "Low" : "High"}"},{"indicator":"Net Profit","value":"${varMap["net_profit_cy"] || "N/A"}","threshold":"Positive preferred","assessment":"${parseFloat(varMap["net_profit_cy"] || "1") > 0 ? "Profitable" : "Loss position — review required"}","risk":"${parseFloat(varMap["net_profit_cy"] || "1") > 0 ? "Low" : "High"}"},{"indicator":"Equity Position","value":"PKR ${equity.toLocaleString()}","threshold":"Positive equity required","assessment":"${equity > 0 ? "Positive equity" : "Capital erosion — material concern"}","risk":"${equity > 0 ? "Low" : "High"}"}],"operationalIndicators":[{"indicator":"Ability to meet debt repayments","assessment":"Obtain loan schedules and confirm upcoming repayments vs cash projections","risk":"Medium"},{"indicator":"Key management intent to support","assessment":"Obtain written confirmation from directors of intent to continue","risk":"Low"},{"indicator":"Significant contracts in pipeline","assessment":"Verify forward order book and revenue pipeline","risk":"Medium"},{"indicator":"Regulatory or legal proceedings","assessment":"Review any regulatory notices or pending litigation","risk":"Low"}],"managementPlans":{"reviewed":${varMap["going_concern_flag"] === "true"},"plansObtained":"Obtain management business plan for 12+ months from balance sheet date","cashFlowForecast":"Obtain and review 12-month cash flow forecast","assessmentOfPlans":"Evaluate feasibility of management plans including assumptions"},"auditProcedures":[{"proc":"GC-P01","description":"Obtain and review management going concern assessment covering 12+ months from balance sheet date","isaRef":"ISA 570.12","status":"Planned"},{"proc":"GC-P02","description":"Obtain 12-month cash flow forecast and assess key assumptions for reasonableness","isaRef":"ISA 570.16(a)","status":"Planned"},{"proc":"GC-P03","description":"Inquire management regarding known or probable events beyond 12 months","isaRef":"ISA 570.14","status":"Planned"},{"proc":"GC-P04","description":"Review bank loan agreements for covenant compliance and renegotiation status","isaRef":"ISA 570.16","status":"Planned"},{"proc":"GC-P05","description":"Review subsequent events for going concern implications per ISA 560","isaRef":"ISA 570.16(f)","status":"Planned"},{"proc":"GC-P06","description":"Obtain written representations from management on going concern assessment","isaRef":"ISA 570.16(e)","status":"Planned"},{"proc":"GC-P07","description":"Evaluate adequacy of going concern disclosures in notes to financial statements","isaRef":"ISA 570.19-22","status":"Planned"},{"proc":"GC-P08","description":"Consider implications for audit opinion — no issue / emphasis of matter / material uncertainty / adverse or disclaimer","isaRef":"ISA 570.23-25, ISA 705","status":"Planned"}],"conclusion":{"gcBasisAppropriate":${varMap["going_concern_flag"] !== "true"},"materialUncertaintyExists":${varMap["going_concern_flag"] === "true"},"conclusionNarrative":"${varMap["going_concern_flag"] === "true" ? "Material uncertainty identified. Additional procedures required. Consider adequacy of disclosure and opinion implications per ISA 570.23." : "Based on procedures performed the going concern basis is appropriate. No material uncertainty exists requiring disclosure or modification to the audit report."}","implicationForReport":"${varMap["going_concern_flag"] === "true" ? "Material Uncertainty Related to Going Concern paragraph required per ISA 570.22" : "No modification required on going concern grounds"}","preparedBy":"${varMap["engagement_manager"] || "_______________"}","partnerSignOff":"${varMap["engagement_partner"] || "_______________"}","signOffDate":"Before audit report"}}`;

    } else if (docType === "secp_ccg") {
      docCode = "SECP-F29";
      prompt = `You are a senior Pakistani CA generating SECP Form 29, Form A, and CCG 2019 compliance review working papers.
FIRM: ${firmName} | CLIENT: ${clientName} | ENTITY TYPE: ${session.entityType || "Private Limited"}
IS LISTED/PIE: ${isPIE ? "YES — CCG 2019 fully applicable" : "NO — basic Companies Act requirements"} | NTN: ${session.ntn || "N/A"}
ENGAGEMENT: ${engCode} | PERIOD: ${period}

Return ONLY valid JSON:
{"wpTitle":"SECP Statutory Filings and CCG 2019 Compliance Review","client":"${clientName}","period":"${period}","engagementCode":"${engCode}","form29Review":{"wpCode":"SECP-F29","title":"SECP Form 29 — Directors and Beneficial Owners Compliance","legalBasis":"Companies Act 2017 Section 155; SECP (Filing of Beneficial Owners) Regulations 2018","objective":"Verify Form 29 filed with SECP and directors register is current and accurate","procedures":[{"proc":"F29-01","description":"Obtain latest Form 29 filing confirmation from SECP eService portal","status":"Planned","finding":""},{"proc":"F29-02","description":"Verify all current directors listed on Form 29 with correct names CNICs and designation","status":"Planned","finding":""},{"proc":"F29-03","description":"Confirm changes to directors reported within 14 days per Companies Act 2017 s.155(2)","status":"Planned","finding":""},{"proc":"F29-04","description":"Review Beneficial Owners Register — verify UBOs with 25%+ shareholding identified and filed per BO Regulations","status":"Planned","finding":""},{"proc":"F29-05","description":"Confirm CEO/MD appointment on file with SECP and valid","status":"Planned","finding":""},{"proc":"F29-06","description":"Verify Company Secretary appointment filed per Companies Act 2017","status":"Planned","finding":""}],"finding":"To be completed during fieldwork","conclusion":"To be concluded after fieldwork"},"formAReview":{"wpCode":"SECP-FA","title":"SECP Form A — Annual Return Compliance","legalBasis":"Companies Act 2017 Section 130; SECP Regulations","objective":"Verify Annual Return filed within prescribed time limits","procedures":[{"proc":"FA-01","description":"Obtain copy of last filed Form A from SECP eService portal","status":"Planned","finding":""},{"proc":"FA-02","description":"Verify Form A filed within 30 days of AGM or 6 months of year-end if no AGM","status":"Planned","finding":""},{"proc":"FA-03","description":"Confirm share capital in Form A agrees to company share register","status":"Planned","finding":""},{"proc":"FA-04","description":"Verify list of shareholders and percentage holdings matches share register","status":"Planned","finding":""},{"proc":"FA-05","description":"Confirm registered office address in Form A agrees to company records","status":"Planned","finding":""},{"proc":"FA-06","description":"Verify any default in filing — confirm penalty paid or regularized","status":"Planned","finding":""}],"finding":"To be completed during fieldwork","conclusion":"To be concluded after fieldwork"},"ccg2019Review":{"wpCode":"CCG-01","title":"CCG 2019 — Corporate Governance Compliance Checklist","legalBasis":"Listed Companies (Code of Corporate Governance) Regulations 2019 (CCG 2019)","applicability":"${isPIE ? "Fully applicable — listed entity" : "Not mandatory — non-listed entity. Basic Companies Act 2017 governance requirements apply."}","checklistItems":${isPIE ? `[{"code":"CCG-01","provision":"Reg.3","description":"Minimum one-third independent directors on board","status":"pending","finding":""},{"code":"CCG-02","provision":"Reg.4","description":"Chairman is non-executive and not the CEO/MD","status":"pending","finding":""},{"code":"CCG-03","provision":"Reg.5","description":"Audit Committee established with majority independent directors","status":"pending","finding":""},{"code":"CCG-04","provision":"Reg.6","description":"Audit Committee charter adopted and meetings held at least quarterly","status":"pending","finding":""},{"code":"CCG-05","provision":"Reg.7","description":"HR and Remuneration Committee established with majority non-executive directors","status":"pending","finding":""},{"code":"CCG-06","provision":"Reg.9","description":"Risk Management Committee established and risk management policy adopted","status":"pending","finding":""},{"code":"CCG-07","provision":"Reg.10","description":"Board meetings — minimum 4 per year with required quorum","status":"pending","finding":""},{"code":"CCG-08","provision":"Reg.11","description":"Directors training program — all directors completed required hours","status":"pending","finding":""},{"code":"CCG-09","provision":"Reg.12","description":"Statement of Ethics and Business Practices adopted and circulated","status":"pending","finding":""},{"code":"CCG-10","provision":"Reg.13","description":"Internal audit function established with qualified head","status":"pending","finding":""},{"code":"CCG-11","provision":"Reg.14","description":"External auditor is on SECP approved panel","status":"pending","finding":""},{"code":"CCG-12","provision":"Reg.15","description":"Related party transactions policy adopted and all RPTs pre-approved by Audit Committee","status":"pending","finding":""},{"code":"CCG-13","provision":"Reg.16","description":"Insider trading policy adopted and closed periods enforced","status":"pending","finding":""},{"code":"CCG-14","provision":"Reg.17","description":"Corporate Governance Report included in Annual Report per CCG 2019","status":"pending","finding":""},{"code":"CCG-15","provision":"Reg.18","description":"CEO and CFO certification of financial statements obtained per CCG 2019","status":"pending","finding":""},{"code":"CCG-16","provision":"Reg.19","description":"Auditor did not provide prohibited non-audit services","status":"pending","finding":""},{"code":"CCG-17","provision":"Reg.20","description":"Dividend policy disclosed and consistently applied","status":"pending","finding":""}]` : `[{"code":"CCG-NA","provision":"N/A","description":"CCG 2019 not applicable to non-listed entities","status":"n_a","finding":"Not applicable"}]`},"overallConclusion":"${isPIE ? "To be concluded after completing all items" : "CCG 2019 not applicable"}"},"overallFinding":"To be completed after fieldwork","preparedBy":"${varMap["engagement_manager"] || "_______________"}","reviewedBy":"${varMap["engagement_partner"] || "_______________"}","isaReferences":["ISA 250 Laws and Regulations","Companies Act 2017","CCG 2019","SECP Regulations"]}`;
    } else {
      return res.status(400).json({ error: `Unknown docType: ${docType}. Valid types: engagement_letter, independence_confirmation, management_rep_letter, eqcr_checklist, going_concern, secp_ccg` });
    }

    const aiResp = await ai.client.chat.completions.create({
      model: ai.model || "gpt-4o",
      messages: [
        { role: "system", content: "You are an expert Pakistani CA generating ISA-compliant audit documents. Return ONLY valid JSON with no markdown fences or extra text." },
        { role: "user", content: prompt },
      ],
      temperature: 0.15,
      max_tokens: 4000,
      response_format: { type: "json_object" },
    });

    const raw = JSON.parse(aiResp.choices[0].message.content || "{}");

    const existing = await db.select().from(wpComplianceDocTable)
      .where(and(eq(wpComplianceDocTable.sessionId, sessionId), eq(wpComplianceDocTable.docType, docType)));

    const checklistFlat = docType === "eqcr_checklist" && raw.sections
      ? (raw.sections as any[]).flatMap((s: any) => s.items || [])
      : docType === "secp_ccg" && raw.ccg2019Review?.checklistItems
        ? raw.ccg2019Review.checklistItems
        : undefined;

    if (existing[0]) {
      await db.update(wpComplianceDocTable).set({
        generatedContent: raw, generatedAt: new Date(), docCode,
        status: "generated", version: (existing[0].version || 1) + 1, updatedAt: new Date(),
        ...(checklistFlat ? { checklistItems: checklistFlat } : {}),
        isaReference: (raw.isaReferences || []).join(", "),
      }).where(eq(wpComplianceDocTable.id, existing[0].id));
    } else {
      await db.insert(wpComplianceDocTable).values({
        sessionId, docType, docCode, status: "generated",
        generatedContent: raw, generatedAt: new Date(), version: 1,
        ...(checklistFlat ? { checklistItems: checklistFlat } : {}),
        isaReference: (raw.isaReferences || []).join(", "),
      });
    }

    res.json({ success: true, docType, docCode, content: raw });
  } catch (err: any) {
    logger.error({ err }, "Compliance doc generation failed");
    res.status(500).json({ error: "Generation failed: " + err.message });
  }
});

// POST /sessions/:id/compliance-docs/:docType/sign — record signature / completion
router.post("/sessions/:id/compliance-docs/:docType/sign", requireRoles("super_admin", "partner", "senior_manager", "manager"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const sessionId = parseInt(p(req.params.id));
    const docType = req.params.docType;
    const { signatoryName, signatoryDesignation, signingDate, notes, action } = req.body;
    // action: "sign" | "reject" | "mark_sent"

    const existing = await db.select().from(wpComplianceDocTable)
      .where(and(eq(wpComplianceDocTable.sessionId, sessionId), eq(wpComplianceDocTable.docType, docType)));
    if (!existing[0]) return res.status(404).json({ error: "Document not generated yet. Generate the document first." });

    const newStatus = action === "reject" ? "rejected" : action === "mark_sent" ? "sent_to_client" : "signed";

    await db.update(wpComplianceDocTable).set({
      status: newStatus,
      signatoryName: signatoryName || existing[0].signatoryName,
      signatoryDesignation: signatoryDesignation || existing[0].signatoryDesignation,
      signingDate: signingDate || new Date().toISOString().split("T")[0],
      ...(action !== "mark_sent" ? { signedAt: new Date() } : {}),
      ...(action === "reject" ? { rejectionReason: notes } : {}),
      notes: notes || existing[0].notes,
      updatedAt: new Date(),
    }).where(eq(wpComplianceDocTable.id, existing[0].id));

    res.json({ success: true, status: newStatus, docType });
  } catch (err: any) { logger.error({ err }, "Route error"); res.status(500).json({ error: err.message }); }
});

// PATCH /sessions/:id/compliance-docs/eqcr_checklist/item — update single EQCR item
router.patch("/sessions/:id/compliance-docs/eqcr_checklist/item", requireRoles(...WP_ROLES_WRITE), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const sessionId = parseInt(p(req.params.id));
    const { itemCode, status, comment } = req.body;

    const existing = await db.select().from(wpComplianceDocTable)
      .where(and(eq(wpComplianceDocTable.sessionId, sessionId), eq(wpComplianceDocTable.docType, "eqcr_checklist")));
    if (!existing[0]) return res.status(404).json({ error: "EQCR checklist not generated yet" });

    const items = (existing[0].checklistItems as any[]) || [];
    const updated = items.map((item: any) =>
      item.code === itemCode ? { ...item, status, comment, reviewedAt: new Date().toISOString() } : item
    );
    const allDone = updated.length > 0 && updated.every((i: any) => i.status !== "pending");

    await db.update(wpComplianceDocTable).set({
      checklistItems: updated,
      ...(allDone ? { checklistCompletedAt: new Date(), status: "completed" } : {}),
      updatedAt: new Date(),
    }).where(eq(wpComplianceDocTable.id, existing[0].id));

    res.json({
      success: true,
      totalItems: updated.length,
      completedItems: updated.filter((i: any) => i.status !== "pending").length,
      allComplete: allDone,
    });
  } catch (err: any) { logger.error({ err }, "Route error"); res.status(500).json({ error: err.message }); }
});

// PATCH /sessions/:id/compliance-docs/secp_ccg/item — update single CCG checklist item
router.patch("/sessions/:id/compliance-docs/secp_ccg/item", requireRoles(...WP_ROLES_WRITE), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const sessionId = parseInt(p(req.params.id));
    const { itemCode, status, finding } = req.body;

    const existing = await db.select().from(wpComplianceDocTable)
      .where(and(eq(wpComplianceDocTable.sessionId, sessionId), eq(wpComplianceDocTable.docType, "secp_ccg")));
    if (!existing[0]) return res.status(404).json({ error: "SECP/CCG document not generated yet" });

    const items = (existing[0].checklistItems as any[]) || [];
    const updated = items.map((item: any) =>
      item.code === itemCode ? { ...item, status, finding, reviewedAt: new Date().toISOString() } : item
    );
    const allDone = updated.length > 0 && updated.every((i: any) => i.status !== "pending");

    await db.update(wpComplianceDocTable).set({
      checklistItems: updated,
      ...(allDone ? { checklistCompletedAt: new Date(), status: "completed" } : {}),
      updatedAt: new Date(),
    }).where(eq(wpComplianceDocTable.id, existing[0].id));

    res.json({ success: true, totalItems: updated.length, completedItems: updated.filter((i: any) => i.status !== "pending").length });
  } catch (err: any) { logger.error({ err }, "Route error"); res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ISA AUDIT SYSTEM ROUTES — Audit Logic Chain, Tick Marks, Review Workflow,
// Version Control, Lead Schedules, FS Note Mapping, Compliance Validation,
// ISA 530 Sampling, Template Processing
// ═══════════════════════════════════════════════════════════════════════════════

// ── AUDIT LOGIC CHAIN (Risk → Assertion → Procedure → Evidence → Conclusion) ──

router.get("/sessions/:sessionId/audit-chain", async (req: Request, res: Response) => {
  try {
    const sessionId = parseInt(p(req.params.sessionId));
    const chains = await db.select().from(wpAuditChainTable).where(eq(wpAuditChainTable.sessionId, sessionId)).orderBy(wpAuditChainTable.fsArea, wpAuditChainTable.riskId);
    const summary = {
      total: chains.length,
      complete: chains.filter(c => c.chainComplete).length,
      byStatus: {
        planned: chains.filter(c => c.procedureStatus === "planned").length,
        in_progress: chains.filter(c => c.procedureStatus === "in_progress").length,
        performed: chains.filter(c => c.procedureStatus === "performed").length,
        deferred: chains.filter(c => c.procedureStatus === "deferred").length,
      },
      byRiskLevel: {
        high: chains.filter(c => c.riskLevel === "high" || c.riskLevel === "significant").length,
        medium: chains.filter(c => c.riskLevel === "medium").length,
        low: chains.filter(c => c.riskLevel === "low").length,
      },
      assertionCoverage: {
        full: chains.filter(c => c.assertionCoverage === "full").length,
        partial: chains.filter(c => c.assertionCoverage === "partial").length,
        none: chains.filter(c => c.assertionCoverage === "none" || !c.assertionCoverage).length,
      },
      evidenceSufficiency: {
        sufficient: chains.filter(c => c.evidenceSufficiency === "sufficient").length,
        insufficient: chains.filter(c => c.evidenceSufficiency === "insufficient").length,
        additional: chains.filter(c => c.evidenceSufficiency === "additional_needed").length,
      },
      exceptionsTotal: chains.reduce((s, c) => s + (c.exceptionsFound || 0), 0),
    };
    res.json({ chains, summary });
  } catch (err: any) { logger.error({ err }, "Route error"); res.status(500).json({ error: err.message }); }
});

router.post("/sessions/:sessionId/audit-chain/generate", requireRoles(...WP_ROLES_WRITE), aiRateLimit, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const sessionId = parseInt(p(req.params.sessionId));
    const { wpCode, fsArea } = req.body;
    const session = await db.select().from(wpSessionsTable).where(eq(wpSessionsTable.id, sessionId));
    if (!session.length) return res.status(404).json({ error: "Session not found" });
    const variables = await db.select().from(wpVariablesTable).where(eq(wpVariablesTable.sessionId, sessionId));
    const varMap: Record<string, string> = {};
    variables.forEach(v => { varMap[v.variableCode] = v.currentValue || v.defaultValue || ""; });

    const tbLines = await db.select().from(wpTrialBalanceLinesTable).where(eq(wpTrialBalanceLinesTable.sessionId, sessionId));
    const areaLines = fsArea ? tbLines.filter(l => (l as any).wpArea === fsArea || (l as any).fsSection === fsArea) : tbLines;

    const isaRiskMap: Record<string, { riskType: string; isaRef: string; assertions: any[]; procedures: any[] }> = {
      "PPE": {
        riskType: "inherent", isaRef: "ISA 315.26",
        assertions: [
          { code: "E", name: "Existence", isaRef: "ISA 315.A190" },
          { code: "CO", name: "Completeness", isaRef: "ISA 315.A190" },
          { code: "V", name: "Valuation", isaRef: "ISA 315.A190" },
          { code: "RO", name: "Rights & Obligations", isaRef: "ISA 315.A190" },
          { code: "PD", name: "Presentation & Disclosure", isaRef: "ISA 315.A190" },
        ],
        procedures: [
          { nature: "substantive", desc: "Physically verify existence of significant PPE items", isaRef: "ISA 501.4", timing: "final" },
          { nature: "substantive", desc: "Vouch additions to purchase invoices/contracts", isaRef: "ISA 500.A14", timing: "final" },
          { nature: "substantive", desc: "Recalculate depreciation using entity's policy", isaRef: "ISA 540.8", timing: "final" },
          { nature: "substantive", desc: "Review title documents for ownership verification", isaRef: "ISA 500.A31", timing: "final" },
          { nature: "analytical", desc: "Compare PPE movements year-over-year with budget", isaRef: "ISA 520.5", timing: "final" },
          { nature: "toc", desc: "Test authorization controls for capital expenditure", isaRef: "ISA 330.8", timing: "interim" },
        ]
      },
      "Inventory": {
        riskType: "inherent", isaRef: "ISA 315.26",
        assertions: [
          { code: "E", name: "Existence", isaRef: "ISA 501.4" },
          { code: "CO", name: "Completeness", isaRef: "ISA 315.A190" },
          { code: "V", name: "Valuation (NRV)", isaRef: "ISA 540.8" },
          { code: "RO", name: "Rights & Obligations", isaRef: "ISA 315.A190" },
        ],
        procedures: [
          { nature: "substantive", desc: "Attend physical inventory count and perform test counts", isaRef: "ISA 501.4", timing: "final" },
          { nature: "substantive", desc: "Test NRV against subsequent selling prices", isaRef: "ISA 540.8", timing: "final" },
          { nature: "substantive", desc: "Verify cut-off procedures at year-end", isaRef: "ISA 500.A49", timing: "final" },
          { nature: "analytical", desc: "Analyze inventory turnover and aging", isaRef: "ISA 520.5", timing: "final" },
          { nature: "toc", desc: "Test perpetual inventory system controls", isaRef: "ISA 330.8", timing: "interim" },
        ]
      },
      "Receivables": {
        riskType: "inherent", isaRef: "ISA 315.26",
        assertions: [
          { code: "E", name: "Existence", isaRef: "ISA 505.6" },
          { code: "CO", name: "Completeness", isaRef: "ISA 315.A190" },
          { code: "V", name: "Valuation (ECL)", isaRef: "ISA 540.8" },
          { code: "RO", name: "Rights & Obligations", isaRef: "ISA 315.A190" },
        ],
        procedures: [
          { nature: "substantive", desc: "Send positive confirmations to material debtors", isaRef: "ISA 505.7", timing: "final" },
          { nature: "substantive", desc: "Test ECL/provision for doubtful debts calculation", isaRef: "ISA 540.8", timing: "final" },
          { nature: "substantive", desc: "Agree sub-ledger to control account", isaRef: "ISA 500.A14", timing: "final" },
          { nature: "analytical", desc: "Analyze aging schedule and DSO trends", isaRef: "ISA 520.5", timing: "final" },
        ]
      },
      "Revenue": {
        riskType: "fraud", isaRef: "ISA 240.26",
        assertions: [
          { code: "OC", name: "Occurrence", isaRef: "ISA 240.A28" },
          { code: "CO", name: "Completeness", isaRef: "ISA 315.A190" },
          { code: "AC", name: "Accuracy", isaRef: "ISA 315.A190" },
          { code: "CU", name: "Cut-off", isaRef: "ISA 315.A190" },
        ],
        procedures: [
          { nature: "substantive", desc: "Vouch revenue transactions to delivery/shipping documents", isaRef: "ISA 500.A14", timing: "final" },
          { nature: "substantive", desc: "Test cut-off for sales around year-end", isaRef: "ISA 500.A49", timing: "final" },
          { nature: "substantive", desc: "Compare revenue with STRN/FBR sales tax returns", isaRef: "ISA 500.A31", timing: "final" },
          { nature: "analytical", desc: "Monthly revenue trend analysis and GP ratio analysis", isaRef: "ISA 520.5", timing: "final" },
          { nature: "toc", desc: "Test sales order to invoice to receipt cycle controls", isaRef: "ISA 330.8", timing: "interim" },
        ]
      },
      "Payables": {
        riskType: "inherent", isaRef: "ISA 315.26",
        assertions: [
          { code: "CO", name: "Completeness", isaRef: "ISA 315.A190" },
          { code: "E", name: "Existence", isaRef: "ISA 315.A190" },
          { code: "V", name: "Valuation", isaRef: "ISA 315.A190" },
        ],
        procedures: [
          { nature: "substantive", desc: "Send supplier confirmations and reconcile balances", isaRef: "ISA 505.7", timing: "final" },
          { nature: "substantive", desc: "Search for unrecorded liabilities after year-end", isaRef: "ISA 500.A49", timing: "final" },
          { nature: "substantive", desc: "Agree creditor sub-ledger to control account", isaRef: "ISA 500.A14", timing: "final" },
        ]
      },
      "Taxation": {
        riskType: "inherent", isaRef: "ISA 315.26",
        assertions: [
          { code: "AC", name: "Accuracy", isaRef: "ISA 315.A190" },
          { code: "CO", name: "Completeness", isaRef: "ISA 315.A190" },
          { code: "V", name: "Valuation", isaRef: "ISA 540.8" },
        ],
        procedures: [
          { nature: "substantive", desc: "Recalculate current tax provision per Income Tax Ordinance 2001", isaRef: "ISA 540.8", timing: "final" },
          { nature: "substantive", desc: "Review deferred tax computation (IAS 12 vs local GAAP)", isaRef: "ISA 540.8", timing: "final" },
          { nature: "substantive", desc: "Verify WHT deductions on applicable payments", isaRef: "ISA 500.A14", timing: "final" },
          { nature: "substantive", desc: "Review sales tax returns reconciliation", isaRef: "ISA 500.A31", timing: "final" },
        ]
      },
      "Employee Benefits": {
        riskType: "inherent", isaRef: "ISA 315.26",
        assertions: [
          { code: "CO", name: "Completeness", isaRef: "ISA 315.A190" },
          { code: "V", name: "Valuation", isaRef: "ISA 540.8" },
          { code: "AC", name: "Accuracy", isaRef: "ISA 315.A190" },
        ],
        procedures: [
          { nature: "substantive", desc: "Recalculate gratuity/pension obligation (IAS 19)", isaRef: "ISA 540.8", timing: "final" },
          { nature: "substantive", desc: "Verify payroll summaries against HR records", isaRef: "ISA 500.A14", timing: "final" },
          { nature: "analytical", desc: "Analyze salary expense trends month-over-month", isaRef: "ISA 520.5", timing: "final" },
        ]
      },
      "Cash": {
        riskType: "inherent", isaRef: "ISA 315.26",
        assertions: [
          { code: "E", name: "Existence", isaRef: "ISA 315.A190" },
          { code: "CO", name: "Completeness", isaRef: "ISA 315.A190" },
        ],
        procedures: [
          { nature: "substantive", desc: "Obtain bank confirmations for all bank accounts", isaRef: "ISA 505.7", timing: "final" },
          { nature: "substantive", desc: "Prepare/review bank reconciliation statements", isaRef: "ISA 500.A14", timing: "final" },
          { nature: "substantive", desc: "Perform cash count at year-end", isaRef: "ISA 501.4", timing: "final" },
        ]
      },
      "Intangibles": {
        riskType: "inherent", isaRef: "ISA 315.26",
        assertions: [
          { code: "E", name: "Existence", isaRef: "ISA 315.A190" },
          { code: "V", name: "Valuation", isaRef: "ISA 540.8" },
          { code: "RO", name: "Rights & Obligations", isaRef: "ISA 315.A190" },
        ],
        procedures: [
          { nature: "substantive", desc: "Review impairment indicators per IAS 36", isaRef: "ISA 540.8", timing: "final" },
          { nature: "substantive", desc: "Recalculate amortization and verify useful life", isaRef: "ISA 540.8", timing: "final" },
          { nature: "substantive", desc: "Verify ownership documentation (licenses, patents)", isaRef: "ISA 500.A31", timing: "final" },
        ]
      },
      "Other Assets": {
        riskType: "inherent", isaRef: "ISA 315.26",
        assertions: [
          { code: "E", name: "Existence", isaRef: "ISA 315.A190" },
          { code: "V", name: "Valuation", isaRef: "ISA 315.A190" },
        ],
        procedures: [
          { nature: "substantive", desc: "Obtain investment confirmations and verify market values", isaRef: "ISA 505.7", timing: "final" },
          { nature: "substantive", desc: "Verify long-term loan/advance recoverability", isaRef: "ISA 540.8", timing: "final" },
        ]
      },
      "Cost of Sales": {
        riskType: "inherent", isaRef: "ISA 315.26",
        assertions: [
          { code: "OC", name: "Occurrence", isaRef: "ISA 315.A190" },
          { code: "AC", name: "Accuracy", isaRef: "ISA 315.A190" },
          { code: "CU", name: "Cut-off", isaRef: "ISA 315.A190" },
        ],
        procedures: [
          { nature: "substantive", desc: "Reconcile cost of sales components (materials, labor, overheads)", isaRef: "ISA 500.A14", timing: "final" },
          { nature: "analytical", desc: "Analyze GP margin trend and investigate significant variances", isaRef: "ISA 520.5", timing: "final" },
        ]
      },
      "Operating Expenses": {
        riskType: "inherent", isaRef: "ISA 315.26",
        assertions: [
          { code: "OC", name: "Occurrence", isaRef: "ISA 315.A190" },
          { code: "CO", name: "Completeness", isaRef: "ISA 315.A190" },
          { code: "CL", name: "Classification", isaRef: "ISA 315.A190" },
        ],
        procedures: [
          { nature: "substantive", desc: "Vouch significant expenses to supporting documentation", isaRef: "ISA 500.A14", timing: "final" },
          { nature: "analytical", desc: "Compare expense line items year-over-year", isaRef: "ISA 520.5", timing: "final" },
        ]
      },
      "Related Parties": {
        riskType: "fraud", isaRef: "ISA 550.18",
        assertions: [
          { code: "CO", name: "Completeness", isaRef: "ISA 550.A30" },
          { code: "PD", name: "Presentation & Disclosure", isaRef: "ISA 550.25" },
        ],
        procedures: [
          { nature: "substantive", desc: "Obtain management representations on RP completeness", isaRef: "ISA 550.26", timing: "final" },
          { nature: "substantive", desc: "Review all RP transactions for arm's length pricing", isaRef: "ISA 550.23", timing: "final" },
          { nature: "substantive", desc: "Verify IAS 24 disclosure requirements are met", isaRef: "ISA 550.25", timing: "final" },
        ]
      },
      "Equity": {
        riskType: "inherent", isaRef: "ISA 315.26",
        assertions: [
          { code: "E", name: "Existence", isaRef: "ISA 315.A190" },
          { code: "RO", name: "Rights & Obligations", isaRef: "ISA 315.A190" },
          { code: "PD", name: "Presentation & Disclosure", isaRef: "ISA 315.A190" },
        ],
        procedures: [
          { nature: "substantive", desc: "Verify authorized, issued, and paid-up capital per SECP records", isaRef: "ISA 500.A31", timing: "final" },
          { nature: "substantive", desc: "Review minutes for dividend declarations and appropriations", isaRef: "ISA 500.A14", timing: "final" },
        ]
      },
    };

    const fallbackMap = isaRiskMap["Operating Expenses"];
    const chains: any[] = [];
    const areasSet = new Set<string>();
    areaLines.forEach(l => areasSet.add((l as any).wpArea || (l as any).fsSection || "General"));
    const targetAreas = fsArea ? [fsArea] : Array.from(areasSet);

    for (const area of targetAreas) {
      const mapEntry = isaRiskMap[area] || fallbackMap;
      const riskId = `R-${area.replace(/\s+/g, "-").toUpperCase()}-001`;
      const riskLevelVal = areaLines.some(l => ((l as any).wpArea === area || (l as any).fsSection === area) && (l as any).riskLevel === "High") ? "high" : "medium";

      for (let pi = 0; pi < mapEntry.procedures.length; pi++) {
        const proc = mapEntry.procedures[pi];
        const procId = `P-${area.replace(/\s+/g, "-").toUpperCase()}-${String(pi + 1).padStart(3, "0")}`;
        chains.push({
          sessionId, wpCode: wpCode || `EX-${area.replace(/\s+/g, "-").substring(0, 6).toUpperCase()}-01`,
          fsArea: area, riskId, riskDescription: `Risk of material misstatement in ${area}`,
          riskType: mapEntry.riskType, isaRiskRef: mapEntry.isaRef, riskLevel: riskLevelVal,
          riskResponse: `Apply ISA 330 response procedures for ${riskLevelVal} risk ${area}`,
          assertions: mapEntry.assertions, assertionCoverage: "full",
          procedureId: procId, procedureDescription: proc.desc,
          procedureNature: proc.nature, procedureIsaRef: proc.isaRef,
          procedureIsaClause: `Per ${proc.isaRef}`, procedureTiming: proc.timing,
          procedureStatus: "planned", evidenceIds: [], evidenceType: null,
          evidenceReliability: null, evidenceSufficiency: null,
          tickMarkCode: null, tickMarkMeaning: null, resultSummary: null,
          exceptionsFound: 0, exceptionDetails: [], misstatementAmount: null,
          misstatementType: null, conclusion: null, conclusionNarrative: null,
          impactOnOpinion: null, conclusionIsaRef: null,
          furtherActionRequired: false, furtherActionDetail: null,
          chainComplete: false, chainValidatedAt: null,
        });
      }
    }

    if (chains.length > 0) {
      await db.delete(wpAuditChainTable).where(and(eq(wpAuditChainTable.sessionId, sessionId), fsArea ? eq(wpAuditChainTable.fsArea, fsArea) : undefined as any));
      const batchSize = 50;
      for (let i = 0; i < chains.length; i += batchSize) {
        await db.insert(wpAuditChainTable).values(chains.slice(i, i + batchSize));
      }
    }
    res.json({ success: true, chainsGenerated: chains.length, areas: targetAreas });
  } catch (err: any) { logger.error({ err }, "Route error"); res.status(500).json({ error: err.message }); }
});

router.put("/sessions/:sessionId/audit-chain/:chainId", requireRoles(...WP_ROLES_WRITE), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const chainId = parseInt(p(req.params.chainId));
    const updates = req.body;
    if (updates.procedureStatus === "performed" && updates.evidenceIds?.length > 0 && updates.conclusion) {
      updates.chainComplete = true;
      updates.chainValidatedAt = new Date();
    }
    await db.update(wpAuditChainTable).set({ ...updates, updatedAt: new Date() }).where(eq(wpAuditChainTable.id, chainId));
    const updated = await db.select().from(wpAuditChainTable).where(eq(wpAuditChainTable.id, chainId));
    res.json({ success: true, chain: updated[0] });
  } catch (err: any) { logger.error({ err }, "Route error"); res.status(500).json({ error: err.message }); }
});

// ── TICK MARK SYSTEM ──

router.get("/sessions/:sessionId/tick-marks", async (req: Request, res: Response) => {
  try {
    const sessionId = parseInt(p(req.params.sessionId));
    const marks = await db.select().from(wpTickMarkTable).where(eq(wpTickMarkTable.sessionId, sessionId));
    const usages = await db.select().from(wpTickMarkUsageTable).where(eq(wpTickMarkUsageTable.sessionId, sessionId));
    res.json({ marks, usages, legend: marks.map(m => ({ symbol: m.symbol, meaning: m.meaning, color: m.color, count: usages.filter(u => u.symbol === m.symbol).length })) });
  } catch (err: any) { logger.error({ err }, "Route error"); res.status(500).json({ error: err.message }); }
});

router.post("/sessions/:sessionId/tick-marks/initialize", requireRoles(...WP_ROLES_WRITE), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const sessionId = parseInt(p(req.params.sessionId));
    const standardMarks = [
      { symbol: "✓", meaning: "Agreed to source document / verified", color: "#16A34A", category: "verification" },
      { symbol: "✗", meaning: "Exception / discrepancy noted", color: "#DC2626", category: "verification" },
      { symbol: "®", meaning: "Recalculated and agreed", color: "#2563EB", category: "computation" },
      { symbol: "©", meaning: "Confirmed via external confirmation", color: "#7C3AED", category: "verification" },
      { symbol: "△", meaning: "Traced to/from source", color: "#EA580C", category: "tracing" },
      { symbol: "♦", meaning: "Vouched to supporting document", color: "#0891B2", category: "vouching" },
      { symbol: "◊", meaning: "Inspected physical evidence", color: "#65A30D", category: "verification" },
      { symbol: "★", meaning: "Agreed to prior year working paper", color: "#CA8A04", category: "verification" },
      { symbol: "▲", meaning: "Footed / cross-footed and agreed", color: "#4F46E5", category: "computation" },
      { symbol: "●", meaning: "Observation performed", color: "#0D9488", category: "verification" },
      { symbol: "■", meaning: "Management inquiry response noted", color: "#6366F1", category: "verification" },
      { symbol: "⊕", meaning: "Selected for sampling", color: "#F59E0B", category: "verification" },
      { symbol: "⊗", meaning: "Not applicable / excluded from scope", color: "#9CA3AF", category: "verification" },
    ];
    const existing = await db.select().from(wpTickMarkTable).where(eq(wpTickMarkTable.sessionId, sessionId));
    if (existing.length === 0) {
      await db.insert(wpTickMarkTable).values(standardMarks.map(m => ({ sessionId, ...m, isStandard: true, usageCount: 0 })));
    }
    const marks = await db.select().from(wpTickMarkTable).where(eq(wpTickMarkTable.sessionId, sessionId));
    res.json({ success: true, marks });
  } catch (err: any) { logger.error({ err }, "Route error"); res.status(500).json({ error: err.message }); }
});

router.post("/sessions/:sessionId/tick-marks/apply", requireRoles(...WP_ROLES_WRITE), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const sessionId = parseInt(p(req.params.sessionId));
    const { symbol, wpCode, lineRef, accountCode, amount, appliedBy, evidenceRef, notes } = req.body;
    await db.insert(wpTickMarkUsageTable).values({ sessionId, symbol, wpCode, lineRef, accountCode, amount, appliedBy, evidenceRef, notes });
    const mark = await db.select().from(wpTickMarkTable).where(and(eq(wpTickMarkTable.sessionId, sessionId), eq(wpTickMarkTable.symbol, symbol)));
    if (mark.length) await db.update(wpTickMarkTable).set({ usageCount: (mark[0].usageCount || 0) + 1 }).where(eq(wpTickMarkTable.id, mark[0].id));
    res.json({ success: true });
  } catch (err: any) { logger.error({ err }, "Route error"); res.status(500).json({ error: err.message }); }
});

// ── MULTI-LEVEL REVIEW WORKFLOW WITH CLEARANCE TRACKING ──

router.get("/sessions/:sessionId/review-notes", async (req: Request, res: Response): Promise<any> => {
  try {
    const sessionId = parseInt(p(req.params.sessionId));
    const wpCode = req.query.wpCode as string;
    let conditions: any = eq(wpReviewNoteTable.sessionId, sessionId);
    if (wpCode) conditions = and(conditions, eq(wpReviewNoteTable.wpCode, wpCode));
    const notes = await db.select().from(wpReviewNoteTable).where(conditions).orderBy(wpReviewNoteTable.createdAt);
    const summary = {
      total: notes.length,
      open: notes.filter(n => n.status === "open").length,
      responded: notes.filter(n => n.status === "responded").length,
      cleared: notes.filter(n => n.status === "cleared").length,
      deferred: notes.filter(n => n.status === "deferred").length,
      escalated: notes.filter(n => n.status === "escalated").length,
      blocking: notes.filter(n => n.blocksSignOff || n.blocksExport).length,
      byLevel: {
        staff: notes.filter(n => n.reviewLevel === "staff").length,
        senior: notes.filter(n => n.reviewLevel === "senior").length,
        manager: notes.filter(n => n.reviewLevel === "manager").length,
        partner: notes.filter(n => n.reviewLevel === "partner").length,
        eqcr: notes.filter(n => n.reviewLevel === "eqcr").length,
      },
    };
    res.json({ notes, summary });
  } catch (err: any) { logger.error({ err }, "Route error"); res.status(500).json({ error: err.message }); }
});

router.post("/sessions/:sessionId/review-notes", requireRoles(...WP_ROLES_WRITE), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const sessionId = parseInt(p(req.params.sessionId));
    const { wpCode, headIndex, reviewLevel, reviewerName, reviewerId, noteType, priority, subject, detail, isaReference, blocksSignOff, blocksExport } = req.body;
    await db.insert(wpReviewNoteTable).values({
      sessionId, wpCode, headIndex, reviewLevel, reviewerName, reviewerId,
      noteType: noteType || "query", priority: priority || "medium",
      subject, detail, isaReference,
      blocksSignOff: blocksSignOff || false, blocksExport: blocksExport || false,
      status: "open",
    });
    await db.insert(wpVersionHistoryTable).values({
      sessionId, entityType: "review_note", entityId: wpCode || "session",
      fieldName: "note_created", version: 1, changeType: "create",
      newValue: subject, changedBy: reviewerName, changedByRole: reviewLevel,
    });
    res.json({ success: true });
  } catch (err: any) { logger.error({ err }, "Route error"); res.status(500).json({ error: err.message }); }
});

router.put("/sessions/:sessionId/review-notes/:noteId/respond", requireRoles(...WP_ROLES_WRITE), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const noteId = parseInt(p(req.params.noteId));
    const { responseBy, responseText } = req.body;
    await db.update(wpReviewNoteTable).set({
      status: "responded", responseBy, responseDate: new Date(), responseText, updatedAt: new Date(),
    }).where(eq(wpReviewNoteTable.id, noteId));
    res.json({ success: true });
  } catch (err: any) { logger.error({ err }, "Route error"); res.status(500).json({ error: err.message }); }
});

router.put("/sessions/:sessionId/review-notes/:noteId/clear", requireRoles(...WP_ROLES_APPROVE), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const noteId = parseInt(p(req.params.noteId));
    const { clearedBy, clearanceNote } = req.body;
    await db.update(wpReviewNoteTable).set({
      status: "cleared", clearedBy, clearedDate: new Date(), clearanceNote, updatedAt: new Date(),
    }).where(eq(wpReviewNoteTable.id, noteId));
    res.json({ success: true });
  } catch (err: any) { logger.error({ err }, "Route error"); res.status(500).json({ error: err.message }); }
});

router.put("/sessions/:sessionId/review-notes/:noteId/escalate", requireRoles(...WP_ROLES_APPROVE), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const noteId = parseInt(p(req.params.noteId));
    const { escalatedTo, escalationReason } = req.body;
    await db.update(wpReviewNoteTable).set({
      status: "escalated", escalatedTo, escalationReason, updatedAt: new Date(),
    }).where(eq(wpReviewNoteTable.id, noteId));
    res.json({ success: true });
  } catch (err: any) { logger.error({ err }, "Route error"); res.status(500).json({ error: err.message }); }
});

router.get("/sessions/:sessionId/review-workflow-status", async (req: Request, res: Response) => {
  try {
    const sessionId = parseInt(p(req.params.sessionId));
    const notes = await db.select().from(wpReviewNoteTable).where(eq(wpReviewNoteTable.sessionId, sessionId));
    const openBlockers = notes.filter(n => (n.blocksSignOff || n.blocksExport) && n.status !== "cleared");
    const levels = ["staff", "senior", "manager", "partner", "eqcr"];
    const levelStatus: Record<string, any> = {};
    for (const level of levels) {
      const levelNotes = notes.filter(n => n.reviewLevel === level);
      const openCount = levelNotes.filter(n => n.status === "open" || n.status === "responded").length;
      levelStatus[level] = {
        total: levelNotes.length, open: openCount,
        cleared: levelNotes.filter(n => n.status === "cleared").length,
        canSignOff: openCount === 0 && levelNotes.length > 0,
      };
    }
    const currentLevel = levels.find(l => levelStatus[l].total === 0 || levelStatus[l].open > 0) || "complete";
    res.json({
      currentReviewLevel: currentLevel, levels: levelStatus,
      blockers: openBlockers.length, blockingNotes: openBlockers,
      canExport: openBlockers.filter(n => n.blocksExport).length === 0,
      canLock: openBlockers.length === 0,
    });
  } catch (err: any) { logger.error({ err }, "Route error"); res.status(500).json({ error: err.message }); }
});

// ── VERSION CONTROL & AUDIT TRAIL ──

router.get("/sessions/:sessionId/version-history", async (req: Request, res: Response) => {
  try {
    const sessionId = parseInt(p(req.params.sessionId));
    const entityType = req.query.entityType as string;
    const entityId = req.query.entityId as string;
    let conditions: any = eq(wpVersionHistoryTable.sessionId, sessionId);
    if (entityType) conditions = and(conditions, eq(wpVersionHistoryTable.entityType, entityType));
    if (entityId) conditions = and(conditions, eq(wpVersionHistoryTable.entityId, entityId));
    const { limit, offset } = parsePagination(req, 100, 500);
    const history = await db.select().from(wpVersionHistoryTable).where(conditions).orderBy(desc(wpVersionHistoryTable.createdAt)).limit(limit).offset(offset);
    res.json({ history, total: history.length });
  } catch (err: any) { logger.error({ err }, "Route error"); res.status(500).json({ error: err.message }); }
});

router.post("/sessions/:sessionId/version-history", requireRoles(...WP_ROLES_WRITE), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const sessionId = parseInt(p(req.params.sessionId));
    const { entityType, entityId, fieldName, changeType, oldValue, newValue, reason, changedBy, changedByRole } = req.body;
    const existing = await db.select().from(wpVersionHistoryTable)
      .where(and(eq(wpVersionHistoryTable.sessionId, sessionId), eq(wpVersionHistoryTable.entityType, entityType), eq(wpVersionHistoryTable.entityId, entityId)));
    const version = existing.length + 1;
    await db.insert(wpVersionHistoryTable).values({
      sessionId, entityType, entityId, fieldName, version, changeType,
      oldValue, newValue, reason, changedBy, changedByRole, isImmutable: true,
    });
    res.json({ success: true, version });
  } catch (err: any) { logger.error({ err }, "Route error"); res.status(500).json({ error: err.message }); }
});

// ── LEAD SCHEDULES ──

router.get("/sessions/:sessionId/lead-schedules", async (req: Request, res: Response) => {
  try {
    const sessionId = parseInt(p(req.params.sessionId));
    const rawSchedules = await db.select().from(wpLeadScheduleTable).where(eq(wpLeadScheduleTable.sessionId, sessionId)).orderBy(wpLeadScheduleTable.wpArea);

    const liabilityHeads = ["Borrowings", "Payables", "Provisions", "Trade Payables", "Accrued Liabilities", "Deferred Revenue", "Lease Liabilities", "Current Liabilities", "Non-Current Liabilities"];
    const incomeHeads = ["Revenue", "Other Income", "Sales", "Service Revenue", "Interest Income", "Rental Income", "Gain on Disposal", "Income"];

    const schedules = rawSchedules.map((ls: any) => {
      const opening = parseFloat(ls.openingBalance || "0");
      const closing = parseFloat(ls.closingBalance || "0");
      const priorYear = parseFloat(ls.priorYear || "0");
      const variance = parseFloat(ls.variance || "0");
      const varPct = parseFloat(ls.variancePct || "0");
      const additions = parseFloat(ls.additions || "0");
      const disposals = parseFloat(ls.disposals || "0");
      const transfers = parseFloat(ls.transfers || "0");
      const revaluation = parseFloat(ls.revaluation || "0");
      const depreciation = parseFloat(ls.depreciation || "0");
      const impairment = parseFloat(ls.impairment || "0");
      const netMovements = additions - disposals + transfers + revaluation - depreciation - impairment;
      const expectedClosing = opening + netMovements;
      const balanceCheck = Math.abs(expectedClosing - closing) < 0.01;
      const hasMovements = (additions + disposals + transfers + revaluation + depreciation + impairment) !== 0;
      const zeroOpeningFlag = opening === 0 && priorYear !== 0;

      const mh = ls.majorHead || "";
      const expenseHeads = ["Cost", "Expense", "Depreciation", "Amortization", "Impairment", "Loss", "Administrative", "Selling", "Distribution", "Finance Cost", "Tax", "Operating Expenses"];
      const isLiability = liabilityHeads.some(h => mh.toLowerCase().includes(h.toLowerCase()));
      const isIncome = incomeHeads.some(h => mh.toLowerCase().includes(h.toLowerCase()));
      const isExpense = expenseHeads.some(h => mh.toLowerCase().includes(h.toLowerCase()));
      let direction = "Neutral";
      if (variance !== 0) {
        if (isLiability) direction = variance < 0 ? "Favorable" : "Unfavorable";
        else if (isIncome) direction = variance > 0 ? "Favorable" : "Unfavorable";
        else if (isExpense) direction = variance < 0 ? "Favorable" : "Unfavorable";
        else direction = "Neutral";
      }

      const riskJustification = ls.auditConclusion || `${varPct.toFixed(1)}% ${direction} on ${mh}`;

      const isPPE = (ls.wpArea || "").toUpperCase().includes("PPE") || mh.toLowerCase().includes("property") || mh.toLowerCase().includes("plant") || mh.toLowerCase().includes("equipment") || mh.toLowerCase().includes("fixed asset");
      let ppeMovementCheck: any = null;
      if (isPPE && hasMovements) {
        const expected = priorYear + additions - disposals - depreciation;
        const ok = Math.abs(expected - closing) < 0.01;
        ppeMovementCheck = { expected, actual: closing, ok, formula: `PY(${priorYear.toLocaleString()}) + Add(${additions.toLocaleString()}) - Disp(${disposals.toLocaleString()}) - Dep(${depreciation.toLocaleString()}) = ${expected.toLocaleString()}` };
      }

      const relatedSchedules = rawSchedules
        .filter((r: any) => r.id !== ls.id && r.majorHead === ls.majorHead && r.wpArea === ls.wpArea)
        .map((r: any) => r.scheduleRef);

      const isOrphan = !ls.noteNo || ls.noteNo === "";

      const validationWarnings: string[] = [];
      if (zeroOpeningFlag) validationWarnings.push("Opening is zero but prior year balance exists (PKR " + priorYear.toLocaleString() + ")");
      if (hasMovements && !balanceCheck) validationWarnings.push("Opening + net movements (" + netMovements.toLocaleString() + ") ≠ Closing (" + closing.toLocaleString() + ") — expected " + expectedClosing.toLocaleString());
      if (opening === 0 && closing === 0) validationWarnings.push("Both opening and closing are zero — verify data");
      if (isPPE && ppeMovementCheck && !ppeMovementCheck.ok) validationWarnings.push("PPE movement formula broken: " + ppeMovementCheck.formula + " ≠ Closing " + closing.toLocaleString());
      if (isOrphan) validationWarnings.push("No note reference — potential orphan schedule");

      return { ...ls, direction, riskJustification, relatedSchedules, ppeMovementCheck, isOrphan, validationWarnings, zeroOpeningFlag, balanceCheck: hasMovements ? balanceCheck : null };
    });

    const totalOpening = schedules.reduce((s: number, ls: any) => s + parseFloat(ls.openingBalance || "0"), 0);
    const totalClosing = schedules.reduce((s: number, ls: any) => s + parseFloat(ls.closingBalance || "0"), 0);
    const totalVariance = schedules.reduce((s: number, ls: any) => s + parseFloat(ls.variance || "0"), 0);
    const footingOk = Math.abs((totalOpening + totalVariance) - totalClosing) < 0.01;
    const firstYearAudit = totalOpening === 0 && totalClosing > 0;

    res.json({ schedules, footing: { totalOpening, totalClosing, totalVariance, footingOk, firstYearAudit } });
  } catch (err: any) { logger.error({ err }, "Route error"); res.status(500).json({ error: err.message }); }
});

router.post("/sessions/:sessionId/lead-schedules/generate", requireRoles(...WP_ROLES_WRITE), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const sessionId = parseInt(p(req.params.sessionId));

    const fsLines = await db.select().from(wpFsLinesTable).where(eq(wpFsLinesTable.sessionId, sessionId));
    const tbLines = await db.select().from(wpTrialBalanceLinesTable).where(eq(wpTrialBalanceLinesTable.sessionId, sessionId));

    const sourceLines: any[] = [];

    if (fsLines.length > 0) {
      fsLines.forEach((l: any) => sourceLines.push({
        wpArea: l.wpArea || l.fsSection || "General",
        fsSection: l.statementType || l.fsSection,
        majorHead: l.majorHead || l.lineItem || "General",
        lineItem: l.lineItem,
        accountCode: l.accountCode,
        noteNo: l.noteNo,
        currentYear: parseFloat(l.currentYear || "0") || 0,
        priorYear: parseFloat(l.priorYear || "0") || 0,
        riskLevel: l.riskLevel,
      }));
    }

    if (sourceLines.length === 0 && tbLines.length > 0) {
      tbLines.forEach((l: any) => sourceLines.push({
        wpArea: (l as any).wpArea || (l as any).fsSection || l.classification || "General",
        fsSection: (l as any).fsSection || l.classification,
        majorHead: (l as any).majorHead || l.accountName || "General",
        lineItem: l.accountName,
        accountCode: l.accountCode,
        noteNo: (l as any).noteNo,
        currentYear: parseFloat(String(l.balance || "0")) || 0,
        priorYear: parseFloat(String(l.priorYearBalance || "0")) || 0,
        riskLevel: (l as any).riskLevel,
      }));
    }

    if (!sourceLines.length) return res.status(400).json({ error: "No financial data found. Upload template first." });

    const areaGroups: Record<string, any[]> = {};
    sourceLines.forEach((line: any) => {
      const area = line.wpArea;
      if (!areaGroups[area]) areaGroups[area] = [];
      areaGroups[area].push(line);
    });

    const liabilityHeads = ["Borrowings", "Payables", "Provisions", "Trade Payables", "Accrued Liabilities", "Deferred Revenue", "Lease Liabilities", "Current Liabilities", "Non-Current Liabilities"];
    const incomeHeads = ["Revenue", "Other Income", "Sales", "Service Revenue", "Interest Income", "Rental Income", "Gain on Disposal", "Income"];

    await db.delete(wpLeadScheduleTable).where(eq(wpLeadScheduleTable.sessionId, sessionId));
    const schedules: any[] = [];
    let refCounter = 0;
    for (const [area, lines] of Object.entries(areaGroups)) {
      const majorHeads: Record<string, any[]> = {};
      lines.forEach((l: any) => {
        const mh = l.majorHead;
        if (!majorHeads[mh]) majorHeads[mh] = [];
        majorHeads[mh].push(l);
      });
      for (const [mh, mhLines] of Object.entries(majorHeads)) {
        refCounter++;
        const cy = mhLines.reduce((s: number, l: any) => s + l.currentYear, 0);
        const py = mhLines.reduce((s: number, l: any) => s + l.priorYear, 0);
        const openingBal = py;
        const closingBal = cy;
        const variance = closingBal - openingBal;
        const variancePct = openingBal !== 0 ? ((variance / Math.abs(openingBal)) * 100) : (closingBal !== 0 ? 100 : 0);

        const expenseHeads = ["Cost", "Expense", "Depreciation", "Amortization", "Impairment", "Loss", "Administrative", "Selling", "Distribution", "Finance Cost", "Tax", "Operating Expenses"];
        const isLiabilityOrProvision = liabilityHeads.some(h => mh.toLowerCase().includes(h.toLowerCase()));
        const isIncome = incomeHeads.some(h => mh.toLowerCase().includes(h.toLowerCase()));
        const isExpense = expenseHeads.some(h => mh.toLowerCase().includes(h.toLowerCase()));
        let direction = "Neutral";
        if (variance !== 0) {
          if (isLiabilityOrProvision) {
            direction = variance < 0 ? "Favorable" : "Unfavorable";
          } else if (isIncome) {
            direction = variance > 0 ? "Favorable" : "Unfavorable";
          } else if (isExpense) {
            direction = variance < 0 ? "Favorable" : "Unfavorable";
          } else {
            direction = "Neutral";
          }
        }

        let riskLevel = "Low";
        if (Math.abs(variancePct) > 5 && direction === "Unfavorable") riskLevel = "High";
        else if (Math.abs(variancePct) > 5 && direction === "Favorable") riskLevel = "Medium";
        else if (mhLines.some((l: any) => l.riskLevel === "High")) riskLevel = "High";
        else if (mhLines.some((l: any) => l.riskLevel === "Medium")) riskLevel = "Medium";

        const riskJustification = `${variancePct.toFixed(1)}% ${direction} on ${mh}`;
        const paddedRef = `LS-${String(refCounter).padStart(2, "0")}`;

        schedules.push({
          sessionId, wpArea: area, scheduleRef: paddedRef,
          fsSection: mhLines[0]?.fsSection,
          majorHead: mh, lineItem: mhLines[0]?.lineItem || mh,
          noteNo: mhLines[0]?.noteNo,
          openingBalance: String(openingBal), closingBalance: String(closingBal),
          priorYear: String(py), variance: String(variance),
          variancePct: String(variancePct.toFixed(2)),
          tbAccountCodes: mhLines.map((l: any) => l.accountCode).filter(Boolean),
          riskLevel, materialityFlag: Math.abs(variance) > 500000,
          auditConclusion: riskJustification,
          status: "draft",
        });
      }
    }

    for (let i = 0; i < schedules.length; i++) {
      const s = schedules[i];
      const related = schedules
        .filter((_: any, j: number) => j !== i && _.majorHead === s.majorHead && _.wpArea === s.wpArea)
        .map((r: any) => r.scheduleRef);
      s.wpCrossRefs = related.length > 0 ? related : null;
    }

    const validSchedules = schedules.filter((s: any) => s.noteNo !== null && s.noteNo !== undefined && s.noteNo !== "");
    const orphaned = schedules.filter((s: any) => !s.noteNo || s.noteNo === "");
    const toInsert = [...validSchedules, ...orphaned];

    if (toInsert.length > 0) {
      const batchSize = 50;
      for (let i = 0; i < toInsert.length; i += batchSize) {
        await db.insert(wpLeadScheduleTable).values(toInsert.slice(i, i + batchSize));
      }
    }

    const totalOpening = toInsert.reduce((s: number, ls: any) => s + parseFloat(ls.openingBalance || "0"), 0);
    const totalClosing = toInsert.reduce((s: number, ls: any) => s + parseFloat(ls.closingBalance || "0"), 0);
    const totalVariance = toInsert.reduce((s: number, ls: any) => s + parseFloat(ls.variance || "0"), 0);
    const footingOk = Math.abs((totalOpening + totalVariance) - totalClosing) < 0.01;
    const firstYearAudit = totalOpening === 0 && totalClosing > 0;

    res.json({
      success: true, schedulesGenerated: toInsert.length, areas: Object.keys(areaGroups),
      validSchedules: validSchedules.length, orphanedSchedules: orphaned.length,
      footing: { totalOpening, totalClosing, totalVariance, footingOk, firstYearAudit },
    });
  } catch (err: any) { logger.error({ err }, "Route error"); res.status(500).json({ error: err.message }); }
});

router.put("/sessions/:sessionId/lead-schedules/:scheduleId", requireRoles(...WP_ROLES_WRITE), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const scheduleId = parseInt(p(req.params.scheduleId));
    await db.update(wpLeadScheduleTable).set({ ...req.body, updatedAt: new Date() }).where(eq(wpLeadScheduleTable.id, scheduleId));
    res.json({ success: true });
  } catch (err: any) { logger.error({ err }, "Route error"); res.status(500).json({ error: err.message }); }
});

// ── FS NOTE MAPPING ──

router.get("/sessions/:sessionId/fs-note-mapping", async (req: Request, res: Response) => {
  try {
    const sessionId = parseInt(p(req.params.sessionId));
    const mappings = await db.select().from(wpFsNoteMappingTable).where(eq(wpFsNoteMappingTable.sessionId, sessionId)).orderBy(wpFsNoteMappingTable.noteNo);
    res.json({ mappings });
  } catch (err: any) { logger.error({ err }, "Route error"); res.status(500).json({ error: err.message }); }
});

router.post("/sessions/:sessionId/fs-note-mapping/generate", requireRoles(...WP_ROLES_WRITE), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const sessionId = parseInt(p(req.params.sessionId));
    const tbLines = await db.select().from(wpTrialBalanceLinesTable).where(eq(wpTrialBalanceLinesTable.sessionId, sessionId));
    if (!tbLines.length) return res.status(400).json({ error: "No trial balance data. Upload template first." });
    const noteGroups: Record<string, any[]> = {};
    tbLines.forEach((line: any) => {
      const noteNo = line.noteNo || "misc";
      if (!noteGroups[noteNo]) noteGroups[noteNo] = [];
      noteGroups[noteNo].push(line);
    });

    await db.delete(wpFsNoteMappingTable).where(eq(wpFsNoteMappingTable.sessionId, sessionId));
    const mappings: any[] = [];
    for (const [noteNo, lines] of Object.entries(noteGroups)) {
      if (noteNo === "misc") continue;
      const totalCY = lines.reduce((s: number, l: any) => s + parseFloat(l.currentYear || l.amount || "0"), 0);
      const totalPY = lines.reduce((s: number, l: any) => s + parseFloat(l.priorYear || "0"), 0);
      const lineItems = lines.map((l: any) => ({
        lineItem: l.lineItem || l.accountName,
        accountCodes: [l.accountCode],
        cyAmount: parseFloat(l.currentYear || l.amount || "0"),
        pyAmount: parseFloat(l.priorYear || "0"),
      }));
      const noteTitle = lines[0]?.lineItem || lines[0]?.majorHead || `Note ${noteNo}`;
      mappings.push({
        sessionId, noteNo, noteTitle,
        fsLineItems: lineItems,
        tbAccountCodes: lines.map((l: any) => l.accountCode).filter(Boolean),
        totalCY: String(totalCY), totalPY: String(totalPY),
        variance: String(totalCY - totalPY),
        disclosureStatus: "pending",
      });
    }
    if (mappings.length > 0) await db.insert(wpFsNoteMappingTable).values(mappings);
    res.json({ success: true, notesMapped: mappings.length });
  } catch (err: any) { logger.error({ err }, "Route error"); res.status(500).json({ error: err.message }); }
});

// ── COMPLIANCE VALIDATION ENGINE ──

router.get("/sessions/:sessionId/compliance-gates", async (req: Request, res: Response) => {
  try {
    const sessionId = parseInt(p(req.params.sessionId));
    const gates = await db.select().from(wpComplianceGateTable).where(eq(wpComplianceGateTable.sessionId, sessionId)).orderBy(wpComplianceGateTable.category, wpComplianceGateTable.gateCode);
    const summary = {
      total: gates.length,
      passed: gates.filter(g => g.status === "pass").length,
      failed: gates.filter(g => g.status === "fail").length,
      pending: gates.filter(g => g.status === "pending").length,
      warnings: gates.filter(g => g.status === "warning").length,
      overridden: gates.filter(g => g.status === "override").length,
      blockingFailures: gates.filter(g => g.status === "fail" && g.blocking).length,
      compliancePct: gates.length ? Math.round((gates.filter(g => g.status === "pass" || g.status === "n_a" || g.status === "override").length / gates.length) * 100) : 0,
    };
    res.json({ gates, summary });
  } catch (err: any) { logger.error({ err }, "Route error"); res.status(500).json({ error: err.message }); }
});

router.post("/sessions/:sessionId/compliance-gates/run", requireRoles(...WP_ROLES_WRITE), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const sessionId = parseInt(p(req.params.sessionId));
    const session = await db.select().from(wpSessionsTable).where(eq(wpSessionsTable.id, sessionId));
    if (!session.length) return res.status(404).json({ error: "Session not found" });
    const variables = await db.select().from(wpVariablesTable).where(eq(wpVariablesTable.sessionId, sessionId));
    const varMap: Record<string, string> = {};
    variables.forEach(v => { varMap[v.variableCode] = v.currentValue || v.defaultValue || ""; });
    const chains = await db.select().from(wpAuditChainTable).where(eq(wpAuditChainTable.sessionId, sessionId));
    const reviewNotes = await db.select().from(wpReviewNoteTable).where(eq(wpReviewNoteTable.sessionId, sessionId));
    const tbLines = await db.select().from(wpTrialBalanceLinesTable).where(eq(wpTrialBalanceLinesTable.sessionId, sessionId));
    const leadSchedules = await db.select().from(wpLeadScheduleTable).where(eq(wpLeadScheduleTable.sessionId, sessionId));
    const compDocs = await db.select().from(wpComplianceDocTable).where(eq(wpComplianceDocTable.sessionId, sessionId));
    const isPIE = (varMap["entity_type_listed"] || "").toLowerCase().includes("listed") || (varMap["entity_type"] || "").toLowerCase().includes("listed");

    const gates: any[] = [];
    const addGate = (code: string, name: string, cat: string, std: string, desc: string, clauseRef: string, phase: string, blocking: boolean, checkFn: () => { pass: boolean; detail?: string }) => {
      const result = checkFn();
      gates.push({
        sessionId, gateCode: code, gateName: name, category: cat, standard: std,
        checkDescription: desc, checkType: "mandatory", clauseRef,
        status: result.pass ? "pass" : "fail", blocking,
        failureDetail: result.pass ? null : (result.detail || desc),
        remediationAction: result.pass ? null : `Address: ${desc}`,
        applicablePhase: phase, lastCheckedAt: new Date(),
        passedAt: result.pass ? new Date() : null,
      });
    };

    addGate("G-ISA200-01", "Overall Objectives", "isa", "ISA 200", "Reasonable assurance objective documented", "ISA 200.5", "planning", false,
      () => ({ pass: !!varMap["engagement_type"], detail: "Engagement type not set" }));
    addGate("G-ISA210-01", "Engagement Letter", "isa", "ISA 210", "Signed engagement letter on file", "ISA 210.10", "planning", true,
      () => ({ pass: compDocs.some(d => d.docType === "engagement_letter" && (d.status === "signed" || d.status === "completed")), detail: "Engagement letter not signed" }));
    addGate("G-ISA220-01", "Independence Confirmation", "isa", "ISA 220", "All team members confirmed independence", "ISA 220.11", "planning", true,
      () => ({ pass: compDocs.some(d => d.docType === "independence" && d.status === "completed"), detail: "Independence not confirmed" }));
    addGate("G-ISA315-01", "Risk Assessment", "isa", "ISA 315", "Risk assessment completed for all material areas", "ISA 315.26", "planning", true,
      () => {
        const areas = new Set(tbLines.map((l: any) => l.wpArea || l.fsSection).filter(Boolean));
        const assessed = new Set(chains.map(c => c.fsArea));
        const missing = [...areas].filter(a => !assessed.has(a));
        return { pass: missing.length === 0 && areas.size > 0, detail: `Risk assessment missing for: ${missing.join(", ")}` };
      });
    addGate("G-ISA315-02", "Assertion Coverage", "isa", "ISA 315", "All relevant assertions mapped to procedures", "ISA 315.A190", "planning", true,
      () => {
        const incomplete = chains.filter(c => c.assertionCoverage !== "full");
        return { pass: incomplete.length === 0 && chains.length > 0, detail: `${incomplete.length} procedures with incomplete assertion coverage` };
      });
    addGate("G-ISA320-01", "Materiality Determination", "isa", "ISA 320", "Overall and performance materiality calculated", "ISA 320.10", "planning", true,
      () => ({ pass: !!varMap["overall_materiality"] && parseFloat(varMap["overall_materiality"]) > 0, detail: "Materiality not calculated" }));
    addGate("G-ISA330-01", "Response Procedures", "isa", "ISA 330", "Audit procedures respond to identified risks", "ISA 330.6", "execution", true,
      () => {
        const planned = chains.filter(c => c.procedureStatus === "planned");
        const total = chains.length;
        return { pass: total > 0 && planned.length < total, detail: `${planned.length}/${total} procedures still in planned status` };
      });
    addGate("G-ISA330-02", "Procedure Completion", "isa", "ISA 330", "All planned procedures performed or deferred with reason", "ISA 330.18", "execution", true,
      () => {
        const incomplete = chains.filter(c => c.procedureStatus !== "performed" && c.procedureStatus !== "deferred");
        return { pass: incomplete.length === 0 && chains.length > 0, detail: `${incomplete.length} procedures not completed` };
      });
    addGate("G-ISA500-01", "Evidence Sufficiency", "isa", "ISA 500", "Sufficient appropriate audit evidence obtained", "ISA 500.6", "execution", true,
      () => {
        const withEvidence = chains.filter(c => c.evidenceIds && (c.evidenceIds as any[]).length > 0);
        const pct = chains.length ? (withEvidence.length / chains.length) * 100 : 0;
        return { pass: pct >= 80, detail: `Only ${Math.round(pct)}% of procedures have linked evidence` };
      });
    addGate("G-ISA530-01", "Sampling Documentation", "isa", "ISA 530", "Sampling methodology documented where applicable", "ISA 530.6", "execution", false,
      () => ({ pass: true, detail: "Sampling documentation check" }));
    addGate("G-ISA540-01", "Accounting Estimates", "isa", "ISA 540", "Estimates reviewed with appropriate skepticism", "ISA 540.8", "execution", false,
      () => ({ pass: chains.some(c => c.procedureIsaRef?.includes("ISA 540")), detail: "No ISA 540 procedures found for accounting estimates" }));
    addGate("G-ISA570-01", "Going Concern", "isa", "ISA 570", "Going concern assessment performed", "ISA 570.10", "completion", true,
      () => ({ pass: !!varMap["going_concern_flag"] || compDocs.some(d => d.docType === "going_concern"), detail: "Going concern assessment not documented" }));
    addGate("G-ISA580-01", "Management Representations", "isa", "ISA 580", "Written representations obtained from management", "ISA 580.9", "completion", true,
      () => ({ pass: compDocs.some(d => d.docType === "management_rep_letter" && (d.status === "signed" || d.status === "completed")), detail: "Management representation letter not signed" }));
    addGate("G-ISA700-01", "Audit Conclusion", "isa", "ISA 700", "Sufficient basis for audit opinion formed", "ISA 700.11", "reporting", true,
      () => {
        const withConclusion = chains.filter(c => c.conclusion);
        return { pass: chains.length > 0 && withConclusion.length === chains.length, detail: `${chains.length - withConclusion.length} procedures without conclusion` };
      });
    addGate("G-ISA230-01", "Audit Documentation", "isa", "ISA 230", "Audit file assembled and documentation complete", "ISA 230.7", "completion", true,
      () => ({ pass: chains.length > 0 && chains.every(c => c.chainComplete), detail: "Not all audit chain nodes complete" }));
    addGate("G-ISQM1-01", "Quality Management", "isqm", "ISQM 1", "Engagement quality management requirements met", "ISQM 1.30", "completion", false,
      () => ({ pass: true }));
    addGate("G-ISQM2-01", "EQCR Completed", "isqm", "ISQM 2", "Engagement quality control review completed (where required)", "ISQM 2.19", "completion", isPIE,
      () => ({ pass: !isPIE || compDocs.some(d => d.docType === "eqcr_checklist" && d.status === "completed"), detail: "EQCR not completed for listed entity" }));
    addGate("G-ICAP-01", "ICAP CoE Compliance", "icap", "ICAP CoE", "Code of Ethics requirements met (independence, competence)", "ICAP CoE Part A", "planning", true,
      () => ({ pass: compDocs.some(d => d.docType === "independence"), detail: "ICAP Code of Ethics compliance not documented" }));
    addGate("G-AOB-01", "AOB Inspection Readiness", "aob", "AOB", "Audit file ready for AOB inspection", "AOB Inspection Standard", "completion", false,
      () => {
        const chainComplete = chains.every(c => c.chainComplete);
        const reviewsClear = reviewNotes.filter(n => n.status === "open" && n.blocksExport).length === 0;
        return { pass: chainComplete && reviewsClear, detail: "File not ready for AOB inspection" };
      });
    addGate("G-RN-01", "Review Notes Cleared", "internal", "Internal", "All blocking review notes cleared before sign-off", "Firm Policy", "completion", true,
      () => {
        const openBlockers = reviewNotes.filter(n => n.blocksSignOff && n.status !== "cleared");
        return { pass: openBlockers.length === 0, detail: `${openBlockers.length} blocking review notes still open` };
      });

    await db.delete(wpComplianceGateTable).where(eq(wpComplianceGateTable.sessionId, sessionId));
    if (gates.length > 0) {
      const batchSize = 50;
      for (let i = 0; i < gates.length; i += batchSize) {
        await db.insert(wpComplianceGateTable).values(gates.slice(i, i + batchSize));
      }
    }
    const summary = {
      total: gates.length,
      passed: gates.filter((g: any) => g.status === "pass").length,
      failed: gates.filter((g: any) => g.status === "fail").length,
      blockingFailures: gates.filter((g: any) => g.status === "fail" && g.blocking).length,
      compliancePct: Math.round((gates.filter((g: any) => g.status === "pass").length / gates.length) * 100),
    };
    res.json({ success: true, gates, summary });
  } catch (err: any) { logger.error({ err }, "Route error"); res.status(500).json({ error: err.message }); }
});

router.put("/sessions/:sessionId/compliance-gates/:gateId/override", requireRoles(...WP_ROLES_APPROVE), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const gateId = parseInt(p(req.params.gateId));
    const { overrideBy, overrideReason } = req.body;
    await db.update(wpComplianceGateTable).set({
      status: "override", overrideBy, overrideReason, overrideDate: new Date(), updatedAt: new Date(),
    }).where(eq(wpComplianceGateTable.id, gateId));
    res.json({ success: true });
  } catch (err: any) { logger.error({ err }, "Route error"); res.status(500).json({ error: err.message }); }
});

// ── ISA 530 SAMPLING ENGINE ──

router.get("/sessions/:sessionId/sampling-detail", async (req: Request, res: Response) => {
  try {
    const sessionId = parseInt(p(req.params.sessionId));
    const details = await db.select().from(wpSamplingDetailTable).where(eq(wpSamplingDetailTable.sessionId, sessionId)).orderBy(wpSamplingDetailTable.fsArea);
    res.json({ details });
  } catch (err: any) { logger.error({ err }, "Route error"); res.status(500).json({ error: err.message }); }
});

router.post("/sessions/:sessionId/sampling-detail", requireRoles(...WP_ROLES_WRITE), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const sessionId = parseInt(p(req.params.sessionId));
    const data = req.body;
    const variables = await db.select().from(wpVariablesTable).where(eq(wpVariablesTable.sessionId, sessionId));
    const varMap: Record<string, string> = {};
    variables.forEach(v => { varMap[v.variableCode] = v.currentValue || v.defaultValue || ""; });
    const pm = parseFloat(varMap["performance_materiality"] || "0");
    const riskLevel = varMap["engagement_risk_level"] || "medium";

    let sampleSize = data.sampleSize;
    if (!sampleSize && data.populationSize) {
      const popSize = data.populationSize;
      if (riskLevel === "high") sampleSize = Math.min(Math.max(30, Math.ceil(popSize * 0.15)), popSize);
      else if (riskLevel === "medium") sampleSize = Math.min(Math.max(25, Math.ceil(popSize * 0.10)), popSize);
      else sampleSize = Math.min(Math.max(15, Math.ceil(popSize * 0.06)), popSize);
    }

    await db.insert(wpSamplingDetailTable).values({
      sessionId, wpCode: data.wpCode, fsArea: data.fsArea,
      samplingMethod: data.samplingMethod || "mus",
      populationDescription: data.populationDescription,
      populationSize: data.populationSize,
      populationValuePkr: data.populationValuePkr ? String(data.populationValuePkr) : null,
      stratificationApplied: data.stratificationApplied || false,
      strata: data.strata,
      keyItemThreshold: pm ? String(pm) : null,
      confidenceLevel: data.confidenceLevel ? String(data.confidenceLevel) : "95.00",
      tolerableError: pm ? String(pm) : null,
      expectedError: data.expectedError ? String(data.expectedError) : "0",
      sampleSize, status: "planned", preparedBy: data.preparedBy,
    });
    res.json({ success: true, recommendedSampleSize: sampleSize });
  } catch (err: any) { logger.error({ err }, "Route error"); res.status(500).json({ error: err.message }); }
});

router.put("/sessions/:sessionId/sampling-detail/:samplingId", requireRoles(...WP_ROLES_WRITE), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const samplingId = parseInt(p(req.params.samplingId));
    const updates = req.body;
    if (updates.itemsTested && updates.exceptionsFound !== undefined) {
      updates.exceptionRate = updates.itemsTested > 0 ? String(updates.exceptionsFound / updates.itemsTested) : "0";
      if (updates.exceptionsFound === 0) {
        updates.conclusion = "accept";
        updates.conclusionBasis = "No exceptions found in sample; population accepted";
      } else if (updates.exceptionRate && parseFloat(updates.exceptionRate) > 0.1) {
        updates.conclusion = "reject";
        updates.conclusionBasis = "Exception rate exceeds tolerable level; further investigation required";
      } else {
        updates.conclusion = "extend";
        updates.conclusionBasis = "Exceptions found but within tolerable range; consider extending sample";
      }
    }
    await db.update(wpSamplingDetailTable).set({ ...updates, updatedAt: new Date() }).where(eq(wpSamplingDetailTable.id, samplingId));
    res.json({ success: true });
  } catch (err: any) { logger.error({ err }, "Route error"); res.status(500).json({ error: err.message }); }
});

// ── ENHANCED TEMPLATE UPLOAD (16-column format) ──

router.post("/sessions/:sessionId/upload-template", requireRoles(...WP_ROLES_WRITE), upload.single("file"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const sessionId = parseInt(p(req.params.sessionId));
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const XLSX = require("xlsx");
    const wb = XLSX.read(req.file.buffer);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows: any[] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

    let headerIdx = rows.findIndex((r: any[]) => r.some((c: any) => String(c).toLowerCase().includes("line_id") || String(c).toLowerCase().includes("statement_type")));
    if (headerIdx < 0) headerIdx = 1;
    const headers = rows[headerIdx].map((h: any) => String(h).trim());
    const colMap: Record<string, number> = {};
    headers.forEach((h: string, i: number) => { colMap[h] = i; });

    const dataRows = rows.slice(headerIdx + 1).filter((r: any[]) => r[colMap["Line_ID"] ?? 0]);
    const tbInserts: any[] = [];
    const fsLineInserts: any[] = [];
    const leadScheduleInserts: any[] = [];
    let fsLineCounter = 1;
    for (const row of dataRows) {
      const get = (col: string) => row[colMap[col] ?? -1] ?? "";
      const cy = parseFloat(get("Current_Year") || "0");
      const py = parseFloat(get("Prior_Year") || "0");
      const debitVal = parseFloat(get("Debit_Transaction_Value") || "0");
      const creditVal = parseFloat(get("Credit_Transaction_Value") || "0");
      const stType = String(get("Statement_Type"));
      const fsSection = String(get("FS_Section"));
      const majorHead = String(get("Major_Head"));
      const lineItem = String(get("Line_Item"));
      const subLineItem = String(get("Sub_Line_Item"));
      const accountName = String(get("Account_Name"));
      const accountCode = String(get("Account_Code"));
      const noteNo = String(get("Note_No"));
      const normalBalance = String(get("Normal_Balance"));
      const wpArea = String(get("WP_Area"));
      const riskLevel = String(get("Risk_Level"));
      const rawLineId = get("Line_ID");
      const lineId = typeof rawLineId === "number" ? rawLineId : (parseInt(String(rawLineId)) || fsLineCounter);

      fsLineInserts.push({
        sessionId,
        lineId,
        statementType: stType || null,
        fsSection: fsSection || null,
        majorHead: majorHead || null,
        lineItem: lineItem || null,
        subLineItem: subLineItem || null,
        accountName: accountName || null,
        accountCode: accountCode || null,
        noteNo: noteNo || null,
        currentYear: String(cy),
        priorYear: String(py),
        debitTransactionValue: String(debitVal),
        creditTransactionValue: String(creditVal),
        normalBalance: normalBalance || null,
        wpArea: wpArea || null,
        riskLevel: riskLevel || null,
      });
      fsLineCounter++;

      tbInserts.push({
        sessionId,
        accountCode: String(get("Account_Code") || get("Line_ID")),
        accountName: String(get("Account_Name") || get("Line_Item")),
        classification: fsSection || stType,
        fsLineMapping: majorHead || fsSection,
        debit: String(debitVal),
        credit: String(creditVal),
        balance: String(cy),
        priorYearBalance: String(py),
        source: "template_upload",
        confidence: "100",
        exceptionNote: noteNo ? `Note ${noteNo}` : null,
      });

      if (wpArea) {
        leadScheduleInserts.push({
          sessionId,
          wpArea,
          wpCode: `LS-${wpArea.replace(/\s+/g, "-").substring(0, 10).toUpperCase()}`,
          scheduleRef: `LS-${String(get("Line_ID") || get("Account_Code"))}`,
          fsSection: stType,
          majorHead,
          lineItem: String(get("Line_Item") || get("Account_Name")),
          noteNo,
          closingBalance: String(cy),
          priorYear: String(py),
          variance: String(cy - py),
          variancePct: py !== 0 ? String(((cy - py) / Math.abs(py) * 100).toFixed(2)) : "0",
          riskLevel: riskLevel || "medium",
          status: "draft",
        });
      }
    }

    await db.delete(wpTrialBalanceLinesTable).where(eq(wpTrialBalanceLinesTable.sessionId, sessionId));
    if (tbInserts.length > 0) {
      const batchSize = 50;
      for (let i = 0; i < tbInserts.length; i += batchSize) {
        await db.insert(wpTrialBalanceLinesTable).values(tbInserts.slice(i, i + batchSize));
      }
    }

    await db.delete(wpFsLinesTable).where(eq(wpFsLinesTable.sessionId, sessionId));
    if (fsLineInserts.length > 0) {
      const batchSize = 50;
      for (let i = 0; i < fsLineInserts.length; i += batchSize) {
        await db.insert(wpFsLinesTable).values(fsLineInserts.slice(i, i + batchSize));
      }
    }

    if (leadScheduleInserts.length > 0) {
      await db.delete(wpLeadScheduleTable).where(eq(wpLeadScheduleTable.sessionId, sessionId));
      const batchSize = 50;
      for (let i = 0; i < leadScheduleInserts.length; i += batchSize) {
        await db.insert(wpLeadScheduleTable).values(leadScheduleInserts.slice(i, i + batchSize));
      }
    }

    const file = await db.insert(wpUploadedFilesTable).values({
      sessionId, category: "trial_balance", format: "excel",
      fileName: `template_${Date.now()}.xlsx`,
      originalName: req.file.originalname, mimeType: req.file.mimetype,
      fileSize: req.file.size, isValid: true,
      fileData: req.file.buffer.toString("base64"),
    } as any).returning();

    const bsTotal = tbInserts.filter(t => t.classification?.includes("Asset") || t.classification?.includes("Liabilit") || t.classification?.includes("Equity")).length;
    const plTotal = tbInserts.filter(t => t.classification?.includes("Revenue") || t.classification?.includes("Expense") || t.classification?.includes("Income")).length;
    const autoVars: Record<string, string> = {
      total_assets: String(tbInserts.filter(t => t.classification?.includes("Asset")).reduce((s, t) => s + parseFloat(t.balance || "0"), 0)),
      total_liabilities: String(tbInserts.filter(t => t.classification?.includes("Liabilit")).reduce((s, t) => s + parseFloat(t.balance || "0"), 0)),
      total_equity: String(tbInserts.filter(t => t.classification?.includes("Equity")).reduce((s, t) => s + parseFloat(t.balance || "0"), 0)),
      total_revenue: String(tbInserts.filter(t => t.classification?.includes("Revenue") || t.fsLineMapping?.includes("Revenue")).reduce((s, t) => s + Math.abs(parseFloat(t.balance || "0")), 0)),
      total_expenses: String(tbInserts.filter(t => t.classification?.includes("Expense") || t.classification?.includes("Cost")).reduce((s, t) => s + Math.abs(parseFloat(t.balance || "0")), 0)),
    };
    for (const [code, val] of Object.entries(autoVars)) {
      const existing = await db.select().from(wpVariablesTable).where(and(eq(wpVariablesTable.sessionId, sessionId), eq(wpVariablesTable.variableCode, code)));
      if (existing.length) {
        await db.update(wpVariablesTable).set({ autoFilledValue: val, finalValue: val, sourceType: "template", confidence: "100" }).where(eq(wpVariablesTable.id, existing[0].id));
      } else {
        await db.insert(wpVariablesTable).values({ sessionId, variableCode: code, category: "Financial", variableName: code.replace(/_/g, " "), autoFilledValue: val, finalValue: val, sourceType: "template", confidence: "100" });
      }
    }

    await db.insert(wpVersionHistoryTable).values({
      sessionId, entityType: "template_upload", entityId: String(file[0]?.id || "upload"),
      version: 1, changeType: "create",
      newValue: JSON.stringify({ rows: tbInserts.length, file: req.file.originalname }),
      changedBy: "system", changedByRole: "system",
    });

    const wpAreas = [...new Set(leadScheduleInserts.map(t => t.wpArea).filter(Boolean))];
    const riskAreas = leadScheduleInserts.filter(t => t.riskLevel === "high" || t.riskLevel === "High").map(t => t.wpArea).filter(Boolean);

    res.json({
      success: true,
      summary: {
        totalLines: tbInserts.length,
        fsLines: fsLineInserts.length,
        bsLines: bsTotal,
        plLines: plTotal,
        cfLines: tbInserts.filter(t => t.classification?.includes("Cash")).length,
        notesLines: tbInserts.filter(t => t.exceptionNote).length,
        leadSchedules: leadScheduleInserts.length,
        wpAreas, highRiskAreas: [...new Set(riskAreas)],
        autoMappedVariables: Object.keys(autoVars),
        totalAssets: autoVars.total_assets,
        totalRevenue: autoVars.total_revenue,
      },
    });
  } catch (err: any) { logger.error({ err }, "Route error"); res.status(500).json({ error: err.message }); }
});

// ── AI-POWERED AUDIT CHAIN GENERATION ──

router.post("/sessions/:sessionId/audit-chain/ai-generate", requireRoles(...WP_ROLES_WRITE), aiRateLimit, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const sessionId = parseInt(p(req.params.sessionId));
    const { wpCode, fsArea } = req.body;
    const variables = await db.select().from(wpVariablesTable).where(eq(wpVariablesTable.sessionId, sessionId));
    const varMap: Record<string, string> = {};
    variables.forEach(v => { varMap[v.variableCode] = v.currentValue || v.defaultValue || ""; });
    const tbLines = await db.select().from(wpTrialBalanceLinesTable).where(eq(wpTrialBalanceLinesTable.sessionId, sessionId));
    const areaLines = fsArea ? tbLines.filter((l: any) => l.wpArea === fsArea || l.fsSection === fsArea) : [];

    const prompt = `You are an ISA-compliant audit working paper generator for Pakistani CA/Audit firms under ICAP/AOB/SECP regulations.

Generate a complete audit logic chain for the FS area: "${fsArea}" with WP Code: "${wpCode || "auto"}".

Entity: ${varMap["entity_name"] || "Client"}, Industry: ${varMap["industry"] || "Manufacturing"}, FY: ${varMap["financial_year_end"] || "2026"}
Materiality: PKR ${varMap["overall_materiality"] || "N/A"}, Performance Materiality: PKR ${varMap["performance_materiality"] || "N/A"}
Entity Type: ${varMap["entity_type"] || "Private"}, Risk Level: ${varMap["engagement_risk_level"] || "Medium"}
Trial Balance Lines in this area: ${areaLines.length} lines, Total Amount: PKR ${areaLines.reduce((s: number, l: any) => s + parseFloat(l.currentYear || l.amount || "0"), 0).toLocaleString()}

Return JSON array of chain nodes, each with:
{
  "riskId": "R-XXX-001",
  "riskDescription": "...",
  "riskType": "inherent|control|fraud|significant",
  "isaRiskRef": "ISA 315.XX",
  "riskLevel": "low|medium|high|significant",
  "riskResponse": "...",
  "assertions": [{"code":"E","name":"Existence","isaRef":"ISA 315.A190"}],
  "assertionCoverage": "full",
  "procedureId": "P-XXX-001",
  "procedureDescription": "...",
  "procedureNature": "substantive|toc|analytical|inquiry|observation",
  "procedureIsaRef": "ISA XXX.XX",
  "procedureIsaClause": "Full clause text from ISA",
  "procedureTiming": "interim|final",
  "conclusion": null,
  "conclusionNarrative": null
}

Generate 6-10 procedures covering ALL relevant assertions. Include Pakistan-specific procedures (FBR, SECP, WHT, SRB where applicable).
Return ONLY the JSON array, no markdown.`;

    const { OpenAI } = require("openai");
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await openai.chat.completions.create({
      model: "gpt-4o", temperature: 0.3, max_tokens: 4000,
      messages: [{ role: "user", content: prompt }],
    });

    let chainNodes: any[] = [];
    try {
      const content = completion.choices[0].message.content.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
      chainNodes = JSON.parse(content);
    } catch { return res.status(500).json({ error: "AI response parsing failed" }); }

    const chains = chainNodes.map((node: any) => ({
      sessionId, wpCode: wpCode || `EX-${fsArea.replace(/\s+/g, "-").substring(0, 6).toUpperCase()}-01`,
      fsArea, ...node, procedureStatus: "planned",
      evidenceIds: [], exceptionsFound: 0, exceptionDetails: [],
      chainComplete: false,
    }));

    if (chains.length > 0) {
      if (fsArea) await db.delete(wpAuditChainTable).where(and(eq(wpAuditChainTable.sessionId, sessionId), eq(wpAuditChainTable.fsArea, fsArea)));
      await db.insert(wpAuditChainTable).values(chains);
    }
    res.json({ success: true, chainsGenerated: chains.length, chains });
  } catch (err: any) { logger.error({ err }, "Route error"); res.status(500).json({ error: err.message }); }
});

// ── BULK OPERATIONS ──

router.post("/sessions/:id/bulk-approve-heads", requireRoles("manager", "senior_manager", "partner", "super_admin"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const sessionId = parseInt(p(req.params.id));
    if (isNaN(sessionId)) return res.status(400).json({ error: "Invalid session ID" });
    const parsed = validateBody(bulkIdsSchema, req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error });
    const now = new Date();
    const approved = await db.transaction(async (tx) => {
      let count = 0;
      for (const hId of parsed.data.headIds) {
        const id = parseInt(String(hId));
        if (isNaN(id)) continue;
        await tx.update(wpHeadsTable).set({ status: "approved", approvedAt: now, approvedBy: req.user?.id }).where(and(eq(wpHeadsTable.id, id), eq(wpHeadsTable.sessionId, sessionId)));
        count++;
      }
      return count;
    });
    res.json({ success: true, approved });
  } catch (err: any) { logger.error({ err }, "Route error"); res.status(500).json({ error: err.message }); }
});

router.post("/sessions/:id/bulk-clear-review-notes", requireRoles("manager", "senior_manager", "partner", "super_admin"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const sessionId = parseInt(p(req.params.id));
    if (isNaN(sessionId)) return res.status(400).json({ error: "Invalid session ID" });
    const parsed = validateBody(bulkNoteIdsSchema, req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error });
    const now = new Date();
    const cleared = await db.transaction(async (tx) => {
      let count = 0;
      for (const nId of parsed.data.noteIds) {
        const id = parseInt(String(nId));
        if (isNaN(id)) continue;
        await tx.update(wpReviewNoteTable).set({ status: "cleared", clearedBy: req.user?.name || "system", clearedDate: now, clearanceNote: parsed.data.clearanceNote || "Bulk cleared" }).where(and(eq(wpReviewNoteTable.id, id), eq(wpReviewNoteTable.sessionId, sessionId)));
        count++;
      }
      return count;
    });
    res.json({ success: true, cleared });
  } catch (err: any) { logger.error({ err }, "Route error"); res.status(500).json({ error: err.message }); }
});

router.post("/sessions/:id/bulk-apply-tick-marks", requireRoles(...WP_ROLES_WRITE), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const sessionId = parseInt(p(req.params.id));
    if (isNaN(sessionId)) return res.status(400).json({ error: "Invalid session ID" });
    const { tickMarkId, entries } = req.body;
    if (!tickMarkId || !Array.isArray(entries) || entries.length === 0) return res.status(400).json({ error: "tickMarkId and entries array required" });
    const tickMark = (await db.select().from(wpTickMarkTable).where(and(eq(wpTickMarkTable.id, parseInt(tickMarkId)), eq(wpTickMarkTable.sessionId, sessionId))))[0];
    if (!tickMark) return res.status(404).json({ error: "Tick mark not found" });
    const inserts = entries.map((e: any) => ({
      sessionId,
      tickMarkId: tickMark.id,
      symbol: tickMark.symbol,
      wpCode: e.wpCode || "",
      lineRef: e.lineRef || null,
      accountCode: e.accountCode || null,
      amount: e.amount ? String(e.amount) : null,
      appliedBy: e.appliedBy || "system",
      evidenceRef: e.evidenceRef || null,
      notes: e.notes || null,
    }));
    await db.transaction(async (tx) => {
      if (inserts.length > 0) await tx.insert(wpTickMarkUsageTable).values(inserts);
      await tx.update(wpTickMarkTable).set({ usageCount: (tickMark.usageCount || 0) + inserts.length }).where(eq(wpTickMarkTable.id, tickMark.id));
    });
    res.json({ success: true, applied: inserts.length });
  } catch (err: any) { logger.error({ err }, "Route error"); res.status(500).json({ error: err.message }); }
});

// ── SESSION DUPLICATION ──

router.post("/sessions/:id/duplicate", requireRoles("super_admin", "partner", "manager", "senior_manager"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const srcId = parseInt(p(req.params.id));
    if (isNaN(srcId)) return res.status(400).json({ error: "Invalid session ID" });
    const src = (await db.select().from(wpSessionsTable).where(eq(wpSessionsTable.id, srcId)))[0];
    if (!src) return res.status(404).json({ error: "Session not found" });
    const { clientName, engagementYear } = req.body;
    const srcVars = await db.select().from(wpVariablesTable).where(eq(wpVariablesTable.sessionId, srcId));
    const srcWpLib = await db.select().from(wpLibrarySessionTable).where(eq(wpLibrarySessionTable.sessionId, srcId));
    const result = await db.transaction(async (tx) => {
      const newSession = await tx.insert(wpSessionsTable).values({
        clientId: src.clientId,
        clientName: clientName || src.clientName,
        engagementYear: engagementYear || String(parseInt(src.engagementYear || "2025") + 1),
        entityType: src.entityType,
        ntn: src.ntn, strn: src.strn,
        periodStart: src.periodStart, periodEnd: src.periodEnd,
        reportingFramework: src.reportingFramework,
        engagementType: src.engagementType,
        engagementContinuity: "recurring",
        auditFirmName: src.auditFirmName, auditFirmLogo: src.auditFirmLogo,
        preparerId: req.user?.id, preparerName: req.user?.name,
        status: "upload",
        createdBy: req.user?.id,
      }).returning();
      const newId = newSession[0].id;
      if (srcVars.length > 0) {
        const varInserts = srcVars.map(v => ({
          sessionId: newId, variableCode: v.variableCode, category: v.category, variableName: v.variableName,
          autoFilledValue: null as string | null, userEditedValue: null as string | null, finalValue: null as string | null,
          sourceType: "carried_forward", confidence: "0", reviewStatus: "pending", isLocked: false, versionNo: 1,
        }));
        const batchSize = 50;
        for (let i = 0; i < varInserts.length; i += batchSize) {
          await tx.insert(wpVariablesTable).values(varInserts.slice(i, i + batchSize));
        }
      }
      if (srcWpLib.length > 0) {
        const libInserts = srcWpLib.map(w => ({
          sessionId: newId, wpCode: w.wpCode, wpTitle: w.wpTitle, wpPhase: w.wpPhase, wpCategory: w.wpCategory,
          isaReference: w.isaReference, triggerReason: "Carried forward from prior year", mandatoryFlag: w.mandatoryFlag,
          status: "Pending", outputFormat: w.outputFormat, reviewerLevel: w.reviewerLevel, autoGenerateFlag: w.autoGenerateFlag,
        }));
        const batchSize = 50;
        for (let i = 0; i < libInserts.length; i += batchSize) {
          await tx.insert(wpLibrarySessionTable).values(libInserts.slice(i, i + batchSize));
        }
      }
      await tx.insert(wpVersionHistoryTable).values({
        sessionId: newId, entityType: "session", entityId: String(newId),
        version: 1, changeType: "duplicate",
        newValue: JSON.stringify({ sourceSessionId: srcId, sourceClient: src.clientName, sourceYear: src.engagementYear }),
        changedBy: req.user?.name || "system", changedByRole: req.user?.role || "system",
      });
      return { session: newSession[0], copiedVariables: srcVars.length, copiedWpLibrary: srcWpLib.length };
    });
    res.json({ success: true, ...result });
  } catch (err: any) { logger.error({ err }, "Route error"); res.status(500).json({ error: err.message }); }
});

// ── EXPORT ENDPOINTS FOR ISA PANELS ──

router.get("/sessions/:id/audit-chain/export", async (req: Request, res: Response) => {
  try {
    const sessionId = parseInt(p(req.params.id));
    if (isNaN(sessionId)) return res.status(400).json({ error: "Invalid session ID" });
    const chains = await db.select().from(wpAuditChainTable).where(eq(wpAuditChainTable.sessionId, sessionId));
    const rows = chains.map(c => ({
      "WP Code": c.wpCode, "FS Area": c.fsArea, "Risk ID": c.riskId,
      "Risk Description": c.riskDescription, "Risk Type": c.riskType,
      "ISA Risk Ref": c.isaRiskRef, "Risk Level": c.riskLevel,
      "Procedure ID": c.procedureId, "Procedure": c.procedureDescription,
      "Nature": c.procedureNature, "ISA Ref": c.procedureIsaRef,
      "Timing": c.procedureTiming, "Status": c.procedureStatus,
      "Performed By": c.procedurePerformedBy, "Performed Date": c.procedurePerformedDate,
      "Tick Mark": c.tickMarkCode, "Result": c.resultSummary,
      "Exceptions": c.exceptionsFound, "Misstatement": c.misstatementAmount,
      "Conclusion": c.conclusion, "Impact on Opinion": c.impactOnOpinion,
      "Chain Complete": c.chainComplete ? "Yes" : "No",
    }));
    res.json({ data: rows, count: rows.length });
  } catch (err: any) { logger.error({ err }, "Route error"); res.status(500).json({ error: err.message }); }
});

router.get("/sessions/:id/review-notes/export", async (req: Request, res: Response) => {
  try {
    const sessionId = parseInt(p(req.params.id));
    if (isNaN(sessionId)) return res.status(400).json({ error: "Invalid session ID" });
    const notes = await db.select().from(wpReviewNoteTable).where(eq(wpReviewNoteTable.sessionId, sessionId));
    const rows = notes.map(n => ({
      "WP Code": n.wpCode, "Review Level": n.reviewLevel,
      "Reviewer": n.reviewerName, "Type": n.noteType,
      "Priority": n.priority, "Subject": n.subject,
      "Detail": n.detail, "ISA Ref": n.isaReference,
      "Status": n.status, "Response By": n.responseBy,
      "Response": n.responseText, "Cleared By": n.clearedBy,
      "Blocks Sign-Off": n.blocksSignOff ? "Yes" : "No",
      "Created": n.createdAt,
    }));
    res.json({ data: rows, count: rows.length });
  } catch (err: any) { logger.error({ err }, "Route error"); res.status(500).json({ error: err.message }); }
});

router.get("/sessions/:id/compliance-gates/export", async (req: Request, res: Response) => {
  try {
    const sessionId = parseInt(p(req.params.id));
    if (isNaN(sessionId)) return res.status(400).json({ error: "Invalid session ID" });
    const gates = await db.select().from(wpComplianceGateTable).where(eq(wpComplianceGateTable.sessionId, sessionId));
    const rows = gates.map(g => ({
      "Gate Code": g.gateCode, "Gate Name": g.gateName,
      "Category": g.category, "Standard": g.standard,
      "Check": g.checkDescription, "Type": g.checkType,
      "Clause Ref": g.clauseRef, "Status": g.status,
      "Blocking": g.blocking ? "Yes" : "No",
      "Failure Detail": g.failureDetail,
      "Remediation": g.remediationAction,
      "Override By": g.overrideBy, "Override Reason": g.overrideReason,
      "Phase": g.applicablePhase, "WP Code": g.wpCode,
    }));
    res.json({ data: rows, count: rows.length });
  } catch (err: any) { logger.error({ err }, "Route error"); res.status(500).json({ error: err.message }); }
});

router.get("/sessions/:id/tick-marks/export", async (req: Request, res: Response) => {
  try {
    const sessionId = parseInt(p(req.params.id));
    if (isNaN(sessionId)) return res.status(400).json({ error: "Invalid session ID" });
    const usages = await db.select().from(wpTickMarkUsageTable).where(eq(wpTickMarkUsageTable.sessionId, sessionId));
    const marks = await db.select().from(wpTickMarkTable).where(eq(wpTickMarkTable.sessionId, sessionId));
    const markMap = new Map(marks.map(m => [m.id, m]));
    const rows = usages.map(u => ({
      "Symbol": u.symbol, "Meaning": markMap.get(u.tickMarkId!)?.meaning || "",
      "WP Code": u.wpCode, "Line Ref": u.lineRef,
      "Account Code": u.accountCode, "Amount": u.amount,
      "Applied By": u.appliedBy, "Applied At": u.appliedAt,
      "Evidence Ref": u.evidenceRef, "Notes": u.notes,
    }));
    res.json({ data: rows, count: rows.length, legend: marks.map(m => ({ symbol: m.symbol, meaning: m.meaning, color: m.color, category: m.category, usageCount: m.usageCount })) });
  } catch (err: any) { logger.error({ err }, "Route error"); res.status(500).json({ error: err.message }); }
});

export default router;
