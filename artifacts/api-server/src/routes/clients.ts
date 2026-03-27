import { Router } from "express";
import { db } from "@workspace/db";
import { clientsTable, invoicesTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

const router = Router();

async function generateClientCode(): Promise<string> {
  const result = await db.select({ count: sql<number>`count(*)` }).from(clientsTable);
  const count = Number(result[0].count) + 1;
  return `CLT${String(count).padStart(4, "0")}`;
}

async function getClientFinancials(clientId: number) {
  const invoices = await db.select().from(invoicesTable).where(eq(invoicesTable.clientId, clientId));
  const totalBilled = invoices.reduce((sum, i) => sum + Number(i.totalAmount), 0);
  const totalPaid = invoices.reduce((sum, i) => sum + Number(i.paidAmount), 0);
  return { totalBilled, totalPaid, outstandingBalance: totalBilled - totalPaid };
}

router.get("/", async (req, res) => {
  const { status } = req.query;
  let clients = await db.select().from(clientsTable);
  if (status) clients = clients.filter(c => c.status === status);

  const result = await Promise.all(
    clients.map(async (c) => {
      const financials = await getClientFinancials(c.id);
      return {
        id: c.id,
        clientCode: c.clientCode,
        name: c.name,
        contactPerson: c.contactPerson,
        email: c.email,
        phone: c.phone,
        address: c.address,
        industry: c.industry,
        status: c.status,
        ...financials,
        createdAt: c.createdAt,
      };
    })
  );

  res.json(result);
});

router.get("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const clients = await db.select().from(clientsTable).where(eq(clientsTable.id, id));
  const c = clients[0];
  if (!c) return res.status(404).json({ error: "Client not found" });

  const financials = await getClientFinancials(c.id);
  res.json({
    id: c.id,
    clientCode: c.clientCode,
    name: c.name,
    contactPerson: c.contactPerson,
    email: c.email,
    phone: c.phone,
    address: c.address,
    industry: c.industry,
    status: c.status,
    ...financials,
    createdAt: c.createdAt,
  });
});

router.post("/", async (req, res) => {
  const { name, contactPerson, email, phone, address, industry } = req.body;
  if (!name || !contactPerson || !email) {
    return res.status(400).json({ error: "Name, contact person, and email are required" });
  }

  const clientCode = await generateClientCode();
  const [client] = await db.insert(clientsTable).values({
    clientCode,
    name,
    contactPerson,
    email,
    phone: phone || null,
    address: address || null,
    industry: industry || null,
  }).returning();

  res.status(201).json({
    ...client,
    totalBilled: 0,
    totalPaid: 0,
    outstandingBalance: 0,
  });
});

router.put("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const updates: Record<string, any> = { updatedAt: new Date() };
  const fields = ["name", "contactPerson", "email", "phone", "address", "industry", "status"];
  for (const f of fields) {
    if (req.body[f] !== undefined) updates[f] = req.body[f];
  }

  const [client] = await db.update(clientsTable).set(updates).where(eq(clientsTable.id, id)).returning();
  if (!client) return res.status(404).json({ error: "Client not found" });

  const financials = await getClientFinancials(client.id);
  res.json({ ...client, ...financials });
});

export default router;
