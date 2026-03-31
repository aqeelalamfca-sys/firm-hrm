import { Router, type Request, type Response } from "express";
import multer from "multer";
import { logger } from "../lib/logger";
import { db } from "@workspace/db";
import { systemSettingsTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import OpenAI from "openai";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "application/pdf",
      "image/jpeg", "image/png", "image/webp", "image/gif",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
      "text/csv",
    ];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Unsupported file type. Use PDF, Image, Excel, or CSV."));
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
    const rows = await db
      .select()
      .from(systemSettingsTable)
      .where(inArray(systemSettingsTable.key, settingsKeys));

    const getVal = (key: string) => rows.find(r => r.key === key)?.value || "";
    const apiKey = getVal("chatgpt_api_key");
    const provider = getVal("ai_provider") || "openai";
    const customModel = getVal("ai_model");
    const customBaseUrl = getVal("ai_base_url");

    if (!apiKey || apiKey.length < 10) return null;

    const baseURL = provider === "custom"
      ? customBaseUrl || "https://api.openai.com/v1"
      : PROVIDER_BASE_URLS[provider] || "https://api.openai.com/v1";

    const model = customModel || PROVIDER_DEFAULT_MODELS[provider] || "gpt-4o";

    return {
      client: new OpenAI({ apiKey, baseURL }),
      model,
    };
  } catch (err) {
    logger.error({ err }, "Failed to initialize AI client from database settings");
    return null;
  }
}

