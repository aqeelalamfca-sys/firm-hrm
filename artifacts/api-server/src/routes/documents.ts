import { Router } from "express";
import { db } from "@workspace/db";
import { documentsTable, clientsTable, usersTable } from "@workspace/db";
import { eq, desc, and, sql, isNull } from "drizzle-orm";
import { type AuthenticatedRequest } from "../middleware/auth";
import { logActivity } from "../middleware/activity-logger";
import path from "path";
import fs from "fs";

const router = Router();
const UPLOAD_DIR = path.join(process.cwd(), "uploads");

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const TRASH_RETENTION_DAYS = 30;

async function enrichDoc(doc: any) {
  const uploader = (await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, doc.uploadedById)))[0];
  let clientName = null;
  if (doc.clientId) {
    const client = (await db.select({ name: clientsTable.name }).from(clientsTable).where(eq(clientsTable.id, doc.clientId)))[0];
    clientName = client?.name || null;
  }
  let deletedByName = null;
  if (doc.deletedById) {
    const deleter = (await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, doc.deletedById)))[0];
    deletedByName = deleter?.name || null;
  }

  return {
    id: doc.id,
    fileName: doc.fileName,
    originalName: doc.originalName,
    fileSize: doc.fileSize,
    mimeType: doc.mimeType,
    category: doc.category,
    departmentId: doc.departmentId,
    clientId: doc.clientId,
    clientName,
    engagementId: doc.engagementId,
    taskId: doc.taskId,
    description: doc.description,
    version: doc.version,
    uploadedById: doc.uploadedById,
    uploadedByName: uploader?.name || "Unknown",
    isDeleted: doc.isDeleted,
    deletedAt: doc.deletedAt,
    deletedById: doc.deletedById,
    deletedByName,
    createdAt: doc.createdAt,
  };
}

router.get("/", async (req: AuthenticatedRequest, res) => {
  try {
    const { clientId, engagementId, category, departmentId, taskId } = req.query;
    const conditions: any[] = [eq(documentsTable.isDeleted, false)];
    if (clientId) conditions.push(eq(documentsTable.clientId, Number(clientId)));
    if (engagementId) conditions.push(eq(documentsTable.engagementId, Number(engagementId)));
    if (category) conditions.push(eq(documentsTable.category, category as any));
    if (departmentId) conditions.push(eq(documentsTable.departmentId, Number(departmentId as string)));
    if (taskId) conditions.push(eq(documentsTable.taskId, Number(taskId as string)));

    const whereClause = and(...conditions);

    const docs = await db.select().from(documentsTable)
      .where(whereClause)
      .orderBy(desc(documentsTable.createdAt));

    const enriched = await Promise.all(docs.map(enrichDoc));
    res.json(enriched);
  } catch (error) {
    console.error("Error fetching documents:", error);
    res.status(500).json({ error: "Failed to fetch documents" });
  }
});

router.get("/trash", async (req: AuthenticatedRequest, res) => {
  try {
    const docs = await db.select().from(documentsTable)
      .where(eq(documentsTable.isDeleted, true))
      .orderBy(desc(documentsTable.deletedAt));

    const enriched = await Promise.all(docs.map(async (doc) => {
      const enrichedDoc = await enrichDoc(doc);
      const deletedAt = doc.deletedAt ? new Date(doc.deletedAt) : new Date();
      const expiresAt = new Date(deletedAt.getTime() + TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000);
      const daysRemaining = Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
      return { ...enrichedDoc, expiresAt, daysRemaining };
    }));

    res.json(enriched);
  } catch (error) {
    console.error("Error fetching trash:", error);
    res.status(500).json({ error: "Failed to fetch trash" });
  }
});

router.put("/:id/restore", async (req: AuthenticatedRequest, res) => {
  try {
    const id = Number(req.params.id);
    const doc = (await db.select().from(documentsTable).where(eq(documentsTable.id, id)))[0];
    if (!doc) return res.status(404).json({ error: "Document not found" });
    if (!doc.isDeleted) return res.status(400).json({ error: "Document is not in trash" });

    const [restored] = await db.update(documentsTable).set({
      isDeleted: false,
      deletedAt: null,
      deletedById: null,
      updatedAt: new Date(),
    }).where(eq(documentsTable.id, id)).returning();

    await logActivity({
      userId: req.user!.id,
      userName: req.user!.name,
      action: "update",
      module: "documents",
      entityId: id,
      entityType: "document",
      description: `Restored document "${doc.originalName}" from trash`,
      ipAddress: req.ip,
    });

    const enriched = await enrichDoc(restored);
    res.json(enriched);
  } catch (error) {
    res.status(500).json({ error: "Failed to restore document" });
  }
});

