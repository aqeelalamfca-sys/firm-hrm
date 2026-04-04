import { Router, type Request, type Response } from "express";
import multer from "multer";
import { logger } from "../lib/logger";
import { db } from "@workspace/db";
import {
  systemSettingsTable,
  wpSessionsTable, wpUploadedFilesTable, wpExtractionRunsTable,
  wpExtractedFieldsTable, wpArrangedDataTable, wpVariablesTable,
  wpVariableChangeLogTable, wpExceptionLogTable, wpTrialBalanceLinesTable,
  wpGlAccountsTable, wpGlEntriesTable, wpHeadsTable, wpHeadDocumentsTable,
  wpExportJobsTable, wpVariableDefinitionsTable, wpVariableDependencyRulesTable,
} from "@workspace/db";
import { VARIABLE_DEFINITIONS, EXTRACTION_FIELD_TO_VARIABLE_MAP, VARIABLE_GROUPS, DEPENDENCY_RULES } from "../data/variable-definitions";
import { eq, and, inArray, asc } from "drizzle-orm";
import OpenAI from "openai";
import PDFDocument from "pdfkit";
// @ts-ignore
import pdfParse from "pdf-parse";
import * as XLSX from "xlsx";
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell,
  WidthType, AlignmentType, BorderStyle, ShadingType, PageBreak,
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

