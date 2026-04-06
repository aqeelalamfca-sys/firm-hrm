import { Router, type Request, type Response } from "express";
import multer from "multer";
import { logger } from "../lib/logger";
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
} from "@workspace/db";
import { WP_LIBRARY, type WpLibraryEntry } from "../data/wp-library-seed";
import { VARIABLE_DEFINITIONS, EXTRACTION_FIELD_TO_VARIABLE_MAP, VARIABLE_GROUPS, DEPENDENCY_RULES } from "../data/variable-definitions";
import {
  runTBEngine, runGLEngine, runReconciliation, checkFinalEnforcement,
  PAKISTAN_COA, mapFsToCoa,
} from "./tb-gl-engine";
import { eq, and, inArray, asc, sql } from "drizzle-orm";
import OpenAI from "openai";
import PDFDocument from "pdfkit";
import * as XLSX from "xlsx";
import ExcelJS from "exceljs";
// @ts-ignore
import pdfParse from "pdf-parse";
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell,
  WidthType, AlignmentType, BorderStyle, ShadingType, PageBreak, Footer,
  type IShadingAttributesProperties,
} from "docx";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 },
});

const AUDIT_HEADS = [
  { index: 0, name: "Trial Balance", outputType: "excel", papers: ["TB-Master", "TB-Mapping", "TB-VS-FS-Recon"] },
  { index: 1, name: "General Ledger", outputType: "excel", papers: ["GL-Summary", "GL-Detail", "Lead-Schedules", "Account-Mapping"] },
  { index: 2, name: "Pre-Planning", outputType: "word", papers: ["A1-Acceptance", "A2-Engagement-Letter", "A3-Independence", "A4-Ethics", "A5-Client-Risk", "A6-KYC-AML"] },
  { index: 3, name: "Trial Balance & GL", outputType: "word+excel", papers: ["B1-TB-Analysis", "B2-TB-Recon", "B3-GL-Review", "B4-Lead-Schedules"] },
  { index: 4, name: "Client Documents", outputType: "word", papers: ["C1-Board-Minutes", "C2-Agreements", "C3-Bank-Confirmations", "C4-Legal-Confirmations", "C5-Tax-Certs"] },
  { index: 5, name: "OB Verification", outputType: "word+excel", papers: ["D1-OB-Verification", "D2-Prior-Year-Review", "D3-OB-Adjustments"] },
  { index: 6, name: "Planning", outputType: "word", papers: ["E1-Understanding-Entity", "E2-Risk-Assessment", "E3-Fraud-Assessment", "E4-Materiality", "E5-Planning-Analytics", "E6-Audit-Strategy", "E7-Audit-Program"] },
  { index: 7, name: "Execution", outputType: "word+excel", papers: ["F1-Assets-Testing", "F2-Liabilities-Testing", "F3-Revenue-Testing", "F4-Expense-Testing", "F5-Tax-Procedures", "F6-Related-Parties", "F7-Estimates", "F8-Going-Concern"] },
  { index: 8, name: "Finalization", outputType: "word", papers: ["G1-Subsequent-Events", "G2-Written-Reps", "G3-Completion-Memo", "G4-Adjustments-Summary"] },
  { index: 9, name: "Deliverables", outputType: "word+pdf", papers: ["H1-Audit-Report", "H2-Management-Letter", "H3-Financial-Statements"] },
  { index: 10, name: "EQCR", outputType: "word", papers: ["I1-EQCR-Checklist", "I2-EQCR-Findings"] },
  { index: 11, name: "Inspection", outputType: "word", papers: ["J1-Inspection-Checklist", "J2-QC-Review"] },
];

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
  if (c >= 90) return "high";
  if (c >= 70) return "review";
  return "low";
}


// ═══════════════════════════════════════════════════════════════════════════
// SESSION MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

router.get("/sessions", async (_req: Request, res: Response) => {
  try {
    const sessions = await db.select().from(wpSessionsTable).orderBy(asc(wpSessionsTable.id));
    res.json(sessions);
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch sessions" });
  }
});

router.post("/upload-logo", upload.single("file"), async (req: Request, res: Response) => {
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

router.post("/sessions", async (req: Request, res: Response) => {
  try {
    const { clientName, engagementYear, entityType, ntn, strn, periodStart, periodEnd, reportingFramework, engagementType, engagementContinuity, auditFirmName, auditFirmLogo, preparerId, preparerName, reviewerId, reviewerName, approverId, approverName } = req.body;
    if (!clientName || !engagementYear || !entityType || !ntn || !periodStart || !periodEnd || !reportingFramework || !engagementType) {
      return res.status(400).json({ error: "All fields are required except STRN, Audit Firm Name, and Logo" });
    }
    const [session] = await db.insert(wpSessionsTable).values({
      clientName, engagementYear,
      entityType,
      ntn,
      strn: strn || null,
      periodStart,
      periodEnd,
      reportingFramework,
      engagementType,
      engagementContinuity: engagementContinuity || "first_time",
      auditFirmName: auditFirmName || null,
      auditFirmLogo: auditFirmLogo || null,
      preparerId: preparerId || null,
      preparerName: preparerName || null,
      reviewerId: reviewerId || null,
      reviewerName: reviewerName || null,
      approverId: approverId || null,
      approverName: approverName || null,
      status: "upload",
    }).returning();

    for (const head of AUDIT_HEADS) {
      await db.insert(wpHeadsTable).values({
        sessionId: session.id,
        headIndex: head.index,
        headName: head.name,
        status: "locked",
        papersIncluded: head.papers,
        outputType: head.outputType,
      });
    }

    res.status(201).json(session);
  } catch (err: any) {
    res.status(500).json({ error: "Failed to create session" });
  }
});

router.get("/sessions/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const sessions = await db.select().from(wpSessionsTable).where(eq(wpSessionsTable.id, id));
    if (!sessions[0]) return res.status(404).json({ error: "Session not found" });
    const heads = await db.select().from(wpHeadsTable).where(eq(wpHeadsTable.sessionId, id)).orderBy(asc(wpHeadsTable.headIndex));
    const files = await db.select().from(wpUploadedFilesTable).where(eq(wpUploadedFilesTable.sessionId, id));
    const exceptions = await db.select().from(wpExceptionLogTable).where(eq(wpExceptionLogTable.sessionId, id));
    const variables = await db.select().from(wpVariablesTable).where(eq(wpVariablesTable.sessionId, id));
    const tbLines = await db.select().from(wpTrialBalanceLinesTable).where(eq(wpTrialBalanceLinesTable.sessionId, id));
    res.json({ ...sessions[0], heads, files, exceptions, variables, tbLines });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch session" });
  }
});

router.patch("/sessions/:id/status", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid session ID" });
    const { status } = req.body;
    const validStatuses = ["upload", "extraction", "data_sheet", "arranged_data", "variables", "generation", "export", "completed"];
    if (!validStatuses.includes(status)) return res.status(400).json({ error: "Invalid status" });

    const validTransitions: Record<string, string[]> = {
      upload: ["extraction"],
      extraction: ["data_sheet", "arranged_data", "upload"],
      data_sheet: ["arranged_data", "variables", "extraction"],
      arranged_data: ["variables", "data_sheet"],
      variables: ["generation"],
      generation: ["export"],
      export: ["completed", "generation"],
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
    res.status(500).json({ error: "Failed to update session status" });
  }
});


// ═══════════════════════════════════════════════════════════════════════════
// FILE UPLOAD WITH STRICT VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

