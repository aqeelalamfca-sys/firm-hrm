import { Router } from "express";
import { db } from "@workspace/db";
import { departmentsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireRoles, type AuthenticatedRequest } from "../middleware/auth";

const router = Router();

router.get("/", async (req: AuthenticatedRequest, res) => {
  try {
    const departments = await db.select().from(departmentsTable).orderBy(departmentsTable.id);
    res.json(departments);
  } catch (error) {
    console.error("Error fetching departments:", error);
    res.status(500).json({ error: "Failed to fetch departments" });
  }
});

router.get("/:id", async (req: AuthenticatedRequest, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid department ID" });
    const [dept] = await db.select().from(departmentsTable).where(eq(departmentsTable.id, id));
    if (!dept) return res.status(404).json({ error: "Department not found" });
    res.json(dept);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch department" });
  }
});

export default router;
