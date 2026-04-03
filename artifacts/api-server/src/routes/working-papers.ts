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
  type IShadingAttributesProperties,
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
    const getVal = (key: string) => rows.find((r: { key: string | null; value: string | null }) => r.key === key)?.value || "";
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
    let totalSheets = 0;
    let totalPages = 0;
    for (const file of files) {
      const content = await extractTextFromFile(file);
      const name = file.originalname.toLowerCase();
      if (name.endsWith(".xlsx") || name.endsWith(".xls") || file.mimetype.includes("spreadsheet") || file.mimetype.includes("excel")) {
        const wb = XLSX.read(file.buffer, { type: "buffer" });
        totalSheets += wb.SheetNames.length;
      } else if (file.mimetype === "application/pdf" || name.endsWith(".pdf")) {
        const pageMatches = content.match(/\f/g);
        totalPages += (pageMatches ? pageMatches.length + 1 : Math.max(1, Math.ceil(content.length / 3000)));
      } else {
        totalPages += 1;
      }
      docs.push(`FILE: ${file.originalname}\n${smartChunk(content, 12000)}`);
    }
    const docSummary = docs.join("\n\n---\n\n");
    logger.info(`extract-entity: processing ${files.length} files, ${totalSheets} sheets, ${totalPages} pages, ${docSummary.length} chars total`);

    const userPrompt = `You are a senior Pakistan-qualified chartered accountant and forensic document analyst with OCR expertise. Your task is to extract EVERY piece of auditable data from the uploaded financial documents.

COMPLETENESS MANDATE:
- You MUST scan EVERY sheet in Excel files and EVERY page in PDF/other files.
- Extraction is ONLY considered complete when every sheet, every page, and every data element has been fully scanned, structured, validated, and mapped.
- If any data is missing, incomplete, or inconsistent, flag it explicitly in "flags".
- Do NOT skip any sections, schedules, notes, annexures, or appendices.

DOCUMENTS TO ANALYZE (${files.length} files, ${totalSheets} Excel sheets, ${totalPages} document pages):
${docSummary}

EXTRACTION RULES:
1. Read EVERY number, date, name, and reference from ALL pages/sheets with precision.
2. For all financial figures: extract as plain numbers in PKR (no commas, no currency symbols).
3. If a document contains a Trial Balance or GL, extract ALL account lines — every single row.
4. If figures appear inconsistent, note the inconsistency in "flags".
5. Use null for any field genuinely not present — never guess or fabricate.
6. Extract BOTH current year and prior year figures wherever visible.
7. For multi-sheet Excel files: scan EVERY sheet — Balance Sheet, P&L, TB, Notes, Schedules, etc.
8. For multi-page PDFs: read EVERY page including notes to accounts, schedules, and annexures.

Return ONLY valid JSON (no markdown, no extra text):
{
  "entity_name": string | null,
  "ntn": string | null,
  "secp": string | null,
  "strn": string | null,
  "cnic": string | null,
  "financial_year": string | null,
  "period_start": string | null,
  "period_end": string | null,
  "registered_address": string | null,
  "city": string | null,
  "industry": string | null,
  "entity_type": "Private Limited"|"Public Limited"|"Partnership"|"Sole Proprietor"|"NGO/NPO"|"Trust"|"Other" | null,
  "listed_status": "Listed"|"Unlisted" | null,
  "framework": "IFRS"|"IFRS for SMEs"|"IPSAS"|"Other" | null,
  "engagement_type": "Statutory Audit"|"Tax Audit"|"Internal Audit"|"Special Purpose Audit"|"Review Engagement"|"Compilation" | null,
  "directors": [{ "name": string, "cnic": string | null, "designation": string }],
  "auditors": { "firm_name": string | null, "partner": string | null, "engagement_no": string | null },
  "bankers": [{ "bank_name": string, "account_no": string | null, "branch": string | null }],
  "financials": {
    "revenue": number | null,
    "cost_of_sales": number | null,
    "gross_profit": number | null,
    "operating_expenses": number | null,
    "operating_profit": number | null,
    "finance_cost": number | null,
    "net_profit_before_tax": number | null,
    "tax_expense": number | null,
    "net_profit": number | null,
    "total_assets": number | null,
    "non_current_assets": number | null,
    "fixed_assets": number | null,
    "intangible_assets": number | null,
    "long_term_investments": number | null,
    "current_assets": number | null,
    "inventory": number | null,
    "trade_receivables": number | null,
    "advances_deposits": number | null,
    "cash_and_bank": number | null,
    "total_liabilities": number | null,
    "non_current_liabilities": number | null,
    "long_term_loans": number | null,
    "current_liabilities": number | null,
    "trade_payables": number | null,
    "short_term_borrowings": number | null,
    "accrued_liabilities": number | null,
    "tax_payable": number | null,
    "equity": number | null,
    "share_capital": number | null,
    "retained_earnings": number | null,
    "reserves": number | null,
    "prior_year_revenue": number | null,
    "prior_year_gross_profit": number | null,
    "prior_year_net_profit": number | null,
    "prior_year_total_assets": number | null,
    "prior_year_equity": number | null,
    "currency": "PKR" | string | null
  },
  "tax_data": {
    "advance_tax_paid": number | null,
    "wht_deducted": number | null,
    "sales_tax_output": number | null,
    "sales_tax_input": number | null,
    "income_tax_provision": number | null,
    "deferred_tax": number | null,
    "super_tax": number | null,
    "prior_year_tax": number | null
  },
  "tb_lines": [
    { "account_code": string, "account_name": string, "debit": number, "credit": number, "balance": number, "classification": "Asset"|"Liability"|"Equity"|"Revenue"|"Expense" }
  ],
  "gl_summary": [
    { "date": string, "voucher": string, "account": string, "narration": string, "debit": number, "credit": number }
  ],
  "flags": [string],
  "documents_found": [{ "filename": string, "type": "Trial Balance"|"General Ledger"|"Balance Sheet"|"P&L"|"Bank Statement"|"Tax Return"|"Other", "period": string | null }]
}`;

    const messageContent: any[] = [{ type: "text", text: userPrompt }];
    for (const imgFile of imageFiles.slice(0, 4)) {
      const base64 = imgFile.buffer.toString("base64");
      messageContent.push({ type: "image_url", image_url: { url: `data:${imgFile.mimetype};base64,${base64}`, detail: "high" } });
    }

    const response = await ai.client.chat.completions.create({
      model: ai.model,
      messages: [
        { role: "system", content: "You are an expert chartered accountant and forensic document analyst specialising in Pakistan accounting and audit standards. Extract every field from financial documents with forensic precision. Scan EVERY sheet in Excel files and EVERY page in PDFs — no content may be skipped. Return only valid JSON." },
        { role: "user", content: messageContent },
      ],
      max_tokens: 8000,
      temperature: 0.1,
      response_format: { type: "json_object" },
    });

    const raw = response.choices[0]?.message?.content || "{}";
    let data: any = {};
    try { data = JSON.parse(raw); } catch { data = {}; }

    data._extraction_stats = {
      files_processed: files.length,
      total_sheets: totalSheets,
      total_pages: totalPages,
      total_chars_scanned: docSummary.length,
    };

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

// Helper: smart chunking — takes head + tail to preserve both header info and totals
function smartChunk(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const head = Math.round(maxChars * 0.65);
  const tail = maxChars - head;
  return `${text.slice(0, head)}\n\n[... ${text.length - maxChars} chars truncated — showing tail ...]\n\n${text.slice(-tail)}`;
}

