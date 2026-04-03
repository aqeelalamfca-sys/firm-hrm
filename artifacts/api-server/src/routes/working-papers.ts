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
    for (const file of files.slice(0, 10)) {
      const content = await extractTextFromFile(file);
      docs.push(`FILE: ${file.originalname}\n${smartChunk(content, 6000)}`);
    }
    const docSummary = docs.join("\n\n---\n\n");

    const userPrompt = `You are a senior Pakistan-qualified chartered accountant and forensic document analyst with OCR expertise. Your task is to extract EVERY piece of auditable data from the uploaded financial documents.

DOCUMENTS TO ANALYZE:
${docSummary}

EXTRACTION RULES:
1. Read EVERY number, date, name, and reference from the documents with precision.
2. For all financial figures: extract as plain numbers in PKR (no commas, no currency symbols).
3. If a document contains a Trial Balance or GL, extract ALL account lines.
4. If figures appear inconsistent, note the inconsistency in "flags".
5. Use null for any field genuinely not present — never guess or fabricate.
6. Extract BOTH current year and prior year figures wherever visible.

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
        { role: "system", content: "You are an expert chartered accountant and forensic document analyst specialising in Pakistan accounting and audit standards. Extract every field from financial documents with forensic precision. Return only valid JSON." },
        { role: "user", content: messageContent },
      ],
      max_tokens: 3000,
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
      `FILE: ${d.filename}\nTYPE: ${d.type}\n${d.isImage ? "[Scanned image — analyzed via vision API]" : smartChunk(d.content, 8000)}`
    ).join("\n\n---\n\n");

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

═══════════════════════════════════════════════════════
ENGAGEMENT CONTEXT
═══════════════════════════════════════════════════════
Entity: ${entityName || "Client Company"}
Financial Year: ${financialYear || "Year ending June 30, 2024"}
Special Instructions from Auditor: ${instructions || "Full ISA-compliant working papers required"}

═══════════════════════════════════════════════════════
SOURCE DOCUMENTS (analyze every line)
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
      max_tokens: 6000,
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

  const prompt = `You are a Big-4-trained Pakistan chartered accountant and systems accountant. Your task is to construct a mathematically perfect, audit-ready General Ledger and Trial Balance that EXACTLY reconciles to the provided financial statements.

══════════════════════════════════════════════════════
ENTITY PROFILE
══════════════════════════════════════════════════════
Entity: ${entityName || "Sample Company (Private) Limited"}
Industry: ${industry || "Manufacturing / Trading"}
Financial Year: ${financialYear || "Year ended June 30, 2024"}
NTN: ${ntn || "N/A"} | STRN: ${strn || "N/A"}
Framework: ${framework || "IFRS"} | Engagement: ${engagementType || "Statutory Audit"}

══════════════════════════════════════════════════════
FINANCIAL STATEMENTS — YOUR GL/TB MUST RECONCILE TO THESE EXACTLY
══════════════════════════════════════════════════════
BALANCE SHEET LINE ITEMS:
${bsSummary || "Total Assets = Total Liabilities + Equity (generate realistic figures)"}

PROFIT & LOSS LINE ITEMS:
${plSummary || "Revenue minus expenses = Net Profit (generate realistic figures)"}

══════════════════════════════════════════════════════
MANDATORY CONSTRUCTION RULES
══════════════════════════════════════════════════════
CHART OF ACCOUNTS — Use ICAP-aligned 4-digit Pakistan COA:
  1000-1999: Assets (1100=Fixed Assets, 1200=Intangibles, 1300=LT Investments, 1400=Debtors, 1500=Inventory, 1600=Advances/Deposits, 1700=Cash & Bank, 1800=Other CA)
  2000-2999: Liabilities (2100=Long-term Loans, 2200=Deferred Tax, 2300=Trade Payables, 2400=Accruals, 2500=WHT Payable, 2600=Sales Tax Payable, 2700=Short-term Borrowings, 2800=Other CL)
  3000-3999: Equity (3100=Share Capital, 3200=General Reserve, 3300=Retained Earnings, 3400=Surplus on Revaluation)
  4000-4999: Revenue (4100=Sales/Revenue, 4200=Other Income, 4300=Gain on Disposal)
  5000-5999: Cost of Sales (5100=Raw Materials, 5200=Direct Labour, 5300=Factory Overhead)
  6000-6999: Operating Expenses (6100=Admin Expenses, 6200=Selling Expenses, 6300=Finance Cost)
  7000-7999: Tax (7100=Current Tax, 7200=Deferred Tax Charge, 7300=Super Tax)