router.post("/", async (req: AuthenticatedRequest, res) => {
  try {
    const { fileName, originalName, fileSize, mimeType, category, clientId, engagementId, taskId, description, filePath: fp, departmentId } = req.body;

    const [doc] = await db.insert(documentsTable).values({
      fileName: fileName || originalName,
      originalName,
      fileSize: fileSize || 0,
      mimeType: mimeType || "application/octet-stream",
      category: category || "other",
      departmentId: departmentId || null,
      clientId: clientId || null,
      engagementId: engagementId || null,
      taskId: taskId || null,
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

    const enriched = await enrichDoc(doc);
    res.status(201).json(enriched);
  } catch (error) {
    console.error("Error uploading document:", error);
    res.status(500).json({ error: "Failed to upload document" });
  }
});

router.post("/:id/version", async (req: AuthenticatedRequest, res) => {
  try {
    const parentId = Number(req.params.id);
    const parent = (await db.select().from(documentsTable).where(eq(documentsTable.id, parentId)))[0];
    if (!parent) return res.status(404).json({ error: "Parent document not found" });

    const siblings = await db.select().from(documentsTable)
      .where(eq(documentsTable.parentDocumentId, parentId));
    const maxVersion = Math.max(parent.version || 1, ...siblings.map(s => s.version || 1));

    const { fileName, originalName, fileSize, mimeType, description, filePath: fp } = req.body;

    const [doc] = await db.insert(documentsTable).values({
      fileName: fileName || originalName || parent.originalName,
      originalName: originalName || parent.originalName,
      fileSize: fileSize || parent.fileSize,
      mimeType: mimeType || parent.mimeType,
      category: parent.category,
      departmentId: parent.departmentId,
      clientId: parent.clientId,
      engagementId: parent.engagementId,
      taskId: parent.taskId,
      description: description || parent.description,
      uploadedById: req.user!.id,
      filePath: fp || `/uploads/${fileName || parent.fileName}`,
      version: maxVersion + 1,
      parentDocumentId: parentId,
    }).returning();

    await logActivity({
      userId: req.user!.id,
      userName: req.user!.name,
      action: "upload",
      module: "documents",
      entityId: doc.id,
      entityType: "document",
      description: `Uploaded v${doc.version} of "${doc.originalName}"`,
      ipAddress: req.ip,
    });

    const enriched = await enrichDoc(doc);
    res.status(201).json(enriched);
  } catch (error) {
    console.error("Error uploading new version:", error);
    res.status(500).json({ error: "Failed to upload new version" });
  }
});

router.get("/:id/versions", async (req: AuthenticatedRequest, res) => {
  try {
    const parentId = Number(req.params.id);
    const parent = (await db.select().from(documentsTable).where(eq(documentsTable.id, parentId)))[0];
    if (!parent) return res.status(404).json({ error: "Document not found" });

    const versions = await db.select().from(documentsTable)
      .where(eq(documentsTable.parentDocumentId, parentId))
      .orderBy(desc(documentsTable.createdAt));

    const allVersions = [parent, ...versions];
    const enriched = await Promise.all(allVersions.map(async (doc) => {
      const uploader = (await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, doc.uploadedById)))[0];
      return {
        id: doc.id,
        fileName: doc.fileName,
        originalName: doc.originalName,
        fileSize: doc.fileSize,
        version: doc.version,
        uploadedByName: uploader?.name || "Unknown",
        createdAt: doc.createdAt,
      };
    }));

    res.json(enriched.sort((a, b) => (b.version || 1) - (a.version || 1)));
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch versions" });
  }
});

router.get("/:id", async (req: AuthenticatedRequest, res) => {
  try {
    const id = Number(req.params.id);
    const doc = (await db.select().from(documentsTable).where(eq(documentsTable.id, id)))[0];
    if (!doc) return res.status(404).json({ error: "Document not found" });

    const enriched = await enrichDoc(doc);
    res.json(enriched);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch document" });
  }
});

router.delete("/:id", async (req: AuthenticatedRequest, res) => {
  try {
    const id = Number(req.params.id);
    const doc = (await db.select().from(documentsTable).where(eq(documentsTable.id, id)))[0];
    if (!doc) return res.status(404).json({ error: "Document not found" });

    await db.update(documentsTable).set({
      isDeleted: true,
      deletedAt: new Date(),
      deletedById: req.user!.id,
      updatedAt: new Date(),
    }).where(eq(documentsTable.id, id));

    await logActivity({
      userId: req.user!.id,
      userName: req.user!.name,
      action: "delete",
      module: "documents",
      entityId: id,
      entityType: "document",
      description: `Moved document "${doc.originalName}" to trash`,
      ipAddress: req.ip,
    });

    res.json({ message: "Document moved to trash" });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete document" });
  }
});

router.delete("/:id/permanent", async (req: AuthenticatedRequest, res) => {
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
      description: `Permanently deleted document "${doc.originalName}"`,
      ipAddress: req.ip,
    });

    res.json({ message: "Document permanently deleted" });
  } catch (error) {
    res.status(500).json({ error: "Failed to permanently delete document" });
  }
});

export default router;
