import React from "react";
import { useGetDashboardStats, useGetAttendanceTrend, useGetInvoiceSummary } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import {
  Users, FileText, Banknote, CalendarCheck, TrendingUp, TrendingDown,
  ArrowRight, Clock, AlertCircle, CheckCircle, ChevronRight, ListTodo, Calendar,
  LogIn, LogOut as LogOutIcon, Palmtree, ClipboardList, Shield, BarChart3, Receipt,
  CheckCircle2, XCircle, Coffee
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend
} from "recharts";
import { useToast } from "@/hooks/use-toast";

const PIE_COLORS = {
  paid: '#10b981',
  issued: '#3b82f6',
  approved: '#8b5cf6',
  draft: '#94a3b8',
  overdue: '#ef4444',
};

const ROLE_CONFIG: Record<string, { label: string; color: string; bg: string; accent: string }> = {
  trainee: { label: "Trainee", color: "text-sky-700", bg: "bg-sky-50", accent: "border-sky-200" },
  employee: { label: "Employee", color: "text-sky-700", bg: "bg-sky-50", accent: "border-sky-200" },
  manager: { label: "Manager", color: "text-emerald-700", bg: "bg-emerald-50", accent: "border-emerald-200" },
  hr_admin: { label: "HR Admin", color: "text-emerald-700", bg: "bg-emerald-50", accent: "border-emerald-200" },
  finance_officer: { label: "Finance Officer", color: "text-amber-700", bg: "bg-amber-50", accent: "border-amber-200" },
  partner: { label: "Partner", color: "text-rose-700", bg: "bg-rose-50", accent: "border-rose-200" },
  super_admin: { label: "Super Admin", color: "text-rose-700", bg: "bg-rose-50", accent: "border-rose-200" },
};

