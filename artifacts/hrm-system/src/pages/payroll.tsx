import React, { useState } from "react";
import { useGetPayroll, useGeneratePayroll } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Play, Download, Banknote, TrendingUp, Users, CheckCircle, X } from "lucide-react";

export default function Payroll() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const currentDate = new Date();
  const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const currentMonth = months[currentDate.getMonth()];
  const currentYear = currentDate.getFullYear();

  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [payslipRecord, setPayslipRecord] = useState<any>(null);

  const requestOpts = { request: { headers: { Authorization: `Bearer ${token}` } } };
  const { data: payroll = [], isLoading } = useGetPayroll(
    { month: selectedMonth, year: currentYear.toString() },
    requestOpts
  );

  const generateMutation = useGeneratePayroll({
    ...requestOpts,
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/payroll"] });
        toast({ title: `Payroll generated for ${selectedMonth} ${currentYear}` });
      },
      onError: () => toast({ title: "Failed to generate payroll", variant: "destructive" })
    }
  });

  const totalNet = payroll.reduce((s: number, p: any) => s + p.netSalary, 0);
  const totalBasic = payroll.reduce((s: number, p: any) => s + p.basicSalary, 0);
  const totalAllowances = payroll.reduce((s: number, p: any) => s + p.allowances, 0);
  const totalDeductions = payroll.reduce((s: number, p: any) => s + p.deductions, 0);
  const paidCount = payroll.filter((p: any) => p.paymentStatus === 'paid').length;

  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold">Payroll Processing</h1>
          <p className="text-muted-foreground mt-1 text-sm">Generate and manage monthly employee salaries</p>
        </div>
        <div className="flex gap-3 items-center">
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-[150px] border-border/60 bg-card shadow-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {months.map(m => <SelectItem key={m} value={m}>{m} {currentYear}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button
            onClick={() => generateMutation.mutate({ data: { month: selectedMonth, year: currentYear } })}
            disabled={generateMutation.isPending}
            className="shadow-md shadow-primary/20 gap-2"
          >
            <Play className="w-4 h-4" />
            {generateMutation.isPending ? "Processing..." : "Run Payroll"}
          </Button>
        </div>
      </div>

      {payroll.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <PayrollStat label="Total Net Payout" value={`Rs. ${totalNet.toLocaleString('en-PK')}`} icon={Banknote} color="violet" />
          <PayrollStat label="Total Basic" value={`Rs. ${totalBasic.toLocaleString('en-PK')}`} icon={TrendingUp} color="blue" />
          <PayrollStat label="Employees" value={payroll.length.toString()} icon={Users} color="slate" />
          <PayrollStat label="Paid" value={`${paidCount}/${payroll.length}`} icon={CheckCircle} color="emerald" />
        </div>
      )}

      <Card className="border-border/60 shadow-sm overflow-hidden">
        <CardHeader className="py-4 px-6 bg-muted/20 border-b border-border/50">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold">
              Payroll — {selectedMonth} {currentYear}
            </CardTitle>
            {payroll.length > 0 && (
              <Badge variant="outline" className="text-xs font-medium">
                {payroll.length} employee{payroll.length !== 1 ? 's' : ''}
              </Badge>
            )}
          </div>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/50">
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Employee</th>
                <th className="px-6 py-3.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Basic</th>
                <th className="px-6 py-3.5 text-right text-xs font-semibold text-red-600 uppercase tracking-wide">Tax</th>
                <th className="px-6 py-3.5 text-right text-xs font-semibold text-red-600 uppercase tracking-wide">Deductions</th>
                <th className="px-6 py-3.5 text-right text-xs font-semibold text-foreground uppercase tracking-wide">Net Salary</th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                <th className="px-6 py-3.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Payslip</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="px-6 py-4">
                        <div className="h-4 bg-muted rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : payroll.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-16 text-center">
                    <Banknote className="w-10 h-10 text-muted-foreground/20 mx-auto mb-3" />
                    <p className="text-muted-foreground text-sm font-medium">No payroll for {selectedMonth}</p>
                    <p className="text-muted-foreground/60 text-xs mt-1">Click "Run Payroll" to generate salary records</p>
                  </td>
                </tr>
              ) : (
                payroll.map((record: any) => (
                  <tr key={record.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                          {record.employeeName?.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                        </div>
                        <div>
                          <p className="font-semibold text-foreground text-sm">{record.employeeName}</p>
                          <p className="text-xs text-muted-foreground font-mono">{record.employeeCode}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-medium tabular-nums">Rs. {record.basicSalary?.toLocaleString('en-PK')}</td>
                    <td className="px-6 py-4 text-right text-sm text-red-600 tabular-nums">-Rs. {(record.taxAmount || 0).toLocaleString('en-PK')}</td>
                    <td className="px-6 py-4 text-right text-sm text-red-600 tabular-nums">-Rs. {record.deductions?.toLocaleString('en-PK')}</td>
                    <td className="px-6 py-4 text-right font-bold text-base tabular-nums">Rs. {record.netSalary?.toLocaleString('en-PK')}</td>
                    <td className="px-6 py-4">
                      <Badge
                        variant="outline"
                        className={record.paymentStatus === 'paid'
                          ? 'bg-emerald-100 text-emerald-700 border-emerald-200 text-[11px]'
                          : 'bg-amber-100 text-amber-700 border-amber-200 text-[11px]'
                        }
                      >
                        {record.paymentStatus === 'paid' ? '✓ Paid' : 'Pending'}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="w-8 h-8 hover:bg-primary/10 hover:text-primary rounded-lg"
                        title="View Payslip"
                        onClick={() => setPayslipRecord(record)}
                      >
                        <Download className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {payroll.length > 0 && (
              <tfoot>
                <tr className="bg-muted/30 border-t-2 border-border/70 font-semibold">
                  <td className="px-6 py-4 text-xs text-muted-foreground uppercase tracking-wide">Total ({payroll.length} employees)</td>
                  <td className="px-6 py-4 text-right text-sm tabular-nums">Rs. {totalBasic.toLocaleString('en-PK')}</td>
                  <td className="px-6 py-4 text-right text-sm text-red-600 tabular-nums">-Rs. {payroll.reduce((s: number, p: any) => s + (p.taxAmount || 0), 0).toLocaleString('en-PK')}</td>
                  <td className="px-6 py-4 text-right text-sm text-red-600 tabular-nums">-Rs. {totalDeductions.toLocaleString('en-PK')}</td>
                  <td className="px-6 py-4 text-right text-base font-bold text-primary tabular-nums">Rs. {totalNet.toLocaleString('en-PK')}</td>
                  <td colSpan={2} className="px-6 py-4 text-right text-xs text-muted-foreground">
                    {paidCount}/{payroll.length} disbursed
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Card>

      <Dialog open={!!payslipRecord} onOpenChange={() => setPayslipRecord(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Banknote className="w-5 h-5 text-primary" />
              Payslip — {payslipRecord?.month} {payslipRecord?.year}
            </DialogTitle>
          </DialogHeader>
          {payslipRecord && (
            <div className="space-y-5">
              <div className="flex items-center gap-4 p-4 bg-muted/30 rounded-xl">
                <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold">
                  {payslipRecord.employeeName?.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                </div>
                <div>
                  <p className="font-semibold text-lg">{payslipRecord.employeeName}</p>
                  <p className="text-sm text-muted-foreground">
                    {payslipRecord.employeeCode} {payslipRecord.designation ? `· ${payslipRecord.designation}` : ""} {payslipRecord.department ? `· ${payslipRecord.department}` : ""}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="p-3 rounded-lg bg-blue-50 border border-blue-100">
                  <p className="text-xs text-blue-600 font-medium">Working Days</p>
                  <p className="text-lg font-bold text-blue-700">{payslipRecord.workingDays}</p>
                </div>
                <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-100">
                  <p className="text-xs text-emerald-600 font-medium">Days Present</p>
                  <p className="text-lg font-bold text-emerald-700">{payslipRecord.presentDays}</p>
                </div>
              </div>

              <div className="border rounded-xl overflow-hidden">
                <div className="bg-muted/20 px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Salary Breakdown</div>
                <div className="divide-y divide-border/40">
                  <PayslipRow label="Basic Salary" amount={payslipRecord.basicSalary} />
                  <PayslipRow label="Allowances" amount={payslipRecord.allowances} positive />
                  <PayslipRow label="Overtime Pay" amount={payslipRecord.overtimePay || 0} positive />
                  <PayslipRow label="Income Tax (Pakistan Slab)" amount={payslipRecord.taxAmount || 0} negative />
                  <PayslipRow label="Other Deductions" amount={payslipRecord.deductions - (payslipRecord.taxAmount || 0)} negative />
                  <PayslipRow label="Advances" amount={payslipRecord.advances} negative />
                  <div className="px-4 py-3 flex justify-between items-center bg-primary/5 font-bold">
                    <span className="text-sm">Net Salary</span>
                    <span className="text-lg text-primary tabular-nums">Rs. {payslipRecord.netSalary?.toLocaleString('en-PK')}</span>
                  </div>
                </div>
              </div>

              <div className="flex justify-between items-center">
                <Badge variant="outline" className={payslipRecord.paymentStatus === 'paid' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-amber-100 text-amber-700 border-amber-200'}>
                  {payslipRecord.paymentStatus === 'paid' ? '✓ Paid' : 'Payment Pending'}
                </Badge>
                {payslipRecord.paidDate && (
                  <span className="text-xs text-muted-foreground">Paid on {payslipRecord.paidDate}</span>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PayslipRow({ label, amount, positive, negative }: { label: string; amount: number; positive?: boolean; negative?: boolean }) {
  if (amount === 0 && (positive || negative)) return null;
  return (
    <div className="px-4 py-2.5 flex justify-between items-center text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={`tabular-nums font-medium ${negative ? 'text-red-600' : positive ? 'text-emerald-600' : ''}`}>
        {negative ? '-' : positive ? '+' : ''}Rs. {Math.abs(amount).toLocaleString('en-PK')}
      </span>
    </div>
  );
}

function PayrollStat({ label, value, icon: Icon, color }: { label: string; value: string; icon: any; color: string }) {
  const map: Record<string, string> = {
    violet: 'bg-violet-50 border-violet-100 text-violet-700',
    blue: 'bg-blue-50 border-blue-100 text-blue-700',
    slate: 'bg-slate-50 border-slate-200 text-slate-700',
    emerald: 'bg-emerald-50 border-emerald-100 text-emerald-700',
  };
  const iconMap: Record<string, string> = {
    violet: 'text-violet-500', blue: 'text-blue-500', slate: 'text-slate-400', emerald: 'text-emerald-500'
  };
  return (
    <div className={`rounded-xl border p-4 ${map[color]}`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`w-4 h-4 ${iconMap[color]}`} />
        <span className="text-xs font-semibold uppercase tracking-wide opacity-80">{label}</span>
      </div>
      <p className="text-xl font-display font-bold">{value}</p>
    </div>
  );
}