router.post("/sessions/:id/upload", upload.array("files", 20), async (req: Request, res: Response) => {
  try {
    const sessionId = parseInt(req.params.id);
    const files = req.files as Express.Multer.File[] | undefined;
    if (!files || files.length === 0) {
      return res.status(400).json({ error: "No files uploaded" });
    }

    let categories: Record<string, string> = {};
    try { categories = JSON.parse(req.body.categories || "{}"); } catch {}

    const validCategories = ["financial_statements", "trial_balance", "general_ledger", "bank_statement", "sales_tax_return", "tax_notice", "schedule", "annexure", "other"];
    const results: any[] = [];
    const errors: string[] = [];

    for (const file of files) {
      const rawCategory = categories[file.originalname] || "other";
      const category = validCategories.includes(rawCategory) ? rawCategory : "other";
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
    res.status(500).json({ error: "Upload failed" });
  }
});


// ═══════════════════════════════════════════════════════════════════════════
// EXTRACTION — OCR + PARSING
// ═══════════════════════════════════════════════════════════════════════════

router.post("/sessions/:id/extract", async (req: Request, res: Response) => {
  try {
    const sessionId = parseInt(req.params.id);
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
    const sessionId = parseInt(req.params.id);
    const rows = await db.select().from(wpMasterCoaTable)
      .where(eq(wpMasterCoaTable.sessionId, sessionId))
      .orderBy(asc(wpMasterCoaTable.displayOrder));
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch COA data" });
  }
});

router.post("/sessions/:id/coa/populate", async (req: Request, res: Response) => {
  try {
    const sessionId = parseInt(req.params.id);
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
      });
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

    // Clear existing COA for this session and insert new
    await db.delete(wpMasterCoaTable).where(eq(wpMasterCoaTable.sessionId, sessionId));
    const inserted = await db.insert(wpMasterCoaTable).values(rows).returning();

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

router.post("/sessions/:id/coa", async (req: Request, res: Response) => {
  try {
    const sessionId = parseInt(req.params.id);
    const {
      accountCode, parentCode, accountName, fsHead, fsSubHead, accountType, normalBalance,
      industryTag, entityTypeTag, ifrsReference, taxTreatment, isControlAccount, isSubLedger,
      openingBalance, debitTotal, creditTotal, priorYearBalance,
      materialityTag, riskTag, assertionTag, relatedPartyFlag, cashFlowTag,
      mappingGlCode, mappingFsLine, workingPaperCode, reconciliationFlag,
      dataSource, confidenceScore, exceptionFlag, notes,
    } = req.body;

    if (!accountCode || !accountName) return res.status(400).json({ error: "accountCode and accountName are required" });

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
    res.status(500).json({ error: "Failed to add COA row" });
  }
});

router.patch("/sessions/:id/coa/:rowId", async (req: Request, res: Response) => {
  try {
    const rowId = parseInt(req.params.rowId);
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
    res.status(500).json({ error: "Failed to update COA row" });
  }
});

router.delete("/sessions/:id/coa/:rowId", async (req: Request, res: Response) => {
  try {
    const rowId = parseInt(req.params.rowId);
    await db.delete(wpMasterCoaTable).where(eq(wpMasterCoaTable.id, rowId));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to delete COA row" });
  }
});

router.post("/sessions/:id/coa/validate", async (req: Request, res: Response) => {
  try {
    const sessionId = parseInt(req.params.id);
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
    res.status(500).json({ error: "Failed to validate COA" });
  }
});

router.post("/sessions/:id/coa/approve", async (req: Request, res: Response) => {
  try {
    const sessionId = parseInt(req.params.id);
    const rows = await db.select().from(wpMasterCoaTable).where(eq(wpMasterCoaTable.sessionId, sessionId));
    if (rows.length === 0) return res.status(422).json({ error: "No COA data to approve. Populate first." });

    // Advance to arranged_data
    await db.update(wpSessionsTable).set({ status: "arranged_data" as any, updatedAt: new Date() }).where(eq(wpSessionsTable.id, sessionId));
    res.json({ success: true, message: `${rows.length} COA accounts approved. Advanced to Arranged Data.` });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to approve COA" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// ARRANGED DATA
// ═══════════════════════════════════════════════════════════════════════════

router.get("/sessions/:id/arranged-data", async (req: Request, res: Response) => {
  try {
    const sessionId = parseInt(req.params.id);
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
    res.status(500).json({ error: "Failed to fetch arranged data" });
  }
});

router.patch("/sessions/:id/arranged-data/:fieldId", async (req: Request, res: Response) => {
  try {
    const fieldId = parseInt(req.params.fieldId);
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
    res.status(500).json({ error: "Failed to update field" });
  }
});

router.post("/sessions/:id/arranged-data/approve-all", async (req: Request, res: Response) => {
  try {
    const sessionId = parseInt(req.params.id);
    await db.update(wpExtractedFieldsTable).set({ isApproved: true, updatedAt: new Date() }).where(eq(wpExtractedFieldsTable.sessionId, sessionId));
    await db.update(wpSessionsTable).set({ status: "arranged_data", updatedAt: new Date() }).where(eq(wpSessionsTable.id, sessionId));
    res.json({ success: true });
  } catch (err: any) {
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

router.post("/variable-definitions/seed", async (req: Request, res: Response) => {
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

router.post("/sessions/:id/variables/auto-fill", async (req: Request, res: Response) => {
  try {
    const sessionId = parseInt(req.params.id);
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

    const defaultSourceMap: Record<string, string> = {};

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

    for (const def of VARIABLE_DEFINITIONS) {
      const extracted = extractedMap[def.variableCode];
      const existing = existingByCode[def.variableCode];

      if (existing) {
        if (extracted && !existing.userEditedValue && !existing.isLocked) {
          const defaultSrcExisting = defaultSourceMap[def.variableCode];
          const isRealExt = !defaultSrcExisting && Number(extracted.confidence) >= 70;
          const isFormulaExt = defaultSrcExisting === "formula";
          let existingSrcType: string;
          if (isRealExt) existingSrcType = "ai_extraction";
          else if (isFormulaExt) existingSrcType = "formula";
          else if (defaultSrcExisting === "session") existingSrcType = "session";
          else if (defaultSrcExisting === "assumption") existingSrcType = "assumption";
          else existingSrcType = "default";
          const val = extracted.value || existing.finalValue || def.defaultValue || "N/A";
          await db.update(wpVariablesTable).set({
            autoFilledValue: val,
            rawExtractedValue: extracted.value || null,
            finalValue: val,
            confidence: extracted.confidence,
            sourceType: existingSrcType,
            sourceSheet: extracted.sourceSheet || null,
            sourcePage: extracted.sourcePage || null,
            updatedAt: new Date(),
          }).where(eq(wpVariablesTable.id, existing.id));
          updated++;
        } else {
          skipped++;
        }
        continue;
      }

      const value = extracted?.value || def.defaultValue || "N/A";
      const conf = extracted ? extracted.confidence : (def.defaultValue ? "60" : "45");

      const defaultSrc = defaultSourceMap[def.variableCode];
      const isRealExtraction = !!extracted && !defaultSrc && Number(extracted.confidence) >= 70;
      const isFormula = defaultSrc === "formula";
      let srcType: string;
      if (isRealExtraction) {
        srcType = "ai_extraction";
      } else if (isFormula) {
        srcType = "formula";
      } else if (defaultSrc === "session") {
        srcType = "session";
      } else if (defaultSrc === "assumption") {
        srcType = "assumption";
      } else {
        srcType = "default";
      }

      let reviewStatus: string;
      if (def.reviewRequiredFlag) {
        reviewStatus = "needs_review";
      } else {
        reviewStatus = "auto_filled";
      }

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
      }).returning();
      results.push(v);
      created++;
    }

    await db.update(wpSessionsTable).set({ status: "variables" as any, updatedAt: new Date() }).where(eq(wpSessionsTable.id, sessionId));

    const assumptionMandatory = VARIABLE_DEFINITIONS.filter(d => {
      if (!d.mandatoryFlag) return false;
      const ext = extractedMap[d.variableCode];
      const val = ext?.value || d.defaultValue || "";
      const src = defaultSourceMap[d.variableCode];
      return src === "assumption" || val === "N/A" || val === "0" || isAssumptionValue(val);
    });
    for (const mm of assumptionMandatory) {
      const titleKey = `Needs confirmation: ${mm.variableLabel}`;
      const existingException = await db.select().from(wpExceptionLogTable).where(
        and(eq(wpExceptionLogTable.sessionId, sessionId), eq(wpExceptionLogTable.title, titleKey))
      );
      if (existingException.length === 0) {
        const ext = extractedMap[mm.variableCode];
        const isZero = ext?.value === "0" || ext?.value === "N/A";
        await db.insert(wpExceptionLogTable).values({
          sessionId, exceptionType: "needs_confirmation", severity: isZero ? "high" : "medium",
          title: titleKey,
          description: `Mandatory variable ${mm.variableCode} (${mm.variableGroup}) has an assumed/placeholder value "${(ext?.value || "").substring(0, 80)}". Please confirm or update with actual data.`,
          status: "open",
        });
      }
    }

    const lowConfVars = Object.entries(extractedMap).filter(([_, v]) => Number(v.confidence) < 50);
    for (const [code, val] of lowConfVars) {
      const def = VARIABLE_DEFINITIONS.find(d => d.variableCode === code);
      if (def) {
        const existingLowConf = await db.select().from(wpExceptionLogTable).where(
          and(eq(wpExceptionLogTable.sessionId, sessionId), eq(wpExceptionLogTable.title, `Low confidence: ${def.variableLabel}`))
        );
        if (existingLowConf.length === 0) {
          await db.insert(wpExceptionLogTable).values({
            sessionId, exceptionType: "low_confidence", severity: "medium",
            title: `Low confidence: ${def.variableLabel}`,
            description: `Variable ${code} has confidence ${val.confidence}%. Auto-populated with assumed value. Review recommended.`,
            status: "open",
          });
        }
      }
    }

    const assumptionCount = Object.values(defaultSourceMap).filter(s => s === "assumption").length;
    const formulaCount = Object.values(defaultSourceMap).filter(s => s === "formula").length;

    res.json({
      created, updated, skipped, total: VARIABLE_DEFINITIONS.length,
      assumptionCount, formulaCount,
      needsConfirmation: assumptionMandatory.length,
      populationRate: "100%",
      message: `All ${VARIABLE_DEFINITIONS.length} variables populated. ${formulaCount} calculated from financial data. ${assumptionCount} use assumed defaults (flagged for review).`
    });
  } catch (err: any) {
    logger.error({ err }, "Failed to auto-fill variables");
    res.status(500).json({ error: "Failed to auto-fill variables" });
  }
});

router.get("/sessions/:id/variables", async (req: Request, res: Response) => {
  try {
    const sessionId = parseInt(req.params.id);
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

    res.json({ variables, grouped, stats: totalStats, changeLog, groups: VARIABLE_GROUPS });
  } catch (err: any) {
    logger.error({ err }, "Failed to fetch variables");
    res.status(500).json({ error: "Failed to fetch variables" });
  }
});

router.patch("/sessions/:id/variables/:varId", async (req: Request, res: Response) => {
  try {
    const sessionId = parseInt(req.params.id);
    const varId = parseInt(req.params.varId);
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

router.patch("/sessions/:id/variables/:varId/review", async (req: Request, res: Response) => {
  try {
    const sessionId = parseInt(req.params.id);
    const varId = parseInt(req.params.varId);
    if (isNaN(sessionId) || isNaN(varId)) return res.status(400).json({ error: "Invalid ID" });
    const { reviewStatus } = req.body;
    const validStatuses = ["pending", "auto_filled", "needs_review", "reviewed", "confirmed"];
    if (!validStatuses.includes(reviewStatus)) return res.status(400).json({ error: "Invalid review status" });

    const [updated] = await db.update(wpVariablesTable).set({ reviewStatus, updatedAt: new Date() }).where(and(eq(wpVariablesTable.id, varId), eq(wpVariablesTable.sessionId, sessionId))).returning();
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: "Failed to update review status" });
  }
});

router.post("/sessions/:id/variables/review-all", async (req: Request, res: Response) => {
  try {
    const sessionId = parseInt(req.params.id);
    if (isNaN(sessionId)) return res.status(400).json({ error: "Invalid session ID" });

    const vars = await db.select().from(wpVariablesTable).where(and(eq(wpVariablesTable.sessionId, sessionId), eq(wpVariablesTable.isLocked, false)));
    const unreviewedIds = vars.filter(v => v.reviewStatus !== "reviewed" && v.reviewStatus !== "confirmed").map(v => v.id);

    if (unreviewedIds.length === 0) {
      return res.json({ reviewed: 0, message: "All variables already reviewed" });
    }

    await db.update(wpVariablesTable).set({ reviewStatus: "reviewed", updatedAt: new Date() }).where(inArray(wpVariablesTable.id, unreviewedIds));

    res.json({ reviewed: unreviewedIds.length, message: `${unreviewedIds.length} variables marked as reviewed` });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to review all variables" });
  }
});

router.post("/sessions/:id/variables/lock-section", async (req: Request, res: Response) => {
  try {
    const sessionId = parseInt(req.params.id);
    if (isNaN(sessionId)) return res.status(400).json({ error: "Invalid session ID" });
    const { group } = req.body;
    if (!group) return res.status(400).json({ error: "Group name required" });

    const vars = await db.select().from(wpVariablesTable).where(and(eq(wpVariablesTable.sessionId, sessionId), eq(wpVariablesTable.category, group)));

    const mandatoryDefs = VARIABLE_DEFINITIONS.filter(d => d.variableGroup === group && d.mandatoryFlag);
    const missingMandatory = mandatoryDefs.filter(d => {
      const v = vars.find(vr => vr.variableCode === d.variableCode);
      return !v || !v.finalValue;
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
    res.status(500).json({ error: "Failed to lock section" });
  }
});

router.post("/sessions/:id/variables/lock-all", async (req: Request, res: Response) => {
  try {
    const sessionId = parseInt(req.params.id);
    if (isNaN(sessionId)) return res.status(400).json({ error: "Invalid session ID" });

    const vars = await db.select().from(wpVariablesTable).where(eq(wpVariablesTable.sessionId, sessionId));

    const mandatoryDefs = VARIABLE_DEFINITIONS.filter(d => d.mandatoryFlag);
    const missingMandatory = mandatoryDefs.filter(d => {
      const v = vars.find(vr => vr.variableCode === d.variableCode);
      return !v || !v.finalValue;
    });

    if (missingMandatory.length > 0) {
      return res.status(400).json({
        error: "Cannot lock — mandatory variables missing",
        missing: missingMandatory.map(m => ({ code: m.variableCode, label: m.variableLabel, group: m.variableGroup })),
      });
    }

    const needsReview = vars.filter(v => v.reviewStatus === "needs_review");
    if (needsReview.length > 0) {
      return res.status(400).json({
        error: "Cannot lock — variables pending review",
        pendingReview: needsReview.length,
      });
    }

    await db.update(wpVariablesTable).set({ isLocked: true, lockedAt: new Date() }).where(eq(wpVariablesTable.sessionId, sessionId));

    const heads = await db.select().from(wpHeadsTable).where(and(eq(wpHeadsTable.sessionId, sessionId), eq(wpHeadsTable.headIndex, 0)));
    if (heads[0]) {
      await db.update(wpHeadsTable).set({ status: "ready", updatedAt: new Date() }).where(eq(wpHeadsTable.id, heads[0].id));
    }

    await db.update(wpSessionsTable).set({ status: "generation" as any, updatedAt: new Date() }).where(eq(wpSessionsTable.id, sessionId));
    res.json({ success: true, locked: vars.length });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to lock variables" });
  }
});

router.post("/sessions/:id/variables/validate", async (req: Request, res: Response) => {
  try {
    const sessionId = parseInt(req.params.id);
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
    res.status(500).json({ error: "Failed to validate variables" });
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

router.post("/sessions/:id/generate-tb", async (req: Request, res: Response) => {
  try {
    const sessionId = parseInt(req.params.id);

    const currentHead = (await db.select().from(wpHeadsTable).where(and(eq(wpHeadsTable.sessionId, sessionId), eq(wpHeadsTable.headIndex, 0))))[0];
    if (currentHead && (currentHead.status === "validating" || currentHead.status === "review")) {
      await db.delete(wpExceptionLogTable).where(and(eq(wpExceptionLogTable.sessionId, sessionId), eq(wpExceptionLogTable.headIndex, 0)));
    } else {
      const deps = await checkDependencies(sessionId, 0);
      if (!deps.satisfied) return res.status(400).json({ error: `Prerequisites not met: ${deps.missing.join(", ")}` });
    }

    const ai = await getAIClient();
    const result = await runTBEngine(sessionId, ai);

    // Persist TB lines
    await db.delete(wpTrialBalanceLinesTable).where(eq(wpTrialBalanceLinesTable.sessionId, sessionId));
    for (const line of result.tbLines) {
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
        hasException: !result.balanced,
        exceptionNote: result.balanced ? null : `Difference: ${result.difference.toFixed(4)}`,
      });
    }

    // Log exceptions
    for (const exc of result.exceptions) {
      await db.insert(wpExceptionLogTable).values({
        sessionId, headIndex: 0,
        exceptionType: exc.includes("Suspense") ? "tb_suspense" : exc.includes("AI") ? "tb_ai_generated" : "tb_note",
        severity: exc.includes("Material") || exc.includes("REQUIRES") ? "high" : "medium",
        title: "TB Generation — " + (exc.length > 60 ? exc.slice(0, 57) + "..." : exc),
        description: exc + "\n\nAudit Log:\n" + result.auditLog.join("\n"),
        status: "open",
      });
    }

    // Update head status
    const head = await db.select().from(wpHeadsTable).where(and(eq(wpHeadsTable.sessionId, sessionId), eq(wpHeadsTable.headIndex, 0)));
    if (head[0]) {
      await db.update(wpHeadsTable).set({
        status: "validating", generatedAt: new Date(), updatedAt: new Date(),
        exceptionsCount: result.exceptions.length,
      }).where(eq(wpHeadsTable.id, head[0].id));
    }

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

router.post("/sessions/:id/generate-gl", async (req: Request, res: Response) => {
  try {
    const sessionId = parseInt(req.params.id);

    const currentGlHead = (await db.select().from(wpHeadsTable).where(and(eq(wpHeadsTable.sessionId, sessionId), eq(wpHeadsTable.headIndex, 1))))[0];
    if (currentGlHead && (currentGlHead.status === "validating" || currentGlHead.status === "review")) {
      await db.delete(wpExceptionLogTable).where(and(eq(wpExceptionLogTable.sessionId, sessionId), eq(wpExceptionLogTable.headIndex, 1)));
    } else {
      const deps = await checkDependencies(sessionId, 1);
      if (!deps.satisfied) return res.status(400).json({ error: `Prerequisites not met: ${deps.missing.join(", ")}` });
    }

    const tbLines = await db.select().from(wpTrialBalanceLinesTable).where(eq(wpTrialBalanceLinesTable.sessionId, sessionId));
    if (tbLines.length === 0) return res.status(400).json({ error: "TB must be generated first" });

    const ai = await getAIClient();
    if (!ai) return res.status(503).json({ error: "AI service not configured — add API key in Settings" });

    const session = (await db.select().from(wpSessionsTable).where(eq(wpSessionsTable.id, sessionId)))[0];
    const result = await runGLEngine(sessionId, ai, session);

    // Log exceptions
    for (const exc of result.exceptions) {
      await db.insert(wpExceptionLogTable).values({
        sessionId, headIndex: 1, exceptionType: "gl_recon",
        severity: "high", title: "GL Reconciliation Issue",
        description: exc, status: "open",
      });
    }

    const head = await db.select().from(wpHeadsTable).where(and(eq(wpHeadsTable.sessionId, sessionId), eq(wpHeadsTable.headIndex, 1)));
    if (head[0]) {
      await db.update(wpHeadsTable).set({
        status: "validating", generatedAt: new Date(), updatedAt: new Date(),
        exceptionsCount: result.exceptions.length,
      }).where(eq(wpHeadsTable.id, head[0].id));
    }

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

router.post("/sessions/:id/generate-tb-gl", async (req: Request, res: Response) => {
  try {
    const sessionId = parseInt(req.params.id);
    const stages: { stage: string; status: "ok" | "warn" | "fail"; detail: string }[] = [];

    // ── Validate prerequisites
    const session = (await db.select().from(wpSessionsTable).where(eq(wpSessionsTable.id, sessionId)))[0];
    if (!session) return res.status(404).json({ error: "Session not found" });
    const ai = await getAIClient();

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

    // ── Stage 3: GL Generation (requires AI)
    if (!ai) {
      stages.push({ stage: "General Ledger", status: "fail", detail: "AI not configured — add API key in Settings" });
      return res.status(503).json({ error: "AI service not configured", stages });
    }

    let glResult: Awaited<ReturnType<typeof runGLEngine>>;
    try {
      glResult = await runGLEngine(sessionId, ai, session);
      for (const exc of glResult.exceptions) {
        await db.insert(wpExceptionLogTable).values({
          sessionId, headIndex: 1, exceptionType: "gl_recon",
          severity: "high", title: "GL — " + exc.slice(0, 80),
          description: exc, status: "open",
        });
      }
      const glHead = await db.select().from(wpHeadsTable).where(and(eq(wpHeadsTable.sessionId, sessionId), eq(wpHeadsTable.headIndex, 1)));
      if (glHead[0]) {
        await db.update(wpHeadsTable).set({
          status: "validating", generatedAt: new Date(), updatedAt: new Date(),
          exceptionsCount: glResult.exceptions.length,
        }).where(eq(wpHeadsTable.id, glHead[0].id));
      }
      stages.push({
        stage: "General Ledger",
        status: glResult.exceptions.length === 0 ? "ok" : "warn",
        detail: `${glResult.accountsProcessed} accounts | ${glResult.entriesGenerated} entries | ${glResult.reconciledCount} reconciled`,
      });
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
          status: reconResult.status === "pass" ? "resolved" : "open",
        });
      }
      stages.push({
        stage: "Reconciliation",
        status: reconResult.status,
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
        accounts: glResult.accountsProcessed,
        entries: glResult.entriesGenerated,
        reconciledCount: glResult.reconciledCount,
        exceptions: glResult.exceptions.length,
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

router.post("/sessions/:id/heads/:headIndex/generate", async (req: Request, res: Response) => {
  try {
    const sessionId = parseInt(req.params.id);
    const headIndex = parseInt(req.params.headIndex);

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
    const papers = (head.papersIncluded as string[]) || headDef.papers;

    const generatedDocs: any[] = [];
    const exceptions: string[] = [];

    for (const paperCode of papers) {
      const paperPrompt = `Generate the audit working paper "${paperCode}" for the "${headDef.name}" section.

CLIENT: ${session?.clientName || "Unknown"}
ENTITY TYPE: ${session?.entityType || "Private Limited"}
YEAR: ${session?.engagementYear || "2024"}
FRAMEWORK: ${session?.reportingFramework || "IFRS"}
ENGAGEMENT: ${session?.engagementType?.replace(/_/g, " ") || "Statutory Audit"}
NTN: ${session?.ntn || "N/A"}
LISTED STATUS: ${session?.entityType === "Public Limited (Listed)" ? "Listed / PIE" : "Unlisted"}

ENGAGEMENT VARIABLES:
${varSummary}

TRIAL BALANCE SUMMARY:
${smartChunk(tbSummary, 4000)}

REQUIREMENTS:
1. Follow ISA standards applicable in Pakistan (ICAP adopted)
2. Reference specific account balances from the TB
3. Include proper assertions, procedures, and conclusions
4. Use professional audit language
5. Include cross-references to other working papers where relevant
6. Flag any exceptions or findings

Return JSON:
{
  "paper_code": "${paperCode}",
  "paper_name": string,
  "content": string (full working paper text with proper sections),
  "exceptions": [string],
  "cross_references": [string]
}`;

      try {
        const resp = await ai.client.chat.completions.create({
          model: ai.model,
          messages: [
            { role: "system", content: "You are a senior auditor generating ISA-compliant working papers for Pakistan audits. Return valid JSON only." },
            { role: "user", content: paperPrompt },
          ],
          max_tokens: 4000, temperature: 0.3,
          response_format: { type: "json_object" },
        });

        const raw = JSON.parse(resp.choices[0]?.message?.content || "{}");

        const [doc] = await db.insert(wpHeadDocumentsTable).values({
          sessionId, headId: head.id,
          paperCode: raw.paper_code || paperCode,
          paperName: raw.paper_name || paperCode,
          content: raw.content || "",
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

router.post("/sessions/:id/heads/auto-process-all", async (req: Request, res: Response) => {
  try {
    const sessionId = parseInt(req.params.id);
    if (isNaN(sessionId)) return res.status(400).json({ error: "Invalid session ID" });

    const session = (await db.select().from(wpSessionsTable).where(eq(wpSessionsTable.id, sessionId)))[0];
    if (!session) return res.status(404).json({ error: "Session not found" });

    const ai = await getAIClient();
    if (!ai) return res.status(503).json({ error: "AI service not configured" });

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
          });
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
          });
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
          const papers = (head.papersIncluded as string[]) || headDef.papers;

          for (const paperCode of papers) {
            try {
              const resp = await ai.client.chat.completions.create({
                model: ai.model,
                messages: [
                  { role: "system", content: "You are a senior auditor generating ISA-compliant working papers for Pakistan audits. Return valid JSON only." },
                  { role: "user", content: `Generate the audit working paper "${paperCode}" for the "${headDef.name}" section.\n\nCLIENT: ${session.clientName || "Unknown"}\nENTITY TYPE: ${session.entityType || "Private Limited"}\nYEAR: ${session.engagementYear || "2024"}\nFRAMEWORK: ${session.reportingFramework || "IFRS"}\n\nVARIABLES:\n${smartChunk(varSummary, 3000)}\n\nTRIAL BALANCE:\n${smartChunk(tbSummary, 3000)}\n\nReturn JSON:\n{"paper_code":"${paperCode}","paper_name":string,"content":string,"exceptions":[string],"cross_references":[string]}` },
                ],
                max_tokens: 4000, temperature: 0.3,
                response_format: { type: "json_object" },
              });
              const raw = JSON.parse(resp.choices[0]?.message?.content || "{}");
              await db.insert(wpHeadDocumentsTable).values({
                sessionId, headId: head.id,
                paperCode: raw.paper_code || paperCode, paperName: raw.paper_name || paperCode,
                content: raw.content || "", outputFormat: headDef.outputType.split("+")[0],
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

    res.json({
      success: true,
      message: `Auto-processed: ${completed} completed, ${skipped} skipped, ${failed} failed`,
      results,
      summary: { completed, skipped, failed, total: allHeads.length },
    });
  } catch (err: any) {
    logger.error({ err }, "Auto-process-all failed");
    res.status(500).json({ error: "Auto-process failed: " + (err.message || "Unknown error") });
  }
});

router.post("/sessions/:id/heads/:headIndex/approve", async (req: Request, res: Response) => {
  try {
    const sessionId = parseInt(req.params.id);
    const headIndex = parseInt(req.params.headIndex);

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
  await ws.protect("", { sheet: true, selectLockedCells: true, selectUnlockedCells: true });
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

function dxFirmHeader(firmName: string, clientName: string, docTitle: string, period: string, ntn: string, isaRef: string): Paragraph[] {
  return [
    new Paragraph({
      children: [new TextRun({ text: firmName, bold: true, size: 32, color: DOCX_NAVY, font: "Calibri" })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
    }),
    new Paragraph({
      children: [new TextRun({ text: "Chartered Accountants — Registered with ICAP | QCR-Rated | ICAEW Authorized Employer", size: 18, color: DOCX_SLATE, font: "Calibri", italics: true })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 160 },
    }),
    // separator line as a table
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [new TableRow({ children: [new TableCell({
        shading: { fill: DOCX_NAVY, type: ShadingType.SOLID },
        children: [new Paragraph({ text: "" })],
        borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
      })] })],
    }),
    new Paragraph({ text: "", spacing: { after: 120 } }),
    new Paragraph({
      children: [new TextRun({ text: docTitle.toUpperCase(), bold: true, size: 28, color: DOCX_BLUE, font: "Calibri" })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
    }),
    // Metadata table
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({ children: [
          new TableCell({ width: { size: 25, type: WidthType.PERCENTAGE }, shading: { fill: "1E3A8A", type: ShadingType.SOLID }, children: [new Paragraph({ children: [new TextRun({ text: "Client:", bold: true, color: "FFFFFF", size: 18, font: "Calibri" })] })], borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } } }),
          new TableCell({ width: { size: 75, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: [new TextRun({ text: clientName, size: 18, font: "Calibri" })] })], borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.SINGLE, color: "E2E8F0" }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } } }),
        ]}),
        new TableRow({ children: [
          new TableCell({ shading: { fill: "1E3A8A", type: ShadingType.SOLID }, children: [new Paragraph({ children: [new TextRun({ text: "Period:", bold: true, color: "FFFFFF", size: 18, font: "Calibri" })] })], borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } } }),
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: period, size: 18, font: "Calibri" })] })], borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.SINGLE, color: "E2E8F0" }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } } }),
        ]}),
        new TableRow({ children: [
          new TableCell({ shading: { fill: "1E3A8A", type: ShadingType.SOLID }, children: [new Paragraph({ children: [new TextRun({ text: "NTN:", bold: true, color: "FFFFFF", size: 18, font: "Calibri" })] })], borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } } }),
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: ntn || "N/A", size: 18, font: "Calibri" })] })], borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.SINGLE, color: "E2E8F0" }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } } }),
        ]}),
        new TableRow({ children: [
          new TableCell({ shading: { fill: "1E3A8A", type: ShadingType.SOLID }, children: [new Paragraph({ children: [new TextRun({ text: "ISA Ref:", bold: true, color: "FFFFFF", size: 18, font: "Calibri" })] })], borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } } }),
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: isaRef || "—", size: 18, font: "Calibri" })] })], borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.SINGLE, color: "E2E8F0" }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } } }),
        ]}),
        new TableRow({ children: [
          new TableCell({ shading: { fill: "1E3A8A", type: ShadingType.SOLID }, children: [new Paragraph({ children: [new TextRun({ text: "Prepared:", bold: true, color: "FFFFFF", size: 18, font: "Calibri" })] })], borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } } }),
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: new Date().toLocaleDateString("en-GB", { year: "numeric", month: "long", day: "numeric" }), size: 18, font: "Calibri" })] })], borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } } }),
        ]}),
      ],
    }),
    new Paragraph({ text: "", spacing: { after: 240 } }),
  ];
}

