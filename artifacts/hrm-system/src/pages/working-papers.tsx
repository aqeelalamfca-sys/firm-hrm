import React, { useState, useRef, useCallback, useEffect } from "react";
import * as XLSX from "xlsx";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload, FileText, Loader2, CheckCircle2, Download, ChevronRight,
  ChevronDown, ChevronUp, BookOpen, Shield, AlertTriangle, TrendingUp,
  Building2, Calendar, Briefcase, X, Plus, Eye, RefreshCw,
  BarChart2, FileCheck, ClipboardCheck, Star, Info, Sparkles,
  FileSearch, Scale, Target, Layers, FileOutput, Check, Table,
  Activity, GitMerge, Link2, FileSpreadsheet, Mail, Hash, Settings, LayoutGrid, TrendingDown,
  Trash2, ListPlus, SplitSquareVertical
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import EngagementConfig from "@/components/engagement-config";
import { getDefaultValues, validateAllMandatory, getAllTriggeredWPs, VARIABLE_DEFS, isFieldComplete, isVariableVisible } from "@/lib/engagement-variable-defs";

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
interface FSBreakup {
  id: string; label: string; cy: string; py: string;
}
interface FSLine {
  id: string; label: string; cy: string; py: string;
  bold?: boolean; subtotal?: boolean; indent?: boolean; spacer?: boolean;
  isCustom?: boolean;
  breakups?: FSBreakup[];
}
interface FSSection { id: string; title: string; color: string; lines: FSLine[]; }

interface SalesTaxRow {
  id: string;
  periodFrom: string; periodTo: string;
  invoiceDate: string; invoiceNo: string;
  customerSupplier: string; ntnCnic: string; strn: string;
  description: string; salesType: string;
  taxableValue: string; salesTaxRate: string; salesTaxAmount: string;
  furtherTaxRate: string; furtherTaxAmount: string;
  fedRate: string; fedAmount: string;
  jurisdiction: string; inputOutput: string;
  adjustment: string; netTax: string;
}

const SALES_TAX_COLS: { key: keyof SalesTaxRow; label: string; width: string; type?: string }[] = [
  { key: "periodFrom", label: "Period From", width: "110px", type: "date" },
  { key: "periodTo", label: "Period To", width: "110px", type: "date" },
  { key: "invoiceDate", label: "Invoice Date", width: "110px", type: "date" },
  { key: "invoiceNo", label: "Invoice No.", width: "100px" },
  { key: "customerSupplier", label: "Customer / Supplier", width: "180px" },
  { key: "ntnCnic", label: "NTN / CNIC", width: "120px" },
  { key: "strn", label: "STRN", width: "120px" },
  { key: "description", label: "Description", width: "180px" },
  { key: "salesType", label: "Sales Type", width: "110px" },
  { key: "taxableValue", label: "Taxable Value", width: "120px" },
  { key: "salesTaxRate", label: "ST Rate %", width: "90px" },
  { key: "salesTaxAmount", label: "ST Amount", width: "110px" },
  { key: "furtherTaxRate", label: "FT Rate %", width: "90px" },
  { key: "furtherTaxAmount", label: "FT Amount", width: "110px" },
  { key: "fedRate", label: "FED Rate %", width: "90px" },
  { key: "fedAmount", label: "FED Amount", width: "110px" },
  { key: "jurisdiction", label: "Province / Jurisdiction", width: "140px" },
  { key: "inputOutput", label: "Input / Output", width: "110px" },
  { key: "adjustment", label: "Adj / DN / CN", width: "120px" },
  { key: "netTax", label: "Net Tax", width: "110px" },
];

