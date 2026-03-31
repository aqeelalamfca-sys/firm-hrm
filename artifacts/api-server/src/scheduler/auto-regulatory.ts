import { db } from "@workspace/db";
import { regulatoryUpdatesTable, systemSettingsTable, autoGenLogsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import OpenAI from "openai";

const CATEGORIES = ["FBR", "SECP", "PSX", "SBP"] as const;
const INTERVAL_MS = 2 * 60 * 60 * 1000;

const CATEGORY_SEARCH_QUERIES: Record<string, string[]> = {
  FBR: [
    "FBR Pakistan latest news today tax update",
    "Pakistan Federal Board Revenue SRO notification this week",
  ],
  SECP: [
    "SECP Pakistan latest notification today",
    "Pakistan Securities Exchange Commission corporate governance update",
  ],
  PSX: [
    "KSE 100 index today Pakistan stock exchange",
    "PSX top gainers losers today Pakistan stocks",
  ],
  SBP: [
    "SBP policy rate Pakistan today",
    "USD PKR exchange rate today Pakistan KIBOR rate",
  ],
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

async function fetchExchangeRates(): Promise<string> {
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD");
    if (!res.ok) return "";
    const data = await res.json() as any;
    const rates = data.rates || {};
    const pkr = rates.PKR || "N/A";
    const gbpToPkr = rates.PKR && rates.GBP ? (rates.PKR / rates.GBP).toFixed(2) : "N/A";
    const eurToPkr = rates.PKR && rates.EUR ? (rates.PKR / rates.EUR).toFixed(2) : "N/A";
    const sarToPkr = rates.PKR && rates.SAR ? (rates.PKR / rates.SAR).toFixed(2) : "N/A";
    const aedToPkr = rates.PKR && rates.AED ? (rates.PKR / rates.AED).toFixed(2) : "N/A";
    return `Real exchange rates as of today: USD/PKR=${pkr}, GBP/PKR=${gbpToPkr}, EUR/PKR=${eurToPkr}, SAR/PKR=${sarToPkr}, AED/PKR=${aedToPkr}`;
  } catch (e) {
    console.log("[Auto-Gen] Failed to fetch exchange rates:", e);
    return "";
  }
}

async function searchWeb(query: string): Promise<string> {
  try {
    const encodedQuery = encodeURIComponent(query);
    const res = await fetch(`https://www.googleapis.com/customsearch/v1?q=${encodedQuery}&key=none&cx=none`, {
      signal: AbortSignal.timeout(5000),
    });
    return "";
  } catch {
    return "";
  }
}

async function fetchRealTimeContext(category: string): Promise<string> {
  const parts: string[] = [];
  const today = getTodayStr();
  parts.push(`Current date: ${today}`);

  if (category === "SBP") {
    const rates = await fetchExchangeRates();
    if (rates) parts.push(rates);

    try {
      const res = await fetch("https://www.sbp.org.pk/ecodata/kibor.asp", {
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const html = await res.text();
        const kiborMatch = html.match(/KIBOR[\s\S]{0,500}/i);
        if (kiborMatch) parts.push(`KIBOR data snippet: ${kiborMatch[0].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').substring(0, 300)}`);
      }
    } catch {}

    try {
      const res = await fetch("https://www.sbp.org.pk/ecodata/rates/war/WAR-Current.asp", {
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const html = await res.text();
        const snippet = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').substring(0, 500);
        if (snippet.length > 50) parts.push(`SBP weighted average rates snippet: ${snippet}`);
      }
    } catch {}
  }

  if (category === "PSX") {
    try {
      const res = await fetch("https://dps.psx.com.pk/market-summary", {
        signal: AbortSignal.timeout(8000),
        headers: { "User-Agent": "Mozilla/5.0" },
      });
      if (res.ok) {
        const html = await res.text();
        const cleaned = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
        const kseMatch = cleaned.match(/KSE[\s\S]{0,400}/i);
        if (kseMatch) parts.push(`PSX market data: ${kseMatch[0].substring(0, 400)}`);
        else parts.push(`PSX data snippet: ${cleaned.substring(0, 400)}`);
      }
    } catch {}

    const rates = await fetchExchangeRates();
    if (rates) parts.push(rates);
  }

  if (category === "FBR") {
    try {
      const res = await fetch("https://www.fbr.gov.pk/", {
        signal: AbortSignal.timeout(8000),
        headers: { "User-Agent": "Mozilla/5.0" },
      });
      if (res.ok) {
        const html = await res.text();
        const cleaned = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
        const newsMatch = cleaned.match(/(?:notification|SRO|circular|deadline|tax)[\s\S]{0,300}/i);
        if (newsMatch) parts.push(`FBR website content: ${newsMatch[0].substring(0, 300)}`);
      }
    } catch {}
  }

  if (category === "SECP") {
    try {
      const res = await fetch("https://www.secp.gov.pk/", {
        signal: AbortSignal.timeout(8000),
        headers: { "User-Agent": "Mozilla/5.0" },
      });
      if (res.ok) {
        const html = await res.text();
        const cleaned = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
        const newsMatch = cleaned.match(/(?:notification|circular|compliance|governance|registration)[\s\S]{0,300}/i);
        if (newsMatch) parts.push(`SECP website content: ${newsMatch[0].substring(0, 300)}`);
      }
    } catch {}
  }

  return parts.join("\n");
}

async function generateUpdate(openai: OpenAI, category: string): Promise<string> {
  const today = getTodayStr();
  const realTimeContext = await fetchRealTimeContext(category);

  console.log(`[Auto-Gen] ${category} real-time context length: ${realTimeContext.length} chars`);

  const systemPrompts: Record<string, string> = {
    FBR: "You are a Pakistan FBR news summarizer. You MUST ONLY state facts from the REAL DATA provided below. If no real data is provided, generate a general advisory about current FBR compliance requirements WITHOUT inventing specific dates, SRO numbers, or deadlines. Never fabricate information. Keep under 35 words. No quotation marks.",
    SECP: "You are a Pakistan SECP news summarizer. You MUST ONLY state facts from the REAL DATA provided below. If no real data is provided, generate a general advisory about SECP compliance WITHOUT inventing specific dates or circular numbers. Never fabricate information. Keep under 35 words. No quotation marks.",
    PSX: "You are a Pakistan Stock Exchange analyst. You MUST ONLY use the REAL MARKET DATA provided below. Report actual KSE-100 values, actual stock movements, and actual percentages from the data. If no real data is available, state general market sentiment WITHOUT inventing specific numbers. Never fabricate stock prices or percentages. Keep under 35 words. No quotation marks.",
    SBP: "You are a State Bank of Pakistan analyst. You MUST ONLY use the REAL FINANCIAL DATA provided below (exchange rates, KIBOR rates, policy rate). Report the exact numbers from the data. If no real data is available, provide general SBP advisory WITHOUT inventing rates. Never fabricate numbers. Keep under 35 words. No quotation marks.",
  };

  const systemPrompt = systemPrompts[category] || "You are a Pakistan regulatory expert. Summarize ONLY the real data provided. Never fabricate information. Keep under 35 words. No quotation marks.";

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: `Today is ${today}.\n\nREAL DATA (use ONLY this information — do NOT invent or fabricate any numbers, rates, or facts):\n${realTimeContext || "No real-time data available for this category."}\n\nGenerate a single concise ticker update for ${category} based STRICTLY on the real data above. If real data has specific numbers (exchange rates, index values), you MUST use those exact numbers. Do not round or change them.`,
      },
    ],
    temperature: 0.3,
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
