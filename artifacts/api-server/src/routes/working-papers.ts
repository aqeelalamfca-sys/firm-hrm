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

    const systemPrompt = `You are AuditWise, a professional audit AI assistant specializing in Pakistan audit standards.
You analyze financial documents and generate ISA-compliant working papers for audit engagements.

Standards compliance: ISA 200–720, ISQM 1 & 2, IFRS/IAS/IFRS for SMEs, ICAP Code of Ethics, Companies Act 2017 (Pakistan), SECP Regulations, FBR Laws.

When data is missing, generate realistic, plausible estimated data clearly tagged as "Auditor Assumption / Estimated".`;

    const userPrompt = `Analyze the following documents for a ${engagementType || "statutory audit"} engagement.

ENTITY: ${entityName || "Client Company"}
FINANCIAL YEAR: ${financialYear || "Year ending June 30, 2024"}
AUDITOR INSTRUCTIONS: ${instructions || "Generate complete audit working papers"}

UPLOADED DOCUMENTS:
${docSummary}

Extract and return a structured JSON object with this exact format:
{
  "entity": {
    "name": string,
    "type": string,
    "industry": string,
    "financial_year": string,
    "reporting_framework": string
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
    "currency": "PKR"
  },
  "materiality": {
    "overall_materiality": number,
    "performance_materiality": number,
    "basis": string,
    "percentage_used": number,
    "rationale": string
  },
  "risk_assessment": {
    "overall_risk": "Low" | "Medium" | "High",
    "inherent_risks": [{ "area": string, "risk": string, "level": string, "isa_ref": string }],
    "control_risks": [{ "area": string, "risk": string, "level": string }],
    "fraud_indicators": [{ "indicator": string, "assessment": string }]
  },
  "key_audit_areas": [
    { "area": string, "assertion": string, "risk_level": string, "procedures": [string] }
  ],
  "documents_classified": [
    { "filename": string, "classified_as": string, "data_extracted": string }
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

// ─── POST /api/working-papers/generate ────────────────────────────────────
router.post("/generate", async (req: Request, res: Response) => {
  const { analysis, selectedPapers, entityName, financialYear, engagementType, firmName } = req.body;

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
    "PP-100", "PP-101", "PP-102", "PP-103",
    "DI-100", "DI-101",
    "IR-100", "IR-101", "IR-102",
    "OB-100", "OB-101",
    "PL-100",
    "EX-100", "EX-101", "EX-102", "EX-103", "EX-104", "EX-105", "EX-106",
    "FH-100",
    "EV-100",
    "FN-100", "FN-101",
    "DL-100",
    "QR-100",
    "IN-100",
  ];
  const papersToGenerate = selectedPapers?.length > 0 ? selectedPapers : allPapers;

  const wpDefinitions: Record<string, { title: string; section: string; isa: string; description: string }> = {
    "PP-100": { title: "Engagement Letter & Terms", section: "Pre-Planning", isa: "ISA 210", description: "Documents the terms of the audit engagement including scope, responsibilities, and fee arrangements." },
    "PP-101": { title: "Independence & Ethics Compliance", section: "Pre-Planning", isa: "ISA 200, ICAP Code of Ethics", description: "Confirms auditor independence and compliance with ethical requirements." },
    "PP-102": { title: "Materiality Determination", section: "Pre-Planning", isa: "ISA 320", description: "Calculation and documentation of overall and performance materiality." },
    "PP-103": { title: "Client Acceptance & Continuance", section: "Pre-Planning", isa: "ISA 220, ISQM 1", description: "Assessment of client acceptance/continuance including integrity and risk evaluation." },
    "DI-100": { title: "Understanding the Entity", section: "Discussion & Inquiry", isa: "ISA 315", description: "Understanding the entity, its environment, and internal controls." },
    "DI-101": { title: "Related Party Identification", section: "Discussion & Inquiry", isa: "ISA 550", description: "Identification and assessment of related party transactions and balances." },
    "IR-100": { title: "Risk Assessment Summary", section: "Risk Assessment", isa: "ISA 315, ISA 330", description: "Overall risk assessment and planned responses." },
    "IR-101": { title: "Fraud Risk Assessment", section: "Risk Assessment", isa: "ISA 240", description: "Assessment of fraud risks and indicators." },
    "IR-102": { title: "Internal Control Evaluation", section: "Risk Assessment", isa: "ISA 315", description: "Evaluation of design and implementation of key internal controls." },
    "OB-100": { title: "Opening Balances Verification", section: "Opening Balances", isa: "ISA 510", description: "Procedures on opening balances and comparative figures." },
    "OB-101": { title: "Prior Year Audit File Review", section: "Opening Balances", isa: "ISA 510", description: "Review of prior year working papers and audit adjustments." },
    "PL-100": { title: "Audit Plan & Strategy", section: "Planning", isa: "ISA 300", description: "Overall audit strategy and detailed audit plan." },
    "EX-100": { title: "Revenue & Receivables", section: "Execution", isa: "ISA 315, ISA 500", description: "Substantive procedures on revenue recognition and trade receivables." },
    "EX-101": { title: "Purchases & Payables", section: "Execution", isa: "ISA 315, ISA 500", description: "Substantive procedures on purchases, expenses, and trade payables." },
    "EX-102": { title: "Cash & Bank Balances", section: "Execution", isa: "ISA 505, ISA 500", description: "Cash and bank confirmation, reconciliation, and cut-off testing." },
    "EX-103": { title: "Inventory & Cost of Sales", section: "Execution", isa: "ISA 501, ISA 500", description: "Inventory observation, valuation, and cost of sales analysis." },
    "EX-104": { title: "Fixed Assets & Depreciation", section: "Execution", isa: "IAS 16, ISA 500", description: "Verification of fixed assets, additions, disposals, and depreciation." },
    "EX-105": { title: "Payroll & Employee Costs", section: "Execution", isa: "ISA 500, IAS 19", description: "Payroll testing, employee benefits, and withholding tax compliance." },
    "EX-106": { title: "Taxation & Compliance", section: "Execution", isa: "ISA 500, ITO 2001", description: "Income tax, sales tax, and regulatory compliance procedures." },
    "FH-100": { title: "Analytical Procedures", section: "Fieldwork", isa: "ISA 520", description: "Final analytical review of financial statements." },
    "EV-100": { title: "Audit Evidence Summary", section: "Evidence", isa: "ISA 500, ISA 230", description: "Summary of audit evidence obtained and its sufficiency and appropriateness." },
    "FN-100": { title: "Financial Statement Review", section: "Finalization", isa: "ISA 700, ISA 720", description: "Review of financial statements for fair presentation and disclosures." },
    "FN-101": { title: "Subsequent Events Review", section: "Finalization", isa: "ISA 560", description: "Review of events after the reporting period." },
    "DL-100": { title: "Management Letter Points", section: "Deliverables", isa: "ISA 265, ISA 260", description: "Communication of significant matters to management and those charged with governance." },
    "QR-100": { title: "Quality Review Checklist", section: "Quality Review", isa: "ISQM 1, ISQM 2", description: "Engagement quality review and sign-off." },
    "IN-100": { title: "Audit Opinion Draft", section: "Issuance", isa: "ISA 700, ISA 705, ISA 706", description: "Draft audit opinion and basis for opinion paragraph." },
  };

  try {
    const papersPrompt = `You are AuditWise, a professional audit AI. Generate detailed ISA-compliant audit working papers.