GL ENTRY REQUIREMENTS:
1. Generate 80-100 realistic, dated journal entries spanning the full financial year (monthly spread).
2. Every entry must balance: total debits in entry = total credits in entry.
3. Include ALL these Pakistan-specific transaction types:
   — Monthly sales entries with 17% GST output (STA 1990 Sec 3) and WHT from customers (ITO 2001 Sec 153)
   — Purchases with GST input tax and WHT deducted at source (Sec 153 at 4.5% or Sec 148)
   — Monthly salary disbursements with income tax deduction (Sec 149), EOBI (Rs.370/month/employee), SESSI/PESSI
   — Bank charges, loan interest, KIBOR-linked markup
   — Utility bills (SNGPL/SSGC gas, LESCO/KESCO electricity) with applicable taxes
   — Advance tax payments (Sec 147 quarterly instalments)
   — Depreciation — straight line per IAS 16 with Pakistan tax rates (Sec 22 ITO 2001)
   — Provision for gratuity per IAS 19 / Employment ordinance
   — Import purchases with customs duty (NTN-based) and advance income tax (Sec 148)
   — Year-end closing entries: tax provision, deferred tax adjustment, retained earnings transfer
   — Inter-bank transfers, cheque payments with bank reference numbers
4. Voucher numbers: JV-001 (journal), RV-001 (receipt), PV-001 (payment), BPV-001 (bank payment), BRV-001 (bank receipt)
5. Narrations must reflect real Pakistan business context (supplier names, bank names, PRAL references).

TRIAL BALANCE RECONCILIATION MANDATE:
- Sum of all GL debits per account = debit_total in TB for that account
- Sum of all GL credits per account = credit_total in TB for that account
- balance_dr = debit_total - credit_total (if positive), else 0
- balance_cr = credit_total - debit_total (if positive), else 0
- GRAND TOTAL: Sum(balance_dr) MUST EXACTLY EQUAL Sum(balance_cr)
- TB Asset balances MUST reconcile to Balance Sheet asset totals
- TB Revenue/Expense balances MUST reconcile to P&L totals
- Closing retained earnings in TB = Opening RE + Net Profit