function dxSection(title: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text: title, bold: true, size: 22, color: DOCX_BLUE, font: "Calibri" })],
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 300, after: 120 },
    border: { bottom: { style: BorderStyle.SINGLE, color: DOCX_BLUE, size: 6 } },
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

function parseDocxContent(content: string, clientName: string): Paragraph[] {
  const paras: Paragraph[] = [];
  const lines = (content || "").split("\n");
  let inSignOff = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) { paras.push(new Paragraph({ text: "", spacing: { after: 80 } })); continue; }

    // Section headings: lines starting with ##, all-caps lines, or numbered like "1." "A."
    if (line.startsWith("##") || line.startsWith("**") && line.endsWith("**") || /^[A-Z ]{10,}$/.test(line) || /^\d+\.\s+[A-Z]/.test(line) || /^[A-Z]\.\s+[A-Z]/.test(line)) {
      const clean = line.replace(/^#+\s*/, "").replace(/\*\*/g, "");
      paras.push(dxSection(clean));
      continue;
    }
    // Bullet points
    if (line.startsWith("- ") || line.startsWith("• ") || line.startsWith("* ")) {
      paras.push(dxBullet(line.replace(/^[-•*]\s+/, "")));
      continue;
    }
    // Sign-off / Prepared by rows
    if (/^(prepared|reviewed|approved|signature)/i.test(line)) {
      inSignOff = true;
    }
    paras.push(dxBody(line));
  }
  return paras;
}

