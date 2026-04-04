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
  ExternalLink, Gauge, Table2, Trash2, Database,
  GitMerge, BarChart2, Cpu, CheckCheck, ListChecks, Network, BookOpen,
} from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL || "/api";

const STAGES = [
  { key: "upload", label: "Upload", icon: Upload },
  { key: "extraction", label: "AI Extraction", icon: Eye },
  { key: "data_sheet", label: "Data Sheet", icon: Database },
  { key: "arranged_data", label: "Arranged Data", icon: Layers },
  { key: "variables", label: "Variables", icon: Settings2 },
  { key: "audit_engine", label: "Audit Engine", icon: Shield },
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
  const [coaData, setCoaData] = useState<any[]>([]);
  const [coaLoading, setCoaLoading] = useState(false);
  const [arrangedData, setArrangedData] = useState<any>(null);
  // Audit Engine state
  const [auditMaster, setAuditMaster] = useState<any>(null);
  const [auditMasterLoading, setAuditMasterLoading] = useState(false);
  const [wpTriggers, setWpTriggers] = useState<any[]>([]);
  const [samplingData, setSamplingData] = useState<any>(null);
  const [analyticsData, setAnalyticsData] = useState<any[]>([]);
  const [controlMatrix, setControlMatrix] = useState<any[]>([]);
  const [evidenceLog, setEvidenceLog] = useState<any[]>([]);
  const [reconResults, setReconResults] = useState<any[]>([]);
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
  const [showExceptionsPanel, setShowExceptionsPanel] = useState(false);
  const [workbookExtracting, setWorkbookExtracting] = useState(false);
  const [workbookReport, setWorkbookReport] = useState<any>(null);
  const [showWorkbookPanel, setShowWorkbookPanel] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [autoChainRunning, setAutoChainRunning] = useState(false);
  const [autoChainCurrentHead, setAutoChainCurrentHead] = useState<number | null>(null);
  const chainStopRef = useRef(false);

  useEffect(() => { fetchSessions(); fetchTeamMembers(); }, []);

  const fetchTeamMembers = async () => {
    try {
      const res = await fetch(`${API_BASE}/working-papers/team-members`, { headers });
      if (res.ok) setTeamMembers(await res.json());
    } catch {}
  };

  useEffect(() => {
    if (activeSession) {
      const validStages = STAGES.map(s => s.key) as string[];
      const sessionStage = activeSession.status || "upload";
      setStage(validStages.includes(sessionStage) ? sessionStage : "upload");
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

  const handleExtractWorkbook = async () => {
    if (!activeSession) return;
    setWorkbookExtracting(true);
    setWorkbookReport(null);
    setShowWorkbookPanel(true);
    try {
      toast({ title: "Smart Import running…", description: "Parsing all sheets, classifying accounts, generating TB/GL and reconciling. This may take 30–60 seconds." });
      const res = await fetch(`${API_BASE}/working-papers/sessions/${activeSession.id}/extract-workbook`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ useAiClassification: true, generateGlTb: true, runRecon: true }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setWorkbookReport(data.report);
        toast({ title: "Smart Import complete", description: data.message });
        await fetchSession(activeSession.id);
        // Auto-fetch COA data after import
        const coaRes = await fetch(`${API_BASE}/working-papers/sessions/${activeSession.id}/coa`, { headers });
        if (coaRes.ok) setCoaData(await coaRes.json());
      } else {
        toast({ title: "Import failed", description: data.error || "Unknown error", variant: "destructive" });
        setWorkbookReport(data.report || null);
      }
    } catch (e: any) {
      toast({ title: "Import failed", description: e.message, variant: "destructive" });
    } finally {
      setWorkbookExtracting(false);
    }
  };

  const fetchCoaData = async () => {
    if (!activeSession) return;
    try {
      setCoaLoading(true);
      const res = await fetch(`${API_BASE}/working-papers/sessions/${activeSession.id}/coa`, { headers });
      if (res.ok) setCoaData(await res.json());
    } catch {} finally { setCoaLoading(false); }
  };

  const populateCoa = async () => {
    if (!activeSession) return;
    try {
      setCoaLoading(true);
      toast({ title: "Populating COA from extracted data…", description: "This may take a moment." });
      const res = await fetch(`${API_BASE}/working-papers/sessions/${activeSession.id}/coa/populate`, {
        method: "POST", headers: { ...headers, "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (res.ok) {
        toast({ title: "COA Populated", description: data.message });
        await fetchCoaData();
        await fetchSession(activeSession.id);
        setStage("data_sheet");
      } else {
        toast({ title: "Populate failed", description: data.error, variant: "destructive" });
      }
    } catch { toast({ title: "Populate failed", variant: "destructive" }); }
    finally { setCoaLoading(false); }
  };

  const updateCoaRow = async (rowId: number, updates: any) => {
    if (!activeSession) return;
    try {
      const res = await fetch(`${API_BASE}/working-papers/sessions/${activeSession.id}/coa/${rowId}`, {
        method: "PATCH", headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        const updated = await res.json();
        setCoaData(prev => prev.map(r => r.id === rowId ? updated : r));
        toast({ title: "Row updated" });
      } else {
        const err = await res.json();
        toast({ title: "Update failed", description: err.error, variant: "destructive" });
      }
    } catch {}
  };

  const addCoaRow = async (row: any) => {
    if (!activeSession) return;
    try {
      const res = await fetch(`${API_BASE}/working-papers/sessions/${activeSession.id}/coa`, {
        method: "POST", headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(row),
      });
      if (res.ok) {
        const inserted = await res.json();
        setCoaData(prev => [...prev, inserted]);
        toast({ title: "Row added" });
      } else {
        const err = await res.json();
        toast({ title: "Add failed", description: err.error, variant: "destructive" });
      }
    } catch {}
  };

  const deleteCoaRow = async (rowId: number) => {
    if (!activeSession) return;
    try {
      const res = await fetch(`${API_BASE}/working-papers/sessions/${activeSession.id}/coa/${rowId}`, {
        method: "DELETE", headers,
      });
      if (res.ok) {
        setCoaData(prev => prev.filter(r => r.id !== rowId));
        toast({ title: "Row deleted" });
      }
    } catch {}
  };

  const validateCoa = async (): Promise<any> => {
    if (!activeSession) return { valid: false, issues: [] };
    try {
      const res = await fetch(`${API_BASE}/working-papers/sessions/${activeSession.id}/coa/validate`, {
        method: "POST", headers: { ...headers, "Content-Type": "application/json" },
      });
      if (res.ok) return await res.json();
    } catch {}
    return { valid: false, issues: ["Validation request failed"] };
  };

  const approveCoa = async () => {
    if (!activeSession) return;
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/working-papers/sessions/${activeSession.id}/coa/approve`, {
        method: "POST", headers: { ...headers, "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (res.ok) {
        toast({ title: "Data Sheet Approved", description: data.message });
        await fetchSession(activeSession.id);
        fetchArrangedData();
        setStage("arranged_data");
      } else {
        toast({ title: "Approval failed", description: data.error, variant: "destructive" });
      }
    } catch { toast({ title: "Approval failed", variant: "destructive" }); }
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

  const fetchAuditMaster = async () => {
    if (!activeSession) return;
    try {
      setAuditMasterLoading(true);
      const res = await fetch(`${API_BASE}/working-papers/sessions/${activeSession.id}/audit-engine`, { headers });
      if (res.ok) setAuditMaster(await res.json());
    } catch {} finally { setAuditMasterLoading(false); }
  };

  const updateAuditMaster = async (updates: any) => {
    if (!activeSession) return;
    try {
      const res = await fetch(`${API_BASE}/working-papers/sessions/${activeSession.id}/audit-engine`, {
        method: "PATCH", headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (res.ok) { setAuditMaster(await res.json()); toast({ title: "Audit engine updated" }); }
    } catch {}
  };

  const autoPopulateAuditMaster = async () => {
    if (!activeSession) return;
    try {
      setAuditMasterLoading(true);
      const res = await fetch(`${API_BASE}/working-papers/sessions/${activeSession.id}/audit-engine/auto-populate`, {
        method: "POST", headers: { ...headers, "Content-Type": "application/json" },
      });
      if (res.ok) {
        const data = await res.json();
        setAuditMaster(data.data);
        toast({ title: "Auto-populated from variables", description: data.message });
      }
    } catch { toast({ title: "Auto-populate failed", variant: "destructive" }); }
    finally { setAuditMasterLoading(false); }
  };

  const fetchWpTriggers = async () => {
    if (!activeSession) return;
    try {
      // Seed if needed, then fetch
      await fetch(`${API_BASE}/working-papers/seed-audit-engine`, { method: "POST", headers: { ...headers, "Content-Type": "application/json" } });
      const res = await fetch(`${API_BASE}/working-papers/sessions/${activeSession.id}/wp-triggers`, { headers });
      if (res.ok) setWpTriggers(await res.json());
    } catch {}
  };

  const evaluateWpTriggers = async () => {
    if (!activeSession) return;
    try {
      const res = await fetch(`${API_BASE}/working-papers/sessions/${activeSession.id}/wp-triggers/evaluate`, {
        method: "POST", headers: { ...headers, "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (res.ok) { toast({ title: "WP Triggers Evaluated", description: data.message }); await fetchWpTriggers(); }
      else toast({ title: "Evaluation failed", description: data.error, variant: "destructive" });
    } catch {}
  };

  const updateWpTrigger = async (wpCode: string, updates: any) => {
    if (!activeSession) return;
    await fetch(`${API_BASE}/working-papers/sessions/${activeSession.id}/wp-triggers/${wpCode}`, {
      method: "PATCH", headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    await fetchWpTriggers();
  };

  const fetchSampling = async () => {
    if (!activeSession) return;
    try {
      const res = await fetch(`${API_BASE}/working-papers/sessions/${activeSession.id}/sampling`, { headers });
      if (res.ok) setSamplingData(await res.json());
    } catch {}
  };

  const fetchAnalytics = async () => {
    if (!activeSession) return;
    try {
      const res = await fetch(`${API_BASE}/working-papers/sessions/${activeSession.id}/analytics`, { headers });
      if (res.ok) setAnalyticsData(await res.json());
    } catch {}
  };

  const fetchControlMatrix = async () => {
    if (!activeSession) return;
    try {
      const res = await fetch(`${API_BASE}/working-papers/sessions/${activeSession.id}/control-matrix`, { headers });
      if (res.ok) setControlMatrix(await res.json());
    } catch {}
  };

  const updateControlMatrix = async (id: number, updates: any) => {
    if (!activeSession) return;
    const res = await fetch(`${API_BASE}/working-papers/sessions/${activeSession.id}/control-matrix/${id}`, {
      method: "PATCH", headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (res.ok) setControlMatrix(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r));
  };

  const addControlRow = async (row: any) => {
    if (!activeSession) return;
    const res = await fetch(`${API_BASE}/working-papers/sessions/${activeSession.id}/control-matrix`, {
      method: "POST", headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(row),
    });
    if (res.ok) { const inserted = await res.json(); setControlMatrix(prev => [...prev, inserted]); toast({ title: "Control added" }); }
  };

  const deleteControlRow = async (id: number) => {
    if (!activeSession) return;
    await fetch(`${API_BASE}/working-papers/sessions/${activeSession.id}/control-matrix/${id}`, { method: "DELETE", headers });
    setControlMatrix(prev => prev.filter(r => r.id !== id));
  };

  const fetchEvidence = async () => {
    if (!activeSession) return;
    try {
      const res = await fetch(`${API_BASE}/working-papers/sessions/${activeSession.id}/evidence`, { headers });
      if (res.ok) setEvidenceLog(await res.json());
    } catch {}
  };

  const addEvidence = async (ev: any) => {
    if (!activeSession) return;
    const res = await fetch(`${API_BASE}/working-papers/sessions/${activeSession.id}/evidence`, {
      method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(ev),
    });
    if (res.ok) { const inserted = await res.json(); setEvidenceLog(prev => [...prev, inserted]); toast({ title: "Evidence logged" }); }
  };

  const updateEvidence = async (id: number, updates: any) => {
    if (!activeSession) return;
    const res = await fetch(`${API_BASE}/working-papers/sessions/${activeSession.id}/evidence/${id}`, {
      method: "PATCH", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(updates),
    });
    if (res.ok) setEvidenceLog(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r));
  };

  const deleteEvidence = async (id: number) => {
    if (!activeSession) return;
    await fetch(`${API_BASE}/working-papers/sessions/${activeSession.id}/evidence/${id}`, { method: "DELETE", headers });
    setEvidenceLog(prev => prev.filter(r => r.id !== id));
  };

  const runRecon = async () => {
    if (!activeSession) return;
    try {
      const res = await fetch(`${API_BASE}/working-papers/sessions/${activeSession.id}/recon/run`, {
        method: "POST", headers: { ...headers, "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (res.ok) {
        setReconResults(data.checks);
        toast({ title: data.allPassed ? "All checks passed ✓" : "Issues found", description: data.summary, variant: data.allPassed ? "default" : "destructive" });
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

  const reviewAllVariables = async () => {
    if (!activeSession) return;
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/working-papers/sessions/${activeSession.id}/variables/review-all`, {
        method: "POST", headers: { ...headers, "Content-Type": "application/json" },
      });
      if (res.ok) {
        const data = await res.json();
        toast({ title: data.message || "All variables marked as reviewed" });
        await fetchVariables();
      }
    } catch {} finally { setLoading(false); }
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

  const stopChain = () => { chainStopRef.current = true; };

  const generateHead = async (startHeadIndex: number) => {
    if (!activeSession) return;
    chainStopRef.current = false;
    setAutoChainRunning(true);
    setLoading(true);
    let hi = startHeadIndex;
    try {
      while (hi <= 11 && !chainStopRef.current) {
        setAutoChainCurrentHead(hi);
        let url = "";
        if (hi === 0) url = `${API_BASE}/working-papers/sessions/${activeSession.id}/generate-tb`;
        else if (hi === 1) url = `${API_BASE}/working-papers/sessions/${activeSession.id}/generate-gl`;
        else url = `${API_BASE}/working-papers/sessions/${activeSession.id}/heads/${hi}/generate`;

        const genRes = await fetch(url, { method: "POST", headers: { ...headers, "Content-Type": "application/json" } });
        if (!genRes.ok) {
          const err = await genRes.json().catch(() => ({ error: "Failed" }));
          toast({ title: `Head ${hi + 1} generation failed`, description: err.error, variant: "destructive" });
          break;
        }
        const appRes = await fetch(`${API_BASE}/working-papers/sessions/${activeSession.id}/heads/${hi}/approve`, {
          method: "POST", headers: { ...headers, "Content-Type": "application/json" },
        });
        if (!appRes.ok) {
          toast({ title: `Head ${hi + 1} generated — approval failed`, variant: "destructive" });
          await fetchSession(activeSession.id);
          break;
        }
        toast({ title: `Head ${hi + 1} approved`, description: hi < 11 ? `Starting head ${hi + 2}…` : "All heads complete!" });
        await fetchSession(activeSession.id);
        await fetchExceptions();
        hi++;
      }
      if (hi > 11 && !chainStopRef.current) {
        toast({ title: "All 12 heads generated & approved", description: "Download your working papers from the panel." });
      }
    } catch (e: any) {
      toast({ title: "Chain interrupted", description: e?.message, variant: "destructive" });
    } finally {
      setLoading(false);
      setAutoChainRunning(false);
      setAutoChainCurrentHead(null);
      await fetchSession(activeSession.id);
      await fetchExceptions();
    }
  };

  const [tbGlProgress, setTbGlProgress] = useState<{
    running: boolean;
    stages: { stage: string; status: "pending" | "ok" | "warn" | "fail"; detail: string }[];
    result: any | null;
  }>({ running: false, stages: [], result: null });

  const generateTbGl = async () => {
    if (!activeSession) return;
    const stageNames = ["Input Extraction", "Trial Balance", "General Ledger", "Reconciliation", "Enforcement Check"];
    setTbGlProgress({
      running: true,
      stages: stageNames.map(s => ({ stage: s, status: "pending", detail: "Waiting..." })),
      result: null,
    });
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/working-papers/sessions/${activeSession.id}/generate-tb-gl`, {
        method: "POST", headers: { ...headers, "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (res.ok) {
        setTbGlProgress({ running: false, stages: data.stages || [], result: data });
        toast({ title: "TB & GL generated — auto-approving", description: "Approving heads 1 & 2, then continuing chain…" });
        await Promise.all([
          fetch(`${API_BASE}/working-papers/sessions/${activeSession.id}/heads/0/approve`, { method: "POST", headers: { ...headers, "Content-Type": "application/json" } }),
          fetch(`${API_BASE}/working-papers/sessions/${activeSession.id}/heads/1/approve`, { method: "POST", headers: { ...headers, "Content-Type": "application/json" } }),
        ]);
        await fetchSession(activeSession.id);
        await fetchExceptions();
        generateHead(2);
      } else {
        setTbGlProgress(prev => ({
          running: false,
          stages: (data.stages || stageNames.map(s => ({ stage: s, status: "pending", detail: "" }))).map((s: any, i: number) =>
            i === (data.stages?.length ?? 0) - 1 ? { ...s, status: "fail" } : s
          ),
          result: null,
        }));
        toast({ title: "Generation failed", description: data.error, variant: "destructive" });
      }
    } catch (e: any) {
      setTbGlProgress(prev => ({ ...prev, running: false }));
      toast({ title: "Generation failed", description: e?.message, variant: "destructive" });
    } finally { setLoading(false); }
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
      } else {
        const err = await res.json();
        toast({ title: "Approval failed", description: err.error, variant: "destructive" });
      }
    } catch { toast({ title: "Approval failed", variant: "destructive" }); }
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
      } else {
        const err = await res.json().catch(() => ({ error: "Export failed" }));
        toast({ title: "Export failed", description: err.error, variant: "destructive" });
      }
    } catch { toast({ title: "Export failed", variant: "destructive" }); }
  };

  const autoProcessAll = async () => {
    if (!activeSession) return;
    try {
      setLoading(true);
      toast({ title: "Auto Processing All Heads", description: "AI is generating, reviewing, and approving all heads sequentially. This may take a few minutes..." });
      const res = await fetch(`${API_BASE}/working-papers/sessions/${activeSession.id}/heads/auto-process-all`, {
        method: "POST", headers: { ...headers, "Content-Type": "application/json" },
      });
      if (res.ok) {
        const data = await res.json();
        toast({ title: "Auto Process Complete", description: data.message });
        await fetchSession(activeSession.id);
        await fetchExceptions();
      } else {
        const err = await res.json();
        toast({ title: "Auto Process Failed", description: err.error, variant: "destructive" });
      }
    } catch { toast({ title: "Auto Process Failed", variant: "destructive" }); }
    finally { setLoading(false); }
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

  const resolveException = async (excId: number, status: string, resolution?: string) => {
    if (!activeSession) return;
    try {
      const res = await fetch(`${API_BASE}/working-papers/sessions/${activeSession.id}/exceptions/${excId}`, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ status, resolution: resolution || `Manually ${status} by user` }),
      });
      if (res.ok) {
        toast({ title: `Exception ${status}` });
        await fetchExceptions();
      } else {
        const err = await res.json();
        toast({ title: "Failed to update exception", description: err.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Failed to update exception", variant: "destructive" });
    }
  };

  const resolveAllExceptions = async () => {
    if (!activeSession) return;
    const openExcs = exceptions.filter((e: any) => e.status === "open");
    if (openExcs.length === 0) return;
    setLoading(true);
    try {
      for (const exc of openExcs) {
        await fetch(`${API_BASE}/working-papers/sessions/${activeSession.id}/exceptions/${exc.id}`, {
          method: "PATCH",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ status: "cleared", resolution: "Bulk cleared by user" }),
        });
      }
      toast({ title: `${openExcs.length} exceptions cleared` });
      await fetchExceptions();
    } catch {
      toast({ title: "Failed to clear exceptions", variant: "destructive" });
    } finally { setLoading(false); }
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
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/30">
        <div className="bg-gradient-to-r from-slate-800 via-slate-900 to-slate-800 text-white">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center backdrop-blur-sm">
                    <Sparkles className="w-5 h-5 text-blue-300" />
                  </div>
                  AI Working Paper Generator
                </h1>
                <p className="text-slate-300 text-xs sm:text-sm mt-1.5">Audit-grade sequential workflow: Upload → Extract → Arrange → Verify → Generate → Export</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-400 bg-white/5 rounded-lg px-3 py-1.5 border border-white/10">
                  <FileCheck className="w-3.5 h-3.5" />
                  <span>{sessions.length} session{sessions.length !== 1 ? "s" : ""}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
          <div className="bg-white border border-slate-200/80 rounded-2xl shadow-sm overflow-hidden">
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50/50 px-5 py-4 border-b border-slate-200/60">
              <h2 className="font-semibold text-slate-900 flex items-center gap-2">
                <div className="w-7 h-7 rounded-md bg-blue-600 flex items-center justify-center">
                  <Plus className="w-4 h-4 text-white" />
                </div>
                New Engagement Session
              </h2>
              <p className="text-xs text-slate-500 mt-1">Fill in client and engagement details to start a new audit session</p>
            </div>
            <div className="p-5 space-y-5">
              <div>
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                  Client Information
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-3">
                  <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
                    <label className="text-xs font-medium text-slate-600">Client / Entity Name <span className="text-red-500">*</span></label>
                    <Input placeholder="e.g. ABC Industries (Pvt.) Ltd." value={newClientName} onChange={e => setNewClientName(e.target.value)} className="h-9" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-600">Entity Type <span className="text-red-500">*</span></label>
                    <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2" value={newEntityType} onChange={e => setNewEntityType(e.target.value)}>
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
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-600">NTN <span className="text-red-500">*</span></label>
                    <Input placeholder="e.g. 1234567-8" value={newNtn} onChange={e => setNewNtn(e.target.value)} className="h-9" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-600">STRN (Sales Tax)</label>
                    <Input placeholder="e.g. 32-00-1234-567-89" value={newStrn} onChange={e => setNewStrn(e.target.value)} className="h-9" />
                  </div>
                </div>
              </div>

              <div className="border-t border-dashed border-slate-200 pt-4">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  Engagement Details
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-600">Engagement Year <span className="text-red-500">*</span></label>
                    <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2" value={newYear} onChange={e => handleYearChange(e.target.value)}>
                      {[2022, 2023, 2024, 2025, 2026, 2027, 2028, 2029, 2030].map(y => (
                        <option key={y} value={String(y)}>{y}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-600">Period Start <span className="text-red-500">*</span></label>
                    <Input type="date" value={newPeriodStart} onChange={e => setNewPeriodStart(e.target.value)} className="h-9" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-600">Period End <span className="text-red-500">*</span></label>
                    <Input type="date" value={newPeriodEnd} onChange={e => setNewPeriodEnd(e.target.value)} className="h-9" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-600">Reporting Framework <span className="text-red-500">*</span></label>
                    <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2" value={newFramework} onChange={e => setNewFramework(e.target.value)}>
                      <option value="IFRS">IFRS (Full)</option>
                      <option value="IFRS for SMEs">IFRS for SMEs</option>
                      <option value="AFRS">AFRS (Accounting Framework)</option>
                      <option value="Fourth Schedule">Fourth Schedule (Companies Act 2017)</option>
                      <option value="Fifth Schedule">Fifth Schedule (Banking/Insurance)</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-600">Engagement Type <span className="text-red-500">*</span></label>
                    <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2" value={newEngagementType} onChange={e => setNewEngagementType(e.target.value)}>
                      <option value="statutory_audit">Statutory Audit</option>
                      <option value="limited_review">Limited Review / Review Engagement</option>
                      <option value="group_audit">Group / Consolidated Audit</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-600">Continuity <span className="text-red-500">*</span></label>
                    <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2" value={newEngagementContinuity} onChange={e => setNewEngagementContinuity(e.target.value)}>
                      <option value="first_time">First Time Engagement</option>
                      <option value="recurring">Recurring (Same Auditor)</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="border-t border-dashed border-slate-200 pt-4">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                  Audit Team & Firm
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-600">Audit Firm Name</label>
                    <Input placeholder="e.g. Alam & Aulakh CA" value={newAuditFirmName} onChange={e => setNewAuditFirmName(e.target.value)} className="h-9" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-600">Audit Firm Logo</label>
                    <div className="flex items-center gap-3 h-9">
                      <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={e => {
                        const f = e.target.files?.[0];
                        if (f) { setNewAuditFirmLogo(f); setLogoPreview(URL.createObjectURL(f)); }
                      }} />
                      <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => logoInputRef.current?.click()}>
                        <Upload className="w-3.5 h-3.5 mr-1.5" /> {newAuditFirmLogo ? "Change" : "Upload"}
                      </Button>
                      {logoPreview && <img src={logoPreview} alt="Logo preview" className="h-8 w-auto rounded border" />}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-600">Preparer</label>
                    <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2" value={newPreparerId} onChange={e => setNewPreparerId(e.target.value)}>
                      <option value="">-- Select Preparer --</option>
                      {teamMembers.map((m: any) => (
                        <option key={m.id} value={m.id}>{m.name}{m.designation ? ` — ${m.designation}` : ""}{m.role ? ` (${m.role.replace(/_/g, " ")})` : ""}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-600">Reviewer</label>
                    <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2" value={newReviewerId} onChange={e => setNewReviewerId(e.target.value)}>
                      <option value="">-- Select Reviewer --</option>
                      {teamMembers.filter((m: any) => ["super_admin", "manager", "partner", "hr_admin"].includes(m.role)).map((m: any) => (
                        <option key={m.id} value={m.id}>{m.name}{m.designation ? ` — ${m.designation}` : ""}{m.role ? ` (${m.role.replace(/_/g, " ")})` : ""}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-600">Approver</label>
                    <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2" value={newApproverId} onChange={e => setNewApproverId(e.target.value)}>
                      <option value="">-- Select Approver --</option>
                      {teamMembers.filter((m: any) => ["super_admin", "partner"].includes(m.role)).map((m: any) => (
                        <option key={m.id} value={m.id}>{m.name}{m.designation ? ` — ${m.designation}` : ""}{m.role ? ` (${m.role.replace(/_/g, " ")})` : ""}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {(newEntityType === "Public Limited (Listed)" || newEntityType === "Government Entity") && (
                <div className="flex items-center gap-2.5 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
                  <div className="w-7 h-7 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                  </div>
                  <span>{newEntityType === "Public Limited (Listed)" ? "Listed entities require EQCR review and enhanced disclosure working papers." : "Government entity engagements follow special reporting requirements."}</span>
                </div>
              )}

              <div className="flex justify-end pt-2">
                <Button onClick={createSession} disabled={loading} size="lg" className="px-8 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-md shadow-blue-200/50">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
                  Create Session
                </Button>
              </div>
            </div>
          </div>

          {sessions.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3 px-1">Existing Sessions ({sessions.length})</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {sessions.map((s: any) => {
                  const statusCls = s.status === "completed" || s.status === "exported" ? "bg-emerald-500" :
                    s.status === "generation" || s.status === "variables" ? "bg-blue-500" :
                    s.status === "upload" || s.status === "draft" ? "bg-slate-400" : "bg-amber-500";
                  return (
                    <div key={s.id} className="group bg-white border border-slate-200/80 rounded-xl p-4 hover:shadow-lg hover:border-blue-200 cursor-pointer transition-all duration-200" onClick={() => fetchSession(s.id)}>
                      <div className="flex items-start gap-3">
                        <div className={cn("w-2 h-2 rounded-full mt-2 shrink-0", statusCls)} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold text-slate-900 group-hover:text-blue-700 transition-colors">{s.clientName}</p>
                            {s.entityType && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium border border-blue-100">{s.entityType}</span>}
                          </div>
                          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                            <span className="text-xs text-slate-500 bg-slate-50 px-2 py-0.5 rounded-md">{s.engagementYear}</span>
                            <span className="text-xs text-slate-500">{s.reportingFramework || "IFRS"}</span>
                            <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-medium capitalize", statusColor(s.status))}>{s.status?.replace(/_/g, " ")}</span>
                          </div>
                          {(s.preparerName || s.reviewerName || s.approverName) && (
                            <div className="flex items-center gap-3 mt-2 flex-wrap">
                              {s.preparerName && <span className="text-[11px] text-slate-400"><span className="font-medium text-slate-600">{s.preparerName}</span></span>}
                              {s.reviewerName && <span className="text-[11px] text-slate-400"><span className="font-medium text-slate-600">{s.reviewerName}</span></span>}
                            </div>
                          )}
                        </div>
                        <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-blue-500 group-hover:translate-x-0.5 transition-all shrink-0 mt-1" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  const stageIndex = STAGES.findIndex(s => s.key === stage);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/30">
      <div className="bg-gradient-to-r from-slate-800 via-slate-900 to-slate-800 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="py-4 sm:py-5">
            <div className="flex items-start gap-3 sm:gap-4">
              <button onClick={() => { setActiveSession(null); setStage("upload"); }} className="mt-0.5 p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors shrink-0">
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-lg sm:text-xl font-bold tracking-tight truncate">{activeSession.clientName}</h1>
                  {activeSession.entityType && <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/15 text-blue-200 font-medium border border-white/10">{activeSession.entityType}</span>}
                </div>
                <div className="flex items-center gap-2 mt-1 flex-wrap text-slate-300 text-xs sm:text-sm">
                  <span className="bg-white/10 px-2 py-0.5 rounded-md">{activeSession.engagementYear}</span>
                  <span>{activeSession.reportingFramework || "IFRS"}</span>
                  {activeSession.periodStart && activeSession.periodEnd && (
                    <span className="hidden sm:inline">{activeSession.periodStart} to {activeSession.periodEnd}</span>
                  )}
                  {activeSession.ntn && <span className="hidden sm:inline">NTN: {activeSession.ntn}</span>}
                </div>
                <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                  {activeSession.auditFirmName && (
                    <div className="flex items-center gap-1.5">
                      {activeSession.auditFirmLogo && <img src={`${API_BASE.replace('/api', '')}${activeSession.auditFirmLogo}`} alt="Firm logo" className="h-5 w-auto rounded" />}
                      <span className="text-[11px] text-slate-400 font-medium">{activeSession.auditFirmName}</span>
                    </div>
                  )}
                  {(activeSession.preparerName || activeSession.reviewerName || activeSession.approverName) && (
                    <div className="hidden sm:flex items-center gap-3">
                      {activeSession.preparerName && <span className="text-[11px] text-slate-400">Prep: <span className="text-slate-300">{activeSession.preparerName}</span></span>}
                      {activeSession.reviewerName && <span className="text-[11px] text-slate-400">Rev: <span className="text-slate-300">{activeSession.reviewerName}</span></span>}
                      {activeSession.approverName && <span className="text-[11px] text-slate-400">App: <span className="text-slate-300">{activeSession.approverName}</span></span>}
                    </div>
                  )}
                </div>
              </div>
              <button onClick={() => { fetchExceptions(); setShowExceptionsPanel(!showExceptionsPanel); }} className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/20 text-amber-200 hover:bg-amber-500/30 transition-colors text-xs font-medium border border-amber-400/20">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Exceptions</span> ({exceptions.filter((e: any) => e.status === "open").length})
              </button>
            </div>
          </div>

          <div className="flex items-center gap-0.5 sm:gap-1 pb-0 overflow-x-auto scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0">
            {STAGES.map((s, i) => {
              const Icon = s.icon;
              const isActive = s.key === stage;
              const isPast = i < stageIndex;
              return (
                <button
                  key={s.key}
                  className={cn(
                    "flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2.5 rounded-t-lg text-xs sm:text-sm font-medium whitespace-nowrap transition-all relative",
                    isActive
                      ? "bg-white text-slate-900 shadow-sm"
                      : isPast
                        ? "text-emerald-300 hover:bg-white/10"
                        : "text-slate-400 hover:bg-white/10",
                  )}
                  onClick={() => {
                    setStage(s.key);
                    if (s.key === "variables" && variables.length === 0) fetchVariables();
                    if (s.key === "arranged_data" && !arrangedData) fetchArrangedData();
                    if (s.key === "data_sheet" && coaData.length === 0) fetchCoaData();
                    if (s.key === "audit_engine" && !auditMaster) { fetchAuditMaster(); fetchWpTriggers(); fetchSampling(); fetchAnalytics(); fetchControlMatrix(); fetchEvidence(); }
                    if (s.key === "generation" || s.key === "export") { fetchSession(activeSession.id); fetchExceptions(); }
                  }}
                >
                  {isPast ? <CheckCircle2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
                  <span className="hidden sm:inline">{s.label}</span>
                  <span className="sm:hidden">{s.label.replace("AI ", "").split(" ")[0]}</span>
                  {isActive && <div className="absolute bottom-0 left-2 right-2 h-0.5 bg-blue-600 rounded-t" />}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {showExceptionsPanel && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-4">
          <div className="bg-white border border-amber-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="bg-gradient-to-r from-amber-50 to-orange-50/50 px-5 py-3 border-b border-amber-200/60 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
                <h3 className="font-semibold text-slate-900">Exception Log</h3>
                <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-medium">{exceptions.filter((e: any) => e.status === "open").length} open</span>
              </div>
              <div className="flex items-center gap-2">
                {exceptions.filter((e: any) => e.status === "open").length > 0 && (
                  <Button variant="outline" size="sm" onClick={resolveAllExceptions} disabled={loading} className="h-7 text-xs border-amber-300 text-amber-700 hover:bg-amber-50">
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Clear All
                  </Button>
                )}
                <button onClick={() => setShowExceptionsPanel(false)} className="text-slate-400 hover:text-slate-600 p-1">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
              {exceptions.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-sm">No exceptions recorded</div>
              ) : (
                exceptions.map((exc: any) => (
                  <div key={exc.id} className={cn("px-5 py-3 flex items-start gap-3 transition-colors", exc.status === "open" ? "bg-white" : "bg-slate-50/50")}>
                    <div className={cn("w-2 h-2 rounded-full mt-1.5 shrink-0", exc.status === "open" ? "bg-amber-500" : "bg-green-500")} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-slate-900">{exc.title}</span>
                        <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium",
                          exc.severity === "high" ? "bg-red-100 text-red-700" :
                          exc.severity === "medium" ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"
                        )}>{exc.severity}</span>
                        {exc.headIndex !== null && exc.headIndex !== undefined && (
                          <span className="text-[10px] text-slate-500">Head {exc.headIndex}</span>
                        )}
                        <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium capitalize",
                          exc.status === "open" ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"
                        )}>{exc.status?.replace(/_/g, " ")}</span>
                      </div>
                      {exc.description && <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{exc.description}</p>}
                      {exc.resolution && <p className="text-xs text-emerald-600 mt-0.5">{exc.resolution}</p>}
                    </div>
                    {exc.status === "open" && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button onClick={() => resolveException(exc.id, "cleared")} className="text-xs px-2 py-1 rounded bg-green-100 text-green-700 hover:bg-green-200 font-medium transition-colors">Clear</button>
                        <button onClick={() => resolveException(exc.id, "override_approved")} className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-700 hover:bg-blue-200 font-medium transition-colors">Override</button>
                        <button onClick={() => resolveException(exc.id, "deferred")} className="text-xs px-2 py-1 rounded bg-slate-100 text-slate-600 hover:bg-slate-200 font-medium transition-colors">Defer</button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5 space-y-5">

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
          onExtractWorkbook={handleExtractWorkbook}
          workbookExtracting={workbookExtracting}
          workbookReport={workbookReport}
          showWorkbookPanel={showWorkbookPanel}
          setShowWorkbookPanel={setShowWorkbookPanel}
        />
      )}

      {stage === "extraction" && (
        <ExtractionStage
          data={extractionData}
          session={activeSession}
          onFetchArranged={() => { fetchCoaData(); setStage("data_sheet"); }}
          onRerun={runExtraction}
          loading={loading}
          confidenceBadge={confidenceBadge}
        />
      )}

      {stage === "data_sheet" && (
        <DataSheetStage
          coaData={coaData}
          loading={coaLoading || loading}
          onPopulate={populateCoa}
          onUpdate={updateCoaRow}
          onAdd={addCoaRow}
          onDelete={deleteCoaRow}
          onValidate={validateCoa}
          onApprove={approveCoa}
          onRefresh={fetchCoaData}
          session={activeSession}
        />
      )}

      {stage === "audit_engine" && (
        <AuditEngineStage
          auditMaster={auditMaster}
          wpTriggers={wpTriggers}
          samplingData={samplingData}
          analyticsData={analyticsData}
          controlMatrix={controlMatrix}
          evidenceLog={evidenceLog}
          reconResults={reconResults}
          loading={auditMasterLoading || loading}
          session={activeSession}
          onUpdateMaster={updateAuditMaster}
          onAutoPopulate={autoPopulateAuditMaster}
          onEvaluateTriggers={evaluateWpTriggers}
          onUpdateTrigger={updateWpTrigger}
          onRefreshTriggers={fetchWpTriggers}
          onRefreshSampling={fetchSampling}
          onRefreshAnalytics={fetchAnalytics}
          onUpdateControl={updateControlMatrix}
          onAddControl={addControlRow}
          onDeleteControl={deleteControlRow}
          onAddEvidence={addEvidence}
          onUpdateEvidence={updateEvidence}
          onDeleteEvidence={deleteEvidence}
          onRunRecon={runRecon}
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
          onReviewAll={reviewAllVariables}
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
          onGenerateTbGl={generateTbGl}
          tbGlProgress={tbGlProgress}
          onApprove={approveHead}
          onExport={exportHead}
          onAutoProcessAll={autoProcessAll}
          onResolveException={resolveException}
          loading={loading}
          onRefresh={() => { fetchSession(activeSession.id); fetchExceptions(); }}
          autoChainRunning={autoChainRunning}
          autoChainCurrentHead={autoChainCurrentHead}
          onStopChain={stopChain}
        />
      )}

      {stage === "export" && (
        <ExportStage
          heads={heads}
          session={activeSession}
          exceptions={exceptions}
          onExportHead={exportHead}
          onExportBundle={exportBundle}
          onResolveException={resolveException}
          onRefresh={() => { fetchSession(activeSession.id); fetchExceptions(); }}
          loading={loading}
        />
      )}

      {exceptions.filter((e: any) => e.status === "open").length > 0 && !showExceptionsPanel && stage !== "generation" && stage !== "export" && (
        <div className="fixed bottom-4 right-4 z-50 cursor-pointer" onClick={() => { fetchExceptions(); setShowExceptionsPanel(true); }}>
          <div className="bg-white border border-amber-200 rounded-xl p-3.5 shadow-xl shadow-amber-100/50 max-w-xs backdrop-blur-sm hover:shadow-amber-200/70 transition-shadow">
            <div className="flex items-center gap-2.5 text-amber-800 text-sm font-medium">
              <div className="w-7 h-7 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
              </div>
              <div>
                <p className="font-semibold text-sm">{exceptions.filter((e: any) => e.status === "open").length} open exceptions</p>
                <p className="text-[11px] text-amber-600/80 font-normal">Click to review & resolve</p>
              </div>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════
// STAGE COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

// ── Workbook Pipeline Panel ───────────────────────────────────────────────────
function WorkbookPipelinePanel({ onExtract, extracting, report, onClose }: any) {
  const stages = [
    { key: "entity_profile", label: "Entity Profile", icon: BookOpen, color: "blue" },
    { key: "coa_master", label: "Chart of Accounts", icon: Database, color: "purple" },
    { key: "fs_extraction", label: "FS Extraction Staging", icon: FileText, color: "indigo" },
    { key: "fs_mapping", label: "FS Line Mapping", icon: GitMerge, color: "violet" },
    { key: "journal_import", label: "Journal Import", icon: ClipboardCheck, color: "emerald" },
    { key: "tb_generation", label: "Trial Balance Generation", icon: BarChart2, color: "teal" },
    { key: "gl_generation", label: "General Ledger", icon: Table2, color: "cyan" },
    { key: "audit_engine_master", label: "Audit Engine Master", icon: Shield, color: "orange" },
    { key: "reconciliation", label: "Reconciliation (4-check)", icon: CheckCheck, color: "green" },
    { key: "wp_index", label: "WP Index & Triggers", icon: ListChecks, color: "amber" },
    { key: "control_matrix", label: "Control Matrix", icon: Network, color: "rose" },
  ];

  const stageStatus = (key: string) => {
    if (!report) return extracting ? "pending" : "idle";
    const s = report.stages[key];
    if (!s) return "skipped";
    return s.status === "ok" ? "ok" : s.status === "error" ? "error" : "exceptions";
  };

  const colorMap: any = {
    blue: "bg-blue-50 text-blue-600 border-blue-200",
    purple: "bg-purple-50 text-purple-600 border-purple-200",
    indigo: "bg-indigo-50 text-indigo-600 border-indigo-200",
    violet: "bg-violet-50 text-violet-600 border-violet-200",
    emerald: "bg-emerald-50 text-emerald-600 border-emerald-200",
    teal: "bg-teal-50 text-teal-600 border-teal-200",
    cyan: "bg-cyan-50 text-cyan-600 border-cyan-200",
    orange: "bg-orange-50 text-orange-600 border-orange-200",
    green: "bg-green-50 text-green-600 border-green-200",
    amber: "bg-amber-50 text-amber-600 border-amber-200",
    rose: "bg-rose-50 text-rose-600 border-rose-200",
  };

  const totalExceptions = report?.summary?.exceptionCount || 0;
  const criticalExceptions = (report?.exceptions || []).filter((e: any) => e.severity === "Critical").length;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
      <div className="bg-gradient-to-r from-violet-50 to-indigo-50/60 px-5 py-4 border-b border-slate-200/60 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-violet-100 flex items-center justify-center">
            <Cpu className="w-4.5 h-4.5 text-violet-600" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900 text-sm">Smart Workbook Import Pipeline</h3>
            <p className="text-xs text-slate-500">AI-first parsing · Auto COA classify · TB/GL generation · Zero-diff reconciliation</p>
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
            <X className="w-4 h-4 text-slate-400" />
          </button>
        )}
      </div>
      <div className="p-5 space-y-4">
        {/* Summary badges */}
        {report && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Accounts Imported", value: report.summary?.totalAccounts || 0, icon: Database, color: "blue" },
              { label: "Journal Lines", value: report.summary?.totalJournals || 0, icon: ClipboardCheck, color: "emerald" },
              { label: "Reconciliation", value: report.summary?.reconStatus || "Pending", icon: CheckCheck, color: criticalExceptions > 0 ? "rose" : "green" },
              { label: "Exceptions", value: totalExceptions, icon: AlertTriangle, color: totalExceptions > 0 ? "amber" : "green" },
            ].map(s => (
              <div key={s.label} className={cn("rounded-xl p-3 border", colorMap[s.color] || "bg-slate-50 border-slate-200")}>
                <p className="text-xl font-bold">{s.value}</p>
                <p className="text-xs mt-0.5 opacity-80">{s.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Stage grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {stages.map(s => {
            const status = stageStatus(s.key);
            const stageData = report?.stages?.[s.key];
            const Icon = s.icon;
            return (
              <div key={s.key} className={cn(
                "flex items-center gap-3 p-3 rounded-xl border text-sm transition-all",
                status === "ok" ? "bg-emerald-50 border-emerald-200" :
                status === "error" ? "bg-red-50 border-red-200" :
                status === "exceptions" ? "bg-amber-50 border-amber-200" :
                status === "skipped" ? "bg-slate-50 border-slate-100 opacity-50" :
                extracting ? "bg-slate-50 border-slate-200 animate-pulse" :
                "bg-slate-50 border-slate-200"
              )}>
                <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border", colorMap[s.color])}>
                  <Icon className="w-3.5 h-3.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-800 text-xs truncate">{s.label}</p>
                  {stageData && (
                    <p className="text-[11px] text-slate-500">
                      {stageData.count !== undefined && `${stageData.count} rows`}
                      {stageData.exceptions !== undefined && stageData.exceptions > 0 && ` · ${stageData.exceptions} exceptions`}
                      {stageData.message && ` · ${stageData.message}`}
                    </p>
                  )}
                </div>
                <div className="shrink-0">
                  {status === "ok" && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                  {status === "error" && <AlertCircle className="w-4 h-4 text-red-500" />}
                  {status === "exceptions" && <AlertTriangle className="w-4 h-4 text-amber-500" />}
                  {status === "skipped" && <span className="text-[10px] text-slate-400 font-medium">SKIP</span>}
                  {(status === "pending" || status === "idle") && extracting && <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />}
                </div>
              </div>
            );
          })}
        </div>

        {/* Exception log */}
        {report?.exceptions?.length > 0 && (
          <div className="border border-amber-200 bg-amber-50 rounded-xl p-4">
            <h4 className="text-xs font-semibold text-amber-800 mb-2 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" /> {report.exceptions.length} Exception{report.exceptions.length > 1 ? "s" : ""} Flagged for Review
            </h4>
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {report.exceptions.map((ex: any, i: number) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <span className={cn(
                    "shrink-0 font-semibold px-1.5 py-0.5 rounded text-[10px]",
                    ex.severity === "Critical" ? "bg-red-100 text-red-700" :
                    ex.severity === "High" ? "bg-orange-100 text-orange-700" :
                    ex.severity === "Medium" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"
                  )}>{ex.severity}</span>
                  <span className="text-slate-600"><span className="font-medium">{ex.source}</span> → {ex.item}: {ex.issue}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TB balance summary */}
        {report?.summary?.tbDebitTotal > 0 && (
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center gap-6">
            <div className="text-center">
              <p className="text-[11px] text-slate-500">TB Debit Total</p>
              <p className="font-bold text-slate-900 text-sm">{Number(report.summary.tbDebitTotal).toLocaleString()}</p>
            </div>
            <div className="w-px h-8 bg-slate-200" />
            <div className="text-center">
              <p className="text-[11px] text-slate-500">TB Credit Total</p>
              <p className="font-bold text-slate-900 text-sm">{Number(report.summary.tbCreditTotal).toLocaleString()}</p>
            </div>
            <div className="w-px h-8 bg-slate-200" />
            <div className="text-center">
              <p className="text-[11px] text-slate-500">Difference</p>
              <p className={cn("font-bold text-sm", Math.abs((report.summary.tbDebitTotal || 0) - (report.summary.tbCreditTotal || 0)) < 1 ? "text-emerald-600" : "text-red-600")}>
                {Math.abs((report.summary.tbDebitTotal || 0) - (report.summary.tbCreditTotal || 0)).toLocaleString()}
              </p>
            </div>
            <div className="flex-1 text-right">
              {Math.abs((report.summary.tbDebitTotal || 0) - (report.summary.tbCreditTotal || 0)) < 1
                ? <span className="inline-flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full font-medium"><CheckCircle2 className="w-3 h-3" /> Balanced</span>
                : <span className="inline-flex items-center gap-1 text-xs text-red-700 bg-red-50 border border-red-200 px-2.5 py-1 rounded-full font-medium"><AlertCircle className="w-3 h-3" /> Out of Balance</span>
              }
            </div>
          </div>
        )}

        {/* Action button */}
        <div className="flex items-center justify-between pt-1">
          <p className="text-xs text-slate-500">
            {!report ? "Upload an Excel workbook then run Smart Import to auto-populate all backend sheets." : `Pipeline complete · ${Object.keys(report.stages).length} stages processed`}
          </p>
          <Button
            onClick={onExtract}
            disabled={extracting}
            size="sm"
            className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 shadow-sm text-white"
          >
            {extracting
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> Running Pipeline…</>
              : <><Zap className="w-3.5 h-3.5 mr-1.5" />{report ? "Re-run Import" : "Run Smart Import"}</>
            }
          </Button>
        </div>
      </div>
    </div>
  );
}

function UploadStage({ files, setFiles, uploadedFiles, fileInputRef, onFileAdd, onUpload, onNext, loading, validateFile, onExtractWorkbook, workbookExtracting, workbookReport, showWorkbookPanel, setShowWorkbookPanel }: any) {
  const [dragActive, setDragActive] = useState(false);
  const hasExcel = uploadedFiles.some((f: any) => {
    const ext = (f.originalName || "").split(".").pop()?.toLowerCase();
    return ext === "xlsx" || ext === "xls" || ext === "xlsm";
  });
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
            <Upload className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-900">{files.length}</p>
            <p className="text-xs text-slate-500">Queued</p>
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-900">{uploadedFiles.length}</p>
            <p className="text-xs text-slate-500">Uploaded</p>
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center shrink-0">
            <FileText className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-900">{uploadedFiles.filter((f: any) => f.format === "xlsx" || f.format === "xls").length}</p>
            <p className="text-xs text-slate-500">Excel Files</p>
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50/50 px-5 py-4 border-b border-slate-200/60">
          <h2 className="font-semibold text-slate-900 flex items-center gap-2">
            <Upload className="w-5 h-5 text-blue-600" /> Upload Documents
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">Financial Statements / TB / GL / Bank Statements require Excel (.xlsx/.xls). Tax Returns / Notices require PDF.</p>
        </div>
        <div className="p-5 space-y-5">
          <div
            className={cn(
              "border-2 border-dashed rounded-xl p-8 sm:p-12 text-center cursor-pointer transition-all duration-200",
              dragActive ? "border-blue-400 bg-blue-50/50 scale-[1.01]" : "border-slate-200 hover:border-blue-300 hover:bg-blue-50/20"
            )}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={() => setDragActive(false)}
            onDrop={e => { e.preventDefault(); setDragActive(false); const dt = e.dataTransfer.files; if (dt.length) { const arr = Array.from(dt).map(f => ({ file: f, category: "other" })); setFiles((p: any) => [...p, ...arr]); } }}
          >
            <div className={cn("w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center transition-colors", dragActive ? "bg-blue-100" : "bg-slate-100")}>
              <Upload className={cn("w-7 h-7 transition-colors", dragActive ? "text-blue-600" : "text-slate-400")} />
            </div>
            <p className="font-medium text-slate-700">Drop files here or <span className="text-blue-600 underline underline-offset-2">browse</span></p>
            <p className="text-xs text-slate-400 mt-1.5">Accepted: .xlsx, .xls, .pdf, .jpg, .png, .webp</p>
            <input ref={fileInputRef} type="file" multiple accept=".xlsx,.xls,.pdf,.jpg,.jpeg,.png,.webp" onChange={onFileAdd} className="hidden" />
          </div>

          {files.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900">Files to Upload ({files.length})</h3>
                <Button onClick={onUpload} disabled={loading} size="sm" className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-sm">
                  {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Upload className="w-3.5 h-3.5 mr-1.5" />}
                  Upload {files.length} File{files.length > 1 ? "s" : ""}
                </Button>
              </div>
              <div className="space-y-2">
                {files.map((uf: any, i: number) => {
                  const err = validateFile(uf.file, uf.category);
                  const ext = uf.file.name.split(".").pop()?.toLowerCase();
                  return (
                    <div key={i} className={cn("flex items-center gap-3 p-3 rounded-xl border transition-colors", err ? "bg-red-50 border-red-200" : "bg-slate-50/50 border-slate-200 hover:bg-slate-50")}>
                      <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center shrink-0 text-[10px] font-bold uppercase",
                        ext === "pdf" ? "bg-red-100 text-red-700" : ext === "xlsx" || ext === "xls" ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-600"
                      )}>{ext}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">{uf.file.name}</p>
                        <p className="text-xs text-slate-400">{(uf.file.size / 1024).toFixed(0)} KB</p>
                        {err && <p className="text-xs text-red-600 mt-0.5 font-medium">{err}</p>}
                      </div>
                      <select
                        className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-slate-700 focus:ring-2 focus:ring-blue-200 focus:border-blue-400 max-w-[160px] sm:max-w-none"
                        value={uf.category}
                        onChange={e => { const updated = [...files]; updated[i].category = e.target.value; setFiles(updated); }}
                      >
                        {FILE_CATEGORIES.map(c => (
                          <option key={c.value} value={c.value}>{c.label} ({c.format})</option>
                        ))}
                      </select>
                      <button onClick={() => setFiles((p: any) => p.filter((_: any, j: number) => j !== i))} className="p-1.5 rounded-lg hover:bg-red-50 transition-colors shrink-0">
                        <X className="w-4 h-4 text-slate-400 hover:text-red-500" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {uploadedFiles.length > 0 && (
            <div className="border-t border-slate-200 pt-5">
              <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Uploaded Files ({uploadedFiles.length})
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {uploadedFiles.map((f: any) => {
                  const ext = (f.originalName || "").split(".").pop()?.toLowerCase();
                  return (
                    <div key={f.id} className="flex items-center gap-2.5 p-2.5 rounded-xl bg-emerald-50/50 border border-emerald-100 text-sm">
                      <div className={cn("w-8 h-8 rounded-md flex items-center justify-center shrink-0 text-[9px] font-bold uppercase",
                        ext === "pdf" ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"
                      )}>{ext}</div>
                      <div className="flex-1 min-w-0">
                        <span className="truncate block text-sm font-medium text-slate-800">{f.originalName}</span>
                        <span className="text-[11px] text-slate-500 capitalize">{f.category?.replace(/_/g, " ")}</span>
                      </div>
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Smart Workbook Import Panel — shown when Excel file is uploaded or when panel is active */}
      {(hasExcel || showWorkbookPanel) && (
        <WorkbookPipelinePanel
          onExtract={onExtractWorkbook}
          extracting={workbookExtracting}
          report={workbookReport}
          onClose={workbookReport || workbookExtracting ? undefined : () => setShowWorkbookPanel(false)}
        />
      )}

      {/* Show "Smart Import" button if Excel exists but panel not shown yet */}
      {hasExcel && !showWorkbookPanel && (
        <div className="bg-gradient-to-r from-violet-50 to-indigo-50 border border-violet-200 rounded-xl p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center shrink-0">
              <Zap className="w-4 h-4 text-violet-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">Excel workbook detected</p>
              <p className="text-xs text-slate-500">Run Smart Import to auto-extract all sheets, classify accounts, build TB/GL and reconcile.</p>
            </div>
          </div>
          <Button
            onClick={() => { setShowWorkbookPanel(true); onExtractWorkbook(); }}
            size="sm"
            className="shrink-0 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white shadow-sm"
          >
            <Zap className="w-3.5 h-3.5 mr-1.5" /> Smart Import
          </Button>
        </div>
      )}

      {uploadedFiles.length > 0 && (
        <div className="flex justify-end">
          <Button onClick={onNext} disabled={loading} size="lg" className="px-6 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-md shadow-blue-200/50">
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Sparkles className="w-4 h-4 mr-2" />}
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
    <div className="space-y-5">
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { label: "Files Processed", value: stats.files, icon: FileText, color: "blue" },
            { label: "Pages Scanned", value: stats.pages, icon: Layers, color: "purple" },
            { label: "Sheets Parsed", value: stats.sheets, icon: ClipboardCheck, color: "emerald" },
          ].map(s => (
            <div key={s.label} className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3">
              <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center shrink-0",
                s.color === "blue" ? "bg-blue-50" : s.color === "purple" ? "bg-purple-50" : "bg-emerald-50"
              )}>
                <s.icon className={cn("w-5 h-5",
                  s.color === "blue" ? "text-blue-600" : s.color === "purple" ? "text-purple-600" : "text-emerald-600"
                )} />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900">{s.value}</p>
                <p className="text-xs text-slate-500">{s.label}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-purple-50 to-blue-50/50 px-5 py-4 border-b border-slate-200/60 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="font-semibold text-slate-900 flex items-center gap-2">
              <Bot className="w-5 h-5 text-purple-600" /> AI Extraction Results
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">Review AI-extracted data points and confidence levels</p>
          </div>
          <Button variant="outline" size="sm" onClick={onRerun} disabled={loading} className="self-start">
            <RefreshCw className={cn("w-3.5 h-3.5 mr-1.5", loading && "animate-spin")} /> Re-run Extraction
          </Button>
        </div>

        <div className="p-5">
          {extractionData ? (
            <div className="space-y-4">
              {extractionData.entity && (
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                  <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                    Entity Profile
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2.5">
                    {Object.entries(extractionData.entity).filter(([, v]) => v && typeof v !== "object").map(([k, v]) => (
                      <div key={k} className="flex items-baseline gap-1.5">
                        <span className="text-xs text-slate-500 capitalize shrink-0">{k.replace(/_/g, " ")}:</span>
                        <span className="text-sm font-medium text-slate-900 truncate">{String(v)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {extractionData.confidence_scores && (
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                  <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    Confidence Scores
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {Object.entries(extractionData.confidence_scores).map(([k, v]) => {
                      const n = Number(v);
                      return (
                        <div key={k} className="flex items-center gap-3 bg-white rounded-lg p-2.5 border border-slate-100">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-slate-500 capitalize truncate">{k.replace(/_/g, " ")}</p>
                            <div className="w-full h-1.5 bg-slate-200 rounded-full mt-1.5 overflow-hidden">
                              <div className={cn("h-full rounded-full transition-all", n >= 85 ? "bg-emerald-500" : n >= 70 ? "bg-amber-500" : "bg-red-500")} style={{ width: `${Math.min(n, 100)}%` }} />
                            </div>
                          </div>
                          {confidenceBadge(n)}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {extractionData.flags && extractionData.flags.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <h3 className="text-xs font-semibold text-amber-800 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" /> Flags & Warnings ({extractionData.flags.length})
                  </h3>
                  <ul className="space-y-1.5">
                    {extractionData.flags.map((f: string, i: number) => (
                      <li key={i} className="text-sm text-amber-800 flex items-start gap-2.5 bg-white/60 rounded-lg p-2.5 border border-amber-100">
                        <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-amber-500" /> {f}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="w-16 h-16 rounded-2xl bg-slate-100 mx-auto mb-4 flex items-center justify-center">
                <Eye className="w-8 h-8 text-slate-300" />
              </div>
              <p className="text-slate-500 font-medium">No extraction data yet</p>
              <p className="text-xs text-slate-400 mt-1">Go back to Upload stage and run AI Extraction</p>
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={onFetchArranged} size="lg" className="px-6 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 shadow-md shadow-indigo-200/50 gap-2">
          <Database className="w-4 h-4" /> Proceed to Data Sheet <ArrowRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

function DataSheetStage({ coaData, loading, onPopulate, onUpdate, onDelete, onAdd, onValidate, onApprove, onRefresh, session }: any) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState<any>({ accountCode: "", accountName: "", accountType: "Asset", normalBalance: "Debit", openingBalance: "0", debitTotal: "0", creditTotal: "0", materialityTag: "Medium", riskTag: "Medium", dataSource: "Manual" });
  const [validation, setValidation] = useState<any>(null);
  const [savingId, setSavingId] = useState<number | null>(null);

  const totalDebit = coaData.reduce((s: number, r: any) => s + (Number(r.closingBalance) > 0 ? Number(r.closingBalance) : 0), 0);
  const totalCredit = coaData.reduce((s: number, r: any) => s + (Number(r.closingBalance) < 0 ? Math.abs(Number(r.closingBalance)) : 0), 0);
  const difference = Math.abs(totalDebit - totalCredit);
  const isBalanced = difference < 1;

  const handleValidate = async () => {
    const result = await onValidate();
    setValidation(result);
  };

  const startEdit = (row: any) => {
    setEditingId(row.id);
    setEditForm({ ...row });
    setShowAddForm(false);
  };

  const saveEdit = async () => {
    if (!editingId) return;
    setSavingId(editingId);
    await onUpdate(editingId, editForm);
    setEditingId(null);
    setSavingId(null);
  };

  const handleAddRow = async () => {
    const ob = Number(addForm.openingBalance || 0);
    const dr = Number(addForm.debitTotal || 0);
    const cr = Number(addForm.creditTotal || 0);
    await onAdd({ ...addForm, openingBalance: ob, debitTotal: dr, creditTotal: cr });
    setShowAddForm(false);
    setAddForm({ accountCode: "", accountName: "", accountType: "Asset", normalBalance: "Debit", openingBalance: "0", debitTotal: "0", creditTotal: "0", materialityTag: "Medium", riskTag: "Medium", dataSource: "Manual" });
  };

  const fmt = (v: any) => {
    const n = Number(v || 0);
    if (isNaN(n)) return "0";
    return n.toLocaleString("en-PK", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  };

  const TYPE_OPTIONS = ["Asset", "Liability", "Equity", "Revenue", "Expense"];
  const MAT_OPTIONS = ["High", "Medium", "Low"];
  const RISK_OPTIONS = ["High", "Medium", "Low"];
  const CF_OPTIONS = ["Operating", "Investing", "Financing"];
  const TAX_OPTIONS = ["Normal", "Disallowable", "Capital"];

  const typeColor = (t: string) => {
    if (t === "Asset") return "bg-blue-50 text-blue-700";
    if (t === "Liability") return "bg-orange-50 text-orange-700";
    if (t === "Equity") return "bg-purple-50 text-purple-700";
    if (t === "Revenue") return "bg-emerald-50 text-emerald-700";
    if (t === "Expense") return "bg-red-50 text-red-700";
    return "bg-gray-50 text-gray-600";
  };

  const riskColor = (r: string) => r === "High" ? "text-red-600 font-semibold" : r === "Medium" ? "text-amber-600" : "text-green-600";
  const matColor = (m: string) => m === "High" ? "bg-red-100 text-red-700" : m === "Medium" ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700";

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0"><Database className="w-4.5 h-4.5 text-indigo-600" /></div>
          <div><p className="text-xl font-bold text-slate-900">{coaData.length}</p><p className="text-[11px] text-slate-500">COA Accounts</p></div>
        </div>
        <div className={cn("border rounded-xl p-4 flex items-center gap-3", isBalanced ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200")}>
          <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center shrink-0", isBalanced ? "bg-emerald-100" : "bg-red-100")}>
            {isBalanced ? <CheckCircle2 className="w-4.5 h-4.5 text-emerald-600" /> : <AlertTriangle className="w-4.5 h-4.5 text-red-600" />}
          </div>
          <div><p className={cn("text-sm font-bold", isBalanced ? "text-emerald-800" : "text-red-800")}>{isBalanced ? "Balanced ✓" : `Diff: ${fmt(difference)}`}</p><p className="text-[11px] text-slate-500">TB Status</p></div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center shrink-0"><ArrowRight className="w-4.5 h-4.5 text-blue-600" /></div>
          <div><p className="text-sm font-bold text-slate-900">{fmt(totalDebit)}</p><p className="text-[11px] text-slate-500">Total Debit (Dr)</p></div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center shrink-0"><ArrowLeft className="w-4.5 h-4.5 text-amber-600" /></div>
          <div><p className="text-sm font-bold text-slate-900">{fmt(totalCredit)}</p><p className="text-[11px] text-slate-500">Total Credit (Cr)</p></div>
        </div>
      </div>

      {/* Validation result */}
      {validation && (
        <div className={cn("border rounded-xl p-4", validation.valid ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200")}>
          <div className="flex items-center gap-2 mb-2">
            {validation.valid ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertTriangle className="w-4 h-4 text-amber-600" />}
            <span className={cn("text-sm font-semibold", validation.valid ? "text-emerald-800" : "text-amber-800")}>
              {validation.valid ? "Validation Passed — TB is balanced and complete" : `${validation.issues?.length} issues found`}
            </span>
          </div>
          {(validation.issues || []).slice(0, 5).map((issue: string, i: number) => (
            <p key={i} className="text-xs text-amber-700 ml-6">• {issue}</p>
          ))}
        </div>
      )}

      {/* Main table card */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-indigo-50 to-purple-50/40 px-5 py-4 border-b border-slate-200/60 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-semibold text-slate-900 flex items-center gap-2"><Table2 className="w-5 h-5 text-indigo-600" /> MASTER COA ENGINE — Data Sheet</h2>
            <p className="text-xs text-slate-500 mt-0.5">Edit accounts, balances and audit attributes. This drives the complete TB, GL and Working Papers generation.</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading} className="h-8 text-xs"><RefreshCw className={cn("w-3.5 h-3.5 mr-1", loading && "animate-spin")} />Refresh</Button>
            <Button variant="outline" size="sm" onClick={handleValidate} disabled={loading} className="h-8 text-xs border-blue-200 text-blue-700 hover:bg-blue-50"><CheckCircle2 className="w-3.5 h-3.5 mr-1" />Validate TB</Button>
            <Button variant="outline" size="sm" onClick={onPopulate} disabled={loading} className="h-8 text-xs border-indigo-200 text-indigo-700 hover:bg-indigo-50"><Sparkles className="w-3.5 h-3.5 mr-1" />{coaData.length > 0 ? "Re-populate" : "Populate from AI"}</Button>
            <Button size="sm" onClick={() => { setShowAddForm(true); setEditingId(null); }} disabled={loading} className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700"><Plus className="w-3.5 h-3.5 mr-1" />Add Row</Button>
          </div>
        </div>

        {coaData.length === 0 && !loading ? (
          <div className="py-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-indigo-50 mx-auto mb-4 flex items-center justify-center"><Database className="w-8 h-8 text-indigo-400" /></div>
            <h3 className="text-slate-800 font-semibold text-lg mb-1">No COA Data Yet</h3>
            <p className="text-slate-500 text-sm mb-6 max-w-md mx-auto">Click "Populate from AI" to auto-extract accounts from your uploaded documents, or add rows manually.</p>
            <Button onClick={onPopulate} className="bg-indigo-600 hover:bg-indigo-700 gap-2"><Sparkles className="w-4 h-4" />Populate from AI / Extracted Data</Button>
          </div>
        ) : loading && coaData.length === 0 ? (
          <div className="py-16 text-center"><Loader2 className="w-8 h-8 animate-spin text-indigo-600 mx-auto" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse min-w-[1200px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left px-3 py-2.5 font-semibold text-slate-600 sticky left-0 bg-slate-50 z-10 min-w-[80px]">Code</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-slate-600 min-w-[200px]">Account Name</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-slate-600 min-w-[90px]">Type</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-slate-600 min-w-[60px]">Dr/Cr</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-slate-600 min-w-[80px]">FS Head</th>
                  <th className="text-right px-3 py-2.5 font-semibold text-slate-600 min-w-[110px]">Opening Bal</th>
                  <th className="text-right px-3 py-2.5 font-semibold text-slate-600 min-w-[110px]">Debit (Dr)</th>
                  <th className="text-right px-3 py-2.5 font-semibold text-slate-600 min-w-[110px]">Credit (Cr)</th>
                  <th className="text-right px-3 py-2.5 font-semibold text-slate-600 bg-slate-100 min-w-[110px]">Closing Bal</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-slate-600 min-w-[70px]">Matl.</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-slate-600 min-w-[60px]">Risk</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-slate-600 min-w-[80px]">Tax</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-slate-600 min-w-[60px]">Src</th>
                  <th className="text-right px-3 py-2.5 font-semibold text-slate-600 min-w-[55px]">Conf%</th>
                  <th className="text-center px-3 py-2.5 font-semibold text-slate-600 min-w-[80px]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {/* Add row form */}
                {showAddForm && (
                  <tr className="bg-emerald-50 border-b-2 border-emerald-200">
                    <td className="px-2 py-2 sticky left-0 bg-emerald-50 z-10"><input className="w-full border border-slate-300 rounded px-1.5 py-1 text-xs" placeholder="1000" value={addForm.accountCode} onChange={e => setAddForm((p: any) => ({ ...p, accountCode: e.target.value }))} /></td>
                    <td className="px-2 py-2"><input className="w-full border border-slate-300 rounded px-1.5 py-1 text-xs" placeholder="Account Name" value={addForm.accountName} onChange={e => setAddForm((p: any) => ({ ...p, accountName: e.target.value }))} /></td>
                    <td className="px-2 py-2"><select className="w-full border border-slate-300 rounded px-1 py-1 text-xs" value={addForm.accountType} onChange={e => setAddForm((p: any) => ({ ...p, accountType: e.target.value, normalBalance: ["Asset","Expense"].includes(e.target.value) ? "Debit" : "Credit" }))}>{TYPE_OPTIONS.map(o => <option key={o}>{o}</option>)}</select></td>
                    <td className="px-2 py-2"><select className="w-full border border-slate-300 rounded px-1 py-1 text-xs" value={addForm.normalBalance} onChange={e => setAddForm((p: any) => ({ ...p, normalBalance: e.target.value }))}><option>Debit</option><option>Credit</option></select></td>
                    <td className="px-2 py-2"><input className="w-full border border-slate-300 rounded px-1.5 py-1 text-xs" placeholder="Assets" value={addForm.fsHead || ""} onChange={e => setAddForm((p: any) => ({ ...p, fsHead: e.target.value }))} /></td>
                    <td className="px-2 py-2"><input type="number" className="w-full border border-slate-300 rounded px-1.5 py-1 text-xs text-right" value={addForm.openingBalance} onChange={e => setAddForm((p: any) => ({ ...p, openingBalance: e.target.value }))} /></td>
                    <td className="px-2 py-2"><input type="number" className="w-full border border-slate-300 rounded px-1.5 py-1 text-xs text-right" value={addForm.debitTotal} onChange={e => setAddForm((p: any) => ({ ...p, debitTotal: e.target.value }))} /></td>
                    <td className="px-2 py-2"><input type="number" className="w-full border border-slate-300 rounded px-1.5 py-1 text-xs text-right" value={addForm.creditTotal} onChange={e => setAddForm((p: any) => ({ ...p, creditTotal: e.target.value }))} /></td>
                    <td className="px-2 py-2 bg-emerald-100 text-right font-mono text-xs font-semibold">{fmt(Number(addForm.openingBalance||0)+Number(addForm.debitTotal||0)-Number(addForm.creditTotal||0))}</td>
                    <td className="px-2 py-2"><select className="w-full border border-slate-300 rounded px-1 py-1 text-xs" value={addForm.materialityTag} onChange={e => setAddForm((p: any) => ({ ...p, materialityTag: e.target.value }))}>{MAT_OPTIONS.map(o => <option key={o}>{o}</option>)}</select></td>
                    <td className="px-2 py-2"><select className="w-full border border-slate-300 rounded px-1 py-1 text-xs" value={addForm.riskTag} onChange={e => setAddForm((p: any) => ({ ...p, riskTag: e.target.value }))}>{RISK_OPTIONS.map(o => <option key={o}>{o}</option>)}</select></td>
                    <td className="px-2 py-2"><select className="w-full border border-slate-300 rounded px-1 py-1 text-xs" value={addForm.taxTreatment || ""} onChange={e => setAddForm((p: any) => ({ ...p, taxTreatment: e.target.value }))}><option value="">—</option>{TAX_OPTIONS.map(o => <option key={o}>{o}</option>)}</select></td>
                    <td className="px-2 py-2"><input className="w-full border border-slate-300 rounded px-1.5 py-1 text-xs" value={addForm.dataSource} onChange={e => setAddForm((p: any) => ({ ...p, dataSource: e.target.value }))} /></td>
                    <td className="px-2 py-2"><input type="number" className="w-full border border-slate-300 rounded px-1.5 py-1 text-xs text-right" value={addForm.confidenceScore || "100"} onChange={e => setAddForm((p: any) => ({ ...p, confidenceScore: e.target.value }))} /></td>
                    <td className="px-2 py-2 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={handleAddRow} className="px-2 py-1 rounded bg-emerald-600 text-white text-[10px] font-medium hover:bg-emerald-700"><Check className="w-3 h-3" /></button>
                        <button onClick={() => setShowAddForm(false)} className="px-2 py-1 rounded bg-slate-200 text-slate-600 text-[10px] font-medium hover:bg-slate-300"><X className="w-3 h-3" /></button>
                      </div>
                    </td>
                  </tr>
                )}

                {coaData.map((row: any) => (
                  editingId === row.id ? (
                    <tr key={row.id} className="bg-blue-50 border-b-2 border-blue-200">
                      <td className="px-2 py-2 sticky left-0 bg-blue-50 z-10"><input className="w-full border border-blue-300 rounded px-1.5 py-1 text-xs font-mono" value={editForm.accountCode || ""} onChange={e => setEditForm((p: any) => ({ ...p, accountCode: e.target.value }))} /></td>
                      <td className="px-2 py-2"><input className="w-full border border-blue-300 rounded px-1.5 py-1 text-xs" value={editForm.accountName || ""} onChange={e => setEditForm((p: any) => ({ ...p, accountName: e.target.value }))} /></td>
                      <td className="px-2 py-2"><select className="w-full border border-blue-300 rounded px-1 py-1 text-xs" value={editForm.accountType || "Asset"} onChange={e => setEditForm((p: any) => ({ ...p, accountType: e.target.value, normalBalance: ["Asset","Expense"].includes(e.target.value) ? "Debit" : "Credit" }))}>{TYPE_OPTIONS.map(o => <option key={o}>{o}</option>)}</select></td>
                      <td className="px-2 py-2"><select className="w-full border border-blue-300 rounded px-1 py-1 text-xs" value={editForm.normalBalance || "Debit"} onChange={e => setEditForm((p: any) => ({ ...p, normalBalance: e.target.value }))}><option>Debit</option><option>Credit</option></select></td>
                      <td className="px-2 py-2"><input className="w-full border border-blue-300 rounded px-1.5 py-1 text-xs" value={editForm.fsHead || ""} onChange={e => setEditForm((p: any) => ({ ...p, fsHead: e.target.value }))} /></td>
                      <td className="px-2 py-2"><input type="number" className="w-full border border-blue-300 rounded px-1.5 py-1 text-xs text-right" value={editForm.openingBalance || "0"} onChange={e => setEditForm((p: any) => ({ ...p, openingBalance: e.target.value }))} /></td>
                      <td className="px-2 py-2"><input type="number" className="w-full border border-blue-300 rounded px-1.5 py-1 text-xs text-right" value={editForm.debitTotal || "0"} onChange={e => setEditForm((p: any) => ({ ...p, debitTotal: e.target.value }))} /></td>
                      <td className="px-2 py-2"><input type="number" className="w-full border border-blue-300 rounded px-1.5 py-1 text-xs text-right" value={editForm.creditTotal || "0"} onChange={e => setEditForm((p: any) => ({ ...p, creditTotal: e.target.value }))} /></td>
                      <td className="px-2 py-2 bg-blue-100 text-right font-mono text-xs font-semibold">{fmt(Number(editForm.openingBalance||0)+Number(editForm.debitTotal||0)-Number(editForm.creditTotal||0))}</td>
                      <td className="px-2 py-2"><select className="w-full border border-blue-300 rounded px-1 py-1 text-xs" value={editForm.materialityTag || "Medium"} onChange={e => setEditForm((p: any) => ({ ...p, materialityTag: e.target.value }))}>{MAT_OPTIONS.map(o => <option key={o}>{o}</option>)}</select></td>
                      <td className="px-2 py-2"><select className="w-full border border-blue-300 rounded px-1 py-1 text-xs" value={editForm.riskTag || "Medium"} onChange={e => setEditForm((p: any) => ({ ...p, riskTag: e.target.value }))}>{RISK_OPTIONS.map(o => <option key={o}>{o}</option>)}</select></td>
                      <td className="px-2 py-2"><select className="w-full border border-blue-300 rounded px-1 py-1 text-xs" value={editForm.taxTreatment || ""} onChange={e => setEditForm((p: any) => ({ ...p, taxTreatment: e.target.value }))}><option value="">—</option>{TAX_OPTIONS.map(o => <option key={o}>{o}</option>)}</select></td>
                      <td className="px-2 py-2"><input className="w-full border border-blue-300 rounded px-1.5 py-1 text-xs" value={editForm.dataSource || ""} onChange={e => setEditForm((p: any) => ({ ...p, dataSource: e.target.value }))} /></td>
                      <td className="px-2 py-2"><input type="number" className="w-full border border-blue-300 rounded px-1.5 py-1 text-xs text-right" value={editForm.confidenceScore || "90"} onChange={e => setEditForm((p: any) => ({ ...p, confidenceScore: e.target.value }))} /></td>
                      <td className="px-2 py-2 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={saveEdit} disabled={savingId === row.id} className="px-2 py-1 rounded bg-blue-600 text-white text-[10px] font-medium hover:bg-blue-700 disabled:opacity-50"><Save className="w-3 h-3" /></button>
                          <button onClick={() => setEditingId(null)} className="px-2 py-1 rounded bg-slate-200 text-slate-600 text-[10px] font-medium hover:bg-slate-300"><X className="w-3 h-3" /></button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr key={row.id} className={cn("hover:bg-slate-50/60 transition-colors", row.exceptionFlag && "bg-red-50/30")}>
                      <td className="px-3 py-2.5 font-mono text-slate-700 font-medium sticky left-0 bg-white z-10">{row.accountCode}</td>
                      <td className="px-3 py-2.5 text-slate-800 font-medium max-w-[200px]">
                        <div className="truncate" title={row.accountName}>{row.accountName}</div>
                        {row.mappingFsLine && <div className="text-[10px] text-slate-400 truncate">{row.mappingFsLine}</div>}
                      </td>
                      <td className="px-3 py-2.5"><span className={cn("px-1.5 py-0.5 rounded text-[10px] font-semibold", typeColor(row.accountType))}>{row.accountType}</span></td>
                      <td className="px-3 py-2.5"><span className={cn("text-[10px] font-semibold", row.normalBalance === "Debit" ? "text-blue-600" : "text-amber-600")}>{row.normalBalance === "Debit" ? "Dr" : "Cr"}</span></td>
                      <td className="px-3 py-2.5 text-slate-500 text-[11px] truncate max-w-[80px]" title={row.fsHead || ""}>{row.fsHead || "—"}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-slate-600">{fmt(row.openingBalance)}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-blue-700 font-medium">{fmt(row.debitTotal)}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-amber-700 font-medium">{fmt(row.creditTotal)}</td>
                      <td className="px-3 py-2.5 text-right font-mono font-semibold bg-slate-50/80">
                        <span className={Number(row.closingBalance) >= 0 ? "text-blue-800" : "text-amber-800"}>{fmt(Math.abs(Number(row.closingBalance)))} <span className="text-[10px] font-normal">{Number(row.closingBalance) >= 0 ? "Dr" : "Cr"}</span></span>
                      </td>
                      <td className="px-3 py-2.5"><span className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium", matColor(row.materialityTag))}>{row.materialityTag || "—"}</span></td>
                      <td className="px-3 py-2.5 text-[11px]"><span className={riskColor(row.riskTag)}>{row.riskTag || "—"}</span></td>
                      <td className="px-3 py-2.5 text-[10px] text-slate-500">{row.taxTreatment || "—"}</td>
                      <td className="px-3 py-2.5 text-[10px] text-slate-500">{row.dataSource || "—"}</td>
                      <td className="px-3 py-2.5 text-right">
                        {row.confidenceScore ? (
                          <span className={cn("text-[10px] font-semibold", Number(row.confidenceScore) >= 85 ? "text-emerald-600" : Number(row.confidenceScore) >= 70 ? "text-amber-600" : "text-red-600")}>{Number(row.confidenceScore).toFixed(0)}%</span>
                        ) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => startEdit(row)} className="p-1 rounded hover:bg-blue-100 text-blue-600 transition-colors" title="Edit"><Pencil className="w-3.5 h-3.5" /></button>
                          <button onClick={() => onDelete(row.id)} className="p-1 rounded hover:bg-red-100 text-red-500 transition-colors" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </td>
                    </tr>
                  )
                ))}
              </tbody>
              {coaData.length > 0 && (
                <tfoot>
                  <tr className="bg-slate-100 border-t-2 border-slate-300 font-semibold text-xs">
                    <td colSpan={5} className="px-3 py-2.5 text-slate-700 sticky left-0 bg-slate-100 z-10">TOTALS ({coaData.length} accounts)</td>
                    <td className="px-3 py-2.5 text-right font-mono text-slate-600">{fmt(coaData.reduce((s: number, r: any) => s + Number(r.openingBalance || 0), 0))}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-blue-700">{fmt(coaData.reduce((s: number, r: any) => s + Number(r.debitTotal || 0), 0))}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-amber-700">{fmt(coaData.reduce((s: number, r: any) => s + Number(r.creditTotal || 0), 0))}</td>
                    <td className="px-3 py-2.5 text-right font-mono bg-slate-200">
                      <div><span className="text-blue-800">Dr: {fmt(totalDebit)}</span></div>
                      <div><span className="text-amber-800">Cr: {fmt(totalCredit)}</span></div>
                      <div className={isBalanced ? "text-emerald-700" : "text-red-700"}>{isBalanced ? "✓ BALANCED" : `Diff: ${fmt(difference)}`}</div>
                    </td>
                    <td colSpan={6} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}

        {/* Notes / Instructions */}
        {coaData.length > 0 && (
          <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 text-[11px] text-slate-500">
            <strong>How it works:</strong> Closing Balance = Opening + Debit − Credit. Positive closing = Dr balance; Negative = Cr balance. TB is balanced when total Dr = total Cr. After approval, this data drives TB generation, GL entries, and all 12 Working Paper heads.
          </div>
        )}
      </div>

      {/* Action footer */}
      {coaData.length > 0 && (
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm text-slate-500">
            {isBalanced
              ? <span className="flex items-center gap-1.5 text-emerald-600"><CheckCircle2 className="w-4 h-4" /> TB is balanced — ready to approve</span>
              : <span className="flex items-center gap-1.5 text-amber-600"><AlertTriangle className="w-4 h-4" /> TB not balanced — review and fix before approving</span>
            }
          </div>
          <Button onClick={onApprove} disabled={loading} size="lg" className={cn("px-6 gap-2", isBalanced ? "bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700" : "bg-slate-400 cursor-not-allowed")} title={!isBalanced ? "Balance the TB before approving" : ""}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            Approve Data Sheet & Continue
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

function AuditEngineStage({
  auditMaster, wpTriggers, samplingData, analyticsData, controlMatrix, evidenceLog, reconResults,
  loading, session, onUpdateMaster, onAutoPopulate, onEvaluateTriggers, onUpdateTrigger, onRefreshTriggers,
  onRefreshSampling, onRefreshAnalytics, onUpdateControl, onAddControl, onDeleteControl,
  onAddEvidence, onUpdateEvidence, onDeleteEvidence, onRunRecon
}: any) {
  const [activeEngineTab, setActiveEngineTab] = useState("engagement");
  const [masterForm, setMasterForm] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [newEvForm, setNewEvForm] = useState<any>({ documentType: "Invoice", source: "Client", wpCode: "", description: "" });
  const [showEvForm, setShowEvForm] = useState(false);
  const [newCtrl, setNewCtrl] = useState<any>({ processName: "", controlDescription: "", controlFrequency: "Per transaction", testType: "ToC" });
  const [showCtrlForm, setShowCtrlForm] = useState(false);

  // ── WP Library state ───────────────────────────────────────────────────────
  const [wpLibrary, setWpLibrary] = useState<any[]>([]);
  const [sessionLibrary, setSessionLibrary] = useState<any[]>([]);
  const [libLoading, setLibLoading] = useState(false);
  const [libActivating, setLibActivating] = useState(false);
  const [libSeeding, setLibSeeding] = useState(false);
  const [libSearch, setLibSearch] = useState("");
  const [libFamily, setLibFamily] = useState("");
  const [libView, setLibView] = useState<"browse" | "session">("session");
  const [libActivationResult, setLibActivationResult] = useState<any>(null);
  const [libSeedResult, setLibSeedResult] = useState<any>(null);

  const fetchWpLibrary = async () => {
    setLibLoading(true);
    try {
      const params = new URLSearchParams();
      if (libSearch) params.set("search", libSearch);
      if (libFamily) params.set("family", libFamily);
      const r = await fetch(`/api/working-papers/wp-library?${params}`);
      const d = await r.json();
      setWpLibrary(d.papers || []);
    } catch { /* ignore */ } finally { setLibLoading(false); }
  };

  const fetchSessionLibrary = async () => {
    if (!session?.id) return;
    setLibLoading(true);
    try {
      const r = await fetch(`/api/working-papers/sessions/${session.id}/wp-library-session`);
      const d = await r.json();
      setSessionLibrary(d.papers || []);
    } catch { /* ignore */ } finally { setLibLoading(false); }
  };

  const seedLibrary = async () => {
    setLibSeeding(true);
    try {
      const r = await fetch("/api/working-papers/seed-wp-library", { method: "POST" });
      const d = await r.json();
      setLibSeedResult(d);
      await fetchWpLibrary();
    } catch { /* ignore */ } finally { setLibSeeding(false); }
  };

  const activateLibrary = async () => {
    if (!session?.id) return;
    setLibActivating(true);
    try {
      const r = await fetch(`/api/working-papers/sessions/${session.id}/activate-wp-library`, { method: "POST" });
      const d = await r.json();
      setLibActivationResult(d);
      await fetchSessionLibrary();
    } catch { /* ignore */ } finally { setLibActivating(false); }
  };

  const updateSessionWp = async (wpCode: string, payload: any) => {
    if (!session?.id) return;
    await fetch(`/api/working-papers/sessions/${session.id}/wp-library-session/${wpCode}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    await fetchSessionLibrary();
  };

  useEffect(() => {
    if (activeEngineTab === "wp_library") {
      if (libView === "browse") fetchWpLibrary();
      else fetchSessionLibrary();
    }
  }, [activeEngineTab, libView]);

  // ── End WP Library state ───────────────────────────────────────────────────

  // ── Exceptions state ──────────────────────────────────────────────────────
  const [exceptions, setExceptions] = useState<any[]>([]);
  const [excLoading, setExcLoading] = useState(false);
  const [excScanning, setExcScanning] = useState(false);
  const [excFilter, setExcFilter] = useState<"all"|"unresolved"|"critical">("unresolved");
  const [excCounts, setExcCounts] = useState<any>({});
  const [excScanResult, setExcScanResult] = useState<any>(null);
  const [resolvingId, setResolvingId] = useState<number | null>(null);
  const [resolveNote, setResolveNote] = useState("");

  const fetchExceptions = async () => {
    if (!session?.id) return;
    setExcLoading(true);
    try {
      const params = excFilter === "unresolved" ? "?resolved=false" : excFilter === "critical" ? "?severity=Critical" : "";
      const r = await fetch(`/api/working-papers/sessions/${session.id}/isa-exceptions${params}`);
      const d = await r.json();
      setExceptions(d.exceptions || []);
      setExcCounts(d.counts || {});
    } catch { /* ignore */ } finally { setExcLoading(false); }
  };

  const runExceptionScan = async () => {
    if (!session?.id) return;
    setExcScanning(true);
    try {
      const r = await fetch(`/api/working-papers/sessions/${session.id}/auto-flag-exceptions`, { method: "POST" });
      const d = await r.json();
      setExcScanResult(d);
      await fetchExceptions();
    } catch { /* ignore */ } finally { setExcScanning(false); }
  };

  const resolveException = async (exId: number, note: string) => {
    if (!session?.id) return;
    await fetch(`/api/working-papers/sessions/${session.id}/isa-exceptions/${exId}/resolve`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resolvedBy: "Audit Team", resolutionNote: note }),
    });
    setResolvingId(null);
    setResolveNote("");
    await fetchExceptions();
  };

  useEffect(() => { if (activeEngineTab === "exceptions") fetchExceptions(); }, [activeEngineTab, excFilter]);

  // ── Generate Output state ─────────────────────────────────────────────────
  const [validation, setValidation] = useState<any>(null);
  const [validating, setValidating] = useState(false);
  const [genLoading, setGenLoading] = useState(false);
  const [genResult, setGenResult] = useState<any>(null);
  const [outputJobs, setOutputJobs] = useState<any[]>([]);
  const [genJobType, setGenJobType] = useState("full_file");

  const runValidation = async () => {
    if (!session?.id) return;
    setValidating(true);
    try {
      const r = await fetch(`/api/working-papers/sessions/${session.id}/validate-for-generation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ validatedBy: "Audit Team" }),
      });
      const d = await r.json();
      setValidation(d);
    } catch { /* ignore */ } finally { setValidating(false); }
  };

  const generateOutput = async () => {
    if (!session?.id) return;
    setGenLoading(true);
    try {
      const r = await fetch(`/api/working-papers/sessions/${session.id}/generate-output`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobType: genJobType, triggeredBy: "Audit Team" }),
      });
      const d = await r.json();
      setGenResult(d);
      await fetchOutputJobs();
    } catch { /* ignore */ } finally { setGenLoading(false); }
  };

  const fetchOutputJobs = async () => {
    if (!session?.id) return;
    try {
      const r = await fetch(`/api/working-papers/sessions/${session.id}/output-jobs`);
      const d = await r.json();
      setOutputJobs(d.jobs || []);
    } catch { /* ignore */ }
  };

  useEffect(() => { if (activeEngineTab === "generate") { runValidation(); fetchOutputJobs(); } }, [activeEngineTab]);

  // ── Lock & Archive state ──────────────────────────────────────────────────
  const [lockStatus, setLockStatus] = useState<any>(null);
  const [lockLoading, setLockLoading] = useState(false);
  const [locking, setLocking] = useState(false);
  const [lockForm, setLockForm] = useState({ lockedBy: "", lockLevel: "Partner", lockJustification: "", archiveRef: "", eqcrCompleted: false, eqcrBy: "" });
  const [lockResult, setLockResult] = useState<any>(null);
  const [auditTrail, setAuditTrail] = useState<any[]>([]);
  const [trailLoading, setTrailLoading] = useState(false);

  const fetchLockStatus = async () => {
    if (!session?.id) return;
    setLockLoading(true);
    try {
      const r = await fetch(`/api/working-papers/sessions/${session.id}/lock-status`);
      const d = await r.json();
      setLockStatus(d);
    } catch { /* ignore */ } finally { setLockLoading(false); }
  };

  const lockSession = async () => {
    if (!session?.id || !lockForm.lockedBy) return;
    setLocking(true);
    try {
      const r = await fetch(`/api/working-papers/sessions/${session.id}/lock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(lockForm),
      });
      const d = await r.json();
      setLockResult(d);
      await fetchLockStatus();
    } catch { /* ignore */ } finally { setLocking(false); }
  };

  const fetchAuditTrail = async () => {
    if (!session?.id) return;
    setTrailLoading(true);
    try {
      const r = await fetch(`/api/working-papers/sessions/${session.id}/wp-audit-trail`);
      const d = await r.json();
      setAuditTrail(d.trail || []);
    } catch { /* ignore */ } finally { setTrailLoading(false); }
  };

  useEffect(() => { if (activeEngineTab === "lock") { fetchLockStatus(); fetchAuditTrail(); } }, [activeEngineTab]);

  useEffect(() => { if (auditMaster && !masterForm) setMasterForm({ ...auditMaster }); }, [auditMaster]);

  const saveMaster = async () => { setSaving(true); await onUpdateMaster(masterForm); setSaving(false); };
  const setMF = (field: string, val: any) => setMasterForm((p: any) => ({ ...p, [field]: val }));

  const TABS = [
    { key: "engagement", label: "Engagement Control", icon: ClipboardCheck },
    { key: "wp_triggers", label: "WP Trigger Matrix", icon: Zap },
    { key: "sampling", label: "Sampling Engine", icon: Calculator },
    { key: "analytics", label: "Analytical Review", icon: Gauge },
    { key: "controls", label: "Control Testing", icon: Shield },
    { key: "evidence", label: "Evidence Vault", icon: FileCheck },
    { key: "recon", label: "Reconciliation", icon: RefreshCw },
    { key: "wp_library", label: "ISA Library", icon: BookOpen },
    { key: "exceptions", label: "Exceptions", icon: AlertTriangle },
    { key: "generate", label: "Generate Output", icon: Download },
    { key: "lock", label: "Lock & Archive", icon: Lock },
  ];

  const fmt = (v: any) => { const n = Number(v || 0); return isNaN(n) ? "—" : n.toLocaleString("en-PK"); };
  const statusColor = (s: string) => s === "completed" ? "bg-emerald-100 text-emerald-700" : s === "in_progress" ? "bg-blue-100 text-blue-700" : s === "n_a" ? "bg-slate-100 text-slate-400" : "bg-amber-100 text-amber-700";
  const riskBg = (r: string) => r === "High" ? "bg-red-50 border-red-200 text-red-700" : r === "Medium" ? "bg-amber-50 border-amber-200 text-amber-700" : "bg-green-50 border-green-200 text-green-700";
  const catColor = (c: string) => c === "Planning" ? "text-purple-600" : c === "Risk" ? "text-red-600" : c === "Substantive" ? "text-blue-600" : c === "Analytical" ? "text-teal-600" : "text-emerald-600";

  const triggered = wpTriggers.filter((t: any) => t.triggered);
  const notTriggered = wpTriggers.filter((t: any) => !t.triggered);
  const completed = wpTriggers.filter((t: any) => t.status === "completed");
  const breachedRatios = analyticsData.filter((r: any) => r.breached);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-800 to-indigo-900 rounded-2xl p-5 text-white">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2"><Shield className="w-5 h-5 text-indigo-300" /> AUDIT ENGINE MASTER CONTROL</h2>
            <p className="text-slate-300 text-sm mt-0.5">ISA-aligned audit logic • WP triggers • Sampling • Analytics • Evidence vault</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="text-center px-3 py-1.5 bg-white/10 rounded-lg"><div className="text-lg font-bold">{triggered.length}</div><div className="text-[10px] text-slate-300">WPs Triggered</div></div>
            <div className="text-center px-3 py-1.5 bg-white/10 rounded-lg"><div className="text-lg font-bold">{completed.length}</div><div className="text-[10px] text-slate-300">Completed</div></div>
            <div className="text-center px-3 py-1.5 bg-white/10 rounded-lg"><div className={cn("text-lg font-bold", breachedRatios.length > 0 ? "text-red-300" : "text-emerald-300")}>{breachedRatios.length}</div><div className="text-[10px] text-slate-300">Ratio Alerts</div></div>
            <div className="text-center px-3 py-1.5 bg-white/10 rounded-lg"><div className="text-lg font-bold">{evidenceLog.length}</div><div className="text-[10px] text-slate-300">Evidence Items</div></div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5 flex-wrap border-b border-slate-200 pb-0">
        {TABS.map(tab => (
          <button key={tab.key} onClick={() => setActiveEngineTab(tab.key)} className={cn("flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t-lg border border-b-0 transition-colors", activeEngineTab === tab.key ? "bg-white border-slate-200 text-indigo-700 shadow-sm -mb-px" : "bg-slate-50 border-transparent text-slate-500 hover:text-slate-700 hover:bg-white")}>
            <tab.icon className="w-3.5 h-3.5" />{tab.label}
          </button>
        ))}
      </div>

      {/* ── TAB: Engagement Control ── */}
      {activeEngineTab === "engagement" && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h3 className="font-semibold text-slate-900 flex items-center gap-2"><ClipboardCheck className="w-4 h-4 text-indigo-600" /> Engagement Control Master</h3>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={onAutoPopulate} disabled={loading} className="h-8 text-xs gap-1.5 border-violet-200 text-violet-700 hover:bg-violet-50"><Sparkles className="w-3.5 h-3.5" />Auto-populate</Button>
              <Button size="sm" onClick={saveMaster} disabled={saving || !masterForm} className="h-8 text-xs gap-1.5 bg-indigo-600 hover:bg-indigo-700">{saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}Save</Button>
            </div>
          </div>
          {!masterForm && loading ? (
            <div className="py-8 text-center"><Loader2 className="w-6 h-6 animate-spin text-indigo-600 mx-auto" /></div>
          ) : masterForm ? (
            <div className="space-y-5">
              {/* Identity */}
              <div>
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-3">Engagement Identity</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {[
                    { label: "Engagement ID", field: "engagementId" },
                    { label: "Client Name", field: "clientName" },
                    { label: "FY Start", field: "financialYearStart", placeholder: "01-Jul-2024" },
                    { label: "FY End", field: "financialYearEnd", placeholder: "30-Jun-2025" },
                  ].map(f => (
                    <div key={f.field}>
                      <label className="text-[11px] text-slate-500 font-medium block mb-1">{f.label}</label>
                      <input className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 outline-none" value={masterForm[f.field] || ""} placeholder={f.placeholder} onChange={e => setMF(f.field, e.target.value)} />
                    </div>
                  ))}
                  {[
                    { label: "Entity Type", field: "entityType", options: ["Pvt Ltd", "Listed", "NGO", "Bank", "Trust", "Sole Proprietor", "Partnership"] },
                    { label: "Industry", field: "industryType", options: ["Manufacturing", "Services", "Retail", "Banking", "Insurance", "Healthcare", "Construction", "Technology"] },
                    { label: "Reporting Framework", field: "reportingFramework", options: ["IFRS", "IFRS for SMEs", "SECP Regulations", "SBP Guidelines"] },
                    { label: "Audit Type", field: "auditType", options: ["Statutory", "Internal", "Tax", "Forensic", "Due Diligence"] },
                    { label: "Engagement Status", field: "engagementStatus", options: ["Planning", "Fieldwork", "Completion", "Reporting", "Completed"] },
                    { label: "IT System", field: "itSystemType", options: ["ERP", "Manual", "Hybrid", "Spreadsheet"] },
                    { label: "Sampling Method", field: "samplingMethod", options: ["MUS", "Random", "Judgmental", "Stratified"] },
                    { label: "Data Source", field: "dataSource", options: ["OCR", "Manual", "Excel Extract", "ERP Export"] },
                  ].map(f => (
                    <div key={f.field}>
                      <label className="text-[11px] text-slate-500 font-medium block mb-1">{f.label}</label>
                      <select className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-300 outline-none" value={masterForm[f.field] || ""} onChange={e => setMF(f.field, e.target.value)}>
                        <option value="">— Select —</option>
                        {f.options.map(o => <option key={o}>{o}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              {/* Materiality */}
              <div>
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-3">Materiality</p>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "Overall Materiality (PKR)", field: "materialityAmount" },
                    { label: "Performance Materiality (PKR)", field: "performanceMateriality" },
                    { label: "Triviality Threshold (PKR)", field: "trivialityThreshold" },
                  ].map(f => (
                    <div key={f.field}>
                      <label className="text-[11px] text-slate-500 font-medium block mb-1">{f.label}</label>
                      <input type="number" className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-right font-mono focus:ring-2 focus:ring-indigo-300 outline-none" value={masterForm[f.field] || ""} onChange={e => setMF(f.field, e.target.value)} />
                    </div>
                  ))}
                </div>
                {masterForm.materialityAmount && (
                  <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-500">
                    <Info className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Overall: <strong className="text-indigo-700">PKR {fmt(masterForm.materialityAmount)}</strong> | PM: <strong className="text-blue-700">PKR {fmt(masterForm.performanceMateriality)}</strong> | Trivial: <strong className="text-slate-600">PKR {fmt(masterForm.trivialityThreshold)}</strong></span>
                  </div>
                )}
              </div>

              {/* Risk & Flags */}
              <div>
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-3">Risk Level & ISA Flags</p>
                <div className="flex items-center gap-3 mb-3">
                  <label className="text-sm text-slate-600 font-medium">Overall Risk Level:</label>
                  {["Low", "Medium", "High"].map(r => (
                    <button key={r} onClick={() => setMF("riskLevelOverall", r)} className={cn("px-4 py-1.5 rounded-full text-xs font-semibold border transition-colors", masterForm.riskLevelOverall === r ? r === "High" ? "bg-red-600 text-white border-red-600" : r === "Medium" ? "bg-amber-500 text-white border-amber-500" : "bg-green-600 text-white border-green-600" : "border-slate-300 text-slate-600 hover:border-slate-400")}>{r}</button>
                  ))}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                  {[
                    { label: "Going Concern (ISA 570)", field: "goingConcernFlag", isa: "ISA 570" },
                    { label: "Fraud Risk (ISA 240)", field: "fraudRiskFlag", isa: "ISA 240" },
                    { label: "Related Parties (ISA 550)", field: "relatedPartyFlag", isa: "ISA 550" },
                    { label: "Laws & Regulations (ISA 250)", field: "lawsRegulationFlag", isa: "ISA 250" },
                    { label: "Component Audit (ISA 600)", field: "componentAuditFlag", isa: "ISA 600" },
                    { label: "Group Audit (ISA 600)", field: "groupAuditFlag", isa: "ISA 600" },
                    { label: "Internal Audit (ISA 610)", field: "internalAuditFlag", isa: "ISA 610" },
                    { label: "Use of Expert (ISA 620)", field: "useOfExpertFlag", isa: "ISA 620" },
                  ].map(f => (
                    <button key={f.field} onClick={() => setMF(f.field, !masterForm[f.field])} className={cn("flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-medium transition-all text-left", masterForm[f.field] ? "bg-red-50 border-red-300 text-red-700 shadow-sm" : "bg-slate-50 border-slate-200 text-slate-500 hover:bg-white hover:border-slate-300")}>
                      <div className={cn("w-4 h-4 rounded flex items-center justify-center shrink-0", masterForm[f.field] ? "bg-red-500" : "bg-slate-200")}>{masterForm[f.field] && <Check className="w-2.5 h-2.5 text-white" />}</div>
                      <div><div className="leading-tight">{f.label}</div><div className="text-[9px] opacity-60 font-normal">{f.isa}</div></div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Sign-off */}
              <div>
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-3">Sign-off & QA</p>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "Prepared By", field: "preparedBy" },
                    { label: "Reviewed By", field: "reviewedBy" },
                    { label: "Approved By (Partner)", field: "approvedBy" },
                  ].map(f => (
                    <div key={f.field}>
                      <label className="text-[11px] text-slate-500 font-medium block mb-1">{f.label}</label>
                      <input className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-300 outline-none" value={masterForm[f.field] || ""} onChange={e => setMF(f.field, e.target.value)} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="py-8 text-center">
              <p className="text-slate-500 text-sm">No audit engine data — click Auto-populate to start</p>
              <Button onClick={onAutoPopulate} disabled={loading} className="mt-3 gap-1.5 bg-indigo-600 hover:bg-indigo-700"><Sparkles className="w-4 h-4" />Auto-populate from Variables</Button>
            </div>
          )}
        </div>
      )}

      {/* ── TAB: WP Trigger Matrix ── */}
      {activeEngineTab === "wp_triggers" && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="bg-gradient-to-r from-indigo-50 to-purple-50/40 px-5 py-4 border-b border-slate-200/60 flex items-center justify-between flex-wrap gap-3">
            <div>
              <h3 className="font-semibold text-slate-900 flex items-center gap-2"><Zap className="w-4 h-4 text-indigo-600" /> Working Paper Trigger Matrix</h3>
              <p className="text-xs text-slate-500 mt-0.5">{triggered.length} WPs triggered • {completed.length} completed • {notTriggered.length} not applicable</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={onRefreshTriggers} className="h-8 text-xs gap-1"><RefreshCw className="w-3 h-3" />Refresh</Button>
              <Button size="sm" onClick={onEvaluateTriggers} disabled={!auditMaster} className="h-8 text-xs gap-1 bg-indigo-600 hover:bg-indigo-700"><Zap className="w-3 h-3" />Re-evaluate Triggers</Button>
            </div>
          </div>

          {wpTriggers.length === 0 ? (
            <div className="py-16 text-center">
              <Zap className="w-8 h-8 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 text-sm mb-4">Set up the Engagement Control first, then evaluate triggers</p>
              <Button onClick={onEvaluateTriggers} disabled={!auditMaster} className="gap-1.5"><Zap className="w-4 h-4" />Evaluate WP Triggers</Button>
            </div>
          ) : (
            <div>
              {["Planning", "Risk", "Substantive", "Analytical", "Completion"].map(cat => {
                const catItems = wpTriggers.filter((t: any) => t.category === cat);
                if (!catItems.length) return null;
                return (
                  <div key={cat}>
                    <div className={cn("px-5 py-2 text-[11px] font-semibold uppercase tracking-wider border-b border-slate-100", catColor(cat))} style={{ background: "rgba(0,0,0,0.02)" }}>{cat} ({catItems.length})</div>
                    {catItems.map((t: any) => (
                      <div key={t.wpCode} className={cn("flex items-start gap-3 px-5 py-3 border-b border-slate-50 hover:bg-slate-50/60 transition-colors", !t.triggered && "opacity-50")}>
                        <div className={cn("mt-0.5 w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-[10px] font-bold", t.triggered ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-400")}>{t.wpCode}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-slate-800">{t.wpName}</span>
                            {t.mandatoryFlag && <span className="px-1.5 py-0.5 bg-red-50 text-red-600 text-[10px] rounded font-semibold">MANDATORY</span>}
                            <span className="text-[10px] text-slate-400">{t.isaReference}</span>
                            <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium", statusColor(t.status))}>{t.status?.replace("_", " ").toUpperCase() || "PENDING"}</span>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-0.5">{t.triggerReason || t.triggerDescription}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <div className={cn("w-5 h-5 rounded-full flex items-center justify-center", t.triggered ? "bg-emerald-500" : "bg-slate-200")}>
                            {t.triggered ? <Check className="w-3 h-3 text-white" /> : <X className="w-3 h-3 text-slate-400" />}
                          </div>
                          {t.triggered && (
                            <select className="text-[11px] border border-slate-200 rounded px-1.5 py-1 bg-white" value={t.status || "pending"} onChange={e => onUpdateTrigger(t.wpCode, { status: e.target.value })}>
                              <option value="pending">Pending</option>
                              <option value="in_progress">In Progress</option>
                              <option value="completed">Completed</option>
                              <option value="n_a">N/A</option>
                            </select>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── TAB: Sampling Engine ── */}
      {activeEngineTab === "sampling" && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50/40 px-5 py-4 border-b border-slate-200/60 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-slate-900 flex items-center gap-2"><Calculator className="w-4 h-4 text-blue-600" /> Sampling Engine</h3>
              <p className="text-xs text-slate-500 mt-0.5">ISA 530 compliant — MUS, Random, Judgmental sampling rules</p>
            </div>
            <Button variant="outline" size="sm" onClick={onRefreshSampling} className="h-8 text-xs gap-1"><RefreshCw className="w-3 h-3" />Refresh</Button>
          </div>

          {samplingData?.context && (
            <div className="px-5 py-3 bg-blue-50/50 border-b border-blue-100 flex items-center gap-4 flex-wrap text-xs">
              <span className={cn("px-2.5 py-1 rounded-full font-semibold border text-xs", riskBg(samplingData.context.riskLevel))}>Risk: {samplingData.context.riskLevel}</span>
              <span className="text-slate-600">PM: <strong>PKR {fmt(samplingData.context.performanceMateriality)}</strong></span>
              <span className="text-slate-600">Trivial: <strong>PKR {fmt(samplingData.context.trivialityThreshold)}</strong></span>
              <span className="text-slate-600">Method: <strong>{samplingData.context.samplingMethod}</strong></span>
            </div>
          )}

          {samplingData?.context?.recommendation && (
            <div className="px-5 py-2.5 bg-indigo-50 border-b border-indigo-100 flex items-center gap-2">
              <Info className="w-4 h-4 text-indigo-600 shrink-0" />
              <p className="text-xs text-indigo-700">{samplingData.context.recommendation}</p>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left px-4 py-2.5 font-semibold text-slate-600">Risk Level</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-slate-600">Materiality Band</th>
                  <th className="text-center px-4 py-2.5 font-semibold text-slate-600">Sample Range</th>
                  <th className="text-center px-4 py-2.5 font-semibold text-slate-600">Coverage %</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-slate-600">Method</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-slate-600">Approach</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-slate-600">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(samplingData?.rules || []).map((r: any) => (
                  <tr key={r.id} className={cn("hover:bg-slate-50/50", samplingData?.context?.riskLevel === r.riskLevel && "bg-indigo-50/30 font-medium")}>
                    <td className="px-4 py-2.5"><span className={cn("px-2 py-0.5 rounded-full text-[11px] font-semibold", r.riskLevel === "High" ? "bg-red-100 text-red-700" : r.riskLevel === "Medium" ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700")}>{r.riskLevel}</span></td>
                    <td className="px-4 py-2.5 text-slate-700">{r.materialityBand === "GT_PM" ? "Above PM (>PM)" : r.materialityBand === "LTE_PM" ? "At / Below PM" : "Below Trivial"}</td>
                    <td className="px-4 py-2.5 text-center font-mono font-semibold text-indigo-700">{r.sampleSizeMin}–{r.sampleSizeMax}</td>
                    <td className="px-4 py-2.5 text-center"><div className="w-full bg-slate-100 rounded-full h-1.5 mb-0.5"><div className="bg-indigo-500 rounded-full h-1.5" style={{ width: `${Math.min(Number(r.coveragePct), 100)}%` }} /></div><span className="text-[10px]">{r.coveragePct}%</span></td>
                    <td className="px-4 py-2.5 text-slate-600">{r.samplingMethod}</td>
                    <td className="px-4 py-2.5"><span className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium", r.testingApproach === "Full" ? "bg-red-50 text-red-700" : r.testingApproach === "Moderate" ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-600")}>{r.testingApproach}</span></td>
                    <td className="px-4 py-2.5 text-slate-500 text-[11px]">{r.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TAB: Analytical Review ── */}
      {activeEngineTab === "analytics" && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="bg-gradient-to-r from-teal-50 to-emerald-50/40 px-5 py-4 border-b border-slate-200/60 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-slate-900 flex items-center gap-2"><Gauge className="w-4 h-4 text-teal-600" /> Analytical Procedure Engine</h3>
              <p className="text-xs text-slate-500 mt-0.5">ISA 520 — computed from session variables • {breachedRatios.length} ratio alert{breachedRatios.length !== 1 ? "s" : ""}</p>
            </div>
            <Button variant="outline" size="sm" onClick={onRefreshAnalytics} className="h-8 text-xs gap-1"><RefreshCw className="w-3 h-3" />Refresh</Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left px-4 py-2.5 font-semibold text-slate-600">Ratio</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-slate-600">Category</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-slate-600">Formula</th>
                  <th className="text-right px-4 py-2.5 font-semibold text-slate-600">Computed</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-slate-600">Threshold</th>
                  <th className="text-center px-4 py-2.5 font-semibold text-slate-600">Status</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-slate-600">WP Link</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {analyticsData.map((r: any) => (
                  <tr key={r.ratioCode} className={cn("hover:bg-slate-50/50", r.breached && "bg-red-50/30")}>
                    <td className="px-4 py-2.5 font-medium text-slate-800">{r.ratioName}</td>
                    <td className="px-4 py-2.5"><span className="text-[10px] text-slate-500">{r.category}</span></td>
                    <td className="px-4 py-2.5 font-mono text-[11px] text-slate-500">{r.formula}</td>
                    <td className="px-4 py-2.5 text-right">
                      {r.computedValue != null ? (
                        <span className={cn("font-bold font-mono text-sm", r.breached ? "text-red-700" : "text-emerald-700")}>{Number(r.computedValue).toFixed(2)}{r.ratioCode?.endsWith("_percent") ? "%" : r.ratioCode?.endsWith("_days") ? "d" : "x"}</span>
                      ) : <span className="text-slate-300 text-sm">— N/A</span>}
                    </td>
                    <td className="px-4 py-2.5 text-[11px] text-slate-500 max-w-[120px]" title={r.thresholdDescription}><div className="truncate">{r.thresholdDescription}</div></td>
                    <td className="px-4 py-2.5 text-center">
                      {r.computedValue == null ? <span className="text-[10px] text-slate-300">No data</span> : r.breached ? <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-[10px] font-semibold flex items-center gap-1 justify-center"><AlertTriangle className="w-3 h-3" />Alert</span> : <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded text-[10px] font-semibold flex items-center gap-1 justify-center"><Check className="w-3 h-3" />OK</span>}
                    </td>
                    <td className="px-4 py-2.5"><span className="px-1.5 py-0.5 bg-indigo-50 text-indigo-700 rounded text-[10px] font-mono">{r.wpTrigger || "—"}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TAB: Control Testing ── */}
      {activeEngineTab === "controls" && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="bg-gradient-to-r from-purple-50 to-violet-50/40 px-5 py-4 border-b border-slate-200/60 flex items-center justify-between flex-wrap gap-3">
            <div>
              <h3 className="font-semibold text-slate-900 flex items-center gap-2"><Shield className="w-4 h-4 text-purple-600" /> Control Testing Matrix</h3>
              <p className="text-xs text-slate-500 mt-0.5">ISA 315 — ToC (Test of Controls) & ToD (Test of Details)</p>
            </div>
            <Button size="sm" onClick={() => setShowCtrlForm(true)} className="h-8 text-xs gap-1 bg-purple-600 hover:bg-purple-700"><Plus className="w-3.5 h-3.5" />Add Control</Button>
          </div>

          {showCtrlForm && (
            <div className="px-5 py-4 bg-purple-50 border-b border-purple-100">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div><label className="text-[11px] text-slate-500 font-medium block mb-1">Process</label><input className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs" value={newCtrl.processName} onChange={e => setNewCtrl((p: any) => ({ ...p, processName: e.target.value }))} placeholder="e.g. Sales" /></div>
                <div><label className="text-[11px] text-slate-500 font-medium block mb-1">Control Description</label><input className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs" value={newCtrl.controlDescription} onChange={e => setNewCtrl((p: any) => ({ ...p, controlDescription: e.target.value }))} /></div>
                <div><label className="text-[11px] text-slate-500 font-medium block mb-1">Frequency</label><select className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs" value={newCtrl.controlFrequency} onChange={e => setNewCtrl((p: any) => ({ ...p, controlFrequency: e.target.value }))}><option>Daily</option><option>Per transaction</option><option>Weekly</option><option>Monthly</option><option>Annual</option></select></div>
                <div><label className="text-[11px] text-slate-500 font-medium block mb-1">Test Type</label><select className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs" value={newCtrl.testType} onChange={e => setNewCtrl((p: any) => ({ ...p, testType: e.target.value }))}><option>ToC</option><option>ToD</option><option>Both</option></select></div>
              </div>
              <div className="flex gap-2 mt-3">
                <Button size="sm" onClick={() => { onAddControl(newCtrl); setShowCtrlForm(false); setNewCtrl({ processName: "", controlDescription: "", controlFrequency: "Per transaction", testType: "ToC" }); }} className="h-7 text-xs bg-purple-600 hover:bg-purple-700">Add</Button>
                <Button variant="outline" size="sm" onClick={() => setShowCtrlForm(false)} className="h-7 text-xs">Cancel</Button>
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse min-w-[900px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left px-4 py-2.5 font-semibold text-slate-600">Process</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-slate-600">Control</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-slate-600">Frequency</th>
                  <th className="text-center px-4 py-2.5 font-semibold text-slate-600">Type</th>
                  <th className="text-center px-4 py-2.5 font-semibold text-slate-600">Sample</th>
                  <th className="text-center px-4 py-2.5 font-semibold text-slate-600">Result</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-slate-600">WP</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-slate-600">Conclusion</th>
                  <th className="text-center px-4 py-2.5 font-semibold text-slate-600">Del</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {controlMatrix.map((r: any) => (
                  <tr key={r.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-2 font-medium text-slate-800">{r.processName}</td>
                    <td className="px-4 py-2 text-slate-600 max-w-[180px]"><div className="truncate" title={r.controlDescription}>{r.controlDescription}</div></td>
                    <td className="px-4 py-2 text-slate-500">{r.controlFrequency}</td>
                    <td className="px-4 py-2 text-center"><span className={cn("px-1.5 py-0.5 rounded text-[10px] font-semibold", r.testType === "ToC" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700")}>{r.testType}</span></td>
                    <td className="px-4 py-2 text-center"><input type="number" className="w-14 text-center border border-slate-200 rounded px-1.5 py-0.5 text-xs" value={r.sampleSize || ""} onChange={e => onUpdateControl(r.id, { sampleSize: Number(e.target.value) })} placeholder="n" /></td>
                    <td className="px-4 py-2 text-center"><select className="text-[11px] border border-slate-200 rounded px-1.5 py-0.5" value={r.testingResult || ""} onChange={e => onUpdateControl(r.id, { testingResult: e.target.value })}><option value="">—</option><option>Effective</option><option>Deficient</option><option>Not Tested</option></select></td>
                    <td className="px-4 py-2"><span className="font-mono text-[10px] text-indigo-600">{r.relatedWpCode || "—"}</span></td>
                    <td className="px-4 py-2"><input className="w-full border border-slate-200 rounded px-1.5 py-0.5 text-xs" placeholder="Conclusion…" value={r.conclusion || ""} onChange={e => onUpdateControl(r.id, { conclusion: e.target.value })} /></td>
                    <td className="px-4 py-2 text-center"><button onClick={() => onDeleteControl(r.id)} className="p-1 hover:bg-red-100 rounded text-red-400 hover:text-red-600 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TAB: Evidence Vault ── */}
      {activeEngineTab === "evidence" && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="bg-gradient-to-r from-amber-50 to-orange-50/40 px-5 py-4 border-b border-slate-200/60 flex items-center justify-between flex-wrap gap-3">
            <div>
              <h3 className="font-semibold text-slate-900 flex items-center gap-2"><FileCheck className="w-4 h-4 text-amber-600" /> Evidence Vault</h3>
              <p className="text-xs text-slate-500 mt-0.5">{evidenceLog.length} evidence item{evidenceLog.length !== 1 ? "s" : ""} logged across all working papers</p>
            </div>
            <Button size="sm" onClick={() => setShowEvForm(v => !v)} className="h-8 text-xs gap-1 bg-amber-600 hover:bg-amber-700"><Plus className="w-3.5 h-3.5" />{showEvForm ? "Cancel" : "Log Evidence"}</Button>
          </div>

          {showEvForm && (
            <div className="px-5 py-4 bg-amber-50 border-b border-amber-100">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div><label className="text-[11px] text-slate-500 font-medium block mb-1">WP Code</label><input className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs" placeholder="C2" value={newEvForm.wpCode} onChange={e => setNewEvForm((p: any) => ({ ...p, wpCode: e.target.value }))} /></div>
                <div><label className="text-[11px] text-slate-500 font-medium block mb-1">Document Type</label><select className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs" value={newEvForm.documentType} onChange={e => setNewEvForm((p: any) => ({ ...p, documentType: e.target.value }))}>{["Invoice","Contract","Confirmation","Bank Statement","Management Letter","Voucher","Schedule","Agreement","Certificate"].map(o => <option key={o}>{o}</option>)}</select></div>
                <div><label className="text-[11px] text-slate-500 font-medium block mb-1">Source</label><select className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs" value={newEvForm.source} onChange={e => setNewEvForm((p: any) => ({ ...p, source: e.target.value }))}><option>Client</option><option>External</option><option>Self-generated</option><option>Third Party</option></select></div>
                <div><label className="text-[11px] text-slate-500 font-medium block mb-1">Document Ref</label><input className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs" placeholder="INV-0012345" value={newEvForm.documentRef || ""} onChange={e => setNewEvForm((p: any) => ({ ...p, documentRef: e.target.value }))} /></div>
                <div><label className="text-[11px] text-slate-500 font-medium block mb-1">Obtained Date</label><input type="date" className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs" value={newEvForm.obtainedDate || ""} onChange={e => setNewEvForm((p: any) => ({ ...p, obtainedDate: e.target.value }))} /></div>
                <div><label className="text-[11px] text-slate-500 font-medium block mb-1">Description</label><input className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs" placeholder="e.g. Debtor confirmation from ABC Ltd" value={newEvForm.description} onChange={e => setNewEvForm((p: any) => ({ ...p, description: e.target.value }))} /></div>
              </div>
              <Button size="sm" onClick={() => { onAddEvidence(newEvForm); setShowEvForm(false); setNewEvForm({ documentType: "Invoice", source: "Client", wpCode: "", description: "" }); }} className="mt-3 h-7 text-xs bg-amber-600 hover:bg-amber-700">Save Evidence</Button>
            </div>
          )}

          {evidenceLog.length === 0 ? (
            <div className="py-14 text-center"><FileCheck className="w-8 h-8 text-slate-200 mx-auto mb-3" /><p className="text-slate-500 text-sm">No evidence logged yet. Start logging obtained documents here.</p></div>
          ) : (
            <div className="divide-y divide-slate-100">
              {evidenceLog.map((ev: any) => (
                <div key={ev.id} className="flex items-start gap-3 px-5 py-3 hover:bg-slate-50/50">
                  <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center shrink-0 mt-0.5"><FileText className="w-4 h-4 text-amber-700" /></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-[10px] bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded">{ev.wpCode || "—"}</span>
                      <span className="text-sm font-medium text-slate-800">{ev.documentType}</span>
                      <span className="text-[11px] text-slate-500">{ev.documentRef}</span>
                      <span className={cn("text-[10px] px-1.5 py-0.5 rounded", ev.source === "External" ? "bg-purple-50 text-purple-700" : ev.source === "Client" ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-500")}>{ev.source}</span>
                      {ev.verifiedFlag && <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded flex items-center gap-0.5"><Check className="w-2.5 h-2.5" />Verified</span>}
                    </div>
                    {ev.description && <p className="text-[11px] text-slate-500 mt-0.5">{ev.description}</p>}
                    {ev.reviewerComment && <p className="text-[11px] text-amber-700 mt-0.5 italic">{ev.reviewerComment}</p>}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button onClick={() => onUpdateEvidence(ev.id, { verifiedFlag: !ev.verifiedFlag })} className={cn("p-1.5 rounded-lg transition-colors text-[10px] font-medium", ev.verifiedFlag ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200" : "bg-slate-100 text-slate-500 hover:bg-emerald-50 hover:text-emerald-600")} title={ev.verifiedFlag ? "Mark unverified" : "Mark verified"}><Check className="w-3.5 h-3.5" /></button>
                    <button onClick={() => onDeleteEvidence(ev.id)} className="p-1.5 rounded-lg bg-slate-50 hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── TAB: Reconciliation ── */}
      {activeEngineTab === "recon" && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="bg-gradient-to-r from-slate-50 to-blue-50/40 px-5 py-4 border-b border-slate-200/60 flex items-center justify-between flex-wrap gap-3">
            <div>
              <h3 className="font-semibold text-slate-900 flex items-center gap-2"><RefreshCw className="w-4 h-4 text-slate-700" /> Reconciliation Engine</h3>
              <p className="text-xs text-slate-500 mt-0.5">3-way reconciliation: FS ↔ TB ↔ GL ↔ COA</p>
            </div>
            <Button size="sm" onClick={onRunRecon} className="h-8 text-xs gap-1 bg-slate-800 hover:bg-slate-900"><RefreshCw className="w-3.5 h-3.5" />Run All Checks</Button>
          </div>

          {reconResults.length === 0 ? (
            <div className="py-14 text-center">
              <RefreshCw className="w-8 h-8 text-slate-200 mx-auto mb-3" />
              <p className="text-slate-500 text-sm mb-4">Click "Run All Checks" to verify FS vs TB vs GL vs COA reconciliation</p>
              <Button onClick={onRunRecon} className="gap-1.5 bg-slate-800 hover:bg-slate-900"><RefreshCw className="w-4 h-4" />Run Reconciliation</Button>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {reconResults.map((r: any) => (
                <div key={r.id} className={cn("flex items-start gap-4 px-5 py-4", r.passed ? "bg-emerald-50/30" : "bg-red-50/30")}>
                  <div className={cn("w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5", r.passed ? "bg-emerald-100" : "bg-red-100")}>
                    {r.passed ? <Check className="w-4 h-4 text-emerald-600" /> : <AlertTriangle className="w-4 h-4 text-red-600" />}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm text-slate-800">{r.checkName}</span>
                      <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-semibold", r.passed ? "bg-emerald-200 text-emerald-800" : "bg-red-200 text-red-800")}>{r.passed ? "PASS" : "FAIL"}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-4 text-[11px] text-slate-500">
                      <span>{r.sourceA}: <strong className="text-slate-700">{Number(r.amountA || 0).toLocaleString()}</strong></span>
                      <span>{r.sourceB}: <strong className="text-slate-700">{Number(r.amountB || 0).toLocaleString()}</strong></span>
                      {!r.passed && <span className="text-red-600 font-semibold">Diff: {Number(r.difference || 0).toLocaleString()}</span>}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">{r.notes}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── TAB: ISA Working Paper Library ── */}
      {activeEngineTab === "wp_library" && (
        <div className="space-y-4">
          {/* Library Header */}
          <div className="bg-gradient-to-r from-indigo-900 to-violet-900 rounded-2xl p-5 text-white">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h3 className="text-base font-bold flex items-center gap-2"><BookOpen className="w-5 h-5 text-violet-300" /> ISA WORKING PAPER LIBRARY</h3>
                <p className="text-indigo-200 text-xs mt-0.5">IAASB 2025 Handbook · ISAs as applicable in Pakistan (ICAP) · 240+ papers · 14 code families · A–N + Z</p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="text-center px-3 py-1.5 bg-white/10 rounded-lg">
                  <div className="text-lg font-bold">{libView === "browse" ? wpLibrary.length : sessionLibrary.length}</div>
                  <div className="text-[10px] text-indigo-200">{libView === "browse" ? "In Library" : "Activated"}</div>
                </div>
                <div className="text-center px-3 py-1.5 bg-white/10 rounded-lg">
                  <div className="text-lg font-bold text-emerald-300">{sessionLibrary.filter((p: any) => p.mandatoryFlag).length}</div>
                  <div className="text-[10px] text-indigo-200">Mandatory</div>
                </div>
                <div className="text-center px-3 py-1.5 bg-white/10 rounded-lg">
                  <div className="text-lg font-bold text-amber-300">{sessionLibrary.filter((p: any) => p.status === "Pending").length}</div>
                  <div className="text-[10px] text-indigo-200">Pending</div>
                </div>
                <div className="text-center px-3 py-1.5 bg-white/10 rounded-lg">
                  <div className="text-lg font-bold text-emerald-300">{sessionLibrary.filter((p: any) => p.status === "Approved").length}</div>
                  <div className="text-[10px] text-indigo-200">Approved</div>
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex gap-2 mt-4 flex-wrap">
              <button onClick={seedLibrary} disabled={libSeeding} className="flex items-center gap-1.5 px-3 py-1.5 bg-white/15 hover:bg-white/25 rounded-lg text-xs font-medium transition-colors disabled:opacity-60">
                {libSeeding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <BookOpen className="w-3.5 h-3.5" />}
                {libSeeding ? "Seeding..." : "Seed Library (240 papers)"}
              </button>
              <button onClick={activateLibrary} disabled={libActivating} className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-500 hover:bg-violet-400 rounded-lg text-xs font-medium transition-colors disabled:opacity-60">
                {libActivating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                {libActivating ? "Activating..." : "Activate WPs for This Engagement"}
              </button>
              <button onClick={libView === "browse" ? fetchWpLibrary : fetchSessionLibrary} disabled={libLoading} className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-medium transition-colors disabled:opacity-60">
                <RefreshCw className={cn("w-3.5 h-3.5", libLoading && "animate-spin")} />
                Refresh
              </button>
            </div>

            {/* Seed / Activation Result toast */}
            {libSeedResult && (
              <div className="mt-3 bg-white/10 rounded-lg px-3 py-2 text-xs text-indigo-100 flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
                Library: {libSeedResult.total} total papers · Inserted {libSeedResult.inserted} · Updated {libSeedResult.updated} · Families: {libSeedResult.families}
              </div>
            )}
            {libActivationResult && (
              <div className="mt-2 bg-white/10 rounded-lg px-3 py-2 text-xs text-indigo-100">
                <div className="flex items-center gap-2">
                  <Zap className="w-3.5 h-3.5 text-yellow-300 shrink-0" />
                  <span><strong>{libActivationResult.totalActivated}</strong> WPs activated · {libActivationResult.inserted} new · {libActivationResult.updated} updated</span>
                </div>
                {libActivationResult.byPhase && (
                  <div className="flex flex-wrap gap-2 mt-1.5">
                    {Object.entries(libActivationResult.byPhase).map(([phase, count]: any) => (
                      <span key={phase} className="bg-white/10 px-2 py-0.5 rounded text-[10px]">{phase}: <strong>{count}</strong></span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* View toggle + Filters */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex rounded-lg border border-slate-200 overflow-hidden">
              <button onClick={() => setLibView("session")} className={cn("px-3 py-1.5 text-xs font-medium transition-colors", libView === "session" ? "bg-indigo-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50")}>
                <span className="flex items-center gap-1.5"><Zap className="w-3 h-3" />Session WPs ({sessionLibrary.length})</span>
              </button>
              <button onClick={() => setLibView("browse")} className={cn("px-3 py-1.5 text-xs font-medium transition-colors", libView === "browse" ? "bg-indigo-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50")}>
                <span className="flex items-center gap-1.5"><BookOpen className="w-3 h-3" />Full Library ({wpLibrary.length || "240+"})</span>
              </button>
            </div>

            <div className="flex-1 flex gap-2 flex-wrap">
              <input value={libSearch} onChange={(e) => setLibSearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (libView === "browse" ? fetchWpLibrary() : undefined)}
                placeholder="Search code or title..." className="flex-1 min-w-[160px] px-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-indigo-300" />
              <select value={libFamily} onChange={(e) => { setLibFamily(e.target.value); }}
                className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-indigo-300 bg-white">
                <option value="">All Families</option>
                {["A","B","C","D","E","F","G","H","I","J","K","L","M","N","Z"].map((f) => (
                  <option key={f} value={f}>{f} — {{A:"Pre-engagement",B:"Planning",C:"Materiality",D:"Controls",E:"Substantive",F:"Completion",G:"Reporting",H:"QC/EQCR",I:"Pakistan Reg.",J:"Sector",K:"Group/Branch",L:"NGO/Donor",M:"Tax",N:"Data Engine",Z:"Dynamic"}[f] || f}</option>
                ))}
              </select>
              {libView === "browse" && (
                <button onClick={fetchWpLibrary} disabled={libLoading} className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700 disabled:opacity-60">
                  {libLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Search"}
                </button>
              )}
            </div>
          </div>

          {/* Papers list */}
          {libLoading ? (
            <div className="py-12 text-center"><Loader2 className="w-8 h-8 animate-spin text-indigo-400 mx-auto mb-2" /><p className="text-sm text-slate-500">Loading library...</p></div>
          ) : libView === "session" ? (
            <>
              {sessionLibrary.length === 0 ? (
                <div className="py-14 text-center border border-dashed border-slate-200 rounded-2xl">
                  <BookOpen className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                  <p className="text-slate-500 text-sm font-medium">No WPs activated yet</p>
                  <p className="text-slate-400 text-xs mt-1 mb-4">First seed the library, then click "Activate WPs for This Engagement" to trigger context-aware papers based on entity type, risk flags, FS heads, and industry</p>
                  <div className="flex justify-center gap-2">
                    <button onClick={seedLibrary} disabled={libSeeding} className="px-4 py-2 bg-slate-800 text-white text-xs rounded-lg hover:bg-slate-900 disabled:opacity-60 flex items-center gap-1.5">
                      {libSeeding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <BookOpen className="w-3.5 h-3.5" />}Seed Library
                    </button>
                    <button onClick={activateLibrary} disabled={libActivating} className="px-4 py-2 bg-indigo-600 text-white text-xs rounded-lg hover:bg-indigo-700 disabled:opacity-60 flex items-center gap-1.5">
                      {libActivating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}Activate
                    </button>
                  </div>
                </div>
              ) : (
                <WpLibraryList papers={sessionLibrary.filter((p: any) => {
                  if (!libSearch) return !libFamily || p.wpCode?.startsWith(libFamily);
                  const q = libSearch.toLowerCase();
                  return (p.wpCode?.toLowerCase().includes(q) || (p.wpTitle || "").toLowerCase().includes(q)) && (!libFamily || p.wpCode?.startsWith(libFamily));
                })} isSession onStatusChange={updateSessionWp} />
              )}
            </>
          ) : (
            <>
              {wpLibrary.length === 0 ? (
                <div className="py-14 text-center border border-dashed border-slate-200 rounded-2xl">
                  <BookOpen className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                  <p className="text-slate-500 text-sm font-medium">Library not seeded</p>
                  <p className="text-slate-400 text-xs mt-1 mb-4">Click "Seed Library" to load all 384+ ISA/ICAP papers into the database</p>
                  <button onClick={seedLibrary} disabled={libSeeding} className="px-4 py-2 bg-indigo-600 text-white text-xs rounded-lg hover:bg-indigo-700 disabled:opacity-60 flex items-center gap-1.5 mx-auto">
                    {libSeeding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <BookOpen className="w-3.5 h-3.5" />}Seed Library (384+ papers)
                  </button>
                </div>
              ) : (
                <WpLibraryList papers={wpLibrary} isSession={false} onStatusChange={updateSessionWp} />
              )}
            </>
          )}
        </div>
      )}

      {/* ── TAB 9: EXCEPTIONS ─────────────────────────────────────────── */}
      {activeEngineTab === "exceptions" && (
        <div className="space-y-4">
          {/* Header */}
          <div className="bg-gradient-to-r from-red-900 to-rose-800 rounded-2xl p-5 text-white">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h3 className="text-base font-bold flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-red-300" /> ISA EXCEPTION MANAGEMENT</h3>
                <p className="text-red-200 text-xs mt-0.5">Auto-flag unmapped FS lines · low-confidence entries · incomplete mandatory WPs · TB gaps</p>
              </div>
              <button onClick={runExceptionScan} disabled={excScanning} className="px-4 py-2 bg-white/20 hover:bg-white/30 text-white text-xs rounded-xl font-semibold flex items-center gap-1.5 border border-white/20 transition-colors disabled:opacity-60">
                {excScanning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                {excScanning ? "Scanning..." : "Run Exception Scan"}
              </button>
            </div>
            {excScanResult && (
              <div className="mt-3 bg-white/10 rounded-xl px-4 py-2 text-xs flex flex-wrap gap-4">
                <span className="font-semibold">{excScanResult.total} exceptions flagged</span>
                {excScanResult.bySeverity?.critical > 0 && <span className="text-red-300">{excScanResult.bySeverity.critical} Critical</span>}
                {excScanResult.bySeverity?.high > 0 && <span className="text-orange-300">{excScanResult.bySeverity.high} High</span>}
                {excScanResult.bySeverity?.medium > 0 && <span className="text-yellow-300">{excScanResult.bySeverity.medium} Medium</span>}
              </div>
            )}
          </div>

          {/* Counts bar */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: "Critical", count: excCounts.critical || 0, color: "bg-red-50 border-red-200 text-red-700" },
              { label: "High", count: excCounts.high || 0, color: "bg-orange-50 border-orange-200 text-orange-700" },
              { label: "Medium", count: excCounts.medium || 0, color: "bg-amber-50 border-amber-200 text-amber-700" },
              { label: "Resolved", count: excCounts.resolved || 0, color: "bg-emerald-50 border-emerald-200 text-emerald-700" },
            ].map(({ label, count, color }) => (
              <div key={label} className={cn("rounded-xl border p-3 text-center", color)}>
                <div className="text-2xl font-bold">{count}</div>
                <div className="text-xs font-medium mt-0.5">{label}</div>
              </div>
            ))}
          </div>

          {/* Filter tabs */}
          <div className="flex gap-2">
            {(["unresolved", "critical", "all"] as const).map((f) => (
              <button key={f} onClick={() => setExcFilter(f)} className={cn("px-3 py-1.5 text-xs rounded-lg font-medium transition-colors", excFilter === f ? "bg-red-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200")}>
                {f === "unresolved" ? "Unresolved" : f === "critical" ? "Critical Only" : "All"}
              </button>
            ))}
          </div>

          {/* Exception list */}
          {excLoading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-red-400" /></div>
          ) : exceptions.length === 0 ? (
            <div className="py-14 text-center border border-dashed border-slate-200 rounded-2xl">
              <CheckCircle2 className="w-10 h-10 text-emerald-300 mx-auto mb-3" />
              <p className="text-slate-500 text-sm font-medium">No {excFilter === "all" ? "" : excFilter + " "}exceptions found</p>
              <p className="text-slate-400 text-xs mt-1">Run a scan to detect issues across FS, TB, GL, COA, and WPs</p>
            </div>
          ) : (
            <div className="space-y-2">
              {exceptions.map((ex: any) => {
                const SEV: Record<string, string> = { Critical: "bg-red-100 text-red-700 border-red-200", High: "bg-orange-100 text-orange-700 border-orange-200", Medium: "bg-amber-100 text-amber-700 border-amber-200", Low: "bg-slate-100 text-slate-600 border-slate-200", Info: "bg-blue-50 text-blue-600 border-blue-100" };
                return (
                  <div key={ex.id} className={cn("bg-white border rounded-xl p-4", ex.severity === "Critical" ? "border-red-200" : ex.severity === "High" ? "border-orange-200" : "border-slate-200", ex.resolvedFlag && "opacity-60")}>
                    <div className="flex items-start gap-3">
                      <div className="shrink-0 mt-0.5 space-y-1">
                        <span className={cn("text-[10px] px-2 py-0.5 rounded border font-bold block text-center", SEV[ex.severity] || SEV.Low)}>{ex.severity}</span>
                        <span className="text-[9px] font-mono text-slate-400 block text-center">{ex.exceptionCode}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-semibold text-slate-800">{ex.description}</span>
                          {ex.resolvedFlag && <span className="text-[10px] px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full font-semibold">RESOLVED</span>}
                        </div>
                        <div className="flex items-center gap-3 mt-1 flex-wrap text-[10px] text-slate-400">
                          <span className="bg-slate-100 px-2 py-0.5 rounded">{ex.exceptionType}</span>
                          <span>Source: {ex.sourceArea}</span>
                          {ex.referenceCode && <span className="font-mono text-indigo-500">{ex.referenceCode}</span>}
                          {ex.isaReference && <span>{ex.isaReference}</span>}
                        </div>
                        {ex.resolvedFlag && ex.resolutionNote && (
                          <p className="text-[10px] text-emerald-600 mt-1 italic">Resolution: {ex.resolutionNote}</p>
                        )}
                        {!ex.resolvedFlag && resolvingId === ex.id && (
                          <div className="mt-2 flex gap-2">
                            <input value={resolveNote} onChange={e => setResolveNote(e.target.value)} placeholder="Resolution note..." className="flex-1 text-xs border border-slate-200 rounded-lg px-2 py-1" />
                            <button onClick={() => resolveException(ex.id, resolveNote)} className="px-3 py-1 bg-emerald-600 text-white text-xs rounded-lg hover:bg-emerald-700 font-semibold">Mark Resolved</button>
                            <button onClick={() => setResolvingId(null)} className="px-3 py-1 bg-slate-100 text-slate-600 text-xs rounded-lg hover:bg-slate-200">Cancel</button>
                          </div>
                        )}
                      </div>
                      {!ex.resolvedFlag && resolvingId !== ex.id && (
                        <button onClick={() => setResolvingId(ex.id)} className="shrink-0 px-3 py-1.5 text-xs rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 font-medium">Resolve</button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── TAB 10: GENERATE OUTPUT ───────────────────────────────────────── */}
      {activeEngineTab === "generate" && (
        <div className="space-y-4">
          {/* Header */}
          <div className="bg-gradient-to-r from-emerald-900 to-teal-800 rounded-2xl p-5 text-white">
            <h3 className="text-base font-bold flex items-center gap-2"><Download className="w-5 h-5 text-emerald-300" /> OUTPUT GENERATION ENGINE</h3>
            <p className="text-emerald-200 text-xs mt-0.5">Step 1 — Run Validation Gate · Step 2 — Generate TB / GL / WP Index outputs</p>
          </div>

          {/* Step 1: Validation Gate */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={cn("w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white", validation?.generationAllowed ? "bg-emerald-500" : validation ? "bg-red-500" : "bg-slate-300")}>
                  {validation?.generationAllowed ? "✓" : validation ? "✗" : "1"}
                </div>
                <span className="text-sm font-semibold text-slate-800">Validation Gate — ISA Pre-Generation Check</span>
              </div>
              <button onClick={runValidation} disabled={validating} className="px-3 py-1.5 text-xs rounded-lg bg-slate-700 text-white hover:bg-slate-800 font-medium flex items-center gap-1.5 disabled:opacity-60">
                {validating ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                {validating ? "Running..." : "Run Validation"}
              </button>
            </div>
            {validation ? (
              <div className="p-4 space-y-3">
                <div className={cn("flex items-center gap-3 p-3 rounded-xl border", validation.generationAllowed ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200")}>
                  {validation.generationAllowed ? <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" /> : <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />}
                  <div>
                    <p className={cn("text-sm font-semibold", validation.generationAllowed ? "text-emerald-700" : "text-red-700")}>{validation.generationAllowed ? "All checks passed — generation allowed" : "Generation blocked — resolve issues below"}</p>
                    {validation.blockedReasons?.length > 0 && <ul className="mt-1 space-y-0.5">{validation.blockedReasons.map((r: string, i: number) => <li key={i} className="text-xs text-red-600">· {r}</li>)}</ul>}
                  </div>
                </div>
                {/* Individual checks */}
                <div className="grid grid-cols-1 gap-2">
                  {validation.checks && Object.entries(validation.checks).map(([k, v]: [string, any]) => (
                    <div key={k} className={cn("flex items-center gap-3 px-3 py-2 rounded-lg border text-xs", v.pass ? "bg-emerald-50/50 border-emerald-100" : "bg-red-50/50 border-red-100")}>
                      <span className={cn("text-base", v.pass ? "text-emerald-500" : "text-red-500")}>{v.pass ? "✓" : "✗"}</span>
                      <span className="font-medium text-slate-700 w-36 shrink-0">{k.replace(/([A-Z])/g, " $1").replace(/^./, s => s.toUpperCase())}</span>
                      <span className={cn(v.pass ? "text-slate-500" : "text-red-600")}>{v.detail || (v.pass ? "Passed" : "Failed")}</span>
                      {v.missingVars?.length > 0 && <span className="text-red-600 ml-1">Missing: {v.missingVars.join(", ")}</span>}
                    </div>
                  ))}
                </div>
                {/* Warnings */}
                {validation.warnings?.length > 0 && (
                  <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 space-y-1">
                    <p className="text-xs font-semibold text-amber-700 mb-1">Warnings (non-blocking):</p>
                    {validation.warnings.map((w: string, i: number) => <p key={i} className="text-xs text-amber-600">· {w}</p>)}
                  </div>
                )}
              </div>
            ) : (
              <div className="py-8 text-center text-slate-400 text-sm">Click "Run Validation" to check all 6 pre-generation conditions</div>
            )}
          </div>

          {/* Step 2: Generate */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 flex items-center gap-2">
              <div className={cn("w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white", validation?.generationAllowed ? "bg-emerald-500" : "bg-slate-300")}>2</div>
              <span className="text-sm font-semibold text-slate-800">Generate Audit File Output</span>
            </div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { type: "tb_excel", label: "TB Export", desc: "Trial Balance (Excel)", icon: "📊" },
                  { type: "gl_excel", label: "GL Export", desc: "General Ledger (Excel)", icon: "📋" },
                  { type: "wp_index", label: "WP Index", desc: "All WPs phase-wise", icon: "📁" },
                  { type: "full_file", label: "Full File", desc: "TB + GL + WP Index", icon: "📦" },
                ].map(({ type, label, desc, icon }) => (
                  <button key={type} onClick={() => setGenJobType(type)} className={cn("p-3 rounded-xl border text-left transition-all", genJobType === type ? "bg-emerald-50 border-emerald-400 ring-1 ring-emerald-400" : "border-slate-200 hover:border-emerald-200")}>
                    <span className="text-2xl">{icon}</span>
                    <p className="text-xs font-semibold text-slate-800 mt-1">{label}</p>
                    <p className="text-[10px] text-slate-400">{desc}</p>
                  </button>
                ))}
              </div>
              <button onClick={generateOutput} disabled={genLoading || !validation?.generationAllowed} className={cn("w-full py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all", validation?.generationAllowed ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "bg-slate-100 text-slate-400 cursor-not-allowed")}>
                {genLoading ? <><Loader2 className="w-4 h-4 animate-spin" />Generating...</> : <><Download className="w-4 h-4" />Generate {genJobType === "tb_excel" ? "Trial Balance" : genJobType === "gl_excel" ? "General Ledger" : genJobType === "wp_index" ? "WP Index" : "Full Audit File"}</>}
              </button>
              {!validation?.generationAllowed && <p className="text-center text-xs text-slate-400">Run and pass the validation gate first</p>}
            </div>
          </div>

          {/* Generation result */}
          {genResult && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 space-y-2">
              <p className="text-sm font-semibold text-emerald-700 flex items-center gap-2"><CheckCircle2 className="w-4 h-4" />Output generated — Job #{genResult.jobId}</p>
              {genResult.output && (
                <div className="grid grid-cols-3 gap-3 mt-2">
                  <div className="bg-white border border-emerald-100 rounded-xl p-3 text-center"><div className="text-xl font-bold text-emerald-700">{genResult.output.tb?.totalAccounts}</div><div className="text-[10px] text-slate-500">TB Accounts</div></div>
                  <div className="bg-white border border-emerald-100 rounded-xl p-3 text-center"><div className="text-xl font-bold text-teal-700">{genResult.output.gl?.totalTransactions}</div><div className="text-[10px] text-slate-500">GL Transactions</div></div>
                  <div className="bg-white border border-emerald-100 rounded-xl p-3 text-center"><div className="text-xl font-bold text-indigo-700">{genResult.output.wpIndex?.totalWps}</div><div className="text-[10px] text-slate-500">WPs in Index</div></div>
                </div>
              )}
            </div>
          )}

          {/* Output job history */}
          {outputJobs.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <div className="bg-slate-50 border-b border-slate-100 px-4 py-2.5"><span className="text-xs font-semibold text-slate-700">Previous Output Jobs</span></div>
              <div className="divide-y divide-slate-50">
                {outputJobs.slice(0, 8).map((job: any) => (
                  <div key={job.id} className="px-4 py-2.5 flex items-center gap-3 text-xs">
                    <span className={cn("px-2 py-0.5 rounded font-semibold", job.status === "complete" ? "bg-emerald-100 text-emerald-700" : job.status === "running" ? "bg-blue-100 text-blue-700" : "bg-red-100 text-red-700")}>{job.status}</span>
                    <span className="font-mono text-slate-500">{job.jobType}</span>
                    <span className="text-slate-400">{job.recordCount ? `${job.recordCount} records` : ""}</span>
                    <span className="text-slate-300 ml-auto">{job.triggeredBy}</span>
                    <span className="text-slate-300">{job.createdAt ? new Date(job.createdAt).toLocaleString("en-PK", { dateStyle: "short", timeStyle: "short" }) : "—"}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── TAB 11: LOCK & ARCHIVE (ISA 230) ─────────────────────────────── */}
      {activeEngineTab === "lock" && (
        <div className="space-y-4">
          {/* Header */}
          <div className="bg-gradient-to-r from-slate-900 to-slate-800 rounded-2xl p-5 text-white">
            <h3 className="text-base font-bold flex items-center gap-2"><Lock className="w-5 h-5 text-slate-300" /> SESSION LOCK & ARCHIVE — ISA 230</h3>
            <p className="text-slate-400 text-xs mt-0.5">Partner approval lock · 7-year ICAP retention · No overwrite after lock · EQCR completion tracking</p>
          </div>

          {/* Lock status */}
          {lockLoading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
          ) : lockStatus?.locked ? (
            <div className="bg-emerald-50 border-2 border-emerald-400 rounded-2xl p-5 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-500 rounded-full flex items-center justify-center shrink-0"><Lock className="w-5 h-5 text-white" /></div>
                <div>
                  <p className="text-sm font-bold text-emerald-800">Session Locked — ISA 230 Compliant</p>
                  <p className="text-xs text-emerald-600">No further edits permitted without EQCR override</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="bg-white border border-emerald-100 rounded-xl p-3"><span className="text-slate-400 block">Locked by</span><span className="font-semibold text-slate-800">{lockStatus.lock.lockedBy}</span></div>
                <div className="bg-white border border-emerald-100 rounded-xl p-3"><span className="text-slate-400 block">Lock level</span><span className="font-semibold text-slate-800">{lockStatus.lock.lockLevel}</span></div>
                <div className="bg-white border border-emerald-100 rounded-xl p-3"><span className="text-slate-400 block">Archive ref (ISA 230)</span><span className="font-mono text-indigo-600 text-[11px]">{lockStatus.lock.archiveRef}</span></div>
                <div className="bg-white border border-emerald-100 rounded-xl p-3"><span className="text-slate-400 block">Retention until</span><span className="font-semibold text-slate-800">{lockStatus.lock.retentionEndDate}</span></div>
                <div className="bg-white border border-emerald-100 rounded-xl p-3"><span className="text-slate-400 block">EQCR completed</span><span className={cn("font-semibold", lockStatus.lock.eqcrCompleted ? "text-emerald-700" : "text-amber-600")}>{lockStatus.lock.eqcrCompleted ? "Yes" : "Pending"}</span></div>
                <div className="bg-white border border-emerald-100 rounded-xl p-3"><span className="text-slate-400 block">Locked at</span><span className="font-semibold text-slate-800">{lockStatus.lock.lockedAt ? new Date(lockStatus.lock.lockedAt).toLocaleDateString("en-PK") : "—"}</span></div>
              </div>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <div className="bg-amber-50 border-b border-amber-100 px-4 py-3 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                <span className="text-sm font-semibold text-amber-800">Session not locked — apply partner approval to archive</span>
              </div>
              <div className="p-4 space-y-4">
                <p className="text-xs text-slate-500">Under ISA 230, the audit file must be locked after partner approval. No documentation may be added, deleted or modified after the assembly date.</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-slate-600 block mb-1">Partner name <span className="text-red-500">*</span></label>
                    <input value={lockForm.lockedBy} onChange={e => setLockForm(f => ({ ...f, lockedBy: e.target.value }))} placeholder="e.g. Muhammad Alam" className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-slate-400" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600 block mb-1">Lock level</label>
                    <select value={lockForm.lockLevel} onChange={e => setLockForm(f => ({ ...f, lockLevel: e.target.value }))} className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2">
                      {["Partner", "Manager", "EQCR"].map(l => <option key={l} value={l}>{l}</option>)}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs font-medium text-slate-600 block mb-1">Lock justification</label>
                    <input value={lockForm.lockJustification} onChange={e => setLockForm(f => ({ ...f, lockJustification: e.target.value }))} placeholder="e.g. Audit completed and all SQC criteria satisfied" className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600 block mb-1">Archive reference (optional)</label>
                    <input value={lockForm.archiveRef} onChange={e => setLockForm(f => ({ ...f, archiveRef: e.target.value }))} placeholder="e.g. ANA-2025-001" className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600 block mb-1">EQCR reviewer (if applicable)</label>
                    <input value={lockForm.eqcrBy} onChange={e => setLockForm(f => ({ ...f, eqcrBy: e.target.value }))} placeholder="e.g. Aulakh" className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2" />
                  </div>
                </div>
                {lockResult?.error && <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700">{lockResult.error}</div>}
                <button onClick={lockSession} disabled={locking || !lockForm.lockedBy} className="w-full py-3 bg-slate-900 hover:bg-slate-700 text-white text-sm font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-50">
                  {locking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                  {locking ? "Locking session..." : "Lock Session — ISA 230 Archive"}
                </button>
                <p className="text-center text-[10px] text-slate-400">Requires: all critical exceptions resolved · retention: 7 years (ICAP)</p>
              </div>
            </div>
          )}

          {/* ISA 230 Audit Trail */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="bg-slate-50 border-b border-slate-100 px-4 py-2.5 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700 flex items-center gap-1.5"><ClipboardCheck className="w-3.5 h-3.5" />ISA 230 Audit Trail</span>
              <button onClick={fetchAuditTrail} disabled={trailLoading} className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1">
                {trailLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}Refresh
              </button>
            </div>
            {trailLoading ? (
              <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-slate-300" /></div>
            ) : auditTrail.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-xs">No audit trail events yet — approve WPs, run validations, or generate outputs to populate</div>
            ) : (
              <div className="divide-y divide-slate-50 max-h-96 overflow-y-auto">
                {auditTrail.map((event: any, i: number) => {
                  const typeStyle: Record<string, string> = { WP_PREPARED: "bg-amber-100 text-amber-700", WP_REVIEWED: "bg-violet-100 text-violet-700", WP_APPROVED: "bg-emerald-100 text-emerald-700", VALIDATION_RUN: "bg-blue-100 text-blue-700", OUTPUT_GENERATED: "bg-teal-100 text-teal-700", SESSION_LOCKED: "bg-slate-800 text-white", SESSION_UNLOCKED: "bg-orange-100 text-orange-700" };
                  return (
                    <div key={i} className="px-4 py-2.5 flex items-start gap-3 text-xs">
                      <span className="text-slate-300 shrink-0 mt-0.5 tabular-nums">{event.timestamp ? new Date(event.timestamp).toLocaleString("en-PK", { dateStyle: "short", timeStyle: "short" }) : "—"}</span>
                      <span className={cn("px-2 py-0.5 rounded text-[10px] font-semibold shrink-0", typeStyle[event.type] || "bg-slate-100 text-slate-600")}>{event.type?.replace(/_/g, " ")}</span>
                      <span className="text-slate-700 flex-1">{event.detail}</span>
                      <span className="text-slate-400 shrink-0">{event.actor}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function WpLibraryList({ papers, isSession, onStatusChange }: { papers: any[]; isSession: boolean; onStatusChange?: (code: string, payload: any) => void }) {
  const PHASE_COLORS: Record<string, string> = {
    "Pre-engagement": "bg-blue-100 text-blue-700",
    "Planning": "bg-violet-100 text-violet-700",
    "Execution": "bg-indigo-100 text-indigo-700",
    "Completion": "bg-amber-100 text-amber-700",
    "Reporting": "bg-orange-100 text-orange-700",
    "QC": "bg-rose-100 text-rose-700",
    "Regulatory": "bg-teal-100 text-teal-700",
  };
  const CAT_COLORS: Record<string, string> = {
    "Checklist": "border-emerald-200 text-emerald-700 bg-emerald-50",
    "Memo": "border-blue-200 text-blue-700 bg-blue-50",
    "Lead schedule": "border-indigo-200 text-indigo-700 bg-indigo-50",
    "Reconciliation": "border-amber-200 text-amber-700 bg-amber-50",
    "Analytics": "border-teal-200 text-teal-700 bg-teal-50",
    "Confirmation": "border-violet-200 text-violet-700 bg-violet-50",
    "Report": "border-orange-200 text-orange-700 bg-orange-50",
    "Representation": "border-rose-200 text-rose-700 bg-rose-50",
    "ToD": "border-sky-200 text-sky-700 bg-sky-50",
    "ToC": "border-cyan-200 text-cyan-700 bg-cyan-50",
  };
  const STATUS_COLORS: Record<string, string> = {
    "Pending": "bg-slate-100 text-slate-600",
    "In Progress": "bg-blue-100 text-blue-700",
    "Prepared": "bg-amber-100 text-amber-700",
    "Reviewed": "bg-violet-100 text-violet-700",
    "Approved": "bg-emerald-100 text-emerald-700",
    "N/A": "bg-slate-50 text-slate-400",
  };

  // Group by phase
  const grouped = papers.reduce((acc: any, p: any) => {
    const ph = p.wpPhase || "Other";
    if (!acc[ph]) acc[ph] = [];
    acc[ph].push(p);
    return acc;
  }, {});

  const PHASE_ORDER = ["Pre-engagement","Planning","Execution","Completion","Reporting","QC","Regulatory","Other"];

  return (
    <div className="space-y-4">
      {PHASE_ORDER.filter((ph) => grouped[ph]?.length > 0).map((phase) => (
        <div key={phase} className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className={cn("px-4 py-2.5 flex items-center justify-between border-b border-slate-100", PHASE_COLORS[phase] || "bg-slate-50 text-slate-700")}>
            <span className="font-semibold text-sm">{phase}</span>
            <span className="text-xs font-medium opacity-75">{grouped[phase].length} paper{grouped[phase].length !== 1 ? "s" : ""}</span>
          </div>
          <div className="divide-y divide-slate-50">
            {grouped[phase].map((p: any) => (
              <div key={p.wpCode} className={cn("px-4 py-3 hover:bg-slate-50/60 transition-colors", p.mandatoryFlag && "border-l-2 border-l-red-400")}>
                <div className="flex items-start gap-3">
                  <div className="shrink-0 mt-0.5">
                    <span className="text-[11px] font-mono font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">{p.wpCode}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-2 flex-wrap">
                      <span className="text-sm font-medium text-slate-800 leading-tight">{p.wpTitle}</span>
                      {p.mandatoryFlag && <span className="text-[9px] px-1.5 py-0.5 bg-red-100 text-red-700 rounded font-semibold shrink-0">MANDATORY</span>}
                    </div>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      {p.wpCategory && <span className={cn("text-[10px] px-2 py-0.5 rounded border font-medium", CAT_COLORS[p.wpCategory] || "border-slate-200 text-slate-500 bg-slate-50")}>{p.wpCategory}</span>}
                      {p.isaReference && <span className="text-[10px] text-slate-400 font-mono">{p.isaReference}</span>}
                      {p.reviewerLevel && <span className="text-[10px] text-slate-400">· {p.reviewerLevel}</span>}
                      {p.outputFormat && <span className="text-[10px] text-slate-400">· {p.outputFormat}</span>}
                      {p.autoGenerateFlag && <span className="text-[10px] px-1.5 py-0.5 bg-violet-50 text-violet-600 rounded border border-violet-100 font-medium">AI Auto-gen</span>}
                    </div>
                    {p.linkedAssertion && (
                      <div className="flex gap-1 mt-1.5 flex-wrap">
                        {p.linkedAssertion.split(",").map((a: string) => (
                          <span key={a} className="text-[9px] px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded border border-blue-100">{a.trim()}</span>
                        ))}
                      </div>
                    )}
                    {isSession && p.triggerReason && (
                      <p className="text-[10px] text-slate-400 mt-1 italic">Triggered by: {p.triggerReason.split(" | ").slice(0, 3).join(" · ")}</p>
                    )}
                  </div>
                  {isSession && (
                    <div className="shrink-0">
                      <select value={p.status || "Pending"} onChange={(e) => onStatusChange?.(p.wpCode, { status: e.target.value })}
                        className={cn("text-[10px] px-2 py-1 rounded-lg border-0 font-medium cursor-pointer", STATUS_COLORS[p.status] || "bg-slate-100 text-slate-600")}>
                        {["Pending","In Progress","Prepared","Reviewed","Approved","N/A"].map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
      {papers.length === 0 && (
        <div className="py-10 text-center text-slate-400 text-sm">No papers match the current filter.</div>
      )}
    </div>
  );
}

function ArrangedDataStage({ data, activeTab, setActiveTab, onFetch, onApproveAll, onNext, loading, confidenceBadge }: any) {
  useEffect(() => { if (!data) onFetch(); }, []);

  if (!data) return (
    <div className="text-center py-16">
      <div className="w-14 h-14 rounded-2xl bg-slate-100 mx-auto mb-4 flex items-center justify-center">
        <Loader2 className="w-7 h-7 animate-spin text-blue-600" />
      </div>
      <p className="text-slate-600 font-medium">Loading arranged data...</p>
      <p className="text-xs text-slate-400 mt-1">Organizing extracted fields by category</p>
    </div>
  );

  const tabs = data.tabNames || [];
  const tabData = data.tabs || {};
  const currentTabData = activeTab ? tabData[activeTab] || [] : [];
  const approvedCount = currentTabData.filter((r: any) => r.isApproved).length;
  const totalCount = currentTabData.length;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
            <Layers className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-900">{tabs.length}</p>
            <p className="text-xs text-slate-500">Data Tabs</p>
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-900">{approvedCount}/{totalCount}</p>
            <p className="text-xs text-slate-500">Approved in Tab</p>
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center shrink-0">
            <Gauge className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-900">{totalCount > 0 ? Math.round((approvedCount / totalCount) * 100) : 0}%</p>
            <p className="text-xs text-slate-500">Completion</p>
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-indigo-50 to-purple-50/50 px-5 py-4 border-b border-slate-200/60 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="font-semibold text-slate-900 flex items-center gap-2">
              <Layers className="w-5 h-5 text-indigo-600" /> Arranged Data Review
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">Review and approve AI-organized fields by category</p>
          </div>
          <div className="flex gap-2 self-start">
            <Button variant="outline" size="sm" onClick={onFetch}>
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
            </Button>
            <Button size="sm" onClick={onApproveAll} disabled={loading} className="bg-emerald-600 hover:bg-emerald-700">
              <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" /> Approve All
            </Button>
          </div>
        </div>

        <div className="flex gap-1 overflow-x-auto p-3 border-b border-slate-100 bg-slate-50/50 scrollbar-hide">
          {tabs.map((t: string) => {
            const count = tabData[t]?.length || 0;
            const approved = tabData[t]?.filter((r: any) => r.isApproved).length || 0;
            return (
              <button
                key={t}
                className={cn(
                  "px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-all flex items-center gap-1.5",
                  activeTab === t
                    ? "bg-white text-slate-900 shadow-sm border border-slate-200"
                    : "text-slate-500 hover:bg-white/80 hover:text-slate-700",
                )}
                onClick={() => setActiveTab(t)}
              >
                {t}
                {count > 0 && (
                  <span className={cn("px-1.5 py-0.5 rounded-full text-[10px] font-semibold",
                    approved === count ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
                  )}>{approved}/{count}</span>
                )}
              </button>
            );
          })}
        </div>

        <div className="p-0">
          {activeTab && tabData[activeTab] ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Field</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Value</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider hidden sm:table-cell">Confidence</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider hidden md:table-cell">Source</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider w-20">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(tabData[activeTab] || []).map((row: any, i: number) => (
                    <tr key={row.id || i} className={cn("transition-colors", row.isApproved ? "bg-emerald-50/30" : "hover:bg-slate-50/50")}>
                      <td className="px-4 py-3">
                        <span className="font-medium text-slate-900 text-sm">{(row.fieldName || "").replace(/_/g, " ")}</span>
                      </td>
                      <td className="px-4 py-3 max-w-xs">
                        <span className="text-sm text-slate-700 truncate block">{row.finalApprovedValue || row.extractedValue || "—"}</span>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">{confidenceBadge(row.confidence)}</td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className="text-xs text-slate-400 truncate block max-w-[150px]">{row.sourceFile || "—"}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {row.isApproved ? (
                          <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-emerald-100">
                            <Check className="w-4 h-4 text-emerald-600" />
                          </span>
                        ) : (
                          <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-slate-100">
                            <Clock className="w-4 h-4 text-slate-400" />
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {(!tabData[activeTab] || tabData[activeTab].length === 0) && (
                    <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400 text-sm">No data in this tab</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12 text-slate-400">
              <Layers className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Select a tab to view arranged data</p>
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={onNext} size="lg" disabled={loading} className="px-6 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-md shadow-blue-200/50">
          {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Zap className="w-4 h-4 mr-2" />}
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
  const v = (val || "").toLowerCase().replace(/_/g, " ");
  if (["completed","exported","approved","locked","reviewed","arranged data"].includes(v)) return "bg-green-100 text-green-800 border-green-300";
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

function VariablesStage({ variables, grouped, stats, changeLog, editingVar, editValue, editReason, setEditingVar, setEditValue, setEditReason, onSave, onReview, onReviewAll, onFetch, onLockAll, onLockSection, onValidate, loading, confidenceBadge }: any) {
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
    <div className="space-y-5">
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: "Total", value: stats.total, icon: Settings2, bg: "bg-slate-50", iconColor: "text-slate-600", filterKey: "all" },
            { label: "Filled", value: stats.filled, icon: CheckCircle2, bg: "bg-emerald-50", iconColor: "text-emerald-600", filterKey: "reviewed" },
            { label: "Missing", value: stats.missing, icon: AlertCircle, bg: "bg-red-50", iconColor: "text-red-600", filterKey: "missing" },
            { label: "Low Conf.", value: stats.lowConfidence, icon: AlertTriangle, bg: "bg-amber-50", iconColor: "text-amber-600", filterKey: "low_confidence" },
            { label: "Review", value: stats.needsReview, icon: Eye, bg: "bg-purple-50", iconColor: "text-purple-600", filterKey: "needs_review" },
            { label: "Locked", value: stats.locked, icon: Lock, bg: "bg-blue-50", iconColor: "text-blue-600", filterKey: "locked" },
          ].map(s => (
            <button key={s.label} onClick={() => setFilter(s.filterKey)} className={cn(
              "bg-white border rounded-xl p-3 text-center transition-all hover:shadow-md cursor-pointer",
              filter === s.filterKey ? "ring-2 ring-blue-500 ring-offset-1 border-blue-200 shadow-sm" : "border-slate-200"
            )}>
              <div className={cn("w-8 h-8 rounded-lg mx-auto mb-1.5 flex items-center justify-center", s.bg)}>
                <s.icon className={cn("w-4 h-4", s.iconColor)} />
              </div>
              <p className="text-xl font-bold text-slate-900">{s.value}</p>
              <p className="text-[10px] text-slate-500 font-medium mt-0.5">{s.label}</p>
            </button>
          ))}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-emerald-50 to-blue-50/50 px-5 py-4 border-b border-slate-200/60">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="font-semibold text-slate-900 flex items-center gap-2">
                <Settings2 className="w-5 h-5 text-emerald-600" /> Audit Variable Register
                {stats && <span className="text-xs font-normal text-slate-500 ml-1">({stats.filled}/{stats.total} filled)</span>}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">Review, edit and lock audit variables before generation</p>
            </div>
            <div className="flex gap-2 flex-wrap self-start">
              <Button variant="outline" size="sm" onClick={onFetch} className="h-8">
                <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh
              </Button>
              <Button variant="outline" size="sm" onClick={runValidation} className="h-8">
                <Shield className="w-3.5 h-3.5 mr-1" /> Validate
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowAuditTrail(!showAuditTrail)} className="h-8">
                <ClipboardCheck className="w-3.5 h-3.5 mr-1" /> Trail ({changeLog.length})
              </Button>
              <Button size="sm" onClick={onReviewAll} disabled={loading} className="h-8 bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-600 hover:to-indigo-600 shadow-sm">
                <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Review All
              </Button>
              <Button size="sm" onClick={onLockAll} disabled={loading} className="h-8 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 shadow-sm">
                <Lock className="w-3.5 h-3.5 mr-1" /> Lock All
              </Button>
            </div>
          </div>
        </div>

        <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/30">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1 sm:max-w-xs">
              <Input className="h-8 text-sm pl-8" placeholder="Search variables..." value={search} onChange={e => setSearch(e.target.value)} />
              <Settings2 className="w-3.5 h-3.5 absolute left-2.5 top-2 text-slate-400" />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {["all", "mandatory", "missing", "low_confidence", "needs_review", "reviewed", "locked"].map(f => (
                <button key={f} onClick={() => setFilter(f)} className={cn(
                  "px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all",
                  filter === f
                    ? "bg-slate-900 text-white shadow-sm"
                    : "bg-white text-slate-500 border border-slate-200 hover:bg-slate-50"
                )}>
                  {f.replace(/_/g, " ").replace(/^\w/, c => c.toUpperCase())}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="p-4 sm:p-5 space-y-3">
          {validationIssues.length > 0 && (
            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl">
              <h3 className="text-xs font-semibold text-amber-900 mb-2.5 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" /> Validation Issues ({validationIssues.length})
              </h3>
              <div className="space-y-1.5 max-h-32 overflow-y-auto">
                {validationIssues.map((issue: any, i: number) => (
                  <div key={i} className="text-xs flex items-center gap-2 p-2 bg-white/60 rounded-lg border border-amber-100">
                    <span className={cn("w-2 h-2 rounded-full shrink-0", issue.severity === "high" ? "bg-red-500" : issue.severity === "medium" ? "bg-amber-500" : "bg-blue-500")} />
                    <span className="font-medium text-slate-800">{issue.label}</span>
                    <span className="text-slate-500">{issue.issue}</span>
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
              <div key={groupName} className={cn("border rounded-xl overflow-hidden transition-all", allLocked ? "border-emerald-200" : "border-slate-200")}>
                <button onClick={() => toggleGroup(groupName)} className={cn(
                  "w-full flex items-center justify-between p-3.5 sm:p-4 transition-colors",
                  allLocked ? "bg-emerald-50/50 hover:bg-emerald-50" : "bg-slate-50/50 hover:bg-slate-50"
                )}>
                  <div className="flex items-center gap-2.5">
                    <div className={cn("w-6 h-6 rounded-md flex items-center justify-center transition-transform", isExpanded && "rotate-0")}>
                      {isExpanded ? <ChevronDown className="w-4 h-4 text-slate-600" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                    </div>
                    <span className="font-semibold text-sm text-slate-900">{groupName}</span>
                    {allLocked && <span className="text-[10px] px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full font-medium flex items-center gap-1"><Lock className="w-3 h-3" /> Locked</span>}
                  </div>
                  <div className="flex items-center gap-2 sm:gap-3">
                    <div className="hidden sm:flex items-center gap-1.5">
                      <div className="w-20 h-2 bg-slate-200 rounded-full overflow-hidden">
                        <div className={cn("h-full rounded-full transition-all", pct === 100 ? "bg-emerald-500" : pct > 50 ? "bg-blue-500" : "bg-amber-500")} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs text-slate-500 w-8 text-right tabular-nums">{pct}%</span>
                    </div>
                    <span className="text-xs text-slate-500 bg-white px-2 py-0.5 rounded-md border border-slate-100">{gs.filled}/{gs.total}</span>
                    {gs.missing > 0 && <span className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">{gs.missing} missing</span>}
                    {!allLocked && (
                      <Button variant="ghost" size="sm" className="h-7 text-xs px-2.5 hover:bg-amber-50 hover:text-amber-700" onClick={(e) => { e.stopPropagation(); onLockSection(groupName); }}>
                        <Lock className="w-3 h-3 mr-1" /> Lock
                      </Button>
                    )}
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-slate-100">
                    {Object.entries(groupData.subgroups || {}).map(([subName, subVars]: any) => {
                      const filtered = subVars.filter(filterVar);
                      if (filtered.length === 0) return null;
                      return (
                        <div key={subName} className="border-b border-slate-100 last:border-b-0">
                          <div className="px-4 py-2 bg-slate-50/80">
                            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{subName}</span>
                          </div>
                          <div className="divide-y divide-slate-100">
                            {filtered.map((v: any) => {
                              const def = v.definition;
                              const isMandatory = def?.mandatoryFlag;
                              const isEditing = editingVar === v.id;
                              const isEmpty = !v.finalValue || v.finalValue.trim() === "";
                              const isLowConf = v.confidence && Number(v.confidence) < 70;

                              return (
                                <div key={v.id} className={cn(
                                  "flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-3 px-4 py-3 transition-colors",
                                  v.isLocked ? "bg-emerald-50/30 border-l-3 border-l-emerald-400" :
                                  isEmpty ? "bg-red-50/20 border-l-3 border-l-red-300" :
                                  isLowConf ? "bg-amber-50/20 border-l-3 border-l-amber-300" :
                                  v.reviewStatus === "needs_review" ? "bg-purple-50/20 border-l-3 border-l-purple-300" :
                                  "hover:bg-slate-50/50 border-l-3 border-l-transparent"
                                )}>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <p className="text-sm font-medium leading-tight text-slate-900">{def?.variableLabel || (v.variableName || "").replace(/_/g, " ")}</p>
                                      {isMandatory && <span className="text-[9px] bg-red-100 text-red-700 px-1.5 py-px rounded-full font-bold tracking-wide">REQ</span>}
                                      {v.reviewStatus === "needs_review" && <span className="text-[9px] bg-purple-100 text-purple-700 px-1.5 py-px rounded-full font-semibold">REVIEW</span>}
                                      {def?.aiExtractableFlag && <span className="text-[9px] bg-blue-50 text-blue-600 px-1.5 py-px rounded-full border border-blue-100">AI</span>}
                                      {def?.standardReference && <span className="text-[9px] text-slate-400 bg-slate-50 px-1.5 py-px rounded-full border border-slate-100 hidden sm:inline">{def.standardReference}</span>}
                                      {def?.pakistanReference && <span className="text-[9px] text-slate-400 bg-slate-50 px-1.5 py-px rounded-full border border-slate-100 hidden sm:inline">{def.pakistanReference}</span>}
                                    </div>

                                    {isEditing ? (
                                      <div className="mt-2.5 space-y-2.5">
                                        <RenderEditInput def={def} value={editValue} onChange={setEditValue} />
                                        <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center pt-1">
                                          <Input className="h-8 text-xs w-full sm:w-48 placeholder:text-slate-400" value={editReason} onChange={e => setEditReason(e.target.value)} placeholder="Reason for change..." />
                                          <div className="flex gap-1.5">
                                            <Button size="sm" variant="default" className="h-8 text-xs px-3 bg-blue-600 hover:bg-blue-700" onClick={() => onSave(v.id)}><Save className="w-3 h-3 mr-1" /> Save</Button>
                                            <Button size="sm" variant="ghost" className="h-8 text-xs px-2.5" onClick={() => setEditingVar(null)}>Cancel</Button>
                                          </div>
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="mt-1">
                                        <RenderDisplayValue def={def} value={v.finalValue || v.autoFilledValue || ""} sourceType={v.sourceType} />
                                      </div>
                                    )}
                                  </div>

                                  <div className="flex items-center gap-1.5 shrink-0 sm:pt-0.5 self-end sm:self-start">
                                    {confidenceBadge(v.confidence ? Number(v.confidence) : null)}
                                    {v.reviewStatus === "needs_review" && !v.isLocked && (
                                      <button onClick={() => onReview(v.id)} className="px-2.5 py-1 rounded-lg text-[10px] font-semibold bg-purple-100 text-purple-700 hover:bg-purple-200 transition-colors border border-purple-200" title="Mark as reviewed">
                                        <Check className="w-3 h-3 inline mr-0.5" /> Review
                                      </button>
                                    )}
                                    {v.isLocked ? (
                                      <div className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center">
                                        <Lock className="w-3.5 h-3.5 text-emerald-600" />
                                      </div>
                                    ) : (
                                      <button onClick={() => { setEditingVar(v.id); setEditValue(v.finalValue || ""); setEditReason(""); }} className="p-1.5 rounded-lg hover:bg-blue-50 transition-colors border border-transparent hover:border-blue-200">
                                        <Pencil className="w-3.5 h-3.5 text-slate-400 hover:text-blue-600" />
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
            <div className="text-center py-12">
              <div className="w-16 h-16 rounded-2xl bg-slate-100 mx-auto mb-4 flex items-center justify-center">
                <Settings2 className="w-8 h-8 text-slate-300" />
              </div>
              <p className="text-slate-500 font-medium">No variables yet</p>
              <p className="text-xs text-slate-400 mt-1">Go back to run extraction and auto-fill</p>
            </div>
          )}

          {showAuditTrail && changeLog.length > 0 && (
            <div className="mt-4 bg-slate-50 border border-slate-200 rounded-xl p-4">
              <h3 className="text-xs font-semibold text-slate-700 mb-3 flex items-center gap-2 uppercase tracking-wider">
                <ClipboardCheck className="w-4 h-4 text-slate-500" /> Audit Trail ({changeLog.length} changes)
              </h3>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {changeLog.map((c: any) => (
                  <div key={c.id} className="text-xs flex flex-wrap gap-2 sm:gap-3 p-2.5 rounded-lg bg-white border border-slate-100 items-center">
                    <span className="font-mono text-slate-400 text-[10px]">{c.variableCode || c.fieldName}</span>
                    <span className="font-medium text-slate-700">{(c.fieldName || "").replace(/_/g, " ")}</span>
                    <span className="text-red-500 line-through bg-red-50 px-1.5 py-0.5 rounded">{c.oldValue || "—"}</span>
                    <ArrowRight className="w-3 h-3 text-slate-300" />
                    <span className="text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">{c.newValue}</span>
                    {c.reason && <span className="text-slate-400 italic">({c.reason})</span>}
                    {c.sourceOfChange && <span className="text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded text-[10px]">[{c.sourceOfChange}]</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function GenerationStage({ heads, session, exceptions, onGenerate, onGenerateTbGl, tbGlProgress, onApprove, onExport, onAutoProcessAll, onResolveException, loading, onRefresh, autoChainRunning, autoChainCurrentHead, onStopChain }: any) {
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

  const tbGlStages: { stage: string; status: "pending" | "ok" | "warn" | "fail"; detail: string }[] =
    tbGlProgress?.stages || [];

  const stageStatusIcon = (s: string) => {
    if (s === "ok") return <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />;
    if (s === "warn") return <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />;
    if (s === "fail") return <X className="w-4 h-4 text-red-500 shrink-0" />;
    if (tbGlProgress?.running) return <Loader2 className="w-4 h-4 text-blue-400 animate-spin shrink-0" />;
    return <div className="w-4 h-4 rounded-full border-2 border-slate-200 shrink-0" />;
  };

  return (
    <div className="space-y-5">

      {/* ── Unified TB & GL Engine Panel ────────────────────────────────── */}
      <div className={cn(
        "rounded-xl border overflow-hidden transition-all",
        tbGlProgress?.result?.status === "complete" ? "border-emerald-200 bg-emerald-50/30" :
        tbGlProgress?.result?.status === "complete_with_warnings" ? "border-amber-200 bg-amber-50/20" :
        tbGlProgress?.result?.status === "error" ? "border-red-200 bg-red-50/20" :
        "border-blue-200 bg-blue-50/20"
      )}>
        <div className="px-4 py-3.5 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center shrink-0 shadow-sm">
              <Play className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="font-semibold text-slate-900 text-sm">Generate TB & GL</p>
              <p className="text-[11px] text-slate-500">Full pipeline: CoA Mapping → Trial Balance → General Ledger → 3-Way Reconciliation</p>
            </div>
          </div>
          <Button
            onClick={onGenerateTbGl}
            disabled={loading || tbGlProgress?.running}
            className="h-9 px-4 bg-blue-600 hover:bg-blue-700 text-white shadow-sm text-sm font-medium shrink-0"
          >
            {tbGlProgress?.running
              ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Generating...</>
              : tbGlProgress?.result
              ? <><RefreshCw className="w-4 h-4 mr-2" /> Re-generate</>
              : <><Play className="w-4 h-4 mr-2" /> Generate TB & GL</>
            }
          </Button>
        </div>

        {(tbGlProgress?.running || tbGlStages.length > 0) && (
          <div className="border-t border-slate-100 px-4 py-3 bg-white/60">
            <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
              {(tbGlStages.length > 0
                ? tbGlStages
                : ["Input Extraction","Trial Balance","General Ledger","Reconciliation","Enforcement Check"].map(s => ({ stage: s, status: "pending" as const, detail: "Waiting..." }))
              ).map((s: any, idx: number) => (
                <div key={idx} className="flex items-center gap-2 flex-1 min-w-0">
                  {stageStatusIcon(s.status)}
                  <div className="min-w-0 flex-1">
                    <p className={cn("text-xs font-medium truncate",
                      s.status === "ok" ? "text-emerald-700" :
                      s.status === "fail" ? "text-red-600" :
                      s.status === "warn" ? "text-amber-700" : "text-slate-500"
                    )}>
                      {s.stage}
                    </p>
                    {s.detail && s.detail !== "Waiting..." && (
                      <p className="text-[10px] text-slate-400 truncate leading-tight">{s.detail}</p>
                    )}
                  </div>
                  {idx < 4 && <div className="hidden sm:block w-5 h-px bg-slate-200 shrink-0 mx-1" />}
                </div>
              ))}
            </div>
          </div>
        )}

        {tbGlProgress?.result && (
          <div className="border-t border-slate-100 px-4 py-3 bg-white/40 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="text-center">
              <p className="text-lg font-bold text-slate-900">{tbGlProgress.result.tb?.lineCount ?? "—"}</p>
              <p className="text-[10px] text-slate-500">TB Accounts</p>
            </div>
            <div className="text-center">
              <p className={cn("text-lg font-bold", tbGlProgress.result.tb?.balanced ? "text-emerald-600" : "text-red-600")}>
                {tbGlProgress.result.tb?.balanced ? "Balanced ✓" : "Imbalanced ✗"}
              </p>
              <p className="text-[10px] text-slate-500">TB Status</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-slate-900">{tbGlProgress.result.gl?.accounts ?? "—"}</p>
              <p className="text-[10px] text-slate-500">GL Accounts</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-slate-900">{tbGlProgress.result.gl?.entries ?? "—"}</p>
              <p className="text-[10px] text-slate-500">GL Entries</p>
            </div>
          </div>
        )}
      </div>
      {/* ── End Unified Panel ───────────────────────────────────────────── */}

      {/* ── Auto-chain progress banner ──────────────────────────────────── */}
      {autoChainRunning && (
        <div className="flex items-center gap-3 bg-blue-600 text-white rounded-xl px-4 py-3 shadow-md">
          <Loader2 className="w-5 h-5 animate-spin shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold leading-tight">Auto-chain running</p>
            <p className="text-xs text-blue-200 truncate">
              {autoChainCurrentHead !== null ? `Generating & approving Head ${autoChainCurrentHead + 1} of 12` : "Starting…"}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-24 bg-blue-500/50 rounded-full h-1.5">
              <div className="h-1.5 bg-white rounded-full transition-all duration-500" style={{ width: `${autoChainCurrentHead !== null ? ((autoChainCurrentHead + 1) / 12) * 100 : 0}%` }} />
            </div>
            <button onClick={onStopChain} className="text-xs px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg font-medium transition-colors border border-white/20">
              Stop
            </button>
          </div>
        </div>
      )}

      {/* ── Two-column layout: sidebar + main ────────────────────────────── */}
      <div className="flex gap-4 items-start">

        {/* ─ Left sidebar: quick download links ─ */}
        <div className="hidden lg:flex flex-col gap-3 w-48 shrink-0 sticky top-4">
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <div className="bg-gradient-to-r from-slate-50 to-slate-100/50 border-b border-slate-100 px-3 py-2.5 flex items-center gap-2">
              <Download className="w-3.5 h-3.5 text-slate-500" />
              <span className="text-xs font-semibold text-slate-700">Downloads</span>
              {exportableHeads.length > 0 && (
                <span className="ml-auto text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-medium">{exportableHeads.length}</span>
              )}
            </div>
            <div className="divide-y divide-slate-50 max-h-96 overflow-y-auto">
              {exportableHeads.length === 0 ? (
                <div className="px-3 py-4 text-center">
                  <Lock className="w-5 h-5 text-slate-200 mx-auto mb-1.5" />
                  <p className="text-[11px] text-slate-400 leading-tight">No heads approved yet</p>
                </div>
              ) : exportableHeads.map((h: any) => (
                <button key={h.id} onClick={() => onExport(h.headIndex)} className="w-full text-left px-3 py-2.5 flex items-center gap-2 hover:bg-emerald-50 transition-colors group">
                  <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                  <span className="text-[11px] text-slate-700 group-hover:text-emerald-700 truncate leading-tight flex-1">{h.headName || `Head ${h.headIndex + 1}`}</span>
                  <Download className="w-3 h-3 text-slate-300 group-hover:text-emerald-500 shrink-0" />
                </button>
              ))}
            </div>
          </div>
          {exportableHeads.length > 0 && (
            <button onClick={exportAll} className="w-full text-[11px] px-3 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors flex items-center justify-center gap-1.5 font-medium shadow-sm">
              <Download className="w-3 h-3" /> Export All ({exportableHeads.length})
            </button>
          )}
        </div>

        {/* ─ Main content ─ */}
        <div className="flex-1 min-w-0 space-y-5">

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-900">{completed}/{total}</p>
            <p className="text-xs text-slate-500">Approved</p>
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center shrink-0">
            <Eye className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-900">{validating}</p>
            <p className="text-xs text-slate-500">Pending Review</p>
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
            <Gauge className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-900">{progress}%</p>
            <p className="text-xs text-slate-500">Completion</p>
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-orange-50 to-amber-50/50 px-4 sm:px-5 py-4 border-b border-slate-200/60">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="font-semibold text-slate-900 flex items-center gap-2">
                <Layers className="w-5 h-5 text-orange-600" /> Audit Head Generation
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">Generate → Review → Approve → Export</p>
            </div>
            <div className="flex items-center gap-2 self-start flex-wrap">
              <Button variant="outline" size="sm" onClick={onRefresh} className="h-8">
                <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
              </Button>
              <Button size="sm" onClick={onAutoProcessAll} disabled={loading || completed === total} className="h-8 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-sm text-white">
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Play className="w-3.5 h-3.5 mr-1.5" />}
                Auto Process All
              </Button>
            </div>
          </div>

          <div className="mt-3 flex items-center gap-3">
            <div className="flex-1">
              <div className="w-full bg-slate-200 rounded-full h-2">
                <div className={cn("h-2 rounded-full transition-all duration-500", progress === 100 ? "bg-emerald-500" : progress > 50 ? "bg-blue-500" : "bg-amber-500")} style={{ width: `${progress}%` }} />
              </div>
            </div>
            <span className="text-xs font-medium text-slate-600 whitespace-nowrap">{completed}/{total}</span>
          </div>

          <div className="flex items-center gap-4 sm:gap-6 mt-2.5">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="text-slate-500 text-[11px]">{completed} Approved</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-purple-500" />
              <span className="text-slate-500 text-[11px]">{validating} Pending</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-slate-300" />
              <span className="text-slate-500 text-[11px]">{total - completed - validating} Remaining</span>
            </div>
          </div>
        </div>

        {(approvableHeads.length > 1 || exportableHeads.length > 1) && (
          <div className="px-4 sm:px-5 py-2.5 bg-slate-50/50 border-b border-slate-100 flex items-center gap-3 flex-wrap">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Bulk:</span>
            {approvableHeads.length > 1 && (
              <Button size="sm" variant="outline" onClick={approveAll} disabled={loading || approvalInProgress} className="h-7 text-xs border-emerald-200 text-emerald-700 hover:bg-emerald-50">
                {approvalInProgress ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <CheckCircle2 className="w-3 h-3 mr-1" />}
                Approve All ({approvableHeads.length})
              </Button>
            )}
            {exportableHeads.length > 1 && (
              <Button size="sm" variant="outline" onClick={exportAll} disabled={loading} className="h-7 text-xs border-blue-200 text-blue-700 hover:bg-blue-50">
                <Download className="w-3 h-3 mr-1" /> Export All ({exportableHeads.length})
              </Button>
            )}
          </div>
        )}

        <div className="divide-y divide-slate-100">
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
                    "flex items-center gap-3 sm:gap-4 px-4 sm:px-5 py-3 cursor-pointer hover:bg-slate-50/80 transition-colors",
                    isDone && "bg-emerald-50/30",
                    canApprove && "bg-purple-50/20",
                    canGenerate && "bg-blue-50/20",
                  )}
                  onClick={() => !isLocked && setExpandedHead(isExpanded ? null : i)}
                >
                  <div className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0",
                    isDone ? "bg-emerald-100 text-emerald-700" :
                    canApprove ? "bg-purple-100 text-purple-700" :
                    canGenerate ? "bg-blue-100 text-blue-700" :
                    "bg-slate-100 text-slate-400"
                  )}>
                    {i + 1}
                  </div>

                  <div className="w-5 shrink-0 flex justify-center">
                    {statusIcon(head.status)}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className={cn("font-medium text-sm text-slate-900", isLocked && "text-slate-400")}>{head.headName}</p>
                      <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-medium", statusBadgeClass(head.status))}>
                        {statusLabel(head.status)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 sm:gap-3 mt-0.5 flex-wrap">
                      {head.outputType && (
                        <span className="text-[11px] text-slate-400 flex items-center gap-1">
                          <FileText className="w-3 h-3" /> {head.outputType.toUpperCase()}
                        </span>
                      )}
                      {head.generatedAt && (
                        <span className="text-[11px] text-slate-400 flex items-center gap-1 hidden sm:flex">
                          <Clock className="w-3 h-3" /> {new Date(head.generatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      )}
                      {head.exceptionsCount > 0 && (
                        <span className="relative group cursor-pointer">
                          <span className="text-[11px] text-amber-600 flex items-center gap-0.5 font-medium">
                            <AlertTriangle className="w-3 h-3" /> {head.exceptionsCount}
                          </span>
                          <div className="absolute left-0 top-full mt-1.5 z-50 hidden group-hover:block w-72 sm:w-80 max-h-52 overflow-y-auto">
                            <div className="bg-white border border-amber-200 rounded-xl shadow-xl p-3 space-y-2">
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
                                <p className="text-[10px] text-slate-500 italic">Check the Exceptions panel for details.</p>
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

                  <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 flex-wrap justify-end" onClick={(e) => e.stopPropagation()}>
                    {canGenerate && (
                      <Button size="sm" onClick={() => onGenerate(head.headIndex)} disabled={loading} className="h-8 px-2.5 sm:px-3 bg-blue-600 hover:bg-blue-700 text-white shadow-sm text-xs">
                        {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Play className="w-3.5 h-3.5 sm:mr-1.5" /><span className="hidden sm:inline">Generate</span></>}
                      </Button>
                    )}
                    {canRegenerate && (
                      <Button size="sm" variant="outline" onClick={() => onGenerate(head.headIndex)} disabled={loading} className="h-8 px-2.5 sm:px-3 border-amber-200 text-amber-700 hover:bg-amber-50 text-xs">
                        {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><RefreshCw className="w-3.5 h-3.5 sm:mr-1.5" /><span className="hidden sm:inline">Redo</span></>}
                      </Button>
                    )}
                    {canApprove && (
                      <Button size="sm" onClick={() => onApprove(head.headIndex)} disabled={loading} className="h-8 px-2.5 sm:px-3 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm text-xs">
                        <CheckCircle2 className="w-3.5 h-3.5 sm:mr-1.5" /><span className="hidden sm:inline">Approve</span>
                      </Button>
                    )}
                    {canExport && (
                      <Button size="sm" variant="outline" onClick={() => onExport(head.headIndex)} className="h-8 px-2.5 sm:px-3 border-slate-200 hover:bg-slate-50 text-xs">
                        <Download className="w-3.5 h-3.5 sm:mr-1.5" /><span className="hidden sm:inline">Export</span>
                      </Button>
                    )}
                    {!isLocked && (
                      <ChevronDown className={cn("w-4 h-4 text-slate-400 transition-transform hidden sm:block", isExpanded && "rotate-180")} />
                    )}
                  </div>
                </div>

                {isExpanded && !isLocked && (
                  <div className="px-4 sm:px-5 pb-4 pt-2 bg-slate-50/30 border-t border-slate-100">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                      <div className="bg-white rounded-xl p-3 border border-slate-100">
                        <p className="text-slate-400 mb-1 text-[10px] uppercase tracking-wider">Status</p>
                        <p className="font-medium text-slate-700 flex items-center gap-1">{statusIcon(head.status)} {statusLabel(head.status)}</p>
                      </div>
                      <div className="bg-white rounded-xl p-3 border border-slate-100">
                        <p className="text-slate-400 mb-1 text-[10px] uppercase tracking-wider">Format</p>
                        <p className="font-medium text-slate-700 flex items-center gap-1"><FileText className="w-3.5 h-3.5 text-blue-500" /> {(head.outputType || "N/A").toUpperCase()}</p>
                      </div>
                      <div className="bg-white rounded-xl p-3 border border-slate-100">
                        <p className="text-slate-400 mb-1 text-[10px] uppercase tracking-wider">Exceptions</p>
                        <p className={cn("font-medium flex items-center gap-1", head.exceptionsCount > 0 ? "text-amber-600" : "text-emerald-600")}>
                          {head.exceptionsCount > 0 ? <><AlertTriangle className="w-3.5 h-3.5" /> {head.exceptionsCount}</> : <><CheckCircle2 className="w-3.5 h-3.5" /> None</>}
                        </p>
                      </div>
                      <div className="bg-white rounded-xl p-3 border border-slate-100">
                        <p className="text-slate-400 mb-1 text-[10px] uppercase tracking-wider">Generated</p>
                        <p className="font-medium text-slate-700 flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-slate-400" /> {head.generatedAt ? new Date(head.generatedAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "Not yet"}
                        </p>
                      </div>
                    </div>
                    {headExceptions.length > 0 && (
                      <div className="mt-3 bg-amber-50 border border-amber-200 rounded-xl p-3">
                        <p className="text-xs font-semibold text-amber-800 mb-2 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> Open Exceptions</p>
                        <div className="space-y-1.5">
                          {headExceptions.map((exc: any, idx: number) => (
                            <div key={exc.id || idx} className="flex items-start gap-2 text-xs bg-white/60 rounded-lg p-2 border border-amber-100">
                              <span className={cn("mt-0.5 w-2 h-2 rounded-full shrink-0",
                                exc.severity === "critical" ? "bg-red-500" : exc.severity === "high" ? "bg-orange-500" : exc.severity === "medium" ? "bg-amber-500" : "bg-blue-400"
                              )} />
                              <div className="flex-1 min-w-0">
                                <span className="font-medium text-slate-700">{exc.title}</span>
                                {exc.description && <span className="text-slate-500 ml-1">— {exc.description}</span>}
                              </div>
                              {onResolveException && (
                                <button onClick={() => onResolveException(exc.id, "cleared")} className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700 hover:bg-green-200 font-medium">Clear</button>
                              )}
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

        </div>{/* end main content */}
      </div>{/* end two-column flex */}
    </div>
  );
}

function ExportStage({ heads, session, exceptions, onExportHead, onExportBundle, onResolveException, onRefresh, loading }: any) {
  const completedHeads = (heads || []).filter((h: any) => ["approved", "exported", "completed"].includes(h.status));
  const openExceptions = (exceptions || []).filter((e: any) => e.status === "open");
  const totalHeads = (heads || []).length;
  const exportPct = totalHeads > 0 ? Math.round((completedHeads.length / totalHeads) * 100) : 0;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-900">{completedHeads.length}/{totalHeads}</p>
            <p className="text-xs text-slate-500">Ready to Export</p>
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-900">{openExceptions.length}</p>
            <p className="text-xs text-slate-500">Open Exceptions</p>
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
            <Gauge className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-900">{exportPct}%</p>
            <p className="text-xs text-slate-500">Completion</p>
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-emerald-50 to-green-50/50 px-5 py-4 border-b border-slate-200/60 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="font-semibold text-slate-900 flex items-center gap-2">
              <Download className="w-5 h-5 text-emerald-600" /> Export Center
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">Download completed working papers individually or as a full bundle</p>
          </div>
          {onRefresh && (
            <Button variant="outline" size="sm" onClick={onRefresh} className="self-start h-8">
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
            </Button>
          )}
        </div>

        <div className="p-5 space-y-5">
          <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
            <div className={cn("h-full rounded-full transition-all duration-500", exportPct === 100 ? "bg-emerald-500" : exportPct > 50 ? "bg-blue-500" : "bg-amber-500")} style={{ width: `${exportPct}%` }} />
          </div>

          <div>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Export by Head</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {(heads || []).map((head: any) => {
                const canExport = ["approved", "exported", "completed"].includes(head.status);
                const isExported = head.status === "exported" || head.status === "completed";
                return (
                  <div key={head.id} className={cn(
                    "flex items-center gap-3 p-3.5 rounded-xl border transition-all",
                    isExported ? "bg-emerald-50/30 border-emerald-200" : canExport ? "bg-white border-slate-200 hover:border-blue-200 hover:shadow-sm" : "bg-slate-50/50 border-slate-100 opacity-70"
                  )}>
                    <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                      isExported ? "bg-emerald-100" : canExport ? "bg-blue-50" : "bg-slate-100"
                    )}>
                      {isExported ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : canExport ? <FileText className="w-4 h-4 text-blue-600" /> : <Lock className="w-4 h-4 text-slate-400" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">{head.headName}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-medium capitalize",
                          isExported ? "bg-emerald-100 text-emerald-700" : canExport ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-500"
                        )}>{head.status?.replace(/_/g, " ")}</span>
                        <span className="text-[10px] text-slate-400 uppercase">{head.outputType}</span>
                      </div>
                    </div>
                    <Button size="sm" variant={canExport ? "default" : "outline"} disabled={!canExport} onClick={() => onExportHead(head.headIndex)}
                      className={cn("h-8 shrink-0", canExport && "bg-emerald-600 hover:bg-emerald-700")}>
                      <Download className="w-3.5 h-3.5 mr-1" /> Export
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="border-t border-slate-200 pt-5">
            <Button size="lg" onClick={onExportBundle} disabled={loading} className="w-full bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 shadow-lg shadow-emerald-200/50 h-12 text-base">
              {loading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Download className="w-5 h-5 mr-2" />}
              Export Full Bundle
              <span className="text-emerald-200 text-sm ml-2 font-normal hidden sm:inline">(Index + TB + Exceptions + Trail)</span>
            </Button>
          </div>
        </div>
      </div>

      {openExceptions.length > 0 && (
        <div className="bg-white border border-amber-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="bg-amber-50 px-5 py-3.5 border-b border-amber-200 flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-amber-900">Open Exceptions ({openExceptions.length})</h3>
              <p className="text-[11px] text-amber-600">These should be resolved before final export</p>
            </div>
          </div>
          <div className="p-4 space-y-2 max-h-60 overflow-y-auto">
            {openExceptions.map((exc: any) => (
              <div key={exc.id} className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide shrink-0",
                      exc.severity === "critical" ? "bg-red-100 text-red-800 border border-red-200" :
                      exc.severity === "high" ? "bg-orange-100 text-orange-800 border border-orange-200" :
                      "bg-yellow-100 text-yellow-800 border border-yellow-200"
                    )}>{exc.severity}</span>
                    <span className="text-sm font-medium text-slate-800">{exc.title}</span>
                  </div>
                  {onResolveException && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button onClick={() => onResolveException(exc.id, "cleared")} className="text-xs px-2 py-1 rounded bg-green-100 text-green-700 hover:bg-green-200 font-medium">Clear</button>
                      <button onClick={() => onResolveException(exc.id, "override_approved")} className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-700 hover:bg-blue-200 font-medium">Override</button>
                    </div>
                  )}
                </div>
                {exc.description && <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">{exc.description}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
