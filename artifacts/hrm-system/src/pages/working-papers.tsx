import React, { useState, useRef, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload, FileText, Loader2, CheckCircle2, Download, ChevronRight,
  ChevronDown, ChevronUp, BookOpen, Shield, AlertTriangle, TrendingUp,
  Building2, Calendar, Briefcase, X, Plus, Eye, RefreshCw,
  BarChart2, FileCheck, ClipboardCheck, Star, Info, Sparkles,
  FileSearch, Scale, Target, Layers, FileOutput, Check, Table,
  Activity, GitMerge, Link2, FileSpreadsheet, Mail, Hash,
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
  analytical_procedures?: {
    ratios?: Record<string, number>;
    variance_analysis?: any[];
    trend_analysis?: string;
    analytical_conclusions?: string[];
  };
  reconciliation?: {
    tb_vs_fs?: { status: string; difference: number; notes: string };
    tb_vs_gl?: { status: string; difference: number; notes: string };
    opening_vs_prior_year?: { status: string; difference: number; notes: string };
    bank_reconciliation?: { status: string; difference: number; notes: string };
    flags?: string[];
  };
  evidence_items?: Array<{ id: string; filename: string; type: string; description: string; pages_or_sheets?: string; date_received?: string }>;
  internal_control_weaknesses?: Array<{ area: string; weakness: string; risk_level: string; recommendation: string }>;
}
interface WorkingPaper {
  ref: string; title: string; section: string; section_label?: string;
  isa_references: string[]; assertions?: string[]; objective?: string; scope?: string;
  procedures?: any[]; summary_table?: any[]; key_findings?: string[];
  auditor_conclusion?: string; risks_identified?: string[];
  recommendations?: string[]; preparer?: string; reviewer?: string;
  partner?: string; date_prepared?: string; status?: string;
  evidence_refs?: string[]; cross_references?: string[];
}
interface EvidenceItem { ref: string; description: string; type: string; wp_refs?: string[]; }

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
        <div className="flex items-center gap-1.5 shrink-0">
          {wp.evidence_refs && wp.evidence_refs.length > 0 && (
            <div className="flex gap-1">{wp.evidence_refs.slice(0,2).map(r => <span key={r} className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full font-mono">{r}</span>)}</div>
          )}
          <Badge variant="outline" className="text-xs">{wp.status || "Draft"}</Badge>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }} className="overflow-hidden">
            <div className="px-4 pb-4 space-y-4 border-t border-gray-50">
              {/* Assertions & Evidence refs */}
              {(wp.assertions?.length || wp.evidence_refs?.length || wp.cross_references?.length) ? (
                <div className="pt-3 flex flex-wrap gap-3">
                  {wp.assertions && wp.assertions.length > 0 && (
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Assertions (ISA 315)</p>
                      <div className="flex flex-wrap gap-1">{wp.assertions.map(a => <span key={a} className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">{a}</span>)}</div>
                    </div>
                  )}
                  {wp.evidence_refs && wp.evidence_refs.length > 0 && (
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Evidence</p>
                      <div className="flex flex-wrap gap-1">{wp.evidence_refs.map(r => <span key={r} className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full font-mono">{r}</span>)}</div>
                    </div>
                  )}
                  {wp.cross_references && wp.cross_references.length > 0 && (
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Cross-Refs</p>
                      <div className="flex flex-wrap gap-1">{wp.cross_references.map(r => <span key={r} className="text-[10px] bg-teal-100 text-teal-700 px-1.5 py-0.5 rounded-full font-mono">{r}</span>)}</div>
                    </div>
                  )}
                </div>
              ) : null}
              {wp.objective && (
                <div className="pt-2">
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
                  <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-2">Audit Procedures Performed</p>
                  <div className="overflow-x-auto rounded-xl border border-gray-100">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-blue-600 text-white">
                          <th className="text-left p-2 w-8">No</th>
                          <th className="text-left p-2">Procedure</th>
                          <th className="text-left p-2">Finding</th>
                          <th className="text-left p-2 w-24">Conclusion</th>
                          <th className="text-left p-2 w-16">Ref</th>
                        </tr>
                      </thead>
                      <tbody>
                        {wp.procedures.map((p, i) => (
                          <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}>
                            <td className="p-2 font-mono text-blue-600 font-bold">{p.no || i + 1}</td>
                            <td className="p-2 text-gray-700">{p.procedure}</td>
                            <td className="p-2 text-gray-600">{p.finding}</td>
                            <td className="p-2">
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${p.conclusion === "Satisfactory" ? "bg-green-100 text-green-700" : p.conclusion === "Note Required" ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-700"}`}>
                                {p.conclusion}
                              </span>
                            </td>
                            <td className="p-2 font-mono text-purple-600 text-[10px]">{p.evidence_ref || ""}</td>
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
  const [exportingExcel, setExportingExcel] = useState(false);
  const [exportingDocx, setExportingDocx] = useState(false);
  const [exportingConfirmations, setExportingConfirmations] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [workingPapers, setWorkingPapers] = useState<WorkingPaper[]>([]);
  const [evidenceIndex, setEvidenceIndex] = useState<EvidenceItem[]>([]);
  const [generationMeta, setGenerationMeta] = useState<any>(null);
  const [progress, setProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState("");
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [analysisTab, setAnalysisTab] = useState<"summary"|"ratios"|"reconciliation"|"evidence"|"ic">("summary");

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
      setEvidenceIndex(data.evidence_index || []);
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

  // ── Export Excel ──────────────────────────────────────────────────────
  const handleExportExcel = async () => {
    setExportingExcel(true);
    try {
      const res = await fetch("/api/working-papers/export-excel", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ workingPapers, meta: generationMeta, analysis }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `AuditFile_${(entityName || "Client").replace(/\s+/g, "_")}_${financialYear.replace(/\s+/g, "_")}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Excel Downloaded", description: "Audit working paper file exported to Excel successfully." });
    } catch (err: any) {
      toast({ title: "Excel export failed", description: err.message, variant: "destructive" });
    } finally {
      setExportingExcel(false);
    }
  };

  // ── Export DOCX ───────────────────────────────────────────────────────────
  const handleExportDocx = async () => {
    setExportingDocx(true);
    try {
      const res = await fetch("/api/working-papers/export-docx", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ workingPapers, meta: generationMeta, analysis, evidenceIndex }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `AuditFile_${(entityName || "Client").replace(/\s+/g, "_")}_${financialYear.replace(/\s+/g, "_")}.docx`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Word Document Downloaded", description: "Editable audit file exported to DOCX successfully." });
    } catch (err: any) {
      toast({ title: "DOCX export failed", description: err.message, variant: "destructive" });
    } finally {
      setExportingDocx(false);
    }
  };

  // ── Generate Confirmations ────────────────────────────────────────────────
  const handleExportConfirmations = async () => {
    setExportingConfirmations(true);
    try {
      const res = await fetch("/api/working-papers/generate-confirmations", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ analysis, meta: generationMeta, types: ["bank", "debtors", "creditors", "legal"] }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Confirmations_${(entityName || "Client").replace(/\s+/g, "_")}_${financialYear.replace(/\s+/g, "_")}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Confirmation Letters Downloaded", description: "Bank, Debtors, Creditors & Legal confirmations generated." });
    } catch (err: any) {
      toast({ title: "Confirmation generation failed", description: err.message, variant: "destructive" });
    } finally {
      setExportingConfirmations(false);
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
            <Badge className="bg-blue-600 text-white text-xs gap-1"><Sparkles className="w-3 h-3" /> AuditWise Engine v3</Badge>
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

                <div className="grid grid-cols-3 gap-3 mb-6 text-left">
                  {[
                    { icon: FileText, label: "Data Extraction & OCR", desc: "PDF, Excel, Images, Scans" },
                    { icon: Hash, label: "Evidence IDs", desc: "A-100, B-200, C-300…" },
                    { icon: Scale, label: "Materiality (ISA 320)", desc: "OM · PM · Trivial Threshold" },
                    { icon: AlertTriangle, label: "Risk Assessment", desc: "ISA 315 · ISA 240 Fraud" },
                    { icon: Activity, label: "Analytical Procedures", desc: "Ratios · Variance · Trends" },
                    { icon: GitMerge, label: "Auto-Reconciliation", desc: "TB vs GL vs FS vs Bank" },
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
              {/* Analysis tabs */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="flex border-b border-gray-100 overflow-x-auto">
                  {[
                    { id: "summary", label: "Summary", icon: BarChart2 },
                    { id: "ratios", label: "Analytical Procedures", icon: Activity },
                    { id: "reconciliation", label: "Reconciliation", icon: GitMerge },
                    { id: "evidence", label: "Evidence Items", icon: Hash },
                    { id: "ic", label: "IC Weaknesses", icon: Shield },
                  ].map(({ id, label, icon: Icon }) => (
                    <button key={id} onClick={() => setAnalysisTab(id as any)}
                      className={`flex items-center gap-1.5 px-4 py-3 text-xs font-semibold whitespace-nowrap border-b-2 transition-colors ${analysisTab === id ? "border-blue-600 text-blue-600 bg-blue-50/50" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
                      <Icon className="w-3.5 h-3.5" />{label}
                    </button>
                  ))}
                </div>

                <div className="p-5">
                  {/* Tab: Summary */}
                  {analysisTab === "summary" && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2"><BarChart2 className="w-4 h-4 text-blue-500" /> Analysis Results — {entityName}</h2>
                        <RiskBadge level={risks.overall_risk || "Medium"} />
                      </div>
                      <div className="grid grid-cols-4 gap-3">
                        <FinCard label="Revenue" value={fmtPKR(fin.revenue)} />
                        <FinCard label="Gross Profit" value={fmtPKR(fin.gross_profit)} />
                        <FinCard label="Net Profit" value={fmtPKR(fin.net_profit)} />
                        <FinCard label="Total Assets" value={fmtPKR(fin.total_assets)} />
                        <FinCard label="Cash & Bank" value={fmtPKR(fin.cash_and_bank)} />
                        <FinCard label="Trade Receivables" value={fmtPKR(fin.trade_receivables)} />
                        <FinCard label="Trade Payables" value={fmtPKR(fin.trade_payables)} />
                        <FinCard label="Equity" value={fmtPKR(fin.equity)} />
                      </div>
                      {analysis.materiality && (
                        <div className="bg-indigo-50 rounded-xl p-4">
                          <p className="text-xs font-bold text-indigo-700 uppercase tracking-wide mb-2 flex items-center gap-1"><Target className="w-3.5 h-3.5" /> Materiality (ISA 320)</p>
                          <div className="grid grid-cols-4 gap-3 text-sm">
                            <div><p className="text-xs text-indigo-400">Overall Materiality (OM)</p><p className="font-bold text-indigo-900">{fmtPKR(analysis.materiality.overall_materiality)}</p></div>
                            <div><p className="text-xs text-indigo-400">Performance Materiality (PM)</p><p className="font-bold text-indigo-900">{fmtPKR(analysis.materiality.performance_materiality)}</p></div>
                            <div><p className="text-xs text-indigo-400">Trivial Threshold</p><p className="font-bold text-indigo-900">{fmtPKR(analysis.materiality.trivial_threshold || analysis.materiality.overall_materiality * 0.05)}</p></div>
                            <div><p className="text-xs text-indigo-400">Basis</p><p className="font-semibold text-indigo-900">{analysis.materiality.basis} × {analysis.materiality.percentage_used}%</p></div>
                          </div>
                          <p className="text-xs text-indigo-600 mt-2">{analysis.materiality.rationale}</p>
                        </div>
                      )}
                      {risks.inherent_risks && (
                        <div>
                          <p className="text-xs font-bold text-gray-600 uppercase tracking-wide mb-2 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5 text-amber-500" /> Inherent Risks — ISA 315</p>
                          <div className="grid grid-cols-2 gap-2">
                            {risks.inherent_risks.slice(0, 6).map((r: any, i: number) => (
                              <div key={i} className="flex items-start gap-2 bg-amber-50 rounded-lg p-2.5">
                                <RiskBadge level={r.level} />
                                <div>
                                  <p className="text-xs font-semibold text-gray-800">{r.area}</p>
                                  <p className="text-xs text-gray-500">{r.risk}</p>
                                  {r.assertions && r.assertions.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-1">
                                      {r.assertions.map((a: string) => <span key={a} className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">{a}</span>)}
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {risks.fraud_indicators && risks.fraud_indicators.length > 0 && (
                        <div className="bg-red-50 border border-red-100 rounded-xl p-3">
                          <p className="text-xs font-bold text-red-700 mb-2 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Fraud Indicators — ISA 240</p>
                          {risks.fraud_indicators.map((f: any, i: number) => (
                            <div key={i} className="text-xs text-red-800 mb-1">• <strong>{f.indicator}</strong>: {f.assessment}</div>
                          ))}
                        </div>
                      )}
                      {analysis.assumptions_made && analysis.assumptions_made.length > 0 && (
                        <div className="bg-yellow-50 border border-yellow-100 rounded-xl p-3">
                          <p className="text-xs font-bold text-yellow-700 mb-1 flex items-center gap-1"><Info className="w-3 h-3" /> Auditor Assumptions / Estimated Data</p>
                          <ul className="space-y-0.5">{analysis.assumptions_made.map((a, i) => <li key={i} className="text-xs text-yellow-800">• {a}</li>)}</ul>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Tab: Analytical Procedures (ISA 520) */}
                  {analysisTab === "ratios" && (
                    <div className="space-y-4">
                      <p className="text-xs font-bold text-gray-600 uppercase tracking-wide flex items-center gap-1"><Activity className="w-3.5 h-3.5 text-teal-500" /> Analytical Procedures — ISA 520</p>
                      {analysis.analytical_procedures?.ratios && (
                        <div>
                          <p className="text-xs font-semibold text-gray-700 mb-2">Ratio Analysis</p>
                          <div className="grid grid-cols-5 gap-2">
                            {[
                              { label: "Gross Margin", value: `${analysis.analytical_procedures.ratios.gross_margin_pct?.toFixed(1)}%`, good: (analysis.analytical_procedures.ratios.gross_margin_pct || 0) > 20 },
                              { label: "Net Margin", value: `${analysis.analytical_procedures.ratios.net_margin_pct?.toFixed(1)}%`, good: (analysis.analytical_procedures.ratios.net_margin_pct || 0) > 5 },
                              { label: "Current Ratio", value: analysis.analytical_procedures.ratios.current_ratio?.toFixed(2), good: (analysis.analytical_procedures.ratios.current_ratio || 0) >= 1 },
                              { label: "Quick Ratio", value: analysis.analytical_procedures.ratios.quick_ratio?.toFixed(2), good: (analysis.analytical_procedures.ratios.quick_ratio || 0) >= 1 },
                              { label: "Debt / Equity", value: analysis.analytical_procedures.ratios.debt_to_equity?.toFixed(2), good: (analysis.analytical_procedures.ratios.debt_to_equity || 0) < 2 },
                              { label: "Return on Assets", value: `${analysis.analytical_procedures.ratios.return_on_assets_pct?.toFixed(1)}%`, good: (analysis.analytical_procedures.ratios.return_on_assets_pct || 0) > 0 },
                              { label: "Asset Turnover", value: analysis.analytical_procedures.ratios.asset_turnover?.toFixed(2), good: (analysis.analytical_procedures.ratios.asset_turnover || 0) > 0.5 },
                              { label: "Receivables Days", value: `${analysis.analytical_procedures.ratios.receivables_days?.toFixed(0)}d`, good: (analysis.analytical_procedures.ratios.receivables_days || 999) < 60 },
                              { label: "Payables Days", value: `${analysis.analytical_procedures.ratios.payables_days?.toFixed(0)}d`, good: true },
                              { label: "Inventory Days", value: `${analysis.analytical_procedures.ratios.inventory_days?.toFixed(0)}d`, good: (analysis.analytical_procedures.ratios.inventory_days || 999) < 90 },
                            ].map(({ label, value, good }) => (
                              <div key={label} className={`rounded-xl p-3 border ${good ? "bg-green-50 border-green-100" : "bg-red-50 border-red-100"}`}>
                                <p className="text-xs text-gray-500 mb-0.5">{label}</p>
                                <p className={`text-base font-bold ${good ? "text-green-700" : "text-red-700"}`}>{value ?? "N/A"}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {analysis.analytical_procedures?.variance_analysis && analysis.analytical_procedures.variance_analysis.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-gray-700 mb-2">Variance Analysis (Current vs Prior Year)</p>
                          <div className="overflow-x-auto rounded-xl border border-gray-100">
                            <table className="w-full text-xs">
                              <thead><tr className="bg-blue-600 text-white"><th className="text-left p-2.5">Item</th><th className="text-right p-2.5">Current Year</th><th className="text-right p-2.5">Prior Year</th><th className="text-right p-2.5">Variance</th><th className="text-right p-2.5">%</th><th className="text-left p-2.5">Assessment</th></tr></thead>
                              <tbody>{analysis.analytical_procedures.variance_analysis.map((v: any, i: number) => (
                                <tr key={i} className={i % 2 === 0 ? "bg-gray-50" : ""}>
                                  <td className="p-2.5 font-medium">{v.item}</td>
                                  <td className="p-2.5 text-right">{fmtPKR(v.current_year)}</td>
                                  <td className="p-2.5 text-right">{fmtPKR(v.prior_year)}</td>
                                  <td className={`p-2.5 text-right font-semibold ${(v.variance_amount || 0) >= 0 ? "text-green-600" : "text-red-600"}`}>{fmtPKR(Math.abs(v.variance_amount))}</td>
                                  <td className={`p-2.5 text-right font-semibold ${(v.variance_pct || 0) >= 0 ? "text-green-600" : "text-red-600"}`}>{v.variance_pct?.toFixed(1)}%</td>
                                  <td className="p-2.5 text-gray-600">{v.assessment}</td>
                                </tr>
                              ))}</tbody>
                            </table>
                          </div>
                        </div>
                      )}
                      {analysis.analytical_procedures?.trend_analysis && (
                        <div className="bg-teal-50 rounded-xl p-3">
                          <p className="text-xs font-bold text-teal-700 mb-1">Trend Analysis</p>
                          <p className="text-xs text-teal-800">{analysis.analytical_procedures.trend_analysis}</p>
                        </div>
                      )}
                      {analysis.analytical_procedures?.analytical_conclusions && (
                        <div>
                          <p className="text-xs font-semibold text-gray-700 mb-1">Analytical Conclusions</p>
                          {analysis.analytical_procedures.analytical_conclusions.map((c, i) => <p key={i} className="text-xs text-gray-600 mb-1">• {c}</p>)}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Tab: Reconciliation */}
                  {analysisTab === "reconciliation" && (
                    <div className="space-y-3">
                      <p className="text-xs font-bold text-gray-600 uppercase tracking-wide flex items-center gap-1"><GitMerge className="w-3.5 h-3.5 text-indigo-500" /> Auto-Reconciliation Status</p>
                      {analysis.reconciliation ? (
                        <div className="grid grid-cols-2 gap-3">
                          {[
                            { key: "tb_vs_fs", label: "Trial Balance vs Financial Statements", data: analysis.reconciliation.tb_vs_fs },
                            { key: "tb_vs_gl", label: "Trial Balance vs General Ledger", data: analysis.reconciliation.tb_vs_gl },
                            { key: "opening_vs_prior_year", label: "Opening Balances vs Prior Year", data: analysis.reconciliation.opening_vs_prior_year },
                            { key: "bank_reconciliation", label: "Bank Reconciliation", data: analysis.reconciliation.bank_reconciliation },
                          ].map(({ key, label, data }) => {
                            if (!data) return null;
                            const ok = data.status === "Reconciled";
                            return (
                              <div key={key} className={`rounded-xl p-3.5 border ${ok ? "bg-green-50 border-green-100" : "bg-amber-50 border-amber-100"}`}>
                                <div className="flex items-center gap-2 mb-1">
                                  {ok ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <AlertTriangle className="w-4 h-4 text-amber-500" />}
                                  <span className={`text-xs font-bold ${ok ? "text-green-700" : "text-amber-700"}`}>{data.status}</span>
                                </div>
                                <p className="text-xs font-semibold text-gray-700">{label}</p>
                                {data.difference !== 0 && <p className="text-xs text-gray-500 mt-0.5">Diff: {fmtPKR(Math.abs(data.difference))}</p>}
                                <p className="text-xs text-gray-500 mt-0.5">{data.notes}</p>
                              </div>
                            );
                          })}
                        </div>
                      ) : <p className="text-xs text-gray-400">Reconciliation data not available — will be generated on document upload.</p>}
                      {analysis.reconciliation?.flags && analysis.reconciliation.flags.length > 0 && (
                        <div className="bg-red-50 border border-red-100 rounded-xl p-3">
                          <p className="text-xs font-bold text-red-700 mb-1">Flags Raised</p>
                          {analysis.reconciliation.flags.map((f, i) => <p key={i} className="text-xs text-red-800">⚠ {f}</p>)}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Tab: Evidence Items */}
                  {analysisTab === "evidence" && (
                    <div className="space-y-3">
                      <p className="text-xs font-bold text-gray-600 uppercase tracking-wide flex items-center gap-1"><Hash className="w-3.5 h-3.5 text-purple-500" /> Evidence Items — ISA 230 / ISA 500</p>
                      {analysis.evidence_items && analysis.evidence_items.length > 0 ? (
                        <div className="overflow-x-auto rounded-xl border border-gray-100">
                          <table className="w-full text-xs">
                            <thead><tr className="bg-purple-700 text-white"><th className="text-left p-2.5">Evidence ID</th><th className="text-left p-2.5">Filename</th><th className="text-left p-2.5">Type</th><th className="text-left p-2.5">Description</th><th className="text-left p-2.5">Date Received</th></tr></thead>
                            <tbody>{analysis.evidence_items.map((e, i) => (
                              <tr key={i} className={i % 2 === 0 ? "bg-gray-50" : ""}>
                                <td className="p-2.5 font-bold text-purple-700">{e.id}</td>
                                <td className="p-2.5 font-medium">{e.filename}</td>
                                <td className="p-2.5"><span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">{e.type}</span></td>
                                <td className="p-2.5 text-gray-600">{e.description}</td>
                                <td className="p-2.5 text-gray-500">{e.date_received || "—"}</td>
                              </tr>
                            ))}</tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="bg-gray-50 rounded-xl p-6 text-center">
                          <Hash className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                          <p className="text-xs text-gray-500">Evidence IDs will be generated based on uploaded documents.<br />Format: A-100 (TB), B-200 (GL), C-300 (Bank), D-400 (FS)</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Tab: Internal Control Weaknesses */}
                  {analysisTab === "ic" && (
                    <div className="space-y-3">
                      <p className="text-xs font-bold text-gray-600 uppercase tracking-wide flex items-center gap-1"><Shield className="w-3.5 h-3.5 text-blue-500" /> Internal Control Weaknesses — ISA 315 / ISA 265</p>
                      {analysis.internal_control_weaknesses && analysis.internal_control_weaknesses.length > 0 ? (
                        analysis.internal_control_weaknesses.map((w, i) => (
                          <div key={i} className={`rounded-xl border p-3.5 ${w.risk_level === "High" ? "bg-red-50 border-red-100" : w.risk_level === "Medium" ? "bg-amber-50 border-amber-100" : "bg-blue-50 border-blue-100"}`}>
                            <div className="flex items-center gap-2 mb-1">
                              <RiskBadge level={w.risk_level} />
                              <span className="text-xs font-bold text-gray-800">{w.area}</span>
                            </div>
                            <p className="text-xs text-gray-600 mb-1.5"><strong>Weakness:</strong> {w.weakness}</p>
                            <p className="text-xs text-blue-700"><strong>Recommendation:</strong> {w.recommendation}</p>
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-gray-400 text-center py-6">No internal control weaknesses identified from the uploaded documents.</p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                <h3 className="text-sm font-bold text-gray-900 mb-1 flex items-center gap-2"><Sparkles className="w-4 h-4 text-blue-500" /> Generate Working Papers</h3>
                <p className="text-xs text-gray-500 mb-4">{selectedPapers.length} working papers will be generated with ISA compliance, evidence cross-references, assertions, procedures, findings, and sign-offs.</p>

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
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <h2 className="text-base font-bold flex items-center gap-2"><FileOutput className="w-5 h-5" /> Audit Working Paper File Ready</h2>
                    <p className="text-blue-200 text-sm mt-0.5">{entityName} · {financialYear} · {workingPapers.length} working papers</p>
                  </div>
                  <div className="flex flex-wrap gap-2 shrink-0">
                    <Button onClick={handleExportExcel} disabled={exportingExcel} size="sm"
                      className="bg-emerald-500 hover:bg-emerald-400 text-white font-bold shadow-lg border-0">
                      {exportingExcel ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Excel...</> : <><Table className="w-3.5 h-3.5 mr-1.5" /> Excel</>}
                    </Button>
                    <Button onClick={handleExportDocx} disabled={exportingDocx} size="sm"
                      className="bg-sky-500 hover:bg-sky-400 text-white font-bold shadow-lg border-0">
                      {exportingDocx ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> DOCX...</> : <><FileSpreadsheet className="w-3.5 h-3.5 mr-1.5" /> DOCX</>}
                    </Button>
                    <Button onClick={handleExport} disabled={exporting} size="sm"
                      className="bg-white text-blue-700 hover:bg-blue-50 font-bold shadow-lg">
                      {exporting ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> PDF...</> : <><Download className="w-3.5 h-3.5 mr-1.5" /> PDF</>}
                    </Button>
                    <Button onClick={handleExportConfirmations} disabled={exportingConfirmations} size="sm"
                      className="bg-violet-500 hover:bg-violet-400 text-white font-bold shadow-lg border-0">
                      {exportingConfirmations ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Generating...</> : <><Mail className="w-3.5 h-3.5 mr-1.5" /> Confirmations</>}
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-3 mt-4">
                  {[
                    { label: "Working Papers", value: workingPapers.length },
                    { label: "Evidence Items", value: evidenceIndex.length || (analysis?.evidence_items?.length ?? "—") },
                    { label: "ISA Standards", value: "200–720" },
                    { label: "Compliance", value: "100%" },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-white/10 rounded-xl p-3 text-center">
                      <p className="text-blue-200 text-xs">{label}</p>
                      <p className="text-white font-bold text-lg">{value}</p>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-4 gap-2 mt-3">
                  {[
                    { icon: Table, color: "emerald", title: "Excel (.xlsx)", desc: "Cover · Index · Section tabs" },
                    { icon: FileSpreadsheet, color: "sky", title: "Word (.docx)", desc: "Editable · Full WPs · TOC" },
                    { icon: FileText, color: "red", title: "PDF (.pdf)", desc: "Formatted · Watermark · Sign-offs" },
                    { icon: Mail, color: "violet", title: "Confirmations", desc: "Bank · Debtors · Creditors · Legal" },
                  ].map(({ icon: Icon, color, title, desc }) => (
                    <div key={title} className="bg-white/10 rounded-xl p-2.5 flex items-start gap-2">
                      <div className={`w-7 h-7 bg-${color}-400/30 rounded-lg flex items-center justify-center shrink-0`}>
                        <Icon className={`w-3.5 h-3.5 text-${color}-200`} />
                      </div>
                      <div>
                        <p className="text-white font-semibold text-xs">{title}</p>
                        <p className="text-blue-200 text-xs mt-0.5">{desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Evidence Index */}
              {evidenceIndex.length > 0 && (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                  <button onClick={() => setExpandedSection(expandedSection === "__evidence__" ? null : "__evidence__")}
                    className="w-full flex items-center gap-3 p-4 hover:bg-gray-50 transition-colors text-left">
                    <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-purple-100 text-purple-700">Evidence Index</span>
                    <span className="font-semibold text-gray-900 text-sm">Audit Evidence — ISA 230 / ISA 500</span>
                    <Badge variant="secondary" className="ml-auto text-xs">{evidenceIndex.length} items</Badge>
                    {expandedSection === "__evidence__" ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                  </button>
                  <AnimatePresence>
                    {expandedSection === "__evidence__" && (
                      <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
                        <div className="px-4 pb-4 border-t border-gray-50 overflow-x-auto">
                          <table className="w-full text-xs mt-3">
                            <thead><tr className="bg-purple-700 text-white rounded-lg"><th className="text-left p-2.5 rounded-l-lg">Ref</th><th className="text-left p-2.5">Description</th><th className="text-left p-2.5">Type</th><th className="text-left p-2.5 rounded-r-lg">WPs Referenced</th></tr></thead>
                            <tbody>{evidenceIndex.map((e, i) => (
                              <tr key={i} className={i % 2 === 0 ? "bg-gray-50" : ""}>
                                <td className="p-2.5 font-bold text-purple-700">{e.ref}</td>
                                <td className="p-2.5 text-gray-700">{e.description}</td>
                                <td className="p-2.5"><span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full">{e.type}</span></td>
                                <td className="p-2.5 text-gray-500">{(e.wp_refs || []).join(", ")}</td>
                              </tr>
                            ))}</tbody>
                          </table>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}

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
                <Button variant="outline" onClick={() => { setStep(0); setFiles([]); setAnalysis(null); setWorkingPapers([]); setEvidenceIndex([]); setEntityName(""); }}>
                  <RefreshCw className="w-4 h-4 mr-2" /> New Engagement
                </Button>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={handleExportExcel} disabled={exportingExcel} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                    {exportingExcel ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Exporting...</> : <><Table className="w-4 h-4 mr-2" /> Excel</>}
                  </Button>
                  <Button onClick={handleExportDocx} disabled={exportingDocx} className="bg-sky-600 hover:bg-sky-700 text-white">
                    {exportingDocx ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> DOCX...</> : <><FileSpreadsheet className="w-4 h-4 mr-2" /> Word (DOCX)</>}
                  </Button>
                  <Button onClick={handleExport} disabled={exporting} className="bg-blue-600 hover:bg-blue-700">
                    {exporting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Exporting...</> : <><Download className="w-4 h-4 mr-2" /> PDF</>}
                  </Button>
                  <Button onClick={handleExportConfirmations} disabled={exportingConfirmations} className="bg-violet-600 hover:bg-violet-700 text-white">
                    {exportingConfirmations ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating...</> : <><Mail className="w-4 h-4 mr-2" /> Confirmations</>}
                  </Button>
                </div>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
}
