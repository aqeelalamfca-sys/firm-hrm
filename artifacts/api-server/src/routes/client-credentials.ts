import { Router } from "express";
import { db } from "@workspace/db";
import { clientCredentialsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireRoles, type AuthenticatedRequest } from "../middleware/auth";
import { encrypt, decrypt, maskPassword } from "../utils/encryption";
import { logActivity } from "../middleware/activity-logger";

const router = Router({ mergeParams: true });

router.get("/", async (req: AuthenticatedRequest, res) => {
  try {
    const clientId = Number(req.params.clientId);
    const credentials = await db.select().from(clientCredentialsTable)
      .where(eq(clientCredentialsTable.clientId, clientId));

    const masked = credentials.map((c: any) => ({
      id: c.id,
      clientId: c.clientId,
      portalName: c.portalName,
      loginId: c.loginId,
      maskedPassword: maskPassword(decrypt(c.encryptedPassword)),
      portalUrl: c.portalUrl,
      notes: c.notes,
      createdAt: c.createdAt,
    }));

    res.json(masked);
  } catch (error) {
    console.error("Error fetching credentials:", error);
    res.status(500).json({ error: "Failed to fetch credentials" });
  }
});

router.post("/", requireRoles("super_admin", "partner"), async (req: AuthenticatedRequest, res) => {
  try {
    const clientId = Number(req.params.clientId);
    const { portalName, loginId, password, portalUrl, notes } = req.body;

    const [credential] = await db.insert(clientCredentialsTable).values({
      clientId,
      portalName,
      loginId,
      encryptedPassword: encrypt(password),
      portalUrl: portalUrl || null,
      notes: notes || null,
      createdById: req.user!.id,
    }).returning();

    await logActivity({
      userId: req.user!.id,
      userName: req.user!.name,
      action: "create",
      module: "client_credentials",
      entityId: credential.id,
      entityType: "credential",
      description: `Added ${portalName} credential for client ${clientId}`,
      ipAddress: req.ip,
    });

    res.status(201).json({
      id: credential.id,
      clientId: credential.clientId,
      portalName: credential.portalName,
      loginId: credential.loginId,
      maskedPassword: "****",
      portalUrl: credential.portalUrl,
      notes: credential.notes,
      createdAt: credential.createdAt,
    });
  } catch (error) {
    console.error("Error creating credential:", error);
    res.status(500).json({ error: "Failed to create credential" });
  }
});

router.put("/:id", requireRoles("super_admin", "partner"), async (req: AuthenticatedRequest, res) => {
  try {
    const id = Number(req.params.id);
    const clientId = Number(req.params.clientId);
    const { portalName, loginId, password, portalUrl, notes } = req.body;

    const updateData: any = { updatedAt: new Date(), updatedById: req.user!.id };
    if (portalName) updateData.portalName = portalName;
    if (loginId) updateData.loginId = loginId;
    if (password) updateData.encryptedPassword = encrypt(password);
    if (portalUrl !== undefined) updateData.portalUrl = portalUrl;
    if (notes !== undefined) updateData.notes = notes;

    const [credential] = await db.update(clientCredentialsTable)
      .set(updateData)
      .where(and(eq(clientCredentialsTable.id, id), eq(clientCredentialsTable.clientId, clientId)))
      .returning();

    if (!credential) return res.status(404).json({ error: "Credential not found" });

    res.json({
      id: credential.id,
      clientId: credential.clientId,
      portalName: credential.portalName,
      loginId: credential.loginId,
      maskedPassword: "****",
      portalUrl: credential.portalUrl,
      notes: credential.notes,
      createdAt: credential.createdAt,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to update credential" });
  }
});

router.delete("/:id", requireRoles("super_admin", "partner"), async (req: AuthenticatedRequest, res) => {
  try {
    const id = Number(req.params.id);
    const clientId = Number(req.params.clientId);

    await db.delete(clientCredentialsTable)
      .where(and(eq(clientCredentialsTable.id, id), eq(clientCredentialsTable.clientId, clientId)));

    await logActivity({
      userId: req.user!.id,
      userName: req.user!.name,
      action: "delete",
      module: "client_credentials",
      entityId: id,
      entityType: "credential",
      description: `Deleted credential ${id} for client ${clientId}`,
      ipAddress: req.ip,
    });

    res.json({ message: "Credential deleted" });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete credential" });
  }
});

router.get("/:id/reveal", requireRoles("super_admin", "partner"), async (req: AuthenticatedRequest, res) => {
  try {
    const id = Number(req.params.id);
    const clientId = Number(req.params.clientId);

    const credential = (await db.select().from(clientCredentialsTable)
      .where(and(eq(clientCredentialsTable.id, id), eq(clientCredentialsTable.clientId, clientId))))[0];

    if (!credential) return res.status(404).json({ error: "Credential not found" });

    await logActivity({
      userId: req.user!.id,
      userName: req.user!.name,
      action: "view",
      module: "client_credentials",
      entityId: id,
      entityType: "credential",
      description: `Revealed ${credential.portalName} password for client ${clientId}`,
      ipAddress: req.ip,
    });

    res.json({ password: decrypt(credential.encryptedPassword) });
  } catch (error) {
    res.status(500).json({ error: "Failed to reveal credential" });
  }
});

export default router;
