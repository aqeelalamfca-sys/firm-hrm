import { Router } from "express";
import { db } from "@workspace/db";
import { invoicesTable, clientsTable } from "@workspace/db";
import { eq, and, inArray, sql } from "drizzle-orm";
import { requireRoles } from "../middleware/auth";

const ADMIN_ROLES = ["super_admin", "hr_admin", "partner", "manager"];
const router = Router();

async function generateInvoiceNumber(): Promise<string> {
  const result = await db.select({ count: sql<number>`count(*)` }).from(invoicesTable);
  const count = Number(result[0].count) + 1;
  const year = new Date().getFullYear();
  return `INV-${year}-${String(count).padStart(4, "0")}`;
}

function formatInvoice(inv: any, clientName: string) {
  return {
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    clientId: inv.clientId,
    clientName,
    engagementId: inv.engagementId,
    departmentId: inv.departmentId,
    serviceType: inv.serviceType,
    description: inv.description,
    amount: Number(inv.amount),
    tax: Number(inv.tax),
    whtAmount: Number(inv.whtAmount || 0),
    gstAmount: Number(inv.gstAmount || 0),
    totalAmount: Number(inv.totalAmount),
    issueDate: inv.issueDate,
    dueDate: inv.dueDate,
    status: inv.status,
    paidAmount: Number(inv.paidAmount),
    paidDate: inv.paidDate,
    isRecurring: inv.isRecurring,
    recurringFrequency: inv.recurringFrequency,
    notes: inv.notes,
    createdAt: inv.createdAt,
  };
}

router.get("/aging", async (req, res) => {
  const invoices = await db.select().from(invoicesTable).where(eq(invoicesTable.status, "issued"));
  const today = new Date();

  const buckets = {
    current: [] as any[],
    thirtyDays: [] as any[],
    sixtyDays: [] as any[],
    ninetyDays: [] as any[],
    overNinetyDays: [] as any[],
  };

  let totalOutstanding = 0;

  for (const inv of invoices) {
    const clients = await db.select().from(clientsTable).where(eq(clientsTable.id, inv.clientId));
    const client = clients[0];
    const outstanding = Number(inv.totalAmount) - Number(inv.paidAmount);
    if (outstanding <= 0) continue;

    const dueDate = new Date(inv.dueDate);
    const daysOverdue = Math.max(0, Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)));
    totalOutstanding += outstanding;

    const entry = {
      clientId: inv.clientId,
      clientName: client?.name || "Unknown",
      invoiceNumber: inv.invoiceNumber,
      amount: outstanding,
      dueDate: inv.dueDate,
      daysOverdue,
    };

    if (daysOverdue === 0) buckets.current.push(entry);
    else if (daysOverdue <= 30) buckets.thirtyDays.push(entry);
    else if (daysOverdue <= 60) buckets.sixtyDays.push(entry);
    else if (daysOverdue <= 90) buckets.ninetyDays.push(entry);
    else buckets.overNinetyDays.push(entry);
  }

  res.json({ ...buckets, totalOutstanding });
});

router.get("/", async (req, res) => {
  const { clientId, status, fromDate, toDate, departmentId } = req.query;

  const conditions: any[] = [];
  if (clientId) conditions.push(eq(invoicesTable.clientId, parseInt(clientId as string)));
  if (status) conditions.push(eq(invoicesTable.status, status as any));
  if (departmentId) conditions.push(eq(invoicesTable.departmentId, Number(departmentId)));

  let invoices = conditions.length > 0
    ? await db.select().from(invoicesTable).where(and(...conditions))
    : await db.select().from(invoicesTable);

  if (fromDate) invoices = invoices.filter(i => new Date(i.issueDate) >= new Date(fromDate as string));
  if (toDate) invoices = invoices.filter(i => new Date(i.issueDate) <= new Date(toDate as string));

  if (invoices.length === 0) return res.json([]);

  const clientIds = [...new Set(invoices.map(i => i.clientId))];
  const clients = await db.select().from(clientsTable).where(inArray(clientsTable.id, clientIds));
  const clientMap = new Map(clients.map(c => [c.id, c.name]));

  const result = invoices.map(inv => formatInvoice(inv, clientMap.get(inv.clientId) || "Unknown"));
  res.json(result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
});

router.get("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const invoices = await db.select().from(invoicesTable).where(eq(invoicesTable.id, id));
  const inv = invoices[0];
  if (!inv) return res.status(404).json({ error: "Invoice not found" });

  const clients = await db.select().from(clientsTable).where(eq(clientsTable.id, inv.clientId));
  res.json(formatInvoice(inv, clients[0]?.name || "Unknown"));
});

