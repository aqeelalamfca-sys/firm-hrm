import { Router } from "express";
import { db } from "@workspace/db";
import { employeesTable, attendanceTable, leavesTable, invoicesTable, clientsTable, payrollTable, engagementsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { type AuthenticatedRequest } from "../middleware/auth";

const router = Router();

router.get("/role-stats", async (req: AuthenticatedRequest, res) => {
  try {
    const role = req.user!.role;
    const userId = req.user!.id;

    if (role === "super_admin" || role === "partner") {
      const invoices = await db.select().from(invoicesTable);
      const totalRevenue = invoices.filter(i => i.status === "paid").reduce((s, i) => s + Number(i.totalAmount), 0);
      const totalReceivables = invoices.filter(i => i.status !== "paid" && i.status !== "cancelled" && i.status !== "draft").reduce((s, i) => s + Number(i.totalAmount), 0);
      const engagements = await db.select().from(engagementsTable);
      const activeEngagements = engagements.filter(e => e.status === "execution" || e.status === "planning").length;
      const completedEngagements = engagements.filter(e => e.status === "completed").length;
      const clients = await db.select().from(clientsTable);
      const employees = await db.select().from(employeesTable);

      return res.json({
        type: "executive",
        totalRevenue,
        totalReceivables,
        activeEngagements,
        completedEngagements,
        totalClients: clients.length,
        activeClients: clients.filter(c => c.status === "active").length,
        totalEmployees: employees.length,
        activeEmployees: employees.filter(e => e.status === "active").length,
      });
    }

    if (role === "finance_officer") {
      const invoices = await db.select().from(invoicesTable);
      const totalBilled = invoices.reduce((s, i) => s + Number(i.totalAmount), 0);
      const totalPaid = invoices.filter(i => i.status === "paid").reduce((s, i) => s + Number(i.totalAmount), 0);
      const overdueCount = invoices.filter(i => i.status === "overdue").length;
      const payroll = await db.select().from(payrollTable);
      const totalPayroll = payroll.reduce((s, p) => s + Number(p.netSalary), 0);

      return res.json({
        type: "finance",
        totalBilled,
        totalPaid,
        totalOutstanding: totalBilled - totalPaid,
        overdueInvoices: overdueCount,
        totalPayrollCost: totalPayroll,
        invoiceCount: invoices.length,
      });
    }

    if (role === "hr_admin") {
      const employees = await db.select().from(employeesTable);
      const leaves = await db.select().from(leavesTable);
      const pendingLeaves = leaves.filter(l => l.status === "pending").length;
      const today = new Date().toISOString().split("T")[0];
      const attendance = await db.select().from(attendanceTable);
      const todayPresent = attendance.filter(r => r.date === today && (r.status === "present" || r.status === "late")).length;

      return res.json({
        type: "hr",
        totalEmployees: employees.length,
        activeEmployees: employees.filter(e => e.status === "active").length,
        pendingLeaves,
        todayPresent,
        todayAbsent: employees.filter(e => e.status === "active").length - todayPresent,
        departmentBreakdown: Object.entries(employees.reduce((acc: Record<string, number>, e) => {
          acc[e.department || "Other"] = (acc[e.department || "Other"] || 0) + 1;
          return acc;
        }, {})).map(([dept, count]) => ({ department: dept, count })),
      });
    }

    const employees = await db.select().from(employeesTable);
    const today = new Date().toISOString().split("T")[0];
    const attendance = await db.select().from(attendanceTable);
    const myAttendance = attendance.filter(r => {
      const emp = employees.find(e => e.id === r.employeeId);
      return emp !== undefined;
    });
    const todayPresent = attendance.filter(r => r.date === today && (r.status === "present" || r.status === "late")).length;

    return res.json({
      type: "employee",
      todayPresent,
      totalEmployees: employees.length,
    });
  } catch (error) {
    console.error("Error fetching role stats:", error);
    res.status(500).json({ error: "Failed to fetch role stats" });
  }
});

router.get("/stats", async (req, res) => {
  const employees = await db.select().from(employeesTable);
  const totalEmployees = employees.length;
  const activeEmployees = employees.filter(e => e.status === "active").length;
  const onLeave = employees.filter(e => e.status === "on_leave").length;

  const today = new Date().toISOString().split("T")[0];
  const todayAttendance = await db.select().from(attendanceTable);
  const todayRecords = todayAttendance.filter(r => r.date === today);
  const todayPresent = todayRecords.filter(r => r.status === "present" || r.status === "late").length;
  const todayAbsent = todayRecords.filter(r => r.status === "absent").length;
  const attendancePercentage = activeEmployees > 0 ? Math.round((todayPresent / activeEmployees) * 100) : 0;

  const clients = await db.select().from(clientsTable);
  const totalClients = clients.length;
  const activeClients = clients.filter(c => c.status === "active").length;

  const invoices = await db.select().from(invoicesTable);
  const pendingInvoices = invoices.filter(i => i.status === "approved" || i.status === "issued").length;
  const overdueInvoices = invoices.filter(i => i.status === "overdue").length;
  const totalOutstanding = invoices
    .filter(i => i.status !== "paid" && i.status !== "cancelled" && i.status !== "draft")
    .reduce((sum, i) => sum + (Number(i.totalAmount) - Number(i.paidAmount)), 0);

  const now = new Date();
  const currentMonth = String(now.getMonth() + 1).padStart(2, "0");
  const currentYear = String(now.getFullYear());
  const payroll = await db.select().from(payrollTable);
  const monthlyPayroll = payroll
    .filter(p => p.month === `${currentMonth}-${currentYear}` || (p.year === now.getFullYear()))
    .reduce((sum, p) => sum + Number(p.netSalary), 0);

  const leaves = await db.select().from(leavesTable);
  const recentLeaves = leaves
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5)
    .map(l => {
      const emp = employees.find(e => e.id === l.employeeId);
      return {
        id: l.id,
        employeeId: l.employeeId,
        employeeName: emp ? `${emp.firstName} ${emp.lastName}` : "Unknown",
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
      };
    });

  res.json({
    totalEmployees,
    activeEmployees,
    onLeave,
    todayPresent,
    todayAbsent,
    attendancePercentage,
    totalClients,
    activeClients,
    pendingInvoices,
    overdueInvoices,
    totalOutstanding,
    monthlyPayroll,
    recentLeaves,
  });
});

