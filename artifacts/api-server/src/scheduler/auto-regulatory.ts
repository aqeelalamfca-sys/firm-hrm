import { db } from "@workspace/db";
import { regulatoryUpdatesTable, systemSettingsTable, autoGenLogsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import OpenAI from "openai";

const CATEGORIES = ["FBR", "SECP", "PSX", "SBP"] as const;
const INTERVAL_MS = 2 * 60 * 60 * 1000;

const CATEGORY_FOCUS: Record<string, string> = {
  FBR: "Pakistan tax deadlines, SROs, withholding tax rates, active taxpayer list, income tax returns, sales tax updates",
  SECP: "Company registration, annual returns, beneficial ownership, corporate governance, compliance requirements",
  PSX: "KSE-100 index movement, top gaining and losing stocks with percentage changes, stock buy/sell recommendations, sector-wise performance (banking, cement, oil & gas, fertilizer, pharma), trading volume highlights, IPO announcements, PSX market capitalization changes",
  SBP: "Daily KIBOR rates (1-week, 1-month, 3-month, 6-month, 12-month), USD/PKR and major currency exchange rates (GBP, EUR, SAR, AED, CNY), SBP policy rate updates, T-bill auction results, government savings schemes (DSC, SSC, Behbood) profit rates, foreign reserves position, remittance inflows, banking sector circulars",
};

const PRIORITY_OPTIONS = ["high", "medium", "low"] as const;

async function getOpenAIClient(): Promise<OpenAI | null> {
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  if (baseURL && apiKey) {
    return new OpenAI({ baseURL, apiKey });
  }

  const settings = await db
    .select()
    .from(systemSettingsTable)
    .where(eq(systemSettingsTable.key, "chatgpt_api_key"))
    .limit(1);

  const storedKey = settings[0]?.value;
  if (storedKey && storedKey.startsWith("sk-") && storedKey.length > 20) {
    return new OpenAI({ apiKey: storedKey });
  }

  return null;
}

function getTodayStr(): string {
  const d = new Date();
  return d.toLocaleDateString("en-PK", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}

const CATEGORY_SYSTEM_PROMPT: Record<string, string> = {
  FBR: "You are a Pakistan Federal Board of Revenue (FBR) expert. Generate ONE short, professional, factual tax/regulatory update suitable for a Chartered Accountancy firm's website ticker. The update must reflect the CURRENT DATE provided — do not reference past dates or outdated deadlines. Keep it under 30 words. Do NOT use quotation marks.",
  SECP: "You are a Pakistan SECP expert. Generate ONE short, professional regulatory update about corporate governance or compliance suitable for a CA firm's website ticker. The update must be relevant to the CURRENT DATE provided — do not reference past events. Keep it under 30 words. Do NOT use quotation marks.",
  PSX: "You are a Pakistan Stock Exchange analyst. Generate ONE short, professional market update showing specific stock movements with percentages, buy/sell recommendations, or sector performance for the CURRENT DATE provided. Use realistic stock names (OGDC, HBL, LUCK, ENGRO, PPL, PSO, FFC, HUBC, SYS, TRG, MARI) with realistic price movements. Keep under 35 words. Do NOT use quotation marks.",
  SBP: "You are a State Bank of Pakistan financial analyst. Generate ONE short, professional update about KIBOR rates, currency exchange rates (USD/PKR, GBP/PKR, EUR/PKR, SAR/PKR, AED/PKR), SBP policy rate, government savings scheme profit rates, or foreign reserves for the CURRENT DATE provided. Use realistic numbers. Keep under 35 words. Do NOT use quotation marks.",
};

async function generateUpdate(openai: OpenAI, category: string): Promise<string> {
  const today = getTodayStr();
  const systemPrompt = CATEGORY_SYSTEM_PROMPT[category] || `You are a Pakistan regulatory expert specializing in ${category}. Generate ONE short, professional, factual regulatory update for today. Keep it under 30 words. Do NOT use quotation marks.`;
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: `Today is ${today}. Generate a unique professional update for ${category} relevant to today.\nFocus areas: ${CATEGORY_FOCUS[category]}\nTone: Authoritative advisory\nLength: Max 35 words\nFormat: Single concise statement without quotes\nIMPORTANT: The update must be for TODAY only — no past dates or expired deadlines.`,
      },
    ],
    temperature: 0.9,
  });

  const text = response.choices[0]?.message?.content?.trim();
  if (!text) throw new Error("AI returned empty response");
  return text.replace(/^["']|["']$/g, "");
}

let isRunning = false;

async function runAutoGeneration(): Promise<void> {
  if (isRunning) {
    console.log("[Auto-Gen] Already running, skipping overlapping execution");
    return;
  }
  isRunning = true;

  try {
    console.log(`[Auto-Gen] Starting scheduled regulatory update generation at ${new Date().toISOString()}`);

    const openai = await getOpenAIClient();
    if (!openai) {
      console.log("[Auto-Gen] No AI client available (no API key configured). Skipping.");
      for (const category of CATEGORIES) {
        await db.insert(autoGenLogsTable).values({
          category,
          status: "skipped",
          errorMessage: "No API key configured",
        });
      }
      return;
    }

    for (const category of CATEGORIES) {
      try {
        const text = await generateUpdate(openai, category);
        const priority = PRIORITY_OPTIONS[Math.floor(Math.random() * PRIORITY_OPTIONS.length)];

        await db.insert(regulatoryUpdatesTable).values({
          category,
          text,
          priority,
          source: "auto",
          isActive: true,
        });

        await db.insert(autoGenLogsTable).values({
          category,
          generatedText: text,
          status: "success",
        });

        console.log(`[Auto-Gen] ${category}: ${text}`);
      } catch (error: any) {
        const errMsg = error?.message || String(error);
        console.error(`[Auto-Gen] ${category} failed:`, errMsg);

        await db.insert(autoGenLogsTable).values({
          category,
          status: "error",
          errorMessage: errMsg.substring(0, 500),
        }).catch(() => {});
      }
    }

    console.log(`[Auto-Gen] Completed at ${new Date().toISOString()}`);
  } finally {
    isRunning = false;
  }
}


let intervalId: ReturnType<typeof setInterval> | null = null;

async function getSchedulerConfig(): Promise<{ enabled: boolean; intervalHours: number }> {
  try {
    const settings = await db.select().from(systemSettingsTable);
    const getVal = (key: string, fallback: string) => settings.find(s => s.key === key)?.value || fallback;
    return {
      enabled: getVal("auto_gen_enabled", "true") === "true",
      intervalHours: parseInt(getVal("auto_gen_interval_hours", "2"), 10) || 2,
    };
  } catch {
    return { enabled: true, intervalHours: 2 };
  }
}

export async function startAutoGenScheduler(): Promise<void> {
  if (intervalId) return;

  const config = await getSchedulerConfig();
  if (!config.enabled) {
    console.log("[Auto-Gen] Scheduler is disabled via config");
    return;
  }

  const intervalMs = config.intervalHours * 60 * 60 * 1000;
  console.log(`[Auto-Gen] Scheduler started — will run every ${config.intervalHours} hour(s)`);

  setTimeout(() => {
    runAutoGeneration().catch(err => console.error("[Auto-Gen] Run failed:", err));
  }, 10_000);

  intervalId = setInterval(() => {
    runAutoGeneration().catch(err => console.error("[Auto-Gen] Run failed:", err));
  }, intervalMs);
}

export function stopAutoGenScheduler(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log("[Auto-Gen] Scheduler stopped");
  }
}

export async function updateSchedulerConfig(): Promise<void> {
  stopAutoGenScheduler();
  const config = await getSchedulerConfig();
  if (config.enabled) {
    const intervalMs = config.intervalHours * 60 * 60 * 1000;
    console.log(`[Auto-Gen] Scheduler restarted — will run every ${config.intervalHours} hour(s)`);
    intervalId = setInterval(() => {
      runAutoGeneration().catch(err => console.error("[Auto-Gen] Run failed:", err));
    }, intervalMs);
  } else {
    console.log("[Auto-Gen] Scheduler disabled");
  }
}

export { runAutoGeneration };
