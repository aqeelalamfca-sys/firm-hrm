import React, { useState } from "react";
import { useGetInvoices, useCreateInvoice, useUpdateInvoiceStatus, useGetClients } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Receipt, FileCheck, ArrowRight } from "lucide-react";

export default function Invoices() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const requestOpts = { request: { headers: { Authorization: `Bearer ${token}` } } };
  const { data: invoices = [], isLoading } = useGetInvoices({}, requestOpts);
  const { data: clients = [] } = useGetClients({}, requestOpts);
  
  const createMutation = useCreateInvoice({
    ...requestOpts,
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
        setIsDialogOpen(false);
        toast({ title: "Invoice created" });
      }
    }
  });

  const statusMutation = useUpdateInvoiceStatus({
    ...requestOpts,
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/invoices"] })
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

  const getStatusColor = (status: string) => {
    switch(status) {
      case 'paid': return 'bg-green-100 text-green-700 border-green-200';
      case 'draft': return 'bg-slate-100 text-slate-700 border-slate-200';
      case 'issued': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'overdue': return 'bg-red-100 text-red-700 border-red-200';
      default: return '';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold">Invoices</h1>
          <p className="text-muted-foreground mt-1">Manage client billing and receivables</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="shadow-md shadow-primary/20"><Plus className="w-4 h-4 mr-2" /> Create Invoice</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader><DialogTitle>Create New Invoice</DialogTitle></DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4 pt-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Client</label>
                <Select name="clientId" required>
                  <SelectTrigger><SelectValue placeholder="Select client" /></SelectTrigger>
                  <SelectContent>
                    {clients.map(c => <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Service Type</label>
                <Select name="serviceType" defaultValue="accounting">
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="audit">Audit</SelectItem>
                    <SelectItem value="tax">Tax</SelectItem>
                    <SelectItem value="advisory">Advisory</SelectItem>
                    <SelectItem value="accounting">Accounting</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Description</label>
                <Input name="description" required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Amount ($)</label>
                  <Input type="number" name="amount" required step="0.01" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Tax (%)</label>
                  <Input type="number" name="tax" defaultValue="0" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Issue Date</label>
                  <Input type="date" name="issueDate" required defaultValue={new Date().toISOString().split('T')[0]} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Due Date</label>
                  <Input type="date" name="dueDate" required />
                </div>
              </div>
              <div className="pt-4 flex justify-end gap-2">
                <Button variant="ghost" type="button" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={createMutation.isPending}>Create Invoice</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="border-border/50 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground uppercase bg-muted/30">
              <tr>
                <th className="px-6 py-4 font-semibold">Invoice #</th>
                <th className="px-6 py-4 font-semibold">Client</th>
                <th className="px-6 py-4 font-semibold">Amount</th>
                <th className="px-6 py-4 font-semibold">Dates</th>
                <th className="px-6 py-4 font-semibold">Status</th>
                <th className="px-6 py-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={6} className="px-6 py-8 text-center text-muted-foreground">Loading invoices...</td></tr>
              ) : invoices.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">No invoices generated yet.</td></tr>
              ) : (
                invoices.map((inv) => (
                  <tr key={inv.id} className="border-b border-border/50 hover:bg-muted/10">
                    <td className="px-6 py-4 font-mono font-medium text-primary">#{inv.invoiceNumber}</td>
                    <td className="px-6 py-4">
                      <p className="font-semibold">{inv.clientName}</p>
                      <p className="text-xs text-muted-foreground capitalize">{inv.serviceType}</p>
                    </td>
                    <td className="px-6 py-4 font-bold text-base">${inv.totalAmount.toLocaleString()}</td>
                    <td className="px-6 py-4 text-xs">
                      <div className="flex flex-col gap-1">
                        <span className="text-muted-foreground">Issued: {new Date(inv.issueDate).toLocaleDateString()}</span>
                        <span className="font-medium text-foreground">Due: {new Date(inv.dueDate).toLocaleDateString()}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <Badge variant="outline" className={`uppercase tracking-wider text-[10px] px-2 py-0.5 ${getStatusColor(inv.status)}`}>
                        {inv.status}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 text-right space-x-2">
                      {inv.status === 'draft' && (
                        <Button size="sm" variant="outline" onClick={() => statusMutation.mutate({ id: inv.id, data: { status: 'issued' }})}>
                          Issue <ArrowRight className="w-3 h-3 ml-1" />
                        </Button>
                      )}
                      {inv.status === 'issued' && (
                        <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => statusMutation.mutate({ id: inv.id, data: { status: 'paid' }})}>
                          <Receipt className="w-3 h-3 mr-1" /> Mark Paid
                        </Button>
                      )}
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
