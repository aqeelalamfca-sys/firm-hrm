import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  Upload, FileText, CheckCircle2, AlertTriangle, Lock,
  ChevronRight, ChevronDown, Download, Loader2, Play, Eye, Shield, X, Plus,
  ArrowLeft, ArrowRight, RefreshCw, AlertCircle, Check, Clock, Settings2,
  FileCheck, Layers, ClipboardCheck, Pencil, Save, Mail, Phone,
  Globe, EyeOff, Calendar, Tag, Sparkles, Bot, Zap,
  Info, AlertOctagon, Calculator, CircleDot,
  ExternalLink, Gauge,
} from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL || "/api";

const STAGES = [
  { key: "upload", label: "Upload", icon: Upload },
  { key: "extraction", label: "AI Extraction", icon: Eye },
  { key: "arranged_data", label: "Arranged Data", icon: Layers },
  { key: "variables", label: "Variables", icon: Settings2 },
  { key: "generation", label: "Generation", icon: Play },
  { key: "export", label: "Export", icon: Download },
] as const;

const FILE_CATEGORIES = [
  { value: "financial_statements", label: "Financial Statements", format: "Excel (.xlsx)" },
  { value: "trial_balance", label: "Trial Balance", format: "Excel (.xlsx)" },
  { value: "general_ledger", label: "General Ledger", format: "Excel (.xlsx)" },
  { value: "bank_statement", label: "Bank Statement", format: "Excel (.xlsx)" },
  { value: "sales_tax_return", label: "Sales Tax Return", format: "PDF" },
  { value: "tax_notice", label: "Tax Notice / Assessment", format: "PDF" },
  { value: "schedule", label: "Schedule / Notes", format: "PDF or Excel" },
  { value: "annexure", label: "Annexure", format: "PDF" },
  { value: "other", label: "Other Document", format: "Any" },
];

const EXCEL_CATEGORIES = ["financial_statements", "trial_balance", "general_ledger", "bank_statement"];
const PDF_CATEGORIES = ["sales_tax_return", "tax_notice", "annexure"];

const HEAD_COLORS: Record<string, string> = {
  locked: "bg-gray-100 text-gray-400 border-gray-200",
  ready: "bg-blue-50 text-blue-700 border-blue-200",
  in_progress: "bg-amber-50 text-amber-700 border-amber-200",
  validating: "bg-purple-50 text-purple-700 border-purple-200",
  review: "bg-orange-50 text-orange-700 border-orange-200",
  approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  exported: "bg-green-50 text-green-800 border-green-300",
  completed: "bg-green-100 text-green-900 border-green-400",
};

