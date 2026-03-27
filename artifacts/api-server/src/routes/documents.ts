import { Router } from "express";
import { db } from "@workspace/db";
import { documentsTable, clientsTable, usersTable } from "@workspace/db";
import { eq, desc, and, sql } from "drizzle-orm";
import { type AuthenticatedRequest } from "../middleware/auth";
import { logActivity } from "../middleware/activity-logger";
import path from "path";
import fs from "fs";

const router = Router();
const UPLOAD_DIR = path.join(process.cwd(), "uploads");

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

router.get("/", async (req: AuthenticatedRequest, res) => {
  try {
    const { clientId, engagementId, category } = req.query;
    const conditions: any[] = [];
    if (clientId) conditions.push(eq(documentsTable.clientId, Number(clientId)));
    if (engagementId) conditions.push(eq(documentsTable.engagementId, Number(engagementId)));
    if (category) conditions.push(eq(documentsTable.category, category as any));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const docs = await db.select().from(documentsTable)
      .where(whereClause)
      .orderBy(desc(documentsTable.createdAt));

    const enriched = await Promise.all(docs.map(async (doc) => {
      const uploader = (await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, doc.uploadedById)))[0];
      let clientName = null;
      if (doc.clientId) {
        const client = (await db.select({ name: clientsTable.name }).from(clientsTable).where(eq(clientsTable.id, doc.clientId)))[0];
        clientName = client?.name || null;
      }

      return {
        id: doc.id,
        fileName: doc.fileName,
        originalName: doc.originalName,
        fileSize: doc.fileSize,
        mimeType: doc.mimeType,
        category: doc.category,
        clientId: doc.clientId,
        clientName,
        engagementId: doc.engagementId,
        description: doc.description,
        version: doc.version,
        uploadedById: doc.uploadedById,
        uploadedByName: uploader?.name || "Unknown",
        createdAt: doc.createdAt,
      };
    }));

    res.json(enriched);
  } catch (error) {
    console.error("Error fetching documents:", error);
    res.status(500).json({ error: "Failed to fetch documents" });
  }
});

router.post("/", async (req: AuthenticatedRequest, res) => {
  try {
    const { fileName, originalName, fileSize, mimeType, category, clientId, engagementId, description, filePath: fp } = req.body;

    const [doc] = await db.insert(documentsTable).values({
      fileName: fileName || originalName,
      originalName,
      fileSize: fileSize || 0,
      mimeType: mimeType || "application/octet-stream",
      category: category || "other",
      clientId: clientId || null,
      engagementId: engagementId || null,
      description: description || null,
      uploadedById: req.user!.id,
      filePath: fp || `/uploads/${fileName}`,
    }).returning();

    await logActivity({
      userId: req.user!.id,
      userName: req.user!.name,
      action: "upload",
      module: "documents",
      entityId: doc.id,
      entityType: "document",
      description: `Uploaded document "${originalName}"`,
      ipAddress: req.ip,
    });

    const uploader = (await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, req.user!.id)))[0];

    res.status(201).json({
      id: doc.id,
      fileName: doc.fileName,
      originalName: doc.originalName,
      fileSize: doc.fileSize,
      mimeType: doc.mimeType,
      category: doc.category,
      clientId: doc.clientId,
      clientName: null,
      engagementId: doc.engagementId,
      description: doc.description,
      version: doc.version,
      uploadedById: doc.uploadedById,
      uploadedByName: uploader?.name || "Unknown",
      createdAt: doc.createdAt,
    });
  } catch (error) {
    console.error("Error uploading document:", error);
    res.status(500).json({ error: "Failed to upload document" });
  }
});

router.get("/:id", async (req: AuthenticatedRequest, res) => {
  try {
    const id = Number(req.params.id);
    const doc = (await db.select().from(documentsTable).where(eq(documentsTable.id, id)))[0];
    if (!doc) return res.status(404).json({ error: "Document not found" });

    const uploader = (await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, doc.uploadedById)))[0];

    res.json({
      id: doc.id,
      fileName: doc.fileName,
      originalName: doc.originalName,
      fileSize: doc.fileSize,
      mimeType: doc.mimeType,
      category: doc.category,
      clientId: doc.clientId,
      clientName: null,
      engagementId: doc.engagementId,
      description: doc.description,
      version: doc.version,
      uploadedById: doc.uploadedById,
      uploadedByName: uploader?.name || "Unknown",
      createdAt: doc.createdAt,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch document" });
  }
});

router.delete("/:id", async (req: AuthenticatedRequest, res) => {
  try {
    const id = Number(req.params.id);
    const doc = (await db.select().from(documentsTable).where(eq(documentsTable.id, id)))[0];
    if (!doc) return res.status(404).json({ error: "Document not found" });

    await db.delete(documentsTable).where(eq(documentsTable.id, id));

    await logActivity({
      userId: req.user!.id,
      userName: req.user!.name,
      action: "delete",
      module: "documents",
      entityId: id,
      entityType: "document",
      description: `Deleted document "${doc.originalName}"`,
      ipAddress: req.ip,
    });

    res.json({ message: "Document deleted" });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete document" });
  }
});

export default router;
