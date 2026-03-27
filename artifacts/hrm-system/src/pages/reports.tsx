import React, { useState } from "react";
import { useGetPayroll, useGetInvoices, useGetAttendance, useGetEmployees } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend, LineChart, Line
} from "recharts";
import { Users, FileText, Banknote, BarChart2, AlertTriangle, TrendingUp } from "lucide-react";

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

export default function Reports() {
  const { token } = useAuth();
  const currentYear = new Date().getFullYear();
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  const requestOpts = { request: { headers: { Authorization: `Bearer ${token}` } } };
  const { data: employees = [] } = useGetEmployees({}, requestOpts);
  const { data: invoices = [] } = useGetInvoices({}, requestOpts);
  const { data: payroll = [] } = useGetPayroll(
    { month: months[new Date().getMonth()], year: currentYear.toString() },
    requestOpts
  );

  // Payroll chart data
  const payrollChartData = payroll.map((p: any) => ({
    name: p.employeeName?.split(' ')[0] || 'Employee',
    Basic: p.basicSalary,
    Allowances: p.allowances,
    Deductions: p.deductions,
    Net: p.netSalary,
  }));

  // Invoice by status
  const invoiceStatusData = [
    { name: 'Draft', value: invoices.filter((i: any) => i.status === 'draft').length },
    { name: 'Issued', value: invoices.filter((i: any) => i.status === 'issued').length },
    { name: 'Paid', value: invoices.filter((i: any) => i.status === 'paid').length },
    { name: 'Overdue', value: invoices.filter((i: any) => i.status === 'overdue').length },
  ].filter(d => d.value > 0);

  // Invoice aging
  const now = new Date();
  const agingData = invoices
    .filter((inv: any) => inv.status !== 'paid' && inv.status !== 'draft')
    .map((inv: any) => {
      const dueDate = new Date(inv.dueDate);
      const daysOverdue = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
      return {
        ...inv,
        daysOverdue,
        bucket: daysOverdue <= 0 ? 'Current' : daysOverdue <= 30 ? '1–30 days' : daysOverdue <= 60 ? '31–60 days' : '60+ days',
      };
    });

  const agingBuckets = ['Current', '1–30 days', '31–60 days', '60+ days'].map(bucket => ({
    bucket,
    count: agingData.filter((a: any) => a.bucket === bucket).length,
    amount: agingData.filter((a: any) => a.bucket === bucket).reduce((s: number, a: any) => s + (a.totalAmount || 0), 0),
  }));

  // Dept breakdown
  const deptData = Array.from(
    employees.reduce((acc: Map<string, number>, e: any) => {
      acc.set(e.department, (acc.get(e.department) || 0) + 1);
      return acc;
    }, new Map())
  ).map(([name, value]) => ({ name, value }));

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-display font-bold">Reports & Analytics</h1>
        <p className="text-muted-foreground mt-1 text-sm">Data insights across HR, payroll, and invoices</p>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <ReportKPI label="Total Employees" value={employees.length.toString()} icon={Users} color="blue" />
        <ReportKPI label="Total Invoices" value={invoices.length.toString()} icon={FileText} color="violet" />
        <ReportKPI label="Total Billed" value={`₹${(invoices.reduce((s: number, i: any) => s + (i.totalAmount || 0), 0) / 1000).toFixed(0)}K`} icon={Banknote} color="emerald" />
        <ReportKPI
          label="Overdue Invoices"
          value={invoices.filter((i: any) => i.status === 'overdue').length.toString()}
          icon={AlertTriangle}
          color="red"
        />
      </div>

      <Tabs defaultValue="payroll">
        <TabsList className="bg-muted/40 border border-border/50 p-1 rounded-xl h-auto">
          <TabsTrigger value="payroll" className="text-xs px-4 py-1.5 rounded-lg data-[state=active]:shadow-sm gap-1.5">
            <Banknote className="w-3.5 h-3.5" /> Payroll
          </TabsTrigger>
          <TabsTrigger value="invoices" className="text-xs px-4 py-1.5 rounded-lg data-[state=active]:shadow-sm gap-1.5">
            <FileText className="w-3.5 h-3.5" /> Invoices
          </TabsTrigger>
          <TabsTrigger value="aging" className="text-xs px-4 py-1.5 rounded-lg data-[state=active]:shadow-sm gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" /> Aging
          </TabsTrigger>
          <TabsTrigger value="workforce" className="text-xs px-4 py-1.5 rounded-lg data-[state=active]:shadow-sm gap-1.5">
            <Users className="w-3.5 h-3.5" /> Workforce
          </TabsTrigger>
        </TabsList>

        {/* Payroll Report */}
        <TabsContent value="payroll" className="mt-4 space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="shadow-sm border-border/60">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold">Salary Breakdown</CardTitle>
                <CardDescription className="text-xs">{months[new Date().getMonth()]} {currentYear}</CardDescription>
              </CardHeader>
              <CardContent>
                {payrollChartData.length === 0 ? (
                  <EmptyChart message="Run payroll to see salary breakdown" />
                ) : (
                  <div className="h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={payrollChartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }} barSize={20}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                        <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid hsl(var(--border))', fontSize: 12 }} />
                        <Bar dataKey="Basic" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="Allowances" fill="#10b981" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="Net" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                        <Legend iconType="circle" iconSize={8} formatter={(v) => <span style={{ fontSize: 11 }}>{v}</span>} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="shadow-sm border-border/60">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold">Payroll Register</CardTitle>
                <CardDescription className="text-xs">{months[new Date().getMonth()]} {currentYear}</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {payroll.length === 0 ? (
                  <div className="p-6">
                    <EmptyChart message="No payroll data for this month" />
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-muted/20 border-b border-border/50">
                          <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Employee</th>
                          <th className="px-4 py-3 text-right font-semibold text-muted-foreground">Basic</th>
                          <th className="px-4 py-3 text-right font-semibold text-muted-foreground text-emerald-600">+Alw</th>
                          <th className="px-4 py-3 text-right font-semibold text-muted-foreground text-red-600">-Ded</th>
                          <th className="px-4 py-3 text-right font-semibold text-foreground">Net</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/40">
                        {payroll.map((p: any) => (
                          <tr key={p.id} className="hover:bg-muted/10">
                            <td className="px-4 py-3">
                              <p className="font-semibold text-foreground">{p.employeeName}</p>
                              <p className="text-muted-foreground font-mono">{p.employeeCode}</p>
                            </td>
                            <td className="px-4 py-3 text-right">₹{p.basicSalary?.toLocaleString('en-IN')}</td>
                            <td className="px-4 py-3 text-right text-emerald-600">+₹{p.allowances?.toLocaleString('en-IN')}</td>
                            <td className="px-4 py-3 text-right text-red-600">-₹{p.deductions?.toLocaleString('en-IN')}</td>
                            <td className="px-4 py-3 text-right font-bold text-foreground">₹{p.netSalary?.toLocaleString('en-IN')}</td>
                          </tr>
                        ))}
                        <tr className="bg-muted/30 font-semibold">
                          <td className="px-4 py-3 text-xs text-muted-foreground uppercase tracking-wide">Totals</td>
                          <td className="px-4 py-3 text-right">₹{payroll.reduce((s: number, p: any) => s + p.basicSalary, 0).toLocaleString('en-IN')}</td>
                          <td className="px-4 py-3 text-right text-emerald-600">+₹{payroll.reduce((s: number, p: any) => s + p.allowances, 0).toLocaleString('en-IN')}</td>
                          <td className="px-4 py-3 text-right text-red-600">-₹{payroll.reduce((s: number, p: any) => s + p.deductions, 0).toLocaleString('en-IN')}</td>
                          <td className="px-4 py-3 text-right font-bold">₹{payroll.reduce((s: number, p: any) => s + p.netSalary, 0).toLocaleString('en-IN')}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Invoice Report */}
        <TabsContent value="invoices" className="mt-4 space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="shadow-sm border-border/60">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold">Invoice Status Distribution</CardTitle>
                <CardDescription className="text-xs">By count of invoices</CardDescription>
              </CardHeader>
              <CardContent>
                {invoiceStatusData.length === 0 ? (
                  <EmptyChart message="No invoice data available" />
                ) : (
                  <div className="h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={invoiceStatusData} cx="50%" cy="45%" outerRadius={100} dataKey="value" stroke="none" paddingAngle={3}>
                          {invoiceStatusData.map((_, i) => (
                            <Cell key={i} fill={COLORS[i % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={{ borderRadius: '8px', fontSize: 12, border: '1px solid hsl(var(--border))' }} />
                        <Legend iconType="circle" iconSize={8} formatter={(v) => <span style={{ fontSize: 11 }}>{v}</span>} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="shadow-sm border-border/60">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold">Invoice Register</CardTitle>
                <CardDescription className="text-xs">All invoices with amounts</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {invoices.length === 0 ? (
                  <div className="p-6"><EmptyChart message="No invoices found" /></div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-muted/20 border-b border-border/50">
                          <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Invoice</th>
                          <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Client</th>
                          <th className="px-4 py-3 text-right font-semibold text-muted-foreground">Amount</th>
                          <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/40">
                        {invoices.map((inv: any) => (
                          <tr key={inv.id} className="hover:bg-muted/10">
                            <td className="px-4 py-3 font-mono text-primary font-semibold">#{inv.invoiceNumber}</td>
                            <td className="px-4 py-3 text-foreground">{inv.clientName}</td>
                            <td className="px-4 py-3 text-right font-semibold">₹{inv.totalAmount?.toLocaleString('en-IN')}</td>
                            <td className="px-4 py-3">
                              <Badge variant="outline" className={`text-[10px] uppercase ${getStatusStyle(inv.status)}`}>
                                {inv.status}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Aging Report */}
        <TabsContent value="aging" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="shadow-sm border-border/60 lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold">Accounts Receivable Aging</CardTitle>
                <CardDescription className="text-xs">Outstanding invoices bucketed by days overdue</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[250px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={agingBuckets} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                      <XAxis dataKey="bucket" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                      <Tooltip contentStyle={{ borderRadius: '8px', fontSize: 12, border: '1px solid hsl(var(--border))' }} formatter={(v: any, n) => [`₹${Number(v).toLocaleString('en-IN')}`, 'Amount']} />
                      <Bar dataKey="amount" name="Amount" radius={[6, 6, 0, 0]}>
                        {agingBuckets.map((_, i) => (
                          <Cell key={i} fill={['#10b981', '#f59e0b', '#f97316', '#ef4444'][i % 4]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-sm border-border/60">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold">Aging Summary</CardTitle>
                <CardDescription className="text-xs">By overdue period</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {agingBuckets.map((b, i) => (
                  <div key={b.bucket} className="flex justify-between items-center p-3 rounded-xl bg-muted/30">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{b.bucket}</p>
                      <p className="text-xs text-muted-foreground">{b.count} invoice{b.count !== 1 ? 's' : ''}</p>
                    </div>
                    <p className="text-sm font-bold" style={{ color: ['#10b981', '#f59e0b', '#f97316', '#ef4444'][i % 4] }}>
                      ₹{b.amount.toLocaleString('en-IN')}
                    </p>
                  </div>
                ))}
                {agingBuckets.every(b => b.count === 0) && (
                  <div className="py-6 text-center text-muted-foreground text-sm">No outstanding invoices</div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Aging Detail Table */}
          {agingData.length > 0 && (
            <Card className="shadow-sm border-border/60 mt-4">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold">Outstanding Invoice Detail</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-muted/20 border-b border-border/50">
                        <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Invoice</th>
                        <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Client</th>
                        <th className="px-4 py-3 text-right font-semibold text-muted-foreground">Amount</th>
                        <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Due Date</th>
                        <th className="px-4 py-3 text-right font-semibold text-muted-foreground">Days Overdue</th>
                        <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Bucket</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {agingData.map((inv: any) => (
                        <tr key={inv.id} className="hover:bg-muted/10">
                          <td className="px-4 py-3 font-mono text-primary font-semibold">#{inv.invoiceNumber}</td>
                          <td className="px-4 py-3">{inv.clientName}</td>
                          <td className="px-4 py-3 text-right font-semibold">₹{inv.totalAmount?.toLocaleString('en-IN')}</td>
                          <td className="px-4 py-3 text-muted-foreground">{new Date(inv.dueDate).toLocaleDateString('en-IN')}</td>
                          <td className="px-4 py-3 text-right">
                            <span className={inv.daysOverdue > 0 ? 'text-red-600 font-semibold' : 'text-emerald-600'}>
                              {inv.daysOverdue > 0 ? `+${inv.daysOverdue}` : 'Current'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant="outline" className={`text-[10px] ${
                              inv.bucket === 'Current' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                              inv.bucket === '1–30 days' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                              'bg-red-50 text-red-700 border-red-200'
                            }`}>
                              {inv.bucket}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Workforce Report */}
        <TabsContent value="workforce" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="shadow-sm border-border/60">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold">Department Headcount</CardTitle>
                <CardDescription className="text-xs">Employees by department</CardDescription>
              </CardHeader>
              <CardContent>
                {deptData.length === 0 ? (
                  <EmptyChart message="No employee data" />
                ) : (
                  <div className="h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={deptData} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                        <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 11 }} allowDecimals={false} />
                        <YAxis type="category" dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} width={70} />
                        <Tooltip contentStyle={{ borderRadius: '8px', fontSize: 12, border: '1px solid hsl(var(--border))' }} />
                        <Bar dataKey="value" name="Employees" radius={[0, 6, 6, 0]}>
                          {deptData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="shadow-sm border-border/60">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold">Employee Directory</CardTitle>
                <CardDescription className="text-xs">All active employees</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-muted/20 border-b border-border/50">
                        <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Name</th>
                        <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Dept</th>
                        <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Designation</th>
                        <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {employees.map((e: any) => (
                        <tr key={e.id} className="hover:bg-muted/10">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-[10px]">
                                {e.firstName?.[0]}{e.lastName?.[0]}
                              </div>
                              <span className="font-semibold text-foreground">{e.firstName} {e.lastName}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{e.department}</td>
                          <td className="px-4 py-3 text-muted-foreground">{e.designation}</td>
                          <td className="px-4 py-3">
                            <Badge variant="outline" className={`text-[10px] ${e.status === 'active' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-50 text-slate-600'}`}>
                              {e.status}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ReportKPI({ label, value, icon: Icon, color }: { label: string; value: string; icon: any; color: string }) {
  const map: Record<string, string> = {
    blue: 'bg-blue-50 border-blue-100 text-blue-700',
    violet: 'bg-violet-50 border-violet-100 text-violet-700',
    emerald: 'bg-emerald-50 border-emerald-100 text-emerald-700',
    red: 'bg-red-50 border-red-100 text-red-700',
  };
  const iconMap: Record<string, string> = {
    blue: 'text-blue-500', violet: 'text-violet-500', emerald: 'text-emerald-500', red: 'text-red-500'
  };
  return (
    <div className={`rounded-xl border p-4 ${map[color]}`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`w-4 h-4 ${iconMap[color]}`} />
        <span className="text-xs font-semibold uppercase tracking-wide opacity-80">{label}</span>
      </div>
      <p className="text-2xl font-display font-bold">{value}</p>
    </div>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="h-[200px] flex items-center justify-center flex-col text-muted-foreground">
      <BarChart2 className="w-10 h-10 opacity-20 mb-2" />
      <p className="text-sm">{message}</p>
    </div>
  );
}

function getStatusStyle(status: string) {
  switch (status) {
    case 'paid': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    case 'draft': return 'bg-slate-100 text-slate-600 border-slate-200';
    case 'issued': return 'bg-blue-100 text-blue-700 border-blue-200';
    case 'overdue': return 'bg-red-100 text-red-700 border-red-200';
    default: return '';
  }
}