router.post("/", async (req, res) => {
  const { clientId, engagementId, serviceType, description, amount, tax, gstPercent, whtPercent, issueDate, dueDate, notes, isRecurring, recurringFrequency, departmentId } = req.body;
  if (!clientId || !serviceType || !description || amount == null || !issueDate || !dueDate) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const invoiceNumber = await generateInvoiceNumber();
  const baseAmount = Number(amount);
  const gstRate = Number(gstPercent || 0);
  const whtRate = Number(whtPercent || 0);
  const gstAmount = (baseAmount * gstRate / 100);
  const whtAmount = (baseAmount * whtRate / 100);
  const totalAmount = baseAmount + gstAmount - whtAmount;
  const taxValue = Number(tax || gstAmount);

  const [inv] = await db.insert(invoicesTable).values({
    invoiceNumber,
    clientId: parseInt(clientId),
    engagementId: engagementId ? parseInt(engagementId) : null,
    departmentId: departmentId || null,
    serviceType,
    description,
    amount: baseAmount.toFixed(2),
    tax: taxValue.toFixed(2),
    gstAmount: gstAmount.toFixed(2),
    whtAmount: whtAmount.toFixed(2),
    totalAmount: totalAmount.toFixed(2),
    issueDate,
    dueDate,
    status: "draft",
    paidAmount: "0",
    isRecurring: isRecurring || false,
    recurringFrequency: recurringFrequency || null,
    notes: notes || null,
  }).returning();

  const clients = await db.select().from(clientsTable).where(eq(clientsTable.id, inv.clientId));
  res.status(201).json(formatInvoice(inv, clients[0]?.name || "Unknown"));
});

router.put("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const existing = await db.select().from(invoicesTable).where(eq(invoicesTable.id, id));
  if (!existing[0]) return res.status(404).json({ error: "Invoice not found" });
  const e = existing[0];

  if (!["draft", "approved"].includes(e.status)) {
    return res.status(409).json({ error: "Only draft or approved invoices can be edited" });
  }

  const updates: Record<string, any> = { updatedAt: new Date() };
  const fields = ["serviceType", "description", "issueDate", "dueDate", "notes"];
  for (const f of fields) {
    if (req.body[f] !== undefined) updates[f] = req.body[f];
  }
  if (req.body.clientId !== undefined) {
    const cId = parseInt(req.body.clientId);
    if (isNaN(cId)) return res.status(400).json({ error: "Invalid client ID" });
    updates.clientId = cId;
  }
  if (req.body.engagementId !== undefined) updates.engagementId = req.body.engagementId ? parseInt(req.body.engagementId) : null;
  if (req.body.departmentId !== undefined) updates.departmentId = req.body.departmentId || null;
  if (req.body.isRecurring !== undefined) {
    updates.isRecurring = req.body.isRecurring;
    updates.recurringFrequency = req.body.isRecurring ? (req.body.recurringFrequency || "monthly") : null;
  } else if (req.body.recurringFrequency !== undefined) {
    updates.recurringFrequency = req.body.recurringFrequency;
  }

  if (req.body.amount !== undefined || req.body.gstPercent !== undefined || req.body.whtPercent !== undefined) {
    const baseAmount = req.body.amount !== undefined ? Number(req.body.amount) : Number(e.amount);
    if (isNaN(baseAmount) || baseAmount < 0) return res.status(400).json({ error: "Invalid amount" });
    const gstRate = req.body.gstPercent !== undefined ? Number(req.body.gstPercent) : (Number(e.gstAmount) / Number(e.amount) * 100 || 0);
    const whtRate = req.body.whtPercent !== undefined ? Number(req.body.whtPercent) : (Number(e.whtAmount) / Number(e.amount) * 100 || 0);
    if (isNaN(gstRate) || gstRate < 0 || isNaN(whtRate) || whtRate < 0) return res.status(400).json({ error: "Invalid tax rate" });
    const gstAmount = baseAmount * gstRate / 100;
    const whtAmount = baseAmount * whtRate / 100;
    const totalAmount = baseAmount + gstAmount - whtAmount;
    updates.amount = baseAmount.toFixed(2);
    updates.gstAmount = gstAmount.toFixed(2);
    updates.whtAmount = whtAmount.toFixed(2);
    updates.tax = gstAmount.toFixed(2);
    updates.totalAmount = totalAmount.toFixed(2);
  }

  const [inv] = await db.update(invoicesTable).set(updates).where(eq(invoicesTable.id, id)).returning();
  const clients = await db.select().from(clientsTable).where(eq(clientsTable.id, inv.clientId));
  res.json(formatInvoice(inv, clients[0]?.name || "Unknown"));
});

router.put("/:id/status", async (req, res) => {
  const id = parseInt(req.params.id);
  const { status, paidAmount, paidDate, notes } = req.body;
  if (!status) return res.status(400).json({ error: "Status required" });

  const updates: Record<string, any> = { status, updatedAt: new Date() };
  if (paidAmount !== undefined) updates.paidAmount = Number(paidAmount).toFixed(2);
  if (paidDate !== undefined) updates.paidDate = paidDate;
  if (notes !== undefined) updates.notes = notes;

  const [inv] = await db.update(invoicesTable).set(updates).where(eq(invoicesTable.id, id)).returning();
  if (!inv) return res.status(404).json({ error: "Invoice not found" });

  const clients = await db.select().from(clientsTable).where(eq(clientsTable.id, inv.clientId));
  res.json(formatInvoice(inv, clients[0]?.name || "Unknown"));
});

router.delete("/:id", requireRoles(...ADMIN_ROLES), async (req, res) => {
  try {
    const id = parseInt(req.params.id as string);
    const [deleted] = await db.delete(invoicesTable).where(eq(invoicesTable.id, id)).returning();
    if (!deleted) return res.status(404).json({ error: "Invoice not found" });
    res.json({ message: "Invoice deleted successfully", id: deleted.id });
  } catch (error) {
    console.error("Error deleting invoice:", error);
    res.status(500).json({ error: "Failed to delete invoice" });
  }
});

export default router;