router.post("/sessions/:id/heads/:headIndex/export", async (req: Request, res: Response) => {
  try {
    const sessionId = parseInt(req.params.id);
    const headIndex = parseInt(req.params.headIndex);

    const heads = await db.select().from(wpHeadsTable).where(and(eq(wpHeadsTable.sessionId, sessionId), eq(wpHeadsTable.headIndex, headIndex)));
    if (!heads[0]) return res.status(404).json({ error: "Head not found" });

    const documents = await db.select().from(wpHeadDocumentsTable).where(eq(wpHeadDocumentsTable.headId, heads[0].id));
    const headDef = AUDIT_HEADS[headIndex];

    // Fetch session metadata for headers
    const session = (await db.select().from(wpSessionsTable).where(eq(wpSessionsTable.id, sessionId)))[0];
    const clientName = session?.clientName || "Client";
    const ntn = session?.ntn || "N/A";
    const period = session?.periodStart && session?.periodEnd
      ? `${session.periodStart} to ${session.periodEnd}`
      : session?.engagementYear ? `FY ${session.engagementYear}` : "—";
    const firmName = "Alam & Aulakh Chartered Accountants";

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

    // ── HEADS 2-11: WORD / WORD+EXCEL / WORD+PDF output ──────────────────────
    const isaRefs: Record<number, string> = {
      2: "ISA 200, 210, 220", 3: "ISA 200–240", 4: "ISA 500, 505, 580",
      5: "ISA 510", 6: "ISA 300, 315, 320", 7: "ISA 330, 500–580",
      8: "ISA 560, 570, 580", 9: "ISA 700–720", 10: "ISA 220", 11: "ISQM 1",
    };

    const docSections: any[] = [
      ...dxFirmHeader(firmName, clientName, headDef.name, period, ntn, isaRefs[headIndex] || ""),
    ];

    for (const doc of documents) {
      if (docSections.length > dxFirmHeader(firmName, clientName, headDef.name, period, ntn, isaRefs[headIndex] || "").length) {
        docSections.push(new Paragraph({ children: [new PageBreak()] }));
      }
      // Working paper title
      docSections.push(new Paragraph({
        children: [
          new TextRun({ text: `${doc.paperCode}:  `, bold: true, size: 24, color: DOCX_SLATE, font: "Calibri" }),
          new TextRun({ text: doc.paperName || "", bold: true, size: 24, color: DOCX_NAVY, font: "Calibri" }),
        ],
        heading: HeadingLevel.HEADING_1,
        spacing: { after: 200 },
        border: { bottom: { style: BorderStyle.SINGLE, color: DOCX_BLUE, size: 8 } },
      }));
      // Content
      docSections.push(...parseDocxContent(doc.content || "", clientName));
      // Sign-off table
      docSections.push(new Paragraph({ text: "", spacing: { before: 400 } }));
      docSections.push(new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({ children: [
            new TableCell({ width: { size: 33, type: WidthType.PERCENTAGE }, shading: { fill: "F1F5F9", type: ShadingType.SOLID }, children: [new Paragraph({ children: [new TextRun({ text: "Prepared By", bold: true, size: 18, color: DOCX_BLUE, font: "Calibri" })] })], borders: { top: { style: BorderStyle.SINGLE, color: "E2E8F0" }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } } }),
            new TableCell({ width: { size: 34, type: WidthType.PERCENTAGE }, shading: { fill: "F1F5F9", type: ShadingType.SOLID }, children: [new Paragraph({ children: [new TextRun({ text: "Reviewed By", bold: true, size: 18, color: DOCX_BLUE, font: "Calibri" })] })], borders: { top: { style: BorderStyle.SINGLE, color: "E2E8F0" }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } } }),
            new TableCell({ width: { size: 33, type: WidthType.PERCENTAGE }, shading: { fill: "F1F5F9", type: ShadingType.SOLID }, children: [new Paragraph({ children: [new TextRun({ text: "Approved By", bold: true, size: 18, color: DOCX_BLUE, font: "Calibri" })] })], borders: { top: { style: BorderStyle.SINGLE, color: "E2E8F0" }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } } }),
          ]}),
          new TableRow({ children: [
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Name: ___________________", size: 18, font: "Calibri" })], spacing: { after: 80 } }), new Paragraph({ children: [new TextRun({ text: "Signature: _______________", size: 18, font: "Calibri" })], spacing: { after: 80 } }), new Paragraph({ children: [new TextRun({ text: "Date: ___________________", size: 18, font: "Calibri" })] })], borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } } }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Name: ___________________", size: 18, font: "Calibri" })], spacing: { after: 80 } }), new Paragraph({ children: [new TextRun({ text: "Signature: _______________", size: 18, font: "Calibri" })], spacing: { after: 80 } }), new Paragraph({ children: [new TextRun({ text: "Date: ___________________", size: 18, font: "Calibri" })] })], borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } } }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Name: ___________________", size: 18, font: "Calibri" })], spacing: { after: 80 } }), new Paragraph({ children: [new TextRun({ text: "Signature: _______________", size: 18, font: "Calibri" })], spacing: { after: 80 } }), new Paragraph({ children: [new TextRun({ text: "Date: ___________________", size: 18, font: "Calibri" })] })], borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } } }),
          ]}),
        ],
      }));
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
    const sessionId = parseInt(req.params.id);
    const exceptions = await db.select().from(wpExceptionLogTable).where(eq(wpExceptionLogTable.sessionId, sessionId));
    res.json(exceptions);
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch exceptions" });
  }
});