function getPKTTime() {
  return new Date().toLocaleString("en-PK", {
    timeZone: "Asia/Karachi",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function Dashboard() {
  const { token, user } = useAuth();
  const { toast } = useToast();
  const requestOpts = { request: { headers: { Authorization: `Bearer ${token}` } } };
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };

  const { data: stats, isLoading: statsLoading } = useGetDashboardStats(requestOpts);
  const { data: trend } = useGetAttendanceTrend(requestOpts);
  const { data: invoiceSummary } = useGetInvoiceSummary(requestOpts);

  const [taskStats, setTaskStats] = React.useState<any>(null);
  const [myTasks, setMyTasks] = React.useState<any[]>([]);
  const [roleStats, setRoleStats] = React.useState<any>(null);
  const [pendingLeaves, setPendingLeaves] = React.useState<any[]>([]);
  const [myAttendance, setMyAttendance] = React.useState<any>(null);
  const [attendanceLoading, setAttendanceLoading] = React.useState(true);
  const [clockingIn, setClockingIn] = React.useState(false);
  const [pktTime, setPktTime] = React.useState(getPKTTime());

  React.useEffect(() => {
    const timer = setInterval(() => setPktTime(getPKTTime()), 60000);
    return () => clearInterval(timer);
  }, []);

  React.useEffect(() => {
    if (!token) return;
    fetch("/api/tasks/stats", { headers }).then(r => r.json()).then(setTaskStats).catch(() => {});
    fetch("/api/tasks", { headers }).then(r => r.json()).then((tasks: any[]) => {
      const sorted = tasks
        .filter((t: any) => t.status !== "completed")
        .sort((a: any, b: any) => (a.dueDate || "").localeCompare(b.dueDate || ""))
        .slice(0, 6);
      setMyTasks(sorted);
    }).catch(() => {});
    fetch("/api/dashboard/role-stats", { headers }).then(r => r.json()).then(setRoleStats).catch(() => {});
    fetch("/api/leaves", { headers }).then(r => r.json()).then((leaves: any[]) => {
      setPendingLeaves(leaves.filter((l: any) => l.status === "pending").slice(0, 5));
    }).catch(() => {});

    const today = new Date().toISOString().split("T")[0];
    setAttendanceLoading(true);
    fetch(`/api/attendance?date=${today}`, { headers }).then(r => r.json()).then((records: any[]) => {
      const mine = records.find((r: any) => r.employeeId === user?.id);
      setMyAttendance(mine || null);
    }).catch(() => {}).finally(() => setAttendanceLoading(false));
  }, [token]);

  async function handleTimeIn() {
    setClockingIn(true);
    try {
      const today = new Date().toISOString().split("T")[0];
      const now = new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Karachi" });
      const res = await fetch("/api/attendance", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId: user?.id, date: today, status: "present", checkIn: now }),
      });
      if (res.ok) {
        const record = await res.json();
        setMyAttendance(record);
        toast({ title: "Clocked in successfully" });
      } else {
        toast({ title: "Already marked or error", variant: "destructive" });
      }
    } catch { toast({ title: "Error clocking in", variant: "destructive" }); }
    finally { setClockingIn(false); }
  }

  async function handleLeaveAction(leaveId: number, status: "approved" | "rejected") {
    try {
      await fetch(`/api/leaves/${leaveId}`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      setPendingLeaves(prev => prev.filter(l => l.id !== leaveId));
      toast({ title: `Leave ${status}` });
    } catch { toast({ title: "Error updating leave", variant: "destructive" }); }
  }

  const safeStats = stats || { totalEmployees: 0, attendancePercentage: 0, pendingInvoices: 0, totalOutstanding: 0, recentLeaves: [] };
  const role = user?.role || "employee";
  const roleConf = ROLE_CONFIG[role] || ROLE_CONFIG.employee;
  const isPartnerOrAdmin = ["super_admin", "partner"].includes(role);
  const isManager = role === "manager";
  const isHrAdmin = role === "hr_admin";
  const isFinance = role === "finance_officer";
  const isTrainee = ["trainee", "employee"].includes(role);

  const invoiceData = invoiceSummary
    ? [
        { name: "Draft", value: invoiceSummary.draft, color: PIE_COLORS.draft },
        { name: "Issued", value: invoiceSummary.issued, color: PIE_COLORS.issued },
        { name: "Paid", value: invoiceSummary.paid, color: PIE_COLORS.paid },
        { name: "Overdue", value: invoiceSummary.overdue, color: PIE_COLORS.overdue },
      ].filter(d => d.value > 0)
    : [];

  const trendData = trend || [
    { date: "Mon", present: 4, absent: 1 },
    { date: "Tue", present: 5, absent: 0 },
    { date: "Wed", present: 3, absent: 2 },
    { date: "Thu", present: 5, absent: 0 },
    { date: "Fri", present: 4, absent: 1 },
  ];

  return (
    <div className="space-y-6 pb-10">
      {/* Welcome Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold tracking-tight">
              Welcome, {user?.name?.split(" ")[0]}
            </h1>
            <Badge className={`${roleConf.bg} ${roleConf.color} ${roleConf.accent} border text-[11px] font-semibold px-2 py-0.5`}>
              {roleConf.label}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">{pktTime}</p>
        </div>
        <div className="flex gap-2">
          {!isTrainee && (
            <Link href="/attendance">
              <Button variant="outline" size="sm" className="gap-2 text-[13px] h-8">
                <CalendarCheck className="w-3.5 h-3.5" /> Attendance
              </Button>
            </Link>
          )}
          {(isPartnerOrAdmin || isFinance) && (
            <Link href="/invoices">
              <Button size="sm" className="gap-2 text-[13px] h-8 shadow-sm">
                <FileText className="w-3.5 h-3.5" /> New Invoice
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* Top Action Cards Row */}
      <div className={`grid gap-4 ${isTrainee ? "grid-cols-1 sm:grid-cols-3" : isManager ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"}`}>
        {/* Time In / Time Out Card - All roles */}
        <Card className="border-border/50 shadow-xs">
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-sky-500/10 flex items-center justify-center">
                <Clock className="w-[18px] h-[18px] text-sky-600" />
              </div>
              <div>
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Attendance</p>
                <p className="text-sm font-semibold">
                  {attendanceLoading ? "..." : myAttendance?.status === "present" ? "Checked In" : "Not Checked In"}
                </p>
              </div>
            </div>
            {myAttendance?.checkIn && (
              <p className="text-xs text-muted-foreground mb-2">In: {myAttendance.checkIn}{myAttendance.checkOut ? ` · Out: ${myAttendance.checkOut}` : ""}</p>
            )}
            {!myAttendance && !attendanceLoading && (
              <Button size="sm" className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700 text-white h-9" onClick={handleTimeIn} disabled={clockingIn}>
                <LogIn className="w-3.5 h-3.5" />
                {clockingIn ? "Clocking in..." : "Time In"}
              </Button>
            )}
            {myAttendance?.status === "present" && !myAttendance.checkOut && (
              <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-700 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" /> You are clocked in
              </div>
            )}
          </CardContent>
        </Card>

        {/* Apply Leave - All roles */}
        <Card className="border-border/50 shadow-xs">
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                <Palmtree className="w-[18px] h-[18px] text-amber-600" />
              </div>
              <div>
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Leave</p>
                <p className="text-sm font-semibold">{pendingLeaves.filter(l => l.employeeId === user?.id).length} Pending</p>
              </div>
            </div>
            <Link href="/leaves">
              <Button variant="outline" size="sm" className="w-full gap-2 h-9 text-[13px]">
                <Palmtree className="w-3.5 h-3.5" /> Apply Leave
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* My Tasks - All roles */}
        {isTrainee && (
          <Card className="border-border/50 shadow-xs">
            <CardContent className="p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                  <ListTodo className="w-[18px] h-[18px] text-blue-600" />
                </div>
                <div>
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">My Tasks</p>
                  <p className="text-sm font-semibold">{taskStats?.total || 0} Total</p>
                </div>
              </div>
              <div className="flex gap-2 text-xs">
                <span className="px-2 py-1 rounded-md bg-amber-50 text-amber-700 font-medium">{taskStats?.pending || 0} Pending</span>
                <span className="px-2 py-1 rounded-md bg-emerald-50 text-emerald-700 font-medium">{taskStats?.completed || 0} Done</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Staff Status - Manager/HR/Partner */}
        {(isManager || isHrAdmin || isPartnerOrAdmin) && (
          <Card className="border-border/50 shadow-xs">
            <CardContent className="p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                  <Users className="w-[18px] h-[18px] text-emerald-600" />
                </div>
                <div>
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Staff Status</p>
                  <p className="text-sm font-semibold">{safeStats.totalEmployees} Staff</p>
                </div>
              </div>
              <div className="flex gap-2 text-xs">
                <span className="px-2 py-1 rounded-md bg-emerald-50 text-emerald-700 font-medium">
                  {roleStats?.todayPresent ?? Math.round(safeStats.totalEmployees * safeStats.attendancePercentage / 100)} Present
                </span>
                <span className="px-2 py-1 rounded-md bg-red-50 text-red-700 font-medium">
                  {roleStats?.todayAbsent ?? safeStats.totalEmployees - Math.round(safeStats.totalEmployees * safeStats.attendancePercentage / 100)} Absent
                </span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Invoices - Partner/Finance */}
        {(isPartnerOrAdmin || isFinance) && (
          <Card className="border-border/50 shadow-xs">
            <CardContent className="p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center">
                  <Receipt className="w-[18px] h-[18px] text-violet-600" />
                </div>
                <div>
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Invoices</p>
                  <p className="text-sm font-semibold">{safeStats.pendingInvoices} Pending</p>
                </div>
              </div>
              <div className="flex gap-2 text-xs">
                <span className="px-2 py-1 rounded-md bg-emerald-50 text-emerald-700 font-medium">
                  {invoiceSummary?.paid || 0} Paid
                </span>
                <span className="px-2 py-1 rounded-md bg-red-50 text-red-700 font-medium">
                  {invoiceSummary?.overdue || 0} Overdue
                </span>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Role-Specific Overview Panels */}
      {roleStats && roleStats.type === "executive" && (
        <Card className="border-border/50 shadow-xs overflow-hidden">
          <div className="h-1 bg-gradient-to-r from-rose-500 via-rose-400 to-rose-300" />
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Shield className="w-4 h-4 text-rose-600" /> Executive Overview
            </CardTitle>
            <CardDescription className="text-xs">Firm-wide performance metrics</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatBox label="Total Revenue" value={`Rs. ${(roleStats.totalRevenue / 1000).toFixed(0)}K`} color="violet" />
              <StatBox label="Receivables" value={`Rs. ${(roleStats.totalReceivables / 1000).toFixed(0)}K`} color="amber" />
              <StatBox label="Active Engagements" value={roleStats.activeEngagements} color="blue" />
              <StatBox label="Active Clients" value={`${roleStats.activeClients}/${roleStats.totalClients}`} color="emerald" />
            </div>
          </CardContent>
        </Card>
      )}

      {roleStats && roleStats.type === "finance" && (
        <Card className="border-border/50 shadow-xs overflow-hidden">
          <div className="h-1 bg-gradient-to-r from-amber-500 via-amber-400 to-amber-300" />
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Banknote className="w-4 h-4 text-amber-600" /> Finance Overview
            </CardTitle>
            <CardDescription className="text-xs">Billing and collections summary</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatBox label="Total Collected" value={`Rs. ${(roleStats.totalPaid / 1000).toFixed(0)}K`} color="emerald" />
              <StatBox label="Outstanding" value={`Rs. ${(roleStats.totalOutstanding / 1000).toFixed(0)}K`} color="amber" />
              <StatBox label="Overdue Invoices" value={roleStats.overdueInvoices} color="red" />
              <StatBox label="Total Payroll" value={`Rs. ${(roleStats.totalPayrollCost / 1000).toFixed(0)}K`} color="blue" />
            </div>
          </CardContent>
        </Card>
      )}

      {roleStats && roleStats.type === "hr" && (
        <Card className="border-border/50 shadow-xs overflow-hidden">
          <div className="h-1 bg-gradient-to-r from-emerald-500 via-emerald-400 to-emerald-300" />
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Users className="w-4 h-4 text-emerald-600" /> HR Overview
            </CardTitle>
            <CardDescription className="text-xs">Workforce and attendance summary</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatBox label="Active Employees" value={`${roleStats.activeEmployees}/${roleStats.totalEmployees}`} color="blue" />
              <StatBox label="Present Today" value={roleStats.todayPresent} color="emerald" />
              <StatBox label="Absent Today" value={roleStats.todayAbsent} color="red" />
              <StatBox label="Pending Leaves" value={roleStats.pendingLeaves} color="amber" />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Leave Approvals - Manager/HR/Partner */}
      {(isManager || isHrAdmin || isPartnerOrAdmin) && pendingLeaves.length > 0 && (
        <Card className="border-border/50 shadow-xs">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Palmtree className="w-4 h-4 text-amber-600" /> Leave Requests
                </CardTitle>
                <CardDescription className="text-xs mt-0.5">{pendingLeaves.length} pending approval{pendingLeaves.length > 1 ? "s" : ""}</CardDescription>
              </div>
              <Link href="/leaves">
                <Button variant="ghost" size="sm" className="text-xs text-muted-foreground gap-1">
                  View All <ChevronRight className="w-3 h-3" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {pendingLeaves.map((leave: any) => (
                <div key={leave.id} className="flex items-center justify-between p-3 rounded-xl bg-muted/30 hover:bg-muted/40 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
                      {leave.employeeName?.charAt(0) || "E"}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{leave.employeeName}</p>
                      <p className="text-xs text-muted-foreground capitalize">
                        {leave.leaveType} · {leave.totalDays} day{leave.totalDays !== 1 ? "s" : ""} · {new Date(leave.fromDate).toLocaleDateString("en-PK", { day: "numeric", month: "short" })}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    <Button size="sm" className="h-7 px-3 text-[11px] bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => handleLeaveAction(leave.id, "approved")}>
                      Approve
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 px-3 text-[11px] border-red-200 text-red-600 hover:bg-red-50" onClick={() => handleLeaveAction(leave.id, "rejected")}>
                      Reject
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Charts Row */}
      {!isTrainee && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <Card className="lg:col-span-2 border-border/50 shadow-xs">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-semibold">Weekly Attendance Trend</CardTitle>
                  <CardDescription className="text-xs mt-0.5">Present vs absent employees this week</CardDescription>
                </div>
                <Link href="/attendance">
                  <Button variant="ghost" size="sm" className="text-xs text-muted-foreground gap-1">
                    View All <ChevronRight className="w-3 h-3" />
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trendData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                    <defs>
                      <linearGradient id="presentGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="absentGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.12} />
                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} dy={8} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} allowDecimals={false} />
                    <RechartsTooltip contentStyle={{ borderRadius: "10px", border: "1px solid hsl(var(--border))", fontSize: 12, boxShadow: "0 4px 12px rgba(0,0,0,0.06)" }} />
                    <Area type="monotone" dataKey="present" name="Present" stroke="hsl(var(--primary))" strokeWidth={2} fillOpacity={1} fill="url(#presentGrad)" dot={{ fill: "hsl(var(--primary))", r: 3 }} />
                    <Area type="monotone" dataKey="absent" name="Absent" stroke="#ef4444" strokeWidth={1.5} strokeDasharray="4 4" fillOpacity={1} fill="url(#absentGrad)" dot={{ fill: "#ef4444", r: 3 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {(isPartnerOrAdmin || isFinance) && invoiceData.length > 0 && (
            <Card className="border-border/50 shadow-xs">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base font-semibold">Invoice Status</CardTitle>
                    <CardDescription className="text-xs mt-0.5">By payment status</CardDescription>
                  </div>
                  <Link href="/invoices">
                    <Button variant="ghost" size="sm" className="text-xs text-muted-foreground gap-1">
                      View <ChevronRight className="w-3 h-3" />
                    </Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent>
                <div className="h-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={invoiceData} cx="50%" cy="45%" innerRadius={60} outerRadius={82} paddingAngle={4} dataKey="value" stroke="none">
                        {invoiceData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <RechartsTooltip contentStyle={{ borderRadius: "10px", border: "none", fontSize: 12, boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }} />
                      <Legend verticalAlign="bottom" height={36} iconType="circle" iconSize={8} formatter={(value) => <span style={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }}>{value}</span>} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          {(isManager || isHrAdmin) && !isPartnerOrAdmin && !isFinance && (
            <Card className="border-border/50 shadow-xs">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold">Task Distribution</CardTitle>
                <CardDescription className="text-xs mt-0.5">Current workload</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3">
                  <div className="text-center p-3 rounded-xl bg-slate-50 border border-slate-100">
                    <p className="text-xl font-bold text-slate-700">{taskStats?.pending || 0}</p>
                    <p className="text-[11px] text-slate-500 font-medium">Pending</p>
                  </div>
                  <div className="text-center p-3 rounded-xl bg-blue-50 border border-blue-100">
                    <p className="text-xl font-bold text-blue-700">{taskStats?.inProgress || 0}</p>
                    <p className="text-[11px] text-blue-500 font-medium">Active</p>
                  </div>
                  <div className="text-center p-3 rounded-xl bg-emerald-50 border border-emerald-100">
                    <p className="text-xl font-bold text-emerald-700">{taskStats?.completed || 0}</p>
                    <p className="text-[11px] text-emerald-500 font-medium">Done</p>
                  </div>
                  <div className="text-center p-3 rounded-xl bg-red-50 border border-red-100">
                    <p className="text-xl font-bold text-red-700">{taskStats?.overdue || 0}</p>
                    <p className="text-[11px] text-red-500 font-medium">Overdue</p>
                  </div>
                </div>
                {taskStats?.dueToday > 0 && (
                  <div className="mt-3 p-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700 flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5" />
                    <span><strong>{taskStats.dueToday}</strong> task{taskStats.dueToday > 1 ? "s" : ""} due today</span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Task List - All roles */}
      <div className={`grid grid-cols-1 ${isTrainee ? "" : "lg:grid-cols-2"} gap-5`}>
        <Card className="border-border/50 shadow-xs">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <ListTodo className="w-4 h-4 text-primary" />
                  {isTrainee ? "My Tasks" : "Task Overview"}
                </CardTitle>
                <CardDescription className="text-xs mt-0.5">
                  {isTrainee ? "Tasks assigned to you" : "Upcoming deadlines"}
                </CardDescription>
              </div>
              <Link href="/task-scheduler">
                <Button variant="ghost" size="sm" className="text-xs text-muted-foreground gap-1">
                  View All <ChevronRight className="w-3 h-3" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {myTasks.length === 0 ? (
              <div className="text-center py-8">
                <CheckCircle className="w-8 h-8 text-muted-foreground/20 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No pending tasks</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {myTasks.map((t: any) => {
                  const isOverdue = t.status !== "completed" && t.dueDate && t.dueDate < new Date().toISOString().split("T")[0];
                  const statusColors: Record<string, string> = {
                    pending: "bg-slate-300",
                    in_progress: "bg-blue-500",
                    review: "bg-violet-500",
                    completed: "bg-emerald-500",
                  };
                  return (
                    <div key={t.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/25 hover:bg-muted/40 transition-colors">
                      <div className={`w-1.5 h-8 rounded-full ${isOverdue ? "bg-red-500" : statusColors[t.status] || "bg-slate-300"}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{t.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {t.dueDate ? `Due: ${new Date(t.dueDate).toLocaleDateString("en-PK", { day: "numeric", month: "short" })}` : "No due date"}
                          {t.assignedToName && !isTrainee ? ` · ${t.assignedToName}` : ""}
                        </p>
                      </div>
                      <Badge className={`text-[10px] px-1.5 ${
                        isOverdue ? "bg-red-100 text-red-700 border-red-200" :
                        t.status === "in_progress" ? "bg-blue-50 text-blue-700 border-blue-200" :
                        t.status === "completed" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                        "bg-slate-50 text-slate-600 border-slate-200"
                      } border`}>
                        {isOverdue ? "Overdue" : t.status?.replace("_", " ")}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions - Non-trainee */}
        {!isTrainee && (
          <Card className="border-border/50 shadow-xs">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">Quick Actions</CardTitle>
              <CardDescription className="text-xs">Common tasks at a glance</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2.5">
                {getQuickActions(role).map(({ label, href, icon: Icon, color }) => (
                  <Link key={label} href={href}>
                    <button className={`w-full flex items-center gap-2.5 p-3 rounded-xl border text-[13px] font-medium transition-all ${color}`}>
                      <Icon className="w-4 h-4 shrink-0" />
                      <span className="text-left leading-tight">{label}</span>
                    </button>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Partner/Admin: Invoice Status Table */}
      {(isPartnerOrAdmin || isFinance) && (
        <Card className="border-border/50 shadow-xs">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-violet-600" /> Outstanding Balance
                </CardTitle>
                <CardDescription className="text-xs mt-0.5">Rs. {((safeStats.totalOutstanding || 0) / 1000).toFixed(0)}K total receivables</CardDescription>
              </div>
              <Link href="/invoices">
                <Button variant="ghost" size="sm" className="text-xs text-muted-foreground gap-1">
                  All Invoices <ChevronRight className="w-3 h-3" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center p-3 rounded-xl bg-emerald-50 border border-emerald-100">
                <p className="text-lg font-bold text-emerald-700">{invoiceSummary?.paid || 0}</p>
                <p className="text-[11px] text-emerald-600 font-medium">Paid</p>
              </div>
              <div className="text-center p-3 rounded-xl bg-amber-50 border border-amber-100">
                <p className="text-lg font-bold text-amber-700">{(invoiceSummary?.issued || 0) + (invoiceSummary?.draft || 0)}</p>
                <p className="text-[11px] text-amber-600 font-medium">Pending</p>
              </div>
              <div className="text-center p-3 rounded-xl bg-red-50 border border-red-100">
                <p className="text-lg font-bold text-red-700">{invoiceSummary?.overdue || 0}</p>
                <p className="text-[11px] text-red-600 font-medium">Overdue</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Manager/Partner: Payroll Action */}
      {(isManager || isPartnerOrAdmin) && (
        <Card className="border-border/50 shadow-xs">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Banknote className="w-4 h-4 text-emerald-600" /> Payroll
                </CardTitle>
                <CardDescription className="text-xs mt-0.5">
                  {isPartnerOrAdmin ? "Review and approve payroll" : "Run monthly payroll"}
                </CardDescription>
              </div>
              <Link href="/payroll">
                <Button size="sm" className="gap-2 text-[13px] h-8 shadow-sm">
                  <Banknote className="w-3.5 h-3.5" />
                  {isPartnerOrAdmin ? "Approve Payroll" : "Run Payroll"}
                </Button>
              </Link>
            </div>
          </CardHeader>
        </Card>
      )}
    </div>
  );
}

function StatBox({ label, value, color }: { label: string; value: string | number; color: string }) {
  const colorMap: Record<string, string> = {
    violet: "bg-violet-50 border-violet-100 text-violet-700",
    amber: "bg-amber-50 border-amber-100 text-amber-700",
    blue: "bg-blue-50 border-blue-100 text-blue-700",
    emerald: "bg-emerald-50 border-emerald-100 text-emerald-700",
    red: "bg-red-50 border-red-100 text-red-700",
  };
  const textMap: Record<string, string> = {
    violet: "text-violet-500",
    amber: "text-amber-500",
    blue: "text-blue-500",
    emerald: "text-emerald-500",
    red: "text-red-500",
  };
  return (
    <div className={`text-center p-3 rounded-xl border ${colorMap[color]}`}>
      <p className="text-lg font-bold">{value}</p>
      <p className={`text-[11px] font-medium ${textMap[color]}`}>{label}</p>
    </div>
  );
}

function getQuickActions(role: string) {
  const all = [
    { label: "Mark Attendance", href: "/attendance", icon: CalendarCheck, color: "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-100", roles: ["super_admin", "partner", "hr_admin", "manager"] },
    { label: "Create Invoice", href: "/invoices", icon: FileText, color: "bg-violet-50 text-violet-700 hover:bg-violet-100 border-violet-100", roles: ["super_admin", "partner", "finance_officer", "manager"] },
    { label: "Add Employee", href: "/employees", icon: Users, color: "bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-100", roles: ["super_admin", "partner", "hr_admin"] },
    { label: "Run Payroll", href: "/payroll", icon: Banknote, color: "bg-amber-50 text-amber-700 hover:bg-amber-100 border-amber-100", roles: ["super_admin", "partner", "finance_officer", "manager"] },
    { label: "Add Client", href: "/clients", icon: Users, color: "bg-pink-50 text-pink-700 hover:bg-pink-100 border-pink-100", roles: ["super_admin", "partner", "manager"] },
    { label: "View Reports", href: "/reports", icon: BarChart3, color: "bg-slate-50 text-slate-700 hover:bg-slate-100 border-slate-200", roles: ["super_admin", "partner", "hr_admin", "finance_officer", "manager"] },
    { label: "View Tasks", href: "/task-scheduler", icon: ListTodo, color: "bg-sky-50 text-sky-700 hover:bg-sky-100 border-sky-100", roles: ["super_admin", "partner", "hr_admin", "manager"] },
    { label: "Engagements", href: "/engagements", icon: ClipboardList, color: "bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border-indigo-100", roles: ["super_admin", "partner", "manager"] },
  ];
  return all.filter(a => a.roles.includes(role)).slice(0, 6);
}
