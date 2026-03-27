import React, { useState, useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Plus, FileText, CheckCircle, Send, AlertTriangle, ChevronRight,
  Receipt, Eye, Download
} from "lucide-react";
import { useDepartments } from "@/hooks/use-departments";
import { DepartmentBadge } from "@/components/department-badge";
import { DepartmentSelect } from "@/components/department-select";

const STATUS_FLOW: Record<string, string> = { draft: "approved", approved: "issued", issued: "paid" };
const STATUS_LABELS: Record<string, string> = { draft: "Approve", approved: "Issue", issued: "Mark Paid" };
const STATUS_ICONS: Record<string, any> = { draft: CheckCircle, approved: Send, issued: CheckCircle };

function getStatusStyle(status: string) {
  switch (status) {
    case "paid": return "bg-emerald-100 text-emerald-700 border-emerald-200";
    case "draft": return "bg-slate-100 text-slate-600 border-slate-200";
    case "issued": return "bg-blue-100 text-blue-700 border-blue-200";
    case "approved": return "bg-violet-100 text-violet-700 border-violet-200";
    case "overdue": return "bg-red-100 text-red-700 border-red-200";
    case "cancelled": return "bg-gray-100 text-gray-500 border-gray-200";
    default: return "bg-slate-100 text-slate-600 border-slate-200";
  }
}