ENTITY: ${entityName || entity.name || "Client Company"}
FINANCIAL YEAR: ${financialYear || entity.financial_year || "Year ended June 30, 2024"}
ENGAGEMENT TYPE: ${engagementType || "Statutory Audit"}
FIRM: ${firmName || "ANA & Co. Chartered Accountants"}

FINANCIAL DATA:
- Revenue: ${formatPKR(fin.revenue)}
- Gross Profit: ${formatPKR(fin.gross_profit)}
- Net Profit: ${formatPKR(fin.net_profit)}
- Total Assets: ${formatPKR(fin.total_assets)}
- Total Liabilities: ${formatPKR(fin.total_liabilities)}
- Equity: ${formatPKR(fin.equity)}
- Cash & Bank: ${formatPKR(fin.cash_and_bank)}
- Trade Receivables: ${formatPKR(fin.trade_receivables)}
- Trade Payables: ${formatPKR(fin.trade_payables)}
- Inventory: ${formatPKR(fin.inventory)}
- Fixed Assets: ${formatPKR(fin.fixed_assets)}

MATERIALITY:
- Overall Materiality: ${formatPKR(materiality.overall_materiality)} (${materiality.basis || "Net Profit"} × ${materiality.percentage_used || 5}%)
- Performance Materiality: ${formatPKR(materiality.performance_materiality)}
- Rationale: ${materiality.rationale || "Industry standard"}

OVERALL RISK: ${risks.overall_risk || "Medium"}

Generate the following working papers: ${papersToGenerate.join(", ")}

For EACH working paper, return this JSON structure:
{
  "ref": "PP-100",
  "title": string,
  "section": string,
  "isa_references": [string],
  "objective": string,
  "scope": string,
  "procedures": [{ "no": string, "procedure": string, "finding": string, "conclusion": string }],
  "summary_table": [{ "item": string, "value": string, "comment": string }] | null,
  "key_findings": [string],
  "auditor_conclusion": string,
  "risks_identified": [string],
  "recommendations": [string],
  "preparer": "Audit Senior",
  "reviewer": "Audit Manager",
  "partner": "Partner",
  "date_prepared": "${new Date().toLocaleDateString('en-PK')}",
  "status": "Draft"
}

Return a JSON object: { "working_papers": [ ... array of all working papers ... ] }
Use professional audit language. Include realistic numbers based on financial data. Reference Pakistan tax laws (ITO 2001, STA 1990) where applicable.`;

    const genResponse = await ai.client.chat.completions.create({
      model: ai.model,
      messages: [
        { role: "system", content: "You are AuditWise, a professional Pakistan audit AI. Return only valid JSON." },
        { role: "user", content: papersPrompt },
      ],
      max_tokens: 8000,
      temperature: 0.2,
      response_format: { type: "json_object" },
    });

    const raw = genResponse.choices[0]?.message?.content || "{}";
    let papersData: any;
    try {
      papersData = JSON.parse(raw);
    } catch {
      papersData = { working_papers: [] };
    }

    const workingPapers = papersData.working_papers || [];

    const enrichedPapers = workingPapers.map((wp: any) => {
      const def = wpDefinitions[wp.ref] || {};
      return { ...wp, section_label: def.section || wp.section, isa_references: wp.isa_references || [def.isa || "ISA 500"] };
    });

    return res.json({
      success: true,
      working_papers: enrichedPapers,
      meta: {
        entity: entityName || entity.name,
        financial_year: financialYear || entity.financial_year,
        engagement_type: engagementType,
        firm_name: firmName,
        generated_at: new Date().toISOString(),
        total_papers: enrichedPapers.length,
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
      doc.text(`${meta?.firm_name || "ANA & Co. Chartered Accountants"} | Confidential | Generated by AuditWise`, 50, y, { align: "left" });
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
    doc.text("Generated by AuditWise AI Engine | ISA 200–720 Compliant", 50, infoY + 190, { align: "center" });
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

export default router;
