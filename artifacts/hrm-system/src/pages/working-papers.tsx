import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  Upload, FileSpreadsheet, FileText, CheckCircle2, AlertTriangle, Lock, Unlock,
  ChevronRight, ChevronDown, Download, Loader2, Play, Eye, Shield, X, Plus,
  ArrowLeft, ArrowRight, RefreshCw, AlertCircle, Check, Clock, Settings2,
  FileCheck, Layers, BarChart3, ClipboardCheck, Pencil, Save,
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
        toast({ title: `Variables initialized`, description: `${result.created} created, ${result.updated} updated from extraction` });
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
        body: JSON.stringify({ value: editValue, reason: "Manual edit", editedBy: user?.id }),
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
    if (filter === "missing" && v.finalValue) return false;
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

                            return (
                              <div key={v.id} className={cn("flex items-center gap-3 px-4 py-2", v.isLocked ? "bg-green-50/50" : "hover:bg-muted/10")}>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <p className="text-sm font-medium">{def?.variableLabel || (v.variableName || "").replace(/_/g, " ")}</p>
                                    {isMandatory && <span className="text-[10px] bg-red-100 text-red-700 px-1 rounded font-semibold">REQ</span>}
                                    {v.reviewStatus === "needs_review" && <span className="text-[10px] bg-purple-100 text-purple-700 px-1 rounded">REVIEW</span>}
                                    {def?.standardReference && <span className="text-[10px] text-muted-foreground">{def.standardReference}</span>}
                                  </div>

                                  {isEditing ? (
                                    <div className="mt-1.5 flex gap-2 flex-wrap items-end">
                                      {def?.inputMode === "dropdown" && def?.dropdownOptionsJson ? (
                                        <select className="h-8 text-sm border rounded px-2 w-52" value={editValue} onChange={e => setEditValue(e.target.value)}>
                                          <option value="">-- Select --</option>
                                          {(def.dropdownOptionsJson as string[]).map((opt: string) => <option key={opt} value={opt}>{opt}</option>)}
                                        </select>
                                      ) : def?.inputMode === "toggle" ? (
                                        <select className="h-8 text-sm border rounded px-2 w-32" value={editValue} onChange={e => setEditValue(e.target.value)}>
                                          <option value="">-- Select --</option>
                                          <option value="true">Yes</option>
                                          <option value="false">No</option>
                                        </select>
                                      ) : (
                                        <Input className="h-8 text-sm w-52" value={editValue} onChange={e => setEditValue(e.target.value)} placeholder="Enter value" type={def?.dataType === "number" ? "number" : def?.dataType === "date" ? "date" : "text"} />
                                      )}
                                      <Button size="sm" variant="default" className="h-8" onClick={() => onSave(v.id)}><Save className="w-3 h-3 mr-1" /> Save</Button>
                                      <Button size="sm" variant="ghost" className="h-8" onClick={() => setEditingVar(null)}>Cancel</Button>
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-2">
                                      <p className="text-sm text-muted-foreground">
                                        {def?.inputMode === "toggle" ? (v.finalValue === "true" ? "Yes" : v.finalValue === "false" ? "No" : "—") :
                                          (v.finalValue || v.autoFilledValue || "—")}
                                      </p>
                                      {v.sourceType && <span className="text-[10px] text-muted-foreground italic">({v.sourceType.replace(/_/g, " ")})</span>}
                                    </div>
                                  )}
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                  {confidenceBadge(v.confidence ? Number(v.confidence) : null)}
                                  {v.reviewStatus === "needs_review" && !v.isLocked && (
                                    <button onClick={() => onReview(v.id)} className="px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-100 text-purple-700 hover:bg-purple-200 transition-colors" title="Mark as reviewed">
                                      ✓ Review
                                    </button>
                                  )}
                                  {v.isLocked ? (
                                    <Lock className="w-4 h-4 text-green-600" />
                                  ) : (
                                    <button onClick={() => { setEditingVar(v.id); setEditValue(v.finalValue || ""); setEditReason(""); }}>
                                      <Pencil className="w-4 h-4 text-muted-foreground hover:text-primary" />
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

function GenerationStage({ heads, session, onGenerate, onApprove, onExport, loading, onRefresh }: any) {
  return (
    <div className="space-y-4">
      <div className="bg-card border rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Play className="w-5 h-5 text-primary" /> Head-wise Generation
          </h2>
          <Button variant="outline" size="sm" onClick={onRefresh}><RefreshCw className="w-4 h-4 mr-1" /> Refresh</Button>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 text-sm text-blue-800">
          Complete each head sequentially: Generate → Validate → Approve → Export → Next. Each head unlocks only after the previous one is approved.
        </div>

        <div className="space-y-2">
          {(heads || []).map((head: any, i: number) => {
            const isFirst = i === 0;
            const statusColor = HEAD_COLORS[head.status] || HEAD_COLORS.locked;
            const canGenerate = head.status === "ready";
            const canApprove = head.status === "validating" || head.status === "review";
            const canExport = head.status === "approved" || head.status === "exported" || head.status === "completed";
            const isLocked = head.status === "locked";

            return (
              <div key={head.id} className={cn("flex items-center gap-3 p-4 rounded-xl border-2 transition", statusColor)}>
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold bg-white/60">{i + 1}</div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">{head.headName}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs capitalize">{head.status?.replace(/_/g, " ")}</span>
                    {head.outputType && <span className="text-xs opacity-60">• {head.outputType.toUpperCase()}</span>}
                    {head.exceptionsCount > 0 && (
                      <span className="text-xs text-amber-700 flex items-center gap-0.5"><AlertTriangle className="w-3 h-3" /> {head.exceptionsCount}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {isLocked && <Lock className="w-4 h-4 opacity-40" />}
                  {canGenerate && (
                    <Button size="sm" onClick={() => onGenerate(head.headIndex)} disabled={loading} className="h-8">
                      {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3 mr-1" />} Generate
                    </Button>
                  )}
                  {canApprove && (
                    <Button size="sm" variant="outline" onClick={() => onApprove(head.headIndex)} className="h-8 border-emerald-300 text-emerald-700">
                      <CheckCircle2 className="w-3 h-3 mr-1" /> Approve
                    </Button>
                  )}
                  {canExport && (
                    <Button size="sm" variant="outline" onClick={() => onExport(head.headIndex)} className="h-8">
                      <Download className="w-3 h-3 mr-1" /> Export
                    </Button>
                  )}
                </div>
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
