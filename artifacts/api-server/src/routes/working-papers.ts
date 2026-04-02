import { Router, type Request, type Response } from "express";
import multer from "multer";
import { logger } from "../lib/logger";
import { db } from "@workspace/db";
import { systemSettingsTable } from "@workspace/db";
import { inArray } from "drizzle-orm";
import OpenAI from "openai";
import PDFDocument from "pdfkit";
// @ts-ignore
import pdfParse from "pdf-parse";
import * as XLSX from "xlsx";
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell,
  WidthType, AlignmentType, BorderStyle, ShadingType, PageBreak,
} from "docx";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "application/pdf",
      "image/jpeg", "image/png", "image/webp", "image/gif",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/csv",
      "text/plain",
      "message/rfc822",
    ];
    if (allowed.includes(file.mimetype) || file.originalname.match(/\.(pdf|xlsx|xls|csv|docx|doc|txt|jpg|jpeg|png|webp|eml)$/i)) {
      cb(null, true);
    } else {
      cb(new Error("Unsupported file type."));
    }
  },
});

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
    const getVal = (key: string) => rows.find(r => r.key === key)?.value || "";
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

async function extractTextFromFile(file: Express.Multer.File): Promise<string> {
  const name = file.originalname.toLowerCase();
  try {
    if (file.mimetype === "application/pdf" || name.endsWith(".pdf")) {
      const data = await pdfParse(file.buffer);
      return data.text || "";
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
      return lines.join("\n");
    }
    if (name.endsWith(".csv") || file.mimetype === "text/csv") {
      return file.buffer.toString("utf-8");
    }
    if (name.endsWith(".txt") || file.mimetype === "text/plain") {
      return file.buffer.toString("utf-8");
    }
    if (file.mimetype.startsWith("image/")) {
      return `[IMAGE FILE: ${file.originalname} — will be analyzed via vision]`;
    }
    return file.buffer.toString("utf-8");
  } catch (err) {
    logger.warn({ err, file: file.originalname }, "Error extracting text from file");
    return `[Could not extract text from ${file.originalname}]`;
  }
}

function classifyDocument(file: Express.Multer.File, content: string): string {
  const name = file.originalname.toLowerCase();
  const text = content.toLowerCase();
  if (text.includes("trial balance") || text.includes("tb ") || name.includes("tb") || name.includes("trial")) return "Trial Balance";
  if (text.includes("general ledger") || text.includes("gl ") || name.includes("gl") || name.includes("ledger")) return "General Ledger";
  if (text.includes("bank statement") || text.includes("balance b/f") || name.includes("bank")) return "Bank Statement";
  if (text.includes("invoice") || name.includes("invoice")) return "Invoice";
  if (text.includes("confirmation") || name.includes("confirm")) return "Confirmation Letter";
  if (text.includes("contract") || name.includes("contract") || name.includes("agreement")) return "Contract";
  if (text.includes("payroll") || name.includes("payroll")) return "Payroll Schedule";
  if (text.includes("fixed asset") || name.includes("fixed asset") || name.includes("asset")) return "Fixed Asset Schedule";
  if (text.includes("balance sheet") || text.includes("profit") || text.includes("financial statement")) return "Financial Statement";
  if (file.mimetype.startsWith("image/")) return "Scanned Document";
  return "Supporting Document";
}

// ─── POST /api/working-papers/extract-entity ──────────────────────────────
// Lightweight endpoint: extracts entity details + financials from uploaded docs
router.post("/extract-entity", upload.array("files", 20), async (req: Request, res: Response) => {
  const files = req.files as Express.Multer.File[] | undefined;
  if (!files || files.length === 0) {
    return res.status(400).json({ error: "No files uploaded" });
  }

  const ai = await getAIClient();
  if (!ai) {
    return res.status(200).json({ entity: {}, financials: {} });
  }

  try {
    const imageFiles = files.filter(f => f.mimetype.startsWith("image/"));
    const docs: string[] = [];
    for (const file of files.slice(0, 8)) {
      const content = await extractTextFromFile(file);
      docs.push(`FILE: ${file.originalname}\n${content.slice(0, 4000)}`);
    }
    const docSummary = docs.join("\n\n---\n\n");

    const userPrompt = `Extract entity and financial details from these documents.
Return ONLY valid JSON — no markdown, no extra text:
{
  "entity_name": string or null,
  "ntn": string or null,
  "secp": string or null,
  "financial_year": string or null,
  "registered_address": string or null,
  "engagement_type": "Statutory Audit"|"Tax Audit"|"Internal Audit"|"Special Purpose Audit"|"Review Engagement"|"Compilation" or null,
  "financials": {
    "revenue": number or null,
    "gross_profit": number or null,
    "net_profit": number or null,
    "total_assets": number or null,
    "total_liabilities": number or null,
    "equity": number or null,
    "cash_and_bank": number or null,
    "trade_receivables": number or null,
    "trade_payables": number or null,
    "inventory": number or null,
    "fixed_assets": number or null,
    "prior_year_revenue": number or null,
    "prior_year_net_profit": number or null,
    "prior_year_total_assets": number or null
  }
}
If a field cannot be found, use null.

DOCUMENTS:
${docSummary}`;

    const messageContent: any[] = [{ type: "text", text: userPrompt }];
    for (const imgFile of imageFiles.slice(0, 3)) {
      const base64 = imgFile.buffer.toString("base64");
      messageContent.push({ type: "image_url", image_url: { url: `data:${imgFile.mimetype};base64,${base64}`, detail: "high" } });
    }

    const response = await ai.client.chat.completions.create({
      model: ai.model,
      messages: [
        { role: "system", content: "You are a document parser. Extract entity and financial details precisely from financial documents. Return only JSON." },
        { role: "user", content: messageContent },
      ],
      max_tokens: 1000,
      temperature: 0.1,
      response_format: { type: "json_object" },
    });

    const raw = response.choices[0]?.message?.content || "{}";
    let data: any = {};
    try { data = JSON.parse(raw); } catch { data = {}; }
    return res.json(data);
  } catch (err: any) {
    logger.error({ err }, "extract-entity failed");
    return res.status(200).json({ entity: {}, financials: {} });
  }
});

// ─── POST /api/working-papers/extract-tb ──────────────────────────────────
// Extract and auto-code Trial Balance lines from uploaded documents
router.post("/extract-tb", upload.array("files", 20), async (req: Request, res: Response) => {
  const files = req.files as Express.Multer.File[] | undefined;
  if (!files || files.length === 0) {
    return res.status(400).json({ error: "No files uploaded" });
  }

  const ai = await getAIClient();
  if (!ai) {
    return res.status(200).json({ lines: [] });
  }

  try {
    const docs: string[] = [];
    const imageFiles = files.filter(f => f.mimetype.startsWith("image/"));
    for (const file of files.slice(0, 10)) {
      const content = await extractTextFromFile(file);
      docs.push(`FILE: ${file.originalname}\n${content.slice(0, 6000)}`);
    }
    const docSummary = docs.join("\n\n---\n\n");

    const userPrompt = `Extract ALL Trial Balance line items from these documents. For each account line, classify it into the Pakistan chart of accounts structure.

Return ONLY valid JSON — no markdown, no extra text:
{
  "lines": [
    {
      "accountCode": "string (e.g. 1001, 2001, 3001, etc.)",
      "accountName": "string (exact account name from TB)",
      "debit": "string (debit amount, use empty string if zero/none)",
      "credit": "string (credit amount, use empty string if zero/none)",
      "pyBalance": "string (prior year closing balance if available, else empty)",
      "group": "string (one of: Non-Current Assets, Current Assets, Equity, Non-Current Liabilities, Current Liabilities, Revenue, Cost of Sales, Operating Expenses, Finance Costs, Other Income, Taxation, Other Comprehensive Income)",
      "fsHead": "string (FS line item mapping, e.g. Property, Plant & Equipment; Cash & Bank Balances; Trade Debts; Stock-in-Trade; Net Sales / Revenue from Contracts; Cost of Sales; etc.)",
      "mappingStatus": "mapped" or "review" or "unmapped"
    }
  ]
}

RULES:
- Extract EVERY account line from the trial balance, not just summaries
- Use actual amounts from the documents, format as plain numbers (e.g. "1234567", not "1,234,567")
- If an account clearly maps to a standard FS head, set status to "mapped"
- If mapping is uncertain, set status to "review"
- If no clear mapping exists, set status to "unmapped"
- Group classification must match one of the exact group names listed above
- fsHead must match standard Pakistan audit FS line items
- Include both debit and credit balances as shown in TB
- If TB is not found in documents, extract whatever financial line items exist and code them

DOCUMENTS:
${docSummary}`;

    const messageContent: any[] = [{ type: "text", text: userPrompt }];
    for (const imgFile of imageFiles.slice(0, 3)) {
      const base64 = imgFile.buffer.toString("base64");
      messageContent.push({ type: "image_url", image_url: { url: `data:${imgFile.mimetype};base64,${base64}`, detail: "high" } });
    }

    const response = await ai.client.chat.completions.create({
      model: ai.model,
      messages: [
        { role: "system", content: "You are an expert chartered accountant and auditor specializing in Pakistan audit standards. Extract trial balance data precisely and classify each account into the correct financial statement group and FS head mapping. Return only valid JSON." },
        { role: "user", content: messageContent },
      ],
      max_tokens: 4000,
      temperature: 0.1,
      response_format: { type: "json_object" },
    });

    const raw = response.choices[0]?.message?.content || '{"lines":[]}';
    let data: any = {};
    try { data = JSON.parse(raw); } catch { data = { lines: [] }; }

    const lines = Array.isArray(data.lines) ? data.lines.map((l: any, i: number) => ({
      accountCode: String(l.accountCode || `${(i + 1) * 1000}`),
      accountName: String(l.accountName || ""),
      debit: String(l.debit || ""),
      credit: String(l.credit || ""),
      pyBalance: String(l.pyBalance || ""),
      group: String(l.group || ""),
      fsHead: String(l.fsHead || ""),
      mappingStatus: ["mapped", "review", "unmapped"].includes(l.mappingStatus) ? l.mappingStatus : "unmapped",
    })) : [];

    return res.json({ lines });
  } catch (err: any) {
    logger.error({ err }, "extract-tb failed");
    return res.status(200).json({ lines: [] });
  }
});

// ─── POST /api/working-papers/analyze ─────────────────────────────────────
router.post("/analyze", upload.array("files", 20), async (req: Request, res: Response) => {
  const files = req.files as Express.Multer.File[] | undefined;
  const { instructions, entityName, engagementType, financialYear } = req.body;

  if (!files || files.length === 0) {
    return res.status(400).json({ error: "No files uploaded." });
  }

  const ai = await getAIClient();
  if (!ai) {
    return res.status(503).json({ error: "AI service not configured. Please add your API key in Settings." });
  }

  try {
    const extractedDocs: Array<{ filename: string; type: string; content: string; isImage: boolean }> = [];
    const imageFiles: Express.Multer.File[] = [];

    for (const file of files) {
      const content = await extractTextFromFile(file);
      const type = classifyDocument(file, content);
      const isImage = file.mimetype.startsWith("image/");
      extractedDocs.push({ filename: file.originalname, type, content: isImage ? "" : content.slice(0, 8000), isImage });
      if (isImage) imageFiles.push(file);
    }

    const docSummary = extractedDocs.map(d =>
      `FILE: ${d.filename}\nTYPE: ${d.type}\n${d.isImage ? "[Scanned image - analyzed via vision]" : d.content.slice(0, 3000)}`
    ).join("\n\n---\n\n");

    const systemPrompt = `You are AuditWise Engine v3, an enterprise-grade audit AI specializing in Pakistan audit & accounting standards.
You analyze financial documents and generate ISA-compliant working papers with evidence-based cross-referencing.

Standards compliance: ISA 200–720, ISQM 1 & 2, IFRS/IAS/IFRS for SMEs, ICAP Code of Ethics, Companies Act 2017 (Pakistan), SECP Regulations, FBR Laws (ITO 2001, STA 1990, FED Act).

RULES:
- Never leave any field blank. Never generate placeholder or generic text.
- When data is missing, generate realistic, plausible estimated data clearly tagged as "[Auditor Assumption / Estimated]"
- Always use professional audit language: "We have performed...", "The audit procedures indicate..."
- Evidence IDs follow format: A-100 (TB), B-200 (GL), C-300 (Bank), D-400 (FS), E-500 (Contracts), F-600 (Others)`;

    const userPrompt = `Analyze the following documents for a ${engagementType || "statutory audit"} engagement.

ENTITY: ${entityName || "Client Company"}
FINANCIAL YEAR: ${financialYear || "Year ending June 30, 2024"}
AUDITOR INSTRUCTIONS: ${instructions || "Generate complete audit working papers"}

UPLOADED DOCUMENTS:
${docSummary}

Extract and return a structured JSON object with this EXACT format (all fields required):
{
  "entity": {
    "name": string,
    "type": string,
    "industry": string,
    "financial_year": string,
    "reporting_framework": string,
    "registration_no": string,
    "ntn": string,
    "address": string
  },
  "financials": {
    "revenue": number,
    "gross_profit": number,
    "net_profit": number,
    "total_assets": number,
    "total_liabilities": number,
    "equity": number,
    "cash_and_bank": number,
    "trade_receivables": number,
    "trade_payables": number,
    "inventory": number,
    "fixed_assets": number,
    "prior_year_revenue": number,
    "prior_year_net_profit": number,
    "prior_year_total_assets": number,
    "currency": "PKR"
  },
  "materiality": {
    "overall_materiality": number,
    "performance_materiality": number,
    "trivial_threshold": number,
    "basis": string,
    "percentage_used": number,
    "rationale": string,
    "isa_ref": "ISA 320"
  },
  "risk_assessment": {
    "overall_risk": "Low" | "Medium" | "High",
    "inherent_risks": [{ "area": string, "risk": string, "level": "Low"|"Medium"|"High", "isa_ref": string, "assertions": [string] }],
    "control_risks": [{ "area": string, "risk": string, "level": "Low"|"Medium"|"High", "implication": string }],
    "fraud_indicators": [{ "indicator": string, "assessment": string, "isa_ref": "ISA 240" }]
  },
  "analytical_procedures": {
    "ratios": {
      "current_ratio": number,
      "quick_ratio": number,
      "gross_margin_pct": number,
      "net_margin_pct": number,
      "return_on_assets_pct": number,
      "debt_to_equity": number,
      "asset_turnover": number,
      "receivables_days": number,
      "payables_days": number,
      "inventory_days": number
    },
    "variance_analysis": [
      { "item": string, "current_year": number, "prior_year": number, "variance_amount": number, "variance_pct": number, "assessment": string, "audit_response": string }
    ],
    "trend_analysis": string,
    "analytical_conclusions": [string],
    "isa_ref": "ISA 520"
  },
  "reconciliation": {
    "tb_vs_fs": { "status": "Reconciled"|"Unreconciled"|"Not Available", "difference": number, "notes": string },
    "tb_vs_gl": { "status": "Reconciled"|"Unreconciled"|"Not Available", "difference": number, "notes": string },
    "opening_vs_prior_year": { "status": "Reconciled"|"Unreconciled"|"Not Available", "difference": number, "notes": string },
    "bank_reconciliation": { "status": "Reconciled"|"Unreconciled"|"Not Available", "difference": number, "notes": string },
    "flags": [string]
  },
  "internal_control_weaknesses": [
    { "area": string, "weakness": string, "risk_level": "Low"|"Medium"|"High", "recommendation": string, "management_response": string }
  ],
  "evidence_items": [
    { "id": string, "filename": string, "type": "TB"|"GL"|"Bank"|"FS"|"Contracts"|"Others", "description": string, "pages_or_sheets": string, "date_received": string }
  ],
  "key_audit_areas": [
    { "area": string, "assertions": [string], "risk_level": string, "audit_approach": string, "procedures": [string], "evidence_refs": [string] }
  ],
  "documents_classified": [
    { "filename": string, "classified_as": string, "evidence_id": string, "data_extracted": string }
  ],
  "missing_data_flags": [string],
  "assumptions_made": [string]
}

Return ONLY valid JSON, no markdown, no extra text.`;

    const messageContent: any[] = [{ type: "text", text: userPrompt }];

    for (const imgFile of imageFiles.slice(0, 3)) {
      const base64 = imgFile.buffer.toString("base64");
      messageContent.push({
        type: "image_url",
        image_url: { url: `data:${imgFile.mimetype};base64,${base64}`, detail: "high" },
      });
    }

    const response = await ai.client.chat.completions.create({
      model: ai.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: messageContent },
      ],
      max_tokens: 4000,
      temperature: 0.3,
      response_format: { type: "json_object" },
    });

    const raw = response.choices[0]?.message?.content || "{}";
    let analysisData: any;
    try {
      analysisData = JSON.parse(raw);
    } catch {
      analysisData = { error: "Failed to parse AI response", raw };
    }

    return res.json({
      success: true,
      analysis: analysisData,
      documentsProcessed: extractedDocs.map(d => ({ filename: d.filename, type: d.type })),
    });
  } catch (err: any) {
    logger.error({ err }, "Working paper analysis failed");
    return res.status(500).json({ error: err?.message || "Analysis failed" });
  }
});

