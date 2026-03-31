import { Router } from "express";
import { db } from "@workspace/db";
import { systemSettingsTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import type { AuthenticatedRequest } from "../middleware/auth";
import OpenAI from "openai";

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

function isValidBaseUrl(url: string): boolean {
  if (!url) return true;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    const host = parsed.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0" || host === "::1") return false;
    if (host.startsWith("10.") || host.startsWith("192.168.") || host.startsWith("172.") || host === "169.254.169.254") return false;
    return true;
  } catch {
    return false;
  }
}

const router = Router();

router.get("/", async (req: AuthenticatedRequest, res) => {
  try {
    const settings = await db.select().from(systemSettingsTable);
    const safe = settings.map((s: any) => {
      const isSensitive = s.key.toLowerCase().includes("key") || s.key.toLowerCase().includes("secret");
      return {
        id: s.id,
        key: s.key,
        value: isSensitive ? "" : s.value,
        configured: isSensitive ? s.value.length > 0 : undefined,
        description: s.description,
        updatedAt: s.updatedAt,
      };
    });
    res.json({ settings: safe });
  } catch (error) {
    console.error("Error fetching settings:", error);
    res.status(500).json({ error: "Failed to fetch settings" });
  }
});

router.post("/test-api-key", async (req: AuthenticatedRequest, res) => {
  try {
    const envBaseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
    const envApiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;

    let openai: OpenAI;
    let source = "env";
    let testModel = "gpt-4o";

    if (envApiKey) {
      openai = new OpenAI(envBaseURL ? { baseURL: envBaseURL, apiKey: envApiKey } : { apiKey: envApiKey });
    } else {
      const settingsKeys = ["chatgpt_api_key", "ai_provider", "ai_model", "ai_base_url"];
      const rows = await db
        .select()
        .from(systemSettingsTable)
        .where(inArray(systemSettingsTable.key, settingsKeys));

      const getVal = (key: string) => rows.find(r => r.key === key)?.value || "";
      const storedKey = getVal("chatgpt_api_key");
      const provider = getVal("ai_provider") || "openai";
      const customModel = getVal("ai_model");
      const customBaseUrl = getVal("ai_base_url");

      if (!storedKey || storedKey.length < 10) {
        return res.status(400).json({ error: "No API key configured. Please save a valid API key first." });
      }

      const baseURL = provider === "custom"
        ? customBaseUrl || "https://api.openai.com/v1"
        : PROVIDER_BASE_URLS[provider] || "https://api.openai.com/v1";

      testModel = customModel || PROVIDER_DEFAULT_MODELS[provider] || "gpt-4o";
      openai = new OpenAI({ apiKey: storedKey, baseURL });
      source = `database (${provider})`;
    }

    const response = await openai.chat.completions.create({
      model: testModel,
      messages: [{ role: "user", content: "Reply with exactly: OK" }],
      max_tokens: 5,
    });

    const reply = response.choices[0]?.message?.content?.trim();
    res.json({
      success: true,
      message: `AI connection working — ${source}, model: ${response.model || testModel}`,
      model: response.model || testModel,
      reply,
    });
  } catch (error: any) {
    const msg = error?.message || String(error);
    if (msg.includes("401") || msg.includes("Incorrect API key") || msg.includes("invalid x-api-key") || msg.includes("API key not valid")) {
      return res.status(400).json({ error: "Invalid API key. Please check and try again." });
    }
    if (msg.includes("429")) {
      return res.status(400).json({ error: "API rate limit exceeded. Try again later." });
    }
    if (msg.includes("insufficient_quota")) {
      return res.status(400).json({ error: "API key has insufficient quota/credits." });
    }
    if (msg.includes("model") && (msg.includes("not found") || msg.includes("does not exist"))) {
      return res.status(400).json({ error: `Model not found. Check the model name and try again. Details: ${msg.substring(0, 150)}` });
    }
    res.status(500).json({ error: `API test failed: ${msg.substring(0, 200)}` });
  }
});

router.get("/auto-gen-config", async (_req: AuthenticatedRequest, res) => {
  try {
    const settings = await db.select().from(systemSettingsTable);
    const getVal = (key: string, fallback: string) => settings.find((s: any) => s.key === key)?.value || fallback;

    res.json({
      enabled: getVal("auto_gen_enabled", "true") === "true",
      intervalHours: parseInt(getVal("auto_gen_interval_hours", "2"), 10),
    });
  } catch (error) {
    console.error("Error fetching auto-gen config:", error);
    res.status(500).json({ error: "Failed to fetch config" });
  }
});

router.put("/auto-gen-config", async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const { enabled, intervalHours } = req.body;

    const upsert = async (key: string, value: string, description: string) => {
      const existing = await db.select().from(systemSettingsTable).where(eq(systemSettingsTable.key, key)).limit(1);
      if (existing.length > 0) {
        await db.update(systemSettingsTable).set({ value, description, updatedBy: req.user!.id, updatedAt: new Date() }).where(eq(systemSettingsTable.key, key));
      } else {
        await db.insert(systemSettingsTable).values({ key, value, description, updatedBy: req.user!.id });
      }
    };

    if (typeof enabled === "boolean") {
      await upsert("auto_gen_enabled", String(enabled), "Enable/disable auto-generation of regulatory updates");
    }
    if (typeof intervalHours === "number" && intervalHours >= 1 && intervalHours <= 24) {
      await upsert("auto_gen_interval_hours", String(intervalHours), "Interval in hours between auto-generation runs");
    }

    const { updateSchedulerConfig } = await import("../scheduler/auto-regulatory");
    updateSchedulerConfig();

    res.json({ success: true });
  } catch (error) {
    console.error("Error updating auto-gen config:", error);
    res.status(500).json({ error: "Failed to update config" });
  }
});

router.put("/:key", async (req: AuthenticatedRequest, res) => {
  try {
    const key = req.params.key as string;
    const { value, description } = req.body;

    if (value === undefined || value === null) {
      return res.status(400).json({ error: "Value is required" });
    }

    if (key === "ai_base_url" && value && !isValidBaseUrl(value)) {
      return res.status(400).json({ error: "Invalid base URL. Must be HTTPS and not point to private/internal networks." });
    }

    if (!req.user?.id) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const existing = await db
      .select()
      .from(systemSettingsTable)
      .where(eq(systemSettingsTable.key, key))
      .limit(1);

    let result;
    if (existing.length > 0) {
      [result] = await db
        .update(systemSettingsTable)
        .set({ value, description, updatedBy: req.user.id, updatedAt: new Date() })
        .where(eq(systemSettingsTable.key, key))
        .returning();
    } else {
      [result] = await db
        .insert(systemSettingsTable)
        .values({ key, value, description, updatedBy: req.user.id })
        .returning();
    }

    const isSensitive = (key as string).toLowerCase().includes("key") || (key as string).toLowerCase().includes("secret");
    res.json({
      id: result.id,
      key: result.key,
      value: isSensitive ? "" : result.value,
      configured: isSensitive ? true : undefined,
      description: result.description,
      updatedAt: result.updatedAt,
    });
  } catch (error) {
    console.error("Error updating setting:", error);
    res.status(500).json({ error: "Failed to update setting" });
  }
});

router.delete("/:key", async (req: AuthenticatedRequest, res) => {
  try {
    const key = req.params.key as string;
    const [deleted] = await db
      .delete(systemSettingsTable)
      .where(eq(systemSettingsTable.key, key))
      .returning();

    if (!deleted) return res.status(404).json({ error: "Setting not found" });
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting setting:", error);
    res.status(500).json({ error: "Failed to delete setting" });
  }
});

export default router;
