import { Router } from "express";
import { db } from "@workspace/db";
import { systemSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { AuthenticatedRequest } from "../middleware/auth";

const router = Router();

router.get("/", async (req: AuthenticatedRequest, res) => {
  try {
    const settings = await db.select().from(systemSettingsTable);
    const safe = settings.map(s => {
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

router.put("/:key", async (req: AuthenticatedRequest, res) => {
  try {
    const { key } = req.params;
    const { value, description } = req.body;

    if (!value) {
      return res.status(400).json({ error: "Value is required" });
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
        .set({ value, description, updatedBy: req.user!.id, updatedAt: new Date() })
        .where(eq(systemSettingsTable.key, key))
        .returning();
    } else {
      [result] = await db
        .insert(systemSettingsTable)
        .values({ key, value, description, updatedBy: req.user!.id })
        .returning();
    }

    const isSensitive = key.toLowerCase().includes("key") || key.toLowerCase().includes("secret");
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
    const { key } = req.params;
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
