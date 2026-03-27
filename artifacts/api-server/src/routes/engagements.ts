import { Router } from "express";
import { db } from "@workspace/db";
import { engagementsTable, engagementAssignmentsTable, clientsTable, employeesTable } from "@workspace/db";
import { eq, desc, and, sql } from "drizzle-orm";
import { type AuthenticatedRequest } from "../middleware/auth";
import { logActivity } from "../middleware/activity-logger";

const router = Router();

function generateEngagementCode(): string {
  const num = Math.floor(Math.random() * 90000) + 10000;
  return `ENG-${num}`;
}

router.get("/", async (req: AuthenticatedRequest, res) => {
  try {
    const { clientId, status, type } = req.query;
    const conditions: any[] = [];
    if (clientId) conditions.push(eq(engagementsTable.clientId, Number(clientId)));
    if (status) conditions.push(eq(engagementsTable.status, status as any));
    if (type) conditions.push(eq(engagementsTable.type, type as any));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const engagements = await db.select({
      id: engagementsTable.id,
      engagementCode: engagementsTable.engagementCode,
      clientId: engagementsTable.clientId,
      title: engagementsTable.title,
      type: engagementsTable.type,
      status: engagementsTable.status,
      description: engagementsTable.description,
      startDate: engagementsTable.startDate,
      endDate: engagementsTable.endDate,
      partnerId: engagementsTable.partnerId,
      managerId: engagementsTable.managerId,
      budget: engagementsTable.budget,
      notes: engagementsTable.notes,
      createdAt: engagementsTable.createdAt,
    }).from(engagementsTable)
      .where(whereClause)
      .orderBy(desc(engagementsTable.createdAt));

    const enriched = await Promise.all(engagements.map(async (eng) => {
      const client = (await db.select({ name: clientsTable.name }).from(clientsTable).where(eq(clientsTable.id, eng.clientId)))[0];
      const assignmentCount = (await db.select({ count: sql<number>`count(*)::int` }).from(engagementAssignmentsTable).where(eq(engagementAssignmentsTable.engagementId, eng.id)))[0];

      let partnerName = null;
      let managerName = null;
      if (eng.partnerId) {
        const p = (await db.select({ firstName: employeesTable.firstName, lastName: employeesTable.lastName }).from(employeesTable).where(eq(employeesTable.id, eng.partnerId)))[0];
        if (p) partnerName = `${p.firstName} ${p.lastName}`;
      }
      if (eng.managerId) {
        const m = (await db.select({ firstName: employeesTable.firstName, lastName: employeesTable.lastName }).from(employeesTable).where(eq(employeesTable.id, eng.managerId)))[0];
        if (m) managerName = `${m.firstName} ${m.lastName}`;
      }

      return {
        ...eng,
        clientName: client?.name || "Unknown",
        partnerName,
        managerName,
        assignmentCount: assignmentCount?.count || 0,
      };
    }));

    res.json(enriched);
  } catch (error) {
    console.error("Error fetching engagements:", error);
    res.status(500).json({ error: "Failed to fetch engagements" });
  }
});

