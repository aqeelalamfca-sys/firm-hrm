import { Router } from "express";
import { db } from "@workspace/db";
import { employeesTable, attendanceTable, leavesTable, invoicesTable, clientsTable, payrollTable, engagementsTable } from "@workspace/db";
import { eq, sql, and, ne, inArray } from "drizzle-orm";
import { type AuthenticatedRequest } from "../middleware/auth";

const router = Router();

router.get("/role-stats", async (req: AuthenticatedRequest, res) => {
  try {
    const role = req.user!.role;

    if (role === "super_admin" || role === "partner") {
      const [invoiceStats] = await db.select({
        totalRevenue: sql<number>`COALESCE(SUM(CASE WHEN status = 'paid' THEN total_amount ELSE 0 END), 0)`,
        totalReceivables: sql<number>`COALESCE(SUM(CASE WHEN status NOT IN ('paid','cancelled','draft') THEN total_amount ELSE 0 END), 0)`,
      }).from(invoicesTable);

      const [engagementStats] = await db.select({
        active: sql<number>`COUNT(*) FILTER (WHERE engagement_status IN ('execution','planning'))`,
        completed: sql<number>`COUNT(*) FILTER (WHERE engagement_status = 'completed')`,
      }).from(engagementsTable);

      const [clientStats] = await db.select({
        total: sql<number>`COUNT(*)`,
        active: sql<number>`COUNT(*) FILTER (WHERE status = 'active')`,
      }).from(clientsTable);

      const [empStats] = await db.select({
        total: sql<number>`COUNT(*)`,
        active: sql<number>`COUNT(*) FILTER (WHERE status = 'active')`,
      }).from(employeesTable);

      return res.json({
        type: "executive",
        totalRevenue: Number(invoiceStats.totalRevenue),
        totalReceivables: Number(invoiceStats.totalReceivables),
        activeEngagements: Number(engagementStats.active),
        completedEngagements: Number(engagementStats.completed),
        totalClients: Number(clientStats.total),
        activeClients: Number(clientStats.active),
        totalEmployees: Number(empStats.total),
        activeEmployees: Number(empStats.active),
      });
    }

    if (role === "finance_officer") {
      const [invoiceStats] = await db.select({
        totalBilled: sql<number>`COALESCE(SUM(total_amount), 0)`,
        totalPaid: sql<number>`COALESCE(SUM(CASE WHEN status = 'paid' THEN total_amount ELSE 0 END), 0)`,
        overdueCount: sql<number>`COUNT(*) FILTER (WHERE status = 'overdue')`,
      }).from(invoicesTable);

      const [payrollStats] = await db.select({
        totalPayroll: sql<number>`COALESCE(SUM(net_salary), 0)`,
        invoiceCount: sql<number>`COUNT(*)`,
      }).from(payrollTable);

      const [invoiceCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(invoicesTable);

      return res.json({
        type: "finance",
        totalBilled: Number(invoiceStats.totalBilled),
        totalPaid: Number(invoiceStats.totalPaid),
        totalOutstanding: Number(invoiceStats.totalBilled) - Number(invoiceStats.totalPaid),
        overdueInvoices: Number(invoiceStats.overdueCount),
        totalPayrollCost: Number(payrollStats.totalPayroll),
        invoiceCount: Number(invoiceCount.count),
      });
    }

    if (role === "hr_admin") {
      const today = new Date().toISOString().split("T")[0];

      const [empStats] = await db.select({
        total: sql<number>`COUNT(*)`,
        active: sql<number>`COUNT(*) FILTER (WHERE status = 'active')`,
      }).from(employeesTable);

      const [leaveStats] = await db.select({
        pending: sql<number>`COUNT(*) FILTER (WHERE status = 'pending')`,
      }).from(leavesTable);

      const [attendStats] = await db.select({
        present: sql<number>`COUNT(*) FILTER (WHERE date = ${today} AND status IN ('present','late'))`,
      }).from(attendanceTable);

      const deptRows = await db.select({
        department: employeesTable.department,
        count: sql<number>`COUNT(*)`,
      }).from(employeesTable).groupBy(employeesTable.department);

      return res.json({
        type: "hr",
        totalEmployees: Number(empStats.total),
        activeEmployees: Number(empStats.active),
        pendingLeaves: Number(leaveStats.pending),
        todayPresent: Number(attendStats.present),
        todayAbsent: Number(empStats.active) - Number(attendStats.present),
        departmentBreakdown: deptRows.map(r => ({ department: r.department || "Other", count: Number(r.count) })),
      });
    }

    const today = new Date().toISOString().split("T")[0];
    const [empStats] = await db.select({ total: sql<number>`COUNT(*)` }).from(employeesTable);
    const [attendStats] = await db.select({
      present: sql<number>`COUNT(*) FILTER (WHERE date = ${today} AND status IN ('present','late'))`,
    }).from(attendanceTable);

    return res.json({
      type: "employee",
      todayPresent: Number(attendStats.present),
      totalEmployees: Number(empStats.total),
    });
  } catch (error) {
    console.error("Error fetching role stats:", error);
    res.status(500).json({ error: "Failed to fetch role stats" });
  }
});

router.get("/stats", async (req, res) => {
  try {
    const today = new Date().toISOString().split("T")[0];
    const now = new Date();

    const [empStats] = await db.select({
      total: sql<number>`COUNT(*)`,
      active: sql<number>`COUNT(*) FILTER (WHERE status = 'active')`,
      onLeave: sql<number>`COUNT(*) FILTER (WHERE status = 'on_leave')`,
    }).from(employeesTable);

    const [attendStats] = await db.select({
      present: sql<number>`COUNT(*) FILTER (WHERE date = ${today} AND status IN ('present','late'))`,
      absent: sql<number>`COUNT(*) FILTER (WHERE date = ${today} AND status = 'absent')`,
    }).from(attendanceTable);

    const attendancePercentage = Number(empStats.active) > 0
      ? Math.round((Number(attendStats.present) / Number(empStats.active)) * 100)
      : 0;

    const [clientStats] = await db.select({
      total: sql<number>`COUNT(*)`,
      active: sql<number>`COUNT(*) FILTER (WHERE status = 'active')`,
    }).from(clientsTable);

    const [invoiceStats] = await db.select({
      pending: sql<number>`COUNT(*) FILTER (WHERE status IN ('approved','issued'))`,
      overdue: sql<number>`COUNT(*) FILTER (WHERE status = 'overdue')`,
      totalOutstanding: sql<number>`COALESCE(SUM(CASE WHEN status NOT IN ('paid','cancelled','draft') THEN total_amount - paid_amount ELSE 0 END), 0)`,
    }).from(invoicesTable);

    const [payrollStats] = await db.select({
      monthly: sql<number>`COALESCE(SUM(CASE WHEN year = ${now.getFullYear()} THEN net_salary ELSE 0 END), 0)`,
    }).from(payrollTable);

    const recentLeaveRows = await db.select().from(leavesTable)
      .orderBy(sql`created_at DESC`)
      .limit(5);

    const leaveEmpIds = recentLeaveRows.map(l => l.employeeId);
    const leaveEmps = leaveEmpIds.length > 0
      ? await db.select().from(employeesTable).where(inArray(employeesTable.id, leaveEmpIds))
      : [];
    const leaveEmpMap = new Map(leaveEmps.map(e => [e.id, `${e.firstName} ${e.lastName}`]));

    const recentLeaves = recentLeaveRows.map(l => ({
      id: l.id,
      employeeId: l.employeeId,
      employeeName: leaveEmpMap.get(l.employeeId) ?? "Unknown",
      leaveType: l.leaveType,
      fromDate: l.fromDate,
      toDate: l.toDate,
      totalDays: l.totalDays,
      reason: l.reason,
      status: l.status,
      approvedById: l.approvedById,
      approvedByName: null,
      approvalNotes: l.approvalNotes,
      createdAt: l.createdAt,
    }));

    res.json({
      totalEmployees: Number(empStats.total),
      activeEmployees: Number(empStats.active),
      onLeave: Number(empStats.onLeave),
      todayPresent: Number(attendStats.present),
      todayAbsent: Number(attendStats.absent),
      attendancePercentage,
      totalClients: Number(clientStats.total),
      activeClients: Number(clientStats.active),
      pendingInvoices: Number(invoiceStats.pending),
      overdueInvoices: Number(invoiceStats.overdue),
      totalOutstanding: Number(invoiceStats.totalOutstanding),
      monthlyPayroll: Number(payrollStats.monthly),
      recentLeaves,
    });
  } catch (error) {
    console.error("Error fetching stats:", error);
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

router.get("/attendance-trend", async (req, res) => {
  try {
    const last30Days = Array.from({ length: 30 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (29 - i));
      return d.toISOString().split("T")[0];
    });

    const records = await db.select().from(attendanceTable)
      .where(inArray(attendanceTable.date, last30Days));

    const byDate = new Map<string, { present: number; absent: number; late: number }>();
    for (const d of last30Days) byDate.set(d, { present: 0, absent: 0, late: 0 });
    for (const r of records) {
      const entry = byDate.get(r.date);
      if (!entry) continue;
      if (r.status === "present") entry.present++;
      else if (r.status === "late") { entry.present++; entry.late++; }
      else if (r.status === "absent") entry.absent++;
    }

    res.json(last30Days.map(date => ({ date, ...byDate.get(date) })));
  } catch (error) {
    console.error("Error fetching attendance trend:", error);
    res.status(500).json({ error: "Failed to fetch attendance trend" });
  }
});

router.get("/invoice-summary", async (req, res) => {
  try {
    const [statusStats] = await db.select({
      draft: sql<number>`COALESCE(SUM(CASE WHEN status = 'draft' THEN total_amount ELSE 0 END), 0)`,
      approved: sql<number>`COALESCE(SUM(CASE WHEN status = 'approved' THEN total_amount ELSE 0 END), 0)`,
      issued: sql<number>`COALESCE(SUM(CASE WHEN status = 'issued' THEN total_amount ELSE 0 END), 0)`,
      paid: sql<number>`COALESCE(SUM(CASE WHEN status = 'paid' THEN total_amount ELSE 0 END), 0)`,
      overdue: sql<number>`COALESCE(SUM(CASE WHEN status = 'overdue' THEN total_amount ELSE 0 END), 0)`,
    }).from(invoicesTable);

    const paidInvoices = await db.select({
      issueDate: invoicesTable.issueDate,
      totalAmount: invoicesTable.totalAmount,
    }).from(invoicesTable).where(eq(invoicesTable.status, "paid"));

    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const monthlyMap = new Map<string, { revenue: number; invoices: number }>();
    for (const inv of paidInvoices) {
      const d = new Date(inv.issueDate);
      const key = `${months[d.getMonth()]} ${d.getFullYear()}`;
      const existing = monthlyMap.get(key) || { revenue: 0, invoices: 0 };
      monthlyMap.set(key, { revenue: existing.revenue + Number(inv.totalAmount), invoices: existing.invoices + 1 });
    }

    const monthlyRevenue = Array.from(monthlyMap.entries()).map(([month, data]) => ({
      month, revenue: data.revenue, invoices: data.invoices,
    }));

    res.json({
      draft: Number(statusStats.draft),
      approved: Number(statusStats.approved),
      issued: Number(statusStats.issued),
      paid: Number(statusStats.paid),
      overdue: Number(statusStats.overdue),
      totalRevenue: Number(statusStats.paid),
      monthlyRevenue,
    });
  } catch (error) {
    console.error("Error fetching invoice summary:", error);
    res.status(500).json({ error: "Failed to fetch invoice summary" });
  }
});

export default router;
