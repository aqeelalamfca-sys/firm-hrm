import React, { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Shield, Plus, Eye, EyeOff, Trash2, Pencil, Globe,
  Key, Lock, Building2, ExternalLink, Copy, Search
} from "lucide-react";

const PORTAL_PRESETS = [
  { name: "FBR IRIS", url: "https://iris.fbr.gov.pk" },
  { name: "SECP eServices", url: "https://eservices.secp.gov.pk" },
  { name: "PRA e-Portal", url: "https://e.pra.punjab.gov.pk" },
  { name: "SRB e-Filing", url: "https://efiling.srb.gos.pk" },
  { name: "EOBI", url: "https://www.eobi.gov.pk" },
  { name: "PESSI", url: "https://www.pessi.gop.pk" },
  { name: "WEBOC (Customs)", url: "https://www.weboc.gov.pk" },
  { name: "State Bank of Pakistan", url: "https://www.sbp.org.pk" },
  { name: "Other", url: "" },
];

export default function CredentialVault() {
  const { token, user } = useAuth();
  const { toast } = useToast();
  const [clients, setClients] = useState<any[]>([]);
  const [selectedClient, setSelectedClient] = useState<string>("");
  const [credentials, setCredentials] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editCred, setEditCred] = useState<any>(null);
  const [revealedPasswords, setRevealedPasswords] = useState<Record<number, string>>({});
  const [searchQuery, setSearchQuery] = useState("");

  const headers: Record<string, string> = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const canManage = user && ["super_admin", "partner"].includes(user.role);

  const [form, setForm] = useState({
    portalName: "", loginId: "", password: "", portalUrl: "", notes: "",
  });

  useEffect(() => {
    fetch("/api/clients", { headers }).then((r) => r.json()).then(setClients).catch(() => {});
  }, [token]);

  useEffect(() => {
    if (selectedClient) {
      setLoading(true);
      fetch(`/api/clients/${selectedClient}/credentials`, { headers })
        .then((r) => r.json())
        .then((data) => { setCredentials(data); setLoading(false); })
        .catch(() => setLoading(false));
    } else {
      setCredentials([]);
    }
    setRevealedPasswords({});
  }, [selectedClient, token]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch(`/api/clients/${selectedClient}/credentials`, {
      method: "POST", headers,
      body: JSON.stringify(form),
    });
    if (res.ok) {
      const cred = await res.json();
      setCredentials([...credentials, cred]);
      setDialogOpen(false);
      resetForm();
      toast({ title: "Credential saved securely" });
    } else {
      toast({ title: "Failed to save credential", variant: "destructive" });
    }
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editCred) return;
    const res = await fetch(`/api/clients/${selectedClient}/credentials/${editCred.id}`, {
      method: "PUT", headers,
      body: JSON.stringify(form),
    });
    if (res.ok) {
      const updated = await res.json();
      setCredentials(credentials.map((c: any) => c.id === editCred.id ? updated : c));
      setEditCred(null);
      setDialogOpen(false);
      resetForm();
      toast({ title: "Credential updated" });
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Are you sure you want to delete this credential?")) return;
    const res = await fetch(`/api/clients/${selectedClient}/credentials/${id}`, { method: "DELETE", headers });
    if (res.ok) {
      setCredentials(credentials.filter((c: any) => c.id !== id));
      toast({ title: "Credential deleted" });
    }
  }

  async function handleReveal(id: number) {
    if (revealedPasswords[id]) {
      setRevealedPasswords((prev) => { const next = { ...prev }; delete next[id]; return next; });
      return;
    }
    const res = await fetch(`/api/clients/${selectedClient}/credentials/${id}/reveal`, { headers });
    if (res.ok) {
      const data = await res.json();
      setRevealedPasswords((prev) => ({ ...prev, [id]: data.password }));
      setTimeout(() => {
        setRevealedPasswords((prev) => { const next = { ...prev }; delete next[id]; return next; });
      }, 30000);
    } else {
      toast({ title: "Access denied", variant: "destructive" });
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied to clipboard" });
  }

  function resetForm() {
    setForm({ portalName: "", loginId: "", password: "", portalUrl: "", notes: "" });
  }

  function openEdit(cred: any) {
    setEditCred(cred);
    setForm({
      portalName: cred.portalName || "", loginId: cred.loginId || "",
      password: "", portalUrl: cred.portalUrl || "", notes: cred.notes || "",
    });
    setDialogOpen(true);
  }

  const filteredCredentials = credentials.filter((c: any) =>
    !searchQuery || c.portalName?.toLowerCase().includes(searchQuery.toLowerCase()) || c.loginId?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const clientName = clients.find((c: any) => String(c.id) === selectedClient)?.name;

  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold flex items-center gap-3">
            <Shield className="w-7 h-7 text-primary" /> Credential Vault
          </h1>
          <p className="text-muted-foreground mt-1">Securely manage client portal credentials (FBR, SECP, PRA)</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <Card className="lg:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Select Client</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {clients.map((c: any) => (
              <button
                key={c.id}
                onClick={() => setSelectedClient(String(c.id))}
                className={`w-full text-left p-3 rounded-lg text-sm transition-colors ${
                  String(c.id) === selectedClient
                    ? "bg-primary/10 text-primary font-medium border border-primary/20"
                    : "hover:bg-muted/50"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 shrink-0" />
                  <span className="truncate">{c.name}</span>
                </div>
              </button>
            ))}
            {clients.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">No clients found</p>
            )}
          </CardContent>
        </Card>

        <div className="lg:col-span-3 space-y-4">
          {!selectedClient ? (
            <Card>
              <CardContent className="py-16 text-center">
                <Lock className="w-16 h-16 text-muted-foreground/20 mx-auto mb-4" />
                <p className="text-lg font-medium text-muted-foreground">Select a client to view credentials</p>
                <p className="text-sm text-muted-foreground/70 mt-1">Choose from the panel on the left</p>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="flex items-center gap-3 flex-wrap">
                <h2 className="text-lg font-semibold flex-1">{clientName} — Credentials</h2>
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search portals..."
                    className="pl-9 w-[200px]"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                {canManage && (
                  <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) { setEditCred(null); resetForm(); } }}>
                    <DialogTrigger asChild>
                      <Button className="gap-2"><Plus className="w-4 h-4" /> Add Credential</Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>{editCred ? "Edit Credential" : "Add New Credential"}</DialogTitle>
                        <DialogDescription>Passwords are encrypted before storage</DialogDescription>
                      </DialogHeader>
                      <form onSubmit={editCred ? handleUpdate : handleCreate} className="space-y-4">
                        <div className="space-y-2">
                          <Label>Portal *</Label>
                          <Select
                            value={PORTAL_PRESETS.some((p) => p.name === form.portalName) ? form.portalName : "Other"}
                            onValueChange={(v) => {
                              const preset = PORTAL_PRESETS.find((p) => p.name === v);
                              setForm({ ...form, portalName: v, portalUrl: preset?.url || form.portalUrl });
                            }}
                          >
                            <SelectTrigger><SelectValue placeholder="Select portal" /></SelectTrigger>
                            <SelectContent>
                              {PORTAL_PRESETS.map((p) => <SelectItem key={p.name} value={p.name}>{p.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          {(!PORTAL_PRESETS.some((p) => p.name === form.portalName) || form.portalName === "Other") && (
                            <Input placeholder="Custom portal name" value={form.portalName === "Other" ? "" : form.portalName} onChange={(e) => setForm({ ...form, portalName: e.target.value })} />
                          )}
                        </div>
                        <div className="space-y-2">
                          <Label>Login ID / Username *</Label>
                          <Input value={form.loginId} onChange={(e) => setForm({ ...form, loginId: e.target.value })} required />
                        </div>
                        <div className="space-y-2">
                          <Label>Password {editCred ? "(leave blank to keep)" : "*"}</Label>
                          <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required={!editCred} />
                        </div>
                        <div className="space-y-2">
                          <Label>Portal URL</Label>
                          <Input value={form.portalUrl} onChange={(e) => setForm({ ...form, portalUrl: e.target.value })} placeholder="https://..." />
                        </div>
                        <div className="space-y-2">
                          <Label>Notes</Label>
                          <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} placeholder="PIN code, security questions, etc." />
                        </div>
                        <Button type="submit" className="w-full">{editCred ? "Update" : "Save Credential"}</Button>
                      </form>
                    </DialogContent>
                  </Dialog>
                )}
              </div>

              {loading ? (
                <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>
              ) : filteredCredentials.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center">
                    <Key className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
                    <p className="text-muted-foreground">No credentials stored for this client</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredCredentials.map((cred: any) => (
                    <Card key={cred.id} className="hover:shadow-md transition-shadow">
                      <CardContent className="p-5">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                              <Globe className="w-5 h-5 text-primary" />
                            </div>
                            <div>
                              <h3 className="font-semibold text-sm">{cred.portalName}</h3>
                              {cred.portalUrl && (
                                <a href={cred.portalUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1">
                                  Visit <ExternalLink className="w-3 h-3" />
                                </a>
                              )}
                            </div>
                          </div>
                          {canManage && (
                            <div className="flex gap-1">
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(cred)}><Pencil className="w-3.5 h-3.5" /></Button>
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleDelete(cred.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                            </div>
                          )}
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between bg-muted/50 rounded-lg p-2.5">
                            <div>
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Login ID</p>
                              <p className="text-sm font-mono font-medium">{cred.loginId}</p>
                            </div>
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => copyToClipboard(cred.loginId)}>
                              <Copy className="w-3.5 h-3.5" />
                            </Button>
                          </div>

                          <div className="flex items-center justify-between bg-muted/50 rounded-lg p-2.5">
                            <div>
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Password</p>
                              <p className="text-sm font-mono font-medium">
                                {revealedPasswords[cred.id] || "••••••••••"}
                              </p>
                            </div>
                            <div className="flex gap-1">
                              {revealedPasswords[cred.id] && (
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => copyToClipboard(revealedPasswords[cred.id])}>
                                  <Copy className="w-3.5 h-3.5" />
                                </Button>
                              )}
                              {canManage && (
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleReveal(cred.id)}>
                                  {revealedPasswords[cred.id] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>

                        {cred.notes && (
                          <p className="text-xs text-muted-foreground mt-3 bg-muted/30 p-2 rounded">{cred.notes}</p>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