Return ONLY valid JSON (no markdown):
{
  "general_ledger": [
    { "date": "2023-07-01", "voucher_no": "JV-001", "account_code": "3300", "account_name": "Retained Earnings", "narration": "Opening balance b/f per prior year audited accounts", "debit": 0, "credit": 15000000, "ref": "OB-001" }
  ],
  "trial_balance": [
    { "account_code": "1701", "account_name": "Cash at Bank — HBL Current A/c No. 1234-5", "fs_head": "Cash & Bank Balances", "classification": "Current Asset", "debit_total": 45000000, "credit_total": 43200000, "balance_dr": 1800000, "balance_cr": 0, "fs_mapping": "Balance Sheet — Current Assets" }
  ],
  "chart_of_accounts": [
    { "code": "1701", "name": "Cash at Bank — HBL Current A/c No. 1234-5", "group": "Current Assets", "sub_group": "Cash & Bank Balances", "type": "Asset", "normal_balance": "Debit", "fs_line": "Cash and bank balances", "tax_code": "N/A" }
  ],
  "reconciliation_proof": {
    "total_gl_debits": number,
    "total_gl_credits": number,
    "gl_balanced": boolean,
    "total_tb_dr_balances": number,
    "total_tb_cr_balances": number,
    "tb_balanced": boolean,
    "total_assets_per_tb": number,
    "total_liabilities_equity_per_tb": number,
    "accounting_equation_satisfied": boolean,
    "revenue_per_tb": number,
    "expenses_per_tb": number,
    "net_profit_per_tb": number
  }
}`;

  try {
    const completion = await ai.client.chat.completions.create({
      model: ai.model,
      messages: [
        { role: "system", content: "You are a Pakistan-qualified chartered accountant and systems accountant. Generate a mathematically perfect, audit-ready General Ledger and Trial Balance. Every number must reconcile. Return only valid JSON. Ensure total debit balances equal total credit balances in the trial balance." },
        { role: "user", content: prompt }
      ],
      max_tokens: 8000,
      temperature: 0.2,
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
    "A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8",
    "B1", "B2", "B3", "B4", "B5", "B6", "B7", "B8", "B9", "B10", "B11", "B12", "B13", "B14", "B15", "B16",
    "C1", "C2", "C3", "C4", "C5", "C6", "C7",
    "D1", "D2", "D3", "D4", "D5", "D6",
    "E1", "E2", "E3", "E4", "E5", "E6", "E7", "E8", "E9", "E10", "E11", "E12", "E13", "E14", "E15", "E16", "E17", "E18", "E19", "E20", "E21",
    "F1", "F2", "F3", "F4", "F5", "F6",
    "G1", "G2", "G3", "G4", "G5", "G6", "G7",
    "H1", "H2", "H3", "H4", "H5",
    "I1", "I2", "I3", "I4",
    "J1", "J2", "J3", "J4", "J5",
    "K1", "K2", "K3",
    "L1", "L2", "L3", "L4",
    "AI1", "AI2", "AI3", "AI4", "AI5", "AI6", "AI7",
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
    "L1": { title: "QCR Checklist", section: "Inspection / QCR File", isa: "ICAP / ISQM 1", description: "Engagement quality review checklist per ICAP QCR requirements." },
    "L2": { title: "Regulatory Compliance Checklist", section: "Inspection / QCR File", isa: "SECP / Companies Act 2017", description: "SECP regulatory compliance checklist for listed / regulated entities." },
    "L3": { title: "Audit File Index", section: "Inspection / QCR File", isa: "ISA 230", description: "Complete index of audit file with WP references, preparer, and dates." },
    "L4": { title: "Archiving Documentation", section: "Inspection / QCR File", isa: "ISA 230", description: "File archiving procedures, assembly date, 60-day locking, and access controls." },
    "AI1": { title: "Data Extraction Log (OCR Output)", section: "AI Working Paper Controls", isa: "ISA 230, AI Process", description: "Log of all data extracted by AI OCR from uploaded documents, with confidence scores." },
    "AI2": { title: "Assumption Register", section: "AI Working Paper Controls", isa: "AI Process", description: "Register of all AI assumptions made during TB reconstruction, GL estimation, and analysis." },
    "AI3": { title: "TB Reconstruction Logic", section: "AI Working Paper Controls", isa: "AI Process", description: "Detailed logic and methodology used by AI to construct the Trial Balance from FS data." },
    "AI4": { title: "GL Reconstruction Logic", section: "AI Working Paper Controls", isa: "AI Process", description: "Detailed logic and methodology used by AI to reconstruct General Ledger transaction history." },
    "AI5": { title: "Risk Flag Summary", section: "AI Working Paper Controls", isa: "AI Process, ISA 315", description: "Summary of all risk flags identified by AI during data extraction and analysis." },
    "AI6": { title: "Missing Data Report", section: "AI Working Paper Controls", isa: "AI Process", description: "Report of data items that could not be extracted and AI's handling approach." },
    "AI7": { title: "AI Confidence Score Sheet", section: "AI Working Paper Controls", isa: "AI Process", description: "Confidence scores for all AI-generated values: Extracted / Derived / Estimated categories." },
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

  const sequentialSteps: { label: string; filter: (p: string) => boolean }[] = [
    { label: "Step 1 — Pre-Engagement & Acceptance", filter: (p: string) => /^A\d/.test(p) },
    { label: "Step 2 — Planning & Strategy", filter: (p: string) => /^B\d/.test(p) },
    { label: "Step 3 — Data & Financial Statements", filter: (p: string) => /^C\d/.test(p) },
    { label: "Step 4 — Internal Controls & Risk Assessment", filter: (p: string) => /^D\d/.test(p) },
    { label: "Step 5 — Substantive Testing (Cash, Receivables, Inventory)", filter: (p: string) => /^E[1-5]$/.test(p) },
    { label: "Step 6 — Substantive Testing (Revenue, Expenses, Equity)", filter: (p: string) => /^E([6-9]|1\d|2\d)$/.test(p) },
    { label: "Step 7 — Special Areas", filter: (p: string) => /^F\d/.test(p) },
    { label: "Step 8 — Completion & Review", filter: (p: string) => /^G\d/.test(p) },
    { label: "Step 9 — Reporting", filter: (p: string) => /^H\d/.test(p) },
    { label: "Step 10 — Quality Control & EQCR", filter: (p: string) => /^I\d/.test(p) },
    { label: "Step 11 — Tax & Regulatory Compliance", filter: (p: string) => /^J\d/.test(p) },
    { label: "Step 12 — Final Output & Archive", filter: (p: string) => /^K\d/.test(p) },
    { label: "Step 13 — Inspection / QCR File", filter: (p: string) => /^L\d/.test(p) },
    { label: "Step 14 — AI Working Paper Controls", filter: (p: string) => /^AI\d/.test(p) },
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
10. Materiality amounts must be the EXACT amounts from the context — ${materiality.overall_materiality ? `OM = PKR ${(materiality.overall_materiality || 0).toLocaleString("en-PK")}` : "compute from financials"}.
11. RECONCILIATION CHECK: Verify all figures tie back to the Trial Balance and General Ledger. Any discrepancy must be noted and resolved within this step.
12. ISA COMPLIANCE GATE: Each paper must explicitly state which ISA requirements it satisfies and confirm compliance before the step is marked complete.
13. CROSS-REFERENCING MANDATE: Reference previously completed working papers by their exact WP ref codes. Every substantive paper must link back to the risk assessment (D-series) and planning (B-series) papers.

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
      ["Gross Margin %", ratios.gross_margin_pct != null ? `${parseFloat(ratios.gross_margin_pct).toFixed(1)}%` : "N/A", "", "", ""],
      ["Net Margin %", ratios.net_margin_pct != null ? `${parseFloat(ratios.net_margin_pct).toFixed(1)}%` : "N/A", "", "", ""],
      ["Current Ratio", ratios.current_ratio != null ? parseFloat(ratios.current_ratio).toFixed(2) : "N/A", "", "", ""],
      ["Debt-to-Equity", ratios.debt_to_equity != null ? parseFloat(ratios.debt_to_equity).toFixed(2) : "N/A", "", "", ""],
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

    const makeCell = (text: string, bold = false, dark = false, width = 2500, bg?: IShadingAttributesProperties) =>
      new TableCell({
        width: { size: width, type: WidthType.DXA },
        shading: dark ? cellShading : (bg ?? undefined),
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
              makeCell(wp.ref, false, false, 1500, i % 2 === 0 ? lightShading : undefined),
              makeCell(wp.title, false, false, 4000, i % 2 === 0 ? lightShading : undefined),
              makeCell(wp.section_label || wp.section, false, false, 2000, i % 2 === 0 ? lightShading : undefined),
              makeCell((wp.isa_references || []).join(", ").slice(0, 25), false, false, 1500, i % 2 === 0 ? lightShading : undefined),
            ],
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
            children: [
              makeCell(item, true, false, 4500, i % 2 === 0 ? lightShading : undefined),
              makeCell(val, false, false, 4500, i % 2 === 0 ? lightShading : undefined),
            ],
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
              makeCell(e.ref, true, false, 1000, i % 2 === 0 ? lightShading : undefined),
              makeCell(e.description, false, false, 4000, i % 2 === 0 ? lightShading : undefined),
              makeCell(e.type, false, false, 1500, i % 2 === 0 ? lightShading : undefined),
              makeCell((e.wp_refs || []).join(", "), false, false, 2500, i % 2 === 0 ? lightShading : undefined),
            ],
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
                makeCell(p.no || String(i + 1), false, false, 600, i % 2 === 0 ? lightShading : undefined),
                makeCell(p.procedure, false, false, 3200, i % 2 === 0 ? lightShading : undefined),
                makeCell(p.finding, false, false, 2800, i % 2 === 0 ? lightShading : undefined),
                makeCell(p.conclusion, false, false, 1400, i % 2 === 0 ? lightShading : undefined),
                makeCell(p.evidence_ref || "", false, false, 1000, i % 2 === 0 ? lightShading : undefined),
              ],
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
