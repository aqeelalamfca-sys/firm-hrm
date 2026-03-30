import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import {
  Zap, Plus, Trash2, Edit2, Sparkles, RefreshCw, Save,
  Landmark, Building2, BarChart3, TrendingUp, Eye, EyeOff,
  Clock, CheckCircle2, XCircle, AlertCircle, PlayCircle, Timer
} from "lucide-react";

interface RegulatoryUpdate {
  id: number;
  category: string;
  text: string;
  priority: string;
  source: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface AutoGenLog {
  id: number;
  category: string;
  generatedText: string | null;
  status: string;
  errorMessage: string | null;
  runAt: string;
}

const CATEGORIES = ["FBR", "SECP", "PSX", "SBP"] as const;
const PRIORITIES = ["high", "medium", "low"] as const;

const CATEGORY_ICONS: Record<string, typeof Landmark> = {
  FBR: Landmark,
  SECP: Building2,
  PSX: BarChart3,
  SBP: TrendingUp,
};

const PRIORITY_COLORS: Record<string, string> = {
  high: "bg-red-100 text-red-700 border-red-200",
  medium: "bg-amber-100 text-amber-700 border-amber-200",
  low: "bg-slate-100 text-slate-600 border-slate-200",
};

export default function RegulatoryUpdatesAdmin() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [updates, setUpdates] = useState<RegulatoryUpdate[]>([]);
  const [autoGenLogs, setAutoGenLogs] = useState<AutoGenLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [triggeringAutoGen, setTriggeringAutoGen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showLogs, setShowLogs] = useState(false);

  const [form, setForm] = useState({
    category: "FBR" as string,
    text: "",
    priority: "medium" as string,
    topic: "",
  });

