import { Router, type Request, type Response } from "express";
import multer from "multer";
import { logger } from "../lib/logger";

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

const TAX_SYSTEM_PROMPT = `You are a senior Pakistan tax expert (Chartered Accountant) specializing in all Pakistan tax laws:
- Income Tax Ordinance 2001 (all sections including WHT: 148, 149, 150, 151, 152, 153, 154, 155, 156, 231, 233, 236 series)
- Sales Tax Act 1990 (Federal)
- Provincial Sales Tax: Punjab (PRA at 16%), Sindh (SRB at 13%), KPK (KPRA at 15%), Balochistan (BRA at 15%)
- Federal Excise Duty Act 2005
- Finance Act 2025 (latest rates)

KEY REFERENCE RATES (ATL / Non-ATL):
WHT on Imports Sec 148: Part-I 1%/2%, Part-II 2%/4%, Part-II Commercial 3.5%/7%, Part-III 5.5%/11%
WHT on Supply of Goods Sec 153(1)(a): Company 5%/10%, Non-Company 5.5%/11%
WHT on Services Sec 153(1)(b): IT 4%/8%, General 6%/12%, Other 15%/30%
WHT on Contracts Sec 153(1)(c): 7.5%/15%
WHT on Rent Sec 155: Company 15%/30%
Dividend Sec 150: REIT/General 15%/30%, IPPs 7.5%/15%, Mutual Fund Debt>50% 25%/50%
Profit on Debt Sec 151: Bank 20%/40%
Export Sec 154: Goods 1%/2%, IT Services PSEB 0.25%/0.5%
Prize Bond Sec 156: 15%/30%
Commission Sec 233: General 12%/24%
Federal Sales Tax: Standard 18%, Reduced 12% (essentials)
Corporate Income Tax: Private Ltd 29%, Small Company 21%, Banking 39%, Individual/AOP progressive slabs
Super Tax Sec 4C: 1% (150-200M) up to 10% (>500M)
Minimum Tax Sec 113: 1.25% of turnover (company), 1% (others)

When analyzing a document, you must:
1. Extract ALL financial data (amounts, parties, NTN/CNIC if visible, nature of transaction)
2. Identify EVERY applicable tax (WHT Income Tax, WHT Sales Tax, Advance Tax, Federal/Provincial Sales Tax, FED, Income Tax implication)
3. For each tax, determine: applicable section, rate (ATL and Non-ATL), whether Final/Minimum/Adjustable
4. Flag any exemptions, special conditions, or compliance risks
5. Classify risk level for each item

ALWAYS respond with valid JSON matching this exact structure:
{
  "document_summary": {
    "document_type": "Invoice/Receipt/Contract/Statement/Other",
    "parties": [{"name": "...", "ntn_cnic": "...", "role": "Supplier/Buyer/Service Provider"}],
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
      "tax_type": "WHT Income Tax / WHT Sales Tax / Federal Sales Tax / Provincial Sales Tax / FED / Advance Tax / Income Tax",
      "section_reference": "Sec 153(1)(a)",
      "nature_of_transaction": "Supply of Goods by Company",
      "atl_rate": "5.00%",
      "non_atl_rate": "10.00%",
      "tax_amount_atl": 0,
      "tax_amount_non_atl": 0,
      "adjustability": "Adjustable / Final / Minimum",
      "conditions": "Applicable on gross amount. Withholding obligation on buyer.",
      "risk_flag": "High / Medium / Low",
      "risk_reason": "..."
    }
  ],
  "compliance_notes": [
    "Note 1...",
    "Note 2..."
  ],
  "total_tax_exposure": {
    "atl": 0,
    "non_atl": 0
  }
}

Be thorough — identify ALL applicable taxes. A single transaction may trigger multiple tax types simultaneously (e.g., WHT on income + sales tax + advance tax).`;

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

    const baseUrl = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
    const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
    if (!baseUrl || !apiKey) {
      res.status(500).json({ error: "AI integration not configured" });
      return;
    }

    const OpenAI = (await import("openai")).default;
    const openai = new OpenAI({ apiKey, baseURL: baseUrl });

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
          { type: "text", text: `Analyze this document image for Pakistan tax implications. Taxpayer is ${filerStatus === "atl" ? "Active Taxpayer (ATL)" : "Non-Active Taxpayer (Non-ATL)"}. Extract ALL data and compute every applicable tax. Return ONLY valid JSON.` },
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
        content: `Analyze this document for Pakistan tax implications. Taxpayer is ${filerStatus === "atl" ? "Active Taxpayer (ATL)" : "Non-Active Taxpayer (Non-ATL)"}.\n\nExtracted document content:\n\`\`\`\n${extractedText.slice(0, 12000)}\n\`\`\`\n\nExtract ALL data and compute every applicable tax. Return ONLY valid JSON.`,
      });
    }

    logger.info({ filename: file.originalname, mimetype: file.mimetype, size: file.size }, "Tax analyze request");

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      max_completion_tokens: 8192,
      messages,
      response_format: { type: "json_object" },
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      res.status(500).json({ error: "AI returned empty response" });
      return;
    }

    let result;
    try {
      result = JSON.parse(content);
    } catch {
      res.status(500).json({ error: "AI returned invalid response format. Please try again." });
      return;
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

export default router;
