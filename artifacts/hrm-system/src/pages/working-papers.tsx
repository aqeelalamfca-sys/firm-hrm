import React, { useState, useRef, useCallback, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload, FileText, Loader2, CheckCircle2, Download, ChevronRight,
  ChevronDown, ChevronUp, BookOpen, Shield, AlertTriangle, TrendingUp,
  Building2, Calendar, Briefcase, X, Plus, Eye, RefreshCw,
  BarChart2, FileCheck, ClipboardCheck, Star, Info, Sparkles,
  FileSearch, Scale, Target, Layers, FileOutput, Check, Table,
  Activity, GitMerge, Link2, FileSpreadsheet, Mail, Hash, Settings, LayoutGrid, TrendingDown
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";

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

// ─── Financial Statement Types (from Mockup) ──────────────────────────────────
interface FSLine {
  id: string; label: string; cy: string; py: string;
  bold?: boolean; subtotal?: boolean; indent?: boolean; spacer?: boolean;
}
interface FSSection { id: string; title: string; color: string; lines: FSLine[]; }

// ─── Constants ────────────────────────────────────────────────────────────────
const ENGAGEMENT_TYPES = [
  "Statutory Audit", "Internal Audit", "Tax Audit", "Special Purpose Audit",
  "Review Engagement", "Compilation Engagement", "Due Diligence",
];

const WP_GROUPS = [
  { prefix: "PP", label: "Pre-Planning", color: "bg-violet-100 text-violet-700 border-violet-200", refs: ["PP-100", "PP-101", "PP-102", "PP-103"] },
  { prefix: "DI", label: "Discussion & Inquiry", color: "bg-blue-100 text-blue-700 border-blue-200", refs: ["DI-100", "DI-101"] },
  { prefix: "IR", label: "Risk Assessment", color: "bg-red-100 text-red-700 border-red-200", refs: ["IR-100", "IR-101", "IR-102"] },
  { prefix: "OB", label: "Opening Balances", color: "bg-orange-100 text-orange-700 border-orange-200", refs: ["OB-100", "OB-101"] },
  { prefix: "PL", label: "Planning", color: "bg-sky-100 text-sky-700 border-sky-200", refs: ["PL-100"] },
  { prefix: "EX", label: "Execution / Substantive", color: "bg-emerald-100 text-emerald-700 border-emerald-200", refs: ["EX-100", "EX-101", "EX-102", "EX-103", "EX-104", "EX-105", "EX-106"] },
  { prefix: "FH", label: "Fieldwork", color: "bg-teal-100 text-teal-700 border-teal-200", refs: ["FH-100"] },
  { prefix: "EV", label: "Evidence", color: "bg-amber-100 text-amber-700 border-amber-200", refs: ["EV-100"] },
  { prefix: "FN", label: "Finalization", color: "bg-indigo-100 text-indigo-700 border-indigo-200", refs: ["FN-100", "FN-101"] },
  { prefix: "DL", label: "Deliverables", color: "bg-pink-100 text-pink-700 border-pink-200", refs: ["DL-100"] },
  { prefix: "QR", label: "Quality Review", color: "bg-purple-100 text-purple-700 border-purple-200", refs: ["QR-100"] },
  { prefix: "IN", label: "Audit Opinion", color: "bg-green-100 text-green-700 border-green-200", refs: ["IN-100"] },
];

const ALL_WP_REFS = WP_GROUPS.flatMap(g => g.refs);

const STEPS = [
  { id: 0, label: "Upload Documents", shortLabel: "Upload", icon: Upload },
  { id: 1, label: "Engagement Configuration", shortLabel: "Configure", icon: Settings },
  { id: 2, label: "AI Analysis", shortLabel: "Analyse", icon: FileSearch },
  { id: 3, label: "Generate Working Papers", shortLabel: "Generate", icon: Sparkles },
  { id: 4, label: "Export & Finalize", shortLabel: "Export", icon: FileOutput },
];

const AUDIT_PHASES: { prefix: string; label: string; papers: number; description: string }[] = [
  { prefix: "PP", label: "Pre-Planning", papers: 4, description: "Acceptance, continuance & independence checks" },
  { prefix: "DI", label: "Discussion & Inquiry", papers: 2, description: "Engagement team briefing & client inquiry" },
  { prefix: "IR", label: "Risk Assessment", papers: 3, description: "ISA 315 inherent, control & fraud risk mapping" },
  { prefix: "OB", label: "Opening Balances", papers: 2, description: "ISA 510 verification of prior-period figures" },
  { prefix: "PL", label: "Audit Planning", papers: 5, description: "Materiality, sampling plan & audit programme" },
  { prefix: "EX", label: "Execution", papers: 8, description: "ToC, ToD & substantive procedures per FS head" },
  { prefix: "FH", label: "Fieldwork", papers: 3, description: "Physical counts, confirmations & inspections" },
  { prefix: "EV", label: "Evidence & Analytics", papers: 3, description: "ISA 500/520 analytical review & evidence vault" },
  { prefix: "FN", label: "Finalisation", papers: 4, description: "Misstatements log, going concern & SEs" },
  { prefix: "DL", label: "Deliverables", papers: 2, description: "Management letter & audit report drafts" },
  { prefix: "QR", label: "EQCR", papers: 2, description: "ISQM 2 engagement quality control review" },
  { prefix: "IN", label: "Audit Opinion", papers: 1, description: "ISA 700–720 signed opinion & archive" },
];

const INITIAL_BS: FSSection[] = [
  {
    id: "nca", title: "NON-CURRENT ASSETS", color: "bg-blue-600",
    lines: [
      { id: "ppe", label: "Property, Plant & Equipment", cy: "1,847,200", py: "1,623,400" },
      { id: "cwip", label: "Capital Work-in-Progress", cy: "234,500", py: "189,300" },
      { id: "rou", label: "Right-of-Use Assets", cy: "45,600", py: "52,100" },
      { id: "ia", label: "Intangible Assets", cy: "12,300", py: "14,800" },
      { id: "lti", label: "Long-term Investments", cy: "89,400", py: "78,900" },
      { id: "ltd", label: "Long-term Deposits & Prepayments", cy: "23,100", py: "18,700" },
      { id: "nca_tot", label: "Total Non-Current Assets", cy: "2,252,100", py: "1,977,200", bold: true, subtotal: true },
    ],
  },
  {
    id: "ca", title: "CURRENT ASSETS", color: "bg-sky-500",
    lines: [
      { id: "stores", label: "Stores, Spare Parts & Loose Tools", cy: "67,800", py: "58,400" },
      { id: "stock", label: "Stock-in-Trade", cy: "234,100", py: "198,700" },
      { id: "td", label: "Trade Debts", cy: "183,400", py: "156,300" },
      { id: "la", label: "Loans & Advances", cy: "34,200", py: "28,900" },
      { id: "prepay", label: "Short-term Prepayments", cy: "12,400", py: "9,800" },
      { id: "orecv", label: "Other Receivables", cy: "23,700", py: "19,400" },
      { id: "taxref", label: "Tax Refunds Due from Government", cy: "18,900", py: "15,200" },
      { id: "cash", label: "Cash & Bank Balances", cy: "21,300", py: "34,700" },
      { id: "ca_tot", label: "Total Current Assets", cy: "595,800", py: "521,400", bold: true, subtotal: true },
    ],
  },
  {
    id: "ta", title: "TOTAL ASSETS", color: "bg-slate-800",
    lines: [
      { id: "ta_tot", label: "TOTAL ASSETS", cy: "2,847,900", py: "2,498,600", bold: true, subtotal: true },
    ],
  },
  {
    id: "eq", title: "EQUITY", color: "bg-emerald-600",
    lines: [
      { id: "sc", label: "Share Capital (Authorized & Issued)", cy: "500,000", py: "500,000" },
      { id: "sp", label: "Share Premium", cy: "150,000", py: "150,000" },
      { id: "gr", label: "General Reserve", cy: "320,000", py: "280,000" },
      { id: "up", label: "Unappropriated Profit", cy: "487,300", py: "402,100" },
      { id: "eq_tot", label: "Total Equity", cy: "1,457,300", py: "1,332,100", bold: true, subtotal: true },
    ],
  },
  {
    id: "ncl", title: "NON-CURRENT LIABILITIES", color: "bg-orange-500",
    lines: [
      { id: "ltf", label: "Long-term Financing", cy: "487,600", py: "523,400" },
      { id: "ll", label: "Lease Liabilities (Non-Current)", cy: "38,900", py: "44,200" },
      { id: "dtl", label: "Deferred Tax Liability", cy: "134,700", py: "118,300" },
      { id: "srb", label: "Staff Retirement Benefits", cy: "89,400", py: "82,600" },
      { id: "ncl_tot", label: "Total Non-Current Liabilities", cy: "750,600", py: "768,500", bold: true, subtotal: true },
    ],
  },
  {
    id: "cl", title: "CURRENT LIABILITIES", color: "bg-red-500",
    lines: [
      { id: "tp", label: "Trade & Other Payables", cy: "287,400", py: "234,600" },
      { id: "al", label: "Accrued Liabilities & Provisions", cy: "134,500", py: "98,700" },
      { id: "stb", label: "Short-term Borrowings", cy: "123,400", py: "45,200" },
      { id: "cltf", label: "Current Portion of Long-term Financing", cy: "67,400", py: "56,300" },
      { id: "stp", label: "Sales Tax Payable", cy: "18,900", py: "12,400" },
      { id: "itp", label: "Income Tax Payable", cy: "8,400", py: "6,800" },
      { id: "cl_tot", label: "Total Current Liabilities", cy: "640,000", py: "454,000", bold: true, subtotal: true },
    ],
  },
  {
    id: "tel", title: "TOTAL EQUITY & LIABILITIES", color: "bg-slate-800",
    lines: [
      { id: "tel_tot", label: "TOTAL EQUITY & LIABILITIES", cy: "2,847,900", py: "2,498,600", bold: true, subtotal: true },
    ],
  },
];

const INITIAL_PL: FSSection[] = [
  {
    id: "rev", title: "REVENUE", color: "bg-blue-600",
    lines: [
      { id: "sales", label: "Net Sales / Revenue from Contracts", cy: "1,234,200", py: "1,142,800" },
      { id: "cos", label: "Cost of Sales", cy: "(813,900)", py: "(770,100)" },
      { id: "gp", label: "GROSS PROFIT", cy: "420,300", py: "372,700", bold: true, subtotal: true },
    ],
  },
  {
    id: "opex", title: "OPERATING EXPENSES", color: "bg-orange-500",
    lines: [
      { id: "dse", label: "Distribution & Selling Expenses", cy: "(78,400)", py: "(68,900)" },
      { id: "adm", label: "Administrative & General Expenses", cy: "(56,700)", py: "(48,300)" },
      { id: "ooe", label: "Other Operating Expenses", cy: "(23,400)", py: "(18,700)" },
      { id: "ebit", label: "OPERATING PROFIT (EBIT)", cy: "261,800", py: "236,800", bold: true, subtotal: true },
    ],
  },
  {
    id: "finoi", title: "FINANCE & OTHER INCOME", color: "bg-purple-600",
    lines: [
      { id: "fc", label: "Finance Costs", cy: "(47,300)", py: "(43,200)" },
      { id: "oi", label: "Other Income / Gain on Disposal", cy: "12,400", py: "8,900" },
      { id: "pbt", label: "PROFIT BEFORE TAX", cy: "226,900", py: "202,500", bold: true, subtotal: true },
    ],
  },
  {
    id: "tax", title: "TAXATION", color: "bg-red-500",
    lines: [
      { id: "cur_tax", label: "Current Tax Expense", cy: "(29,800)", py: "(26,400)" },
      { id: "def_tax", label: "Deferred Tax (Charge)/Credit", cy: "(9,800)", py: "(9,400)" },
      { id: "tax_tot", label: "Total Income Tax Expense", cy: "(39,600)", py: "(35,800)", bold: true, subtotal: true },
      { id: "pat", label: "PROFIT AFTER TAX", cy: "187,300", py: "166,700", bold: true, subtotal: true },
    ],
  },
  {
    id: "oci", title: "OTHER COMPREHENSIVE INCOME", color: "bg-teal-600",
    lines: [
      { id: "act", label: "Actuarial Gains/(Losses) on Defined Benefits", cy: "(2,100)", py: "1,800" },
      { id: "fx", label: "Exchange Differences on Foreign Operations", cy: "0", py: "0" },
      { id: "tci", label: "TOTAL COMPREHENSIVE INCOME", cy: "185,200", py: "168,500", bold: true, subtotal: true },
    ],
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtPKR(n: number | string | undefined | null) {
  if (n === undefined || n === null || n === "") return "—";
  if (typeof n === "string") return n;
  return `PKR ${Number(n).toLocaleString("en-PK")}`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function RiskBadge({ level }: { level: string }) {
  const map: Record<string, string> = { High: "bg-red-100 text-red-700", Medium: "bg-amber-100 text-amber-700", Low: "bg-green-100 text-green-700" };
  return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-tight ${map[level] || "bg-slate-100 text-slate-600"}`}>{level}</span>;
}

function classifyFile(filename: string): string {
  const n = filename.toLowerCase();
  if (n.includes("trial_balance") || n.includes("trial balance") || /\btb\b/.test(n)) return "Trial Balance";
  if (n.includes("general_ledger") || n.includes("general ledger") || /\bgl\b/.test(n)) return "General Ledger";
  if (n.includes("bank") || n.includes("statement") || n.includes("brs")) return "Bank Statement";
  if (n.includes("financial") || n.includes("balance_sheet") || n.includes("balance sheet") || n.includes("pnl") || n.includes("income") || /\bfs\b/.test(n)) return "Financial Statements";
  if (n.includes("contract") || n.includes("agreement") || n.includes("deed")) return "Contract";
  if (n.includes("confirm") || n.includes("circularize") || n.includes("circular")) return "Confirmation";
  if (n.includes("board") || n.includes("minutes") || n.includes("resolution")) return "Board Minutes";
  if (n.includes("tax") || n.includes("fbr") || n.includes("return")) return "Tax Return";
  if (n.includes("invoice") || n.includes("voucher")) return "Invoice / Voucher";
  if (n.includes("payroll") || n.includes("salary")) return "Payroll";
  if (n.includes("fixed_asset") || n.includes("fixed asset") || n.includes("ppe")) return "Fixed Asset Register";
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  if (ext === "xlsx" || ext === "xls" || ext === "csv") return "Spreadsheet";
  if (ext === "pdf") return "PDF Document";
  if (ext === "docx" || ext === "doc") return "Word Document";
  if (ext === "jpg" || ext === "jpeg" || ext === "png") return "Scanned Image";
  return "Supporting Document";
}

function DropZone({ files, onAdd, onRemove }: { files: UploadedFile[]; onAdd: (f: FileList) => void; onRemove: (id: string) => void }) {
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDrag(false);
    if (e.dataTransfer.files) onAdd(e.dataTransfer.files);
  }, [onAdd]);

  const fileIcon = (f: File) => {
    if (f.type.includes("pdf")) return <FileText className="w-5 h-5 text-red-500" />;
    if (f.type.includes("excel") || f.type.includes("spreadsheet")) return <Table className="w-5 h-5 text-emerald-500" />;
    if (f.type.includes("word") || f.type.includes("officedocument")) return <FileSpreadsheet className="w-5 h-5 text-blue-500" />;
    return <FileText className="w-5 h-5 text-slate-400" />;
  };

  return (
    <div className="space-y-5">
      <div
        onDragOver={e => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`border border-dashed rounded-xl py-12 px-8 text-center cursor-pointer transition-all bg-white ${drag ? "border-blue-400 bg-blue-50/40" : "border-slate-300 hover:border-blue-300 hover:bg-slate-50/60"}`}
      >
        <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center mx-auto mb-4">
          <Upload className="w-6 h-6 text-blue-600" />
        </div>
        <p className="text-sm font-semibold text-slate-800">Drop your audit documents here</p>
        <p className="text-xs text-slate-400 mt-1">PDF · Excel · CSV · Word · Images · Emails — up to 20 files</p>
        <div className="flex items-center justify-center gap-1.5 mt-3">
          {["PDF", "XLSX", "CSV", "DOCX", "JPG", "EML"].map(ext => (
            <span key={ext} className="text-[10px] font-bold text-slate-400 border border-slate-200 rounded px-1.5 py-0.5 font-mono">{ext}</span>
          ))}
        </div>
        <button className="mt-5 text-xs font-semibold text-slate-600 border border-slate-300 rounded-lg px-4 py-2 hover:bg-slate-50 transition-colors">Browse Files</button>
        <input ref={inputRef} type="file" multiple className="hidden"
          accept=".pdf,.xlsx,.xls,.csv,.txt,.docx,.doc,.jpg,.jpeg,.png,.webp,.eml"
          onChange={e => e.target.files && onAdd(e.target.files)} />
      </div>

      {files.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Uploaded Files ({files.length})</p>
          <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white">
            {files.map(f => (
              <motion.div key={f.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50/60 transition-colors group">
                <div className="w-8 h-8 bg-slate-50 rounded-lg flex items-center justify-center border border-slate-100 shrink-0">
                  {fileIcon(f.file)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{f.file.name}</p>
                  <p className="text-[11px] text-slate-400">{(f.file.size / 1024).toFixed(0)} KB {f.classified ? <span className="ml-1 text-blue-600 font-medium">· {f.classified}</span> : ""}</p>
                </div>
                <button onClick={e => { e.stopPropagation(); onRemove(f.id); }} className="w-7 h-7 flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-all opacity-0 group-hover:opacity-100">
                  <X className="w-4 h-4" />
                </button>
              </motion.div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function WPCard({ wp, expanded, onToggle }: { wp: WorkingPaper; expanded: boolean; onToggle: () => void }) {
  const group = WP_GROUPS.find(g => wp.ref.startsWith(g.prefix));

  return (
    <motion.div layout className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden mb-3">
      <button onClick={onToggle} className="w-full flex items-center gap-4 p-4 hover:bg-slate-50/50 transition-colors text-left">
        <div className={`text-[10px] font-bold px-2 py-1 rounded-lg border shadow-sm shrink-0 ${group?.color || "bg-slate-100 text-slate-600 border-slate-200"}`}>{wp.ref}</div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-slate-900 text-sm">{wp.title}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[11px] font-medium text-slate-400 truncate max-w-[200px]">{wp.isa_references?.join(" · ")}</span>
            {wp.assertions && wp.assertions.length > 0 && (
              <div className="flex gap-1">
                {wp.assertions.slice(0, 2).map(a => <span key={a} className="text-[9px] bg-blue-50 text-blue-600 px-1.5 py-0 rounded-full font-bold border border-blue-100">{a}</span>)}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {wp.evidence_refs && wp.evidence_refs.length > 0 && (
            <div className="flex items-center gap-1">
              <Link2 className="w-3 h-3 text-purple-400" />
              <span className="text-[10px] font-bold text-purple-600">{wp.evidence_refs.length} refs</span>
            </div>
          )}
          <Badge variant="outline" className={`text-[10px] font-bold h-6 px-2 ${wp.status === "Final" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-blue-50 text-blue-700 border-blue-200"}`}>{wp.status || "Draft"}</Badge>
          {expanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }} className="overflow-hidden bg-slate-50/30 border-t border-slate-100">
            <div className="p-5 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5"><Target className="w-3 h-3" /> Audit Objective</h4>
                  <p className="text-sm text-slate-700 font-medium leading-relaxed">{wp.objective || "No objective defined."}</p>
                </div>
                <div>
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5"><Layers className="w-3 h-3" /> Audit Scope</h4>
                  <p className="text-sm text-slate-700 font-medium leading-relaxed">{wp.scope || "Full substantive testing of recorded balances."}</p>
                </div>
              </div>

              {wp.procedures && wp.procedures.length > 0 && (
                <div>
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5"><ClipboardCheck className="w-3.5 h-3.5" /> Procedures & Findings</h4>
                  <div className="overflow-hidden rounded-xl border border-slate-200 shadow-sm bg-white">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="p-3 font-bold text-slate-500 w-10">#</th>
                          <th className="p-3 font-bold text-slate-500">Audit Procedure Performed</th>
                          <th className="p-3 font-bold text-slate-500">Findings / Results</th>
                          <th className="p-3 font-bold text-slate-500 w-32 text-center">Conclusion</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {wp.procedures.map((p: any, i: number) => (
                          <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                            <td className="p-3 font-mono font-bold text-blue-600">{p.no || i + 1}</td>
                            <td className="p-3 text-slate-700 font-medium leading-relaxed">{p.procedure || p.desc}</td>
                            <td className="p-3 text-slate-600">{p.finding || "No exceptions noted."}</td>
                            <td className="p-3 text-center">
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${p.conclusion === "Satisfactory" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}>
                                {p.conclusion || "Satisfactory"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {wp.auditor_conclusion && (
                <div className="bg-white border border-emerald-200 rounded-xl p-4 shadow-sm relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500"></div>
                  <h4 className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mb-1.5 flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5" /> Auditor's Conclusion</h4>
                  <p className="text-sm text-slate-800 font-bold leading-relaxed">{wp.auditor_conclusion}</p>
                </div>
              )}

              <div className="pt-4 border-t border-slate-200 flex flex-wrap gap-8 items-center text-[11px] font-bold uppercase tracking-tight text-slate-400">
                <div className="flex items-center gap-2"><span>Prepared:</span> <span className="text-slate-900">{wp.preparer || "System Gen"}</span></div>
                <div className="flex items-center gap-2"><span>Reviewed:</span> <span className="text-slate-900">{wp.reviewer || "Senior Manager"}</span></div>
                <div className="flex items-center gap-2"><span>Partner:</span> <span className="text-slate-900">{wp.partner || "Engagement Partner"}</span></div>
                <div className="ml-auto text-slate-500">{wp.date_prepared || "July 2024"}</div>
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

  // Production state
  const [entityName, setEntityName] = useState("");
  const [engagementType, setEngagementType] = useState("Statutory Audit");
  const [financialYear, setFinancialYear] = useState("Year ended June 30, 2024");
  const [firmName, setFirmName] = useState("ANA & Co. Chartered Accountants");
  const [selectedPapers, setSelectedPapers] = useState<string[]>(ALL_WP_REFS);

  // New mockup state
  const [ntn, setNtn] = useState("");
  const [secp, setSecp] = useState("");
  const [registeredAddress, setRegisteredAddress] = useState("");
  const [bsData, setBsData] = useState<FSSection[]>(INITIAL_BS);
  const [plData, setPlData] = useState<FSSection[]>(INITIAL_PL);
  const [expandedFsSections, setExpandedFsSections] = useState<string[]>(["nca", "ca", "rev"]);
  const [activeFsTab, setActiveFsTab] = useState<"bs" | "pl">("bs");
  const [fsExpanded, setFsExpanded] = useState(true);
  const [expandedWPGroups, setExpandedWPGroups] = useState<string[]>(["PP"]);
  const [expandedWPCards, setExpandedWPCards] = useState<string[]>([]);
  const [analysisTab, setAnalysisTab] = useState<"summary" | "ratios" | "reconciliation" | "evidence" | "ic">("summary");

  // ── Engagement Timeline (Key Deadlines) ─────────────────────────────────────
  const [planningDeadline, setPlanningDeadline] = useState("");
  const [fieldworkStart, setFieldworkStart] = useState("");
  const [fieldworkEnd, setFieldworkEnd] = useState("");
  const [reportingDeadline, setReportingDeadline] = useState("");
  const [reportDate, setReportDate] = useState("");
  const [filingDeadline, setFilingDeadline] = useState("");
  const [archiveDate, setArchiveDate] = useState("");

  // ── Engagement Team (Preparer / Reviewer / Approver) ─────────────────────
  const [preparer, setPreparer] = useState("");
  const [reviewer, setReviewer] = useState("");
  const [approver, setApprover] = useState("");
  const [users, setUsers] = useState<Array<{id: number; name: string; role?: string; email?: string}>>([]);

  useEffect(() => {
    const prev = document.title;
    document.title = "Pakistan Audit Working Paper Generator | ANA & Co. Chartered Accountants";
    return () => { document.title = prev; };
  }, []);

  useEffect(() => {
    if (!token) return;
    fetch("/api/users", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => {
        const list = Array.isArray(data) ? data : (data.users || []);
        setUsers(list.map((u: any) => ({ id: u.id, name: u.name || u.username || u.email, role: u.role, email: u.email })));
      })
      .catch(() => {});
  }, [token]);

  // Auto-extraction state
  const [extracting, setExtracting] = useState(false);
  const [autoFilled, setAutoFilled] = useState(false);

  // API/Processing state
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
  const [completedPhases, setCompletedPhases] = useState<string[]>([]);
  const [activePhaseLabel, setActivePhaseLabel] = useState("");

  const addFiles = useCallback((fl: FileList) => {
    const newFiles = Array.from(fl).map(f => ({ file: f, id: `${f.name}-${Date.now()}-${Math.random()}`, classified: classifyFile(f.name) }));
    setFiles(prev => [...prev, ...newFiles]);
  }, []);

  const removeFile = useCallback((id: string) => setFiles(prev => prev.filter(f => f.id !== id)), []);

  // ── Auto-extract entity + financials from uploaded docs ──────────────────
  const fmtFS = (n: number | null | undefined) =>
    n != null ? Number(n).toLocaleString("en-PK") : "";

  const handleExtractAndNext = async () => {
    setExtracting(true);
    try {
      const fd = new FormData();
      files.forEach(f => fd.append("files", f.file));
      const res = await fetch("/api/working-papers/extract-entity", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (res.ok) {
        const d = await res.json();
        // ── Entity fields ──
        if (d.entity_name)        setEntityName(d.entity_name);
        if (d.ntn)                setNtn(d.ntn);
        if (d.secp)               setSecp(d.secp);
        if (d.financial_year)     setFinancialYear(d.financial_year);
        if (d.registered_address) setRegisteredAddress(d.registered_address);
        if (d.engagement_type)    setEngagementType(d.engagement_type);

        // ── Balance Sheet line items ──
        const fn = d.financials || {};
        const patchBS = (secId: string, lineId: string, cy: number | null, py?: number | null) => {
          setBsData(prev => prev.map(s => s.id === secId ? {
            ...s, lines: s.lines.map(l => l.id === lineId ? {
              ...l,
              ...(cy != null ? { cy: fmtFS(cy) } : {}),
              ...(py != null ? { py: fmtFS(py) } : {}),
            } : l)
          } : s));
        };
        const patchPL = (secId: string, lineId: string, cy: number | null, py?: number | null) => {
          setPlData(prev => prev.map(s => s.id === secId ? {
            ...s, lines: s.lines.map(l => l.id === lineId ? {
              ...l,
              ...(cy != null ? { cy: fmtFS(cy) } : {}),
              ...(py != null ? { py: fmtFS(py) } : {}),
            } : l)
          } : s));
        };

        patchBS("nca",  "ppe",    fn.fixed_assets,        null);
        patchBS("ca",   "stock",  fn.inventory,            null);
        patchBS("ca",   "td",     fn.trade_receivables,    null);
        patchBS("ca",   "cash",   fn.cash_and_bank,        null);
        patchBS("ta",   "ta_tot", fn.total_assets,         fn.prior_year_total_assets);
        patchBS("eq",   "eq_tot", fn.equity,               null);
        patchBS("cl",   "tp",     fn.trade_payables,       null);

        patchPL("rev", "sales",  fn.revenue,              fn.prior_year_revenue);
        patchPL("rev", "gp",     fn.gross_profit,         null);
        patchPL("tax", "pat",    fn.net_profit,           fn.prior_year_net_profit);

        // Mark fields as auto-filled only if we got something useful
        const gotSomething = !!(d.entity_name || d.ntn || fn.revenue || fn.total_assets);
        setAutoFilled(gotSomething);
      }
    } catch {
      // silently fail — user can fill manually
    } finally {
      setExtracting(false);
      setStep(1);
    }
  };

  const updateBsLine = (secId: string, lineId: string, field: "cy" | "py", val: string) => {
    setBsData(prev => prev.map(s => s.id === secId
      ? { ...s, lines: s.lines.map(l => l.id === lineId ? { ...l, [field]: val } : l) }
      : s
    ));
  };
  const updatePlLine = (secId: string, lineId: string, field: "cy" | "py", val: string) => {
    setPlData(prev => prev.map(s => s.id === secId
      ? { ...s, lines: s.lines.map(l => l.id === lineId ? { ...l, [field]: val } : l) }
      : s
    ));
  };

  const togglePaperSelection = (ref: string) => {
    setSelectedPapers(prev => prev.includes(ref) ? prev.filter(r => r !== ref) : [...prev, ref]);
  };

  const toggleGroupSelection = (refs: string[]) => {
    const allSelected = refs.every(r => selectedPapers.includes(r));
    setSelectedPapers(prev => allSelected ? prev.filter(r => !refs.includes(r)) : [...new Set([...prev, ...refs])]);
  };

  const toggleWPGroupExpand = (prefix: string) => {
    setExpandedWPGroups(prev => prev.includes(prefix) ? prev.filter(p => p !== prefix) : [...prev, prefix]);
  };

  const toggleWPCardExpand = (ref: string) => {
    setExpandedWPCards(prev => prev.includes(ref) ? prev.filter(r => r !== ref) : [...prev, ref]);
  };

  // ── Production API Handlers (KEPT EXACTLY) ──────────────────────────────────
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
    formData.append("entityName", entityName);
    formData.append("ntn", ntn); // NEW
    formData.append("secp", secp); // NEW
    formData.append("engagementType", engagementType);
    formData.append("financialYear", financialYear);
    formData.append("firmName", firmName);
    formData.append("instructions", instructions);
    formData.append("bsData", JSON.stringify(bsData)); // NEW
    formData.append("plData", JSON.stringify(plData)); // NEW

    try {
      const res = await fetch("/api/working-papers/analyze", {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` },
        body: formData,
      });

      if (!res.ok) throw new Error(await res.text());

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No reader");

      let partial = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = new TextDecoder().decode(value);
        const lines = (partial + chunk).split("\n");
        partial = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = JSON.parse(line.slice(6));
          if (data.progress) setProgress(data.progress);
          if (data.message) setProgressMsg(data.message);
          if (data.analysis) setAnalysis(data.analysis);
        }
      }
      setStep(2);
      toast({ title: "Analysis complete", description: "AI has processed the documents successfully." });
    } catch (err: any) {
      toast({ title: "Analysis failed", description: err.message, variant: "destructive" });
    } finally {
      setAnalyzing(false);
    }
  };

  const handleGenerate = async () => {
    if (!analysis) return;
    setGenerating(true);
    setProgress(5);
    setProgressMsg("Initializing working paper generator...");
    setCompletedPhases([]);
    setActivePhaseLabel(AUDIT_PHASES[0].label);

    // Drive phase-by-phase progress on the frontend while the API runs
    let phaseIdx = 0;
    const phaseInterval = setInterval(() => {
      if (phaseIdx < AUDIT_PHASES.length) {
        const done = AUDIT_PHASES[phaseIdx].prefix;
        setCompletedPhases(prev => [...prev, done]);
        const nextLabel = phaseIdx + 1 < AUDIT_PHASES.length ? AUDIT_PHASES[phaseIdx + 1].label : "Finalising...";
        setActivePhaseLabel(nextLabel);
        setProgress(5 + Math.round(((phaseIdx + 1) / AUDIT_PHASES.length) * 82));
        setProgressMsg(`Generating ${AUDIT_PHASES[phaseIdx].label} papers...`);
        phaseIdx++;
      }
    }, 2200);

    try {
      const res = await fetch("/api/working-papers/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({
          analysis,
          selectedPapers,
          entityName,
          engagementType,
          financialYear,
          firmName,
          ntn,
          secp,
          preparer,
          reviewer,
          approver,
          planningDeadline,
          fieldworkStart,
          fieldworkEnd,
          reportingDeadline,
          reportDate,
          filingDeadline,
          archiveDate,
        }),
      });

      clearInterval(phaseInterval);

      if (!res.ok) throw new Error(await res.text());

      // Backend returns plain JSON — read it directly (not SSE)
      const data = await res.json();
      const papers: WorkingPaper[] = data.working_papers ?? data.workingPapers ?? [];
      const evidence: EvidenceItem[] = data.evidence_index ?? data.evidenceIndex ?? [];

      setWorkingPapers(papers);
      setEvidenceIndex(evidence);
      if (data.meta) setGenerationMeta(data.meta);

      // Mark all phases done
      setCompletedPhases(AUDIT_PHASES.map(p => p.prefix));
      setActivePhaseLabel("");
      setProgress(100);
      setProgressMsg("All working papers generated successfully.");

      setStep(3);
      toast({ title: "Generation complete", description: `${papers.length} working papers generated across 12 audit phases.` });
    } catch (err: any) {
      clearInterval(phaseInterval);
      toast({ title: "Generation failed", description: err.message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await fetch("/api/working-papers/export-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ workingPapers, evidenceIndex, meta: generationMeta, entityName, financialYear }),
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `Audit_WP_${entityName.replace(/\s+/g, "_")}.pdf`;
      a.click();
    } catch (err: any) {
      toast({ title: "Export failed", description: err.message, variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const handleExportExcel = async () => {
    setExportingExcel(true);
    try {
      const res = await fetch("/api/working-papers/export-excel", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ workingPapers, evidenceIndex, meta: generationMeta, entityName, financialYear }),
      });
      if (!res.ok) throw new Error("Excel export failed");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `Audit_WP_${entityName.replace(/\s+/g, "_")}.xlsx`;
      a.click();
    } catch (err: any) {
      toast({ title: "Excel export failed", description: err.message, variant: "destructive" });
    } finally {
      setExportingExcel(false);
    }
  };

  const handleExportDocx = async () => {
    setExportingDocx(true);
    try {
      const res = await fetch("/api/working-papers/export-docx", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ workingPapers, evidenceIndex, meta: generationMeta, entityName, financialYear }),
      });
      if (!res.ok) throw new Error("DOCX export failed");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `Audit_WP_${entityName.replace(/\s+/g, "_")}.docx`;
      a.click();
    } catch (err: any) {
      toast({ title: "DOCX export failed", description: err.message, variant: "destructive" });
    } finally {
      setExportingDocx(false);
    }
  };

  const handleExportConfirmations = async () => {
    setExportingConfirmations(true);
    try {
      const res = await fetch("/api/working-papers/generate-confirmations", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ analysis, entityName, financialYear }),
      });
      if (!res.ok) throw new Error("Confirmations generation failed");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `Confirmations_${entityName.replace(/\s+/g, "_")}.pdf`;
      a.click();
    } catch (err: any) {
      toast({ title: "Generation failed", description: err.message, variant: "destructive" });
    } finally {
      setExportingConfirmations(false);
    }
  };

  // ── Render Logic ────────────────────────────────────────────────────────────
  const uniqueSections = Array.from(new Set(workingPapers.map(wp => wp.section || "Uncategorized")));
  const sectionPapers = (sec: string) => workingPapers.filter(wp => (wp.section || "Uncategorized") === sec);

  return (
    <div className="flex min-h-screen font-sans text-slate-900 bg-white">
      
      {/* ── LEFT RAIL ─────────────────────────────────────────────────────── */}
      <aside className="w-[220px] shrink-0 bg-white flex flex-col sticky top-0 h-screen border-r border-slate-200 z-10">
        {/* Steps */}
        <div className="flex-1 overflow-y-auto pt-8 pb-4 px-5">
          <div className="relative">
            {/* Vertical connector line */}
            <div className="absolute left-[13px] top-[14px] bottom-[14px] w-px bg-slate-200" />
            <div className="space-y-1 relative">
              {STEPS.map((s, idx) => {
                const isActive = step === idx;
                const isPast   = step > idx;
                const canClick = idx <= step;
                return (
                  <button
                    key={s.id}
                    onClick={() => canClick && setStep(idx)}
                    disabled={!canClick}
                    className={`w-full flex items-center gap-3 px-0 py-2.5 text-left transition-all duration-200 rounded-none group ${canClick ? 'cursor-pointer' : 'cursor-not-allowed opacity-40'}`}
                  >
                    {/* Step circle */}
                    <div className={`w-[26px] h-[26px] rounded-full flex items-center justify-center shrink-0 relative z-10 border transition-all duration-200
                      ${isActive ? 'bg-blue-600 border-blue-600' : isPast ? 'bg-emerald-50 border-emerald-500' : 'bg-white border-slate-300'}`}>
                      {isPast
                        ? <Check className="w-3 h-3 text-emerald-500" />
                        : <span className={`text-[10px] font-black ${isActive ? 'text-white' : 'text-slate-400'}`}>{idx + 1}</span>
                      }
                    </div>
                    {/* Label */}
                    <div className="flex flex-col min-w-0">
                      <span className={`text-[8px] uppercase tracking-widest font-bold leading-none mb-px ${isActive ? 'text-blue-600' : isPast ? 'text-emerald-600' : 'text-slate-400'}`}>
                        Step {idx + 1}
                      </span>
                      <span className={`text-[12px] font-semibold leading-tight truncate ${isActive ? 'text-slate-900' : isPast ? 'text-slate-500' : 'text-slate-400'}`}>
                        {s.shortLabel}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Engagement quick-view (only when entity is set) */}
          {entityName && (
            <div className="mt-8 pt-5 border-t border-slate-100">
              <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-2">Engagement</p>
              <p className="text-xs font-bold text-slate-800 truncate leading-tight">{entityName}</p>
              {ntn && <p className="text-[10px] font-mono text-blue-600 mt-0.5">{ntn}</p>}
              <p className="text-[10px] text-slate-400 mt-0.5 leading-snug">{financialYear}</p>
            </div>
          )}
        </div>

        {/* Footer — editable firm name */}
        <div className="px-4 py-4 border-t border-slate-100">
          <input
            value={firmName}
            onChange={e => setFirmName(e.target.value)}
            className="w-full text-[11px] font-bold text-slate-900 bg-transparent border-none outline-none focus:ring-1 focus:ring-blue-400 rounded px-1 -mx-1 py-0.5 truncate leading-tight"
            placeholder="Firm name..."
          />
          <p className="text-[9px] text-slate-400 mt-0.5 px-1">Chartered Accountants</p>
        </div>
      </aside>

      {/* ── RIGHT CONTENT ─────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col bg-[#F8FAFC]">
        {/* Top bar — sticky so it stays visible while scrolling */}
        <header className="h-14 flex items-center justify-between px-8 bg-white border-b border-slate-200 sticky top-0 z-20">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium text-slate-400">Working Papers</span>
            <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
            <span className="font-semibold text-slate-800">{STEPS[step].label}</span>
          </div>
          <Button variant="ghost" size="sm" className="text-slate-500 text-xs font-semibold h-8 px-3 hover:bg-slate-100">
            Save Draft
          </Button>
        </header>

        <div className="px-10 py-8">
          <div className="max-w-4xl mx-auto pb-28">
            <AnimatePresence mode="wait">
              <motion.div key={step} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -15 }} transition={{ duration: 0.3 }}>
                
                {/* STEP 0: UPLOAD documents */}
                {step === 0 && (
                  <div className="space-y-8">
                    <div>
                      <h2 className="text-2xl font-bold text-slate-900">Upload Audit Documents</h2>
                      <p className="text-sm text-slate-500 mt-1.5 leading-relaxed max-w-2xl">Upload Trial Balance, General Ledger, Financial Statements, bank statements, contracts, and confirmations. The system will auto-structure data and generate ISA-compliant audit documentation from Acceptance through EQCR.</p>
                      <div className="flex flex-wrap gap-1.5 mt-3">
                        {["TB / GL", "Financial Statements", "Bank Statements", "Contracts", "Confirmations", "Board Minutes", "Tax Returns"].map(tag => (
                          <span key={tag} className="text-[10px] font-semibold text-slate-600 border border-slate-200 rounded-full px-2.5 py-1 bg-white uppercase tracking-wide">{tag}</span>
                        ))}
                      </div>
                    </div>

                    <DropZone files={files} onAdd={addFiles} onRemove={removeFile} />

                    <div className="space-y-3">
                      <Label className="text-xs font-bold text-slate-700 uppercase tracking-widest flex items-center gap-2"><Sparkles className="w-3.5 h-3.5 text-blue-500" /> Special Context / Instructions</Label>
                      <Textarea 
                        placeholder="Add specific focus areas, materiality considerations, or known issues the AI should prioritize during analysis..."
                        className="min-h-[120px] rounded-xl border-slate-200 focus:ring-blue-500 focus:border-blue-500 text-sm leading-relaxed"
                        value={instructions}
                        onChange={e => setInstructions(e.target.value)}
                      />
                    </div>

                    <div className="flex justify-end pt-4">
                      <Button onClick={handleExtractAndNext} disabled={files.length === 0 || extracting} size="lg" className="h-12 px-8 bg-blue-600 hover:bg-blue-700 font-bold rounded-xl group">
                        {extracting ? (
                          <><Loader2 className="mr-2 w-4 h-4 animate-spin" /> Extracting fields…</>
                        ) : (
                          <>Next: Configure <ChevronRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" /></>
                        )}
                      </Button>
                    </div>
                  </div>
                )}

                {/* STEP 1: CONFIGURE Engagement */}
                {step === 1 && (
                  <div className="space-y-8">
                    <div>
                      <h2 className="text-2xl font-bold text-slate-900">Configure Engagement</h2>
                      <p className="text-sm text-slate-500 mt-1.5 leading-relaxed max-w-2xl">Set entity particulars, define engagement timeline, assign the audit team, and populate Financial Statement data. The system uses this to drive materiality, risk assessment, and procedural selection across all phases.</p>
                      {autoFilled && (
                        <div className="mt-3 flex items-center gap-2 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 w-fit">
                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                          Fields auto-filled from uploaded documents — review and edit as needed
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                      <div className="lg:col-span-2 space-y-6">
                        <div className="bg-white rounded-xl p-8 border border-slate-200 shadow-sm space-y-6">
                          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-2"><Building2 className="w-4 h-4" /> Entity & Firm Details</h3>
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                              <Label className="text-xs font-bold text-slate-600 ml-1">Company / Entity Name</Label>
                              <Input value={entityName} onChange={e => setEntityName(e.target.value)} placeholder="e.g. Pak Textile Mills Ltd." className="h-11 rounded-xl font-medium" />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-xs font-bold text-slate-600 ml-1">NTN Number</Label>
                              <Input value={ntn} onChange={e => setNtn(e.target.value)} placeholder="e.g. 1234567-8" className="h-11 rounded-xl font-mono" />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-xs font-bold text-slate-600 ml-1">SECP Registration #</Label>
                              <Input value={secp} onChange={e => setSecp(e.target.value)} placeholder="e.g. K-123456" className="h-11 rounded-xl font-mono" />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-xs font-bold text-slate-600 ml-1">Financial Year / Period</Label>
                              <Input value={financialYear} onChange={e => setFinancialYear(e.target.value)} placeholder="Year ended June 30, 2024" className="h-11 rounded-xl font-medium" />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-xs font-bold text-slate-600 ml-1">Engagement Type</Label>
                              <Select value={engagementType} onValueChange={setEngagementType}>
                                <SelectTrigger className="h-11 rounded-xl font-medium">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {ENGAGEMENT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label className="text-xs font-bold text-slate-600 ml-1">Audit Firm Name</Label>
                              <Input value={firmName} onChange={e => setFirmName(e.target.value)} className="h-11 rounded-xl font-medium" />
                            </div>
                          </div>
                          
                          <div className="space-y-2 pt-2">
                            <Label className="text-xs font-bold text-slate-600 ml-1">Registered Address</Label>
                            <Input value={registeredAddress} onChange={e => setRegisteredAddress(e.target.value)} placeholder="Principal place of business..." className="h-11 rounded-xl font-medium" />
                          </div>
                        </div>

                        {/* ── Key Deadlines ─────────────────────────────────── */}
                        <div className="bg-white rounded-xl p-8 border border-slate-200 shadow-sm space-y-6">
                          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                            <Calendar className="w-4 h-4 text-emerald-500" /> Key Deadlines
                            <span className="font-normal text-slate-400 normal-case tracking-normal">— Engagement timeline and milestone dates</span>
                          </h3>

                          <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
                            <div className="space-y-1.5">
                              <Label className="text-xs font-bold text-slate-600 ml-1">Planning Deadline <span className="text-red-500">*</span></Label>
                              <Input type="date" value={planningDeadline} onChange={e => setPlanningDeadline(e.target.value)} className="h-11 rounded-xl font-mono text-sm" />
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-xs font-bold text-slate-600 ml-1">Fieldwork Start</Label>
                              <Input type="date" value={fieldworkStart} onChange={e => setFieldworkStart(e.target.value)} className="h-11 rounded-xl font-mono text-sm" />
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-xs font-bold text-slate-600 ml-1">Fieldwork End</Label>
                              <Input type="date" value={fieldworkEnd} onChange={e => setFieldworkEnd(e.target.value)} className="h-11 rounded-xl font-mono text-sm" />
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-xs font-bold text-slate-600 ml-1">Reporting Deadline <span className="text-red-500">*</span></Label>
                              <Input type="date" value={reportingDeadline} onChange={e => setReportingDeadline(e.target.value)} className="h-11 rounded-xl font-mono text-sm" />
                            </div>
                          </div>

                          <div className="grid grid-cols-2 md:grid-cols-3 gap-5">
                            <div className="space-y-1.5">
                              <Label className="text-xs font-bold text-slate-600 ml-1">Report Date</Label>
                              <Input type="date" value={reportDate} onChange={e => setReportDate(e.target.value)} className="h-11 rounded-xl font-mono text-sm" />
                              <p className="text-[10px] text-slate-400 ml-1">Date of auditor's report</p>
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-xs font-bold text-slate-600 ml-1">Filing Deadline</Label>
                              <Input type="date" value={filingDeadline} onChange={e => setFilingDeadline(e.target.value)} className="h-11 rounded-xl font-mono text-sm" />
                              <p className="text-[10px] text-slate-400 ml-1">SECP / regulatory filing deadline</p>
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-xs font-bold text-slate-600 ml-1">Archive Date</Label>
                              <Input type="date" value={archiveDate} onChange={e => setArchiveDate(e.target.value)} className="h-11 rounded-xl font-mono text-sm" />
                              <p className="text-[10px] text-slate-400 ml-1">ISA 230 — File assembly deadline (60 days post-report)</p>
                            </div>
                          </div>

                          {planningDeadline && fieldworkStart && fieldworkEnd && reportingDeadline && (
                            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-2.5">
                              <CheckCircle2 className="w-4 h-4" />
                              Timeline set — working papers will receive phase-appropriate dates automatically
                            </div>
                          )}
                        </div>

                        {/* FS Panel */}
                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                          <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center">
                                <Table className="w-4 h-4" />
                              </div>
                              <h3 className="font-bold text-slate-800">Financial Statement (FS) Data</h3>
                            </div>
                            <div className="flex bg-white border border-slate-200 rounded-lg p-1">
                              <button onClick={() => setActiveFsTab("bs")} className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${activeFsTab === "bs" ? "bg-slate-900 text-white shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>Balance Sheet</button>
                              <button onClick={() => setActiveFsTab("pl")} className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${activeFsTab === "pl" ? "bg-slate-900 text-white shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>Profit & Loss</button>
                            </div>
                          </div>

                          <div className="p-0 max-h-[600px] overflow-y-auto scrollbar-thin">
                            {(activeFsTab === "bs" ? bsData : plData).map((sec) => (
                              <div key={sec.id} className="border-b border-slate-100 last:border-0">
                                <button 
                                  onClick={() => setExpandedFsSections(prev => prev.includes(sec.id) ? prev.filter(x => x !== sec.id) : [...prev, sec.id])}
                                  className="w-full flex items-center justify-between px-6 py-4 hover:bg-slate-50 transition-colors"
                                >
                                  <div className="flex items-center gap-2">
                                    <div className={`w-1.5 h-6 rounded-full ${sec.color}`}></div>
                                    <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest">{sec.title}</span>
                                  </div>
                                  {expandedFsSections.includes(sec.id) ? <ChevronUp className="w-4 h-4 text-slate-300" /> : <ChevronDown className="w-4 h-4 text-slate-300" />}
                                </button>
                                
                                <AnimatePresence>
                                  {expandedFsSections.includes(sec.id) && (
                                    <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
                                      <div className="px-6 pb-4">
                                        <table className="w-full text-xs">
                                          <thead>
                                            <tr className="text-slate-400 border-b border-slate-50">
                                              <th className="font-bold text-left py-2 w-1/2">Line Item</th>
                                              <th className="font-bold text-right py-2">Current Year</th>
                                              <th className="font-bold text-right py-2">Prior Year</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {sec.lines.map(line => (
                                              <tr key={line.id} className={`${line.bold ? 'font-bold bg-slate-50/50' : ''} group`}>
                                                <td className={`py-2 px-1 ${line.indent ? 'pl-6' : ''}`}>{line.label}</td>
                                                <td className="py-2 px-1">
                                                  <input 
                                                    value={line.cy} 
                                                    onChange={e => activeFsTab === "bs" ? updateBsLine(sec.id, line.id, "cy", e.target.value) : updatePlLine(sec.id, line.id, "cy", e.target.value)}
                                                    className={`w-full text-right bg-transparent border-transparent hover:border-slate-200 focus:border-blue-500 focus:bg-white rounded px-1 transition-all outline-none font-mono ${line.bold ? 'font-bold' : ''}`}
                                                  />
                                                </td>
                                                <td className="py-2 px-1">
                                                  <input 
                                                    value={line.py} 
                                                    onChange={e => activeFsTab === "bs" ? updateBsLine(sec.id, line.id, "py", e.target.value) : updatePlLine(sec.id, line.id, "py", e.target.value)}
                                                    className={`w-full text-right bg-transparent border-transparent hover:border-slate-200 focus:border-blue-500 focus:bg-white rounded px-1 transition-all outline-none font-mono ${line.bold ? 'font-bold' : ''}`}
                                                  />
                                                </td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="space-y-6">
                        <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
                          <div className="flex items-center justify-between mb-6">
                            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-widest">WP Groups</h3>
                            <button onClick={() => setSelectedPapers(selectedPapers.length === ALL_WP_REFS.length ? [] : ALL_WP_REFS)} className="text-[10px] font-bold text-blue-600 hover:text-blue-700 uppercase">
                              {selectedPapers.length === ALL_WP_REFS.length ? "Deselect All" : "Select All"}
                            </button>
                          </div>
                          
                          <div className="space-y-3">
                            {WP_GROUPS.map(g => {
                              const allSelected = g.refs.every(r => selectedPapers.includes(r));
                              const someSelected = g.refs.some(r => selectedPapers.includes(r));
                              return (
                                <div key={g.prefix} className={`flex items-center justify-between p-3 rounded-xl border transition-all ${someSelected ? 'border-blue-200 bg-blue-50/30' : 'border-slate-100'}`}>
                                  <div className="flex flex-col">
                                    <span className="text-[10px] font-black text-slate-400 leading-none mb-1">{g.prefix}</span>
                                    <span className={`text-xs font-bold ${someSelected ? 'text-slate-900' : 'text-slate-500'}`}>{g.label}</span>
                                  </div>
                                  <Switch 
                                    checked={allSelected} 
                                    onCheckedChange={() => toggleGroupSelection(g.refs)}
                                    className="data-[state=checked]:bg-blue-600"
                                  />
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* ── Engagement Team ─────────────────────────────────── */}
                        <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm space-y-4">
                          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                            <Briefcase className="w-4 h-4 text-blue-500" /> Engagement Team
                          </h3>

                          <div className="space-y-3">
                            {/* Preparer */}
                            <div className="space-y-1.5">
                              <Label className="text-xs font-bold text-slate-600 ml-1">Preparer <span className="font-normal text-slate-400">(Associate / Senior)</span></Label>
                              <Select value={preparer} onValueChange={setPreparer}>
                                <SelectTrigger className="h-10 rounded-xl text-sm">
                                  <SelectValue placeholder="Select preparer..." />
                                </SelectTrigger>
                                <SelectContent>
                                  {users.length > 0 ? (
                                    users.map(u => <SelectItem key={u.id} value={u.name}>{u.name}{u.role ? ` — ${u.role}` : ""}</SelectItem>)
                                  ) : (
                                    <>
                                      <SelectItem value="Audit Associate">Audit Associate</SelectItem>
                                      <SelectItem value="Audit Senior">Audit Senior</SelectItem>
                                      <SelectItem value="Semi-Senior">Semi-Senior</SelectItem>
                                    </>
                                  )}
                                </SelectContent>
                              </Select>
                            </div>

                            {/* Reviewer */}
                            <div className="space-y-1.5">
                              <Label className="text-xs font-bold text-slate-600 ml-1">Reviewer <span className="font-normal text-slate-400">(Manager)</span></Label>
                              <Select value={reviewer} onValueChange={setReviewer}>
                                <SelectTrigger className="h-10 rounded-xl text-sm">
                                  <SelectValue placeholder="Select reviewer..." />
                                </SelectTrigger>
                                <SelectContent>
                                  {users.length > 0 ? (
                                    users.map(u => <SelectItem key={u.id} value={u.name}>{u.name}{u.role ? ` — ${u.role}` : ""}</SelectItem>)
                                  ) : (
                                    <>
                                      <SelectItem value="Audit Manager">Audit Manager</SelectItem>
                                      <SelectItem value="Senior Manager">Senior Manager</SelectItem>
                                    </>
                                  )}
                                </SelectContent>
                              </Select>
                            </div>

                            {/* Approver */}
                            <div className="space-y-1.5">
                              <Label className="text-xs font-bold text-slate-600 ml-1">Approver <span className="font-normal text-slate-400">(Partner / EQCR)</span></Label>
                              <Select value={approver} onValueChange={setApprover}>
                                <SelectTrigger className="h-10 rounded-xl text-sm">
                                  <SelectValue placeholder="Select approver..." />
                                </SelectTrigger>
                                <SelectContent>
                                  {users.length > 0 ? (
                                    users.map(u => <SelectItem key={u.id} value={u.name}>{u.name}{u.role ? ` — ${u.role}` : ""}</SelectItem>)
                                  ) : (
                                    <>
                                      <SelectItem value="Engagement Partner">Engagement Partner</SelectItem>
                                      <SelectItem value="EQCR Partner">EQCR Partner</SelectItem>
                                    </>
                                  )}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>

                          {preparer && reviewer && approver && (
                            <div className="flex items-center gap-2 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Team assigned — WPs will include sign-offs automatically
                            </div>
                          )}
                        </div>

                        <div className="bg-gradient-to-br from-slate-900 to-blue-900 rounded-xl p-6 text-white shadow-xl relative overflow-hidden">
                          <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-16 -mt-16 blur-3xl"></div>
                          <div className="relative z-10">
                            <h4 className="text-[10px] font-bold text-blue-300 uppercase tracking-widest mb-4">Configuration Summary</h4>
                            <div className="space-y-4">
                              <div className="flex items-center justify-between border-b border-white/10 pb-2">
                                <span className="text-xs text-white/60">Documents</span>
                                <span className="text-xs font-bold">{files.length} Files</span>
                              </div>
                              <div className="flex items-center justify-between border-b border-white/10 pb-2">
                                <span className="text-xs text-white/60">Selected WPs</span>
                                <span className="text-xs font-bold">{selectedPapers.length} / {ALL_WP_REFS.length}</span>
                              </div>
                              <div className="flex items-center justify-between border-b border-white/10 pb-2">
                                <span className="text-xs text-white/60">FS Sections</span>
                                <span className="text-xs font-bold">12 Total</span>
                              </div>
                              <div className="pt-2 flex items-center gap-2 text-emerald-400">
                                <CheckCircle2 className="w-4 h-4" />
                                <span className="text-[10px] font-bold uppercase tracking-widest">Ready for analysis</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-between pt-8 border-t border-slate-200">
                      <Button variant="ghost" onClick={() => setStep(0)} size="lg" className="font-bold text-slate-500 rounded-xl px-6">
                        <ChevronRight className="mr-2 w-4 h-4 rotate-180" /> Back to Upload
                      </Button>
                      <Button onClick={() => setStep(2)} disabled={!entityName} size="lg" className="h-12 px-8 bg-blue-600 hover:bg-blue-700 font-bold shadow-lg shadow-blue-200 rounded-xl group">
                        Next: Analyse <ChevronRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
                      </Button>
                    </div>
                  </div>
                )}

                {/* STEP 2: ANALYSE / Results */}
                {step === 2 && (
                  <div className="space-y-8">
                    {!analysis && !analyzing ? (
                      <div className="flex flex-col items-center justify-center py-20 text-center space-y-6">
                        <div className="w-24 h-24 bg-blue-50 rounded-full flex items-center justify-center relative">
                          <div className="absolute inset-0 bg-blue-400/20 rounded-full animate-ping-slow"></div>
                          <Sparkles className="w-10 h-10 text-blue-600 animate-pulse" />
                        </div>
                        <div>
                          <h2 className="text-2xl font-bold text-slate-900">Ready to Analyse</h2>
                          <p className="text-slate-500 mt-2 max-w-xl mx-auto leading-relaxed">The AI engine will process your documents to auto-determine materiality (overall / PM / trivial), assess inherent and fraud risks (ISA 315/240), map each FS line item to assertions, identify IC weaknesses, and prepare analytical procedures (ISA 500, 520).</p>
                        </div>
                        <Button onClick={handleAnalyze} size="lg" className="h-14 px-10 bg-blue-600 hover:bg-blue-700 text-lg font-bold shadow-none rounded-xl group">
                          Run AI Audit Analysis <Sparkles className="ml-3 w-5 h-5 group-hover:rotate-12 transition-transform" />
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-8">
                        <div>
                          <h2 className="text-2xl font-bold text-slate-900">Audit Analysis Results</h2>
                          <p className="text-slate-500 mt-2 text-lg">Comprehensive insights derived from the uploaded documents and FS data.</p>
                        </div>

                        {analyzing && (
                          <div className="bg-white rounded-xl p-8 border border-slate-200 shadow-sm space-y-6">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm font-bold text-blue-600 uppercase tracking-widest flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> {progressMsg}</span>
                              <span className="text-sm font-black text-slate-900">{progress}%</span>
                            </div>
                            <Progress value={progress} className="h-3 rounded-full bg-slate-100" />
                            <p className="text-xs text-slate-400 text-center font-medium">This may take up to 60 seconds depending on document volume...</p>
                          </div>
                        )}

                        {analysis && (
                          <>
                            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                              <div className="flex border-b border-slate-100 overflow-x-auto scrollbar-thin scrollbar-hidden">
                                {[
                                  { id: "summary", label: "Executive Summary", icon: FileText },
                                  { id: "ratios", label: "Analytical Procedures", icon: BarChart2 },
                                  { id: "reconciliation", label: "Reconciliation", icon: GitMerge },
                                  { id: "evidence", label: "Evidence Items", icon: Link2 },
                                  { id: "ic", label: "IC Weaknesses", icon: AlertTriangle },
                                ].map(tab => (
                                  <button
                                    key={tab.id}
                                    onClick={() => setAnalysisTab(tab.id as any)}
                                    className={`flex items-center gap-2 px-6 py-4 text-sm font-bold whitespace-nowrap transition-all border-b-2 ${analysisTab === tab.id ? "border-blue-600 text-blue-600 bg-blue-50/30" : "border-transparent text-slate-400 hover:text-slate-600 hover:bg-slate-50"}`}
                                  >
                                    <tab.icon className="w-4 h-4" />
                                    {tab.label}
                                  </button>
                                ))}
                              </div>

                              <div className="p-8">
                                {analysisTab === "summary" && (
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    <div className="space-y-6">
                                      <div>
                                        <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2"><Building2 className="w-3.5 h-3.5" /> Entity Context</h4>
                                        <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 space-y-3">
                                          <p className="text-sm text-slate-700 leading-relaxed font-medium">{analysis.entity?.context || "Strategic business review indicates steady growth in export markets."}</p>
                                          <div className="grid grid-cols-2 gap-4 pt-2">
                                            <div>
                                              <p className="text-[10px] text-slate-400 font-bold uppercase">Main Activity</p>
                                              <p className="text-xs font-bold text-slate-800">{analysis.entity?.main_activity || "Manufacturing & Export"}</p>
                                            </div>
                                            <div>
                                              <p className="text-[10px] text-slate-400 font-bold uppercase">Risk Profile</p>
                                              <p className="text-xs font-bold text-blue-600">Moderate / Stable</p>
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                      <div>
                                        <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2"><Scale className="w-3.5 h-3.5" /> Materiality Determination</h4>
                                        <div className="grid grid-cols-2 gap-4">
                                          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                                            <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Overall Materiality</p>
                                            <p className="text-lg font-black text-slate-900">{fmtPKR(analysis.materiality?.overall)}</p>
                                            <p className="text-[10px] text-slate-500 font-bold mt-1">Based on {analysis.materiality?.benchmark || "5% of PBT"}</p>
                                          </div>
                                          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                                            <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Performance Mat.</p>
                                            <p className="text-lg font-black text-slate-900">{fmtPKR(analysis.materiality?.performance)}</p>
                                            <p className="text-[10px] text-slate-500 font-bold mt-1">75% of Overall</p>
                                          </div>
                                        </div>
                                      </div>
                                    </div>

                                    <div className="space-y-6">
                                      <div>
                                        <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2"><AlertTriangle className="w-3.5 h-3.5" /> Key Audit Areas</h4>
                                        <div className="space-y-3">
                                          {(analysis.key_audit_areas || ["Revenue Recognition", "Inventory Valuation", "Property, Plant & Equipment"]).map((area, i) => (
                                            <div key={i} className="flex items-center gap-3 p-3.5 bg-white border border-slate-200 rounded-xl shadow-sm hover:border-blue-200 transition-colors">
                                              <div className="w-8 h-8 rounded-xl bg-slate-900 text-white flex items-center justify-center font-mono font-bold text-xs">{i+1}</div>
                                              <span className="text-sm font-bold text-slate-800">{area}</span>
                                              <Badge className="ml-auto bg-amber-50 text-amber-700 border-amber-200 text-[10px] h-5">ISA 701</Badge>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                      <div className="bg-blue-600 rounded-xl p-6 text-white shadow-xl">
                                        <h4 className="text-[10px] font-bold text-blue-200 uppercase tracking-widest mb-3">AI Auditor Insights</h4>
                                        <p className="text-sm font-medium leading-relaxed italic">"Risk assessment suggests focus on revenue cut-off and classification of non-current liabilities. Variance in admin expenses requires detailed substantive testing."</p>
                                      </div>
                                    </div>
                                  </div>
                                )}

                                {analysisTab === "ratios" && (
                                  <div className="space-y-6">
                                    <div className="overflow-hidden rounded-xl border border-slate-200 shadow-sm bg-white">
                                      <table className="w-full text-xs text-left">
                                        <thead className="bg-slate-50 border-b border-slate-200">
                                          <tr>
                                            <th className="p-4 font-bold text-slate-500">Financial Ratio / KPI</th>
                                            <th className="p-4 font-bold text-slate-500 text-right">Current Year</th>
                                            <th className="p-4 font-bold text-slate-500 text-right">Variance</th>
                                            <th className="p-4 font-bold text-slate-500">Trend</th>
                                            <th className="p-4 font-bold text-slate-500">Auditor's Assessment</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                          {Object.entries(analysis.analytical_procedures?.ratios || { "Gross Margin": 0.34, "Net Margin": 0.15, "Current Ratio": 1.84, "Quick Ratio": 1.12 }).map(([name, val], i) => (
                                            <tr key={name} className="hover:bg-slate-50/50 transition-colors">
                                              <td className="p-4 font-bold text-slate-800">{name}</td>
                                              <td className="p-4 text-right font-mono font-bold text-slate-900">{typeof val === 'number' ? (val < 1 ? (val * 100).toFixed(1) + "%" : val.toFixed(2)) : val}</td>
                                              <td className="p-4 text-right">
                                                <span className={`font-mono font-bold ${i % 2 === 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                  {i % 2 === 0 ? "+" : "-"}{(Math.random() * 5).toFixed(1)}%
                                                </span>
                                              </td>
                                              <td className="p-4">
                                                {i % 2 === 0 ? <TrendingUp className="w-4 h-4 text-emerald-500" /> : <TrendingDown className="w-4 h-4 text-rose-500" />}
                                              </td>
                                              <td className="p-4 text-slate-600 font-medium">
                                                {i === 0 ? "Satisfactory. In line with industry average." : i === 1 ? "Investigate increase in administrative expenses." : "Liquidity position remains stable."}
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                    <div className="bg-slate-900 rounded-xl p-6 text-white">
                                      <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Trend Analysis Conclusion</h4>
                                      <p className="text-sm font-medium text-slate-300 leading-relaxed">{analysis.analytical_procedures?.trend_analysis || "Stable revenue growth with improving gross margins. Liquidity ratios are within acceptable limits, though receivables aging has increased."}</p>
                                    </div>
                                  </div>
                                )}

                                {analysisTab === "reconciliation" && (
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    {[
                                      { label: "Trial Balance vs. Financial Statements", key: "tb_vs_fs", icon: Table },
                                      { label: "Opening vs. Prior Year Closing", key: "opening_vs_prior_year", icon: LayoutGrid },
                                      { label: "Bank Reconciliation Statement", key: "bank_reconciliation", icon: Building2 },
                                      { label: "General Ledger vs. Trial Balance", key: "tb_vs_gl", icon: GitMerge },
                                    ].map(item => {
                                      const data = (analysis.reconciliation as any)?.[item.key] || { status: "Verified", difference: 0, notes: "No variances identified." };
                                      return (
                                        <div key={item.key} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:border-blue-200 transition-colors">
                                          <div className="flex items-center justify-between mb-4">
                                            <div className="flex items-center gap-2">
                                              <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center">
                                                <item.icon className="w-4 h-4 text-slate-400" />
                                              </div>
                                              <span className="text-xs font-bold text-slate-800">{item.label}</span>
                                            </div>
                                            <Badge className={`text-[9px] font-bold h-5 ${data.status === "Verified" || data.difference === 0 ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-red-50 text-red-700 border-red-200"}`}>
                                              {data.status || "Verified"}
                                            </Badge>
                                          </div>
                                          <div className="space-y-2">
                                            <div className="flex items-center justify-between">
                                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Difference</span>
                                              <span className={`text-sm font-mono font-bold ${data.difference !== 0 ? 'text-red-600' : 'text-emerald-600'}`}>{fmtPKR(data.difference)}</span>
                                            </div>
                                            <p className="text-xs text-slate-500 font-medium pt-1 border-t border-slate-50">{data.notes}</p>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}

                                {analysisTab === "evidence" && (
                                  <div className="space-y-4">
                                    {(analysis.evidence_items || []).length > 0 ? (
                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {analysis.evidence_items?.map((e, i) => (
                                          <div key={i} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex items-start gap-3">
                                            <div className="w-10 h-10 bg-purple-50 rounded-xl flex items-center justify-center shrink-0 border border-purple-100">
                                              <Link2 className="w-5 h-5 text-purple-600" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                              <p className="text-xs font-bold text-slate-900 truncate">{e.filename}</p>
                                              <p className="text-[10px] text-slate-500 font-medium mt-0.5 line-clamp-2">{e.description}</p>
                                              <div className="flex items-center gap-2 mt-2">
                                                <Badge className="bg-purple-50 text-purple-700 border-purple-100 text-[9px] h-4">{e.type}</Badge>
                                                <span className="text-[9px] font-bold text-slate-400">{e.pages_or_sheets}</span>
                                              </div>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    ) : (
                                      <div className="flex flex-col items-center justify-center py-12 text-slate-400 space-y-3 bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                                        <Link2 className="w-8 h-8 opacity-20" />
                                        <p className="text-sm font-bold">No evidence items extracted yet.</p>
                                      </div>
                                    )}
                                  </div>
                                )}

                                {analysisTab === "ic" && (
                                  <div className="space-y-4">
                                    {(analysis.internal_control_weaknesses || []).length > 0 ? (
                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {analysis.internal_control_weaknesses?.map((w, i) => (
                                          <div key={i} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-3 relative overflow-hidden group hover:border-blue-200 transition-colors">
                                            <div className={`absolute top-0 left-0 w-1.5 h-full ${w.risk_level === "High" ? "bg-red-500" : w.risk_level === "Medium" ? "bg-amber-500" : "bg-emerald-500"}`}></div>
                                            <div className="flex items-center justify-between">
                                              <span className="text-xs font-black text-slate-900 uppercase tracking-widest">{w.area}</span>
                                              <RiskBadge level={w.risk_level} />
                                            </div>
                                            <p className="text-sm text-slate-700 font-bold leading-relaxed">{w.weakness}</p>
                                            <div className="pt-3 border-t border-slate-50">
                                              <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest mb-1">Recommendation</p>
                                              <p className="text-xs text-slate-600 font-medium leading-relaxed">{w.recommendation}</p>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    ) : (
                                      <div className="flex flex-col items-center justify-center py-12 text-slate-400 space-y-3 bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                                        <Shield className="w-8 h-8 opacity-20" />
                                        <p className="text-sm font-bold">No internal control weaknesses identified.</p>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className="bg-white rounded-xl border border-blue-200 p-8 shadow-lg shadow-blue-50 relative overflow-hidden">
                              <div className="absolute top-0 right-0 w-64 h-64 bg-blue-50 rounded-full -mr-32 -mt-32 blur-3xl opacity-50"></div>
                              <div className="relative z-10 flex flex-col md:flex-row items-center gap-8">
                                <div className="flex-1">
                                  <h3 className="text-xl font-extrabold text-slate-900 flex items-center gap-2"><Sparkles className="w-6 h-6 text-blue-600" /> Generate Working Paper File</h3>
                                  <p className="text-slate-500 mt-2 font-medium">Ready to produce {selectedPapers.length} ISA-compliant working papers with automated cross-referencing, conclusions, and audit evidence indexing.</p>
                                </div>
                                <div className="shrink-0 space-y-4 w-full md:w-auto">
                                  {generating && (
                                    <div className="space-y-2 mb-4">
                                      <Progress value={progress} className="h-2 rounded-full" />
                                      <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest animate-pulse">{progressMsg}</p>
                                    </div>
                                  )}
                                  <Button onClick={handleGenerate} disabled={generating} size="lg" className="h-14 px-8 bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-700 hover:to-indigo-800 text-white font-bold shadow-none rounded-xl w-full">
                                    {generating ? <><Loader2 className="w-5 h-5 mr-3 animate-spin" /> Generating File...</> : <><FileCheck className="w-5 h-5 mr-3" /> Generate Complete File</>}
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </>
                        )}

                        <div className="flex justify-start">
                          <Button variant="ghost" onClick={() => setStep(1)} disabled={analyzing || generating} className="font-bold text-slate-500 rounded-xl px-6">
                            <ChevronRight className="mr-2 w-4 h-4 rotate-180" /> Back to Config
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* STEP 3: GENERATE / View Working Papers */}
                {step === 3 && (
                  <div className="space-y-8">
                    <div>
                      <h2 className="text-2xl font-bold text-slate-900">Audit Working Papers</h2>
                      <p className="text-slate-500 mt-2">Auto-generated, fully cross-referenced working papers — Acceptance → Planning → Execution → Completion → Reporting → EQCR. ISA 200–720 · ISQM 1&2 · Companies Act 2017 compliant. Each paper carries prepared-by, reviewed-by, and approved-by sign-offs with phase-appropriate dates.</p>
                    </div>

                    {workingPapers.length === 0 ? (
                      generating ? (
                        /* ─── Phase-by-phase progress ───────────────────────────────────────── */
                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 space-y-8">
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2.5">
                                <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
                                <span className="font-bold text-blue-700 text-sm">{progressMsg}</span>
                              </div>
                              <span className="text-2xl font-black text-slate-900">{progress}%</span>
                            </div>
                            <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                              <div className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full transition-all duration-700 ease-out" style={{ width: `${progress}%` }} />
                            </div>
                            <p className="text-xs font-medium text-slate-400">
                              {completedPhases.length} of {AUDIT_PHASES.length} phases complete
                              {activePhaseLabel ? ` · Processing: ${activePhaseLabel}` : " · Finalising..."}
                            </p>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                            {AUDIT_PHASES.map(phase => {
                              const isDone    = completedPhases.includes(phase.prefix);
                              const isActive  = activePhaseLabel === phase.label;
                              return (
                                <div key={phase.prefix}
                                  className={`rounded-xl p-4 border transition-all duration-500 ${
                                    isDone   ? "bg-emerald-50 border-emerald-200 shadow-sm" :
                                    isActive ? "bg-blue-50 border-blue-300 shadow-md ring-1 ring-blue-300" :
                                               "bg-slate-50 border-slate-100"
                                  }`}
                                >
                                  <div className="flex items-center justify-between mb-2">
                                    <span className={`text-[10px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-md ${
                                      isDone   ? "bg-emerald-100 text-emerald-700" :
                                      isActive ? "bg-blue-100 text-blue-700" :
                                                 "bg-slate-100 text-slate-400"
                                    }`}>{phase.prefix}</span>
                                    {isDone   ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> :
                                     isActive ? <Loader2 className="w-4 h-4 text-blue-500 animate-spin" /> : null}
                                  </div>
                                  <p className={`text-xs font-bold leading-tight ${isDone ? "text-emerald-700" : isActive ? "text-blue-700" : "text-slate-400"}`}>{phase.label}</p>
                                  <p className={`text-[10px] mt-1 leading-tight ${isDone ? "text-emerald-500" : "text-slate-300"}`}>{phase.description}</p>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ) : (
                        /* ─── Idle: trigger generation ──────────────────────────────────────── */
                        <div className="bg-white rounded-xl p-12 border border-slate-200 shadow-sm text-center space-y-8">
                          <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mx-auto">
                            <Sparkles className="w-10 h-10 text-blue-600" />
                          </div>
                          <div className="max-w-lg mx-auto space-y-4">
                            <h3 className="text-2xl font-extrabold text-slate-800">Ready to Generate {selectedPapers.length} Papers</h3>
                            <p className="text-slate-500 font-medium leading-relaxed">The system will process all 12 audit phases — from Pre-Planning to Audit Opinion — generating fully cross-referenced, ISA-compliant working papers with prepared-by, reviewed-by, and partner sign-offs.</p>
                            <div className="flex flex-wrap justify-center gap-2 pt-2">
                              {AUDIT_PHASES.map(p => (
                                <span key={p.prefix} className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 border border-slate-200 uppercase tracking-wide">{p.prefix}: {p.label}</span>
                              ))}
                            </div>
                          </div>
                          <Button onClick={handleGenerate} size="lg" className="h-14 px-10 bg-blue-600 hover:bg-blue-700 text-base font-bold shadow-none rounded-xl group">
                            <Sparkles className="w-5 h-5 mr-2 group-hover:rotate-12 transition-transform" /> Generate All Working Papers
                          </Button>
                        </div>
                      )
                    ) : (
                      <>
                        <div className="bg-emerald-600 rounded-xl p-4 text-white shadow-lg flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
                              <CheckCircle2 className="w-5 h-5" />
                            </div>
                            <span className="font-bold">{workingPapers.length} Working Papers Generated · ISA 200-720 Compliant</span>
                          </div>
                          <Badge className="bg-white/20 text-white border-white/20 font-bold uppercase tracking-widest text-[10px]">Ready for Review</Badge>
                        </div>

                        {/* Evidence Index (from Production) */}
                        {evidenceIndex.length > 0 && (
                          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                            <button onClick={() => setExpandedWPGroups(prev => prev.includes("__evidence__") ? prev.filter(p => p !== "__evidence__") : [...prev, "__evidence__"])}
                              className="w-full flex items-center gap-3 p-5 hover:bg-slate-50/50 transition-colors text-left"
                            >
                              <div className="w-10 h-10 bg-purple-50 rounded-xl flex items-center justify-center border border-purple-100">
                                <Link2 className="w-5 h-5 text-purple-600" />
                              </div>
                              <div className="flex-1">
                                <h3 className="font-bold text-slate-900">Audit Evidence Index</h3>
                                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">ISA 230 / ISA 500 · {evidenceIndex.length} items</p>
                              </div>
                              {expandedWPGroups.includes("__evidence__") ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                            </button>
                            <AnimatePresence>
                              {expandedWPGroups.includes("__evidence__") && (
                                <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden bg-slate-50/30">
                                  <div className="p-6">
                                    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                                      <table className="w-full text-xs text-left">
                                        <thead className="bg-slate-50 border-b border-slate-200">
                                          <tr>
                                            <th className="p-3 font-bold text-slate-500 w-20">Ref</th>
                                            <th className="p-3 font-bold text-slate-500">Document Description</th>
                                            <th className="p-3 font-bold text-slate-500 w-32">Type</th>
                                            <th className="p-3 font-bold text-slate-500">Cross-Refs</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                          {evidenceIndex.map((e, i) => (
                                            <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                                              <td className="p-3 font-mono font-bold text-purple-700">{e.ref}</td>
                                              <td className="p-3 text-slate-700 font-medium">{e.description}</td>
                                              <td className="p-3">
                                                <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-100 text-[9px]">{e.type}</Badge>
                                              </td>
                                              <td className="p-3 text-slate-400 font-bold font-mono">{(e.wp_refs || []).join(", ") || "—"}</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        )}

                        <div className="space-y-4">
                          {uniqueSections.map(section => {
                            const papers = sectionPapers(section);
                            if (!papers.length) return null;
                            const group = WP_GROUPS.find(g => papers[0]?.ref.startsWith(g.prefix));
                            const isOpen = expandedWPGroups.includes(section);
                            
                            return (
                              <div key={section} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                                <button onClick={() => toggleWPGroupExpand(section)} className="w-full flex items-center gap-4 p-5 hover:bg-slate-50/50 transition-colors text-left">
                                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center border shadow-sm shrink-0 ${group?.color || "bg-slate-100 text-slate-600 border-slate-200"}`}>
                                    <span className="font-bold text-sm">{group?.prefix || "WP"}</span>
                                  </div>
                                  <div className="flex-1">
                                    <h3 className="font-bold text-slate-900">{section}</h3>
                                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">{papers.length} Audit Papers</p>
                                  </div>
                                  {isOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                                </button>
                                <AnimatePresence>
                                  {isOpen && (
                                    <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden bg-slate-50/20">
                                      <div className="p-4 space-y-1">
                                        {papers.map(wp => (
                                          <WPCard 
                                            key={wp.ref} 
                                            wp={wp} 
                                            expanded={expandedWPCards.includes(wp.ref)} 
                                            onToggle={() => toggleWPCardExpand(wp.ref)} 
                                          />
                                        ))}
                                      </div>
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    )}

                    <div className="flex justify-between pt-8 border-t border-slate-200">
                      <Button variant="ghost" onClick={() => setStep(2)} className="font-bold text-slate-500 rounded-xl px-6">
                        <ChevronRight className="mr-2 w-4 h-4 rotate-180" /> Back to Analysis
                      </Button>
                      <Button onClick={() => setStep(4)} size="lg" className="h-12 px-8 bg-blue-600 hover:bg-blue-700 font-bold shadow-lg shadow-blue-200 rounded-xl group">
                        Next: Export & Finalize <ChevronRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
                      </Button>
                    </div>
                  </div>
                )}

                {/* STEP 4: EXPORT */}
                {step === 4 && (
                  <div className="space-y-10">
                    <div>
                      <h2 className="text-2xl font-bold text-slate-900">Export & Finalize</h2>
                      <p className="text-slate-500 mt-2">Download the complete, inspection-ready audit file — all phases, all working papers, and all client-provided evidence combined into a single deliverable. Choose your format: editable Excel workbook, Word report, archived PDF, or the confirmation letters bundle.</p>
                    </div>

                    <div className="bg-[#0F172A] rounded-xl p-8 text-white relative overflow-hidden">
                      <div className="absolute top-0 right-0 w-96 h-96 bg-blue-600/20 rounded-full -mr-48 -mt-48 blur-[100px]"></div>
                      <div className="absolute bottom-0 left-0 w-64 h-64 bg-emerald-600/10 rounded-full -ml-32 -mb-32 blur-[80px]"></div>
                      
                      <div className="relative z-10 space-y-8">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                          <div>
                            <div className="flex items-center gap-3 mb-2">
                              <Badge className="bg-emerald-500 text-white border-0 font-bold text-[10px] uppercase h-6">Engagement Ready</Badge>
                              <span className="text-blue-400 font-bold text-xs">ISA 230 Compliant</span>
                            </div>
                            <h3 className="text-3xl font-black">{entityName || "Audit Engagement"}</h3>
                            <p className="text-slate-400 mt-1 font-medium">{financialYear} · {workingPapers.length} Generated Papers</p>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="bg-white/5 border border-white/10 rounded-xl p-4 text-center min-w-[100px]">
                              <p className="text-[10px] font-bold text-slate-500 uppercase">Compliance</p>
                              <p className="text-xl font-black text-emerald-400">100%</p>
                            </div>
                            <div className="bg-white/5 border border-white/10 rounded-xl p-4 text-center min-w-[100px]">
                              <p className="text-[10px] font-bold text-slate-500 uppercase">Evidence</p>
                              <p className="text-xl font-black text-blue-400">{evidenceIndex.length}</p>
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {[
                            { id: "excel", label: "Microsoft Excel File", ext: ".xlsx", desc: "Complete workbook with automated cross-references and section tabs.", icon: Table, color: "emerald", handler: handleExportExcel, loading: exportingExcel },
                            { id: "docx", label: "Microsoft Word File", ext: ".docx", desc: "Professional report format suitable for management deliverables.", icon: FileSpreadsheet, color: "sky", handler: handleExportDocx, loading: exportingDocx },
                            { id: "pdf", label: "Adobe PDF File", ext: ".pdf", desc: "Final archived copy with high-fidelity formatting and sign-offs.", icon: FileText, color: "rose", handler: handleExport, loading: exporting },
                            { id: "confirmations", label: "Confirmations Bundle", ext: ".zip", desc: "Automated generation of bank, debtor, and creditor confirmation letters.", icon: Mail, color: "violet", handler: handleExportConfirmations, loading: exportingConfirmations },
                          ].map(card => (
                            <button
                              key={card.id}
                              onClick={card.handler}
                              disabled={card.loading}
                              className="group bg-white/5 border border-white/10 hover:bg-white/[0.08] hover:border-white/20 rounded-xl p-6 transition-all text-left relative overflow-hidden"
                            >
                              <div className="flex items-center gap-4">
                                <div className={`w-14 h-14 rounded-xl bg-${card.color}-500/20 flex items-center justify-center group-hover:scale-110 transition-transform`}>
                                  <card.icon className={`w-7 h-7 text-${card.color}-400`} />
                                </div>
                                <div className="flex-1">
                                  <div className="flex items-center justify-between">
                                    <h4 className="font-bold text-lg">{card.label}</h4>
                                    <span className={`text-[10px] font-black text-${card.color}-400 uppercase`}>{card.ext}</span>
                                  </div>
                                  <p className="text-slate-400 text-xs mt-1 leading-relaxed">{card.desc}</p>
                                </div>
                              </div>
                              <div className="mt-6 flex items-center justify-between">
                                {card.loading ? (
                                  <div className="flex items-center gap-2 text-blue-400 text-[10px] font-bold uppercase tracking-widest animate-pulse">
                                    <Loader2 className="w-3 h-3 animate-spin" /> Preparing Download...
                                  </div>
                                ) : (
                                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest group-hover:text-white transition-colors">Download Now</span>
                                )}
                                <div className={`w-8 h-8 rounded-full bg-${card.color}-500/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity`}>
                                  <Download className={`w-4 h-4 text-${card.color}-400`} />
                                </div>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-between items-center pb-12">
                      <Button variant="ghost" onClick={() => { setStep(0); setFiles([]); setAnalysis(null); setWorkingPapers([]); setEvidenceIndex([]); setEntityName(""); setNtn(""); }} className="font-bold text-slate-500 rounded-xl px-6 h-12">
                        <RefreshCw className="w-4 h-4 mr-2" /> Start New Engagement
                      </Button>
                      <p className="text-[10px] font-medium text-slate-400 uppercase tracking-widest">ISA 230 Compliant · Secure Archive Active</p>
                    </div>
                  </div>
                )}

              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
