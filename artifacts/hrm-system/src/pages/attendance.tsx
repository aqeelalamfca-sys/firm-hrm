import React, { useState } from "react";
import { useGetAttendance, useMarkAttendance, useGetEmployees } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Clock, CalendarIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Attendance() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const today = new Date().toISOString().split('T')[0];

  const requestOpts = { request: { headers: { Authorization: `Bearer ${token}` } } };
  const { data: attendance = [], isLoading } = useGetAttendance({ date: today } as any, requestOpts); // API might not support date filter natively yet, but we'll adapt
  const { data: employees = [] } = useGetEmployees({}, requestOpts);
  
  const markMutation = useMarkAttendance({
    ...requestOpts,
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/attendance"] });
        toast({ title: "Attendance recorded" });
      }
    }
  });

  const handleMark = (empId: number, status: 'present' | 'absent' | 'leave') => {
    markMutation.mutate({
      data: {
        employeeId: empId,
        date: today,
        status: status,
        checkIn: status === 'present' ? new Date().toLocaleTimeString() : undefined
      }
    });
  };

  // Create a merged view of all employees and their attendance for today
  const attendanceMap = new Map(attendance.map(a => [a.employeeId, a]));
  const list = employees.map(emp => ({
    ...emp,
    attendance: attendanceMap.get(emp.id)
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold">Daily Attendance</h1>
          <div className="flex items-center text-muted-foreground mt-1">
            <CalendarIcon className="w-4 h-4 mr-2" />
            {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </div>
        </div>
      </div>

      <Card className="border-border/50 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground uppercase bg-muted/30">
              <tr>
                <th className="px-6 py-4 font-semibold">Employee</th>
                <th className="px-6 py-4 font-semibold">Status</th>
                <th className="px-6 py-4 font-semibold">Check In</th>
                <th className="px-6 py-4 font-semibold text-right">Actions (Mark)</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={4} className="px-6 py-8 text-center text-muted-foreground">Loading...</td></tr>
              ) : list.length === 0 ? (
                <tr><td colSpan={4} className="px-6 py-8 text-center text-muted-foreground">No employees found.</td></tr>
              ) : (
                list.map((item) => (
                  <tr key={item.id} className="border-b border-border/50 hover:bg-muted/10 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-secondary text-secondary-foreground flex items-center justify-center font-bold text-xs">
                          {item.firstName[0]}{item.lastName[0]}
                        </div>
                        <span className="font-medium">{item.firstName} {item.lastName}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {item.attendance ? (
                        <Badge variant="outline" className={`
                          ${item.attendance.status === 'present' ? 'bg-green-100 text-green-700 border-green-200' : ''}
                          ${item.attendance.status === 'absent' ? 'bg-red-100 text-red-700 border-red-200' : ''}
                          ${item.attendance.status === 'leave' ? 'bg-amber-100 text-amber-700 border-amber-200' : ''}
                        `}>
                          {item.attendance.status}
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="bg-slate-100 text-slate-500 border-0">Not Marked</Badge>
                      )}
                    </td>
                    <td className="px-6 py-4 text-muted-foreground font-mono text-xs">
                      {item.attendance?.checkIn ? item.attendance.checkIn : '-'}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <Button 
                          size="sm" 
                          variant="outline" 
                          className="h-8 border-green-200 hover:bg-green-50 hover:text-green-700 text-green-600"
                          onClick={() => handleMark(item.id, 'present')}
                          disabled={!!item.attendance || markMutation.isPending}
                        >
                          <CheckCircle2 className="w-4 h-4 mr-1" /> Present
                        </Button>
                        <Button 
                          size="sm" 
                          variant="outline" 
                          className="h-8 border-red-200 hover:bg-red-50 hover:text-red-700 text-red-600"
                          onClick={() => handleMark(item.id, 'absent')}
                          disabled={!!item.attendance || markMutation.isPending}
                        >
                          <XCircle className="w-4 h-4 mr-1" /> Absent
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
