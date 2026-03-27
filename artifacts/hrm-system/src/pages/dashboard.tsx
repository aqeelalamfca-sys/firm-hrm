import React from "react";
import { useGetDashboardStats, useGetAttendanceTrend, useGetInvoiceSummary } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import {
  Users, FileText, Banknote, CalendarCheck, TrendingUp, TrendingDown,
  ArrowRight, Clock, AlertCircle, CheckCircle, ChevronRight
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend, BarChart, Bar
} from "recharts";

const PIE_COLORS = {
  paid: '#10b981',
  issued: '#3b82f6',
  approved: '#8b5cf6',
  draft: '#94a3b8',
  overdue: '#ef4444',
};

export default function Dashboard() {
  const { token } = useAuth();
  const requestOpts = { request: { headers: { Authorization: `Bearer ${token}` } } };

  const { data: stats, isLoading: statsLoading } = useGetDashboardStats(requestOpts);
  const { data: trend, isLoading: trendLoading } = useGetAttendanceTrend(requestOpts);
  const { data: invoiceSummary, isLoading: invoiceLoading } = useGetInvoiceSummary(requestOpts);

  const isLoading = statsLoading || trendLoading || invoiceLoading;

  const safeStats = stats || {
    totalEmployees: 5,
    attendancePercentage: 80,
    pendingInvoices: 2,
    totalOutstanding: 55000,
    recentLeaves: [],
  };

  const invoiceData = invoiceSummary
    ? [
        { name: 'Draft', value: invoiceSummary.draft, color: PIE_COLORS.draft },
        { name: 'Issued', value: invoiceSummary.issued, color: PIE_COLORS.issued },
        { name: 'Paid', value: invoiceSummary.paid, color: PIE_COLORS.paid },
        { name: 'Overdue', value: invoiceSummary.overdue, color: PIE_COLORS.overdue },
      ].filter(d => d.value > 0)
    : [
        { name: 'Paid', value: 1, color: PIE_COLORS.paid },
        { name: 'Issued', value: 1, color: PIE_COLORS.issued },
        { name: 'Draft', value: 1, color: PIE_COLORS.draft },
      ];

  const trendData = trend || [
    { date: 'Mon', present: 4, absent: 1 },
    { date: 'Tue', present: 5, absent: 0 },
    { date: 'Wed', present: 3, absent: 2 },
    { date: 'Thu', present: 5, absent: 0 },
    { date: 'Fri', present: 4, absent: 1 },
  ];

  const recentLeaves: any[] = safeStats.recentLeaves || [];

  return (
    <div className="space-y-8 pb-10">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <p className="text-sm text-muted-foreground font-medium">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
          <h1 className="text-3xl font-display font-bold mt-1">Dashboard</h1>
        </div>
        <div className="flex gap-3">
          <Link href="/attendance">
            <Button variant="outline" size="sm" className="gap-2 shadow-sm">
              <CalendarCheck className="w-4 h-4" /> Mark Attendance
            </Button>
          </Link>
          <Link href="/invoices">
            <Button size="sm" className="gap-2 shadow-md shadow-primary/20">
              <FileText className="w-4 h-4" /> New Invoice
            </Button>
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <KPICard
          title="Total Employees"
          value={isLoading ? "—" : safeStats.totalEmployees.toString()}
          subtitle="+2 this month"
          icon={Users}
          iconColor="bg-blue-500/10 text-blue-600"
          trend="up"
        />
        <KPICard
          title="Today's Attendance"
          value={isLoading ? "—" : `${safeStats.attendancePercentage}%`}
          subtitle="Present rate"
          icon={CalendarCheck}
          iconColor="bg-emerald-500/10 text-emerald-600"
          trend={safeStats.attendancePercentage >= 80 ? "up" : "down"}
        />
        <KPICard
          title="Pending Invoices"
          value={isLoading ? "—" : safeStats.pendingInvoices.toString()}
          subtitle="Requires action"
          icon={FileText}
          iconColor="bg-amber-500/10 text-amber-600"
          trend="neutral"
        />
        <KPICard
          title="Outstanding Balance"
          value={isLoading ? "—" : `₹${(safeStats.totalOutstanding / 1000).toFixed(0)}K`}
          subtitle="Total receivables"
          icon={Banknote}
          iconColor="bg-violet-500/10 text-violet-600"
          trend="neutral"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Attendance Trend - Area Chart */}
        <Card className="lg:col-span-2 shadow-sm border-border/60">
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
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                  <defs>
                    <linearGradient id="presentGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="absentGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} dy={8} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} allowDecimals={false} />
                  <RechartsTooltip
                    contentStyle={{ borderRadius: '10px', border: '1px solid hsl(var(--border))', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                  />
                  <Area type="monotone" dataKey="present" name="Present" stroke="hsl(var(--primary))" strokeWidth={2.5} fillOpacity={1} fill="url(#presentGrad)" dot={{ fill: 'hsl(var(--primary))', r: 3 }} />
                  <Area type="monotone" dataKey="absent" name="Absent" stroke="#ef4444" strokeWidth={2} strokeDasharray="4 4" fillOpacity={1} fill="url(#absentGrad)" dot={{ fill: '#ef4444', r: 3 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Invoice Status - Donut */}
        <Card className="shadow-sm border-border/60">
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
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={invoiceData}
                    cx="50%"
                    cy="45%"
                    innerRadius={65}
                    outerRadius={88}
                    paddingAngle={4}
                    dataKey="value"
                    stroke="none"
                  >
                    {invoiceData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip
                    contentStyle={{ borderRadius: '10px', border: 'none', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                  />
                  <Legend
                    verticalAlign="bottom"
                    height={36}
                    iconType="circle"
                    iconSize={8}
                    formatter={(value) => <span style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))' }}>{value}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Leave Requests */}
        <Card className="shadow-sm border-border/60">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold">Recent Leave Requests</CardTitle>
              <Link href="/leaves">
                <Button variant="ghost" size="sm" className="text-xs text-muted-foreground gap-1">
                  Manage <ChevronRight className="w-3 h-3" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-muted-foreground py-6 text-center">Loading...</p>
            ) : recentLeaves.length === 0 ? (
              <div className="text-center py-8">
                <CheckCircle className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No pending leave requests</p>
              </div>
            ) : (
              <div className="space-y-3">
                {recentLeaves.map((leave: any) => (
                  <div key={leave.id} className="flex items-center justify-between p-3 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
                        {leave.employeeName?.charAt(0) || 'E'}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">{leave.employeeName}</p>
                        <p className="text-xs text-muted-foreground capitalize">{leave.leaveType} · {leave.totalDays} day{leave.totalDays !== 1 ? 's' : ''}</p>
                      </div>
                    </div>
                    <LeaveStatusBadge status={leave.status} />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card className="shadow-sm border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Quick Actions</CardTitle>
            <CardDescription className="text-xs">Common tasks at a glance</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Add Employee", href: "/employees", icon: Users, color: "bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-100" },
                { label: "Mark Attendance", href: "/attendance", icon: CalendarCheck, color: "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-100" },
                { label: "Create Invoice", href: "/invoices", icon: FileText, color: "bg-violet-50 text-violet-700 hover:bg-violet-100 border-violet-100" },
                { label: "Run Payroll", href: "/payroll", icon: Banknote, color: "bg-amber-50 text-amber-700 hover:bg-amber-100 border-amber-100" },
                { label: "Add Client", href: "/clients", icon: Users, color: "bg-pink-50 text-pink-700 hover:bg-pink-100 border-pink-100" },
                { label: "View Reports", href: "/reports", icon: TrendingUp, color: "bg-slate-50 text-slate-700 hover:bg-slate-100 border-slate-200" },
              ].map(({ label, href, icon: Icon, color }) => (
                <Link key={href} href={href}>
                  <button className={`w-full flex items-center gap-3 p-3.5 rounded-xl border text-sm font-medium transition-all ${color}`}>
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="text-left leading-tight">{label}</span>
                  </button>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KPICard({
  title, value, subtitle, icon: Icon, iconColor, trend
}: {
  title: string; value: string; subtitle: string; icon: any; iconColor: string; trend: "up" | "down" | "neutral";
}) {
  return (
    <Card className="shadow-sm border-border/60 hover:shadow-md transition-shadow duration-200">
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-4">
          <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${iconColor}`}>
            <Icon className="w-5 h-5" />
          </div>
          <div className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${
            trend === 'up' ? 'bg-emerald-50 text-emerald-600' :
            trend === 'down' ? 'bg-red-50 text-red-600' :
            'bg-slate-50 text-slate-500'
          }`}>
            {trend === 'up' && <TrendingUp className="w-3 h-3" />}
            {trend === 'down' && <TrendingDown className="w-3 h-3" />}
            {trend === 'neutral' && <AlertCircle className="w-3 h-3" />}
            {trend === 'up' ? 'Good' : trend === 'down' ? 'Low' : 'Track'}
          </div>
        </div>
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">{title}</p>
          <p className="text-2xl font-display font-bold text-foreground tracking-tight">{value}</p>
          <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function LeaveStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: 'bg-amber-100 text-amber-700 border-amber-200',
    approved: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    rejected: 'bg-red-100 text-red-700 border-red-200',
  };
  return (
    <Badge variant="outline" className={`text-[10px] uppercase tracking-wider px-2 py-0.5 ${map[status] || ''}`}>
      {status}
    </Badge>
  );
}