router.patch("/sessions/:id/exceptions/:excId", async (req: Request, res: Response) => {
  try {
    const excId = parseInt(req.params.excId);
    const { status, resolution, resolvedBy } = req.body;
    const updates: any = { updatedAt: new Date() };
    if (status) updates.status = status;
    if (resolution) updates.resolution = resolution;
    if (resolvedBy) updates.resolvedBy = resolvedBy;
    if (status === "cleared" || status === "override_approved") updates.resolvedAt = new Date();
    const [updated] = await db.update(wpExceptionLogTable).set(updates).where(eq(wpExceptionLogTable.id, excId)).returning();
    res.json(updated);
  } catch (err: any) {
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
    if (files.length === 0) missing.push("No files uploaded");
    if (fields.length === 0) missing.push("Extraction not completed");
    const lockedVars = variables.filter(v => v.isLocked);
    if (variables.length > 0 && lockedVars.length === 0) missing.push("Variables not locked");
  }

  if (headIndex >= 1) {
    if (tbLines.length === 0) missing.push("Trial Balance not generated");
    const tbHead = heads.find(h => h.headIndex === 0);
    if (tbHead && tbHead.status !== "approved" && tbHead.status !== "exported" && tbHead.status !== "completed") {
      missing.push("Trial Balance head not approved");
    }
    const tbApproved = tbHead && (tbHead.status === "approved" || tbHead.status === "exported" || tbHead.status === "completed");
    if (!tbApproved && tbLines.length > 0) {
      const totalDebit = tbLines.reduce((s, l) => s + Number(l.debit || 0), 0);
      const totalCredit = tbLines.reduce((s, l) => s + Number(l.credit || 0), 0);
      if (Math.abs(totalDebit - totalCredit) > 1) {
        missing.push("Trial Balance does not balance — resolve imbalance before proceeding");
      }
    }
  }

  if (headIndex >= 2) {
    const glAccounts = await db.select().from(wpGlAccountsTable).where(eq(wpGlAccountsTable.sessionId, sessionId));
    if (glAccounts.length === 0) missing.push("General Ledger not generated");
    const glHead = heads.find(h => h.headIndex === 1);
    if (glHead && glHead.status !== "approved" && glHead.status !== "exported" && glHead.status !== "completed") {
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

router.post("/sessions/:id/export-bundle", async (req: Request, res: Response) => {
  try {
    const sessionId = parseInt(req.params.id);
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
    res.status(500).json({ error: "Bundle export failed: " + err.message });
  }
});

router.get("/heads-definition", (_req: Request, res: Response) => {
  res.json(AUDIT_HEADS);
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
    const sessionId = parseInt(req.params.id);
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
    res.status(500).json({ error: err.message });
  }
});

// ── Audit Engine Master: PATCH
router.patch("/sessions/:id/audit-engine", async (req: Request, res: Response) => {
  try {
    const sessionId = parseInt(req.params.id);
    const updates = req.body;
    delete updates.id; delete updates.sessionId; delete updates.createdAt;
    updates.updatedAt = new Date();
    const rows = await db.update(auditEngineMasterTable).set(updates).where(eq(auditEngineMasterTable.sessionId, sessionId)).returning();
    if (!rows.length) return res.status(404).json({ error: "Audit engine not found — call GET first to auto-create" });
    return res.json(rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Audit Engine Master: Auto-populate from session variables
router.post("/sessions/:id/audit-engine/auto-populate", async (req: Request, res: Response) => {
  try {
    const sessionId = parseInt(req.params.id);
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
    res.status(500).json({ error: err.message });
  }
});

// ── WP Trigger Defs: GET all
router.get("/wp-trigger-defs", async (_req: Request, res: Response) => {
  try {
    const rows = await db.select().from(wpTriggerDefsTable).orderBy(asc(wpTriggerDefsTable.displayOrder));
    return res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── WP Trigger Session: GET (evaluate triggers)
router.get("/sessions/:id/wp-triggers", async (req: Request, res: Response) => {
  try {
    const sessionId = parseInt(req.params.id);
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
    res.status(500).json({ error: err.message });
  }
});

// ── WP Trigger Session: Evaluate & persist all triggers
router.post("/sessions/:id/wp-triggers/evaluate", async (req: Request, res: Response) => {
  try {
    const sessionId = parseInt(req.params.id);
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
    res.status(500).json({ error: err.message });
  }
});

// ── WP Trigger Session: PATCH status/conclusion
router.patch("/sessions/:id/wp-triggers/:wpCode", async (req: Request, res: Response) => {
  try {
    const sessionId = parseInt(req.params.id);
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
    res.status(500).json({ error: err.message });
  }
});

// ── Assertion Linkage: GET all
router.get("/assertion-linkage", async (_req: Request, res: Response) => {
  try {
    const rows = await db.select().from(assertionLinkageTable).orderBy(asc(assertionLinkageTable.displayOrder));
    return res.json(rows);
  } catch (err: any) {
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
    res.status(500).json({ error: err.message });
  }
});

// ── Sampling Rules: GET + compute for session
router.get("/sessions/:id/sampling", async (req: Request, res: Response) => {
  try {
    const sessionId = parseInt(req.params.id);
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
    res.status(500).json({ error: err.message });
  }
});

// ── Analytics Defs: GET all
router.get("/analytics-defs", async (_req: Request, res: Response) => {
  try {
    const rows = await db.select().from(analyticsEngineTable).orderBy(asc(analyticsEngineTable.displayOrder));
    return res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Analytics Session: GET computed results
router.get("/sessions/:id/analytics", async (req: Request, res: Response) => {
  try {
    const sessionId = parseInt(req.params.id);
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
      let computed = null, breached = false;

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
    res.status(500).json({ error: err.message });
  }
});

// ── Analytics Session: Save/update result
router.patch("/sessions/:id/analytics/:ratioCode", async (req: Request, res: Response) => {
  try {
    const sessionId = parseInt(req.params.id);
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
    res.status(500).json({ error: err.message });
  }
});

// ── Control Matrix: GET
router.get("/sessions/:id/control-matrix", async (req: Request, res: Response) => {
  try {
    const sessionId = parseInt(req.params.id);
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
    res.status(500).json({ error: err.message });
  }
});

// ── Control Matrix: POST
router.post("/sessions/:id/control-matrix", async (req: Request, res: Response) => {
  try {
    const sessionId = parseInt(req.params.id);
    const [inserted] = await db.insert(controlMatrixTable).values({ sessionId, ...req.body }).returning();
    return res.status(201).json(inserted);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Control Matrix: PATCH
router.patch("/sessions/:id/control-matrix/:cmId", async (req: Request, res: Response) => {
  try {
    const cmId = parseInt(req.params.cmId);
    const updates = { ...req.body, updatedAt: new Date() };
    const [updated] = await db.update(controlMatrixTable).set(updates).where(eq(controlMatrixTable.id, cmId)).returning();
    return res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Control Matrix: DELETE
router.delete("/sessions/:id/control-matrix/:cmId", async (req: Request, res: Response) => {
  try {
    await db.delete(controlMatrixTable).where(eq(controlMatrixTable.id, parseInt(req.params.cmId)));
    return res.json({ deleted: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Evidence Log: GET
router.get("/sessions/:id/evidence", async (req: Request, res: Response) => {
  try {
    const rows = await db.select().from(evidenceLogTable).where(eq(evidenceLogTable.sessionId, parseInt(req.params.id)));
    return res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Evidence Log: POST
router.post("/sessions/:id/evidence", async (req: Request, res: Response) => {
  try {
    const sessionId = parseInt(req.params.id);
    const evidenceId = `EV-${Date.now().toString(36).toUpperCase()}`;
    const [inserted] = await db.insert(evidenceLogTable).values({ sessionId, evidenceId, ...req.body }).returning();
    return res.status(201).json(inserted);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Evidence Log: PATCH
router.patch("/sessions/:id/evidence/:evId", async (req: Request, res: Response) => {
  try {
    const [updated] = await db.update(evidenceLogTable).set(req.body).where(eq(evidenceLogTable.id, parseInt(req.params.evId))).returning();
    return res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Evidence Log: DELETE
router.delete("/sessions/:id/evidence/:evId", async (req: Request, res: Response) => {
  try {
    await db.delete(evidenceLogTable).where(eq(evidenceLogTable.id, parseInt(req.params.evId)));
    return res.json({ deleted: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Reconciliation Engine: GET results
router.get("/sessions/:id/recon", async (req: Request, res: Response) => {
  try {
    const rows = await db.select().from(reconEngineTable).where(eq(reconEngineTable.sessionId, parseInt(req.params.id)));
    return res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Reconciliation Engine: Run all checks
router.post("/sessions/:id/recon/run", async (req: Request, res: Response) => {
  try {
    const sessionId = parseInt(req.params.id);
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
router.post("/sessions/:id/extract-workbook", async (req: Request, res: Response) => {
  const sessionId = parseInt(req.params.id);
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
          const coaInserts = [];
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
          const inserts = [];
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
        const tbInserts = [];
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
  const sessionId = parseInt(req.params.id);
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
    res.status(500).json({ error: err.message });
  }
});

// ── GET journal imports for session ──────────────────────────────────────────
router.get("/sessions/:id/journal-imports", async (req: Request, res: Response) => {
  const sessionId = parseInt(req.params.id);
  try {
    const rows = await db.select().from(wpJournalImportTable).where(eq(wpJournalImportTable.sessionId, sessionId)).orderBy(asc(wpJournalImportTable.entryDate));
    res.json(rows);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── GET FS extraction rows for session ───────────────────────────────────────
router.get("/sessions/:id/fs-extraction", async (req: Request, res: Response) => {
  const sessionId = parseInt(req.params.id);
  try {
    const rows = await db.select().from(wpFsExtractionTable).where(eq(wpFsExtractionTable.sessionId, sessionId));
    res.json(rows);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── GET FS mappings for session ───────────────────────────────────────────────
router.get("/sessions/:id/fs-mappings", async (req: Request, res: Response) => {
  const sessionId = parseInt(req.params.id);
  try {
    const rows = await db.select().from(wpFsMappingTable).where(eq(wpFsMappingTable.sessionId, sessionId));
    res.json(rows);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
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
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /sessions/:id/activate-wp-library
// Trigger engine: evaluates audit master + COA + analytics flags
// → activates relevant WPs from wp_library_master into wp_library_session
// ─────────────────────────────────────────────────────────────────────────────
router.post("/sessions/:id/activate-wp-library", async (req: Request, res: Response) => {
  try {
    const sessionId = parseInt(req.params.id, 10);
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
      fsHeads: presentFsHeads.map((h) => (h || "").toLowerCase()),
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
    const sessionId = parseInt(req.params.id, 10);
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
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /sessions/:id/wp-library-session/:wpCode  — Update session WP status
// ─────────────────────────────────────────────────────────────────────────────
router.patch("/sessions/:id/wp-library-session/:wpCode", async (req: Request, res: Response) => {
  try {
    const sessionId = parseInt(req.params.id, 10);
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

router.post("/seed-trigger-rules", async (req: Request, res: Response) => {
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
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /sessions/:id/validate-for-generation  — 6-check validation gate
// Checks: TB balance | TB↔FS mapping | GL↔TB recon | mandatory vars |
//         confidence <85% | mandatory WPs incomplete
// ─────────────────────────────────────────────────────────────────────────────
router.post("/sessions/:id/validate-for-generation", async (req: Request, res: Response) => {
  try {
    const sessionId = parseInt(req.params.id, 10);
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
    const engRows = await db.execute(sql`SELECT client_name, entity_type, financial_year_end, reporting_framework, performance_materiality FROM audit_engine_master WHERE session_id = ${sessionId} LIMIT 1`);
    const eng = (engRows.rows?.[0] as any) || {};
    const missingVars: string[] = [];
    if (!eng.client_name) missingVars.push("clientName");
    if (!eng.entity_type) missingVars.push("entityType");
    if (!eng.financial_year_end) missingVars.push("financialYearEnd");
    if (!eng.reporting_framework) missingVars.push("reportingFramework");
    if (!eng.performance_materiality || eng.performance_materiality === "0") missingVars.push("performanceMateriality");
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
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /sessions/:id/auto-flag-exceptions  — ISA exception auto-detection
// Scans: unmapped FS lines | GL confidence | incomplete mandatory WPs |
//        TB gaps | COA mismatches | related party anomalies
// ─────────────────────────────────────────────────────────────────────────────
router.post("/sessions/:id/auto-flag-exceptions", async (req: Request, res: Response) => {
  try {
    const sessionId = parseInt(req.params.id, 10);

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
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /sessions/:id/isa-exceptions  — List ISA library exceptions for a session
// ─────────────────────────────────────────────────────────────────────────────
router.get("/sessions/:id/isa-exceptions", async (req: Request, res: Response) => {
  try {
    const sessionId = parseInt(req.params.id, 10);
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
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /sessions/:id/isa-exceptions/:exId/resolve  — Resolve an ISA exception
// ─────────────────────────────────────────────────────────────────────────────
router.patch("/sessions/:id/isa-exceptions/:exId/resolve", async (req: Request, res: Response) => {
  try {
    const sessionId = parseInt(req.params.id, 10);
    const exId = parseInt(req.params.exId, 10);
    const { resolvedBy, resolutionNote } = req.body;
    if (!resolvedBy) return res.status(400).json({ error: "resolvedBy is required" });

    await db.update(wpExceptionsTable).set({
      resolvedFlag: true, resolvedBy, resolvedAt: new Date(), resolutionNote, updatedAt: new Date()
    } as any).where(and(eq(wpExceptionsTable.id, exId), eq(wpExceptionsTable.sessionId, sessionId)));

    return res.json({ message: "Exception resolved", exId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /sessions/:id/lock  — ISA 230 Partner Approval Lock
// Locks the session audit file — no further edits allowed without EQCR override
// ─────────────────────────────────────────────────────────────────────────────
router.post("/sessions/:id/lock", async (req: Request, res: Response) => {
  try {
    const sessionId = parseInt(req.params.id, 10);
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
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /sessions/:id/lock-status  — Check if session is locked
// ─────────────────────────────────────────────────────────────────────────────
router.get("/sessions/:id/lock-status", async (req: Request, res: Response) => {
  try {
    const sessionId = parseInt(req.params.id, 10);
    const lock = await db.select().from(wpSessionLockTable).where(eq(wpSessionLockTable.sessionId, sessionId)).limit(1);
    if (lock.length === 0) return res.json({ locked: false });
    return res.json({ locked: true, lock: lock[0] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /sessions/:id/generate-output  — Generate TB / GL / WP Index exports
// Produces structured JSON outputs ready for Excel/Word rendering
// ─────────────────────────────────────────────────────────────────────────────
router.post("/sessions/:id/generate-output", async (req: Request, res: Response) => {
  try {
    const sessionId = parseInt(req.params.id, 10);
    const { jobType, triggeredBy } = req.body;
    // jobType: "tb_excel" | "gl_excel" | "wp_index" | "full_file"

    // Check validation gate — must have run at least once and passed
    const lastValidation = await db.select().from(wpValidationResultTable)
      .where(eq(wpValidationResultTable.sessionId, sessionId))
      .orderBy(sql`run_at DESC`).limit(1);
    if (lastValidation.length === 0) {
      return res.status(422).json({ error: "Generation blocked: no validation has been run yet. Run the Validate step first.", blockedReasons: ["No validation record found"] });
    }
    if (!lastValidation[0].generationAllowed) {
      return res.status(422).json({ error: "Generation blocked by validation gate", blockedReasons: JSON.parse(lastValidation[0].blockedReasons || "[]") });
    }

    const job = await db.insert(wpOutputJobTable).values({
      sessionId, jobType: jobType || "full_file", status: "running",
      triggeredBy: triggeredBy || "System", startedAt: new Date(),
    } as any).returning({ id: wpOutputJobTable.id });

    const jobId = job[0]?.id;

    // ── Build output payload ───────────────────────────────────────────────
    const tbData = await db.execute(sql`
      SELECT account_code, account_name, classification as fs_head, fs_line_mapping,
             '0' as opening_balance, debit, credit, balance as closing_balance,
             prior_year_balance, source as data_source, confidence
      FROM wp_trial_balance_lines WHERE session_id = ${sessionId} ORDER BY account_code`);

    const glData = await db.execute(sql`
      SELECT ge.entry_date, ga.account_code, ga.account_name, ge.narration, ge.debit, ge.credit,
             ge.voucher_no, ge.running_balance
      FROM wp_gl_entries ge
      LEFT JOIN wp_gl_accounts ga ON ge.gl_account_id = ga.id
      WHERE ge.session_id = ${sessionId} ORDER BY ge.entry_date, ge.voucher_no`);

    const wpIndex = await db.select().from(wpLibrarySessionTable)
      .where(eq(wpLibrarySessionTable.sessionId, sessionId))
      .then(rows => rows.sort((a, b) => {
        const phaseOrder: Record<string, number> = { "Pre-engagement": 1, Planning: 2, Execution: 3, Completion: 4, Reporting: 5, "Quality Control": 6 };
        return (phaseOrder[a.wpPhase || ""] || 9) - (phaseOrder[b.wpPhase || ""] || 9);
      }));

    const varRows = await db.execute(sql`SELECT client_name, entity_type, financial_year_end, reporting_framework, performance_materiality FROM audit_engine_master WHERE session_id = ${sessionId} LIMIT 1`);
    const varsRow = (varRows.rows?.[0] as any) || {};
    const vars = { entityName: varsRow.client_name, entityType: varsRow.entity_type, financialYearEnd: varsRow.financial_year_end, reportingFramework: varsRow.reporting_framework, currency: "PKR" };

    // Phase summary for WP index
    const phaseSummary: Record<string, any> = {};
    for (const wp of wpIndex) {
      const ph = wp.wpPhase || "Other";
      if (!phaseSummary[ph]) phaseSummary[ph] = { total: 0, prepared: 0, approved: 0, pending: 0 };
      phaseSummary[ph].total++;
      if (wp.status === "Approved") phaseSummary[ph].approved++;
      else if (wp.status === "Prepared" || wp.status === "Reviewed") phaseSummary[ph].prepared++;
      else if (wp.status === "Pending" || wp.status === "In Progress") phaseSummary[ph].pending++;
    }

    // ── CSV helper ──────────────────────────────────────────────────────────
    const toCSV = (cols: string[], rows: any[]): string => {
      const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const header = cols.map(esc).join(",");
      const body = rows.map(r => {
        const keys = Object.keys(r);
        return cols.map((_, i) => esc(r[keys[i]] ?? "")).join(",");
      }).join("\n");
      return `${header}\n${body}`;
    };

    const tbCols  = ["account_code","account_name","fs_head","fs_line_mapping","opening_balance","debit","credit","closing_balance","prior_year_balance","data_source","confidence"];
    const glCols  = ["entry_date","account_code","account_name","narration","debit","credit","voucher_no","running_balance"];
    const wpCols  = ["WP Code","Title","Phase","Category","Status","Mandatory","Prepared By","Reviewed By","Approved By","Conclusion"];

    const tbRows  = (tbData.rows || []) as any[];
    const glRows  = (glData.rows || []) as any[];
    const wpRows  = wpIndex.map(wp => ({
      "WP Code": wp.wpCode, "Title": wp.wpTitle, "Phase": wp.wpPhase, "Category": wp.wpCategory,
      "Status": wp.status, "Mandatory": wp.mandatoryFlag ? "Yes" : "No",
      "Prepared By": wp.preparedBy || "", "Reviewed By": wp.reviewedBy || "",
      "Approved By": wp.approvedBy || "", "Conclusion": wp.conclusion || "",
    }));

    const entityName = vars.entityName || `Session-${sessionId}`;
    const fyEnd = (vars.financialYearEnd || new Date().toISOString().slice(0,10)).replace(/\//g,"-");
    const safeName = entityName.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 30);
    const recordCount = tbRows.length + glRows.length + wpIndex.length;

    // Determine what to return based on jobType
    let fileContent: string;
    let fileName: string;
    let contentType: string;

    if (jobType === "tb_excel") {
      fileContent = toCSV(tbCols, tbRows);
      fileName = `TB_${safeName}_${fyEnd}.csv`;
      contentType = "text/csv";
    } else if (jobType === "gl_excel") {
      fileContent = toCSV(glCols, glRows);
      fileName = `GL_${safeName}_${fyEnd}.csv`;
      contentType = "text/csv";
    } else if (jobType === "wp_index") {
      fileContent = toCSV(wpCols, wpRows);
      fileName = `WP_Index_${safeName}_${fyEnd}.csv`;
      contentType = "text/csv";
    } else {
      // full_file — pack all three as a JSON file download
      fileContent = JSON.stringify({
        generatedAt: new Date().toISOString(), sessionId, entityName,
        financialYearEnd: vars.financialYearEnd, reportingFramework: vars.reportingFramework,
        tb: { totalAccounts: tbRows.length, data: tbRows },
        gl: { totalTransactions: glRows.length, data: glRows },
        wpIndex: { totalWps: wpIndex.length, phaseSummary, papers: wpRows },
      }, null, 2);
      fileName = `AuditFile_${safeName}_${fyEnd}.json`;
      contentType = "application/json";
    }

    // Complete the job record
    await db.update(wpOutputJobTable)
      .set({ status: "complete", completedAt: new Date(), recordCount, outputPath: fileName, metadata: JSON.stringify({ phases: Object.keys(phaseSummary), tbAccounts: tbRows.length, glTxns: glRows.length }) } as any)
      .where(eq(wpOutputJobTable.id, jobId));

    // Return as downloadable file
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.setHeader("X-Job-Id", String(jobId));
    res.setHeader("X-Record-Count", String(recordCount));
    return res.send(fileContent);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /sessions/:id/output-jobs  — List all output generation jobs
// ─────────────────────────────────────────────────────────────────────────────
router.get("/sessions/:id/output-jobs", async (req: Request, res: Response) => {
  try {
    const sessionId = parseInt(req.params.id, 10);
    const jobs = await db.select().from(wpOutputJobTable)
      .where(eq(wpOutputJobTable.sessionId, sessionId))
      .orderBy(sql`created_at DESC`);
    return res.json({ total: jobs.length, jobs });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /sessions/:id/wp-audit-trail  — Full ISA 230 audit trail timeline
// ─────────────────────────────────────────────────────────────────────────────
router.get("/sessions/:id/wp-audit-trail", async (req: Request, res: Response) => {
  try {
    const sessionId = parseInt(req.params.id, 10);
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

  // ── Detect format by looking for metadata pattern in rows 5-6 ───────────
  const row5 = allRows[4] || [];
  const row6 = allRows[5] || [];
  const row8 = allRows[7] || [];

  const isOneSheetFormat = (
    String(row5[0]).toLowerCase().includes("entity") ||
    String(row5[0]).toLowerCase().includes("entity_name") ||
    String(row8[0]).toLowerCase().includes("line_id") ||
    String(row8[1]).toLowerCase().includes("statement")
  );

  // ── Extract metadata ─────────────────────────────────────────────────────
  // Template layout: Label in col A/D/G/J/M, value in B/E/H/K/N (0-indexed 1/4/7/10/13)
  let yearEndVal = row5[13];
  let yearEndStr = "";
  if (typeof yearEndVal === "number") {
    // Excel serial date → JS date
    const d = new Date(Math.round((yearEndVal - 25569) * 86400 * 1000));
    yearEndStr = d.toISOString().split("T")[0];
  } else {
    yearEndStr = String(yearEndVal || "").trim();
  }

  const meta: ParsedTemplateMeta = {
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

  // ── Find header row ─────────────────────────────────────────────────────
  // Headers should be in row 8 (index 7), look for Line_ID in col A
  let headerRowIdx = 7;
  for (let i = 5; i <= Math.min(12, allRows.length - 1); i++) {
    const r = allRows[i];
    if (r && String(r[0]).toLowerCase().replace(/_/g, "").includes("lineid")) { headerRowIdx = i; break; }
    if (r && String(r[0]).toLowerCase().includes("line_id")) { headerRowIdx = i; break; }
  }
  const headerRow = allRows[headerRowIdx] || [];
  const hdr = (headerRow as any[]).map(h => String(h).trim().toLowerCase().replace(/[\s_]/g, "_"));

  // ── Extract data rows ────────────────────────────────────────────────────
  const rows: ParsedTemplateRow[] = [];
  const seenCodes = new Map<string, number>();
  const VALID_ST   = new Set(["bs","p&l","pl","oci","eq","cf","income","expense","expenses"]);
  const VALID_NB   = new Set(["debit","credit"]);

  for (let i = headerRowIdx + 1; i < allRows.length; i++) {
    const raw = allRows[i];
    if (!raw || raw.every((c: any) => c === "" || c === null || c === undefined)) continue;

    // Build a keyed object from header
    const obj: Record<string, any> = {};
    hdr.forEach((h, j) => { obj[h] = raw[j] ?? ""; });

    const lineId = obj["line_id"] ?? obj["lineid"] ?? "";
    if (String(lineId).toLowerCase() === "total" || String(lineId) === "") continue;

    const stRaw = String(obj["statement_type"] ?? obj["statementtype"] ?? "").trim().toLowerCase();
    const nbRaw = String(obj["normal_balance"] ?? obj["normalbalance"] ?? "").trim().toLowerCase();
    const acctCode = String(obj["account_code"] ?? obj["accountcode"] ?? "").trim();

    // Validation
    if (!VALID_ST.has(stRaw) && stRaw !== "") warnings.push(`Row ${i + 1}: Statement_Type "${stRaw}" is not standard (BS/P&L/OCI/EQ/CF).`);
    if (nbRaw && !VALID_NB.has(nbRaw)) warnings.push(`Row ${i + 1}: Normal_Balance "${nbRaw}" should be Debit or Credit.`);
    if (!acctCode) { warnings.push(`Row ${i + 1} (Line_ID ${lineId}): Account_Code is blank.`); }
    else if (seenCodes.has(acctCode)) {
      warnings.push(`Row ${i + 1}: Account_Code "${acctCode}" duplicated (first seen on row ${seenCodes.get(acctCode)}).`);
    } else { seenCodes.set(acctCode, i + 1); }

    const cyRaw  = obj["current_year"] ?? obj["currentyear"] ?? 0;
    const pyRaw  = obj["prior_year"] ?? obj["prioryear"] ?? 0;
    const drRaw  = obj["debit_transaction_value"] ?? obj["debittransactionvalue"] ?? 0;
    const crRaw  = obj["credit_transaction_value"] ?? obj["credittransactionvalue"] ?? 0;

    if (typeof cyRaw === "string" && cyRaw !== "" && isNaN(Number(cyRaw))) errors.push(`Row ${i + 1}: Current_Year "${cyRaw}" is not numeric.`);
    if (typeof drRaw === "string" && drRaw !== "" && isNaN(Number(drRaw))) errors.push(`Row ${i + 1}: Debit_Transaction_Value "${drRaw}" is not numeric.`);

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

  if (rows.length === 0) errors.push("No financial data rows found in the template (expected from row 9 onward).");

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
router.post("/sessions/:id/parse-one-sheet-template", async (req: Request, res: Response) => {
  const sessionId = parseInt(req.params.id);
  const { fileId, persistData = true } = req.body;

  try {
    const [session] = await db.select().from(wpSessionsTable).where(eq(wpSessionsTable.id, sessionId));
    if (!session) return res.status(404).json({ error: "Session not found" });

    // Find uploaded Excel file
    let files = await db.select().from(wpUploadedFilesTable).where(eq(wpUploadedFilesTable.sessionId, sessionId));
    if (fileId) files = files.filter(f => f.id === parseInt(fileId));
    const xlFile = files.find(f => {
      const ext = (f.originalName || "").split(".").pop()?.toLowerCase();
      return ext === "xlsx" || ext === "xls" || ext === "xlsm";
    });
    if (!xlFile) return res.status(400).json({ error: "No Excel file uploaded for this session. Please upload the Financial_Data_Upload template first." });

    let wb: XLSX.WorkBook;
    try {
      if ((xlFile as any).fileData) {
        // Stored as base64 in DB
        const buf = Buffer.from((xlFile as any).fileData, "base64");
        wb = XLSX.read(buf, { type: "buffer" });
      } else {
        const filePath = `uploads/${(xlFile as any).storedName || xlFile.originalName}`;
        wb = XLSX.readFile(filePath);
      }
    } catch {
      return res.status(400).json({ error: `Cannot read file: ${xlFile.originalName}` });
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
          confidence:      "1.00",
        };
      });
      if (tbInserts.length > 0) await db.insert(wpTrialBalanceLinesTable).values(tbInserts as any);

      // ── PERSIST GL ACCOUNTS ───────────────────────────────────────────────
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

      // ── AUTO-POPULATE VARIABLES FROM TEMPLATE ─────────────────────────────
      await autoFillVariablesFromTemplate(sessionId, meta, rows, periodStart, periodEnd, engagementYear);

      // ── UPDATE AUDIT ENGINE MASTER ────────────────────────────────────────
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
          overallRiskLevel:  "Medium",
          updatedAt:    new Date(),
        };
        if (existingMaster.length > 0) {
          await db.update(auditEngineMasterTable).set(masterPayload).where(eq(auditEngineMasterTable.sessionId, sessionId));
        } else {
          await db.insert(auditEngineMasterTable).values({ ...masterPayload, createdAt: new Date() } as any);
        }
      } catch { /* audit engine table may not have all columns */ }

      // Advance session status to extraction if still at upload
      if (session.status === "upload" || !session.status) {
        await db.update(wpSessionsTable).set({ status: "extraction", updatedAt: new Date() }).where(eq(wpSessionsTable.id, sessionId));
      }
    }

    return res.json({ ...parsed, persisted: true, rowCount: rows.length });
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

// Helper: auto-fill variables from parsed template data (uses wpVariablesTable)
async function autoFillVariablesFromTemplate(
  sessionId: number, meta: ParsedTemplateMeta, rows: ParsedTemplateRow[],
  periodStart: string, periodEnd: string, engagementYear: string
) {
  try {
    // Aggregate financials from rows
    const bsRows     = rows.filter(r => r.statementType?.toUpperCase() === "BS");
    const plRows     = rows.filter(r => ["P&L","PL","INCOME","EXPENSE","EXPENSES"].includes(r.statementType?.toUpperCase() || ""));
    const assetRows  = bsRows.filter(r => r.fsSection?.toLowerCase().includes("asset"));
    const liabRows   = bsRows.filter(r => r.fsSection?.toLowerCase().includes("liabilit"));
    const equityRows = bsRows.filter(r => r.fsSection?.toLowerCase().includes("equity"));
    const revRows    = plRows.filter(r => r.fsSection?.toLowerCase().includes("revenue") || r.fsSection?.toLowerCase().includes("income"));
    const expRows    = plRows.filter(r => !r.fsSection?.toLowerCase().includes("revenue") && !r.fsSection?.toLowerCase().includes("income"));

    const totalAssets   = assetRows.reduce((s, r)  => s + r.currentYear, 0);
    const totalLiab     = liabRows.reduce((s, r)   => s + r.currentYear, 0);
    const totalEquity   = equityRows.reduce((s, r) => s + r.currentYear, 0);
    const totalRevenue  = revRows.reduce((s, r)    => s + r.currentYear, 0);
    const totalExpenses = expRows.reduce((s, r)    => s + r.currentYear, 0);
    const netProfit     = totalRevenue - totalExpenses;

    const materiality = totalRevenue > 0
      ? Math.round(totalRevenue * 0.01)
      : totalAssets > 0 ? Math.round(totalAssets * 0.005) : 0;
    const perfMat = Math.round(materiality * 0.75);
    const trivial = Math.round(materiality * 0.03);

    // Seeds keyed by variableCode (matching VARIABLE_DEFINITIONS)
    const seedsByCode: Record<string, string> = {
      "CLIENT_NAME":             meta.entityName,
      "ENTITY_NAME":             meta.entityName,
      "COMPANY_NAME":            meta.entityName,
      "ENTITY_TYPE":             meta.companyType,
      "COMPANY_TYPE":            meta.companyType,
      "INDUSTRY":                meta.industry,
      "INDUSTRY_TYPE":           meta.industry,
      "REPORTING_FRAMEWORK":     meta.reportingFramework,
      "YEAR_END":                meta.yearEnd,
      "PERIOD_END":              periodEnd,
      "PERIOD_START":            periodStart,
      "PERIOD_TO":               periodEnd,
      "PERIOD_FROM":             periodStart,
      "ENGAGEMENT_YEAR":         engagementYear,
      "AUDIT_TYPE":              meta.auditType,
      "ENGAGEMENT_TYPE":         meta.auditType,
      "CURRENCY":                meta.currency,
      "FUNCTIONAL_CURRENCY":     meta.currency,
      "ENGAGEMENT_SIZE":         meta.engagementSize,
      "TOTAL_ASSETS":            materiality > 0 ? String(Math.round(totalAssets)) : "",
      "TOTAL_LIABILITIES":       String(Math.round(totalLiab)),
      "TOTAL_EQUITY":            String(Math.round(totalEquity)),
      "TOTAL_REVENUE":           String(Math.round(totalRevenue)),
      "REVENUE":                 String(Math.round(totalRevenue)),
      "TOTAL_EXPENSES":          String(Math.round(totalExpenses)),
      "NET_PROFIT":              String(Math.round(netProfit)),
      "MATERIALITY":             materiality > 0 ? String(materiality) : "",
      "PLANNING_MATERIALITY":    materiality > 0 ? String(materiality) : "",
      "PERFORMANCE_MATERIALITY": perfMat > 0 ? String(perfMat) : "",
      "TRIVIAL_THRESHOLD":       trivial > 0 ? String(trivial) : "",
      "TRIVIALITY_THRESHOLD":    trivial > 0 ? String(trivial) : "",
    };

    // Also build name-based lookup for flexible matching
    const seedsByNameNorm: Record<string, string> = {};
    for (const [k, v] of Object.entries(seedsByCode)) {
      seedsByNameNorm[k.toLowerCase().replace(/[\s_-]/g, "_")] = v;
    }

    const existingVars = await db.select().from(wpVariablesTable).where(eq(wpVariablesTable.sessionId, sessionId));
    const existingByCode = new Map(existingVars.map(v => [v.variableCode, v]));

    for (const ev of existingVars) {
      const seedVal =
        seedsByCode[ev.variableCode] ||
        seedsByNameNorm[(ev.variableCode || "").toLowerCase().replace(/[\s_-]/g, "_")] ||
        seedsByNameNorm[(ev.variableName || "").toLowerCase().replace(/[\s_-]/g, "_")];
      if (!seedVal) continue;
      if (ev.userEditedValue || ev.isLocked) continue; // don't overwrite user edits

      await db.update(wpVariablesTable).set({
        autoFilledValue: seedVal,
        finalValue:      seedVal,
        sourceType:      "template",
        reviewStatus:    "auto_filled",
        updatedAt:       new Date(),
      }).where(eq(wpVariablesTable.id, ev.id));
    }
  } catch (err: any) {
    logger.warn({ err }, "autoFillVariablesFromTemplate partial failure");
  }
}

// ── Download Excel upload template (ExcelJS — real demo data + cell protection) ──
router.get("/download-template", async (_req: Request, res: Response) => {
  try {
    // ── Exact replica of user-provided "Financial_Data_Upload" master template ──
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

    // ── Rows 9-38: Sample data (30 rows) ─────────────────────────────────────
    // [Line_ID, Statement_Type, FS_Section, Major_Head, Line_Item, Sub_Line_Item, Account_Name, Account_Code, Note_No,
    //  Current_Year, Prior_Year, Debit_Transaction_Value, Credit_Transaction_Value, Normal_Balance,
    //  WP_Area, Risk_Level, Procedure_Scale, AI_GL_Flag, GL_Generation_Priority, Remarks]
    const sampleData: any[][] = [
      [1,"BS","Assets","Non-Current Assets","Property, plant and equipment","Land","Freehold land","1501","5",6000000,6000000,0,0,"Debit","PPE","Medium","Standard","Yes","Low","Carry forward from prior year; no movement."],
      [2,"BS","Assets","Non-Current Assets","Property, plant and equipment","Building","Factory building","1510","5",12500000,13200000,150000,850000,"Debit","PPE","Medium","Standard","Yes","Medium","Includes depreciation impact during the year."],
      [3,"BS","Assets","Non-Current Assets","Property, plant and equipment","Plant and machinery","Production machinery","1520","5",9800000,8450000,2500000,1150000,"Debit","PPE","High","Expanded","Yes","High","Significant additions and depreciation recorded."],
      [4,"BS","Assets","Non-Current Assets","Intangible assets","ERP software","ERP software","1601","6",420000,500000,0,80000,"Debit","Intangibles","Medium","Standard","No","Low","Amortising intangible asset."],
      [5,"BS","Assets","Current Assets","Inventories","Raw materials","Raw material inventory","1301","7",4180000,3600000,16500000,15920000,"Debit","Inventory","High","Expanded","Yes","High","Key area for counts and valuation testing."],
      [6,"BS","Assets","Current Assets","Inventories","Work in progress","WIP inventory","1302","7",2150000,1880000,5400000,5130000,"Debit","Inventory","High","Expanded","Yes","Medium","Requires costing and stage-of-completion reconciliation."],
      [7,"BS","Assets","Current Assets","Inventories","Finished goods","Finished goods inventory","1303","7",3320000,2950000,12450000,12080000,"Debit","Inventory","High","Expanded","Yes","Medium","Aging review and NRV testing required."],
      [8,"BS","Assets","Current Assets","Trade debts","Local customers","Trade receivables","1201","8",5875000,4960000,33350000,32435000,"Debit","Receivables","High","Expanded","Yes","High","Collections and subsequent receipts to be reviewed."],
      [9,"BS","Assets","Current Assets","Advances and deposits","Security deposits","Security deposits","1210","9",450000,450000,0,0,"Debit","Other Assets","Low","Basic","No","Low","Static balance carried forward."],
      [10,"BS","Assets","Current Assets","Cash and bank balances","Current account","MCB current account","1101","10",1860000,1420000,38900000,38460000,"Debit","Cash and Bank","Medium","Standard","Yes","High","Bank confirmation and reconciliation required."],
      [11,"BS","Equity","Equity","Share capital","Ordinary shares","Issued share capital","3101","11",10000000,10000000,0,0,"Credit","Equity","Low","Basic","No","Low","No movement during the year."],
      [12,"BS","Equity","Equity","Reserves","General reserve","General reserve","3201","11",1200000,1000000,0,200000,"Credit","Equity","Low","Basic","No","Low","Appropriation by management."],
      [13,"BS","Equity","Equity","Retained earnings","Accumulated profit","Retained earnings","3301","11",2840000,2140000,0,700000,"Credit","Equity","Low","Basic","No","Low","Net of dividend paid during the year."],
      [14,"BS","Liabilities","Non-Current Liabilities","Long-term loans","Term finance","Term finance from HBL","2101","12",3500000,4200000,700000,0,"Credit","Borrowings","High","Expanded","Yes","High","Confirm loan repayment schedule and covenant compliance."],
      [15,"BS","Liabilities","Non-Current Liabilities","Deferred tax","Deferred tax liability","Deferred tax liability","2201","13",620000,480000,0,140000,"Credit","Taxation","Medium","Standard","No","Low","Calculate temporary difference and effective tax rate."],
      [16,"BS","Liabilities","Current Liabilities","Trade and other payables","Suppliers","Trade payables","2301","14",980000,760000,760000,980000,"Credit","Payables","Medium","Standard","No","Low","Year-end accruals and cut-off testing required."],
      [17,"BS","Liabilities","Current Liabilities","Taxation","Income tax payable","Income tax payable","2201","14",650000,540000,540000,650000,"Credit","Taxation","Medium","Standard","No","Low","Reconcile with current tax computation."],
      [18,"BS","Liabilities","Current Liabilities","Short-term borrowings","Running finance","Running finance","2301","15",1750000,900000,4250000,5100000,"Credit","Borrowings","High","Expanded","Yes","Medium","Obtain bank statement and draw-down schedule."],
      [19,"P&L","Income","Revenue","Sales","Local sales","Local product sales","5101","16",18200000,15800000,350000,18550000,"Credit","Revenue","High","Expanded","Yes","High","High-risk area; cut-off and completeness testing."],
      [20,"P&L","Income","Revenue","Sales","Export sales","Export product sales","5102","16",4850000,3960000,50000,4900000,"Credit","Revenue","High","Expanded","Yes","High","Foreign customer sales subject to cut-off review."],
      [21,"P&L","Income","Other income","Scrap sales","Scrap sales","Scrap sales","5201","17",420000,300000,5000,425000,"Credit","Other Income","Low","Basic","No","Low","Ancillary income stream."],
      [22,"P&L","Expenses","Cost of Sales","Direct material","Raw material consumed","Raw material consumed","6101","18",14500000,12800000,14500000,0,"Debit","Cost of Sales","High","Expanded","Yes","High","Tie to purchases and inventory movement."],
      [23,"P&L","Expenses","Cost of Sales","Direct labour","Factory wages","Factory wages","6102","18",3200000,2850000,3200000,0,"Debit","Cost of Sales","High","Expanded","Yes","Medium","Payroll testing required."],
      [24,"P&L","Expenses","Cost of Sales","Manufacturing overhead","Factory utilities","Factory utilities","6103","18",2150000,1980000,2150000,0,"Debit","Cost of Sales","Medium","Standard","Yes","Medium","Analytical procedures useful."],
      [25,"P&L","Expenses","Administrative Expenses","Salaries and benefits","Admin salaries","Admin salaries","6201","19",2450000,2240000,2450000,0,"Debit","Operating Expenses","Medium","Standard","Yes","Medium","Monthly payroll analytics to be prepared."],
      [26,"P&L","Expenses","Administrative Expenses","Utilities","Office utilities","Office utilities","6202","19",340000,315000,340000,0,"Debit","Operating Expenses","Low","Basic","No","Low","Routine expense."],
      [27,"P&L","Expenses","Administrative Expenses","Depreciation","Depreciation expense","Depreciation expense","6203","19",980000,910000,980000,0,"Debit","PPE","Medium","Standard","No","Low","Link with fixed asset register."],
      [28,"P&L","Expenses","Selling and Distribution","Freight outward","Delivery expense","Delivery expense","6301","20",560000,490000,560000,0,"Debit","Operating Expenses","Low","Basic","No","Low","Sample of freight invoices may suffice."],
      [29,"P&L","Expenses","Finance Cost","Markup on borrowings","Bank markup","Markup on term finance","6401","21",870000,795000,870000,0,"Debit","Borrowings","Medium","Standard","No","Low","Recompute finance charges."],
      [30,"P&L","Expenses","Taxation","Current tax","Current tax expense","Current tax expense","6501","22",1150000,980000,1150000,0,"Debit","Taxation","Medium","Standard","No","Low","Link to tax provision sheet."],
    ];

    for (let i = 0; i < sampleData.length; i++) {
      const row = sampleData[i];
      const r = ws.getRow(9 + i);
      r.height = 18;
      // Cols A-I: plain (no fill)
      for (let c = 0; c < 9; c++) cellPlain(r.getCell(c + 1), row[c]);
      // Cols J-M: green editable (indices 9-12)
      for (let c = 9; c <= 12; c++) cellGreen(r.getCell(c + 1), row[c], "#,##0");
      // Cols N-T: plain (indices 13-19)
      for (let c = 13; c <= 19; c++) cellPlain(r.getCell(c + 1), row[c]);
    }

    // ── DATA VALIDATIONS (dropdowns) ─────────────────────────────────────────
    // Helper to apply a dropdown list to a cell address
    function addDropdown(addr: string, values: string[], title: string, msg: string) {
      (ws as any).dataValidations.add(addr, {
        type: "list",
        allowBlank: true,
        formulae: [`"${values.join(",")}"`],
        showErrorMessage: true,
        errorStyle: "warning",
        errorTitle: `Invalid ${title}`,
        error: `Please select a valid value: ${values.join(", ")}`,
        showInputMessage: true,
        promptTitle: title,
        prompt: msg,
      });
    }

    // ── Engagement profile dropdowns ──────────────────────────────────────────

    // Row 5 E: Company_Type
    addDropdown("E5", [
      "Private Company","Public Company","Listed Company",
      "Sole Proprietorship","Partnership","Trust","NGO","Other"
    ], "Company_Type", "Select the legal type of the entity");

    // Row 5 H: Industry
    addDropdown("H5", [
      "Manufacturing","Trading","Services","Financial Services",
      "Real Estate","Healthcare","Technology","Education","Agriculture","Energy","Other"
    ], "Industry", "Select the primary industry sector");

    // Row 5 K: Reporting_Framework
    addDropdown("K5", [
      "IFRS","IFRS for SMEs","GAAP","IFAS","Companies Act 2017","Other"
    ], "Reporting_Framework", "Select the applicable financial reporting framework");

    // Row 6 B: Audit_Type
    addDropdown("B6", [
      "Statutory Audit","Tax Audit","Internal Audit",
      "Special Purpose Audit","Review Engagement",
      "Agreed Upon Procedures","Compilation"
    ], "Audit_Type", "Select the type of engagement");

    // Row 6 E: Currency
    addDropdown("E6", [
      "PKR","USD","EUR","GBP","AED","SAR","JPY","CNY","Other"
    ], "Currency", "Select the functional currency of the entity");

    // Row 6 H: Engagement_Size
    addDropdown("H6", [
      "Small","Medium","Large","Very Large"
    ], "Engagement_Size", "Select the engagement size classification");

    // ── Data row dropdowns (rows 9 to 38) ────────────────────────────────────
    const DATA_ROWS = "9:38";

    // Col B — Statement_Type
    addDropdown(`B${DATA_ROWS.split(":")[0]}:B${DATA_ROWS.split(":")[1]}`, [
      "BS","P&L","OCI","EQ","CF"
    ], "Statement_Type", "BS=Balance Sheet, P&L=Profit & Loss, OCI=Other Comprehensive Income, EQ=Equity, CF=Cash Flow");

    // Col C — FS_Section
    addDropdown(`C${DATA_ROWS.split(":")[0]}:C${DATA_ROWS.split(":")[1]}`, [
      "Assets","Equity","Liabilities","Income","Expenses","OCI","Notes"
    ], "FS_Section", "Select the financial statement section this line belongs to");

    // Col D — Major_Head
    addDropdown(`D${DATA_ROWS.split(":")[0]}:D${DATA_ROWS.split(":")[1]}`, [
      "Non-Current Assets","Current Assets",
      "Equity",
      "Non-Current Liabilities","Current Liabilities",
      "Revenue","Other income",
      "Cost of Sales","Gross Profit",
      "Administrative Expenses","Selling and Distribution",
      "Finance Cost","Taxation","Other Expenses"
    ], "Major_Head", "Select the major classification head for this line item");

    // Col N — Normal_Balance
    addDropdown(`N${DATA_ROWS.split(":")[0]}:N${DATA_ROWS.split(":")[1]}`, [
      "Debit","Credit"
    ], "Normal_Balance", "Select the normal balance side for this account");

    // Col O — WP_Area
    addDropdown(`O${DATA_ROWS.split(":")[0]}:O${DATA_ROWS.split(":")[1]}`, [
      "PPE","Intangibles","Inventory","Receivables","Cash and Bank",
      "Other Assets","Equity","Borrowings","Payables","Taxation",
      "Revenue","Cost of Sales","Operating Expenses","Other Income","Provisions"
    ], "WP_Area", "Select the audit working paper area this line maps to");

    // Col P — Risk_Level
    addDropdown(`P${DATA_ROWS.split(":")[0]}:P${DATA_ROWS.split(":")[1]}`, [
      "High","Medium","Low"
    ], "Risk_Level", "Select the assessed risk level for this account");

    // Col Q — Procedure_Scale
    addDropdown(`Q${DATA_ROWS.split(":")[0]}:Q${DATA_ROWS.split(":")[1]}`, [
      "Expanded","Standard","Basic"
    ], "Procedure_Scale", "Select the extent of audit procedures to be applied");

    // Col R — AI_GL_Flag
    addDropdown(`R${DATA_ROWS.split(":")[0]}:R${DATA_ROWS.split(":")[1]}`, [
      "Yes","No"
    ], "AI_GL_Flag", "Yes = AI should generate detailed GL transactions for this account");

    // Col S — GL_Generation_Priority
    addDropdown(`S${DATA_ROWS.split(":")[0]}:S${DATA_ROWS.split(":")[1]}`, [
      "High","Medium","Low"
    ], "GL_Generation_Priority", "Select the priority order for GL transaction generation");

    // ── Hidden "Lists" sheet for long-list dropdowns (E, F, G) ───────────────
    // Excel inline formula is capped at 255 chars; use a sheet range instead.
    const wsList = wb.addWorksheet("Lists");
    wsList.state = "veryHidden";

    const lineItems = [
      "Property, plant and equipment","Intangible assets","Long-term investments",
      "Long-term loans and advances","Capital work in progress",
      "Inventories","Trade debts","Advances and deposits","Other receivables",
      "Short-term investments","Cash and bank balances",
      "Share capital","Reserves","Retained earnings","Surplus on revaluation",
      "Long-term loans","Lease liabilities","Deferred tax","Staff retirement benefits",
      "Trade and other payables","Accrued liabilities","Taxation",
      "Short-term borrowings","Current portion of long-term loans",
      "Sales","Export sales","Scrap sales","Other income","Dividend income",
      "Direct material","Direct labour","Manufacturing overhead",
      "Salaries and benefits","Utilities","Rent and rates","Depreciation",
      "Amortisation","Repair and maintenance","Printing and stationery",
      "Communication expenses","Advertisement and marketing",
      "Freight outward","Traveling and conveyance",
      "Markup on borrowings","Bank charges","Exchange loss",
      "Current tax","Deferred tax expense",
    ];

    const subLineItems = [
      "Land","Building","Plant and machinery","Furniture and fixtures",
      "Office equipment","IT equipment","Vehicles","Machinery under installation",
      "Capital work in progress",
      "ERP software","Patents and trademarks","Licenses and franchises",
      "Raw materials","Work in progress","Finished goods","Stores and spares",
      "Packing materials",
      "Local customers","Export customers","Government receivables",
      "Security deposits","Prepayments","Advances to suppliers",
      "Current account","Savings account","Cash in hand","Foreign currency account",
      "Ordinary shares","Preference shares",
      "General reserve","Capital reserve","Revenue reserve",
      "Accumulated profit","Accumulated loss",
      "Surplus on revaluation of fixed assets",
      "Term finance","Diminishing musharaka","Loan from directors",
      "Deferred tax liability","Deferred tax asset",
      "Gratuity","Provident fund",
      "Suppliers","Accrued expenses","Other payables","Advance from customers",
      "Income tax payable","Sales tax payable","Withholding tax payable",
      "Running finance","Short-term loan","Cash credit",
      "Current maturity of long-term loan",
      "Local sales","Export sales","Service revenue","Contract revenue",
      "Scrap sales","By-product sales",
      "Interest income","Gain on disposal","Rental income",
      "Raw material consumed","Purchases","Freight inward",
      "Factory wages","Factory salaries",
      "Factory utilities","Factory rent","Factory insurance",
      "Admin salaries","Admin wages",
      "Office utilities","Office rent","Office insurance",
      "Depreciation expense","Amortisation expense",
      "Delivery expense","Forwarding expense",
      "Bank markup","Mark-up on running finance",
      "Current tax expense","Prior year tax adjustment",
      "Deferred tax income","Deferred tax charge",
    ];

    const accountNames = [
      "Freehold land","Leasehold land","Factory building","Office building",
      "Production machinery","Manufacturing equipment","Testing equipment",
      "Office furniture","Computer equipment","Servers and networking",
      "Motor vehicles","Fork lifts","Capital work in progress",
      "ERP software","Accounting software",
      "Raw material inventory","WIP inventory","Finished goods inventory",
      "Stores inventory","Packing material stock",
      "Trade receivables","Export receivables",
      "Security deposits","Prepaid insurance","Prepaid rent",
      "Advances to suppliers","Staff advances",
      "Current bank account","Savings bank account",
      "Petty cash","Foreign currency account",
      "Issued and paid-up share capital","Ordinary share capital",
      "General reserve","Capital reserve",
      "Retained earnings","Accumulated losses",
      "Revaluation surplus",
      "Term finance from bank","Diminishing musharaka","Directors loan",
      "Deferred tax liability","Deferred tax asset",
      "Gratuity payable","Provident fund payable",
      "Trade payables","Accrued expenses","Customer advances",
      "Income tax payable","Sales tax payable","WHT payable",
      "Running finance facility","Cash credit facility",
      "Sales revenue","Export revenue","Service fee revenue",
      "Scrap and by-product income","Miscellaneous income",
      "Profit on disposal of assets","Interest income",
      "Cost of raw material consumed","Material purchases",
      "Direct labour cost","Factory wages","Factory salaries",
      "Factory overhead — utilities","Factory overhead — rent",
      "Factory overhead — insurance","Factory overhead — repairs",
      "Administrative salaries","Staff benefits",
      "Office expenses","Printing and stationery",
      "Depreciation — buildings","Depreciation — plant and machinery",
      "Depreciation — vehicles","Amortisation — intangibles",
      "Freight and forwarding","Distribution expenses",
      "Mark-up on term finance","Mark-up on running finance",
      "Bank charges and commission",
      "Current tax provision","Deferred tax charge","Deferred tax income",
    ];

    // Account codes — standard chart of accounts (Pakistani CA firm)
    const accountCodes = [
      // Cash & Bank (11xx)
      "1101","1102","1103","1104","1105",
      // Trade Receivables (12xx)
      "1201","1202","1203","1210","1211","1215","1220","1230","1240",
      // Inventories (13xx)
      "1301","1302","1303","1304","1305","1310","1320",
      // Advances & Deposits (14xx)
      "1401","1402","1410","1420","1430",
      // PPE (15xx)
      "1501","1502","1510","1511","1520","1521","1530","1540","1550","1560","1570","1580","1590",
      // Intangibles (16xx)
      "1601","1602","1610","1620",
      // Long-term Investments (17xx)
      "1701","1710",
      // Long-term Loans & Deposits (18xx)
      "1801","1810",
      // Long-term Liabilities (21xx)
      "2101","2102","2110","2120",
      // Deferred Tax & Provisions (22xx)
      "2201","2202","2210","2220",
      // Trade & Other Payables (23xx)
      "2301","2302","2310","2320","2330","2340","2350",
      // Short-term Borrowings (24xx)
      "2401","2410","2420",
      // Current Tax (25xx)
      "2501","2510",
      // Share Capital (31xx)
      "3101","3102","3110",
      // Reserves (32xx)
      "3201","3202","3210","3220","3230",
      // Retained Earnings (33xx)
      "3301","3310",
      // Revenue (51xx)
      "5101","5102","5103","5110","5120",
      // Other Income (52xx)
      "5201","5202","5210","5220","5230",
      // Cost of Sales (61xx)
      "6101","6102","6103","6104","6110","6120","6130",
      // Admin & Gen Expenses (62xx)
      "6201","6202","6203","6204","6210","6220","6230","6240","6250","6260",
      // Selling & Distribution (63xx)
      "6301","6302","6310","6320",
      // Finance Cost (64xx)
      "6401","6402","6410","6420",
      // Taxation (65xx)
      "6501","6502","6510",
    ];

    // Write lists to hidden sheet (A=Line_Item, B=Sub_Line_Item, C=Account_Name, D=Account_Code)
    const maxRows = Math.max(lineItems.length, subLineItems.length, accountNames.length, accountCodes.length);
    for (let r = 0; r < maxRows; r++) {
      const row = wsList.getRow(r + 1);
      if (lineItems[r])    row.getCell(1).value = lineItems[r];
      if (subLineItems[r]) row.getCell(2).value = subLineItems[r];
      if (accountNames[r]) row.getCell(3).value = accountNames[r];
      if (accountCodes[r]) row.getCell(4).value = accountCodes[r];
    }

    const D0 = DATA_ROWS.split(":")[0];
    const D1 = DATA_ROWS.split(":")[1];

    // Col E — Line_Item  (range reference to Lists!$A$1:$A$N)
    ws.dataValidations.add(`E${D0}:E${D1}`, {
      type: "list", allowBlank: true,
      formulae: [`Lists!$A$1:$A${lineItems.length}`],
      showErrorMessage: true, errorStyle: "warning",
      errorTitle: "Invalid Line_Item", error: "Please select or type a valid line item",
      showInputMessage: true, promptTitle: "Line_Item",
      prompt: "Select from the list or type a custom value",
    });

    // Col F — Sub_Line_Item
    ws.dataValidations.add(`F${D0}:F${D1}`, {
      type: "list", allowBlank: true,
      formulae: [`Lists!$B$1:$B${subLineItems.length}`],
      showErrorMessage: true, errorStyle: "warning",
      errorTitle: "Invalid Sub_Line_Item", error: "Please select or type a valid sub-line",
      showInputMessage: true, promptTitle: "Sub_Line_Item",
      prompt: "Select from the list or type a custom value",
    });

    // Col G — Account_Name
    ws.dataValidations.add(`G${D0}:G${D1}`, {
      type: "list", allowBlank: true,
      formulae: [`Lists!$C$1:$C${accountNames.length}`],
      showErrorMessage: true, errorStyle: "warning",
      errorTitle: "Invalid Account_Name", error: "Please select or type a valid account name",
      showInputMessage: true, promptTitle: "Account_Name",
      prompt: "Select from the list or type a custom account name",
    });

    // Col H — Account_Code
    ws.dataValidations.add(`H${D0}:H${D1}`, {
      type: "list", allowBlank: true,
      formulae: [`Lists!$D$1:$D${accountCodes.length}`],
      showErrorMessage: true, errorStyle: "warning",
      errorTitle: "Invalid Account_Code", error: "Please select a valid account code",
      showInputMessage: true, promptTitle: "Account_Code",
      prompt: "Select from the standard chart of accounts or enter a custom code",
    });

    // Col I — Note_No (inline list 1–35)
    ws.dataValidations.add(`I${D0}:I${D1}`, {
      type: "list", allowBlank: true,
      formulae: ['"1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35"'],
      showErrorMessage: true, errorStyle: "warning",
      errorTitle: "Invalid Note_No", error: "Please select a note number between 1 and 35",
      showInputMessage: true, promptTitle: "Note_No",
      prompt: "Select the financial statement note number (1–35)",
    });

    // ── Row 39: Totals ────────────────────────────────────────────────────────
    const totRow = 39;
    ws.getRow(totRow).height = 20;
    const totals = [143330000, 130430000, 171380000, 178410000];
    const tCell = ws.getRow(totRow).getCell(1);
    tCell.value = "Total";
    tCell.font = { bold: true, size: 10, name: "Calibri" };
    tCell.alignment = { vertical: "middle" };
    ws.mergeCells(totRow, 1, totRow, 9);
    // J, K, L, M totals
    for (let c = 0; c < 4; c++) {
      const tc = ws.getRow(totRow).getCell(10 + c);
      tc.value = totals[c];
      tc.font = { bold: true, size: 10, name: "Calibri" };
      tc.numFmt = "#,##0";
      tc.alignment = { vertical: "middle", horizontal: "right" };
    }

    // Write to buffer first — stream writing skips dataValidation XML sections
    const buf = await wb.xlsx.writeBuffer();
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", 'attachment; filename="Financial_Data_Upload_Template.xlsx"');
    res.setHeader("Content-Length", buf.byteLength);
    return res.end(Buffer.from(buf));
  } catch (err: any) {
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
      await ws.protect("", {
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
    res.status(500).json({ error: err.message });
  }
});

export default router;