export default function WorkingPapers() {
  const { user } = useAuth();
  const { toast } = useToast();
  const token = typeof window !== "undefined" ? localStorage.getItem("hrm_token") : null;
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

  const [sessions, setSessions] = useState<any[]>([]);
  const [activeSession, setActiveSession] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState<string>("upload");

  const [newClientName, setNewClientName] = useState("");
  const [newYear, setNewYear] = useState("2025");
  const [newEntityType, setNewEntityType] = useState("Private Limited");
  const [newNtn, setNewNtn] = useState("");
  const [newStrn, setNewStrn] = useState("");
  const [newPeriodStart, setNewPeriodStart] = useState(`${2025 - 1}-07-01`);
  const [newPeriodEnd, setNewPeriodEnd] = useState("2025-06-30");

  const handleYearChange = (year: string) => {
    setNewYear(year);
    const y = parseInt(year);
    if (!isNaN(y)) {
      setNewPeriodStart(`${y - 1}-07-01`);
      setNewPeriodEnd(`${y}-06-30`);
    }
  };
  const [newFramework, setNewFramework] = useState("IFRS");
  const [newEngagementType, setNewEngagementType] = useState("statutory_audit");
  const [newEngagementContinuity, setNewEngagementContinuity] = useState("first_time");
  const [newAuditFirmName, setNewAuditFirmName] = useState("");
  const [newAuditFirmLogo, setNewAuditFirmLogo] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string>("");
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const [newPreparerId, setNewPreparerId] = useState<string>("");
  const [newReviewerId, setNewReviewerId] = useState<string>("");
  const [newApproverId, setNewApproverId] = useState<string>("");
  const [teamMembers, setTeamMembers] = useState<any[]>([]);

  const [uploadFiles, setUploadFiles] = useState<{ file: File; category: string }[]>([]);
  const [extractionData, setExtractionData] = useState<any>(null);
  const [arrangedData, setArrangedData] = useState<any>(null);
  const [variables, setVariables] = useState<any[]>([]);
  const [variableGroups, setVariableGroups] = useState<any>({});
  const [variableStats, setVariableStats] = useState<any>(null);
  const [changeLog, setChangeLog] = useState<any[]>([]);
  const [heads, setHeads] = useState<any[]>([]);
  const [exceptions, setExceptions] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState("");
  const [editingVar, setEditingVar] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editReason, setEditReason] = useState("");

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => { fetchSessions(); fetchTeamMembers(); }, []);

  const fetchTeamMembers = async () => {
    try {
      const res = await fetch(`${API_BASE}/working-papers/team-members`, { headers });
      if (res.ok) setTeamMembers(await res.json());
    } catch {}
  };

  useEffect(() => {
    if (activeSession) {
      setStage(activeSession.status || "upload");
      if (activeSession.heads) setHeads(activeSession.heads);
      if (activeSession.exceptions) setExceptions(activeSession.exceptions);
    }
  }, [activeSession]);

  const fetchSessions = async () => {
    try {
      const res = await fetch(`${API_BASE}/working-papers/sessions`, { headers });
      if (res.ok) setSessions(await res.json());
    } catch {}
  };

  const fetchSession = async (id: number) => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/working-papers/sessions/${id}`, { headers });
      if (res.ok) {
        const data = await res.json();
        setActiveSession(data);
        return data;
      }
    } catch {} finally { setLoading(false); }
  };

  const createSession = async () => {
    const missing: string[] = [];
    if (!newClientName.trim()) missing.push("Client Name");
    if (!newYear.trim()) missing.push("Engagement Year");
    if (!newNtn.trim()) missing.push("NTN");
    if (!newPeriodStart) missing.push("Period Start");
    if (!newPeriodEnd) missing.push("Period End");
    if (missing.length > 0) {
      toast({ title: "Required fields missing", description: missing.join(", "), variant: "destructive" });
      return;
    }
    try {
      setLoading(true);
      let logoUrl = "";
      if (newAuditFirmLogo) {
        const formData = new FormData();
        formData.append("file", newAuditFirmLogo);
        const uploadRes = await fetch(`${API_BASE}/working-papers/upload-logo`, {
          method: "POST", headers, body: formData,
        });
        if (uploadRes.ok) {
          const uploadData = await uploadRes.json();
          logoUrl = uploadData.url;
        }
      }
      const res = await fetch(`${API_BASE}/working-papers/sessions`, {
        method: "POST", headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          clientName: newClientName,
          engagementYear: newYear,
          entityType: newEntityType,
          ntn: newNtn,
          strn: newStrn || undefined,
          periodStart: newPeriodStart,
          periodEnd: newPeriodEnd,
          reportingFramework: newFramework,
          engagementType: newEngagementType,
          engagementContinuity: newEngagementContinuity,
          auditFirmName: newAuditFirmName || undefined,
          auditFirmLogo: logoUrl || undefined,
          preparerId: newPreparerId ? parseInt(newPreparerId) : undefined,
          preparerName: newPreparerId ? teamMembers.find((m: any) => m.id === parseInt(newPreparerId))?.name : undefined,
          reviewerId: newReviewerId ? parseInt(newReviewerId) : undefined,
          reviewerName: newReviewerId ? teamMembers.find((m: any) => m.id === parseInt(newReviewerId))?.name : undefined,
          approverId: newApproverId ? parseInt(newApproverId) : undefined,
          approverName: newApproverId ? teamMembers.find((m: any) => m.id === parseInt(newApproverId))?.name : undefined,
        }),
      });
      if (res.ok) {
        const session = await res.json();
        toast({ title: "Session created", description: `${newClientName} — ${newEntityType}` });
        setNewClientName("");
        setNewNtn("");
        setNewStrn("");
        setNewPeriodStart("");
        setNewPeriodEnd("");
        setNewAuditFirmName("");
        setNewAuditFirmLogo(null);
        setLogoPreview("");
        await fetchSessions();
        await fetchSession(session.id);
      }
    } catch { toast({ title: "Failed to create session", variant: "destructive" }); }
    finally { setLoading(false); }
  };

  const handleFileAdd = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const newFiles = files.map(f => ({ file: f, category: guessCategory(f.name) }));
    setUploadFiles(prev => [...prev, ...newFiles]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const guessCategory = (name: string): string => {
    const n = name.toLowerCase();
    if (n.includes("tb") || n.includes("trial")) return "trial_balance";
    if (n.includes("gl") || n.includes("ledger")) return "general_ledger";
    if (n.includes("bank")) return "bank_statement";
    if (n.includes("tax") || n.includes("sales tax") || n.includes("str")) return "sales_tax_return";
    if (n.includes("fs") || n.includes("financial") || n.includes("balance sheet") || n.includes("pl") || n.includes("profit")) return "financial_statements";
    return "other";
  };

  const validateFile = (file: File, category: string): string | null => {
    const name = file.name.toLowerCase();
    const isExcel = name.endsWith(".xlsx") || name.endsWith(".xls");
    const isPdf = name.endsWith(".pdf");
    if (EXCEL_CATEGORIES.includes(category) && !isExcel) return `${category.replace(/_/g, " ")} requires Excel format (.xlsx/.xls)`;
    if (PDF_CATEGORIES.includes(category) && !isPdf && !file.type.startsWith("image/")) return `${category.replace(/_/g, " ")} requires PDF format`;
    return null;
  };

  const handleUpload = async () => {
    if (!activeSession || uploadFiles.length === 0) return;

    const errors: string[] = [];
    for (const uf of uploadFiles) {
      const err = validateFile(uf.file, uf.category);
      if (err) errors.push(`${uf.file.name}: ${err}`);
    }
    if (errors.length > 0) {
      toast({ title: "Validation errors", description: errors.join("; "), variant: "destructive" });
      return;
    }

    try {
      setLoading(true);
      const formData = new FormData();
      const cats: Record<string, string> = {};
      for (const uf of uploadFiles) {
        formData.append("files", uf.file);
        cats[uf.file.name] = uf.category;
      }
      formData.append("categories", JSON.stringify(cats));

      const res = await fetch(`${API_BASE}/working-papers/sessions/${activeSession.id}/upload`, {
        method: "POST", headers, body: formData,
      });
      if (res.ok) {
        const result = await res.json();
        toast({ title: `${result.uploaded?.length || 0} files uploaded` });
        setUploadFiles([]);
        await fetchSession(activeSession.id);
      } else {
        const err = await res.json();
        toast({ title: "Upload failed", description: err.error, variant: "destructive" });
      }
    } catch { toast({ title: "Upload failed", variant: "destructive" }); }
    finally { setLoading(false); }
  };

  const runExtraction = async () => {
    if (!activeSession) return;
    try {
      setLoading(true);
      toast({ title: "Running AI extraction...", description: "This may take a minute" });
      const res = await fetch(`${API_BASE}/working-papers/sessions/${activeSession.id}/extract`, {
        method: "POST", headers: { ...headers, "Content-Type": "application/json" },
      });
      if (res.ok) {
        const data = await res.json();
        setExtractionData(data);
        toast({ title: "Extraction complete", description: `${data.stats?.files || 0} files processed` });
        await fetchSession(activeSession.id);
        setStage("extraction");
      } else {
        const err = await res.json();
        toast({ title: "Extraction failed", description: err.error, variant: "destructive" });
      }
    } catch { toast({ title: "Extraction failed", variant: "destructive" }); }
    finally { setLoading(false); }
  };

  const fetchArrangedData = async () => {
    if (!activeSession) return;
    try {
      const res = await fetch(`${API_BASE}/working-papers/sessions/${activeSession.id}/arranged-data`, { headers });
      if (res.ok) {
        const data = await res.json();
        setArrangedData(data);
        if (data.tabNames?.length > 0 && !activeTab) setActiveTab(data.tabNames[0]);
      }
    } catch {}
  };

  const approveAllFields = async () => {
    if (!activeSession) return;
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/working-papers/sessions/${activeSession.id}/arranged-data/approve-all`, {
        method: "POST", headers: { ...headers, "Content-Type": "application/json" },
      });
      if (res.ok) {
        toast({ title: "All fields approved" });
        await fetchSession(activeSession.id);
        setStage("arranged_data");
      }
    } catch {} finally { setLoading(false); }
  };

  const autoFillVariables = async () => {
    if (!activeSession) return;
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/working-papers/sessions/${activeSession.id}/variables/auto-fill`, {
        method: "POST", headers: { ...headers, "Content-Type": "application/json" },
      });
      if (res.ok) {
        const result = await res.json();
        toast({
          title: `100% Variables Populated`,
          description: result.message || `${result.created} created, ${result.updated} updated. ${result.formulaCount || 0} calculated, ${result.assumptionCount || 0} assumed (flagged for review).`
        });
        await fetchVariables();
        setStage("variables");
      }
    } catch {} finally { setLoading(false); }
  };

  const fetchVariables = async () => {
    if (!activeSession) return;
    try {
      const res = await fetch(`${API_BASE}/working-papers/sessions/${activeSession.id}/variables`, { headers });
      if (res.ok) {
        const data = await res.json();
        setVariables(data.variables || []);
        setVariableGroups(data.grouped || {});
        setVariableStats(data.stats || null);
        setChangeLog(data.changeLog || []);
      }
    } catch {}
  };

  const saveVariableEdit = async (varId: number) => {
    if (!activeSession) return;
    try {
      const res = await fetch(`${API_BASE}/working-papers/sessions/${activeSession.id}/variables/${varId}`, {
        method: "PATCH", headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ value: editValue, reason: editReason || "Manual edit", editedBy: user?.id }),
      });
      if (res.ok) {
        toast({ title: "Variable updated" });
        setEditingVar(null);
        setEditValue("");
        setEditReason("");
        await fetchVariables();
      } else {
        const err = await res.json();
        toast({ title: "Update failed", description: err.error, variant: "destructive" });
      }
    } catch {}
  };

  const lockAllVariables = async () => {
    if (!activeSession) return;
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/working-papers/sessions/${activeSession.id}/variables/lock-all`, {
        method: "POST", headers: { ...headers, "Content-Type": "application/json" },
      });
      if (res.ok) {
        toast({ title: "Variables locked, generation unlocked" });
        await fetchSession(activeSession.id);
        await fetchExceptions();
        setStage("generation");
      } else {
        const err = await res.json();
        toast({ title: "Cannot lock", description: err.error || `${err.missing?.length || 0} mandatory variables missing`, variant: "destructive" });
      }
    } catch {} finally { setLoading(false); }
  };

  const lockSection = async (group: string) => {
    if (!activeSession) return;
    try {
      const res = await fetch(`${API_BASE}/working-papers/sessions/${activeSession.id}/variables/lock-section`, {
        method: "POST", headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ group }),
      });
      if (res.ok) {
        toast({ title: `${group} locked` });
        await fetchVariables();
      } else {
        const err = await res.json();
        toast({ title: "Cannot lock section", description: err.error, variant: "destructive" });
      }
    } catch {}
  };

  const markVariableReviewed = async (varId: number) => {
    if (!activeSession) return;
    try {
      const res = await fetch(`${API_BASE}/working-papers/sessions/${activeSession.id}/variables/${varId}/review`, {
        method: "PATCH", headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ reviewStatus: "reviewed" }),
      });
      if (res.ok) {
        toast({ title: "Marked as reviewed" });
        await fetchVariables();
      }
    } catch {}
  };

  const validateVariables = async () => {
    if (!activeSession) return;
    try {
      const res = await fetch(`${API_BASE}/working-papers/sessions/${activeSession.id}/variables/validate`, {
        method: "POST", headers: { ...headers, "Content-Type": "application/json" },
      });
      if (res.ok) {
        const data = await res.json();
        return data;
      }
    } catch {}
    return { issues: [], totalIssues: 0 };
  };

  const generateHead = async (headIndex: number) => {
    if (!activeSession) return;
    try {
      setLoading(true);
      toast({ title: "Generating...", description: `Processing head ${headIndex}` });
      let url = "";
      if (headIndex === 0) url = `${API_BASE}/working-papers/sessions/${activeSession.id}/generate-tb`;
      else if (headIndex === 1) url = `${API_BASE}/working-papers/sessions/${activeSession.id}/generate-gl`;
      else url = `${API_BASE}/working-papers/sessions/${activeSession.id}/heads/${headIndex}/generate`;

      const res = await fetch(url, {
        method: "POST", headers: { ...headers, "Content-Type": "application/json" },
      });
      if (res.ok) {
        toast({ title: "Generation complete" });
        await fetchSession(activeSession.id);
        await fetchExceptions();
      } else {
        const err = await res.json();
        toast({ title: "Generation failed", description: err.error, variant: "destructive" });
      }
    } catch { toast({ title: "Generation failed", variant: "destructive" }); }
    finally { setLoading(false); }
  };

  const approveHead = async (headIndex: number) => {
    if (!activeSession) return;
    try {
      const res = await fetch(`${API_BASE}/working-papers/sessions/${activeSession.id}/heads/${headIndex}/approve`, {
        method: "POST", headers: { ...headers, "Content-Type": "application/json" },
      });
      if (res.ok) {
        toast({ title: "Head approved, next unlocked" });
        await fetchSession(activeSession.id);
        await fetchExceptions();
      }
    } catch {}
  };

  const exportHead = async (headIndex: number) => {
    if (!activeSession) return;
    try {
      const res = await fetch(`${API_BASE}/working-papers/sessions/${activeSession.id}/heads/${headIndex}/export`, {
        method: "POST", headers,
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        const disp = res.headers.get("content-disposition") || "";
        const match = disp.match(/filename="?([^"]+)"?/);
        a.download = match?.[1] || `head_${headIndex}.xlsx`;
        a.href = url;
        a.click();
        URL.revokeObjectURL(url);
        toast({ title: "Export downloaded" });
        await fetchSession(activeSession.id);
      }
    } catch {}
  };

  const exportBundle = async () => {
    if (!activeSession) return;
    try {
      const res = await fetch(`${API_BASE}/working-papers/sessions/${activeSession.id}/export-bundle`, {
        method: "POST", headers,
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.download = `${activeSession.clientName}_${activeSession.engagementYear}_Bundle.xlsx`;
        a.href = url;
        a.click();
        URL.revokeObjectURL(url);
        toast({ title: "Bundle exported" });
      }
    } catch {}
  };

  const fetchExceptions = async () => {
    if (!activeSession) return;
    try {
      const res = await fetch(`${API_BASE}/working-papers/sessions/${activeSession.id}/exceptions`, { headers });
      if (res.ok) setExceptions(await res.json());
    } catch {}
  };

  const confidenceBadge = (conf: number | null) => {
    if (conf === null || conf === undefined) return null;
    const c = Number(conf);
    if (c >= 90) return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">{c}%</span>;
    if (c >= 70) return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">{c}% Review</span>;
    return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">{c}% Confirm</span>;
  };

  // ── SESSION LIST ──
  if (!activeSession) {
    return (
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">AI Working Paper Generator</h1>
            <p className="text-muted-foreground text-sm mt-1">Audit-grade sequential workflow: Upload → Extract → Arrange → Verify → Generate → Export</p>
          </div>
        </div>

        <div className="bg-card border rounded-xl p-6 space-y-4">
          <h2 className="font-semibold">New Engagement Session</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Client / Entity Name *</label>
              <Input placeholder="e.g. ABC Industries (Pvt.) Ltd." value={newClientName} onChange={e => setNewClientName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Entity Type *</label>
              <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={newEntityType} onChange={e => setNewEntityType(e.target.value)}>
                <option value="Private Limited">Private Limited Company</option>
                <option value="Public Limited (Listed)">Public Limited (Listed / PIE)</option>
                <option value="Public Limited (Unlisted)">Public Limited (Unlisted)</option>
                <option value="Single Member">Single Member Company</option>
                <option value="LLP">Limited Liability Partnership</option>
                <option value="AOP">Association of Persons (AOP)</option>
                <option value="Sole Proprietor">Sole Proprietor</option>
                <option value="NGO/NPO">NGO / NPO (Section 42)</option>
                <option value="Trust">Trust</option>
                <option value="Government Entity">Government Entity</option>
                <option value="Branch Office">Branch Office (Foreign Company)</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Engagement Year *</label>
              <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={newYear} onChange={e => handleYearChange(e.target.value)}>
                {[2022, 2023, 2024, 2025, 2026, 2027, 2028, 2029, 2030].map(y => (
                  <option key={y} value={String(y)}>{y}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">NTN (National Tax Number) *</label>
              <Input placeholder="e.g. 1234567-8" value={newNtn} onChange={e => setNewNtn(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">STRN (Sales Tax Registration)</label>
              <Input placeholder="e.g. 32-00-1234-567-89" value={newStrn} onChange={e => setNewStrn(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Period Start *</label>
              <Input type="date" value={newPeriodStart} onChange={e => setNewPeriodStart(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Period End *</label>
              <Input type="date" value={newPeriodEnd} onChange={e => setNewPeriodEnd(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Reporting Framework *</label>
              <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={newFramework} onChange={e => setNewFramework(e.target.value)}>
                <option value="IFRS">IFRS (Full)</option>
                <option value="IFRS for SMEs">IFRS for SMEs</option>
                <option value="AFRS">AFRS (Accounting Framework)</option>
                <option value="Fourth Schedule">Fourth Schedule (Companies Act 2017)</option>
                <option value="Fifth Schedule">Fifth Schedule (Banking/Insurance)</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Engagement Type *</label>
              <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={newEngagementType} onChange={e => setNewEngagementType(e.target.value)}>
                <option value="statutory_audit">Statutory Audit</option>
                <option value="limited_review">Limited Review / Review Engagement</option>
                <option value="group_audit">Group / Consolidated Audit</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Engagement Continuity *</label>
              <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={newEngagementContinuity} onChange={e => setNewEngagementContinuity(e.target.value)}>
                <option value="first_time">First Time Engagement</option>
                <option value="recurring">Recurring (Same Auditor)</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Audit Firm Name</label>
              <Input placeholder="e.g. Alam & Aulakh Chartered Accountants" value={newAuditFirmName} onChange={e => setNewAuditFirmName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Audit Firm Logo</label>
              <div className="flex items-center gap-3">
                <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={e => {
                  const f = e.target.files?.[0];
                  if (f) { setNewAuditFirmLogo(f); setLogoPreview(URL.createObjectURL(f)); }
                }} />
                <Button type="button" variant="outline" size="sm" onClick={() => logoInputRef.current?.click()}>
                  <Upload className="w-3.5 h-3.5 mr-1.5" /> {newAuditFirmLogo ? "Change" : "Upload"}
                </Button>
                {logoPreview && <img src={logoPreview} alt="Logo preview" className="h-8 w-auto rounded border" />}
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Preparer (Prepared By)</label>
              <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={newPreparerId} onChange={e => setNewPreparerId(e.target.value)}>
                <option value="">-- Select Preparer --</option>
                {teamMembers.map((m: any) => (
                  <option key={m.id} value={m.id}>{m.name}{m.designation ? ` — ${m.designation}` : ""}{m.role ? ` (${m.role.replace(/_/g, " ")})` : ""}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Reviewer (Reviewed By)</label>
              <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={newReviewerId} onChange={e => setNewReviewerId(e.target.value)}>
                <option value="">-- Select Reviewer --</option>
                {teamMembers.filter((m: any) => ["super_admin", "manager", "partner", "hr_admin"].includes(m.role)).map((m: any) => (
                  <option key={m.id} value={m.id}>{m.name}{m.designation ? ` — ${m.designation}` : ""}{m.role ? ` (${m.role.replace(/_/g, " ")})` : ""}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Approver (Approved By)</label>
              <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={newApproverId} onChange={e => setNewApproverId(e.target.value)}>
                <option value="">-- Select Approver --</option>
                {teamMembers.filter((m: any) => ["super_admin", "partner"].includes(m.role)).map((m: any) => (
                  <option key={m.id} value={m.id}>{m.name}{m.designation ? ` — ${m.designation}` : ""}{m.role ? ` (${m.role.replace(/_/g, " ")})` : ""}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <Button onClick={createSession} disabled={loading} className="w-full">
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
                Create Session
              </Button>
            </div>
          </div>
          {(newEntityType === "Public Limited (Listed)" || newEntityType === "Government Entity") && (
            <div className="flex items-center gap-2 p-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {newEntityType === "Public Limited (Listed)" ? "Listed entities require EQCR review and enhanced disclosure working papers." : "Government entity engagements follow special reporting requirements."}
            </div>
          )}
        </div>

        {sessions.length > 0 && (
          <div className="bg-card border rounded-xl divide-y">
            <div className="p-4 font-semibold">Existing Sessions</div>
            {sessions.map((s: any) => (
              <div key={s.id} className="p-4 flex items-center justify-between hover:bg-muted/30 cursor-pointer" onClick={() => fetchSession(s.id)}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{s.clientName}</p>
                    {s.entityType && <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 font-medium">{s.entityType}</span>}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Year: {s.engagementYear} — {s.reportingFramework || "IFRS"} — Stage: {s.status}
                    {s.ntn && <span className="ml-2">NTN: {s.ntn}</span>}
                  </p>
                  {(s.preparerName || s.reviewerName || s.approverName) && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {s.preparerName && <span>Preparer: {s.preparerName}</span>}
                      {s.reviewerName && <span className="ml-3">Reviewer: {s.reviewerName}</span>}
                      {s.approverName && <span className="ml-3">Approver: {s.approverName}</span>}
                    </p>
                  )}
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0" />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  const stageIndex = STAGES.findIndex(s => s.key === stage);

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => { setActiveSession(null); setStage("upload"); }}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold">{activeSession.clientName}</h1>
            {activeSession.entityType && <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 font-medium">{activeSession.entityType}</span>}
          </div>
          <p className="text-sm text-muted-foreground">
            {activeSession.engagementYear} — {activeSession.reportingFramework || "IFRS"}
            {activeSession.periodStart && activeSession.periodEnd && <span className="ml-1">— Period: {activeSession.periodStart} to {activeSession.periodEnd}</span>}
            {activeSession.ntn && <span className="ml-1">— NTN: {activeSession.ntn}</span>}
            {activeSession.engagementContinuity && <span className="ml-1">— {activeSession.engagementContinuity === "recurring" ? "Recurring" : "First Time"}</span>}
          </p>
          {activeSession.auditFirmName && (
            <div className="flex items-center gap-2 mt-1">
              {activeSession.auditFirmLogo && <img src={`${API_BASE.replace('/api', '')}${activeSession.auditFirmLogo}`} alt="Firm logo" className="h-6 w-auto rounded" />}
              <span className="text-xs text-muted-foreground font-medium">{activeSession.auditFirmName}</span>
            </div>
          )}
          {(activeSession.preparerName || activeSession.reviewerName || activeSession.approverName) && (
            <div className="flex items-center gap-4 mt-1 flex-wrap">
              {activeSession.preparerName && (
                <span className="text-xs"><span className="text-muted-foreground">Prepared by:</span> <span className="font-medium">{activeSession.preparerName}</span></span>
              )}
              {activeSession.reviewerName && (
                <span className="text-xs"><span className="text-muted-foreground">Reviewed by:</span> <span className="font-medium">{activeSession.reviewerName}</span></span>
              )}
              {activeSession.approverName && (
                <span className="text-xs"><span className="text-muted-foreground">Approved by:</span> <span className="font-medium">{activeSession.approverName}</span></span>
              )}
            </div>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={() => fetchExceptions()}>
          <AlertTriangle className="w-4 h-4 mr-1" /> Exceptions ({exceptions.length})
        </Button>
      </div>

      {/* Stage Navigation */}
      <div className="flex items-center gap-1 bg-muted/30 rounded-xl p-1.5 overflow-x-auto">
        {STAGES.map((s, i) => {
          const Icon = s.icon;
          const isActive = s.key === stage;
          const isPast = i < stageIndex;
          return (
            <button
              key={s.key}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all",
                isActive ? "bg-white shadow text-primary" : isPast ? "text-emerald-600" : "text-muted-foreground",
              )}
              onClick={() => setStage(s.key)}
            >
              {isPast ? <CheckCircle2 className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
              {s.label}
            </button>
          );
        })}
      </div>

      {/* Stage Content */}
      {stage === "upload" && (
        <UploadStage
          files={uploadFiles}
          setFiles={setUploadFiles}
          uploadedFiles={activeSession.files || []}
          fileInputRef={fileInputRef}
          onFileAdd={handleFileAdd}
          onUpload={handleUpload}
          onNext={runExtraction}
          loading={loading}
          validateFile={validateFile}
        />
      )}

      {stage === "extraction" && (
        <ExtractionStage
          data={extractionData}
          session={activeSession}
          onFetchArranged={() => { fetchArrangedData(); setStage("arranged_data"); }}
          onRerun={runExtraction}
          loading={loading}
          confidenceBadge={confidenceBadge}
        />
      )}

      {stage === "arranged_data" && (
        <ArrangedDataStage
          data={arrangedData}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          onFetch={fetchArrangedData}
          onApproveAll={approveAllFields}
          onNext={() => { autoFillVariables(); }}
          loading={loading}
          confidenceBadge={confidenceBadge}
        />
      )}

      {stage === "variables" && (
        <VariablesStage
          variables={variables}
          grouped={variableGroups}
          stats={variableStats}
          changeLog={changeLog}
          editingVar={editingVar}
          editValue={editValue}
          editReason={editReason}
          setEditingVar={setEditingVar}
          setEditValue={setEditValue}
          setEditReason={setEditReason}
          onSave={saveVariableEdit}
          onReview={markVariableReviewed}
          onFetch={fetchVariables}
          onLockAll={lockAllVariables}
          onLockSection={lockSection}
          onValidate={validateVariables}
          loading={loading}
          confidenceBadge={confidenceBadge}
        />
      )}

      {stage === "generation" && (
        <GenerationStage
          heads={heads}
          session={activeSession}
          exceptions={exceptions}
          onGenerate={generateHead}
          onApprove={approveHead}
          onExport={exportHead}
          loading={loading}
          onRefresh={() => fetchSession(activeSession.id)}
        />
      )}

      {stage === "export" && (
        <ExportStage
          heads={heads}
          session={activeSession}
          exceptions={exceptions}
          onExportHead={exportHead}
          onExportBundle={exportBundle}
          loading={loading}
        />
      )}

      {/* Exception Modal Overlay */}
      {exceptions.length > 0 && stage !== "generation" && stage !== "export" && (
        <div className="fixed bottom-4 right-4 z-50">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 shadow-lg max-w-xs">
            <div className="flex items-center gap-2 text-amber-800 text-sm font-medium">
              <AlertTriangle className="w-4 h-4" />
              {exceptions.filter((e: any) => e.status === "open").length} open exceptions
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════
// STAGE COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

function UploadStage({ files, setFiles, uploadedFiles, fileInputRef, onFileAdd, onUpload, onNext, loading, validateFile }: any) {
  return (
    <div className="space-y-4">
      <div className="bg-card border rounded-xl p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Upload className="w-5 h-5 text-primary" /> Upload Documents
        </h2>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 text-sm text-blue-800">
          <strong>Upload Rules:</strong> Financial Statements/TB/GL/Bank Statements → Excel only (.xlsx/.xls) | Sales Tax Return/Notices/Annexures → PDF only
        </div>

        <div
          className="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer hover:border-primary/50 transition"
          onClick={() => fileInputRef.current?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); const dt = e.dataTransfer.files; if (dt.length) { const arr = Array.from(dt).map(f => ({ file: f, category: "other" })); setFiles((p: any) => [...p, ...arr]); } }}
        >
          <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
          <p className="text-muted-foreground">Drop files here or click to browse</p>
          <p className="text-xs text-muted-foreground mt-1">Accepted: .xlsx, .xls, .pdf, .jpg, .png</p>
          <input ref={fileInputRef} type="file" multiple accept=".xlsx,.xls,.pdf,.jpg,.jpeg,.png,.webp" onChange={onFileAdd} className="hidden" />
        </div>

        {files.length > 0 && (
          <div className="mt-4 space-y-2">
            <h3 className="text-sm font-semibold">Files to Upload ({files.length})</h3>
            {files.map((uf: any, i: number) => {
              const err = validateFile(uf.file, uf.category);
              return (
                <div key={i} className={cn("flex items-center gap-3 p-3 rounded-lg border", err ? "bg-red-50 border-red-200" : "bg-muted/30")}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{uf.file.name}</p>
                    <p className="text-xs text-muted-foreground">{(uf.file.size / 1024).toFixed(0)} KB</p>
                    {err && <p className="text-xs text-red-600 mt-1">{err}</p>}
                  </div>
                  <select
                    className="text-xs border rounded-lg px-2 py-1.5 bg-white"
                    value={uf.category}
                    onChange={e => {
                      const updated = [...files];
                      updated[i].category = e.target.value;
                      setFiles(updated);
                    }}
                  >
                    {FILE_CATEGORIES.map(c => (
                      <option key={c.value} value={c.value}>{c.label} ({c.format})</option>
                    ))}
                  </select>
                  <button onClick={() => setFiles((p: any) => p.filter((_: any, j: number) => j !== i))}>
                    <X className="w-4 h-4 text-muted-foreground hover:text-red-500" />
                  </button>
                </div>
              );
            })}
            <Button onClick={onUpload} disabled={loading} className="mt-2">
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Upload className="w-4 h-4 mr-2" />}
              Upload {files.length} File{files.length > 1 ? "s" : ""}
            </Button>
          </div>
        )}

        {uploadedFiles.length > 0 && (
          <div className="mt-6">
            <h3 className="text-sm font-semibold mb-2">Uploaded Files ({uploadedFiles.length})</h3>
            <div className="space-y-1">
              {uploadedFiles.map((f: any) => (
                <div key={f.id} className="flex items-center gap-2 p-2 rounded bg-green-50 text-sm">
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                  <span className="truncate flex-1">{f.originalName}</span>
                  <span className="text-xs text-muted-foreground capitalize">{f.category?.replace(/_/g, " ")}</span>
                  <span className="text-xs px-2 py-0.5 rounded bg-green-100 text-green-700">{f.format}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {uploadedFiles.length > 0 && (
        <div className="flex justify-end">
          <Button onClick={onNext} disabled={loading} size="lg">
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Play className="w-4 h-4 mr-2" />}
            Run AI Extraction
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      )}
    </div>
  );
}

function ExtractionStage({ data, session, onFetchArranged, onRerun, loading, confidenceBadge }: any) {
  const extractionData = data?.data || session?.extractionData;
  const stats = data?.stats;

  return (
    <div className="space-y-4">
      <div className="bg-card border rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Eye className="w-5 h-5 text-primary" /> AI Extraction Results
          </h2>
          <Button variant="outline" size="sm" onClick={onRerun} disabled={loading}>
            <RefreshCw className="w-4 h-4 mr-1" /> Re-run
          </Button>
        </div>

        {stats && (
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-blue-50 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-blue-700">{stats.files}</p>
              <p className="text-xs text-blue-600">Files</p>
            </div>
            <div className="bg-purple-50 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-purple-700">{stats.pages}</p>
              <p className="text-xs text-purple-600">Pages</p>
            </div>
            <div className="bg-emerald-50 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-emerald-700">{stats.sheets}</p>
              <p className="text-xs text-emerald-600">Sheets</p>
            </div>
          </div>
        )}

        {extractionData && (
          <div className="space-y-3">
            {extractionData.entity && (
              <div className="p-4 bg-muted/30 rounded-lg">
                <h3 className="text-sm font-semibold mb-2">Entity Profile</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                  {Object.entries(extractionData.entity).filter(([, v]) => v && typeof v !== "object").map(([k, v]) => (
                    <div key={k}><span className="text-muted-foreground">{k.replace(/_/g, " ")}:</span> <span className="font-medium">{String(v)}</span></div>
                  ))}
                </div>
              </div>
            )}
            {extractionData.confidence_scores && (
              <div className="p-4 bg-muted/30 rounded-lg">
                <h3 className="text-sm font-semibold mb-2">Confidence Scores</h3>
                <div className="flex gap-3 flex-wrap">
                  {Object.entries(extractionData.confidence_scores).map(([k, v]) => (
                    <div key={k} className="flex items-center gap-1 text-sm">
                      <span className="text-muted-foreground">{k.replace(/_/g, " ")}:</span>
                      {confidenceBadge(Number(v))}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {extractionData.flags && extractionData.flags.length > 0 && (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <h3 className="text-sm font-semibold text-amber-800 mb-2">Flags & Warnings</h3>
                <ul className="space-y-1">
                  {extractionData.flags.map((f: string, i: number) => (
                    <li key={i} className="text-sm text-amber-700 flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> {f}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {!extractionData && (
          <div className="text-center py-8 text-muted-foreground">
            <Eye className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>Extraction has not been run yet. Go back to Upload to run extraction.</p>
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <Button onClick={onFetchArranged} size="lg">
          Review Arranged Data <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}

function ArrangedDataStage({ data, activeTab, setActiveTab, onFetch, onApproveAll, onNext, loading, confidenceBadge }: any) {
  useEffect(() => { if (!data) onFetch(); }, []);

  if (!data) return (
    <div className="text-center py-12">
      <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
      <p className="text-muted-foreground">Loading arranged data...</p>
    </div>
  );

  const tabs = data.tabNames || [];
  const tabData = data.tabs || {};

  return (
    <div className="space-y-4">
      <div className="bg-card border rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Layers className="w-5 h-5 text-primary" /> Arranged Data Review
          </h2>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onFetch}><RefreshCw className="w-4 h-4 mr-1" /> Refresh</Button>
            <Button size="sm" onClick={onApproveAll} disabled={loading}>
              <CheckCircle2 className="w-4 h-4 mr-1" /> Approve All
            </Button>
          </div>
        </div>

        <div className="flex gap-1 overflow-x-auto pb-2 mb-4">
          {tabs.map((t: string) => (
            <button
              key={t}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition",
                activeTab === t ? "bg-primary text-primary-foreground" : "bg-muted/50 hover:bg-muted",
              )}
              onClick={() => setActiveTab(t)}
            >
              {t}
              {tabData[t]?.length > 0 && <span className="ml-1 opacity-70">({tabData[t].length})</span>}
            </button>
          ))}
        </div>

        {activeTab && tabData[activeTab] && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="p-2 text-left">Field</th>
                  <th className="p-2 text-left">Extracted Value</th>
                  <th className="p-2 text-left">Confidence</th>
                  <th className="p-2 text-left">Source</th>
                  <th className="p-2 text-left">Approved</th>
                </tr>
              </thead>
              <tbody>
                {(tabData[activeTab] || []).map((row: any, i: number) => (
                  <tr key={row.id || i} className="border-b hover:bg-muted/20">
                    <td className="p-2 font-medium">{(row.fieldName || "").replace(/_/g, " ")}</td>
                    <td className="p-2 max-w-xs truncate">{row.finalApprovedValue || row.extractedValue}</td>
                    <td className="p-2">{confidenceBadge(row.confidence)}</td>
                    <td className="p-2 text-xs text-muted-foreground">{row.sourceFile || "—"}</td>
                    <td className="p-2">{row.isApproved ? <Check className="w-4 h-4 text-green-600" /> : <Clock className="w-4 h-4 text-muted-foreground" />}</td>
                  </tr>
                ))}
                {(!tabData[activeTab] || tabData[activeTab].length === 0) && (
                  <tr><td colSpan={5} className="p-4 text-center text-muted-foreground">No data in this tab</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <Button onClick={onNext} size="lg" disabled={loading}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Settings2 className="w-4 h-4 mr-2" />}
          Auto-fill Variables <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}

function normalizeNumeric(val: string | number | null | undefined): number | null {
  if (val === null || val === undefined || val === "") return null;
  if (typeof val === "number") return isNaN(val) ? null : val;
  const cleaned = val.replace(/[^0-9.\-]/g, "");
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}
function formatCurrency(val: string | number | null | undefined): string {
  const n = normalizeNumeric(val);
  if (n === null) return "—";
  return `PKR ${n.toLocaleString("en-PK", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}
function formatPercentage(val: string | number | null | undefined): string {
  const n = normalizeNumeric(val);
  if (n === null) return "—";
  return `${n}%`;
}
function pillColor(val: string): string {
  const v = (val || "").toLowerCase();
  if (["low","strong","pass","sufficient","appropriate","compliant","yes","approved","completed","exported","active","clean","unmodified"].includes(v)) return "bg-green-100 text-green-800 border-green-200";
  if (["medium","adequate","partial","moderate","in review","in progress","pending","review","validating"].includes(v)) return "bg-amber-100 text-amber-800 border-amber-200";
  if (["high","weak","fail","insufficient","inappropriate","non-compliant","no","exception","critical","rejected","overdue","material"].includes(v)) return "bg-red-100 text-red-800 border-red-200";
  if (["n/a","not applicable","not assessed","none","draft","locked"].includes(v)) return "bg-slate-100 text-slate-600 border-slate-200";
  if (["qualified","adverse","disclaimer","inappropriate basis","material uncertainty — inadequate disclosure"].includes(v)) return "bg-orange-100 text-orange-800 border-orange-200";
  if (["unmodified","no material uncertainty","material uncertainty — adequate disclosure","excellent"].includes(v)) return "bg-green-100 text-green-800 border-green-200";
  return "bg-slate-100 text-slate-700 border-slate-200";
}
function statusColor(val: string): string {
  const v = (val || "").toLowerCase();
  if (["completed","exported","approved","locked","reviewed"].includes(v)) return "bg-green-100 text-green-800 border-green-300";
  if (["in review","review","validating","in progress","pending","variables","generation"].includes(v)) return "bg-blue-100 text-blue-800 border-blue-300";
  if (["draft","upload","extraction","ready"].includes(v)) return "bg-slate-100 text-slate-700 border-slate-300";
  if (["reopened","exception","overdue","export"].includes(v)) return "bg-amber-100 text-amber-800 border-amber-300";
  return "bg-slate-100 text-slate-700 border-slate-200";
}
function sourceIcon(sourceType: string | null | undefined): { label: string; cls: string } {
  if (!sourceType) return { label: "", cls: "" };
  switch (sourceType) {
    case "ai_extraction": return { label: "AI", cls: "text-blue-600 bg-blue-50" };
    case "session": return { label: "Session", cls: "text-emerald-600 bg-emerald-50" };
    case "default": return { label: "Default", cls: "text-slate-500 bg-slate-50" };
    case "user_edit": return { label: "Manual", cls: "text-purple-600 bg-purple-50" };
    case "formula": return { label: "Calculated", cls: "text-indigo-600 bg-indigo-50" };
    case "assumption": return { label: "Assumed", cls: "text-amber-600 bg-amber-50" };
    case "autofill": return { label: "Auto", cls: "text-cyan-600 bg-cyan-50" };
    default: return { label: sourceType.replace(/_/g, " "), cls: "text-slate-500 bg-slate-50" };
  }
}
const inputCls = "h-8 text-sm border rounded-md px-2 focus:ring-2 focus:ring-primary/20 focus:border-primary";
const noSpin = "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";
function PillSelector({ options, value, onChange, shape = "full" }: { options: string[]; value: string; onChange: (v: string) => void; shape?: "full" | "rounded" }) {
  return (
    <div className="flex items-center gap-2 mt-1 flex-wrap">
      {options.map(opt => (
        <button key={opt} onClick={() => onChange(opt)} className={cn(
          "px-3 py-1 text-xs font-semibold border transition-all",
          shape === "full" ? "rounded-full" : "rounded-lg",
          value === opt ? pillColor(opt) + " ring-2 ring-offset-1 ring-current" : "bg-white text-muted-foreground border-slate-200 hover:bg-slate-50"
        )}>{opt}</button>
      ))}
    </div>
  );
}
function safeParseArray(val: string): string[] {
  if (!val) return [];
  try { const p = JSON.parse(val); return Array.isArray(p) ? p.map(String) : []; } catch { return val.split(",").map(s => s.trim()).filter(Boolean); }
}
function safeFormatDate(d: string, opts?: Intl.DateTimeFormatOptions): string {
  if (!d || d === "—") return "—";
  const date = new Date(d.includes("T") ? d : d + "T00:00:00");
  return isNaN(date.getTime()) ? d : date.toLocaleDateString("en-GB", opts || { day: "2-digit", month: "short", year: "numeric" });
}
function MultiSelectInput({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  const selected: string[] = safeParseArray(value);
  const toggle = (opt: string) => {
    const next = selected.includes(opt) ? selected.filter(s => s !== opt) : [...selected, opt];
    onChange(JSON.stringify(next));
  };
  return (
    <div className="flex flex-wrap gap-1.5 mt-1">
      {options.map(opt => (
        <button key={opt} onClick={() => toggle(opt)} className={cn("px-2.5 py-1 text-xs border rounded-md transition-all", selected.includes(opt) ? "bg-primary/10 text-primary border-primary/30 font-semibold" : "bg-white text-muted-foreground border-slate-200 hover:bg-slate-50")}>
          {selected.includes(opt) && <Check className="w-3 h-3 inline mr-1" />}{opt}
        </button>
      ))}
    </div>
  );
}
function TagInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [input, setInput] = useState("");
  const tags: string[] = safeParseArray(value);
  const add = () => { if (input.trim()) { onChange(JSON.stringify([...tags, input.trim()])); setInput(""); } };
  const remove = (tag: string) => onChange(JSON.stringify(tags.filter(t => t !== tag)));
  return (
    <div className="mt-1">
      <div className="flex flex-wrap gap-1 mb-1.5">
        {tags.map(tag => (
          <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/10 text-primary text-xs rounded-full border border-primary/20">
            <Tag className="w-3 h-3" />{tag}<button onClick={() => remove(tag)} className="hover:text-red-500"><X className="w-3 h-3" /></button>
          </span>
        ))}
      </div>
      <div className="flex gap-1">
        <input className={cn(inputCls, "w-40")} value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && (e.preventDefault(), add())} placeholder="Add tag..." />
        <Button size="sm" variant="outline" className="h-8 px-2" onClick={add}><Plus className="w-3 h-3" /></Button>
      </div>
    </div>
  );
}
function RenderEditInput({ def, value, onChange }: { def: any; value: string; onChange: (v: string) => void }) {
  const mode = def?.inputMode || "text";
  const options: string[] = def?.dropdownOptionsJson || [];
  switch (mode) {
    case "toggle":
      return <PillSelector options={["true", "false"]} value={value} onChange={onChange} />;
    case "yes_no_na":
      return <PillSelector options={["Yes", "No", "N/A"]} value={value} onChange={onChange} />;
    case "pass_fail":
      return <PillSelector options={options.length ? options : ["Pass", "Fail", "Exception"]} value={value} onChange={onChange} />;
    case "risk_level":
      return <PillSelector options={options.length ? options : ["Low", "Medium", "High"]} value={value} onChange={onChange} />;
    case "rating_level":
      return <PillSelector options={options.length ? options : ["Strong", "Adequate", "Weak"]} value={value} onChange={onChange} shape="rounded" />;
    case "exception_flag":
      return <PillSelector options={options.length ? options : ["No Exception", "Minor", "Major", "Critical"]} value={value} onChange={onChange} />;
    case "conclusion":
    case "status":
      return (
        <select className={cn(inputCls, "min-w-[220px] bg-white")} value={value} onChange={e => onChange(e.target.value)}>
          <option value="">-- Select --</option>
          {options.map((opt: string) => <option key={opt} value={opt}>{opt}</option>)}
        </select>
      );
    case "dropdown":
      return (
        <select className={cn(inputCls, "min-w-[200px] bg-white")} value={value} onChange={e => onChange(e.target.value)}>
          <option value="">-- Select --</option>
          {options.map((opt: string) => <option key={opt} value={opt}>{opt}</option>)}
        </select>
      );
    case "multi_select":
      return <MultiSelectInput options={options} value={value} onChange={onChange} />;
    case "radio":
      return (
        <div className="flex flex-col gap-1.5 mt-1">
          {options.map(opt => (
            <label key={opt} className="inline-flex items-center gap-2 cursor-pointer text-sm">
              <input type="radio" name={def?.variableCode || "radio"} checked={value === opt} onChange={() => onChange(opt)} className="w-4 h-4 text-primary border-slate-300 focus:ring-primary" />
              {opt}
            </label>
          ))}
        </div>
      );
    case "checkbox":
      return (
        <label className="inline-flex items-center gap-2 mt-1 cursor-pointer text-sm">
          <input type="checkbox" checked={value === "true"} onChange={e => onChange(e.target.checked ? "true" : "false")} className="w-4 h-4 rounded text-primary border-slate-300 focus:ring-primary" />
          {def?.variableLabel || "Enabled"}
        </label>
      );
    case "checkbox_group":
      return <MultiSelectInput options={options} value={value} onChange={onChange} />;
    case "currency":
      return (
        <div className="flex items-center mt-1">
          <span className="text-xs font-semibold text-muted-foreground bg-slate-100 px-2 py-1.5 rounded-l-md border border-r-0">PKR</span>
          <input type="number" className={cn("rounded-r-md w-44 border-l-0", inputCls, noSpin)} value={value} onChange={e => onChange(e.target.value)} placeholder="0" />
        </div>
      );
    case "percentage":
      return (
        <div className="flex items-center mt-1">
          <input type="number" step="0.1" min="0" max="100" className={cn("rounded-l-md w-24", inputCls, noSpin)} value={value} onChange={e => onChange(e.target.value)} placeholder="0" />
          <span className="text-xs font-semibold text-muted-foreground bg-slate-100 px-2 py-1.5 rounded-r-md border border-l-0">%</span>
        </div>
      );
    case "number":
      return <input type="number" className={cn(inputCls, noSpin, "w-36")} value={value} onChange={e => onChange(e.target.value)} placeholder="0" />;
    case "date":
      return <input type="date" className={cn(inputCls, "w-44")} value={value} onChange={e => onChange(e.target.value)} />;
    case "time":
      return <input type="time" className={cn(inputCls, "w-36")} value={value} onChange={e => onChange(e.target.value)} />;
    case "datetime":
      return <input type="datetime-local" className={cn(inputCls, "w-56")} value={value} onChange={e => onChange(e.target.value)} />;
    case "date_range": {
      const parts = (value || "|").split("|");
      return (
        <div className="flex items-center gap-2 mt-1">
          <input type="date" className={cn(inputCls, "w-40")} value={parts[0] || ""} onChange={e => onChange(`${e.target.value}|${parts[1] || ""}`)} />
          <span className="text-xs text-muted-foreground">to</span>
          <input type="date" className={cn(inputCls, "w-40")} value={parts[1] || ""} onChange={e => onChange(`${parts[0] || ""}|${e.target.value}`)} />
        </div>
      );
    }
    case "email":
      return (
        <div className="flex items-center mt-1">
          <span className="text-muted-foreground bg-slate-100 px-2 py-1.5 rounded-l-md border border-r-0"><Mail className="w-3.5 h-3.5" /></span>
          <input type="email" className={cn("rounded-r-md w-52", inputCls)} value={value} onChange={e => onChange(e.target.value)} placeholder="email@example.com" />
        </div>
      );
    case "phone":
      return (
        <div className="flex items-center mt-1">
          <span className="text-muted-foreground bg-slate-100 px-2 py-1.5 rounded-l-md border border-r-0"><Phone className="w-3.5 h-3.5" /></span>
          <input type="tel" className={cn("rounded-r-md w-48", inputCls)} value={value} onChange={e => onChange(e.target.value)} placeholder="+92-XXX-XXXXXXX" />
        </div>
      );
    case "url":
      return (
        <div className="flex items-center mt-1">
          <span className="text-muted-foreground bg-slate-100 px-2 py-1.5 rounded-l-md border border-r-0"><Globe className="w-3.5 h-3.5" /></span>
          <input type="url" className={cn("rounded-r-md w-64", inputCls)} value={value} onChange={e => onChange(e.target.value)} placeholder="https://..." />
        </div>
      );
    case "masked":
    case "password":
      return (
        <div className="flex items-center mt-1">
          <span className="text-muted-foreground bg-slate-100 px-2 py-1.5 rounded-l-md border border-r-0"><EyeOff className="w-3.5 h-3.5" /></span>
          <input type="password" className={cn("rounded-r-md w-48", inputCls)} value={value} onChange={e => onChange(e.target.value)} placeholder="••••••" />
        </div>
      );
    case "textarea":
    case "ai_narrative":
    case "comment":
      return <textarea className="mt-1 w-full text-sm border rounded-md px-3 py-2 min-h-[60px] resize-y focus:ring-2 focus:ring-primary/20 focus:border-primary" value={value} onChange={e => onChange(e.target.value)} placeholder={mode === "ai_narrative" ? "AI-generated narrative..." : mode === "comment" ? "Add comment..." : "Enter details..."} rows={3} />;
    case "tag_input":
      return <TagInput value={value} onChange={onChange} />;
    case "manual_override":
      return (
        <div className="mt-1 space-y-1">
          <div className="flex items-center gap-1 text-[10px] text-amber-600 font-medium"><AlertTriangle className="w-3 h-3" /> Manual override — original value will be logged</div>
          <Input className="h-8 text-sm w-52 border-amber-300 focus:ring-amber-200" value={value} onChange={e => onChange(e.target.value)} placeholder="Override value" />
        </div>
      );
    case "formula":
    case "readonly":
    case "locked":
    case "autofill":
    case "label":
    case "ai_extracted":
    case "ai_confidence":
    case "ai_suggestion":
    case "ai_reconciliation":
    case "progress_bar":
    case "validation_message":
    case "info_banner":
    case "error_alert":
    case "summary_card":
      return <span className="text-sm text-muted-foreground italic mt-1 block">This field is auto-managed and cannot be edited directly.</span>;
    default:
      return <Input className={cn(inputCls, "w-52")} value={value} onChange={e => onChange(e.target.value)} placeholder="Enter value" />;
  }
}
function RenderDisplayValue({ def, value, sourceType }: { def: any; value: string; sourceType?: string }) {
  const mode = def?.inputMode || "text";
  const dv = value || "";
  const src = sourceIcon(sourceType);
  const renderSrc = () => src.label ? <span className={cn("text-[9px] px-1.5 py-0.5 rounded-full font-medium ml-1.5 shrink-0", src.cls)}>{src.label}</span> : null;
  const wrap = (children: React.ReactNode) => <div className="flex items-center gap-1.5">{children}{renderSrc()}</div>;
  const wrapStart = (children: React.ReactNode) => <div className="flex items-start gap-1.5">{children}{renderSrc()}</div>;
  const empty = () => wrap(<span className="text-sm text-muted-foreground">—</span>);
  if (!dv && !["toggle","checkbox","progress_bar","info_banner","validation_message","label","formula","readonly","locked"].includes(mode)) return empty();
  switch (mode) {
    case "toggle":
    case "checkbox":
      return wrap(
        dv === "true" ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-50 px-2 py-0.5 rounded-full border border-green-200"><Check className="w-3 h-3" /> Yes</span> :
        dv === "false" ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 bg-red-50 px-2 py-0.5 rounded-full border border-red-200"><X className="w-3 h-3" /> No</span> :
        <span className="text-sm text-muted-foreground">—</span>
      );
    case "yes_no_na":
      return wrap(<span className={cn("text-xs font-semibold px-2.5 py-0.5 rounded-full border", pillColor(dv))}>{dv}</span>);
    case "pass_fail":
      return wrap(
        <span className={cn("inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full border", pillColor(dv))}>
          {dv.toLowerCase() === "pass" ? <Check className="w-3 h-3" /> : dv.toLowerCase() === "fail" ? <X className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
          {dv}
        </span>
      );
    case "risk_level":
    case "rating_level":
    case "exception_flag":
      return wrap(<span className={cn("text-xs font-semibold px-2.5 py-0.5 rounded-full border", pillColor(dv))}>{dv}</span>);
    case "conclusion":
      return wrap(
        <span className={cn("inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-lg border", pillColor(dv))}>
          <FileCheck className="w-3.5 h-3.5" />{dv}
        </span>
      );
    case "status":
      return wrap(
        <span className={cn("inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-0.5 rounded-full border", statusColor(dv))}>
          <CircleDot className="w-3 h-3" />{dv}
        </span>
      );
    case "dropdown":
    case "radio":
      return wrap(<span className="text-sm bg-slate-50 px-2 py-0.5 rounded border border-slate-200">{dv}</span>);
    case "multi_select":
    case "checkbox_group": {
      const items: string[] = safeParseArray(dv);
      return wrap(
        <div className="flex flex-wrap gap-1">
          {items.length > 0 ? items.map((item: string) => <span key={item} className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full border border-primary/20">{item}</span>) : <span className="text-sm text-muted-foreground">—</span>}
        </div>
      );
    }
    case "tag_input": {
      const tags: string[] = safeParseArray(dv);
      return wrap(
        <div className="flex flex-wrap gap-1">
          {tags.length > 0 ? tags.map((tag: string) => <span key={tag} className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full border border-primary/20"><Tag className="w-3 h-3" />{tag}</span>) : <span className="text-sm text-muted-foreground">—</span>}
        </div>
      );
    }
    case "currency":
      return wrap(<span className="text-sm font-mono tabular-nums text-foreground">{formatCurrency(dv)}</span>);
    case "percentage":
      return wrap(
        <span className="inline-flex items-center gap-1 text-sm font-mono tabular-nums text-foreground">
          {formatPercentage(dv)}
          {(() => { const n = normalizeNumeric(dv); return n !== null ? <span className="inline-block w-16 h-1.5 bg-slate-200 rounded-full overflow-hidden ml-1"><span className="h-full bg-primary block rounded-full" style={{ width: `${Math.min(n, 100)}%` }} /></span> : null; })()}
        </span>
      );
    case "number":
      return wrap(<span className="text-sm font-mono tabular-nums text-foreground">{normalizeNumeric(dv)?.toLocaleString() ?? "—"}</span>);
    case "date":
      return wrap(
        <span className="inline-flex items-center gap-1.5 text-sm text-foreground">
          <Calendar className="w-3.5 h-3.5 text-muted-foreground" />{safeFormatDate(dv)}
        </span>
      );
    case "time":
      return wrap(<span className="inline-flex items-center gap-1.5 text-sm text-foreground"><Clock className="w-3.5 h-3.5 text-muted-foreground" />{dv}</span>);
    case "datetime":
      return wrap(
        <span className="inline-flex items-center gap-1.5 text-sm text-foreground">
          <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
          {safeFormatDate(dv, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
        </span>
      );
    case "date_range": {
      const parts = (dv || "|").split("|");
      return wrap(<span className="text-sm text-foreground">{safeFormatDate(parts[0] || "")} → {safeFormatDate(parts[1] || "")}</span>);
    }
    case "email":
      return wrap(
        <a href={`mailto:${dv}`} className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:underline">
          <Mail className="w-3.5 h-3.5" />{dv}
        </a>
      );
    case "phone":
      return wrap(
        <a href={`tel:${dv}`} className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:underline">
          <Phone className="w-3.5 h-3.5" />{dv}
        </a>
      );
    case "url":
      return wrap(
        <a href={dv} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:underline">
          <Globe className="w-3.5 h-3.5" />{dv.length > 40 ? dv.substring(0, 40) + "…" : dv}<ExternalLink className="w-3 h-3" />
        </a>
      );
    case "masked":
    case "password":
      return wrap(<span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground"><EyeOff className="w-3.5 h-3.5" />{"•".repeat(Math.min(dv.length || 8, 12))}</span>);
    case "textarea":
    case "comment":
      return wrapStart(<p className="text-sm text-muted-foreground line-clamp-2 max-w-md">{dv || "—"}</p>);
    case "ai_narrative":
      return wrapStart(
        <div className="max-w-md">
          <div className="flex items-center gap-1 text-[10px] text-blue-600 font-medium mb-0.5"><Sparkles className="w-3 h-3" /> AI Generated</div>
          <p className="text-sm text-muted-foreground line-clamp-3">{dv}</p>
        </div>
      );
    case "ai_extracted":
      return wrap(
        <span className="inline-flex items-center gap-1.5 text-sm">
          <Bot className="w-3.5 h-3.5 text-blue-500" />
          <span className="text-foreground">{dv}</span>
        </span>
      );
    case "ai_suggestion":
      return wrap(
        <span className="inline-flex items-center gap-1.5 text-sm bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
          <Sparkles className="w-3.5 h-3.5 text-blue-500" />
          <span className="text-blue-800">{dv}</span>
        </span>
      );
    case "ai_confidence": {
      const n = normalizeNumeric(dv);
      const pct = n !== null ? n : 0;
      const color = pct >= 80 ? "bg-green-500" : pct >= 60 ? "bg-amber-500" : "bg-red-500";
      return wrap(
        <span className="inline-flex items-center gap-2 text-sm">
          <Gauge className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="w-16 h-2 bg-slate-200 rounded-full overflow-hidden"><span className={cn("h-full block rounded-full", color)} style={{ width: `${pct}%` }} /></span>
          <span className="font-mono text-xs tabular-nums">{pct}%</span>
        </span>
      );
    }
    case "ai_reconciliation":
      return wrapStart(
        <div className="max-w-md">
          <div className="flex items-center gap-1 text-[10px] text-indigo-600 font-medium mb-0.5"><Zap className="w-3 h-3" /> AI Reconciliation</div>
          <p className="text-sm text-muted-foreground line-clamp-2">{dv}</p>
        </div>
      );
    case "formula":
      return wrap(
        <span className="inline-flex items-center gap-1.5 text-sm font-mono tabular-nums bg-indigo-50 text-indigo-800 px-2 py-0.5 rounded border border-indigo-200">
          <Calculator className="w-3.5 h-3.5" />{dv}
        </span>
      );
    case "readonly":
    case "autofill":
      return wrap(<span className="text-sm text-muted-foreground bg-slate-50 px-2 py-0.5 rounded border border-slate-200">{dv || "—"}</span>);
    case "locked":
      return wrap(
        <span className="inline-flex items-center gap-1.5 text-sm text-green-700 bg-green-50 px-2 py-0.5 rounded border border-green-200">
          <Lock className="w-3.5 h-3.5" />{dv}
        </span>
      );
    case "manual_override":
      return wrap(
        <span className="inline-flex items-center gap-1.5 text-sm text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
          <AlertTriangle className="w-3.5 h-3.5" />{dv}
        </span>
      );
    case "label":
      return <div className="text-sm font-medium text-foreground">{dv}</div>;
    case "info_banner":
      return (
        <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-md px-3 py-1.5 text-xs text-blue-800">
          <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />{dv || "Information"}
        </div>
      );
    case "error_alert":
      return (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-md px-3 py-1.5 text-xs text-red-800">
          <AlertOctagon className="w-3.5 h-3.5 mt-0.5 shrink-0" />{dv}
        </div>
      );
    case "validation_message": {
      const isOk = dv.toLowerCase().includes("pass") || dv.toLowerCase().includes("valid") || dv.toLowerCase().includes("ok");
      return (
        <div className={cn("flex items-start gap-2 rounded-md px-3 py-1.5 text-xs border", isOk ? "bg-green-50 border-green-200 text-green-800" : "bg-red-50 border-red-200 text-red-800")}>
          {isOk ? <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />}{dv}
        </div>
      );
    }
    case "progress_bar": {
      const n = normalizeNumeric(dv);
      const pct = n !== null ? Math.min(n, 100) : 0;
      return wrap(
        <span className="inline-flex items-center gap-2 text-sm">
          <span className="w-24 h-2 bg-slate-200 rounded-full overflow-hidden"><span className="h-full bg-primary block rounded-full transition-all" style={{ width: `${pct}%` }} /></span>
          <span className="font-mono text-xs tabular-nums">{pct}%</span>
        </span>
      );
    }
    case "summary_card":
      return (
        <div className="bg-slate-50 border rounded-lg px-3 py-2 text-sm max-w-md">
          <p className="text-muted-foreground">{dv}</p>
        </div>
      );
    default:
      return wrap(<span className="text-sm text-muted-foreground">{dv || "—"}</span>);
  }
}

function VariablesStage({ variables, grouped, stats, changeLog, editingVar, editValue, editReason, setEditingVar, setEditValue, setEditReason, onSave, onReview, onFetch, onLockAll, onLockSection, onValidate, loading, confidenceBadge }: any) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [validationIssues, setValidationIssues] = useState<any[]>([]);
  const [showAuditTrail, setShowAuditTrail] = useState(false);

  useEffect(() => { if (variables.length === 0) onFetch(); }, []);

  const toggleGroup = (g: string) => setExpandedGroups(prev => ({ ...prev, [g]: !prev[g] }));

  const runValidation = async () => {
    const result = await onValidate();
    setValidationIssues(result.issues || []);
  };

  const filterVar = (v: any) => {
    if (search) {
      const s = search.toLowerCase();
      const label = v.definition?.variableLabel || v.variableName || "";
      const code = v.variableCode || "";
      if (!label.toLowerCase().includes(s) && !code.toLowerCase().includes(s)) return false;
    }
    if (filter === "mandatory" && !v.definition?.mandatoryFlag) return false;
    if (filter === "low_confidence" && (!v.confidence || Number(v.confidence) >= 70)) return false;
    if (filter === "missing" && v.finalValue && v.finalValue.trim() !== "") return false;
    if (filter === "reviewed" && v.reviewStatus !== "reviewed" && v.reviewStatus !== "confirmed") return false;
    if (filter === "locked" && !v.isLocked) return false;
    if (filter === "needs_review" && v.reviewStatus !== "needs_review") return false;
    return true;
  };

  const groupEntries = Object.entries(grouped).filter(([, g]: any) => {
    if (!g.subgroups) return false;
    const allVars = Object.values(g.subgroups).flat() as any[];
    return allVars.some(filterVar);
  });

  return (
    <div className="space-y-4">
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          {[
            { label: "Total", value: stats.total, color: "bg-slate-100 text-slate-800", filterKey: "all" },
            { label: "Filled", value: stats.filled, color: "bg-green-100 text-green-800", filterKey: "reviewed" },
            { label: "Missing", value: stats.missing, color: "bg-red-100 text-red-800", filterKey: "missing" },
            { label: "Low Confidence", value: stats.lowConfidence, color: "bg-amber-100 text-amber-800", filterKey: "low_confidence" },
            { label: "Needs Review", value: stats.needsReview, color: "bg-purple-100 text-purple-800", filterKey: "needs_review" },
            { label: "Locked", value: stats.locked, color: "bg-blue-100 text-blue-800", filterKey: "locked" },
          ].map(s => (
            <button key={s.label} onClick={() => setFilter(s.filterKey)} className={cn("rounded-lg p-3 text-center border cursor-pointer transition-all hover:scale-105 hover:shadow-md", s.color, filter === s.filterKey && "ring-2 ring-primary ring-offset-1")}>
              <p className="text-2xl font-bold">{s.value}</p>
              <p className="text-xs font-medium mt-0.5">{s.label}</p>
            </button>
          ))}
        </div>
      )}

      <div className="bg-card border rounded-xl p-6">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-primary" /> Audit Variable Register
            {stats && <span className="text-xs font-normal text-muted-foreground">({stats.filled}/{stats.total} filled)</span>}
          </h2>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={onFetch}><RefreshCw className="w-4 h-4 mr-1" /> Refresh</Button>
            <Button variant="outline" size="sm" onClick={runValidation}><Shield className="w-4 h-4 mr-1" /> Validate</Button>
            <Button variant="outline" size="sm" onClick={() => setShowAuditTrail(!showAuditTrail)}><ClipboardCheck className="w-4 h-4 mr-1" /> Trail ({changeLog.length})</Button>
            <Button size="sm" onClick={onLockAll} disabled={loading} className="bg-amber-600 hover:bg-amber-700">
              <Lock className="w-4 h-4 mr-1" /> Lock All & Proceed
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          <Input className="h-8 w-64 text-sm" placeholder="Search variables..." value={search} onChange={e => setSearch(e.target.value)} />
          {["all", "mandatory", "missing", "low_confidence", "needs_review", "reviewed", "locked"].map(f => (
            <button key={f} onClick={() => setFilter(f)} className={cn("px-3 py-1 rounded-full text-xs font-medium border transition-colors", filter === f ? "bg-primary text-white border-primary" : "bg-muted/50 text-muted-foreground border-transparent hover:bg-muted")}>
              {f.replace(/_/g, " ").replace(/^\w/, c => c.toUpperCase())}
            </button>
          ))}
        </div>

        {validationIssues.length > 0 && (
          <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <h3 className="text-sm font-semibold text-amber-900 mb-2 flex items-center gap-1"><AlertTriangle className="w-4 h-4" /> Validation Issues ({validationIssues.length})</h3>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {validationIssues.map((issue: any, i: number) => (
                <div key={i} className="text-xs flex items-center gap-2 p-1">
                  <span className={cn("w-2 h-2 rounded-full", issue.severity === "high" ? "bg-red-500" : issue.severity === "medium" ? "bg-amber-500" : "bg-blue-500")} />
                  <span className="font-medium">{issue.label}</span>
                  <span className="text-muted-foreground">{issue.issue}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {groupEntries.map(([groupName, groupData]: any) => {
          const isExpanded = expandedGroups[groupName] !== false;
          const gs = groupData.stats || { total: 0, filled: 0, missing: 0, locked: 0 };
          const pct = gs.total > 0 ? Math.round((gs.filled / gs.total) * 100) : 0;
          const allLocked = gs.locked === gs.total && gs.total > 0;

          return (
            <div key={groupName} className="mb-3 border rounded-lg overflow-hidden">
              <button onClick={() => toggleGroup(groupName)} className={cn("w-full flex items-center justify-between p-3 hover:bg-muted/30 transition-colors", allLocked ? "bg-green-50" : "bg-muted/10")}>
                <div className="flex items-center gap-2">
                  {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  <span className="font-semibold text-sm">{groupName}</span>
                  {allLocked && <Lock className="w-3 h-3 text-green-600" />}
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1">
                    <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs text-muted-foreground w-8">{pct}%</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{gs.filled}/{gs.total}</span>
                  {gs.missing > 0 && <span className="text-xs bg-red-100 text-red-700 px-1.5 rounded">{gs.missing} missing</span>}
                  {!allLocked && (
                    <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={(e) => { e.stopPropagation(); onLockSection(groupName); }}>
                      <Lock className="w-3 h-3 mr-1" /> Lock
                    </Button>
                  )}
                </div>
              </button>

              {isExpanded && (
                <div className="border-t">
                  {Object.entries(groupData.subgroups || {}).map(([subName, subVars]: any) => {
                    const filtered = subVars.filter(filterVar);
                    if (filtered.length === 0) return null;
                    return (
                      <div key={subName} className="border-b last:border-b-0">
                        <div className="px-4 py-1.5 bg-muted/20">
                          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{subName}</span>
                        </div>
                        <div className="divide-y">
                          {filtered.map((v: any) => {
                            const def = v.definition;
                            const isMandatory = def?.mandatoryFlag;
                            const isEditing = editingVar === v.id;
                            const isEmpty = !v.finalValue || v.finalValue.trim() === "";
                            const isLowConf = v.confidence && Number(v.confidence) < 70;

                            return (
                              <div key={v.id} className={cn(
                                "flex items-start gap-3 px-4 py-2.5 transition-colors",
                                v.isLocked ? "bg-green-50/40 border-l-2 border-l-green-400" :
                                isEmpty ? "bg-red-50/30 border-l-2 border-l-red-300" :
                                isLowConf ? "bg-amber-50/30 border-l-2 border-l-amber-300" :
                                v.reviewStatus === "needs_review" ? "bg-purple-50/30 border-l-2 border-l-purple-300" :
                                "hover:bg-muted/10 border-l-2 border-l-transparent"
                              )}>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <p className="text-sm font-medium leading-tight">{def?.variableLabel || (v.variableName || "").replace(/_/g, " ")}</p>
                                    {isMandatory && <span className="text-[9px] bg-red-100 text-red-700 px-1 py-px rounded font-bold tracking-wide">REQ</span>}
                                    {v.reviewStatus === "needs_review" && <span className="text-[9px] bg-purple-100 text-purple-700 px-1 py-px rounded font-semibold">REVIEW</span>}
                                    {def?.aiExtractableFlag && <span className="text-[9px] bg-blue-50 text-blue-600 px-1 py-px rounded">AI</span>}
                                    {def?.standardReference && <span className="text-[9px] text-muted-foreground bg-slate-50 px-1 py-px rounded">{def.standardReference}</span>}
                                    {def?.pakistanReference && <span className="text-[9px] text-muted-foreground bg-slate-50 px-1 py-px rounded">{def.pakistanReference}</span>}
                                  </div>

                                  {isEditing ? (
                                    <div className="mt-2 space-y-2">
                                      <RenderEditInput def={def} value={editValue} onChange={setEditValue} />
                                      <div className="flex gap-2 items-center pt-1">
                                        <Input className="h-7 text-xs w-48 placeholder:text-muted-foreground/50" value={editReason} onChange={e => setEditReason(e.target.value)} placeholder="Reason for change..." />
                                        <Button size="sm" variant="default" className="h-7 text-xs px-3" onClick={() => onSave(v.id)}><Save className="w-3 h-3 mr-1" /> Save</Button>
                                        <Button size="sm" variant="ghost" className="h-7 text-xs px-2" onClick={() => setEditingVar(null)}>Cancel</Button>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="mt-0.5">
                                      <RenderDisplayValue def={def} value={v.finalValue || v.autoFilledValue || ""} sourceType={v.sourceType} />
                                    </div>
                                  )}
                                </div>

                                <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
                                  {confidenceBadge(v.confidence ? Number(v.confidence) : null)}
                                  {v.reviewStatus === "needs_review" && !v.isLocked && (
                                    <button onClick={() => onReview(v.id)} className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-100 text-purple-700 hover:bg-purple-200 transition-colors" title="Mark as reviewed">
                                      ✓ Review
                                    </button>
                                  )}
                                  {v.isLocked ? (
                                    <Lock className="w-4 h-4 text-green-600" />
                                  ) : (
                                    <button onClick={() => { setEditingVar(v.id); setEditValue(v.finalValue || ""); setEditReason(""); }} className="p-1 rounded hover:bg-slate-100 transition-colors">
                                      <Pencil className="w-3.5 h-3.5 text-muted-foreground hover:text-primary" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {variables.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <Settings2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>No variables yet. Go back to run extraction and auto-fill.</p>
          </div>
        )}

        {showAuditTrail && changeLog.length > 0 && (
          <div className="mt-6 p-4 bg-muted/30 rounded-lg">
            <h3 className="text-sm font-semibold mb-2 flex items-center gap-2"><ClipboardCheck className="w-4 h-4" /> Audit Trail ({changeLog.length} changes)</h3>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {changeLog.map((c: any) => (
                <div key={c.id} className="text-xs flex gap-3 p-1.5 rounded bg-white border items-center">
                  <span className="font-mono text-muted-foreground">{c.variableCode || c.fieldName}</span>
                  <span className="font-medium">{(c.fieldName || "").replace(/_/g, " ")}</span>
                  <span className="text-red-600 line-through">{c.oldValue || "—"}</span>
                  <ArrowRight className="w-3 h-3 text-muted-foreground" />
                  <span className="text-green-600">{c.newValue}</span>
                  {c.reason && <span className="text-muted-foreground italic">({c.reason})</span>}
                  {c.sourceOfChange && <span className="text-muted-foreground">[{c.sourceOfChange}]</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function GenerationStage({ heads, session, exceptions, onGenerate, onApprove, onExport, loading, onRefresh }: any) {
  const allExceptions: any[] = exceptions || [];
  const allHeads: any[] = heads || [];
  const [approvalInProgress, setApprovalInProgress] = useState(false);
  const [expandedHead, setExpandedHead] = useState<number | null>(null);

  const completed = allHeads.filter((h: any) => ["approved", "exported", "completed"].includes(h.status)).length;
  const validating = allHeads.filter((h: any) => h.status === "validating" || h.status === "review").length;
  const total = allHeads.length;
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

  const approvableHeads = allHeads.filter((h: any) => h.status === "validating" || h.status === "review");
  const exportableHeads = allHeads.filter((h: any) => ["approved", "exported", "completed"].includes(h.status));

  const approveAll = async () => {
    setApprovalInProgress(true);
    for (const h of approvableHeads) {
      await onApprove(h.headIndex);
    }
    setApprovalInProgress(false);
  };

  const exportAll = async () => {
    for (const h of exportableHeads) {
      await onExport(h.headIndex);
    }
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case "approved": case "exported": case "completed": return <CheckCircle2 className="w-4.5 h-4.5 text-emerald-500" />;
      case "validating": case "review": return <Eye className="w-4.5 h-4.5 text-purple-500" />;
      case "ready": return <Play className="w-4.5 h-4.5 text-blue-500" />;
      case "in_progress": return <Loader2 className="w-4.5 h-4.5 text-amber-500 animate-spin" />;
      default: return <Lock className="w-4.5 h-4.5 text-gray-300" />;
    }
  };

  const statusLabel = (status: string) => {
    switch (status) {
      case "approved": return "Approved";
      case "exported": return "Exported";
      case "completed": return "Completed";
      case "validating": return "Pending Review";
      case "review": return "Under Review";
      case "ready": return "Ready to Generate";
      case "in_progress": return "Generating...";
      default: return "Locked";
    }
  };

  const statusBadgeClass = (status: string) => {
    switch (status) {
      case "approved": case "exported": case "completed": return "bg-emerald-100 text-emerald-700";
      case "validating": case "review": return "bg-purple-100 text-purple-700";
      case "ready": return "bg-blue-100 text-blue-700";
      case "in_progress": return "bg-amber-100 text-amber-700";
      default: return "bg-gray-100 text-gray-400";
    }
  };

  return (
    <div className="space-y-5">
      <div className="bg-card border rounded-xl overflow-hidden">
        <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <Layers className="w-5 h-5" /> Audit Head Generation
              </h2>
              <p className="text-slate-300 text-xs mt-0.5">Sequential workflow: Generate → Review → Approve → Export</p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={onRefresh} className="text-white hover:bg-white/10 h-8">
                <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
              </Button>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-4">
            <div className="flex-1">
              <div className="w-full bg-slate-600 rounded-full h-2">
                <div className="bg-emerald-400 h-2 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
              </div>
            </div>
            <span className="text-white text-sm font-medium whitespace-nowrap">{completed}/{total} Complete</span>
          </div>

          <div className="flex items-center gap-6 mt-3">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-emerald-400" />
              <span className="text-slate-300 text-[11px]">{completed} Approved</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-purple-400" />
              <span className="text-slate-300 text-[11px]">{validating} Pending</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-gray-400" />
              <span className="text-slate-300 text-[11px]">{total - completed - validating} Remaining</span>
            </div>
          </div>
        </div>

        {(approvableHeads.length > 1 || exportableHeads.length > 1) && (
          <div className="px-6 py-3 bg-slate-50 border-b flex items-center gap-3 flex-wrap">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Bulk Actions:</span>
            {approvableHeads.length > 1 && (
              <Button
                size="sm"
                variant="outline"
                onClick={approveAll}
                disabled={loading || approvalInProgress}
                className="h-7 text-xs border-emerald-300 text-emerald-700 hover:bg-emerald-50"
              >
                {approvalInProgress ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <CheckCircle2 className="w-3 h-3 mr-1" />}
                Approve All ({approvableHeads.length})
              </Button>
            )}
            {exportableHeads.length > 1 && (
              <Button
                size="sm"
                variant="outline"
                onClick={exportAll}
                disabled={loading}
                className="h-7 text-xs border-blue-300 text-blue-700 hover:bg-blue-50"
              >
                <Download className="w-3 h-3 mr-1" /> Export All ({exportableHeads.length})
              </Button>
            )}
          </div>
        )}

        <div className="divide-y">
          {allHeads.map((head: any, i: number) => {
            const canGenerate = head.status === "ready" || head.status === "in_progress";
            const canRegenerate = head.status === "validating" || head.status === "review";
            const canApprove = head.status === "validating" || head.status === "review";
            const canExport = head.status === "approved" || head.status === "exported" || head.status === "completed";
            const isLocked = head.status === "locked";
            const isDone = ["approved", "exported", "completed"].includes(head.status);
            const headExceptions = allExceptions.filter((e: any) => (e.headIndex === head.headIndex || e.headIndex === i) && e.status === "open");
            const isExpanded = expandedHead === i;

            return (
              <div key={head.id} className={cn("transition-colors", isLocked ? "opacity-50" : "")}>
                <div
                  className={cn(
                    "flex items-center gap-4 px-6 py-3.5 cursor-pointer hover:bg-slate-50/80 transition-colors",
                    isDone && "bg-emerald-50/30",
                    canApprove && "bg-purple-50/30",
                    canGenerate && "bg-blue-50/20",
                  )}
                  onClick={() => !isLocked && setExpandedHead(isExpanded ? null : i)}
                >
                  <div className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold shrink-0",
                    isDone ? "bg-emerald-100 text-emerald-700" :
                    canApprove ? "bg-purple-100 text-purple-700" :
                    canGenerate ? "bg-blue-100 text-blue-700" :
                    "bg-gray-100 text-gray-400"
                  )}>
                    {i + 1}
                  </div>

                  <div className="w-5 shrink-0 flex justify-center">
                    {statusIcon(head.status)}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={cn("font-medium text-sm", isLocked && "text-gray-400")}>{head.headName}</p>
                      <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-medium", statusBadgeClass(head.status))}>
                        {statusLabel(head.status)}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      {head.outputType && (
                        <span className="text-[11px] text-slate-400 flex items-center gap-1">
                          <FileText className="w-3 h-3" /> {head.outputType.toUpperCase()}
                        </span>
                      )}
                      {head.generatedAt && (
                        <span className="text-[11px] text-slate-400 flex items-center gap-1">
                          <Clock className="w-3 h-3" /> {new Date(head.generatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      )}
                      {head.exceptionsCount > 0 && (
                        <span className="relative group cursor-pointer">
                          <span className="text-[11px] text-amber-600 flex items-center gap-0.5 font-medium">
                            <AlertTriangle className="w-3 h-3" /> {head.exceptionsCount} exception{head.exceptionsCount > 1 ? "s" : ""}
                          </span>
                          <div className="absolute left-0 top-full mt-1.5 z-50 hidden group-hover:block w-80 max-h-52 overflow-y-auto">
                            <div className="bg-white border border-amber-200 rounded-lg shadow-xl p-3 space-y-2">
                              <p className="text-xs font-semibold text-amber-900 flex items-center gap-1.5 border-b border-amber-100 pb-1.5">
                                <AlertTriangle className="w-3.5 h-3.5" /> {head.exceptionsCount} Exception{head.exceptionsCount > 1 ? "s" : ""}
                              </p>
                              {headExceptions.length > 0 ? headExceptions.slice(0, 8).map((exc: any, idx: number) => (
                                <div key={exc.id || idx} className="flex items-start gap-2">
                                  <span className={cn("mt-0.5 w-2 h-2 rounded-full shrink-0",
                                    exc.severity === "critical" ? "bg-red-500" :
                                    exc.severity === "high" ? "bg-orange-500" :
                                    exc.severity === "medium" ? "bg-amber-500" : "bg-blue-400"
                                  )} />
                                  <div className="min-w-0">
                                    <p className="text-xs font-medium text-slate-800 leading-tight">{exc.title}</p>
                                    {exc.description && <p className="text-[10px] text-slate-500 leading-tight mt-0.5 line-clamp-2">{exc.description}</p>}
                                  </div>
                                </div>
                              )) : (
                                <p className="text-[10px] text-slate-500 italic">Hover for details or check the Exceptions panel.</p>
                              )}
                              {headExceptions.length > 8 && (
                                <p className="text-[10px] text-slate-400 pt-1 border-t border-slate-100">+ {headExceptions.length - 8} more</p>
                              )}
                            </div>
                          </div>
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                    {canGenerate && (
                      <Button size="sm" onClick={() => onGenerate(head.headIndex)} disabled={loading} className="h-8 px-3 bg-blue-600 hover:bg-blue-700 text-white shadow-sm">
                        {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Play className="w-3.5 h-3.5 mr-1.5" /> Generate</>}
                      </Button>
                    )}
                    {canRegenerate && (
                      <Button size="sm" variant="outline" onClick={() => onGenerate(head.headIndex)} disabled={loading} className="h-8 px-3 border-amber-300 text-amber-700 hover:bg-amber-50">
                        {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Redo</>}
                      </Button>
                    )}
                    {canApprove && (
                      <Button size="sm" onClick={() => onApprove(head.headIndex)} disabled={loading} className="h-8 px-3 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm">
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" /> Approve
                      </Button>
                    )}
                    {canExport && (
                      <Button size="sm" variant="outline" onClick={() => onExport(head.headIndex)} className="h-8 px-3 border-slate-300 hover:bg-slate-50">
                        <Download className="w-3.5 h-3.5 mr-1.5" /> Export
                      </Button>
                    )}
                    {!isLocked && (
                      <ChevronDown className={cn("w-4 h-4 text-slate-400 transition-transform", isExpanded && "rotate-180")} />
                    )}
                  </div>
                </div>

                {isExpanded && !isLocked && (
                  <div className="px-6 pb-4 pt-1 bg-slate-50/50 border-t border-dashed">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                      <div className="bg-white rounded-lg p-3 border">
                        <p className="text-slate-400 mb-1">Status</p>
                        <p className="font-medium flex items-center gap-1">{statusIcon(head.status)} {statusLabel(head.status)}</p>
                      </div>
                      <div className="bg-white rounded-lg p-3 border">
                        <p className="text-slate-400 mb-1">Output Format</p>
                        <p className="font-medium flex items-center gap-1"><FileText className="w-3.5 h-3.5 text-blue-500" /> {(head.outputType || "N/A").toUpperCase()}</p>
                      </div>
                      <div className="bg-white rounded-lg p-3 border">
                        <p className="text-slate-400 mb-1">Exceptions</p>
                        <p className={cn("font-medium flex items-center gap-1", head.exceptionsCount > 0 ? "text-amber-600" : "text-emerald-600")}>
                          {head.exceptionsCount > 0 ? <><AlertTriangle className="w-3.5 h-3.5" /> {head.exceptionsCount} found</> : <><CheckCircle2 className="w-3.5 h-3.5" /> None</>}
                        </p>
                      </div>
                      <div className="bg-white rounded-lg p-3 border">
                        <p className="text-slate-400 mb-1">Generated At</p>
                        <p className="font-medium flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-slate-400" /> {head.generatedAt ? new Date(head.generatedAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "Not yet"}
                        </p>
                      </div>
                    </div>
                    {headExceptions.length > 0 && (
                      <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg p-3">
                        <p className="text-xs font-semibold text-amber-800 mb-2 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> Open Exceptions</p>
                        <div className="space-y-1.5">
                          {headExceptions.map((exc: any, idx: number) => (
                            <div key={exc.id || idx} className="flex items-start gap-2 text-xs">
                              <span className={cn("mt-0.5 w-2 h-2 rounded-full shrink-0",
                                exc.severity === "critical" ? "bg-red-500" : exc.severity === "high" ? "bg-orange-500" : exc.severity === "medium" ? "bg-amber-500" : "bg-blue-400"
                              )} />
                              <div className="min-w-0">
                                <span className="font-medium text-slate-700">{exc.title}</span>
                                {exc.description && <span className="text-slate-500 ml-1">— {exc.description}</span>}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ExportStage({ heads, session, exceptions, onExportHead, onExportBundle, loading }: any) {
  const completedHeads = (heads || []).filter((h: any) => ["approved", "exported", "completed"].includes(h.status));
  const openExceptions = (exceptions || []).filter((e: any) => e.status === "open");

  return (
    <div className="space-y-4">
      <div className="bg-card border rounded-xl p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Download className="w-5 h-5 text-primary" /> Export Center
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-blue-50 rounded-lg p-4 text-center">
            <p className="text-3xl font-bold text-blue-700">{completedHeads.length}</p>
            <p className="text-sm text-blue-600">Heads Completed</p>
          </div>
          <div className="bg-amber-50 rounded-lg p-4 text-center">
            <p className="text-3xl font-bold text-amber-700">{openExceptions.length}</p>
            <p className="text-sm text-amber-600">Open Exceptions</p>
          </div>
          <div className="bg-emerald-50 rounded-lg p-4 text-center">
            <p className="text-3xl font-bold text-emerald-700">{(heads || []).length}</p>
            <p className="text-sm text-emerald-600">Total Heads</p>
          </div>
        </div>

        <div className="space-y-2 mb-6">
          <h3 className="text-sm font-semibold">Export by Head</h3>
          {(heads || []).map((head: any) => {
            const canExport = ["approved", "exported", "completed"].includes(head.status);
            return (
              <div key={head.id} className="flex items-center gap-3 p-3 rounded-lg border">
                <div className="flex-1">
                  <p className="text-sm font-medium">{head.headName}</p>
                  <p className="text-xs text-muted-foreground capitalize">{head.status?.replace(/_/g, " ")} • {head.outputType?.toUpperCase()}</p>
                </div>
                <Button size="sm" variant="outline" disabled={!canExport} onClick={() => onExportHead(head.headIndex)}>
                  <Download className="w-3 h-3 mr-1" /> Export
                </Button>
              </div>
            );
          })}
        </div>

        <div className="border-t pt-4">
          <Button size="lg" onClick={onExportBundle} disabled={loading} className="w-full">
            <Download className="w-4 h-4 mr-2" />
            Export Full Bundle (Index + TB + Exceptions + Audit Trail)
          </Button>
        </div>
      </div>

      {openExceptions.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-amber-800 mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> Open Exceptions ({openExceptions.length})
          </h3>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {openExceptions.map((exc: any) => (
              <div key={exc.id} className="p-3 bg-white rounded-lg border border-amber-200">
                <div className="flex items-center gap-2">
                  <span className={cn("px-2 py-0.5 rounded text-xs font-medium",
                    exc.severity === "critical" ? "bg-red-100 text-red-800" :
                    exc.severity === "high" ? "bg-orange-100 text-orange-800" :
                    "bg-yellow-100 text-yellow-800"
                  )}>{exc.severity}</span>
                  <span className="text-sm font-medium">{exc.title}</span>
                </div>
                {exc.description && <p className="text-xs text-muted-foreground mt-1">{exc.description}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
