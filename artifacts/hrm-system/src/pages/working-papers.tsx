import React, { useState, useRef, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload, FileText, Loader2, CheckCircle2, Download, ChevronRight,
  ChevronDown, ChevronUp, BookOpen, Shield, AlertTriangle, TrendingUp,
  Building2, Calendar, Briefcase, X, Plus, Eye, RefreshCw,
  BarChart2, FileCheck, ClipboardCheck, Star, Info, Sparkles,
  FileSearch, Scale, Target, Layers, FileOutput, Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";

// ─── Types ────────────────────────────────────────────────────────────────────
interface UploadedFile { file: File; id: string; classified?: string; }
interface AnalysisResult {
  entity?: any; financials?: any; materiality?: any;
  risk_assessment?: any; key_audit_areas?: any[];
  documents_classified?: any[]; missing_data_flags?: string[];
  assumptions_made?: string[];
}
interface WorkingPaper {
  ref: string; title: string; section: string; section_label?: string;
  isa_references: string[]; objective?: string; scope?: string;
  procedures?: any[]; summary_table?: any[]; key_findings?: string[];
  auditor_conclusion?: string; risks_identified?: string[];
  recommendations?: string[]; preparer?: string; reviewer?: string;
  partner?: string; date_prepared?: string; status?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const ENGAGEMENT_TYPES = [
  "Statutory Audit", "Internal Audit", "Tax Audit", "Special Purpose Audit",
  "Review Engagement", "Compilation Engagement", "Due Diligence",
];

const WP_GROUPS = [
  { prefix: "PP", label: "Pre-Planning", color: "bg-violet-100 text-violet-700", refs: ["PP-100","PP-101","PP-102","PP-103"] },
  { prefix: "DI", label: "Discussion & Inquiry", color: "bg-blue-100 text-blue-700", refs: ["DI-100","DI-101"] },
  { prefix: "IR", label: "Risk Assessment", color: "bg-red-100 text-red-700", refs: ["IR-100","IR-101","IR-102"] },
  { prefix: "OB", label: "Opening Balances", color: "bg-orange-100 text-orange-700", refs: ["OB-100","OB-101"] },
  { prefix: "PL", label: "Planning", color: "bg-sky-100 text-sky-700", refs: ["PL-100"] },
  { prefix: "EX", label: "Execution / Substantive", color: "bg-emerald-100 text-emerald-700", refs: ["EX-100","EX-101","EX-102","EX-103","EX-104","EX-105","EX-106"] },
  { prefix: "FH", label: "Fieldwork", color: "bg-teal-100 text-teal-700", refs: ["FH-100"] },
  { prefix: "EV", label: "Evidence", color: "bg-amber-100 text-amber-700", refs: ["EV-100"] },
  { prefix: "FN", label: "Finalization", color: "bg-indigo-100 text-indigo-700", refs: ["FN-100","FN-101"] },
  { prefix: "DL", label: "Deliverables", color: "bg-pink-100 text-pink-700", refs: ["DL-100"] },
  { prefix: "QR", label: "Quality Review", color: "bg-purple-100 text-purple-700", refs: ["QR-100"] },
  { prefix: "IN", label: "Audit Opinion", color: "bg-green-100 text-green-700", refs: ["IN-100"] },
];

const ALL_WP_REFS = WP_GROUPS.flatMap(g => g.refs);

const WP_TITLES: Record<string, string> = {
  "PP-100": "Engagement Letter & Terms", "PP-101": "Independence & Ethics",
  "PP-102": "Materiality Determination", "PP-103": "Client Acceptance",
  "DI-100": "Understanding the Entity", "DI-101": "Related Parties",
  "IR-100": "Risk Assessment Summary", "IR-101": "Fraud Risk Assessment", "IR-102": "Internal Controls",
  "OB-100": "Opening Balances", "OB-101": "Prior Year Review",
  "PL-100": "Audit Plan & Strategy",
  "EX-100": "Revenue & Receivables", "EX-101": "Purchases & Payables",
  "EX-102": "Cash & Bank", "EX-103": "Inventory & COS",
  "EX-104": "Fixed Assets", "EX-105": "Payroll & HR Costs", "EX-106": "Tax & Compliance",
  "FH-100": "Analytical Procedures",
  "EV-100": "Audit Evidence Summary",
  "FN-100": "Financial Statement Review", "FN-101": "Subsequent Events",
  "DL-100": "Management Letter",
  "QR-100": "Quality Review Checklist",
  "IN-100": "Audit Opinion Draft",
};

// ─── Step indicator ───────────────────────────────────────────────────────────
const STEPS = [
  { label: "Upload", icon: Upload },
  { label: "Configure", icon: Briefcase },
  { label: "Analyse", icon: FileSearch },
  { label: "Generate", icon: Sparkles },
  { label: "Export", icon: FileOutput },
];

function StepBar({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-0 mb-8">
      {STEPS.map((s, i) => {
        const Icon = s.icon;
        const done = i < current;
        const active = i === current;
        return (
          <React.Fragment key={s.label}>
            <div className="flex flex-col items-center gap-1 min-w-[72px]">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${done ? "bg-green-500 text-white" : active ? "bg-blue-600 text-white shadow-lg shadow-blue-200" : "bg-gray-100 text-gray-400"}`}>
                {done ? <Check className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
              </div>
              <span className={`text-[10px] font-medium ${active ? "text-blue-600" : done ? "text-green-600" : "text-gray-400"}`}>{s.label}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`flex-1 h-0.5 mb-4 ${i < current ? "bg-green-400" : "bg-gray-200"}`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ─── File drop zone ───────────────────────────────────────────────────────────
function DropZone({ files, onAdd, onRemove }: { files: UploadedFile[]; onAdd: (f: FileList) => void; onRemove: (id: string) => void }) {
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDrag(false);
    if (e.dataTransfer.files) onAdd(e.dataTransfer.files);
  }, [onAdd]);

  const icons: Record<string, string> = {
    "application/pdf": "📄", "image/": "🖼️",
    "application/vnd.openxmlformats": "📊", "text/csv": "📋", "text/plain": "📝",
  };
  const fileIcon = (f: File) => {
    for (const [k, v] of Object.entries(icons)) if (f.type.startsWith(k)) return v;
    return "📎";
  };

  return (
    <div className="space-y-4">
      <div
        onDragOver={e => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all ${drag ? "border-blue-500 bg-blue-50 scale-[1.01]" : "border-gray-200 hover:border-blue-400 hover:bg-gray-50"}`}
      >
        <div className="w-14 h-14 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-3">
          <Upload className="w-7 h-7 text-blue-500" />
        </div>
        <p className="font-semibold text-gray-700 text-sm">Drop files here or click to browse</p>
        <p className="text-xs text-gray-400 mt-1">PDF, Excel, CSV, Word, Images, Emails — up to 20 files × 20 MB each</p>
        <input ref={inputRef} type="file" multiple className="hidden"
          accept=".pdf,.xlsx,.xls,.csv,.txt,.docx,.doc,.jpg,.jpeg,.png,.webp,.eml"
          onChange={e => e.target.files && onAdd(e.target.files)} />
      </div>

      {files.length > 0 && (
        <div className="grid grid-cols-1 gap-2">
          {files.map(f => (
            <motion.div key={f.id} initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-3 p-3 bg-white border border-gray-100 rounded-xl shadow-sm">
              <span className="text-xl">{fileIcon(f.file)}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{f.file.name}</p>
                <p className="text-xs text-gray-400">{(f.file.size / 1024).toFixed(0)} KB {f.classified ? `· ${f.classified}` : ""}</p>
              </div>
              <button onClick={e => { e.stopPropagation(); onRemove(f.id); }} className="text-gray-300 hover:text-red-400 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Financial card ───────────────────────────────────────────────────────────
function FinCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="text-base font-bold text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function fmtPKR(n: number | undefined | null) {
  if (!n && n !== 0) return "N/A";
  return `PKR ${Number(n).toLocaleString("en-PK")}`;
}

// ─── Risk badge ───────────────────────────────────────────────────────────────
function RiskBadge({ level }: { level: string }) {
  const map: Record<string, string> = { High: "bg-red-100 text-red-700", Medium: "bg-amber-100 text-amber-700", Low: "bg-green-100 text-green-700" };
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${map[level] || "bg-gray-100 text-gray-600"}`}>{level}</span>;
}

// ─── Working paper card ───────────────────────────────────────────────────────
function WPCard({ wp }: { wp: WorkingPaper }) {
  const [open, setOpen] = useState(false);
  const group = WP_GROUPS.find(g => wp.ref.startsWith(g.prefix));

  return (
    <motion.div layout className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-3 p-4 hover:bg-gray-50 transition-colors text-left">
        <div className={`text-xs font-bold px-2 py-1 rounded-lg ${group?.color || "bg-gray-100 text-gray-600"}`}>{wp.ref}</div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 text-sm">{wp.title}</p>
          <p className="text-xs text-gray-400">{wp.isa_references?.join(" · ")}</p>
        </div>
        <Badge variant="outline" className="text-xs shrink-0">{wp.status || "Draft"}</Badge>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }} className="overflow-hidden">
            <div className="px-4 pb-4 space-y-4 border-t border-gray-50">
              {wp.objective && (
                <div className="pt-4">
                  <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-1">Objective</p>
                  <p className="text-sm text-gray-700">{wp.objective}</p>
                </div>
              )}
              {wp.scope && (
                <div>
                  <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-1">Scope</p>
                  <p className="text-sm text-gray-700">{wp.scope}</p>
                </div>
              )}
              {wp.procedures && wp.procedures.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-2">Audit Procedures</p>
                  <div className="overflow-x-auto rounded-xl border border-gray-100">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-gray-50">
                          <th className="text-left p-2 font-semibold text-gray-600 w-10">Ref</th>
                          <th className="text-left p-2 font-semibold text-gray-600">Procedure</th>
                          <th className="text-left p-2 font-semibold text-gray-600">Finding</th>
                          <th className="text-left p-2 font-semibold text-gray-600 w-28">Conclusion</th>
                        </tr>
                      </thead>
                      <tbody>
                        {wp.procedures.map((p, i) => (
                          <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}>
                            <td className="p-2 font-mono text-blue-600">{p.no || i + 1}</td>
                            <td className="p-2 text-gray-700">{p.procedure}</td>
                            <td className="p-2 text-gray-600">{p.finding}</td>
                            <td className="p-2 text-gray-600">{p.conclusion}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              {wp.summary_table && wp.summary_table.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-2">Summary Schedule</p>
                  <div className="overflow-x-auto rounded-xl border border-gray-100">
                    <table className="w-full text-xs">
                      <thead><tr className="bg-blue-50"><th className="text-left p-2 font-semibold text-blue-700">Item</th><th className="text-left p-2 font-semibold text-blue-700">Value</th><th className="text-left p-2 font-semibold text-blue-700">Comment</th></tr></thead>
                      <tbody>
                        {wp.summary_table.map((r: any, i: number) => (
                          <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}>
                            <td className="p-2 font-medium text-gray-800">{r.item}</td>
                            <td className="p-2 text-gray-700">{r.value}</td>
                            <td className="p-2 text-gray-500">{r.comment}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              {wp.key_findings && wp.key_findings.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-2">Key Findings</p>
                  <ul className="space-y-1">
                    {wp.key_findings.map((f, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-500 mt-0.5 shrink-0" /> {f}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {wp.auditor_conclusion && (
                <div className="bg-green-50 border border-green-100 rounded-xl p-3">
                  <p className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-1">Auditor's Conclusion</p>
                  <p className="text-sm text-green-900">{wp.auditor_conclusion}</p>
                </div>
              )}
              {wp.recommendations && wp.recommendations.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2">Recommendations</p>
                  <ul className="space-y-1">
                    {wp.recommendations.map((r, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-amber-800">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" /> {r}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="flex gap-6 pt-2 border-t border-gray-100 text-xs text-gray-500">
                <span>Prepared: <strong className="text-gray-700">{wp.preparer}</strong></span>
                <span>Reviewed: <strong className="text-gray-700">{wp.reviewer}</strong></span>
                <span>Partner: <strong className="text-gray-700">{wp.partner}</strong></span>
                <span>Date: <strong className="text-gray-700">{wp.date_prepared}</strong></span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function WorkingPapers() {
  const { token } = useAuth();
  const { toast } = useToast();

  const [step, setStep] = useState(0);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [instructions, setInstructions] = useState("");

  // Config
  const [entityName, setEntityName] = useState("");
  const [engagementType, setEngagementType] = useState("Statutory Audit");
  const [financialYear, setFinancialYear] = useState("Year ended June 30, 2024");
  const [firmName, setFirmName] = useState("ANA & Co. Chartered Accountants");
  const [selectedPapers, setSelectedPapers] = useState<string[]>(ALL_WP_REFS);

  // State
  const [analyzing, setAnalyzing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [workingPapers, setWorkingPapers] = useState<WorkingPaper[]>([]);
  const [generationMeta, setGenerationMeta] = useState<any>(null);
  const [progress, setProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState("");
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  const addFiles = useCallback((fl: FileList) => {
    const newFiles = Array.from(fl).map(f => ({ file: f, id: `${f.name}-${Date.now()}-${Math.random()}` }));
    setFiles(prev => [...prev, ...newFiles]);
  }, []);

  const removeFile = useCallback((id: string) => setFiles(prev => prev.filter(f => f.id !== id)), []);

  const togglePaper = (ref: string) => {
    setSelectedPapers(prev => prev.includes(ref) ? prev.filter(r => r !== ref) : [...prev, ref]);
  };

  const toggleGroup = (refs: string[]) => {
    const allSelected = refs.every(r => selectedPapers.includes(r));
    setSelectedPapers(prev => allSelected ? prev.filter(r => !refs.includes(r)) : [...new Set([...prev, ...refs])]);
  };

  // ── Step 3: Analyze ──────────────────────────────────────────────────────
  const handleAnalyze = async () => {
    if (files.length === 0) {
      toast({ title: "No files", description: "Upload at least one document first.", variant: "destructive" });
      return;
    }
    setAnalyzing(true);
    setProgress(10);
    setProgressMsg("Uploading documents...");

    const formData = new FormData();
    files.forEach(f => formData.append("files", f.file));
    formData.append("instructions", instructions);
    formData.append("entityName", entityName);
    formData.append("engagementType", engagementType);
    formData.append("financialYear", financialYear);

    try {
      setProgress(30); setProgressMsg("Extracting data from documents...");
      const res = await fetch("/api/working-papers/analyze", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      setProgress(70); setProgressMsg("AI processing & risk assessment...");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Analysis failed");

      if (data.analysis) {
        setAnalysis(data.analysis);
        if (data.analysis.entity?.name && !entityName) setEntityName(data.analysis.entity.name);
        // Update file classifications
        if (data.documentsProcessed) {
          setFiles(prev => prev.map(f => {
            const matched = data.documentsProcessed.find((d: any) => d.filename === f.file.name);
            return matched ? { ...f, classified: matched.type } : f;
          }));
        }
      }
      setProgress(100); setProgressMsg("Done!");
      setStep(3);
    } catch (err: any) {
      toast({ title: "Analysis failed", description: err.message, variant: "destructive" });
    } finally {
      setAnalyzing(false);
      setTimeout(() => { setProgress(0); setProgressMsg(""); }, 1000);
    }
  };

  // ── Step 4: Generate ─────────────────────────────────────────────────────
  const handleGenerate = async () => {
    setGenerating(true);
    setProgress(5);
    setProgressMsg("Initialising AI engine...");

    try {
      setProgress(20); setProgressMsg("Building working paper templates...");
      await new Promise(r => setTimeout(r, 400));
      setProgress(50); setProgressMsg("Generating ISA-compliant working papers...");

      const res = await fetch("/api/working-papers/generate", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ analysis, selectedPapers, entityName, financialYear, engagementType, firmName }),
      });
      setProgress(85); setProgressMsg("Finalising working papers...");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Generation failed");

      setWorkingPapers(data.working_papers || []);
      setGenerationMeta(data.meta);
      setProgress(100); setProgressMsg("Complete!");
      setStep(4);
    } catch (err: any) {
      toast({ title: "Generation failed", description: err.message, variant: "destructive" });
    } finally {
      setGenerating(false);
      setTimeout(() => { setProgress(0); setProgressMsg(""); }, 1000);
    }
  };

  // ── Export PDF ───────────────────────────────────────────────────────────
  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await fetch("/api/working-papers/export-pdf", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ workingPapers, meta: generationMeta, analysis }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `AuditFile_${(entityName || "Client").replace(/\s+/g, "_")}_${financialYear.replace(/\s+/g, "_")}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "PDF Downloaded", description: "Audit working paper file exported successfully." });
    } catch (err: any) {
      toast({ title: "Export failed", description: err.message, variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const fin = analysis?.financials || {};
  const risks = analysis?.risk_assessment || {};

  const sectionPapers = (section: string) => workingPapers.filter(wp => (wp.section_label || wp.section) === section);
  const uniqueSections = Array.from(new Set(workingPapers.map(wp => wp.section_label || wp.section || "General")));

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/20 p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-9 h-9 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-xl flex items-center justify-center shadow-lg shadow-blue-200">
            <BookOpen className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">AI Working Paper Generator</h1>
            <p className="text-xs text-gray-500">ISA 200–720 · IFRS · Companies Act 2017 · FBR Compliant</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Badge className="bg-blue-600 text-white text-xs gap-1"><Sparkles className="w-3 h-3" /> AuditWise Engine</Badge>
            <Badge variant="outline" className="text-xs gap-1 text-green-700 border-green-200 bg-green-50"><Shield className="w-3 h-3" /> 100% ISA Compliant</Badge>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto">
        <StepBar current={step} />

        <AnimatePresence mode="wait">

          {/* ─── STEP 0: Upload ──────────────────────────────────────────────── */}
          {step === 0 && (
            <motion.div key="upload" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}>
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-4">
                <h2 className="text-base font-bold text-gray-900 mb-1 flex items-center gap-2"><Upload className="w-4 h-4 text-blue-500" /> Upload Financial Documents</h2>
                <p className="text-xs text-gray-500 mb-5">Upload TB, GL, bank statements, invoices, contracts, scanned documents — AI will extract, classify, and process everything.</p>
                <DropZone files={files} onAdd={addFiles} onRemove={removeFile} />
                <div className="mt-4">
                  <Label className="text-xs font-semibold text-gray-600">Special Instructions (Optional)</Label>
                  <Textarea placeholder="e.g. Focus on revenue recognition. Flag any related party transactions. This is a manufacturing company..." rows={3}
                    value={instructions} onChange={e => setInstructions(e.target.value)} className="mt-1.5 text-sm resize-none" />
                </div>
              </div>

              <div className="flex justify-between items-center">
                <div className="flex flex-wrap gap-2">
                  {["PDF", "Excel", "CSV", "Word", "Images", "Email"].map(t => (
                    <span key={t} className="text-xs bg-white border border-gray-200 text-gray-600 px-2.5 py-1 rounded-full shadow-sm">{t}</span>
                  ))}
                </div>
                <Button onClick={() => setStep(1)} disabled={files.length === 0} className="bg-blue-600 hover:bg-blue-700">
                  Configure <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </motion.div>
          )}

          {/* ─── STEP 1: Configure ───────────────────────────────────────────── */}
          {step === 1 && (
            <motion.div key="config" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}>
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-4 space-y-5">
                <h2 className="text-base font-bold text-gray-900 flex items-center gap-2"><Briefcase className="w-4 h-4 text-blue-500" /> Engagement Configuration</h2>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs font-semibold text-gray-600">Client / Entity Name *</Label>
                    <Input value={entityName} onChange={e => setEntityName(e.target.value)} placeholder="e.g. ABC Pharmaceuticals Ltd." className="mt-1.5" />
                  </div>
                  <div>
                    <Label className="text-xs font-semibold text-gray-600">Audit Firm Name</Label>
                    <Input value={firmName} onChange={e => setFirmName(e.target.value)} placeholder="e.g. ANA & Co. Chartered Accountants" className="mt-1.5" />
                  </div>
                  <div>
                    <Label className="text-xs font-semibold text-gray-600">Engagement Type</Label>
                    <Select value={engagementType} onValueChange={setEngagementType}>
                      <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                      <SelectContent>{ENGAGEMENT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs font-semibold text-gray-600">Financial Year</Label>
                    <Input value={financialYear} onChange={e => setFinancialYear(e.target.value)} placeholder="e.g. Year ended June 30, 2024" className="mt-1.5" />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2"><Layers className="w-4 h-4 text-indigo-500" /> Working Papers to Generate</h3>
                    <div className="flex gap-2">
                      <button onClick={() => setSelectedPapers(ALL_WP_REFS)} className="text-xs text-blue-600 hover:underline">Select All</button>
                      <span className="text-gray-300">|</span>
                      <button onClick={() => setSelectedPapers([])} className="text-xs text-gray-400 hover:underline">Clear</button>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 mb-3">{selectedPapers.length} of {ALL_WP_REFS.length} papers selected</p>
                  <div className="grid grid-cols-1 gap-3">
                    {WP_GROUPS.map(g => {
                      const allSel = g.refs.every(r => selectedPapers.includes(r));
                      const someSel = g.refs.some(r => selectedPapers.includes(r));
                      return (
                        <div key={g.prefix} className="border border-gray-100 rounded-xl overflow-hidden">
                          <button onClick={() => toggleGroup(g.refs)}
                            className={`w-full flex items-center gap-3 p-3 text-left hover:bg-gray-50 transition-colors ${allSel ? "bg-blue-50/50" : ""}`}>
                            <div className={`w-4 h-4 rounded border flex items-center justify-center ${allSel ? "bg-blue-600 border-blue-600" : someSel ? "bg-blue-200 border-blue-400" : "border-gray-300"}`}>
                              {allSel && <Check className="w-3 h-3 text-white" />}
                              {someSel && !allSel && <div className="w-1.5 h-1.5 bg-blue-600 rounded-sm" />}
                            </div>
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-lg ${g.color}`}>{g.prefix}</span>
                            <span className="text-sm font-medium text-gray-800">{g.label}</span>
                            <span className="ml-auto text-xs text-gray-400">{g.refs.filter(r => selectedPapers.includes(r)).length}/{g.refs.length}</span>
                          </button>
                          <div className="flex flex-wrap gap-2 px-4 py-2 bg-gray-50/50 border-t border-gray-100">
                            {g.refs.map(ref => (
                              <button key={ref} onClick={() => togglePaper(ref)}
                                className={`text-xs px-2.5 py-1 rounded-full border transition-all ${selectedPapers.includes(ref) ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-200 hover:border-blue-300"}`}>
                                {ref}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep(0)}><ChevronRight className="w-4 h-4 mr-1 rotate-180" /> Back</Button>
                <Button onClick={() => setStep(2)} disabled={!entityName} className="bg-blue-600 hover:bg-blue-700">
                  Analyse Documents <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </motion.div>
          )}

          {/* ─── STEP 2: Analyze trigger ─────────────────────────────────────── */}
          {step === 2 && (
            <motion.div key="analyze" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}>
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 mb-4 text-center">
                <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-200">
                  <FileSearch className="w-8 h-8 text-white" />
                </div>
                <h2 className="text-lg font-bold text-gray-900 mb-2">Ready to Analyse</h2>
                <p className="text-sm text-gray-500 mb-1">{files.length} document{files.length !== 1 ? "s" : ""} · {selectedPapers.length} working papers selected</p>
                <p className="text-sm text-gray-500 mb-6">AI will extract financial data, assess risks, calculate materiality, and prepare for working paper generation.</p>

                {analyzing && (
                  <div className="mb-6 space-y-2">
                    <Progress value={progress} className="h-2" />
                    <p className="text-xs text-blue-600 animate-pulse">{progressMsg}</p>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-4 mb-6 text-left">
                  {[
                    { icon: FileText, label: "Data Extraction", desc: "PDF, Excel, Images, OCR" },
                    { icon: Scale, label: "Materiality Calc", desc: "ISA 320 compliant" },
                    { icon: AlertTriangle, label: "Risk Assessment", desc: "ISA 315, ISA 240" },
                  ].map(({ icon: Icon, label, desc }) => (
                    <div key={label} className="bg-blue-50 rounded-xl p-3">
                      <Icon className="w-5 h-5 text-blue-500 mb-2" />
                      <p className="text-xs font-semibold text-gray-800">{label}</p>
                      <p className="text-xs text-gray-500">{desc}</p>
                    </div>
                  ))}
                </div>

                <Button onClick={handleAnalyze} disabled={analyzing} size="lg" className="bg-blue-600 hover:bg-blue-700 px-8">
                  {analyzing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Analysing...</> : <><Sparkles className="w-4 h-4 mr-2" /> Run AI Analysis</>}
                </Button>
              </div>
              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep(1)} disabled={analyzing}><ChevronRight className="w-4 h-4 mr-1 rotate-180" /> Back</Button>
              </div>
            </motion.div>
          )}

          {/* ─── STEP 3: Results + Generate ──────────────────────────────────── */}
          {step === 3 && analysis && (
            <motion.div key="results" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} className="space-y-4">
              {/* Summary cards */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2"><BarChart2 className="w-4 h-4 text-blue-500" /> Analysis Results — {entityName}</h2>
                  <RiskBadge level={risks.overall_risk || "Medium"} />
                </div>

                <div className="grid grid-cols-4 gap-3 mb-4">
                  <FinCard label="Revenue" value={fmtPKR(fin.revenue)} />
                  <FinCard label="Net Profit" value={fmtPKR(fin.net_profit)} />
                  <FinCard label="Total Assets" value={fmtPKR(fin.total_assets)} />
                  <FinCard label="Equity" value={fmtPKR(fin.equity)} />
                  <FinCard label="Cash & Bank" value={fmtPKR(fin.cash_and_bank)} />
                  <FinCard label="Trade Receivables" value={fmtPKR(fin.trade_receivables)} />
                  <FinCard label="Trade Payables" value={fmtPKR(fin.trade_payables)} />
                  <FinCard label="Fixed Assets" value={fmtPKR(fin.fixed_assets)} />
                </div>

                {analysis.materiality && (
                  <div className="bg-indigo-50 rounded-xl p-4 mb-4">
                    <p className="text-xs font-bold text-indigo-700 uppercase tracking-wide mb-2 flex items-center gap-1"><Target className="w-3.5 h-3.5" /> Materiality (ISA 320)</p>
                    <div className="grid grid-cols-3 gap-3 text-sm">
                      <div><p className="text-xs text-indigo-400">Overall Materiality</p><p className="font-bold text-indigo-900">{fmtPKR(analysis.materiality.overall_materiality)}</p></div>
                      <div><p className="text-xs text-indigo-400">Performance Materiality</p><p className="font-bold text-indigo-900">{fmtPKR(analysis.materiality.performance_materiality)}</p></div>
                      <div><p className="text-xs text-indigo-400">Basis</p><p className="font-semibold text-indigo-900">{analysis.materiality.basis} × {analysis.materiality.percentage_used}%</p></div>
                    </div>
                    <p className="text-xs text-indigo-600 mt-2">{analysis.materiality.rationale}</p>
                  </div>
                )}

                {risks.inherent_risks && (
                  <div>
                    <p className="text-xs font-bold text-gray-600 uppercase tracking-wide mb-2 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5 text-amber-500" /> Inherent Risks Identified</p>
                    <div className="grid grid-cols-2 gap-2">
                      {risks.inherent_risks.slice(0, 4).map((r: any, i: number) => (
                        <div key={i} className="flex items-start gap-2 bg-amber-50 rounded-lg p-2.5">
                          <RiskBadge level={r.level} />
                          <div><p className="text-xs font-semibold text-gray-800">{r.area}</p><p className="text-xs text-gray-500">{r.risk}</p></div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {analysis.assumptions_made && analysis.assumptions_made.length > 0 && (
                  <div className="mt-3 bg-yellow-50 border border-yellow-100 rounded-xl p-3">
                    <p className="text-xs font-bold text-yellow-700 mb-1 flex items-center gap-1"><Info className="w-3 h-3" /> Auditor Assumptions / Estimated Data</p>
                    <ul className="space-y-0.5">
                      {analysis.assumptions_made.map((a, i) => <li key={i} className="text-xs text-yellow-800">• {a}</li>)}
                    </ul>
                  </div>
                )}
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                <h3 className="text-sm font-bold text-gray-900 mb-1 flex items-center gap-2"><Sparkles className="w-4 h-4 text-blue-500" /> Generate Working Papers</h3>
                <p className="text-xs text-gray-500 mb-4">{selectedPapers.length} working papers will be generated with full ISA compliance, procedures, findings, and sign-offs.</p>

                {generating && (
                  <div className="mb-4 space-y-2">
                    <Progress value={progress} className="h-2" />
                    <p className="text-xs text-blue-600 animate-pulse">{progressMsg}</p>
                  </div>
                )}

                <Button onClick={handleGenerate} disabled={generating} size="lg" className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-lg shadow-blue-200">
                  {generating ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating {selectedPapers.length} Working Papers...</> : <><FileCheck className="w-4 h-4 mr-2" /> Generate Audit Working Papers</>}
                </Button>
              </div>

              <div className="flex justify-start">
                <Button variant="outline" onClick={() => setStep(2)} disabled={generating}><ChevronRight className="w-4 h-4 mr-1 rotate-180" /> Back</Button>
              </div>
            </motion.div>
          )}

          {/* ─── STEP 4: View & Export ───────────────────────────────────────── */}
          {step === 4 && workingPapers.length > 0 && (
            <motion.div key="export" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} className="space-y-4">
              {/* Export header */}
              <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-2xl p-5 text-white">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-bold flex items-center gap-2"><FileOutput className="w-5 h-5" /> Audit Working Paper File Ready</h2>
                    <p className="text-blue-200 text-sm mt-0.5">{entityName} · {financialYear} · {workingPapers.length} working papers</p>
                  </div>
                  <Button onClick={handleExport} disabled={exporting} size="lg"
                    className="bg-white text-blue-700 hover:bg-blue-50 font-bold shadow-lg">
                    {exporting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Exporting...</> : <><Download className="w-4 h-4 mr-2" /> Download PDF</>}
                  </Button>
                </div>

                <div className="grid grid-cols-4 gap-3 mt-4">
                  {[
                    { label: "Working Papers", value: workingPapers.length },
                    { label: "ISA Standard", value: "200–720" },
                    { label: "Status", value: "Draft" },
                    { label: "Compliance", value: "100%" },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-white/10 rounded-xl p-3 text-center">
                      <p className="text-blue-200 text-xs">{label}</p>
                      <p className="text-white font-bold text-lg">{value}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Working papers by section */}
              {uniqueSections.map(section => {
                const papers = sectionPapers(section);
                if (!papers.length) return null;
                const group = WP_GROUPS.find(g => papers[0]?.ref.startsWith(g.prefix));
                const isOpen = expandedSection === section;
                return (
                  <div key={section} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <button onClick={() => setExpandedSection(isOpen ? null : section)}
                      className="w-full flex items-center gap-3 p-4 hover:bg-gray-50 transition-colors text-left">
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-lg ${group?.color || "bg-gray-100 text-gray-600"}`}>{group?.prefix || "WP"}</span>
                      <span className="font-semibold text-gray-900 text-sm">{section}</span>
                      <Badge variant="secondary" className="ml-auto text-xs">{papers.length} papers</Badge>
                      {isOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                    </button>
                    <AnimatePresence>
                      {isOpen && (
                        <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
                          <div className="px-4 pb-4 space-y-2 border-t border-gray-50">
                            {papers.map(wp => <WPCard key={wp.ref} wp={wp} />)}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}

              <div className="flex justify-between items-center pb-6">
                <Button variant="outline" onClick={() => { setStep(0); setFiles([]); setAnalysis(null); setWorkingPapers([]); setEntityName(""); }}>
                  <RefreshCw className="w-4 h-4 mr-2" /> New Engagement
                </Button>
                <Button onClick={handleExport} disabled={exporting} className="bg-blue-600 hover:bg-blue-700">
                  {exporting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Exporting...</> : <><Download className="w-4 h-4 mr-2" /> Download Audit File PDF</>}
                </Button>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
}