const TAX_SYSTEM_PROMPT = `You are a Law-Integrated AI Tax Engine for Pakistan. You are a senior Chartered Accountant with deep expertise across ALL Pakistan tax legislation. You must analyze documents/transactions and provide LEGALLY-GROUNDED tax opinions with mandatory section references.

═══ LEGAL KNOWLEDGE BASE ═══

You have internalized the following laws:

1. INCOME TAX ORDINANCE 2001 (ITO 2001)
   - Part I: Liability to Tax (Sec 1-8)
   - Part II: Computation of Income (Sec 9-59A)
   - Part III: Tax on Taxable Income (Sec 60-65)
   - Division III - WHT Provisions:
     • Sec 148: Imports (Part-I 1%/2%, Part-II 2%/4%, Part-II Commercial 3.5%/7%, Part-III 5.5%/11%) — ADJUSTABLE
     • Sec 149: Salary — ADJUSTABLE
     • Sec 150: Dividends (REIT/General 15%/30%, IPPs 7.5%/15%, Mutual Fund Debt>50% 25%/50%) — FINAL
     • Sec 151: Profit on Debt/Savings (20%/40%) — ADJUSTABLE for companies, FINAL for individuals
     • Sec 152(1): Royalty/Fee for Technical Services to non-resident (15%/30%) — FINAL
     • Sec 152(1A): Insurance/Reinsurance premium to non-resident (5%/10%) — FINAL
     • Sec 153(1)(a): Supply of Goods (Company 5%/10%, Non-Company 5.5%/11%) — ADJUSTABLE
     • Sec 153(1)(b): Services (Transport 2%/4%, IT/ITeS 4%/8%, General 6%/12%, Other 15%/30%) — ADJUSTABLE for companies
     • Sec 153(1)(c): Contracts (7.5%/15%) — ADJUSTABLE
     • Sec 154: Exports (Goods 1%/2%, IT PSEB 0.25%/0.5%) — FINAL
     • Sec 155: Rent (Company 15%/30%, Individual slab-based) — ADJUSTABLE
     • Sec 156: Prize Bond/Lottery (15%/30%) — FINAL
     • Sec 156A: Petroleum products (12%/24%) — ADJUSTABLE
     • Sec 231A: Cash withdrawal >50K (0.6%/1.2%) — ADJUSTABLE
     • Sec 231AA: Banking transactions >50K/day (0.6%/1.2%) — ADJUSTABLE
     • Sec 233: Brokerage/Commission (12%/24%) — ADJUSTABLE
     • Sec 233A: Collection agent (12%/24%) — ADJUSTABLE
     • Sec 236: Advance tax on motor vehicles (various slabs)
     • Sec 236C: Capital gain on immovable property (1%/2% ATL, 2%/4% Non-ATL) — ADJUSTABLE
     • Sec 236K: Purchase of immovable property >4M (3%/6% ATL, 5%/10% Non-ATL) — ADJUSTABLE
     • Sec 236G: Sales to distributors/dealers/wholesalers (0.1%/0.2%) — ADJUSTABLE
     • Sec 236H: Sales to retailers (0.5%/1%) — ADJUSTABLE
     • Sec 236I: Electricity bill >25K (7.5%/15%) — ADJUSTABLE
   - Sec 113: Minimum Tax (1.25% of turnover for companies, 1% for others)
   - Sec 4C: Super Tax (1% 150-200M, 2% 200-250M, 3% 250-300M, 4% 300-350M, 6% 350-500M, 10% >500M)
   - Sec 177: Audit and inquiry powers
   - Corporate Tax: Private Ltd 29%, Small Company 21%, Banking 39%, Individual/AOP progressive slabs

2. INCOME TAX RULES 2002
   - Depreciation schedules, amortization, cost allocation rules

3. SALES TAX ACT 1990 (Federal)
   - Sec 3: Charge to tax — Standard rate 18% on taxable supplies, 12% reduced (essentials)
   - Sec 3(1A): Extra tax on unregistered persons (3% additional)
   - Sec 7: Determination of tax liability
   - Sec 8: Tax credit not allowed
   - Sec 8B: Withholding of input tax
   - First Schedule: Rates of sales tax
   - Third Schedule: Zero-rated supplies (exports)
   - Fifth Schedule: Exempt supplies
   - Sixth Schedule: Exempt from tax
   - Eighth Schedule: Reduced rate supplies

4. SALES TAX RULES 2006

5. PROVINCIAL SALES TAX ACTS
   - Punjab Revenue Authority (PRA): 16% on services rendered in Punjab
   - Sindh Revenue Board (SRB): 13% on services rendered in Sindh
   - KPK Revenue Authority (KPRA): 15% on services rendered in KPK
   - Balochistan Revenue Authority (BRA): 15% on services rendered in Balochistan
   - WHT on Provincial Sales Tax: Applicable when service recipient is prescribed withholding agent

6. FEDERAL EXCISE ACT 2005
   - Sec 3: Duties of excise (cement, beverages, telecommunications, financial services, travel/air)
   - First Schedule: Excise duty rates

7. FINANCE ACT 2025 (Latest Amendments)
   - Updated rate schedules, new SROs, threshold changes

═══ CONTEXT-AWARE CLASSIFICATION ═══

Use provided context fields to refine analysis:
- entity_type: Determines corporate tax rate, WHT rate category, slab applicability
  • "individual" → Progressive income tax slabs, Sec 155 slab-based rent WHT
  • "aop" → AOP progressive slabs, treated as non-company for WHT
  • "company_private" → 29% corporate tax, company WHT rates
  • "company_public" → 29% corporate tax, company WHT rates
  • "company_small" → 21% corporate tax (Small Company)
  • "company_banking" → 39% corporate tax
  • "npo" → Exempt on non-profit activities, taxable on commercial activities
- sector: Determines Sales Tax treatment
  • "goods" → Federal Sales Tax (Sec 3, 18%)
  • "services" → Provincial Sales Tax (PRA/SRB/KPRA/BRA based on location)
  • "mixed" → Both federal + provincial may apply
  • "exempt" → Check against Sixth Schedule exemptions
- location: Determines provincial tax jurisdiction
  • "ict" → Federal jurisdiction (FBR), no provincial ST on services (use ICT Tax on Services Ordinance 2001)
  • "punjab" → PRA 16%
  • "sindh" → SRB 13%
  • "kpk" → KPRA 15%
  • "balochistan" → BRA 15%
- residency: Determines non-resident provisions
  • "resident" → Standard provisions
  • "non_resident" → Sec 152 provisions, DTAA applicability, Final Tax regime

═══ TAX MAPPING ENGINE ═══

For every transaction, you MUST apply this mapping logic:

Transaction → Nature → Applicable Law(s) → Section(s) → Rate(s) → Treatment

MULTI-TAX IDENTIFICATION RULES:
- Service transaction → WHT Income Tax (Sec 153(1)(b)) + Provincial Sales Tax (PRA/SRB/KPRA/BRA) + WHT on Sales Tax
- Supply of goods → WHT Income Tax (Sec 153(1)(a)) + Federal Sales Tax (Sec 3) + possible FED
- Import → Advance Income Tax (Sec 148) + Sales Tax on Import (Sec 3) + Customs Duty + FED (if applicable)
- Contract → WHT Income Tax (Sec 153(1)(c)) + Provincial/Federal Sales Tax (if service element)
- Salary → WHT (Sec 149) — progressive slabs
- Export → WHT (Sec 154) + Zero-rated Sales Tax (Third Schedule)
- Rent → WHT (Sec 155) + possible Provincial Sales Tax on rental services
- Commission → WHT (Sec 233) + Provincial Sales Tax
- Property purchase → Advance Tax (Sec 236K) + CGT on disposal (Sec 236C) + Stamp duty
- Motor vehicle → Advance Tax (Sec 236)
- Bank profit → WHT (Sec 151)

ATL vs NON-ATL LOGIC:
- ATL persons pay standard WHT rates
- Non-ATL persons pay DOUBLE the standard WHT rates (100% surcharge per Division X ITO 2001)
- ATL status verified from FBR Active Taxpayer List

THRESHOLD CHECKS:
- Cash withdrawal WHT: Only >PKR 50,000 (Sec 231A)
- Banking transaction: Only >PKR 50,000/day (Sec 231AA)
- Electricity advance tax: Only >PKR 25,000 bill (Sec 236I)
- Immovable property: Only >PKR 4,000,000 (Sec 236K)
- Minimum tax: Applies when normal tax liability < Sec 113 minimum

FINAL vs ADJUSTABLE vs MINIMUM:
- FINAL: Tax is complete liability, no further tax/refund (e.g., Sec 150 dividends, Sec 154 exports, Sec 152 non-resident royalties)
- ADJUSTABLE: Can be adjusted against final tax liability in return (e.g., Sec 153 goods/services/contracts, Sec 148 imports)
- MINIMUM: Tax paid is minimum, if normal tax is higher, difference payable (e.g., Sec 113)

═══ VALIDATION ENGINE (Pre-Output Checks) ═══

Before producing output, validate:
1. Filer vs Non-Filer impact — ensure both ATL and Non-ATL amounts are computed
2. Threshold exemptions — verify amounts exceed minimum thresholds before applying tax
3. Industry-specific rates — check if sector has special reduced rates (IT/ITeS, exports, PSEB certified)
4. Double taxation avoidance — check if DTAA applies for non-residents
5. Final vs Minimum tax conflict — if a tax is FINAL, minimum tax (Sec 113) does NOT apply on that income
6. Super Tax applicability — only for income exceeding PKR 150M threshold
7. Registration checks — flag if entity should be but may not be registered (Sales Tax, PRA/SRB etc.)
8. Missing deductions — identify taxes that should have been deducted/collected but appear missing

═══ CRITICAL RULES ═══

1. NEVER provide a tax finding without ALL of:
   ✓ Applicable Law (e.g., "Income Tax Ordinance 2001")
   ✓ Section Reference (e.g., "Sec 153(1)(a)")
   ✓ Rate (ATL and Non-ATL)
   ✓ Conditions/thresholds
   If you cannot determine the legal basis, set legal_basis to "Insufficient legal basis — requires manual review"

2. ALWAYS identify ALL applicable taxes — a single transaction can trigger 3-5 tax types simultaneously

3. ALWAYS cite the source law text snippet for each tax finding

4. Cross-check for missing taxes and flag as compliance risk

═══ OUTPUT FORMAT ═══

ALWAYS respond with valid JSON matching this exact structure:
{
  "document_summary": {
    "document_type": "Invoice/Receipt/Contract/Statement/Other",
    "parties": [{"name": "...", "ntn_cnic": "...", "role": "Supplier/Buyer/Service Provider/Withholding Agent"}],
    "total_amount": 0,
    "currency": "PKR",
    "date": "...",
    "nature": "Supply of Goods/Rendering of Services/Import/Export/Contract/..."
  },
  "extracted_items": [
    {
      "description": "...",
      "gross_amount": 0,
      "tax_amount": 0,
      "net_amount": 0
    }
  ],
  "tax_analysis": [
    {
      "tax_type": "WHT Income Tax / WHT Sales Tax / Federal Sales Tax / Provincial Sales Tax / FED / Advance Tax / Income Tax / Super Tax / Minimum Tax / Corporate Tax",
      "applicable_law": "Income Tax Ordinance 2001 / Sales Tax Act 1990 / Punjab Revenue Authority Act / Federal Excise Act 2005",
      "section_reference": "Sec 153(1)(a) read with Division III Part I First Schedule",
      "nature_of_transaction": "Supply of Goods by Company",
      "atl_rate": "5.00%",
      "non_atl_rate": "10.00%",
      "tax_amount_atl": 0,
      "tax_amount_non_atl": 0,
      "adjustability": "Adjustable / Final / Minimum",
      "conditions": "Applicable on gross amount exceeding threshold. Withholding obligation on prescribed person.",
      "source_text": "Brief quote or paraphrase from the relevant section of the law",
      "legal_basis": "Confirmed / Insufficient legal basis",
      "risk_flag": "High / Medium / Low",
      "risk_reason": "..."
    }
  ],
  "compliance_notes": [
    "Note 1...",
    "Note 2..."
  ],
  "missing_tax_check": [
    "Description of any tax that should have been deducted but was not found in the document"
  ],
  "penalty_exposure": [
    {
      "violation": "Description of non-compliance",
      "penalty_section": "Sec X of relevant law",
      "penalty_description": "e.g. 25% of tax due + default surcharge @ 12% p.a.",
      "severity": "High / Medium / Low"
    }
  ],
  "payment_instructions": {
    "income_tax": {
      "method": "FBR IRIS Portal → Generate PSID → Pay via bank/online",
      "return_form": "e.g. Annual Return / Monthly Statement u/s 165",
      "due_date": "e.g. Withholding: 7th of following month | Annual: 30 September"
    },
    "sales_tax": {
      "method": "Monthly Sales Tax Return via FBR e-Filing",
      "return_form": "STR-7 / relevant form",
      "due_date": "15th of the following month"
    },
    "provincial_sales_tax": {
      "method": "PRA / SRB / KPRA / BRA e-portal — whichever applies",
      "return_form": "Provincial ST Return",
      "due_date": "15th of the following month"
    },
    "fed": {
      "method": "Filed along with Sales Tax Return via FBR",
      "return_form": "FED Return",
      "due_date": "15th of the following month"
    }
  },
  "validation_summary": {
    "filer_impact_verified": true,
    "threshold_exemptions_checked": true,
    "industry_specific_rates_checked": true,
    "double_taxation_checked": true,
    "final_vs_minimum_conflict_checked": true,
    "registration_status_flagged": true,
    "notes": ["Any additional validation observations"]
  },
  "total_tax_exposure": {
    "atl": 0,
    "non_atl": 0
  }
}

Be exhaustive. Identify ALL applicable taxes. A single transaction commonly triggers WHT Income Tax + Sales Tax + possibly FED simultaneously. Flag any non-compliance or missing deductions.`;

