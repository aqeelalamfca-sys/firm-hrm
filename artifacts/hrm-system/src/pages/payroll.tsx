import React, { useState } from "react";
import { useGetPayroll, useGeneratePayroll } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Play, Download } from "lucide-react";

export default function Payroll() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const currentDate = new Date();
  const currentMonth = currentDate.toLocaleString('default', { month: 'long' });
  const currentYear = currentDate.getFullYear();
  
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);

  const requestOpts = { request: { headers: { Authorization: `Bearer ${token}` } } };
  const { data: payroll = [], isLoading } = useGetPayroll({ month: selectedMonth, year: currentYear.toString() }, requestOpts);
  
  const generateMutation = useGeneratePayroll({
    ...requestOpts,
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/payroll"] });
        toast({ title: "Payroll generated successfully" });
      }
    }
  });

  const handleGenerate = () => {
    generateMutation.mutate({
      data: { month: selectedMonth, year: currentYear }
    });
  };

  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold">Payroll Processing</h1>
          <p className="text-muted-foreground mt-1">Generate and manage monthly salaries</p>
        </div>
        <div className="flex gap-3 items-center">
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-[140px] bg-card border-border/50">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {months.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={handleGenerate} disabled={generateMutation.isPending} className="shadow-md shadow-primary/20">
            <Play className="w-4 h-4 mr-2" /> 
            {generateMutation.isPending ? "Generating..." : "Run Payroll"}
          </Button>
        </div>
      </div>

      <Card className="border-border/50 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground uppercase bg-muted/30">
              <tr>
                <th className="px-6 py-4 font-semibold">Employee</th>
                <th className="px-6 py-4 font-semibold text-right">Basic</th>
                <th className="px-6 py-4 font-semibold text-right text-green-600">Alw</th>
                <th className="px-6 py-4 font-semibold text-right text-red-600">Ded</th>
                <th className="px-6 py-4 font-semibold text-right">Net Salary</th>
                <th className="px-6 py-4 font-semibold">Status</th>
                <th className="px-6 py-4 font-semibold text-right">Payslip</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={7} className="px-6 py-8 text-center text-muted-foreground">Loading payroll data...</td></tr>
              ) : payroll.length === 0 ? (
                <tr><td colSpan={7} className="px-6 py-12 text-center text-muted-foreground border-dashed">No payroll records generated for {selectedMonth} yet.</td></tr>
              ) : (
                payroll.map((record) => (
                  <tr key={record.id} className="border-b border-border/50 hover:bg-muted/10">
                    <td className="px-6 py-4">
                      <p className="font-semibold">{record.employeeName}</p>
                      <p className="text-xs font-mono text-muted-foreground">{record.employeeCode}</p>
                    </td>
                    <td className="px-6 py-4 text-right font-medium">${record.basicSalary.toLocaleString()}</td>
                    <td className="px-6 py-4 text-right text-green-600">+${record.allowances.toLocaleString()}</td>
                    <td className="px-6 py-4 text-right text-red-600">-${record.deductions.toLocaleString()}</td>
                    <td className="px-6 py-4 text-right font-bold text-base">${record.netSalary.toLocaleString()}</td>
                    <td className="px-6 py-4">
                      <Badge variant={record.paymentStatus === 'paid' ? 'default' : 'secondary'}
                        className={record.paymentStatus === 'paid' ? 'bg-green-100 text-green-700 hover:bg-green-100' : ''}>
                        {record.paymentStatus}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Button variant="ghost" size="icon" className="hover:bg-primary/10 hover:text-primary">
                        <Download className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