// ─── Date Engine Helpers ────────────────────────────────────────────────────
function randomDateInRange(start: Date, end: Date): Date {
  const diff = Math.max(end.getTime() - start.getTime(), 86400000);
  return new Date(start.getTime() + Math.floor(Math.random() * diff));
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-PK", { day: "2-digit", month: "short", year: "numeric" });
}

function parseOrFallback(dateStr: string | undefined, fallback: Date): Date {
  if (!dateStr) return fallback;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? fallback : d;
}

function getWPSignoffs(
  ref: string,
  engDates: { planningDeadline?: string; fieldworkStart?: string; fieldworkEnd?: string; reportingDeadline?: string; reportDate?: string; filingDeadline?: string; archiveDate?: string },
  teamNames: { preparer: string; reviewer: string; approver: string }
) {
  const today = new Date();
  const pd  = parseOrFallback(engDates.planningDeadline,  today);
  const fws = parseOrFallback(engDates.fieldworkStart,    new Date(pd.getTime()  + 7  * 86400000));
  const fwe = parseOrFallback(engDates.fieldworkEnd,      new Date(fws.getTime() + 14 * 86400000));
  const rd  = parseOrFallback(engDates.reportingDeadline, new Date(fwe.getTime() + 10 * 86400000));
  const rpt = parseOrFallback(engDates.reportDate,        new Date(rd.getTime()  + 7  * 86400000));
  const fil = parseOrFallback(engDates.filingDeadline,    new Date(rpt.getTime() + 14 * 86400000));

  const ppStart = new Date(pd.getTime() - 14 * 86400000);
  const prefix  = (ref || "").replace(/[0-9]/g, "").toUpperCase();

  let phaseStart: Date;
  let phaseEnd:   Date;
  switch (prefix) {
    case "A":                   phaseStart = ppStart; phaseEnd = pd;  break;
    case "B": case "C":        phaseStart = pd;  phaseEnd = fws; break;
    case "D":                   phaseStart = pd;  phaseEnd = fws; break;
    case "E": case "F":        phaseStart = fws; phaseEnd = fwe; break;
    case "G": case "H": case "I": phaseStart = rd;  phaseEnd = rpt; break;
    case "J":                   phaseStart = fwe; phaseEnd = rd;  break;
    case "K":                   phaseStart = rpt; phaseEnd = fil; break;
    default:                    phaseStart = fws; phaseEnd = fwe; break;
  }

  if (phaseEnd <= phaseStart) phaseEnd = new Date(phaseStart.getTime() + 3 * 86400000);

  const prepDate    = randomDateInRange(phaseStart, phaseEnd);
  const reviewDate  = new Date(prepDate.getTime()   + (1 + Math.floor(Math.random() * 3)) * 86400000);
  const approveDate = new Date(reviewDate.getTime() + (1 + Math.floor(Math.random() * 2)) * 86400000);

  return {
    prepared_by:    teamNames.preparer || "Audit Senior",
    prepared_date:  fmtDate(prepDate),
    reviewed_by:    teamNames.reviewer || "Audit Manager",
    reviewed_date:  fmtDate(reviewDate),
    approved_by:    teamNames.approver || "Engagement Partner",
    approved_date:  fmtDate(approveDate),
  };
}

// ─── POST /api/working-papers/generate-gl-tb ──────────────────────────────
router.post("/generate-gl-tb", async (req: Request, res: Response) => {
  const { entityName, industry, financialYear, bsData, plData, ntn, strn, engagementType, framework } = req.body;
  const ai = await getAIClient();
  if (!ai) return res.status(503).json({ error: "AI service not configured." });

  const bsSummary = (bsData || []).map((s: any) => s.lines?.map((l: any) => `${l.label}: CY=${l.cy || 0}, PY=${l.py || 0}`).join("; ")).join(" | ");
  const plSummary = (plData || []).map((s: any) => s.lines?.map((l: any) => `${l.label}: CY=${l.cy || 0}, PY=${l.py || 0}`).join("; ")).join(" | ");

  const prompt = `You are a senior chartered accountant in Pakistan. Generate a COMPLETE General Ledger and Trial Balance for the following entity.

ENTITY: ${entityName || "Sample Company"}
INDUSTRY: ${industry || "Manufacturing"}
FINANCIAL YEAR: ${financialYear || "Year ended June 30, 2024"}
NTN: ${ntn || "N/A"} | STRN: ${strn || "N/A"}
FRAMEWORK: ${framework || "IFRS"}
ENGAGEMENT: ${engagementType || "Statutory Audit"}

FINANCIAL STATEMENTS DATA:
Balance Sheet: ${bsSummary || "Not provided"}
Profit & Loss: ${plSummary || "Not provided"}

INSTRUCTIONS:
1. Generate a detailed General Ledger with realistic Pakistan-style transactions for the full financial year.
2. Use Pakistani Chart of Accounts coding (4-digit codes): 1xxx=Assets, 2xxx=Liabilities, 3xxx=Equity, 4xxx=Revenue, 5xxx=Cost of Sales, 6xxx=Expenses, 7xxx=Other Income, 8xxx=Tax.
3. Each GL entry must have: date, voucher_no (JV-001 format), account_code, account_name, narration (Pakistan business context), debit, credit.
4. Include typical Pakistan transactions: sales tax input/output, WHT deductions, bank charges, supplier payments, salary disbursement, utility payments, depreciation, provisions, tax payments, EOBI/gratuity.
5. Generate minimum 40-60 transaction entries covering the full year.
6. From the GL, derive a Trial Balance that EXACTLY matches - every account's total debits and credits must reconcile.
7. Trial Balance columns: account_code, account_name, debit_total, credit_total, balance_dr, balance_cr.
8. TB total debits MUST equal total credits (balanced).

Return ONLY valid JSON:
{
  "general_ledger": [
    { "date": "2023-07-01", "voucher_no": "JV-001", "account_code": "1001", "account_name": "Cash at Bank - HBL", "narration": "Opening balance brought forward", "debit": 500000, "credit": 0 }
  ],
  "trial_balance": [
    { "account_code": "1001", "account_name": "Cash at Bank - HBL", "debit_total": 5000000, "credit_total": 4500000, "balance_dr": 500000, "balance_cr": 0 }
  ],
  "chart_of_accounts": [
    { "code": "1001", "name": "Cash at Bank - HBL", "group": "Current Assets", "type": "Asset" }
  ]
}`;

  try {
    const completion = await ai.chat.completions.create({
      model: ai._model || "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      response_format: { type: "json_object" },
    });

    const raw = completion.choices?.[0]?.message?.content || "{}";
    const parsed = JSON.parse(raw);

    const gl = parsed.general_ledger || [];
    const tb = parsed.trial_balance || [];
    const coa = parsed.chart_of_accounts || [];

    const totalDr = tb.reduce((s: number, r: any) => s + (r.balance_dr || 0), 0);
    const totalCr = tb.reduce((s: number, r: any) => s + (r.balance_cr || 0), 0);

    res.json({
      general_ledger: gl,
      trial_balance: tb,
      chart_of_accounts: coa,
      summary: {
        gl_entries: gl.length,
        tb_accounts: tb.length,
        total_debit: totalDr,
        total_credit: totalCr,
        is_balanced: Math.abs(totalDr - totalCr) < 1,
      },
    });
  } catch (err: any) {
    logger.error("GL/TB generation failed:", err);
    res.status(500).json({ error: err.message || "GL/TB generation failed" });
  }
});

