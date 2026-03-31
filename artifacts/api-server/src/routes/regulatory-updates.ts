import { Router } from "express";
import { db } from "@workspace/db";
import { regulatoryUpdatesTable, systemSettingsTable, autoGenLogsTable } from "@workspace/db";
import { eq, desc, and, sql } from "drizzle-orm";
import { authMiddleware, requireRoles } from "../middleware/auth";
import type { AuthenticatedRequest } from "../middleware/auth";
import OpenAI from "openai";
import { runAutoGeneration } from "../scheduler/auto-regulatory";

const router = Router();

async function getOpenAIClient(): Promise<OpenAI | null> {
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  if (apiKey) {
    return new OpenAI(baseURL ? { baseURL, apiKey } : { apiKey });
  }

  try {
    const settings = await db
      .select()
      .from(systemSettingsTable)
      .where(eq(systemSettingsTable.key, "chatgpt_api_key"))
      .limit(1);

    const storedKey = settings[0]?.value;
    if (storedKey && storedKey.startsWith("sk-") && storedKey.length > 20) {
      return new OpenAI({ apiKey: storedKey });
    }
  } catch (err) {
    console.error("Failed to read API key from database:", err);
  }

  return null;
}

router.get("/", async (_req, res) => {
  try {
    const updates = await db
      .select()
      .from(regulatoryUpdatesTable)
      .where(eq(regulatoryUpdatesTable.isActive, true))
      .orderBy(desc(regulatoryUpdatesTable.createdAt))
      .limit(50);

    res.json({ updates });
  } catch (error) {
    console.error("Error fetching regulatory updates:", error);
    res.status(500).json({ error: "Failed to fetch updates" });
  }
});

router.post("/", authMiddleware, requireRoles("super_admin", "partner"), async (req: AuthenticatedRequest, res) => {
  try {
    const { category, text, priority, source } = req.body;

    if (!category || !text) {
      return res.status(400).json({ error: "Category and text are required" });
    }

    const validCategories = ["FBR", "SECP", "PSX", "SBP"];
    if (!validCategories.includes(category)) {
      return res.status(400).json({ error: "Invalid category" });
    }

    const [update] = await db
      .insert(regulatoryUpdatesTable)
      .values({
        category,
        text,
        priority: priority || "medium",
        source: source || "manual",
        createdBy: req.user!.id,
        updatedBy: req.user!.id,
      })
      .returning();

    res.status(201).json(update);
  } catch (error) {
    console.error("Error creating regulatory update:", error);
    res.status(500).json({ error: "Failed to create update" });
  }
});

router.put("/:id", authMiddleware, requireRoles("super_admin", "partner"), async (req: AuthenticatedRequest, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });

    const { category, text, priority, isActive } = req.body;

    const updateData: Record<string, unknown> = { updatedBy: req.user!.id, updatedAt: new Date() };
    if (category !== undefined) updateData.category = category;
    if (text !== undefined) updateData.text = text;
    if (priority !== undefined) updateData.priority = priority;
    if (isActive !== undefined) updateData.isActive = isActive;

    const [updated] = await db
      .update(regulatoryUpdatesTable)
      .set(updateData)
      .where(eq(regulatoryUpdatesTable.id, id))
      .returning();

    if (!updated) return res.status(404).json({ error: "Update not found" });
    res.json(updated);
  } catch (error) {
    console.error("Error updating regulatory update:", error);
    res.status(500).json({ error: "Failed to update" });
  }
});

router.delete("/:id", authMiddleware, requireRoles("super_admin", "partner"), async (req: AuthenticatedRequest, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });

    const [deleted] = await db
      .delete(regulatoryUpdatesTable)
      .where(eq(regulatoryUpdatesTable.id, id))
      .returning();

    if (!deleted) return res.status(404).json({ error: "Update not found" });
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting regulatory update:", error);
    res.status(500).json({ error: "Failed to delete" });
  }
});

