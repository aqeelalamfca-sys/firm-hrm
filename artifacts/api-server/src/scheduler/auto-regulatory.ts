import { db } from "@workspace/db";
import { regulatoryUpdatesTable, systemSettingsTable, autoGenLogsTable } from "@workspace/db";
import { eq, desc, inArray, and, gte } from "drizzle-orm";
import OpenAI from "openai";

const CATEGORIES = ["FBR", "SECP", "PSX", "SBP"] as const;

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

async function getOpenAIClient(): Promise<{ client: OpenAI; model: string } | null> {
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
  } catch {
    return null;
  }
}

function getTodayStr(): string {
  const d = new Date();
  return d.toLocaleDateString("en-PK", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}

async function safeFetch(url: string, timeoutMs = 8000): Promise<string> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
    });
    if (!res.ok) return "";
    return await res.text();
  } catch {
    return "";
  }
}

function cleanHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchExchangeRates(): Promise<{ text: string; rates: Record<string, number> }> {
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD", { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return { text: "", rates: {} };
    const data = await res.json() as any;
    const rates = data.rates || {};
    const pkr = rates.PKR;
    if (!pkr) return { text: "", rates };
    const gbpPkr = rates.GBP ? (pkr / rates.GBP).toFixed(2) : "N/A";
    const eurPkr = rates.EUR ? (pkr / rates.EUR).toFixed(2) : "N/A";
    const sarPkr = rates.SAR ? (pkr / rates.SAR).toFixed(2) : "N/A";
    const aedPkr = rates.AED ? (pkr / rates.AED).toFixed(2) : "N/A";
    const cnyPkr = rates.CNY ? (pkr / rates.CNY).toFixed(2) : "N/A";
    return {
      text: `Live exchange rates: USD/PKR=${Number(pkr).toFixed(2)}, GBP/PKR=${gbpPkr}, EUR/PKR=${eurPkr}, SAR/PKR=${sarPkr}, AED/PKR=${aedPkr}, CNY/PKR=${cnyPkr}. Last updated: ${data.time_last_update_utc || "now"}.`,
      rates,
    };
  } catch (e) {
    console.log("[Auto-Gen] Failed to fetch exchange rates:", e);
    return { text: "", rates: {} };
  }
}

async function fetchFBRData(): Promise<string> {
  const parts: string[] = [];

  const fbrHtml = await safeFetch("https://www.fbr.gov.pk/");
  if (fbrHtml) {
    const cleaned = cleanHtml(fbrHtml);
    const notifMatches = cleaned.match(/(?:SRO|notification|circular|deadline|tax\s+return|withholding|active\s+taxpayer|income\s+tax|sales\s+tax|FED|customs)[^.]*\./gi);
    if (notifMatches && notifMatches.length > 0) {
      parts.push("FBR Website Content:\n" + notifMatches.slice(0, 5).join("\n"));
    } else {
      const snippets = cleaned.substring(0, 800);
      if (snippets.length > 100) parts.push("FBR Homepage: " + snippets);
    }
  }

  const fbrNewsHtml = await safeFetch("https://www.fbr.gov.pk/press-releases/131328");
  if (fbrNewsHtml) {
    const cleaned = cleanHtml(fbrNewsHtml);
    const newsSnippet = cleaned.substring(0, 600);
    if (newsSnippet.length > 50) parts.push("FBR Press Releases: " + newsSnippet);
  }

  return parts.join("\n\n");
}

async function fetchSECPData(): Promise<string> {
  const parts: string[] = [];

  const secpHtml = await safeFetch("https://www.secp.gov.pk/");
  if (secpHtml) {
    const cleaned = cleanHtml(secpHtml);
    const notifMatches = cleaned.match(/(?:notification|circular|compliance|governance|registration|amendment|regulation|company|securities|NBFC|insurance|modaraba)[^.]*\./gi);
    if (notifMatches && notifMatches.length > 0) {
      parts.push("SECP Website Content:\n" + notifMatches.slice(0, 5).join("\n"));
    } else {
      const snippets = cleaned.substring(0, 600);
      if (snippets.length > 50) parts.push("SECP Homepage: " + snippets);
    }
  }

  const secpNotifHtml = await safeFetch("https://www.secp.gov.pk/laws/notifications/");
  if (secpNotifHtml) {
    const cleaned = cleanHtml(secpNotifHtml);
    const snippets = cleaned.substring(0, 500);
    if (snippets.length > 50) parts.push("SECP Notifications Page: " + snippets);
  }

  return parts.join("\n\n");
}

