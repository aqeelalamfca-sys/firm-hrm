import { db } from "@workspace/db";
import { regulatoryUpdatesTable, systemSettingsTable, autoGenLogsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import OpenAI from "openai";

const CATEGORIES = ["FBR", "SECP", "PSX", "SBP"] as const;
const INTERVAL_MS = 2 * 60 * 60 * 1000;

const CATEGORY_FOCUS: Record<string, string> = {
  FBR: "Pakistan tax deadlines, SROs, withholding tax rates, active taxpayer list, income tax returns, sales tax updates",
  SECP: "Company registration, annual returns, beneficial ownership, corporate governance, compliance requirements",
  PSX: "Stock market regulations, listing rules, trading updates, market capitalization, investor protection",
  SBP: "Banking regulations, monetary policy, interest rates, foreign exchange, digital banking, payment systems",
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

async function generateUpdate(openai: OpenAI, category: string): Promise<string> {
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `You are a Pakistan regulatory expert specializing in ${category}. Generate ONE short, professional, factual regulatory update suitable for a Chartered Accountancy firm's website. The update should be current, relevant, and actionable. Keep it under 30 words. Do NOT use quotation marks around your response.`,
      },
      {
        role: "user",
        content: `Generate a unique professional regulatory update for ${category}.\nFocus areas: ${CATEGORY_FOCUS[category]}\nTone: Authoritative advisory\nLength: Max 30 words\nFormat: Single concise statement without quotes`,
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