router.post("/generate-ai", authMiddleware, requireRoles("super_admin", "partner"), async (req: AuthenticatedRequest, res) => {
  try {
    const { category, topic } = req.body;

    if (!category) {
      return res.status(400).json({ error: "Category is required" });
    }

    const openai = await getOpenAIClient();
    if (!openai) {
      return res.status(503).json({ error: "AI service not configured. Please add your OpenAI API key in Settings." });
    }

    const CATEGORY_SYSTEM: Record<string, string> = {
      FBR: "You are a Pakistan FBR expert. Generate ONE short, professional, factual tax/regulatory update for a CA firm's ticker. Keep under 30 words. No quotation marks.",
      SECP: "You are a Pakistan SECP expert. Generate ONE short, professional corporate governance/compliance update for a CA firm's ticker. Keep under 30 words. No quotation marks.",
      PSX: "You are a Pakistan Stock Exchange analyst. Generate ONE short market update with specific stock names (OGDC, HBL, LUCK, ENGRO, PPL, PSO, FFC, HUBC, SYS, TRG, MARI), percentage movements, and buy/sell recommendations. Keep under 35 words. No quotation marks.",
      SBP: "You are a State Bank of Pakistan analyst. Generate ONE short update about KIBOR rates, currency exchange rates (USD/PKR, GBP/PKR, EUR/PKR, SAR/PKR, AED/PKR), SBP policy rate, savings scheme profit rates, or foreign reserves with realistic numbers. Keep under 35 words. No quotation marks.",
    };

    const CATEGORY_FOCUS: Record<string, string> = {
      FBR: "Tax deadlines, SROs, withholding tax, active taxpayer list, income tax returns, sales tax",
      SECP: "Company registration, annual returns, beneficial ownership, corporate governance, compliance",
      PSX: "KSE-100 movement, top gaining/losing stocks with %, buy/sell recommendations, sector performance, trading volume, IPOs",
      SBP: "Daily KIBOR rates, USD/PKR and major currency rates, policy rate, T-bill auctions, savings schemes (DSC, SSC, Behbood) profit rates, reserves",
    };

    const systemPrompt = CATEGORY_SYSTEM[category] || "You are a Pakistan regulatory expert. Generate a short, professional update for a CA firm. Keep under 30 words. No quotation marks.";
    const focusAreas = CATEGORY_FOCUS[category] || "";

    const prompt = topic
      ? `Generate a professional update about: ${topic}\n\nCategory: ${category}\nTone: Authoritative advisory\nLength: Max 35 words\nFormat: Single concise statement`
      : `Generate a unique professional update for ${category}.\nFocus areas: ${focusAreas}\nTone: Authoritative advisory\nLength: Max 35 words\nFormat: Single concise statement without quotes`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
      temperature: 0.9,
    });

    const generatedText = response.choices[0]?.message?.content?.trim();
    if (!generatedText) {
      return res.status(500).json({ error: "AI failed to generate content" });
    }

    const [update] = await db
      .insert(regulatoryUpdatesTable)
      .values({
        category,
        text: generatedText,
        priority: "medium",
        source: "ai",
        createdBy: req.user!.id,
        updatedBy: req.user!.id,
      })
      .returning();

    res.status(201).json(update);
  } catch (error) {
    console.error("Error generating AI update:", error);
    res.status(500).json({ error: "Failed to generate AI update" });
  }
});

router.post("/generate-ai-preview", authMiddleware, requireRoles("super_admin", "partner"), async (req: AuthenticatedRequest, res) => {
  try {
    const { category, topic } = req.body;

    if (!category) {
      return res.status(400).json({ error: "Category is required" });
    }

    const openai = await getOpenAIClient();
    if (!openai) {
      return res.status(503).json({ error: "AI service not configured. Please add your OpenAI API key in Settings." });
    }

    const prompt = topic
      ? `Generate a professional regulatory update about: ${topic}\n\nCategory: ${category}\nTone: Chartered Accountant advisory\nLength: Max 25 words\nFormat: Single concise statement`
      : `Generate latest professional regulatory update in 1 line:\n\nCategory: ${category}\nFocus: ${category === "FBR" ? "Tax deadline / SRO / ATL" : category === "SECP" ? "Company registration / compliance" : category === "PSX" ? "Stock market / listing rules" : "Banking regulations / monetary policy"}\nTone: Chartered Accountant advisory\nLength: Max 25 words`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are a Pakistan regulatory expert specializing in FBR, SECP, PSX, and SBP. Generate short, professional regulatory updates suitable for a Chartered Accountancy firm's clients. Be factual and concise.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const generatedText = response.choices[0]?.message?.content?.trim();
    if (!generatedText) {
      return res.status(500).json({ error: "AI failed to generate content" });
    }

    res.json({ text: generatedText });
  } catch (error) {
    console.error("Error generating AI preview:", error);
    res.status(500).json({ error: "Failed to generate AI preview" });
  }
});

router.get("/auto-gen-logs", authMiddleware, requireRoles("super_admin", "partner"), async (_req, res) => {
  try {
    const logs = await db
      .select()
      .from(autoGenLogsTable)
      .orderBy(desc(autoGenLogsTable.runAt))
      .limit(100);
    res.json({ logs });
  } catch (error) {
    console.error("Error fetching auto-gen logs:", error);
    res.status(500).json({ error: "Failed to fetch logs" });
  }
});

router.post("/auto-gen-trigger", authMiddleware, requireRoles("super_admin", "partner"), async (_req, res) => {
  try {
    await runAutoGeneration();
    res.json({ success: true, message: "Auto-generation triggered successfully" });
  } catch (error) {
    console.error("Error triggering auto-gen:", error);
    res.status(500).json({ error: "Failed to trigger auto-generation" });
  }
});

export default router;
