import React from "react";
import { useGetDashboardStats, useGetAttendanceTrend, useGetInvoiceSummary } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Users, FileText, Banknote, CalendarCheck, TrendingUp, TrendingDown,
  ArrowRight, Clock, AlertCircle, CheckCircle, ChevronRight, ListTodo, Calendar,
  LogIn, LogOut as LogOutIcon, Palmtree, ClipboardList, Shield, BarChart3, Receipt,
  CheckCircle2, XCircle, Coffee, X, Info, HelpCircle, Eye, Briefcase,
  BookOpen, ChevronDown, ChevronUp, Sparkles
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

type PopupData = {
  open: boolean;
  title: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  content: React.ReactNode;
};

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
  const [rejectDialog, setRejectDialog] = React.useState<{ open: boolean; leaveId: number | null; employeeName: string }>({ open: false, leaveId: null, employeeName: "" });
  const [rejectReason, setRejectReason] = React.useState("");
  const [popup, setPopup] = React.useState<PopupData>({ open: false, title: "", description: "", icon: null, color: "", content: null });
  const [allAttendance, setAllAttendance] = React.useState<any[]>([]);
  const [allLeaves, setAllLeaves] = React.useState<any[]>([]);
  const [allInvoices, setAllInvoices] = React.useState<any[]>([]);
  const [allEmployees, setAllEmployees] = React.useState<any[]>([]);
  const [guideItems, setGuideItems] = React.useState<any[]>([]);
  const [guideExpanded, setGuideExpanded] = React.useState(true);
  const [guideDismissed, setGuideDismissed] = React.useState<string[]>(() => {
    try {
      const stored = localStorage.getItem("guide_dismissed");
      const storedDate = localStorage.getItem("guide_dismissed_date");
      const today = new Date().toISOString().split("T")[0];
      if (storedDate !== today) { localStorage.removeItem("guide_dismissed"); localStorage.setItem("guide_dismissed_date", today); return []; }
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  });

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
      setAllLeaves(leaves);
      setPendingLeaves(leaves.filter((l: any) => l.status === "pending").slice(0, 5));
    }).catch(() => {});

    const today = new Date().toISOString().split("T")[0];
    setAttendanceLoading(true);
    fetch(`/api/attendance?date=${today}`, { headers }).then(r => r.json()).then((records: any[]) => {
      setAllAttendance(records);
      const mine = records.find((r: any) => r.employeeId === user?.id);
      setMyAttendance(mine || null);
    }).catch(() => {}).finally(() => setAttendanceLoading(false));

    fetch("/api/invoices", { headers }).then(r => r.json()).then(setAllInvoices).catch(() => {});
    fetch("/api/employees", { headers }).then(r => r.json()).then(setAllEmployees).catch(() => {});
    fetch("/api/dashboard/guide", { headers }).then(r => { if (!r.ok) throw new Error(); return r.json(); }).then(data => { if (Array.isArray(data)) setGuideItems(data); }).catch(() => {});
  }, [token]);

  React.useEffect(() => {
    if (!token) return;
    const interval = setInterval(() => {
      fetch("/api/dashboard/guide", { headers }).then(r => { if (!r.ok) throw new Error(); return r.json(); }).then(data => { if (Array.isArray(data)) setGuideItems(data); }).catch(() => {});
    }, 60000);
    return () => clearInterval(interval);
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

  async function handleLeaveAction(leaveId: number, status: "approved" | "rejected", approvalNotes?: string) {
    try {
      const body: any = { status };
      if (approvalNotes) body.approvalNotes = approvalNotes;
      await fetch(`/api/leaves/${leaveId}`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(body),
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

  function openAttendancePopup() {
    const present = allAttendance.filter(a => a.status === "present");
    const absent = safeStats.totalEmployees - present.length;
    setPopup({
      open: true,
      title: "Attendance Details",
      description: "Today's attendance breakdown",
      icon: <Clock className="w-5 h-5 text-sky-600" />,
      color: "sky",
      content: (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center p-3 rounded-xl bg-emerald-50 border border-emerald-100">
              <p className="text-lg font-bold text-emerald-700">{present.length}</p>
              <p className="text-[11px] text-emerald-600 font-medium">Present</p>
            </div>
            <div className="text-center p-3 rounded-xl bg-red-50 border border-red-100">
              <p className="text-lg font-bold text-red-700">{absent}</p>
              <p className="text-[11px] text-red-600 font-medium">Absent</p>
            </div>
            <div className="text-center p-3 rounded-xl bg-blue-50 border border-blue-100">
              <p className="text-lg font-bold text-blue-700">{safeStats.attendancePercentage}%</p>
              <p className="text-[11px] text-blue-600 font-medium">Rate</p>
            </div>
          </div>
          {myAttendance ? (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
              <p className="text-sm font-semibold text-emerald-800">Your Status: Checked In</p>
              <p className="text-xs text-emerald-600 mt-1">
                Check-in: {myAttendance.checkIn}{myAttendance.checkOut ? ` | Check-out: ${myAttendance.checkOut}` : " | Still active"}
              </p>
            </div>
          ) : (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200">
              <p className="text-sm font-semibold text-amber-800">Your Status: Not Checked In</p>
              <p className="text-xs text-amber-600 mt-1">Please use the Time In button to mark your attendance.</p>
            </div>
          )}
          {present.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2">Recently Checked In</p>
              <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
                {present.slice(0, 8).map((a: any) => (
                  <div key={a.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/30 text-xs">
                    <span className="font-medium">{a.employeeName || `Employee #${a.employeeId}`}</span>
                    <span className="text-muted-foreground">{a.checkIn}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <Link href="/attendance">
            <Button size="sm" className="w-full gap-2 mt-2">
              <CalendarCheck className="w-3.5 h-3.5" /> Go to Attendance Page
            </Button>
          </Link>
        </div>
      ),
    });
  }

  function openLeavePopup() {
    const myLeaves = allLeaves.filter(l => l.employeeId === user?.id);
    const pending = myLeaves.filter(l => l.status === "pending");
    const approved = myLeaves.filter(l => l.status === "approved");
    const rejected = myLeaves.filter(l => l.status === "rejected");
    setPopup({
      open: true,
      title: "Leave Summary",
      description: "Your leave applications overview",
      icon: <Palmtree className="w-5 h-5 text-amber-600" />,
      color: "amber",
      content: (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center p-3 rounded-xl bg-amber-50 border border-amber-100">
              <p className="text-lg font-bold text-amber-700">{pending.length}</p>
              <p className="text-[11px] text-amber-600 font-medium">Pending</p>
            </div>
            <div className="text-center p-3 rounded-xl bg-emerald-50 border border-emerald-100">
              <p className="text-lg font-bold text-emerald-700">{approved.length}</p>
              <p className="text-[11px] text-emerald-600 font-medium">Approved</p>
            </div>
            <div className="text-center p-3 rounded-xl bg-red-50 border border-red-100">
              <p className="text-lg font-bold text-red-700">{rejected.length}</p>
              <p className="text-[11px] text-red-600 font-medium">Rejected</p>
            </div>
          </div>
          {myLeaves.length > 0 ? (
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2">Recent Leave Requests</p>
              <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
                {myLeaves.slice(0, 6).map((l: any) => (
                  <div key={l.id} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30 text-xs">
                    <div>
                      <p className="font-medium capitalize">{l.leaveType} Leave</p>
                      <p className="text-muted-foreground">{new Date(l.fromDate).toLocaleDateString("en-PK", { day: "numeric", month: "short" })} - {new Date(l.toDate).toLocaleDateString("en-PK", { day: "numeric", month: "short" })}</p>
                    </div>
                    <Badge className={`text-[10px] ${
                      l.status === "approved" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                      l.status === "rejected" ? "bg-red-50 text-red-700 border-red-200" :
                      "bg-amber-50 text-amber-700 border-amber-200"
                    } border`}>{l.status}</Badge>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">No leave requests found</p>
          )}
          <Link href="/leaves">
            <Button size="sm" className="w-full gap-2 mt-2">
              <Palmtree className="w-3.5 h-3.5" /> Go to Leave Management
            </Button>
          </Link>
        </div>
      ),
    });
  }

  function openTasksPopup() {
    setPopup({
      open: true,
      title: "Task Summary",
      description: "Your current task breakdown",
      icon: <ListTodo className="w-5 h-5 text-blue-600" />,
      color: "blue",
      content: (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="text-center p-3 rounded-xl bg-slate-50 border border-slate-100">
              <p className="text-lg font-bold text-slate-700">{taskStats?.pending || 0}</p>
              <p className="text-[11px] text-slate-500 font-medium">Pending</p>
            </div>
            <div className="text-center p-3 rounded-xl bg-blue-50 border border-blue-100">
              <p className="text-lg font-bold text-blue-700">{taskStats?.inProgress || 0}</p>
              <p className="text-[11px] text-blue-500 font-medium">In Progress</p>
            </div>
            <div className="text-center p-3 rounded-xl bg-emerald-50 border border-emerald-100">
              <p className="text-lg font-bold text-emerald-700">{taskStats?.completed || 0}</p>
              <p className="text-[11px] text-emerald-500 font-medium">Completed</p>
            </div>
            <div className="text-center p-3 rounded-xl bg-red-50 border border-red-100">
              <p className="text-lg font-bold text-red-700">{taskStats?.overdue || 0}</p>
              <p className="text-[11px] text-red-500 font-medium">Overdue</p>
            </div>
          </div>
          {taskStats?.dueToday > 0 && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              <span><strong>{taskStats.dueToday}</strong> task{taskStats.dueToday > 1 ? "s" : ""} due today — review them now!</span>
            </div>
          )}
          {myTasks.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2">Upcoming Tasks</p>
              <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
                {myTasks.slice(0, 5).map((t: any) => {
                  const isOverdue = t.status !== "completed" && t.dueDate && t.dueDate < new Date().toISOString().split("T")[0];
                  return (
                    <div key={t.id} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30 text-xs">
                      <div className="flex items-center gap-2">
                        <div className={`w-1.5 h-6 rounded-full ${isOverdue ? "bg-red-500" : t.status === "in_progress" ? "bg-blue-500" : "bg-slate-300"}`} />
                        <div>
                          <p className="font-medium truncate max-w-[200px]">{t.title}</p>
                          <p className="text-muted-foreground">{t.dueDate ? new Date(t.dueDate).toLocaleDateString("en-PK", { day: "numeric", month: "short" }) : "No due date"}</p>
                        </div>
                      </div>
                      <Badge className={`text-[10px] ${isOverdue ? "bg-red-100 text-red-700 border-red-200" : "bg-slate-50 text-slate-600 border-slate-200"} border`}>
                        {isOverdue ? "Overdue" : t.status?.replace("_", " ")}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <Link href="/task-scheduler">
            <Button size="sm" className="w-full gap-2 mt-2">
              <ListTodo className="w-3.5 h-3.5" /> Go to Task Scheduler
            </Button>
          </Link>
        </div>
      ),
    });
  }

  function openStaffPopup() {
    const presentCount = roleStats?.todayPresent ?? Math.round(safeStats.totalEmployees * safeStats.attendancePercentage / 100);
    const absentCount = roleStats?.todayAbsent ?? safeStats.totalEmployees - presentCount;
    setPopup({
      open: true,
      title: "Staff Status",
      description: "Current workforce overview",
      icon: <Users className="w-5 h-5 text-emerald-600" />,
      color: "emerald",
      content: (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center p-3 rounded-xl bg-blue-50 border border-blue-100">
              <p className="text-lg font-bold text-blue-700">{safeStats.totalEmployees}</p>
              <p className="text-[11px] text-blue-500 font-medium">Total Staff</p>
            </div>
            <div className="text-center p-3 rounded-xl bg-emerald-50 border border-emerald-100">
              <p className="text-lg font-bold text-emerald-700">{presentCount}</p>
              <p className="text-[11px] text-emerald-500 font-medium">Present</p>
            </div>
            <div className="text-center p-3 rounded-xl bg-red-50 border border-red-100">
              <p className="text-lg font-bold text-red-700">{absentCount}</p>
              <p className="text-[11px] text-red-500 font-medium">Absent</p>
            </div>
          </div>
          {allEmployees.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2">Staff Directory</p>
              <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
                {allEmployees.slice(0, 8).map((emp: any) => (
                  <div key={emp.id} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30 text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold">
                        {emp.name?.charAt(0) || "E"}
                      </div>
                      <div>
                        <p className="font-medium">{emp.name}</p>
                        <p className="text-muted-foreground capitalize">{emp.designation || emp.role}</p>
                      </div>
                    </div>
                    <Badge className={`text-[10px] ${emp.status === "active" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-50 text-slate-600 border-slate-200"} border`}>
                      {emp.status || "active"}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
          <Link href="/employees">
            <Button size="sm" className="w-full gap-2 mt-2">
              <Users className="w-3.5 h-3.5" /> Go to Employee Management
            </Button>
          </Link>
        </div>
      ),
    });
  }

  function openInvoicePopup() {
    const paid = allInvoices.filter((i: any) => i.status === "paid");
    const overdue = allInvoices.filter((i: any) => i.status === "overdue");
    const pending = allInvoices.filter((i: any) => ["draft", "issued", "approved"].includes(i.status));
    const totalAmount = allInvoices.reduce((sum: number, i: any) => sum + Number(i.totalAmount || 0), 0);
    setPopup({
      open: true,
      title: "Invoice Details",
      description: "Complete invoicing overview",
      icon: <Receipt className="w-5 h-5 text-violet-600" />,
      color: "violet",
      content: (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="text-center p-3 rounded-xl bg-emerald-50 border border-emerald-100">
              <p className="text-lg font-bold text-emerald-700">{paid.length}</p>
              <p className="text-[11px] text-emerald-600 font-medium">Paid</p>
            </div>
            <div className="text-center p-3 rounded-xl bg-red-50 border border-red-100">
              <p className="text-lg font-bold text-red-700">{overdue.length}</p>
              <p className="text-[11px] text-red-600 font-medium">Overdue</p>
            </div>
            <div className="text-center p-3 rounded-xl bg-amber-50 border border-amber-100">
              <p className="text-lg font-bold text-amber-700">{pending.length}</p>
              <p className="text-[11px] text-amber-600 font-medium">Pending</p>
            </div>
            <div className="text-center p-3 rounded-xl bg-violet-50 border border-violet-100">
              <p className="text-lg font-bold text-violet-700">Rs. {(totalAmount / 1000).toFixed(0)}K</p>
              <p className="text-[11px] text-violet-600 font-medium">Total Value</p>
            </div>
          </div>
          {overdue.length > 0 && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              <span><strong>{overdue.length}</strong> invoice{overdue.length > 1 ? "s are" : " is"} overdue — follow up required!</span>
            </div>
          )}
          {allInvoices.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2">Recent Invoices</p>
              <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
                {allInvoices.slice(0, 6).map((inv: any) => (
                  <div key={inv.id} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30 text-xs">
                    <div>
                      <p className="font-medium">{inv.invoiceNumber || `INV-${inv.id}`}</p>
                      <p className="text-muted-foreground">{inv.clientName || "Client"} · Rs. {Number(inv.totalAmount || 0).toLocaleString("en-PK")}</p>
                    </div>
                    <Badge className={`text-[10px] ${
                      inv.status === "paid" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                      inv.status === "overdue" ? "bg-red-50 text-red-700 border-red-200" :
                      "bg-slate-50 text-slate-600 border-slate-200"
                    } border`}>{inv.status}</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
          <Link href="/invoices">
            <Button size="sm" className="w-full gap-2 mt-2">
              <Receipt className="w-3.5 h-3.5" /> Go to Invoice Management
            </Button>
          </Link>
        </div>
      ),
    });
  }

  function openStatPopup(label: string, value: string | number, description: string, navigateTo: string) {
    const iconMap: Record<string, React.ReactNode> = {
      "Total Revenue": <Banknote className="w-5 h-5 text-violet-600" />,
      "Receivables": <TrendingUp className="w-5 h-5 text-amber-600" />,
      "Active Engagements": <Briefcase className="w-5 h-5 text-blue-600" />,
      "Active Clients": <Users className="w-5 h-5 text-emerald-600" />,
      "Total Collected": <Banknote className="w-5 h-5 text-emerald-600" />,
      "Outstanding": <AlertCircle className="w-5 h-5 text-amber-600" />,
      "Overdue Invoices": <Receipt className="w-5 h-5 text-red-600" />,
      "Total Payroll": <Banknote className="w-5 h-5 text-blue-600" />,
      "Active Employees": <Users className="w-5 h-5 text-blue-600" />,
      "Present Today": <CheckCircle2 className="w-5 h-5 text-emerald-600" />,
      "Absent Today": <XCircle className="w-5 h-5 text-red-600" />,
      "Pending Leaves": <Palmtree className="w-5 h-5 text-amber-600" />,
    };

    const helpMap: Record<string, string> = {
      "Total Revenue": "Total revenue collected from all paid invoices. This includes all billing for audit, tax, advisory, and corporate services.",
      "Receivables": "Outstanding amounts pending collection from issued and approved invoices. Follow up with clients to ensure timely payment.",
      "Active Engagements": "Currently active client engagements across all service lines (audit, tax, advisory). Monitor progress and ensure deadlines are met.",
      "Active Clients": "Clients with active engagements or recent invoices. The ratio shows active vs total registered clients.",
      "Total Collected": "Sum of all invoice payments received. Track collection efficiency and cash flow health.",
      "Outstanding": "Total amount still pending from all issued invoices. High outstanding amounts may indicate collection issues.",
      "Overdue Invoices": "Invoices past their due date. Immediate follow-up is recommended to maintain healthy cash flow.",
      "Total Payroll": "Total monthly payroll cost including base salary, allowances, and deductions. Review for budget compliance.",
      "Active Employees": "Currently active staff members. The ratio shows active vs total registered employees including inactive ones.",
      "Present Today": "Number of employees who have marked their attendance today. Monitor for unusual absence patterns.",
      "Absent Today": "Employees who haven't checked in today. Check if they have approved leaves or need follow-up.",
      "Pending Leaves": "Leave applications awaiting your approval. Timely review helps employees plan their schedules.",
    };

    setPopup({
      open: true,
      title: label,
      description: helpMap[label] || description,
      icon: iconMap[label] || <Info className="w-5 h-5 text-primary" />,
      color: "blue",
      content: (
        <div className="space-y-4">
          <div className="text-center p-6 rounded-2xl bg-muted/40 border border-border/40">
            <p className="text-4xl font-bold text-foreground">{value}</p>
            <p className="text-sm text-muted-foreground mt-1">{label}</p>
          </div>
          <div className="p-4 rounded-xl bg-blue-50 border border-blue-100">
            <div className="flex items-start gap-2">
              <HelpCircle className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-semibold text-blue-800 mb-1">What this means</p>
                <p className="text-xs text-blue-700 leading-relaxed">{helpMap[label] || "This metric shows key operational data for your firm."}</p>
              </div>
            </div>
          </div>
          <Link href={navigateTo}>
            <Button size="sm" className="w-full gap-2">
              <Eye className="w-3.5 h-3.5" /> View Full Details
            </Button>
          </Link>
        </div>
      ),
    });
  }

  const TOOLTIP_HELP: Record<string, string> = {
    attendance: "Click to see today's full attendance breakdown, check-in times, and your attendance status.",
    leave: "Click to view your leave history, pending requests, and approval status. You can apply for new leave from here.",
    tasks: "Click to see your task breakdown by status. Track pending, in-progress, and overdue tasks at a glance.",
    staff: "Click to view current workforce status — see who's present, absent, and browse the staff directory.",
    invoices: "Click to see the complete invoice breakdown with paid, pending, and overdue amounts and recent invoices.",
    markAttendance: "Open attendance page to mark daily attendance for your team members.",
    createInvoice: "Create a new invoice for a client with WHT/GST tax calculations and PKR formatting.",
    addEmployee: "Register a new employee or trainee with full details including department assignment.",
    runPayroll: "Generate monthly payroll with Pakistan income tax slab calculations and attendance-based deductions.",
    addClient: "Add a new client to the system with NTN, registration number, and contact information.",
    viewReports: "View attendance, payroll, and invoice analytics reports with filtering options.",
    viewTasks: "Open the task scheduler with calendar, list, and week views to manage all tasks.",
    engagements: "Manage client engagements — track audit, tax, and advisory assignments through their lifecycle.",
    approvePayroll: "Review generated payroll for the current month and approve for processing.",
    executiveRevenue: "Total revenue from all paid invoices. Click for a detailed financial overview.",
    executiveReceivables: "Outstanding amounts from issued invoices. Click to review and follow up.",
    executiveEngagements: "Active engagement count across all service lines. Click for engagement details.",
    executiveClients: "Active clients ratio. Click to browse client directory.",
    financeCollected: "Total payments collected this period. Click for collection details.",
    financeOutstanding: "Unpaid invoice amounts. Click to see aging breakdown.",
    financeOverdue: "Past-due invoices requiring urgent follow-up. Click for details.",
    financePayroll: "Current payroll obligations. Click for payroll breakdown.",
    hrActive: "Active vs total employees. Click to manage workforce.",
    hrPresent: "Employees checked in today. Click for attendance details.",
    hrAbsent: "Employees not yet checked in. Click to investigate.",
    hrPendingLeaves: "Leave requests awaiting approval. Click to review and act.",
  };

  const greetingMsg = React.useMemo(() => {
    const hour = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Karachi" })).getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  }, []);

  return (
    <div className="space-y-6 pb-10">
      {/* Welcome Header */}
      <div className="relative overflow-hidden rounded-2xl border border-primary/10 shadow-sm"
        style={{ background: "linear-gradient(135deg, hsl(217 78% 14%) 0%, hsl(224 60% 18%) 50%, hsl(262 50% 20%) 100%)" }}>
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-8 -right-8 w-48 h-48 rounded-full opacity-[0.07]" style={{ background: "radial-gradient(circle, hsl(217 78% 65%) 0%, transparent 70%)" }} />
          <div className="absolute -bottom-12 -left-4 w-40 h-40 rounded-full opacity-[0.05]" style={{ background: "radial-gradient(circle, hsl(262 70% 65%) 0%, transparent 70%)" }} />
        </div>
        <div className="relative px-5 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center text-lg font-bold text-white shrink-0"
              style={{ background: "linear-gradient(135deg, hsl(217 78% 50%) 0%, hsl(262 70% 55%) 100%)", boxShadow: "0 4px 16px rgba(59,130,246,0.35)" }}>
              {user?.name?.charAt(0)}
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                  {greetingMsg}, {user?.name?.split(" ")[0]}
                </h1>
                <span className={`text-[10.5px] px-2 py-0.5 rounded-full font-semibold border ${roleConf.bg} ${roleConf.color} ${roleConf.accent}`}>
                  {roleConf.label}
                </span>
              </div>
              <p className="text-blue-200/70 text-xs mt-0.5">{pktTime} · Pakistan Standard Time</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {!isTrainee && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link href="/attendance">
                    <Button variant="outline" size="sm" className="gap-2 text-[13px] h-8 bg-white/10 border-white/20 text-white hover:bg-white/20 hover:border-white/30 hover:text-white">
                      <CalendarCheck className="w-3.5 h-3.5" /> Attendance
                    </Button>
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-[220px] text-xs">
                  <p>{TOOLTIP_HELP.markAttendance}</p>
                </TooltipContent>
              </Tooltip>
            )}
            {(isPartnerOrAdmin || isFinance) && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link href="/invoices">
                    <Button size="sm" className="gap-2 text-[13px] h-8 bg-white text-slate-900 hover:bg-white/90 shadow-sm font-medium">
                      <FileText className="w-3.5 h-3.5" /> New Invoice
                    </Button>
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-[220px] text-xs">
                  <p>{TOOLTIP_HELP.createInvoice}</p>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>
      </div>

      {guideItems.filter(g => !guideDismissed.includes(g.id)).length > 0 && (
        <Card className="border-primary/20 bg-gradient-to-r from-primary/5 via-background to-primary/5 overflow-hidden">
          <div
            className="flex items-center justify-between px-5 py-3 cursor-pointer select-none"
            onClick={() => setGuideExpanded(!guideExpanded)}
          >
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-primary/10">
                <Sparkles className="w-4 h-4 text-primary" />
              </div>
              <h3 className="font-semibold text-sm tracking-tight">Your Daily Guide</h3>
              <Badge variant="secondary" className="text-[10px] h-5 px-1.5 font-medium">
                {guideItems.filter(g => !guideDismissed.includes(g.id)).length} items
              </Badge>
            </div>
            <Button variant="ghost" size="icon" className="h-7 w-7">
              {guideExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </Button>
          </div>
          {guideExpanded && (
            <CardContent className="px-5 pb-4 pt-0 space-y-2">
              {guideItems.filter(g => !guideDismissed.includes(g.id)).map((item) => {
                const priorityStyles: Record<string, { bg: string; border: string; icon: string; iconBg: string }> = {
                  urgent: { bg: "bg-red-50/80", border: "border-red-200", icon: "text-red-600", iconBg: "bg-red-100" },
                  warning: { bg: "bg-amber-50/80", border: "border-amber-200", icon: "text-amber-600", iconBg: "bg-amber-100" },
                  info: { bg: "bg-blue-50/80", border: "border-blue-200", icon: "text-blue-600", iconBg: "bg-blue-100" },
                  success: { bg: "bg-emerald-50/80", border: "border-emerald-200", icon: "text-emerald-600", iconBg: "bg-emerald-100" },
                };
                const iconMap: Record<string, React.ReactNode> = {
                  calendar: <Calendar className="w-3.5 h-3.5" />,
                  clock: <Clock className="w-3.5 h-3.5" />,
                  check: <CheckCircle className="w-3.5 h-3.5" />,
                  alert: <AlertCircle className="w-3.5 h-3.5" />,
                  receipt: <Receipt className="w-3.5 h-3.5" />,
                  file: <FileText className="w-3.5 h-3.5" />,
                  clipboard: <ClipboardList className="w-3.5 h-3.5" />,
                  briefcase: <Briefcase className="w-3.5 h-3.5" />,
                  users: <Users className="w-3.5 h-3.5" />,
                };
                const style = priorityStyles[item.priority] || priorityStyles.info;
                return (
                  <div key={item.id} className={`flex items-start gap-3 p-3 rounded-lg border ${style.bg} ${style.border} transition-all hover:shadow-sm`}>
                    <div className={`p-1.5 rounded-md ${style.iconBg} ${style.icon} mt-0.5 shrink-0`}>
                      {iconMap[item.icon] || <Info className="w-3.5 h-3.5" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold leading-tight mb-0.5">{item.title}</p>
                      <p className="text-xs text-muted-foreground leading-relaxed">{item.message}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {item.action && (
                        <Link href={item.action}>
                          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 px-2">
                            View <ArrowRight className="w-3 h-3" />
                          </Button>
                        </Link>
                      )}
                      <Button variant="ghost" size="icon" className="h-6 w-6 opacity-40 hover:opacity-100"
                        onClick={() => setGuideDismissed(prev => { const next = [...prev, item.id]; try { localStorage.setItem("guide_dismissed", JSON.stringify(next)); } catch {} return next; })}>
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          )}
        </Card>
      )}

      {/* Top Action Cards Row */}
      <div className={`grid gap-4 ${isTrainee ? "grid-cols-1 sm:grid-cols-3" : isManager ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"}`}>
        {/* Time In / Time Out Card - All roles */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Card className="border-border/50 shadow-xs cursor-pointer hover:shadow-md hover:border-sky-200 transition-all" onClick={openAttendancePopup}>
              <CardContent className="p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-sky-500/10 flex items-center justify-center">
                    <Clock className="w-[18px] h-[18px] text-sky-600" />
                  </div>
                  <div className="flex-1">
                    <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Attendance</p>
                    <p className="text-sm font-semibold">
                      {attendanceLoading ? "..." : myAttendance?.status === "present" ? "Checked In" : "Not Checked In"}
                    </p>
                  </div>
                  <Info className="w-4 h-4 text-muted-foreground/40" />
                </div>
                {myAttendance?.checkIn && (
                  <p className="text-xs text-muted-foreground mb-2">In: {myAttendance.checkIn}{myAttendance.checkOut ? ` · Out: ${myAttendance.checkOut}` : ""}</p>
                )}
                {!myAttendance && !attendanceLoading && (
                  <Button size="sm" className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700 text-white h-9" onClick={(e) => { e.stopPropagation(); handleTimeIn(); }} disabled={clockingIn}>
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
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-[250px] text-xs">
            <p>{TOOLTIP_HELP.attendance}</p>
          </TooltipContent>
        </Tooltip>

        {/* Apply Leave - All roles */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Card className="border-border/50 shadow-xs cursor-pointer hover:shadow-md hover:border-amber-200 transition-all" onClick={openLeavePopup}>
              <CardContent className="p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                    <Palmtree className="w-[18px] h-[18px] text-amber-600" />
                  </div>
                  <div className="flex-1">
                    <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Leave</p>
                    <p className="text-sm font-semibold">{pendingLeaves.filter(l => l.employeeId === user?.id).length} Pending</p>
                  </div>
                  <Info className="w-4 h-4 text-muted-foreground/40" />
                </div>
                <Link href="/leaves">
                  <Button variant="outline" size="sm" className="w-full gap-2 h-9 text-[13px]" onClick={(e) => e.stopPropagation()}>
                    <Palmtree className="w-3.5 h-3.5" /> Apply Leave
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-[250px] text-xs">
            <p>{TOOLTIP_HELP.leave}</p>
          </TooltipContent>
        </Tooltip>

        {/* My Tasks - Trainee/Employee */}
        {isTrainee && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Card className="border-border/50 shadow-xs cursor-pointer hover:shadow-md hover:border-blue-200 transition-all" onClick={openTasksPopup}>
                <CardContent className="p-5">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                      <ListTodo className="w-[18px] h-[18px] text-blue-600" />
                    </div>
                    <div className="flex-1">
                      <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">My Tasks</p>
                      <p className="text-sm font-semibold">{taskStats?.total || 0} Total</p>
                    </div>
                    <Info className="w-4 h-4 text-muted-foreground/40" />
                  </div>
                  <div className="flex gap-2 text-xs">
                    <span className="px-2 py-1 rounded-md bg-amber-50 text-amber-700 font-medium">{taskStats?.pending || 0} Pending</span>
                    <span className="px-2 py-1 rounded-md bg-emerald-50 text-emerald-700 font-medium">{taskStats?.completed || 0} Done</span>
                  </div>
                </CardContent>
              </Card>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-[250px] text-xs">
              <p>{TOOLTIP_HELP.tasks}</p>
            </TooltipContent>
          </Tooltip>
        )}

        {/* Staff Status - Manager/HR/Partner */}
        {(isManager || isHrAdmin || isPartnerOrAdmin) && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Card className="border-border/50 shadow-xs cursor-pointer hover:shadow-md hover:border-emerald-200 transition-all" onClick={openStaffPopup}>
                <CardContent className="p-5">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                      <Users className="w-[18px] h-[18px] text-emerald-600" />
                    </div>
                    <div className="flex-1">
                      <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Staff Status</p>
                      <p className="text-sm font-semibold">{safeStats.totalEmployees} Staff</p>
                    </div>
                    <Info className="w-4 h-4 text-muted-foreground/40" />
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
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-[250px] text-xs">
              <p>{TOOLTIP_HELP.staff}</p>
            </TooltipContent>
          </Tooltip>
        )}

        {/* Invoices - Partner/Finance */}
        {(isPartnerOrAdmin || isFinance) && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Card className="border-border/50 shadow-xs cursor-pointer hover:shadow-md hover:border-violet-200 transition-all" onClick={openInvoicePopup}>
                <CardContent className="p-5">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center">
                      <Receipt className="w-[18px] h-[18px] text-violet-600" />
                    </div>
                    <div className="flex-1">
                      <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Invoices</p>
                      <p className="text-sm font-semibold">{safeStats.pendingInvoices} Pending</p>
                    </div>
                    <Info className="w-4 h-4 text-muted-foreground/40" />
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
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-[250px] text-xs">
              <p>{TOOLTIP_HELP.invoices}</p>
            </TooltipContent>
          </Tooltip>
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
            <CardDescription className="text-xs">Firm-wide performance metrics — click any card for details</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <ActionStatBox label="Total Revenue" value={`Rs. ${(roleStats.totalRevenue / 1000).toFixed(0)}K`} color="violet" tooltip={TOOLTIP_HELP.executiveRevenue} onClick={() => openStatPopup("Total Revenue", `Rs. ${(roleStats.totalRevenue / 1000).toFixed(0)}K`, "Total revenue from paid invoices", "/invoices")} />
              <ActionStatBox label="Receivables" value={`Rs. ${(roleStats.totalReceivables / 1000).toFixed(0)}K`} color="amber" tooltip={TOOLTIP_HELP.executiveReceivables} onClick={() => openStatPopup("Receivables", `Rs. ${(roleStats.totalReceivables / 1000).toFixed(0)}K`, "Outstanding invoice amounts", "/invoices")} />
              <ActionStatBox label="Active Engagements" value={roleStats.activeEngagements} color="blue" tooltip={TOOLTIP_HELP.executiveEngagements} onClick={() => openStatPopup("Active Engagements", roleStats.activeEngagements, "Currently active engagements", "/engagements")} />
              <ActionStatBox label="Active Clients" value={`${roleStats.activeClients}/${roleStats.totalClients}`} color="emerald" tooltip={TOOLTIP_HELP.executiveClients} onClick={() => openStatPopup("Active Clients", `${roleStats.activeClients}/${roleStats.totalClients}`, "Active vs total clients", "/clients")} />
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
            <CardDescription className="text-xs">Billing and collections summary — click any card for details</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <ActionStatBox label="Total Collected" value={`Rs. ${(roleStats.totalPaid / 1000).toFixed(0)}K`} color="emerald" tooltip={TOOLTIP_HELP.financeCollected} onClick={() => openStatPopup("Total Collected", `Rs. ${(roleStats.totalPaid / 1000).toFixed(0)}K`, "Total payments received", "/invoices")} />
              <ActionStatBox label="Outstanding" value={`Rs. ${(roleStats.totalOutstanding / 1000).toFixed(0)}K`} color="amber" tooltip={TOOLTIP_HELP.financeOutstanding} onClick={() => openStatPopup("Outstanding", `Rs. ${(roleStats.totalOutstanding / 1000).toFixed(0)}K`, "Unpaid invoice amounts", "/invoices")} />
              <ActionStatBox label="Overdue Invoices" value={roleStats.overdueInvoices} color="red" tooltip={TOOLTIP_HELP.financeOverdue} onClick={() => openStatPopup("Overdue Invoices", roleStats.overdueInvoices, "Past-due invoices", "/invoices")} />
              <ActionStatBox label="Total Payroll" value={`Rs. ${(roleStats.totalPayrollCost / 1000).toFixed(0)}K`} color="blue" tooltip={TOOLTIP_HELP.financePayroll} onClick={() => openStatPopup("Total Payroll", `Rs. ${(roleStats.totalPayrollCost / 1000).toFixed(0)}K`, "Monthly payroll cost", "/payroll")} />
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
            <CardDescription className="text-xs">Workforce and attendance summary — click any card for details</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <ActionStatBox label="Active Employees" value={`${roleStats.activeEmployees}/${roleStats.totalEmployees}`} color="blue" tooltip={TOOLTIP_HELP.hrActive} onClick={() => openStatPopup("Active Employees", `${roleStats.activeEmployees}/${roleStats.totalEmployees}`, "Active vs total employees", "/employees")} />
              <ActionStatBox label="Present Today" value={roleStats.todayPresent} color="emerald" tooltip={TOOLTIP_HELP.hrPresent} onClick={() => openStatPopup("Present Today", roleStats.todayPresent, "Employees present today", "/attendance")} />
              <ActionStatBox label="Absent Today" value={roleStats.todayAbsent} color="red" tooltip={TOOLTIP_HELP.hrAbsent} onClick={() => openStatPopup("Absent Today", roleStats.todayAbsent, "Employees absent today", "/attendance")} />
              <ActionStatBox label="Pending Leaves" value={roleStats.pendingLeaves} color="amber" tooltip={TOOLTIP_HELP.hrPendingLeaves} onClick={() => openStatPopup("Pending Leaves", roleStats.pendingLeaves, "Leave requests pending approval", "/leaves")} />
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
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button size="sm" className="h-7 px-3 text-[11px] bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => handleLeaveAction(leave.id, "approved")}>
                          Approve
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs">
                        <p>Approve this leave request for {leave.employeeName}</p>
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button size="sm" variant="outline" className="h-7 px-3 text-[11px] border-red-200 text-red-600 hover:bg-red-50" onClick={() => {
                          setRejectDialog({ open: true, leaveId: leave.id, employeeName: leave.employeeName });
                          setRejectReason("");
                        }}>
                          Reject
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs">
                        <p>Reject with reason — a dialog will open for feedback</p>
                      </TooltipContent>
                    </Tooltip>
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
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="text-center p-3 rounded-xl bg-slate-50 border border-slate-100 cursor-pointer hover:shadow-sm transition-all" onClick={() => openStatPopup("Pending Tasks", taskStats?.pending || 0, "Tasks waiting to be started", "/task-scheduler")}>
                        <p className="text-xl font-bold text-slate-700">{taskStats?.pending || 0}</p>
                        <p className="text-[11px] text-slate-500 font-medium">Pending</p>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent className="text-xs"><p>Click to view pending tasks details</p></TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="text-center p-3 rounded-xl bg-blue-50 border border-blue-100 cursor-pointer hover:shadow-sm transition-all" onClick={() => openStatPopup("Active Tasks", taskStats?.inProgress || 0, "Tasks currently in progress", "/task-scheduler")}>
                        <p className="text-xl font-bold text-blue-700">{taskStats?.inProgress || 0}</p>
                        <p className="text-[11px] text-blue-500 font-medium">Active</p>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent className="text-xs"><p>Click to view active tasks details</p></TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="text-center p-3 rounded-xl bg-emerald-50 border border-emerald-100 cursor-pointer hover:shadow-sm transition-all" onClick={() => openStatPopup("Completed Tasks", taskStats?.completed || 0, "Tasks finished successfully", "/task-scheduler")}>
                        <p className="text-xl font-bold text-emerald-700">{taskStats?.completed || 0}</p>
                        <p className="text-[11px] text-emerald-500 font-medium">Done</p>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent className="text-xs"><p>Click to view completed tasks</p></TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="text-center p-3 rounded-xl bg-red-50 border border-red-100 cursor-pointer hover:shadow-sm transition-all" onClick={() => openStatPopup("Overdue Tasks", taskStats?.overdue || 0, "Tasks past their due date", "/task-scheduler")}>
                        <p className="text-xl font-bold text-red-700">{taskStats?.overdue || 0}</p>
                        <p className="text-[11px] text-red-500 font-medium">Overdue</p>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent className="text-xs"><p>Click to view overdue tasks — action required!</p></TooltipContent>
                  </Tooltip>
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
                    <Tooltip key={t.id}>
                      <TooltipTrigger asChild>
                        <div className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/25 hover:bg-muted/40 transition-colors cursor-pointer" onClick={() => {
                          setPopup({
                            open: true,
                            title: t.title,
                            description: `Task #${t.id} — ${t.status?.replace("_", " ")}`,
                            icon: <ListTodo className="w-5 h-5 text-primary" />,
                            color: "blue",
                            content: (
                              <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-3">
                                  <div className="p-3 rounded-xl bg-muted/40 border border-border/40">
                                    <p className="text-[11px] text-muted-foreground font-medium">Status</p>
                                    <p className="text-sm font-semibold capitalize">{isOverdue ? "Overdue" : t.status?.replace("_", " ")}</p>
                                  </div>
                                  <div className="p-3 rounded-xl bg-muted/40 border border-border/40">
                                    <p className="text-[11px] text-muted-foreground font-medium">Priority</p>
                                    <p className="text-sm font-semibold capitalize">{t.priority || "Normal"}</p>
                                  </div>
                                  <div className="p-3 rounded-xl bg-muted/40 border border-border/40">
                                    <p className="text-[11px] text-muted-foreground font-medium">Due Date</p>
                                    <p className="text-sm font-semibold">{t.dueDate ? new Date(t.dueDate).toLocaleDateString("en-PK", { day: "numeric", month: "short", year: "numeric" }) : "Not set"}</p>
                                  </div>
                                  <div className="p-3 rounded-xl bg-muted/40 border border-border/40">
                                    <p className="text-[11px] text-muted-foreground font-medium">Assigned To</p>
                                    <p className="text-sm font-semibold">{t.assignedToName || "Unassigned"}</p>
                                  </div>
                                </div>
                                {t.description && (
                                  <div className="p-3 rounded-xl bg-muted/40 border border-border/40">
                                    <p className="text-[11px] text-muted-foreground font-medium mb-1">Description</p>
                                    <p className="text-xs text-foreground leading-relaxed">{t.description}</p>
                                  </div>
                                )}
                                {isOverdue && (
                                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-center gap-2">
                                    <AlertCircle className="w-4 h-4" />
                                    <span>This task is overdue. Please update its status or extend the deadline.</span>
                                  </div>
                                )}
                                <Link href="/task-scheduler">
                                  <Button size="sm" className="w-full gap-2">
                                    <ListTodo className="w-3.5 h-3.5" /> Open in Task Scheduler
                                  </Button>
                                </Link>
                              </div>
                            ),
                          });
                        }}>
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
                      </TooltipTrigger>
                      <TooltipContent side="left" className="max-w-[220px] text-xs">
                        <p>Click to view task details, status, and description</p>
                      </TooltipContent>
                    </Tooltip>
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
              <CardDescription className="text-xs">Common tasks at a glance — hover for guidance</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2.5">
                {getQuickActions(role).map(({ label, href, icon: Icon, color, tooltip }) => (
                  <Tooltip key={label}>
                    <TooltipTrigger asChild>
                      <Link href={href}>
                        <button className={`w-full flex items-center gap-2.5 p-3 rounded-xl border text-[13px] font-medium transition-all ${color}`}>
                          <Icon className="w-4 h-4 shrink-0" />
                          <span className="text-left leading-tight">{label}</span>
                        </button>
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[220px] text-xs">
                      <p>{tooltip}</p>
                    </TooltipContent>
                  </Tooltip>
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
                <CardDescription className="text-xs mt-0.5">Rs. {((safeStats.totalOutstanding || 0) / 1000).toFixed(0)}K total receivables — click cards for details</CardDescription>
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
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="text-center p-3 rounded-xl bg-emerald-50 border border-emerald-100 cursor-pointer hover:shadow-sm transition-all" onClick={() => openStatPopup("Paid Invoices", invoiceSummary?.paid || 0, "Fully paid invoices", "/invoices")}>
                    <p className="text-lg font-bold text-emerald-700">{invoiceSummary?.paid || 0}</p>
                    <p className="text-[11px] text-emerald-600 font-medium">Paid</p>
                  </div>
                </TooltipTrigger>
                <TooltipContent className="text-xs"><p>Click to view paid invoice details and collection summary</p></TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="text-center p-3 rounded-xl bg-amber-50 border border-amber-100 cursor-pointer hover:shadow-sm transition-all" onClick={() => openStatPopup("Pending Invoices", (invoiceSummary?.issued || 0) + (invoiceSummary?.draft || 0), "Invoices awaiting payment", "/invoices")}>
                    <p className="text-lg font-bold text-amber-700">{(invoiceSummary?.issued || 0) + (invoiceSummary?.draft || 0)}</p>
                    <p className="text-[11px] text-amber-600 font-medium">Pending</p>
                  </div>
                </TooltipTrigger>
                <TooltipContent className="text-xs"><p>Click to review pending invoices and follow up</p></TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="text-center p-3 rounded-xl bg-red-50 border border-red-100 cursor-pointer hover:shadow-sm transition-all" onClick={() => openStatPopup("Overdue Invoices", invoiceSummary?.overdue || 0, "Past-due invoices requiring follow-up", "/invoices")}>
                    <p className="text-lg font-bold text-red-700">{invoiceSummary?.overdue || 0}</p>
                    <p className="text-[11px] text-red-600 font-medium">Overdue</p>
                  </div>
                </TooltipTrigger>
                <TooltipContent className="text-xs"><p>Click to see overdue invoices — urgent follow-up needed!</p></TooltipContent>
              </Tooltip>
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
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link href="/payroll">
                    <Button size="sm" className="gap-2 text-[13px] h-8 shadow-sm">
                      <Banknote className="w-3.5 h-3.5" />
                      {isPartnerOrAdmin ? "Approve Payroll" : "Run Payroll"}
                    </Button>
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="left" className="max-w-[220px] text-xs">
                  <p>{isPartnerOrAdmin ? TOOLTIP_HELP.approvePayroll : TOOLTIP_HELP.runPayroll}</p>
                </TooltipContent>
              </Tooltip>
            </div>
          </CardHeader>
        </Card>
      )}

      {/* Action Detail Popup */}
      <Dialog open={popup.open} onOpenChange={(open) => { if (!open) setPopup(prev => ({ ...prev, open: false })); }}>
        <DialogContent className="border-border/60 sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2.5">
              {popup.icon} {popup.title}
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              {popup.description}
            </DialogDescription>
          </DialogHeader>
          <div className="pt-2">
            {popup.content}
          </div>
        </DialogContent>
      </Dialog>

      {/* Rejection Reason Dialog */}
      <Dialog open={rejectDialog.open} onOpenChange={(open) => { if (!open) setRejectDialog({ open: false, leaveId: null, employeeName: "" }); }}>
        <DialogContent className="border-border/60 sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle className="font-display text-xl flex items-center gap-2 text-red-700">
              <X className="w-5 h-5" /> Reject Leave
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Rejecting leave request from <span className="font-medium text-foreground">{rejectDialog.employeeName}</span>
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => {
            e.preventDefault();
            if (!rejectReason.trim()) {
              toast({ title: "Please provide a rejection reason", variant: "destructive" });
              return;
            }
            if (rejectDialog.leaveId) {
              handleLeaveAction(rejectDialog.leaveId, "rejected", rejectReason.trim());
              setRejectDialog({ open: false, leaveId: null, employeeName: "" });
            }
          }} className="space-y-4 pt-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Reason for rejection *</label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                required
                rows={3}
                className="w-full rounded-lg border border-border/50 bg-muted/40 px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
                placeholder="Provide a clear reason for rejecting this leave..."
              />
            </div>
            <div className="pt-2 flex justify-end gap-3 border-t border-border/50">
              <Button variant="ghost" type="button" onClick={() => setRejectDialog({ open: false, leaveId: null, employeeName: "" })}>Cancel</Button>
              <Button type="submit" className="bg-red-600 hover:bg-red-700 text-white shadow-md">
                Reject Leave
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ActionStatBox({ label, value, color, tooltip, onClick }: { label: string; value: string | number; color: string; tooltip: string; onClick: () => void }) {
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
    <Tooltip>
      <TooltipTrigger asChild>
        <div className={`text-center p-3 rounded-xl border cursor-pointer hover:shadow-md transition-all ${colorMap[color]}`} onClick={onClick}>
          <p className="text-lg font-bold">{value}</p>
          <p className={`text-[11px] font-medium ${textMap[color]}`}>{label}</p>
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[220px] text-xs">
        <p>{tooltip}</p>
      </TooltipContent>
    </Tooltip>
  );
}

function getQuickActions(role: string) {
  const all = [
    { label: "Mark Attendance", href: "/attendance", icon: CalendarCheck, color: "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-100", roles: ["super_admin", "partner", "hr_admin", "manager"], tooltip: "Open attendance page to mark daily attendance for your team members." },
    { label: "Create Invoice", href: "/invoices", icon: FileText, color: "bg-violet-50 text-violet-700 hover:bg-violet-100 border-violet-100", roles: ["super_admin", "partner", "finance_officer", "manager"], tooltip: "Create a new invoice with WHT/GST tax calculations and PKR formatting." },
    { label: "Add Employee", href: "/employees", icon: Users, color: "bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-100", roles: ["super_admin", "partner", "hr_admin"], tooltip: "Register a new employee or trainee with department assignment." },
    { label: "Run Payroll", href: "/payroll", icon: Banknote, color: "bg-amber-50 text-amber-700 hover:bg-amber-100 border-amber-100", roles: ["super_admin", "partner", "finance_officer", "manager"], tooltip: "Generate monthly payroll with Pakistan tax slab calculations." },
    { label: "Add Client", href: "/clients", icon: Users, color: "bg-pink-50 text-pink-700 hover:bg-pink-100 border-pink-100", roles: ["super_admin", "partner", "manager"], tooltip: "Add a new client with NTN, registration number, and financials." },
    { label: "View Reports", href: "/reports", icon: BarChart3, color: "bg-slate-50 text-slate-700 hover:bg-slate-100 border-slate-200", roles: ["super_admin", "partner", "hr_admin", "finance_officer", "manager"], tooltip: "View attendance, payroll, and invoice analytics reports." },
    { label: "View Tasks", href: "/task-scheduler", icon: ListTodo, color: "bg-sky-50 text-sky-700 hover:bg-sky-100 border-sky-100", roles: ["super_admin", "partner", "hr_admin", "manager"], tooltip: "Open task scheduler with calendar, list, and week views." },
    { label: "Engagements", href: "/engagements", icon: ClipboardList, color: "bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border-indigo-100", roles: ["super_admin", "partner", "manager"], tooltip: "Manage client engagements through their full lifecycle." },
  ];
  return all.filter(a => a.roles.includes(role)).slice(0, 6);
}
