import { Router } from "express";
import { db } from "@workspace/db";
import { invoicesTable, clientsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

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
  const { clientId, status, fromDate, toDate } = req.query;
  let invoices = await db.select().from(invoicesTable);

  if (clientId) invoices = invoices.filter(i => i.clientId === parseInt(clientId as string));
  if (status) invoices = invoices.filter(i => i.status === status);
  if (fromDate) invoices = invoices.filter(i => i.issueDate >= fromDate as string);
  if (toDate) invoices = invoices.filter(i => i.issueDate <= toDate as string);

  const result = await Promise.all(
    invoices.map(async (inv) => {
      const clients = await db.select().from(clientsTable).where(eq(clientsTable.id, inv.clientId));
      const client = clients[0];
      return formatInvoice(inv, client?.name || "Unknown");
    })
  );

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
  const { clientId, engagementId, serviceType, description, amount, tax, gstPercent, whtPercent, issueDate, dueDate, notes, isRecurring, recurringFrequency } = req.body;
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
  const updates: Record<string, any> = { updatedAt: new Date() };
  const fields = ["serviceType", "description", "dueDate", "notes"];
  for (const f of fields) {
    if (req.body[f] !== undefined) updates[f] = req.body[f];
  }
  if (req.body.amount !== undefined || req.body.tax !== undefined) {
    const existing = await db.select().from(invoicesTable).where(eq(invoicesTable.id, id));
    const e = existing[0];
    const amount = req.body.amount !== undefined ? Number(req.body.amount) : Number(e?.amount);
    const tax = req.body.tax !== undefined ? Number(req.body.tax) : Number(e?.tax);
    updates.amount = amount.toFixed(2);
    updates.tax = tax.toFixed(2);
    updates.totalAmount = (amount + tax).toFixed(2);
  }

  const [inv] = await db.update(invoicesTable).set(updates).where(eq(invoicesTable.id, id)).returning();
  if (!inv) return res.status(404).json({ error: "Invoice not found" });

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

export default router;