// ─── POST /api/working-papers/generate ────────────────────────────────────
router.post("/generate", async (req: Request, res: Response) => {
  const {
    analysis, selectedPapers,
    entityName, financialYear, engagementType, firmName, ntn, secp,
    strn, industry, entityType, framework, listedStatus,
    firstYearAudit, goingConcernFlag, controlReliance, significantRiskAreas,
    registeredAddress, periodStart, periodEnd, currency,
    newClient, groupAuditFlag, internalAuditExists,
    independenceConfirmed, conflictCheck, eqcrRequired,
    samplingMethod, confidenceLevel,
    relatedPartyFlag, subsequentEventsFlag, estimatesFlag, litigationFlag, expertRequired,
    currentTaxApplicable, deferredTaxApplicable, whtExposure, salesTaxRegistered, superTaxApplicable,
    preparer, reviewer, approver,
    planningDeadline, fieldworkStart, fieldworkEnd,
    reportingDeadline, reportDate, filingDeadline, archiveDate,
    bsData, plData,
  } = req.body;

  const engDates   = { planningDeadline, fieldworkStart, fieldworkEnd, reportingDeadline, reportDate, filingDeadline, archiveDate };
  const teamNames  = {
    preparer:  preparer  || "Audit Senior",
    reviewer:  reviewer  || "Audit Manager",
    approver:  approver  || "Engagement Partner",
  };

  if (!analysis) {
    return res.status(400).json({ error: "No analysis data provided." });
  }

  const ai = await getAIClient();
  if (!ai) {
    return res.status(503).json({ error: "AI service not configured." });
  }

  const fin = analysis.financials || {};
  const formatPKR = (n: number) => `PKR ${(n || 0).toLocaleString("en-PK")}`;
  const entity = analysis.entity || {};
  const materiality = analysis.materiality || {};
  const risks = analysis.risk_assessment || {};

  const allPapers = [
    "A1", "A2", "A3", "A4", "A5", "A6",
    "B1", "B2", "B3", "B4", "B5", "B6", "B7", "B8", "B9", "B10",
    "C1", "C2", "C3", "C4", "C5", "C6",
    "D1", "D2", "D3", "D4", "D5",
    "E1", "E2", "E3", "E4", "E5", "E6", "E7", "E8", "E9", "E10",
    "F1", "F2", "F3", "F4", "F5", "F6",
    "G1", "G2", "G3", "G4", "G5", "G6", "G7",
    "H1", "H2", "H3", "H4", "H5",
    "I1", "I2", "I3", "I4",
    "J1", "J2", "J3", "J4", "J5",
    "K1", "K2", "K3",
  ];
  const papersToGenerate = selectedPapers?.length > 0 ? selectedPapers : allPapers;

  const wpDefinitions: Record<string, { title: string; section: string; isa: string; description: string }> = {
    "A1": { title: "Engagement Letter & Terms", section: "Acceptance & Continuance", isa: "ISA 210", description: "Terms of engagement including scope, responsibilities, and fee." },
    "A2": { title: "Independence & Ethics Compliance", section: "Acceptance & Continuance", isa: "ISA 200, IESBA Code", description: "Auditor independence, ethical compliance and self-review threat assessment." },
    "A3": { title: "Client Acceptance & Continuance", section: "Acceptance & Continuance", isa: "ISA 220, ISQM 1", description: "Client integrity, risk evaluation, and acceptance/continuance decision." },
    "A4": { title: "Anti-Money Laundering Checks", section: "Acceptance & Continuance", isa: "AMLA 2010, IESBA", description: "Beneficial ownership verification, PEP screening, and AML compliance." },
    "A5": { title: "Conflict of Interest Assessment", section: "Acceptance & Continuance", isa: "IESBA Code", description: "Assessment of conflicts of interest and safeguards applied." },
    "A6": { title: "Client Risk Profiling", section: "Acceptance & Continuance", isa: "ISA 220, ISQM 1", description: "Client risk profile for acceptance/continuance decision-making." },
    "B1": { title: "Understanding the Entity & Environment", section: "Planning & Strategy", isa: "ISA 315", description: "Entity structure, industry, regulatory environment, and key processes." },
    "B2": { title: "Industry & Regulatory Analysis", section: "Planning & Strategy", isa: "ISA 315", description: "Industry-specific risks, regulatory requirements, and market conditions." },
    "B3": { title: "Process Flowcharts & Narratives", section: "Planning & Strategy", isa: "ISA 315", description: "Business process documentation and transaction flow narratives." },
    "B4": { title: "Risk Assessment Summary (RMM)", section: "Planning & Strategy", isa: "ISA 315, ISA 330", description: "Inherent and control risk identification with planned audit responses." },
    "B5": { title: "Fraud Risk Assessment", section: "Planning & Strategy", isa: "ISA 240", description: "Fraud risk factors, management override assessment, and revenue recognition risk." },
    "B6": { title: "Materiality Calculation Sheet", section: "Planning & Strategy", isa: "ISA 320", description: "Overall materiality, performance materiality, and trivial threshold calculation." },
    "B7": { title: "Performance Materiality Allocation", section: "Planning & Strategy", isa: "ISA 320", description: "Allocation of performance materiality to individual account areas." },
    "B8": { title: "Audit Strategy Document", section: "Planning & Strategy", isa: "ISA 300", description: "Overall audit strategy, scope, timing, and resource allocation." },
    "B9": { title: "Audit Plan (Detailed)", section: "Planning & Strategy", isa: "ISA 300", description: "Detailed audit plan with nature, timing, and extent of procedures." },
    "B10": { title: "Analytical Procedures (Planning)", section: "Planning & Strategy", isa: "ISA 520", description: "Planning-stage analytical procedures and expectation setting." },
    "C1": { title: "Final Accounts Extraction Sheet", section: "Data & Financial Statements", isa: "ISA 500", description: "Extracted financial statement data with line item mapping." },
    "C2": { title: "FS Line Item Mapping Sheet", section: "Data & Financial Statements", isa: "ISA 500", description: "Mapping of FS line items to audit areas and TB accounts." },
    "C3": { title: "FS ↔ TB Reconciliation", section: "Data & Financial Statements", isa: "ISA 500", description: "Trial balance to financial statements reconciliation." },
    "C4": { title: "Opening Balances Verification", section: "Data & Financial Statements", isa: "ISA 510", description: "Verification of opening balances and comparative figures." },
    "C5": { title: "Lead Schedules (Auto Generated)", section: "Data & Financial Statements", isa: "ISA 500, ISA 230", description: "Lead schedules for all material account areas with cross-references." },
    "C6": { title: "Comparative Analysis (YoY)", section: "Data & Financial Statements", isa: "ISA 520", description: "Year-on-year comparative analysis of financial statement items." },
    "D1": { title: "Internal Control Evaluation", section: "Internal Controls", isa: "ISA 315, ISA 265", description: "Design and implementation testing of key internal controls." },
    "D2": { title: "Walkthrough Documentation", section: "Internal Controls", isa: "ISA 315", description: "End-to-end walkthrough of key transaction cycles and controls." },
    "D3": { title: "Test of Controls (ToC)", section: "Internal Controls", isa: "ISA 330", description: "Operating effectiveness testing of key internal controls." },
    "D4": { title: "IT Controls Review", section: "Internal Controls", isa: "ISA 315", description: "IT general controls and application controls assessment." },
    "D5": { title: "Control Deficiency Log", section: "Internal Controls", isa: "ISA 265", description: "Log of identified control deficiencies with severity classification." },
    "E1": { title: "Cash & Bank", section: "Substantive Testing", isa: "ISA 505, ISA 500", description: "Bank confirmation, reconciliation, cash count, and cut-off testing." },
    "E2": { title: "Trade Receivables", section: "Substantive Testing", isa: "ISA 505, IFRS 15", description: "Debtors aging analysis, confirmations, subsequent receipts, and provision assessment." },
    "E3": { title: "Inventory & Cost of Sales", section: "Substantive Testing", isa: "ISA 501, IAS 2", description: "Inventory count observation, valuation, NRV, and slow-moving analysis." },
    "E4": { title: "Property, Plant & Equipment", section: "Substantive Testing", isa: "IAS 16, ISA 500", description: "Fixed asset register verification, depreciation, additions, and disposals." },
    "E5": { title: "Trade Payables", section: "Substantive Testing", isa: "ISA 500, ISA 505", description: "Creditors reconciliation, confirmations, and cut-off testing." },
    "E6": { title: "Revenue", section: "Substantive Testing", isa: "IFRS 15, ISA 500", description: "Revenue recognition testing, cut-off, and analytical review." },
    "E7": { title: "Expenses", section: "Substantive Testing", isa: "ISA 500", description: "Expense testing, analytical review, and cut-off procedures." },
    "E8": { title: "Equity", section: "Substantive Testing", isa: "ISA 500, IAS 1", description: "Share capital verification and reserves movement schedule." },
    "E9": { title: "Taxation", section: "Substantive Testing", isa: "IAS 12, ITO 2001", description: "Current tax computation, deferred tax calculation, and WHT compliance." },
    "E10": { title: "Provisions & Contingent Liabilities", section: "Substantive Testing", isa: "IAS 37, ISA 501", description: "Provision testing, legal confirmations, and contingency assessment." },
    "F1": { title: "Related Party Transactions", section: "Special Areas", isa: "ISA 550, IAS 24", description: "Related party identification, transaction testing, and disclosure review." },
    "F2": { title: "Going Concern Assessment", section: "Special Areas", isa: "ISA 570", description: "Management's going concern assessment and auditor's evaluation." },
    "F3": { title: "Subsequent Events Review", section: "Special Areas", isa: "ISA 560", description: "Events after reporting period and their impact on financial statements." },
    "F4": { title: "Accounting Estimates Review", section: "Special Areas", isa: "ISA 540, ISA 620", description: "Management estimates, expert reliance, and fair value measurement." },
    "F5": { title: "Laws & Regulations Compliance", section: "Special Areas", isa: "ISA 250", description: "Compliance with applicable laws and regulations and impact assessment." },
    "F6": { title: "Litigation & Claims", section: "Special Areas", isa: "ISA 501, IAS 37", description: "Legal counsel confirmations, pending litigation, and claims evaluation." },
    "G1": { title: "Misstatements Summary", section: "Completion", isa: "ISA 450", description: "Unadjusted and adjusted misstatements schedule with materiality assessment." },
    "G2": { title: "Adjusting Journal Entries", section: "Completion", isa: "ISA 450", description: "Proposed and accepted adjusting entries with financial impact analysis." },
    "G3": { title: "Final Analytical Review", section: "Completion", isa: "ISA 520", description: "Final-stage analytical procedures to confirm overall audit conclusions." },
    "G4": { title: "Audit Completion Checklist", section: "Completion", isa: "ISA 220, ISA 230", description: "Comprehensive audit completion procedures and partner review checklist." },
    "G5": { title: "Going Concern Final Conclusion", section: "Completion", isa: "ISA 570", description: "Final going concern evaluation and impact on audit opinion." },
    "G6": { title: "Subsequent Events Final Review", section: "Completion", isa: "ISA 560", description: "Final review of events between reporting date and audit report date." },
    "G7": { title: "Management Representation Letter", section: "Completion", isa: "ISA 580", description: "Written representations from management on material matters." },
    "H1": { title: "Audit Opinion Assessment", section: "Reporting", isa: "ISA 700, ISA 705", description: "Assessment of appropriate audit opinion type and basis." },
    "H2": { title: "Draft Auditor's Report", section: "Reporting", isa: "ISA 700, ISA 705, ISA 706", description: "Draft audit report with opinion, basis, and emphasis of matter paragraphs." },
    "H3": { title: "Key Audit Matters", section: "Reporting", isa: "ISA 701", description: "Identification and communication of key audit matters for listed entities." },
    "H4": { title: "Emphasis of Matter / Other Matter", section: "Reporting", isa: "ISA 706", description: "Emphasis of matter and other matter paragraphs assessment." },
    "H5": { title: "Other Information Review", section: "Reporting", isa: "ISA 720", description: "Review of other information in documents containing audited FS." },
    "I1": { title: "Engagement Quality Review (EQCR)", section: "Quality Control", isa: "ISQM 1, ISQM 2", description: "Engagement quality control review and sign-off." },
    "I2": { title: "Review Notes & Clearance", section: "Quality Control", isa: "ISA 220", description: "Review notes resolution and clearance documentation." },
    "I3": { title: "Consultation Documentation", section: "Quality Control", isa: "ISA 220, ISQM 1", description: "Documentation of consultations on difficult or contentious matters." },
    "I4": { title: "File Completion & Locking", section: "Quality Control", isa: "ISA 230", description: "Audit file assembly, completeness check, and 60-day locking deadline." },
    "J1": { title: "Income Tax Computation", section: "Tax & Regulatory", isa: "ITO 2001, ISA 500", description: "Income tax provision, advance tax, minimum tax, and WHT compliance." },
    "J2": { title: "Deferred Tax Working", section: "Tax & Regulatory", isa: "IAS 12, ITO 2001", description: "Deferred tax asset/liability calculation and movement schedule." },
    "J3": { title: "Sales Tax Reconciliation", section: "Tax & Regulatory", isa: "STA 1990, FED Act", description: "Sales tax returns, input/output reconciliation, and FED obligations." },
    "J4": { title: "Withholding Tax Compliance", section: "Tax & Regulatory", isa: "ITO 2001", description: "WHT deduction and deposit compliance for all applicable sections." },
    "J5": { title: "Super Tax Calculation", section: "Tax & Regulatory", isa: "ITO 2001", description: "Super tax computation and applicability assessment." },
    "K1": { title: "Signed Audit Opinion", section: "Final Output & Archive", isa: "ISA 700, ISA 720", description: "Final signed audit report with all required elements." },
    "K2": { title: "Engagement Completion & Close", section: "Final Output & Archive", isa: "ISA 230, ISQM 1", description: "Engagement completion procedures, final partner review, and close." },
    "K3": { title: "Archive & Retention", section: "Final Output & Archive", isa: "ISA 230", description: "File archival per ISA 230 with retention schedule and access controls." },
  };

  const ap = analysis.analytical_procedures || {};
  const reconciliation = analysis.reconciliation || {};
  const evidenceItems = analysis.evidence_items || [];
  const icWeaknesses = analysis.internal_control_weaknesses || [];

  const evidenceSummary = evidenceItems.length > 0
    ? evidenceItems.map((e: any) => `  ${e.id}: ${e.filename} (${e.type}) — ${e.description}`).join("\n")
    : "  EV-1: Trial Balance\n  EV-2: General Ledger\n  EV-3: Bank Statements";

  const ratiosSummary = ap.ratios
    ? `Gross Margin: ${ap.ratios.gross_margin_pct?.toFixed(1)}% | Net Margin: ${ap.ratios.net_margin_pct?.toFixed(1)}% | Current Ratio: ${ap.ratios.current_ratio?.toFixed(2)} | D/E: ${ap.ratios.debt_to_equity?.toFixed(2)}`
    : "Ratios not computed";

  const bsSummary = Array.isArray(bsData) ? bsData.flatMap((s: any) => (s.lines || []).map((l: any) => `${l.label}: CY=${l.cy}, PY=${l.py}`)).join("\n") : "";
  const plSummary = Array.isArray(plData) ? plData.flatMap((s: any) => (s.lines || []).map((l: any) => `${l.label}: CY=${l.cy}, PY=${l.py}`)).join("\n") : "";

  const contextBlock = `ENTITY: ${entityName || entity.name || "Client Company"}
NTN: ${ntn || "—"} | SECP: ${secp || "—"} | STRN: ${strn || "—"}
INDUSTRY: ${industry || entity.industry || "—"}
ENTITY TYPE: ${entityType || "Private Limited"} | FRAMEWORK: ${framework || "IFRS"} | LISTED: ${listedStatus || "Unlisted"}
FIRST YEAR AUDIT: ${firstYearAudit ? "Yes (ISA 510 applies)" : "No"}
GOING CONCERN FLAG: ${goingConcernFlag ? "Yes — ISA 570 extended procedures required" : "No material doubt"}
CONTROL RELIANCE: ${controlReliance || "Partial"}
NEW CLIENT: ${newClient ? "Yes" : "No"}
GROUP AUDIT (ISA 600): ${groupAuditFlag ? "Yes" : "No"}
INTERNAL AUDIT EXISTS (ISA 610): ${internalAuditExists ? "Yes" : "No"}
CURRENCY: ${currency || "PKR"}
ADDRESS: ${registeredAddress || "—"}
PERIOD: ${periodStart || "—"} to ${periodEnd || "—"}
FINANCIAL YEAR: ${financialYear || entity.financial_year || "Year ended June 30, 2024"}
ENGAGEMENT TYPE: ${engagementType || "Statutory Audit"}
FIRM: ${firmName || "ANA & Co. Chartered Accountants"}

ETHICS & INDEPENDENCE (IESBA):
- Independence Confirmed: ${independenceConfirmed !== false ? "Yes" : "No"}
- Conflict Check Cleared: ${conflictCheck !== false ? "Yes" : "No"}
- EQCR Required (ISQM 2): ${eqcrRequired ? "Yes" : "No"}

SAMPLING (ISA 530): Method: ${samplingMethod || "Statistical"} | Confidence: ${confidenceLevel || "95%"}

SPECIAL AREAS:
- Related Parties (ISA 550): ${relatedPartyFlag ? "Flagged" : "Not flagged"}
- Subsequent Events (ISA 560): ${subsequentEventsFlag ? "Flagged" : "Not flagged"}
- Accounting Estimates (ISA 540): ${estimatesFlag ? "Flagged" : "Not flagged"}
- Litigation / Claims (ISA 501): ${litigationFlag ? "Flagged" : "Not flagged"}
- Expert Required (ISA 620): ${expertRequired ? "Yes" : "No"}

TAX & REGULATORY (PAKISTAN):
- Income Tax (ITO 2001): ${currentTaxApplicable !== false ? "Applicable" : "N/A"}
- Deferred Tax (IAS 12): ${deferredTaxApplicable !== false ? "Applicable" : "N/A"}
- WHT Exposure: ${whtExposure !== false ? "Yes" : "No"}
- Sales Tax Registered: ${salesTaxRegistered !== false ? "Yes" : "No"}
- Super Tax: ${superTaxApplicable ? "Applicable" : "N/A"}

FINANCIAL DATA (Current Year):
- Revenue: ${formatPKR(fin.revenue)}
- Gross Profit: ${formatPKR(fin.gross_profit)} (${fin.revenue ? ((fin.gross_profit/fin.revenue)*100).toFixed(1) : 0}%)
- Net Profit: ${formatPKR(fin.net_profit)} (${fin.revenue ? ((fin.net_profit/fin.revenue)*100).toFixed(1) : 0}%)
- Total Assets: ${formatPKR(fin.total_assets)}
- Total Liabilities: ${formatPKR(fin.total_liabilities)}
- Equity: ${formatPKR(fin.equity)}
- Cash & Bank: ${formatPKR(fin.cash_and_bank)}
- Trade Receivables: ${formatPKR(fin.trade_receivables)}
- Trade Payables: ${formatPKR(fin.trade_payables)}
- Inventory: ${formatPKR(fin.inventory)}
- Fixed Assets: ${formatPKR(fin.fixed_assets)}

PRIOR YEAR: Revenue: ${formatPKR(fin.prior_year_revenue || 0)} | Net Profit: ${formatPKR(fin.prior_year_net_profit || 0)} | Total Assets: ${formatPKR(fin.prior_year_total_assets || 0)}

${bsSummary ? `BALANCE SHEET DATA:\n${bsSummary}\n` : ""}
${plSummary ? `PROFIT & LOSS DATA:\n${plSummary}\n` : ""}

MATERIALITY (ISA 320):
- OM: ${formatPKR(materiality.overall_materiality)} (${materiality.basis || "Net Profit"} × ${materiality.percentage_used || 5}%)
- PM: ${formatPKR(materiality.performance_materiality)}
- Trivial: ${formatPKR(materiality.trivial_threshold || (materiality.overall_materiality || 0) * 0.05)}

OVERALL RISK: ${risks.overall_risk || "Medium"}
RATIOS: ${ratiosSummary}
RECONCILIATION: TB vs FS: ${reconciliation.tb_vs_fs?.status || "N/A"} | Bank: ${reconciliation.bank_reconciliation?.status || "N/A"}
EVIDENCE: ${evidenceSummary}
IC WEAKNESSES: ${icWeaknesses.length} identified
SIGNIFICANT RISK AREAS: ${Array.isArray(significantRiskAreas) && significantRiskAreas.length > 0 ? significantRiskAreas.join(", ") : "None specifically flagged"}`;

  const wpJsonSchema = `For EACH working paper, return this JSON structure:
{
  "ref": "A1",
  "title": string,
  "section": string,
  "section_label": string,
  "isa_references": [string],
  "assertions": [string],
  "objective": string (2-3 sentences),
  "scope": string,
  "procedures": [{ "no": string, "procedure": string, "finding": string, "conclusion": "Satisfactory"|"Note Required"|"Matters Arising", "evidence_ref": string }],
  "summary_table": [{ "item": string, "value": string, "comment": string }] | null,
  "key_findings": [string],
  "auditor_conclusion": string,
  "risks_identified": [string],
  "recommendations": [string],
  "evidence_refs": [string],
  "cross_references": [string],
  "status": "Draft"
}
RULES: Use real numbers, ISA 230 language, Pakistan standards (ITO 2001, STA 1990, Companies Act 2017). Never use placeholder text.
Return JSON: { "working_papers": [...] }`;

  const batches: string[][] = [];
  const batchGroups = [
    papersToGenerate.filter(p => /^[A-D]/.test(p)),
    papersToGenerate.filter(p => /^E/.test(p)),
    papersToGenerate.filter(p => /^[F-H]/.test(p)),
    papersToGenerate.filter(p => /^[I-K]/.test(p)),
  ];
  for (const bg of batchGroups) {
    if (bg.length > 0) batches.push(bg);
  }

  try {
    const allGeneratedPapers: any[] = [];

    for (let bi = 0; bi < batches.length; bi++) {
      const batch = batches[bi];
      const batchDefs = batch.map(ref => {
        const def = wpDefinitions[ref];
        return def ? `${ref}: ${def.title} (${def.section}) — ${def.isa} — ${def.description}` : ref;
      }).join("\n");

      const batchPrompt = `Generate the following audit working papers (batch ${bi + 1} of ${batches.length}):\n${batchDefs}\n\n${contextBlock}\n\n${wpJsonSchema}`;

      const genResponse = await ai.client.chat.completions.create({
        model: ai.model,
        messages: [
          { role: "system", content: "You are a professional Pakistan audit AI engine. Generate ISA-compliant working papers. Return only valid JSON. Never use placeholder text." },
          { role: "user", content: batchPrompt },
        ],
        max_tokens: 12000,
        temperature: 0.2,
        response_format: { type: "json_object" },
      });

      const raw = genResponse.choices[0]?.message?.content || "{}";
      let batchData: any;
      try {
        batchData = JSON.parse(raw);
      } catch {
        batchData = { working_papers: [] };
      }
      const batchPapers = batchData.working_papers || [];
      allGeneratedPapers.push(...batchPapers);
      logger.info(`Batch ${bi + 1}/${batches.length}: generated ${batchPapers.length} papers`);
    }

    const workingPapers = allGeneratedPapers;

    const enrichedPapers = workingPapers.map((wp: any) => {
      const def      = wpDefinitions[wp.ref] || {};
      const signoffs = getWPSignoffs(wp.ref, engDates, teamNames);
      return {
        ...wp,
        section_label:   def.section || wp.section,
        isa_references:  wp.isa_references || [def.isa || "ISA 500"],
        assertions:      wp.assertions || [],
        evidence_refs:   wp.evidence_refs || [],
        cross_references: wp.cross_references || [],
        // Engagement team sign-offs (injected by date engine)
        prepared_by:   signoffs.prepared_by,
        prepared_date: signoffs.prepared_date,
        reviewed_by:   signoffs.reviewed_by,
        reviewed_date: signoffs.reviewed_date,
        approved_by:   signoffs.approved_by,
        approved_date: signoffs.approved_date,
        partner:       teamNames.approver,
      };
    });

    const defaultEvidence = [
      { ref: "EV-1", description: "Trial Balance", type: "financial", wp_refs: enrichedPapers.map((wp: any) => wp.ref) },
      { ref: "EV-2", description: "General Ledger", type: "financial", wp_refs: enrichedPapers.map((wp: any) => wp.ref) },
      { ref: "EV-3", description: "Bank Statements", type: "financial", wp_refs: enrichedPapers.filter((wp: any) => wp.ref === "E1").map((wp: any) => wp.ref) },
    ];
    const uploadedEvidence = evidenceItems.map((e: any) => ({
      ref: e.id,
      description: e.description || e.filename,
      type: e.type,
      wp_refs: enrichedPapers.map((wp: any) => wp.ref).filter((_: any, i: number) => i % 3 === 0),
    }));
    const generatedEvidenceIndex = uploadedEvidence.length > 0 ? uploadedEvidence : defaultEvidence;

    return res.json({
      success: true,
      working_papers: enrichedPapers,
      evidence_index: generatedEvidenceIndex,
      meta: {
        entity:          entityName || entity.name,
        financial_year:  financialYear || entity.financial_year,
        engagement_type: engagementType,
        firm_name:       firmName || "ANA & Co. Chartered Accountants",
        ntn,
        secp,
        strn,
        industry,
        entity_type:     entityType,
        framework,
        listed_status:   listedStatus,
        first_year_audit: firstYearAudit,
        going_concern_flag: goingConcernFlag,
        control_reliance: controlReliance,
        currency: currency || "PKR",
        new_client: newClient || false,
        group_audit: groupAuditFlag || false,
        internal_audit_exists: internalAuditExists || false,
        independence_confirmed: independenceConfirmed !== false,
        conflict_check: conflictCheck !== false,
        eqcr_required: eqcrRequired || false,
        sampling_method: samplingMethod || "Statistical",
        confidence_level: confidenceLevel || "95%",
        related_party_flag: relatedPartyFlag || false,
        subsequent_events_flag: subsequentEventsFlag || false,
        estimates_flag: estimatesFlag || false,
        litigation_flag: litigationFlag || false,
        expert_required: expertRequired || false,
        current_tax_applicable: currentTaxApplicable !== false,
        deferred_tax_applicable: deferredTaxApplicable !== false,
        wht_exposure: whtExposure !== false,
        sales_tax_registered: salesTaxRegistered !== false,
        super_tax_applicable: superTaxApplicable || false,
        registered_address: registeredAddress,
        period_start: periodStart || null,
        period_end: periodEnd || null,
        generated_at:    new Date().toISOString(),
        total_papers:    enrichedPapers.length,
        total_evidence:  generatedEvidenceIndex.length,
        team: {
          prepared_by: teamNames.preparer,
          reviewed_by: teamNames.reviewer,
          approved_by: teamNames.approver,
        },
        deadlines: {
          planning_deadline:   planningDeadline   || null,
          fieldwork_start:     fieldworkStart     || null,
          fieldwork_end:       fieldworkEnd       || null,
          reporting_deadline:  reportingDeadline  || null,
          report_date:         reportDate         || null,
          filing_deadline:     filingDeadline     || null,
          archive_date:        archiveDate        || null,
        },
      },
    });
  } catch (err: any) {
    logger.error({ err }, "Working paper generation failed");
    return res.status(500).json({ error: err?.message || "Generation failed" });
  }
});