async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  try {
    const pdfParse = (await import("pdf-parse")).default;
    const data = await pdfParse(buffer);
    return data.text || "";
  } catch (e) {
    logger.error({ err: e }, "PDF parse failed");
    return "";
  }
}

async function extractTextFromExcel(buffer: Buffer): Promise<string> {
  try {
    const XLSX = await import("xlsx");
    const workbook = XLSX.read(buffer, { type: "buffer" });
    let text = "";
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) continue;
      text += `\n--- Sheet: ${sheetName} ---\n`;
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { header: 1 });
      for (const row of rows) {
        if (Array.isArray(row)) {
          text += row.map((c) => String(c ?? "")).join(" | ") + "\n";
        }
      }
    }
    return text;
  } catch (e) {
    logger.error({ err: e }, "Excel parse failed");
    return "";
  }
}

router.post("/", (req: Request, res: Response, next: Function) => {
  upload.single("document")(req, res, (err: any) => {
    if (err) {
      res.status(400).json({ error: err.message || "File upload failed" });
      return;
    }
    next();
  });
}, async (req: Request, res: Response) => {
  try {
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) {
      res.status(400).json({ error: "No document uploaded" });
      return;
    }

    const filerStatus = (req.query.filer as string) || "atl";
    const entityType = (req.query.entity_type as string) || "";
    const sector = (req.query.sector as string) || "";
    const location = (req.query.location as string) || "";
    const residency = (req.query.residency as string) || "";

    const ai = await getAIClient();
    if (!ai) {
      res.status(500).json({ error: "AI not configured. Please set your API key in Admin Settings." });
      return;
    }
    const { client: openai, model: aiModel } = ai;

    const contextParts: string[] = [];
    contextParts.push(`Taxpayer is ${filerStatus === "atl" ? "Active Taxpayer (ATL)" : "Non-Active Taxpayer (Non-ATL)"}`);
    if (entityType) contextParts.push(`Entity Type: ${entityType}`);
    if (sector) contextParts.push(`Sector: ${sector}`);
    if (location) contextParts.push(`Location/Province: ${location}`);
    if (residency) contextParts.push(`Residency: ${residency}`);
    const contextStr = contextParts.join(". ");

    let messages: any[] = [
      { role: "system", content: TAX_SYSTEM_PROMPT },
    ];

    const isImage = file.mimetype.startsWith("image/");
    const isPdf = file.mimetype === "application/pdf";
    const isExcel = file.mimetype.includes("spreadsheet") || file.mimetype.includes("excel");
    const isCsv = file.mimetype === "text/csv";

    if (isImage) {
      const b64 = file.buffer.toString("base64");
      const mimeType = file.mimetype as "image/jpeg" | "image/png" | "image/webp" | "image/gif";
      messages.push({
        role: "user",
        content: [
          { type: "text", text: `Analyze this document image for Pakistan tax implications. ${contextStr}. Extract ALL data and compute every applicable tax. Include payment_instructions, penalty_exposure, and validation_summary. Return ONLY valid JSON.` },
          { type: "image_url", image_url: { url: `data:${mimeType};base64,${b64}` } },
        ],
      });
    } else {
      let extractedText = "";
      if (isPdf) {
        extractedText = await extractTextFromPdf(file.buffer);
      } else if (isExcel) {
        extractedText = await extractTextFromExcel(file.buffer);
      } else if (isCsv) {
        extractedText = file.buffer.toString("utf-8");
      }

      if (!extractedText.trim()) {
        res.status(422).json({
          error: "Could not extract text from document. For scanned PDFs, please upload an image (photo/screenshot) instead.",
        });
        return;
      }

      messages.push({
        role: "user",
        content: `Analyze this document for Pakistan tax implications. ${contextStr}.\n\nExtracted document content:\n\`\`\`\n${extractedText.slice(0, 12000)}\n\`\`\`\n\nExtract ALL data and compute every applicable tax. Include payment_instructions, penalty_exposure, and validation_summary. Return ONLY valid JSON.`,
      });
    }

    logger.info({ filename: file.originalname, mimetype: file.mimetype, size: file.size, entity_type: entityType, sector, location, residency, model: aiModel }, "Tax analyze request");

    let completion;
    try {
      completion = await openai.chat.completions.create({
        model: aiModel,
        max_completion_tokens: 8192,
        messages,
        response_format: { type: "json_object" },
      });
    } catch (apiErr: any) {
      const status = apiErr?.status || apiErr?.response?.status;
      const errMsg = apiErr?.message || "Unknown AI error";
      logger.error({ err: apiErr, status }, "OpenAI API call failed");

      if (status === 400) {
        const hint = isImage
          ? "Image could not be processed by AI. Try a clearer photo, reduce file size, or upload a PDF/CSV instead."
          : "Document could not be processed. Try a smaller file or different format.";
        res.status(422).json({ error: hint });
        return;
      }
      if (status === 429) {
        res.status(429).json({ error: "AI rate limit reached. Please wait a moment and try again." });
        return;
      }
      if (status === 500 || status === 502 || status === 503) {
        res.status(502).json({ error: "AI service is temporarily unavailable. Please try again in a few seconds." });
        return;
      }
      res.status(500).json({ error: `AI analysis failed: ${errMsg}` });
      return;
    }

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      const finishReason = completion.choices[0]?.finish_reason;
      logger.warn({ finishReason }, "AI returned empty content");
      res.status(500).json({
        error: finishReason === "content_filter"
          ? "Document was flagged by content filter. Try uploading a different format."
          : "AI returned empty response. Try a different document or reduce file size.",
      });
      return;
    }

    let result;
    try {
      result = JSON.parse(content);
    } catch {
      res.status(500).json({ error: "AI returned invalid response format. Please try again." });
      return;
    }

    if (result.tax_analysis && Array.isArray(result.tax_analysis)) {
      result.tax_analysis = result.tax_analysis.map((t: any) => ({
        ...t,
        applicable_law: t.applicable_law || "Not specified",
        section_reference: t.section_reference || "Not specified",
        source_text: t.source_text || "",
        legal_basis: (!t.section_reference || t.section_reference === "N/A" || t.section_reference === "Not specified")
          ? "Insufficient legal basis"
          : (t.legal_basis || "Confirmed"),
      }));
    }

    if (!result.missing_tax_check) {
      result.missing_tax_check = [];
    }

    res.json({
      success: true,
      filename: file.originalname,
      filer_status: filerStatus,
      ...result,
    });
  } catch (err: any) {
    logger.error({ err }, "Tax analyze failed");
    res.status(500).json({ error: err.message || "Analysis failed" });
  }
});

