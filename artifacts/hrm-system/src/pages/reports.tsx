import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Download, BarChart2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Reports() {
  const reports = [
    { title: "Monthly Attendance Register", desc: "Detailed breakdown of employee attendance, leaves, and hours.", icon: FileText, color: "text-blue-500 bg-blue-100" },
    { title: "Payroll Register", desc: "Complete payroll details including allowances and deductions.", icon: FileText, color: "text-green-500 bg-green-100" },
    { title: "Invoice Aging Report", desc: "Accounts receivable breakdown by 30, 60, 90+ days overdue.", icon: BarChart2, color: "text-amber-500 bg-amber-100" },
    { title: "Client Revenue Summary", desc: "Revenue generated grouped by client and service type.", icon: BarChart2, color: "text-purple-500 bg-purple-100" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-display font-bold">Standard Reports</h1>
        <p className="text-muted-foreground mt-1">Export and analyze firm data</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {reports.map((report, i) => (
          <Card key={i} className="border-border/50 shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="p-6 flex items-start gap-4">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${report.color}`}>
                <report.icon className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-lg mb-1">{report.title}</h3>
                <p className="text-sm text-muted-foreground mb-4">{report.desc}</p>
                <Button variant="outline" className="w-full sm:w-auto shadow-sm">
                  <Download className="w-4 h-4 mr-2" /> Export CSV
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