async function fetchPSXData(): Promise<string> {
  const parts: string[] = [];

  const psxHtml = await safeFetch("https://dps.psx.com.pk/market-summary");
  if (psxHtml) {
    const cleaned = cleanHtml(psxHtml);
    const kseMatch = cleaned.match(/KSE[\s\S]{0,600}/i);
    if (kseMatch) parts.push("PSX Market Data: " + kseMatch[0].substring(0, 600));
    else {
      const snippet = cleaned.substring(0, 600);
      if (snippet.length > 50) parts.push("PSX Market Summary: " + snippet);
    }
  }

  const psxTimeline = await safeFetch("https://dps.psx.com.pk/timelines");
  if (psxTimeline) {
    const cleaned = cleanHtml(psxTimeline);
    const snippet = cleaned.substring(0, 500);
    if (snippet.length > 50) parts.push("PSX Timelines: " + snippet);
  }

  const { text: rateText } = await fetchExchangeRates();
  if (rateText) parts.push(rateText);

  return parts.join("\n\n");
}

async function fetchSBPData(): Promise<string> {
  const parts: string[] = [];

  const { text: rateText } = await fetchExchangeRates();
  if (rateText) parts.push(rateText);

  const kiborHtml = await safeFetch("https://www.sbp.org.pk/ecodata/kibor.asp");
  if (kiborHtml) {
    const cleaned = cleanHtml(kiborHtml);
    const kiborMatch = cleaned.match(/KIBOR[\s\S]{0,600}/i);
    if (kiborMatch) parts.push("SBP KIBOR Data: " + kiborMatch[0].substring(0, 600));
  }

  const warHtml = await safeFetch("https://www.sbp.org.pk/ecodata/rates/war/WAR-Current.asp");
  if (warHtml) {
    const cleaned = cleanHtml(warHtml);
    const snippet = cleaned.substring(0, 600);
    if (snippet.length > 50) parts.push("SBP Official Exchange Rates: " + snippet);
  }

  const sbpMain = await safeFetch("https://www.sbp.org.pk/");
  if (sbpMain) {
    const cleaned = cleanHtml(sbpMain);
    const policyMatch = cleaned.match(/(?:policy\s+rate|discount\s+rate|monetary\s+policy|reserve|inflation)[^.]*\./gi);
    if (policyMatch && policyMatch.length > 0) {
      parts.push("SBP Website: " + policyMatch.slice(0, 3).join(" "));
    }
  }

  return parts.join("\n\n");
}

const FETCH_FUNCTIONS: Record<string, () => Promise<string>> = {
  FBR: fetchFBRData,
  SECP: fetchSECPData,
  PSX: fetchPSXData,
  SBP: fetchSBPData,
};

async function getRecentUpdates(category: string): Promise<string[]> {
  try {
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
    const recent = await db
      .select({ text: regulatoryUpdatesTable.text })
      .from(regulatoryUpdatesTable)
      .where(
        and(
          eq(regulatoryUpdatesTable.category, category),
          gte(regulatoryUpdatesTable.createdAt, sixHoursAgo)
        )
      )
      .orderBy(desc(regulatoryUpdatesTable.createdAt))
      .limit(5);
    return recent.map(r => r.text);
  } catch {
    return [];
  }
}

