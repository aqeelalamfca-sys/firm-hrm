import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import * as XLSX from "xlsx";
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
  Search, ClipboardList, XCircle,
} from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL || "/api";

// Pipeline: Upload → Data Extraction → Trial Balance → General Ledger → WP Listing → WP Generation → Export
const STAGES = [
  { key: "upload",        label: "Upload",         icon: Upload,        phase: "facts",    desc: "Template & Supporting Documents" },
  { key: "extraction",    label: "Data Extraction",icon: Sparkles,      phase: "facts",    desc: "Template Filled + AI Filled variables — inline review, exceptions & confirmation" },
  { key: "tb_generation", label: "Trial Balance",  icon: BarChart2,     phase: "judgment", desc: "AI-generated fully balanced Trial Balance – Zero Difference" },
  { key: "gl_generation", label: "General Ledger", icon: GitMerge,      phase: "judgment", desc: "Transaction-wise GL – Fully reconciled with TB" },
  { key: "wp_listing",    label: "WP Listing",     icon: ClipboardList, phase: "output",   desc: "AI-recommended WP selection — choose which papers to generate" },
  { key: "generation",    label: "WP Generation",  icon: FileCheck,     phase: "output",   desc: "Sequential AI generation of all WP sections (ISA Compliant)" },
  { key: "export",        label: "Export",         icon: Download,      phase: "output",   desc: "TB Excel · GL Excel · WP Excel · WP Word" },
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
  const [downloadingHeads, setDownloadingHeads] = useState<Set<number>>(new Set());
  const [downloadedHeads, setDownloadedHeads] = useState<Set<number>>(new Set());
  const [activeTab, setActiveTab] = useState("");
  const [editingVar, setEditingVar] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editReason, setEditReason] = useState("");
  const [showExceptionsPanel, setShowExceptionsPanel] = useState(false);
  const [workbookExtracting, setWorkbookExtracting] = useState(false);
  const [workbookReport, setWorkbookReport] = useState<any>(null);
  const [showWorkbookPanel, setShowWorkbookPanel] = useState(false);
  // One-sheet template parse state
  const [parseResult, setParseResult] = useState<any>(null);
  const [parseLoading, setParseLoading] = useState(false);

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

  const statusToStageMap: Record<string, string> = {
    completed:    "generation",
    variables:    "extraction",
    generation:   "generation",
    wp_listing:   "wp_listing",
    gl_generation:"gl_generation",
    tb_generation:"tb_generation",
    extraction:   "extraction",
    upload:       "upload",
    export:       "export",
  };
  const stageInitialisedRef = useRef(false);

  useEffect(() => {
    if (activeSession) {
      if (activeSession.heads) setHeads(activeSession.heads);
      if (activeSession.exceptions) setExceptions(activeSession.exceptions);
      if (!stageInitialisedRef.current) {
        const validStages = STAGES.map(s => s.key) as string[];
        const sessionStage = activeSession.status || "upload";
        const mapped = statusToStageMap[sessionStage] ?? (validStages.includes(sessionStage) ? sessionStage : "upload");
        setStage(mapped);
        stageInitialisedRef.current = true;
      }
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

  const handleDeleteFile = async (fileId: number) => {
    if (!activeSession) return;
    try {
      const res = await fetch(`${API_BASE}/working-papers/sessions/${activeSession.id}/files/${fileId}`, {
        method: "DELETE", headers,
      });
      if (res.ok) {
        toast({ title: "File removed" });
        await fetchSession(activeSession.id);
      } else {
        const err = await res.json();
        toast({ title: "Remove failed", description: err.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Remove failed", variant: "destructive" });
    }
  };

  const handleParseTemplate = async () => {
    if (!activeSession) return;
    try {
      setParseLoading(true);
      setParseResult(null);
      toast({ title: "Parsing template…", description: "Reading engagement profile and financial rows" });
      const res = await fetch(`${API_BASE}/working-papers/sessions/${activeSession.id}/parse-one-sheet-template`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ persistData: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Parse failed", description: data.error || "Could not parse template", variant: "destructive" });
        return;
      }
      setParseResult(data);
      if (data.errors?.length === 0 || (data.rows?.length > 0)) {
        toast({ title: "Template parsed successfully", description: `${data.rows?.length || 0} financial rows, ${data.errors?.length || 0} errors, ${data.warnings?.length || 0} warnings` });
        await fetchSession(activeSession.id);
      } else {
        toast({ title: "Parse complete with issues", description: `${data.errors?.length} errors found — review below`, variant: "destructive" });
      }
    } catch {
      toast({ title: "Parse failed", variant: "destructive" });
    } finally { setParseLoading(false); }
  };

  const handleExtractData = async () => {
    if (!activeSession) return;
    // Step 1: Create all variable rows from session metadata first
    // (autoFillVariablesFromTemplate only UPDATES existing rows, so rows must exist first)
    await autoFillVariables();
    // Step 2: Parse template and overwrite relevant variables with template values (highest source)
    await handleParseTemplate();
    // Step 3: Sync UI state — fetch all variables (template-filled + session-meta defaults)
    await fetchVariables();
    setStage("extraction");
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
        fetchVariables();
        setStage("extraction");
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
        fetchVariables();
        setStage("extraction");
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
      const result = await res.json().catch(() => ({}));
      if (res.ok) {
        toast({
          title: `Variables Populated`,
          description: result.message || `${result.created} created, ${result.updated} updated from template data.`
        });
      }
      // Always fetch — template-filled variables may already be in DB even if auto-fill fails
      await fetchVariables();
    } catch {} finally { setLoading(false); }
  };

  const handleAiFill = async () => {
    if (!activeSession) return;
    try {
      setLoading(true);
      toast({
        title: "AI Fill in progress…",
        description: "Reading all uploaded documents and filling missing variables. This may take 30–60 seconds.",
      });
      const res = await fetch(`${API_BASE}/working-papers/sessions/${activeSession.id}/variables/ai-fill`, {
        method: "POST", headers: { ...headers, "Content-Type": "application/json" },
      });
      if (res.ok) {
        const result = await res.json();
        await fetchVariables();
        toast({
          title: `AI Fill complete`,
          description: result.message || `Filled ${result.filled} variables. ${result.stillMissing} require manual input.`,
        });
      } else {
        const err = await res.json().catch(() => ({}));
        toast({ title: "AI Fill failed", description: err.error || "Could not fill variables.", variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "AI Fill failed", description: e?.message || "Network error", variant: "destructive" });
    } finally { setLoading(false); }
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

  const saveVariableDirect = async (varId: number, value: string, reason: string = "User edit") => {
    if (!activeSession) return;
    try {
      const res = await fetch(`${API_BASE}/working-papers/sessions/${activeSession.id}/variables/${varId}`, {
        method: "PATCH", headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ value, reason: reason || "User edit via extraction form", editedBy: user?.id }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast({ title: "Autosave failed", description: err.error || "Unknown error", variant: "destructive" });
      } else {
        await fetchVariables();
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
        if (activeSession?.heads && activeSession.heads.length > 2) generateHead(2);
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
    setDownloadingHeads(prev => new Set(prev).add(headIndex));
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
        const filename = match?.[1] || `head_${headIndex}.xlsx`;
        a.download = filename;
        a.href = url;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 200);
        setDownloadedHeads(prev => new Set(prev).add(headIndex));
        const headName = heads.find(h => h.headIndex === headIndex)?.headName || `Head ${headIndex + 1}`;
        toast({ title: `Downloaded: ${headName}`, description: filename });
        await fetchSession(activeSession.id);
      } else {
        const err = await res.json().catch(() => ({ error: "Export failed" }));
        toast({ title: "Export failed", description: err.error, variant: "destructive" });
      }
    } catch { toast({ title: "Export failed", variant: "destructive" }); }
    finally { setDownloadingHeads(prev => { const s = new Set(prev); s.delete(headIndex); return s; }); }
  };

  const autoProcessAll = async () => {
    if (!activeSession) return;
    try {
      setLoading(true);
      toast({ title: "Auto Processing Started", description: "AI is generating all working paper heads in the background. The page will refresh automatically every 15 seconds to show progress." });
      const res = await fetch(`${API_BASE}/working-papers/sessions/${activeSession.id}/heads/auto-process-all`, {
        method: "POST", headers: { ...headers, "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (res.status === 202 || res.ok) {
        // Fire-and-forget: poll for completion
        let pollCount = 0;
        const pollInterval = setInterval(async () => {
          pollCount++;
          try {
            await fetchSession(activeSession.id);
            await fetchExceptions();
          } catch {}
          // Stop polling after 10 minutes (40 × 15s) or if all heads approved
          if (pollCount >= 40) {
            clearInterval(pollInterval);
            setLoading(false);
            toast({ title: "Processing Complete", description: "All heads have been processed. Check the status above." });
          }
        }, 15000);
      } else {
        toast({ title: "Auto Process Failed", description: data.error || "Unknown error", variant: "destructive" });
        setLoading(false);
      }
    } catch {
      toast({ title: "Auto Process Failed", variant: "destructive" });
      setLoading(false);
    }
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

  const [exportingQuick, setExportingQuick] = useState<string | null>(null);
  const exportQuick = async (jobType: "tb_excel" | "gl_excel" | "wp_excel" | "wp_word") => {
    if (!activeSession || exportingQuick) return;
    setExportingQuick(jobType);
    try {
      const ext = jobType === "wp_word" ? "docx" : "xlsx";
      const label = { tb_excel: "TB", gl_excel: "GL", wp_excel: "WP_Index", wp_word: "WP_Index" }[jobType];
      const res = await fetch(`${API_BASE}/working-papers/sessions/${activeSession.id}/generate-output`, {
        method: "POST", headers,
        body: JSON.stringify({ jobType, triggeredBy: "User" }),
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.download = `${label}_${activeSession.clientName || "Client"}_${activeSession.engagementYear}.${ext}`;
        a.href = url;
        a.click();
        URL.revokeObjectURL(url);
        toast({ title: `${label} exported`, description: `.${ext} file downloaded` });
      } else {
        const e = await res.json().catch(() => ({}));
        toast({ title: "Export failed", description: e.error || "Unknown error", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Export failed", description: err.message, variant: "destructive" });
    } finally {
      setExportingQuick(null);
    }
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
    if (c >= 85) return <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-100 text-green-700 border border-green-200">High</span>;
    if (c >= 60) return <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-700 border border-amber-200">Medium</span>;
    return <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-100 text-red-700 border border-red-200">Low</span>;
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
              <div className="flex items-center justify-between mb-3 px-0.5">
                <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  <div className="w-5 h-5 rounded bg-slate-100 flex items-center justify-center">
                    <FileCheck className="w-3 h-3 text-slate-500" />
                  </div>
                  Engagement Sessions
                  <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">{sessions.length}</span>
                </h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {sessions.map((s: any) => {
                  const stageOrder = ["upload","extraction","tb_generation","gl_generation","wp_listing","generation","export"];
                  const stageIdx = stageOrder.indexOf(s.status);
                  const progressPct = stageIdx < 0 ? 0 : Math.round(((stageIdx + 1) / stageOrder.length) * 100);
                  const isDone = s.status === "completed" || s.status === "exported";
                  const progressColor = isDone ? "bg-emerald-500" : s.status === "generation" ? "bg-blue-500" : s.status === "upload" || s.status === "draft" ? "bg-slate-300" : "bg-amber-500";
                  const statusDot = isDone ? "bg-emerald-500" : s.status === "generation" ? "bg-blue-500" : s.status === "upload" || s.status === "draft" ? "bg-slate-300" : "bg-amber-400";
                  const initials = (s.clientName || "?").split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase();
                  return (
                    <div key={s.id} className="group bg-white border border-slate-200/80 rounded-xl overflow-hidden hover:shadow-lg hover:border-blue-200/80 cursor-pointer transition-all duration-200" onClick={() => fetchSession(s.id)}>
                      <div className="p-4">
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-[13px] font-bold text-white shrink-0"
                            style={{ background: isDone ? "linear-gradient(135deg,#10b981,#059669)" : "linear-gradient(135deg,hsl(217 78% 54%),hsl(262 70% 55%))" }}>
                            {initials}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <p className="font-semibold text-slate-900 group-hover:text-blue-700 transition-colors text-[14px] leading-tight">{s.clientName}</p>
                              <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-blue-500 group-hover:translate-x-0.5 transition-all shrink-0 mt-0.5" />
                            </div>
                            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                              {s.entityType && <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-slate-50 text-slate-500 font-medium border border-slate-100">{s.entityType}</span>}
                              <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-blue-50 text-blue-600 font-medium border border-blue-100">{s.engagementYear}</span>
                              <span className="text-[10px] text-slate-400">{s.reportingFramework || "IFRS"}</span>
                            </div>
                          </div>
                        </div>

                        <div className="mt-3">
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-1.5">
                              <div className={cn("w-1.5 h-1.5 rounded-full shrink-0", statusDot)} />
                              <span className="text-[11px] font-medium text-slate-500 capitalize">{(s.status || "upload").replace(/_/g, " ")}</span>
                            </div>
                            <span className="text-[10px] text-slate-400 font-medium">{isDone ? "Complete" : `${progressPct}%`}</span>
                          </div>
                          <div className="w-full h-1 bg-slate-100 rounded-full overflow-hidden">
                            <div className={cn("h-full rounded-full transition-all", progressColor)} style={{ width: `${isDone ? 100 : Math.max(progressPct, 4)}%` }} />
                          </div>
                        </div>

                        {(s.preparerName || s.reviewerName || s.auditFirmName) && (
                          <div className="flex items-center gap-2.5 mt-2.5 pt-2.5 border-t border-slate-100/80 flex-wrap">
                            {s.auditFirmName && <span className="text-[10.5px] text-slate-400 font-medium truncate">{s.auditFirmName}</span>}
                            {s.preparerName && <span className="text-[10.5px] text-slate-400">Prep: <span className="text-slate-600 font-medium">{s.preparerName}</span></span>}
                            {s.reviewerName && <span className="text-[10.5px] text-slate-400">Rev: <span className="text-slate-600 font-medium">{s.reviewerName}</span></span>}
                          </div>
                        )}
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
              <button onClick={() => { stageInitialisedRef.current = false; setActiveSession(null); setStage("upload"); }} className="mt-0.5 p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors shrink-0">
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

          {/* Phase strip */}
          <div className="hidden sm:flex items-center gap-0 pt-2 pb-0 text-[9px] font-bold uppercase tracking-widest">
            {([ 
              { label: "Facts", keys: ["upload","extraction"] as string[], color: "blue" },
              { label: "Audit Judgment", keys: ["tb_generation","gl_generation"] as string[], color: "violet" },
              { label: "Defensible Output", keys: ["wp_listing","generation","export"] as string[], color: "emerald" },
            ]).map((ph, pi) => {
              const phaseStages = STAGES.filter(s => ph.keys.includes(s.key));
              const isCurrentPhase = ph.keys.includes(stage);
              const lastKeyInPhase = ph.keys[ph.keys.length - 1];
              const lastIdxInPhase = STAGES.findIndex(s => s.key === lastKeyInPhase);
              const isPastPhase = lastIdxInPhase < stageIndex;
              return (
                <div key={ph.label} className="flex items-center" style={{ flex: phaseStages.length }}>
                  {pi > 0 && <span className="text-white/20 mr-1">→</span>}
                  <span className={cn(
                    "px-1",
                    isCurrentPhase
                      ? ph.color === "blue" ? "text-blue-300" : ph.color === "violet" ? "text-violet-300" : "text-emerald-300"
                      : isPastPhase ? "text-slate-500" : "text-slate-600"
                  )}>{ph.label}</span>
                </div>
              );
            })}
          </div>

          {/* Stage tabs */}
          <div className="flex items-center gap-0 pb-0 overflow-x-auto scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0 border-t border-white/10 mt-1">
            {STAGES.map((s, i) => {
              const Icon = s.icon;
              const isActive = s.key === stage;
              const isPast = i < stageIndex;
              const underlineColor =
                s.phase === "facts" ? "bg-blue-400" :
                s.phase === "judgment" ? "bg-violet-400" : "bg-emerald-400";
              return (
                <button
                  key={s.key}
                  title={s.desc}
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
                    if (s.key === "extraction") {
                      // If no variables yet but files are uploaded, auto-run parse + fill pipeline
                      if (variables.length === 0 && (activeSession?.files?.length ?? 0) > 0) {
                        handleExtractData();
                      } else {
                        fetchVariables();
                        fetchCoaData();
                      }
                    }
                    if (s.key === "tb_generation" || s.key === "gl_generation") {
                      fetchCoaData();
                      if (!auditMaster) { fetchAuditMaster(); fetchSampling(); fetchAnalytics(); fetchControlMatrix(); fetchEvidence(); }
                    }
                    if (s.key === "wp_listing") { fetchWpTriggers(); fetchSession(activeSession.id); }
                    if (s.key === "generation" || s.key === "export") { fetchSession(activeSession.id); fetchExceptions(); }
                  }}
                >
                  {isPast ? <CheckCircle2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-400" /> : <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
                  <span className="hidden sm:inline">{s.label}</span>
                  <span className="sm:hidden">{s.label.split(" ")[0]}</span>
                  {isActive && <div className={cn("absolute bottom-0 left-1.5 right-1.5 h-[3px] rounded-t", underlineColor)} />}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Process flow principle banner */}
      <div className="bg-slate-900/95 border-b border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-1.5 flex items-center gap-2 overflow-x-auto scrollbar-hide">
          <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-widest shrink-0">Engine</span>
          <span className="text-white/10">|</span>
          {[
            { step: "Upload",          phase: "facts",    active: stage === "upload" },
            { step: "Data Extraction", phase: "facts",    active: stage === "extraction" },
            { step: "Trial Balance",   phase: "judgment", active: stage === "tb_generation" },
            { step: "General Ledger",  phase: "judgment", active: stage === "gl_generation" },
            { step: "WP Listing",      phase: "output",   active: stage === "wp_listing" },
            { step: "WP Generation",   phase: "output",   active: stage === "generation" },
            { step: "Export",          phase: "output",   active: stage === "export" },
          ].map((item, idx) => {
            const stageOrder = ["upload","extraction","tb_generation","gl_generation","wp_listing","generation","export"];
            const pastIdx = stageOrder.indexOf(stage);
            const isPast = pastIdx > idx;
            return (
              <div key={item.step} className="flex items-center gap-1.5 shrink-0">
                {idx > 0 && <ArrowRight className="w-2.5 h-2.5 text-white/15 shrink-0" />}
                <span className={cn(
                  "text-[10px] font-medium whitespace-nowrap transition-colors",
                  item.active
                    ? item.phase === "facts" ? "text-blue-400" : item.phase === "judgment" ? "text-violet-400" : "text-emerald-400"
                    : isPast ? "text-slate-500 line-through decoration-slate-600" : "text-slate-600"
                )}>{item.step}</span>
              </div>
            );
          })}
          <span className="text-white/10 ml-1">|</span>
          <span className="text-[10px] text-slate-600 italic shrink-0 hidden lg:block">Template provides FACTS → AI converts FACTS into AUDIT JUDGMENT → System produces DEFENSIBLE WORKING PAPERS</span>
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

      {/* ─── Stage Content — 9-Tab Flow ────────────────────────────────────── */}

      {/* TAB 1 — Upload */}
      {stage === "upload" && (
        <UploadStage
          files={uploadFiles}
          setFiles={setUploadFiles}
          uploadedFiles={activeSession.files || []}
          fileInputRef={fileInputRef}
          onUpload={handleUpload}
          onExtractData={handleExtractData}
          onDeleteFile={handleDeleteFile}
          loading={parseLoading || loading}
        />
      )}

      {/* TAB 2 — Data Extraction (owns ALL variable review, editing, exceptions & confirmation) */}
      {stage === "extraction" && (
        <ExtractionStage
          data={extractionData}
          session={activeSession}
          onRefreshVariables={() => { fetchVariables(); fetchCoaData(); }}
          onRerun={handleExtractData}
          onAiFill={handleAiFill}
          loading={loading || parseLoading}
          confidenceBadge={confidenceBadge}
          variablesPanel={
            <VariablesStage
              variables={variables}
              grouped={variableGroups}
              stats={variableStats}
              changeLog={changeLog}
              onSave={saveVariableEdit}
              onSaveDirect={saveVariableDirect}
              onAiFill={handleAiFill}
              onFetch={fetchVariables}
              onLockAll={lockAllVariables}
              loading={loading}
              confidenceBadge={confidenceBadge}
            />
          }
        />
      )}

      {/* TAB 3 — Trial Balance */}
      {stage === "tb_generation" && (
        <TbGenerationStage
          coaData={coaData}
          tbGlProgress={tbGlProgress}
          onGenerateTbGl={generateTbGl}
          onPopulate={populateCoa}
          onUpdate={updateCoaRow}
          onValidate={validateCoa}
          onApprove={approveCoa}
          onRefresh={fetchCoaData}
          onRunRecon={runRecon}
          reconResults={reconResults}
          loading={coaLoading || loading}
          session={activeSession}
          onNext={() => setStage("gl_generation")}
        />
      )}

      {/* TAB 6 — General Ledger */}
      {stage === "gl_generation" && (
        <GlGenerationStage
          auditMaster={auditMaster}
          tbGlProgress={tbGlProgress}
          onGenerateTbGl={generateTbGl}
          reconResults={reconResults}
          onRunRecon={runRecon}
          loading={auditMasterLoading || loading}
          session={activeSession}
          onNext={() => { fetchWpTriggers(); fetchSession(activeSession.id); setStage("wp_listing"); }}
        />
      )}

      {/* TAB 5 — WP Listing */}
      {stage === "wp_listing" && (
        <WpListingStage
          heads={heads}
          wpTriggers={wpTriggers}
          session={activeSession}
          loading={loading}
          onEvaluateTriggers={evaluateWpTriggers}
          onRefresh={() => { fetchWpTriggers(); fetchSession(activeSession.id); }}
          onNext={() => { fetchSession(activeSession.id); fetchExceptions(); setStage("generation"); }}
        />
      )}

      {/* TAB 6 — WP Generation */}
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

      {/* TAB 7 — Export */}
      {stage === "export" && (
        <ExportStage
          heads={heads}
          session={activeSession}
          exceptions={exceptions}
          onExportHead={exportHead}
          onExportBundle={exportBundle}
          onExportQuick={exportQuick}
          exportingQuick={exportingQuick}
          onResolveException={resolveException}
          onRefresh={() => { fetchSession(activeSession.id); fetchExceptions(); }}
          loading={loading}
          downloadingHeads={downloadingHeads}
          downloadedHeads={downloadedHeads}
        />
      )}

      {/* Legacy: data_sheet and audit_engine accessible if session.status points here */}
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

      {exceptions.filter((e: any) => e.status === "open").length > 0 && !showExceptionsPanel && !["generation","export","wp_listing"].includes(stage) && (
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

function UploadStage({ files, setFiles, uploadedFiles, fileInputRef, onUpload, onExtractData, onDeleteFile, loading }: any) {
  const { toast } = useToast();
  const [tplDrag, setTplDrag] = useState(false);
  const [supDrag, setSupDrag] = useState(false);
  const supFileInputRef = useRef<HTMLInputElement>(null);

  const isXlsExt = (name: string) => { const e = name.split(".").pop()?.toLowerCase(); return e === "xlsx" || e === "xls"; };
  const tplQueue  = files.filter((u: any) => isXlsExt(u.file.name));
  const supQueue  = files.filter((u: any) => !isXlsExt(u.file.name));

  const tplUploaded = uploadedFiles.filter((f: any) => { const e = (f.originalName||"").split(".").pop()?.toLowerCase(); return e === "xlsx" || e === "xls" || e === "xlsm"; });
  const supUploaded = uploadedFiles.filter((f: any) => { const e = (f.originalName||"").split(".").pop()?.toLowerCase(); return !(e === "xlsx" || e === "xls" || e === "xlsm"); });

  const hasTemplate    = tplUploaded.length > 0;
  const hasAnyUploaded = uploadedFiles.length > 0;

  const removeFile = (idx: number) => setFiles((p: any) => p.filter((_: any, j: number) => j !== idx));

  const supCategories = [
    { value: "bank_statement",   label: "Bank Statement" },
    { value: "sales_tax_return", label: "Sales Tax Return" },
    { value: "tax_notice",       label: "Tax Notice / Assessment" },
    { value: "schedule",         label: "Schedule / Notes" },
    { value: "annexure",         label: "Annexure" },
    { value: "other",            label: "Other Document" },
  ];

  const FileChip = ({ ext }: { ext: string }) => {
    const isXl  = ext === "xlsx" || ext === "xls" || ext === "xlsm";
    const isPdf = ext === "pdf";
    const isImg = ["jpg","jpeg","png","webp","gif"].includes(ext);
    return (
      <div className={cn(
        "w-7 h-7 rounded-md flex items-center justify-center shrink-0 font-bold text-[9px] uppercase",
        isXl ? "bg-green-100 text-green-700" : isPdf ? "bg-red-100 text-red-700" : isImg ? "bg-purple-100 text-purple-700" : "bg-slate-100 text-slate-600"
      )}>{ext || "?"}</div>
    );
  };

  return (
    <div className="space-y-5">

      {/* ── 1. Download Template Banner ── */}
      <div className="bg-gradient-to-r from-blue-700 to-indigo-800 rounded-2xl p-5 text-white shadow-md flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex items-start gap-3.5 flex-1">
          <div className="w-11 h-11 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
            <FileText className="w-5 h-5 text-blue-200" />
          </div>
          <div className="flex-1">
            <p className="font-bold text-base mb-0.5">Audit Upload Template</p>
            <p className="text-sm text-blue-100">
              Fill in the Engagement Header and Financial Data rows, then upload the completed template below.
            </p>
          </div>
        </div>
        <button
          onClick={async () => {
            try {
              const token = localStorage.getItem("hrm_token");
              const r = await fetch("/api/working-papers/download-template", {
                headers: token ? { Authorization: "Bearer " + token } : {},
              });
              if (!r.ok) throw new Error("fail");
              const blob = await r.blob();
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url; a.download = "Financial_Data_Upload_Template.xlsx"; a.click();
              URL.revokeObjectURL(url);
            } catch {
              toast({ title: "Download failed", description: "Could not download template.", variant: "destructive" });
            }
          }}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-white text-blue-800 text-sm font-bold rounded-xl shadow hover:bg-blue-50 transition-colors shrink-0"
        >
          <Download className="w-4 h-4" /> Download Template
        </button>
      </div>

      {/* ── 2. Template Upload (.xlsx only) ── */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-slate-50 to-blue-50/30 px-5 py-3.5 border-b border-slate-200/60 flex items-center gap-2">
          <Upload className="w-4 h-4 text-blue-600" />
          <h2 className="font-semibold text-slate-900 text-sm">Upload Completed Template</h2>
          <span className="ml-2 px-2 py-0.5 bg-blue-100 text-blue-700 text-[10px] font-bold rounded-full">.XLSX ONLY</span>
          {hasTemplate && (
            <span className="ml-auto flex items-center gap-1 text-[11px] text-emerald-600 font-semibold">
              <CheckCircle2 className="w-3.5 h-3.5" /> Template uploaded
            </span>
          )}
        </div>
        <div className="p-5 space-y-4">
          <div
            className={cn(
              "border-2 border-dashed rounded-xl p-7 text-center cursor-pointer transition-all duration-200",
              tplDrag ? "border-blue-400 bg-blue-50/60 scale-[1.01]" : "border-slate-200 hover:border-blue-300 hover:bg-blue-50/20"
            )}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setTplDrag(true); }}
            onDragLeave={() => setTplDrag(false)}
            onDrop={e => {
              e.preventDefault(); setTplDrag(false);
              const dropped = Array.from(e.dataTransfer.files).filter((f: any) => isXlsExt(f.name));
              if (dropped.length) setFiles((p: any) => [...p, ...dropped.map((f: any) => ({ file: f, category: "financial_statements" }))]);
              else toast({ title: "Invalid file type", description: "Only Excel (.xlsx / .xls) files are accepted here.", variant: "destructive" });
            }}
          >
            <div className={cn("w-11 h-11 rounded-2xl mx-auto mb-3 flex items-center justify-center", tplDrag ? "bg-blue-100" : "bg-slate-100")}>
              <Upload className={cn("w-5 h-5", tplDrag ? "text-blue-600" : "text-slate-400")} />
            </div>
            <p className="font-medium text-slate-700 text-sm">
              Drop your Excel template here or <span className="text-blue-600 underline underline-offset-2">browse</span>
            </p>
            <p className="text-xs text-slate-400 mt-1">Only <span className="font-semibold text-slate-500">.xlsx / .xls</span> files accepted</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={e => {
                const fs = Array.from(e.target.files || []);
                if (fs.length) setFiles((p: any) => [...p, ...fs.map((f: any) => ({ file: f, category: "financial_statements" }))]);
                if (fileInputRef.current) fileInputRef.current.value = "";
              }}
              className="hidden"
            />
          </div>

          {tplQueue.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-600">{tplQueue.length} template file{tplQueue.length > 1 ? "s" : ""} ready</span>
                <Button onClick={onUpload} disabled={loading} size="sm" className="bg-blue-600 hover:bg-blue-700 text-white h-7 text-xs px-3">
                  {loading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Upload className="w-3 h-3 mr-1" />} Upload
                </Button>
              </div>
              <div className="space-y-1.5">
                {tplQueue.map((uf: any) => {
                  const globalIdx = files.indexOf(uf);
                  const ext = uf.file.name.split(".").pop()?.toLowerCase();
                  return (
                    <div key={globalIdx} className="flex items-center gap-2.5 p-2.5 rounded-xl border bg-blue-50/50 border-blue-100 text-xs">
                      <FileChip ext={ext} />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-slate-800 truncate">{uf.file.name}</p>
                        <p className="text-[10px] text-slate-400">{(uf.file.size / 1024).toFixed(0)} KB · Financial Data Template</p>
                      </div>
                      <button onClick={() => removeFile(globalIdx)} className="p-1 hover:bg-red-50 rounded-lg transition-colors">
                        <X className="w-3.5 h-3.5 text-slate-400 hover:text-red-500" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {tplUploaded.length > 0 && (
            <div className={cn(tplQueue.length > 0 ? "pt-3 border-t border-slate-100" : "")}>
              <p className="text-[11px] font-semibold text-slate-500 mb-2 flex items-center gap-1.5">
                <CheckCircle2 className="w-3 h-3 text-emerald-500" /> {tplUploaded.length} template file{tplUploaded.length > 1 ? "s" : ""} uploaded
              </p>
              <div className="space-y-1.5">
                {tplUploaded.map((f: any) => {
                  const ext = (f.originalName || "").split(".").pop()?.toLowerCase();
                  return (
                    <div key={f.id} className="flex items-center gap-2.5 p-2.5 rounded-xl border bg-emerald-50/50 border-emerald-100 text-xs group">
                      <FileChip ext={ext} />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-slate-800 truncate">{f.originalName}</p>
                        <p className="text-[10px] text-blue-600 font-medium mt-0.5">Primary template</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 group-hover:hidden" />
                        <button
                          onClick={() => onDeleteFile(f.id)}
                          className="hidden group-hover:flex items-center justify-center w-6 h-6 rounded-full bg-red-50 hover:bg-red-100 transition-colors"
                          title="Remove file"
                        >
                          <X className="w-3 h-3 text-red-500" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── 3. Supporting Documents (all formats) ── */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-slate-50 to-violet-50/30 px-5 py-3.5 border-b border-slate-200/60 flex items-center gap-2">
          <FileText className="w-4 h-4 text-violet-600" />
          <h2 className="font-semibold text-slate-900 text-sm">Supporting Documents</h2>
          <span className="text-[11px] text-slate-400 ml-1">— optional</span>
          {supUploaded.length > 0 && (
            <span className="ml-auto flex items-center gap-1 text-[11px] text-violet-600 font-semibold">
              <CheckCircle2 className="w-3.5 h-3.5" /> {supUploaded.length} file{supUploaded.length > 1 ? "s" : ""}
            </span>
          )}
        </div>
        <div className="p-5 space-y-4">
          <div
            className={cn(
              "border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all duration-200",
              supDrag ? "border-violet-400 bg-violet-50/60 scale-[1.01]" : "border-slate-200 hover:border-violet-300 hover:bg-violet-50/20"
            )}
            onClick={() => supFileInputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setSupDrag(true); }}
            onDragLeave={() => setSupDrag(false)}
            onDrop={e => {
              e.preventDefault(); setSupDrag(false);
              const dropped = Array.from(e.dataTransfer.files);
              if (dropped.length) setFiles((p: any) => [...p, ...dropped.map((f: any) => ({ file: f, category: "other" }))]);
            }}
          >
            <div className={cn("w-11 h-11 rounded-2xl mx-auto mb-3 flex items-center justify-center", supDrag ? "bg-violet-100" : "bg-slate-100")}>
              <FileText className={cn("w-5 h-5", supDrag ? "text-violet-600" : "text-slate-400")} />
            </div>
            <p className="font-medium text-slate-700 text-sm">
              Attach bank statements, PDFs, images &amp; more or <span className="text-violet-600 underline underline-offset-2">browse</span>
            </p>
            <p className="text-xs text-slate-400 mt-1">PDF · Excel · Word · Images · CSV — multiple files allowed</p>
            <input
              ref={supFileInputRef}
              type="file"
              multiple
              accept=".pdf,.xlsx,.xls,.csv,.doc,.docx,.jpg,.jpeg,.png,.webp,.txt"
              onChange={e => {
                const fs = Array.from(e.target.files || []);
                if (fs.length) setFiles((p: any) => [...p, ...fs.map((f: any) => ({ file: f, category: "other" }))]);
                if (supFileInputRef.current) supFileInputRef.current.value = "";
              }}
              className="hidden"
            />
          </div>

          {supQueue.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-600">{supQueue.length} document{supQueue.length > 1 ? "s" : ""} ready</span>
                <Button onClick={onUpload} disabled={loading} size="sm" className="bg-violet-600 hover:bg-violet-700 text-white h-7 text-xs px-3">
                  {loading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Upload className="w-3 h-3 mr-1" />} Upload
                </Button>
              </div>
              <div className="space-y-1.5">
                {supQueue.map((uf: any) => {
                  const globalIdx = files.indexOf(uf);
                  const ext = uf.file.name.split(".").pop()?.toLowerCase();
                  return (
                    <div key={globalIdx} className="flex items-center gap-2.5 p-2.5 rounded-xl border bg-slate-50 border-slate-200 text-xs">
                      <FileChip ext={ext} />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-slate-800 truncate">{uf.file.name}</p>
                        <p className="text-[10px] text-slate-400">{(uf.file.size / 1024).toFixed(0)} KB</p>
                      </div>
                      <select
                        className="text-[10px] border border-slate-200 rounded-lg px-1.5 py-1 bg-white text-slate-700 focus:ring-2 focus:ring-violet-200 focus:border-violet-400 shrink-0"
                        value={uf.category}
                        onChange={ev => { const u = [...files]; u[globalIdx].category = ev.target.value; setFiles(u); }}
                      >
                        {supCategories.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                      </select>
                      <button onClick={() => removeFile(globalIdx)} className="p-1 hover:bg-red-50 rounded-lg transition-colors">
                        <X className="w-3.5 h-3.5 text-slate-400 hover:text-red-500" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {supUploaded.length > 0 && (
            <div className={cn(supQueue.length > 0 ? "pt-3 border-t border-slate-100" : "")}>
              <p className="text-[11px] font-semibold text-slate-500 mb-2 flex items-center gap-1.5">
                <CheckCircle2 className="w-3 h-3 text-emerald-500" /> {supUploaded.length} supporting document{supUploaded.length > 1 ? "s" : ""} uploaded
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {supUploaded.map((f: any) => {
                  const ext = (f.originalName || "").split(".").pop()?.toLowerCase();
                  const catLabel = supCategories.find(c => c.value === f.category)?.label || "Document";
                  return (
                    <div key={f.id} className="flex items-center gap-2.5 p-2.5 rounded-xl border bg-slate-50 border-slate-100 text-xs group">
                      <FileChip ext={ext} />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-slate-800 truncate">{f.originalName}</p>
                        <p className="text-[10px] text-slate-500 mt-0.5">{catLabel}</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 group-hover:hidden" />
                        <button
                          onClick={() => onDeleteFile(f.id)}
                          className="hidden group-hover:flex items-center justify-center w-6 h-6 rounded-full bg-red-50 hover:bg-red-100 transition-colors"
                          title="Remove file"
                        >
                          <X className="w-3 h-3 text-red-500" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {supQueue.length === 0 && supUploaded.length === 0 && (
            <p className="text-xs text-slate-400 text-center py-1">No supporting documents attached yet</p>
          )}
        </div>
      </div>

      {/* ── 4. Extract Data (shown after template is uploaded) ── */}
      {hasAnyUploaded && (
        <div className={cn(
          "rounded-2xl p-5 shadow-sm flex flex-col sm:flex-row items-center gap-4 border",
          hasTemplate ? "bg-emerald-50 border-emerald-200" : "bg-slate-50 border-slate-200"
        )}>
          <div className="flex items-start gap-3 flex-1">
            <div className={cn(
              "w-10 h-10 rounded-xl border flex items-center justify-center shrink-0",
              hasTemplate ? "bg-white border-emerald-200" : "bg-white border-slate-200"
            )}>
              <FileCheck className={cn("w-5 h-5", hasTemplate ? "text-emerald-600" : "text-slate-400")} />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900">
                {hasTemplate ? "Template ready — extract audit variables" : "Upload the Excel template to extract variables"}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                {hasTemplate
                  ? "Reads all rows from your template and maps them directly to audit variables — no AI, 100% from your file."
                  : "The primary template (.xlsx) is required. Supporting documents are optional."}
              </p>
            </div>
          </div>
          {hasTemplate && (
            <Button
              onClick={onExtractData}
              disabled={loading}
              size="lg"
              className="px-7 shadow-sm shrink-0 font-bold bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {loading
                ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Extracting…</>
                : <><FileCheck className="w-4 h-4 mr-2" /> Extract Data <ArrowRight className="w-4 h-4 ml-2" /></>
              }
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Template Parse Results Panel ─────────────────────────────────────────────

function TemplateParsedPanel({ result, onClear }: { result: any; onClear: () => void }) {
  const [showAllRows, setShowAllRows] = useState(false);
  const { meta = {}, rows = [], errors = [], warnings = [] } = result;
  const hasErrors = errors.length > 0;
  const displayRows = showAllRows ? rows : rows.slice(0, 10);

  const metaFields = [
    { label: "Entity Name",         value: meta.entityName },
    { label: "Company Type",        value: meta.companyType },
    { label: "Industry",            value: meta.industry },
    { label: "Reporting Framework", value: meta.reportingFramework },
    { label: "Year End",            value: meta.yearEnd },
    { label: "Audit Type",          value: meta.auditType },
    { label: "Currency",            value: meta.currency },
    { label: "Engagement Size",     value: meta.engagementSize },
  ];

  // Summarise financial data
  const bsTotal  = rows.filter((r: any) => r.statementType?.toUpperCase() === "BS").reduce((s: number, r: any) => s + (r.currentYear || 0), 0);
  const plTotal  = rows.filter((r: any) => ["P&L","PL"].includes(r.statementType?.toUpperCase() || "")).reduce((s: number, r: any) => s + (r.currentYear || 0), 0);
  const glRows   = rows.filter((r: any) => r.aiGlFlag?.toUpperCase() === "YES").length;
  const highRisk = rows.filter((r: any) => r.riskLevel?.toLowerCase() === "high").length;

  const fmt = (n: number) => n === 0 ? "—" : (n >= 1_000_000 ? `${(n/1_000_000).toFixed(1)}M` : n >= 1_000 ? `${(n/1_000).toFixed(0)}K` : String(n));

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
      {/* Header */}
      <div className={cn("px-5 py-4 border-b flex items-center justify-between gap-3",
        hasErrors ? "bg-red-50 border-red-200" : "bg-gradient-to-r from-emerald-50 to-teal-50/50 border-emerald-100"
      )}>
        <div className="flex items-center gap-2.5">
          {hasErrors
            ? <AlertTriangle className="w-5 h-5 text-red-500" />
            : <CheckCircle2 className="w-5 h-5 text-emerald-600" />}
          <div>
            <h2 className="font-semibold text-slate-900">Template Parse Result</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {rows.length} financial rows · {errors.length} errors · {warnings.length} warnings
              {result.persisted ? " · Data saved to session" : ""}
            </p>
          </div>
        </div>
        <button onClick={onClear} className="text-xs text-slate-400 hover:text-slate-600 px-2 py-1 rounded-lg hover:bg-slate-100 transition-colors">
          Clear
        </button>
      </div>

      <div className="p-5 space-y-5">

        {/* Summary stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Financial Rows",  value: rows.length,          color: "blue"   },
            { label: "BS Value (CY)",   value: fmt(bsTotal),          color: "indigo" },
            { label: "P&L Value (CY)",  value: fmt(plTotal),          color: "purple" },
            { label: "GL Candidates",   value: glRows,               color: "violet" },
            { label: "High Risk Lines", value: highRisk,             color: "orange" },
            { label: "Errors",          value: errors.length,        color: errors.length ? "red" : "emerald" },
            { label: "Warnings",        value: warnings.length,      color: warnings.length ? "amber" : "emerald" },
            { label: "Sheet Detected",  value: result.isOneSheetFormat ? "✓ Template" : "Generic", color: result.isOneSheetFormat ? "emerald" : "slate" },
          ].map(s => (
            <div key={s.label} className={cn("rounded-xl p-3 border text-center",
              s.color === "red" ? "bg-red-50 border-red-100" :
              s.color === "amber" ? "bg-amber-50 border-amber-100" :
              s.color === "emerald" ? "bg-emerald-50 border-emerald-100" :
              s.color === "orange" ? "bg-orange-50 border-orange-100" :
              "bg-slate-50 border-slate-100"
            )}>
              <p className="text-lg font-bold text-slate-900">{s.value}</p>
              <p className="text-[11px] text-slate-500 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Engagement fields */}
        <div>
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-500" /> Engagement Profile
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            {metaFields.map(f => (
              <div key={f.label} className={cn("rounded-xl p-3 border",
                f.value ? "bg-slate-50 border-slate-200" : "bg-amber-50 border-amber-200"
              )}>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">{f.label}</p>
                <p className={cn("text-sm font-medium truncate", f.value ? "text-slate-900" : "text-amber-600 italic")}>
                  {f.value || "Not found"}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Errors */}
        {errors.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <h3 className="text-xs font-semibold text-red-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" /> Validation Errors ({errors.length})
            </h3>
            <ul className="space-y-1">
              {errors.map((e: string, i: number) => (
                <li key={i} className="text-xs text-red-700 flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 mt-1.5 shrink-0" />
                  {e}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Warnings */}
        {warnings.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <h3 className="text-xs font-semibold text-amber-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" /> Warnings ({warnings.length})
            </h3>
            <ul className="space-y-1">
              {warnings.slice(0, 8).map((w: string, i: number) => (
                <li key={i} className="text-xs text-amber-800 flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 shrink-0" />
                  {w}
                </li>
              ))}
              {warnings.length > 8 && (
                <li className="text-xs text-amber-600 italic">…and {warnings.length - 8} more warnings</li>
              )}
            </ul>
          </div>
        )}

        {/* FS rows grid */}
        {rows.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-indigo-500" /> Financial Statement Rows ({rows.length}) — all 20 template columns
            </h3>
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[1400px]">
                  <thead>
                    <tr className="bg-slate-800 text-white">
                      {[
                        "#","Type","FS Section","Major Head","Line Item","Sub-Line","Account Name",
                        "Code","Note","CY","PY","Debit","Credit","Norm Bal",
                        "Risk","WP Area","Procedure","GL?","GL Priority","Remarks"
                      ].map(h => (
                        <th key={h} className="px-2.5 py-2 text-left font-semibold text-[11px] whitespace-nowrap text-slate-200">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {displayRows.map((row: any, i: number) => (
                      <tr key={i} className={cn("border-b border-slate-100 hover:bg-blue-50/30 transition-colors",
                        i % 2 === 0 ? "bg-white" : "bg-slate-50/40"
                      )}>
                        {/* # */}
                        <td className="px-2.5 py-1.5 text-slate-400 font-mono">{row.lineId}</td>
                        {/* Type */}
                        <td className="px-2.5 py-1.5">
                          <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold",
                            row.statementType?.toUpperCase() === "BS"  ? "bg-blue-100 text-blue-700" :
                            ["P&L","PL"].includes(row.statementType?.toUpperCase() || "") ? "bg-purple-100 text-purple-700" :
                            row.statementType?.toUpperCase() === "OCI" ? "bg-teal-100 text-teal-700" :
                            row.statementType?.toUpperCase() === "EQ"  ? "bg-emerald-100 text-emerald-700" :
                            row.statementType?.toUpperCase() === "CF"  ? "bg-cyan-100 text-cyan-700" :
                            "bg-slate-100 text-slate-600"
                          )}>{row.statementType || "—"}</span>
                        </td>
                        {/* FS Section */}
                        <td className="px-2.5 py-1.5 text-slate-700 max-w-[90px] truncate" title={row.fsSection}>{row.fsSection || "—"}</td>
                        {/* Major Head */}
                        <td className="px-2.5 py-1.5 text-slate-600 max-w-[110px] truncate" title={row.majorHead}>{row.majorHead || "—"}</td>
                        {/* Line Item */}
                        <td className="px-2.5 py-1.5 font-medium text-slate-900 max-w-[130px] truncate" title={row.lineItem}>{row.lineItem || "—"}</td>
                        {/* Sub-Line */}
                        <td className="px-2.5 py-1.5 text-slate-600 max-w-[100px] truncate" title={row.subLineItem}>{row.subLineItem || "—"}</td>
                        {/* Account Name */}
                        <td className="px-2.5 py-1.5 text-slate-700 max-w-[120px] truncate" title={row.accountName}>{row.accountName || "—"}</td>
                        {/* Code */}
                        <td className="px-2.5 py-1.5 text-slate-500 font-mono">{row.accountCode || "—"}</td>
                        {/* Note */}
                        <td className="px-2.5 py-1.5 text-slate-500 text-center">{row.noteNo || "—"}</td>
                        {/* CY */}
                        <td className="px-2.5 py-1.5 text-right text-slate-900 font-medium whitespace-nowrap">
                          {row.currentYear ? row.currentYear.toLocaleString() : "—"}
                        </td>
                        {/* PY */}
                        <td className="px-2.5 py-1.5 text-right text-slate-400 whitespace-nowrap">
                          {row.priorYear ? row.priorYear.toLocaleString() : "—"}
                        </td>
                        {/* Debit */}
                        <td className="px-2.5 py-1.5 text-right text-blue-700 whitespace-nowrap">
                          {row.debitTransactionValue ? row.debitTransactionValue.toLocaleString() : "—"}
                        </td>
                        {/* Credit */}
                        <td className="px-2.5 py-1.5 text-right text-rose-700 whitespace-nowrap">
                          {row.creditTransactionValue ? row.creditTransactionValue.toLocaleString() : "—"}
                        </td>
                        {/* Normal Bal */}
                        <td className="px-2.5 py-1.5">
                          <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold",
                            row.normalBalance?.toLowerCase() === "debit"  ? "bg-blue-50 text-blue-600" :
                            row.normalBalance?.toLowerCase() === "credit" ? "bg-rose-50 text-rose-600" :
                            "bg-slate-100 text-slate-500"
                          )}>{row.normalBalance || "—"}</span>
                        </td>
                        {/* Risk */}
                        <td className="px-2.5 py-1.5">
                          <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold",
                            row.riskLevel?.toLowerCase() === "high"   ? "bg-red-100 text-red-700" :
                            row.riskLevel?.toLowerCase() === "medium" ? "bg-amber-100 text-amber-700" :
                            "bg-emerald-100 text-emerald-700"
                          )}>{row.riskLevel || "—"}</span>
                        </td>
                        {/* WP Area */}
                        <td className="px-2.5 py-1.5 text-slate-600 max-w-[90px] truncate" title={row.wpArea}>{row.wpArea || "—"}</td>
                        {/* Procedure */}
                        <td className="px-2.5 py-1.5">
                          <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium",
                            row.procedureScale?.toLowerCase() === "expanded" ? "bg-indigo-100 text-indigo-700" :
                            row.procedureScale?.toLowerCase() === "standard" ? "bg-slate-100 text-slate-600" :
                            "bg-gray-100 text-gray-500"
                          )}>{row.procedureScale || "—"}</span>
                        </td>
                        {/* GL? */}
                        <td className="px-2.5 py-1.5 text-center">
                          {row.aiGlFlag?.toUpperCase() === "YES"
                            ? <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-violet-100 text-violet-700">GL</span>
                            : <span className="text-slate-300">—</span>}
                        </td>
                        {/* GL Priority */}
                        <td className="px-2.5 py-1.5">
                          <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium",
                            row.glGenerationPriority?.toLowerCase() === "high"   ? "bg-orange-100 text-orange-700" :
                            row.glGenerationPriority?.toLowerCase() === "medium" ? "bg-yellow-100 text-yellow-700" :
                            "bg-slate-100 text-slate-400"
                          )}>{row.glGenerationPriority || "—"}</span>
                        </td>
                        {/* Remarks */}
                        <td className="px-2.5 py-1.5 text-slate-400 max-w-[140px] truncate" title={row.remarks}>{row.remarks || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rows.length > 10 && (
                <div className="px-4 py-3 border-t border-slate-200 bg-slate-50/50">
                  <button
                    onClick={() => setShowAllRows(v => !v)}
                    className="text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors"
                  >
                    {showAllRows ? "Show fewer rows" : `Show all ${rows.length} rows`}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Success footer */}
        {!hasErrors && rows.length > 0 && result.persisted && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-emerald-800">Data successfully persisted to session</p>
              <p className="text-xs text-emerald-700 mt-0.5">
                Trial balance lines, GL accounts, variables, and audit engine profile have been auto-populated.
                Proceed to the next stage or review variables before generating working papers.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ExtractionStage({ data, session, onRefreshVariables, onRerun, onAiFill, loading, confidenceBadge, variablesPanel }: any) {
  const extractionData = data?.data || session?.extractionData;
  const stats = data?.stats;
  const [showRawResults, setShowRawResults] = useState(false);

  const hasFlags = extractionData?.flags && extractionData.flags.length > 0;

  return (
    <div className="space-y-4">

      {/* ── Top action banner ── */}
      <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-purple-50 flex items-center justify-center shrink-0">
            <Bot className="w-4.5 h-4.5 text-purple-600" />
          </div>
          <div>
            <p className="font-semibold text-sm text-slate-900">Data Extraction Results</p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {stats
                ? `${stats.files} file${stats.files !== 1 ? "s" : ""} · ${stats.sheets} sheet${stats.sheets !== 1 ? "s" : ""} · ${stats.pages} page${stats.pages !== 1 ? "s" : ""} scanned — data pushed to variables below`
                : extractionData
                ? "Extraction complete — data pushed to variables below"
                : "Template variables loaded below — use AI Filled to complete all remaining fields"}
            </p>
          </div>
        </div>
        <div className="flex gap-2 shrink-0 flex-wrap">
          {extractionData && (
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setShowRawResults(v => !v)}>
              <Eye className="w-3 h-3 mr-1" /> {showRawResults ? "Hide" : "Show"} Raw Results
            </Button>
          )}
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onRerun} disabled={loading}>
            <RefreshCw className={cn("w-3 h-3 mr-1", loading && "animate-spin")} /> Re-extract from Template
          </Button>
          <Button
            size="sm"
            className="h-7 text-xs bg-violet-600 hover:bg-violet-700 shadow-sm"
            onClick={onAiFill}
            disabled={loading}
            title="Detect all missing variables and fill them using AI — reads every uploaded document and derives values intelligently"
          >
            {loading
              ? <><Loader2 className="w-3 h-3 animate-spin mr-1" /> Filling…</>
              : <><Sparkles className="w-3 h-3 mr-1" /> AI Filled</>
            }
          </Button>
        </div>
      </div>

      {/* ── Flags warning (always visible if present) ── */}
      {hasFlags && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <h3 className="text-xs font-semibold text-amber-800 mb-2 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" /> Extraction Flags ({extractionData.flags.length})
          </h3>
          <ul className="space-y-1">
            {extractionData.flags.map((f: string, i: number) => (
              <li key={i} className="text-xs text-amber-800 flex items-start gap-2 bg-white/60 rounded-lg p-2 border border-amber-100">
                <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-500" /> {f}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Raw AI results — collapsible ── */}
      {showRawResults && extractionData && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
            <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Raw AI Extraction Output</span>
          </div>
          <div className="p-4 space-y-4">
            {extractionData.entity && (
              <div>
                <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Entity Profile</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2">
                  {Object.entries(extractionData.entity).filter(([, v]) => v && typeof v !== "object").map(([k, v]) => (
                    <div key={k} className="flex items-baseline gap-1.5">
                      <span className="text-[11px] text-slate-400 capitalize shrink-0">{k.replace(/_/g, " ")}:</span>
                      <span className="text-xs font-medium text-slate-800 truncate">{String(v)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {extractionData.confidence_scores && (
              <div>
                <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Confidence Scores</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {Object.entries(extractionData.confidence_scores).map(([k, v]) => {
                    const n = Number(v);
                    return (
                      <div key={k} className="flex items-center gap-2 bg-slate-50 rounded-lg p-2 border border-slate-100">
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] text-slate-500 capitalize truncate">{k.replace(/_/g, " ")}</p>
                          <div className="w-full h-1 bg-slate-200 rounded-full mt-1 overflow-hidden">
                            <div className={cn("h-full rounded-full", n >= 85 ? "bg-emerald-500" : n >= 70 ? "bg-amber-500" : "bg-red-500")} style={{ width: `${Math.min(n, 100)}%` }} />
                          </div>
                        </div>
                        {confidenceBadge(n)}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Main: Variables one-pager ── */}
      {variablesPanel}

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
  const { toast } = useToast();
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

  const fetchSessionLibraryAndAutoActivate = async () => {
    if (!session?.id) return;
    setLibLoading(true);
    try {
      const r = await fetch(`/api/working-papers/sessions/${session.id}/wp-library-session`);
      const d = await r.json();
      const papers = d.papers || [];
      setSessionLibrary(papers);
      if (papers.length === 0 && !libActivating) {
        setLibActivating(true);
        try {
          const ar = await fetch(`/api/working-papers/sessions/${session.id}/activate-wp-library`, { method: "POST" });
          const ad = await ar.json();
          setLibActivationResult(ad);
          const r2 = await fetch(`/api/working-papers/sessions/${session.id}/wp-library-session`);
          const d2 = await r2.json();
          setSessionLibrary(d2.papers || []);
        } finally { setLibActivating(false); }
      }
    } catch { /* ignore */ } finally { setLibLoading(false); }
  };

  useEffect(() => {
    if (activeEngineTab === "wp_library") {
      if (libView === "browse") fetchWpLibrary();
      else fetchSessionLibraryAndAutoActivate();
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
      if (!r.ok) {
        const errData = await r.json().catch(() => ({ error: "Generation failed" }));
        toast({ title: "Generation blocked", description: (errData.blockedReasons || [errData.error]).join(" · "), variant: "destructive" });
        setGenResult({ error: errData.error, blockedReasons: errData.blockedReasons });
        return;
      }
      // Success — download the file
      const blob = await r.blob();
      const disposition = r.headers.get("Content-Disposition") || "";
      const match = disposition.match(/filename="?([^"]+)"?/);
      const fileName = match?.[1] || `audit-output.${genJobType === "full_file" ? "json" : "csv"}`;
      const jobId = r.headers.get("X-Job-Id");
      const recordCount = r.headers.get("X-Record-Count");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = fileName; a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Output generated & downloaded", description: `${fileName} · ${recordCount || "?"} records` });
      setGenResult({ message: "Output generated", jobId, fileName, recordCount });
      await fetchOutputJobs();
    } catch (e: any) {
      toast({ title: "Generation failed", description: e?.message || "Unknown error", variant: "destructive" });
    } finally { setGenLoading(false); }
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
        body: JSON.stringify({ ...lockForm, eqcrCompleted: !!lockForm.eqcrCompleted }),
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
                <p className="text-red-200 text-xs mt-0.5">Audit procedure exceptions (ISA library) · separate from extraction exceptions in the main audit pipeline</p>
                <p className="text-red-300/70 text-[10px] mt-0.5">Auto-flags: unmapped FS lines · low-confidence entries · incomplete mandatory WPs · TB gaps</p>
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
                    {validation.blockedReasons?.length > 0 && (
                      <>
                        <ul className="mt-1 space-y-0.5">{validation.blockedReasons.map((r: string, i: number) => <li key={i} className="text-xs text-red-600">· {r}</li>)}</ul>
                        {validation.blockedReasons.some((r: string) => r.includes("performanceMateriality") || r.includes("mandatory engagement")) && (
                          <p className="text-xs text-slate-500 mt-1.5 italic">→ Set Performance Materiality in the <strong>Audit Engine</strong> tab to unblock generation.</p>
                        )}
                      </>
                    )}
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
                    {validation.warnings.map((w: string, i: number) => (
                      <div key={i}>
                        <p className="text-xs text-amber-600">· {w}</p>
                        {w.includes("mandatory WP") && <p className="text-[10px] text-slate-400 ml-3 italic">Expected for new sessions — update WP statuses in the WP Library tab as audit work progresses.</p>}
                        {w.includes("not mapped to FS") && <p className="text-[10px] text-slate-400 ml-3 italic">Run the extract + FS mapping workflow to map TB accounts to financial statement lines.</p>}
                      </div>
                    ))}
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
function sourceIcon(sourceType: string | null | undefined): { label: string; cls: string; isTemplate?: boolean } {
  if (!sourceType) return { label: "", cls: "" };
  switch (sourceType) {
    case "primary_session":   return { label: "Session Data",       cls: "text-emerald-700 bg-emerald-50 border-emerald-200", isTemplate: false };
    case "primary_template":  return { label: "Template Upload",    cls: "text-emerald-700 bg-emerald-50 border-emerald-200", isTemplate: true };
    case "system_calculated": return { label: "System Formula",     cls: "text-indigo-700 bg-indigo-50 border-indigo-200" };
    case "template":          return { label: "Template Upload",    cls: "text-emerald-700 bg-emerald-50 border-emerald-200", isTemplate: true };
    case "ai_extraction":     return { label: "AI Extracted",       cls: "text-blue-600 bg-blue-50 border-blue-200" };
    case "session":           return { label: "Session",            cls: "text-emerald-600 bg-emerald-50 border-emerald-200" };
    case "user_edit":         return { label: "Manual",             cls: "text-purple-600 bg-purple-50 border-purple-200" };
    case "formula":           return { label: "Calculated",         cls: "text-indigo-600 bg-indigo-50 border-indigo-200" };
    case "autofill":          return { label: "AI Processed",       cls: "text-blue-600 bg-blue-50 border-blue-200" };
    case "default":           return { label: "Default",            cls: "text-slate-500 bg-slate-50 border-slate-200" };
    case "assumption":        return { label: "Assumed",            cls: "text-amber-600 bg-amber-50 border-amber-200" };
    default: return { label: sourceType.replace(/_/g, " "), cls: "text-slate-500 bg-slate-50 border-slate-200" };
  }
}

function categoryBadge(sourceType: string | null | undefined, reviewStatus: string | null | undefined): { label: string; cls: string } | null {
  if (!sourceType && !reviewStatus) return null;
  if (sourceType === "primary_session" || sourceType === "primary_template" || sourceType === "template" || sourceType === "session")
    return { label: "Primary", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" };
  if (sourceType === "system_calculated" || sourceType === "formula" || reviewStatus === "calculated")
    return { label: "Secondary", cls: "bg-indigo-100 text-indigo-700 border-indigo-200" };
  if (sourceType === "ai_extraction" || sourceType === "autofill" || reviewStatus === "ai_filled" || reviewStatus === "auto_filled")
    return { label: "AI", cls: "bg-blue-100 text-blue-700 border-blue-200" };
  return null;
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

// Modes where saving should fire immediately on change (not on blur)
const IMMEDIATE_SAVE_MODES = new Set([
  "toggle", "yes_no_na", "pass_fail", "risk_level", "rating_level",
  "exception_flag", "checkbox", "dropdown", "status", "conclusion",
  "radio", "date", "time", "datetime",
]);

function VariableRow({ v, onSaveDirect, confidenceBadge }: any) {
  const def = v.definition;
  const inputMode = def?.inputMode || "text";
  const isMandatory = def?.mandatoryFlag;

  // Derive status flags
  const isLocked       = !!v.isLocked;
  const isPrimaryFilled = v.sourceType === "primary_session" || v.sourceType === "primary_template"
                          || v.sourceType === "template" || v.sourceType === "session"
                          || v.reviewStatus === "template_filled" || v.reviewStatus === "filled";
  const isSecondaryCalc = v.sourceType === "system_calculated" || v.sourceType === "formula"
                          || v.reviewStatus === "calculated";
  const isTemplateFilled = isPrimaryFilled; // kept for compat
  const isAiFilled     = ["ai_filled", "auto_filled", "ai_extraction", "autofill"].includes(v.reviewStatus)
                          || v.sourceType === "ai_extraction" || v.sourceType === "ai_fill";
  const isUserEdited   = !!(v.userEditedValue || v.reviewStatus === "user_edited");
  const isEmpty        = !v.finalValue || v.finalValue.trim() === "" || v.finalValue === "N/A";
  const isLowConf      = !!(v.confidence && Number(v.confidence) < 60);

  // Local value state + autosave
  const [localValue, setLocalValue] = useState<string>(v.finalValue || "");
  const [saving, setSaving]         = useState(false);

  // Sync when server pushes an update
  useEffect(() => { setLocalValue(v.finalValue || ""); }, [v.finalValue]);

  const triggerSave = async (val: string) => {
    if (isLocked) return;
    if (val === (v.finalValue ?? "")) return;
    setSaving(true);
    await onSaveDirect?.(v.id, val, "User edit via extraction form");
    setSaving(false);
  };

  const handleChange = (val: string) => {
    setLocalValue(val);
    if (IMMEDIATE_SAVE_MODES.has(inputMode)) triggerSave(val);
  };

  const handleBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    if (!IMMEDIATE_SAVE_MODES.has(inputMode)) triggerSave(localValue);
  };

  // Determine status tag
  type StatusKey = "locked" | "primary" | "secondary" | "user_edited" | "ai_filled" | "missing" | "low_conf" | null;
  const statusKey: StatusKey =
    isLocked         ? "locked"     :
    isUserEdited     ? "user_edited":
    isPrimaryFilled  ? "primary"    :
    isSecondaryCalc  ? "secondary"  :
    isAiFilled       ? "ai_filled"  :
    isEmpty          ? "missing"    :
    isLowConf        ? "low_conf"   : null;

  const STATUS_LABELS: Record<NonNullable<StatusKey>, string> = {
    locked:      "Locked",
    primary:     "Primary",
    secondary:   "Calculated",
    user_edited: "Edited",
    ai_filled:   "AI Filled",
    missing:     "Missing",
    low_conf:    "Low Conf.",
  };
  const STATUS_STYLES: Record<NonNullable<StatusKey>, string> = {
    locked:      "bg-slate-100 text-slate-500 border-slate-200",
    primary:     "bg-emerald-100 text-emerald-700 border-emerald-200",
    secondary:   "bg-indigo-100 text-indigo-700 border-indigo-200",
    user_edited: "bg-violet-100 text-violet-700 border-violet-200",
    ai_filled:   "bg-blue-50 text-blue-600 border-blue-100",
    missing:     "bg-red-100 text-red-700 border-red-200",
    low_conf:    "bg-amber-100 text-amber-700 border-amber-200",
  };

  // Row styling
  const rowBg = isLocked          ? "bg-slate-50/50"
    : isEmpty && isMandatory       ? "bg-red-50/30"
    : isLowConf                    ? "bg-amber-50/20"
    : isPrimaryFilled              ? "bg-emerald-50/10"
    : isSecondaryCalc              ? "bg-indigo-50/10"
    : "bg-white";

  const leftAccent = isLocked          ? "border-l-2 border-l-slate-300"
    : isEmpty && isMandatory           ? "border-l-2 border-l-red-400"
    : isPrimaryFilled                  ? "border-l-2 border-l-emerald-400"
    : isSecondaryCalc                  ? "border-l-2 border-l-indigo-400"
    : isAiFilled                       ? "border-l-2 border-l-blue-300"
    : "border-l-2 border-l-transparent";

  const groupLabel = (def?.variableGroup || "Other").replace(/_/g, " ");

  return (
    <div className={cn("flex items-start gap-3 px-5 py-3 hover:bg-slate-50/60 transition-colors", rowBg, leftAccent)}>

      {/* Category pill */}
      <span className="hidden sm:block text-[9px] font-semibold text-slate-400 bg-slate-50 border border-slate-100 rounded px-1.5 py-0.5 uppercase tracking-wide whitespace-nowrap mt-0.5 shrink-0 w-28 text-center truncate" title={groupLabel}>
        {groupLabel}
      </span>

      {/* Variable name + status badge */}
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-1.5 flex-wrap">
          <p className="text-[12.5px] font-medium text-slate-800 leading-tight">
            {def?.variableLabel || (v.variableName || "").replace(/_/g, " ")}
            {isMandatory && <span className="ml-1 text-red-500 text-[10px]" title="Required">*</span>}
          </p>
          {statusKey && (
            <span className={cn(
              "inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide border whitespace-nowrap shrink-0",
              STATUS_STYLES[statusKey]
            )}>
              {statusKey === "primary"     && <Upload className="w-2.5 h-2.5" />}
              {statusKey === "secondary"   && <span className="font-bold text-[8px]">ƒ</span>}
              {statusKey === "ai_filled"   && <Sparkles className="w-2.5 h-2.5" />}
              {statusKey === "user_edited" && <Pencil className="w-2.5 h-2.5" />}
              {statusKey === "locked"      && <Lock className="w-2.5 h-2.5" />}
              {statusKey === "missing"     && <AlertCircle className="w-2.5 h-2.5" />}
              {statusKey === "low_conf"    && <AlertTriangle className="w-2.5 h-2.5" />}
              {STATUS_LABELS[statusKey]}
            </span>
          )}
        </div>
        <p className="text-[10px] text-slate-400 mt-0.5 font-mono">{v.variableCode}</p>
      </div>

      {/* Editable value */}
      <div className="shrink-0 min-w-[180px] max-w-[300px]" onBlur={handleBlur}>
        {isLocked ? (
          <RenderDisplayValue def={def} value={v.finalValue || "—"} sourceType={v.sourceType} />
        ) : (
          <RenderEditInput def={def} value={localValue} onChange={handleChange} />
        )}
      </div>

      {/* Confidence badge + saving indicator */}
      <div className="shrink-0 flex items-center gap-1 mt-0.5">
        {saving
          ? <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" />
          : confidenceBadge(v.confidence ? Number(v.confidence) : null)
        }
        {isLocked && <Lock className="w-3 h-3 text-slate-300 ml-0.5" />}
      </div>
    </div>
  );
}

function VariablesStage({ variables, grouped, stats, changeLog, onSave, onSaveDirect, onAiFill, onFetch, onLockAll, loading, confidenceBadge }: any) {
  const [search, setSearch]           = useState("");
  const [filter, setFilter]           = useState<string>("all");
  const [showAuditTrail, setShowAuditTrail] = useState(false);
  const [aiFilling, setAiFilling]     = useState(false);

  useEffect(() => { if (variables.length === 0) onFetch(); }, []);

  // Computed counts (client-side, always fresh)
  const isPrimaryFilled = (v: any) => v.sourceType === "primary_session" || v.sourceType === "primary_template"
    || v.sourceType === "template" || v.sourceType === "session"
    || v.reviewStatus === "template_filled" || v.reviewStatus === "filled";
  const isSecondaryCalc = (v: any) => v.sourceType === "system_calculated" || v.sourceType === "formula"
    || v.reviewStatus === "calculated";
  const isAiFilled = (v: any) => ["ai_filled", "auto_filled", "ai_extraction", "autofill"].includes(v.reviewStatus)
    || v.sourceType === "ai_extraction" || v.sourceType === "ai_fill";

  const primaryFilledCount  = variables.filter(isPrimaryFilled).length;
  const secondaryCalcCount  = variables.filter(isSecondaryCalc).length;
  const aiFilledCount       = variables.filter(isAiFilled).length;
  const missingCount        = variables.filter((v: any) =>
    !v.finalValue || v.finalValue.trim() === "" || v.finalValue === "N/A").length;
  const highConfCount = variables.filter((v: any) => v.confidence && Number(v.confidence) >= 85).length;
  const lowConfCount  = variables.filter((v: any) => v.confidence && Number(v.confidence) < 60).length;

  // Lock All is only enabled when zero variables are missing
  const canLockAll = missingCount === 0 && variables.length > 0 && !loading;

  const filterVar = (v: any) => {
    if (search) {
      const s = search.toLowerCase();
      const label = (v.definition?.variableLabel || v.variableName || "").toLowerCase();
      const code  = (v.variableCode || "").toLowerCase();
      if (!label.includes(s) && !code.includes(s)) return false;
    }
    if (filter === "primary")     return isPrimaryFilled(v);
    if (filter === "secondary")   return isSecondaryCalc(v);
    if (filter === "ai_filled")   return isAiFilled(v);
    if (filter === "missing")     return !v.finalValue || v.finalValue.trim() === "" || v.finalValue === "N/A";
    if (filter === "high_conf")   return !!(v.confidence && Number(v.confidence) >= 85);
    if (filter === "low_conf")    return !!(v.confidence && Number(v.confidence) < 60);
    return true;
  };

  const filteredVars = variables.filter(filterVar);

  const handleAiFillClick = async () => {
    setAiFilling(true);
    await onAiFill?.();
    setAiFilling(false);
  };

  const statTiles = [
    { label: "Total",        value: variables.length,     icon: Settings2,     bg: "bg-slate-50",   iconColor: "text-slate-500",    key: "all" },
    { label: "Primary",      value: primaryFilledCount,   icon: Upload,        bg: "bg-emerald-50", iconColor: "text-emerald-600",  key: "primary" },
    { label: "Calculated",   value: secondaryCalcCount,   icon: CheckCircle2,  bg: "bg-indigo-50",  iconColor: "text-indigo-600",   key: "secondary" },
    { label: "AI Filled",    value: aiFilledCount,        icon: Sparkles,      bg: "bg-blue-50",    iconColor: "text-blue-600",     key: "ai_filled" },
    { label: "Missing",      value: missingCount,         icon: AlertCircle,   bg: "bg-red-50",     iconColor: "text-red-600",      key: "missing" },
    { label: "High Conf.",   value: highConfCount,        icon: CheckCircle2,  bg: "bg-green-50",   iconColor: "text-green-600",    key: "high_conf" },
    { label: "Low Conf.",    value: lowConfCount,         icon: XCircle,       bg: "bg-red-50",     iconColor: "text-red-500",      key: "low_conf" },
  ];

  const filterChips = [
    { key: "all",        label: "All" },
    { key: "primary",    label: "Primary" },
    { key: "secondary",  label: "Calculated" },
    { key: "ai_filled",  label: "AI Filled" },
    { key: "missing",    label: "Missing" },
    { key: "high_conf",  label: "High Conf." },
    { key: "low_conf",   label: "Low Conf." },
  ];

  return (
    <div className="space-y-4">

      {/* ── Stat tiles ── */}
      <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
        {statTiles.map(s => (
          <button key={s.key} onClick={() => setFilter(s.key)} className={cn(
            "bg-white border rounded-xl p-3 text-center transition-all hover:shadow-sm cursor-pointer",
            filter === s.key ? "ring-2 ring-blue-500 ring-offset-1 border-blue-200 shadow-sm" : "border-slate-200"
          )}>
            <div className={cn("w-7 h-7 rounded-lg mx-auto mb-1 flex items-center justify-center", s.bg)}>
              <s.icon className={cn("w-3.5 h-3.5", s.iconColor)} />
            </div>
            <p className="text-lg font-bold text-slate-900 tabular-nums">{s.value}</p>
            <p className="text-[10px] text-slate-500 font-medium leading-tight mt-0.5">{s.label}</p>
          </button>
        ))}
      </div>

      {/* ── Main card ── */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">

        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1 min-w-0">
              <h2 className="font-semibold text-slate-900 flex items-center gap-2 text-sm">
                <ClipboardList className="w-4 h-4 text-blue-600 shrink-0" />
                Audit Variable Register — 417 Variables
                {stats && <span className="text-xs font-normal text-slate-400 ml-1">({stats.filled}/{stats.total} populated)</span>}
              </h2>
              <div className="flex items-center gap-3 mt-1 flex-wrap">
                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5">
                  <Upload className="w-2.5 h-2.5" /> Phase 1 — Primary: {primaryFilledCount} from session/template
                </span>
                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded px-1.5 py-0.5">
                  <span className="font-bold text-[9px]">ƒ</span> Phase 2 — Secondary: {secondaryCalcCount} system-calculated
                </span>
                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded px-1.5 py-0.5">
                  <Sparkles className="w-2.5 h-2.5" /> Phase 3 — AI: {aiFilledCount} AI-extracted
                </span>
                {missingCount > 0 && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-red-600">
                    <AlertCircle className="w-2.5 h-2.5" /> {missingCount} still missing
                  </span>
                )}
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex gap-1.5 flex-wrap shrink-0">
              <Button variant="outline" size="sm" onClick={onFetch} disabled={loading} className="h-7 text-xs">
                <RefreshCw className="w-3 h-3 mr-1" /> Refresh
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowAuditTrail(v => !v)} className="h-7 text-xs">
                <ClipboardCheck className="w-3 h-3 mr-1" /> Trail ({changeLog.length})
              </Button>
              {onAiFill && (
                <Button size="sm" onClick={handleAiFillClick} disabled={aiFilling || loading}
                  className="h-7 text-xs bg-blue-600 hover:bg-blue-700 shadow-none"
                  title="Phase 3: AI extracts and fills only AI/judgment variables from uploaded documents. Never overwrites Primary or Secondary variables.">
                  {aiFilling
                    ? <Loader2 className="w-3 h-3 animate-spin mr-1" />
                    : <Sparkles className="w-3 h-3 mr-1" />}
                  AI Fill Variables
                </Button>
              )}
              <Button
                size="sm"
                onClick={onLockAll}
                disabled={!canLockAll}
                title={canLockAll
                  ? "Finalize — lock all variables once you have reviewed and confirmed all values"
                  : `${missingCount} variable${missingCount !== 1 ? "s" : ""} still missing — fill all before locking`}
                className={cn(
                  "h-7 text-xs shadow-none",
                  canLockAll ? "bg-amber-500 hover:bg-amber-600 text-white" : "bg-slate-100 text-slate-400 cursor-not-allowed"
                )}
              >
                <Lock className="w-3 h-3 mr-1" />
                Lock All / Finalize
                {!canLockAll && missingCount > 0 && (
                  <span className="ml-1 text-[10px] font-normal">({missingCount})</span>
                )}
              </Button>
            </div>
          </div>

          {/* Search + filter chips */}
          <div className="flex flex-col sm:flex-row gap-2 mt-3">
            <div className="relative flex-1 sm:max-w-sm">
              <Input className="h-8 text-xs pl-8 bg-white" placeholder="Search by variable name or code…"
                value={search} onChange={e => setSearch(e.target.value)} />
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
            </div>
            <div className="flex flex-wrap gap-1">
              {filterChips.map(f => (
                <button key={f.key} onClick={() => setFilter(f.key)} className={cn(
                  "px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all",
                  filter === f.key ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                )}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="px-5 py-2 border-b border-slate-100 bg-slate-50/60 flex flex-wrap items-center gap-3 text-[10px] text-slate-500">
          <span className="font-semibold text-slate-600 uppercase tracking-wide">Key:</span>
          <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-emerald-400" /> From Upload</span>
          <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-blue-400" /> AI Filled</span>
          <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-violet-400" /> User Edited</span>
          <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-red-400" /> Missing</span>
          <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-green-400" /> High Conf.</span>
          <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-amber-400" /> Med. Conf.</span>
          <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-red-400" /> Low Conf.</span>
          <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-slate-300" /> Locked</span>
          <span className="ml-auto text-slate-400 italic">Inline edit — changes autosave on blur</span>
        </div>

        {/* Flat variable list */}
        <div className="divide-y divide-slate-100">
          {variables.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-14 h-14 rounded-2xl bg-slate-100 mx-auto mb-4 flex items-center justify-center">
                <ClipboardList className="w-7 h-7 text-slate-300" />
              </div>
              <p className="text-slate-500 font-medium text-sm">No variables yet</p>
              <p className="text-xs text-slate-400 mt-1">Upload a template and click "Extract Data" to populate all audit variables.</p>
            </div>
          ) : filteredVars.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-sm text-slate-400">No variables match the current filter.</p>
              <button onClick={() => { setFilter("all"); setSearch(""); }} className="text-xs text-blue-600 underline mt-1">Clear filter</button>
            </div>
          ) : filteredVars.map((v: any) => (
            <VariableRow key={v.id} v={v} onSaveDirect={onSaveDirect} confidenceBadge={confidenceBadge} />
          ))}
        </div>

        {/* Audit trail */}
        {showAuditTrail && changeLog.length > 0 && (
          <div className="m-5 mt-0 bg-slate-50 border border-slate-200 rounded-xl p-4">
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

// ─────────────────────────────────────────────────────────────────────────────
// TAB 5 — Trial Balance Stage
// ─────────────────────────────────────────────────────────────────────────────
function TbGenerationStage({ coaData, tbGlProgress, onGenerateTbGl, onPopulate, onUpdate, onValidate, onApprove, onRefresh, onRunRecon, reconResults, loading, session, onNext }: any) {
  const tb = tbGlProgress?.result?.tb;
  const tbStages: any[] = tbGlProgress?.stages || [];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-700 to-indigo-800 rounded-2xl p-5 text-white shadow-md">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
            <BarChart2 className="w-6 h-6 text-blue-200" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-bold">Trial Balance Generation</h2>
            <p className="text-sm text-blue-100 mt-0.5">
              Generates a fully balanced Trial Balance with <span className="font-semibold text-white">zero difference</span>, 
              perfectly matching the Financial Statements. Debit = Credit enforced.
            </p>
            <div className="flex flex-wrap gap-2 mt-2.5">
              {["Zero Difference Rule","FS Reconciliation","Debit = Credit","Opening + Movement = Closing"].map(t => (
                <span key={t} className="text-[11px] px-2 py-0.5 bg-white/10 border border-white/20 rounded-full text-blue-100">{t}</span>
              ))}
            </div>
          </div>
          <Button
            onClick={onGenerateTbGl}
            disabled={loading || tbGlProgress?.running}
            className="bg-white text-blue-800 hover:bg-blue-50 font-bold shrink-0 shadow"
          >
            {tbGlProgress?.running
              ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Generating…</>
              : tb ? <><RefreshCw className="w-4 h-4 mr-2" /> Re-generate</>
              : <><Play className="w-4 h-4 mr-2" /> Generate TB</>
            }
          </Button>
        </div>
      </div>

      {/* TB Engine Progress */}
      {(tbGlProgress?.running || tbStages.length > 0) && (
        <div className="bg-white border border-blue-200 rounded-2xl p-4 shadow-sm">
          <p className="text-xs font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <Loader2 className={cn("w-3.5 h-3.5", tbGlProgress?.running ? "animate-spin text-blue-500" : "text-emerald-500")} />
            Engine Pipeline
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            {(tbStages.length > 0
              ? tbStages
              : ["Input Extraction","Trial Balance","General Ledger","Reconciliation","Enforcement Check"].map(s => ({ stage: s, status: "pending", detail: "Waiting…" }))
            ).map((s: any, i: number) => (
              <div key={i} className="flex items-center gap-2 flex-1 min-w-0">
                {s.status === "ok" ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  : s.status === "fail" ? <X className="w-4 h-4 text-red-500 shrink-0" />
                  : tbGlProgress?.running ? <Loader2 className="w-4 h-4 text-blue-400 animate-spin shrink-0" />
                  : <div className="w-4 h-4 rounded-full border-2 border-slate-200 shrink-0" />}
                <div className="flex-1 min-w-0">
                  <p className={cn("text-xs font-medium truncate",
                    s.status === "ok" ? "text-emerald-700" : s.status === "fail" ? "text-red-600" : "text-slate-500"
                  )}>{s.stage}</p>
                  {s.detail && s.detail !== "Waiting…" && <p className="text-[10px] text-slate-400 truncate">{s.detail}</p>}
                </div>
                {i < 4 && <div className="hidden sm:block w-5 h-px bg-slate-200 shrink-0" />}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TB Results */}
      {tb && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "TB Accounts",      value: tb.lineCount ?? "—",  color: "blue",   icon: Database },
            { label: "TB Status",        value: tb.balanced ? "Balanced ✓" : "Imbalanced ✗",  color: tb.balanced ? "emerald" : "red", icon: CheckCircle2 },
            { label: "Difference",       value: tb.difference != null ? (tb.difference === 0 ? "0.00 ✓" : tb.difference.toLocaleString()) : "—", color: tb.difference === 0 ? "emerald" : "red", icon: Calculator },
            { label: "Last Generated",   value: tbGlProgress?.result?.generatedAt ? new Date(tbGlProgress.result.generatedAt).toLocaleTimeString() : "—", color: "slate", icon: Clock },
          ].map(stat => (
            <div key={stat.label} className={cn(
              "bg-white border rounded-2xl p-4 text-center shadow-sm",
              stat.color === "emerald" ? "border-emerald-200" : stat.color === "red" ? "border-red-200" : "border-slate-200"
            )}>
              <p className={cn("text-xl font-bold",
                stat.color === "emerald" ? "text-emerald-700" : stat.color === "red" ? "text-red-600" : stat.color === "blue" ? "text-blue-700" : "text-slate-800"
              )}>{stat.value}</p>
              <p className="text-[11px] text-slate-500 mt-0.5">{stat.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* COA Preview */}
      {coaData && coaData.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="bg-gradient-to-r from-slate-50 to-blue-50/30 px-5 py-3 border-b border-slate-200/60 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-blue-600" />
              <span className="font-semibold text-slate-900 text-sm">Chart of Accounts</span>
              <span className="text-xs text-slate-500">({coaData.length} accounts)</span>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={onRefresh} disabled={loading} className="h-7 text-xs">
                <RefreshCw className="w-3 h-3 mr-1" /> Refresh
              </Button>
              <Button size="sm" onClick={onValidate} disabled={loading} className="h-7 text-xs bg-blue-600 hover:bg-blue-700 text-white">
                <CheckCircle2 className="w-3 h-3 mr-1" /> Validate
              </Button>
            </div>
          </div>
          <div className="overflow-x-auto max-h-64 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50/80 sticky top-0">
                <tr>
                  {["Code","Account Name","Type","Opening","Debit","Credit","Closing"].map(h => (
                    <th key={h} className="px-3 py-2 text-left font-semibold text-slate-600 whitespace-nowrap border-b border-slate-100">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {coaData.slice(0, 50).map((row: any) => (
                  <tr key={row.id} className="hover:bg-blue-50/20 transition-colors">
                    <td className="px-3 py-1.5 font-mono text-slate-700">{row.accountCode}</td>
                    <td className="px-3 py-1.5 text-slate-800 max-w-[180px] truncate">{row.accountName}</td>
                    <td className="px-3 py-1.5"><span className="px-1.5 py-0.5 rounded text-[10px] bg-blue-50 text-blue-700 font-medium">{row.accountType || "—"}</span></td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{row.openingBalance?.toLocaleString() ?? "—"}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-blue-700">{row.debit?.toLocaleString() ?? "—"}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-red-600">{row.credit?.toLocaleString() ?? "—"}</td>
                    <td className={cn("px-3 py-1.5 text-right tabular-nums font-semibold", (row.closingBalance ?? 0) >= 0 ? "text-slate-900" : "text-red-600")}>
                      {row.closingBalance?.toLocaleString() ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {coaData.length > 50 && <p className="text-center text-xs text-slate-400 py-2">Showing 50 of {coaData.length} accounts</p>}
          </div>
        </div>
      )}

      {!tb && !tbGlProgress?.running && (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-8 text-center">
          <BarChart2 className="w-10 h-10 text-blue-300 mx-auto mb-3" />
          <p className="font-semibold text-slate-700">Trial Balance Not Yet Generated</p>
          <p className="text-sm text-slate-500 mt-1">Click "Generate TB" above to produce a fully balanced Trial Balance.</p>
        </div>
      )}

      {/* Next step */}
      {tb?.balanced && (
        <div className="bg-white border border-emerald-200 rounded-2xl p-5 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
            <div>
              <p className="font-semibold text-slate-900">Trial Balance is balanced ✓</p>
              <p className="text-sm text-slate-500">Proceed to generate the General Ledger.</p>
            </div>
          </div>
          <Button onClick={onNext} className="bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow font-bold">
            <ArrowRight className="w-4 h-4 mr-2" /> General Ledger
          </Button>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 6 — General Ledger Stage
// ─────────────────────────────────────────────────────────────────────────────
function GlGenerationStage({ auditMaster, tbGlProgress, onGenerateTbGl, reconResults, onRunRecon, loading, session, onNext }: any) {
  const gl = tbGlProgress?.result?.gl;
  const tbBalanced = tbGlProgress?.result?.tb?.balanced;

  const reconSummary = (reconResults || []).filter((r: any) => r.type !== "info");
  const fullyReconciled = reconSummary.length === 0 || reconSummary.every((r: any) => r.status === "ok");

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="bg-gradient-to-r from-violet-700 to-purple-800 rounded-2xl p-5 text-white shadow-md">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
            <GitMerge className="w-6 h-6 text-violet-200" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-bold">General Ledger Generation</h2>
            <p className="text-sm text-violet-100 mt-0.5">
              Generates transaction-wise ledgers for every account with realistic narrations and dates. 
              GL must <span className="font-semibold text-white">fully reconcile</span> with the Trial Balance.
            </p>
            <div className="flex flex-wrap gap-2 mt-2.5">
              {["Opening → Movements → Closing","Realistic Transactions","Date & Narration","Full TB Reconciliation"].map(t => (
                <span key={t} className="text-[11px] px-2 py-0.5 bg-white/10 border border-white/20 rounded-full text-violet-100">{t}</span>
              ))}
            </div>
          </div>
          <Button
            onClick={onGenerateTbGl}
            disabled={loading || tbGlProgress?.running}
            className="bg-white text-violet-800 hover:bg-violet-50 font-bold shrink-0 shadow"
          >
            {tbGlProgress?.running
              ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Generating…</>
              : gl ? <><RefreshCw className="w-4 h-4 mr-2" /> Re-generate</>
              : <><Play className="w-4 h-4 mr-2" /> Generate GL</>
            }
          </Button>
        </div>
      </div>

      {/* GL Stats */}
      {gl && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "GL Accounts",      value: gl.accounts ?? "—",  color: "violet" },
            { label: "Total Entries",    value: gl.entries ?? "—",   color: "violet" },
            { label: "TB Reconciled",    value: tbBalanced ? "Yes ✓" : "Pending",  color: tbBalanced ? "emerald" : "amber" },
            { label: "Recon Status",     value: fullyReconciled ? "Clean ✓" : `${reconSummary.length} issues`, color: fullyReconciled ? "emerald" : "red" },
          ].map(stat => (
            <div key={stat.label} className={cn(
              "bg-white border rounded-2xl p-4 text-center shadow-sm",
              stat.color === "emerald" ? "border-emerald-200" : stat.color === "red" ? "border-red-200" : stat.color === "amber" ? "border-amber-200" : "border-violet-200"
            )}>
              <p className={cn("text-xl font-bold",
                stat.color === "emerald" ? "text-emerald-700" : stat.color === "red" ? "text-red-600" : stat.color === "amber" ? "text-amber-600" : "text-violet-700"
              )}>{stat.value}</p>
              <p className="text-[11px] text-slate-500 mt-0.5">{stat.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Reconciliation Results */}
      {reconResults && reconResults.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="bg-gradient-to-r from-slate-50 to-violet-50/30 px-5 py-3 border-b border-slate-200/60 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <GitMerge className="w-4 h-4 text-violet-600" />
              <span className="font-semibold text-slate-900 text-sm">3-Way Reconciliation</span>
              <span className={cn("text-[11px] px-2 py-0.5 rounded-full font-semibold",
                fullyReconciled ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
              )}>{fullyReconciled ? "All Reconciled" : `${reconSummary.length} Issues`}</span>
            </div>
            <Button size="sm" onClick={onRunRecon} disabled={loading} variant="outline" className="h-7 text-xs">
              <RefreshCw className="w-3 h-3 mr-1" /> Re-run
            </Button>
          </div>
          <div className="divide-y divide-slate-50 max-h-60 overflow-y-auto">
            {reconResults.map((r: any, i: number) => (
              <div key={i} className="px-5 py-2.5 flex items-start gap-3">
                {r.status === "ok" ? <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                  : r.status === "fail" ? <X className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                  : <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-slate-800">{r.check || r.label}</p>
                  {r.detail && <p className="text-[11px] text-slate-500">{r.detail}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!gl && !tbGlProgress?.running && (
        <div className="bg-violet-50 border border-violet-200 rounded-2xl p-8 text-center">
          <GitMerge className="w-10 h-10 text-violet-300 mx-auto mb-3" />
          <p className="font-semibold text-slate-700">General Ledger Not Yet Generated</p>
          <p className="text-sm text-slate-500 mt-1">
            {tbBalanced
              ? "Trial Balance is balanced. Click \"Generate GL\" to produce the full General Ledger."
              : "Generate the Trial Balance first (Tab 5), then return here to generate the GL."}
          </p>
        </div>
      )}

      {gl && fullyReconciled && (
        <div className="bg-white border border-emerald-200 rounded-2xl p-5 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
            <div>
              <p className="font-semibold text-slate-900">General Ledger is fully reconciled ✓</p>
              <p className="text-sm text-slate-500">{gl.accounts} accounts · {gl.entries} entries — all balanced and reconciled with TB.</p>
            </div>
          </div>
          <Button onClick={onNext} className="bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow font-bold">
            <ArrowRight className="w-4 h-4 mr-2" /> Working Papers
          </Button>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 5 — Working Paper Listing Stage
// ─────────────────────────────────────────────────────────────────────────────
// ─── WP Library Types ───────────────────────────────────────────────────────
interface WpItem {
  code: string;
  label: string;
  description: string;
  category: string;
  phase: string;
  mandatory: boolean;
  risk: "all" | "medium" | "high";
  isa: string;
  type: "planning" | "risk" | "analytical" | "controls" | "substantive" | "completion" | "reporting" | "quality";
  complexity: "low" | "medium" | "high";
  outputType: "word" | "excel" | "word+excel";
  assertions: string[];
  industry: "all" | "manufacturing" | "trading" | "services" | "financial" | "listed";
}

const WP_CATEGORY_LABELS: Record<string, string> = {
  pre_planning:  "A — Pre-Planning & Engagement Acceptance",
  planning:      "B — Planning, Strategy & Materiality",
  risk:          "C — Risk Assessment (ISA 315 / ISA 240)",
  analytical:    "D — Analytical Procedures (ISA 520)",
  controls:      "E — Internal Controls (ISA 315)",
  substantive_assets:   "F — Substantive — Balance Sheet: Assets",
  substantive_liab:     "G — Substantive — Balance Sheet: Liabilities & Equity",
  substantive_pl:       "H — Substantive — Profit & Loss",
  tax:           "I — Taxation (FBR / ITO 2001 / Sales Tax)",
  estimates:     "J — Estimates, Judgments & Fair Value (ISA 540)",
  related_party: "K — Related Parties & Compliance (ISA 550 / ISA 250)",
  evidence:      "L — Audit Evidence & Misstatements (ISA 500 / 450)",
  completion:    "M — Completion Procedures (ISA 560 / 570 / 580)",
  reporting:     "N — Reporting & Opinion (ISA 700 Series)",
  quality:       "O — Quality Control & EQCR (ISQM 1)",
  archiving:     "P — Archiving & File Closure",
  specialized:   "Q — Specialized / Conditional Templates",
};

const WP_TYPE_LABELS: Record<string, string> = {
  planning: "Planning", risk: "Risk", analytical: "Analytical",
  controls: "Controls", substantive: "Substantive", completion: "Completion",
  reporting: "Reporting", quality: "Quality",
};

const DEFAULT_WP_ITEMS: WpItem[] = [
  // ─── A: Pre-Planning ────────────────────────────────────────────────────────
  { code:"A1",  label:"Engagement Acceptance & Continuance",      description:"Documents firm's decision to accept/continue the engagement per ISQM 1 and ISA 220, including risk evaluation.",                                         category:"pre_planning", phase:"Pre-Planning", mandatory:true,  risk:"all",    isa:"ISA 220, ISQM 1",        type:"planning",    complexity:"medium", outputType:"word",       assertions:["completeness"],                                     industry:"all" },
  { code:"A2",  label:"Client Background & Entity Profile",       description:"Comprehensive entity profile — ownership, governance, business model, regulatory status under Companies Act 2017.",                                       category:"pre_planning", phase:"Pre-Planning", mandatory:true,  risk:"all",    isa:"ISA 315",                type:"planning",    complexity:"medium", outputType:"word",       assertions:["completeness","accuracy"],                          industry:"all" },
  { code:"A3",  label:"Independence & Ethics Declaration",        description:"Independence confirmation for all team members; threats, safeguards, and rotation per ICAP Code of Ethics.",                                              category:"pre_planning", phase:"Pre-Planning", mandatory:true,  risk:"all",    isa:"ISA 220, ICAP Code",     type:"planning",    complexity:"low",    outputType:"word",       assertions:["completeness"],                                     industry:"all" },
  { code:"A4",  label:"Engagement Letter",                        description:"Formal engagement letter establishing scope, terms, fees, and responsibilities per ISA 210.",                                                             category:"pre_planning", phase:"Pre-Planning", mandatory:true,  risk:"all",    isa:"ISA 210",                type:"planning",    complexity:"low",    outputType:"word",       assertions:["completeness"],                                     industry:"all" },
  { code:"A5",  label:"KYC / AML Procedures",                    description:"Know-Your-Customer and Anti-Money Laundering checks per FATF, State Bank directives, and ICAP guidelines.",                                              category:"pre_planning", phase:"Pre-Planning", mandatory:false, risk:"medium", isa:"ISQM 1, AML Regs",       type:"planning",    complexity:"medium", outputType:"word",       assertions:["completeness"],                                     industry:"all" },
  { code:"A6",  label:"Prior Auditor Communication",             description:"Communication with predecessor auditor; review of predecessor's reports and significant matters per ISA 510.",                                            category:"pre_planning", phase:"Pre-Planning", mandatory:false, risk:"all",    isa:"ISA 510",                type:"planning",    complexity:"low",    outputType:"word",       assertions:["completeness","accuracy"],                          industry:"all" },
  { code:"A7",  label:"Management Integrity Assessment",         description:"Assessment of management integrity and competence; fraud indicators at entity level per ISA 240.",                                                        category:"pre_planning", phase:"Pre-Planning", mandatory:false, risk:"medium", isa:"ISA 240",                type:"risk",        complexity:"medium", outputType:"word",       assertions:["completeness"],                                     industry:"all" },
  { code:"A8",  label:"Group Audit Considerations",              description:"Planning and coordination for group audits including component auditor instructions per ISA 600.",                                                         category:"pre_planning", phase:"Pre-Planning", mandatory:false, risk:"all",    isa:"ISA 600",                type:"planning",    complexity:"high",   outputType:"word",       assertions:["completeness","accuracy"],                          industry:"all" },
  { code:"A9",  label:"Engagement Team Allocation & Budget",     description:"Team structure, role assignments, time budgets, and senior oversight responsibilities per ISQM 1.",                                                       category:"pre_planning", phase:"Pre-Planning", mandatory:true,  risk:"all",    isa:"ISA 220, ISQM 1",        type:"planning",    complexity:"low",    outputType:"word",       assertions:["completeness"],                                     industry:"all" },
  { code:"A10", label:"Independence Threats & Safeguards Assessment", description:"Detailed analysis of self-interest, self-review, advocacy, familiarity and intimidation threats with safeguards per IESBA Code.",                 category:"pre_planning", phase:"Pre-Planning", mandatory:true,  risk:"all",    isa:"IESBA Code, ISA 220",    type:"planning",    complexity:"medium", outputType:"word",       assertions:["completeness"],                                     industry:"all" },
  { code:"A11", label:"Engagement Risk Classification",          description:"Classification of engagement as low/medium/high risk driving scope, procedures, and EQCR requirement.",                                                   category:"pre_planning", phase:"Pre-Planning", mandatory:true,  risk:"all",    isa:"ISQM 1",                 type:"risk",        complexity:"medium", outputType:"word",       assertions:["completeness","accuracy"],                          industry:"all" },
  { code:"A12", label:"Client Acceptance Approval Memo",        description:"Partner/manager sign-off memo formally approving client acceptance/continuance with supporting rationale.",                                               category:"pre_planning", phase:"Pre-Planning", mandatory:true,  risk:"all",    isa:"ISA 220, ISQM 1",        type:"planning",    complexity:"low",    outputType:"word",       assertions:["completeness"],                                     industry:"all" },

  // ─── B: Planning & Strategy ─────────────────────────────────────────────────
  { code:"B1",  label:"Audit Strategy & Planning Memorandum",    description:"Overall audit strategy documenting scope, timing, direction, and key decisions per ISA 300.",                                                             category:"planning",     phase:"Planning",     mandatory:true,  risk:"all",    isa:"ISA 300",                type:"planning",    complexity:"high",   outputType:"word",       assertions:["completeness"],                                     industry:"all" },
  { code:"B2",  label:"Materiality Computation",                 description:"Overall materiality, performance materiality, and trivial threshold with benchmark selection rationale per ISA 320.",                                      category:"planning",     phase:"Planning",     mandatory:true,  risk:"all",    isa:"ISA 320",                type:"planning",    complexity:"medium", outputType:"word+excel",  assertions:["completeness","accuracy"],                          industry:"all" },
  { code:"B3",  label:"Understanding the Entity (ISA 315)",      description:"Documented understanding of entity, environment, internal control system, and information systems.",                                                      category:"planning",     phase:"Planning",     mandatory:true,  risk:"all",    isa:"ISA 315",                type:"planning",    complexity:"high",   outputType:"word",       assertions:["completeness"],                                     industry:"all" },
  { code:"B4",  label:"Audit Program — Overall",                 description:"Comprehensive audit program covering all significant areas; linked to risk assessment and materiality.",                                                   category:"planning",     phase:"Planning",     mandatory:true,  risk:"all",    isa:"ISA 300",                type:"planning",    complexity:"high",   outputType:"word",       assertions:["completeness"],                                     industry:"all" },
  { code:"B5",  label:"Key Accounting Estimates (ISA 540)",      description:"Identification and planning for key accounting estimates including expected credit losses, provisions, and depreciation.",                                 category:"planning",     phase:"Planning",     mandatory:false, risk:"medium", isa:"ISA 540",                type:"planning",    complexity:"medium", outputType:"word",       assertions:["accuracy","valuation"],                             industry:"all" },
  { code:"B6",  label:"IT Systems Understanding",                description:"Understanding of entity's IT environment, general IT controls, automated controls, and IT-related risks.",                                                category:"planning",     phase:"Planning",     mandatory:false, risk:"medium", isa:"ISA 315",                type:"controls",    complexity:"medium", outputType:"word",       assertions:["completeness","accuracy"],                          industry:"all" },
  { code:"B7",  label:"Going Concern — Initial Assessment",      description:"Preliminary assessment of going concern indicators, management plans, and audit response per ISA 570.",                                                   category:"planning",     phase:"Planning",     mandatory:false, risk:"medium", isa:"ISA 570",                type:"planning",    complexity:"medium", outputType:"word",       assertions:["completeness"],                                     industry:"all" },
  { code:"B8",  label:"Related Party Planning",                  description:"Identification of related parties, related party transactions, and design of procedures to address ISA 550 requirements.",                               category:"planning",     phase:"Planning",     mandatory:false, risk:"medium", isa:"ISA 550",                type:"planning",    complexity:"medium", outputType:"word",       assertions:["completeness","accuracy"],                          industry:"all" },
  { code:"B9",  label:"Laws & Regulations Planning (ISA 250)",   description:"Identification of applicable laws and regulations, compliance procedures planning, and non-compliance risk assessment.",                                  category:"planning",     phase:"Planning",     mandatory:true,  risk:"all",    isa:"ISA 250",                type:"planning",    complexity:"medium", outputType:"word",       assertions:["completeness"],                                     industry:"all" },
  { code:"B10", label:"Journal Entry Testing Plan (ISA 240)",    description:"Journal entry risk assessment, selection criteria for high-risk entries, and testing plan for management override.",                                     category:"planning",     phase:"Planning",     mandatory:true,  risk:"all",    isa:"ISA 240",                type:"risk",        complexity:"medium", outputType:"word",       assertions:["completeness","occurrence"],                        industry:"all" },
  { code:"B11", label:"Sampling Strategy Memo",                  description:"Audit sampling approach — statistical vs. non-statistical, population definition, sample size justification per ISA 530.",                              category:"planning",     phase:"Planning",     mandatory:false, risk:"all",    isa:"ISA 530",                type:"planning",    complexity:"medium", outputType:"word",       assertions:["completeness"],                                     industry:"all" },
  { code:"B12", label:"Performance Materiality & Posting Threshold", description:"Performance materiality for each significant class of transactions and balance, plus trivial/inconsequential threshold.",                           category:"planning",     phase:"Planning",     mandatory:true,  risk:"all",    isa:"ISA 320",                type:"planning",    complexity:"low",    outputType:"word+excel",  assertions:["completeness","accuracy"],                          industry:"all" },
  { code:"B13", label:"Component / Branch Audit Planning",       description:"Planning memo for multi-location or branch audits — scope allocation, reporting dates, and instructions to branch teams.",                               category:"planning",     phase:"Planning",     mandatory:false, risk:"all",    isa:"ISA 600",                type:"planning",    complexity:"high",   outputType:"word",       assertions:["completeness"],                                     industry:"all" },

  // ─── C: Risk Assessment ─────────────────────────────────────────────────────
  { code:"C1",  label:"Overall Risk Assessment",                 description:"Entity-level risks: business, operational, and financial risks affecting the audit. Risk register with response mapped.",                                 category:"risk",         phase:"Planning",     mandatory:true,  risk:"all",    isa:"ISA 315",                type:"risk",        complexity:"high",   outputType:"word",       assertions:["completeness","accuracy"],                          industry:"all" },
  { code:"C2",  label:"Fraud Risk Assessment (ISA 240)",         description:"Fraud inquiries, risk factors (incentives/pressures, opportunity, rationalization), and planned responses.",                                              category:"risk",         phase:"Planning",     mandatory:true,  risk:"all",    isa:"ISA 240",                type:"risk",        complexity:"high",   outputType:"word",       assertions:["completeness","occurrence"],                        industry:"all" },
  { code:"C3",  label:"Significant Risk Documentation",         description:"Identification and documentation of significant risks with specific audit responses and linkage to audit program.",                                        category:"risk",         phase:"Planning",     mandatory:false, risk:"medium", isa:"ISA 315",                type:"risk",        complexity:"high",   outputType:"word",       assertions:["completeness","accuracy"],                          industry:"all" },
  { code:"C4",  label:"Account-Level Risk Register",            description:"Account-by-account risk assessment mapped to assertions, risk level, and planned procedures.",                                                            category:"risk",         phase:"Planning",     mandatory:false, risk:"all",    isa:"ISA 315",                type:"risk",        complexity:"medium", outputType:"word+excel",  assertions:["completeness","accuracy","valuation","existence"],  industry:"all" },
  { code:"C5",  label:"Revenue Recognition Risk (IFRS 15)",     description:"Revenue recognition policy review, risk of manipulation, and specific procedures for IFRS 15 compliance.",                                               category:"risk",         phase:"Planning",     mandatory:false, risk:"high",   isa:"ISA 240, IFRS 15",       type:"risk",        complexity:"high",   outputType:"word",       assertions:["occurrence","accuracy","cut-off"],                   industry:"all" },
  { code:"C6",  label:"Management Override Risk",               description:"Procedures specifically addressing management override of controls including journal entry review, estimates bias, and unusual transactions.",             category:"risk",         phase:"Planning",     mandatory:true,  risk:"all",    isa:"ISA 240",                type:"risk",        complexity:"high",   outputType:"word",       assertions:["occurrence","completeness"],                        industry:"all" },
  { code:"C7",  label:"Going Concern Risk Factors",             description:"Assessment of financial, operational, and other indicators of going concern risk with management's counter-measures.",                                    category:"risk",         phase:"Planning",     mandatory:false, risk:"medium", isa:"ISA 570",                type:"risk",        complexity:"medium", outputType:"word",       assertions:["completeness","accuracy"],                          industry:"all" },
  { code:"C8",  label:"Related Party Risk Assessment",          description:"Risk assessment specific to related party transactions — identification, authorization, commercial substance, and completeness.",                         category:"risk",         phase:"Planning",     mandatory:false, risk:"high",   isa:"ISA 550",                type:"risk",        complexity:"high",   outputType:"word",       assertions:["completeness","occurrence","accuracy"],             industry:"all" },
  { code:"C9",  label:"Compliance Risk Assessment",             description:"Assessment of risks of material non-compliance with laws, regulations, and contractual obligations.",                                                     category:"risk",         phase:"Planning",     mandatory:false, risk:"medium", isa:"ISA 250",                type:"risk",        complexity:"medium", outputType:"word",       assertions:["completeness","occurrence"],                        industry:"all" },
  { code:"C10", label:"IT Risk Assessment",                     description:"IT-specific risk assessment covering cybersecurity, data integrity, access controls, and system reliability.",                                            category:"risk",         phase:"Planning",     mandatory:false, risk:"medium", isa:"ISA 315",                type:"risk",        complexity:"high",   outputType:"word",       assertions:["completeness","accuracy"],                          industry:"all" },
  { code:"C11", label:"Group Audit Risk Summary",               description:"Consolidated risk overview for group engagements including component risks, aggregation risk, and group-level procedures.",                               category:"risk",         phase:"Planning",     mandatory:false, risk:"all",    isa:"ISA 600",                type:"risk",        complexity:"high",   outputType:"word",       assertions:["completeness","accuracy"],                          industry:"all" },
  { code:"C12", label:"Service Organization Risk Review",       description:"Risk assessment for entities using service organizations — SOC reports review, complementary controls, and testing strategy.",                           category:"risk",         phase:"Planning",     mandatory:false, risk:"medium", isa:"ISA 402",                type:"risk",        complexity:"high",   outputType:"word",       assertions:["completeness","accuracy"],                          industry:"all" },

  // ─── D: Analytical Procedures ───────────────────────────────────────────────
  { code:"D1",  label:"Preliminary Analytical Review",           description:"High-level analytical procedures on TB, ratios, and prior year comparatives to identify unusual fluctuations.",                                          category:"analytical",   phase:"Planning",     mandatory:true,  risk:"all",    isa:"ISA 520",                type:"analytical",  complexity:"medium", outputType:"word+excel",  assertions:["completeness","accuracy"],                          industry:"all" },
  { code:"D2",  label:"Ratio Analysis & Industry Benchmarking",  description:"Liquidity, profitability, efficiency, and leverage ratios vs. industry benchmarks and prior year.",                                                      category:"analytical",   phase:"Planning",     mandatory:false, risk:"all",    isa:"ISA 520",                type:"analytical",  complexity:"medium", outputType:"excel",       assertions:["completeness","accuracy"],                          industry:"all" },
  { code:"D3",  label:"Revenue Trend & Disaggregation Analysis", description:"Month-by-month revenue trend, revenue streams disaggregation, and unusual spikes/drops investigation.",                                                  category:"analytical",   phase:"Execution",    mandatory:false, risk:"all",    isa:"ISA 520",                type:"analytical",  complexity:"medium", outputType:"excel",       assertions:["completeness","occurrence","cut-off"],              industry:"all" },
  { code:"D4",  label:"Expense Completeness Analytics",          description:"Expense run-rate analysis, unusual variance identification, and accrual completeness checks.",                                                           category:"analytical",   phase:"Execution",    mandatory:false, risk:"all",    isa:"ISA 520",                type:"analytical",  complexity:"medium", outputType:"excel",       assertions:["completeness","accuracy"],                          industry:"all" },
  { code:"D5",  label:"Final Analytical Review",                 description:"Completion-stage analytical procedures confirming no unusual relationships remain unexplained.",                                                          category:"analytical",   phase:"Completion",   mandatory:true,  risk:"all",    isa:"ISA 520",                type:"analytical",  complexity:"low",    outputType:"word+excel",  assertions:["completeness","accuracy"],                          industry:"all" },
  { code:"D6",  label:"Gross Margin Analysis",                   description:"Gross margin percentage trend by product/segment, industry comparison, and investigation of unexplained movements.",                                    category:"analytical",   phase:"Execution",    mandatory:false, risk:"all",    isa:"ISA 520",                type:"analytical",  complexity:"medium", outputType:"excel",       assertions:["accuracy","completeness"],                          industry:"manufacturing" },
  { code:"D7",  label:"Working Capital Analytics",               description:"Current ratio, quick ratio, debtor/creditor days analysis, and working capital cycle assessment.",                                                       category:"analytical",   phase:"Execution",    mandatory:false, risk:"all",    isa:"ISA 520",                type:"analytical",  complexity:"medium", outputType:"excel",       assertions:["completeness","accuracy"],                          industry:"all" },
  { code:"D8",  label:"Cash Flow Analytical Review",             description:"Comparison of operating cash flows to reported profit; free cash flow analysis and unusual cash movements.",                                             category:"analytical",   phase:"Execution",    mandatory:false, risk:"all",    isa:"ISA 520",                type:"analytical",  complexity:"medium", outputType:"excel",       assertions:["completeness","accuracy"],                          industry:"all" },
  { code:"D9",  label:"Segment / Branch Performance Review",     description:"Revenue and margin analysis by segment or branch — identification of underperforming units or unusual concentrations.",                                  category:"analytical",   phase:"Execution",    mandatory:false, risk:"all",    isa:"ISA 520, IFRS 8",        type:"analytical",  complexity:"medium", outputType:"excel",       assertions:["completeness","accuracy"],                          industry:"all" },
  { code:"D10", label:"Budget vs Actual / Prior Year Variance",  description:"Variance analysis of actuals vs. budget and prior year with management explanations and audit follow-up.",                                              category:"analytical",   phase:"Execution",    mandatory:false, risk:"all",    isa:"ISA 520",                type:"analytical",  complexity:"medium", outputType:"word+excel",  assertions:["completeness","accuracy"],                          industry:"all" },

  // ─── E: Internal Controls ───────────────────────────────────────────────────
  { code:"E1",  label:"Controls Walkthrough — Revenue Cycle",    description:"Walkthrough of revenue recognition, invoicing, and credit controls from initiation to collection.",                                                      category:"controls",     phase:"Execution",    mandatory:false, risk:"all",    isa:"ISA 315",                type:"controls",    complexity:"high",   outputType:"word",       assertions:["occurrence","completeness","cut-off"],              industry:"all" },
  { code:"E2",  label:"Controls Walkthrough — Procure-to-Pay",   description:"Procurement, purchase order, GRN, invoice approval, and payment controls walkthrough.",                                                                 category:"controls",     phase:"Execution",    mandatory:false, risk:"all",    isa:"ISA 315",                type:"controls",    complexity:"high",   outputType:"word",       assertions:["completeness","accuracy","occurrence"],             industry:"all" },
  { code:"E3",  label:"Controls Walkthrough — Payroll",          description:"Payroll processing, authorizations, HR-to-payroll link, and bank transfer controls walkthrough.",                                                       category:"controls",     phase:"Execution",    mandatory:false, risk:"all",    isa:"ISA 315",                type:"controls",    complexity:"medium", outputType:"word",       assertions:["completeness","accuracy","occurrence"],             industry:"all" },
  { code:"E4",  label:"Controls Walkthrough — IT General Controls", description:"IT access management, change management, backup, and security controls evaluation.",                                                                  category:"controls",     phase:"Execution",    mandatory:false, risk:"medium", isa:"ISA 315",                type:"controls",    complexity:"high",   outputType:"word",       assertions:["completeness","accuracy"],                          industry:"all" },
  { code:"E5",  label:"Control Deficiencies & MMADs",            description:"Documentation of identified control deficiencies, material weaknesses, and significant deficiencies with management communication.",                     category:"controls",     phase:"Execution",    mandatory:false, risk:"all",    isa:"ISA 265",                type:"controls",    complexity:"medium", outputType:"word",       assertions:["completeness"],                                     industry:"all" },
  { code:"E6",  label:"Controls Walkthrough — Treasury / Cash",  description:"Cash management, bank account controls, investment policy compliance, and forex management controls.",                                                   category:"controls",     phase:"Execution",    mandatory:false, risk:"all",    isa:"ISA 315",                type:"controls",    complexity:"medium", outputType:"word",       assertions:["existence","completeness","accuracy"],              industry:"all" },
  { code:"E7",  label:"Controls Walkthrough — Inventory",        description:"Goods receipt, storage, issuance, and physical count controls; perpetual vs. periodic inventory system review.",                                        category:"controls",     phase:"Execution",    mandatory:false, risk:"all",    isa:"ISA 315",                type:"controls",    complexity:"high",   outputType:"word",       assertions:["existence","completeness","valuation"],             industry:"manufacturing" },
  { code:"E8",  label:"Controls Walkthrough — Fixed Assets",     description:"Capitalization, disposal authorization, depreciation review, and physical verification of fixed assets.",                                               category:"controls",     phase:"Execution",    mandatory:false, risk:"all",    isa:"ISA 315",                type:"controls",    complexity:"medium", outputType:"word",       assertions:["existence","completeness","rights"],                industry:"all" },
  { code:"E9",  label:"Controls Walkthrough — Financial Close",  description:"Period-end close controls — journal entry approvals, reconciliation requirements, and management review controls.",                                      category:"controls",     phase:"Execution",    mandatory:false, risk:"all",    isa:"ISA 315",                type:"controls",    complexity:"medium", outputType:"word",       assertions:["completeness","accuracy"],                          industry:"all" },
  { code:"E10", label:"Design & Implementation Testing Summary", description:"Summary of controls tested for design and implementation effectiveness with conclusions per ISA 315.",                                                   category:"controls",     phase:"Execution",    mandatory:false, risk:"all",    isa:"ISA 315",                type:"controls",    complexity:"medium", outputType:"word",       assertions:["completeness","accuracy"],                          industry:"all" },
  { code:"E11", label:"Test of Controls — Operating Effectiveness", description:"Results of operating effectiveness testing for key controls with error rates, sample sizes, and conclusions.",                                      category:"controls",     phase:"Execution",    mandatory:false, risk:"all",    isa:"ISA 330",                type:"controls",    complexity:"high",   outputType:"word+excel",  assertions:["completeness","accuracy"],                          industry:"all" },

  // ─── F: Substantive — Assets ────────────────────────────────────────────────
  { code:"F1",  label:"Cash & Bank — Confirmation & Reconciliation", description:"Bank confirmations, reconciliation testing, petty cash count, and cut-off verification per ISA 505.",                                             category:"substantive_assets", phase:"Execution", mandatory:false, risk:"all",   isa:"ISA 505",                type:"substantive", complexity:"medium", outputType:"word+excel",  assertions:["existence","completeness","accuracy"],              industry:"all" },
  { code:"F2",  label:"Trade Receivables — Confirmation & Aging",    description:"Debtor confirmation (positive/negative), aging analysis, bad debt provision adequacy, and cut-off testing.",                                      category:"substantive_assets", phase:"Execution", mandatory:false, risk:"all",   isa:"ISA 505",                type:"substantive", complexity:"high",   outputType:"word+excel",  assertions:["existence","valuation","completeness","cut-off"],   industry:"all" },
  { code:"F3",  label:"Inventory — Physical Count & Valuation",      description:"Physical observation planning, count sheets, NRV assessment, overhead absorption, and FIFO/AVCO validation.",                                    category:"substantive_assets", phase:"Execution", mandatory:false, risk:"all",   isa:"ISA 501",                type:"substantive", complexity:"high",   outputType:"word+excel",  assertions:["existence","valuation","completeness"],             industry:"manufacturing" },
  { code:"F4",  label:"PPE — Roll-Forward & Depreciation Test",      description:"Fixed asset register reconciliation, additions/disposals testing, depreciation recalculation, and impairment indicators.",                       category:"substantive_assets", phase:"Execution", mandatory:false, risk:"all",   isa:"IAS 16",                 type:"substantive", complexity:"high",   outputType:"word+excel",  assertions:["existence","valuation","completeness","rights"],    industry:"all" },
  { code:"F5",  label:"Investments — Valuation & Classification",    description:"Investment portfolio valuation, IFRS 9 classification, impairment, and disclosure testing.",                                                     category:"substantive_assets", phase:"Execution", mandatory:false, risk:"all",   isa:"IFRS 9, ISA 500",        type:"substantive", complexity:"high",   outputType:"word+excel",  assertions:["valuation","existence","rights"],                   industry:"financial" },
  { code:"F6",  label:"Prepayments & Other Receivables",             description:"Prepayment recoverability, other receivables ageing, and completeness of accrued income.",                                                       category:"substantive_assets", phase:"Execution", mandatory:false, risk:"all",   isa:"ISA 500",                type:"substantive", complexity:"low",    outputType:"word+excel",  assertions:["existence","valuation","completeness"],             industry:"all" },
  { code:"F7",  label:"Intangible Assets & Impairment (IAS 38/36)",  description:"Intangible asset capitalization criteria, amortization, and impairment testing with CGU analysis.",                                             category:"substantive_assets", phase:"Execution", mandatory:false, risk:"medium", isa:"IAS 38, IAS 36",         type:"substantive", complexity:"high",   outputType:"word+excel",  assertions:["existence","valuation","rights"],                   industry:"all" },
  { code:"F8",  label:"Right-of-Use Assets & Lease Liabilities (IFRS 16)", description:"Lease identification, ROU asset and lease liability computation, discount rate, and modification testing.",                              category:"substantive_assets", phase:"Execution", mandatory:false, risk:"all",   isa:"IFRS 16",                type:"substantive", complexity:"high",   outputType:"word+excel",  assertions:["existence","valuation","completeness"],             industry:"all" },
  { code:"F9",  label:"Long-Term Deposits & Advances",               description:"Recoverability assessment, impairment, and presentation of long-term deposits and staff advances.",                                              category:"substantive_assets", phase:"Execution", mandatory:false, risk:"all",   isa:"ISA 500",                type:"substantive", complexity:"low",    outputType:"word+excel",  assertions:["existence","valuation"],                            industry:"all" },
  { code:"F10", label:"Intercompany Balances — Assets",              description:"Reconciliation of intercompany receivables and loans, elimination entries review, and arm's length pricing.",                                    category:"substantive_assets", phase:"Execution", mandatory:false, risk:"medium", isa:"ISA 550, ISA 500",       type:"substantive", complexity:"medium", outputType:"word+excel",  assertions:["existence","completeness","accuracy"],              industry:"all" },
  { code:"F11", label:"Biological Assets & Agriculture (IAS 41)",    description:"Fair value measurement of biological assets, harvest recognition, and agricultural produce valuation.",                                          category:"substantive_assets", phase:"Execution", mandatory:false, risk:"medium", isa:"IAS 41",                 type:"substantive", complexity:"high",   outputType:"word+excel",  assertions:["existence","valuation"],                            industry:"all" },

  // ─── G: Substantive — Liabilities & Equity ──────────────────────────────────
  { code:"G1",  label:"Trade Payables — Confirmation & Reconciliation", description:"Creditor confirmation, reconciliation to supplier statements, and GRN-invoice matching.",                                                    category:"substantive_liab",  phase:"Execution", mandatory:false, risk:"all",   isa:"ISA 500",                type:"substantive", complexity:"medium", outputType:"word+excel",  assertions:["completeness","accuracy","existence"],              industry:"all" },
  { code:"G2",  label:"Borrowings & Finance Costs",                   description:"Loan confirmation from banks, interest recalculation, covenant compliance, and presentation testing.",                                         category:"substantive_liab",  phase:"Execution", mandatory:false, risk:"all",   isa:"IFRS 9, ISA 505",        type:"substantive", complexity:"medium", outputType:"word+excel",  assertions:["existence","completeness","accuracy"],              industry:"all" },
  { code:"G3",  label:"Accruals, Provisions & Contingencies",         description:"Completeness of accruals, provision adequacy (IAS 37), and contingent liability disclosure.",                                                  category:"substantive_liab",  phase:"Execution", mandatory:false, risk:"all",   isa:"IAS 37, ISA 500",        type:"substantive", complexity:"medium", outputType:"word+excel",  assertions:["completeness","accuracy","valuation"],              industry:"all" },
  { code:"G4",  label:"Share Capital & Reserves",                     description:"Share capital verification, retained earnings reconciliation, and dividend legality per Companies Act 2017.",                                  category:"substantive_liab",  phase:"Execution", mandatory:false, risk:"all",   isa:"Companies Act 2017",     type:"substantive", complexity:"low",    outputType:"word+excel",  assertions:["accuracy","completeness","rights"],                 industry:"all" },
  { code:"G5",  label:"Deferred Tax — Asset & Liability (IAS 12)",    description:"Temporary differences schedule, DTA/DTL computation, recoverability of DTA, and effective tax rate reconciliation.",                          category:"substantive_liab",  phase:"Execution", mandatory:false, risk:"medium", isa:"IAS 12",                 type:"substantive", complexity:"high",   outputType:"word+excel",  assertions:["accuracy","completeness","valuation"],              industry:"all" },
  { code:"G6",  label:"Staff Retirement Benefits (IAS 19)",           description:"Gratuity/pension actuarial assessment, EOBI compliance, and DBO disclosure testing.",                                                         category:"substantive_liab",  phase:"Execution", mandatory:false, risk:"medium", isa:"IAS 19",                 type:"substantive", complexity:"high",   outputType:"word+excel",  assertions:["completeness","accuracy","valuation"],              industry:"all" },
  { code:"G7",  label:"Lease Liabilities (IFRS 16)",                  description:"Lease liability roll-forward, discount rate verification, and short-term/low-value lease exemptions assessment.",                              category:"substantive_liab",  phase:"Execution", mandatory:false, risk:"all",   isa:"IFRS 16",                type:"substantive", complexity:"high",   outputType:"word+excel",  assertions:["completeness","accuracy","valuation"],              industry:"all" },
  { code:"G8",  label:"Intercompany Balances — Liabilities",          description:"Intercompany payables and loan reconciliation, elimination entries, and arm's length pricing review.",                                         category:"substantive_liab",  phase:"Execution", mandatory:false, risk:"medium", isa:"ISA 550, ISA 500",       type:"substantive", complexity:"medium", outputType:"word+excel",  assertions:["completeness","accuracy","existence"],              industry:"all" },
  { code:"G9",  label:"Current Tax Liability / Refund",               description:"Current tax payable/receivable reconciliation to income tax computation, FBR IRIS assessment, and advance tax.",                               category:"substantive_liab",  phase:"Execution", mandatory:false, risk:"all",   isa:"IAS 12, ITO 2001",       type:"substantive", complexity:"high",   outputType:"word+excel",  assertions:["accuracy","completeness","valuation"],              industry:"all" },
  { code:"G10", label:"Dividend Payable & Appropriations",            description:"Dividend declaration legality, payment verification, and appropriation of profit per Companies Act 2017.",                                     category:"substantive_liab",  phase:"Execution", mandatory:false, risk:"all",   isa:"Companies Act 2017",     type:"substantive", complexity:"low",    outputType:"word+excel",  assertions:["accuracy","completeness","rights"],                 industry:"all" },
  { code:"G11", label:"Zakat / Workers' Welfare / Levies",            description:"Zakat deduction compliance, Workers' Welfare Fund, EOBI, and other statutory levies computation and disclosure.",                             category:"substantive_liab",  phase:"Execution", mandatory:false, risk:"all",   isa:"ITO 2001, WWF Act",      type:"substantive", complexity:"medium", outputType:"word+excel",  assertions:["completeness","accuracy"],                          industry:"all" },
  { code:"G12", label:"Convertible Instruments & Complex Equity",     description:"Equity vs. liability classification for hybrid instruments, convertible bonds, and compound financial instruments per IAS 32.",               category:"substantive_liab",  phase:"Execution", mandatory:false, risk:"high",  isa:"IAS 32, IFRS 9",         type:"substantive", complexity:"high",   outputType:"word+excel",  assertions:["accuracy","completeness","rights"],                 industry:"financial" },

  // ─── H: Substantive — Profit & Loss ─────────────────────────────────────────
  { code:"H1",  label:"Revenue — Completeness & Cut-off (IFRS 15)",   description:"Revenue recognition testing against IFRS 15 five-step model, cut-off, and journal entry testing for revenue manipulation.",                  category:"substantive_pl",    phase:"Execution", mandatory:false, risk:"all",   isa:"IFRS 15, ISA 240",       type:"substantive", complexity:"high",   outputType:"word+excel",  assertions:["occurrence","completeness","accuracy","cut-off"],   industry:"all" },
  { code:"H2",  label:"Cost of Sales — Vouching & Reconciliation",    description:"COGS testing including opening stock, purchases, direct costs, and closing stock reconciliation.",                                             category:"substantive_pl",    phase:"Execution", mandatory:false, risk:"all",   isa:"IAS 2, ISA 500",         type:"substantive", complexity:"high",   outputType:"word+excel",  assertions:["completeness","accuracy","occurrence"],             industry:"manufacturing" },
  { code:"H3",  label:"Operating Expenses — Completeness & Vouching", description:"Expense completeness, cut-off, capital vs. revenue split, and unusual item investigation.",                                                    category:"substantive_pl",    phase:"Execution", mandatory:false, risk:"all",   isa:"ISA 500",                type:"substantive", complexity:"medium", outputType:"word+excel",  assertions:["completeness","accuracy","occurrence","cut-off"],   industry:"all" },
  { code:"H4",  label:"Payroll & Staff Costs — Detail Test",          description:"Payroll vouching, EOBI/PESSI deductions, income tax on salaries, and reconciliation to HR records.",                                          category:"substantive_pl",    phase:"Execution", mandatory:false, risk:"all",   isa:"ISA 500",                type:"substantive", complexity:"medium", outputType:"word+excel",  assertions:["accuracy","completeness","occurrence"],             industry:"all" },
  { code:"H5",  label:"Directors' Remuneration & Related Disclosures", description:"Directors' fees, salaries, benefits, and disclosure verification per Companies Act 2017 s.220.",                                            category:"substantive_pl",    phase:"Execution", mandatory:false, risk:"all",   isa:"Companies Act 2017",     type:"substantive", complexity:"low",    outputType:"word",        assertions:["accuracy","completeness"],                          industry:"all" },
  { code:"H6",  label:"Finance Cost & Interest Expense",              description:"Interest expense recalculation, effective interest method verification, and borrowing cost capitalization.",                                    category:"substantive_pl",    phase:"Execution", mandatory:false, risk:"all",   isa:"IAS 23, IFRS 9",         type:"substantive", complexity:"medium", outputType:"word+excel",  assertions:["accuracy","completeness","occurrence"],             industry:"all" },
  { code:"H7",  label:"Other Income",                                  description:"Vouching and completeness of other income — rental, gain on disposal, interest earned, and grant income.",                                    category:"substantive_pl",    phase:"Execution", mandatory:false, risk:"all",   isa:"ISA 500",                type:"substantive", complexity:"medium", outputType:"word+excel",  assertions:["occurrence","completeness","accuracy"],             industry:"all" },
  { code:"H8",  label:"Selling & Distribution Expenses",              description:"Testing of selling, marketing, and distribution costs — completeness, accruals, and classification.",                                          category:"substantive_pl",    phase:"Execution", mandatory:false, risk:"all",   isa:"ISA 500",                type:"substantive", complexity:"medium", outputType:"word+excel",  assertions:["completeness","accuracy","occurrence"],             industry:"all" },
  { code:"H9",  label:"Administrative Expenses",                       description:"Admin expense vouching, unusual items investigation, and capital vs. revenue appropriateness.",                                               category:"substantive_pl",    phase:"Execution", mandatory:false, risk:"all",   isa:"ISA 500",                type:"substantive", complexity:"medium", outputType:"word+excel",  assertions:["completeness","accuracy","occurrence"],             industry:"all" },
  { code:"H10", label:"Repair & Maintenance / Utilities / Rent",      description:"Completeness and cut-off of R&M, utilities, and rent — lease agreement review and contract compliance.",                                      category:"substantive_pl",    phase:"Execution", mandatory:false, risk:"all",   isa:"ISA 500",                type:"substantive", complexity:"low",    outputType:"word+excel",  assertions:["completeness","accuracy"],                          industry:"all" },
  { code:"H11", label:"Foreign Exchange Gain / Loss",                  description:"Revaluation of foreign currency monetary items, realized/unrealized split, and IAS 21 compliance.",                                          category:"substantive_pl",    phase:"Execution", mandatory:false, risk:"medium", isa:"IAS 21",                 type:"substantive", complexity:"medium", outputType:"word+excel",  assertions:["accuracy","completeness","occurrence"],             industry:"all" },
  { code:"H12", label:"Exceptional / Non-recurring Items",            description:"Nature, classification, and disclosure of exceptional, non-recurring, and discontinued operations items.",                                     category:"substantive_pl",    phase:"Execution", mandatory:false, risk:"medium", isa:"ISA 500, IFRS 5",        type:"substantive", complexity:"medium", outputType:"word",        assertions:["occurrence","completeness","accuracy"],             industry:"all" },

  // ─── I: Taxation ────────────────────────────────────────────────────────────
  { code:"I1",  label:"Income Tax — Current & Deferred",              description:"Current tax liability per ITO 2001, minimum tax/super tax computation, and deferred tax reconciliation.",                                       category:"tax",               phase:"Execution", mandatory:false, risk:"all",   isa:"IAS 12, ITO 2001",       type:"substantive", complexity:"high",   outputType:"word+excel",  assertions:["accuracy","completeness","valuation"],              industry:"all" },
  { code:"I2",  label:"Sales Tax / FED — Reconciliation",             description:"GST/FED return reconciliation with FBR records, input/output tax matching, and annexure verification.",                                        category:"tax",               phase:"Execution", mandatory:false, risk:"all",   isa:"Sales Tax Act 1990",     type:"substantive", complexity:"medium", outputType:"word+excel",  assertions:["accuracy","completeness","occurrence"],             industry:"all" },
  { code:"I3",  label:"Withholding Tax — Deductions & Compliance",    description:"WHT deduction on payments, deposition in time, and IRIS/FBR filing compliance review.",                                                       category:"tax",               phase:"Execution", mandatory:false, risk:"all",   isa:"ITO 2001, WHT Rules",    type:"substantive", complexity:"medium", outputType:"word+excel",  assertions:["completeness","accuracy"],                          industry:"all" },
  { code:"I4",  label:"Super Tax & Minimum Tax Computation",          description:"Super tax computation for high-earning entities, turnover-based minimum tax, and AMT per Finance Act 2023.",                                    category:"tax",               phase:"Execution", mandatory:false, risk:"all",   isa:"ITO 2001, FA 2023",      type:"substantive", complexity:"high",   outputType:"word+excel",  assertions:["accuracy","completeness"],                          industry:"all" },
  { code:"I5",  label:"Tax Contingencies & Notices",                  description:"Open tax assessments, FBR notices, pending litigation, and adequacy of tax provision for contingencies.",                                      category:"tax",               phase:"Execution", mandatory:false, risk:"medium", isa:"IAS 37, ISA 250",        type:"substantive", complexity:"medium", outputType:"word",        assertions:["completeness","valuation"],                         industry:"all" },
  { code:"I6",  label:"Transfer Pricing Compliance",                  description:"Related-party pricing documentation, arm's length analysis, and TP documentation compliance per ITO 2001 s.108.",                             category:"tax",               phase:"Execution", mandatory:false, risk:"high",   isa:"ITO 2001 s.108",         type:"substantive", complexity:"high",   outputType:"word",        assertions:["accuracy","completeness"],                          industry:"all" },
  { code:"I7",  label:"PRA / SRB / KPRA / BRA Reconciliations",      description:"Provincial sales tax reconciliation across PRA (Punjab), SRB (Sindh), KPRA (KP), and BRA (Balochistan) filings.",                            category:"tax",               phase:"Execution", mandatory:false, risk:"medium", isa:"Provincial Tax Laws",    type:"substantive", complexity:"high",   outputType:"word+excel",  assertions:["completeness","accuracy"],                          industry:"services" },
  { code:"I8",  label:"Advance Tax & Adjustable Tax Review",          description:"Advance tax paid/adjusted schedule, final vs. presumptive tax determination, and refund claim assessment.",                                    category:"tax",               phase:"Execution", mandatory:false, risk:"all",   isa:"ITO 2001",               type:"substantive", complexity:"medium", outputType:"word+excel",  assertions:["accuracy","completeness"],                          industry:"all" },
  { code:"I9",  label:"Payroll Tax Compliance",                       description:"Salary tax deduction, employer obligations, slab verification, and IRIS monthly compliance review.",                                           category:"tax",               phase:"Execution", mandatory:false, risk:"all",   isa:"ITO 2001",               type:"substantive", complexity:"medium", outputType:"word+excel",  assertions:["completeness","accuracy"],                          industry:"all" },
  { code:"I10", label:"Customs / Import Tax Review",                  description:"Import duty, customs valuation, anti-dumping, and SRO exemption compliance for importing entities.",                                          category:"tax",               phase:"Execution", mandatory:false, risk:"medium", isa:"Customs Act 1969",       type:"substantive", complexity:"high",   outputType:"word",        assertions:["completeness","accuracy"],                          industry:"manufacturing" },
  { code:"I11", label:"Annual Return / Form 29 / SECP Filing Review", description:"SECP filings compliance — annual return, form 29, special return, and auditor appointment notification.",                                      category:"tax",               phase:"Execution", mandatory:false, risk:"all",   isa:"Companies Act 2017",     type:"substantive", complexity:"medium", outputType:"word",        assertions:["completeness"],                                     industry:"all" },
  { code:"I12", label:"Provincial & Sector-Specific Tax Review",      description:"Sector-specific taxes — banking, insurance, oil & gas surcharges, and provincial levies unique to the client's industry.",                    category:"tax",               phase:"Execution", mandatory:false, risk:"medium", isa:"Various Tax Laws",       type:"substantive", complexity:"high",   outputType:"word",        assertions:["completeness","accuracy"],                          industry:"all" },

  // ─── J: Estimates & Judgments ────────────────────────────────────────────────
  { code:"J1",  label:"Key Accounting Estimates — Critical Review",   description:"Challenge of management's estimates for impairment, provisions, fair values, and deferred tax; point estimate vs. range.",                     category:"estimates",         phase:"Execution", mandatory:false, risk:"medium", isa:"ISA 540",                type:"substantive", complexity:"high",   outputType:"word",        assertions:["accuracy","valuation"],                             industry:"all" },
  { code:"J2",  label:"Expected Credit Loss Model (IFRS 9)",         description:"ECL model review, staging criteria, PD/LGD/EAD parameters, and provision adequacy per IFRS 9.",                                               category:"estimates",         phase:"Execution", mandatory:false, risk:"medium", isa:"IFRS 9, ISA 540",        type:"substantive", complexity:"high",   outputType:"word+excel",  assertions:["valuation","accuracy"],                             industry:"financial" },
  { code:"J3",  label:"Fair Value Measurements (IFRS 13)",           description:"Level 1/2/3 fair value hierarchy, valuation techniques, significant inputs, and sensitivity analysis.",                                        category:"estimates",         phase:"Execution", mandatory:false, risk:"high",   isa:"IFRS 13, ISA 540",       type:"substantive", complexity:"high",   outputType:"word",        assertions:["valuation","accuracy"],                             industry:"all" },
  { code:"J4",  label:"Goodwill & Impairment Testing (IAS 36)",      description:"CGU identification, recoverable amount computation, VIU/FVLCD comparison, and sensitivity testing.",                                           category:"estimates",         phase:"Execution", mandatory:false, risk:"medium", isa:"IAS 36, ISA 540",        type:"substantive", complexity:"high",   outputType:"word+excel",  assertions:["valuation","existence"],                            industry:"all" },
  { code:"J5",  label:"NRV / Inventory Provision Assessment",        description:"Net realisable value analysis, slow-moving/obsolete inventory identification, and provision adequacy.",                                         category:"estimates",         phase:"Execution", mandatory:false, risk:"medium", isa:"IAS 2, ISA 540",         type:"substantive", complexity:"medium", outputType:"word+excel",  assertions:["valuation","completeness"],                         industry:"manufacturing" },
  { code:"J6",  label:"Useful Life / Residual Value Review",         description:"Challenge of management's estimated useful lives and residual values for PPE and intangible assets.",                                           category:"estimates",         phase:"Execution", mandatory:false, risk:"medium", isa:"IAS 16, IAS 38",         type:"substantive", complexity:"medium", outputType:"word",        assertions:["accuracy","valuation"],                             industry:"all" },
  { code:"J7",  label:"Provision Estimation Review",                 description:"Adequacy of all provisions — legal claims, warranties, restructuring, and onerous contracts per IAS 37.",                                      category:"estimates",         phase:"Execution", mandatory:false, risk:"medium", isa:"IAS 37, ISA 540",        type:"substantive", complexity:"high",   outputType:"word",        assertions:["accuracy","valuation","completeness"],              industry:"all" },
  { code:"J8",  label:"Deferred Tax Estimate Review",                description:"Review of DTA recoverability assumptions, unrecognised losses, rate changes, and disclosure per IAS 12.",                                      category:"estimates",         phase:"Execution", mandatory:false, risk:"medium", isa:"IAS 12, ISA 540",        type:"substantive", complexity:"high",   outputType:"word+excel",  assertions:["valuation","accuracy"],                             industry:"all" },
  { code:"J9",  label:"Actuarial Assumption Review",                 description:"Review of actuary's assumptions for staff retirement benefits — discount rate, salary growth, mortality tables.",                               category:"estimates",         phase:"Execution", mandatory:false, risk:"high",   isa:"IAS 19, ISA 540",        type:"substantive", complexity:"high",   outputType:"word",        assertions:["accuracy","valuation"],                             industry:"all" },
  { code:"J10", label:"Sensitivity Analysis & Management Bias Review", description:"Sensitivity of key estimates to assumption changes and assessment of management bias per ISA 540 revised.",                                  category:"estimates",         phase:"Execution", mandatory:false, risk:"high",   isa:"ISA 540",                type:"substantive", complexity:"high",   outputType:"word",        assertions:["accuracy","valuation"],                             industry:"all" },

  // ─── K: Related Parties & Compliance ────────────────────────────────────────
  { code:"K1",  label:"Related Party Transactions (ISA 550)",        description:"Identification of related parties, authorization of transactions, arm's length basis, and IFRS disclosure adequacy.",                           category:"related_party",     phase:"Execution", mandatory:false, risk:"all",   isa:"ISA 550, IAS 24",        type:"substantive", complexity:"high",   outputType:"word",        assertions:["completeness","accuracy","occurrence"],             industry:"all" },
  { code:"K2",  label:"Compliance with Laws & Regulations (ISA 250)", description:"Review of significant laws/regulations (Companies Act, SECP, FBR, SBP) and instances of non-compliance.",                                     category:"related_party",     phase:"Execution", mandatory:false, risk:"all",   isa:"ISA 250",                type:"substantive", complexity:"medium", outputType:"word",        assertions:["completeness","occurrence"],                        industry:"all" },
  { code:"K3",  label:"SECP & FBR Regulatory Filings Review",        description:"Annual return, form A/29, SECP compliance, and FBR registration/filing status verification.",                                                  category:"related_party",     phase:"Execution", mandatory:false, risk:"all",   isa:"Companies Act 2017",     type:"substantive", complexity:"low",    outputType:"word",        assertions:["completeness"],                                     industry:"all" },
  { code:"K4",  label:"Litigation & Claims Review",                  description:"Legal confirmation requests, solicitor letters, pending cases, and adequacy of provision for litigation.",                                      category:"related_party",     phase:"Execution", mandatory:false, risk:"medium", isa:"IAS 37, ISA 501",        type:"substantive", complexity:"medium", outputType:"word",        assertions:["completeness","valuation"],                         industry:"all" },
  { code:"K5",  label:"Minutes Review — Board / AGM / Committees",  description:"Review of board meeting, AGM, and committee minutes for significant decisions, related party approvals, and audit committee matters.",          category:"related_party",     phase:"Execution", mandatory:false, risk:"all",   isa:"Companies Act 2017",     type:"substantive", complexity:"medium", outputType:"word",        assertions:["completeness","occurrence"],                        industry:"all" },
  { code:"K6",  label:"Connected Persons / Directors Interest Review", description:"Directors' interests register, connected persons transactions, and Section 208 Companies Act 2017 compliance.",                              category:"related_party",     phase:"Execution", mandatory:false, risk:"medium", isa:"Companies Act 2017",     type:"substantive", complexity:"medium", outputType:"word",        assertions:["completeness","accuracy"],                          industry:"all" },
  { code:"K7",  label:"Sanctions / AML / Beneficial Ownership",     description:"Beneficial ownership verification, sanctions screening, and AML procedures per FATF and State Bank guidelines.",                               category:"related_party",     phase:"Execution", mandatory:false, risk:"high",   isa:"ISQM 1, AML Regs",       type:"substantive", complexity:"high",   outputType:"word",        assertions:["completeness","occurrence"],                        industry:"all" },
  { code:"K8",  label:"Contractual Compliance & Loan Covenants",     description:"Review of material contracts, compliance with loan covenants, and breach notifications.",                                                      category:"related_party",     phase:"Execution", mandatory:false, risk:"medium", isa:"ISA 250",                type:"substantive", complexity:"medium", outputType:"word",        assertions:["completeness","accuracy"],                          industry:"all" },
  { code:"K9",  label:"Insurance Coverage Review",                   description:"Adequacy of insurance coverage for assets, liabilities, and business interruption per management assertions.",                                  category:"related_party",     phase:"Execution", mandatory:false, risk:"all",   isa:"ISA 500",                type:"substantive", complexity:"low",    outputType:"word",        assertions:["completeness"],                                     industry:"all" },
  { code:"K10", label:"ESG / Grant / Donor / Section-42 Compliance", description:"ESG reporting compliance, donor/grant fund utilization, and Section 42 not-for-profit entity-specific regulatory review.",                    category:"related_party",     phase:"Execution", mandatory:false, risk:"all",   isa:"ISA 250",                type:"substantive", complexity:"medium", outputType:"word",        assertions:["completeness","accuracy"],                          industry:"all" },

  // ─── L: Evidence & Misstatements ────────────────────────────────────────────
  { code:"L1",  label:"Audit Evidence — Sufficiency & Appropriateness", description:"Summary evaluation of audit evidence obtained across all areas and assertion coverage assessment.",                                          category:"evidence",          phase:"Completion", mandatory:true,  risk:"all",   isa:"ISA 500",                type:"completion",  complexity:"medium", outputType:"word",        assertions:["completeness","accuracy","existence"],              industry:"all" },
  { code:"L2",  label:"Unadjusted Misstatements Schedule (ISA 450)", description:"Schedule of all identified misstatements, both adjusted and unadjusted, with management communication.",                                       category:"evidence",          phase:"Completion", mandatory:false, risk:"all",   isa:"ISA 450",                type:"completion",  complexity:"medium", outputType:"word+excel",  assertions:["accuracy","completeness"],                          industry:"all" },
  { code:"L3",  label:"Summary of Audit Differences",                description:"Aggregated misstatement analysis vs. materiality threshold with conclusion on overall impact.",                                                 category:"evidence",          phase:"Completion", mandatory:false, risk:"all",   isa:"ISA 450",                type:"completion",  complexity:"low",    outputType:"word+excel",  assertions:["accuracy"],                                         industry:"all" },
  { code:"L4",  label:"Management Communication — Control Deficiencies", description:"Draft management letter on internal control weaknesses, significant deficiencies, and recommendations.",                                   category:"evidence",          phase:"Completion", mandatory:false, risk:"all",   isa:"ISA 265",                type:"completion",  complexity:"medium", outputType:"word",        assertions:["completeness"],                                     industry:"all" },
  { code:"L5",  label:"Lead Schedules & Cross-Referencing",          description:"Master lead schedule linking all WPs to TB, FS, and audit report with cross-reference index.",                                                  category:"evidence",          phase:"Completion", mandatory:true,  risk:"all",   isa:"ISA 230",                type:"completion",  complexity:"medium", outputType:"word+excel",  assertions:["completeness","accuracy"],                          industry:"all" },
  { code:"L6",  label:"Sampling Results Summary",                    description:"Consolidated sampling results across all substantive tests — error rates, projected errors, and conclusions.",                                  category:"evidence",          phase:"Completion", mandatory:false, risk:"all",   isa:"ISA 530",                type:"completion",  complexity:"medium", outputType:"word+excel",  assertions:["completeness","accuracy"],                          industry:"all" },
  { code:"L7",  label:"Exception Tracking Register",                 description:"Register of all audit exceptions identified — nature, amount, management response, and resolution status.",                                     category:"evidence",          phase:"Completion", mandatory:false, risk:"all",   isa:"ISA 450",                type:"completion",  complexity:"medium", outputType:"word+excel",  assertions:["completeness"],                                     industry:"all" },
  { code:"L8",  label:"Open Items / PBC Tracker Closure",            description:"Prepared-by-client items log — outstanding items, follow-up dates, and clearance confirmation.",                                               category:"evidence",          phase:"Completion", mandatory:false, risk:"all",   isa:"ISA 230",                type:"completion",  complexity:"low",    outputType:"word+excel",  assertions:["completeness"],                                     industry:"all" },
  { code:"L9",  label:"Contradictory Evidence Resolution Memo",      description:"Documentation of contradictory evidence encountered, resolution process, and final conclusion per ISA 230.",                                   category:"evidence",          phase:"Completion", mandatory:false, risk:"all",   isa:"ISA 230",                type:"completion",  complexity:"medium", outputType:"word",        assertions:["completeness","accuracy"],                          industry:"all" },
  { code:"L10", label:"Overall Evidence Completion Checklist",       description:"Final checklist confirming sufficiency of evidence for each audit area before conclusion.",                                                    category:"evidence",          phase:"Completion", mandatory:true,  risk:"all",   isa:"ISA 500, ISA 230",       type:"completion",  complexity:"low",    outputType:"word",        assertions:["completeness"],                                     industry:"all" },

  // ─── M: Completion ──────────────────────────────────────────────────────────
  { code:"M1",  label:"Subsequent Events Review (ISA 560)",          description:"Procedures for identifying post-balance-sheet events requiring adjustment or disclosure; dual-dating considerations.",                          category:"completion",        phase:"Completion", mandatory:true,  risk:"all",   isa:"ISA 560",                type:"completion",  complexity:"medium", outputType:"word",        assertions:["completeness"],                                     industry:"all" },
  { code:"M2",  label:"Going Concern — Final Assessment (ISA 570)",  description:"Final going concern conclusion, management's assessment review, and disclosure adequacy per ISA 570.",                                         category:"completion",        phase:"Completion", mandatory:true,  risk:"all",   isa:"ISA 570",                type:"completion",  complexity:"high",   outputType:"word",        assertions:["completeness","accuracy"],                          industry:"all" },
  { code:"M3",  label:"Management Representation Letter (ISA 580)",  description:"Signed management representations covering all significant matters and specific representations requested.",                                     category:"completion",        phase:"Completion", mandatory:true,  risk:"all",   isa:"ISA 580",                type:"completion",  complexity:"low",    outputType:"word",        assertions:["completeness"],                                     industry:"all" },
  { code:"M4",  label:"Completion Memorandum",                       description:"Overall audit conclusion, significant judgments, quality control sign-offs, and engagement completion checklist.",                               category:"completion",        phase:"Completion", mandatory:true,  risk:"all",   isa:"ISA 220",                type:"completion",  complexity:"medium", outputType:"word",        assertions:["completeness"],                                     industry:"all" },
  { code:"M5",  label:"Written Representations Log",                 description:"Record of all representations obtained from management and those charged with governance.",                                                     category:"completion",        phase:"Completion", mandatory:false, risk:"all",   isa:"ISA 580",                type:"completion",  complexity:"low",    outputType:"word",        assertions:["completeness"],                                     industry:"all" },
  { code:"M6",  label:"Final Disclosure Checklist",                  description:"Comprehensive IFRS/IAS/Companies Act disclosure checklist — notes, financial instruments, segment, related party, and other disclosures.",     category:"completion",        phase:"Completion", mandatory:true,  risk:"all",   isa:"IAS 1, IFRS",            type:"completion",  complexity:"high",   outputType:"word",        assertions:["completeness","accuracy"],                          industry:"all" },
  { code:"M7",  label:"Final Partner Review Memo",                   description:"Engagement partner's final review documentation — significant judgments, conclusions, and sign-off.",                                          category:"completion",        phase:"Completion", mandatory:true,  risk:"all",   isa:"ISA 220",                type:"completion",  complexity:"medium", outputType:"word",        assertions:["completeness"],                                     industry:"all" },
  { code:"M8",  label:"Overall Engagement Conclusion",               description:"Formal overall audit conclusion statement — basis, key findings, opinion type, and engagement team sign-off.",                                  category:"completion",        phase:"Completion", mandatory:true,  risk:"all",   isa:"ISA 700",                type:"completion",  complexity:"medium", outputType:"word",        assertions:["completeness","accuracy"],                          industry:"all" },
  { code:"M9",  label:"Subsequent Discovery of Facts Memo",          description:"Documentation and response procedures for facts discovered after audit report issuance per ISA 560.",                                         category:"completion",        phase:"Completion", mandatory:false, risk:"all",   isa:"ISA 560",                type:"completion",  complexity:"high",   outputType:"word",        assertions:["completeness"],                                     industry:"all" },
  { code:"M10", label:"Final Engagement Quality Notes Clearance",    description:"Resolution of all open engagement quality review notes before final report issuance.",                                                         category:"completion",        phase:"Completion", mandatory:false, risk:"all",   isa:"ISQM 1",                 type:"completion",  complexity:"medium", outputType:"word",        assertions:["completeness"],                                     industry:"all" },

  // ─── N: Reporting ───────────────────────────────────────────────────────────
  { code:"N1",  label:"Audit Opinion Drafting (ISA 700)",            description:"Draft audit report — unmodified opinion, basis paragraph, key audit matters, and emphasis paragraphs.",                                         category:"reporting",         phase:"Reporting",  mandatory:true,  risk:"all",   isa:"ISA 700",                type:"reporting",   complexity:"high",   outputType:"word",        assertions:["completeness","accuracy"],                          industry:"all" },
  { code:"N2",  label:"Key Audit Matters (ISA 701)",                 description:"Identification and drafting of KAMs — significant risks, how they were addressed, and key observations.",                                       category:"reporting",         phase:"Reporting",  mandatory:false, risk:"all",   isa:"ISA 701",                type:"reporting",   complexity:"high",   outputType:"word",        assertions:["completeness","accuracy"],                          industry:"listed" },
  { code:"N3",  label:"Modified Opinion Assessment (ISA 705)",       description:"Qualification, disclaimer, or adverse opinion analysis — materiality, pervasiveness, and effect assessment.",                                   category:"reporting",         phase:"Reporting",  mandatory:false, risk:"medium", isa:"ISA 705",                type:"reporting",   complexity:"high",   outputType:"word",        assertions:["completeness"],                                     industry:"all" },
  { code:"N4",  label:"Emphasis of Matter / Other Matters (ISA 706)", description:"EOM and OM paragraph drafting and appropriateness assessment.",                                                                               category:"reporting",         phase:"Reporting",  mandatory:false, risk:"all",   isa:"ISA 706",                type:"reporting",   complexity:"medium", outputType:"word",        assertions:["completeness"],                                     industry:"all" },
  { code:"N5",  label:"Management Letter & Recommendations",         description:"Formal management letter covering control weaknesses, operational improvements, and tax recommendations.",                                       category:"reporting",         phase:"Reporting",  mandatory:false, risk:"all",   isa:"ISA 265",                type:"reporting",   complexity:"medium", outputType:"word",        assertions:["completeness"],                                     industry:"all" },
  { code:"N6",  label:"Financial Statements — Final Review",         description:"Tie-out of financial statements to audit workpapers, disclosure checklist, and formatting per SECP requirements.",                             category:"reporting",         phase:"Reporting",  mandatory:true,  risk:"all",   isa:"IAS 1, IFRS",            type:"reporting",   complexity:"medium", outputType:"word",        assertions:["completeness","accuracy"],                          industry:"all" },
  { code:"N7",  label:"Other Information Review (ISA 720)",          description:"Review of director's report, chairman's statement, and other information in the annual report for consistency with audited FS.",              category:"reporting",         phase:"Reporting",  mandatory:false, risk:"all",   isa:"ISA 720",                type:"reporting",   complexity:"medium", outputType:"word",        assertions:["completeness","accuracy"],                          industry:"all" },
  { code:"N8",  label:"Going Concern Disclosure Review",             description:"Review of going concern disclosures in FS and audit report for adequacy, completeness, and ISA 570 compliance.",                               category:"reporting",         phase:"Reporting",  mandatory:false, risk:"all",   isa:"ISA 570",                type:"reporting",   complexity:"medium", outputType:"word",        assertions:["completeness","accuracy"],                          industry:"all" },
  { code:"N9",  label:"Comparative Information Review (ISA 710)",    description:"Verification of comparative figures, opening balances, and corresponding figures per ISA 710 and ISA 510.",                                   category:"reporting",         phase:"Reporting",  mandatory:false, risk:"all",   isa:"ISA 710",                type:"reporting",   complexity:"medium", outputType:"word",        assertions:["completeness","accuracy"],                          industry:"all" },
  { code:"N10", label:"Draft Report Approval & Issue Checklist",     description:"Pre-issuance approval workflow — partner sign-off, EQCR clearance, legal review, and client delivery checklist.",                              category:"reporting",         phase:"Reporting",  mandatory:true,  risk:"all",   isa:"ISA 220",                type:"reporting",   complexity:"low",    outputType:"word",        assertions:["completeness"],                                     industry:"all" },

  // ─── O: Quality Control ─────────────────────────────────────────────────────
  { code:"O1",  label:"Engagement Quality Control Review (ISQM 1)", description:"EQCR review of significant judgments, audit opinion, and selected working papers by independent reviewer.",                                     category:"quality",           phase:"Reporting",  mandatory:false, risk:"all",   isa:"ISQM 1",                 type:"quality",     complexity:"high",   outputType:"word",        assertions:["completeness"],                                     industry:"all" },
  { code:"O2",  label:"EQCR Findings & Resolution",                 description:"Documentation of EQCR findings, partner responses, and resolution before report issuance.",                                                    category:"quality",           phase:"Reporting",  mandatory:false, risk:"all",   isa:"ISQM 1",                 type:"quality",     complexity:"medium", outputType:"word",        assertions:["completeness"],                                     industry:"all" },
  { code:"O3",  label:"Hot Review Checklist",                       description:"Pre-issuance hot review by senior manager — completeness of file, sign-offs, and key risks addressed.",                                        category:"quality",           phase:"Reporting",  mandatory:false, risk:"all",   isa:"ISQM 1",                 type:"quality",     complexity:"low",    outputType:"word",        assertions:["completeness"],                                     industry:"all" },
  { code:"O4",  label:"Cold Review / Inspection Documentation",     description:"Post-issuance inspection documentation, monitoring findings, and remediation actions.",                                                         category:"quality",           phase:"Archiving",  mandatory:false, risk:"all",   isa:"ISQM 1",                 type:"quality",     complexity:"medium", outputType:"word",        assertions:["completeness"],                                     industry:"all" },
  { code:"O5",  label:"Engagement Quality Objectives Checklist",    description:"ISQM 1 engagement-level quality objectives assessment — professional skepticism, ethical requirements, and firm's quality standards.",         category:"quality",           phase:"Reporting",  mandatory:false, risk:"all",   isa:"ISQM 1",                 type:"quality",     complexity:"medium", outputType:"word",        assertions:["completeness"],                                     industry:"all" },
  { code:"O6",  label:"Independence Review Completion",             description:"Final independence confirmation post-engagement — confirmation from all team members, period of coverage, and archiving.",                      category:"quality",           phase:"Reporting",  mandatory:true,  risk:"all",   isa:"ISQM 1, ISA 220",        type:"quality",     complexity:"low",    outputType:"word",        assertions:["completeness"],                                     industry:"all" },
  { code:"O7",  label:"Consultation Memo Register",                 description:"Log of all consultations undertaken during the engagement — technical, ethical, regulatory, and outcomes.",                                     category:"quality",           phase:"Reporting",  mandatory:false, risk:"all",   isa:"ISQM 1",                 type:"quality",     complexity:"medium", outputType:"word",        assertions:["completeness"],                                     industry:"all" },
  { code:"O8",  label:"Direction / Supervision / Review Documentation", description:"Evidence that engagement team members were properly directed, supervised, and their work reviewed per ISA 220.",                           category:"quality",           phase:"Execution",  mandatory:false, risk:"all",   isa:"ISA 220",                type:"quality",     complexity:"medium", outputType:"word",        assertions:["completeness"],                                     industry:"all" },
  { code:"O9",  label:"Differences of Opinion Resolution",          description:"Formal documentation and resolution process for differences of professional opinion within the team.",                                          category:"quality",           phase:"Reporting",  mandatory:false, risk:"all",   isa:"ISQM 1",                 type:"quality",     complexity:"medium", outputType:"word",        assertions:["completeness"],                                     industry:"all" },
  { code:"O10", label:"ISQM Monitoring Follow-up",                  description:"Follow-up on findings from the firm's ISQM monitoring and inspection programme relevant to this engagement.",                                  category:"quality",           phase:"Archiving",  mandatory:false, risk:"all",   isa:"ISQM 1",                 type:"quality",     complexity:"medium", outputType:"word",        assertions:["completeness"],                                     industry:"all" },

  // ─── P: Archiving ───────────────────────────────────────────────────────────
  { code:"P1",  label:"File Closure & Assembly Checklist",          description:"Assembly of complete audit file — checklist of all required documents, cross-references, and index.",                                           category:"archiving",         phase:"Archiving",  mandatory:true,  risk:"all",   isa:"ISA 230",                type:"completion",  complexity:"low",    outputType:"word",        assertions:["completeness"],                                     industry:"all" },
  { code:"P2",  label:"Archiving Memorandum & Retention Log",       description:"Archiving date confirmation (within 60 days of report), retention period documentation, and access controls.",                                   category:"archiving",         phase:"Archiving",  mandatory:false, risk:"all",   isa:"ISA 230, ISQM 1",        type:"completion",  complexity:"low",    outputType:"word",        assertions:["completeness"],                                     industry:"all" },
  { code:"P3",  label:"Subsequent Changes to Audit Documentation",  description:"Log of any documentation added or amended after assembly date with justification per ISA 230.",                                                 category:"archiving",         phase:"Archiving",  mandatory:false, risk:"all",   isa:"ISA 230",                type:"completion",  complexity:"low",    outputType:"word",        assertions:["completeness"],                                     industry:"all" },
  { code:"P4",  label:"Final Indexing & Cross-Reference Check",     description:"Final index review confirming all working papers are properly numbered, cross-referenced, and indexed.",                                        category:"archiving",         phase:"Archiving",  mandatory:true,  risk:"all",   isa:"ISA 230",                type:"completion",  complexity:"low",    outputType:"word",        assertions:["completeness"],                                     industry:"all" },
  { code:"P5",  label:"Version Control & Lockdown Log",             description:"Version history of key documents, lockdown date, and access restriction confirmation.",                                                        category:"archiving",         phase:"Archiving",  mandatory:false, risk:"all",   isa:"ISA 230",                type:"completion",  complexity:"low",    outputType:"word",        assertions:["completeness"],                                     industry:"all" },
  { code:"P6",  label:"Document Retention Access Control",          description:"Access control list for archived file — who can access, modify, and retrieve documents during retention period.",                               category:"archiving",         phase:"Archiving",  mandatory:false, risk:"all",   isa:"ISQM 1",                 type:"completion",  complexity:"low",    outputType:"word",        assertions:["completeness"],                                     industry:"all" },
  { code:"P7",  label:"File Handover / Delivery Record",            description:"Acknowledgment of file delivery to client or regulator with contents listing and receipt confirmation.",                                       category:"archiving",         phase:"Archiving",  mandatory:false, risk:"all",   isa:"ISA 230",                type:"completion",  complexity:"low",    outputType:"word",        assertions:["completeness"],                                     industry:"all" },
  { code:"P8",  label:"Post-Issuance Amendment Register",           description:"Register of any post-issuance amendments to audit report or financial statements with basis and approvals.",                                   category:"archiving",         phase:"Archiving",  mandatory:false, risk:"all",   isa:"ISA 560",                type:"completion",  complexity:"medium", outputType:"word",        assertions:["completeness"],                                     industry:"all" },

  // ─── Q: Specialized / Conditional Templates ─────────────────────────────────
  { code:"Q1",  label:"Group Audit Instructions (ISA 600)",         description:"Formal instructions to component auditors — scope, materiality, reporting requirements, and communication protocols.",                          category:"specialized",       phase:"Planning",   mandatory:false, risk:"all",   isa:"ISA 600",                type:"planning",    complexity:"high",   outputType:"word",        assertions:["completeness","accuracy"],                          industry:"all" },
  { code:"Q2",  label:"Component Auditor Review",                   description:"Review of component auditor's work, communication of findings, and adequacy assessment for group purposes.",                                   category:"specialized",       phase:"Execution",  mandatory:false, risk:"all",   isa:"ISA 600",                type:"planning",    complexity:"high",   outputType:"word",        assertions:["completeness","accuracy"],                          industry:"all" },
  { code:"Q3",  label:"Using the Work of Internal Audit (ISA 610)", description:"Assessment of internal audit function objectivity, competence, and use of their work in substantive procedures.",                             category:"specialized",       phase:"Planning",   mandatory:false, risk:"all",   isa:"ISA 610",                type:"planning",    complexity:"high",   outputType:"word",        assertions:["completeness","accuracy"],                          industry:"all" },
  { code:"Q4",  label:"Using an Auditor's Expert (ISA 620)",        description:"Evaluation of expert's competence, objectivity, and work — actuaries, valuers, IT specialists, and legal experts.",                           category:"specialized",       phase:"Execution",  mandatory:false, risk:"all",   isa:"ISA 620",                type:"planning",    complexity:"medium", outputType:"word",        assertions:["completeness","accuracy"],                          industry:"all" },
  { code:"Q5",  label:"Service Organization / SOC Review (ISA 402)", description:"Review of SOC 1/SOC 2 reports for service organizations, complementary controls, and impact on audit procedures.",                          category:"specialized",       phase:"Planning",   mandatory:false, risk:"medium", isa:"ISA 402",                type:"controls",    complexity:"high",   outputType:"word",        assertions:["completeness","accuracy"],                          industry:"all" },
  { code:"Q6",  label:"Opening Balances Review (ISA 510)",          description:"Verification of opening balances — predecessor auditor engagement, prior year adjustments, and consistency.",                                  category:"specialized",       phase:"Planning",   mandatory:false, risk:"all",   isa:"ISA 510",                type:"planning",    complexity:"medium", outputType:"word",        assertions:["completeness","accuracy"],                          industry:"all" },
  { code:"Q7",  label:"First-Year Audit Transition Memo",           description:"Transition procedures for first-year audit — predecessor communication, information access, and ICAP notification.",                          category:"specialized",       phase:"Pre-Planning", mandatory:false, risk:"all", isa:"ISA 510, ISA 300",      type:"planning",    complexity:"high",   outputType:"word",        assertions:["completeness"],                                     industry:"all" },
  { code:"Q8",  label:"Interim Review Procedures",                  description:"Interim/half-yearly review procedures, limited assurance conclusions, and ISRE 2410 compliance.",                                             category:"specialized",       phase:"Execution",  mandatory:false, risk:"all",   isa:"ISRE 2410",              type:"substantive", complexity:"medium", outputType:"word",        assertions:["completeness","accuracy"],                          industry:"all" },
  { code:"Q9",  label:"Consolidation / Combined FS Review",         description:"Consolidation entries testing, intercompany eliminations, minority interest, and goodwill reconciliation.",                                   category:"specialized",       phase:"Execution",  mandatory:false, risk:"high",  isa:"IFRS 10, ISA 600",       type:"substantive", complexity:"high",   outputType:"word+excel",  assertions:["completeness","accuracy","elimination"],            industry:"all" },
  { code:"Q10", label:"Donor / Grant / NGO Compliance WP",          description:"Grant utilization review, donor-imposed conditions, fund accountability, and restricted fund compliance.",                                    category:"specialized",       phase:"Execution",  mandatory:false, risk:"all",   isa:"ISA 250",                type:"substantive", complexity:"medium", outputType:"word",        assertions:["completeness","accuracy"],                          industry:"all" },
  { code:"Q11", label:"Public Sector / IPSAS Adjustments WP",       description:"IPSAS-specific adjustments, government grant recognition, and public sector disclosure requirements.",                                        category:"specialized",       phase:"Execution",  mandatory:false, risk:"all",   isa:"IPSAS, ISA 250",         type:"substantive", complexity:"high",   outputType:"word",        assertions:["completeness","accuracy"],                          industry:"all" },
  { code:"Q12", label:"Construction / Long-term Contracts WP",      description:"Percentage of completion testing, contract asset/liability, IFRS 15 variable consideration, and claims recognition.",                        category:"specialized",       phase:"Execution",  mandatory:false, risk:"high",  isa:"IFRS 15",                type:"substantive", complexity:"high",   outputType:"word+excel",  assertions:["completeness","accuracy","valuation"],              industry:"all" },
];

// ─── WP type / complexity badge colours ─────────────────────────────────────
const WP_TYPE_COLORS: Record<string, string> = {
  planning:    "bg-blue-100 text-blue-700 border-blue-200",
  risk:        "bg-orange-100 text-orange-700 border-orange-200",
  analytical:  "bg-cyan-100 text-cyan-700 border-cyan-200",
  controls:    "bg-purple-100 text-purple-700 border-purple-200",
  substantive: "bg-teal-100 text-teal-700 border-teal-200",
  completion:  "bg-amber-100 text-amber-700 border-amber-200",
  reporting:   "bg-violet-100 text-violet-700 border-violet-200",
  quality:     "bg-pink-100 text-pink-700 border-pink-200",
};
const COMPLEXITY_COLORS: Record<string, string> = {
  low:    "text-emerald-600 bg-emerald-50",
  medium: "text-amber-600 bg-amber-50",
  high:   "text-red-600 bg-red-50",
};
const OUTPUT_ICONS: Record<string, string> = { word:"W", excel:"XLS", "word+excel":"W+XLS" };

// ─────────────────────────────────────────────────────────────────────────────
// WP PROCEDURE CONTENT — Pakistan ISA/ISQM/ICAP/Companies Act 2017 Aligned
// ─────────────────────────────────────────────────────────────────────────────
interface WpProcedureContent {
  objective: string;
  legalRef: string;
  procedures: string[];
  conclusionTemplate: string;
  reviewers: string[];
}

const WP_PROCEDURES_MAP: Record<string, WpProcedureContent> = {
  "A1": {
    objective: "Document the firm's decision to accept or continue the audit engagement, evaluating client integrity, firm competence, ethical compliance, and engagement risk per ISQM 1 and ISA 220.",
    legalRef: "ISQM 1 (ICAP Adopted 2022) para. 30–46; ISA 220 para. 12–17; ICAP Code of Ethics Section 320; Companies Act 2017 s.252 (Auditor Appointment/Removal)",
    procedures: [
      "1. Obtain and review client's latest audited financial statements, Companies Act 2017 filings (SECP e-Services), and FBR taxpayer profile from IRIS portal.",
      "2. Assess management integrity: review prior audit reports, regulatory filings (SECP, FBR, SBP), adverse media search, and litigation disclosures.",
      "3. Evaluate firm competence: confirm availability of team with required sector expertise, IT audit skills, and tax knowledge relevant to the entity.",
      "4. Identify and document all independence threats under IESBA Code and ICAP Ethics: financial interests, business relationships, family/personal relationships, prior services, and fees.",
      "5. Perform conflict of interest check against firm's existing client list and any ICAP restriction notices.",
      "6. Assess whether engagement fees are reasonable and not contingent on audit outcome per ICAP Code s.240.",
      "7. Review predecessor auditor's reports (if applicable): identify any prior qualifications, emphasis of matter paragraphs, or regulatory concerns per ISA 510.",
      "8. Evaluate client's AML/KYC risk profile per ICAP AML Guidelines and FATF Pakistan mutual evaluation report 2019 requirements.",
      "9. Obtain partner approval and document conclusion in the engagement acceptance/continuance form.",
      "10. Update client acceptance database and notify ICAP of new appointment (if required under Companies Act 2017 s.252).",
    ],
    conclusionTemplate: "Based on our acceptance procedures, we conclude that [CLIENT NAME] meets the firm's client acceptance criteria. Independence threats have been identified as [NIL/LOW/MEDIUM] and appropriate safeguards are in place. The engagement is approved to proceed.",
    reviewers: ["Engagement Manager", "Engagement Partner", "EQCR Partner (if high-risk)"],
  },
  "A3": {
    objective: "Confirm independence of all engagement team members and identify, evaluate, and document all independence threats and safeguards per IESBA Code and ICAP Code of Ethics.",
    legalRef: "ISA 220 para. 18–23; IESBA Code Part 4A & 4B; ICAP Code of Ethics (2020 Edition) Part 3; ISQM 1 para. 30–34; Companies Act 2017 s.254 (Disqualification of Auditors)",
    procedures: [
      "1. Circulate independence questionnaires to all engagement team members (partners, managers, seniors, assistants) and obtain signed declarations.",
      "2. Verify no engagement team member holds any financial interest (direct/indirect) in the client per IESBA Code Section 270.",
      "3. Confirm no recent (past 2 years) employment relationship between team members and the client per IESBA Code Section 524.",
      "4. Review all non-audit services provided to the client in the current and prior year; assess whether they create self-review or management participation threats.",
      "5. Calculate fees receivable from the client as a percentage of total firm revenue; confirm compliance with ICAP fee dependence thresholds.",
      "6. For listed entities, confirm engagement partner rotation compliance (maximum 5 years consecutive per ICAP Ethics for listed companies).",
      "7. Assess familiarity threat for long-tenure relationships; document safeguards applied.",
      "8. Complete ICAP-required independence self-assessment checklist for audit engagements.",
      "9. Obtain partner-level sign-off confirming independence of the entire team.",
    ],
    conclusionTemplate: "All engagement team members have confirmed independence from [CLIENT NAME] for the period [PERIOD]. No independence threats requiring withdrawal have been identified. Safeguards applied: [LIST]. Independence declaration filed in permanent file.",
    reviewers: ["Engagement Partner", "Ethics Partner / EQCR (listed entities)"],
  },
  "A4": {
    objective: "Issue a formal engagement letter establishing the audit scope, management's responsibilities, auditor's responsibilities, and fee arrangements per ISA 210.",
    legalRef: "ISA 210 para. 9–12; Companies Act 2017 s.246 (Auditor's Duties); ICAP Engagement Letter Guidance (Circular No. 01/2020); SECP Listed Company Audit Requirements",
    procedures: [
      "1. Draft engagement letter using ICAP's model engagement letter as base, customized for the entity type (private limited, listed, SMC, trust, NGO).",
      "2. Include explicit statement of applicable financial reporting framework: IFRS (for listed/public entities) or AFRS for SSEs per ICAP/SECP Notification.",
      "3. State the auditor's objective under ISA 700: expressing an opinion on whether the financial statements give a true and fair view.",
      "4. Include management's responsibilities: preparation of FS per applicable framework, maintenance of adequate internal controls, and provision of all information.",
      "5. Define scope explicitly: whether audit covers consolidated or standalone FS, branches, associated companies.",
      "6. State audit fee, billing schedule, and arrangement for recovery of out-of-pocket expenses.",
      "7. Include limitation on auditor's liability clause where applicable under Pakistani law.",
      "8. Obtain management (Board/CEO) signature and file executed copy in permanent file.",
      "9. If recurring engagement, issue new letter only if terms have changed; otherwise, send a reminder letter confirming unchanged terms.",
    ],
    conclusionTemplate: "Engagement letter dated [DATE] has been signed by [AUTHORIZED SIGNATORY, DESIGNATION] on behalf of [CLIENT NAME] and countersigned by [ENGAGEMENT PARTNER NAME], [FIRM NAME]. Terms of engagement are confirmed.",
    reviewers: ["Engagement Partner"],
  },
  "B1": {
    objective: "Document the overall audit strategy setting the scope, timing, and direction of the audit, and develop a detailed audit plan with responses to assessed risks per ISA 300.",
    legalRef: "ISA 300 para. 7–12; ISA 315 (Revised 2019); ISA 330 para. 5–6; ICAP Auditing Standards Handbook; Companies Act 2017 s.246 (scope of audit duty)",
    procedures: [
      "1. Review entity's Articles of Association, Memorandum, statutory licenses (SECP, FBR, sector regulators), and latest board resolutions.",
      "2. Document entity's significant locations, business units, and reporting structure; determine if group audit considerations apply (ISA 600).",
      "3. Identify the applicable financial reporting framework (IFRS / IAS / AFRS for SSEs) as prescribed by SECP/ICAP notifications.",
      "4. Set audit scope: standalone vs. consolidated; all significant account balances and transaction classes material to the FS.",
      "5. Determine preliminary overall materiality using chosen benchmark (PBT, total assets, revenue as per ISA 320 guidelines).",
      "6. Identify significant risks and document preliminary responses in the risk register.",
      "7. Set the audit timetable: fieldwork dates, management representation date, reporting date, and archiving deadline (within 60 days of report).",
      "8. Determine use of component auditors, expert, or internal audit work and plan coordination accordingly.",
      "9. Assign team roles: engagement partner, manager, senior, assistant; document CPD compliance and sector expertise.",
      "10. Document audit strategy in the Audit Strategy Memorandum and obtain partner approval before fieldwork commencement.",
    ],
    conclusionTemplate: "The audit strategy for [CLIENT NAME] for the year ended [DATE] has been documented and approved by [PARTNER]. Audit plan covers all material areas. Fieldwork to commence [DATE].",
    reviewers: ["Engagement Manager", "Engagement Partner"],
  },
  "B2": {
    objective: "Determine overall materiality, performance materiality, and the trivial threshold for the audit, with benchmark selection rationale per ISA 320.",
    legalRef: "ISA 320 para. 10–14; ISA 450 para. 5; ICAP Technical Bulletin TB-09 (Materiality); SECP Listed Companies Regulations (for listed entities)",
    procedures: [
      "1. Identify the appropriate benchmark: PBT (profit-making entity), revenue (turnover-based), total assets (financial entities/holding companies), net assets (not-for-profit).",
      "2. Apply the ICAP-recommended percentage to the chosen benchmark: 5% of PBT / 0.5–1% of revenue / 1–2% of total assets.",
      "3. Compute overall materiality and document the rationale for benchmark and percentage selected.",
      "4. Set performance materiality at 60–75% of overall materiality per ISA 320 para. 11 (adjust upward/downward based on risk assessment).",
      "5. Set the trivial (clearly inconsequential) threshold at approximately 5% of overall materiality.",
      "6. Identify specific materiality thresholds for sensitive disclosures: related parties, directors' remuneration, regulatory compliance items.",
      "7. Document how materiality will be communicated to the engagement team and how it affects sampling and testing thresholds.",
      "8. Reassess materiality at the completion stage (ISA 320 para. 13) if actual results differ materially from preliminary estimates.",
    ],
    conclusionTemplate: "Overall materiality: PKR [AMOUNT] ([BENCHMARK] × [%]). Performance materiality: PKR [AMOUNT] ([%] of OM). Trivial threshold: PKR [AMOUNT]. Materiality approved by [PARTNER].",
    reviewers: ["Engagement Manager", "Engagement Partner"],
  },
  "B3": {
    objective: "Document a comprehensive understanding of the entity, its environment, the applicable financial reporting framework, and the entity's internal control system per ISA 315 (Revised 2019).",
    legalRef: "ISA 315 (Revised 2019) para. 19–32; Companies Act 2017 (entity structure, governance); SECP Listed Companies (Code of Corporate Governance) Regulations 2019; SBP Prudential Regulations (if financial entity)",
    procedures: [
      "1. Review entity's Memorandum and Articles, latest statutory filings with SECP (Form-A, Form-29, Annual Return), and corporate profile.",
      "2. Document business model: products/services, markets, pricing policy, key customers (>10% revenue), key suppliers, and competitive environment.",
      "3. Identify related parties per IAS 24: directors, shareholders (>10%), associated companies, key management personnel, and their close family members.",
      "4. Understand the regulatory environment: SECP, FBR, SBP, EOBI, PESSI, sector-specific regulators (NEPRA, PEMRA, PNRA, etc.).",
      "5. Review financial performance: last 3 years' FS, ratio analysis, and key industry benchmarks.",
      "6. Document the applicable financial reporting framework: IFRS (full/IFRS for SMEs), AFRS for SSEs, or sector-specific GAAP.",
      "7. Understand and document the five components of internal control per ISA 315: control environment, risk assessment process, information systems, control activities, monitoring.",
      "8. Conduct walkthrough of key cycles: revenue, procurement, payroll, treasury, fixed assets, financial close.",
      "9. Document IT environment: ERP systems, key applications, IT general controls, automated controls, and access rights.",
      "10. Update understanding in subsequent years: review changes in business model, ownership, key personnel, and regulatory status.",
    ],
    conclusionTemplate: "Understanding of entity documented per ISA 315. Key risks identified: [LIST]. Internal control environment assessed as [STRONG/ADEQUATE/WEAK]. Updated understanding filed in permanent file.",
    reviewers: ["Engagement Senior", "Engagement Manager", "Engagement Partner"],
  },
  "C1": {
    objective: "Identify and assess the risks of material misstatement at the financial statement level and at the assertion level for classes of transactions, account balances, and disclosures per ISA 315.",
    legalRef: "ISA 315 (Revised 2019) para. 26–33; ISA 330 para. 6–21; ICAP Auditing Standards Handbook; Companies Act 2017 s.246; IFRS applicable standards",
    procedures: [
      "1. Identify all significant account balances, transaction classes, and disclosures in the financial statements.",
      "2. For each identified item, assess inherent risk at the assertion level using the Inherent Risk Factors per ISA 315 para. 31 (complexity, subjectivity, change, uncertainty, susceptibility).",
      "3. Identify entity-level controls and assess whether they reduce the risk of material misstatement at the FS level.",
      "4. Identify and document Significant Risks separately per ISA 315 para. 27: revenue recognition, management override, related-party transactions, estimates with high measurement uncertainty.",
      "5. For each significant risk, document the specific audit response required per ISA 330 para. 21.",
      "6. Assess control risk for each assertion: determine whether to rely on controls or perform purely substantive procedures.",
      "7. Document the linkage between identified risks and planned audit procedures in the risk-procedure matrix.",
      "8. Confirm that risk assessment is updated whenever new information emerges during fieldwork.",
    ],
    conclusionTemplate: "Risk assessment completed for [CLIENT NAME]. [N] significant risks identified. Risk-procedure matrix prepared and approved by [MANAGER]. Risks appropriately addressed in audit program.",
    reviewers: ["Engagement Manager", "Engagement Partner"],
  },
  "C2": {
    objective: "Assess the risk of material misstatement due to fraud at both the financial statement level and the assertion level, and design appropriate audit responses per ISA 240.",
    legalRef: "ISA 240 para. 17–27; Companies Act 2017 s.247 (reporting fraud); FBR Benami Transactions Act 2017; FATF Mutual Evaluation 2019; ICAP Code of Ethics Section 350",
    procedures: [
      "1. Conduct mandatory fraud risk brainstorming with engagement team prior to fieldwork, documenting discussion and conclusions per ISA 240 para. 15.",
      "2. Make fraud inquiries of management: knowledge of fraud/alleged fraud, management's assessment of risk, and internal controls against fraud.",
      "3. Make fraud inquiries of those charged with governance (Board/Audit Committee) regarding management override and fraud oversight.",
      "4. Assess fraud risk factors (incentives/pressures, opportunity, rationalization) per ISA 240 Appendix 1 and document.",
      "5. Identify the two presumed significant risks per ISA 240: (i) revenue recognition fraud and (ii) management override of controls.",
      "6. Design specific responses to fraud risks: journal entry testing plan, estimate bias review, unusual transactions investigation.",
      "7. Perform unpredictable procedures to address management override: unexpected element selection, surprise procedures, different audit approaches.",
      "8. Report fraud or suspected fraud to appropriate level per ISA 240 para. 40–42 and Companies Act 2017 s.247.",
    ],
    conclusionTemplate: "Fraud risk assessment completed. Revenue recognition and management override identified as presumed fraud risks. Specific responses designed. No evidence of actual fraud detected [or: suspected fraud reported to [PARTY] on [DATE]].",
    reviewers: ["Engagement Manager", "Engagement Partner"],
  },
  "D1": {
    objective: "Perform preliminary analytical procedures on the trial balance and financial data to identify unusual fluctuations, unexpected relationships, and areas requiring additional audit focus per ISA 520.",
    legalRef: "ISA 520 para. 5–10; ISA 315 para. 6; ICAP Technical Guidance on Analytical Procedures",
    procedures: [
      "1. Obtain final or near-final trial balance and prior year comparative TB; verify mathematical accuracy and reconciliation to general ledger.",
      "2. Compute year-on-year movement in all material account balances and transaction classes; flag movements >20% or >performance materiality.",
      "3. Calculate key financial ratios: gross margin, net margin, current ratio, quick ratio, debtor days, creditor days, inventory days, asset turnover.",
      "4. Compare current year ratios to: (i) prior 3 years trend, (ii) industry benchmarks (SBP Industry Report, PSX sector data), and (iii) budget/forecast.",
      "5. Analyse revenue composition: breakdown by product/service, geography, customer concentration (any single customer >10% of revenue).",
      "6. Identify any account balances that have moved contrary to business trends (e.g., revenue increased but receivables decreased).",
      "7. Document all significant fluctuations and obtain management explanations; assess plausibility of explanations against audit knowledge.",
      "8. Update risk assessment for any areas identified through analytical procedures as higher risk.",
    ],
    conclusionTemplate: "Preliminary analytical procedures completed on TB as at [DATE]. Key fluctuations: [LIST]. Management explanations obtained and assessed as [PLAUSIBLE/REQUIRING FURTHER INVESTIGATION]. Risk assessment updated.",
    reviewers: ["Engagement Senior", "Engagement Manager"],
  },
  "D5": {
    objective: "Perform final analytical procedures at the completion stage to confirm that the financial statements are consistent with the auditor's understanding and no previously unidentified risks remain per ISA 520.",
    legalRef: "ISA 520 para. 6(b); ISA 520 para. 11–14; ISA 700 para. 15; ICAP Quality Control Standards",
    procedures: [
      "1. Obtain final audited financial statements and compare to the trial balance used for fieldwork; confirm no material differences.",
      "2. Perform ratio analysis on final FS and compare to preliminary analytical review findings; investigate any unexplained changes.",
      "3. Confirm that all significant fluctuations identified in preliminary analytical review have been satisfactorily resolved.",
      "4. Assess whether the overall presentation of the financial statements is consistent with understanding of the entity.",
      "5. Compare all quantitative disclosures in notes to supporting working papers; confirm consistency.",
      "6. Confirm EPS (if applicable), ZIA deduction, and directors' remuneration disclosures are mathematically accurate.",
      "7. Document conclusion and confirm no previously unidentified material risks remain.",
    ],
    conclusionTemplate: "Final analytical review completed on audited FS dated [DATE]. All significant fluctuations satisfactorily resolved. FS presentation consistent with audit understanding. No new risks identified at final stage.",
    reviewers: ["Engagement Manager", "Engagement Partner"],
  },
  "F1": {
    objective: "Obtain sufficient appropriate audit evidence over cash and bank balances — existence, completeness, accuracy, and cut-off — through bank confirmations, reconciliation testing, and petty cash procedures per ISA 505.",
    legalRef: "ISA 505 para. 6–16; ISA 500 para. 7–11; SBP Banking Regulations; Companies Act 2017 s.246; IAS 7 (Cash and Cash Equivalents); ICAP Bank Confirmation Letter Format",
    procedures: [
      "1. Obtain list of all bank accounts: account numbers, bank names, branches, signatories, and balance sheet date balances per GL.",
      "2. Send ICAP-formatted bank confirmation letters directly to all banks (positive confirmation required for material balances) as at year-end date.",
      "3. Obtain bank statements for the last month of the financial year and first month of next year; perform cut-off testing.",
      "4. Reconcile each bank account: trace reconciling items (outstanding cheques, deposits in transit) to subsequent bank statements.",
      "5. Verify all outstanding cheques >30 days old: confirm legitimacy, stale cheque investigation, and proper accounting.",
      "6. Test all inter-bank transfers in the 5 days before and after year-end: identify kiting and proper recording.",
      "7. Perform physical petty cash count at year-end (surprise) or obtain certificates; agree to GL balance.",
      "8. Verify that all bank accounts are properly disclosed per IAS 7: restricted cash separately presented, lien/pledge disclosed.",
      "9. Confirm bank loan balances, security arrangements, and any set-off rights per confirmations.",
      "10. Verify FX cash balances are translated at year-end closing rate per IAS 21.",
    ],
    conclusionTemplate: "Cash and bank balances as at [DATE] of PKR [AMOUNT] are fairly stated in all material respects. [N] bank confirmations received ([N] outstanding — alternative procedures performed). Cut-off is satisfactory. Reconciliations reviewed and cleared.",
    reviewers: ["Engagement Senior", "Engagement Manager"],
  },
  "F2": {
    objective: "Verify trade receivables for existence, valuation, completeness, and cut-off through debtor confirmations, aging analysis, and bad debt provision adequacy testing per ISA 505.",
    legalRef: "ISA 505 para. 6–16; IFRS 9 (ECL — impairment); IAS 1 (presentation); Companies Act 2017 Fourth Schedule (disclosure); ICAP Guidance on Receivables Audit",
    procedures: [
      "1. Obtain complete debtor ledger at year-end; agree total to trial balance and financial statements.",
      "2. Prepare aging analysis: current, 30–60 days, 61–90 days, 91–180 days, >180 days; compare to prior year.",
      "3. Select debtors for positive/negative confirmation per sampling plan; send confirmations on firm letterhead directly to third parties.",
      "4. Follow up on non-responses: perform alternative procedures (subsequent receipts, sales invoices, delivery notes, contracts).",
      "5. Review post-year-end cash receipts in the 45–60 days following year-end; agree to debtor balances.",
      "6. Assess adequacy of bad debt provision under IFRS 9 ECL model: obtain management's ECL computation; test stage classification criteria.",
      "7. Review credit notes issued post-year-end: assess whether provision for returns/credit notes is adequate at year-end.",
      "8. Identify any related-party receivables; confirm arm's length terms and proper disclosure per IAS 24.",
      "9. Verify cut-off: last 10 sales invoices before year-end and first 10 after year-end; confirm correct accounting period.",
      "10. Confirm receivables are presented net of provision; no right of set-off with payables unless legally enforceable.",
    ],
    conclusionTemplate: "Trade receivables as at [DATE] of PKR [AMOUNT] (net) are fairly stated. Confirmations [N] sent, [N] replied positively, [N] alternative procedures performed. ECL provision of PKR [AMOUNT] assessed as adequate. Cut-off satisfactory.",
    reviewers: ["Engagement Senior", "Engagement Manager"],
  },
  "F3": {
    objective: "Obtain sufficient audit evidence over inventory existence, condition, valuation, and completeness through physical observation, count verification, and NRV assessment per ISA 501.",
    legalRef: "ISA 501 para. 4–8; IAS 2 (Inventories); Companies Act 2017 Fourth Schedule; SECP Reporting Regulations; ICAP Guidance on Inventory Observation",
    procedures: [
      "1. Attend physical inventory count at year-end (or at an interim date with roll-forward procedures): plan attendance at all material locations.",
      "2. Evaluate management's count instructions: completeness of locations covered, cut-off controls, movement restrictions during count.",
      "3. Perform independent test counts: select items from count sheets to floor and floor to count sheets (both directions).",
      "4. Observe condition of inventory: identify damaged, slow-moving, or obsolete items; report to management.",
      "5. Note the last dispatch note number and last goods receipt note before year-end for cut-off testing.",
      "6. Trace test-counted items to final inventory listing; agree totals to trial balance.",
      "7. Test inventory valuation: (i) raw materials — purchase invoices/import documents; (ii) WIP and FG — cost sheets, overhead absorption rate verification; (iii) confirm FIFO/AVCO method applied consistently.",
      "8. Test NRV for slow-moving/obsolete items: sales price lists post year-end, selling costs deduction; confirm provision adequacy.",
      "9. Confirm proper cut-off of goods in transit: CIF vs FOB terms, last import entry date, and GRN date.",
      "10. For consignment stock: confirm stock held as agent not included in entity's inventory.",
    ],
    conclusionTemplate: "Inventory as at [DATE] of PKR [AMOUNT] is fairly stated at the lower of cost and NRV. Physical count attended at [LOCATION(S)]. Test counts satisfactory. Valuation method [FIFO/AVCO] applied consistently. NRV provision of PKR [AMOUNT] adequate.",
    reviewers: ["Engagement Senior", "Engagement Manager"],
  },
  "F4": {
    objective: "Verify PPE roll-forward, additions/disposals, depreciation computation, impairment indicators, and disclosure per IAS 16.",
    legalRef: "IAS 16 (Property, Plant & Equipment); IAS 36 (Impairment); IAS 40 (Investment Property); Companies Act 2017 Fourth Schedule; FBR Initial Allowance / Depreciation Rules (ITO 2001 s.22–24)",
    procedures: [
      "1. Obtain fixed asset register reconciled to opening balance per prior year FS; trace to closing balance in current year FS.",
      "2. Test additions: vouch significant additions (>performance materiality) to purchase invoices, import documents, GRNs, and Board/management approvals. Verify capital vs. revenue split.",
      "3. Test disposals: vouch disposals to sale/scrapping documents; verify gain/loss calculation and approval. Confirm no disposed assets remain on register.",
      "4. Recalculate depreciation for a sample of assets: verify rate, method (SLM/DWV), useful life assumptions, and consistency with prior year and IAS 16 para. 62.",
      "5. Verify that useful lives and residual values have been reviewed at each year-end per IAS 16 para. 51.",
      "6. Assess impairment indicators per IAS 36 para. 12: market value decline, technology changes, entity-specific decline. If indicators exist, obtain and review impairment test.",
      "7. Inspect deeds/ownership documents for owned land and buildings; confirm no encumbrances not disclosed.",
      "8. For revaluation model: verify date of last revaluation, confirm qualified valuer used, and mathematical accuracy of revaluation surplus.",
      "9. Verify FBR tax depreciation schedules reconcile to deferred tax computation.",
      "10. Confirm correct presentation: assets under construction separately disclosed; finance lease assets separately identified (pre-IFRS 16 if applicable).",
    ],
    conclusionTemplate: "PPE as at [DATE] of PKR [AMOUNT] (net) is fairly stated. Additions of PKR [AMOUNT] and disposals of PKR [AMOUNT] verified. Depreciation recalculated as [ACCURATE/IMMATERIAL DIFFERENCE OF PKR X]. No impairment indicators identified [or: impairment assessed as immaterial].",
    reviewers: ["Engagement Senior", "Engagement Manager"],
  },
  "G1": {
    objective: "Verify trade payables for completeness, accuracy, existence, and cut-off through supplier statement reconciliation, creditor confirmations, and GRN-invoice matching.",
    legalRef: "ISA 500 para. 7–11; IAS 37 (accruals); Companies Act 2017 Fourth Schedule; IFRS 9 (financial liabilities); FBR WHT implications on payables",
    procedures: [
      "1. Obtain complete creditor ledger at year-end; agree total to trial balance and financial statements.",
      "2. Reconcile major supplier statements (all suppliers >5% of total payables) to ledger balances; investigate reconciling items.",
      "3. Send direct confirmation requests to major suppliers not providing statements; follow up on non-responses.",
      "4. Review purchase cut-off: last 10 GRNs before year-end and first 10 after; confirm payable recorded in correct period.",
      "5. Agree year-end payables to subsequent payments in first 45 days post year-end (most reliable evidence for existence and amount).",
      "6. Search for unrecorded liabilities: review post-year-end invoices, board minutes, and expense accruals; confirm all period expenses are accrued.",
      "7. Verify withholding tax deductible at source on payables per ITO 2001 Schedule II has been deducted and is payable to FBR.",
      "8. Confirm proper classification: current vs. non-current; identify any balances with favourable/unfavourable payment terms.",
      "9. Identify any related-party payables; confirm arm's length terms and proper disclosure per IAS 24.",
    ],
    conclusionTemplate: "Trade payables as at [DATE] of PKR [AMOUNT] are fairly stated. [N] supplier reconciliations performed. No material unrecorded liabilities identified. Cut-off satisfactory. WHT deductions verified.",
    reviewers: ["Engagement Senior", "Engagement Manager"],
  },
  "G3": {
    objective: "Verify completeness, accuracy, and measurement basis for all accruals, provisions, and contingent liabilities per IAS 37 and ISA 560.",
    legalRef: "IAS 37 (Provisions, Contingent Liabilities and Assets); ISA 501 para. 13–17 (legal confirmations); Companies Act 2017 s.292 (WPPF); ITO 2001 (tax provisions); Fourth Schedule (disclosure requirements)",
    procedures: [
      "1. Obtain list of all provisions and accruals; agree totals to trial balance and notes to FS.",
      "2. Verify each material provision meets IAS 37 para. 14 recognition criteria: present obligation, probable outflow, reliable estimate.",
      "3. Assess reasonableness of accruals: review post-year-end invoices and payments; agree accruals to contractual commitments, vendor quotes, or historical run-rates.",
      "4. For legal/litigation provisions: obtain direct confirmation from legal counsel (solicitor letter per ISA 501 para. 13–17); assess adequacy per management's estimate.",
      "5. Verify Workers' Profit Participation Fund (WPPF) provision per s.87 of Companies Profit Act 1968: 5% of profit; review calculation.",
      "6. Verify Workers' Welfare Fund (WWF) provision: 2% of assessable income per WWF Ordinance 1971.",
      "7. Review EOBI (Employees' Old-Age Benefits Institution) contributions accrual: 5% of min wage per EOBI Act.",
      "8. Confirm gratuity/leave encashment provision (if not actuarially valued): review HR policy, headcount, and average entitlement.",
      "9. Review contingent liabilities: guarantees, letters of credit, bank charges, and disputed amounts — confirm adequate disclosure per IAS 37 para. 86.",
      "10. Confirm no provisions are recognised for restructuring unless announcement made and binding obligation exists per IAS 37 para. 72.",
    ],
    conclusionTemplate: "Provisions and accruals as at [DATE] of PKR [AMOUNT] are fairly stated and meet IAS 37 recognition criteria. WPPF: PKR [X], WWF: PKR [X], EOBI: PKR [X] verified. Contingent liabilities adequately disclosed.",
    reviewers: ["Engagement Senior", "Engagement Manager"],
  },
  "H1": {
    objective: "Verify revenue recognition, completeness, occurrence, cut-off, and measurement per IFRS 15, with specific focus on the fraud risk of revenue overstatement per ISA 240.",
    legalRef: "IFRS 15 (Revenue from Contracts with Customers); ISA 240 para. 26 (presumed revenue fraud risk); ITO 2001 (revenue-based taxes); Sales Tax Act 1990 (output tax timing); Companies Act 2017 Fourth Schedule",
    procedures: [
      "1. Obtain revenue listing by product/service/geography; agree to trial balance and FS revenue figure.",
      "2. Apply IFRS 15 five-step model: identify contracts, performance obligations, transaction price, allocation, and satisfaction of obligations — document entity's revenue recognition policy and assess compliance.",
      "3. Test revenue cut-off: last 10 sales invoices before year-end and first 10 after; verify goods delivered/services performed before year-end are recognised in correct period.",
      "4. Vouch a sample of revenue transactions: invoice → contract/purchase order → delivery note → customer receipt/bank deposit.",
      "5. Test journal entry fraud risk (ISA 240): identify unusual revenue journal entries — reversals, entries on non-business days, entries by senior officials, round-sum entries; vouch to supporting documents.",
      "6. Confirm revenue is recognised at the amount of consideration to which the entity is entitled per IFRS 15 para. 46.",
      "7. Verify GST/Sales Tax output tax is properly computed and reconciled to FBR annexure returns filed on IRIS portal.",
      "8. Assess completeness: reconcile revenue to goods dispatched records, service completion reports, and sales tax returns.",
      "9. For long-term contracts: verify percentage of completion method applied correctly per IFRS 15; no revenue recognised before performance obligations satisfied.",
      "10. Test credit notes and returns post-year-end: confirm proper deduction from revenue; no improper reversal of prior-period revenue.",
    ],
    conclusionTemplate: "Revenue of PKR [AMOUNT] for the year ended [DATE] is fairly stated. IFRS 15 five-step model applied consistently. Revenue cut-off satisfactory. No evidence of revenue fraud identified. GST returns reconciled.",
    reviewers: ["Engagement Senior", "Engagement Manager", "Engagement Partner (significant risk)"],
  },
  "H4": {
    objective: "Verify payroll and staff costs for accuracy, completeness, occurrence, and compliance with EOBI, PESSI, income tax on salaries, and labour laws applicable in Pakistan.",
    legalRef: "ITO 2001 s.12 (salary income), s.149 (tax deduction from salary); EOBI Act 1976; Employees Social Security Act (PESSI/SESSI); Minimum Wages Ordinance 1961 (provincial); Companies Act 2017 s.220 (directors' remuneration)",
    procedures: [
      "1. Obtain payroll summary for all 12 months; agree total payroll expense to trial balance and FS staff cost figure.",
      "2. Vouch a sample of payroll payments: payroll register → bank transfer listing → bank statement.",
      "3. Verify EOBI deductions: 5% employer + 1% employee contributions; reconcile to FBR/EOBI monthly filings.",
      "4. Verify provincial social security (PESSI/SESSI/ESIC) contributions: applicable rates and reconciliation to provincial authority filings.",
      "5. Verify income tax on salaries: recalculate for sample of employees per ITO 2001 s.149 and Fifth Schedule; confirm correct deduction and deposit with FBR via IRIS.",
      "6. Compare monthly payroll headcount to HR records (employee register, joining/leaving dates); identify ghost employees.",
      "7. Verify compliance with minimum wage: confirm no employee paid below provincial minimum wage applicable in the financial year.",
      "8. Verify directors' remuneration: Board approval obtained per Companies Act 2017 s.220; disclosed correctly in notes.",
      "9. Inspect final settlement computations for employees who left during the year: confirm correct gratuity, leave encashment, and tax calculations.",
      "10. Reconcile accrued salaries and bonuses at year-end to payroll run performed in first month after year-end.",
    ],
    conclusionTemplate: "Payroll and staff costs of PKR [AMOUNT] for the year are fairly stated. Tax on salaries reconciled and deposited. EOBI/PESSI contributions verified. No ghost employees identified in sample. Directors' remuneration per Board approval.",
    reviewers: ["Engagement Senior", "Engagement Manager"],
  },
  "I1": {
    objective: "Verify current tax liability per ITO 2001, minimum tax, super tax, advance tax adjustments, and deferred tax computation per IAS 12 for completeness and accuracy.",
    legalRef: "ITO 2001 (as amended); Finance Act 2023; Finance Act 2024; IAS 12 (Income Taxes); Companies Act 2017; SECP Reporting Requirements",
    procedures: [
      "1. Obtain management's tax computation for the year; agree taxable income to accounting profit with proper add-backs and deductions.",
      "2. Verify add-backs: disallowed expenses per ITO 2001 (entertainment above limit, depreciation on non-tax assets, provisions not allowable).",
      "3. Verify deductions: initial allowance (s.23), depreciation allowance (s.22 at SRB rates), WPPF deduction, and charitable donations per s.61.",
      "4. Compute minimum turnover tax per ITO 2001 s.113: 1.25% of turnover (or applicable rate for the year). Compare to normal tax; apply higher amount.",
      "5. Compute super tax per ITO 2001 s.4C: applicable for income >PKR 150 million (rate per Finance Act 2023/2024); verify calculation.",
      "6. Verify advance tax adjustments: Section 147 advance tax paid; Section 149 WHT on salary; Section 153/154/155 WHT collected; Section 235 electricity duty.",
      "7. Reconcile income tax provision to FBR IRIS portal: compare liability per computation to return filed or to be filed.",
      "8. Prepare deferred tax computation per IAS 12: all temporary differences (accelerated tax depreciation vs. accounting depreciation, provision timing differences, lease IFRS 16 differences).",
      "9. Verify rate used for DTA/DTL: enacted rate at balance sheet date per IAS 12 para. 47.",
      "10. Review open tax assessments, FBR notices, and ATIR orders; assess adequacy of provision for disputed matters per IAS 37.",
    ],
    conclusionTemplate: "Income tax provision of PKR [AMOUNT] (current: [X], deferred: [X]) for the year ended [DATE] is fairly stated. Minimum tax applicable: PKR [X]. Super tax: PKR [X]. Advance tax adjustments verified. DTA/DTL of PKR [X] appropriately computed.",
    reviewers: ["Tax Manager", "Engagement Manager", "Engagement Partner"],
  },
  "I2": {
    objective: "Reconcile sales tax (GST) and Federal Excise Duty (FED) output and input tax returns with the accounting records and verify FBR annexure compliance.",
    legalRef: "Sales Tax Act 1990 (as amended); Federal Excise Act 2005; FBR SRO notifications; Finance Acts; Provincial Sales Tax Acts (PRA/SRB/KPRA/BRA for services)",
    procedures: [
      "1. Obtain all monthly GST returns filed via FBR IRIS for the 12-month period; agree total output tax to sum of sales tax invoices issued.",
      "2. Agree total input tax claimed to purchase invoices; verify all input tax claims are supported by valid sales tax invoices from registered suppliers.",
      "3. Reconcile sales per GST returns to revenue per income tax return and financial statements (3-way reconciliation); investigate and clear all differences.",
      "4. Verify Annexure-B (supplies) and Annexure-C (purchases) are complete and include all transactions per FBR IRIS records.",
      "5. Check that zero-rated exports are properly supported by export documents: SBP Form E, bank credit advice, and customs clearance documents.",
      "6. Verify exempt supplies are correctly identified and input tax apportionment is performed per Rule 58E of ST Rules 2006.",
      "7. Confirm FED on applicable goods/services is computed at correct rates per First/Second Schedule of Federal Excise Act.",
      "8. Reconcile sales tax payable/refundable at year-end per returns to balance sheet figure.",
      "9. Identify any pending FBR sales tax notices or audit proceedings and assess adequacy of provision.",
    ],
    conclusionTemplate: "Sales tax/FED for the year ended [DATE] reconciled. Output tax: PKR [X], Input tax: PKR [X]. 3-way revenue reconciliation completed — difference of PKR [X] explained as [REASON]. GST payable/refundable of PKR [X] per balance sheet confirmed.",
    reviewers: ["Tax Senior", "Tax Manager", "Engagement Manager"],
  },
  "I3": {
    objective: "Verify withholding tax (WHT) deductions on payments, timely deposit with FBR, and compliance with all applicable WHT provisions under ITO 2001.",
    legalRef: "ITO 2001 ss.149–156, Schedule II (WHT rates); FBR IRIS Monthly WHT Returns; Income Tax Rules 2002; FBR Income Tax Circular No. 3/2023",
    procedures: [
      "1. Obtain all 12 monthly WHT statements (Annex-C in monthly statements) filed via IRIS; agree to supporting payment vouchers.",
      "2. Test WHT on contracts/services (s.153): verify 7.5%/12% (filer/non-filer) deducted on payments to suppliers; trace to IRIS filings.",
      "3. Test WHT on imports (s.148): verify advance tax on imports at applicable rate; trace to import documents and IRIS.",
      "4. Test WHT on exports (s.154): verify 1% deduction on export proceeds; trace to bank credit advice.",
      "5. Test WHT on profit on debt/interest (s.151): verify 15% on bank interest; confirm bank has withheld and deposited.",
      "6. Test WHT on rent (s.155): verify 15% withheld on rent payments; trace to rent agreements and payment vouchers.",
      "7. Test WHT on dividends (s.150): verify applicable rate withheld on dividends declared; trace to Board resolution and bank records.",
      "8. Verify timely deposit of WHT: all WHT must be deposited by 15th of following month per ITO 2001 s.160; check for late deposit penalties.",
      "9. Confirm certificates issued to payees from whom WHT was deducted per ITO 2001 s.164.",
      "10. Reconcile total WHT expense in accounts to total WHT deposited per IRIS records.",
    ],
    conclusionTemplate: "WHT compliance for year ended [DATE] reviewed. [N] monthly returns filed via IRIS. WHT deducted and deposited of PKR [AMOUNT] reconciled. [No material non-compliance identified / Non-compliance of PKR [X] identified — management notified].",
    reviewers: ["Tax Senior", "Tax Manager"],
  },
  "L1": {
    objective: "Evaluate the sufficiency and appropriateness of all audit evidence obtained across all audit areas and assert assertion coverage before drawing audit conclusions per ISA 500.",
    legalRef: "ISA 500 para. 7–11; ISA 330 para. 26; ISA 220 para. 34; ISA 230 para. 7–8; ICAP Quality Assurance Framework",
    procedures: [
      "1. Prepare audit evidence summary: for each significant account balance and transaction class, confirm evidence obtained across all relevant assertions.",
      "2. Confirm that sufficient appropriate evidence has been obtained for each significant risk identified in the planning stage.",
      "3. Review all working papers for completeness: proper cross-referencing, sign-off by preparer and reviewer, conclusions documented.",
      "4. Confirm all PBC (Prepared by Client) items have been received, reviewed, and cleared.",
      "5. Verify all significant audit findings have been communicated to management and appropriate responses obtained.",
      "6. Confirm all open exceptions and follow-up items from interim audit have been resolved.",
      "7. Assess whether the evidence obtained is consistent with the overall audit conclusion; identify any contradictory evidence and document resolution per ISA 230.",
      "8. Confirm audit team has applied appropriate professional scepticism throughout the audit per ISA 200 para. 15.",
    ],
    conclusionTemplate: "Audit evidence review completed for [CLIENT NAME] year ended [DATE]. All significant areas covered with sufficient appropriate evidence. All assertions addressed. No unresolved evidence gaps remain. File is complete for review.",
    reviewers: ["Engagement Manager", "Engagement Partner"],
  },
  "M1": {
    objective: "Identify and evaluate events occurring between the balance sheet date and the audit report date that may require adjustment or disclosure per ISA 560.",
    legalRef: "ISA 560 para. 6–16; IAS 10 (Events After the Reporting Period); Companies Act 2017 s.235 (directors' report — subsequent events); IFRS 9 (post-period credit events)",
    procedures: [
      "1. Read board minutes from year-end date to audit report date; identify any significant decisions with FS impact.",
      "2. Review management accounts and bank statements for the period from year-end to audit report date.",
      "3. Review post-year-end legal correspondence, court orders, FBR notices, and SECP communications.",
      "4. Make specific inquiries of management about subsequent events: new borrowings, commitments, litigation, significant contracts, restructuring decisions.",
      "5. Confirm going concern indicators: new financing secured, major customer contracts, orders received, forward projections.",
      "6. Review post-year-end sales invoices and credit notes; confirm no material reversal of year-end revenue.",
      "7. Confirm completion of management representation letter covers subsequent events through to report date.",
      "8. For adjusting events (per IAS 10 para. 3): confirm FS adjusted where material; for non-adjusting events: confirm disclosure is adequate.",
      "9. Document conclusion on subsequent events and confirm no adjustment to FS is required [or: adjustment required — see WP XXX].",
    ],
    conclusionTemplate: "Subsequent events review performed through to [REPORT DATE]. [No material adjusting events identified. Non-adjusting events disclosed in Note [X]: [DESCRIPTION]. / Adjusting event of PKR [X] identified and adjusted in FS.]",
    reviewers: ["Engagement Manager", "Engagement Partner"],
  },
  "M2": {
    objective: "Evaluate management's assessment of the entity's ability to continue as a going concern and determine the appropriateness of the going concern basis of accounting per ISA 570.",
    legalRef: "ISA 570 (Revised) para. 12–25; IAS 1 para. 25–26 (going concern); Companies Act 2017 s.236 (insolvency); SECP Listed Companies Regulations; SBP Prudential Regulations (financial entities)",
    procedures: [
      "1. Obtain management's going concern assessment (formal document) covering at least 12 months from the balance sheet date.",
      "2. Review financial indicators: net loss position, current liabilities > current assets, negative cash flows from operations, breached loan covenants.",
      "3. Review operating indicators: loss of key customers (>20% revenue), loss of key management, supply chain disruptions, regulatory sanctions.",
      "4. Assess external factors: Pakistan economic conditions, sector-specific risks, FBR enforcement actions, SECP regulatory changes.",
      "5. Review business plans, cash flow projections, and financing plans; assess achievability of projections against historical performance.",
      "6. Verify availability of banking facilities: obtain bank confirmations of undrawn facilities; review renewal terms.",
      "7. Confirm management's assessment period covers at least 12 months from balance sheet date per ISA 570 para. 13.",
      "8. If going concern doubt exists: assess adequacy of disclosure per IAS 1 para. 25; consider modification to audit report.",
      "9. Obtain management representation that going concern basis is appropriate.",
    ],
    conclusionTemplate: "Going concern assessment completed. The entity [HAS / DOES NOT HAVE] significant going concern indicators. Management's assessment is [APPROPRIATE / INAPPROPRIATE]. Going concern basis [IS / IS NOT] appropriate for the FS. [Disclosure in Note [X] is adequate / Modified opinion required].",
    reviewers: ["Engagement Manager", "Engagement Partner"],
  },
  "M3": {
    objective: "Obtain written representations from management confirming all significant matters, completeness of information provided, and specific representations required by ISA 580.",
    legalRef: "ISA 580 para. 10–21; ISA 500 para. 9; Companies Act 2017 s.166 (directors' duties of disclosure); ICAP Guidance on Management Representation Letters",
    procedures: [
      "1. Prepare management representation letter covering the period from balance sheet date to representation letter date (same as audit report date).",
      "2. Include mandatory general representations per ISA 580 para. 10: preparation of FS per applicable framework, information provided is complete, all transactions recorded.",
      "3. Include specific representations required by other ISAs: going concern assessment (ISA 570), fraud (ISA 240 para. 39), related parties (ISA 550), subsequent events (ISA 560), litigation (ISA 501).",
      "4. Include Pakistan-specific representations: WHT compliance, FBR filing status, SECP compliance, EOBI/PESSI contributions, WWF payment, WPPF payment.",
      "5. Obtain signature of CEO/Managing Director and CFO (or Chief Accountant); Board Chairman signature required for listed entities per SECP regulations.",
      "6. Date the representation letter same as the audit report date.",
      "7. If management refuses to provide or modifies a representation: assess impact on reliance on other evidence; consider withdrawal from engagement.",
    ],
    conclusionTemplate: "Management representation letter dated [DATE] obtained, signed by [CEO/MD NAME] and [CFO NAME]. All required representations per ISA 580 and Pakistan-specific requirements obtained. Copy filed in permanent file.",
    reviewers: ["Engagement Manager", "Engagement Partner"],
  },
  "M4": {
    objective: "Prepare overall audit completion memorandum documenting the overall conclusion, significant judgments made, quality control compliance, and sign-off per ISA 220.",
    legalRef: "ISA 220 para. 34–40; ISQM 1 para. 43–46; ISA 700 para. 12; ICAP Quality Assurance Department requirements; Companies Act 2017 (audit report requirements)",
    procedures: [
      "1. Confirm all areas of the audit have been completed and working papers signed off by appropriate levels.",
      "2. Document overall conclusion: 'In our opinion, the financial statements give a true and fair view of the financial position of [CLIENT] as at [DATE] and its financial performance and cash flows for the year then ended, in accordance with [IFRS/AFRS/applicable framework] and the requirements of the Companies Act 2017.'",
      "3. Summarise all significant audit judgments: materiality decisions, risk assessments, estimate evaluations, and going concern conclusions.",
      "4. Confirm all misstatements identified (adjusted and unadjusted) are documented in the misstatements schedule and summary of audit differences.",
      "5. Confirm management has adjusted all material misstatements or signed the unadjusted misstatements acknowledgement.",
      "6. Confirm engagement quality control review (EQCR) has been completed where required (listed entities, high-risk engagements).",
      "7. Confirm all team members have completed independence declarations and CPD requirements.",
      "8. Document partner's overall conclusion on whether a modified opinion is required.",
      "9. Confirm archiving will be completed within 60 days of audit report date per ISA 230 para. 14.",
    ],
    conclusionTemplate: "Audit of [CLIENT NAME] for year ended [DATE] is complete. Overall conclusion: [UNMODIFIED/MODIFIED] opinion. Significant judgments documented. File complete and approved for reporting. Partner sign-off obtained.",
    reviewers: ["Engagement Partner"],
  },
  "N1": {
    objective: "Draft the statutory audit report in compliance with ISA 700, ISA 701 (if listed), and the Companies Act 2017, expressing an appropriate opinion on the true and fair view of the financial statements.",
    legalRef: "ISA 700 (Revised) para. 22–43; ISA 701 (Key Audit Matters — listed entities); Companies Act 2017 s.246 (auditor's report content); SECP Listed Companies (Code of Corporate Governance) Regulations 2019; ICAP Auditor's Report Format (2023)",
    procedures: [
      "1. Confirm the audit report format complies with the latest ICAP-prescribed format for the entity type (listed, unlisted, SMC, etc.).",
      "2. Draft the Opinion paragraph: state the true and fair view opinion per ISA 700 para. 26; reference both IFRS/AFRS and Companies Act 2017.",
      "3. Draft the Basis for Opinion paragraph: confirm audit conducted per ISAs as adopted by ICAP; independence confirmed per ICAP Code of Ethics.",
      "4. For listed entities: draft Key Audit Matters section per ISA 701 — identify matters of most significance, describe audit response, reference relevant FS disclosures.",
      "5. Draft the responsibilities section for Management and TCWG per ISA 700 para. 33–38.",
      "6. Draft the Auditor's Responsibilities section per ISA 700 para. 40–43.",
      "7. Include Other Reporting Requirements per Companies Act 2017 s.246: maintenance of proper books, physical verification of assets, related party transactions at arm's length, compliance with SECP requirements.",
      "8. Include Reporting under Code of Corporate Governance (for listed entities): Internal audit effectiveness, audit committee, CFO certification.",
      "9. Confirm report is signed by the engagement partner in their name and the firm's name per ICAP requirements.",
      "10. Confirm report is dated the same date as the management representation letter and subsequent events review.",
    ],
    conclusionTemplate: "Audit report dated [DATE] prepared in compliance with ISA 700 and Companies Act 2017. Opinion: [UNMODIFIED]. KAMs (if listed): [LIST]. Report signed by [PARTNER NAME] (ICAP ACA/FCA No. [X]) on behalf of [FIRM NAME].",
    reviewers: ["Engagement Partner", "EQCR Partner (listed entities)"],
  },
  "O1": {
    objective: "Conduct Engagement Quality Control Review (EQCR) of significant judgments, audit opinion, and key working papers by an independent reviewer per ISQM 1 and ISA 220.",
    legalRef: "ISQM 1 (ICAP Adopted 2022) para. 43–46; ISA 220 (Revised) para. 30–33; ICAP Quality Assurance Department (QAD) Regulations; SECP Listed Companies Regulations (mandatory EQCR for listed audits)",
    procedures: [
      "1. Confirm EQCR reviewer is independent: no involvement in the engagement during the audit period; qualified and experienced in the sector.",
      "2. EQCR reviewer to read and evaluate significant judgments: materiality, significant risks, fraud assessment, going concern conclusion.",
      "3. EQCR reviewer to review audit report and KAMs (if listed): confirm appropriateness of opinion and KAM description.",
      "4. EQCR reviewer to review documentation of significant matters: estimates, related parties, subsequent events, management representations.",
      "5. EQCR reviewer to confirm independence of engagement team and compliance with ethical requirements.",
      "6. EQCR reviewer to assess whether the engagement partner has appropriately documented their conclusions.",
      "7. Document all EQCR findings; confirm engagement partner has addressed all findings before report issuance.",
      "8. EQCR reviewer to sign EQCR completion form before audit report is issued.",
    ],
    conclusionTemplate: "EQCR completed by [REVIEWER NAME] on [DATE]. EQCR findings: [NIL / LIST]. All findings addressed. EQCR sign-off obtained. Audit report cleared for issuance.",
    reviewers: ["EQCR Partner / Designated EQCR Reviewer"],
  },
  "P1": {
    objective: "Complete the assembly of the audit file within the required timeframe, ensure all documents are properly indexed and cross-referenced, and confirm the file is complete per ISA 230.",
    legalRef: "ISA 230 para. 14–16; ISQM 1 para. 47–50; ICAP Quality Assurance Standards; ICAP Practice Monitoring Guide; Companies Act 2017 (record retention requirements)",
    procedures: [
      "1. Confirm file assembly is completed within 60 days of the audit report date per ISA 230 para. 14.",
      "2. Verify all working papers are present: permanent file, planning section, execution section (all areas), completion section.",
      "3. Confirm all documents are properly indexed per the firm's file indexing system.",
      "4. Verify all cross-references are correct and all referenced documents are present in the file.",
      "5. Confirm all working papers have preparer and reviewer sign-offs with dates.",
      "6. Ensure management representation letter, audit report, and signed financial statements are in the file.",
      "7. Confirm the final signed and stamped copy of financial statements (Companies Act 2017 compliant) is filed.",
      "8. Restrict file access after assembly: only authorised personnel can access or modify the file during the 7-year retention period per ICAP/ISQM 1.",
      "9. Record assembly completion date in audit log; confirm archiving is in secure location (physical or electronic).",
    ],
    conclusionTemplate: "Audit file for [CLIENT NAME] year ended [DATE] assembled and archived on [DATE] (within 60 days of report date [REPORT DATE]). File is complete, indexed, and access-restricted. Retention period: 7 years (until [YEAR]).",
    reviewers: ["Engagement Manager", "Engagement Partner"],
  },
};

// ─── Fallback procedure generator based on category/type ─────────────────────
function getWpProcedures(wp: WpItem): WpProcedureContent {
  if (WP_PROCEDURES_MAP[wp.code]) return WP_PROCEDURES_MAP[wp.code];
  const cat = wp.category;
  const type = wp.type;
  const base = {
    reviewers: ["Engagement Senior", "Engagement Manager", "Engagement Partner"],
    conclusionTemplate: `${wp.label} procedures completed for [CLIENT NAME] year ended [DATE]. All procedures performed satisfactorily. Conclusion: [SATISFACTORY / EXCEPTIONS NOTED — see findings section].`,
  };
  if (cat === "pre_planning" || type === "planning") return { ...base,
    objective: `Complete ${wp.label} to ensure the engagement is appropriately planned and documented per ${wp.isa} and ICAP Quality Assurance standards.`,
    legalRef: `${wp.isa}; ISQM 1 (ICAP 2022); ISA 220; ICAP Code of Ethics (2020); Companies Act 2017`,
    procedures: [
      `1. Obtain and review all relevant documentation: entity registration, SECP filings, prior year audit file, and regulatory correspondence.`,
      `2. Identify and document the scope of the engagement per ${wp.isa} requirements.`,
      `3. Confirm team competency and availability; assign roles and responsibilities.`,
      `4. Identify risks relevant to ${wp.label}: entity-specific, industry, and regulatory risks in Pakistan context.`,
      `5. Document findings, obtain management/partner approval, and file in permanent/planning section.`,
    ],
  };
  if (cat === "risk") return { ...base,
    objective: `Identify, assess, and respond to risks of material misstatement relevant to ${wp.label} per ${wp.isa}.`,
    legalRef: `${wp.isa}; ISA 315 (Revised 2019); ISA 330; Companies Act 2017; FBR Tax Laws; SECP Regulations`,
    procedures: [
      `1. Identify risk factors specific to ${wp.label} through inquiry, observation, and analytical procedures.`,
      `2. Assess inherent risk at assertion level per ISA 315 (Revised 2019) Inherent Risk Factors.`,
      `3. Evaluate relevant controls; assess control risk and determine audit response.`,
      `4. Document identified significant risks with specific planned responses per ISA 330.`,
      `5. Update risk assessment throughout the audit as new information emerges.`,
      `6. Report significant findings to management and those charged with governance per ISA 260.`,
    ],
  };
  if (cat === "analytical") return { ...base,
    objective: `Perform analytical procedures for ${wp.label} to identify unusual relationships, fluctuations, and areas requiring audit attention per ${wp.isa}.`,
    legalRef: `${wp.isa}; ISA 315; ISA 520; ICAP Technical Guidance; Pakistan industry benchmarks (SBP, PSX)`,
    procedures: [
      `1. Obtain relevant financial data: current year actuals, prior year comparatives, budget, and industry benchmarks.`,
      `2. Compute key ratios and metrics relevant to ${wp.label}; compare to expectations.`,
      `3. Identify all significant fluctuations (>20% or >performance materiality); obtain management explanations.`,
      `4. Assess plausibility of management explanations against audit knowledge of the entity and Pakistan market conditions.`,
      `5. Update audit response for areas where explanations are not satisfactory; perform additional procedures.`,
      `6. Document analytical procedures performed and conclusions reached.`,
    ],
  };
  if (cat === "controls") return { ...base,
    objective: `Evaluate the design and implementation (and operating effectiveness where reliance planned) of controls relevant to ${wp.label} per ${wp.isa}.`,
    legalRef: `${wp.isa}; ISA 315 (Revised 2019); ISA 330 para. 8–17; ISA 265; SECP Code of Corporate Governance (listed entities)`,
    procedures: [
      `1. Identify relevant controls for the ${wp.label} cycle through inquiry and observation.`,
      `2. Perform walkthrough: trace 1–2 transactions through the entire cycle from initiation to reporting.`,
      `3. Evaluate design effectiveness: assess whether the control, if operating effectively, would prevent or detect material misstatement.`,
      `4. Assess implementation: confirm the control has been placed in operation.`,
      `5. If reliance planned: test operating effectiveness — obtain sample (25–60 items depending on frequency) and test each item.`,
      `6. Document control deficiencies, significant deficiencies, and material weaknesses; report per ISA 265.`,
    ],
  };
  if (["substantive_assets","substantive_liab","substantive_pl"].includes(cat)) return { ...base,
    objective: `Obtain sufficient appropriate audit evidence over ${wp.label} through substantive procedures per ${wp.isa} and applicable IFRS/IAS standards.`,
    legalRef: `${wp.isa}; ISA 500; ISA 501; ISA 505; ISA 530; Companies Act 2017 (Fourth Schedule disclosure); Applicable IFRS/IAS`,
    procedures: [
      `1. Obtain schedule/listing from management; agree to trial balance and financial statements.`,
      `2. Agree opening balance to prior year audited financial statements and audit file.`,
      `3. Perform test of details on additions, movements, and closing balance per sampling plan.`,
      `4. Vouch sample transactions to supporting documents: invoices, contracts, bank statements, approvals.`,
      `5. Test relevant assertions: existence/occurrence, completeness, accuracy, valuation, cut-off, rights & obligations.`,
      `6. Perform analytical review on the balance/transactions; investigate significant unexpected movements.`,
      `7. Confirm proper disclosure in notes per applicable IFRS/IAS and Companies Act 2017 Fourth Schedule.`,
      `8. Document all exceptions, findings, and management responses.`,
    ],
  };
  if (cat === "tax") return { ...base,
    objective: `Verify ${wp.label} compliance with applicable Pakistani tax laws and ensure accurate accounting and disclosure.`,
    legalRef: `${wp.isa}; ITO 2001 (as amended by Finance Acts); Sales Tax Act 1990; WHT Rules; FBR IRIS Records; IAS 12; Companies Act 2017`,
    procedures: [
      `1. Obtain tax computations and reconcile to accounting profit; agree to financial statements.`,
      `2. Verify applicable rates and computations per ITO 2001 and latest Finance Act provisions.`,
      `3. Reconcile tax payments and deposits to FBR IRIS portal records.`,
      `4. Review FBR notices, assessment orders, and pending matters; assess provision adequacy.`,
      `5. Confirm proper disclosure in FS: current tax, deferred tax, tax contingencies per IAS 12 and IAS 37.`,
    ],
  };
  if (["completion","reporting","quality"].includes(type)) return { ...base,
    objective: `Complete ${wp.label} to ensure the audit is concluded appropriately and all reporting/quality requirements are met per ${wp.isa}.`,
    legalRef: `${wp.isa}; ISA 220; ISA 700; ISQM 1; ISA 230; Companies Act 2017 (audit report and archiving requirements)`,
    procedures: [
      `1. Perform all required ${type} procedures per ${wp.isa}.`,
      `2. Review documentation for completeness and accuracy of conclusions.`,
      `3. Confirm sign-off hierarchy: preparer, reviewer, manager, partner as appropriate.`,
      `4. Obtain required management confirmations or written representations.`,
      `5. Document conclusion and ensure filed in correct section of audit file.`,
    ],
  };
  return { ...base,
    objective: `Perform ${wp.label} procedures per ${wp.isa} for the audit of [CLIENT NAME].`,
    legalRef: `${wp.isa}; ISA 500; Companies Act 2017; ICAP Standards`,
    procedures: [
      `1. Plan and document the approach for ${wp.label}.`,
      `2. Obtain relevant information from management and third parties.`,
      `3. Perform required procedures per ${wp.isa}.`,
      `4. Document findings, exceptions, and conclusions.`,
      `5. Obtain sign-off from appropriate review level.`,
    ],
  };
}

// ─── Smart Auto-Selection Rules ────────────────────────────────────────────────
// Selects: mandatory + high-risk + all material FS-head (F/G/H) +
//          all compliance-critical (I/K) + all completion/reporting essentials
function isSmartDefault(wp: WpItem): boolean {
  if (wp.mandatory) return true;
  if (wp.risk === "high") return true;
  if (["substantive_assets","substantive_liab","substantive_pl"].includes(wp.category)) return true;
  if (["tax","related_party"].includes(wp.category)) return true;
  if (["completion","reporting","quality"].includes(wp.type)) return true;
  return false;
}
const SMART_DEFAULT_CODES = new Set(DEFAULT_WP_ITEMS.filter(isSmartDefault).map(w => w.code));

function WpListingStage({ heads, wpTriggers, session, loading, onEvaluateTriggers, onRefresh, onNext }: any) {
  const { toast } = useToast();
  const allTriggers: any[]  = wpTriggers || [];
  const allHeads: any[]     = heads || [];
  const mandatoryCodes      = new Set(DEFAULT_WP_ITEMS.filter(w => w.mandatory).map(w => w.code));

  const [selected, setSelected]       = useState<Set<string>>(() => new Set(SMART_DEFAULT_CODES));
  const [evaluated, setEvaluated]     = useState(allTriggers.some((t: any) => t.triggered));
  const [evaluating, setEvaluating]   = useState(false);
  const [search, setSearch]           = useState("");
  const [fPhase, setFPhase]           = useState("all");
  const [fType, setFType]             = useState("all");
  const [fRisk, setFRisk]             = useState("all");
  const [fComplexity, setFComplexity] = useState("all");
  const [fStatus, setFStatus]         = useState("all"); // all | mandatory | ai_recommended | optional | selected | unselected
  const [preview, setPreview]         = useState<WpItem | null>(null);
  const [collapsed, setCollapsed]     = useState<Set<string>>(new Set());

  const triggeredCodes = new Set(allTriggers.filter((t: any) => t.triggered).map((t: any) => t.wpCode));
  const triggerConf: Record<string, number> = {};
  allTriggers.forEach((t: any) => { if (t.triggered && t.wpCode) triggerConf[t.wpCode] = t.confidence || 75; });

  const handleEvaluate = async () => {
    setEvaluating(true);
    await onEvaluateTriggers?.();
    await onRefresh?.();
    const newSel = new Set<string>(SMART_DEFAULT_CODES);
    for (const t of allTriggers) { if (t.triggered && t.wpCode) newSel.add(t.wpCode); }
    setSelected(newSel);
    setEvaluated(true);
    setEvaluating(false);
  };

  useEffect(() => {
    if (allTriggers.some((t: any) => t.triggered)) {
      setEvaluated(true);
      setSelected(prev => {
        const n = new Set(prev);
        allTriggers.filter((t: any) => t.triggered && t.wpCode).forEach((t: any) => n.add(t.wpCode));
        return n;
      });
    }
  }, [allTriggers.length]);

  const toggle = (code: string, isMandatory: boolean) => {
    if (isMandatory) return;
    setSelected(prev => { const n = new Set(prev); n.has(code) ? n.delete(code) : n.add(code); return n; });
  };

  const toggleCategory = (cat: string, items: WpItem[]) => {
    const nonMandatory = items.filter(w => !w.mandatory).map(w => w.code);
    const allSel = nonMandatory.every(c => selected.has(c));
    setSelected(prev => {
      const n = new Set(prev);
      nonMandatory.forEach(c => allSel ? n.delete(c) : n.add(c));
      return n;
    });
  };

  const toggleCollapse = (cat: string) => setCollapsed(prev => {
    const n = new Set(prev); n.has(cat) ? n.delete(cat) : n.add(cat); return n;
  });

  // Apply filters
  const phases = Array.from(new Set(DEFAULT_WP_ITEMS.map(w => w.phase)));

  const filterWp = (wp: WpItem) => {
    if (search) {
      const s = search.toLowerCase();
      if (!wp.label.toLowerCase().includes(s) && !wp.code.toLowerCase().includes(s) && !wp.isa.toLowerCase().includes(s) && !wp.description.toLowerCase().includes(s)) return false;
    }
    if (fPhase !== "all" && wp.phase !== fPhase) return false;
    if (fType !== "all" && wp.type !== fType) return false;
    if (fRisk !== "all") {
      if (fRisk === "high" && wp.risk !== "high") return false;
      if (fRisk === "medium" && !["medium","high"].includes(wp.risk)) return false;
    }
    if (fComplexity !== "all" && wp.complexity !== fComplexity) return false;
    if (fStatus === "mandatory" && !wp.mandatory) return false;
    if (fStatus === "ai_recommended" && !triggeredCodes.has(wp.code)) return false;
    if (fStatus === "optional" && (wp.mandatory || triggeredCodes.has(wp.code))) return false;
    if (fStatus === "selected" && !selected.has(wp.code)) return false;
    if (fStatus === "unselected" && selected.has(wp.code)) return false;
    return true;
  };

  const filteredAll = DEFAULT_WP_ITEMS.filter(filterWp);
  const grouped = Object.keys(WP_CATEGORY_LABELS).map(cat => ({
    cat, label: WP_CATEGORY_LABELS[cat],
    items: filteredAll.filter(w => w.category === cat),
    allItems: DEFAULT_WP_ITEMS.filter(w => w.category === cat),
  })).filter(g => g.items.length > 0);

  const selectedCount    = selected.size;
  const mandatoryCount   = DEFAULT_WP_ITEMS.filter(w => w.mandatory).length;
  const triggeredCount   = DEFAULT_WP_ITEMS.filter(w => triggeredCodes.has(w.code) && !w.mandatory).length;
  const optionalCount    = DEFAULT_WP_ITEMS.filter(w => !w.mandatory && !triggeredCodes.has(w.code)).length;

  const applyAiRecommendations = () => {
    const n = new Set<string>(SMART_DEFAULT_CODES);
    triggeredCodes.forEach(c => n.add(c));
    setSelected(n);
  };

  const resetToSmartDefault = () => setSelected(new Set(SMART_DEFAULT_CODES));
  const selectAll = () => setSelected(new Set(DEFAULT_WP_ITEMS.map(w => w.code)));

  // ── Download All Templates as Excel Workbook ────────────────────────────────
  const [downloadingTemplates, setDownloadingTemplates] = useState(false);
  const downloadAllTemplates = () => {
    setDownloadingTemplates(true);
    try {
      const wb = XLSX.utils.book_new();

      // ── Cover Sheet ─────────────────────────────────────────────────────────
      const coverData = [
        ["AuditWise — Working Paper Template Pack"],
        ["Pakistan ISA / ISQM / ICAP / Companies Act 2017 Compliant"],
        [""],
        ["Generated on", new Date().toLocaleDateString("en-PK", { day:"2-digit", month:"long", year:"numeric" })],
        ["Total Templates", DEFAULT_WP_ITEMS.length.toString()],
        ["Sections", "A through Q (17 sections)"],
        ["Standards", "ISAs as adopted by ICAP, ISQM 1, IFRS, ITO 2001, Sales Tax Act 1990, Companies Act 2017"],
        [""],
        ["SECTION", "LABEL", "TEMPLATES"],
        ...Object.entries(WP_CATEGORY_LABELS).map(([cat, label]) => {
          const count = DEFAULT_WP_ITEMS.filter(w => w.category === cat).length;
          const sampleCode = DEFAULT_WP_ITEMS.find(w => w.category === cat)?.code ?? "";
          return [sampleCode.replace(/\d+/, ""), label, count.toString()];
        }),
      ];
      const wsCover = XLSX.utils.aoa_to_sheet(coverData);
      wsCover["!cols"] = [{ wch: 10 }, { wch: 52 }, { wch: 12 }];
      XLSX.utils.book_append_sheet(wb, wsCover, "Cover");

      // ── One sheet per section ────────────────────────────────────────────────
      const headers = [
        "Code", "Working Paper Title", "ISA / Standard Reference",
        "Phase", "Risk", "Output Type", "Complexity", "Mandatory",
        "Assertions Covered",
        "Audit Objective",
        "Pakistan Legal & Standards Framework",
        "Audit Procedures",
        "Conclusion Template",
        "Sign-Off Hierarchy",
      ];

      const sectionLetters: Record<string, string> = {
        pre_planning:       "A",  planning:           "B",
        risk:               "C",  analytical:         "D",
        controls:           "E",  substantive_assets: "F",
        substantive_liab:   "G",  substantive_pl:     "H",
        tax:                "I",  estimates:          "J",
        related_party:      "K",  evidence:           "L",
        completion:         "M",  reporting:          "N",
        quality:            "O",  archiving:          "P",
        specialized:        "Q",
      };

      Object.entries(WP_CATEGORY_LABELS).forEach(([cat, catLabel]) => {
        const items = DEFAULT_WP_ITEMS.filter(w => w.category === cat);
        if (!items.length) return;
        const sec = sectionLetters[cat] ?? cat;
        const rows: (string | number)[][] = [headers];
        items.forEach(wp => {
          const pc = getWpProcedures(wp);
          rows.push([
            wp.code,
            wp.label,
            wp.isa,
            wp.phase,
            wp.risk ?? "low",
            wp.outputType,
            wp.complexity,
            wp.mandatory ? "Yes" : "No",
            wp.assertions.join(", "),
            pc.objective,
            pc.legalRef,
            pc.procedures.join("\n"),
            pc.conclusionTemplate,
            pc.reviewers.join(" → "),
          ]);
        });
        const ws = XLSX.utils.aoa_to_sheet(rows);
        ws["!cols"] = [
          { wch: 7 }, { wch: 45 }, { wch: 30 }, { wch: 18 }, { wch: 8 },
          { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 38 },
          { wch: 55 }, { wch: 55 }, { wch: 80 }, { wch: 60 }, { wch: 45 },
        ];
        // Style header row bold
        headers.forEach((_h, ci) => {
          const cellRef = XLSX.utils.encode_cell({ r: 0, c: ci });
          if (ws[cellRef]) ws[cellRef].s = { font: { bold: true } };
        });
        const sheetName = `${sec} - ${catLabel.split("—")[0].trim()}`.slice(0, 31);
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
      });

      // ── All Templates flat sheet ─────────────────────────────────────────────
      const allRows: (string | number)[][] = [headers];
      DEFAULT_WP_ITEMS.forEach(wp => {
        const pc = getWpProcedures(wp);
        allRows.push([
          wp.code, wp.label, wp.isa, wp.phase, wp.risk ?? "low",
          wp.outputType, wp.complexity, wp.mandatory ? "Yes" : "No",
          wp.assertions.join(", "),
          pc.objective, pc.legalRef,
          pc.procedures.join("\n"),
          pc.conclusionTemplate, pc.reviewers.join(" → "),
        ]);
      });
      const wsAll = XLSX.utils.aoa_to_sheet(allRows);
      wsAll["!cols"] = [
        { wch: 7 }, { wch: 45 }, { wch: 30 }, { wch: 18 }, { wch: 8 },
        { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 38 },
        { wch: 55 }, { wch: 55 }, { wch: 80 }, { wch: 60 }, { wch: 45 },
      ];
      XLSX.utils.book_append_sheet(wb, wsAll, "All Templates");

      const dateStr = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `AuditWise_WP_Templates_${dateStr}.xlsx`);
      toast({ title: "Templates downloaded", description: `${DEFAULT_WP_ITEMS.length} templates across 17 sections exported to Excel.` });
    } catch (e) {
      toast({ title: "Download failed", description: String(e), variant: "destructive" });
    } finally {
      setDownloadingTemplates(false);
    }
  };

  return (
    <div className="space-y-4">

      {/* ── Hero Header ── */}
      <div className="bg-gradient-to-r from-indigo-700 to-violet-800 rounded-2xl p-5 text-white shadow-lg">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
            <ClipboardList className="w-6 h-6 text-indigo-200" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold">Working Paper Template Library</h2>
            <p className="text-sm text-indigo-100 mt-0.5 leading-relaxed">
              {DEFAULT_WP_ITEMS.length} ISA/ISQM-compliant templates across {Object.keys(WP_CATEGORY_LABELS).length} audit phases.
              AI evaluates your engagement context, risk profile, TB, GL, and entity type to recommend the optimal template set.
              Mandatory templates are pre-selected. Review AI recommendations, add or remove any optional templates, then proceed to generation.
            </p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {["ISA/ISQM 1 Compliant","Pakistan FBR/SECP","Materiality-Driven","Risk-Based","ICAP Standards","Companies Act 2017"].map(t => (
                <span key={t} className="text-[10px] px-2 py-0.5 bg-white/10 border border-white/20 rounded-full text-indigo-100">{t}</span>
              ))}
            </div>
          </div>
          <Button onClick={handleEvaluate} disabled={evaluating || loading}
            className="shrink-0 bg-white text-indigo-800 hover:bg-indigo-50 font-semibold shadow-sm">
            {evaluating
              ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Analysing…</>
              : <><Sparkles className="w-4 h-4 mr-2" />AI Recommend</>}
          </Button>
        </div>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
        {[
          { label:"Library Total",    value:DEFAULT_WP_ITEMS.length, color:"slate",   sub:"templates available",          onClick:() => { setFStatus("all"); setSearch(""); } },
          { label:"Smart Default",     value:SMART_DEFAULT_CODES.size, color:"blue",    sub:"mandatory + FS heads + tax",   onClick:() => setFStatus("mandatory") },
          { label:"AI Recommended",   value:triggeredCount,           color:"violet",  sub:evaluated?"from AI analysis":"click AI Recommend",  onClick:() => setFStatus("ai_recommended") },
          { label:"Optional",         value:optionalCount,            color:"amber",   sub:"user discretion",              onClick:() => setFStatus("optional") },
          { label:"Selected",         value:selectedCount,            color:"emerald", sub:"will be generated",            onClick:() => setFStatus("selected") },
        ].map(s => (
          <button key={s.label} onClick={s.onClick} className={cn(
            "bg-white border rounded-xl p-3 text-center transition-all hover:shadow-sm cursor-pointer",
            fStatus === (s.label==="Library Total"?"all":s.label==="Mandatory"?"mandatory":s.label==="AI Recommended"?"ai_recommended":s.label==="Optional"?"optional":"selected")
              ? "ring-2 ring-indigo-400 ring-offset-1 shadow-sm" : "",
            s.color==="blue"?"border-blue-200":s.color==="violet"?"border-violet-200":s.color==="emerald"?"border-emerald-200":s.color==="amber"?"border-amber-200":"border-slate-200"
          )}>
            <p className={cn("text-2xl font-bold",
              s.color==="blue"?"text-blue-700":s.color==="violet"?"text-violet-700":s.color==="emerald"?"text-emerald-700":s.color==="amber"?"text-amber-600":"text-slate-800"
            )}>{s.value}</p>
            <p className="text-[10px] text-slate-600 font-semibold mt-0.5">{s.label}</p>
            <p className="text-[9px] text-slate-400">{s.sub}</p>
          </button>
        ))}
      </div>

      {/* ── AI Recommendation Banner (when evaluated) ── */}
      {evaluated && (
        <div className="bg-violet-50 border border-violet-200 rounded-xl px-4 py-3 flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="flex items-start gap-2 flex-1 min-w-0">
            <Sparkles className="w-4 h-4 text-violet-600 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-violet-800">AI analysis complete — {triggeredCount} templates recommended</p>
              <p className="text-[11px] text-violet-600 mt-0.5">
                Based on your engagement profile ({session?.entityType || "entity"}, {session?.reportingFramework || "IFRS"}, {session?.engagementYear || "2024"}), 
                risk indicators, TB structure, and applicable ISA standards.
                {mandatoryCodes.size} mandatory + {triggeredCount} AI-recommended = {mandatoryCodes.size + triggeredCount} templates.
              </p>
            </div>
          </div>
          <Button size="sm" onClick={applyAiRecommendations}
            className="shrink-0 bg-violet-600 hover:bg-violet-700 text-white h-8 text-xs shadow-sm">
            <Sparkles className="w-3 h-3 mr-1.5" /> Apply AI Selection
          </Button>
        </div>
      )}

      {/* ── Filter + Search Bar ── */}
      <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 space-y-2.5">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              className="w-full pl-8 pr-3 py-1.5 text-[12px] border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-300"
              placeholder="Search by name, code, ISA standard, description…"
              value={search} onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={resetToSmartDefault}>Smart Default</Button>
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={applyAiRecommendations}>AI Recommended</Button>
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={selectAll}>Select All</Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {/* Phase filter */}
          <select value={fPhase} onChange={e => setFPhase(e.target.value)}
            className="h-7 text-[11px] border border-slate-200 rounded-md px-2 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300">
            <option value="all">All Phases</option>
            {phases.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          {/* Type filter */}
          <select value={fType} onChange={e => setFType(e.target.value)}
            className="h-7 text-[11px] border border-slate-200 rounded-md px-2 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300">
            <option value="all">All Types</option>
            {Object.entries(WP_TYPE_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          {/* Risk filter */}
          <select value={fRisk} onChange={e => setFRisk(e.target.value)}
            className="h-7 text-[11px] border border-slate-200 rounded-md px-2 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300">
            <option value="all">Any Risk</option>
            <option value="high">High Risk</option>
            <option value="medium">Med/High Risk</option>
          </select>
          {/* Complexity filter */}
          <select value={fComplexity} onChange={e => setFComplexity(e.target.value)}
            className="h-7 text-[11px] border border-slate-200 rounded-md px-2 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300">
            <option value="all">Any Complexity</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
          {/* Status filter */}
          <select value={fStatus} onChange={e => setFStatus(e.target.value)}
            className="h-7 text-[11px] border border-slate-200 rounded-md px-2 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300">
            <option value="all">All Status</option>
            <option value="mandatory">Mandatory</option>
            <option value="ai_recommended">AI Recommended</option>
            <option value="optional">Optional</option>
            <option value="selected">Selected</option>
            <option value="unselected">Not Selected</option>
          </select>
          {(search || fPhase!=="all" || fType!=="all" || fRisk!=="all" || fComplexity!=="all" || fStatus!=="all") && (
            <button onClick={() => { setSearch(""); setFPhase("all"); setFType("all"); setFRisk("all"); setFComplexity("all"); setFStatus("all"); }}
              className="h-7 px-2 text-[11px] text-slate-500 hover:text-red-600 border border-slate-200 rounded-md bg-white flex items-center gap-1">
              <XCircle className="w-3 h-3" /> Clear
            </button>
          )}
          <span className="ml-auto self-center text-[11px] text-slate-400">{filteredAll.length} of {DEFAULT_WP_ITEMS.length} shown · {selectedCount} selected</span>
        </div>
      </div>

      {/* ── WP List ── */}
      <div className="space-y-2.5">
        {grouped.map(({ cat, label: catLabel, items, allItems }) => {
          const catSelected = allItems.filter(w => selected.has(w.code)).length;
          const catNonMandatory = allItems.filter(w => !w.mandatory);
          const catAllNonMandSel = catNonMandatory.length > 0 && catNonMandatory.every(w => selected.has(w.code));
          const isCollapsed = collapsed.has(cat);
          return (
            <div key={cat} className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
              {/* Category header */}
              <div className="bg-gradient-to-r from-slate-50 to-indigo-50/30 px-4 py-2.5 border-b border-slate-100 flex items-center justify-between">
                <button onClick={() => toggleCollapse(cat)} className="flex items-center gap-2 flex-1 min-w-0 text-left">
                  <ChevronDown className={cn("w-3.5 h-3.5 text-slate-400 transition-transform shrink-0", isCollapsed && "-rotate-90")} />
                  <span className="text-[12px] font-semibold text-slate-700 truncate">{catLabel}</span>
                  <span className="text-[10px] text-slate-400 shrink-0 ml-1">{catSelected}/{allItems.length}</span>
                </button>
                {catNonMandatory.length > 0 && (
                  <button
                    onClick={() => toggleCategory(cat, allItems)}
                    className="text-[10px] text-indigo-600 hover:text-indigo-800 font-semibold shrink-0 ml-3 px-2 py-0.5 rounded border border-indigo-200 hover:bg-indigo-50"
                  >
                    {catAllNonMandSel ? "Deselect All" : "Select All"}
                  </button>
                )}
              </div>

              {!isCollapsed && (
                <div className="divide-y divide-slate-50">
                  {items.map(wp => {
                    const isSelected  = selected.has(wp.code);
                    const isTriggered = triggeredCodes.has(wp.code);
                    const conf        = triggerConf[wp.code];
                    const hasHead     = allHeads.some((h: any) => ["generated","approved","completed","exported"].includes(h.status));
                    const selectionType: "mandatory" | "ai" | "manual" | "none" =
                      wp.mandatory ? "mandatory" : isTriggered && isSelected ? "ai" : isSelected ? "manual" : "none";

                    return (
                      <div
                        key={wp.code}
                        className={cn(
                          "group flex items-start gap-3 px-4 py-3 transition-colors relative",
                          wp.mandatory ? "cursor-default" : "cursor-pointer hover:bg-slate-50/80",
                          isSelected  ? (selectionType==="ai" ? "bg-violet-50/30" : selectionType==="mandatory" ? "bg-blue-50/20" : "bg-emerald-50/20") : ""
                        )}
                      >
                        {/* Left accent bar */}
                        <div className={cn(
                          "absolute left-0 top-0 bottom-0 w-0.5",
                          selectionType==="mandatory" ? "bg-blue-400" :
                          selectionType==="ai"        ? "bg-violet-400" :
                          selectionType==="manual"    ? "bg-emerald-400" : "bg-transparent"
                        )} />

                        {/* Checkbox */}
                        <div
                          onClick={() => toggle(wp.code, wp.mandatory)}
                          className={cn(
                            "w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all",
                            isSelected
                              ? selectionType==="mandatory" ? "bg-blue-500 border-blue-500"
                              : selectionType==="ai"        ? "bg-violet-500 border-violet-500"
                              : "bg-emerald-500 border-emerald-500"
                              : "border-slate-300 bg-white hover:border-indigo-400",
                            wp.mandatory ? "opacity-80" : ""
                          )}>
                          {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                        </div>

                        {/* Main content */}
                        <div className="flex-1 min-w-0" onClick={() => toggle(wp.code, wp.mandatory)}>
                          <div className="flex items-start gap-2 flex-wrap">
                            <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded font-mono shrink-0">{wp.code}</span>
                            <span className="text-[13px] font-semibold text-slate-800 leading-tight">{wp.label}</span>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-1 leading-relaxed line-clamp-2">{wp.description}</p>

                          {/* Meta row */}
                          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                            <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase", WP_TYPE_COLORS[wp.type] || "bg-slate-100 text-slate-600 border-slate-200")}>
                              {WP_TYPE_LABELS[wp.type] || wp.type}
                            </span>
                            <span className={cn("text-[9px] font-semibold px-1.5 py-0.5 rounded-full uppercase", COMPLEXITY_COLORS[wp.complexity])}>
                              {wp.complexity} complexity
                            </span>
                            <span className="text-[9px] text-slate-400 font-mono bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200">{wp.isa}</span>
                            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200">
                              {OUTPUT_ICONS[wp.outputType] || wp.outputType}
                            </span>
                            {wp.assertions.slice(0,3).map(a => (
                              <span key={a} className="text-[9px] px-1 py-0.5 rounded bg-indigo-50 text-indigo-500 border border-indigo-100 capitalize">{a}</span>
                            ))}
                          </div>
                        </div>

                        {/* Right badges */}
                        <div className="flex flex-col items-end gap-1.5 shrink-0">
                          {wp.mandatory && (
                            <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200 uppercase whitespace-nowrap">Required</span>
                          )}
                          {isTriggered && !wp.mandatory && (
                            <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 border border-violet-200 flex items-center gap-1 uppercase whitespace-nowrap">
                              <Sparkles className="w-2.5 h-2.5" /> AI {conf ? `${conf}%` : ""}
                            </span>
                          )}
                          {isSelected && !wp.mandatory && !isTriggered && (
                            <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200 uppercase whitespace-nowrap">Manual</span>
                          )}
                          {hasHead && (
                            <span className="text-[9px] font-semibold px-2 py-0.5 rounded-full bg-teal-100 text-teal-700 border border-teal-200 uppercase whitespace-nowrap">✓ Generated</span>
                          )}
                          {/* Preview button */}
                          <button
                            onClick={e => { e.stopPropagation(); setPreview(preview?.code === wp.code ? null : wp); }}
                            className="text-[9px] text-slate-400 hover:text-indigo-600 underline underline-offset-2 mt-0.5"
                          >
                            {preview?.code === wp.code ? "Hide" : "Preview"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
        {filteredAll.length === 0 && (
          <div className="bg-white border border-slate-200 rounded-xl px-6 py-10 text-center text-slate-400">
            <Search className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No templates match your filters.</p>
            <button onClick={() => { setSearch(""); setFPhase("all"); setFType("all"); setFRisk("all"); setFComplexity("all"); setFStatus("all"); }}
              className="mt-2 text-xs text-indigo-600 hover:underline">Clear all filters</button>
          </div>
        )}
      </div>

      {/* ── WP Preview Modal (portal → always above sidebar) ── */}
      {preview && (() => {
        const pc = getWpProcedures(preview);
        return createPortal(
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" style={{background:"rgba(15,23,42,0.72)"}}>
          {/* Backdrop */}
          <div className="absolute inset-0" onClick={() => setPreview(null)} />
          {/* Modal Card */}
          <div className="relative bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col w-full max-w-2xl max-h-[90vh]">
          {/* Header */}
          <div className="bg-gradient-to-r from-indigo-700 to-violet-800 px-5 py-4 text-white shrink-0">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="text-[11px] font-bold bg-white/20 border border-white/30 px-2 py-0.5 rounded font-mono">{preview.code}</span>
                  {preview.mandatory && <span className="text-[10px] bg-red-500/80 border border-red-300/40 px-2 py-0.5 rounded font-semibold">MANDATORY</span>}
                  <span className={cn("text-[10px] px-2 py-0.5 rounded font-semibold border border-white/20",
                    preview.risk==="high" ? "bg-red-400/50" : preview.risk==="medium" ? "bg-amber-400/50" : "bg-emerald-400/50")}>
                    {preview.risk?.toUpperCase()} RISK
                  </span>
                  <span className="text-[10px] bg-white/15 border border-white/20 px-2 py-0.5 rounded">{preview.outputType.toUpperCase()}</span>
                </div>
                <h3 className="text-sm font-bold leading-snug">{preview.label}</h3>
                <p className="text-[11px] text-indigo-200 mt-0.5 line-clamp-2">{preview.description}</p>
              </div>
              <button onClick={() => setPreview(null)} className="text-white/60 hover:text-white shrink-0 mt-0.5">
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            {/* Meta row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
              {[
                ["ISA Reference", preview.isa],
                ["Phase", preview.phase],
                ["Complexity", preview.complexity.charAt(0).toUpperCase() + preview.complexity.slice(1)],
                ["Assertions", preview.assertions.slice(0,3).join(", ") + (preview.assertions.length > 3 ? "…" : "")],
              ].map(([k,v]) => (
                <div key={k} className="bg-white/10 rounded-lg p-2">
                  <p className="text-[9px] text-indigo-300 font-semibold uppercase tracking-wide">{k}</p>
                  <p className="text-[11px] font-semibold text-white mt-0.5 leading-tight">{v}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Body — scrollable */}
          <div className="p-5 space-y-4 overflow-y-auto flex-1">

            {/* Legal Reference */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
              <div className="flex items-start gap-2">
                <span className="text-amber-600 mt-0.5 shrink-0">⚖️</span>
                <div>
                  <p className="text-[10px] font-bold text-amber-700 uppercase tracking-wide mb-0.5">Pakistan Legal & Standards Framework</p>
                  <p className="text-[11px] text-amber-800 leading-relaxed">{pc.legalRef}</p>
                </div>
              </div>
            </div>

            {/* Audit Objective */}
            <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3">
              <p className="text-[10px] font-bold text-indigo-700 uppercase tracking-wide mb-1">Audit Objective</p>
              <p className="text-[12px] text-indigo-900 leading-relaxed">{pc.objective}</p>
            </div>

            {/* Audit Procedures */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-1 h-4 bg-indigo-600 rounded-full" />
                <p className="text-[11px] font-bold text-slate-700 uppercase tracking-wide">Audit Procedures</p>
                <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{pc.procedures.length} steps</span>
              </div>
              <div className="space-y-1.5">
                {pc.procedures.map((proc, i) => (
                  <div key={i} className="flex items-start gap-2.5 bg-slate-50 hover:bg-slate-100 rounded-lg px-3 py-2 transition-colors group">
                    <div className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5 group-hover:bg-indigo-200">
                      {i + 1}
                    </div>
                    <p className="text-[11px] text-slate-700 leading-relaxed">{proc.replace(/^\d+\.\s*/, "")}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Document Structure */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-1 h-4 bg-violet-500 rounded-full" />
                <p className="text-[11px] font-bold text-slate-700 uppercase tracking-wide">Working Paper Document Structure</p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 text-[10px] text-slate-600">
                {[
                  "Cover Header & Document Reference",
                  "Engagement & Period Details",
                  "Audit Objective",
                  "Legal & Standards Reference",
                  "Scope, Population & Sampling",
                  "Procedures Performed",
                  ...(preview.outputType.includes("excel") ? ["Sampling Schedule (Excel)", "Test Results Grid"] : ["Evidence Obtained"]),
                  "Findings & Exceptions Log",
                  "Conclusion (ISA-Referenced)",
                  "Preparer Sign-Off & Date",
                  "Reviewer / Manager Sign-Off",
                  "Engagement Partner Approval",
                ].map((s, i) => (
                  <div key={i} className="flex items-start gap-1.5 bg-slate-50 border border-slate-100 rounded px-2 py-1.5">
                    <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0 mt-0.5" />
                    <span className="leading-tight">{s}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Conclusion Template */}
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
              <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-wide mb-1">Conclusion Template</p>
              <p className="text-[11px] text-emerald-900 italic leading-relaxed">"{pc.conclusionTemplate}"</p>
            </div>

            {/* Sign-off Hierarchy */}
            <div className="flex items-start gap-2 bg-slate-50 border border-slate-200 rounded-xl p-3">
              <span className="text-slate-500 mt-0.5 shrink-0 text-sm">✍️</span>
              <div className="flex-1">
                <p className="text-[10px] font-bold text-slate-600 uppercase tracking-wide mb-1.5">Sign-Off Hierarchy</p>
                <div className="flex flex-wrap gap-1.5">
                  {pc.reviewers.map((r, i) => (
                    <span key={i} className="text-[10px] px-2.5 py-1 bg-white border border-slate-200 rounded-full text-slate-700 font-medium flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
                      {r}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Action */}
            <div className="flex gap-2 pt-1">
              <Button size="sm" onClick={() => toggle(preview.code, preview.mandatory)}
                className={cn("h-8 text-xs px-4", selected.has(preview.code) ? "bg-red-50 text-red-600 border-red-200 hover:bg-red-100" : "bg-emerald-600 hover:bg-emerald-700 text-white")}
                variant={selected.has(preview.code) ? "outline" : "default"}>
                {selected.has(preview.code) ? <><XCircle className="w-3 h-3 mr-1" /> Deselect from Pack</> : <><CheckCircle2 className="w-3 h-3 mr-1" /> Add to Audit Pack</>}
              </Button>
              <button onClick={() => setPreview(null)} className="text-[11px] text-slate-400 hover:text-slate-600 px-3 py-1">
                Close
              </button>
            </div>
          </div>
          </div>
        </div>
        , document.body);
      })()}

      {/* ── Proceed Bar ── */}
      <div className="bg-white border border-slate-200 rounded-xl px-5 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            <span>{selectedCount} templates selected</span>
            <span className="text-slate-300">|</span>
            <span className="text-blue-600">{mandatoryCount} mandatory</span>
            {evaluated && <><span className="text-slate-300">|</span><span className="text-violet-600">{triggeredCount} AI recommended</span></>}
          </div>
          <p className="text-[11px] text-slate-400">Required templates cannot be deselected. Templates generate sequentially, section by section, with full sign-off hierarchy.</p>
        </div>
        <div className="flex items-center gap-3 shrink-0 flex-wrap">
          {/* Download All Templates button */}
          <Button
            onClick={downloadAllTemplates}
            disabled={downloadingTemplates}
            size="lg"
            variant="outline"
            className="px-5 border-slate-300 text-slate-700 hover:bg-slate-50 hover:border-indigo-400 hover:text-indigo-700 gap-2"
          >
            {downloadingTemplates
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Preparing…</>
              : <><Download className="w-4 h-4" /> Download All Templates</>}
          </Button>
          <Button
            onClick={onNext}
            disabled={loading || selectedCount === 0}
            size="lg"
            className="px-6 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 shadow-md shadow-indigo-200/40"
          >
            <FileCheck className="w-4 h-4 mr-2" />
            Generate {selectedCount} Working Papers
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Review Stage (no longer in pipeline — kept for reference)
// ─────────────────────────────────────────────────────────────────────────────
function ReviewStage({ heads, session, exceptions, onApprove, onResolveException, onRefresh, onNext, loading }: any) {
  const allHeads = heads || [];
  const generated = allHeads.filter((h: any) => ["generated","approved","exported","completed"].includes(h.status));
  const approved = allHeads.filter((h: any) => ["approved","exported","completed"].includes(h.status));
  const pending = allHeads.filter((h: any) => !["approved","exported","completed"].includes(h.status));
  const openExc = (exceptions || []).filter((e: any) => e.status === "open");
  const reviewPct = allHeads.length > 0 ? Math.round((approved.length / allHeads.length) * 100) : 0;

  const WP_HEADS = [
    "Pre-Engagement & Acceptance","Planning & Strategy","Risk Assessment (ISA 315/240)","Analytical Review (ISA 520)",
    "Internal Controls (ISA 315)","Substantive Procedures","Audit Evidence (ISA 500 Series)",
    "Misstatements (ISA 450)","Completion (ISA 560/570/580)","Reporting (ISA 700 Series)",
    "Quality Control (ISQM 1)","Archiving & Closure",
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="bg-gradient-to-r from-teal-700 to-emerald-800 rounded-2xl p-5 text-white shadow-md">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
            <ClipboardCheck className="w-6 h-6 text-teal-200" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-bold">Review & Approval</h2>
            <p className="text-sm text-teal-100 mt-0.5">
              Review all generated working papers, apply comments, and approve for final output. 
              All WPs must be approved before proceeding to Final Output.
            </p>
          </div>
          <Button onClick={onRefresh} disabled={loading} variant="outline" className="border-white/30 text-white hover:bg-white/10 shrink-0">
            <RefreshCw className="w-4 h-4 mr-2" /> Refresh
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total WPs",        value: allHeads.length || 12,  color: "slate" },
          { label: "Generated",        value: generated.length,        color: "blue" },
          { label: "Approved",         value: approved.length,         color: "emerald" },
          { label: "Review Progress",  value: `${reviewPct}%`,         color: reviewPct === 100 ? "emerald" : "amber" },
        ].map(s => (
          <div key={s.label} className={cn(
            "bg-white border rounded-2xl p-4 text-center shadow-sm",
            s.color === "emerald" ? "border-emerald-200" : s.color === "amber" ? "border-amber-200" : s.color === "blue" ? "border-blue-200" : "border-slate-200"
          )}>
            <p className={cn("text-2xl font-bold",
              s.color === "emerald" ? "text-emerald-700" : s.color === "amber" ? "text-amber-600" : s.color === "blue" ? "text-blue-700" : "text-slate-800"
            )}>{s.value}</p>
            <p className="text-[11px] text-slate-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* WP Review Table */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-slate-50 to-teal-50/20 px-5 py-3 border-b border-slate-200/60">
          <span className="font-semibold text-slate-900 text-sm">Working Papers — Review Status</span>
        </div>
        <div className="divide-y divide-slate-50">
          {WP_HEADS.map((label, idx) => {
            const head = allHeads.find((h: any) => h.headIndex === idx);
            const statusMap: Record<string, { label: string; color: string }> = {
              generated:  { label: "Generated — Pending Review", color: "blue" },
              approved:   { label: "Approved ✓",                  color: "emerald" },
              exported:   { label: "Exported ✓",                  color: "emerald" },
              completed:  { label: "Completed ✓",                 color: "emerald" },
              error:      { label: "Error — Needs Attention",      color: "red" },
              pending:    { label: "Not Yet Generated",            color: "slate" },
            };
            const status = head?.status || "pending";
            const statusInfo = statusMap[status] || statusMap.pending;
            const canApprove = head && head.status === "generated";

            return (
              <div key={idx} className="px-5 py-3 flex items-center gap-4">
                <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                  <span className="text-[10px] font-bold text-slate-500">{String(idx + 1).padStart(2, "0")}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{label}</p>
                  <span className={cn(
                    "inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded mt-0.5",
                    statusInfo.color === "emerald" ? "bg-emerald-100 text-emerald-700" :
                    statusInfo.color === "blue" ? "bg-blue-100 text-blue-700" :
                    statusInfo.color === "red" ? "bg-red-100 text-red-700" :
                    "bg-slate-100 text-slate-500"
                  )}>{statusInfo.label}</span>
                </div>
                {head?.wordCount && <span className="text-[11px] text-slate-400 shrink-0">{head.wordCount.toLocaleString()} words</span>}
                {canApprove && (
                  <Button size="sm" onClick={() => onApprove(idx)} disabled={loading}
                    className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white shrink-0">
                    <CheckCircle2 className="w-3 h-3 mr-1" /> Approve
                  </Button>
                )}
                {!canApprove && head?.status === "approved" && (
                  <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Open Exceptions */}
      {openExc.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <span className="font-semibold text-amber-900 text-sm">{openExc.length} Open Exception{openExc.length !== 1 ? "s" : ""}</span>
          </div>
          <div className="space-y-1.5">
            {openExc.slice(0, 5).map((e: any) => (
              <div key={e.id} className="flex items-center gap-2.5 text-xs">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                <span className="text-amber-900 flex-1 truncate">{e.title}</span>
                <button onClick={() => onResolveException(e.id, "cleared")}
                  className="text-[10px] px-2 py-0.5 rounded bg-amber-200 text-amber-800 hover:bg-amber-300 font-medium">Clear</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Proceed button */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          {reviewPct === 100 && openExc.length === 0
            ? <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
            : <AlertTriangle className="w-6 h-6 text-amber-500 shrink-0" />}
          <div>
            <p className="font-semibold text-slate-900">
              {reviewPct === 100 && openExc.length === 0
                ? "All working papers approved — ready for Final Output"
                : `${approved.length}/${allHeads.length || 12} approved · ${openExc.length} open exception${openExc.length !== 1 ? "s" : ""}`}
            </p>
            <p className="text-sm text-slate-500">
              {reviewPct < 100 ? "Approve all working papers before proceeding." : "Proceed to generate final reconciled outputs."}
            </p>
          </div>
        </div>
        <Button
          onClick={onNext}
          disabled={loading}
          className={cn(
            "font-bold shadow shrink-0",
            reviewPct === 100 && openExc.length === 0
              ? "bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white"
              : "bg-gradient-to-r from-slate-600 to-slate-700 text-white"
          )}
        >
          <Download className="w-4 h-4 mr-2" /> Final Output
        </Button>
      </div>
    </div>
  );
}

function ExportStage({ heads, session, exceptions, onExportHead, onExportBundle, onExportQuick, exportingQuick, onResolveException, onRefresh, loading, downloadingHeads, downloadedHeads }: any) {
  const dlSet: Set<number> = downloadingHeads || new Set();
  const dledSet: Set<number> = downloadedHeads || new Set();
  const completedHeads = (heads || []).filter((h: any) => ["approved", "exported", "completed"].includes(h.status));
  const openExceptions = (exceptions || []).filter((e: any) => e.status === "open");
  const totalHeads = (heads || []).length;
  const exportPct = totalHeads > 0 ? Math.round((completedHeads.length / totalHeads) * 100) : 0;
  const [exportingAll, setExportingAll] = useState(false);

  const exportAll = async () => {
    setExportingAll(true);
    for (const h of completedHeads) {
      await onExportHead(h.headIndex);
    }
    setExportingAll(false);
  };

  const QUICK_EXPORTS = [
    { key: "tb_excel",  label: "Trial Balance",     ext: ".xlsx", icon: FileText,  color: "blue",   desc: "All TB lines with classifications, debit/credit, confidence" },
    { key: "gl_excel",  label: "General Ledger",    ext: ".xlsx", icon: Layers,    color: "violet", desc: "Source GL entries with narrations, vouchers, running balances" },
    { key: "wp_excel",  label: "WP Index (Excel)",  ext: ".xlsx", icon: FileCheck, color: "emerald",desc: "Working paper listing — phases, status, prepared/approved by" },
    { key: "wp_word",   label: "WP Index (Word)",   ext: ".docx", icon: FileText,  color: "indigo", desc: "ISA-formatted Word document suitable for physical audit file" },
  ] as const;

  const colorMap: Record<string, string> = {
    blue:   "border-blue-200 bg-blue-50/40",
    violet: "border-violet-200 bg-violet-50/40",
    emerald:"border-emerald-200 bg-emerald-50/40",
    indigo: "border-indigo-200 bg-indigo-50/40",
  };
  const iconColorMap: Record<string, string> = {
    blue:   "bg-blue-100 text-blue-700",
    violet: "bg-violet-100 text-violet-700",
    emerald:"bg-emerald-100 text-emerald-700",
    indigo: "bg-indigo-100 text-indigo-700",
  };

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-900">{completedHeads.length}/{totalHeads}</p>
            <p className="text-xs text-slate-500">Working Papers Ready</p>
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

      {/* ── 4 Quick Export Cards ── */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-slate-700 to-slate-800 px-5 py-4 flex items-center gap-3">
          <Download className="w-5 h-5 text-slate-300 shrink-0" />
          <div>
            <h2 className="font-semibold text-white text-sm">Quick Document Export</h2>
            <p className="text-[11px] text-slate-400 mt-0.5">Download individual output files — TB Excel · GL Excel · WP Excel · WP Word</p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4">
          {QUICK_EXPORTS.map(({ key, label, ext, icon: Icon, color, desc }) => {
            const busy = exportingQuick === key;
            return (
              <button
                key={key}
                onClick={() => onExportQuick?.(key)}
                disabled={!!exportingQuick || loading}
                className={cn(
                  "text-left flex items-start gap-3 p-4 rounded-xl border transition-all shadow-sm",
                  colorMap[color],
                  !exportingQuick && !loading ? "hover:shadow-md cursor-pointer" : "opacity-70 cursor-not-allowed"
                )}
              >
                <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5", iconColorMap[color])}>
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Icon className="w-4 h-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-800">{label}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200/80 text-slate-500 font-mono">{ext}</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">{desc}</p>
                  {busy && <p className="text-[11px] text-violet-600 font-medium mt-1 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Generating...</p>}
                </div>
                <Download className={cn("w-4 h-4 shrink-0 mt-1", busy ? "text-violet-400" : "text-slate-400")} />
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Per-Head Export & Full Bundle ── */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-emerald-50 to-green-50/50 px-5 py-4 border-b border-slate-200/60 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="font-semibold text-slate-900 flex items-center gap-2">
              <Download className="w-5 h-5 text-emerald-600" /> Export by Working Paper Head
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">Download completed WP sections individually or export the full audit bundle</p>
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
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Export by Head</h3>
              {completedHeads.length > 0 && (
                <button
                  onClick={exportAll}
                  disabled={exportingAll || dlSet.size > 0}
                  className={cn(
                    "flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-all",
                    exportingAll || dlSet.size > 0
                      ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                      : "bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm"
                  )}
                >
                  {exportingAll ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                  {exportingAll ? "Downloading…" : `Download All (${completedHeads.length})`}
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {(heads || []).map((head: any) => {
                const canExport = ["approved", "exported", "completed"].includes(head.status);
                const isDownloading = dlSet.has(head.headIndex);
                const isDownloaded = dledSet.has(head.headIndex);
                const isExported = head.status === "exported" || head.status === "completed";
                return (
                  <div key={head.id} className={cn(
                    "flex items-center gap-3 p-3.5 rounded-xl border transition-all",
                    isDownloaded ? "bg-emerald-50 border-emerald-300 shadow-sm shadow-emerald-100" :
                    isExported ? "bg-emerald-50/30 border-emerald-200" :
                    canExport ? "bg-white border-slate-200 hover:border-blue-200 hover:shadow-sm" :
                    "bg-slate-50/50 border-slate-100 opacity-60"
                  )}>
                    <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                      isDownloaded ? "bg-emerald-500" :
                      isExported ? "bg-emerald-100" :
                      canExport ? "bg-blue-50" : "bg-slate-100"
                    )}>
                      {isDownloading ? <Loader2 className="w-4 h-4 text-white animate-spin" /> :
                       isDownloaded ? <CheckCircle2 className="w-4 h-4 text-white" /> :
                       isExported ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> :
                       canExport ? <FileText className="w-4 h-4 text-blue-600" /> :
                       <Lock className="w-4 h-4 text-slate-400" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">{head.headName}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-medium capitalize",
                          isDownloaded ? "bg-emerald-500 text-white" :
                          isExported ? "bg-emerald-100 text-emerald-700" :
                          canExport ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-500"
                        )}>
                          {isDownloaded ? "downloaded" : head.status?.replace(/_/g, " ")}
                        </span>
                        <span className="text-[10px] text-slate-400 uppercase">{head.outputType}</span>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant={canExport ? "default" : "outline"}
                      disabled={!canExport || isDownloading}
                      onClick={() => onExportHead(head.headIndex)}
                      className={cn(
                        "h-8 shrink-0 min-w-[80px]",
                        isDownloaded ? "bg-emerald-500 hover:bg-emerald-600" :
                        canExport ? "bg-emerald-600 hover:bg-emerald-700" : ""
                      )}
                    >
                      {isDownloading
                        ? <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> Saving…</>
                        : isDownloaded
                        ? <><CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Again</>
                        : <><Download className="w-3.5 h-3.5 mr-1" /> Download</>
                      }
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="border-t border-slate-200 pt-5 space-y-3">
            {dledSet.size > 0 && (
              <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <p className="text-sm text-emerald-800 font-medium">{dledSet.size} file{dledSet.size !== 1 ? "s" : ""} downloaded this session</p>
              </div>
            )}
            <Button size="lg" onClick={onExportBundle} disabled={loading || exportingAll} className="w-full bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 shadow-lg shadow-emerald-200/50 h-12 text-base">
              {loading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Download className="w-5 h-5 mr-2" />}
              Export Full Bundle
              <span className="text-emerald-200 text-sm ml-2 font-normal hidden sm:inline">(Index + TB + Exceptions + Audit Trail)</span>
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