router.get("/:id", async (req: AuthenticatedRequest, res) => {
  try {
    const id = Number(req.params.id);
    const eng = (await db.select().from(engagementsTable).where(eq(engagementsTable.id, id)))[0];
    if (!eng) return res.status(404).json({ error: "Engagement not found" });

    const client = (await db.select({ name: clientsTable.name }).from(clientsTable).where(eq(clientsTable.id, eng.clientId)))[0];
    const assignmentCount = (await db.select({ count: sql<number>`count(*)::int` }).from(engagementAssignmentsTable).where(eq(engagementAssignmentsTable.engagementId, eng.id)))[0];

    let partnerName = null;
    let managerName = null;
    if (eng.partnerId) {
      const p = (await db.select({ firstName: employeesTable.firstName, lastName: employeesTable.lastName }).from(employeesTable).where(eq(employeesTable.id, eng.partnerId)))[0];
      if (p) partnerName = `${p.firstName} ${p.lastName}`;
    }
    if (eng.managerId) {
      const m = (await db.select({ firstName: employeesTable.firstName, lastName: employeesTable.lastName }).from(employeesTable).where(eq(employeesTable.id, eng.managerId)))[0];
      if (m) managerName = `${m.firstName} ${m.lastName}`;
    }

    res.json({
      ...eng,
      clientName: client?.name || "Unknown",
      partnerName,
      managerName,
      assignmentCount: assignmentCount?.count || 0,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch engagement" });
  }
});

router.post("/", async (req: AuthenticatedRequest, res) => {
  try {
    const { clientId, title, type, description, startDate, endDate, partnerId, managerId, budget, notes } = req.body;

    const [eng] = await db.insert(engagementsTable).values({
      engagementCode: generateEngagementCode(),
      clientId,
      title,
      type,
      description: description || null,
      startDate,
      endDate: endDate || null,
      partnerId: partnerId || null,
      managerId: managerId || null,
      budget: budget || null,
      notes: notes || null,
    }).returning();

    const client = (await db.select({ name: clientsTable.name }).from(clientsTable).where(eq(clientsTable.id, clientId)))[0];

    await logActivity({
      userId: req.user!.id,
      userName: req.user!.name,
      action: "create",
      module: "engagements",
      entityId: eng.id,
      entityType: "engagement",
      description: `Created engagement "${title}" for client ${client?.name || clientId}`,
      ipAddress: req.ip,
    });

    res.status(201).json({
      ...eng,
      clientName: client?.name || "Unknown",
      partnerName: null,
      managerName: null,
      assignmentCount: 0,
    });
  } catch (error) {
    console.error("Error creating engagement:", error);
    res.status(500).json({ error: "Failed to create engagement" });
  }
});

router.put("/:id", async (req: AuthenticatedRequest, res) => {
  try {
    const id = Number(req.params.id);
    const { title, type, status, description, startDate, endDate, partnerId, managerId, budget, notes } = req.body;

    const updateData: any = { updatedAt: new Date() };
    if (title) updateData.title = title;
    if (type) updateData.type = type;
    if (status) updateData.status = status;
    if (description !== undefined) updateData.description = description;
    if (startDate) updateData.startDate = startDate;
    if (endDate !== undefined) updateData.endDate = endDate;
    if (partnerId !== undefined) updateData.partnerId = partnerId;
    if (managerId !== undefined) updateData.managerId = managerId;
    if (budget !== undefined) updateData.budget = budget;
    if (notes !== undefined) updateData.notes = notes;

    const [eng] = await db.update(engagementsTable).set(updateData).where(eq(engagementsTable.id, id)).returning();
    if (!eng) return res.status(404).json({ error: "Engagement not found" });

    const client = (await db.select({ name: clientsTable.name }).from(clientsTable).where(eq(clientsTable.id, eng.clientId)))[0];
    const assignmentCount = (await db.select({ count: sql<number>`count(*)::int` }).from(engagementAssignmentsTable).where(eq(engagementAssignmentsTable.engagementId, eng.id)))[0];

    await logActivity({
      userId: req.user!.id,
      userName: req.user!.name,
      action: status ? "status_change" : "update",
      module: "engagements",
      entityId: id,
      entityType: "engagement",
      description: status ? `Changed engagement ${eng.engagementCode} status to ${status}` : `Updated engagement ${eng.engagementCode}`,
      ipAddress: req.ip,
    });

    res.json({
      ...eng,
      clientName: client?.name || "Unknown",
      partnerName: null,
      managerName: null,
      assignmentCount: assignmentCount?.count || 0,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to update engagement" });
  }
});

router.get("/:id/assignments", async (req: AuthenticatedRequest, res) => {
  try {
    const engagementId = Number(req.params.id);
    const assignments = await db.select().from(engagementAssignmentsTable)
      .where(eq(engagementAssignmentsTable.engagementId, engagementId));

    const enriched = await Promise.all(assignments.map(async (a) => {
      const emp = (await db.select({ firstName: employeesTable.firstName, lastName: employeesTable.lastName }).from(employeesTable).where(eq(employeesTable.id, a.employeeId)))[0];
      return {
        ...a,
        employeeName: emp ? `${emp.firstName} ${emp.lastName}` : "Unknown",
      };
    }));

    res.json(enriched);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch assignments" });
  }
});

router.post("/:id/assignments", async (req: AuthenticatedRequest, res) => {
  try {
    const engagementId = Number(req.params.id);
    const { employeeId, role, hoursAllocated, notes } = req.body;

    const [assignment] = await db.insert(engagementAssignmentsTable).values({
      engagementId,
      employeeId,
      role,
      hoursAllocated: hoursAllocated || null,
      notes: notes || null,
    }).returning();

    const emp = (await db.select({ firstName: employeesTable.firstName, lastName: employeesTable.lastName }).from(employeesTable).where(eq(employeesTable.id, employeeId)))[0];

    await logActivity({
      userId: req.user!.id,
      userName: req.user!.name,
      action: "create",
      module: "engagements",
      entityId: engagementId,
      entityType: "engagement_assignment",
      description: `Assigned ${emp ? `${emp.firstName} ${emp.lastName}` : employeeId} to engagement ${engagementId} as ${role}`,
      ipAddress: req.ip,
    });

    res.status(201).json({
      ...assignment,
      employeeName: emp ? `${emp.firstName} ${emp.lastName}` : "Unknown",
    });
  } catch (error) {
    console.error("Error creating assignment:", error);
    res.status(500).json({ error: "Failed to create assignment" });
  }
});

export default router;