// ─── POST /api/working-papers/export-pdf ──────────────────────────────────
router.post("/export-pdf", async (req: Request, res: Response) => {
  const { workingPapers, meta, analysis } = req.body;

  if (!workingPapers || workingPapers.length === 0) {
    return res.status(400).json({ error: "No working papers to export." });
  }

  try {
    const doc = new PDFDocument({ size: "A4", margin: 50, info: { Title: `Audit Working Paper File — ${meta?.entity || "Client"}`, Author: meta?.firm_name || "ANA & Co." } });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="AuditFile_${(meta?.entity || "Client").replace(/\s+/g, "_")}_${meta?.financial_year?.replace(/\s+/g, "_") || "2024"}.pdf"`);
    doc.pipe(res);

    const NAVY = "#1e3a5f";
    const BLUE = "#2563eb";
    const LIGHT_BLUE = "#eff6ff";
    const GREEN = "#16a34a";
    const GRAY = "#6b7280";
    const LIGHT_GRAY = "#f3f4f6";
    const RED = "#dc2626";
    const fw = doc.page.width - 100;

    function addWatermark() {
      doc.save();
      doc.opacity(0.05);
      doc.fontSize(60).font("Helvetica-Bold").fillColor("#000000");
      doc.rotate(-45, { origin: [doc.page.width / 2, doc.page.height / 2] });
      doc.text("CONFIDENTIAL", 50, doc.page.height / 2 - 30, { width: doc.page.width - 100, align: "center" });
      doc.restore();
    }

    function addPageFooter(pageNum: number, total: number) {
      const y = doc.page.height - 40;
      doc.save();
      doc.moveTo(50, y - 5).lineTo(doc.page.width - 50, y - 5).strokeColor("#e5e7eb").lineWidth(1).stroke();
      doc.fontSize(7).fillColor(GRAY).font("Helvetica");
      doc.text(`${meta?.firm_name || "ANA & Co. Chartered Accountants"} | Strictly Confidential`, 50, y, { align: "left" });
      doc.text(`Page ${pageNum} of ${total}`, 50, y, { align: "right" });
      doc.restore();
    }

    function addHeader(subtitle: string) {
      doc.rect(0, 0, doc.page.width, 60).fill(NAVY);
      doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(14).text(meta?.firm_name || "ANA & Co. Chartered Accountants", 50, 15, { align: "left" });
      doc.font("Helvetica").fontSize(9).fillColor("#93c5fd").text(subtitle, 50, 35, { align: "left" });
      doc.fillColor("#ffffff").fontSize(9).text(`${meta?.entity || "Client"} | ${meta?.financial_year || "FY 2024"}`, 50, 35, { align: "right" });
      doc.y = 80;
    }

    // ── COVER PAGE ─────────────────────────────────────────────────────────
    doc.rect(0, 0, doc.page.width, doc.page.height).fill(NAVY);
    doc.rect(0, doc.page.height - 8, doc.page.width, 8).fill(BLUE);
    addWatermark();

    doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(28).text("AUDIT WORKING", 50, 140, { align: "center" });
    doc.text("PAPER FILE", 50, 175, { align: "center" });
    doc.rect(150, 220, doc.page.width - 300, 2).fill("#3b82f6");

    doc.fontSize(16).fillColor("#93c5fd").text(meta?.entity || "Client Company", 50, 240, { align: "center" });
    doc.fontSize(11).fillColor("#bfdbfe").text(`${meta?.engagement_type || "Statutory Audit"} | ${meta?.financial_year || "Year Ended June 30, 2024"}`, 50, 270, { align: "center" });

    const infoY = 330;
    const infoBoxW = 200;
    doc.rect(50, infoY, infoBoxW, 120).fill("#1e40af").opacity(0.8);
    doc.opacity(1);
    doc.fillColor("#93c5fd").font("Helvetica-Bold").fontSize(8).text("AUDIT FIRM", 65, infoY + 12);
    doc.fillColor("#ffffff").font("Helvetica").fontSize(10).text(meta?.firm_name || "ANA & Co. Chartered Accountants", 65, infoY + 28, { width: infoBoxW - 30 });

    doc.rect(doc.page.width - 50 - infoBoxW, infoY, infoBoxW, 120).fill("#1e40af").opacity(0.8);
    doc.opacity(1);
    doc.fillColor("#93c5fd").font("Helvetica-Bold").fontSize(8).text("GENERATED", doc.page.width - 50 - infoBoxW + 15, infoY + 12);
    doc.fillColor("#ffffff").font("Helvetica").fontSize(10).text(new Date().toLocaleDateString("en-PK", { day: "2-digit", month: "long", year: "numeric" }), doc.page.width - 50 - infoBoxW + 15, infoY + 28, { width: infoBoxW - 30 });

    doc.fillColor("#60a5fa").fontSize(8).text(`Total Working Papers: ${workingPapers.length}`, 50, infoY + 175, { align: "center" });
    doc.text("ISA 200–720 Compliant | Audit Working Papers", 50, infoY + 190, { align: "center" });
    doc.fillColor("#fbbf24").fontSize(7).text("STRICTLY CONFIDENTIAL — For Audit Purposes Only", 50, doc.page.height - 60, { align: "center" });

    // ── TABLE OF CONTENTS ──────────────────────────────────────────────────
    doc.addPage();
    addWatermark();
    addHeader("Table of Contents");

    doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(16).text("TABLE OF CONTENTS", 50, 90, { align: "center" });
    doc.moveTo(50, 115).lineTo(doc.page.width - 50, 115).strokeColor(BLUE).lineWidth(2).stroke();
    doc.y = 130;

    const sections: Record<string, any[]> = {};
    workingPapers.forEach((wp: any) => {
      const sec = wp.section_label || wp.section || "General";
      if (!sections[sec]) sections[sec] = [];
      sections[sec].push(wp);
    });

    let pageCounter = 3;
    for (const [secName, papers] of Object.entries(sections)) {
      doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(10).text(secName.toUpperCase(), 50, doc.y, { continued: false });
      doc.moveTo(50, doc.y + 2).lineTo(fw + 50, doc.y + 2).strokeColor(LIGHT_BLUE).lineWidth(0.5).stroke();
      doc.y += 8;
      for (const wp of papers) {
        doc.fillColor("#111827").font("Helvetica").fontSize(9);
        doc.text(`${wp.ref} — ${wp.title}`, 70, doc.y, { continued: false, width: fw - 80 });
        doc.fillColor(GRAY).text(`Page ${pageCounter}`, 50, doc.y - 12, { align: "right" });
        pageCounter++;
        doc.y += 4;
      }
      doc.y += 6;
    }
    addPageFooter(2, workingPapers.length + 2);

    // ── WORKING PAPERS ────────────────────────────────────────────────────
    let wpPageNum = 3;
    for (const wp of workingPapers) {
      doc.addPage();
      addWatermark();
      addHeader(wp.section_label || wp.section || "Working Paper");

      // WP header box
      doc.rect(50, 80, fw, 55).fill(LIGHT_BLUE);
      doc.rect(50, 80, 4, 55).fill(BLUE);
      doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(13).text(`${wp.ref} — ${wp.title}`, 65, 90, { width: fw - 20 });
      doc.fillColor(GRAY).font("Helvetica").fontSize(8).text(
        `${(wp.isa_references || []).join(" | ")}  •  Prepared: ${wp.preparer || "Audit Senior"}  •  Reviewed: ${wp.reviewer || "Audit Manager"}  •  Date: ${wp.date_prepared || new Date().toLocaleDateString()}`,
        65, 115, { width: fw - 20 }
      );
      doc.y = 148;

      // Objective
      if (wp.objective) {
        doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(9).text("OBJECTIVE", 50, doc.y);
        doc.y += 12;
        doc.fillColor("#1f2937").font("Helvetica").fontSize(9).text(wp.objective, 50, doc.y, { width: fw });
        doc.y += 18;
      }

      // Scope
      if (wp.scope) {
        doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(9).text("SCOPE", 50, doc.y);
        doc.y += 12;
        doc.fillColor("#1f2937").font("Helvetica").fontSize(9).text(wp.scope, 50, doc.y, { width: fw });
        doc.y += 18;
      }

      // Procedures table
      if (wp.procedures && wp.procedures.length > 0) {
        doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(9).text("AUDIT PROCEDURES PERFORMED", 50, doc.y);
        doc.y += 10;

        const colWidths = [40, 170, 170, 90];
        const headers = ["Ref", "Procedure", "Finding", "Conclusion"];
        const rowH = 16;

        doc.rect(50, doc.y, fw, rowH).fill(NAVY);
        let cx = 50;
        headers.forEach((h, i) => {
          doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(7.5).text(h, cx + 4, doc.y + 4, { width: colWidths[i] - 8 });
          cx += colWidths[i];
        });
        doc.y += rowH;

        wp.procedures.forEach((proc: any, idx: number) => {
          if (doc.y > doc.page.height - 150) {
            doc.addPage();
            addWatermark();
            addHeader(`${wp.ref} — ${wp.title} (continued)`);
            doc.y = 90;
          }
          const bg = idx % 2 === 0 ? "#ffffff" : LIGHT_GRAY;
          const texts = [
            proc.no || `${idx + 1}`,
            proc.procedure || "",
            proc.finding || "",
            proc.conclusion || "",
          ];
          const maxLines = texts.reduce((max, t, i) => {
            const lines = Math.ceil((t || "").length / Math.max(1, colWidths[i] / 5.5));
            return Math.max(max, lines);
          }, 1);
          const dynH = Math.max(rowH, maxLines * 11 + 6);

          doc.rect(50, doc.y, fw, dynH).fill(bg);
          cx = 50;
          texts.forEach((t, i) => {
            doc.fillColor("#111827").font("Helvetica").fontSize(7.5).text(t, cx + 4, doc.y + 4, { width: colWidths[i] - 8 });
            cx += colWidths[i];
          });
          doc.moveTo(50, doc.y + dynH).lineTo(50 + fw, doc.y + dynH).strokeColor("#e5e7eb").lineWidth(0.3).stroke();
          doc.y += dynH;
        });
        doc.y += 12;
      }

      // Summary table if present
      if (wp.summary_table && wp.summary_table.length > 0) {
        if (doc.y > doc.page.height - 200) { doc.addPage(); addWatermark(); addHeader(`${wp.ref} — ${wp.title} (cont.)`); doc.y = 90; }
        doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(9).text("SUMMARY SCHEDULE", 50, doc.y);
        doc.y += 10;
        const cols2 = [fw * 0.35, fw * 0.3, fw * 0.35];
        const hdrs2 = ["Item", "Amount / Value", "Comment"];
        doc.rect(50, doc.y, fw, 16).fill(BLUE);
        let cx2 = 50;
        hdrs2.forEach((h, i) => {
          doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(7.5).text(h, cx2 + 4, doc.y + 4, { width: cols2[i] - 8 });
          cx2 += cols2[i];
        });
        doc.y += 16;
        wp.summary_table.forEach((row: any, idx: number) => {
          const bg = idx % 2 === 0 ? "#ffffff" : LIGHT_GRAY;
          doc.rect(50, doc.y, fw, 16).fill(bg);
          cx2 = 50;
          [row.item || "", row.value || "", row.comment || ""].forEach((t, i) => {
            doc.fillColor("#111827").font("Helvetica").fontSize(7.5).text(t, cx2 + 4, doc.y + 4, { width: cols2[i] - 8 });
            cx2 += cols2[i];
          });
          doc.y += 16;
        });
        doc.y += 12;
      }

      // Key findings
      if (wp.key_findings && wp.key_findings.length > 0) {
        if (doc.y > doc.page.height - 150) { doc.addPage(); addWatermark(); addHeader(`${wp.ref} — ${wp.title} (cont.)`); doc.y = 90; }
        doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(9).text("KEY FINDINGS", 50, doc.y);
        doc.y += 10;
        wp.key_findings.forEach((f: string) => {
          doc.rect(50, doc.y, 4, 14).fill(GREEN);
          doc.fillColor("#111827").font("Helvetica").fontSize(8.5).text(f, 62, doc.y + 2, { width: fw - 20 });
          doc.y += 16;
        });
        doc.y += 8;
      }

      // Conclusion box
      if (wp.auditor_conclusion) {
        if (doc.y > doc.page.height - 120) { doc.addPage(); addWatermark(); addHeader(`${wp.ref} — ${wp.title} (cont.)`); doc.y = 90; }
        doc.rect(50, doc.y, fw, 48).fill("#f0fdf4");
        doc.rect(50, doc.y, 4, 48).fill(GREEN);
        doc.fillColor(GREEN).font("Helvetica-Bold").fontSize(8).text("AUDITOR'S CONCLUSION", 62, doc.y + 8);
        doc.fillColor("#111827").font("Helvetica").fontSize(8.5).text(wp.auditor_conclusion, 62, doc.y + 22, { width: fw - 20 });
        doc.y += 62;
      }

      // Sign-off strip
      doc.rect(50, doc.y, fw, 32).fill(LIGHT_GRAY);
      const signCols = [fw / 3, fw / 3, fw / 3];
      const roles = [
        { role: "Prepared By", name: wp.preparer || "Audit Senior" },
        { role: "Reviewed By", name: wp.reviewer || "Audit Manager" },
        { role: "Approved By (Partner)", name: wp.partner || "Partner" },
      ];
      let sx = 50;
      roles.forEach(({ role, name }, i) => {
        doc.fillColor(GRAY).font("Helvetica").fontSize(7).text(role, sx + 5, doc.y + 6, { width: signCols[i] - 10 });
        doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(8).text(name, sx + 5, doc.y + 17, { width: signCols[i] - 10 });
        sx += signCols[i];
      });

      addPageFooter(wpPageNum, workingPapers.length + 2);
      wpPageNum++;
    }

    doc.end();
  } catch (err: any) {
    logger.error({ err }, "PDF export failed");
    if (!res.headersSent) {
      res.status(500).json({ error: err?.message || "PDF export failed" });
    }
  }
});

// ─── POST /api/working-papers/export-excel ────────────────────────────────
router.post("/export-excel", async (req: Request, res: Response) => {
  const { workingPapers, meta, analysis } = req.body;

  if (!workingPapers || workingPapers.length === 0) {
    return res.status(400).json({ error: "No working papers to export." });
  }

  try {
    const wb = XLSX.utils.book_new();
    const fin = analysis?.financials || {};
    const mat = analysis?.materiality || {};
    const risks = analysis?.risk_assessment || {};

    const fmtN = (n: any) => (n || n === 0) ? Number(n).toLocaleString("en-PK") : "N/A";
    const now = new Date().toLocaleDateString("en-PK", { day: "2-digit", month: "long", year: "numeric" });

    // ── 1. COVER SHEET ─────────────────────────────────────────────────────
    const coverData: any[][] = [
      ["AUDIT WORKING PAPER FILE"],
      [],
      ["Entity / Client", meta?.entity || "—"],
      ["Engagement Type", meta?.engagement_type || "Statutory Audit"],
      ["Financial Year", meta?.financial_year || "—"],
      ["Audit Firm", meta?.firm_name || "ANA & Co. Chartered Accountants"],
      ["Generated On", now],
      ["Total Working Papers", workingPapers.length],
      ["Compliance", "ISA 200–720 | IFRS | Companies Act 2017 | FBR Compliant"],
      ["Status", "DRAFT — CONFIDENTIAL"],
      [],
      ["FINANCIAL SUMMARY"],
      ["Item", "Amount (PKR)", "Notes"],
      ["Revenue", fmtN(fin.revenue), ""],
      ["Gross Profit", fmtN(fin.gross_profit), ""],
      ["Net Profit / (Loss)", fmtN(fin.net_profit), ""],
      ["Total Assets", fmtN(fin.total_assets), ""],
      ["Total Liabilities", fmtN(fin.total_liabilities), ""],
      ["Equity", fmtN(fin.equity), ""],
      ["Cash & Bank", fmtN(fin.cash_and_bank), ""],
      ["Trade Receivables", fmtN(fin.trade_receivables), ""],
      ["Trade Payables", fmtN(fin.trade_payables), ""],
      ["Inventory", fmtN(fin.inventory), ""],
      ["Fixed Assets", fmtN(fin.fixed_assets), ""],
      [],
      ["MATERIALITY (ISA 320)"],
      ["Basis", mat.basis || "—", ""],
      ["Percentage Used", mat.percentage_used ? `${mat.percentage_used}%` : "—", ""],
      ["Overall Materiality", fmtN(mat.overall_materiality), mat.rationale || ""],
      ["Performance Materiality", fmtN(mat.performance_materiality), "75% of overall materiality"],
      [],
      ["RISK ASSESSMENT"],
      ["Overall Risk Level", risks.overall_risk || "Medium"],
    ];
    if (risks.inherent_risks?.length) {
      coverData.push(["Inherent Risk Area", "Risk Description", "Level"]);
      risks.inherent_risks.forEach((r: any) => {
        coverData.push([r.area || "", r.risk || "", r.level || ""]);
      });
    }
    if (analysis?.assumptions_made?.length) {
      coverData.push([]);
      coverData.push(["AUDITOR ASSUMPTIONS / ESTIMATED DATA"]);
      analysis.assumptions_made.forEach((a: string, i: number) => {
        coverData.push([`${i + 1}.`, a]);
      });
    }
    const coverSheet = XLSX.utils.aoa_to_sheet(coverData);
    coverSheet["!cols"] = [{ wch: 32 }, { wch: 30 }, { wch: 48 }];
    XLSX.utils.book_append_sheet(wb, coverSheet, "Cover");

    // ── 2. INDEX SHEET ─────────────────────────────────────────────────────
    const indexHeader = ["WP Ref", "Title", "Section", "ISA References", "Status", "Preparer", "Reviewer", "Partner", "Date Prepared"];
    const indexRows: any[][] = workingPapers.map((wp: any) => [
      wp.ref || "",
      wp.title || "",
      wp.section_label || wp.section || "",
      (wp.isa_references || []).join(", "),
      wp.status || "Draft",
      wp.preparer || "Audit Senior",
      wp.reviewer || "Audit Manager",
      wp.partner || "Partner",
      wp.date_prepared || now,
    ]);
    const indexSheet = XLSX.utils.aoa_to_sheet([indexHeader, ...indexRows]);
    indexSheet["!cols"] = [{ wch: 10 }, { wch: 38 }, { wch: 22 }, { wch: 32 }, { wch: 10 }, { wch: 16 }, { wch: 18 }, { wch: 12 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, indexSheet, "Index");

    // ── 3. SECTION SHEETS ─────────────────────────────────────────────────
    const sectionMap: Record<string, any[]> = {};
    for (const wp of workingPapers) {
      const sec = wp.section_label || wp.section || "General";
      if (!sectionMap[sec]) sectionMap[sec] = [];
      sectionMap[sec].push(wp);
    }

    for (const [secName, papers] of Object.entries(sectionMap)) {
      const rows: any[][] = [];

      for (const wp of papers) {
        rows.push([`${wp.ref} — ${wp.title}`]);
        rows.push(["ISA References:", (wp.isa_references || []).join(" | ")]);
        rows.push(["Status:", wp.status || "Draft", "Preparer:", wp.preparer || "Audit Senior", "Reviewer:", wp.reviewer || "Audit Manager"]);
        rows.push(["Date:", wp.date_prepared || now]);
        rows.push([]);

        if (wp.objective) {
          rows.push(["OBJECTIVE"]);
          rows.push([wp.objective]);
          rows.push([]);
        }

        if (wp.scope) {
          rows.push(["SCOPE"]);
          rows.push([wp.scope]);
          rows.push([]);
        }

        if (wp.procedures && wp.procedures.length > 0) {
          rows.push(["AUDIT PROCEDURES"]);
          rows.push(["Ref", "Procedure", "Finding / Evidence Obtained", "Conclusion"]);
          wp.procedures.forEach((p: any, i: number) => {
            rows.push([p.no || `${i + 1}`, p.procedure || "", p.finding || "", p.conclusion || ""]);
          });
          rows.push([]);
        }

        if (wp.summary_table && wp.summary_table.length > 0) {
          rows.push(["SUMMARY SCHEDULE"]);
          rows.push(["Item", "Amount / Value", "Comment"]);
          wp.summary_table.forEach((r: any) => {
            rows.push([r.item || "", r.value || "", r.comment || ""]);
          });
          rows.push([]);
        }

        if (wp.key_findings && wp.key_findings.length > 0) {
          rows.push(["KEY FINDINGS"]);
          wp.key_findings.forEach((f: string, i: number) => {
            rows.push([`${i + 1}.`, f]);
          });
          rows.push([]);
        }

        if (wp.auditor_conclusion) {
          rows.push(["AUDITOR'S CONCLUSION"]);
          rows.push([wp.auditor_conclusion]);
          rows.push([]);
        }

        if (wp.recommendations && wp.recommendations.length > 0) {
          rows.push(["RECOMMENDATIONS"]);
          wp.recommendations.forEach((r: string, i: number) => {
            rows.push([`${i + 1}.`, r]);
          });
          rows.push([]);
        }

        rows.push(["Prepared By:", wp.preparer || "Audit Senior", "Reviewed By:", wp.reviewer || "Audit Manager", "Partner:", wp.partner || "Partner"]);
        rows.push([]);
        rows.push(["─".repeat(80)]);
        rows.push([]);
      }

      const sheetName = secName.length > 31 ? secName.slice(0, 31) : secName;
      const sheet = XLSX.utils.aoa_to_sheet(rows);
      sheet["!cols"] = [{ wch: 10 }, { wch: 45 }, { wch: 38 }, { wch: 22 }];
      XLSX.utils.book_append_sheet(wb, sheet, sheetName);
    }

    // ── 4. MATERIALITY SHEET (ISA 320) ──────────────────────────────────────
    const matRows: any[][] = [
      ["MATERIALITY DETERMINATION — ISA 320/450"],
      [],
      ["Parameter", "Value", "Rationale"],
      ["Benchmark / Basis", mat.basis || "Net Profit", mat.rationale || "Industry standard"],
      ["Benchmark Amount", fmtN(fin[mat.basis === "Revenue" ? "revenue" : mat.basis === "Total Assets" ? "total_assets" : "net_profit"]), ""],
      ["Percentage Applied", mat.percentage_used ? `${mat.percentage_used}%` : "5%", ""],
      ["Overall Materiality (OM)", fmtN(mat.overall_materiality), ""],
      ["Performance Materiality (PM)", fmtN(mat.performance_materiality), "75% of OM — ISA 320.A12"],
      ["Trivial Threshold (SAD)", fmtN(mat.trivial_threshold || (mat.overall_materiality || 0) * 0.05), "5% of OM — ISA 450.A2"],
      [],
      ["SUMMARY OF AUDIT DIFFERENCES (SAD)"],
      ["No.", "Description", "Amount (PKR)", "Factual/Judgmental", "Passed/Adjusted"],
      ["", "(Populated during fieldwork)", "", "", ""],
    ];
    const matSheet = XLSX.utils.aoa_to_sheet(matRows);
    matSheet["!cols"] = [{ wch: 30 }, { wch: 28 }, { wch: 40 }];
    XLSX.utils.book_append_sheet(wb, matSheet, "Materiality");

    // ── 5. ANALYTICAL PROCEDURES SHEET (ISA 520) ─────────────────────────────
    const ap = analysis?.analytical_procedures || {};
    const ratios = ap.ratios || {};
    const apRows: any[][] = [
      ["ANALYTICAL PROCEDURES — ISA 520"],
      [],
      ["Ratio / Metric", "Current Year", "Prior Year", "Variance", "Comment"],
      ["Revenue", fmtN(fin.revenue), fmtN(fin.prior_year_revenue), fin.revenue && fin.prior_year_revenue ? `${(((fin.revenue - fin.prior_year_revenue)/fin.prior_year_revenue)*100).toFixed(1)}%` : "N/A", ""],
      ["Net Profit", fmtN(fin.net_profit), fmtN(fin.prior_year_net_profit), fin.net_profit && fin.prior_year_net_profit ? `${(((fin.net_profit - fin.prior_year_net_profit)/fin.prior_year_net_profit)*100).toFixed(1)}%` : "N/A", ""],
      ["Total Assets", fmtN(fin.total_assets), fmtN(fin.prior_year_total_assets), fin.total_assets && fin.prior_year_total_assets ? `${(((fin.total_assets - fin.prior_year_total_assets)/fin.prior_year_total_assets)*100).toFixed(1)}%` : "N/A", ""],
      [],
      ["KEY RATIOS"],
      ["Gross Margin %", ratios.gross_margin_pct ? `${ratios.gross_margin_pct.toFixed(1)}%` : "N/A", "", "", ""],
      ["Net Margin %", ratios.net_margin_pct ? `${ratios.net_margin_pct.toFixed(1)}%` : "N/A", "", "", ""],
      ["Current Ratio", ratios.current_ratio ? ratios.current_ratio.toFixed(2) : "N/A", "", "", ""],
      ["Debt-to-Equity", ratios.debt_to_equity ? ratios.debt_to_equity.toFixed(2) : "N/A", "", "", ""],
      ["Return on Assets %", fin.total_assets ? `${((fin.net_profit / fin.total_assets)*100).toFixed(1)}%` : "N/A", "", "", ""],
      ["Return on Equity %", fin.equity ? `${((fin.net_profit / fin.equity)*100).toFixed(1)}%` : "N/A", "", "", ""],
    ];
    const apSheet = XLSX.utils.aoa_to_sheet(apRows);
    apSheet["!cols"] = [{ wch: 22 }, { wch: 22 }, { wch: 22 }, { wch: 16 }, { wch: 30 }];
    XLSX.utils.book_append_sheet(wb, apSheet, "Analytical Review");

    // ── 6. LEAD SCHEDULE SHEET ───────────────────────────────────────────────
    const lsRows: any[][] = [
      ["LEAD SCHEDULE — BALANCE SHEET AREAS"],
      [],
      ["Area", "Current Year (PKR)", "Prior Year (PKR)", "Movement (PKR)", "Movement %", "WP Ref", "Materiality Flag"],
    ];
    const bsAreas = [
      { area: "Cash & Bank", cy: fin.cash_and_bank, py: null, ref: "E1" },
      { area: "Trade Receivables", cy: fin.trade_receivables, py: null, ref: "E2" },
      { area: "Inventory", cy: fin.inventory, py: null, ref: "E3" },
      { area: "Fixed Assets", cy: fin.fixed_assets, py: null, ref: "E4" },
      { area: "Trade Payables", cy: fin.trade_payables, py: null, ref: "E5" },
      { area: "Total Assets", cy: fin.total_assets, py: fin.prior_year_total_assets, ref: "—" },
      { area: "Total Liabilities", cy: fin.total_liabilities, py: null, ref: "—" },
      { area: "Equity", cy: fin.equity, py: null, ref: "—" },
    ];
    const om = mat.overall_materiality || 0;
    for (const item of bsAreas) {
      const mvt = item.py ? (item.cy || 0) - item.py : null;
      const mvtPct = item.py && item.py !== 0 ? ((mvt! / item.py) * 100).toFixed(1) + "%" : "—";
      const flag = (item.cy || 0) > om ? "Above OM" : "Below OM";
      lsRows.push([item.area, fmtN(item.cy), item.py ? fmtN(item.py) : "—", mvt !== null ? fmtN(mvt) : "—", mvtPct, item.ref, flag]);
    }
    const lsSheet = XLSX.utils.aoa_to_sheet(lsRows);
    lsSheet["!cols"] = [{ wch: 22 }, { wch: 22 }, { wch: 22 }, { wch: 20 }, { wch: 14 }, { wch: 10 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, lsSheet, "Lead Schedule");

    // ── 7. PM ALLOCATION SHEET ─────────────────────────────────────────────
    const pmRows: any[][] = [
      ["PERFORMANCE MATERIALITY ALLOCATION — ISA 320.A12"],
      [],
      ["FS Line Item", "Carrying Amount (PKR)", "Allocated PM (PKR)", "% of Total PM", "Risk Level", "WP Ref"],
    ];
    const pmTotal = mat.performance_materiality || 0;
    const pmAreas = [
      { item: "Revenue", amount: fin.revenue, ref: "E6", risk: "High" },
      { item: "Trade Receivables", amount: fin.trade_receivables, ref: "E2", risk: "Medium" },
      { item: "Inventory", amount: fin.inventory, ref: "E3", risk: "Medium" },
      { item: "Fixed Assets", amount: fin.fixed_assets, ref: "E4", risk: "Low" },
      { item: "Trade Payables", amount: fin.trade_payables, ref: "E5", risk: "Medium" },
      { item: "Cash & Bank", amount: fin.cash_and_bank, ref: "E1", risk: "Low" },
      { item: "Expenses", amount: fin.net_profit, ref: "E7", risk: "Medium" },
    ];
    const totalCarrying = pmAreas.reduce((s, a) => s + (a.amount || 0), 0);
    for (const a of pmAreas) {
      const pct = totalCarrying ? ((a.amount || 0) / totalCarrying * 100).toFixed(1) : "0";
      const allocated = totalCarrying ? Math.round(pmTotal * (a.amount || 0) / totalCarrying) : 0;
      pmRows.push([a.item, fmtN(a.amount), fmtN(allocated), `${pct}%`, a.risk, a.ref]);
    }
    pmRows.push([], ["Total", fmtN(totalCarrying), fmtN(pmTotal), "100%", "", ""]);
    const pmSheet = XLSX.utils.aoa_to_sheet(pmRows);
    pmSheet["!cols"] = [{ wch: 26 }, { wch: 22 }, { wch: 22 }, { wch: 14 }, { wch: 12 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, pmSheet, "PM Allocation");

    // ── 8. FS MAPPING SHEET ────────────────────────────────────────────────
    const fsMappingRows: any[][] = [
      ["FINANCIAL STATEMENT ASSERTION MAPPING"],
      [],
      ["FS Line Item", "Existence", "Completeness", "Accuracy", "Valuation", "Rights & Obligations", "Cut-off", "Classification", "Presentation", "WP Ref"],
      ["Revenue", "H", "H", "H", "M", "L", "H", "M", "M", "E6"],
      ["Trade Receivables", "H", "H", "H", "H", "M", "H", "M", "M", "E2"],
      ["Inventory", "H", "H", "M", "H", "M", "M", "M", "M", "E3"],
      ["Fixed Assets", "M", "M", "L", "H", "M", "L", "M", "M", "E4"],
      ["Trade Payables", "H", "H", "H", "M", "M", "H", "M", "M", "E5"],
      ["Cash & Bank", "H", "H", "H", "L", "M", "M", "L", "L", "E1"],
      ["Provisions", "M", "M", "M", "H", "H", "L", "M", "M", "E10"],
      ["Payroll / Staff Costs", "M", "H", "H", "L", "M", "H", "M", "M", "E7"],
      [],
      ["Legend: H = High Risk, M = Medium Risk, L = Low Risk"],
    ];
    const fsMappingSheet = XLSX.utils.aoa_to_sheet(fsMappingRows);
    fsMappingSheet["!cols"] = [{ wch: 22 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 20 }, { wch: 10 }, { wch: 16 }, { wch: 14 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, fsMappingSheet, "FS Mapping");

    // ── 9. ToC MATRIX (Tests of Controls) ──────────────────────────────────
    const tocRows: any[][] = [
      ["TESTS OF CONTROLS MATRIX — ISA 330"],
      [],
      ["Process / Cycle", "Control Description", "Assertion", "Test Procedure", "Sample Size", "Result", "WP Ref"],
      ["Revenue Cycle", "Authorization of sales orders", "Occurrence", "Inspect approval signatures on sample", "25", "", "D3"],
      ["Revenue Cycle", "Segregation of duties — invoicing vs receipts", "Accuracy", "Walkthrough and observation", "N/A", "", "D2"],
      ["Procurement", "PO approval for purchases above threshold", "Completeness", "Sample POs and verify authorization", "25", "", "D3"],
      ["Procurement", "Three-way matching (PO/GRN/Invoice)", "Accuracy", "Re-perform matching on sample", "20", "", "D3"],
      ["Payroll", "Authorization of payroll changes", "Occurrence", "Inspect HR approvals for new hires/terminations", "15", "", "D3"],
      ["Cash & Bank", "Bank reconciliation review and approval", "Existence", "Inspect monthly bank reconciliations", "12", "", "D1"],
      ["Fixed Assets", "Capital expenditure authorization", "Rights", "Inspect approval for additions > threshold", "10", "", "E4"],
      ["IT General Controls", "Access controls — user provisioning", "Completeness", "Review user access logs", "N/A", "", "D4"],
    ];
    const tocSheet = XLSX.utils.aoa_to_sheet(tocRows);
    tocSheet["!cols"] = [{ wch: 18 }, { wch: 40 }, { wch: 14 }, { wch: 40 }, { wch: 12 }, { wch: 10 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, tocSheet, "ToC Matrix");

    // ── 10. ToD / SUBSTANTIVE TESTING MATRIX ────────────────────────────────
    const todRows: any[][] = [
      ["TESTS OF DETAILS / SUBSTANTIVE TESTING MATRIX — ISA 330/500"],
      [],
      ["FS Area", "Assertion Tested", "Procedure", "Source of Evidence", "Sample Size Basis", "Expected Result", "WP Ref"],
      ["Cash & Bank", "Existence, Completeness", "Bank confirmation + reconciliation", "Bank certificates", "All banks", "Fully reconciled", "E1"],
      ["Trade Receivables", "Existence, Valuation", "External confirmation (ISA 505)", "Direct debtor confirmation", `${meta?.sampling_method || "Statistical"}`, "100% response or alternative", "E2"],
      ["Inventory", "Existence, Valuation", "Physical count observation + NRV test", "Count sheets + market prices", "Value-weighted", "Variance < PM", "E3"],
      ["Fixed Assets", "Existence, Valuation", "Physical verification + depreciation recalculation", "FAR + inspection", "Above PM threshold", "Within tolerance", "E4"],
      ["Trade Payables", "Completeness, Accuracy", "Supplier statement reconciliation", "Supplier statements", "Top 10 + random 15", "Differences < PM", "E5"],
      ["Revenue", "Occurrence, Accuracy", "Vouching sales to invoices/contracts", "Sales invoices, contracts", meta?.sampling_method || "Statistical", "Agree to supporting docs", "E6"],
      ["Expenses", "Occurrence, Accuracy", "Recalculate selected months + statutory deductions", "Payroll registers, invoices", "3 months", "Within tolerance", "E7"],
      ["Provisions", "Existence, Valuation", "Review legal confirmations + management estimates", "Legal confirmations", "All material", "Agree to external evidence", "E10"],
    ];
    const todSheet = XLSX.utils.aoa_to_sheet(todRows);
    todSheet["!cols"] = [{ wch: 20 }, { wch: 22 }, { wch: 36 }, { wch: 28 }, { wch: 18 }, { wch: 24 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, todSheet, "ToD Matrix");

    // ── 11. MISSTATEMENT SUMMARY (ISA 450) ──────────────────────────────────
    const misRows: any[][] = [
      ["SUMMARY OF AUDIT MISSTATEMENTS — ISA 450"],
      [],
      ["No.", "Description", "FS Line Item", "Amount (DR)", "Amount (CR)", "Net Effect (PKR)", "Type", "Disposition"],
      ["", "(To be populated during fieldwork)", "", "", "", "", "", ""],
      [],
      ["THRESHOLDS"],
      ["Overall Materiality", fmtN(mat.overall_materiality)],
      ["Performance Materiality", fmtN(mat.performance_materiality)],
      ["Trivial (SAD) Threshold", fmtN(mat.trivial_threshold || (mat.overall_materiality || 0) * 0.05)],
      [],
      ["AGGREGATE UNCORRECTED MISSTATEMENTS"],
      ["Total Factual Misstatements", "—"],
      ["Total Judgmental Misstatements", "—"],
      ["Total Projected Misstatements", "—"],
      ["Grand Total", "—"],
      ["Exceeds OM?", "—"],
      [],
      ["CONCLUSION"],
      ["Based on audit work performed, aggregate uncorrected misstatements are [below/above] overall materiality. [No modification / Modification] to auditor's report is required."],
    ];
    const misSheet = XLSX.utils.aoa_to_sheet(misRows);
    misSheet["!cols"] = [{ wch: 8 }, { wch: 40 }, { wch: 22 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 14 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, misSheet, "Misstatements");

    // ── 12. ADJUSTING JOURNAL ENTRIES (AJE) ─────────────────────────────────
    const ajeRows: any[][] = [
      ["SCHEDULE OF ADJUSTING JOURNAL ENTRIES"],
      [],
      ["AJE No.", "Date", "Account", "Description", "Debit (PKR)", "Credit (PKR)", "Proposed By", "Status"],
      ["AJE-001", "", "", "(To be populated during fieldwork)", "", "", "", ""],
      [],
      ["SUMMARY"],
      ["Total Proposed AJEs", "—"],
      ["Total Accepted by Client", "—"],
      ["Total Declined by Client", "—"],
      ["Net Impact on Net Profit", "—"],
      ["Net Impact on Total Assets", "—"],
    ];
    const ajeSheet = XLSX.utils.aoa_to_sheet(ajeRows);
    ajeSheet["!cols"] = [{ wch: 12 }, { wch: 14 }, { wch: 28 }, { wch: 36 }, { wch: 18 }, { wch: 18 }, { wch: 16 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, ajeSheet, "AJE Schedule");

    // ── 13. TAX COMPUTATION (Pakistan) ──────────────────────────────────────
    const taxRows: any[][] = [
      ["INCOME TAX COMPUTATION — Income Tax Ordinance 2001"],
      [],
      ["Particulars", "Amount (PKR)", "Reference / Notes"],
      ["Accounting Profit Before Tax", fmtN(fin.net_profit), "Per audited FS"],
      [],
      ["ADD: Inadmissible Expenses"],
      ["Accounting depreciation", "—", "Sec 22 — Tax depreciation applies"],
      ["Provisions / Reserves", "—", "Sec 21(m)"],
      ["Donations (excess of limit)", "—", "Sec 61"],
      ["Other inadmissible items", "—", ""],
      [],
      ["LESS: Admissible Deductions"],
      ["Tax depreciation", "—", "Third Schedule"],
      ["Initial allowance", "—", "Third Schedule Part II"],
      ["Brought forward losses", "—", "Sec 57"],
      [],
      ["Taxable Income", "—", ""],
      ["Tax Rate Applied", "—", "First Schedule / Division II"],
      ["Tax Liability", "—", ""],
      ["Less: Tax Credits", "—", ""],
      ["Less: Minimum Tax u/s 113", "—", "Turnover × 1.25%"],
      ["Less: Advance Tax / WHT", "—", "Sec 147 / 148–236"],
      ["Tax Payable / (Refundable)", "—", ""],
    ];
    if (meta?.super_tax_applicable) {
      taxRows.push([], ["SUPER TAX (Sec 4C)"], ["Taxable Income", "—", ""], ["Super Tax Rate", "—", ""], ["Super Tax Liability", "—", ""]);
    }
    const taxSheet = XLSX.utils.aoa_to_sheet(taxRows);
    taxSheet["!cols"] = [{ wch: 34 }, { wch: 22 }, { wch: 36 }];
    XLSX.utils.book_append_sheet(wb, taxSheet, "Tax Computation");

    // ── 14. DEFERRED TAX COMPUTATION (IAS 12) ───────────────────────────────
    const dtRows: any[][] = [
      ["DEFERRED TAX COMPUTATION — IAS 12"],
      [],
      ["Item", "Carrying Amount (PKR)", "Tax Base (PKR)", "Temporary Difference", "Type", "Deferred Tax Asset/Liability"],
      ["Property, Plant & Equipment", fmtN(fin.fixed_assets), "—", "—", "Taxable", "—"],
      ["Trade Receivables (Provision)", "—", "—", "—", "Deductible", "—"],
      ["Provisions & Accruals", "—", "—", "—", "Deductible", "—"],
      ["Lease Liabilities (IFRS 16)", "—", "—", "—", "Taxable", "—"],
      ["Employee Benefits", "—", "—", "—", "Deductible", "—"],
      [],
      ["Net Deferred Tax Asset / (Liability)", "—"],
      ["Tax Rate Applied", "—"],
      ["Deferred Tax Recognized in P&L", "—"],
      ["Deferred Tax Recognized in OCI", "—"],
    ];
    const dtSheet = XLSX.utils.aoa_to_sheet(dtRows);
    dtSheet["!cols"] = [{ wch: 30 }, { wch: 22 }, { wch: 20 }, { wch: 22 }, { wch: 14 }, { wch: 26 }];
    XLSX.utils.book_append_sheet(wb, dtSheet, "Deferred Tax");

    // ── 15. WHT COMPLIANCE ──────────────────────────────────────────────────
    const whtRows: any[][] = [
      ["WITHHOLDING TAX COMPLIANCE — Income Tax Ordinance 2001"],
      [],
      ["Section", "Nature of Payment", "Rate", "Threshold (PKR)", "Test Performed", "Exceptions Found", "WP Ref"],
      ["149", "Salary", "As per rates", "—", "Recalculate monthly deductions", "", "J4"],
      ["153(1)(a)", "Goods supplies", "4.5% / 6.5%", "75,000", "Verify deduction on sample payments", "", "J4"],
      ["153(1)(b)", "Services", "8% / 14%", "30,000", "Verify deduction on sample invoices", "", "J4"],
      ["153(1)(c)", "Contracts", "7.5% / 12%", "75,000", "Sample contract payments", "", "J4"],
      ["155", "Income from property", "15%", "—", "Review rent payments", "", "J4"],
      ["231A", "Cash withdrawal > 50K", "0.6%", "50,000", "Bank statement review", "", "J4"],
      ["236", "Various advance tax", "Varies", "—", "Review applicability", "", "J4"],
    ];
    const whtSheet = XLSX.utils.aoa_to_sheet(whtRows);
    whtSheet["!cols"] = [{ wch: 12 }, { wch: 28 }, { wch: 14 }, { wch: 16 }, { wch: 36 }, { wch: 18 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, whtSheet, "WHT Compliance");

    // ── 16. EVIDENCE INDEX ──────────────────────────────────────────────────
    const evRows: any[][] = [
      ["EVIDENCE INDEX — ISA 500/501/505/520"],
      [],
      ["Evidence Ref", "Description", "Type", "Source", "WP Ref", "Date Obtained", "Reliability"],
    ];
    const evidenceIndex = req.body.evidenceIndex || [];
    if (evidenceIndex.length > 0) {
      for (const ev of evidenceIndex) {
        evRows.push([ev.ref || "", ev.description || "", ev.type || "", ev.source || "", ev.wp_ref || "", ev.date || "", ev.reliability || ""]);
      }
    } else {
      evRows.push(["EV-1", "Trial Balance", "Primary", "Client Accounts", "B1", "", "High"]);
      evRows.push(["EV-2", "Bank Statements", "External", "Financial Institution", "E1", "", "High"]);
      evRows.push(["EV-3", "Tax Returns / Assessments", "External", "FBR Portal", "J1", "", "High"]);
    }
    const evSheet = XLSX.utils.aoa_to_sheet(evRows);
    evSheet["!cols"] = [{ wch: 14 }, { wch: 36 }, { wch: 14 }, { wch: 22 }, { wch: 10 }, { wch: 16 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, evSheet, "Evidence Index");

    // ── 17. SAMPLING SHEET (ISA 530) ─────────────────────────────────────────
    const sampRows: any[][] = [
      ["AUDIT SAMPLING DOCUMENTATION — ISA 530"],
      [],
      ["Parameter", "Value"],
      ["Sampling Method", meta?.sampling_method || "Statistical"],
      ["Confidence Level", meta?.confidence_level || "95%"],
      ["Population Size", "To be determined per area"],
      ["Tolerable Error", fmtN(mat.performance_materiality)],
      ["Expected Error", fmtN((mat.performance_materiality || 0) * 0.1)],
      [],
      ["SAMPLE SIZE DETERMINATION BY AREA"],
      ["FS Area", "Population Size", "Population Value (PKR)", "Sample Size", "Sample Value (PKR)", "Selection Method", "WP Ref"],
      ["Trade Receivables", "—", fmtN(fin.trade_receivables), "—", "—", meta?.sampling_method || "Statistical", "E2"],
      ["Trade Payables", "—", fmtN(fin.trade_payables), "—", "—", meta?.sampling_method || "Statistical", "E5"],
      ["Revenue Transactions", "—", fmtN(fin.revenue), "—", "—", meta?.sampling_method || "Statistical", "E6"],
      ["Expenses", "—", "—", "—", "—", meta?.sampling_method || "Statistical", "E7"],
      ["Fixed Asset Additions", "—", "—", "—", "—", "Value-weighted", "E4"],
    ];
    const sampSheet = XLSX.utils.aoa_to_sheet(sampRows);
    sampSheet["!cols"] = [{ wch: 22 }, { wch: 18 }, { wch: 22 }, { wch: 14 }, { wch: 22 }, { wch: 18 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, sampSheet, "Sampling");

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const filename = `AuditFile_${(meta?.entity || "Client").replace(/\s+/g, "_")}_${(meta?.financial_year || "2024").replace(/\s+/g, "_")}.xlsx`;

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", buf.length);
    return res.send(buf);
  } catch (err: any) {
    logger.error({ err }, "Excel export failed");
    if (!res.headersSent) {
      return res.status(500).json({ error: err?.message || "Excel export failed" });
    }
  }
});

// ─── POST /api/working-papers/export-docx ─────────────────────────────────
router.post("/export-docx", async (req: Request, res: Response) => {
  const { workingPapers, meta, analysis, evidenceIndex } = req.body;

  if (!workingPapers || workingPapers.length === 0) {
    return res.status(400).json({ error: "No working papers to export." });
  }

  try {
    const firmName = meta?.firm_name || "Alam & Aulakh Chartered Accountants";
    const entityName = meta?.entity || "Client Company";
    const financialYear = meta?.financial_year || "Year ended June 30, 2024";
    const fin = analysis?.financials || {};
    const materiality = analysis?.materiality || {};
    const formatPKR = (n: number) => `PKR ${(n || 0).toLocaleString("en-PK")}`;

    const cellShading = { fill: "1B3A6B", type: ShadingType.CLEAR, color: "auto" };
    const lightShading = { fill: "EBF0FA", type: ShadingType.CLEAR, color: "auto" };

    const makeCell = (text: string, bold = false, dark = false, width = 2500) =>
      new TableCell({
        width: { size: width, type: WidthType.DXA },
        shading: dark ? cellShading : undefined,
        children: [new Paragraph({
          children: [new TextRun({ text, bold, color: dark ? "FFFFFF" : "1B3A6B", size: 20 })],
        })],
      });

    const children: any[] = [];

    // ── Cover Page ──────────────────────────────────────────────────────────
    children.push(
      new Paragraph({
        children: [new TextRun({ text: firmName, bold: true, size: 48, color: "1B3A6B" })],
        alignment: AlignmentType.CENTER,
      }),
      new Paragraph({
        children: [new TextRun({ text: "AUDIT WORKING PAPERS — CONFIDENTIAL", size: 28, color: "7F9DBF", italics: true })],
        alignment: AlignmentType.CENTER,
      }),
      new Paragraph({ children: [new TextRun({ text: "", size: 24 })] }),
      new Paragraph({
        children: [new TextRun({ text: entityName, bold: true, size: 40, color: "1B3A6B" })],
        alignment: AlignmentType.CENTER,
      }),
      new Paragraph({
        children: [new TextRun({ text: financialYear, size: 28, color: "333333" })],
        alignment: AlignmentType.CENTER,
      }),
      new Paragraph({ children: [new TextRun({ text: "", size: 24 })] }),
      new Paragraph({
        children: [new TextRun({ text: `Engagement: ${meta?.engagement_type || "Statutory Audit"}`, size: 22, color: "555555" })],
        alignment: AlignmentType.CENTER,
      }),
      new Paragraph({
        children: [new TextRun({ text: `Generated: ${new Date().toLocaleDateString("en-PK")}`, size: 20, color: "888888", italics: true })],
        alignment: AlignmentType.CENTER,
      }),
      new Paragraph({ children: [new PageBreak()] }),
    );

    // ── Table of Contents ────────────────────────────────────────────────────
    children.push(
      new Paragraph({ text: "TABLE OF CONTENTS", heading: HeadingLevel.HEADING_1 }),
    );
    const tocTable = new Table({
      width: { size: 9000, type: WidthType.DXA },
      rows: [
        new TableRow({ children: [makeCell("WP Ref", true, true, 1500), makeCell("Title", true, true, 4000), makeCell("Section", true, true, 2000), makeCell("ISA", true, true, 1500)] }),
        ...workingPapers.map((wp: any, i: number) =>
          new TableRow({
            children: [
              makeCell(wp.ref, false, false, 1500),
              makeCell(wp.title, false, false, 4000),
              makeCell(wp.section_label || wp.section, false, false, 2000),
              makeCell((wp.isa_references || []).join(", ").slice(0, 25), false, false, 1500),
            ],
            shading: i % 2 === 0 ? lightShading : undefined,
          })
        ),
      ],
    });
    children.push(tocTable, new Paragraph({ children: [new PageBreak()] }));

    // ── Financial Summary ────────────────────────────────────────────────────
    if (fin.revenue) {
      children.push(new Paragraph({ text: "FINANCIAL SUMMARY", heading: HeadingLevel.HEADING_1 }));
      const finRows = [
        ["Revenue", formatPKR(fin.revenue)],
        ["Gross Profit", formatPKR(fin.gross_profit)],
        ["Net Profit / (Loss)", formatPKR(fin.net_profit)],
        ["Total Assets", formatPKR(fin.total_assets)],
        ["Total Liabilities", formatPKR(fin.total_liabilities)],
        ["Equity", formatPKR(fin.equity)],
        ["Cash & Bank", formatPKR(fin.cash_and_bank)],
        ["Overall Materiality", formatPKR(materiality.overall_materiality)],
        ["Performance Materiality", formatPKR(materiality.performance_materiality)],
      ];
      const finTable = new Table({
        width: { size: 9000, type: WidthType.DXA },
        rows: [
          new TableRow({ children: [makeCell("Item", true, true, 4500), makeCell("Amount (PKR)", true, true, 4500)] }),
          ...finRows.map(([item, val], i) => new TableRow({
            children: [makeCell(item, true, false, 4500), makeCell(val, false, false, 4500)],
            shading: i % 2 === 0 ? lightShading : undefined,
          })),
        ],
      });
      children.push(finTable, new Paragraph({ children: [new PageBreak()] }));
    }

    // ── Evidence Index ───────────────────────────────────────────────────────
    if (evidenceIndex && evidenceIndex.length > 0) {
      children.push(new Paragraph({ text: "EVIDENCE INDEX", heading: HeadingLevel.HEADING_1 }));
      const evTable = new Table({
        width: { size: 9000, type: WidthType.DXA },
        rows: [
          new TableRow({ children: [makeCell("Ref", true, true, 1000), makeCell("Description", true, true, 4000), makeCell("Type", true, true, 1500), makeCell("WPs Referenced", true, true, 2500)] }),
          ...evidenceIndex.map((e: any, i: number) => new TableRow({
            children: [
              makeCell(e.ref, true, false, 1000),
              makeCell(e.description, false, false, 4000),
              makeCell(e.type, false, false, 1500),
              makeCell((e.wp_refs || []).join(", "), false, false, 2500),
            ],
            shading: i % 2 === 0 ? lightShading : undefined,
          })),
        ],
      });
      children.push(evTable, new Paragraph({ children: [new PageBreak()] }));
    }

    // ── Working Papers ───────────────────────────────────────────────────────
    for (const wp of workingPapers) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: `${wp.ref} — ${wp.title}`, bold: true, size: 32, color: "1B3A6B" })],
          heading: HeadingLevel.HEADING_1,
        }),
        new Paragraph({
          children: [
            new TextRun({ text: `Section: `, bold: true }),
            new TextRun({ text: wp.section_label || wp.section }),
            new TextRun({ text: `   ISA: `, bold: true }),
            new TextRun({ text: (wp.isa_references || []).join(", ") }),
          ],
        }),
      );

      if (wp.assertions && wp.assertions.length > 0) {
        children.push(new Paragraph({
          children: [
            new TextRun({ text: "Assertions: ", bold: true }),
            new TextRun({ text: wp.assertions.join(" | "), italics: true, color: "1B3A6B" }),
          ],
        }));
      }

      if (wp.evidence_refs && wp.evidence_refs.length > 0) {
        children.push(new Paragraph({
          children: [
            new TextRun({ text: "Evidence: ", bold: true }),
            new TextRun({ text: wp.evidence_refs.join(", "), color: "336633" }),
          ],
        }));
      }

      children.push(
        new Paragraph({ children: [new TextRun({ text: "OBJECTIVE", bold: true, color: "1B3A6B" })] }),
        new Paragraph({ text: wp.objective || "" }),
        new Paragraph({ children: [new TextRun({ text: "SCOPE", bold: true, color: "1B3A6B" })] }),
        new Paragraph({ text: wp.scope || "" }),
      );

      // Procedures table
      if (wp.procedures && wp.procedures.length > 0) {
        children.push(new Paragraph({ children: [new TextRun({ text: "AUDIT PROCEDURES PERFORMED", bold: true, color: "1B3A6B" })] }));
        const procTable = new Table({
          width: { size: 9000, type: WidthType.DXA },
          rows: [
            new TableRow({ children: [makeCell("No.", true, true, 600), makeCell("Procedure", true, true, 3200), makeCell("Finding", true, true, 2800), makeCell("Conclusion", true, true, 1400), makeCell("Ref", true, true, 1000)] }),
            ...wp.procedures.map((p: any, i: number) => new TableRow({
              children: [
                makeCell(p.no || String(i + 1), false, false, 600),
                makeCell(p.procedure, false, false, 3200),
                makeCell(p.finding, false, false, 2800),
                makeCell(p.conclusion, false, false, 1400),
                makeCell(p.evidence_ref || "", false, false, 1000),
              ],
              shading: i % 2 === 0 ? lightShading : undefined,
            })),
          ],
        });
        children.push(procTable);
      }

      // Key findings
      if (wp.key_findings && wp.key_findings.length > 0) {
        children.push(new Paragraph({ children: [new TextRun({ text: "KEY FINDINGS", bold: true, color: "1B3A6B" })] }));
        wp.key_findings.forEach((f: string, i: number) => {
          children.push(new Paragraph({ text: `${i + 1}. ${f}` }));
        });
      }

      // Auditor conclusion
      children.push(
        new Paragraph({ children: [new TextRun({ text: "AUDITOR'S CONCLUSION", bold: true, color: "1B3A6B" })] }),
        new Paragraph({ text: wp.auditor_conclusion || "" }),
      );

      // Sign-off table
      const signTable = new Table({
        width: { size: 9000, type: WidthType.DXA },
        rows: [
          new TableRow({ children: [makeCell("Role", true, true, 2250), makeCell("Name", true, true, 2250), makeCell("Signature", true, true, 2250), makeCell("Date", true, true, 2250)] }),
          new TableRow({ children: [makeCell("Preparer"), makeCell(wp.preparer || "Audit Senior"), makeCell(""), makeCell(wp.date_prepared || "")] }),
          new TableRow({ children: [makeCell("Reviewer"), makeCell(wp.reviewer || "Audit Manager"), makeCell(""), makeCell("")] }),
          new TableRow({ children: [makeCell("Partner"), makeCell(wp.partner || "Partner"), makeCell(""), makeCell("")] }),
        ],
      });
      children.push(new Paragraph({ children: [new TextRun({ text: "SIGN-OFF", bold: true, color: "1B3A6B" })] }), signTable);
      children.push(new Paragraph({ children: [new PageBreak()] }));
    }

    const doc = new Document({
      creator: firmName,
      title: `Audit Working Papers — ${entityName}`,
      description: `ISA-Compliant Audit Working Papers — ${financialYear}`,
      sections: [{ children }],
    });

    const buffer = await Packer.toBuffer(doc);
    const filename = `AuditFile_${entityName.replace(/\s+/g, "_")}_${financialYear.replace(/\s+/g, "_")}.docx`;

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", buffer.length);
    return res.send(buffer);
  } catch (err: any) {
    logger.error({ err }, "DOCX export failed");
    if (!res.headersSent) {
      return res.status(500).json({ error: err?.message || "DOCX export failed" });
    }
  }
});

// ─── POST /api/working-papers/generate-confirmations ──────────────────────
router.post("/generate-confirmations", async (req: Request, res: Response) => {
  const { analysis, meta, types } = req.body;
  const confirmationTypes: string[] = types || ["bank", "debtors", "creditors", "legal"];

  try {
    const firmName = meta?.firm_name || "Alam & Aulakh Chartered Accountants";
    const entityName = meta?.entity || "Client Company";
    const financialYear = meta?.financial_year || "Year ended June 30, 2024";
    const fin = analysis?.financials || {};
    const formatPKR = (n: number) => `PKR ${(n || 0).toLocaleString("en-PK")}`;
    const today = new Date().toLocaleDateString("en-PK", { day: "2-digit", month: "long", year: "numeric" });

    const doc = new PDFDocument({ size: "A4", margin: 72 });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));

    const drawLetterhead = (title: string) => {
      const pg = (doc as any).page;
      const w = pg.width;
      doc.rect(0, 0, w, 110).fill("#1B3A6B");
      doc.fillColor("#FFFFFF").fontSize(18).font("Helvetica-Bold")
        .text(firmName, 72, 22, { align: "center", width: w - 144 });
      doc.fontSize(10).font("Helvetica")
        .text("Chartered Accountants | Established 2010 | ICAP Registered Firm", 72, 48, { align: "center", width: w - 144 });
      doc.fontSize(9)
        .text("123 Business Hub, Blue Area, Islamabad | Tel: +92-51-1234567 | info@alamaulakh.com.pk", 72, 65, { align: "center", width: w - 144 });
      doc.moveTo(72, 88).lineTo(w - 72, 88).strokeColor("#7FAACC").lineWidth(1).stroke();
      doc.fillColor("#4A90D9").fontSize(13).font("Helvetica-Bold")
        .text(title, 72, 94, { align: "center", width: w - 144 });
      doc.fillColor("#333333").fontSize(10).font("Helvetica");
      doc.y = 130;
      doc.rect(0, (doc as any).page.height - 50, w, 50).fill("#F0F4FA");
      doc.fillColor("#666666").fontSize(8).font("Helvetica-Oblique")
        .text("STRICTLY CONFIDENTIAL — For Audit Purposes Only", 72, (doc as any).page.height - 35, { align: "center", width: w - 144 });
      doc.fillColor("#333333").font("Helvetica").fontSize(10);
    };

    const drawStamp = (x: number, y: number, text: string) => {
      doc.save();
      doc.rotate(-30, { origin: [x, y] });
      doc.roundedRect(x - 60, y - 20, 120, 40, 5).strokeColor("#CC0000").lineWidth(2).stroke();
      doc.fillColor("#CC0000").fontSize(11).font("Helvetica-Bold")
        .text(text, x - 55, y - 12, { width: 110, align: "center" });
      doc.restore();
      doc.fillColor("#333333").font("Helvetica").fontSize(10);
    };

    const section = (heading: string) => {
      doc.moveDown(0.5);
      doc.fillColor("#1B3A6B").fontSize(11).font("Helvetica-Bold").text(heading);
      doc.moveTo(doc.x, doc.y + 2).lineTo(doc.x + 400, doc.y + 2).strokeColor("#7FAACC").lineWidth(0.5).stroke();
      doc.fillColor("#333333").fontSize(10).font("Helvetica").moveDown(0.3);
    };

    const line = (label: string, value: string) => {
      doc.text(`${label}: `, { continued: true }).font("Helvetica-Bold").text(value).font("Helvetica");
    };

    let first = true;

    // ── Bank Confirmation ────────────────────────────────────────────────────
    if (confirmationTypes.includes("bank")) {
      if (!first) doc.addPage();
      first = false;
      drawLetterhead("BANK CONFIRMATION REQUEST — ISA 505");

      doc.moveDown(0.5);
      doc.text(today).moveDown(0.3);
      doc.text("The Branch Manager,").text("MCB Bank Limited / UBL / HBL").text("(Client's Primary Banker)").moveDown(0.5);

      doc.text(`Dear Sir / Madam,`).moveDown(0.3);
      doc.text(`We are the external auditors of ${entityName} and are conducting the statutory audit for the financial year ${financialYear}. Pursuant to ISA 505 (External Confirmations) and our professional obligations, kindly confirm the following information directly to us by `).font("Helvetica-Bold").text(`${new Date(Date.now() + 14 * 86400000).toLocaleDateString("en-PK", { day: "2-digit", month: "long", year: "numeric" })}`, { continued: true }).font("Helvetica").text(`.`).moveDown(0.5);

      section("A. BANK BALANCES");
      doc.text("Please confirm the balance(s) held as at the year-end date:");
      doc.moveDown(0.3);
      const bankTable = [
        ["Account Title", entityName],
        ["Account No.", "________________"],
        ["Balance per Bank Statement", formatPKR(fin.cash_and_bank || 0)],
        ["Balance per Our Records", formatPKR(fin.cash_and_bank || 0)],
        ["Confirmed Balance", "________________"],
        ["Difference (if any)", "________________"],
      ];
      bankTable.forEach(([k, v]) => {
        doc.text(`${k.padEnd(35)} `, { continued: true }).font("Helvetica-Bold").text(v).font("Helvetica");
      });

      section("B. LOANS & FACILITIES");
      doc.text("Please confirm all credit facilities, overdrafts, and loan balances as at year-end:").moveDown(0.3);
      ["Outstanding Loan Balance: ______________", "Overdraft Limit: ______________", "Overdraft Utilized: ______________", "Security / Collateral: ______________"].forEach(l => doc.text(l));

      section("C. CONTINGENT LIABILITIES");
      doc.text("Please confirm all guarantees, letters of credit, and other contingent liabilities:").text("____________________________________________________________________");

      doc.moveDown(0.5);
      doc.text("Please sign and stamp below and return directly to our firm.").moveDown(1);
      doc.text("_______________________     _______________________     _______________________");
      doc.text("Authorised Signature          Name & Designation               Bank Stamp & Date");

      drawStamp(460, doc.y - 60, "BANK CONFIRM");
      doc.moveDown();
      doc.fillColor("#888888").fontSize(8).font("Helvetica-Oblique").text(`WP Ref: E3 | Evidence Ref: C-300 | ISA 505 Compliant`);
      doc.fillColor("#333333").font("Helvetica").fontSize(10);
    }

    // ── Debtors Confirmation ─────────────────────────────────────────────────
    if (confirmationTypes.includes("debtors")) {
      doc.addPage();
      drawLetterhead("DEBTORS (TRADE RECEIVABLES) CONFIRMATION — ISA 505");

      doc.moveDown(0.5);
      doc.text(today).moveDown(0.3);
      doc.text("To the Customer / Debtor,").moveDown(0.5);

      doc.text(`Dear Sir / Madam,`).moveDown(0.3);
      doc.text(`We, the external auditors of ${entityName}, are conducting the statutory audit for ${financialYear}. In accordance with ISA 505, we kindly request you to confirm the following balance owed to our client as at the year-end directly to our firm.`).moveDown(0.5);

      section("A. BALANCE CONFIRMATION");
      [
        ["Customer / Debtor Name", "________________"],
        ["NTN / CNIC", "________________"],
        ["Balance per Client Records", formatPKR(fin.trade_receivables || 0)],
        ["Balance per Your Records", "________________"],
        ["Confirmed Balance", "________________"],
        ["Difference (if any)", "________________"],
        ["Reason for Difference", "________________"],
      ].forEach(([k, v]) => {
        doc.text(`${k.padEnd(35)} `, { continued: true }).font("Helvetica-Bold").text(v).font("Helvetica");
      });

      section("B. DISPUTE / OUTSTANDING INVOICES");
      doc.text("Please list any disputed amounts or invoices not yet received:").text("____________________________________________________________________");

      doc.moveDown(0.5);
      doc.text("Please confirm by signing below and returning directly to our firm within 14 days.").moveDown(1);
      doc.text("_______________________     _______________________     _______________________");
      doc.text("Customer Signature              Name & Designation                  Date");

      drawStamp(460, doc.y - 60, "CONFIRMED");
      doc.moveDown();
      doc.fillColor("#888888").fontSize(8).font("Helvetica-Oblique").text(`WP Ref: E1 | Evidence Ref: A-100 | ISA 505 Compliant`);
      doc.fillColor("#333333").font("Helvetica").fontSize(10);
    }

    // ── Creditors Confirmation ───────────────────────────────────────────────
    if (confirmationTypes.includes("creditors")) {
      doc.addPage();
      drawLetterhead("CREDITORS (TRADE PAYABLES) CONFIRMATION — ISA 505");

      doc.moveDown(0.5);
      doc.text(today).moveDown(0.3);
      doc.text("To the Supplier / Creditor,").moveDown(0.5);

      doc.text(`Dear Sir / Madam,`).moveDown(0.3);
      doc.text(`We, the external auditors of ${entityName}, are conducting the statutory audit for ${financialYear}. In accordance with ISA 505, we request you to confirm the balance owed by our client as at year-end directly to our firm.`).moveDown(0.5);

      section("A. BALANCE CONFIRMATION");
      [
        ["Supplier / Creditor Name", "________________"],
        ["NTN / STRN", "________________"],
        ["Balance per Supplier Records", "________________"],
        ["Balance per Client Records", formatPKR(fin.trade_payables || 0)],
        ["Confirmed Balance", "________________"],
        ["Difference (if any)", "________________"],
        ["Reason for Difference", "________________"],
      ].forEach(([k, v]) => {
        doc.text(`${k.padEnd(35)} `, { continued: true }).font("Helvetica-Bold").text(v).font("Helvetica");
      });

      section("B. SECURITY / ADVANCES");
      doc.text("Please confirm any advances, security deposits, or retention amounts:").text("____________________________________________________________________");

      doc.moveDown(0.5);
      doc.text("Please confirm by signing below and returning directly to our firm within 14 days.").moveDown(1);
      doc.text("_______________________     _______________________     _______________________");
      doc.text("Supplier Signature               Name & Designation                  Date");

      drawStamp(460, doc.y - 60, "CONFIRMED");
      doc.moveDown();
      doc.fillColor("#888888").fontSize(8).font("Helvetica-Oblique").text(`WP Ref: E2 | Evidence Ref: B-200 | ISA 505 Compliant`);
      doc.fillColor("#333333").font("Helvetica").fontSize(10);
    }

    // ── Legal Confirmation ───────────────────────────────────────────────────
    if (confirmationTypes.includes("legal")) {
      doc.addPage();
      drawLetterhead("LEGAL CONFIRMATION — ISA 501");

      doc.moveDown(0.5);
      doc.text(today).moveDown(0.3);
      doc.text("To the Legal Counsel / Attorney,").moveDown(0.5);

      doc.text(`Dear Sir / Madam,`).moveDown(0.3);
      doc.text(`We are the external auditors of ${entityName}. In accordance with ISA 501 and our audit obligations, we request you to confirm the following information regarding legal matters, litigation, and contingent liabilities as at ${financialYear}.`).moveDown(0.5);

      section("A. PENDING LITIGATION");
      [
        ["Case Title / Reference", "________________"],
        ["Court / Forum", "________________"],
        ["Amount in Dispute", "________________"],
        ["Likely Outcome", "Favorable / Unfavorable / Uncertain"],
        ["Probability of Loss", "Remote / Possible / Probable"],
        ["Estimated Financial Impact", "________________"],
      ].forEach(([k, v]) => {
        doc.text(`${k.padEnd(35)} `, { continued: true }).font("Helvetica-Bold").text(v).font("Helvetica");
      });

      section("B. CONTINGENT LIABILITIES");
      doc.text("Please list all contingent liabilities, guarantees, and legal obligations not yet reflected:").text("____________________________________________________________________");

      section("C. REGULATORY MATTERS");
      doc.text("Please confirm any regulatory actions, FBR notices, SECP notices, or other government proceedings:").text("____________________________________________________________________");

      doc.moveDown(0.5);
      doc.text("Please sign and return directly to our firm. Your response is confidential and for audit purposes only.").moveDown(1);
      doc.text("_______________________     _______________________     _______________________");
      doc.text("Legal Counsel Signature         Name & Bar No.                       Date & Stamp");

      drawStamp(460, doc.y - 60, "LEGAL CONF.");
      doc.moveDown();
      doc.fillColor("#888888").fontSize(8).font("Helvetica-Oblique").text(`WP Ref: G4 | Evidence Ref: E-500 | ISA 501 / ISA 580 Compliant`);
      doc.fillColor("#333333").font("Helvetica").fontSize(10);
    }

    doc.end();
    await new Promise<void>(resolve => doc.on("end", resolve));

    const pdf = Buffer.concat(chunks);
    const filename = `Confirmations_${entityName.replace(/\s+/g, "_")}_${financialYear.replace(/\s+/g, "_")}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", pdf.length);
    return res.send(pdf);
  } catch (err: any) {
    logger.error({ err }, "Confirmation generation failed");
    if (!res.headersSent) {
      return res.status(500).json({ error: err?.message || "Confirmation generation failed" });
    }
  }
});

export default router;
