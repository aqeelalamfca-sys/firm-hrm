import React, { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, FileText, Download, Trash2, FolderOpen, Search, FileSpreadsheet, File } from "lucide-react";

const categories = [
  { value: "trial_balance", label: "Trial Balance" },
  { value: "general_ledger", label: "General Ledger" },
  { value: "bank_statement", label: "Bank Statement" },
  { value: "tax_return", label: "Tax Return" },
  { value: "audit_report", label: "Audit Report" },
  { value: "engagement_letter", label: "Engagement Letter" },
  { value: "financial_statement", label: "Financial Statement" },
  { value: "correspondence", label: "Correspondence" },
  { value: "other", label: "Other" },
];

const categoryIcons: Record<string, any> = {
  trial_balance: FileSpreadsheet,
  general_ledger: FileSpreadsheet,
  bank_statement: File,
  tax_return: FileText,
  audit_report: FileText,
  engagement_letter: FileText,
  financial_statement: FileSpreadsheet,
  correspondence: FileText,
  other: File,
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

export default function Documents() {
  const { token } = useAuth();
  const [documents, setDocuments] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [filterCategory, setFilterCategory] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [form, setForm] = useState({ originalName: "", category: "other", clientId: "", description: "" });

  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  React.useEffect(() => {
    Promise.all([
      fetch("/api/documents", { headers }).then((r) => r.json()),
      fetch("/api/clients", { headers }).then((r) => r.json()),
    ]).then(([docs, cli]) => {
      setDocuments(docs);
      setClients(cli);
      setLoading(false);
    });
  }, [token]);

  const filtered = documents
    .filter((d: any) => filterCategory === "all" || d.category === filterCategory)
    .filter((d: any) => !searchTerm || d.originalName.toLowerCase().includes(searchTerm.toLowerCase()));

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/documents", {
      method: "POST",
      headers,
      body: JSON.stringify({
        fileName: form.originalName,
        originalName: form.originalName,
        fileSize: Math.floor(Math.random() * 5000000) + 10000,
        mimeType: "application/pdf",
        category: form.category,
        clientId: form.clientId ? Number(form.clientId) : null,
        description: form.description || null,
        filePath: `/uploads/${form.originalName}`,
      }),
    });
    if (res.ok) {
      const doc = await res.json();
      setDocuments([doc, ...documents]);
      setDialogOpen(false);
      setForm({ originalName: "", category: "other", clientId: "", description: "" });
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Are you sure you want to delete this document?")) return;
    const res = await fetch(`/api/documents/${id}`, { method: "DELETE", headers });
    if (res.ok) setDocuments(documents.filter((d: any) => d.id !== id));
  }

  if (loading) {
    return <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">Documents</h1>
          <p className="text-muted-foreground mt-1">Manage files, reports, and working papers</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2 shadow-lg shadow-primary/25"><Plus className="w-4 h-4" /> Upload Document</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Upload Document</DialogTitle></DialogHeader>
            <form onSubmit={handleUpload} className="space-y-4">
              <div className="space-y-2">
                <Label>File Name</Label>
                <Input value={form.originalName} onChange={(e) => setForm({ ...form, originalName: e.target.value })} placeholder="e.g., TB_March_2026.xlsx" required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {categories.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Client (optional)</Label>
                  <Select value={form.clientId} onValueChange={(v) => setForm({ ...form, clientId: v })}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      {clients.map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              <Button type="submit" className="w-full">Upload</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search documents..." className="pl-10" />
        </div>
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-[200px]"><SelectValue placeholder="Filter by category" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <Card><CardContent className="p-12 text-center">
          <FolderOpen className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">No documents found</p>
        </CardContent></Card>
      ) : (
        <div className="grid gap-3">
          {filtered.map((doc: any) => {
            const Icon = categoryIcons[doc.category] || File;
            return (
              <Card key={doc.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Icon className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{doc.originalName}</p>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                      <Badge variant="secondary" className="text-xs">{categories.find((c) => c.value === doc.category)?.label || doc.category}</Badge>
                      <span>{formatFileSize(doc.fileSize)}</span>
                      {doc.clientName && <span>{doc.clientName}</span>}
                      <span>v{doc.version}</span>
                      <span>by {doc.uploadedByName}</span>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" className="text-muted-foreground hover:text-primary"><Download className="w-4 h-4" /></Button>
                    <Button size="icon" variant="ghost" className="text-muted-foreground hover:text-destructive" onClick={() => handleDelete(doc.id)}><Trash2 className="w-4 h-4" /></Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