async function generateUpdate(openai: OpenAI, aiModel: string, category: string): Promise<{ text: string; priority: string }> {
  const today = getTodayStr();
  const fetchFn = FETCH_FUNCTIONS[category];
  const realTimeData = fetchFn ? await fetchFn() : "";
  const recentUpdates = await getRecentUpdates(category);

  console.log(`[Auto-Gen] ${category} real-time data length: ${realTimeData.length} chars`);

  const systemPrompts: Record<string, string> = {
    FBR: `You are a senior Pakistan tax advisor at a Chartered Accountancy firm. Generate a SHORT, FACTUAL regulatory update for FBR (Federal Board of Revenue) based STRICTLY on the real data provided. Focus on: tax deadlines, SRO notifications, WHT changes, ATL status, income/sales tax updates, or compliance requirements. If the real data contains specific dates, SRO numbers, or amounts, USE them exactly. If no specific news is available, provide a genuinely useful general advisory about current FBR compliance obligations that is relevant to today's date. NEVER fabricate SRO numbers, dates, or deadlines that aren't in the data.`,
    SECP: `You are a senior corporate advisor at a Chartered Accountancy firm. Generate a SHORT, FACTUAL update for SECP (Securities & Exchange Commission of Pakistan) based STRICTLY on the real data provided. Focus on: company registration deadlines, beneficial ownership, corporate governance, NBFC regulations, insurance sector updates, or compliance circulars. If the data has specific circular numbers or dates, USE them. If no specific news, provide a genuinely useful general advisory about SECP compliance obligations. NEVER fabricate circular numbers or dates.`,
    PSX: `You are a stock market analyst. Generate a SHORT, FACTUAL market update for PSX (Pakistan Stock Exchange) based STRICTLY on the real data provided. Include: KSE-100 index level/movement, notable sector performance, and any available exchange rate context. If specific stock data is available, mention top movers by name. If no real KSE data, use available exchange rate data and general market context. NEVER fabricate index values, stock prices, or percentages.`,
    SBP: `You are a financial analyst. Generate a SHORT, FACTUAL update for SBP (State Bank of Pakistan) based STRICTLY on the real data provided. Focus on: exchange rates (USD/PKR, GBP/PKR, EUR/PKR, SAR/PKR, AED/PKR), KIBOR rates, SBP policy rate, foreign reserves, or monetary policy. USE the exact numbers from the data. Report rates accurately to 2 decimal places. NEVER fabricate or round rates differently from source data.`,
  };

  const recentContext = recentUpdates.length > 0
    ? `\n\nRECENT UPDATES ALREADY POSTED (do NOT repeat these — generate something NEW and DIFFERENT):\n${recentUpdates.map((u, i) => `${i + 1}. ${u}`).join("\n")}`
    : "";

  const response = await openai.chat.completions.create({
    model: aiModel,
    messages: [
      { role: "system", content: systemPrompts[category] || "You are a Pakistan regulatory expert. Report ONLY facts from the data provided." },
      {
        role: "user",
        content: `Today is ${today}.\n\nREAL DATA (use ONLY this — do NOT invent facts):\n${realTimeData || "No real-time data could be fetched for this category."}\n${recentContext}\n\nGenerate ONE concise, professional ticker update (max 40 words). It must be NEW information, different from recent updates. Include specific numbers/rates if available in the data. Output ONLY the update text, no quotes, no labels.`,
      },
    ],
    temperature: 0.4,
  });

  const text = response.choices[0]?.message?.content?.trim();
  if (!text) throw new Error("AI returned empty response");
  const cleanText = text.replace(/^["']|["']$/g, "").replace(/^(Update:|Alert:|News:)\s*/i, "");

  const priorityResponse = await openai.chat.completions.create({
    model: aiModel,
    messages: [
      { role: "system", content: "Classify the priority of this regulatory update. Reply with ONLY one word: high, medium, or low. high = urgent deadline/major policy change/market crash. medium = rate change/new notification/market movement. low = general advisory/reminder." },
      { role: "user", content: cleanText },
    ],
    temperature: 0,
    max_completion_tokens: 5,
  });

  const priorityText = priorityResponse.choices[0]?.message?.content?.trim()?.toLowerCase() || "medium";
  const priority = ["high", "medium", "low"].includes(priorityText) ? priorityText : "medium";

  return { text: cleanText, priority };
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

    const ai = await getOpenAIClient();
    if (!ai) {
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
        const { text, priority } = await generateUpdate(ai.client, ai.model, category);

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

        console.log(`[Auto-Gen] ${category} [${priority}]: ${text}`);
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
    const getVal = (key: string, fallback: string) => settings.find((s: any) => s.key === key)?.value || fallback;
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