  const getAuthHeaders = useCallback(() => {
    const token = localStorage.getItem("auth_token");
    return {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }, []);

  const fetchUpdates = useCallback(async () => {
    try {
      const res = await fetch("/api/regulatory-updates");
      if (res.ok) {
        const data = await res.json();
        setUpdates(data.updates || []);
      }
    } catch {
      toast({ title: "Error", description: "Failed to fetch updates", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchUpdates();
  }, [fetchUpdates]);

  const handleSubmit = async () => {
    if (!form.text.trim()) {
      toast({ title: "Validation", description: "Update text is required", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const url = editingId ? `/api/regulatory-updates/${editingId}` : "/api/regulatory-updates";
      const method = editingId ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: getAuthHeaders(),
        body: JSON.stringify({
          category: form.category,
          text: form.text,
          priority: form.priority,
        }),
      });

      if (res.ok) {
        toast({ title: editingId ? "Updated" : "Created", description: "Regulatory update saved successfully" });
        setForm({ category: "FBR", text: "", priority: "medium", topic: "" });
        setEditingId(null);
        fetchUpdates();
      } else {
        const data = await res.json();
        toast({ title: "Error", description: data.error || "Failed to save", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Failed to save update", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateAI = async () => {
    setGenerating(true);
    try {
      const res = await fetch("/api/regulatory-updates/generate-ai-preview", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          category: form.category,
          topic: form.topic || undefined,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setForm(prev => ({ ...prev, text: data.text }));
        toast({ title: "AI Generated", description: "Review the generated text and save if appropriate" });
      } else {
        const data = await res.json();
        toast({ title: "AI Error", description: data.error || "Failed to generate", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Failed to generate AI update", variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const handleQuickGenerate = async () => {
    setGenerating(true);
    try {
      const res = await fetch("/api/regulatory-updates/generate-ai", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          category: form.category,
          topic: form.topic || undefined,
        }),
      });

      if (res.ok) {
        toast({ title: "Published", description: "AI-generated update published successfully" });
        setForm(prev => ({ ...prev, topic: "" }));
        fetchUpdates();
      } else {
        const data = await res.json();
        toast({ title: "Error", description: data.error || "Failed to generate", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Failed to generate update", variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const handleToggleActive = async (update: RegulatoryUpdate) => {
    try {
      const res = await fetch(`/api/regulatory-updates/${update.id}`, {
        method: "PUT",
        headers: getAuthHeaders(),
        body: JSON.stringify({ isActive: !update.isActive }),
      });

      if (res.ok) {
        fetchUpdates();
      }
    } catch {
      toast({ title: "Error", description: "Failed to toggle status", variant: "destructive" });
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to delete this update?")) return;

    try {
      const res = await fetch(`/api/regulatory-updates/${id}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });

      if (res.ok) {
        toast({ title: "Deleted", description: "Update removed" });
        fetchUpdates();
      }
    } catch {
      toast({ title: "Error", description: "Failed to delete", variant: "destructive" });
    }
  };

  const fetchAutoGenLogs = useCallback(async () => {
    try {
      const res = await fetch("/api/regulatory-updates/auto-gen-logs", {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setAutoGenLogs(data.logs || []);
      }
    } catch {
      // silently fail
    }
  }, [getAuthHeaders]);

  useEffect(() => {
    if (showLogs) fetchAutoGenLogs();
  }, [showLogs, fetchAutoGenLogs]);

  const handleTriggerAutoGen = async () => {
    setTriggeringAutoGen(true);
    try {
      const res = await fetch("/api/regulatory-updates/auto-gen-trigger", {
        method: "POST",
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        toast({ title: "Triggered", description: "Auto-generation run completed" });
        fetchUpdates();
        if (showLogs) fetchAutoGenLogs();
      } else {
        const data = await res.json();
        toast({ title: "Error", description: data.error || "Failed to trigger", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Failed to trigger auto-generation", variant: "destructive" });
    } finally {
      setTriggeringAutoGen(false);
    }
  };

  const handleEdit = (update: RegulatoryUpdate) => {
    setEditingId(update.id);
    setForm({
      category: update.category,
      text: update.text,
      priority: update.priority,
      topic: "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const statusIcon = (status: string) => {
    if (status === "success") return <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />;
    if (status === "error") return <XCircle className="w-3.5 h-3.5 text-red-500" />;
    return <AlertCircle className="w-3.5 h-3.5 text-amber-500" />;
  };

  const statusColor = (status: string) => {
    if (status === "success") return "bg-green-50 text-green-700 border-green-200";
    if (status === "error") return "bg-red-50 text-red-700 border-red-200";
    return "bg-amber-50 text-amber-700 border-amber-200";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Zap className="w-6 h-6 text-amber-500" />
            Regulatory Updates
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage live regulatory intelligence displayed on the landing page
          </p>
        </div>
        <Button variant="outline" onClick={fetchUpdates} className="gap-2">
          <RefreshCw className="w-4 h-4" /> Refresh
        </Button>
      </div>

      <div className="grid lg:grid-cols-[1fr_1fr] gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Plus className="w-5 h-5 text-primary" />
              {editingId ? "Edit Update" : "Add Update"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs mb-1.5 block">Category</Label>
                <Select value={form.category} onValueChange={(v) => setForm(prev => ({ ...prev, category: v }))}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs mb-1.5 block">Priority</Label>
                <Select value={form.priority} onValueChange={(v) => setForm(prev => ({ ...prev, priority: v }))}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map(p => (
                      <SelectItem key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="text-xs mb-1.5 block">Update Text</Label>
              <Textarea
                value={form.text}
                onChange={(e) => setForm(prev => ({ ...prev, text: e.target.value }))}
                placeholder="Enter regulatory update text..."
                rows={3}
                className="text-sm"
              />
            </div>

            <div className="flex gap-2">
              <Button onClick={handleSubmit} disabled={saving} className="gap-2 flex-1">
                {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {editingId ? "Update" : "Add Update"}
              </Button>
              {editingId && (
                <Button variant="outline" onClick={() => { setEditingId(null); setForm({ category: "FBR", text: "", priority: "medium", topic: "" }); }}>
                  Cancel
                </Button>
              )}
            </div>

            <div className="border-t pt-4 mt-4">
              <Label className="text-xs mb-1.5 block font-medium flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-violet-500" />
                AI Generation
              </Label>
              <Input
                value={form.topic}
                onChange={(e) => setForm(prev => ({ ...prev, topic: e.target.value }))}
                placeholder="Optional topic (e.g., 'Tax deadline extension')"
                className="h-9 text-sm mb-2"
              />
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleGenerateAI} disabled={generating} className="gap-2 flex-1 text-xs">
                  {generating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  Preview AI Text
                </Button>
                <Button variant="secondary" onClick={handleQuickGenerate} disabled={generating} className="gap-2 flex-1 text-xs">
                  {generating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                  Generate & Publish
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Stats</CardTitle>
              <Badge variant="outline" className="text-xs">{updates.length} total</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              {CATEGORIES.map(cat => {
                const Icon = CATEGORY_ICONS[cat];
                const count = updates.filter(u => u.category === cat).length;
                const active = updates.filter(u => u.category === cat && u.isActive).length;
                return (
                  <div key={cat} className="border rounded-xl p-3 text-center">
                    <Icon className="w-5 h-5 mx-auto mb-1 text-muted-foreground" />
                    <p className="text-lg font-bold">{count}</p>
                    <p className="text-[10px] text-muted-foreground">{cat} ({active} active)</p>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {PRIORITIES.map(p => (
                <div key={p} className="text-center border rounded-lg p-2">
                  <p className="text-sm font-semibold">{updates.filter(u => u.priority === p).length}</p>
                  <p className="text-[10px] text-muted-foreground capitalize">{p}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-violet-200 bg-gradient-to-r from-violet-50/50 to-indigo-50/50">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Timer className="w-5 h-5 text-violet-500" />
              Auto-Generation (Every 2 Hours)
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs"
                onClick={() => setShowLogs(!showLogs)}
              >
                <Clock className="w-3.5 h-3.5" />
                {showLogs ? "Hide Logs" : "View Logs"}
              </Button>
              <Button
                size="sm"
                className="gap-1.5 text-xs bg-violet-600 hover:bg-violet-700"
                onClick={handleTriggerAutoGen}
                disabled={triggeringAutoGen}
              >
                {triggeringAutoGen ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <PlayCircle className="w-3.5 h-3.5" />
                )}
                Run Now
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-3">
            The system automatically generates one regulatory update per category (FBR, SECP, PSX, SBP) every 2 hours using AI. Requires a valid ChatGPT API key in Settings.
          </p>
          {showLogs && (
            <div className="border rounded-xl bg-white p-3 space-y-2 max-h-80 overflow-y-auto">
              {autoGenLogs.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">No auto-generation logs yet</p>
              ) : (
                autoGenLogs.map(log => (
                  <div key={log.id} className="flex items-start gap-2.5 p-2 rounded-lg border text-xs">
                    {statusIcon(log.status)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <Badge variant="outline" className="text-[10px] py-0">{log.category}</Badge>
                        <Badge variant="outline" className={`text-[10px] py-0 ${statusColor(log.status)}`}>
                          {log.status}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground ml-auto">
                          {new Date(log.runAt).toLocaleString()}
                        </span>
                      </div>
                      {log.generatedText && (
                        <p className="text-muted-foreground truncate">{log.generatedText}</p>
                      )}
                      {log.errorMessage && (
                        <p className="text-red-500 truncate">{log.errorMessage}</p>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">All Updates</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <div key={i} className="h-16 bg-muted rounded-lg animate-pulse" />)}
            </div>
          ) : updates.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Zap className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No regulatory updates yet. Add your first one above.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {updates.map(update => {
                const Icon = CATEGORY_ICONS[update.category] || Zap;
                return (
                  <div key={update.id} className={`flex items-center gap-3 p-3 rounded-xl border ${update.isActive ? "border-border/60 bg-card" : "border-border/30 bg-muted/30 opacity-60"} transition-all`}>
                    <div className="w-8 h-8 rounded-lg bg-muted/50 flex items-center justify-center shrink-0">
                      <Icon className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <Badge variant="outline" className="text-[10px] py-0">{update.category}</Badge>
                        <Badge variant="outline" className={`text-[10px] py-0 ${PRIORITY_COLORS[update.priority]}`}>
                          {update.priority}
                        </Badge>
                        {update.source === "ai" && (
                          <Badge variant="outline" className="text-[10px] py-0 bg-violet-50 text-violet-600 border-violet-200">AI</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{update.text}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Switch
                        checked={update.isActive}
                        onCheckedChange={() => handleToggleActive(update)}
                      />
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleEdit(update)}>
                        <Edit2 className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => handleDelete(update.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