router.get("/attendance-trend", async (req, res) => {
  const records = await db.select().from(attendanceTable);
  const last30Days = Array.from({ length: 30 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (29 - i));
    return d.toISOString().split("T")[0];
  });

  const trend = last30Days.map(date => {
    const dayRecords = records.filter(r => r.date === date);
    return {
      date,
      present: dayRecords.filter(r => r.status === "present" || r.status === "late").length,
      absent: dayRecords.filter(r => r.status === "absent").length,
      late: dayRecords.filter(r => r.status === "late").length,
    };
  });

  res.json(trend);
});

router.get("/invoice-summary", async (req, res) => {
  const invoices = await db.select().from(invoicesTable);

  const draft = invoices.filter(i => i.status === "draft").reduce((s, i) => s + Number(i.totalAmount), 0);
  const approved = invoices.filter(i => i.status === "approved").reduce((s, i) => s + Number(i.totalAmount), 0);
  const issued = invoices.filter(i => i.status === "issued").reduce((s, i) => s + Number(i.totalAmount), 0);
  const paid = invoices.filter(i => i.status === "paid").reduce((s, i) => s + Number(i.totalAmount), 0);
  const overdue = invoices.filter(i => i.status === "overdue").reduce((s, i) => s + Number(i.totalAmount), 0);
  const totalRevenue = paid;

  const monthlyMap = new Map<string, { revenue: number; invoices: number }>();
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  for (const inv of invoices.filter(i => i.status === "paid")) {
    const d = new Date(inv.issueDate);
    const key = `${months[d.getMonth()]} ${d.getFullYear()}`;
    const existing = monthlyMap.get(key) || { revenue: 0, invoices: 0 };
    monthlyMap.set(key, { revenue: existing.revenue + Number(inv.totalAmount), invoices: existing.invoices + 1 });
  }

  const monthlyRevenue = Array.from(monthlyMap.entries()).map(([month, data]) => ({
    month,
    revenue: data.revenue,
    invoices: data.invoices,
  }));

  res.json({ draft, approved, issued, paid, overdue, totalRevenue, monthlyRevenue });
});

export default router;