export default function Invoices() {
  const { token } = useAuth();
  const { toast } = useToast();
  const { selectedDepartmentId } = useDepartments();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [detailInvoice, setDetailInvoice] = useState<any>(null);
  const [activeTab, setActiveTab] = useState("all");
  const [invoices, setInvoices] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [engagements, setEngagements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const headers: Record<string, string> = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const [form, setForm] = useState({
    clientId: "", engagementId: "", serviceType: "audit", description: "",
    amount: "", gstPercent: "18", whtPercent: "0",
    issueDate: new Date().toISOString().split("T")[0], dueDate: "",
    notes: "", isRecurring: false, recurringFrequency: "monthly",
    departmentId: "",
  });

  React.useEffect(() => {
    Promise.all([
      fetch("/api/invoices", { headers }).then((r) => r.json()),
      fetch("/api/clients", { headers }).then((r) => r.json()),
      fetch("/api/engagements", { headers }).then((r) => r.json()).catch(() => []),
    ]).then(([inv, cl, eng]) => {
      setInvoices(inv);
      setClients(cl);
      setEngagements(eng);
      setLoading(false);
    });
  }, [token]);

  const baseAmount = Number(form.amount) || 0;
  const gstRate = Number(form.gstPercent) || 0;
  const whtRate = Number(form.whtPercent) || 0;
  const gstAmount = baseAmount * gstRate / 100;
  const whtAmount = baseAmount * whtRate / 100;
  const totalAmount = baseAmount + gstAmount - whtAmount;

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/invoices", {
      method: "POST", headers,
      body: JSON.stringify({
        clientId: Number(form.clientId),
        engagementId: form.engagementId ? Number(form.engagementId) : null,
        serviceType: form.serviceType,
        description: form.description,
        amount: baseAmount,
        gstPercent: gstRate,
        whtPercent: whtRate,
        issueDate: form.issueDate,
        dueDate: form.dueDate,
        notes: form.notes || null,
        isRecurring: form.isRecurring,
        recurringFrequency: form.isRecurring ? form.recurringFrequency : null,
        departmentId: form.departmentId ? Number(form.departmentId) : null,
      }),
    });
    if (res.ok) {
      const inv = await res.json();
      setInvoices([inv, ...invoices]);
      setIsDialogOpen(false);
      resetForm();
      toast({ title: "Invoice created successfully" });
    } else {
      toast({ title: "Failed to create invoice", variant: "destructive" });
    }
  }

  async function handleStatusChange(id: number, status: string, paidAmount?: number) {
    const body: any = { status };
    if (status === "paid") {
      const inv = invoices.find((i: any) => i.id === id);
      body.paidAmount = paidAmount ?? inv?.totalAmount;
      body.paidDate = new Date().toISOString().split("T")[0];
    }
    const res = await fetch(`/api/invoices/${id}/status`, {
      method: "PUT", headers,
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const updated = await res.json();
      setInvoices(invoices.map((i: any) => i.id === id ? updated : i));
      toast({ title: "Invoice status updated" });
    }
  }

  function resetForm() {
    setForm({
      clientId: "", engagementId: "", serviceType: "audit", description: "",
      amount: "", gstPercent: "18", whtPercent: "0",
      issueDate: new Date().toISOString().split("T")[0], dueDate: "",
      notes: "", isRecurring: false, recurringFrequency: "monthly",
      departmentId: "",
    });
  }

  function escapeHtml(str: string): string {
    if (!str) return "";
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }

  function handlePrintInvoice(inv: any) {
    const printWindow = window.open("", "_blank", "width=800,height=900,noopener");
    if (!printWindow) return;
    const safeClient = escapeHtml(inv.clientName);
    const safeDesc = escapeHtml(inv.description || inv.serviceType);
    const safeService = escapeHtml(inv.serviceType?.replace("_", " "));
    const safeNotes = escapeHtml(inv.notes);
    const safeInvNum = escapeHtml(inv.invoiceNumber);
    const html = `<!DOCTYPE html>
<html><head><title>Invoice #${safeInvNum}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; padding: 40px; color: #1a1a1a; max-width: 800px; margin: 0 auto; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; border-bottom: 3px solid #2563eb; padding-bottom: 20px; }
  .company { font-size: 24px; font-weight: 700; color: #2563eb; }
  .company-sub { font-size: 12px; color: #666; margin-top: 4px; }
  .invoice-title { text-align: right; }
  .invoice-title h1 { font-size: 28px; color: #1a1a1a; }
  .invoice-title p { font-size: 13px; color: #666; margin-top: 4px; }
  .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin-bottom: 30px; }
  .meta-section h3 { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #999; margin-bottom: 8px; }
  .meta-section p { font-size: 14px; margin-bottom: 4px; }
  .status { display: inline-block; padding: 4px 12px; border-radius: 4px; font-size: 11px; font-weight: 600; text-transform: uppercase; }
  .status-paid { background: #dcfce7; color: #166534; }
  .status-draft { background: #f1f5f9; color: #475569; }
  .status-issued { background: #dbeafe; color: #1d4ed8; }
  .status-approved { background: #ede9fe; color: #6d28d9; }
  .status-overdue { background: #fef2f2; color: #dc2626; }
  table { width: 100%; border-collapse: collapse; margin: 20px 0; }
  th { background: #f8fafc; padding: 12px 16px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; border-bottom: 2px solid #e2e8f0; }
  td { padding: 12px 16px; border-bottom: 1px solid #f1f5f9; font-size: 14px; }
  .text-right { text-align: right; }
  .total-section { margin-top: 20px; display: flex; justify-content: flex-end; }
  .total-box { width: 280px; }
  .total-row { display: flex; justify-content: space-between; padding: 8px 0; font-size: 14px; }
  .total-row.final { border-top: 2px solid #1a1a1a; font-weight: 700; font-size: 18px; padding-top: 12px; margin-top: 4px; }
  .total-row.green { color: #16a34a; }
  .total-row.red { color: #dc2626; }
  .notes { margin-top: 30px; padding: 16px; background: #f8fafc; border-radius: 8px; font-size: 13px; color: #475569; }
  .footer { margin-top: 50px; text-align: center; font-size: 11px; color: #999; border-top: 1px solid #e2e8f0; padding-top: 20px; }
  @media print { body { padding: 20px; } .no-print { display: none; } }
</style></head>
<body>
  <div class="header">
    <div><div class="company">Vertex & Associates</div><div class="company-sub">Chartered Accountants</div></div>
    <div class="invoice-title"><h1>INVOICE</h1><p>#${safeInvNum}</p></div>
  </div>
  <div class="meta">
    <div class="meta-section">
      <h3>Bill To</h3>
      <p><strong>${safeClient}</strong></p>
      <p style="text-transform:capitalize">${safeService}</p>
    </div>
    <div class="meta-section" style="text-align:right">
      <h3>Invoice Details</h3>
      <p>Issue: ${new Date(inv.issueDate).toLocaleDateString("en-PK", { day: "numeric", month: "short", year: "numeric" })}</p>
      <p>Due: ${new Date(inv.dueDate).toLocaleDateString("en-PK", { day: "numeric", month: "short", year: "numeric" })}</p>
      <p style="margin-top:8px"><span class="status status-${inv.status}">${inv.status}</span></p>
    </div>
  </div>
  <table>
    <thead><tr><th>Description</th><th class="text-right">Amount</th></tr></thead>
    <tbody><tr><td>${safeDesc}</td><td class="text-right">Rs. ${Number(inv.amount).toLocaleString("en-PK", { minimumFractionDigits: 2 })}</td></tr></tbody>
  </table>
  <div class="total-section"><div class="total-box">
    <div class="total-row"><span>Subtotal</span><span>Rs. ${Number(inv.amount).toLocaleString("en-PK", { minimumFractionDigits: 2 })}</span></div>
    ${inv.gstAmount > 0 ? `<div class="total-row green"><span>+ GST</span><span>Rs. ${Number(inv.gstAmount).toLocaleString("en-PK", { minimumFractionDigits: 2 })}</span></div>` : ""}
    ${inv.whtAmount > 0 ? `<div class="total-row red"><span>- WHT</span><span>Rs. ${Number(inv.whtAmount).toLocaleString("en-PK", { minimumFractionDigits: 2 })}</span></div>` : ""}
    <div class="total-row final"><span>Net Payable</span><span>Rs. ${Number(inv.totalAmount).toLocaleString("en-PK", { minimumFractionDigits: 2 })}</span></div>
    ${inv.paidAmount > 0 ? `<div class="total-row green"><span>Paid</span><span>Rs. ${Number(inv.paidAmount).toLocaleString("en-PK", { minimumFractionDigits: 2 })}</span></div>` : ""}
  </div></div>
  ${safeNotes ? `<div class="notes"><strong>Notes:</strong> ${safeNotes}</div>` : ""}
  <div class="footer">This is a computer-generated invoice. | Vertex & Associates, Chartered Accountants</div>
  <div class="no-print" style="text-align:center;margin-top:20px"><button onclick="window.print()" style="padding:10px 30px;background:#2563eb;color:white;border:none;border-radius:6px;cursor:pointer;font-size:14px">Print / Save as PDF</button></div>
</body></html>`;
    printWindow.document.write(html);
    printWindow.document.close();
  }

  const filteredInvoices = invoices
    .filter((i: any) => activeTab === "all" || i.status === activeTab)
    .filter((i: any) => !selectedDepartmentId || i.departmentId === selectedDepartmentId);

  const summary = useMemo(() => ({
    total: invoices.length,
    draft: invoices.filter((i: any) => i.status === "draft").length,
    approved: invoices.filter((i: any) => i.status === "approved").length,
    issued: invoices.filter((i: any) => i.status === "issued").length,
    paid: invoices.filter((i: any) => i.status === "paid").length,
    overdue: invoices.filter((i: any) => i.status === "overdue").length,
    totalAmount: invoices.reduce((s: number, i: any) => s + (i.totalAmount || 0), 0),
    outstanding: invoices.filter((i: any) => !["paid", "cancelled"].includes(i.status)).reduce((s: number, i: any) => s + ((i.totalAmount || 0) - (i.paidAmount || 0)), 0),
  }), [invoices]);

  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold">Invoices</h1>
          <p className="text-muted-foreground mt-1 text-sm">Client billing, WHT & GST management</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button className="shadow-md shadow-primary/20 gap-2"><Plus className="w-4 h-4" /> Create Invoice</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-display text-xl">Create New Invoice</DialogTitle>
              <DialogDescription>Fill in the invoice details with tax calculations</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Client *</Label>
                  <Select value={form.clientId} onValueChange={(v) => setForm({ ...form, clientId: v })}>
                    <SelectTrigger><SelectValue placeholder="Select client" /></SelectTrigger>
                    <SelectContent>
                      {clients.map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Engagement</Label>
                  <Select value={form.engagementId} onValueChange={(v) => setForm({ ...form, engagementId: v })}>
                    <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {engagements.map((e: any) => <SelectItem key={e.id} value={String(e.id)}>{e.title}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Service Type *</Label>
                  <Select value={form.serviceType} onValueChange={(v) => setForm({ ...form, serviceType: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="audit">Statutory Audit</SelectItem>
                      <SelectItem value="tax">Tax Compliance</SelectItem>
                      <SelectItem value="advisory">Business Advisory</SelectItem>
                      <SelectItem value="accounting">Accounting & Bookkeeping</SelectItem>
                      <SelectItem value="other">Other Services</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Base Amount (Rs.) *</Label>
                  <Input
                    type="number" step="0.01" required placeholder="0.00"
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Description *</Label>
                <Input
                  required placeholder="Brief description of services..."
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>GST Rate (%)</Label>
                  <Select value={form.gstPercent} onValueChange={(v) => setForm({ ...form, gstPercent: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">0% - Exempt</SelectItem>
                      <SelectItem value="13">13% - Reduced</SelectItem>
                      <SelectItem value="16">16% - Standard (Punjab)</SelectItem>
                      <SelectItem value="17">17% - Standard (Federal)</SelectItem>
                      <SelectItem value="18">18% - Standard</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>WHT Rate (%)</Label>
                  <Select value={form.whtPercent} onValueChange={(v) => setForm({ ...form, whtPercent: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">0% - None</SelectItem>
                      <SelectItem value="3">3% - Individual/AOP</SelectItem>
                      <SelectItem value="5">5% - Company (Filer)</SelectItem>
                      <SelectItem value="8">8% - Company</SelectItem>
                      <SelectItem value="10">10% - Non-Filer</SelectItem>
                      <SelectItem value="15">15% - Non-Filer (Company)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {baseAmount > 0 && (
                <Card className="bg-muted/30 border-border/50">
                  <CardContent className="p-4 space-y-2 text-sm">
                    <div className="flex justify-between"><span>Base Amount</span><span>Rs. {baseAmount.toLocaleString("en-PK", { minimumFractionDigits: 2 })}</span></div>
                    {gstAmount > 0 && (
                      <div className="flex justify-between text-green-700"><span>+ GST ({gstRate}%)</span><span>Rs. {gstAmount.toLocaleString("en-PK", { minimumFractionDigits: 2 })}</span></div>
                    )}
                    {whtAmount > 0 && (
                      <div className="flex justify-between text-red-700"><span>- WHT ({whtRate}%)</span><span>Rs. {whtAmount.toLocaleString("en-PK", { minimumFractionDigits: 2 })}</span></div>
                    )}
                    <div className="flex justify-between font-bold text-base pt-2 border-t">
                      <span>Net Payable</span>
                      <span>Rs. {totalAmount.toLocaleString("en-PK", { minimumFractionDigits: 2 })}</span>
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Issue Date *</Label>
                  <Input type="date" required value={form.issueDate} onChange={(e) => setForm({ ...form, issueDate: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Due Date *</Label>
                  <Input type="date" required value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} placeholder="Payment terms, bank details..." />
              </div>

              <div className="space-y-2">
                <Label>Department</Label>
                <DepartmentSelect value={form.departmentId} onValueChange={(v) => setForm({ ...form, departmentId: v === "none" ? "" : v })} showAll={false} />
              </div>

              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
                <Switch checked={form.isRecurring} onCheckedChange={(v) => setForm({ ...form, isRecurring: v })} />
                <Label className="cursor-pointer">Recurring Invoice</Label>
                {form.isRecurring && (
                  <Select value={form.recurringFrequency} onValueChange={(v) => setForm({ ...form, recurringFrequency: v })}>
                    <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="quarterly">Quarterly</SelectItem>
                      <SelectItem value="yearly">Yearly</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>

              <Button type="submit" className="w-full">Create Invoice</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <InvoiceStat label="Total Invoices" value={summary.total.toString()} color="blue" />
        <InvoiceStat label="Pending Payment" value={(summary.issued + summary.approved).toString()} color="amber" />
        <InvoiceStat label="Paid" value={summary.paid.toString()} color="emerald" />
        <InvoiceStat label="Outstanding" value={`Rs. ${(summary.outstanding / 1000).toFixed(0)}K`} color="red" />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-muted/40 border border-border/50 p-1 rounded-xl h-auto flex-wrap">
          {[
            { key: "all", label: `All (${summary.total})` },
            { key: "draft", label: `Draft (${summary.draft})` },
            { key: "approved", label: `Approved (${summary.approved})` },
            { key: "issued", label: `Issued (${summary.issued})` },
            { key: "paid", label: `Paid (${summary.paid})` },
            { key: "overdue", label: `Overdue (${summary.overdue})` },
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
                    <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Invoice #</th>
                    <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Client & Service</th>
                    <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Amount</th>
                    <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tax</th>
                    <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Due Date</th>
                    <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                    <th className="px-5 py-3.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {loading ? (
                    Array.from({ length: 3 }).map((_, i) => (
                      <tr key={i}>{Array.from({ length: 7 }).map((_, j) => <td key={j} className="px-5 py-4"><div className="h-4 bg-muted rounded animate-pulse" /></td>)}</tr>
                    ))
                  ) : filteredInvoices.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-5 py-16 text-center">
                        <FileText className="w-10 h-10 text-muted-foreground/20 mx-auto mb-3" />
                        <p className="text-muted-foreground text-sm">No invoices found</p>
                      </td>
                    </tr>
                  ) : (
                    filteredInvoices.map((inv: any) => {
                      const ActionIcon = STATUS_ICONS[inv.status];
                      const nextStatus = STATUS_FLOW[inv.status];
                      return (
                        <tr key={inv.id} className="hover:bg-muted/20 transition-colors cursor-pointer" onClick={() => setDetailInvoice(inv)}>
                          <td className="px-5 py-4">
                            <span className="font-mono font-semibold text-primary text-sm">#{inv.invoiceNumber}</span>
                            {inv.isRecurring && <Badge className="ml-2 text-[9px] bg-purple-100 text-purple-700">Recurring</Badge>}
                          </td>
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-2">
                              <div>
                                <p className="font-semibold text-sm">{inv.clientName}</p>
                                <p className="text-xs text-muted-foreground capitalize mt-0.5">{inv.serviceType?.replace("_", " ")}</p>
                              </div>
                              <DepartmentBadge departmentId={inv.departmentId} />
                            </div>
                          </td>
                          <td className="px-5 py-4">
                            <p className="font-bold text-sm">Rs. {inv.totalAmount?.toLocaleString("en-PK")}</p>
                            <p className="text-xs text-muted-foreground">Base: Rs. {inv.amount?.toLocaleString("en-PK")}</p>
                          </td>
                          <td className="px-5 py-4">
                            <div className="text-xs space-y-0.5">
                              {inv.gstAmount > 0 && <p className="text-green-700">GST: Rs. {inv.gstAmount?.toLocaleString("en-PK")}</p>}
                              {inv.whtAmount > 0 && <p className="text-red-700">WHT: Rs. {inv.whtAmount?.toLocaleString("en-PK")}</p>}
                              {inv.gstAmount === 0 && inv.whtAmount === 0 && <p className="text-muted-foreground">No tax</p>}
                            </div>
                          </td>
                          <td className="px-5 py-4">
                            <p className="text-sm">{new Date(inv.dueDate).toLocaleDateString("en-PK", { day: "numeric", month: "short", year: "numeric" })}</p>
                            {inv.status === "overdue" && (
                              <p className="text-xs text-red-600 flex items-center gap-1 mt-0.5"><AlertTriangle className="w-3 h-3" /> Overdue</p>
                            )}
                          </td>
                          <td className="px-5 py-4">
                            <Badge variant="outline" className={`uppercase tracking-wide text-[10px] px-2.5 py-0.5 font-semibold ${getStatusStyle(inv.status)}`}>
                              {inv.status}
                            </Badge>
                          </td>
                          <td className="px-5 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                            {nextStatus && (
                              <Button
                                size="sm"
                                variant={inv.status === "issued" ? "default" : "outline"}
                                className={`h-8 text-xs gap-1.5 ${inv.status === "issued" ? "bg-emerald-600 hover:bg-emerald-700 shadow-md shadow-emerald-600/20" : ""}`}
                                onClick={() => handleStatusChange(inv.id, nextStatus)}
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
            {!loading && filteredInvoices.length > 0 && (
              <div className="px-5 py-3 bg-muted/20 border-t border-border/50 flex justify-between items-center">
                <span className="text-xs text-muted-foreground">{filteredInvoices.length} invoice{filteredInvoices.length !== 1 ? "s" : ""}</span>
                <span className="text-sm font-semibold">Outstanding: Rs. {summary.outstanding.toLocaleString("en-PK")}</span>
              </div>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!detailInvoice} onOpenChange={(open) => { if (!open) setDetailInvoice(null); }}>
        <DialogContent className="sm:max-w-[500px]">
          {detailInvoice && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Receipt className="w-5 h-5 text-primary" />
                  Invoice #{detailInvoice.invoiceNumber}
                </DialogTitle>
                <DialogDescription>Invoice details and breakdown</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={`uppercase text-[10px] font-semibold ${getStatusStyle(detailInvoice.status)}`}>
                    {detailInvoice.status}
                  </Badge>
                  {detailInvoice.isRecurring && <Badge className="bg-purple-100 text-purple-700 text-[10px]">Recurring ({detailInvoice.recurringFrequency})</Badge>}
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-muted-foreground">Client:</span> <span className="font-medium">{detailInvoice.clientName}</span></div>
                  <div><span className="text-muted-foreground">Service:</span> <span className="font-medium capitalize">{detailInvoice.serviceType}</span></div>
                  <div><span className="text-muted-foreground">Issue:</span> <span>{detailInvoice.issueDate}</span></div>
                  <div><span className="text-muted-foreground">Due:</span> <span>{detailInvoice.dueDate}</span></div>
                </div>
                {detailInvoice.description && <p className="text-sm text-muted-foreground">{detailInvoice.description}</p>}
                <Card className="bg-muted/30">
                  <CardContent className="p-4 space-y-2 text-sm">
                    <div className="flex justify-between"><span>Base Amount</span><span>Rs. {detailInvoice.amount?.toLocaleString("en-PK")}</span></div>
                    {detailInvoice.gstAmount > 0 && <div className="flex justify-between text-green-700"><span>+ GST</span><span>Rs. {detailInvoice.gstAmount?.toLocaleString("en-PK")}</span></div>}
                    {detailInvoice.whtAmount > 0 && <div className="flex justify-between text-red-700"><span>- WHT</span><span>Rs. {detailInvoice.whtAmount?.toLocaleString("en-PK")}</span></div>}
                    <div className="flex justify-between font-bold text-base pt-2 border-t"><span>Net Payable</span><span>Rs. {detailInvoice.totalAmount?.toLocaleString("en-PK")}</span></div>
                    {detailInvoice.paidAmount > 0 && (
                      <div className="flex justify-between text-emerald-700 pt-1"><span>Paid</span><span>Rs. {detailInvoice.paidAmount?.toLocaleString("en-PK")}</span></div>
                    )}
                  </CardContent>
                </Card>
                {detailInvoice.notes && <p className="text-sm bg-muted/50 p-3 rounded-lg">{detailInvoice.notes}</p>}
                <Button className="w-full gap-2 mt-2" variant="outline" onClick={() => handlePrintInvoice(detailInvoice)}>
                  <Download className="w-4 h-4" /> Download / Print Invoice
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InvoiceStat({ label, value, color }: { label: string; value: string; color: string }) {
  const colorMap: Record<string, string> = {
    blue: "bg-blue-50 border-blue-100 text-blue-700",
    amber: "bg-amber-50 border-amber-100 text-amber-700",
    emerald: "bg-emerald-50 border-emerald-100 text-emerald-700",
    red: "bg-red-50 border-red-100 text-red-700",
  };
  return (
    <div className={`rounded-xl border p-4 ${colorMap[color]}`}>
      <p className="text-xs font-semibold uppercase tracking-wide opacity-75 mb-1">{label}</p>
      <p className="text-2xl font-display font-bold">{value}</p>
    </div>
  );
}
