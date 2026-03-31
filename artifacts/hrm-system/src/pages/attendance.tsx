import React, { useState } from "react";
import { useGetAttendance, useMarkAttendance, useGetEmployees } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Clock, CalendarIcon, Users, AlertCircle, Coffee } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Attendance() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const today = new Date().toISOString().split('T')[0];

  const requestOpts = { request: { headers: { Authorization: `Bearer ${token}` } } };
  const { data: attendance = [], isLoading: attendanceLoading } = useGetAttendance({ date: today } as any, requestOpts);
  const { data: employees = [], isLoading: empLoading } = useGetEmployees({}, requestOpts);

  const markMutation = useMarkAttendance({
    ...requestOpts,
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/attendance"] });
        toast({ title: "Attendance recorded" });
      },
      onError: () => {
        toast({ title: "Already marked or error occurred", variant: "destructive" });
      }
    }
  });

  const handleMark = (empId: number, status: 'present' | 'absent' | 'leave') => {
    markMutation.mutate({
      data: {
        employeeId: empId,
        date: today,
        status,
        checkIn: status === 'present' ? new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : undefined
      }
    });
  };

  const attendanceMap = new Map(attendance.map((a: any) => [a.employeeId, a]));
  const list = employees.map((emp: any) => ({
    ...emp,
    attendance: attendanceMap.get(emp.id) as any
  }));

  const presentCount = list.filter((e: any) => e.attendance?.status === 'present').length;
  const absentCount = list.filter((e: any) => e.attendance?.status === 'absent').length;
  const leaveCount = list.filter((e: any) => e.attendance?.status === 'leave').length;
  const unmarkedCount = list.filter((e: any) => !e.attendance).length;

  const isLoading = attendanceLoading || empLoading;

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-display font-bold">Daily Attendance</h1>
        <div className="flex items-center text-muted-foreground mt-1 text-sm">
          <CalendarIcon className="w-4 h-4 mr-2" />
          {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard label="Present" count={presentCount} total={employees.length} icon={CheckCircle2} color="emerald" />
        <SummaryCard label="Absent" count={absentCount} total={employees.length} icon={XCircle} color="red" />
        <SummaryCard label="On Leave" count={leaveCount} total={employees.length} icon={Coffee} color="amber" />
        <SummaryCard label="Not Marked" count={unmarkedCount} total={employees.length} icon={AlertCircle} color="slate" />
      </div>

      {/* Attendance Table */}
      <Card className="border-border/60 shadow-sm overflow-hidden">
        <CardHeader className="bg-muted/20 border-b border-border/50 py-4 px-6">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold">Employee Attendance Register</CardTitle>
            <Badge variant="outline" className="text-xs font-medium">
              {employees.length} employees
            </Badge>
          </div>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/20 border-b border-border/50">
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Employee</th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Department</th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Check In</th>
                <th className="px-6 py-3.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 5 }).map((_, j) => (
                      <td key={j} className="px-6 py-4">
                        <div className="h-4 bg-muted rounded animate-pulse w-full max-w-[120px]" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : list.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center">
                    <Users className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-muted-foreground text-sm">No employees found</p>
                  </td>
                </tr>
              ) : (
                list.map((item: any) => (
                  <tr key={item.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs shrink-0">
                          {item.firstName[0]}{item.lastName[0]}
                        </div>
                        <div>
                          <p className="font-semibold text-foreground text-sm">{item.firstName} {item.lastName}</p>
                          <p className="text-xs text-muted-foreground font-mono">{item.employeeCode}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-muted-foreground">{item.department}</span>
                    </td>
                    <td className="px-6 py-4">
                      <AttendanceStatusBadge status={item.attendance?.status} />
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm font-mono text-muted-foreground">
                        {item.attendance?.checkIn || '—'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:border-emerald-300 disabled:opacity-40"
                          onClick={() => handleMark(item.id, 'present')}
                          disabled={!!item.attendance || markMutation.isPending}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" /> Present
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300 disabled:opacity-40"
                          onClick={() => handleMark(item.id, 'absent')}
                          disabled={!!item.attendance || markMutation.isPending}
                        >
                          <XCircle className="w-3.5 h-3.5 mr-1.5" /> Absent
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 border-amber-200 text-amber-600 hover:bg-amber-50 hover:border-amber-300 disabled:opacity-40"
                          onClick={() => handleMark(item.id, 'leave')}
                          disabled={!!item.attendance || markMutation.isPending}
                        >
                          <Coffee className="w-3.5 h-3.5 mr-1.5" /> Leave
                        </Button>
                      </div>
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

function SummaryCard({ label, count, total, icon: Icon, color }: {
  label: string; count: number; total: number; icon: any; color: string;
}) {
  const colorMap: Record<string, string> = {
    emerald: 'bg-emerald-50 border-emerald-100 text-emerald-700',
    red: 'bg-red-50 border-red-100 text-red-700',
    amber: 'bg-amber-50 border-amber-100 text-amber-700',
    slate: 'bg-slate-50 border-slate-200 text-slate-600',
  };
  const iconMap: Record<string, string> = {
    emerald: 'text-emerald-500',
    red: 'text-red-500',
    amber: 'text-amber-500',
    slate: 'text-slate-400',
  };
  return (
    <div className={`rounded-xl border p-4 ${colorMap[color]}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold uppercase tracking-wide opacity-80">{label}</span>
        <Icon className={`w-4 h-4 ${iconMap[color]}`} />
      </div>
      <p className="text-2xl font-display font-bold">{count}</p>
      <p className="text-xs opacity-70 mt-0.5">of {total} employees</p>
    </div>
  );
}

function AttendanceStatusBadge({ status }: { status?: string }) {
  if (!status) {
    return <Badge variant="outline" className="bg-slate-50 text-slate-500 border-slate-200 text-[11px]">Not Marked</Badge>;
  }
  const map: Record<string, string> = {
    present: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    absent: 'bg-red-100 text-red-700 border-red-200',
    leave: 'bg-amber-100 text-amber-700 border-amber-200',
    late: 'bg-orange-100 text-orange-700 border-orange-200',
    half_day: 'bg-blue-100 text-blue-700 border-blue-200',
  };
  return (
    <Badge variant="outline" className={`capitalize text-[11px] px-2 py-0.5 ${map[status] || ''}`}>
      {status.replace('_', ' ')}
    </Badge>
  );
}