// ─── POST /api/working-papers/analyze ─────────────────────────────────────
router.post("/analyze", upload.array("files", 20), async (req: Request, res: Response) => {
  const files = req.files as Express.Multer.File[] | undefined;
  const { instructions, entityName, engagementType, financialYear } = req.body;

  // Parse optional user-provided file classifications
  let userClassifications: Record<string, string> = {};
  try {
    const raw = req.body.fileClassifications;
    if (raw) {
      const arr: Array<{ name: string; docType: string }> = JSON.parse(raw);
      arr.forEach(c => { userClassifications[c.name] = c.docType; });
    }
  } catch {}

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
      // User-provided classification takes priority over auto-classify
      const type = userClassifications[file.originalname] || classifyDocument(file, content);
      const isImage = file.mimetype.startsWith("image/");
      extractedDocs.push({ filename: file.originalname, type, content: isImage ? "" : content, isImage });
      if (isImage) imageFiles.push(file);
    }

    const docSummary = extractedDocs.map(d =>
      `FILE: ${d.filename}\nTYPE: ${d.type}\n${d.isImage ? "[Scanned image — analyzed via vision API]" : smartChunk(d.content, 14000)}`
    ).join("\n\n---\n\n");
    logger.info(`analyze: processing ${files.length} files (${docSummary.length} chars total content)`);

    const systemPrompt = `You are AuditWise AI — Pakistan's most advanced audit intelligence engine, calibrated to the full ICAP/IAASB standard suite and Pakistan legal framework.

STANDARDS YOU MUST APPLY:
• ISA 200–720 (all), ISQM 1 & 2, ISA 315 (Revised 2019), ISA 540 (Revised 2019)
• IFRS Full Suite, IFRS for SMEs, IAS 1, 2, 7, 8, 10, 12, 16, 19, 24, 36, 37, 38, 40
• ICAP Code of Ethics (2022), Companies Act 2017, SECP (Listed Companies) Regulations 2017
• FBR: ITO 2001, STA 1990, Federal Excise Act 2005, Finance Act (latest), SRO notifications
• AMLA 2010, FATF Recommendations, CDD/KYC requirements for audit firms
• SBP Prudential Regulations (for banking entities), SECP Insurance Ordinance (for insurers)

GENERATION MANDATE:
1. ALL fields are MANDATORY — never return null for computed fields; derive estimates from available data.
2. When document data is insufficient, generate REALISTIC, ENTITY-SPECIFIC figures tagged "[Auditor Estimate — ISA 315]".
3. Every risk must map to specific ISA assertion categories: Occurrence, Completeness, Accuracy, Cut-off, Classification, Existence, Rights & Obligations, Valuation, Presentation & Disclosure.
4. Materiality MUST be computed from actual financial data using the hierarchy: Net Profit 5-10% > Revenue 0.5-1% > Total Assets 1-2% > Equity 2-5%.
5. Use precise professional language per ISA 230 documentation standards.
6. Risk ratings must be evidence-based, not generic.
7. Every ratio must be computed from actual extracted figures — show your arithmetic.`;

    const userPrompt = `Perform a COMPREHENSIVE audit intelligence analysis for this ${engagementType || "statutory audit"} engagement.

COMPLETENESS MANDATE:
- Every sheet in Excel files and every page in PDFs/other files MUST be fully scanned, structured, validated, and mapped into audit-ready datasets.
- Extraction is NOT considered complete if any schedule, note, annexure, or data element has been skipped.
- All financial figures must be cross-checked: Assets = Liabilities + Equity, Revenue − Expenses = Net Profit. Flag any imbalance.
- Include ALL line items from every financial schedule — not just totals or summaries.

═══════════════════════════════════════════════════════
ENGAGEMENT CONTEXT
═══════════════════════════════════════════════════════
Entity: ${entityName || "Client Company"}
Financial Year: ${financialYear || "Year ending June 30, 2024"}
Special Instructions from Auditor: ${instructions || "Full ISA-compliant working papers required"}

═══════════════════════════════════════════════════════
SOURCE DOCUMENTS (analyze every line of every sheet/page)
═══════════════════════════════════════════════════════
${docSummary}

═══════════════════════════════════════════════════════
REQUIRED OUTPUT — Return ONLY valid JSON, no markdown
═══════════════════════════════════════════════════════
{
  "entity": {
    "name": string,
    "type": "Private Limited"|"Public Limited"|"Partnership"|"Sole Proprietor"|"NGO/NPO"|"Trust"|"Other",
    "industry": string,
    "sub_industry": string,
    "financial_year": string,
    "period_start": string,
    "period_end": string,
    "reporting_framework": "IFRS"|"IFRS for SMEs"|"IPSAS"|"Other",
    "registration_no": string,
    "ntn": string,
    "strn": string,
    "address": string,
    "bankers": [string],
    "key_persons": [{ "name": string, "role": string }]
  },
  "financials": {
    "revenue": number,
    "cost_of_sales": number,
    "gross_profit": number,
    "operating_expenses": number,
    "ebitda": number,
    "depreciation_amortization": number,
    "finance_cost": number,
    "net_profit_before_tax": number,
    "tax_expense": number,
    "net_profit": number,
    "total_assets": number,
    "non_current_assets": number,
    "fixed_assets": number,
    "current_assets": number,
    "inventory": number,
    "trade_receivables": number,
    "cash_and_bank": number,
    "total_liabilities": number,
    "non_current_liabilities": number,
    "long_term_debt": number,
    "current_liabilities": number,
    "trade_payables": number,
    "short_term_borrowings": number,
    "equity": number,
    "share_capital": number,
    "retained_earnings": number,
    "prior_year_revenue": number,
    "prior_year_gross_profit": number,
    "prior_year_net_profit": number,
    "prior_year_total_assets": number,
    "prior_year_equity": number,
    "currency": "PKR"
  },
  "materiality": {
    "overall_materiality": number,
    "performance_materiality": number,
    "trivial_threshold": number,
    "basis": string,
    "benchmark_value": number,
    "percentage_used": number,
    "rationale": string,
    "alternative_materiality": number,
    "alternative_basis": string,
    "group_materiality_applicable": boolean,
    "isa_ref": "ISA 320",
    "computation_steps": string
  },
  "risk_assessment": {
    "overall_risk": "Low"|"Medium"|"High"|"Very High",
    "fraud_risk_level": "Low"|"Medium"|"High",
    "going_concern_risk": "Low"|"Medium"|"High",
    "inherent_risks": [{
      "area": string,
      "risk_description": string,
      "root_cause": string,
      "level": "Low"|"Medium"|"High",
      "isa_ref": string,
      "assertions_at_risk": ["Occurrence"|"Completeness"|"Accuracy"|"Cut-off"|"Classification"|"Existence"|"Rights"|"Valuation"|"Disclosure"],
      "audit_response": string,
      "materiality_threshold": number
    }],
    "control_risks": [{
      "cycle": string,
      "weakness": string,
      "level": "Low"|"Medium"|"High",
      "implication": string,
      "compensating_controls": string,
      "test_of_control_approach": string
    }],
    "fraud_risks": [{
      "risk_type": "Management Override"|"Revenue Recognition"|"Asset Misappropriation"|"Financial Reporting"|"Other",
      "indicator": string,
      "assessment": string,
      "audit_response": string,
      "isa_ref": "ISA 240"
    }],
    "it_risks": [{ "system": string, "risk": string, "control": string }],
    "key_audit_matters": [{ "matter": string, "significance": string, "audit_approach": string, "isa_ref": "ISA 701" }]
  },
  "analytical_procedures": {
    "ratios": {
      "current_ratio": number,
      "quick_ratio": number,
      "cash_ratio": number,
      "gross_margin_pct": number,
      "operating_margin_pct": number,
      "net_margin_pct": number,
      "ebitda_margin_pct": number,
      "return_on_assets_pct": number,
      "return_on_equity_pct": number,
      "debt_to_equity": number,
      "debt_to_assets": number,
      "interest_coverage": number,
      "asset_turnover": number,
      "receivables_days": number,
      "payables_days": number,
      "inventory_days": number,
      "cash_conversion_cycle": number,
      "working_capital": number
    },
    "ratio_interpretations": [{ "ratio": string, "value": string, "benchmark": string, "interpretation": string, "audit_implication": string }],
    "variance_analysis": [{
      "item": string,
      "current_year": number,
      "prior_year": number,
      "variance_amount": number,
      "variance_pct": number,
      "assessment": "Expected"|"Unexpected"|"Requires Investigation",
      "explanation": string,
      "audit_response": string
    }],
    "trend_analysis": string,
    "unusual_items": [{ "item": string, "amount": number, "concern": string, "procedure": string }],
    "analytical_conclusions": [string],
    "isa_ref": "ISA 520"
  },
  "reconciliation": {
    "accounting_equation_check": { "assets": number, "liabilities_plus_equity": number, "difference": number, "balanced": boolean },
    "tb_vs_fs": { "status": "Reconciled"|"Unreconciled"|"Not Available", "difference": number, "notes": string },
    "tb_vs_gl": { "status": "Reconciled"|"Unreconciled"|"Not Available", "difference": number, "notes": string },
    "opening_vs_prior_year": { "status": "Reconciled"|"Unreconciled"|"Not Available", "difference": number, "notes": string },
    "bank_reconciliation": { "status": "Reconciled"|"Unreconciled"|"Not Available", "difference": number, "notes": string },
    "pl_vs_tb": { "status": "Reconciled"|"Unreconciled"|"Not Available", "difference": number, "notes": string },
    "flags": [string]
  },
  "internal_control_weaknesses": [{
    "cycle": "Revenue"|"Purchases"|"Payroll"|"Fixed Assets"|"Treasury"|"IT"|"Financial Reporting"|"Other",
    "area": string,
    "weakness": string,
    "root_cause": string,
    "risk_level": "Low"|"Medium"|"High"|"Critical",
    "impact": string,
    "recommendation": string,
    "management_response": string,
    "isa_ref": "ISA 265"
  }],
  "tax_analysis": {
    "income_tax_provision": number,
    "effective_tax_rate_pct": number,
    "minimum_tax_applicable": boolean,
    "minimum_tax_amount": number,
    "super_tax_applicable": boolean,
    "super_tax_amount": number,
    "wht_exposure": string,
    "sales_tax_compliant": boolean,
    "tax_risks": [{ "risk": string, "section": string, "amount": number, "recommendation": string }],
    "deferred_tax_position": string
  },
  "evidence_items": [{
    "id": string,
    "filename": string,
    "type": "TB"|"GL"|"Bank"|"FS"|"Tax Return"|"Contracts"|"Board Minutes"|"Others",
    "description": string,
    "period_covered": string,
    "date_received": string,
    "reliability": "High"|"Medium"|"Low",
    "sufficiency": "Sufficient"|"Partial"|"Insufficient"
  }],
  "audit_program_highlights": [{
    "area": string,
    "risk_level": "Low"|"Medium"|"High",
    "assertions": [string],
    "planned_procedures": [string],
    "sample_size": number,
    "evidence_refs": [string]
  }],
  "documents_classified": [{
    "filename": string,
    "classified_as": string,
    "evidence_id": string,
    "key_data_extracted": string,
    "reliability_assessment": string
  }],
  "going_concern_indicators": {
    "positive": [string],
    "negative": [string],
    "auditor_conclusion": string,
    "isa_ref": "ISA 570"
  },
  "missing_data_flags": [string],
  "assumptions_made": [string],
  "auditor_notes": string
}

CRITICAL: All ratio values must be actual numbers (not strings). Compute every ratio from the extracted financial data. Return ONLY valid JSON.`;

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
      max_tokens: 12000,
      temperature: 0.15,
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
      _analysis_stats: {
        files_processed: files.length,
        total_chars_analyzed: docSummary.length,
        documents_classified: extractedDocs.length,
      },
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
    case "A":                                 phaseStart = ppStart; phaseEnd = pd;  break;
    case "B": case "C": case "D":            phaseStart = pd;  phaseEnd = fws; break;
    case "E": case "F": case "G":            phaseStart = fws; phaseEnd = fwe; break;
    case "H": case "I":                      phaseStart = rd;  phaseEnd = rpt; break;
    case "J":                                 phaseStart = fwe; phaseEnd = rd;  break;
    case "K":                                 phaseStart = rpt; phaseEnd = fil; break;
    case "L":                                 phaseStart = fws; phaseEnd = rd;  break;
    case "M": case "N":                      phaseStart = fws; phaseEnd = fwe; break;
    case "O":                                 phaseStart = rpt; phaseEnd = fil; break;
    default:                                  phaseStart = fws; phaseEnd = fwe; break;
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

    const flattenLines = (sections: any[]) =>
      (sections || []).flatMap((s: any) => (s.lines || []).map((l: any) => ({ label: l.label, cy: Number(l.cy) || 0, py: Number(l.py) || 0 })));

    const bsLines = flattenLines(bsData);
    const plLines = flattenLines(plData);
    const bsText = bsLines.map(l => `${l.label}: CY=${l.cy.toLocaleString("en-PK")}, PY=${l.py.toLocaleString("en-PK")}`).join("\n");
    const plText = plLines.map(l => `${l.label}: CY=${l.cy.toLocaleString("en-PK")}, PY=${l.py.toLocaleString("en-PK")}`).join("\n");

    const entityProfile = `Entity: ${entityName || "Client Company (Private) Limited"}
  Industry: ${industry || "Manufacturing / Trading"}
  Financial Year: ${financialYear || "Year ended June 30, 2024"}
  NTN: ${ntn || "N/A"} | STRN: ${strn || "N/A"}
  Framework: ${framework || "IFRS"} | Engagement: ${engagementType || "Statutory Audit"}`;

    const coaRanges = `CHART OF ACCOUNTS — ICAP-aligned 4-digit Pakistan COA:
    1000-1999: Assets (1100=Fixed Assets/PPE, 1200=Intangibles, 1300=LT Investments, 1400=Trade Receivables, 1500=Inventory, 1600=Advances/Deposits/Prepayments, 1700=Cash & Bank, 1800=Other Current Assets)
    2000-2999: Liabilities (2100=Long-term Loans/Borrowings, 2200=Deferred Tax Liability, 2300=Trade Payables, 2400=Accruals & Other Payables, 2500=WHT Payable, 2600=Sales Tax Payable, 2700=Short-term Borrowings, 2800=Current Portion LT Debt, 2900=Provisions)
    3000-3999: Equity (3100=Share Capital, 3200=General/Statutory Reserve, 3300=Retained Earnings, 3400=Surplus on Revaluation, 3500=Other Comprehensive Income)
    4000-4999: Revenue (4100=Sales/Revenue, 4200=Other Operating Income, 4300=Gain on Disposal)
    5000-5999: Cost of Sales (5100=Raw Materials Consumed, 5200=Direct Labour, 5300=Manufacturing Overhead, 5400=Depreciation — Manufacturing)
    6000-6999: Operating Expenses (6100=Admin & General Expenses, 6200=Selling & Distribution, 6300=Finance Cost/Markup, 6400=Depreciation — Admin)
    7000-7999: Tax (7100=Current Tax Expense, 7200=Deferred Tax Charge/(Credit), 7300=Super Tax, 7400=Workers Profit Participation Fund)`;

    try {
      // ═══════════════════════════════════════════════════════════════════════
      // PHASE 1: COA + TRIAL BALANCE (fully linked to FS line items)
      // ═══════════════════════════════════════════════════════════════════════
      logger.info("GL/TB Phase 1: COA + Trial Balance generation");
      const phase1Prompt = `You are a Big-4-trained Pakistan chartered accountant. Reconstruct a complete, fully balanced Trial Balance and Chart of Accounts from the Financial Statements below.

  ${entityProfile}

  ══ STATEMENT OF FINANCIAL POSITION (Balance Sheet) ══
  ${bsText || "No BS data — generate realistic figures for a medium Pakistan company"}

  ══ STATEMENT OF PROFIT OR LOSS ══
  ${plText || "No P&L data — generate realistic figures"}

  ${coaRanges}

  MANDATORY RULES:
  1. Create ONE account per FS line item. Where FS shows aggregated items (e.g., "Trade Payables" includes suppliers, accruals), break into sub-accounts (2301=Supplier A, 2302=Supplier B, etc.) that SUM to the FS total.
  2. Every FS line item amount MUST be exactly traceable to one or more TB accounts. The sum of TB account balances for each FS head MUST equal the FS amount.
  3. Include tax-related accounts: WHT Receivable (1610), WHT Payable (2500), GST Output (2600), GST Input (1810), Advance Tax (1620), Current Tax Payable (2510).
  4. Include suspense/contra accounts if needed for balancing. Tag them clearly.
  5. Opening balances: Use PY amounts from FS. If PY not given, estimate opening balance as 80-90% of CY for BS items.
  6. TB MUST be PERFECTLY BALANCED: Total Debit Balances = Total Credit Balances (to the exact PKR).
  7. Net Profit per P&L MUST flow into Retained Earnings correctly: Closing RE = Opening RE + Net Profit - Dividends.
  8. Accounting equation: Total Assets = Total Liabilities + Total Equity (verified from TB).
  9. For EACH account, specify its FS mapping (which FS line item it maps to) and classification.

  Return ONLY valid JSON:
  {
    "chart_of_accounts": [
      { "code": "1701", "name": "Cash at Bank — HBL", "group": "Current Assets", "sub_group": "Cash & Bank Balances", "type": "Asset", "normal_balance": "Debit", "fs_line": "Cash and bank balances", "tax_code": "N/A" }
    ],
    "trial_balance": [
      { "account_code": "1701", "account_name": "Cash at Bank — HBL", "fs_head": "Cash & Bank Balances", "classification": "Current Asset", "opening_dr": 0, "opening_cr": 0, "debit_total": 45000000, "credit_total": 43200000, "balance_dr": 1800000, "balance_cr": 0, "fs_mapping": "Balance Sheet — Current Assets — Cash and bank balances" }
    ],
    "reconciliation": {
      "total_tb_dr": 0,
      "total_tb_cr": 0,
      "tb_balanced": true,
      "total_assets": 0,
      "total_liabilities": 0,
      "total_equity": 0,
      "equation_balanced": true,
      "revenue_total": 0,
      "expense_total": 0,
      "net_profit": 0,
      "fs_mapping_summary": [
        { "fs_line": "Cash and bank balances", "fs_amount": 0, "tb_total": 0, "difference": 0, "matched": true }
      ],
      "adjustments": []
    }
  }`;

      const phase1 = await ai.client.chat.completions.create({
        model: ai.model,
        messages: [
          { role: "system", content: "You are a Pakistan-qualified chartered accountant. Generate a mathematically perfect Trial Balance and Chart of Accounts that EXACTLY reconciles to the Financial Statements. Every PKR must trace back. Return only valid JSON." },
          { role: "user", content: phase1Prompt }
        ],
        max_tokens: 12000,
        temperature: 0.15,
        response_format: { type: "json_object" },
      });

      const p1Raw = phase1.choices?.[0]?.message?.content || "{}";
      const p1 = JSON.parse(p1Raw);
      const coa = p1.chart_of_accounts || [];
      let tb = p1.trial_balance || [];

      let tbDrTotal = tb.reduce((s: number, r: any) => s + (Number(r.balance_dr) || 0), 0);
      let tbCrTotal = tb.reduce((s: number, r: any) => s + (Number(r.balance_cr) || 0), 0);
      const tbDiff = Math.round((tbDrTotal - tbCrTotal) * 100) / 100;

      if (Math.abs(tbDiff) >= 1) {
        logger.warn(`TB imbalance detected: Dr=${tbDrTotal}, Cr=${tbCrTotal}, Diff=${tbDiff}. Auto-adjusting via Retained Earnings.`);
        const reIdx = tb.findIndex((r: any) => r.account_code === "3300" || /retained.earnings/i.test(r.account_name));
        if (reIdx >= 0) {
          if (tbDiff > 0) {
            tb[reIdx].balance_cr = (Number(tb[reIdx].balance_cr) || 0) + tbDiff;
            tb[reIdx].credit_total = (Number(tb[reIdx].credit_total) || 0) + tbDiff;
          } else {
            tb[reIdx].balance_dr = (Number(tb[reIdx].balance_dr) || 0) + Math.abs(tbDiff);
            tb[reIdx].debit_total = (Number(tb[reIdx].debit_total) || 0) + Math.abs(tbDiff);
          }
        } else {
          tb.push({
            account_code: "3300", account_name: "Retained Earnings (Balancing)", fs_head: "Retained Earnings",
            classification: "Equity", opening_dr: 0, opening_cr: 0,
            debit_total: tbDiff < 0 ? Math.abs(tbDiff) : 0, credit_total: tbDiff > 0 ? tbDiff : 0,
            balance_dr: tbDiff < 0 ? Math.abs(tbDiff) : 0, balance_cr: tbDiff > 0 ? tbDiff : 0,
            fs_mapping: "Balance Sheet — Equity — Retained Earnings",
          });
        }
        tbDrTotal = tb.reduce((s: number, r: any) => s + (Number(r.balance_dr) || 0), 0);
        tbCrTotal = tb.reduce((s: number, r: any) => s + (Number(r.balance_cr) || 0), 0);
      }

      logger.info(`Phase 1 complete: ${coa.length} COA accounts, ${tb.length} TB lines, balanced=${Math.abs(tbDrTotal - tbCrTotal) < 1}`);

      // ═══════════════════════════════════════════════════════════════════════
      // PHASE 2: GENERAL LEDGER (transaction-wise, per account batch)
      // ═══════════════════════════════════════════════════════════════════════
      logger.info("GL/TB Phase 2: General Ledger generation");

      const allTBCodes = tb.map((r: any) => r.account_code);
      const assetLiabilityCodes = tb.filter((r: any) => {
        const num = Number(r.account_code);
        return !isNaN(num) ? num < 4000 : true;
      }).map((r: any) => r.account_code);
      const revExpCodes = tb.filter((r: any) => {
        const num = Number(r.account_code);
        return !isNaN(num) ? num >= 4000 : false;
      }).map((r: any) => r.account_code);

      const generateGLBatch = async (batchAccounts: string[], batchLabel: string): Promise<any[]> => {
        const batchTB = tb.filter((r: any) => batchAccounts.includes(r.account_code));
        const batchTBText = batchTB.map((r: any) =>
          `${r.account_code} "${r.account_name}" [${r.classification}]: Opening Dr=${r.opening_dr || 0}/Cr=${r.opening_cr || 0} | Period Dr=${r.debit_total}, Cr=${r.credit_total} | Closing Bal=${r.balance_dr ? "Dr " + r.balance_dr : "Cr " + r.balance_cr}`
        ).join("\n");

        const glPrompt = `Generate DETAILED General Ledger journal entries for the following accounts (${batchLabel}).

  ${entityProfile}

  ACCOUNTS TO GENERATE (from Trial Balance):
  ${batchTBText}

  MANDATORY GL CONSTRUCTION RULES:
  1. For EACH account, generate entries that sum EXACTLY to the TB debit_total and credit_total.
  2. Include an OPENING BALANCE entry dated at period start (first day of financial year) for each BS account.
  3. Spread transactions logically across ALL 12 months. No month should have zero activity for active accounts.
  4. Generate REALISTIC transaction volumes: high-activity accounts (cash, revenue, purchases) need 15-25 entries; low-activity (share capital, reserves) need 2-5 entries.
  5. Every journal entry must be balanced within itself: if account X is debited, another account Y (even outside this batch) must be credited.
  6. Voucher numbering: JV-001..JV-999, BPV-001 (bank payment), BRV-001 (bank receipt), PV-001 (payment), RV-001 (receipt), SV-001 (sales).
  7. Pakistan-specific narrations: mention real bank names (HBL, MCB, UBL, Meezan), supplier types, PRAL references, WHT sections.
  8. For revenue accounts: monthly sales with 17% GST (STA 1990) and WHT u/s 153 ITO 2001.
  9. For expense accounts: monthly postings with proper tax treatment.
  10. Year-end entries: depreciation (IAS 16), tax provision (ITO 2001), deferred tax (IAS 12), gratuity provision (IAS 19).

  CRITICAL VALIDATION: The SUM of all debits per account MUST equal that account's debit_total in TB. The SUM of all credits per account MUST equal that account's credit_total in TB. NO EXCEPTIONS.

  Return ONLY valid JSON:
  {
    "entries": [
      { "date": "2023-07-01", "voucher_no": "JV-001", "account_code": "1701", "account_name": "Cash at Bank — HBL", "narration": "Opening balance b/f per audited accounts FY2023", "debit": 5000000, "credit": 0, "ref": "OB-001", "entry_type": "Opening Balance" }
    ]
  }`;

        const glRes = await ai.client.chat.completions.create({
          model: ai.model,
          messages: [
            { role: "system", content: "You are a Pakistan chartered accountant generating audit-ready General Ledger entries. Each entry must be realistic, properly dated, and sum exactly to the Trial Balance totals. Return only valid JSON." },
            { role: "user", content: glPrompt }
          ],
          max_tokens: 12000,
          temperature: 0.2,
          response_format: { type: "json_object" },
        });

        const glRaw = glRes.choices?.[0]?.message?.content || "{}";
        const glParsed = JSON.parse(glRaw);
        return glParsed.entries || glParsed.general_ledger || [];
      };

      const createBatches = (codes: string[], batchSize: number) => {
        const batches: string[][] = [];
        for (let i = 0; i < codes.length; i += batchSize) {
          batches.push(codes.slice(i, i + batchSize));
        }
        return batches;
      };

      const bsBatches = createBatches(assetLiabilityCodes, 12);
      const plBatches = createBatches(revExpCodes, 12);

      let allGLEntries: any[] = [];

      const batchErrors: string[] = [];
        for (let i = 0; i < bsBatches.length; i++) {
          try {
            logger.info(`GL batch BS-${i + 1}/${bsBatches.length}: ${bsBatches[i].length} accounts`);
            const entries = await generateGLBatch(bsBatches[i], `Balance Sheet accounts batch ${i + 1}`);
            allGLEntries = allGLEntries.concat(entries);
          } catch (batchErr: any) {
            logger.error(`GL batch BS-${i + 1} failed: ${batchErr.message}`);
            batchErrors.push(`BS batch ${i + 1}: ${batchErr.message}`);
          }
        }

        for (let i = 0; i < plBatches.length; i++) {
          try {
            logger.info(`GL batch PL-${i + 1}/${plBatches.length}: ${plBatches[i].length} accounts`);
            const entries = await generateGLBatch(plBatches[i], `Income/Expense accounts batch ${i + 1}`);
            allGLEntries = allGLEntries.concat(entries);
          } catch (batchErr: any) {
            logger.error(`GL batch PL-${i + 1} failed: ${batchErr.message}`);
            batchErrors.push(`PL batch ${i + 1}: ${batchErr.message}`);
          }
        }

        if (batchErrors.length > 0) {
          logger.warn(`${batchErrors.length} GL batch(es) failed: ${batchErrors.join("; ")}`);
        }

      allGLEntries.sort((a: any, b: any) => (a.date || "").localeCompare(b.date || ""));

      logger.info(`Phase 2 complete: ${allGLEntries.length} GL entries generated`);

      // ═══════════════════════════════════════════════════════════════════════
      // PHASE 3: RECONCILIATION & VALIDATION
      // ═══════════════════════════════════════════════════════════════════════
      logger.info("GL/TB Phase 3: Reconciliation & Validation");

      const glAccountTotals = new Map<string, { dr: number; cr: number }>();
      for (const entry of allGLEntries) {
        const code = entry.account_code;
        if (!glAccountTotals.has(code)) glAccountTotals.set(code, { dr: 0, cr: 0 });
        const t = glAccountTotals.get(code)!;
        t.dr += Number(entry.debit) || 0;
        t.cr += Number(entry.credit) || 0;
      }

      const reconDetails: any[] = [];
      let totalGLDr = 0;
      let totalGLCr = 0;
      let glTbMismatches = 0;

      for (const tbRow of tb) {
        const code = tbRow.account_code;
        const glTotals = glAccountTotals.get(code) || { dr: 0, cr: 0 };
        const tbDrVal = Number(tbRow.debit_total) || 0;
        const tbCrVal = Number(tbRow.credit_total) || 0;
        const drDiff = Math.round((glTotals.dr - tbDrVal) * 100) / 100;
        const crDiff = Math.round((glTotals.cr - tbCrVal) * 100) / 100;
        const matched = Math.abs(drDiff) < 1 && Math.abs(crDiff) < 1;

        if (!matched) {
          glTbMismatches++;
          tbRow.debit_total = Math.round(glTotals.dr * 100) / 100;
          tbRow.credit_total = Math.round(glTotals.cr * 100) / 100;
          const newBal = tbRow.debit_total - tbRow.credit_total;
          tbRow.balance_dr = newBal > 0 ? Math.round(newBal * 100) / 100 : 0;
          tbRow.balance_cr = newBal < 0 ? Math.round(Math.abs(newBal) * 100) / 100 : 0;
        }

        totalGLDr += glTotals.dr;
        totalGLCr += glTotals.cr;

        reconDetails.push({
          account_code: code,
          account_name: tbRow.account_name,
          gl_dr: glTotals.dr,
          gl_cr: glTotals.cr,
          tb_dr: tbRow.debit_total,
          tb_cr: tbRow.credit_total,
          matched,
        });
      }

      tbDrTotal = tb.reduce((s: number, r: any) => s + (Number(r.balance_dr) || 0), 0);
      tbCrTotal = tb.reduce((s: number, r: any) => s + (Number(r.balance_cr) || 0), 0);
      const finalDiff = Math.round((tbDrTotal - tbCrTotal) * 100) / 100;

      if (Math.abs(finalDiff) >= 1) {
        logger.warn(`Post-GL TB imbalance: ${finalDiff}. Adjusting via Retained Earnings.`);
        const reIdx = tb.findIndex((r: any) => r.account_code === "3300" || /retained.earnings/i.test(r.account_name));
        if (reIdx >= 0) {
          if (finalDiff > 0) {
            tb[reIdx].balance_cr = (Number(tb[reIdx].balance_cr) || 0) + finalDiff;
            tb[reIdx].credit_total = (Number(tb[reIdx].credit_total) || 0) + finalDiff;
          } else {
            tb[reIdx].balance_dr = (Number(tb[reIdx].balance_dr) || 0) + Math.abs(finalDiff);
            tb[reIdx].debit_total = (Number(tb[reIdx].debit_total) || 0) + Math.abs(finalDiff);
          }
        } else {
            tb.push({
              account_code: "3300", account_name: "Retained Earnings (Balancing)", fs_head: "Retained Earnings",
              classification: "Equity", opening_dr: 0, opening_cr: 0,
              debit_total: finalDiff < 0 ? Math.abs(finalDiff) : 0, credit_total: finalDiff > 0 ? finalDiff : 0,
              balance_dr: finalDiff < 0 ? Math.abs(finalDiff) : 0, balance_cr: finalDiff > 0 ? finalDiff : 0,
              fs_mapping: "Balance Sheet \u2014 Equity \u2014 Retained Earnings",
            });
          }
        tbDrTotal = tb.reduce((s: number, r: any) => s + (Number(r.balance_dr) || 0), 0);
        tbCrTotal = tb.reduce((s: number, r: any) => s + (Number(r.balance_cr) || 0), 0);
      }

      const assetTotal = tb.filter((r: any) => String(r.account_code).startsWith("1")).reduce((s: number, r: any) => s + (Number(r.balance_dr) || 0) - (Number(r.balance_cr) || 0), 0);
      const liabilityTotal = tb.filter((r: any) => String(r.account_code).startsWith("2")).reduce((s: number, r: any) => s + (Number(r.balance_cr) || 0) - (Number(r.balance_dr) || 0), 0);
      const equityTotal = tb.filter((r: any) => String(r.account_code).startsWith("3")).reduce((s: number, r: any) => s + (Number(r.balance_cr) || 0) - (Number(r.balance_dr) || 0), 0);
      const revenueTotal = tb.filter((r: any) => String(r.account_code).startsWith("4")).reduce((s: number, r: any) => s + (Number(r.balance_cr) || 0) - (Number(r.balance_dr) || 0), 0);
      const expenseTotal = tb.filter((r: any) => ["5", "6", "7"].includes(String(r.account_code).charAt(0))).reduce((s: number, r: any) => s + (Number(r.balance_dr) || 0) - (Number(r.balance_cr) || 0), 0);

      const fsMappingSummary: any[] = [];
      const fsHeadMap = new Map<string, { fs_line: string; tb_total: number }>();
      for (const r of tb) {
        const fsLine = r.fs_head || r.fs_mapping || "Unmapped";
        if (!fsHeadMap.has(fsLine)) fsHeadMap.set(fsLine, { fs_line: fsLine, tb_total: 0 });
        const entry = fsHeadMap.get(fsLine)!;
        entry.tb_total += (Number(r.balance_dr) || 0) - (Number(r.balance_cr) || 0);
      }
      for (const [key, val] of fsHeadMap) {
        fsMappingSummary.push({ fs_line: key, tb_total: Math.round(val.tb_total) });
      }

      const tbAdjustments: any[] = [];
      if (glTbMismatches > 0) {
        tbAdjustments.push({ type: "GL-TB Sync", description: `${glTbMismatches} TB account(s) adjusted to match GL totals`, source: "AI Derived Adjustment" });
      }
      if (Math.abs(finalDiff) >= 1) {
        tbAdjustments.push({ type: "Balancing", description: `TB balanced via Retained Earnings adjustment of PKR ${Math.abs(finalDiff).toLocaleString("en-PK")}`, source: "AI Derived Adjustment" });
      }

      logger.info(`Phase 3 complete: GL/TB matched=${glTbMismatches === 0}, TB balanced=${Math.abs(tbDrTotal - tbCrTotal) < 1}, Assets=${assetTotal}, Liab+Eq=${liabilityTotal + equityTotal}`);

      res.json({
        general_ledger: allGLEntries,
        trial_balance: tb,
        chart_of_accounts: coa,
        reconciliation_proof: {
          total_gl_debits: Math.round(totalGLDr),
          total_gl_credits: Math.round(totalGLCr),
          gl_balanced: Math.abs(totalGLDr - totalGLCr) < 1,
          total_tb_dr_balances: Math.round(tbDrTotal),
          total_tb_cr_balances: Math.round(tbCrTotal),
          tb_balanced: Math.abs(tbDrTotal - tbCrTotal) < 1,
          total_assets_per_tb: Math.round(assetTotal),
          total_liabilities_per_tb: Math.round(liabilityTotal),
          total_equity_per_tb: Math.round(equityTotal),
          accounting_equation_satisfied: Math.abs(assetTotal - liabilityTotal - equityTotal) < 100,
          revenue_per_tb: Math.round(revenueTotal),
          expenses_per_tb: Math.round(expenseTotal),
          net_profit_per_tb: Math.round(revenueTotal - expenseTotal),
          gl_tb_mismatches: glTbMismatches,
          adjustments: tbAdjustments,
          fs_mapping_summary: fsMappingSummary,
        },
        summary: {
          gl_entries: allGLEntries.length,
          tb_accounts: tb.length,
          coa_accounts: coa.length,
          total_debit: Math.round(tbDrTotal),
          total_credit: Math.round(tbCrTotal),
          is_balanced: Math.abs(tbDrTotal - tbCrTotal) < 1,
          phases_completed: 3,
          gl_tb_reconciled: glTbMismatches === 0,
          accounting_equation_satisfied: Math.abs(assetTotal - liabilityTotal - equityTotal) < 100,
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

  const safeNum = (v: any): number => { if (v == null) return 0; const s = String(v).replace(/,/g, "").trim(); const n = Number(s); return isNaN(n) ? 0 : n; };
  const fin = analysis.financials || {};
  const formatPKR = (n: any) => { const v = safeNum(n); return `PKR ${v.toLocaleString("en-PK")}`; };
  const entity = analysis.entity || {};
  const materiality = analysis.materiality || {};
  const risks = analysis.risk_assessment || {};

  const allPapers = [
    "A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8", "A9", "A10",
    "B1", "B2", "B3", "B4", "B5", "B6", "B7", "B8", "B9", "B10", "B11", "B12", "B13", "B14", "B15",
    "C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8",
    "D1", "D2", "D3", "D4", "D5", "D6",
    "E1", "E2", "E3", "E4", "E5", "E6", "E7", "E8", "E9",
    "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12", "F13", "F14", "F15", "F16", "F17", "F18", "F19", "F20", "F21", "F22", "F23", "F24", "F25", "F26", "F27",
    "G1", "G2", "G3", "G4", "G5", "G6", "G7", "G8",
    "H1", "H2", "H3", "H4", "H5", "H6", "H7",
    "I1", "I2", "I3", "I4", "I5", "I6",
    "J1", "J2", "J3", "J4", "J5",
    "K1", "K2", "K3", "K4", "K5",
    "L1", "L2", "L3", "L4", "L5", "L6",
    "M1", "M2", "M3", "M4", "M5",
    "N1", "N2", "N3", "N4", "N5", "N6",
    "O1", "O2", "O3", "O4", "O5", "O6",
  ];
  if (Array.isArray(selectedPapers) && selectedPapers.length === 0) {
    return res.status(400).json({ error: "No papers selected for generation." });
  }
  const papersToGenerate = Array.isArray(selectedPapers) && selectedPapers.length > 0 ? selectedPapers : allPapers;

  const wpDefinitions: Record<string, { title: string; section: string; isa: string; description: string }> = {
    "A1": { title: "Client Acceptance Checklist", section: "Pre-Engagement & Acceptance", isa: "ISA 210, ISQM 1", description: "Client acceptance evaluation including integrity, risk, and competence assessment." },
    "A2": { title: "Continuance Evaluation", section: "Pre-Engagement & Acceptance", isa: "ISQM 1", description: "Annual continuance assessment for existing clients." },
    "A3": { title: "Engagement Letter", section: "Pre-Engagement & Acceptance", isa: "ISA 210", description: "Terms of engagement including scope, responsibilities, and fee." },
    "A4": { title: "Independence Declarations (Firm & Team)", section: "Pre-Engagement & Acceptance", isa: "IESBA Code", description: "Independence declarations from firm and all engagement team members." },
    "A5": { title: "Conflict of Interest Assessment", section: "Pre-Engagement & Acceptance", isa: "IESBA Code", description: "Assessment of conflicts of interest and safeguards applied." },
    "A6": { title: "Ethical Compliance (IESBA)", section: "Pre-Engagement & Acceptance", isa: "IESBA Code", description: "Ethical compliance assessment per IESBA Code of Ethics." },
    "A7": { title: "Client Risk Profiling", section: "Pre-Engagement & Acceptance", isa: "ISA 220, ISQM 1", description: "Client risk profile for acceptance/continuance decision-making." },
    "A8": { title: "KYC / AML Documentation", section: "Pre-Engagement & Acceptance", isa: "AMLA 2010", description: "Beneficial ownership verification, PEP screening, and AML compliance." },
    "A9": { title: "Previous Auditor Communication", section: "Pre-Engagement & Acceptance", isa: "ISA 300", description: "Communication with previous auditor regarding client matters." },
    "A10": { title: "Terms of Engagement Approval", section: "Pre-Engagement & Acceptance", isa: "ISA 210", description: "Partner approval of engagement terms and conditions." },
    "B1": { title: "Understanding the Entity & Environment", section: "Planning", isa: "ISA 315", description: "Entity structure, industry, regulatory environment, and key processes." },
    "B2": { title: "Industry Analysis", section: "Planning", isa: "ISA 315", description: "Industry-specific risks, market conditions, and competitive landscape." },
    "B3": { title: "Regulatory Framework Assessment", section: "Planning", isa: "ISA 250", description: "Applicable laws, regulations, and compliance requirements assessment." },
    "B4": { title: "Business Model & Revenue Streams", section: "Planning", isa: "ISA 315", description: "Understanding business model, revenue streams, and key value drivers." },
    "B5": { title: "Internal Control Narratives", section: "Planning", isa: "ISA 315", description: "Narrative documentation of key internal control processes." },
    "B6": { title: "Process Flowcharts", section: "Planning", isa: "ISA 315", description: "Business process flowcharts for key transaction cycles." },
    "B7": { title: "IT Environment Assessment", section: "Planning", isa: "ISA 315", description: "IT infrastructure, systems, and controls environment assessment." },
    "B8": { title: "Risk Assessment (Financial Statement Level)", section: "Planning", isa: "ISA 315", description: "Overall financial statement level risk assessment." },
    "B9": { title: "Risk Assessment (Assertion Level)", section: "Planning", isa: "ISA 315", description: "Assertion-level risk assessment for material account balances." },
    "B10": { title: "Fraud Risk Assessment", section: "Planning", isa: "ISA 240", description: "Fraud risk factors, management override assessment, and revenue recognition risk." },
    "B11": { title: "Laws & Regulations Compliance Review", section: "Planning", isa: "ISA 250", description: "Compliance with applicable laws and regulations review." },
    "B12": { title: "Materiality Calculation (Overall, PM, Trivial)", section: "Planning", isa: "ISA 320", description: "Overall materiality, performance materiality, and trivial threshold calculation." },
    "B13": { title: "Audit Strategy Memorandum", section: "Planning", isa: "ISA 300", description: "Overall audit strategy, scope, timing, and resource allocation." },
    "B14": { title: "Detailed Audit Plan", section: "Planning", isa: "ISA 300", description: "Detailed audit plan with nature, timing, and extent of procedures." },
    "B15": { title: "Related Party Identification", section: "Planning", isa: "ISA 550", description: "Identification of related parties and planned audit procedures." },
    "C1": { title: "Raw Trial Balance", section: "Trial Balance & Financials", isa: "ISA 500", description: "Raw unadjusted trial balance as received from the client." },
    "C2": { title: "Adjusted Trial Balance", section: "Trial Balance & Financials", isa: "ISA 500", description: "Trial balance adjusted for audit adjustments and reclassifications." },
    "C3": { title: "Lead Schedules (FS Mapping)", section: "Trial Balance & Financials", isa: "ISA 500", description: "Lead schedules mapping TB accounts to financial statement line items." },
    "C4": { title: "Financial Statements (Draft)", section: "Trial Balance & Financials", isa: "IAS 1", description: "Draft financial statements before final audit adjustments." },
    "C5": { title: "Financial Statements (Final)", section: "Trial Balance & Financials", isa: "IAS 1", description: "Final financial statements after all audit adjustments." },
    "C6": { title: "Prior Year Comparatives", section: "Trial Balance & Financials", isa: "ISA 510", description: "Prior year comparative figures verification and analysis." },
    "C7": { title: "Chart of Accounts Mapping", section: "Trial Balance & Financials", isa: "ISA 315", description: "Chart of accounts mapping to audit areas and FS line items." },
    "C8": { title: "Consolidation (if applicable)", section: "Trial Balance & Financials", isa: "IFRS 10", description: "Group consolidation workings and intercompany eliminations." },
    "D1": { title: "Ratio Analysis (Liquidity, Profitability, Leverage, Efficiency)", section: "Analytical Review", isa: "ISA 520", description: "Comprehensive ratio analysis covering liquidity, profitability, leverage, and efficiency." },
    "D2": { title: "Trend Analysis (YoY / Monthly)", section: "Analytical Review", isa: "ISA 520", description: "Year-on-year and monthly trend analysis of key financial metrics." },
    "D3": { title: "Budget vs Actual Analysis", section: "Analytical Review", isa: "ISA 520", description: "Comparison of budgeted figures against actual results." },
    "D4": { title: "Variance Analysis", section: "Analytical Review", isa: "ISA 520", description: "Detailed variance analysis with explanations for significant movements." },
    "D5": { title: "Expectation vs Actual Comparison", section: "Analytical Review", isa: "ISA 520", description: "Auditor's independent expectation compared against actual figures." },
    "D6": { title: "Analytical Review Conclusion", section: "Analytical Review", isa: "ISA 520", description: "Overall conclusion from analytical review procedures." },
    "E1": { title: "Walkthrough Documentation", section: "Internal Control & Risk", isa: "ISA 315", description: "End-to-end walkthrough of key transaction cycles and controls." },
    "E2": { title: "Control Identification Matrix", section: "Internal Control & Risk", isa: "ISA 315", description: "Matrix identifying key controls for each significant process." },
    "E3": { title: "Risk-Control Matrix (RCM)", section: "Internal Control & Risk", isa: "ISA 315, ISA 330", description: "Mapping of identified risks to mitigating controls." },
    "E4": { title: "Test of Controls (ToC)", section: "Internal Control & Risk", isa: "ISA 330", description: "Operating effectiveness testing of key internal controls." },
    "E5": { title: "Control Deviations Log", section: "Internal Control & Risk", isa: "ISA 330", description: "Log of control deviations identified during testing." },
    "E6": { title: "IT General Controls (ITGC) Testing", section: "Internal Control & Risk", isa: "ISA 315", description: "Testing of IT general controls: access, change management, operations, SDLC." },
    "E7": { title: "Application Controls Testing", section: "Internal Control & Risk", isa: "ISA 315", description: "Testing of automated application controls within IT systems." },
    "E8": { title: "Control Deficiency Evaluation", section: "Internal Control & Risk", isa: "ISA 265", description: "Evaluation and classification of identified control deficiencies." },
    "E9": { title: "Controls Conclusion", section: "Internal Control & Risk", isa: "ISA 265", description: "Overall conclusion on internal control environment and impact on audit approach." },
    "F1": { title: "Sampling Plan", section: "Substantive Procedures", isa: "ISA 530", description: "Statistical and non-statistical sampling methodology and parameters." },
    "F2": { title: "Sampling Selection Sheet", section: "Substantive Procedures", isa: "ISA 530", description: "Selection of sample items using defined sampling methodology." },
    "F3": { title: "Substantive Testing Strategy", section: "Substantive Procedures", isa: "ISA 330", description: "Overall strategy for substantive audit procedures." },
    "F4": { title: "Misstatement Tracking Sheet", section: "Substantive Procedures", isa: "ISA 450", description: "Tracking of identified misstatements during substantive testing." },
    "F5": { title: "Cash & Bank Testing", section: "Substantive Procedures", isa: "ISA 505, ISA 500", description: "Bank confirmation, reconciliation, cash count, and cut-off testing." },
    "F6": { title: "Bank Reconciliation Testing", section: "Substantive Procedures", isa: "ISA 500", description: "Testing of bank reconciliation statements and outstanding items." },
    "F7": { title: "Receivables Testing (Aging, Confirmations)", section: "Substantive Procedures", isa: "ISA 505", description: "Debtors aging analysis, confirmations, subsequent receipts, and provision assessment." },
    "F8": { title: "Inventory Testing (Existence, Valuation)", section: "Substantive Procedures", isa: "ISA 501, IAS 2", description: "Inventory count observation, valuation, NRV, and slow-moving analysis." },
    "F9": { title: "PPE Testing (Additions, Disposals, Depreciation)", section: "Substantive Procedures", isa: "IAS 16, ISA 500", description: "Fixed asset register verification, depreciation, additions, and disposals." },
    "F10": { title: "Intangible Assets Testing", section: "Substantive Procedures", isa: "IAS 38", description: "Intangible asset existence, valuation, amortization, and impairment testing." },
    "F11": { title: "Investment Testing", section: "Substantive Procedures", isa: "IFRS 9", description: "Investment existence, valuation, classification, and impairment testing." },
    "F12": { title: "Payables Testing", section: "Substantive Procedures", isa: "ISA 330, ISA 505", description: "Creditors reconciliation, confirmations, and cut-off testing." },
    "F13": { title: "Borrowings Testing", section: "Substantive Procedures", isa: "ISA 540", description: "Borrowings verification, terms review, and covenant compliance." },
    "F14": { title: "Accruals Testing", section: "Substantive Procedures", isa: "ISA 330", description: "Accrued expenses testing and completeness verification." },
    "F15": { title: "Provisions & Contingencies", section: "Substantive Procedures", isa: "IAS 37, ISA 501", description: "Provision testing, legal confirmations, and contingency assessment." },
    "F16": { title: "Share Capital Verification", section: "Substantive Procedures", isa: "Companies Act 2017", description: "Share capital, authorized and paid-up verification." },
    "F17": { title: "Reserves & Retained Earnings", section: "Substantive Procedures", isa: "IAS 1", description: "Reserves movement schedule and retained earnings verification." },
    "F18": { title: "Revenue Testing (Cut-off, Occurrence)", section: "Substantive Procedures", isa: "IFRS 15, ISA 240", description: "Revenue recognition testing, cut-off, occurrence, and completeness." },
    "F19": { title: "Cost of Sales Testing", section: "Substantive Procedures", isa: "ISA 330", description: "Cost of sales components verification and analytical review." },
    "F20": { title: "Operating Expenses Testing", section: "Substantive Procedures", isa: "ISA 330", description: "Operating expenses testing, analytical review, and cut-off procedures." },
    "F21": { title: "Payroll Testing", section: "Substantive Procedures", isa: "ISA 330", description: "Payroll expense testing, authorization, and analytical review." },
    "F22": { title: "Finance Cost Testing", section: "Substantive Procedures", isa: "ISA 540", description: "Finance cost verification, interest rate testing, and capitalization review." },
    "F23": { title: "Other Income Testing", section: "Substantive Procedures", isa: "ISA 330", description: "Other income testing for completeness and occurrence." },
    "F24": { title: "Current Tax Computation", section: "Substantive Procedures", isa: "ITO 2001", description: "Income tax provision, advance tax, minimum tax, and WHT compliance." },
    "F25": { title: "Deferred Tax Calculation", section: "Substantive Procedures", isa: "IAS 12", description: "Deferred tax asset/liability calculation and movement schedule." },
    "F26": { title: "Sales Tax / VAT Testing", section: "Substantive Procedures", isa: "STA 1990", description: "Sales tax returns, input/output reconciliation, and compliance." },
    "F27": { title: "Withholding Tax Testing", section: "Substantive Procedures", isa: "ITO 2001", description: "WHT deduction and deposit compliance for all applicable sections." },
    "G1": { title: "Bank Confirmations", section: "Audit Evidence", isa: "ISA 505", description: "External bank confirmation requests and responses." },
    "G2": { title: "Debtors Confirmations", section: "Audit Evidence", isa: "ISA 505", description: "External debtor confirmation requests and responses." },
    "G3": { title: "Creditors Confirmations", section: "Audit Evidence", isa: "ISA 505", description: "External creditor confirmation requests and responses." },
    "G4": { title: "Legal Confirmations", section: "Audit Evidence", isa: "ISA 501", description: "Legal counsel confirmation regarding litigation and claims." },
    "G5": { title: "Third Party Confirmations", section: "Audit Evidence", isa: "ISA 505", description: "Other third-party confirmations (e.g., custodians, agents)." },
    "G6": { title: "Physical Verification Reports", section: "Audit Evidence", isa: "ISA 501", description: "Physical verification of fixed assets and inventory." },
    "G7": { title: "Supporting Documents Index", section: "Audit Evidence", isa: "ISA 500", description: "Index of all supporting documents obtained during audit." },
    "G8": { title: "Evidence Cross-Reference Sheet", section: "Audit Evidence", isa: "ISA 500", description: "Cross-referencing of audit evidence to working paper assertions." },
    "H1": { title: "Summary of Misstatements (Unadjusted & Adjusted)", section: "Completion", isa: "ISA 450", description: "Schedule of unadjusted and adjusted misstatements with materiality assessment." },
    "H2": { title: "Subsequent Events Review", section: "Completion", isa: "ISA 560", description: "Review of events after reporting period and their impact." },
    "H3": { title: "Going Concern Assessment", section: "Completion", isa: "ISA 570", description: "Management's going concern assessment and auditor's evaluation." },
    "H4": { title: "Final Analytical Review", section: "Completion", isa: "ISA 520", description: "Final-stage analytical procedures to confirm overall audit conclusions." },
    "H5": { title: "Disclosure Checklist (IFRS / Companies Act)", section: "Completion", isa: "IFRS / Companies Act 2017", description: "Comprehensive disclosure checklist per IFRS and Companies Act requirements." },
    "H6": { title: "Management Representation Letter", section: "Completion", isa: "ISA 580", description: "Written representations from management on material matters." },
    "H7": { title: "Engagement Completion Checklist", section: "Completion", isa: "ISA 220, ISA 230", description: "Comprehensive engagement completion procedures and sign-off." },
    "I1": { title: "Draft Auditor's Report", section: "Reporting", isa: "ISA 700", description: "Draft audit report with opinion, basis, and required paragraphs." },
    "I2": { title: "Final Auditor's Report", section: "Reporting", isa: "ISA 700", description: "Final signed audit report with all required elements." },
    "I3": { title: "Key Audit Matters (KAM)", section: "Reporting", isa: "ISA 701", description: "Identification and communication of key audit matters." },
    "I4": { title: "Emphasis of Matter (EOM)", section: "Reporting", isa: "ISA 706", description: "Emphasis of matter paragraphs assessment and drafting." },
    "I5": { title: "Other Matter Paragraph", section: "Reporting", isa: "ISA 706", description: "Other matter paragraphs for supplementary information." },
    "I6": { title: "Other Information Review (ISA 720)", section: "Reporting", isa: "ISA 720", description: "Review of other information in documents containing audited FS." },
    "J1": { title: "Engagement Quality Control Review Checklist", section: "Quality Control & EQCR", isa: "ISQM 1, ISQM 2", description: "EQCR checklist for engagement quality review." },
    "J2": { title: "Reviewer Notes & Clearance", section: "Quality Control & EQCR", isa: "ISA 220", description: "Review notes resolution and clearance documentation." },
    "J3": { title: "Consultation Documentation", section: "Quality Control & EQCR", isa: "ISA 220, ISQM 1", description: "Documentation of consultations on difficult or contentious matters." },
    "J4": { title: "Independence Reconfirmation", section: "Quality Control & EQCR", isa: "IESBA Code", description: "Reconfirmation of independence at engagement completion." },
    "J5": { title: "Quality Control Sign-offs", section: "Quality Control & EQCR", isa: "ISA 220", description: "Quality control sign-offs by engagement partner and reviewer." },
    "K1": { title: "Audit Planning Letter", section: "Client Communication", isa: "ISA 260", description: "Communication of audit plan, scope, and approach to management/TCWG." },
    "K2": { title: "Management Letter (Control Weaknesses)", section: "Client Communication", isa: "ISA 265", description: "Communication of control deficiencies and recommendations." },
    "K3": { title: "TCWG Communication", section: "Client Communication", isa: "ISA 260", description: "Communication with those charged with governance on significant matters." },
    "K4": { title: "Audit Findings Report", section: "Client Communication", isa: "ISA 260", description: "Detailed audit findings report for management and TCWG." },
    "K5": { title: "Exit Meeting Minutes", section: "Client Communication", isa: "ISA 260", description: "Minutes of exit meeting with management." },
    "L1": { title: "Companies Act Compliance Checklist", section: "Regulatory & Compliance (Pakistan)", isa: "Companies Act 2017", description: "Compliance checklist per Companies Act 2017 requirements." },
    "L2": { title: "SECP Filings Review", section: "Regulatory & Compliance (Pakistan)", isa: "SECP Regulations", description: "Review of SECP filings and regulatory compliance." },
    "L3": { title: "Income Tax Compliance (FBR)", section: "Regulatory & Compliance (Pakistan)", isa: "ITO 2001", description: "Income tax compliance review including returns and assessments." },
    "L4": { title: "Sales Tax Compliance (FBR / PRA / SRB / KPRA / BRA)", section: "Regulatory & Compliance (Pakistan)", isa: "STA 1990", description: "Sales tax compliance across federal and provincial authorities." },
    "L5": { title: "Withholding Tax Compliance", section: "Regulatory & Compliance (Pakistan)", isa: "ITO 2001", description: "WHT compliance review for all applicable withholding sections." },
    "L6": { title: "Zakat / WWF / EOBI Compliance", section: "Regulatory & Compliance (Pakistan)", isa: "Pakistan Laws", description: "Compliance with Zakat, Workers Welfare Fund, and EOBI obligations." },
    "M1": { title: "Engagement Budget & Time Sheet", section: "Administrative", isa: "ISQM 1", description: "Engagement budget, time tracking, and resource utilization." },
    "M2": { title: "Team Allocation", section: "Administrative", isa: "ISA 220", description: "Team allocation, competency assessment, and supervision plan." },
    "M3": { title: "Billing & Fee Note", section: "Administrative", isa: "ISQM 1", description: "Billing computation and fee note preparation." },
    "M4": { title: "Document Indexing", section: "Administrative", isa: "ISA 230", description: "Complete indexing of all working papers and documents." },
    "M5": { title: "Version Control Log", section: "Administrative", isa: "ISA 230", description: "Version control log for all working paper revisions." },
    "N1": { title: "Data Extraction Log (OCR Output)", section: "IT & Data (AI / Digital Audit)", isa: "ISA 230, AI Process", description: "Log of all data extracted by AI OCR from uploaded documents, with confidence scores." },
    "N2": { title: "Data Validation Sheet", section: "IT & Data (AI / Digital Audit)", isa: "AI Process", description: "Validation checks performed on extracted data and results." },
    "N3": { title: "TB vs GL Reconciliation", section: "IT & Data (AI / Digital Audit)", isa: "AI Process", description: "Reconciliation between trial balance and general ledger totals." },
    "N4": { title: "FS Mapping Sheet", section: "IT & Data (AI / Digital Audit)", isa: "AI Process", description: "Mapping of financial statement line items to TB and GL accounts." },
    "N5": { title: "AI Assumptions Log", section: "IT & Data (AI / Digital Audit)", isa: "AI Process", description: "Register of all AI assumptions made during analysis and reconstruction." },
    "N6": { title: "Exception & Error Log", section: "IT & Data (AI / Digital Audit)", isa: "AI Process", description: "Log of exceptions, errors, and anomalies identified by AI processing." },
    "O1": { title: "ICAP QCR Checklist", section: "Inspection / QCR / Archiving", isa: "ICAP / ISQM 1", description: "ICAP quality control review checklist." },
    "O2": { title: "ISA Compliance Mapping", section: "Inspection / QCR / Archiving", isa: "ISA 200-720", description: "Mapping of audit procedures to applicable ISA requirements." },
    "O3": { title: "Working Paper Index", section: "Inspection / QCR / Archiving", isa: "ISA 230", description: "Complete index of all working papers with references and dates." },
    "O4": { title: "Deficiency Tracking", section: "Inspection / QCR / Archiving", isa: "ISA 265", description: "Tracking of deficiencies from QCR and their resolution." },
    "O5": { title: "Final Archive File", section: "Inspection / QCR / Archiving", isa: "ISA 230", description: "Final assembled and reviewed audit archive file." },
    "O6": { title: "File Lock & Retention Record", section: "Inspection / QCR / Archiving", isa: "ISA 230", description: "File locking within 60 days and retention schedule record." },
  };

  const ap = analysis.analytical_procedures || {};
  const reconciliation = analysis.reconciliation || {};
  const evidenceItems = analysis.evidence_items || [];
  const icWeaknesses = analysis.internal_control_weaknesses || [];

  const evidenceSummary = evidenceItems.length > 0
    ? evidenceItems.map((e: any) => `  ${e.id}: ${e.filename} (${e.type}) — ${e.description}`).join("\n")
    : "  EV-1: Trial Balance\n  EV-2: General Ledger\n  EV-3: Bank Statements";

  const toN = (v: any, d = 2) => { const n = parseFloat(v); return isNaN(n) ? "—" : n.toFixed(d); };
  const ratiosSummary = ap.ratios
    ? `Gross Margin: ${toN(ap.ratios.gross_margin_pct, 1)}% | Net Margin: ${toN(ap.ratios.net_margin_pct, 1)}% | Current Ratio: ${toN(ap.ratios.current_ratio)} | D/E: ${toN(ap.ratios.debt_to_equity)}`
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
- Gross Profit: ${formatPKR(fin.gross_profit)} (${safeNum(fin.revenue) ? ((safeNum(fin.gross_profit)/safeNum(fin.revenue))*100).toFixed(1) : "0"}%)
- Net Profit: ${formatPKR(fin.net_profit)} (${safeNum(fin.revenue) ? ((safeNum(fin.net_profit)/safeNum(fin.revenue))*100).toFixed(1) : "0"}%)
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

  const sequentialSteps: { label: string; filter: (p: string) => boolean }[] = [
    { label: "Step 1 — Pre-Engagement & Acceptance", filter: (p: string) => /^A\d/.test(p) },
    { label: "Step 2 — Planning", filter: (p: string) => /^B\d/.test(p) },
    { label: "Step 3 — Trial Balance & Financials", filter: (p: string) => /^C\d/.test(p) },
    { label: "Step 4 — Analytical Review", filter: (p: string) => /^D\d/.test(p) },
    { label: "Step 5 — Internal Control & Risk", filter: (p: string) => /^E\d/.test(p) },
    { label: "Step 6 — Substantive Procedures (General & Assets)", filter: (p: string) => /^F([1-9]|1[01])$/.test(p) },
    { label: "Step 7 — Substantive Procedures (Liabilities, Equity, Income)", filter: (p: string) => /^F(1[2-9]|2[0-7])$/.test(p) },
    { label: "Step 8 — Audit Evidence", filter: (p: string) => /^G\d/.test(p) },
    { label: "Step 9 — Completion", filter: (p: string) => /^H\d/.test(p) },
    { label: "Step 10 — Reporting", filter: (p: string) => /^I\d/.test(p) },
    { label: "Step 11 — Quality Control & EQCR", filter: (p: string) => /^J\d/.test(p) },
    { label: "Step 12 — Client Communication", filter: (p: string) => /^K\d/.test(p) },
    { label: "Step 13 — Regulatory & Compliance (Pakistan)", filter: (p: string) => /^L\d/.test(p) },
    { label: "Step 14 — Administrative", filter: (p: string) => /^M\d/.test(p) },
    { label: "Step 15 — IT & Data (AI / Digital Audit)", filter: (p: string) => /^N\d/.test(p) },
    { label: "Step 16 — Inspection / QCR / Archiving", filter: (p: string) => /^O\d/.test(p) },
  ];

  const batches: string[][] = [];
  const batchLabels: string[] = [];
  for (const step of sequentialSteps) {
    const papers = (papersToGenerate as string[]).filter(step.filter);
    if (papers.length > 0) {
      batches.push(papers);
      batchLabels.push(step.label);
    }
  }

  try {
    const allGeneratedPapers: any[] = [];

    for (let bi = 0; bi < batches.length; bi++) {
      const batch = batches[bi];
      const batchDefs = batch.map(ref => {
        const def = wpDefinitions[ref];
        return def ? `${ref}: ${def.title} (${def.section}) — ${def.isa} — ${def.description}` : ref;
      }).join("\n");

      const completedSummary = allGeneratedPapers.length > 0
        ? `\n══════════════════════════════════════════════════════════════════
PREVIOUSLY COMPLETED STEPS (${allGeneratedPapers.length} papers finalized — cross-reference these)
══════════════════════════════════════════════════════════════════
${allGeneratedPapers.map((wp: any) => `${wp.ref}: ${wp.title} — Conclusion: ${(wp.auditor_conclusion || "Complete").substring(0, 120)}`).join("\n")}\n`
        : "";

      const batchPrompt = `══════════════════════════════════════════════════════════════════
${batchLabels[bi]} — Sequential Step ${bi + 1} of ${batches.length}
══════════════════════════════════════════════════════════════════
STRICT SEQUENTIAL PROCESSING: This step MUST be fully complete — including all outputs, reconciliations, conclusions, and cross-references — before the next step begins. Do NOT leave any section incomplete or inconsistent.

PAPERS TO GENERATE IN THIS STEP:
${batchDefs}
${completedSummary}
══════════════════════════════════════════════════════════════════
FULL ENGAGEMENT CONTEXT (use ALL data below in every paper)
══════════════════════════════════════════════════════════════════
${contextBlock}

══════════════════════════════════════════════════════════════════
GENERATION MANDATE — READ CAREFULLY
══════════════════════════════════════════════════════════════════
Each working paper MUST:
1. Use ACTUAL financial figures from the context above — no placeholders like "XXX" or "[amount]".
2. Reference specific ISA paragraphs (e.g. "ISA 315.26(a)", "ISA 320.10") not just "ISA 315".
3. Include at least 6-10 detailed audit procedures per paper with specific findings.
4. Every procedure finding must reference actual numbers, account names, or document references.
5. Pakistan-specific compliance: cite ITO 2001 sections, STA 1990, Companies Act 2017 where applicable.
6. Cross-reference to related working papers using exact WP references (e.g. "See B6 for materiality").
7. Evidence refs must match the evidence items in the context (use actual filenames or generate realistic refs like "TB-01", "GL-01", "BS-01").
8. Conclusions must be affirmative professional statements: "Based on procedures performed, we are satisfied that..."
9. Sign-off details: preparer, reviewer, approver as provided in context.
10. Materiality amounts must be the EXACT amounts from the context — ${materiality.overall_materiality ? `OM = PKR ${safeNum(materiality.overall_materiality).toLocaleString("en-PK")}` : "compute from financials"}.
11. RECONCILIATION CHECK: Verify all figures tie back to the Trial Balance and General Ledger. Any discrepancy must be noted and resolved within this step.
12. ISA COMPLIANCE GATE: Each paper must explicitly state which ISA requirements it satisfies and confirm compliance before the step is marked complete.
13. CROSS-REFERENCING MANDATE: Reference previously completed working papers by their exact WP ref codes. Every substantive paper (F-series) must link back to risk assessment (B8/B9), controls evaluation (E-series), and planning (B-series) papers. Audit evidence (G-series) must cross-reference substantive procedures (F-series).

${wpJsonSchema}`;

      const genResponse = await ai.client.chat.completions.create({
        model: ai.model,
        messages: [
          { role: "system", content: `You are AuditWise — Pakistan's premier audit working paper AI engine trained on Big-4 methodologies and ICAP standards.

ABSOLUTE RULES:
• NEVER use placeholder text like "[amount]", "[name]", "XXX", "TBD", "[insert]" — use real data from the context.
• NEVER generate generic procedures — every procedure must be specific to this entity, industry, and financial data.
• Every working paper is a LEGAL AUDIT DOCUMENT — write with precision, completeness, and professional scepticism.
• Use ISA 230 documentation standards: who did what, when, what was found, what was concluded.
• All figures must be in PKR with realistic amounts consistent with the entity's financial scale.
• Materiality thresholds must appear in substantive testing procedures.
• STRICT SEQUENTIAL DISCIPLINE: You are generating one step at a time. Each paper in this step MUST be 100% finalized — complete procedures, findings, conclusions, cross-references, and ISA sign-off — before the response is returned. Incomplete or inconsistent output will cause the entire audit file to fail.
• CROSS-REFERENCING: Where previous steps have been completed, reference them by exact WP ref (e.g. "Per A3 engagement letter", "Risk identified in D1"). Maintain consistency across the entire audit file.
• RECONCILIATION: All monetary values must reconcile to the Trial Balance and source financials. Flag any discrepancy explicitly.
• Return ONLY valid JSON in the exact schema provided. No markdown, no prose outside JSON.` },
          { role: "user", content: batchPrompt },
        ],
        max_tokens: 14000,
        temperature: 0.15,
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
      logger.info(`Sequential step ${bi + 1}/${batches.length} (${batchLabels[bi]}): generated ${batchPapers.length} papers — total so far: ${allGeneratedPapers.length}`);
    }

    const workingPapers = allGeneratedPapers;

    const sectionPrefixMap: Record<string, string> = {
      "A": "A — Pre-Engagement & Acceptance", "B": "B — Planning",
      "C": "C — Trial Balance & Financials", "D": "D — Analytical Review",
      "E": "E — Internal Control & Risk", "F": "F — Substantive Procedures (Test of Details)",
      "G": "G — Audit Evidence", "H": "H — Completion",
      "I": "I — Reporting", "J": "J — Quality Control & EQCR",
      "K": "K — Client Communication", "L": "L — Regulatory & Compliance (Pakistan)",
      "M": "M — Administrative", "N": "N — IT & Data (AI / Digital Audit)",
      "O": "O — Inspection / QCR / Archiving",
    };
    const enrichedPapers = workingPapers.map((wp: any) => {
      const def      = wpDefinitions[wp.ref] || {};
      const signoffs = getWPSignoffs(wp.ref, engDates, teamNames);
      const prefix   = (wp.ref || "").replace(/[0-9]/g, "").toUpperCase();
      return {
        ...wp,
        section_label:   sectionPrefixMap[prefix] || def.section || wp.section,
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
      { ref: "EV-3", description: "Bank Statements", type: "financial", wp_refs: enrichedPapers.filter((wp: any) => wp.ref === "F5" || wp.ref === "F6").map((wp: any) => wp.ref) },
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
      const doc = new PDFDocument({
        size: "A4",
        margins: { top: 72, bottom: 72, left: 56, right: 56 },
        bufferPages: true,
        info: {
          Title: `Audit Working Paper File — ${meta?.entity || "Client"}`,
          Author: meta?.firm_name || "ANA & Co. Chartered Accountants",
          Subject: `${meta?.engagement_type || "Statutory Audit"} — ${meta?.financial_year || "FY 2024"}`,
        },
      });

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="AuditFile_${(meta?.entity || "Client").replace(/\s+/g, "_")}_${meta?.financial_year?.replace(/\s+/g, "_") || "2024"}.pdf"`);
      doc.pipe(res);

      const PW = 595.28;
      const PH = 841.89;
      const ML = 56;
      const MR = 56;
      const MT = 72;
      const MB = 72;
      const FW = PW - ML - MR;

      const NAVY = "#0F2B46";
      const NAVY2 = "#1B3A5C";
      const BLUE = "#2563EB";
      const BLUE_LIGHT = "#3B82F6";
      const ACCENT = "#0EA5E9";
      const BG_LIGHT = "#F0F5FA";
      const BG_ALT = "#F8FAFC";
      const GREEN = "#059669";
      const GREEN_LIGHT = "#ECFDF5";
      const GRAY = "#6B7280";
      const GRAY_DARK = "#374151";
      const GRAY_LIGHT = "#F3F4F6";
      const GOLD = "#D97706";
      const RED = "#DC2626";
      const WHITE = "#FFFFFF";
      const BORDER = "#D1D5DB";
      const TEXT_DARK = "#111827";

      let totalPages = workingPapers.length + 2;

      function addWatermark() {
        doc.save();
        doc.opacity(0.03);
        doc.fontSize(72).font("Helvetica-Bold").fillColor("#000000");
        doc.rotate(-45, { origin: [PW / 2, PH / 2] });
        doc.text("CONFIDENTIAL", 0, PH / 2 - 40, { width: PW, align: "center" });
        doc.restore();
      }

      function addHeader(section: string, subtitle: string) {
        doc.rect(0, 0, PW, 52).fill(NAVY);
        doc.rect(0, 52, PW, 3).fill(ACCENT);
        doc.fillColor(WHITE).font("Helvetica-Bold").fontSize(11)
          .text(meta?.firm_name || "ANA & Co. Chartered Accountants", ML, 12, { width: FW * 0.6 });
        doc.fillColor("#93C5FD").font("Helvetica").fontSize(8)
          .text(section, ML, 32, { width: FW * 0.6 });
        doc.fillColor(WHITE).font("Helvetica").fontSize(8)
          .text(`${meta?.entity || "Client"} | ${meta?.financial_year || "FY 2024"}`, ML, 18, { align: "right", width: FW });
        doc.fillColor("#93C5FD").fontSize(7)
          .text(subtitle, ML, 32, { align: "right", width: FW });
        doc.y = 72;
      }

      function addFooter(pageNum: number) {
        const y = PH - 36;
        doc.save();
        doc.moveTo(ML, y - 8).lineTo(PW - MR, y - 8).strokeColor(BORDER).lineWidth(0.5).stroke();
        doc.fillColor(GRAY).font("Helvetica").fontSize(6.5);
        doc.text(`${meta?.firm_name || "ANA & Co. Chartered Accountants"} | Strictly Confidential`, ML, y - 2, { width: FW * 0.7 });
        doc.text(`Page ${pageNum} of ${totalPages}`, ML, y - 2, { width: FW, align: "right" });
        doc.restore();
      }

      function needsNewPage(spaceNeeded: number, wp?: any, contLabel?: string) {
        if (doc.y > PH - MB - spaceNeeded) {
          totalPages++;
          doc.addPage();
          addWatermark();
          if (wp) addHeader(wp.section_label || wp.section || "", `${wp.ref} \u2014 ${wp.title} (continued)`);
          else addHeader("", contLabel || "");
          doc.y = 72;
          return true;
        }
        return false;
      }

      function drawTable(headers: string[], rows: string[][], colWidths: number[], opts: { headerBg?: string; headerColor?: string; altBg?: string; fontSize?: number; headerFontSize?: number; cellPadding?: number; wp?: any } = {}) {
        const hBg = opts.headerBg || NAVY;
        const hColor = opts.headerColor || WHITE;
        const altBg = opts.altBg || BG_ALT;
        const fs2 = opts.fontSize || 7.5;
        const hFs = opts.headerFontSize || 7.5;
        const pad = opts.cellPadding || 5;
        const rowH = 18;

        needsNewPage(rowH + 20, opts.wp);

        doc.rect(ML, doc.y, FW, rowH).fill(hBg);
        let cx = ML;
        for (let i = 0; i < headers.length; i++) {
          doc.fillColor(hColor).font("Helvetica-Bold").fontSize(hFs)
            .text(headers[i], cx + pad, doc.y + 4, { width: colWidths[i] - pad * 2 });
          cx += colWidths[i];
        }
        doc.y += rowH;

        for (let r = 0; r < rows.length; r++) {
          const texts = rows[r];
          const lineHeights = texts.map((rawT, i) => {
            const t = String(rawT ?? "");
            const charPerLine = Math.max(1, Math.floor((colWidths[i] - pad * 2) / (fs2 * 0.48)));
            return Math.max(1, Math.ceil(t.length / charPerLine));
          });
          const maxLines = Math.max(1, ...lineHeights);
          const dynH = Math.max(rowH, maxLines * (fs2 + 3) + pad * 2);

          needsNewPage(dynH + 10, opts.wp);

          const bg = r % 2 === 0 ? WHITE : altBg;
          doc.rect(ML, doc.y, FW, dynH).fill(bg);

          doc.moveTo(ML, doc.y).lineTo(ML + FW, doc.y).strokeColor(BORDER).lineWidth(0.3).stroke();

          cx = ML;
          for (let i = 0; i < texts.length; i++) {
            let colCx = cx;
            if (i > 0) {
              doc.moveTo(cx, doc.y).lineTo(cx, doc.y + dynH).strokeColor(BORDER).lineWidth(0.2).stroke();
            }
            doc.fillColor(TEXT_DARK).font("Helvetica").fontSize(fs2)
              .text(texts[i] || "", colCx + pad, doc.y + pad, { width: colWidths[i] - pad * 2 });
            cx += colWidths[i];
          }
          doc.moveTo(ML, doc.y + dynH).lineTo(ML + FW, doc.y + dynH).strokeColor(BORDER).lineWidth(0.3).stroke();
          doc.y += dynH;
        }
      }

      // ═══════════════════════════════════════════════════════════════════════════
      // COVER PAGE
      // ═══════════════════════════════════════════════════════════════════════════
      doc.rect(0, 0, PW, PH).fill(NAVY);
      doc.rect(0, PH - 6, PW, 6).fill(ACCENT);
      doc.rect(0, 0, 6, PH).fill(ACCENT);
      addWatermark();

      doc.rect(ML, 80, FW, 2).fill(ACCENT);

      doc.fillColor(WHITE).font("Helvetica-Bold").fontSize(36).text("AUDIT WORKING", ML, 110, { width: FW, align: "center" });
      doc.text("PAPER FILE", ML, 155, { width: FW, align: "center" });

      doc.rect(PW / 2 - 60, 205, 120, 2).fill(BLUE_LIGHT);

      doc.fillColor("#93C5FD").font("Helvetica-Bold").fontSize(20)
        .text(meta?.entity || "Client Company", ML, 230, { width: FW, align: "center" });

      doc.fillColor("#BFDBFE").font("Helvetica").fontSize(12)
        .text(`${meta?.engagement_type || "Statutory Audit"} | ${meta?.financial_year || "Year Ended June 30, 2024"}`, ML, 265, { width: FW, align: "center" });

      const boxY = 330;
      const boxW = 180;
      const boxH = 100;
      const boxGap = FW - boxW * 2;

      doc.roundedRect(ML, boxY, boxW, boxH, 4).fill("#1E3A5F");
      doc.fillColor("#93C5FD").font("Helvetica-Bold").fontSize(7).text("AUDIT FIRM", ML + 16, boxY + 14);
      doc.fillColor(WHITE).font("Helvetica").fontSize(10)
        .text(meta?.firm_name || "ANA & Co. Chartered Accountants", ML + 16, boxY + 32, { width: boxW - 32 });

      doc.roundedRect(PW - MR - boxW, boxY, boxW, boxH, 4).fill("#1E3A5F");
      doc.fillColor("#93C5FD").font("Helvetica-Bold").fontSize(7).text("GENERATED", PW - MR - boxW + 16, boxY + 14);
      doc.fillColor(WHITE).font("Helvetica").fontSize(10)
        .text(new Date().toLocaleDateString("en-PK", { day: "2-digit", month: "long", year: "numeric" }), PW - MR - boxW + 16, boxY + 32, { width: boxW - 32 });

      doc.fillColor("#60A5FA").font("Helvetica").fontSize(9)
        .text(`Total Working Papers: ${workingPapers.length}`, ML, boxY + boxH + 50, { width: FW, align: "center" });
      doc.text("ISA 200\u2013720 Compliant | Audit Working Papers", ML, boxY + boxH + 68, { width: FW, align: "center" });

      doc.fillColor(GOLD).font("Helvetica-Bold").fontSize(7)
        .text("STRICTLY CONFIDENTIAL \u2014 For Audit Purposes Only", ML, PH - 50, { width: FW, align: "center" });

      // ═══════════════════════════════════════════════════════════════════════════
      // TABLE OF CONTENTS
      // ═══════════════════════════════════════════════════════════════════════════
      doc.addPage();
      addWatermark();
      addHeader("Table of Contents", `${meta?.entity || "Client"}`);

      doc.y = 80;
      doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(18).text("TABLE OF CONTENTS", ML, doc.y, { width: FW, align: "center" });
      doc.y += 8;
      doc.moveTo(ML + FW * 0.25, doc.y).lineTo(ML + FW * 0.75, doc.y).strokeColor(ACCENT).lineWidth(2).stroke();
      doc.y += 16;

      const sections: Record<string, any[]> = {};
      workingPapers.forEach((wp: any) => {
        const sec = wp.section_label || wp.section || "General";
        if (!sections[sec]) sections[sec] = [];
        sections[sec].push(wp);
      });

      let pgCounter = 3;
      for (const [secName, papers] of Object.entries(sections)) {
        needsNewPage(30);

        doc.rect(ML, doc.y, FW, 18).fill(BG_LIGHT);
        doc.rect(ML, doc.y, 3, 18).fill(ACCENT);
        doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(9)
          .text(secName.toUpperCase(), ML + 12, doc.y + 4, { width: FW - 20 });
        doc.y += 22;

        for (const wp of papers) {
          needsNewPage(16);
          doc.fillColor(TEXT_DARK).font("Helvetica").fontSize(8.5);
          const titleText = `    ${wp.ref} \u2014 ${wp.title}`;
          doc.text(titleText, ML + 8, doc.y, { width: FW - 80, continued: false });

          const dots = "." .repeat(60);
          doc.fillColor(GRAY).fontSize(7).text(dots, ML + 8, doc.y - 11, { width: FW - 60, align: "right" });
          doc.fillColor(GRAY_DARK).font("Helvetica-Bold").fontSize(8)
            .text(`Page ${pgCounter}`, ML, doc.y - 11, { width: FW, align: "right" });
          pgCounter++;
          doc.y += 3;
        }
        doc.y += 8;
      }
      addFooter(2);

      // ═══════════════════════════════════════════════════════════════════════════
      // INDIVIDUAL WORKING PAPERS
      // ═══════════════════════════════════════════════════════════════════════════
      let wpPage = 3;
      for (const wp of workingPapers) {
        doc.addPage();
        addWatermark();
        addHeader(wp.section_label || wp.section || "Working Paper", `${wp.ref} \u2014 ${wp.title}`);

        doc.y = 72;

        doc.rect(ML, doc.y, FW, 52).fill(BG_LIGHT);
        doc.rect(ML, doc.y, 4, 52).fill(BLUE);
        doc.rect(ML, doc.y, FW, 0.5).fill(BLUE);
        doc.rect(ML, doc.y + 52, FW, 0.5).fill(BLUE);

        doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(14)
          .text(`${wp.ref} \u2014 ${wp.title}`, ML + 14, doc.y + 8, { width: FW - 28 });

        const metaLine = `${(wp.isa_references || []).join(" | ")}  \u2022  Prepared: ${wp.preparer || meta?.preparer || "Audit Senior"}  \u2022  Reviewed: ${wp.reviewer || meta?.reviewer || "Audit Manager"}  \u2022  Date: ${wp.date_prepared || new Date().toLocaleDateString()}`;
        doc.fillColor(GRAY).font("Helvetica").fontSize(7.5)
          .text(metaLine, ML + 14, doc.y + 32, { width: FW - 28 });
        doc.y += 66;

        if (wp.objective) {
          needsNewPage(50, wp);
          doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(10).text("OBJECTIVE", ML, doc.y);
          doc.y += 4;
          doc.moveTo(ML, doc.y).lineTo(ML + 60, doc.y).strokeColor(ACCENT).lineWidth(1.5).stroke();
          doc.y += 8;
          doc.fillColor(TEXT_DARK).font("Helvetica").fontSize(9).text(wp.objective, ML, doc.y, { width: FW, lineGap: 2 });
          doc.y += 16;
        }

        if (wp.scope) {
          needsNewPage(50, wp);
          doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(10).text("SCOPE", ML, doc.y);
          doc.y += 4;
          doc.moveTo(ML, doc.y).lineTo(ML + 40, doc.y).strokeColor(ACCENT).lineWidth(1.5).stroke();
          doc.y += 8;
          doc.fillColor(TEXT_DARK).font("Helvetica").fontSize(9).text(wp.scope, ML, doc.y, { width: FW, lineGap: 2 });
          doc.y += 16;
        }

        if (wp.procedures && wp.procedures.length > 0) {
          needsNewPage(60, wp);
          doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(10).text("AUDIT PROCEDURES PERFORMED", ML, doc.y);
          doc.y += 4;
          doc.moveTo(ML, doc.y).lineTo(ML + 180, doc.y).strokeColor(ACCENT).lineWidth(1.5).stroke();
          doc.y += 10;

          const procCols = [FW * 0.06, FW * 0.34, FW * 0.38, FW * 0.22];
          const procHeaders = ["Ref", "Procedure", "Finding", "Conclusion"];
          const procRows = wp.procedures.map((p: any, i: number) => [
            p.no || String(i + 1),
            p.procedure || "",
            p.finding || "",
            p.conclusion || "",
          ]);
          drawTable(procHeaders, procRows, procCols, { wp, fontSize: 7.5, cellPadding: 4 });
          doc.y += 16;
        }

        if (wp.summary_table && wp.summary_table.length > 0) {
          needsNewPage(60, wp);
          doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(10).text("SUMMARY SCHEDULE", ML, doc.y);
          doc.y += 4;
          doc.moveTo(ML, doc.y).lineTo(ML + 120, doc.y).strokeColor(ACCENT).lineWidth(1.5).stroke();
          doc.y += 10;

          const sumCols = [FW * 0.30, FW * 0.30, FW * 0.40];
          const sumHeaders = ["Item", "Amount / Value", "Comment"];
          const sumRows = wp.summary_table.map((r: any) => [r.item || "", r.value || "", r.comment || ""]);
          drawTable(sumHeaders, sumRows, sumCols, { wp, headerBg: NAVY2, fontSize: 8 });
          doc.y += 16;
        }

        if (wp.key_findings && wp.key_findings.length > 0) {
          needsNewPage(50, wp);
          doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(10).text("KEY FINDINGS", ML, doc.y);
          doc.y += 4;
          doc.moveTo(ML, doc.y).lineTo(ML + 90, doc.y).strokeColor(ACCENT).lineWidth(1.5).stroke();
          doc.y += 10;

          for (const f of wp.key_findings) {
            needsNewPage(20, wp);
            doc.rect(ML + 4, doc.y + 1, 3, 10).fill(GREEN);
            doc.fillColor(TEXT_DARK).font("Helvetica").fontSize(8.5)
              .text(f, ML + 16, doc.y, { width: FW - 24, lineGap: 1 });
            doc.y += 6;
          }
          doc.y += 10;
        }

        if (wp.auditor_conclusion) {
          needsNewPage(70, wp);
          const concH = 56;
          doc.rect(ML, doc.y, FW, concH).fill(GREEN_LIGHT);
          doc.rect(ML, doc.y, 4, concH).fill(GREEN);
          doc.rect(ML, doc.y, FW, 0.5).fill(GREEN);
          doc.rect(ML, doc.y + concH, FW, 0.5).fill(GREEN);

          doc.fillColor(GREEN).font("Helvetica-Bold").fontSize(8.5)
            .text("AUDITOR'S CONCLUSION", ML + 14, doc.y + 8);
          doc.fillColor(TEXT_DARK).font("Helvetica").fontSize(8.5)
            .text(wp.auditor_conclusion, ML + 14, doc.y + 24, { width: FW - 28, lineGap: 1.5 });
          doc.y += concH + 16;
        }

        needsNewPage(50, wp);
        doc.rect(ML, doc.y, FW, 36).fill(BG_LIGHT);
        doc.rect(ML, doc.y, FW, 0.5).fill(BORDER);
        doc.rect(ML, doc.y + 36, FW, 0.5).fill(BORDER);

        const signW = FW / 3;
        const signRoles = [
          { role: "Prepared By", name: wp.preparer || meta?.preparer || "Audit Senior" },
          { role: "Reviewed By", name: wp.reviewer || meta?.reviewer || "Audit Manager" },
          { role: "Approved By (Partner)", name: wp.partner || meta?.approver || "Engagement Partner" },
        ];
        let sx = ML;
        for (const { role, name } of signRoles) {
          doc.fillColor(GRAY).font("Helvetica").fontSize(7).text(role, sx + 8, doc.y + 6);
          doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(8.5).text(name, sx + 8, doc.y + 18);
          if (sx > ML) {
            doc.moveTo(sx, doc.y + 4).lineTo(sx, doc.y + 32).strokeColor(BORDER).lineWidth(0.3).stroke();
          }
          sx += signW;
        }

        addFooter(wpPage);
        wpPage++;
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

  if (!Array.isArray(workingPapers) || workingPapers.length === 0) {
    return res.status(400).json({ error: "No working papers to export." });
  }

  try {
    const wb = XLSX.utils.book_new();
    const fin = analysis?.financials || {};
    const mat = analysis?.materiality || {};
    const risks = analysis?.risk_assessment || {};
    const asArr = (v: any): any[] => Array.isArray(v) ? v : [];

    const fmtN = (n: any) => { const v = Number(n); return (!isNaN(v) && (n || n === 0)) ? v.toLocaleString("en-PK") : "N/A"; };
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
    const iRisks = asArr(risks.inherent_risks);
    if (iRisks.length) {
      coverData.push(["Inherent Risk Area", "Risk Description", "Level"]);
      iRisks.forEach((r: any) => {
        coverData.push([r.area || "", r.risk || "", r.level || ""]);
      });
    }
    const assumptions = asArr(analysis?.assumptions_made);
    if (assumptions.length) {
      coverData.push([]);
      coverData.push(["AUDITOR ASSUMPTIONS / ESTIMATED DATA"]);
      assumptions.forEach((a: string, i: number) => {
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

        const procs = asArr(wp.procedures);
        if (procs.length > 0) {
          rows.push(["AUDIT PROCEDURES"]);
          rows.push(["Ref", "Procedure", "Finding / Evidence Obtained", "Conclusion"]);
          procs.forEach((p: any, i: number) => {
            rows.push([p.no || `${i + 1}`, p.procedure || "", p.finding || "", p.conclusion || ""]);
          });
          rows.push([]);
        }

        const sumTbl = asArr(wp.summary_table);
        if (sumTbl.length > 0) {
          rows.push(["SUMMARY SCHEDULE"]);
          rows.push(["Item", "Amount / Value", "Comment"]);
          sumTbl.forEach((r: any) => {
            rows.push([r.item || "", String(r.value ?? ""), r.comment || ""]);
          });
          rows.push([]);
        }

        const findings = asArr(wp.key_findings);
        if (findings.length > 0) {
          rows.push(["KEY FINDINGS"]);
          findings.forEach((f: string, i: number) => {
            rows.push([`${i + 1}.`, String(f ?? "")]);
          });
          rows.push([]);
        }

        if (wp.auditor_conclusion) {
          rows.push(["AUDITOR'S CONCLUSION"]);
          rows.push([wp.auditor_conclusion]);
          rows.push([]);
        }

        const recs = asArr(wp.recommendations);
        if (recs.length > 0) {
          rows.push(["RECOMMENDATIONS"]);
          recs.forEach((r: string, i: number) => {
            rows.push([`${i + 1}.`, String(r ?? "")]);
          });
          rows.push([]);
        }

        rows.push(["Prepared By:", wp.preparer || "Audit Senior", "Reviewed By:", wp.reviewer || "Audit Manager", "Partner:", wp.partner || "Partner"]);
        rows.push([]);
        rows.push(["—".repeat(40)]);
        rows.push([]);
      }

      let sheetName = secName.replace(/[\\\/*?\[\]:]/g, "").trim().slice(0, 31) || "Section";
      let dedupIdx = 2;
      while (wb.SheetNames.includes(sheetName)) {
        const suffix = ` (${dedupIdx})`;
        sheetName = (secName.replace(/[\\\/*?\[\]:]/g, "").trim().slice(0, 31 - suffix.length) || "Section") + suffix;
        dedupIdx++;
      }
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
      ["Revenue", fmtN(fin.revenue), fmtN(fin.prior_year_revenue), fin.revenue && fin.prior_year_revenue ? `${(((Number(fin.revenue) - Number(fin.prior_year_revenue))/Number(fin.prior_year_revenue))*100).toFixed(1)}%` : "N/A", ""],
      ["Net Profit", fmtN(fin.net_profit), fmtN(fin.prior_year_net_profit), fin.net_profit && fin.prior_year_net_profit ? `${(((Number(fin.net_profit) - Number(fin.prior_year_net_profit))/Number(fin.prior_year_net_profit))*100).toFixed(1)}%` : "N/A", ""],
      ["Total Assets", fmtN(fin.total_assets), fmtN(fin.prior_year_total_assets), fin.total_assets && fin.prior_year_total_assets ? `${(((Number(fin.total_assets) - Number(fin.prior_year_total_assets))/Number(fin.prior_year_total_assets))*100).toFixed(1)}%` : "N/A", ""],
      [],
      ["KEY RATIOS"],
      ["Gross Margin %", ratios.gross_margin_pct != null && !isNaN(Number(ratios.gross_margin_pct)) ? `${Number(ratios.gross_margin_pct).toFixed(1)}%` : "N/A", "", "", ""],
      ["Net Margin %", ratios.net_margin_pct != null && !isNaN(Number(ratios.net_margin_pct)) ? `${Number(ratios.net_margin_pct).toFixed(1)}%` : "N/A", "", "", ""],
      ["Current Ratio", ratios.current_ratio != null && !isNaN(Number(ratios.current_ratio)) ? Number(ratios.current_ratio).toFixed(2) : "N/A", "", "", ""],
      ["Debt-to-Equity", ratios.debt_to_equity != null && !isNaN(Number(ratios.debt_to_equity)) ? Number(ratios.debt_to_equity).toFixed(2) : "N/A", "", "", ""],
      ["Return on Assets %", fin.total_assets && fin.net_profit != null ? `${((Number(fin.net_profit) / Number(fin.total_assets))*100).toFixed(1)}%` : "N/A", "", "", ""],
      ["Return on Equity %", fin.equity && fin.net_profit != null ? `${((Number(fin.net_profit) / Number(fin.equity))*100).toFixed(1)}%` : "N/A", "", "", ""],
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
      { area: "Cash & Bank", cy: fin.cash_and_bank, py: null, ref: "F5" },
      { area: "Trade Receivables", cy: fin.trade_receivables, py: null, ref: "F7" },
      { area: "Inventory", cy: fin.inventory, py: null, ref: "F8" },
      { area: "Fixed Assets", cy: fin.fixed_assets, py: null, ref: "F9" },
      { area: "Trade Payables", cy: fin.trade_payables, py: null, ref: "F12" },
      { area: "Total Assets", cy: fin.total_assets, py: fin.prior_year_total_assets, ref: "—" },
      { area: "Total Liabilities", cy: fin.total_liabilities, py: null, ref: "—" },
      { area: "Equity", cy: fin.equity, py: null, ref: "—" },
    ];
    const om = mat.overall_materiality || 0;
    for (const item of bsAreas) {
      const mvt = item.py ? (Number(item.cy) || 0) - Number(item.py) : null;
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
      { item: "Revenue", amount: fin.revenue, ref: "F18", risk: "High" },
      { item: "Trade Receivables", amount: fin.trade_receivables, ref: "F7", risk: "Medium" },
      { item: "Inventory", amount: fin.inventory, ref: "F8", risk: "Medium" },
      { item: "Fixed Assets", amount: fin.fixed_assets, ref: "F9", risk: "Low" },
      { item: "Trade Payables", amount: fin.trade_payables, ref: "F12", risk: "Medium" },
      { item: "Cash & Bank", amount: fin.cash_and_bank, ref: "F5", risk: "Low" },
      { item: "Expenses", amount: fin.net_profit, ref: "F20", risk: "Medium" },
    ];
    const totalCarrying = pmAreas.reduce((s, a) => s + (Number(a.amount) || 0), 0);
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
      ["Revenue", "H", "H", "H", "M", "L", "H", "M", "M", "F18"],
      ["Trade Receivables", "H", "H", "H", "H", "M", "H", "M", "M", "F7"],
      ["Inventory", "H", "H", "M", "H", "M", "M", "M", "M", "F8"],
      ["Fixed Assets", "M", "M", "L", "H", "M", "L", "M", "M", "F9"],
      ["Trade Payables", "H", "H", "H", "M", "M", "H", "M", "M", "F12"],
      ["Cash & Bank", "H", "H", "H", "L", "M", "M", "L", "L", "F5"],
      ["Provisions", "M", "M", "M", "H", "H", "L", "M", "M", "F15"],
      ["Payroll / Staff Costs", "M", "H", "H", "L", "M", "H", "M", "M", "F21"],
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
      ["Revenue Cycle", "Authorization of sales orders", "Occurrence", "Inspect approval signatures on sample", "25", "", "E4"],
      ["Revenue Cycle", "Segregation of duties — invoicing vs receipts", "Accuracy", "Walkthrough and observation", "N/A", "", "E1"],
      ["Procurement", "PO approval for purchases above threshold", "Completeness", "Sample POs and verify authorization", "25", "", "E4"],
      ["Procurement", "Three-way matching (PO/GRN/Invoice)", "Accuracy", "Re-perform matching on sample", "20", "", "E4"],
      ["Payroll", "Authorization of payroll changes", "Occurrence", "Inspect HR approvals for new hires/terminations", "15", "", "E4"],
      ["Cash & Bank", "Bank reconciliation review and approval", "Existence", "Inspect monthly bank reconciliations", "12", "", "E4"],
      ["Fixed Assets", "Capital expenditure authorization", "Rights", "Inspect approval for additions > threshold", "10", "", "E4"],
      ["IT General Controls", "Access controls — user provisioning", "Completeness", "Review user access logs", "N/A", "", "E6"],
    ];
    const tocSheet = XLSX.utils.aoa_to_sheet(tocRows);
    tocSheet["!cols"] = [{ wch: 18 }, { wch: 40 }, { wch: 14 }, { wch: 40 }, { wch: 12 }, { wch: 10 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, tocSheet, "ToC Matrix");

    // ── 10. ToD / SUBSTANTIVE TESTING MATRIX ────────────────────────────────
    const todRows: any[][] = [
      ["TESTS OF DETAILS / SUBSTANTIVE TESTING MATRIX — ISA 330/500"],
      [],
      ["FS Area", "Assertion Tested", "Procedure", "Source of Evidence", "Sample Size Basis", "Expected Result", "WP Ref"],
      ["Cash & Bank", "Existence, Completeness", "Bank confirmation + reconciliation", "Bank certificates", "All banks", "Fully reconciled", "F5"],
      ["Trade Receivables", "Existence, Valuation", "External confirmation (ISA 505)", "Direct debtor confirmation", `${meta?.sampling_method || "Statistical"}`, "100% response or alternative", "F7"],
      ["Inventory", "Existence, Valuation", "Physical count observation + NRV test", "Count sheets + market prices", "Value-weighted", "Variance < PM", "F8"],
      ["Fixed Assets", "Existence, Valuation", "Physical verification + depreciation recalculation", "FAR + inspection", "Above PM threshold", "Within tolerance", "F9"],
      ["Trade Payables", "Completeness, Accuracy", "Supplier statement reconciliation", "Supplier statements", "Top 10 + random 15", "Differences < PM", "F12"],
      ["Revenue", "Occurrence, Accuracy", "Vouching sales to invoices/contracts", "Sales invoices, contracts", meta?.sampling_method || "Statistical", "Agree to supporting docs", "F18"],
      ["Expenses", "Occurrence, Accuracy", "Recalculate selected months + statutory deductions", "Payroll registers, invoices", "3 months", "Within tolerance", "F20"],
      ["Provisions", "Existence, Valuation", "Review legal confirmations + management estimates", "Legal confirmations", "All material", "Agree to external evidence", "F15"],
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
      evRows.push(["EV-2", "Bank Statements", "External", "Financial Institution", "F5", "", "High"]);
      evRows.push(["EV-3", "Tax Returns / Assessments", "External", "FBR Portal", "L3", "", "High"]);
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
      const formatPKR = (n: any) => { const v = Number(n); return `PKR ${(isNaN(v) ? 0 : v).toLocaleString("en-PK")}`; };
      const now = new Date().toLocaleDateString("en-PK", { day: "2-digit", month: "long", year: "numeric" });

      const A4_W = 11906;
      const MARGIN = 1134;
      const TBL_W = A4_W - MARGIN * 2;

      const NAVY_HEX = "0F2B46";
      const NAVY2_HEX = "1B3A5C";
      const BLUE_HEX = "2563EB";
      const ACCENT_HEX = "0EA5E9";
      const BG_LIGHT_HEX = "F0F5FA";
      const BG_ALT_HEX = "F8FAFC";
      const GREEN_HEX = "059669";
      const GRAY_HEX = "6B7280";
      const GOLD_HEX = "D97706";
      const WHITE_HEX = "FFFFFF";
      const TEXT_HEX = "111827";
      const BORDER_HEX = "D1D5DB";

      const thinBorder = { style: BorderStyle.SINGLE, size: 1, color: BORDER_HEX };
      const noBorder = { style: BorderStyle.NONE, size: 0, color: WHITE_HEX };
      const accentBorder = { style: BorderStyle.SINGLE, size: 4, color: ACCENT_HEX };
      const clearBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };

      const makeCell = (text: string, opts: { bold?: boolean; dark?: boolean; width?: number; bg?: string; color?: string; size?: number; borders?: any; colspan?: number; alignment?: typeof AlignmentType[keyof typeof AlignmentType] } = {}) => {
        const { bold = false, dark = false, width = 2000, bg, color, size = 20, borders, colspan } = opts;
        const cellColor = dark ? WHITE_HEX : (color || NAVY2_HEX);
        const shading = dark
          ? { fill: NAVY_HEX, type: ShadingType.CLEAR, color: "auto" }
          : bg
            ? { fill: bg, type: ShadingType.CLEAR, color: "auto" }
            : undefined;

        return new TableCell({
          width: { size: width, type: WidthType.DXA },
          shading: shading as any,
          borders: borders || {
            top: thinBorder,
            bottom: thinBorder,
            left: thinBorder,
            right: thinBorder,
          },
          columnSpan: colspan,
          children: [new Paragraph({
            spacing: { before: 40, after: 40 },
            alignment: opts.alignment,
            children: [new TextRun({ text, bold, color: cellColor, size, font: "Calibri" })],
          })],
        });
      };

      const children: any[] = [];

      // ══ COVER PAGE ══════════════════════════════════════════════════════════
      children.push(
        new Paragraph({ spacing: { before: 2400 }, children: [] }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 100 },
          children: [new TextRun({ text: firmName, bold: true, size: 52, color: NAVY_HEX, font: "Calibri" })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 400 },
          children: [new TextRun({ text: "AUDIT WORKING PAPERS", size: 36, color: ACCENT_HEX, font: "Calibri", bold: true })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 100 },
          children: [new TextRun({ text: "\u2500".repeat(40), color: ACCENT_HEX, size: 20 })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
          children: [new TextRun({ text: entityName, bold: true, size: 44, color: NAVY_HEX, font: "Calibri" })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 100 },
          children: [new TextRun({ text: `${meta?.engagement_type || "Statutory Audit"} | ${financialYear}`, size: 24, color: GRAY_HEX, font: "Calibri" })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 600, after: 100 },
          children: [new TextRun({ text: `Generated: ${now}  |  Total Working Papers: ${workingPapers.length}`, size: 20, color: GRAY_HEX, font: "Calibri", italics: true })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 200 },
          children: [new TextRun({ text: "ISA 200\u2013720 Compliant | STRICTLY CONFIDENTIAL", size: 18, color: GOLD_HEX, font: "Calibri", bold: true })],
        }),
        new Paragraph({ children: [new PageBreak()] }),
      );

      // ══ TABLE OF CONTENTS ═══════════════════════════════════════════════════
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          spacing: { after: 200 },
          children: [new TextRun({ text: "TABLE OF CONTENTS", bold: true, size: 32, color: NAVY_HEX, font: "Calibri" })],
        }),
      );

      const tocRows: any[] = [
        new TableRow({
          tableHeader: true,
          children: [
            makeCell("WP Ref", { bold: true, dark: true, width: Math.floor(TBL_W * 0.12) }),
            makeCell("Title", { bold: true, dark: true, width: Math.floor(TBL_W * 0.42) }),
            makeCell("Section", { bold: true, dark: true, width: Math.floor(TBL_W * 0.28) }),
            makeCell("ISA Reference", { bold: true, dark: true, width: Math.floor(TBL_W * 0.18) }),
          ],
        }),
      ];

      workingPapers.forEach((wp: any, i: number) => {
        const bg = i % 2 === 0 ? BG_ALT_HEX : undefined;
        tocRows.push(new TableRow({
          children: [
            makeCell(wp.ref || "", { bold: true, width: Math.floor(TBL_W * 0.12), bg }),
            makeCell(wp.title || "", { width: Math.floor(TBL_W * 0.42), bg }),
            makeCell(wp.section_label || wp.section || "", { width: Math.floor(TBL_W * 0.28), bg }),
            makeCell((wp.isa_references || []).join(", ").slice(0, 30), { width: Math.floor(TBL_W * 0.18), bg, size: 18 }),
          ],
        }));
      });

      children.push(
        new Table({ width: { size: TBL_W, type: WidthType.DXA }, rows: tocRows }),
        new Paragraph({ children: [new PageBreak()] }),
      );

      // ══ FINANCIAL SUMMARY ═══════════════════════════════════════════════════
      if (fin.revenue) {
        children.push(
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            spacing: { after: 200 },
            children: [new TextRun({ text: "FINANCIAL SUMMARY", bold: true, size: 28, color: NAVY_HEX, font: "Calibri" })],
          }),
        );
        const finItems = [
          ["Revenue", formatPKR(fin.revenue)],
          ["Gross Profit", formatPKR(fin.gross_profit)],
          ["Net Profit / (Loss)", formatPKR(fin.net_profit)],
          ["Total Assets", formatPKR(fin.total_assets)],
          ["Total Liabilities", formatPKR(fin.total_liabilities)],
          ["Equity", formatPKR(fin.equity)],
          ["Cash & Bank", formatPKR(fin.cash_and_bank)],
          ["Overall Materiality (ISA 320)", formatPKR(materiality.overall_materiality)],
          ["Performance Materiality", formatPKR(materiality.performance_materiality)],
        ];
        const half = Math.floor(TBL_W / 2);
        const finTable = new Table({
          width: { size: TBL_W, type: WidthType.DXA },
          rows: [
            new TableRow({ children: [makeCell("Item", { bold: true, dark: true, width: half }), makeCell("Amount (PKR)", { bold: true, dark: true, width: half })] }),
            ...finItems.map(([item, val], i) => new TableRow({
              children: [
                makeCell(item, { bold: true, width: half, bg: i % 2 === 0 ? BG_ALT_HEX : undefined }),
                makeCell(val, { width: half, bg: i % 2 === 0 ? BG_ALT_HEX : undefined }),
              ],
            })),
          ],
        });
        children.push(finTable, new Paragraph({ children: [new PageBreak()] }));
      }

      // ══ EVIDENCE INDEX ═══════════════════════════════════════════════════════
      if (evidenceIndex && evidenceIndex.length > 0) {
        children.push(
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            spacing: { after: 200 },
            children: [new TextRun({ text: "EVIDENCE INDEX", bold: true, size: 28, color: NAVY_HEX, font: "Calibri" })],
          }),
        );
        const evTable = new Table({
          width: { size: TBL_W, type: WidthType.DXA },
          rows: [
            new TableRow({
              children: [
                makeCell("Ref", { bold: true, dark: true, width: Math.floor(TBL_W * 0.10) }),
                makeCell("Description", { bold: true, dark: true, width: Math.floor(TBL_W * 0.42) }),
                makeCell("Type", { bold: true, dark: true, width: Math.floor(TBL_W * 0.16) }),
                makeCell("WPs Referenced", { bold: true, dark: true, width: Math.floor(TBL_W * 0.32) }),
              ],
            }),
            ...evidenceIndex.map((e: any, i: number) => new TableRow({
              children: [
                makeCell(e.ref || "", { bold: true, width: Math.floor(TBL_W * 0.10), bg: i % 2 === 0 ? BG_ALT_HEX : undefined }),
                makeCell(e.description || "", { width: Math.floor(TBL_W * 0.42), bg: i % 2 === 0 ? BG_ALT_HEX : undefined }),
                makeCell(e.type || "", { width: Math.floor(TBL_W * 0.16), bg: i % 2 === 0 ? BG_ALT_HEX : undefined }),
                makeCell((e.wp_refs || []).join(", "), { width: Math.floor(TBL_W * 0.32), bg: i % 2 === 0 ? BG_ALT_HEX : undefined }),
              ],
            })),
          ],
        });
        children.push(evTable, new Paragraph({ children: [new PageBreak()] }));
      }

      // ══ WORKING PAPERS ══════════════════════════════════════════════════════
      for (const wp of workingPapers) {
        // WP Title Banner
        children.push(
          new Paragraph({
            spacing: { before: 100, after: 60 },
            border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: ACCENT_HEX } },
            children: [new TextRun({ text: `${wp.ref} \u2014 ${wp.title}`, bold: true, size: 30, color: NAVY_HEX, font: "Calibri" })],
          }),
        );

        // Meta info line
        const metaParts = [];
        if (wp.section_label || wp.section) metaParts.push(`Section: ${wp.section_label || wp.section}`);
        metaParts.push(`ISA: ${(wp.isa_references || []).join(", ")}`);
        metaParts.push(`Prepared: ${wp.preparer || meta?.preparer || "Audit Senior"}`);
        metaParts.push(`Reviewed: ${wp.reviewer || meta?.reviewer || "Audit Manager"}`);
        metaParts.push(`Date: ${wp.date_prepared || now}`);

        children.push(
          new Paragraph({
            spacing: { after: 200 },
            children: [new TextRun({ text: metaParts.join("  \u2022  "), size: 17, color: GRAY_HEX, font: "Calibri" })],
          }),
        );

        if (wp.assertions && wp.assertions.length > 0) {
          children.push(new Paragraph({
            spacing: { after: 80 },
            children: [
              new TextRun({ text: "Assertions: ", bold: true, size: 19, color: NAVY2_HEX, font: "Calibri" }),
              new TextRun({ text: wp.assertions.join(" | "), italics: true, color: BLUE_HEX, size: 19, font: "Calibri" }),
            ],
          }));
        }

        // OBJECTIVE
        children.push(
          new Paragraph({
            spacing: { before: 200, after: 60 },
            children: [new TextRun({ text: "OBJECTIVE", bold: true, size: 22, color: NAVY_HEX, font: "Calibri" })],
          }),
          new Paragraph({
            spacing: { after: 160 },
            children: [new TextRun({ text: wp.objective || "", size: 20, color: TEXT_HEX, font: "Calibri" })],
          }),
        );

        // SCOPE
        children.push(
          new Paragraph({
            spacing: { before: 100, after: 60 },
            children: [new TextRun({ text: "SCOPE", bold: true, size: 22, color: NAVY_HEX, font: "Calibri" })],
          }),
          new Paragraph({
            spacing: { after: 160 },
            children: [new TextRun({ text: wp.scope || "", size: 20, color: TEXT_HEX, font: "Calibri" })],
          }),
        );

        // PROCEDURES TABLE
        if (wp.procedures && wp.procedures.length > 0) {
          children.push(
            new Paragraph({
              spacing: { before: 100, after: 100 },
              children: [new TextRun({ text: "AUDIT PROCEDURES PERFORMED", bold: true, size: 22, color: NAVY_HEX, font: "Calibri" })],
            }),
          );

          const pColW = [Math.floor(TBL_W * 0.06), Math.floor(TBL_W * 0.32), Math.floor(TBL_W * 0.36), Math.floor(TBL_W * 0.14), Math.floor(TBL_W * 0.12)];
          const procTable = new Table({
            width: { size: TBL_W, type: WidthType.DXA },
            rows: [
              new TableRow({
                tableHeader: true,
                children: [
                  makeCell("Ref", { bold: true, dark: true, width: pColW[0], size: 18 }),
                  makeCell("Procedure", { bold: true, dark: true, width: pColW[1], size: 18 }),
                  makeCell("Finding", { bold: true, dark: true, width: pColW[2], size: 18 }),
                  makeCell("Conclusion", { bold: true, dark: true, width: pColW[3], size: 18 }),
                  makeCell("Evidence Ref", { bold: true, dark: true, width: pColW[4], size: 18 }),
                ],
              }),
              ...wp.procedures.map((p: any, i: number) => {
                const bg = i % 2 === 0 ? BG_ALT_HEX : undefined;
                return new TableRow({
                  children: [
                    makeCell(p.no || String(i + 1), { bold: true, width: pColW[0], bg, size: 18 }),
                    makeCell(p.procedure || "", { width: pColW[1], bg, size: 18 }),
                    makeCell(p.finding || "", { width: pColW[2], bg, size: 18 }),
                    makeCell(p.conclusion || "", { width: pColW[3], bg, size: 18, color: (p.conclusion || "").toLowerCase().includes("satisfactory") ? GREEN_HEX : undefined }),
                    makeCell(p.evidence_ref || "", { width: pColW[4], bg, size: 18 }),
                  ],
                });
              }),
            ],
          });
          children.push(procTable);
        }

        // SUMMARY TABLE
        if (wp.summary_table && wp.summary_table.length > 0) {
          children.push(
            new Paragraph({
              spacing: { before: 200, after: 100 },
              children: [new TextRun({ text: "SUMMARY SCHEDULE", bold: true, size: 22, color: NAVY_HEX, font: "Calibri" })],
            }),
          );

          const sColW = [Math.floor(TBL_W * 0.30), Math.floor(TBL_W * 0.30), Math.floor(TBL_W * 0.40)];
          const sumTable = new Table({
            width: { size: TBL_W, type: WidthType.DXA },
            rows: [
              new TableRow({
                children: [
                  makeCell("Item", { bold: true, dark: true, width: sColW[0] }),
                  makeCell("Amount / Value", { bold: true, dark: true, width: sColW[1] }),
                  makeCell("Comment", { bold: true, dark: true, width: sColW[2] }),
                ],
              }),
              ...wp.summary_table.map((r: any, i: number) => {
                const bg = i % 2 === 0 ? BG_ALT_HEX : undefined;
                return new TableRow({
                  children: [
                    makeCell(r.item || "", { bold: true, width: sColW[0], bg }),
                    makeCell(r.value || "", { width: sColW[1], bg }),
                    makeCell(r.comment || "", { width: sColW[2], bg, size: 18 }),
                  ],
                });
              }),
            ],
          });
          children.push(sumTable);
        }

        // KEY FINDINGS
        if (wp.key_findings && wp.key_findings.length > 0) {
          children.push(
            new Paragraph({
              spacing: { before: 200, after: 100 },
              children: [new TextRun({ text: "KEY FINDINGS", bold: true, size: 22, color: NAVY_HEX, font: "Calibri" })],
            }),
          );
          for (const f of wp.key_findings) {
            children.push(new Paragraph({
              spacing: { after: 60 },
              bullet: { level: 0 },
              children: [new TextRun({ text: f, size: 20, color: TEXT_HEX, font: "Calibri" })],
            }));
          }
        }

        // AUDITOR'S CONCLUSION
        children.push(
          new Paragraph({
            spacing: { before: 200, after: 80 },
            border: {
              top: { style: BorderStyle.SINGLE, size: 2, color: GREEN_HEX },
              bottom: { style: BorderStyle.SINGLE, size: 2, color: GREEN_HEX },
              left: { style: BorderStyle.THICK, size: 6, color: GREEN_HEX },
              right: noBorder,
            },
            shading: { fill: "ECFDF5", type: ShadingType.CLEAR, color: "auto" } as any,
            children: [
              new TextRun({ text: "  AUDITOR'S CONCLUSION", bold: true, size: 20, color: GREEN_HEX, font: "Calibri" }),
            ],
          }),
          new Paragraph({
            spacing: { after: 200 },
            children: [new TextRun({ text: wp.auditor_conclusion || "", size: 20, color: TEXT_HEX, font: "Calibri" })],
          }),
        );

        // SIGN-OFF TABLE
        children.push(
          new Paragraph({
            spacing: { before: 100, after: 80 },
            children: [new TextRun({ text: "SIGN-OFF", bold: true, size: 20, color: NAVY_HEX, font: "Calibri" })],
          }),
        );

        const signW = Math.floor(TBL_W / 4);
        const signTable = new Table({
          width: { size: TBL_W, type: WidthType.DXA },
          rows: [
            new TableRow({
              children: [
                makeCell("Role", { bold: true, dark: true, width: signW }),
                makeCell("Name", { bold: true, dark: true, width: signW }),
                makeCell("Signature", { bold: true, dark: true, width: signW }),
                makeCell("Date", { bold: true, dark: true, width: signW }),
              ],
            }),
            new TableRow({
              children: [
                makeCell("Prepared By", { width: signW, bg: BG_ALT_HEX }),
                makeCell(wp.preparer || meta?.preparer || "Audit Senior", { width: signW, bg: BG_ALT_HEX }),
                makeCell("", { width: signW, bg: BG_ALT_HEX }),
                makeCell(wp.date_prepared || now, { width: signW, bg: BG_ALT_HEX }),
              ],
            }),
            new TableRow({
              children: [
                makeCell("Reviewed By", { width: signW }),
                makeCell(wp.reviewer || meta?.reviewer || "Audit Manager", { width: signW }),
                makeCell("", { width: signW }),
                makeCell("", { width: signW }),
              ],
            }),
            new TableRow({
              children: [
                makeCell("Approved By (Partner)", { width: signW, bg: BG_ALT_HEX }),
                makeCell(wp.partner || meta?.approver || "Engagement Partner", { width: signW, bg: BG_ALT_HEX }),
                makeCell("", { width: signW, bg: BG_ALT_HEX }),
                makeCell("", { width: signW, bg: BG_ALT_HEX }),
              ],
            }),
          ],
        });
        children.push(signTable);

        // Page separator
        children.push(
          new Paragraph({
            spacing: { before: 100 },
            children: [new TextRun({ text: `${firmName} | Strictly Confidential`, size: 14, color: GRAY_HEX, font: "Calibri", italics: true })],
          }),
          new Paragraph({ children: [new PageBreak()] }),
        );
      }

      const document = new Document({
        creator: firmName,
        title: `Audit Working Papers \u2014 ${entityName}`,
        description: `ISA-Compliant Audit Working Papers \u2014 ${financialYear}`,
        styles: {
          default: {
            document: {
              run: { font: "Calibri", size: 20, color: TEXT_HEX },
            },
          },
        },
        sections: [{
          properties: {
            page: {
              size: { width: 11906, height: 16838, orientation: 0 as any },
              margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
            },
          },
          children,
        }],
      });

      const buffer = await Packer.toBuffer(document);
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
    const formatPKR = (n: any) => { const v = Number(n); return `PKR ${(isNaN(v) ? 0 : v).toLocaleString("en-PK")}`; };
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
