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
  wpExportJobsTable,
} from "@workspace/db";
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
    const { clientName, engagementYear, entityType, ntn, strn, reportingFramework } = req.body;
    if (!clientName || !engagementYear) {
      return res.status(400).json({ error: "Client name and engagement year are required" });
    }
    const [session] = await db.insert(wpSessionsTable).values({
      clientName, engagementYear,
      entityType: entityType || null,
      ntn: ntn || null,
      strn: strn || null,
      reportingFramework: reportingFramework || "IFRS",
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
// VARIABLES — AUTO-FILL + EDIT + LOCK
// ═══════════════════════════════════════════════════════════════════════════

router.post("/sessions/:id/variables/auto-fill", async (req: Request, res: Response) => {
  try {
    const sessionId = parseInt(req.params.id);
    const fields = await db.select().from(wpExtractedFieldsTable).where(eq(wpExtractedFieldsTable.sessionId, sessionId));

    const varMap: Record<string, { value: string; confidence: string; category: string }> = {};

    for (const f of fields) {
      let cat = "entity";
      if (f.category === "FS Line Items" || f.category === "Prior Year Comparatives") cat = "financial";
      else if (f.category === "Sales Tax Data" || f.category === "Tax Period Summary") cat = "tax";
      else if (f.category === "Reporting Metadata") cat = "reporting";
      else if (f.category === "Entity Profile") cat = "entity";

      const key = `${cat}__${f.fieldName}`;
      if (!varMap[key] || Number(f.confidence || 0) > Number(varMap[key].confidence)) {
        varMap[key] = { value: f.finalValue || f.extractedValue || "", confidence: String(f.confidence || "80"), category: cat };
      }
    }

    const existingVars = await db.select().from(wpVariablesTable).where(eq(wpVariablesTable.sessionId, sessionId));
    if (existingVars.length > 0) {
      await db.delete(wpVariablesTable).where(eq(wpVariablesTable.sessionId, sessionId));
    }

    const created: any[] = [];
    for (const [key, val] of Object.entries(varMap)) {
      const [cat, ...nameParts] = key.split("__");
      const varName = nameParts.join("__");
      const [v] = await db.insert(wpVariablesTable).values({
        sessionId, category: cat, variableName: varName,
        autoFilledValue: val.value, finalValue: val.value,
        confidence: val.confidence,
      }).returning();
      created.push(v);
    }

    await db.update(wpSessionsTable).set({ status: "variables", updatedAt: new Date() }).where(eq(wpSessionsTable.id, sessionId));
    res.json(created);
  } catch (err: any) {
    res.status(500).json({ error: "Failed to auto-fill variables" });
  }
});

router.get("/sessions/:id/variables", async (req: Request, res: Response) => {
  try {
    const sessionId = parseInt(req.params.id);
    const variables = await db.select().from(wpVariablesTable).where(eq(wpVariablesTable.sessionId, sessionId));
    const changeLog = await db.select().from(wpVariableChangeLogTable).where(eq(wpVariableChangeLogTable.sessionId, sessionId));
    res.json({ variables, changeLog });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch variables" });
  }
});

router.patch("/sessions/:id/variables/:varId", async (req: Request, res: Response) => {
  try {
    const sessionId = parseInt(req.params.id);
    const varId = parseInt(req.params.varId);
    const { value, reason, editedBy } = req.body;

    const existing = await db.select().from(wpVariablesTable).where(eq(wpVariablesTable.id, varId));
    if (!existing[0]) return res.status(404).json({ error: "Variable not found" });
    if (existing[0].isLocked) return res.status(400).json({ error: "Variable is locked. Unlock before editing." });

    const oldValue = existing[0].finalValue;

    await db.insert(wpVariableChangeLogTable).values({
      sessionId, variableId: varId,
      fieldName: existing[0].variableName,
      oldValue, newValue: value,
      editedBy: editedBy || null,
      reason: reason || null,
    });

    const [updated] = await db.update(wpVariablesTable).set({
      userEditedValue: value, finalValue: value, updatedAt: new Date(),
    }).where(eq(wpVariablesTable.id, varId)).returning();

    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: "Failed to update variable" });
  }
});

router.post("/sessions/:id/variables/lock-all", async (req: Request, res: Response) => {
  try {
    const sessionId = parseInt(req.params.id);
    await db.update(wpVariablesTable).set({ isLocked: true, lockedAt: new Date() }).where(eq(wpVariablesTable.sessionId, sessionId));

    const heads = await db.select().from(wpHeadsTable).where(and(eq(wpHeadsTable.sessionId, sessionId), eq(wpHeadsTable.headIndex, 0)));
    if (heads[0]) {
      await db.update(wpHeadsTable).set({ status: "ready", updatedAt: new Date() }).where(eq(wpHeadsTable.id, heads[0].id));
    }

    await db.update(wpSessionsTable).set({ status: "generation", updatedAt: new Date() }).where(eq(wpSessionsTable.id, sessionId));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to lock variables" });
  }
});


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
YEAR: ${session?.engagementYear || "2024"}
FRAMEWORK: ${session?.reportingFramework || "IFRS"}

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

    const indexData = [["Working Papers Bundle"], [`Client: ${session.clientName}`], [`Year: ${session.engagementYear}`], [`Generated: ${new Date().toISOString()}`], [], ["Head", "Status", "Papers", "Exceptions", "Exported"]];
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