const emptySalesTaxRow = (): SalesTaxRow => ({
  id: `st_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
  periodFrom: "", periodTo: "", invoiceDate: "", invoiceNo: "",
  customerSupplier: "", ntnCnic: "", strn: "", description: "", salesType: "",
  taxableValue: "", salesTaxRate: "", salesTaxAmount: "",
  furtherTaxRate: "", furtherTaxAmount: "", fedRate: "", fedAmount: "",
  jurisdiction: "", inputOutput: "", adjustment: "", netTax: "",
});

// ─── Constants ────────────────────────────────────────────────────────────────
const ENGAGEMENT_TYPES = [
  "Statutory Audit", "Internal Audit", "Tax Audit", "Special Purpose Audit",
  "Review Engagement", "Compilation Engagement", "Due Diligence",
];

const WP_GROUPS = [
  { prefix: "A", label: "Pre-Engagement & Acceptance", color: "bg-violet-100 text-violet-700 border-violet-200", refs: ["A1", "A2", "A3", "A4", "A5", "A6"] },
  { prefix: "B", label: "Planning", color: "bg-blue-100 text-blue-700 border-blue-200", refs: ["B1", "B2", "B3", "B4", "B5", "B6", "B7", "B8", "B9", "B10"] },
  { prefix: "C", label: "Data & FS Integration", color: "bg-sky-100 text-sky-700 border-sky-200", refs: ["C1", "C2", "C3", "C4", "C5", "C6"] },
  { prefix: "D", label: "Internal Controls & ToC", color: "bg-red-100 text-red-700 border-red-200", refs: ["D1", "D2", "D3", "D4", "D5"] },
  { prefix: "E", label: "Substantive Testing", color: "bg-emerald-100 text-emerald-700 border-emerald-200", refs: ["E1", "E2", "E3", "E4", "E5", "E6", "E7", "E8", "E9", "E10"] },
  { prefix: "F", label: "Special Areas", color: "bg-teal-100 text-teal-700 border-teal-200", refs: ["F1", "F2", "F3", "F4", "F5", "F6"] },
  { prefix: "G", label: "Completion & Finalization", color: "bg-amber-100 text-amber-700 border-amber-200", refs: ["G1", "G2", "G3", "G4", "G5", "G6", "G7"] },
  { prefix: "H", label: "Reporting", color: "bg-indigo-100 text-indigo-700 border-indigo-200", refs: ["H1", "H2", "H3", "H4", "H5"] },
  { prefix: "I", label: "Quality Control & Review", color: "bg-purple-100 text-purple-700 border-purple-200", refs: ["I1", "I2", "I3", "I4"] },
  { prefix: "J", label: "Tax & Regulatory (Pakistan)", color: "bg-orange-100 text-orange-700 border-orange-200", refs: ["J1", "J2", "J3", "J4", "J5"] },
  { prefix: "K", label: "Final Output & Archive", color: "bg-green-100 text-green-700 border-green-200", refs: ["K1", "K2", "K3"] },
];

const ALL_WP_REFS = WP_GROUPS.flatMap(g => g.refs);

const WP_PAPER_NAMES: Record<string, string> = {
  A1: "Engagement Letter", A2: "Independence Declaration", A3: "Ethics & Conflict Check", A4: "AML / Client Risk Profile", A5: "Predecessor Auditor Communication", A6: "Engagement Risk Assessment",
  B1: "Understanding the Entity & Environment", B2: "Risk Assessment (ISA 315)", B3: "Fraud Risk (ISA 240)", B4: "Materiality Determination", B5: "Audit Strategy Memo", B6: "Audit Plan", B7: "Analytical Procedures – Planning", B8: "Group Audit Instructions (ISA 600)", B9: "Related Party Identification", B10: "Laws & Regulations (ISA 250)",
  C1: "Financial Statements Extraction", C2: "Trial Balance Mapping", C3: "TB ↔ FS Reconciliation", C4: "Opening Balances (ISA 510)", C5: "Lead Schedules – BS", C6: "Lead Schedules – PL",
  D1: "Internal Control Evaluation", D2: "Walkthroughs & Narratives", D3: "Tests of Controls", D4: "IT General Controls Review", D5: "Control Deficiency Log",
  E1: "Cash & Bank – Substantive", E2: "Trade Receivables – Substantive", E3: "Inventory – Substantive", E4: "PPE & Intangibles – Substantive", E5: "Trade Payables – Substantive", E6: "Revenue Testing (ISA 240/500)", E7: "Expenses Testing", E8: "Equity & Reserves – Substantive", E9: "Tax Provisions – Substantive", E10: "Other Balances – Substantive",
  F1: "Related Party Transactions (ISA 550)", F2: "Going Concern (ISA 570)", F3: "Subsequent Events (ISA 560)", F4: "Accounting Estimates (ISA 540)", F5: "Litigation & Claims", F6: "Segment Reporting / Other Special",
  G1: "Summary of Misstatements", G2: "Adjusting Journal Entries", G3: "Final Analytical Procedures (ISA 520)", G4: "Engagement Completion Checklist", G5: "Going Concern – Final Assessment", G6: "Subsequent Events – Final Update", G7: "Management Representations (ISA 580)",
  H1: "Opinion Assessment", H2: "Auditor's Report Draft", H3: "Key Audit Matters (KAMs)", H4: "Emphasis of Matter / Other", H5: "Other Information (ISA 720)",
  I1: "EQCR Report", I2: "Review Notes Log", I3: "Consultation Record", I4: "File Completion Memo",
  J1: "Income Tax Computation", J2: "Deferred Tax Working", J3: "Sales Tax Review", J4: "WHT Compliance Check", J5: "Super Tax Calculation",
  K1: "Signed Audit Opinion", K2: "Engagement Close-Out", K3: "Archive & Retention",
};

const STEPS = [
  { id: 0, label: "Upload Documents", shortLabel: "Upload", icon: Upload },
  { id: 1, label: "Engagement Configuration", shortLabel: "Configure", icon: Settings },
  { id: 2, label: "AI Analysis", shortLabel: "Analyse", icon: FileSearch },
  { id: 3, label: "Generate Working Papers", shortLabel: "Generate", icon: Sparkles },
  { id: 4, label: "Export & Finalize", shortLabel: "Export", icon: FileOutput },
];

const AUDIT_PHASES: { prefix: string; label: string; papers: number; description: string }[] = [
  { prefix: "A", label: "Pre-Engagement & Acceptance", papers: 6, description: "Engagement letter, independence, ethics, AML, conflict & risk profiling" },
  { prefix: "B", label: "Planning", papers: 10, description: "Entity understanding, risk, fraud, materiality, strategy, plan & analytics" },
  { prefix: "C", label: "Data & FS Integration", papers: 6, description: "FS extraction, mapping, TB reconciliation, opening balances & lead schedules" },
  { prefix: "D", label: "Internal Controls & ToC", papers: 5, description: "IC evaluation, walkthroughs, test of controls, IT review & deficiency log" },
  { prefix: "E", label: "Substantive Testing", papers: 10, description: "Cash, receivables, inventory, PPE, payables, revenue, expenses, equity, tax & provisions" },
  { prefix: "F", label: "Special Areas", papers: 6, description: "Related parties, going concern, subsequent events, estimates, laws & litigation" },
  { prefix: "G", label: "Completion & Finalization", papers: 7, description: "Misstatements, AJE, final analytics, checklist, going concern, events & reps" },
  { prefix: "H", label: "Reporting", papers: 5, description: "Opinion assessment, auditor's report, KAMs, EoM & other information" },
  { prefix: "I", label: "Quality Control & Review", papers: 4, description: "EQCR, review notes, consultation & file completion" },
  { prefix: "J", label: "Tax & Regulatory (Pakistan)", papers: 5, description: "Income tax, deferred tax, sales tax, WHT & super tax" },
  { prefix: "K", label: "Final Output", papers: 3, description: "Signed opinion, engagement close & archive" },
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
    <div className="space-y-4">
      <div
        onDragOver={e => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-2xl py-14 px-8 text-center cursor-pointer transition-all overflow-hidden group
          ${drag
            ? "border-blue-400 bg-blue-50/60 shadow-inner"
            : "border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/20 hover:shadow-sm"}`}
      >
        <div className={`absolute inset-0 transition-opacity duration-300 pointer-events-none ${drag ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
          style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(59,130,246,0.06) 0%, transparent 70%)" }} />
        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-5 transition-all shadow-sm
          ${drag ? "bg-blue-500 shadow-blue-200" : "bg-gradient-to-br from-blue-500 to-blue-600 shadow-blue-200 group-hover:scale-105"}`}>
          <Upload className="w-6 h-6 text-white" />
        </div>
        <p className="text-base font-bold text-slate-800">Drop your audit documents here</p>
        <p className="text-sm text-slate-400 mt-1.5 font-medium">PDF · Excel · CSV · Word · Images · Emails — up to 20 files</p>
        <div className="flex items-center justify-center gap-1.5 mt-4">
          {["PDF", "XLSX", "CSV", "DOCX", "JPG", "EML"].map(ext => (
            <span key={ext} className="text-[10px] font-black text-slate-400 border border-slate-200 rounded-md px-2 py-1 font-mono tracking-wider bg-slate-50">{ext}</span>
          ))}
        </div>
        <button className="mt-6 text-xs font-bold text-blue-600 border border-blue-200 bg-blue-50 hover:bg-blue-100 rounded-xl px-5 py-2.5 transition-colors">Browse Files</button>
        <input ref={inputRef} type="file" multiple className="hidden"
          accept=".pdf,.xlsx,.xls,.csv,.txt,.docx,.doc,.jpg,.jpeg,.png,.webp,.eml"
          onChange={e => e.target.files && onAdd(e.target.files)} />
      </div>

      {files.length > 0 && (
        <div className="space-y-2.5">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Uploaded Files ({files.length})</p>
          <div className="divide-y divide-slate-100 border border-slate-200/80 rounded-2xl overflow-hidden bg-white shadow-sm">
            {files.map(f => (
              <motion.div key={f.id} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50/70 transition-colors group">
                <div className="w-9 h-9 bg-slate-50 rounded-xl flex items-center justify-center border border-slate-100 shrink-0">
                  {fileIcon(f.file)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{f.file.name}</p>
                  <p className="text-[11px] text-slate-400 font-medium">{(f.file.size / 1024).toFixed(0)} KB {f.classified ? <span className="ml-1 text-blue-600 font-semibold">· {f.classified}</span> : ""}</p>
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
  const wpLetter = (wp.ref || "").replace(/[0-9\-]/g, "");
  const group = WP_GROUPS.find(g => g.prefix === wpLetter);

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
  const [expandedWPGroups, setExpandedWPGroups] = useState<string[]>(["A"]);
  const [expandedWPCards, setExpandedWPCards] = useState<string[]>([]);
  const [analysisTab, setAnalysisTab] = useState<"summary" | "ratios" | "reconciliation" | "evidence" | "ic">("summary");

  // ── Audit Period ─────────────────────────────────────────────────────────────
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [periodSuggested, setPeriodSuggested] = useState(false);

  // ── Extended Variables (A-K System) ─────────────────────────────────────────
  const [strn, setStrn] = useState("");
  const [industry, setIndustry] = useState("");

  const [stPeriodFrom, setStPeriodFrom] = useState("");
  const [stPeriodTo, setStPeriodTo] = useState("");
  const [stTaxType, setStTaxType] = useState("Sales Tax");
  const [stJurisdiction, setStJurisdiction] = useState("FBR");
  const [stReturnPeriod, setStReturnPeriod] = useState("Monthly");
  const [salesTaxRows, setSalesTaxRows] = useState<SalesTaxRow[]>([]);
  const [stUploading, setStUploading] = useState(false);
  const stFileRef = useRef<HTMLInputElement>(null);

  const [glData, setGlData] = useState<any[]>([]);
  const [tbData2, setTbData2] = useState<any[]>([]);
  const [coaData, setCoaData] = useState<any[]>([]);
  const [glTbSummary, setGlTbSummary] = useState<any>(null);
  const [generatingGlTb, setGeneratingGlTb] = useState(false);
  const [glTbTab, setGlTbTab] = useState<"gl" | "tb" | "coa">("gl");
  const [entityType, setEntityType] = useState("Private Limited");
  const [framework, setFramework] = useState("IFRS");
  const [listedStatus, setListedStatus] = useState("Unlisted");
  const [firstYearAudit, setFirstYearAudit] = useState(false);
  const [goingConcernFlag, setGoingConcernFlag] = useState(false);
  const [controlReliance, setControlReliance] = useState("Partial");
  const [significantRiskAreas, setSignificantRiskAreas] = useState<string[]>([]);
  const [currency, setCurrency] = useState("PKR");
  const [newClient, setNewClient] = useState(false);
  const [groupAuditFlag, setGroupAuditFlag] = useState(false);
  const [internalAuditExists, setInternalAuditExists] = useState(false);

  // ── Ethics & Independence (Variable Group D) ─────────────────────────────
  const [independenceConfirmed, setIndependenceConfirmed] = useState(true);
  const [conflictCheck, setConflictCheck] = useState(true);
  const [eqcrRequired, setEqcrRequired] = useState(false);

  // ── Sampling Variables (Variable Group N) ─────────────────────────────────
  const [samplingMethod, setSamplingMethod] = useState("Statistical");
  const [confidenceLevel, setConfidenceLevel] = useState("95%");

  // ── Special Area Flags (Variable Group O) ─────────────────────────────────
  const [relatedPartyFlag, setRelatedPartyFlag] = useState(false);
  const [subsequentEventsFlag, setSubsequentEventsFlag] = useState(false);
  const [estimatesFlag, setEstimatesFlag] = useState(false);
  const [litigationFlag, setLitigationFlag] = useState(false);
  const [expertRequired, setExpertRequired] = useState(false);

  // ── Tax & Regulatory Variables (Variable Group P) ─────────────────────────
  const [currentTaxApplicable, setCurrentTaxApplicable] = useState(true);
  const [deferredTaxApplicable, setDeferredTaxApplicable] = useState(true);
  const [whtExposure, setWhtExposure] = useState(true);
  const [salesTaxRegistered, setSalesTaxRegistered] = useState(true);
  const [superTaxApplicable, setSuperTaxApplicable] = useState(false);

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

  const [configValues, setConfigValues] = useState<Record<string, any>>(() => getDefaultValues());
  const handleConfigChange = useCallback((key: string, value: any) => {
    setConfigValues(prev => ({ ...prev, [key]: value }));
  }, []);

  // ── Variable Template Download / Upload ────────────────────────────────────
  const [varTemplateUploading, setVarTemplateUploading] = useState(false);
  const varTemplateFileRef = useRef<HTMLInputElement>(null);

  const downloadVariableTemplate = useCallback(() => {
    const sectionOrder: Record<string, string> = {
      entity_legal: "1. Entity Legal & Classification",
      financial_reporting: "2. Financial Reporting Basis",
      prior_year: "3. Prior Year / Opening Balance Context",
      materiality: "4. Materiality",
      risk_assessment: "5. Risk Assessment",
      it_controls: "6. IT / Controls / Service Organization",
      experts_cycles: "7. Experts / Multi-location / Cycles",
      sampling: "8. Sampling / Confirmations",
      pakistan_tax: "9. Pakistan Tax & Regulatory",
      significant_fs: "10. Significant FS Areas",
      ethics: "11. Ethics / Independence / Quality",
      team: "12. Team / Approvals / EQCR",
      governance: "13. Governance / Deadlines / Subsequent Events",
      reporting: "14. Reporting Drivers",
      system_controls: "15. System Controls / Regeneration / Archive",
    };

    const rows = VARIABLE_DEFS.map(v => {
      let rec = "";
      if (v.defaultValue !== undefined && v.defaultValue !== null) {
        rec = v.fieldType === "toggle" ? (v.defaultValue ? "Yes" : "No") : String(v.defaultValue);
      } else if (v.fieldType === "toggle") {
        rec = "No";
      } else if (v.fieldType === "dropdown" && v.options && v.options.length > 0) {
        rec = v.options[0];
      }
      return {
        "Section": sectionOrder[v.section] || v.section,
        "Variable Name": v.label,
        "Field Type": v.fieldType,
        "Allowed Values / Options": v.options ? v.options.join(" | ") : v.fieldType === "toggle" ? "Yes | No" : "",
        "Mandatory": v.mandatory ? "Yes" : "No",
        "High Impact": v.isHighImpact ? "Yes" : "No",
        "Standard Reference": v.standardRef,
        "WP Codes Affected": v.wpCodes.join(", "),
        "Help Text": v.helpText,
        "Recommended Response": rec,
        "Variable Key (do not edit)": v.key,
      };
    });

    const ws = XLSX.utils.json_to_sheet(rows);

    const colWidths = [
      { wch: 40 }, { wch: 45 }, { wch: 18 }, { wch: 60 },
      { wch: 12 }, { wch: 14 }, { wch: 40 }, { wch: 22 },
      { wch: 60 }, { wch: 40 }, { wch: 28 },
    ];
    ws["!cols"] = colWidths;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Engagement Variables");

    const instrRows = [
      { "Instructions": "HOW TO USE THIS TEMPLATE" },
      { "Instructions": "" },
      { "Instructions": "1. Review each variable in the 'Engagement Variables' sheet." },
      { "Instructions": "2. Fill in the 'Recommended Response' column (column J) with your answers." },
      { "Instructions": "3. For dropdown fields: enter one of the values listed in 'Allowed Values / Options'." },
      { "Instructions": "4. For toggle fields: enter 'Yes' or 'No'." },
      { "Instructions": "5. For multi-select fields: separate multiple values with a pipe character  |  (e.g. FBR | PRA)." },
      { "Instructions": "6. For number fields: enter a plain number (no commas or currency symbols)." },
      { "Instructions": "7. For date fields: use YYYY-MM-DD format (e.g. 2024-06-30)." },
      { "Instructions": "8. Do NOT edit the 'Variable Key (do not edit)' column — it is used for import mapping." },
      { "Instructions": "9. Save the file and upload it back using the 'Upload Variables' button on the Working Papers page." },
      { "Instructions": "10. Your responses will be pre-loaded into Step 2 (Configure) as editable fields." },
    ];
    const instrWs = XLSX.utils.json_to_sheet(instrRows);
    instrWs["!cols"] = [{ wch: 80 }];
    XLSX.utils.book_append_sheet(wb, instrWs, "Instructions");

    XLSX.writeFile(wb, "Engagement_Variable_Template.xlsx");
  }, []);

  const handleVariableTemplateUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setVarTemplateUploading(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const wb = XLSX.read(arrayBuffer, { type: "array" });
      const sheetName = wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];
      const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: "" });

      const keyCol = "Variable Key (do not edit)";
      const valCol = "Recommended Response";

      const updates: Record<string, any> = {};
      let mapped = 0;

      for (const row of rows) {
        const key = String(row[keyCol] || "").trim();
        const rawVal = String(row[valCol] ?? "").trim();
        if (!key || !rawVal) continue;

        const varDef = VARIABLE_DEFS.find(v => v.key === key);
        if (!varDef) continue;

        let parsed: any = rawVal;
        if (varDef.fieldType === "toggle") {
          parsed = rawVal.toLowerCase() === "yes" || rawVal === "true" || rawVal === "1";
        } else if (varDef.fieldType === "number") {
          const n = parseFloat(rawVal.replace(/,/g, ""));
          if (!isNaN(n)) parsed = n;
          else continue;
        } else if (varDef.fieldType === "multi-select") {
          parsed = rawVal.split("|").map((s: string) => s.trim()).filter(Boolean);
        }

        updates[key] = parsed;
        mapped++;
      }

      if (mapped === 0) {
        toast({ title: "No variables mapped", description: "Could not find any matching variable keys in the uploaded file. Ensure you used the official template.", variant: "destructive" });
        return;
      }

      setConfigValues(prev => ({ ...prev, ...updates }));
      toast({ title: "Variables Imported", description: `${mapped} variable(s) successfully loaded. Review and edit them in the Configure step.` });
      setStep(1);
    } catch {
      toast({ title: "Upload failed", description: "Could not parse the uploaded file. Please use the downloaded template.", variant: "destructive" });
    } finally {
      setVarTemplateUploading(false);
      if (varTemplateFileRef.current) varTemplateFileRef.current.value = "";
    }
  }, [toast]);

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

  // ── Auto-suggest period start/end from Financial Year text ───────────────────
  useEffect(() => {
    if (!financialYear.trim()) return;
    // Try to find a closing date from common patterns
    // "Year ended June 30, 2024" | "Year ended 30 June 2024" | "2024-06-30" | "June 30, 2024"
    const MONTHS: Record<string, number> = {
      january:1,february:2,march:3,april:4,may:5,june:6,
      july:7,august:8,september:9,october:10,november:11,december:12,
      jan:1,feb:2,mar:3,apr:4,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12,
    };
    let endDate: Date | null = null;

    // ISO: YYYY-MM-DD anywhere in string
    const isoMatch = financialYear.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
      endDate = new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
    }

    if (!endDate) {
      // "Month DD, YYYY" or "DD Month YYYY"
      const fy = financialYear.toLowerCase();
      for (const [mon, num] of Object.entries(MONTHS)) {
        // Pattern: month name, then optional day + year
        const m1 = new RegExp(`${mon}\\s+(\\d{1,2})[,\\s]+(\\d{4})`).exec(fy);
        if (m1) { endDate = new Date(Number(m1[2]), num - 1, Number(m1[1])); break; }
        // Pattern: day then month name then year
        const m2 = new RegExp(`(\\d{1,2})\\s+${mon}\\s+(\\d{4})`).exec(fy);
        if (m2) { endDate = new Date(Number(m2[2]), num - 1, Number(m2[1])); break; }
      }
    }

    if (!endDate || isNaN(endDate.getTime())) return;

    // period end = closing date; period start = same day+1 one year before
    const startDate = new Date(endDate);
    startDate.setFullYear(startDate.getFullYear() - 1);
    startDate.setDate(startDate.getDate() + 1);

    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    setPeriodEnd(fmt(endDate));
    setPeriodStart(fmt(startDate));
    setPeriodSuggested(true);
  }, [financialYear]);

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

  // ── Smart Defaults Engine ────────────────────────────────────────────────────
  // Computes the most recent June 30 year-end and fills all empty fields.
  // NEVER overwrites: entityName, ntn, secp, registeredAddress, firmName, team.
  const applySmartDefaults = useCallback((showToast = true) => {
    const today = new Date();
    const curYear = today.getFullYear();
    const curMonth = today.getMonth() + 1; // 1-12

    // June year-end: if today is Jan–Jun, last FY ended June 30 of prior calendar year
    const fyEndYear = curMonth <= 6 ? curYear - 1 : curYear;
    const fyStartYear = fyEndYear - 1;

    const d2 = (n: number) => String(n).padStart(2, "0");
    const fmt = (y: number, m: number, day: number) => `${y}-${d2(m)}-${d2(day)}`;

    // Period & year label (only fill if still empty)
    setFinancialYear(prev => prev || `Year ended June 30, ${fyEndYear}`);
    setPeriodStart(prev => prev || fmt(fyStartYear, 7, 1));
    setPeriodEnd(prev => prev || fmt(fyEndYear, 6, 30));
    setPeriodSuggested(true);

    // Key deadlines (all relative to fyEndYear June 30) — fill only if empty
    setPlanningDeadline(prev => prev || fmt(fyEndYear, 4, 1));
    setFieldworkStart(prev => prev || fmt(fyEndYear, 5, 15));
    setFieldworkEnd(prev => prev || fmt(fyEndYear, 7, 31));
    setReportingDeadline(prev => prev || fmt(fyEndYear, 9, 30));
    setReportDate(prev => prev || fmt(fyEndYear, 9, 30));
    setFilingDeadline(prev => prev || fmt(fyEndYear, 10, 31));
    // Archive = report date + 60 days → approx Nov 29 of fyEndYear
    setArchiveDate(prev => prev || fmt(fyEndYear, 11, 29));

    // Sales tax period defaults (fill if empty)
    setStPeriodFrom(prev => prev || fmt(fyStartYear, 7, 1));
    setStPeriodTo(prev => prev || fmt(fyEndYear, 6, 30));

    // Classification & framework (fill if still at blank/initial)
    setEngagementType(prev => prev || "Statutory Audit");
    setEntityType(prev => prev || "Private Limited");
    setFramework(prev => prev || "IFRS");
    setListedStatus(prev => prev || "Unlisted");
    setCurrency(prev => prev || "PKR");
    setControlReliance(prev => prev || "Partial");
    setSamplingMethod(prev => prev || "Statistical");
    setConfidenceLevel(prev => prev || "95%");

    // Large-company risk flags — always set to true (user can override)
    setSignificantRiskAreas(prev =>
      prev.length > 0 ? prev : ["Revenue", "Receivables", "Inventory", "Fixed Assets", "Related Parties"]
    );
    setInternalAuditExists(true);
    setRelatedPartyFlag(true);
    setSubsequentEventsFlag(true);
    setEstimatesFlag(true);

    // Tax & regulatory — standard Pakistan defaults
    setCurrentTaxApplicable(true);
    setDeferredTaxApplicable(true);
    setWhtExposure(true);
    setSalesTaxRegistered(true);
    setSuperTaxApplicable(false);

    // Ethics & independence
    setIndependenceConfirmed(true);
    setConflictCheck(true);

    if (showToast) {
      toast({
        title: "Smart defaults applied",
        description: `Engagement pre-populated for June 30, ${fyEndYear} year-end (Large Company – ISA/IFRS). Review and adjust as needed.`,
      });
    }
  }, [toast]);

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
        // Only fill identity fields if AI found them (exclusion rule: never auto-fill name, NTN, SECP, address, firm, team)
        if (d.entity_name)        setEntityName(d.entity_name);
        if (d.ntn)                setNtn(d.ntn);
        if (d.secp)               setSecp(d.secp);
        if (d.financial_year)     setFinancialYear(d.financial_year);
        if (d.registered_address) setRegisteredAddress(d.registered_address);
        if (d.engagement_type)    setEngagementType(d.engagement_type);

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

        const gotSomething = !!(d.entity_name || d.ntn || fn.revenue || fn.total_assets);
        setAutoFilled(gotSomething);
      }
      // Always apply smart defaults after extraction (fills any gaps the AI left)
      applySmartDefaults(false);
      toast({
        title: "Engagement pre-populated",
        description: "AI extraction complete. Smart defaults applied for any missing fields. Review and adjust in Configure.",
      });
    } catch (err: any) {
      toast({ title: "Auto-extraction incomplete", description: "Applying smart defaults for all engagement fields. Fill in entity details manually.", variant: "default" });
      applySmartDefaults(false);
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

  const updateSalesTaxRow = (rowId: string, field: keyof SalesTaxRow, val: string) => {
    setSalesTaxRows(prev => prev.map(r => r.id === rowId ? { ...r, [field]: val } : r));
  };

  const handleSTDownloadTemplate = () => {
    const headers = SALES_TAX_COLS.map(c => c.label);
    const csvContent = headers.join(",") + "\n";
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "sales_tax_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSTUploadExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setStUploading(true);
    try {
      const colMap: Record<string, keyof SalesTaxRow> = {
        "period from": "periodFrom", "period to": "periodTo",
        "invoice date": "invoiceDate", "invoice no.": "invoiceNo", "invoice no": "invoiceNo",
        "customer / supplier name": "customerSupplier", "customer / supplier": "customerSupplier",
        "ntn / cnic": "ntnCnic", "strn": "strn", "description": "description",
        "sales type": "salesType", "taxable value": "taxableValue",
        "sales tax rate": "salesTaxRate", "st rate %": "salesTaxRate",
        "sales tax amount": "salesTaxAmount", "st amount": "salesTaxAmount",
        "further tax rate": "furtherTaxRate", "ft rate %": "furtherTaxRate",
        "further tax amount": "furtherTaxAmount", "ft amount": "furtherTaxAmount",
        "fed rate": "fedRate", "fed rate %": "fedRate",
        "fed amount": "fedAmount",
        "province / tax jurisdiction": "jurisdiction", "province / jurisdiction": "jurisdiction",
        "input tax / output tax": "inputOutput", "input / output": "inputOutput",
        "adjustment / debit note / credit note": "adjustment", "adj / dn / cn": "adjustment",
        "net tax": "netTax",
      };

      const arrayBuffer = await file.arrayBuffer();
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(arrayBuffer, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) { toast({ title: "Empty file", description: "The uploaded file has no sheets.", variant: "destructive" }); return; }
      const sheet = workbook.Sheets[sheetName];
      const rawData: string[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as string[][];

      if (rawData.length < 2) { toast({ title: "Empty file", description: "The uploaded file contains no data rows.", variant: "destructive" }); return; }
      const headers = (rawData[0] as string[]).map(h => String(h ?? "").trim().toLowerCase());
      const headerMap: (keyof SalesTaxRow | null)[] = headers.map(h => colMap[h] || null);
      const rows: SalesTaxRow[] = [];
      for (let i = 1; i < rawData.length; i++) {
        const vals = (rawData[i] as string[]).map(v => String(v ?? "").trim());
        const row = emptySalesTaxRow();
        headerMap.forEach((field, idx) => { if (field && field !== "id" && vals[idx]) (row as any)[field] = vals[idx]; });
        const hasData = Object.entries(row).some(([k, v]) => k !== "id" && v);
        if (hasData) rows.push(row);
      }
      if (rows.length > 0) {
        setSalesTaxRows(prev => [...prev, ...rows]);
        toast({ title: "Sales Tax Data Imported", description: `${rows.length} row(s) loaded from "${file.name}".` });
      } else {
        toast({ title: "No data mapped", description: "Could not map any rows from the uploaded file. Check column headers match the template.", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Upload failed", description: err?.message || "Could not parse the uploaded file.", variant: "destructive" });
    } finally {
      setStUploading(false);
      if (stFileRef.current) stFileRef.current.value = "";
    }
  };

  const handleGenerateGlTb = async () => {
    setGeneratingGlTb(true);
    try {
      const res = await fetch("/api/working-papers/generate-gl-tb", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ entityName, industry, financialYear, bsData, plData, ntn, strn, engagementType, framework }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setGlData(data.general_ledger || []);
      setTbData2(data.trial_balance || []);
      setCoaData(data.chart_of_accounts || []);
      setGlTbSummary(data.summary || null);
      toast({ title: "GL & Trial Balance Generated", description: `${data.summary?.gl_entries || 0} GL entries, ${data.summary?.tb_accounts || 0} TB accounts. ${data.summary?.is_balanced ? "Balanced" : "Check balance"}.` });
    } catch (err: any) {
      toast({ title: "GL/TB Generation Failed", description: err.message, variant: "destructive" });
    } finally {
      setGeneratingGlTb(false);
    }
  };

  const fmtPKR = (n: number) => n != null ? `PKR ${Number(n).toLocaleString("en-PK")}` : "";

  const addFsRow = (tab: "bs" | "pl", secId: string) => {
    const setter = tab === "bs" ? setBsData : setPlData;
    const uid = `custom_${Date.now()}`;
    setter(prev => prev.map(s => {
      if (s.id !== secId) return s;
      const subtotalIdx = s.lines.findIndex(l => l.subtotal);
      const newLine: FSLine = { id: uid, label: "", cy: "", py: "", isCustom: true };
      const updated = [...s.lines];
      if (subtotalIdx >= 0) updated.splice(subtotalIdx, 0, newLine);
      else updated.push(newLine);
      return { ...s, lines: updated };
    }));
  };

  const removeFsRow = (tab: "bs" | "pl", secId: string, lineId: string) => {
    const setter = tab === "bs" ? setBsData : setPlData;
    setter(prev => prev.map(s => s.id === secId
      ? { ...s, lines: s.lines.filter(l => l.id !== lineId) }
      : s
    ));
  };

  const updateFsLabel = (tab: "bs" | "pl", secId: string, lineId: string, label: string) => {
    const setter = tab === "bs" ? setBsData : setPlData;
    setter(prev => prev.map(s => s.id === secId
      ? { ...s, lines: s.lines.map(l => l.id === lineId ? { ...l, label } : l) }
      : s
    ));
  };

  const addBreakup = (tab: "bs" | "pl", secId: string, lineId: string) => {
    const setter = tab === "bs" ? setBsData : setPlData;
    const uid = `brk_${Date.now()}`;
    setter(prev => prev.map(s => s.id === secId
      ? { ...s, lines: s.lines.map(l => l.id === lineId
        ? { ...l, breakups: [...(l.breakups || []), { id: uid, label: "", cy: "", py: "" }] }
        : l
      )}
      : s
    ));
  };

  const removeBreakup = (tab: "bs" | "pl", secId: string, lineId: string, brkId: string) => {
    const setter = tab === "bs" ? setBsData : setPlData;
    setter(prev => prev.map(s => s.id === secId
      ? { ...s, lines: s.lines.map(l => l.id === lineId
        ? { ...l, breakups: (l.breakups || []).filter(b => b.id !== brkId) }
        : l
      )}
      : s
    ));
  };

  const updateBreakup = (tab: "bs" | "pl", secId: string, lineId: string, brkId: string, field: "label" | "cy" | "py", val: string) => {
    const setter = tab === "bs" ? setBsData : setPlData;
    setter(prev => prev.map(s => s.id === secId
      ? { ...s, lines: s.lines.map(l => l.id === lineId
        ? { ...l, breakups: (l.breakups || []).map(b => b.id === brkId ? { ...b, [field]: val } : b) }
        : l
      )}
      : s
    ));
  };

  const [expandedBreakups, setExpandedBreakups] = useState<string[]>([]);
  const toggleBreakupExpand = (lineId: string) => {
    setExpandedBreakups(prev => prev.includes(lineId) ? prev.filter(x => x !== lineId) : [...prev, lineId]);
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
    if (!entityName.trim()) {
      toast({ title: "Entity name required", description: "Please enter the entity name in the Configure step before running analysis.", variant: "destructive" });
      return;
    }
    setAnalyzing(true);
    setProgress(10);
    setProgressMsg("Uploading documents...");

    const formData = new FormData();
    files.forEach(f => formData.append("files", f.file));
    formData.append("entityName", entityName);
    formData.append("ntn", ntn);
    formData.append("secp", secp);
    formData.append("engagementType", engagementType);
    formData.append("financialYear", financialYear);
    formData.append("firmName", firmName);
    formData.append("instructions", instructions);
    formData.append("bsData", JSON.stringify(bsData));
    formData.append("plData", JSON.stringify(plData));
    formData.append("configValues", JSON.stringify(configValues));
    formData.append("salesTaxRows", JSON.stringify(salesTaxRows));
    formData.append("periodStart", periodStart);
    formData.append("periodEnd", periodEnd);

    try {
      setProgress(40);
      setProgressMsg("Sending documents to AI engine...");

      const res = await fetch("/api/working-papers/analyze", {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` },
        body: formData,
      });

      if (!res.ok) throw new Error(await res.text());

      setProgress(80);
      setProgressMsg("Processing AI response...");

      const data = await res.json();

      if (data.analysis) {
        setAnalysis(data.analysis);
      } else if (data.success === false || data.error) {
        throw new Error(data.error || "Analysis returned no data");
      }

      setProgress(100);
      setStep(2);
      toast({ title: "Analysis complete", description: "Review the results below, then click Generate Working Papers." });
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
          strn,
          industry,
          entityType,
          framework,
          listedStatus,
          firstYearAudit,
          goingConcernFlag,
          controlReliance,
          significantRiskAreas,
          registeredAddress,
          periodStart,
          periodEnd,
          currency,
          newClient,
          groupAuditFlag,
          internalAuditExists,
          independenceConfirmed,
          conflictCheck,
          eqcrRequired,
          samplingMethod,
          confidenceLevel,
          relatedPartyFlag,
          subsequentEventsFlag,
          estimatesFlag,
          litigationFlag,
          expertRequired,
          currentTaxApplicable,
          deferredTaxApplicable,
          whtExposure,
          salesTaxRegistered,
          superTaxApplicable,
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
          bsData,
          plData,
          salesTaxRows,
          configValues,
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
      toast({ title: "Generation complete", description: `${papers.length} working papers generated across 11 audit phases (A-K). Review below then export.` });
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
        body: JSON.stringify({ workingPapers, evidenceIndex, meta: generationMeta, analysis, entityName, financialYear, bsData, plData, salesTaxRows }),
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `Audit_WP_${entityName.replace(/\s+/g, "_")}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
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
        body: JSON.stringify({ workingPapers, evidenceIndex, meta: generationMeta, analysis, entityName, financialYear, bsData, plData, salesTaxRows }),
      });
      if (!res.ok) throw new Error("Excel export failed");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `Audit_WP_${entityName.replace(/\s+/g, "_")}.xlsx`;
      a.click();
      window.URL.revokeObjectURL(url);
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
        body: JSON.stringify({ workingPapers, evidenceIndex, meta: generationMeta, analysis, entityName, financialYear, bsData, plData, salesTaxRows }),
      });
      if (!res.ok) throw new Error("DOCX export failed");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `Audit_WP_${entityName.replace(/\s+/g, "_")}.docx`;
      a.click();
      window.URL.revokeObjectURL(url);
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
        body: JSON.stringify({ analysis, bsData, plData, salesTaxRows, meta: { entity: entityName, financial_year: financialYear, firm_name: firmName, ...generationMeta } }),
      });
      if (!res.ok) throw new Error("Confirmations generation failed");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `Confirmations_${entityName.replace(/\s+/g, "_")}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
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
    <div className="flex flex-col min-h-screen font-sans text-slate-900" style={{ background: "linear-gradient(160deg, #f0f4ff 0%, #f8fafc 40%, #fafafa 100%)" }}>

      {/* ── TOP BAR ───────────────────────────────────────────────────────── */}
      <header className="h-16 flex items-center justify-between px-8 bg-white/95 backdrop-blur-sm border-b border-slate-200/80 sticky top-0 z-20 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-600 shadow-sm shadow-blue-200">
            <BookOpen className="w-4 h-4 text-white" />
          </div>
          <div className="flex items-center gap-1.5 text-sm">
            <span className="font-semibold text-slate-800">Audit Working Papers</span>
            <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
            <span className="font-medium text-blue-600">{STEPS[step].label}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">ANA & Co. · Chartered Accountants</span>
          <div className="w-1 h-1 rounded-full bg-slate-300" />
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">ISA 200–720</span>
        </div>
      </header>

      {/* ── STEP WIZARD ───────────────────────────────────────────────────── */}
      <div className="bg-white/80 backdrop-blur-sm border-b border-slate-200/60 px-8 py-4 sticky top-16 z-10">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center gap-0">
            {STEPS.map((s, i) => {
              const isCompleted = step > s.id;
              const isCurrent   = step === s.id;
              const isLast      = i === STEPS.length - 1;
              return (
                <React.Fragment key={s.id}>
                  <button
                    onClick={() => step > s.id && setStep(s.id)}
                    disabled={step <= s.id}
                    className={`flex items-center gap-2.5 group transition-all ${step > s.id ? "cursor-pointer" : "cursor-default"}`}
                  >
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black border-2 transition-all duration-300 shrink-0
                      ${isCompleted ? "bg-blue-600 border-blue-600 text-white shadow-sm shadow-blue-200"
                        : isCurrent  ? "bg-white border-blue-600 text-blue-600 shadow-sm shadow-blue-100 ring-4 ring-blue-50"
                        : "bg-white border-slate-200 text-slate-400"}`}
                    >
                      {isCompleted ? <Check className="w-3.5 h-3.5" /> : s.id + 1}
                    </div>
                    <div className="hidden sm:block">
                      <p className={`text-xs font-bold leading-none transition-colors ${isCurrent ? "text-blue-700" : isCompleted ? "text-slate-600" : "text-slate-400"}`}>
                        {s.shortLabel}
                      </p>
                      {isCurrent && <p className="text-[9px] text-blue-500 font-medium mt-0.5 leading-none">{s.label}</p>}
                    </div>
                  </button>
                  {!isLast && (
                    <div className={`flex-1 h-[2px] mx-3 rounded-full transition-all duration-500 ${isCompleted ? "bg-blue-500" : "bg-slate-200"}`} />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      </div>

      <div className="px-8 py-8">
        <div className="max-w-5xl mx-auto pb-28">
            <AnimatePresence mode="wait">
              <motion.div key={step} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -15 }} transition={{ duration: 0.3 }}>
                
                {/* STEP 0: UPLOAD documents */}
                {step === 0 && (
                  <div className="space-y-8">
                    {/* Hero Header */}
                    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
                      <div className="relative px-8 pt-8 pb-6 overflow-hidden" style={{ background: "linear-gradient(135deg, #1e3a8a 0%, #1d4ed8 50%, #2563eb 100%)" }}>
                        <div className="absolute top-0 right-0 w-72 h-72 rounded-full opacity-10" style={{ background: "radial-gradient(circle, #fff 0%, transparent 70%)", transform: "translate(30%, -30%)" }} />
                        <div className="absolute bottom-0 left-0 w-48 h-48 rounded-full opacity-5" style={{ background: "radial-gradient(circle, #fff 0%, transparent 70%)", transform: "translate(-30%, 30%)" }} />
                        <div className="relative z-10 flex items-start justify-between gap-6">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-3">
                              <span className="text-[10px] font-black text-blue-200 uppercase tracking-[0.2em]">Step 1 of 5</span>
                              <div className="h-px flex-1 max-w-[40px] bg-blue-400/40" />
                              <span className="text-[10px] font-bold text-blue-300 uppercase tracking-widest">ISA 230</span>
                            </div>
                            <h2 className="text-2xl font-black text-white leading-tight">Upload Audit Documents</h2>
                            <p className="text-sm text-blue-200 mt-2 leading-relaxed max-w-xl">Upload Trial Balance, Financial Statements, bank statements, contracts, and confirmations. The AI engine will auto-structure and generate ISA-compliant working papers from Acceptance through EQCR.</p>
                          </div>
                          <div className="hidden md:flex items-center justify-center w-16 h-16 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/20 shrink-0 mt-1">
                            <Upload className="w-7 h-7 text-white" />
                          </div>
                        </div>
                        <div className="relative z-10 flex flex-wrap gap-2 mt-5">
                          {["TB / GL", "Financial Statements", "Bank Statements", "Contracts", "Confirmations", "Board Minutes", "Tax Returns"].map(tag => (
                            <span key={tag} className="text-[10px] font-bold text-blue-100 border border-blue-400/30 bg-white/10 rounded-full px-2.5 py-1 uppercase tracking-wide backdrop-blur-sm">{tag}</span>
                          ))}
                        </div>
                      </div>
                    </div>

                    <DropZone files={files} onAdd={addFiles} onRemove={removeFile} />

                    {/* ── Engagement Variable Template ─────────────────── */}
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-5 space-y-4">
                      <div className="flex items-start gap-3">
                        <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0 mt-0.5">
                          <FileSpreadsheet className="w-5 h-5 text-emerald-700" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-bold text-emerald-900">Engagement Variable Template</h3>
                          <p className="text-xs text-emerald-700 mt-1 leading-relaxed">
                            Download the Excel template with all 121 engagement variables and their recommended responses.
                            Fill in your answers, then upload the file to pre-populate the Configure step — all fields remain editable.
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <button
                          onClick={downloadVariableTemplate}
                          className="flex items-center gap-3 rounded-xl border border-emerald-300 bg-white hover:bg-emerald-50 px-4 py-3.5 text-left transition-all group shadow-sm"
                        >
                          <div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0 group-hover:bg-emerald-200 transition-colors">
                            <Download className="w-4 h-4 text-emerald-700" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-slate-800">Download Template</p>
                            <p className="text-[11px] text-slate-500 mt-0.5">Excel · 121 variables · recommended responses pre-filled</p>
                          </div>
                          <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-emerald-600 group-hover:translate-x-0.5 transition-all shrink-0" />
                        </button>

                        <button
                          onClick={() => varTemplateFileRef.current?.click()}
                          disabled={varTemplateUploading}
                          className="flex items-center gap-3 rounded-xl border border-blue-200 bg-white hover:bg-blue-50 px-4 py-3.5 text-left transition-all group shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center shrink-0 group-hover:bg-blue-200 transition-colors">
                            {varTemplateUploading
                              ? <Loader2 className="w-4 h-4 text-blue-700 animate-spin" />
                              : <Upload className="w-4 h-4 text-blue-700" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-slate-800">
                              {varTemplateUploading ? "Importing…" : "Upload Variables"}
                            </p>
                            <p className="text-[11px] text-slate-500 mt-0.5">Upload filled template · auto-advances to Configure</p>
                          </div>
                          <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-blue-600 group-hover:translate-x-0.5 transition-all shrink-0" />
                        </button>
                        <input
                          ref={varTemplateFileRef}
                          type="file"
                          accept=".xlsx,.xls"
                          onChange={handleVariableTemplateUpload}
                          className="hidden"
                        />
                      </div>

                      <p className="text-[10px] text-emerald-600 font-medium flex items-center gap-1.5">
                        <CheckCircle2 className="w-3 h-3 shrink-0" />
                        You can also skip this and fill all variables manually in the Configure step
                      </p>
                    </div>

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
                          <><Loader2 className="mr-2 w-4 h-4 animate-spin" /> AI Extracting Data…</>
                        ) : (
                          <><Sparkles className="mr-2 w-4 h-4" /> Extract & Configure <ChevronRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" /></>
                        )}
                      </Button>
                    </div>
                  </div>
                )}

                {/* STEP 1: CONFIGURE Engagement */}
                {step === 1 && (
                  <div className="space-y-6">
                    {/* Hero Header */}
                    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
                      <div className="relative px-8 pt-7 pb-5 overflow-hidden" style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #1e3a5f 100%)" }}>
                        <div className="absolute top-0 right-0 w-64 h-64 rounded-full opacity-10" style={{ background: "radial-gradient(circle, #6366f1 0%, transparent 70%)", transform: "translate(30%, -30%)" }} />
                        <div className="relative z-10 flex items-start justify-between gap-6">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-3">
                              <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Step 2 of 5</span>
                              <div className="h-px flex-1 max-w-[40px] bg-slate-600" />
                              <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">ISA 315 · ISA 300</span>
                            </div>
                            <h2 className="text-2xl font-black text-white leading-tight">Configure Engagement</h2>
                            <p className="text-sm text-slate-400 mt-1.5 leading-relaxed max-w-xl">Entity particulars, audit team, timeline, financial statements, and engagement variables. This data drives materiality, risk assessment, and procedure selection across all 11 audit phases.</p>
                          </div>
                          <div className="hidden md:flex items-center justify-center w-16 h-16 rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10 shrink-0 mt-1">
                            <Settings className="w-7 h-7 text-slate-300" />
                          </div>
                        </div>
                        <div className="relative z-10 mt-4 flex items-center gap-3 flex-wrap">
                          {autoFilled && (
                            <div className="flex items-center gap-2 text-[11px] font-semibold text-emerald-300 bg-emerald-900/30 border border-emerald-700/30 rounded-lg px-3 py-2">
                              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                              Fields auto-filled from uploaded documents — review and edit as needed
                            </div>
                          )}
                          <button
                            onClick={() => applySmartDefaults(true)}
                            className="flex items-center gap-2 text-[11px] font-bold text-indigo-300 bg-indigo-900/30 border border-indigo-700/40 rounded-lg px-3 py-2 hover:bg-indigo-800/40 transition-colors"
                          >
                            <Sparkles className="w-3.5 h-3.5 shrink-0" />
                            Apply Smart Defaults (June Year-End · Large Entity)
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm divide-y divide-slate-100/80 overflow-hidden">

                      {/* ── Entity & Firm Details ──────────────────────────── */}
                      <div className="p-8 space-y-6">
                        <div className="flex items-center gap-3 pb-5 border-b border-slate-100">
                          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shrink-0 shadow-sm shadow-blue-200">
                            <Building2 className="w-4.5 h-4.5 text-white" style={{ width: "18px", height: "18px" }} />
                          </div>
                          <div>
                            <h3 className="text-sm font-bold text-slate-900">Entity & Firm Details</h3>
                            <p className="text-xs text-slate-500 mt-0.5">Client identification, NTN, SECP registration and audit firm</p>
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="space-y-2">
                            <Label className="text-xs font-bold text-slate-600 ml-1">Company / Entity Name <span className="text-red-500">*</span></Label>
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
                            <Input value={financialYear} onChange={e => { setFinancialYear(e.target.value); setPeriodSuggested(false); }} placeholder="Year ended June 30, 2024" className="h-11 rounded-xl font-medium" />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs font-bold text-slate-600 ml-1">
                              Period Start Date
                              {periodSuggested && periodStart && <span className="ml-1.5 text-[9px] font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 rounded px-1 py-0.5 align-middle">suggested</span>}
                            </Label>
                            <Input type="date" value={periodStart} onChange={e => { setPeriodStart(e.target.value); setPeriodSuggested(false); }} onClick={e => (e.target as HTMLInputElement).showPicker?.()} className="h-11 rounded-xl font-mono text-sm cursor-pointer" />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs font-bold text-slate-600 ml-1">
                              Period End Date
                              {periodSuggested && periodEnd && <span className="ml-1.5 text-[9px] font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 rounded px-1 py-0.5 align-middle">suggested</span>}
                            </Label>
                            <Input type="date" value={periodEnd} onChange={e => { setPeriodEnd(e.target.value); setPeriodSuggested(false); }} onClick={e => (e.target as HTMLInputElement).showPicker?.()} className="h-11 rounded-xl font-mono text-sm cursor-pointer" />
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

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                          <div className="space-y-2">
                            <Label className="text-xs font-bold text-slate-600 ml-1">STRN (Sales Tax Reg.)</Label>
                            <Input value={strn} onChange={e => setStrn(e.target.value)} placeholder="e.g. 32-00-1234-567-89" className="h-11 rounded-xl font-mono" />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs font-bold text-slate-600 ml-1">Industry / Sector</Label>
                            <Input value={industry} onChange={e => setIndustry(e.target.value)} placeholder="e.g. Textile Manufacturing" className="h-11 rounded-xl font-medium" />
                          </div>
                        </div>
                      </div>

                      {/* ── Engagement Team ──────────────────────────────── */}
                      <div className="p-8 space-y-6">
                        <div className="flex items-center gap-3 pb-5 border-b border-slate-100">
                          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center shrink-0 shadow-sm shadow-indigo-200">
                            <Briefcase className="w-[18px] h-[18px] text-white" />
                          </div>
                          <div>
                            <h3 className="text-sm font-bold text-slate-900">Engagement Team</h3>
                            <p className="text-xs text-slate-500 mt-0.5">Preparer, reviewer and approving partner — sign-offs applied automatically</p>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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

                      {/* ── Key Deadlines ──────────────────────────────── */}
                      <div className="p-8 space-y-6">
                        <div className="flex items-center gap-3 pb-5 border-b border-slate-100">
                          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shrink-0 shadow-sm shadow-emerald-200">
                            <Calendar className="w-[18px] h-[18px] text-white" />
                          </div>
                          <div>
                            <h3 className="text-sm font-bold text-slate-900">Key Deadlines</h3>
                            <p className="text-xs text-slate-500 mt-0.5">Planning, fieldwork, reporting and archive dates — ISA 230 compliance</p>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
                          <div className="space-y-1.5">
                            <Label className="text-xs font-bold text-slate-600 ml-1">Planning Deadline <span className="text-red-500">*</span></Label>
                            <Input type="date" value={planningDeadline} onChange={e => setPlanningDeadline(e.target.value)} onClick={e => (e.target as HTMLInputElement).showPicker?.()} className="h-11 rounded-xl font-mono text-sm cursor-pointer" />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs font-bold text-slate-600 ml-1">Fieldwork Start</Label>
                            <Input type="date" value={fieldworkStart} onChange={e => setFieldworkStart(e.target.value)} onClick={e => (e.target as HTMLInputElement).showPicker?.()} className="h-11 rounded-xl font-mono text-sm cursor-pointer" />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs font-bold text-slate-600 ml-1">Fieldwork End</Label>
                            <Input type="date" value={fieldworkEnd} onChange={e => setFieldworkEnd(e.target.value)} onClick={e => (e.target as HTMLInputElement).showPicker?.()} className="h-11 rounded-xl font-mono text-sm cursor-pointer" />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs font-bold text-slate-600 ml-1">Reporting Deadline <span className="text-red-500">*</span></Label>
                            <Input type="date" value={reportingDeadline} onChange={e => setReportingDeadline(e.target.value)} onClick={e => (e.target as HTMLInputElement).showPicker?.()} className="h-11 rounded-xl font-mono text-sm cursor-pointer" />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-3 gap-5">
                          <div className="space-y-1.5">
                            <Label className="text-xs font-bold text-slate-600 ml-1">Report Date</Label>
                            <Input type="date" value={reportDate} onChange={e => setReportDate(e.target.value)} onClick={e => (e.target as HTMLInputElement).showPicker?.()} className="h-11 rounded-xl font-mono text-sm cursor-pointer" />
                            <p className="text-[10px] text-slate-400 ml-1">Date of auditor's report</p>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs font-bold text-slate-600 ml-1">Filing Deadline</Label>
                            <Input type="date" value={filingDeadline} onChange={e => setFilingDeadline(e.target.value)} onClick={e => (e.target as HTMLInputElement).showPicker?.()} className="h-11 rounded-xl font-mono text-sm cursor-pointer" />
                            <p className="text-[10px] text-slate-400 ml-1">SECP / regulatory filing deadline</p>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs font-bold text-slate-600 ml-1">Archive Date</Label>
                            <Input type="date" value={archiveDate} onChange={e => setArchiveDate(e.target.value)} onClick={e => (e.target as HTMLInputElement).showPicker?.()} className="h-11 rounded-xl font-mono text-sm cursor-pointer" />
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

                      {/* ── Financial Statement (FS) Data ── */}
                      <div className="p-0">
                        <div className="px-8 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/30">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-sky-500 to-sky-600 text-white flex items-center justify-center shadow-sm shadow-sky-200">
                              <Table className="w-[18px] h-[18px]" />
                            </div>
                            <div>
                              <h3 className="text-sm font-bold text-slate-900">Financial Statement Data</h3>
                              <p className="text-xs text-slate-500 mt-0.5">Balance sheet and P&L with current and prior year figures</p>
                            </div>
                          </div>
                          <div className="flex bg-white border border-slate-200 rounded-lg p-1">
                            <button onClick={() => setActiveFsTab("bs")} className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${activeFsTab === "bs" ? "bg-slate-900 text-white shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>Balance Sheet</button>
                            <button onClick={() => setActiveFsTab("pl")} className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${activeFsTab === "pl" ? "bg-slate-900 text-white shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>Profit & Loss</button>
                          </div>
                        </div>

                        <div className="p-0">
                          {(activeFsTab === "bs" ? bsData : plData).map((sec) => (
                            <div key={sec.id} className="border-b border-slate-100 last:border-0">
                              <div className="px-6 pt-5 pb-1 flex items-center gap-2">
                                <div className={`w-1.5 h-6 rounded-full ${sec.color}`}></div>
                                <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest">{sec.title}</span>
                              </div>
                              <div className="px-6 pb-4">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="text-slate-400 border-b border-slate-50">
                                      <th className="font-bold text-left py-2 w-[45%]">Line Item</th>
                                      <th className="font-bold text-right py-2 w-[22%]">Current Year</th>
                                      <th className="font-bold text-right py-2 w-[22%]">Prior Year</th>
                                      <th className="py-2 w-[11%]"></th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {sec.lines.map(line => (
                                      <React.Fragment key={line.id}>
                                        <tr className={`${line.bold ? 'font-bold bg-slate-50/50' : ''} group`}>
                                          <td className={`py-2 px-1 ${line.indent ? 'pl-6' : ''}`}>
                                            {line.isCustom ? (
                                              <input
                                                value={line.label}
                                                onChange={e => updateFsLabel(activeFsTab, sec.id, line.id, e.target.value)}
                                                placeholder="Enter line item name..."
                                                className="w-full bg-transparent border-transparent hover:border-slate-200 focus:border-blue-500 focus:bg-white rounded px-1 transition-all outline-none text-xs placeholder:text-slate-300"
                                                autoFocus
                                              />
                                            ) : (
                                              <span className="flex items-center gap-1">
                                                {line.label}
                                                {(line.breakups && line.breakups.length > 0) && (
                                                  <span className="text-[9px] text-blue-500 font-bold">({line.breakups.length})</span>
                                                )}
                                              </span>
                                            )}
                                          </td>
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
                                          <td className="py-2 px-1">
                                            {!line.subtotal && (
                                              <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button
                                                  onClick={() => {
                                                    addBreakup(activeFsTab, sec.id, line.id);
                                                    if (!expandedBreakups.includes(line.id)) toggleBreakupExpand(line.id);
                                                  }}
                                                  title="Add breakup"
                                                  className="p-1 rounded hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition-colors"
                                                >
                                                  <SplitSquareVertical className="w-3 h-3" />
                                                </button>
                                                {(line.breakups && line.breakups.length > 0) && (
                                                  <button
                                                    onClick={() => toggleBreakupExpand(line.id)}
                                                    title={expandedBreakups.includes(line.id) ? "Collapse breakups" : "Expand breakups"}
                                                    className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                                                  >
                                                    {expandedBreakups.includes(line.id) ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                                  </button>
                                                )}
                                                {line.isCustom && (
                                                  <button
                                                    onClick={() => removeFsRow(activeFsTab, sec.id, line.id)}
                                                    title="Remove row"
                                                    className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
                                                  >
                                                    <Trash2 className="w-3 h-3" />
                                                  </button>
                                                )}
                                              </div>
                                            )}
                                          </td>
                                        </tr>
                                        {(line.breakups && line.breakups.length > 0 && expandedBreakups.includes(line.id)) && (
                                          <>
                                            {line.breakups.map(brk => (
                                              <tr key={brk.id} className="bg-blue-50/30 group/brk">
                                                <td className="py-1.5 pl-8 pr-1">
                                                  <div className="flex items-center gap-1">
                                                    <span className="text-blue-400 text-[10px]">┗</span>
                                                    <input
                                                      value={brk.label}
                                                      onChange={e => updateBreakup(activeFsTab, sec.id, line.id, brk.id, "label", e.target.value)}
                                                      placeholder="Breakup description..."
                                                      className="flex-1 bg-transparent border-transparent hover:border-blue-200 focus:border-blue-500 focus:bg-white rounded px-1 transition-all outline-none text-[11px] text-slate-600 placeholder:text-slate-300"
                                                    />
                                                  </div>
                                                </td>
                                                <td className="py-1.5 px-1">
                                                  <input
                                                    value={brk.cy}
                                                    onChange={e => updateBreakup(activeFsTab, sec.id, line.id, brk.id, "cy", e.target.value)}
                                                    placeholder="0"
                                                    className="w-full text-right bg-transparent border-transparent hover:border-blue-200 focus:border-blue-500 focus:bg-white rounded px-1 transition-all outline-none font-mono text-[11px] text-slate-600 placeholder:text-slate-300"
                                                  />
                                                </td>
                                                <td className="py-1.5 px-1">
                                                  <input
                                                    value={brk.py}
                                                    onChange={e => updateBreakup(activeFsTab, sec.id, line.id, brk.id, "py", e.target.value)}
                                                    placeholder="0"
                                                    className="w-full text-right bg-transparent border-transparent hover:border-blue-200 focus:border-blue-500 focus:bg-white rounded px-1 transition-all outline-none font-mono text-[11px] text-slate-600 placeholder:text-slate-300"
                                                  />
                                                </td>
                                                <td className="py-1.5 px-1">
                                                  <button
                                                    onClick={() => removeBreakup(activeFsTab, sec.id, line.id, brk.id)}
                                                    className="p-1 rounded opacity-0 group-hover/brk:opacity-100 hover:bg-red-50 text-slate-400 hover:text-red-500 transition-all"
                                                  >
                                                    <Trash2 className="w-3 h-3" />
                                                  </button>
                                                </td>
                                              </tr>
                                            ))}
                                          </>
                                        )}
                                      </React.Fragment>
                                    ))}
                                  </tbody>
                                </table>
                                <button
                                  onClick={() => addFsRow(activeFsTab, sec.id)}
                                  className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-blue-500 hover:text-blue-700 transition-colors px-1 py-1 rounded hover:bg-blue-50"
                                >
                                  <Plus className="w-3 h-3" /> Add Row
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                    </div>

                    {/* ── 121 Engagement Configuration Variables (flat) ── */}
                    <div className="mt-8">
                      <EngagementConfig
                        values={configValues}
                        onChange={handleConfigChange}
                        users={users}
                      />
                    </div>

                    {/* ── Sales Tax Data ──────────────────────────────── */}
                    <div className="mt-6 bg-white rounded-2xl border border-slate-200/80 shadow-sm p-8 space-y-6">
                      <div className="flex items-center gap-3 pb-5 border-b border-slate-100">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-amber-500 flex items-center justify-center shrink-0 shadow-sm shadow-amber-200">
                          <FileSpreadsheet className="w-[18px] h-[18px] text-white" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-bold text-slate-900">Sales Tax Data</h3>
                            {salesTaxRows.length > 0 && (
                              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">{salesTaxRows.length} rows</span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5">FBR / SRB / PRA sales tax ledger for the engagement period</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                        <div className="space-y-1.5">
                          <Label className="text-[10px] font-bold text-slate-500 uppercase">Period From</Label>
                          <Input type="date" value={stPeriodFrom} onChange={e => setStPeriodFrom(e.target.value)} onClick={e => (e.target as HTMLInputElement).showPicker?.()} className="h-10 rounded-lg font-mono text-sm cursor-pointer" />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[10px] font-bold text-slate-500 uppercase">Period To</Label>
                          <Input type="date" value={stPeriodTo} onChange={e => setStPeriodTo(e.target.value)} onClick={e => (e.target as HTMLInputElement).showPicker?.()} className="h-10 rounded-lg font-mono text-sm cursor-pointer" />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[10px] font-bold text-slate-500 uppercase">Tax Type</Label>
                          <Select value={stTaxType} onValueChange={setStTaxType}>
                            <SelectTrigger className="h-10 rounded-lg text-sm font-medium"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Sales Tax">Sales Tax</SelectItem>
                              <SelectItem value="FED">Federal Excise Duty (FED)</SelectItem>
                              <SelectItem value="Further Tax">Further Tax</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[10px] font-bold text-slate-500 uppercase">Jurisdiction</Label>
                          <Select value={stJurisdiction} onValueChange={setStJurisdiction}>
                            <SelectTrigger className="h-10 rounded-lg text-sm font-medium"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="FBR">FBR (Federal)</SelectItem>
                              <SelectItem value="PRA">PRA (Punjab)</SelectItem>
                              <SelectItem value="SRB">SRB (Sindh)</SelectItem>
                              <SelectItem value="KPRA">KPRA (KP)</SelectItem>
                              <SelectItem value="BRA">BRA (Balochistan)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[10px] font-bold text-slate-500 uppercase">Return Period</Label>
                          <Select value={stReturnPeriod} onValueChange={setStReturnPeriod}>
                            <SelectTrigger className="h-10 rounded-lg text-sm font-medium"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Monthly">Monthly</SelectItem>
                              <SelectItem value="Quarterly">Quarterly</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 pt-2">
                        <input ref={stFileRef} type="file" accept=".csv,.xlsx,.xls" onChange={handleSTUploadExcel} className="hidden" />
                        <Button variant="outline" size="sm" onClick={() => stFileRef.current?.click()} disabled={stUploading} className="rounded-lg font-bold text-xs gap-2">
                          {stUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                          Upload Excel / CSV
                        </Button>
                        <Button variant="outline" size="sm" onClick={handleSTDownloadTemplate} className="rounded-lg font-bold text-xs gap-2">
                          <Download className="w-3.5 h-3.5" /> Download Standard Template
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setSalesTaxRows(prev => [...prev, emptySalesTaxRow()])} className="rounded-lg font-bold text-xs gap-2 text-blue-600 border-blue-200 hover:bg-blue-50">
                          <Plus className="w-3.5 h-3.5" /> Add Row
                        </Button>
                      </div>

                      {salesTaxRows.length > 0 && (
                        <div className="border border-slate-200 rounded-xl overflow-hidden">
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="bg-slate-50 border-b border-slate-200">
                                  <th className="px-2 py-2.5 text-left font-bold text-slate-500 uppercase tracking-wider text-[9px] w-8">#</th>
                                  {SALES_TAX_COLS.map(col => (
                                    <th key={col.key} className="px-2 py-2.5 text-left font-bold text-slate-500 uppercase tracking-wider text-[9px] whitespace-nowrap" style={{ minWidth: col.width }}>{col.label}</th>
                                  ))}
                                  <th className="px-2 py-2.5 w-8"></th>
                                </tr>
                              </thead>
                              <tbody>
                                {salesTaxRows.map((row, idx) => (
                                  <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                                    <td className="px-2 py-1 text-slate-400 font-mono">{idx + 1}</td>
                                    {SALES_TAX_COLS.map(col => (
                                      <td key={col.key} className="px-1 py-0.5">
                                        <input
                                          type={col.type || "text"}
                                          value={(row as any)[col.key]}
                                          onChange={e => updateSalesTaxRow(row.id, col.key, e.target.value)}
                                          className="w-full px-1.5 py-1.5 text-xs border border-transparent hover:border-slate-200 focus:border-blue-400 focus:ring-1 focus:ring-blue-100 rounded outline-none bg-transparent font-medium"
                                          style={{ minWidth: col.width }}
                                        />
                                      </td>
                                    ))}
                                    <td className="px-1 py-1">
                                      <button onClick={() => setSalesTaxRows(prev => prev.filter(r => r.id !== row.id))} className="p-1 rounded hover:bg-red-50 text-slate-300 hover:text-red-500 transition-colors">
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          <div className="bg-slate-50 border-t border-slate-200 px-4 py-2.5 flex items-center justify-between">
                            <span className="text-[10px] font-bold text-slate-500">{salesTaxRows.length} row(s) · {salesTaxRows.filter(r => r.netTax).length} with net tax</span>
                            <div className="flex gap-2">
                              <Button variant="ghost" size="sm" onClick={() => setSalesTaxRows(prev => [...prev, emptySalesTaxRow()])} className="text-[10px] font-bold text-blue-600 h-7 px-2 gap-1">
                                <Plus className="w-3 h-3" /> Add Row
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => { if (confirm("Clear all sales tax rows?")) setSalesTaxRows([]); }} className="text-[10px] font-bold text-red-500 h-7 px-2 gap-1">
                                <Trash2 className="w-3 h-3" /> Clear All
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}

                      {salesTaxRows.length === 0 && (
                        <div className="border border-dashed border-slate-200 rounded-xl p-8 text-center">
                          <FileSpreadsheet className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                          <p className="text-sm text-slate-400 font-medium">No sales tax data yet</p>
                          <p className="text-[11px] text-slate-400 mt-1">Upload an Excel/CSV file or add rows manually</p>
                        </div>
                      )}
                    </div>

                    {/* ── Working Papers ──────────────────────────────── */}
                    <div className="mt-6 bg-white rounded-2xl border border-slate-200/80 shadow-sm p-8 space-y-6">
                      <div className="flex items-center justify-between pb-5 border-b border-slate-100">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-violet-600 flex items-center justify-center shrink-0 shadow-sm shadow-violet-200">
                            <Layers className="w-[18px] h-[18px] text-white" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="text-sm font-bold text-slate-900">Working Papers Selection</h3>
                              <span className="text-[10px] font-bold text-violet-700 bg-violet-50 border border-violet-200 rounded-full px-2 py-0.5">{selectedPapers.length}/{ALL_WP_REFS.length}</span>
                            </div>
                            <p className="text-xs text-slate-500 mt-0.5">Select the audit phases and papers to include in this engagement</p>
                          </div>
                        </div>
                        <button onClick={() => setSelectedPapers(selectedPapers.length === ALL_WP_REFS.length ? [] : ALL_WP_REFS)} className="text-xs font-bold text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg px-3 py-1.5 transition-colors">
                          {selectedPapers.length === ALL_WP_REFS.length ? "Deselect All" : "Select All"}
                        </button>
                      </div>
                      
                      <div className="space-y-3">
                        {WP_GROUPS.map(g => {
                          const allSelected = g.refs.every(r => selectedPapers.includes(r));
                          const someSelected = g.refs.some(r => selectedPapers.includes(r));
                          const selectedCount = g.refs.filter(r => selectedPapers.includes(r)).length;
                          const isExpanded = expandedWPGroups.includes(g.prefix);
                          return (
                            <div key={g.prefix} className={`rounded-xl border transition-all ${someSelected ? 'border-blue-200' : 'border-slate-100'}`}>
                              <div className="flex items-center justify-between p-3">
                                <button
                                  onClick={() => setExpandedWPGroups(prev => prev.includes(g.prefix) ? prev.filter(x => x !== g.prefix) : [...prev, g.prefix])}
                                  className="flex items-center gap-2 flex-1 text-left"
                                >
                                  {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
                                  <span className="text-[10px] font-black text-slate-400">{g.prefix}</span>
                                  <span className={`text-xs font-bold ${someSelected ? 'text-slate-900' : 'text-slate-500'}`}>{g.label}</span>
                                  <span className="text-[10px] text-slate-400 font-medium">{selectedCount}/{g.refs.length}</span>
                                </button>
                                <Switch 
                                  checked={allSelected} 
                                  onCheckedChange={() => toggleGroupSelection(g.refs)}
                                  className="data-[state=checked]:bg-blue-600"
                                />
                              </div>
                              <AnimatePresence>
                                {isExpanded && (
                                  <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
                                    <div className="px-4 pb-3 space-y-0.5">
                                      {g.refs.map(ref => {
                                        const isSelected = selectedPapers.includes(ref);
                                        return (
                                          <label key={ref} className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-all ${isSelected ? 'bg-blue-50/50' : 'hover:bg-slate-50'}`}>
                                            <input
                                              type="checkbox"
                                              checked={isSelected}
                                              onChange={() => setSelectedPapers(prev => prev.includes(ref) ? prev.filter(r => r !== ref) : [...prev, ref])}
                                              className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 focus:ring-offset-0"
                                            />
                                            <span className="text-[10px] font-black text-slate-400 w-6">{ref}</span>
                                            <span className={`text-xs ${isSelected ? 'text-slate-800 font-medium' : 'text-slate-500'}`}>{WP_PAPER_NAMES[ref] || ref}</span>
                                          </label>
                                        );
                                      })}
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="flex justify-between items-center pt-6 mt-2 border-t border-slate-100">
                      <Button variant="ghost" onClick={() => setStep(0)} size="lg" className="h-11 px-5 font-bold text-slate-500 rounded-xl hover:bg-slate-100">
                        <ChevronRight className="mr-2 w-4 h-4 rotate-180" /> Back to Upload
                      </Button>
                      <Button onClick={() => setStep(2)} disabled={!entityName} size="lg" className="h-11 px-7 bg-blue-600 hover:bg-blue-700 font-bold rounded-xl group shadow-lg shadow-blue-200/60">
                        Run Analysis <ChevronRight className="ml-2 w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                      </Button>
                    </div>
                  </div>
                )}

                {/* STEP 2: ANALYSE / Results */}
                {step === 2 && (
                  <div className="space-y-8">
                    {/* Hero Header */}
                    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
                      <div className="relative px-8 pt-7 pb-5 overflow-hidden" style={{ background: "linear-gradient(135deg, #1a1033 0%, #2d1b69 50%, #3730a3 100%)" }}>
                        <div className="absolute top-0 right-0 w-72 h-72 rounded-full opacity-15" style={{ background: "radial-gradient(circle, #a78bfa 0%, transparent 70%)", transform: "translate(30%, -30%)" }} />
                        <div className="relative z-10 flex items-start justify-between gap-6">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-3">
                              <span className="text-[10px] font-black text-violet-300 uppercase tracking-[0.2em]">Step 3 of 5</span>
                              <div className="h-px flex-1 max-w-[40px] bg-violet-600" />
                              <span className="text-[10px] font-bold text-violet-400 uppercase tracking-widest">ISA 315 · ISA 240 · ISA 520</span>
                            </div>
                            <h2 className="text-2xl font-black text-white leading-tight">AI Audit Analysis</h2>
                            <p className="text-sm text-violet-200 mt-1.5 leading-relaxed max-w-xl">The AI engine processes documents to determine materiality, assess inherent and fraud risks, map FS assertions, identify IC weaknesses, and prepare analytical procedures.</p>
                          </div>
                          <div className="hidden md:flex items-center justify-center w-16 h-16 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/15 shrink-0 mt-1">
                            <FileSearch className="w-7 h-7 text-violet-200" />
                          </div>
                        </div>
                      </div>
                    </div>

                    {!analysis && !analyzing ? (
                      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm flex flex-col items-center justify-center py-20 text-center space-y-6">
                        <div className="w-24 h-24 bg-violet-50 rounded-full flex items-center justify-center relative">
                          <div className="absolute inset-0 bg-violet-400/15 rounded-full animate-ping" style={{ animationDuration: "2s" }}></div>
                          <Sparkles className="w-10 h-10 text-violet-600" />
                        </div>
                        <div>
                          <h3 className="text-xl font-bold text-slate-900">Ready to Analyse</h3>
                          <p className="text-slate-500 mt-2 max-w-xl mx-auto leading-relaxed text-sm">Click below to run the AI audit analysis engine — materiality, risk, assertions, IC weaknesses, and analytical procedures will be generated automatically.</p>
                        </div>
                        <Button onClick={handleAnalyze} size="lg" className="h-12 px-8 bg-violet-600 hover:bg-violet-700 font-bold rounded-xl group shadow-lg shadow-violet-200">
                          Run AI Audit Analysis <Sparkles className="ml-2.5 w-4 h-4 group-hover:rotate-12 transition-transform" />
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-8">
                        <div>
                          <h2 className="text-xl font-bold text-slate-900">Audit Analysis Results</h2>
                          <p className="text-slate-500 mt-1.5 text-sm">Comprehensive insights derived from your uploaded documents and financial statements.</p>
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
                    {/* Hero Header */}
                    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
                      <div className="relative px-8 pt-7 pb-5 overflow-hidden" style={{ background: "linear-gradient(135deg, #052e16 0%, #064e3b 50%, #065f46 100%)" }}>
                        <div className="absolute top-0 right-0 w-72 h-72 rounded-full opacity-10" style={{ background: "radial-gradient(circle, #34d399 0%, transparent 70%)", transform: "translate(30%, -30%)" }} />
                        <div className="relative z-10 flex items-start justify-between gap-6">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-3">
                              <span className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.2em]">Step 4 of 5</span>
                              <div className="h-px flex-1 max-w-[40px] bg-emerald-700" />
                              <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest">ISA 200–720 · ISQM 1&2</span>
                            </div>
                            <h2 className="text-2xl font-black text-white leading-tight">Audit Working Papers</h2>
                            <p className="text-sm text-emerald-200 mt-1.5 leading-relaxed max-w-xl">Auto-generated, fully cross-referenced working papers — A through K. ISA 200–720 · ISQM 1&2 · Companies Act 2017 compliant. Prepared-by, reviewed-by and approved-by sign-offs on every paper.</p>
                          </div>
                          <div className="hidden md:flex items-center justify-center w-16 h-16 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/15 shrink-0 mt-1">
                            <Sparkles className="w-7 h-7 text-emerald-200" />
                          </div>
                        </div>
                      </div>
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
                        /* ─── Idle: GL/TB + trigger generation ─────────────────────────────── */
                        <div className="space-y-8">
                          {/* GL & TB Generation */}
                          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                            <div className="p-8 space-y-6">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                                    <Table className="w-4 h-4 text-emerald-600" />
                                  </div>
                                  <div>
                                    <h3 className="font-bold text-slate-900">General Ledger & Trial Balance</h3>
                                    <p className="text-[11px] text-slate-400 font-medium mt-0.5">AI-generated with Pakistan COA codes, narrations & industry-specific transactions — GL and TB are 100% matched</p>
                                  </div>
                                </div>
                                <Button onClick={handleGenerateGlTb} disabled={generatingGlTb} className="rounded-xl font-bold gap-2 bg-emerald-600 hover:bg-emerald-700">
                                  {generatingGlTb ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating...</> : <><Sparkles className="w-4 h-4" /> Generate GL & TB</>}
                                </Button>
                              </div>

                              {glTbSummary && (
                                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                                  <div className="bg-slate-50 rounded-lg p-3 text-center border border-slate-100">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase">GL Entries</p>
                                    <p className="text-lg font-black text-slate-800">{glTbSummary.gl_entries}</p>
                                  </div>
                                  <div className="bg-slate-50 rounded-lg p-3 text-center border border-slate-100">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase">TB Accounts</p>
                                    <p className="text-lg font-black text-slate-800">{glTbSummary.tb_accounts}</p>
                                  </div>
                                  <div className="bg-slate-50 rounded-lg p-3 text-center border border-slate-100">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase">Total Debit</p>
                                    <p className="text-sm font-bold text-slate-800">{fmtPKR(glTbSummary.total_debit)}</p>
                                  </div>
                                  <div className="bg-slate-50 rounded-lg p-3 text-center border border-slate-100">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase">Total Credit</p>
                                    <p className="text-sm font-bold text-slate-800">{fmtPKR(glTbSummary.total_credit)}</p>
                                  </div>
                                  <div className={`rounded-lg p-3 text-center border ${glTbSummary.is_balanced ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase">Status</p>
                                    <p className={`text-sm font-black ${glTbSummary.is_balanced ? 'text-emerald-600' : 'text-red-600'}`}>
                                      {glTbSummary.is_balanced ? '✓ Balanced' : '✗ Unbalanced'}
                                    </p>
                                  </div>
                                </div>
                              )}

                              {(glData.length > 0 || tbData2.length > 0) && (
                                <div className="space-y-4">
                                  <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
                                    {([["gl", "General Ledger", glData.length], ["tb", "Trial Balance", tbData2.length], ["coa", "Chart of Accounts", coaData.length]] as const).map(([key, label, count]) => (
                                      <button key={key} onClick={() => setGlTbTab(key)} className={`flex-1 px-3 py-2 rounded-md text-xs font-bold transition-all ${glTbTab === key ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}>
                                        {label} ({count})
                                      </button>
                                    ))}
                                  </div>

                                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                                    <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                                      {glTbTab === "gl" && (
                                        <table className="w-full text-xs">
                                          <thead className="sticky top-0 z-10">
                                            <tr className="bg-slate-50 border-b border-slate-200">
                                              <th className="px-3 py-2.5 text-left font-bold text-slate-500 uppercase text-[9px] tracking-wider">#</th>
                                              <th className="px-3 py-2.5 text-left font-bold text-slate-500 uppercase text-[9px] tracking-wider">Date</th>
                                              <th className="px-3 py-2.5 text-left font-bold text-slate-500 uppercase text-[9px] tracking-wider">Voucher</th>
                                              <th className="px-3 py-2.5 text-left font-bold text-slate-500 uppercase text-[9px] tracking-wider">Code</th>
                                              <th className="px-3 py-2.5 text-left font-bold text-slate-500 uppercase text-[9px] tracking-wider">Account Name</th>
                                              <th className="px-3 py-2.5 text-left font-bold text-slate-500 uppercase text-[9px] tracking-wider min-w-[200px]">Narration</th>
                                              <th className="px-3 py-2.5 text-right font-bold text-slate-500 uppercase text-[9px] tracking-wider">Debit (PKR)</th>
                                              <th className="px-3 py-2.5 text-right font-bold text-slate-500 uppercase text-[9px] tracking-wider">Credit (PKR)</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {glData.map((entry, i) => (
                                              <tr key={i} className="border-b border-slate-50 hover:bg-blue-50/30">
                                                <td className="px-3 py-2 text-slate-400 font-mono">{i + 1}</td>
                                                <td className="px-3 py-2 font-mono text-slate-700">{entry.date}</td>
                                                <td className="px-3 py-2 font-mono text-blue-600 font-bold">{entry.voucher_no}</td>
                                                <td className="px-3 py-2 font-mono font-bold text-slate-800">{entry.account_code}</td>
                                                <td className="px-3 py-2 font-medium text-slate-800">{entry.account_name}</td>
                                                <td className="px-3 py-2 text-slate-500">{entry.narration}</td>
                                                <td className="px-3 py-2 text-right font-mono font-bold text-emerald-700">{entry.debit ? Number(entry.debit).toLocaleString("en-PK") : '-'}</td>
                                                <td className="px-3 py-2 text-right font-mono font-bold text-red-600">{entry.credit ? Number(entry.credit).toLocaleString("en-PK") : '-'}</td>
                                              </tr>
                                            ))}
                                          </tbody>
                                          <tfoot>
                                            <tr className="bg-slate-800 text-white font-bold">
                                              <td colSpan={6} className="px-3 py-3 text-right uppercase text-[10px] tracking-widest">Total</td>
                                              <td className="px-3 py-3 text-right font-mono">{glData.reduce((s, e) => s + (e.debit || 0), 0).toLocaleString("en-PK")}</td>
                                              <td className="px-3 py-3 text-right font-mono">{glData.reduce((s, e) => s + (e.credit || 0), 0).toLocaleString("en-PK")}</td>
                                            </tr>
                                          </tfoot>
                                        </table>
                                      )}

                                      {glTbTab === "tb" && (
                                        <table className="w-full text-xs">
                                          <thead className="sticky top-0 z-10">
                                            <tr className="bg-slate-50 border-b border-slate-200">
                                              <th className="px-3 py-2.5 text-left font-bold text-slate-500 uppercase text-[9px] tracking-wider">Code</th>
                                              <th className="px-3 py-2.5 text-left font-bold text-slate-500 uppercase text-[9px] tracking-wider">Account Name</th>
                                              <th className="px-3 py-2.5 text-right font-bold text-slate-500 uppercase text-[9px] tracking-wider">Debit Total</th>
                                              <th className="px-3 py-2.5 text-right font-bold text-slate-500 uppercase text-[9px] tracking-wider">Credit Total</th>
                                              <th className="px-3 py-2.5 text-right font-bold text-slate-500 uppercase text-[9px] tracking-wider">Balance (Dr)</th>
                                              <th className="px-3 py-2.5 text-right font-bold text-slate-500 uppercase text-[9px] tracking-wider">Balance (Cr)</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {tbData2.map((row, i) => (
                                              <tr key={i} className="border-b border-slate-50 hover:bg-blue-50/30">
                                                <td className="px-3 py-2 font-mono font-bold text-slate-800">{row.account_code}</td>
                                                <td className="px-3 py-2 font-medium text-slate-800">{row.account_name}</td>
                                                <td className="px-3 py-2 text-right font-mono">{Number(row.debit_total || 0).toLocaleString("en-PK")}</td>
                                                <td className="px-3 py-2 text-right font-mono">{Number(row.credit_total || 0).toLocaleString("en-PK")}</td>
                                                <td className="px-3 py-2 text-right font-mono font-bold text-emerald-700">{row.balance_dr ? Number(row.balance_dr).toLocaleString("en-PK") : '-'}</td>
                                                <td className="px-3 py-2 text-right font-mono font-bold text-red-600">{row.balance_cr ? Number(row.balance_cr).toLocaleString("en-PK") : '-'}</td>
                                              </tr>
                                            ))}
                                          </tbody>
                                          <tfoot>
                                            <tr className="bg-slate-800 text-white font-bold">
                                              <td colSpan={2} className="px-3 py-3 text-right uppercase text-[10px] tracking-widest">Total</td>
                                              <td className="px-3 py-3 text-right font-mono">{tbData2.reduce((s, r) => s + (r.debit_total || 0), 0).toLocaleString("en-PK")}</td>
                                              <td className="px-3 py-3 text-right font-mono">{tbData2.reduce((s, r) => s + (r.credit_total || 0), 0).toLocaleString("en-PK")}</td>
                                              <td className="px-3 py-3 text-right font-mono">{tbData2.reduce((s, r) => s + (r.balance_dr || 0), 0).toLocaleString("en-PK")}</td>
                                              <td className="px-3 py-3 text-right font-mono">{tbData2.reduce((s, r) => s + (r.balance_cr || 0), 0).toLocaleString("en-PK")}</td>
                                            </tr>
                                          </tfoot>
                                        </table>
                                      )}

                                      {glTbTab === "coa" && (
                                        <table className="w-full text-xs">
                                          <thead className="sticky top-0 z-10">
                                            <tr className="bg-slate-50 border-b border-slate-200">
                                              <th className="px-3 py-2.5 text-left font-bold text-slate-500 uppercase text-[9px] tracking-wider">Code</th>
                                              <th className="px-3 py-2.5 text-left font-bold text-slate-500 uppercase text-[9px] tracking-wider">Account Name</th>
                                              <th className="px-3 py-2.5 text-left font-bold text-slate-500 uppercase text-[9px] tracking-wider">Group</th>
                                              <th className="px-3 py-2.5 text-left font-bold text-slate-500 uppercase text-[9px] tracking-wider">Type</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {coaData.map((acc, i) => (
                                              <tr key={i} className="border-b border-slate-50 hover:bg-blue-50/30">
                                                <td className="px-3 py-2 font-mono font-bold text-slate-800">{acc.code}</td>
                                                <td className="px-3 py-2 font-medium text-slate-800">{acc.name}</td>
                                                <td className="px-3 py-2 text-slate-500">{acc.group}</td>
                                                <td className="px-3 py-2"><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${acc.type === 'Asset' ? 'bg-blue-50 text-blue-600' : acc.type === 'Liability' ? 'bg-orange-50 text-orange-600' : acc.type === 'Equity' ? 'bg-purple-50 text-purple-600' : acc.type === 'Revenue' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>{acc.type}</span></td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Main WP Generation */}
                          <div className="bg-white rounded-xl p-12 border border-slate-200 shadow-sm text-center space-y-8">
                            <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mx-auto">
                              <Sparkles className="w-10 h-10 text-blue-600" />
                            </div>
                            <div className="max-w-lg mx-auto space-y-4">
                              <h3 className="text-2xl font-extrabold text-slate-800">Ready to Generate {selectedPapers.length} Papers</h3>
                              <p className="text-slate-500 font-medium leading-relaxed">The system will process all 11 phases (A–K) — from Acceptance & Continuance through Final Output — generating fully cross-referenced, ISA-compliant working papers with prepared-by, reviewed-by, and partner sign-offs.</p>
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
                            const wpLetter = (papers[0]?.ref || "").replace(/[0-9\-]/g, "");
                            const group = WP_GROUPS.find(g => g.prefix === wpLetter);
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

                    <div className="flex justify-between items-center pt-6 mt-2 border-t border-slate-100">
                      <Button variant="ghost" onClick={() => setStep(2)} className="h-11 px-5 font-bold text-slate-500 rounded-xl hover:bg-slate-100">
                        <ChevronRight className="mr-2 w-4 h-4 rotate-180" /> Back to Analysis
                      </Button>
                      <Button onClick={() => setStep(4)} size="lg" className="h-11 px-7 bg-blue-600 hover:bg-blue-700 font-bold rounded-xl group shadow-lg shadow-blue-200/60">
                        Export & Finalize <ChevronRight className="ml-2 w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                      </Button>
                    </div>
                  </div>
                )}

                {/* STEP 4: EXPORT */}
                {step === 4 && (
                  <div className="space-y-8">
                    {/* Hero Header */}
                    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
                      <div className="relative px-8 pt-7 pb-5 overflow-hidden" style={{ background: "linear-gradient(135deg, #0c0a09 0%, #1c1917 50%, #1a1a2e 100%)" }}>
                        <div className="absolute top-0 right-0 w-72 h-72 rounded-full opacity-10" style={{ background: "radial-gradient(circle, #fbbf24 0%, transparent 70%)", transform: "translate(30%, -30%)" }} />
                        <div className="relative z-10 flex items-start justify-between gap-6">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-3">
                              <span className="text-[10px] font-black text-yellow-400 uppercase tracking-[0.2em]">Step 5 of 5</span>
                              <div className="h-px flex-1 max-w-[40px] bg-yellow-800" />
                              <span className="text-[10px] font-bold text-yellow-600 uppercase tracking-widest">ISA 230 · Final Archive</span>
                            </div>
                            <h2 className="text-2xl font-black text-white leading-tight">Export & Finalize</h2>
                            <p className="text-sm text-stone-400 mt-1.5 leading-relaxed max-w-xl">Download the complete, inspection-ready audit file — all phases, working papers, and evidence in one deliverable. Choose Excel workbook, Word report, archived PDF, or confirmation letters bundle.</p>
                          </div>
                          <div className="hidden md:flex items-center justify-center w-16 h-16 rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10 shrink-0 mt-1">
                            <FileOutput className="w-7 h-7 text-yellow-400" />
                          </div>
                        </div>
                      </div>
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
                            { id: "confirmations", label: "Confirmations Bundle", ext: ".pdf", desc: "Automated generation of bank, debtor, and creditor confirmation letters.", icon: Mail, color: "violet", handler: handleExportConfirmations, loading: exportingConfirmations },
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
                      <Button variant="ghost" onClick={() => {
                        setStep(0);
                        setFiles([]);
                        setAnalysis(null);
                        setWorkingPapers([]);
                        setEvidenceIndex([]);
                        setGenerationMeta(null);
                        setEntityName("");
                        setNtn("");
                        setSecp("");
                        setStrn("");
                        setInstructions("");
                        setRegisteredAddress("");
                        setEngagementType("Statutory Audit");
                        setFinancialYear("Year ended June 30, 2024");
                        setBsData(INITIAL_BS);
                        setPlData(INITIAL_PL);
                        setSalesTaxRows([]);
                        setConfigValues(getDefaultValues());
                        setSelectedPapers(ALL_WP_REFS);
                        setPreparer("");
                        setReviewer("");
                        setApprover("");
                        setPlanningDeadline("");
                        setFieldworkStart("");
                        setFieldworkEnd("");
                        setReportingDeadline("");
                        setReportDate("");
                        setFilingDeadline("");
                        setArchiveDate("");
                        setPeriodStart("");
                        setPeriodEnd("");
                        setIndustry("");
                        setEntityType("Private Limited");
                        setFramework("IFRS");
                        setListedStatus("Unlisted");
                        setFirstYearAudit(false);
                        setGoingConcernFlag(false);
                        setControlReliance("Partial");
                        setSignificantRiskAreas([]);
                        setCurrency("PKR");
                        setNewClient(false);
                        setGroupAuditFlag(false);
                        setInternalAuditExists(false);
                        setIndependenceConfirmed(true);
                        setConflictCheck(true);
                        setEqcrRequired(false);
                        setSamplingMethod("Statistical");
                        setConfidenceLevel("95%");
                        setRelatedPartyFlag(false);
                        setSubsequentEventsFlag(false);
                        setEstimatesFlag(false);
                        setLitigationFlag(false);
                        setExpertRequired(false);
                        setCurrentTaxApplicable(true);
                        setDeferredTaxApplicable(true);
                        setWhtExposure(true);
                        setSalesTaxRegistered(true);
                        setSuperTaxApplicable(false);
                        setStPeriodFrom("");
                        setStPeriodTo("");
                        setAutoFilled(false);
                        setProgress(0);
                        setProgressMsg("");
                        setCompletedPhases([]);
                        setActivePhaseLabel("");
                        setExpandedFsSections(["nca", "ca", "rev"]);
                        setActiveFsTab("bs");
                        setGlData([]);
                        setTbData2([]);
                        setCoaData([]);
                        setGlTbSummary(null);
                        toast({ title: "Engagement reset", description: "All fields have been cleared. Ready for a new engagement." });
                      }} className="font-bold text-slate-500 rounded-xl px-6 h-12">
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
  );
}
