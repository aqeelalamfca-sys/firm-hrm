import React, { useState } from "react";
import { useGetInvoices, useCreateInvoice, useUpdateInvoiceStatus, useGetClients } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Plus, FileText, CheckCircle, Send, IndianRupee, AlertTriangle, ChevronRight } from "lucide-react";

const STATUS_FLOW: Record<string, string> = {
  draft: 'issued',
  issued: 'paid',
};
const STATUS_LABELS: Record<string, string> = {
  draft: 'Issue',
  issued: 'Mark Paid',
};
const STATUS_ICONS: Record<string, any> = {
  draft: Send,
  issued: CheckCircle,
};

function getStatusStyle(status: string) {
  switch (status) {
    case 'paid': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    case 'draft': return 'bg-slate-100 text-slate-600 border-slate-200';
    case 'issued': return 'bg-blue-100 text-blue-700 border-blue-200';
    case 'approved': return 'bg-violet-100 text-violet-700 border-violet-200';
    case 'overdue': return 'bg-red-100 text-red-700 border-red-200';
    default: return 'bg-slate-100 text-slate-600 border-slate-200';
  }
}

export default function Invoices() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("all");

  const requestOpts = { request: { headers: { Authorization: `Bearer ${token}` } } };
  const { data: invoices = [], isLoading } = useGetInvoices({}, requestOpts);
  const { data: clients = [] } = useGetClients({}, requestOpts);

  const createMutation = useCreateInvoice({
    ...requestOpts,
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
        setIsDialogOpen(false);
        toast({ title: "Invoice created successfully" });
      },
      onError: () => toast({ title: "Failed to create invoice", variant: "destructive" })
    }
  });

  const statusMutation = useUpdateInvoiceStatus({
    ...requestOpts,
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
        toast({ title: "Invoice status updated" });
      }
    }
  });

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    createMutation.mutate({
      data: {
        clientId: parseInt(fd.get('clientId') as string),
        serviceType: fd.get('serviceType') as any,
        description: fd.get('description') as string,
        amount: parseFloat(fd.get('amount') as string),
        tax: parseFloat(fd.get('tax') as string || '0'),
        issueDate: fd.get('issueDate') as string,
        dueDate: fd.get('dueDate') as string,
      }
    });
  };

  const filteredInvoices = activeTab === 'all'
    ? invoices
    : invoices.filter((inv: any) => inv.status === activeTab);

  const summary = {
    total: invoices.length,
    draft: invoices.filter((i: any) => i.status === 'draft').length,
    issued: invoices.filter((i: any) => i.status === 'issued').length,
    paid: invoices.filter((i: any) => i.status === 'paid').length,
    overdue: invoices.filter((i: any) => i.status === 'overdue').length,
    totalAmount: invoices.reduce((s: number, i: any) => s + (i.totalAmount || 0), 0),
    outstanding: invoices.filter((i: any) => i.status !== 'paid').reduce((s: number, i: any) => s + (i.totalAmount || 0), 0),
  };

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold">Invoices</h1>
          <p className="text-muted-foreground mt-1 text-sm">Client billing and receivables management</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="shadow-md shadow-primary/20 gap-2">
              <Plus className="w-4 h-4" /> Create Invoice
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[520px]">
            <DialogHeader>
              <DialogTitle className="font-display text-xl">Create New Invoice</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4 pt-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Client *</label>
                <Select name="clientId" required>
                  <SelectTrigger className="bg-muted/40 border-border/50">
                    <SelectValue placeholder="Select a client" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map((c: any) => (
                      <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Service Type *</label>
                <Select name="serviceType" defaultValue="accounting">
                  <SelectTrigger className="bg-muted/40 border-border/50"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="audit">Statutory Audit</SelectItem>
                    <SelectItem value="tax">Tax Compliance</SelectItem>
                    <SelectItem value="advisory">Business Advisory</SelectItem>
                    <SelectItem value="accounting">Accounting & Bookkeeping</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Description *</label>
                <Input name="description" required className="bg-muted/40 border-border/50" placeholder="Brief description of services..." />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Amount (₹) *</label>
                  <Input type="number" name="amount" required step="0.01" className="bg-muted/40 border-border/50" placeholder="0.00" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">GST (%)</label>
                  <Input type="number" name="tax" defaultValue="18" className="bg-muted/40 border-border/50" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Issue Date *</label>
                  <Input type="date" name="issueDate" required defaultValue={new Date().toISOString().split('T')[0]} className="bg-muted/40 border-border/50" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Due Date *</label>
                  <Input type="date" name="dueDate" required className="bg-muted/40 border-border/50" />
                </div>
              </div>
              <div className="pt-4 flex justify-end gap-3 border-t border-border/50">
                <Button variant="ghost" type="button" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={createMutation.isPending} className="shadow-md shadow-primary/20">
                  {createMutation.isPending ? "Creating..." : "Create Invoice"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <InvoiceStat label="Total Invoices" value={summary.total.toString()} color="blue" />
        <InvoiceStat label="Pending Payment" value={summary.issued.toString()} color="amber" />
        <InvoiceStat label="Paid" value={summary.paid.toString()} color="emerald" />
        <InvoiceStat label="Overdue" value={summary.overdue.toString()} color="red" />
      </div>

      {/* Tabs + Table */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-muted/40 border border-border/50 p-1 rounded-xl h-auto">
          {[
            { key: 'all', label: `All (${summary.total})` },
            { key: 'draft', label: `Draft (${summary.draft})` },
            { key: 'issued', label: `Issued (${summary.issued})` },
            { key: 'paid', label: `Paid (${summary.paid})` },
            { key: 'overdue', label: `Overdue (${summary.overdue})` },
          ].map(({ key, label }) => (
            <TabsTrigger key={key} value={key} className="text-xs px-3 py-1.5 rounded-lg data-[state=active]:shadow-sm">
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={activeTab} className="mt-4">
          <Card className="border-border/60 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/20 border-b border-border/50">
                    <th className="px-6 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Invoice #</th>
                    <th className="px-6 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Client & Service</th>
                    <th className="px-6 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Amount</th>
                    <th className="px-6 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Due Date</th>
                    <th className="px-6 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                    <th className="px-6 py-3.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {isLoading ? (
                    Array.from({ length: 3 }).map((_, i) => (
                      <tr key={i}>
                        {Array.from({ length: 6 }).map((_, j) => (
                          <td key={j} className="px-6 py-4">
                            <div className="h-4 bg-muted rounded animate-pulse" />
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : filteredInvoices.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-16 text-center">
                        <FileText className="w-10 h-10 text-muted-foreground/20 mx-auto mb-3" />
                        <p className="text-muted-foreground text-sm">No invoices found</p>
                        <p className="text-muted-foreground/60 text-xs mt-1">Create your first invoice to get started</p>
                      </td>
                    </tr>
                  ) : (
                    filteredInvoices.map((inv: any) => {
                      const ActionIcon = STATUS_ICONS[inv.status];
                      const nextStatus = STATUS_FLOW[inv.status];
                      return (
                        <tr key={inv.id} className="hover:bg-muted/20 transition-colors">
                          <td className="px-6 py-4">
                            <span className="font-mono font-semibold text-primary text-sm">#{inv.invoiceNumber}</span>
                          </td>
                          <td className="px-6 py-4">
                            <p className="font-semibold text-sm text-foreground">{inv.clientName}</p>
                            <p className="text-xs text-muted-foreground capitalize mt-0.5">{inv.serviceType?.replace('_', ' ')}</p>
                          </td>
                          <td className="px-6 py-4">
                            <div>
                              <p className="font-bold text-sm">₹{inv.totalAmount?.toLocaleString('en-IN')}</p>
                              {inv.tax > 0 && (
                                <p className="text-xs text-muted-foreground">incl. {inv.tax}% GST</p>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div>
                              <p className="text-sm text-foreground">{new Date(inv.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                              {inv.status === 'overdue' && (
                                <p className="text-xs text-red-600 flex items-center gap-1 mt-0.5">
                                  <AlertTriangle className="w-3 h-3" /> Overdue
                                </p>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <Badge variant="outline" className={`uppercase tracking-wide text-[10px] px-2.5 py-0.5 font-semibold ${getStatusStyle(inv.status)}`}>
                              {inv.status}
                            </Badge>
                          </td>
                          <td className="px-6 py-4 text-right">
                            {nextStatus && (
                              <Button
                                size="sm"
                                variant={inv.status === 'issued' ? 'default' : 'outline'}
                                className={`h-8 text-xs gap-1.5 ${inv.status === 'issued' ? 'bg-emerald-600 hover:bg-emerald-700 shadow-md shadow-emerald-600/20' : ''}`}
                                disabled={statusMutation.isPending}
                                onClick={() => statusMutation.mutate({ id: inv.id, data: { status: nextStatus as any } })}
                              >
                                {ActionIcon && <ActionIcon className="w-3.5 h-3.5" />}
                                {STATUS_LABELS[inv.status]}
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            {!isLoading && filteredInvoices.length > 0 && (
              <div className="px-6 py-3 bg-muted/20 border-t border-border/50 flex justify-between items-center">
                <span className="text-xs text-muted-foreground">{filteredInvoices.length} invoice{filteredInvoices.length !== 1 ? 's' : ''}</span>
                <span className="text-sm font-semibold">
                  Outstanding: ₹{summary.outstanding.toLocaleString('en-IN')}
                </span>
              </div>
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function InvoiceStat({ label, value, color }: { label: string; value: string; color: string }) {
  const colorMap: Record<string, string> = {
    blue: 'bg-blue-50 border-blue-100 text-blue-700',
    amber: 'bg-amber-50 border-amber-100 text-amber-700',
    emerald: 'bg-emerald-50 border-emerald-100 text-emerald-700',
    red: 'bg-red-50 border-red-100 text-red-700',
  };
  return (
    <div className={`rounded-xl border p-4 ${colorMap[color]}`}>
      <p className="text-xs font-semibold uppercase tracking-wide opacity-75 mb-1">{label}</p>
      <p className="text-2xl font-display font-bold">{value}</p>
    </div>
  );
}
