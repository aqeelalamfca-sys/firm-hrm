import React, { useState } from "react";
import { useGetLeaves, useUpdateLeave, useApplyLeave, useGetEmployees } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Check, X } from "lucide-react";

export default function Leaves() {
  const { token, user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const requestOpts = { request: { headers: { Authorization: `Bearer ${token}` } } };
  const { data: leaves = [], isLoading } = useGetLeaves({}, requestOpts);
  
  const applyMutation = useApplyLeave({
    ...requestOpts,
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/leaves"] });
        setIsDialogOpen(false);
        toast({ title: "Leave application submitted" });
      }
    }
  });

  const updateMutation = useUpdateLeave({
    ...requestOpts,
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/leaves"] });
        toast({ title: "Leave status updated" });
      }
    }
  });

  const handleStatusChange = (id: number, status: 'approved' | 'rejected') => {
    updateMutation.mutate({ id, data: { status } });
  };

  const handleApply = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    applyMutation.mutate({
      data: {
        employeeId: user?.employeeId || 1, // Fallback for demo
        leaveType: fd.get('leaveType') as any,
        fromDate: fd.get('fromDate') as string,
        toDate: fd.get('toDate') as string,
        reason: fd.get('reason') as string,
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-display font-bold">Leave Requests</h1>
          <p className="text-muted-foreground mt-1">Manage employee time off</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="shadow-md">Apply Leave</Button>
          </DialogTrigger>
          <DialogContent className="border-border/50">
            <DialogHeader>
              <DialogTitle>Apply for Leave</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleApply} className="space-y-4 pt-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Leave Type</label>
                <Select name="leaveType" defaultValue="annual">
                  <SelectTrigger className="bg-muted/50 border-0"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="annual">Annual Leave</SelectItem>
                    <SelectItem value="sick">Sick Leave</SelectItem>
                    <SelectItem value="casual">Casual Leave</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">From Date</label>
                  <Input type="date" name="fromDate" required className="bg-muted/50 border-0" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">To Date</label>
                  <Input type="date" name="toDate" required className="bg-muted/50 border-0" />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Reason</label>
                <Input name="reason" required className="bg-muted/50 border-0" />
              </div>
              <div className="pt-4 flex justify-end gap-2">
                <Button variant="ghost" type="button" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={applyMutation.isPending}>Submit Application</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4">
        {isLoading ? (
          <p className="text-muted-foreground">Loading requests...</p>
        ) : leaves.length === 0 ? (
          <Card className="p-12 text-center text-muted-foreground border-dashed">No leave requests found.</Card>
        ) : (
          leaves.map((leave) => (
            <Card key={leave.id} className="p-5 flex flex-col md:flex-row justify-between gap-4 border-border/50 shadow-sm hover:shadow-md transition-shadow">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="font-semibold text-lg">{leave.employeeName}</h3>
                  <Badge variant={
                    leave.status === 'approved' ? 'default' : 
                    leave.status === 'rejected' ? 'destructive' : 'secondary'
                  } className={leave.status === 'approved' ? 'bg-green-500 hover:bg-green-600' : ''}>
                    {leave.status}
                  </Badge>
                  <Badge variant="outline" className="text-muted-foreground capitalize">{leave.leaveType} Leave</Badge>
                </div>
                <p className="text-sm text-foreground/80 mb-1">{leave.reason}</p>
                <p className="text-xs font-mono text-muted-foreground">
                  {new Date(leave.fromDate).toLocaleDateString()} — {new Date(leave.toDate).toLocaleDateString()} ({leave.totalDays} days)
                </p>
              </div>
              
              {leave.status === 'pending' && (
                <div className="flex items-center gap-2 md:self-center">
                  <Button size="sm" variant="outline" className="border-green-200 text-green-600 hover:bg-green-50"
                    onClick={() => handleStatusChange(leave.id, 'approved')} disabled={updateMutation.isPending}>
                    <Check className="w-4 h-4 mr-1" /> Approve
                  </Button>
                  <Button size="sm" variant="outline" className="border-red-200 text-red-600 hover:bg-red-50"
                    onClick={() => handleStatusChange(leave.id, 'rejected')} disabled={updateMutation.isPending}>
                    <X className="w-4 h-4 mr-1" /> Reject
                  </Button>
                </div>
              )}
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
