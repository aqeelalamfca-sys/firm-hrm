import React, { useState } from "react";
import { useGetLeaves, useUpdateLeave, useApplyLeave } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Check, X, Clock, Palmtree, Plus, CalendarDays, Smile, Stethoscope, MessageSquare, User } from "lucide-react";

const LEAVE_ICONS: Record<string, any> = {
  annual: Smile,
  sick: Stethoscope,
  casual: CalendarDays,
};

const LEAVE_COLORS: Record<string, string> = {
  annual: 'bg-blue-100 text-blue-700 border-blue-200',
  sick: 'bg-rose-100 text-rose-700 border-rose-200',
  casual: 'bg-violet-100 text-violet-700 border-violet-200',
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700 border-amber-200',
  approved: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  rejected: 'bg-red-100 text-red-700 border-red-200',
};

export default function Leaves() {
  const { token, user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("all");
  const [rejectDialog, setRejectDialog] = useState<{ open: boolean; leaveId: number | null; employeeName: string }>({ open: false, leaveId: null, employeeName: "" });
  const [rejectReason, setRejectReason] = useState("");

  const requestOpts = { request: { headers: { Authorization: `Bearer ${token}` } } };
  const { data: leaves = [], isLoading } = useGetLeaves({}, requestOpts);

  const applyMutation = useApplyLeave({
    ...requestOpts,
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/leaves"] });
        setIsDialogOpen(false);
        toast({ title: "Leave application submitted successfully" });
      },
      onError: () => toast({ title: "Failed to submit leave application", variant: "destructive" })
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

  const handleApply = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    applyMutation.mutate({
      data: {
        employeeId: (user as any)?.employeeId || 1,
        leaveType: fd.get('leaveType') as any,
        fromDate: fd.get('fromDate') as string,
        toDate: fd.get('toDate') as string,
        reason: fd.get('reason') as string,
      }
    });
  };

  const pending = leaves.filter((l: any) => l.status === 'pending');
  const approved = leaves.filter((l: any) => l.status === 'approved');
  const rejected = leaves.filter((l: any) => l.status === 'rejected');

  const filtered = activeTab === 'all' ? leaves
    : activeTab === 'pending' ? pending
    : activeTab === 'approved' ? approved
    : rejected;

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold">Leave Requests</h1>
          <p className="text-muted-foreground mt-1 text-sm">Manage employee time-off requests</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="shadow-md shadow-primary/20 gap-2">
              <Plus className="w-4 h-4" /> Apply Leave
            </Button>
          </DialogTrigger>
          <DialogContent className="border-border/60 sm:max-w-[440px]">
            <DialogHeader>
              <DialogTitle className="font-display text-xl">Apply for Leave</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleApply} className="space-y-4 pt-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Leave Type *</label>
                <Select name="leaveType" defaultValue="annual">
                  <SelectTrigger className="bg-muted/40 border-border/50"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="annual">Annual Leave</SelectItem>
                    <SelectItem value="sick">Sick Leave</SelectItem>
                    <SelectItem value="casual">Casual Leave</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">From Date *</label>
                  <Input type="date" name="fromDate" required className="bg-muted/40 border-border/50" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">To Date *</label>
                  <Input type="date" name="toDate" required className="bg-muted/40 border-border/50" />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Reason *</label>
                <Input name="reason" required className="bg-muted/40 border-border/50" placeholder="Brief reason for leave..." />
              </div>
              <div className="pt-4 flex justify-end gap-3 border-t border-border/50">
                <Button variant="ghost" type="button" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={applyMutation.isPending} className="shadow-md shadow-primary/20">
                  {applyMutation.isPending ? "Submitting..." : "Submit Application"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-amber-100 bg-amber-50 p-4">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="w-4 h-4 text-amber-500" />
            <span className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Pending</span>
          </div>
          <p className="text-2xl font-display font-bold text-amber-700">{pending.length}</p>
        </div>
        <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4">
          <div className="flex items-center gap-2 mb-1">
            <Check className="w-4 h-4 text-emerald-500" />
            <span className="text-xs font-semibold text-emerald-700 uppercase tracking-wide">Approved</span>
          </div>
          <p className="text-2xl font-display font-bold text-emerald-700">{approved.length}</p>
        </div>
        <div className="rounded-xl border border-red-100 bg-red-50 p-4">
          <div className="flex items-center gap-2 mb-1">
            <X className="w-4 h-4 text-red-500" />
            <span className="text-xs font-semibold text-red-700 uppercase tracking-wide">Rejected</span>
          </div>
          <p className="text-2xl font-display font-bold text-red-700">{rejected.length}</p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-muted/40 border border-border/50 p-1 rounded-xl h-auto">
          {[
            { key: 'all', label: `All (${leaves.length})` },
            { key: 'pending', label: `Pending (${pending.length})` },
            { key: 'approved', label: `Approved (${approved.length})` },
            { key: 'rejected', label: `Rejected (${rejected.length})` },
          ].map(({ key, label }) => (
            <TabsTrigger key={key} value={key} className="text-xs px-3 py-1.5 rounded-lg data-[state=active]:shadow-sm">
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={activeTab} className="mt-4">
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-24 bg-muted rounded-xl animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <Card className="border-dashed border-border/60">
              <CardContent className="py-16 text-center">
                <Palmtree className="w-10 h-10 text-muted-foreground/20 mx-auto mb-3" />
                <p className="text-muted-foreground text-sm font-medium">No leave requests found</p>
                <p className="text-muted-foreground/60 text-xs mt-1">
                  {activeTab === 'pending' ? 'All caught up!' : 'No records in this category'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {filtered.map((leave: any) => {
                const LeaveIcon = LEAVE_ICONS[leave.leaveType] || CalendarDays;
                return (
                  <Card key={leave.id} className="border-border/60 shadow-sm hover:shadow-md transition-shadow">
                    <CardContent className="p-5">
                      <div className="flex flex-col sm:flex-row justify-between gap-4">
                        <div className="flex items-start gap-4">
                          {/* Avatar */}
                          <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm shrink-0">
                            {leave.employeeName?.charAt(0) || 'E'}
                          </div>
                          <div>
                            <div className="flex items-center flex-wrap gap-2 mb-1">
                              <h3 className="font-semibold text-base text-foreground">{leave.employeeName}</h3>
                              <Badge variant="outline" className={`text-[10px] uppercase tracking-wide px-2 py-0.5 ${STATUS_COLORS[leave.status] || ''}`}>
                                {leave.status}
                              </Badge>
                              <Badge variant="outline" className={`text-[10px] capitalize px-2 py-0.5 ${LEAVE_COLORS[leave.leaveType] || ''}`}>
                                <LeaveIcon className="w-3 h-3 mr-1" />
                                {leave.leaveType} leave
                              </Badge>
                            </div>
                            <p className="text-sm text-foreground/80 mb-1.5">{leave.reason}</p>
                            <div className="flex items-center gap-4 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <CalendarDays className="w-3.5 h-3.5" />
                                {new Date(leave.fromDate).toLocaleDateString('en-PK', { day: 'numeric', month: 'short' })}
                                {' → '}
                                {new Date(leave.toDate).toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' })}
                              </span>
                              <span className="font-medium text-foreground/70">{leave.totalDays} day{leave.totalDays !== 1 ? 's' : ''}</span>
                            </div>
                          </div>
                        </div>

                        {/* Reviewer Info */}
                        {leave.status !== 'pending' && (leave.approvedByName || leave.approvalNotes) && (
                          <div className="mt-3 pt-3 border-t border-border/40">
                            <div className="flex flex-wrap items-start gap-3">
                              {leave.approvedByName && (
                                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                  <User className="w-3.5 h-3.5" />
                                  <span>{leave.status === 'rejected' ? 'Rejected' : 'Approved'} by <span className="font-medium text-foreground/80">{leave.approvedByName}</span></span>
                                </div>
                              )}
                              {leave.approvalNotes && (
                                <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                                  <MessageSquare className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                                  <span className={leave.status === 'rejected' ? 'text-red-600' : 'text-foreground/70'}>{leave.approvalNotes}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Actions */}
                        {leave.status === 'pending' && (
                          <div className="flex items-center gap-2 sm:self-center shrink-0">
                            <Button
                              size="sm"
                              className="bg-emerald-600 hover:bg-emerald-700 shadow-md shadow-emerald-600/20 gap-1.5 h-8"
                              onClick={() => updateMutation.mutate({ id: leave.id, data: { status: 'approved' } })}
                              disabled={updateMutation.isPending}
                            >
                              <Check className="w-3.5 h-3.5" /> Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-red-200 text-red-600 hover:bg-red-50 gap-1.5 h-8"
                              onClick={() => {
                                setRejectDialog({ open: true, leaveId: leave.id, employeeName: leave.employeeName });
                                setRejectReason("");
                              }}
                              disabled={updateMutation.isPending}
                            >
                              <X className="w-3.5 h-3.5" /> Reject
                            </Button>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

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
              updateMutation.mutate(
                { id: rejectDialog.leaveId, data: { status: 'rejected', approvalNotes: rejectReason.trim() } },
                { onSuccess: () => setRejectDialog({ open: false, leaveId: null, employeeName: "" }) }
              );
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
              <Button type="submit" disabled={updateMutation.isPending} className="bg-red-600 hover:bg-red-700 text-white shadow-md">
                {updateMutation.isPending ? "Rejecting..." : "Reject Leave"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