router.post("/sessions", async (req: Request, res: Response) => {
  try {
    const { clientName, engagementYear, entityType, ntn, strn, periodStart, periodEnd, reportingFramework, engagementType } = req.body;
    if (!clientName || !engagementYear || !entityType || !ntn || !periodStart || !periodEnd || !reportingFramework || !engagementType) {
      return res.status(400).json({ error: "All fields are required except STRN" });
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
    const validStatuses = ["upload", "extraction", "arranged_data", "variables", "generation", "export", "completed"];
    if (!validStatuses.includes(status)) return res.status(400).json({ error: "Invalid status" });

    const validTransitions: Record<string, string[]> = {
      upload: ["extraction"],
      extraction: ["arranged_data", "upload"],
      arranged_data: ["variables"],
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

    sessionMetaMap["first_year_audit"] = "false";
    sessionMetaMap["recurring_engagement"] = "true";

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
    sessionMetaMap["engagement_partner"] = "To be assigned";
    sessionMetaMap["materiality_basis_amount"] = "0";
    sessionMetaMap["overall_materiality_amount"] = "0";
    sessionMetaMap["performance_materiality_amount"] = "0";
    sessionMetaMap["trivial_threshold_amount"] = "0";
    sessionMetaMap["significant_risk_areas"] = "Revenue recognition (ISA 240 presumed risk), Management override of controls (ISA 240.31)";
    sessionMetaMap["audit_opinion"] = "Unmodified";
    sessionMetaMap["report_date"] = session.periodEnd || "";
    sessionMetaMap["signing_partner_name"] = "To be assigned";

    sessionMetaMap["manual_or_system"] = "Semi-Automated";
    sessionMetaMap["account_type"] = "4-digit COA";
    sessionMetaMap["account_classification"] = "false";

    sessionMetaMap["number_of_shareholders"] = "0";
    sessionMetaMap["number_of_directors"] = "0";

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

    for (const [code, value] of Object.entries(sessionMetaMap)) {
      extractedMap[code] = { value, confidence: "100" };
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
          await db.update(wpVariablesTable).set({
            autoFilledValue: extracted.value,
            rawExtractedValue: extracted.value,
            finalValue: extracted.value,
            confidence: extracted.confidence,
            sourceType: "ai_extraction",
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

      const value = extracted?.value || def.defaultValue || null;
      const conf = extracted ? extracted.confidence : (def.defaultValue ? "100" : null);

      const [v] = await db.insert(wpVariablesTable).values({
        sessionId,
        variableCode: def.variableCode,
        category: def.variableGroup,
        variableName: def.variableName,
        autoFilledValue: extracted?.value || null,
        rawExtractedValue: extracted?.value || null,
        finalValue: value,
        confidence: conf,
        sourceType: extracted ? "ai_extraction" : (def.defaultValue ? "default" : null),
        sourceSheet: extracted?.sourceSheet || null,
        sourcePage: extracted?.sourcePage || null,
        reviewStatus: def.reviewRequiredFlag ? "needs_review" : (extracted ? "auto_filled" : "pending"),
      }).returning();
      results.push(v);
      created++;
    }

    await db.update(wpSessionsTable).set({ status: "variables" as any, updatedAt: new Date() }).where(eq(wpSessionsTable.id, sessionId));

    const missingMandatory = VARIABLE_DEFINITIONS.filter(d => d.mandatoryFlag && !extractedMap[d.variableCode] && !d.defaultValue);
    for (const mm of missingMandatory) {
      const existingException = await db.select().from(wpExceptionLogTable).where(
        and(eq(wpExceptionLogTable.sessionId, sessionId), eq(wpExceptionLogTable.title, `Missing mandatory: ${mm.variableLabel}`))
      );
      if (existingException.length === 0) {
        await db.insert(wpExceptionLogTable).values({
          sessionId, exceptionType: "missing_variable", severity: "high",
          title: `Missing mandatory: ${mm.variableLabel}`,
          description: `Variable ${mm.variableCode} (${mm.variableGroup}) is mandatory but has no value.`,
          status: "open",
        });
      }
    }

    const lowConfVars = Object.entries(extractedMap).filter(([_, v]) => Number(v.confidence) < 70);
    for (const [code, val] of lowConfVars) {
      const def = VARIABLE_DEFINITIONS.find(d => d.variableCode === code);
      if (def) {
        await db.insert(wpExceptionLogTable).values({
          sessionId, exceptionType: "low_confidence", severity: "medium",
          title: `Low confidence: ${def.variableLabel}`,
          description: `Variable ${code} has confidence ${val.confidence}%. Review recommended.`,
          status: "open",
        });
      }
    }

    res.json({ created, updated, skipped, total: VARIABLE_DEFINITIONS.length, missingMandatory: missingMandatory.length });
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
      if (v.finalValue) grouped[grp].stats.filled++;
      else grouped[grp].stats.missing++;
      if (v.confidence && Number(v.confidence) < 70) grouped[grp].stats.lowConf++;
      if (v.isLocked) grouped[grp].stats.locked++;
      if (v.reviewStatus === "needs_review") grouped[grp].stats.needsReview++;
    }

    const totalStats = {
      total: variables.length,
      filled: variables.filter(v => v.finalValue).length,
      missing: variables.filter(v => !v.finalValue).length,
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
// TRIAL BALANCE ENGINE — RULE-BASED FIRST, AI-ASSISTED SECOND
// ═══════════════════════════════════════════════════════════════════════════

router.post("/sessions/:id/generate-tb", async (req: Request, res: Response) => {
  try {
    const sessionId = parseInt(req.params.id);

    const deps = await checkDependencies(sessionId, 0);
    if (!deps.satisfied) return res.status(400).json({ error: `Prerequisites not met: ${deps.missing.join(", ")}` });

    const fields = await db.select().from(wpExtractedFieldsTable).where(and(eq(wpExtractedFieldsTable.sessionId, sessionId), eq(wpExtractedFieldsTable.category, "TB Lines")));
    const fsFields = await db.select().from(wpExtractedFieldsTable).where(and(eq(wpExtractedFieldsTable.sessionId, sessionId), eq(wpExtractedFieldsTable.category, "FS Line Items")));

    let tbLines: any[] = [];
    const exceptions: string[] = [];

    if (fields.length > 0) {
      for (const f of fields) {
        try {
          const line = JSON.parse(f.extractedValue || "{}");
          tbLines.push({
            accountCode: line.account_code || "0000",
            accountName: line.account_name || "Unknown",
            classification: line.classification || "Other",
            debit: String(line.debit || 0),
            credit: String(line.credit || 0),
            balance: String((line.debit || 0) - (line.credit || 0)),
            source: "extraction",
            confidence: f.confidence || "85",
          });
        } catch {}
      }
    }

    if (tbLines.length === 0 && fsFields.length > 0) {
      const fsMap: Record<string, number> = {};
      for (const f of fsFields) {
        fsMap[f.fieldName] = Number(f.finalValue || f.extractedValue || 0);
      }
      tbLines = buildTBFromFS(fsMap);

      if (tbLines.length > 0) {
        exceptions.push("TB reconstructed from FS data — not extracted from source TB document");
      }
    }

    if (tbLines.length === 0) {
      const ai = await getAIClient();
      if (ai) {
        const vars = await db.select().from(wpVariablesTable).where(eq(wpVariablesTable.sessionId, sessionId));
        const varSummary = vars.map(v => `${v.variableName}: ${v.finalValue}`).join("\n");

        const resp = await ai.client.chat.completions.create({
          model: ai.model,
          messages: [
            { role: "system", content: "Generate a Trial Balance from the provided financial variables. Return JSON array of {account_code, account_name, debit, credit, classification}. Follow Pakistan 4-digit chart of accounts. MUST balance (total debits = total credits)." },
            { role: "user", content: `Generate TB from:\n${varSummary}` },
          ],
          max_tokens: 4000, temperature: 0.2,
          response_format: { type: "json_object" },
        });

        const raw = JSON.parse(resp.choices[0]?.message?.content || "{}");
        const aiLines = raw.tb_lines || raw.lines || [];
        tbLines = aiLines.map((l: any) => ({
          accountCode: l.account_code || "0000",
          accountName: l.account_name || "Unknown",
          classification: l.classification || "Other",
          debit: String(l.debit || 0),
          credit: String(l.credit || 0),
          balance: String((l.debit || 0) - (l.credit || 0)),
          source: "ai_generated",
          confidence: "70",
        }));
        exceptions.push("TB generated via AI — requires manual review");
      }
    }

    const totalDebit = tbLines.reduce((s: number, l: any) => s + Number(l.debit || 0), 0);
    const totalCredit = tbLines.reduce((s: number, l: any) => s + Number(l.credit || 0), 0);
    const difference = Math.abs(totalDebit - totalCredit);

    if (difference > 0.01) {
      exceptions.push(`TB DOES NOT BALANCE: Debits=${totalDebit.toFixed(2)}, Credits=${totalCredit.toFixed(2)}, Difference=${difference.toFixed(2)}`);
      await db.insert(wpExceptionLogTable).values({
        sessionId, headIndex: 0, exceptionType: "tb_imbalance",
        severity: "critical", title: "Trial Balance Does Not Balance",
        description: `Total Debits: ${totalDebit.toFixed(2)}, Total Credits: ${totalCredit.toFixed(2)}, Difference: ${difference.toFixed(2)}. This MUST be resolved before proceeding.`,
        status: "open",
      });
    }

    await db.delete(wpTrialBalanceLinesTable).where(eq(wpTrialBalanceLinesTable.sessionId, sessionId));
    for (const line of tbLines) {
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
        hasException: difference > 0.01,
      });
    }

    for (const exc of exceptions) {
      if (!exc.includes("DOES NOT BALANCE")) {
        await db.insert(wpExceptionLogTable).values({
          sessionId, headIndex: 0, exceptionType: "tb_note",
          severity: "medium", title: "TB Generation Note", description: exc, status: "open",
        });
      }
    }

    const head = await db.select().from(wpHeadsTable).where(and(eq(wpHeadsTable.sessionId, sessionId), eq(wpHeadsTable.headIndex, 0)));
    if (head[0]) {
      await db.update(wpHeadsTable).set({
        status: "validating", generatedAt: new Date(), updatedAt: new Date(),
        exceptionsCount: exceptions.length,
      }).where(eq(wpHeadsTable.id, head[0].id));
    }

    res.json({
      tbLines, totalDebit, totalCredit, difference, balanced: difference < 0.01,
      exceptions, lineCount: tbLines.length,
    });
  } catch (err: any) {
    logger.error({ err }, "TB generation failed");
    res.status(500).json({ error: "TB generation failed" });
  }
});

function buildTBFromFS(fs: Record<string, number>): any[] {
  const lines: any[] = [];
  const addLine = (code: string, name: string, cls: string, amount: number) => {
    if (!amount) return;
    lines.push({
      accountCode: code, accountName: name, classification: cls,
      debit: amount > 0 ? String(amount) : "0",
      credit: amount < 0 ? String(Math.abs(amount)) : "0",
      balance: String(amount), source: "deterministic", confidence: "90",
    });
  };
  addLine("1100", "Fixed Assets", "Asset", fs.fixed_assets || 0);
  addLine("1200", "Intangible Assets", "Asset", fs.intangible_assets || 0);
  addLine("1300", "Long Term Investments", "Asset", fs.long_term_investments || 0);
  addLine("1400", "Inventory", "Asset", fs.inventory || 0);
  addLine("1500", "Trade Receivables", "Asset", fs.trade_receivables || 0);
  addLine("1600", "Advances & Deposits", "Asset", fs.advances_deposits || 0);
  addLine("1700", "Cash & Bank", "Asset", fs.cash_and_bank || 0);
  addLine("2100", "Long Term Loans", "Liability", -(fs.long_term_loans || 0));
  addLine("2200", "Trade Payables", "Liability", -(fs.trade_payables || 0));
  addLine("2300", "Short Term Borrowings", "Liability", -(fs.short_term_borrowings || 0));
  addLine("2400", "Accrued Liabilities", "Liability", -(fs.accrued_liabilities || 0));
  addLine("2500", "Tax Payable", "Liability", -(fs.tax_payable || 0));
  addLine("3100", "Share Capital", "Equity", -(fs.share_capital || 0));
  addLine("3200", "Retained Earnings", "Equity", -(fs.retained_earnings || 0));
  addLine("3300", "Reserves", "Equity", -(fs.reserves || 0));
  addLine("4100", "Revenue", "Revenue", -(fs.revenue || 0));
  addLine("5100", "Cost of Sales", "Expense", fs.cost_of_sales || 0);
  addLine("5200", "Operating Expenses", "Expense", fs.operating_expenses || 0);
  addLine("5300", "Finance Cost", "Expense", fs.finance_cost || 0);
  addLine("5400", "Tax Expense", "Expense", fs.tax_expense || 0);
  return lines;
}


// ═══════════════════════════════════════════════════════════════════════════
// GL ENGINE — WITH AUDIT CONTROLS
// ═══════════════════════════════════════════════════════════════════════════

router.post("/sessions/:id/generate-gl", async (req: Request, res: Response) => {
  try {
    const sessionId = parseInt(req.params.id);

    const deps = await checkDependencies(sessionId, 1);
    if (!deps.satisfied) return res.status(400).json({ error: `Prerequisites not met: ${deps.missing.join(", ")}` });

    const tbLines = await db.select().from(wpTrialBalanceLinesTable).where(eq(wpTrialBalanceLinesTable.sessionId, sessionId));
    if (tbLines.length === 0) return res.status(400).json({ error: "TB must be generated first" });

    const ai = await getAIClient();
    if (!ai) return res.status(503).json({ error: "AI service not configured" });

    const session = (await db.select().from(wpSessionsTable).where(eq(wpSessionsTable.id, sessionId)))[0];

    await db.delete(wpGlEntriesTable).where(eq(wpGlEntriesTable.sessionId, sessionId));
    await db.delete(wpGlAccountsTable).where(eq(wpGlAccountsTable.sessionId, sessionId));

    const exceptions: string[] = [];
    const accounts: any[] = [];

    const batchSize = 6;
    for (let i = 0; i < tbLines.length; i += batchSize) {
      const batch = tbLines.slice(i, i + batchSize);
      const batchSummary = batch.map(l =>
        `${l.accountCode} ${l.accountName}: Dr=${l.debit} Cr=${l.credit} (${l.classification})`
      ).join("\n");

      const yearEnd = session?.engagementYear || "2024";

      const glPrompt = `Generate realistic General Ledger entries for these Trial Balance accounts for the year ending ${yearEnd}.

ACCOUNTS:
${batchSummary}

RULES:
1. Opening balance carried from prior year (use 0 if not available)
2. Monthly transaction spread based on account nature
3. Voucher sequence: JV-001, JV-002, etc. (continuous within each account)
4. Debit/credit logic must match account type
5. Closing balance MUST match TB balance exactly
6. Total debits and credits per account must match TB turnover exactly
7. Spread transactions across 12 months realistically
8. Each account needs 8-20 realistic journal entries

Return JSON:
{
  "accounts": [
    {
      "account_code": string,
      "account_name": string,
      "account_type": string,
      "opening_balance": number,
      "entries": [
        {"date":"YYYY-MM-DD","voucher":"JV-NNN","narration":string,"debit":number,"credit":number,"month":number}
      ],
      "closing_balance": number,
      "total_debit": number,
      "total_credit": number,
      "is_synthetic": boolean,
      "rationale": string,
      "transaction_count_note": string
    }
  ]
}`;

      try {
        const resp = await ai.client.chat.completions.create({
          model: ai.model,
          messages: [
            { role: "system", content: "Generate audit-grade General Ledger entries. Each account closing balance must match TB exactly. Return valid JSON only." },
            { role: "user", content: glPrompt },
          ],
          max_tokens: 6000, temperature: 0.3,
          response_format: { type: "json_object" },
        });

        const raw = JSON.parse(resp.choices[0]?.message?.content || "{}");
        const glAccounts = raw.accounts || [];

        for (const acc of glAccounts) {
          const tbLine = batch.find(l => l.accountCode === acc.account_code);
          const tbBalance = tbLine ? Number(tbLine.debit) - Number(tbLine.credit) : 0;
          const glBalance = acc.closing_balance || 0;
          const isReconciled = Math.abs(tbBalance - glBalance) < 0.01;

          if (!isReconciled) {
            exceptions.push(`GL account ${acc.account_code} closing balance (${glBalance}) does not match TB (${tbBalance})`);
          }

          const [glAccount] = await db.insert(wpGlAccountsTable).values({
            sessionId,
            accountCode: acc.account_code,
            accountName: acc.account_name,
            accountType: acc.account_type,
            openingBalance: String(acc.opening_balance || 0),
            closingBalance: String(acc.closing_balance || 0),
            totalDebit: String(acc.total_debit || 0),
            totalCredit: String(acc.total_credit || 0),
            tbDebit: tbLine ? String(tbLine.debit) : "0",
            tbCredit: tbLine ? String(tbLine.credit) : "0",
            isReconciled,
            isSynthetic: acc.is_synthetic || true,
            generationRationale: acc.rationale || "",
            transactionCountNote: acc.transaction_count_note || "",
          }).returning();

          accounts.push(glAccount);

          if (acc.entries && Array.isArray(acc.entries)) {
            let runningBal = acc.opening_balance || 0;
            for (const entry of acc.entries) {
              runningBal += (entry.debit || 0) - (entry.credit || 0);
              await db.insert(wpGlEntriesTable).values({
                sessionId,
                glAccountId: glAccount.id,
                entryDate: entry.date,
                voucherNo: entry.voucher,
                narration: entry.narration,
                debit: String(entry.debit || 0),
                credit: String(entry.credit || 0),
                runningBalance: String(runningBal),
                month: entry.month || null,
                isSynthetic: true,
              });
            }
          }
        }
      } catch (batchErr) {
        logger.error({ err: batchErr }, `GL batch ${i} failed`);
        exceptions.push(`GL batch ${i}-${i + batchSize} generation failed`);
      }
    }

    for (const exc of exceptions) {
      await db.insert(wpExceptionLogTable).values({
        sessionId, headIndex: 1, exceptionType: "gl_issue",
        severity: "high", title: "GL Generation Issue", description: exc, status: "open",
      });
    }

    const head = await db.select().from(wpHeadsTable).where(and(eq(wpHeadsTable.sessionId, sessionId), eq(wpHeadsTable.headIndex, 1)));
    if (head[0]) {
      await db.update(wpHeadsTable).set({
        status: "validating", generatedAt: new Date(), updatedAt: new Date(),
        exceptionsCount: exceptions.length,
      }).where(eq(wpHeadsTable.id, head[0].id));
    }

    res.json({ accounts: accounts.length, exceptions });
  } catch (err: any) {
    logger.error({ err }, "GL generation failed");
    res.status(500).json({ error: "GL generation failed" });
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

    const deps = await checkDependencies(sessionId, headIndex);
    if (!deps.satisfied) return res.status(400).json({ error: `Prerequisites not met: ${deps.missing.join(", ")}` });

    const heads = await db.select().from(wpHeadsTable).where(and(eq(wpHeadsTable.sessionId, sessionId), eq(wpHeadsTable.headIndex, headIndex)));
    const head = heads[0];
    if (!head) return res.status(404).json({ error: "Head not found" });

    if (head.status !== "ready" && head.status !== "in_progress") {
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

router.post("/sessions/:id/heads/:headIndex/approve", async (req: Request, res: Response) => {
  try {
    const sessionId = parseInt(req.params.id);
    const headIndex = parseInt(req.params.headIndex);

    const heads = await db.select().from(wpHeadsTable).where(and(eq(wpHeadsTable.sessionId, sessionId), eq(wpHeadsTable.headIndex, headIndex)));
    if (!heads[0]) return res.status(404).json({ error: "Head not found" });

    await db.update(wpHeadsTable).set({
      status: "approved", approvedAt: new Date(), updatedAt: new Date(),
    }).where(eq(wpHeadsTable.id, heads[0].id));

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

router.post("/sessions/:id/heads/:headIndex/export", async (req: Request, res: Response) => {
  try {
    const sessionId = parseInt(req.params.id);
    const headIndex = parseInt(req.params.headIndex);

    const heads = await db.select().from(wpHeadsTable).where(and(eq(wpHeadsTable.sessionId, sessionId), eq(wpHeadsTable.headIndex, headIndex)));
    if (!heads[0]) return res.status(404).json({ error: "Head not found" });

    const documents = await db.select().from(wpHeadDocumentsTable).where(eq(wpHeadDocumentsTable.headId, heads[0].id));
    const headDef = AUDIT_HEADS[headIndex];

    if (headIndex === 0) {
      const tbLines = await db.select().from(wpTrialBalanceLinesTable).where(eq(wpTrialBalanceLinesTable.sessionId, sessionId));
      const wb = XLSX.utils.book_new();
      const wsData = [["Account Code", "Account Name", "Classification", "Debit", "Credit", "Balance", "Source", "Confidence"]];
      for (const l of tbLines) {
        wsData.push([l.accountCode, l.accountName, l.classification || "", String(l.debit), String(l.credit), String(l.balance), l.source || "", String(l.confidence || "")]);
      }
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      XLSX.utils.book_append_sheet(wb, ws, "Trial Balance");
      const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

      await db.update(wpHeadsTable).set({ status: "exported", exportedAt: new Date(), updatedAt: new Date() }).where(eq(wpHeadsTable.id, heads[0].id));

      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="TB_${sessionId}.xlsx"`);
      return res.send(buffer);
    }

    if (headIndex === 1) {
      const glAccounts = await db.select().from(wpGlAccountsTable).where(eq(wpGlAccountsTable.sessionId, sessionId));
      const wb = XLSX.utils.book_new();

      for (const acc of glAccounts.slice(0, 50)) {
        const entries = await db.select().from(wpGlEntriesTable).where(eq(wpGlEntriesTable.glAccountId, acc.id));
        const wsData = [
          [`General Ledger: ${acc.accountCode} - ${acc.accountName}`],
          [`Opening Balance: ${acc.openingBalance}`, "", `Closing Balance: ${acc.closingBalance}`],
          [],
          ["Date", "Voucher", "Narration", "Debit", "Credit", "Running Balance"],
        ];
        for (const e of entries) {
          wsData.push([e.entryDate, e.voucherNo || "", e.narration || "", String(e.debit), String(e.credit), String(e.runningBalance || "")]);
        }
        const sheetName = `${acc.accountCode}`.slice(0, 31);
        const ws = XLSX.utils.aoa_to_sheet(wsData);
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
      }

      const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
      await db.update(wpHeadsTable).set({ status: "exported", exportedAt: new Date(), updatedAt: new Date() }).where(eq(wpHeadsTable.id, heads[0].id));

      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="GL_${sessionId}.xlsx"`);
      return res.send(buffer);
    }

    const docContent = documents.map(d => `\n\n${"=".repeat(60)}\n${d.paperCode}: ${d.paperName}\n${"=".repeat(60)}\n\n${d.content}`).join("\n");

    if (headDef.outputType.includes("excel")) {
      const wb = XLSX.utils.book_new();
      for (const doc of documents) {
        const wsData = [[doc.paperName], [""], [doc.content || ""]];
        const ws = XLSX.utils.aoa_to_sheet(wsData);
        XLSX.utils.book_append_sheet(wb, ws, (doc.paperCode || "WP").slice(0, 31));
      }
      const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

      await db.update(wpHeadsTable).set({ status: "exported", exportedAt: new Date(), updatedAt: new Date() }).where(eq(wpHeadsTable.id, heads[0].id));

      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="${headDef.name.replace(/\s/g, "_")}_${sessionId}.xlsx"`);
      return res.send(buffer);
    }

    const docxSections: any[] = [];
    for (const doc of documents) {
      docxSections.push(
        new Paragraph({ text: `${doc.paperCode}: ${doc.paperName}`, heading: HeadingLevel.HEADING_1, pageBreakBefore: docxSections.length > 0 }),
      );
      const contentLines = (doc.content || "").split("\n");
      for (const line of contentLines) {
        docxSections.push(new Paragraph({ text: line }));
      }
    }

    const docxDoc = new Document({
      sections: [{ children: docxSections }],
    });
    const buffer = await Packer.toBuffer(docxDoc);

    await db.update(wpHeadsTable).set({ status: "exported", exportedAt: new Date(), updatedAt: new Date() }).where(eq(wpHeadsTable.id, heads[0].id));

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", `attachment; filename="${headDef.name.replace(/\s/g, "_")}_${sessionId}.docx"`);
    return res.send(buffer);
  } catch (err: any) {
    logger.error({ err }, "Export failed");
    res.status(500).json({ error: "Export failed" });
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
    const totalDebit = tbLines.reduce((s, l) => s + Number(l.debit || 0), 0);
    const totalCredit = tbLines.reduce((s, l) => s + Number(l.credit || 0), 0);
    if (tbLines.length > 0 && Math.abs(totalDebit - totalCredit) > 0.01) {
      missing.push("Trial Balance does not balance — resolve imbalance before proceeding");
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

    const heads = await db.select().from(wpHeadsTable).where(eq(wpHeadsTable.sessionId, sessionId)).orderBy(asc(wpHeadsTable.headIndex));
    const allDocs = await db.select().from(wpHeadDocumentsTable).where(eq(wpHeadDocumentsTable.sessionId, sessionId));
    const exceptions = await db.select().from(wpExceptionLogTable).where(eq(wpExceptionLogTable.sessionId, sessionId));
    const changeLog = await db.select().from(wpVariableChangeLogTable).where(eq(wpVariableChangeLogTable.sessionId, sessionId));
    const tbLines = await db.select().from(wpTrialBalanceLinesTable).where(eq(wpTrialBalanceLinesTable.sessionId, sessionId));

    const wb = XLSX.utils.book_new();

    const indexData = [["Working Papers Bundle"], [`Client: ${session.clientName}`], [`Entity Type: ${session.entityType || "N/A"}`], [`Year: ${session.engagementYear}`], [`Framework: ${session.reportingFramework || "IFRS"}`], [`NTN: ${session.ntn || "N/A"}`], [`Generated: ${new Date().toISOString()}`], [], ["Head", "Status", "Papers", "Exceptions", "Exported"]];
    for (const head of heads) {
      const headDocs = allDocs.filter(d => d.headId === head.id);
      indexData.push([head.headName, head.status, String(headDocs.length), String(head.exceptionsCount || 0), head.exportedAt ? "Yes" : "No"]);
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(indexData), "Index");

    const tbData = [["Account Code", "Account Name", "Classification", "Debit", "Credit", "Balance"]];
    for (const l of tbLines) {
      tbData.push([l.accountCode, l.accountName, l.classification || "", String(l.debit), String(l.credit), String(l.balance)]);
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(tbData), "Trial Balance");

    const excData = [["Type", "Severity", "Title", "Description", "Status", "Resolution"]];
    for (const e of exceptions) {
      excData.push([e.exceptionType, e.severity, e.title, e.description || "", e.status, e.resolution || ""]);
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(excData), "Exceptions");

    const auditData = [["Field", "Old Value", "New Value", "Reason", "Date"]];
    for (const c of changeLog) {
      auditData.push([c.fieldName, c.oldValue || "", c.newValue || "", c.reason || "", c.createdAt?.toISOString() || ""]);
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(auditData), "Audit Trail");

    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${session.clientName}_${session.engagementYear}_Bundle.xlsx"`);
    return res.send(buffer);
  } catch (err: any) {
    res.status(500).json({ error: "Bundle export failed" });
  }
});

router.get("/heads-definition", (_req: Request, res: Response) => {
  res.json(AUDIT_HEADS);
});

export default router;
