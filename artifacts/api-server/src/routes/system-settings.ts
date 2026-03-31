import { Router } from "express";
import { db } from "@workspace/db";
import { systemSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { AuthenticatedRequest } from "../middleware/auth";
import OpenAI from "openai";

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
    const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
    const envApiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;

    let openai: OpenAI;
    let source = "env";

    if (baseURL && envApiKey) {
      openai = new OpenAI({ baseURL, apiKey: envApiKey });
    } else {
      const settings = await db
        .select()
        .from(systemSettingsTable)
        .where(eq(systemSettingsTable.key, "chatgpt_api_key"))
        .limit(1);

      const storedKey = settings[0]?.value;
      if (!storedKey || storedKey.length < 10) {
        return res.status(400).json({ error: "No API key configured. Please save a valid API key first." });
      }
      openai = new OpenAI({ apiKey: storedKey });
      source = "database";
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: "Reply with exactly: OK" }],
      max_tokens: 5,
    });

    const reply = response.choices[0]?.message?.content?.trim();
    res.json({
      success: true,
      message: `API key is working (source: ${source})`,
      model: response.model,
      reply,
    });
  } catch (error: any) {
    const msg = error?.message || String(error);
    if (msg.includes("401") || msg.includes("Incorrect API key")) {
      return res.status(400).json({ error: "Invalid API key. Please check and try again." });
    }
    if (msg.includes("429")) {
      return res.status(400).json({ error: "API rate limit exceeded. Try again later." });
    }
    if (msg.includes("insufficient_quota")) {
      return res.status(400).json({ error: "API key has insufficient quota/credits." });
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

    if (!value) {
      return res.status(400).json({ error: "Value is required" });
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