router.post("/text", async (req: Request, res: Response) => {
  try {
    const { text, filer, entity_type, sector, location, residency } = req.body;
    const filerStatus = filer || "atl";

    if (!text || typeof text !== "string" || text.trim().length < 10) {
      res.status(400).json({ error: "Please enter a transaction description (at least 10 characters)." });
      return;
    }

    const ai = await getAIClient();
    if (!ai) {
      res.status(500).json({ error: "AI not configured. Please set your API key in Admin Settings." });
      return;
    }
    const { client: openai, model: aiModel } = ai;

    const contextParts: string[] = [];
    contextParts.push(`Taxpayer is ${filerStatus === "atl" ? "Active Taxpayer (ATL)" : "Non-Active Taxpayer (Non-ATL)"}`);
    if (entity_type) contextParts.push(`Entity Type: ${entity_type}`);
    if (sector) contextParts.push(`Sector: ${sector}`);
    if (location) contextParts.push(`Location/Province: ${location}`);
    if (residency) contextParts.push(`Residency: ${residency}`);

    logger.info({ textLength: text.length, filer: filerStatus, entity_type, sector, location, residency, model: aiModel }, "Tax text analyze request");

    const messages: any[] = [
      { role: "system", content: TAX_SYSTEM_PROMPT },
      {
        role: "user",
        content: `Analyze the following transaction/scenario for Pakistan tax implications.\n\nContext:\n${contextParts.join("\n")}\n\nTransaction/Scenario:\n\`\`\`\n${text.slice(0, 12000)}\n\`\`\`\n\nIdentify ALL applicable taxes, compute amounts where possible, and provide section-wise legal analysis. Include payment_instructions, penalty_exposure, and validation_summary in your response. Return ONLY valid JSON.`,
      },
    ];

    let completion;
    try {
      completion = await openai.chat.completions.create({
        model: aiModel,
        max_completion_tokens: 8192,
        messages,
        response_format: { type: "json_object" },
      });
    } catch (apiErr: any) {
      const status = apiErr?.status || apiErr?.response?.status;
      const errMsg = apiErr?.message || "Unknown AI error";
      logger.error({ err: apiErr, status }, "OpenAI API call failed (text)");
      if (status === 429) {
        res.status(429).json({ error: "AI rate limit reached. Please wait a moment and try again." });
        return;
      }
      if (status === 500 || status === 502 || status === 503) {
        res.status(502).json({ error: "AI service is temporarily unavailable. Please try again in a few seconds." });
        return;
      }
      res.status(500).json({ error: `AI analysis failed: ${errMsg}` });
      return;
    }

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      res.status(500).json({ error: "AI returned empty response. Please try rephrasing your input." });
      return;
    }

    let result;
    try {
      result = JSON.parse(content);
    } catch {
      res.status(500).json({ error: "AI returned invalid response format. Please try again." });
      return;
    }

    if (result.tax_analysis && Array.isArray(result.tax_analysis)) {
      result.tax_analysis = result.tax_analysis.map((t: any) => ({
        ...t,
        applicable_law: t.applicable_law || "Not specified",
        section_reference: t.section_reference || "Not specified",
        source_text: t.source_text || "",
        legal_basis: (!t.section_reference || t.section_reference === "N/A" || t.section_reference === "Not specified")
          ? "Insufficient legal basis"
          : (t.legal_basis || "Confirmed"),
      }));
    }
    if (!result.missing_tax_check) result.missing_tax_check = [];

    res.json({
      success: true,
      filename: "Text Input",
      filer_status: filerStatus,
      ...result,
    });
  } catch (err: any) {
    logger.error({ err }, "Tax text analyze failed");
    res.status(500).json({ error: err.message || "Analysis failed" });
  }
});

export default router;
