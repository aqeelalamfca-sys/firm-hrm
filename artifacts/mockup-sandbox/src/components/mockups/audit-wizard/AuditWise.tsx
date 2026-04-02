import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload, FileText, CheckCircle2, ChevronRight, ChevronDown, ChevronUp,
  Briefcase, FileSearch, Sparkles, FileOutput, Shield, AlertTriangle,
  FileSpreadsheet, Mail, Check, X, Download, TrendingUp, TrendingDown,
  Info, Scale, Settings, LayoutGrid
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import './_group.css';

const WP_GROUPS = [
  { prefix: "PP", label: "Pre-Planning", color: "bg-violet-100 text-violet-700 border-violet-200", refs: ["PP-100", "PP-101", "PP-102", "PP-103"] },
  { prefix: "DI", label: "Discussion", color: "bg-blue-100 text-blue-700 border-blue-200", refs: ["DI-100", "DI-101"] },
  { prefix: "IR", label: "Risk Assessment", color: "bg-red-100 text-red-700 border-red-200", refs: ["IR-100", "IR-101", "IR-102"] },
  { prefix: "OB", label: "Opening Balances", color: "bg-orange-100 text-orange-700 border-orange-200", refs: ["OB-100", "OB-101"] },
  { prefix: "PL", label: "Planning", color: "bg-sky-100 text-sky-700 border-sky-200", refs: ["PL-100"] },
  { prefix: "EX", label: "Execution", color: "bg-emerald-100 text-emerald-700 border-emerald-200", refs: ["EX-100", "EX-101", "EX-102", "EX-103", "EX-104", "EX-105", "EX-106"] },
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

const RATIOS = [
  { name: "Gross Margin", current: "34.2%", prev: "32.1%", var: "+2.1%", trend: "up", response: "Satisfactory. In line with industry average." },
  { name: "Net Margin", current: "15.1%", prev: "16.8%", var: "-1.7%", trend: "down", response: "Investigate increase in administrative expenses." },
  { name: "Current Ratio", current: "1.84", prev: "1.76", var: "+4.5%", trend: "up", response: "Liquidity position remains stable." },
  { name: "Quick Ratio", current: "1.12", prev: "1.08", var: "+3.7%", trend: "up", response: "Inventory dependence decreased slightly." },
  { name: "D/E Ratio", current: "0.68", prev: "0.72", var: "-5.5%", trend: "down", response: "Repayment of long-term loan noted." },
  { name: "ROA", current: "8.4%", prev: "9.1%", var: "-7.6%", trend: "down", response: "Asset base increased faster than net profit." },
  { name: "Asset Turnover", current: "0.43", prev: "0.41", var: "+4.8%", trend: "up", response: "Improved utilization of fixed assets." },
  { name: "Receivables Days", current: "47", prev: "42", var: "+11.9%", trend: "up", response: "Review aging report for potential bad debts." },
  { name: "Payables Days", current: "38", prev: "35", var: "+8.5%", trend: "up", response: "Within normal credit terms." },
  { name: "Inventory Days", current: "62", prev: "58", var: "+6.8%", trend: "up", response: "Perform detailed lower of cost or NRV testing." },
];

const WP_DATA = [
  {
    ref: "PP-100", title: "Engagement Letter & Terms", isa: ["ISA 210"], evidence: [], status: "Draft",
    objective: "To agree on the terms of the audit engagement with management.",
    scope: "Review and sign-off on the terms of engagement, including responsibilities of auditor and management.",
    assertions: ["Rights & Obligations"],
    procedures: [
      { desc: "Obtain signed engagement letter", ref: "A-100", conc: "Satisfactory", concColor: "bg-green-100 text-green-700" },
      { desc: "Verify management responsibilities acknowledged", ref: "", conc: "Satisfactory", concColor: "bg-green-100 text-green-700" }
    ],
    risks: ["Misunderstanding of audit scope"],
    recs: ["Ensure prompt signing before fieldwork commences"],
    signoff: { prep: "A. Khan", rev: "S. Ali", ptr: "R. Ahmed", date: "15 Jul 2024" },
    cross: ["PP-101"]
  },
  {
    ref: "PP-101", title: "Independence & Ethics", isa: ["ISA 220", "IESBA"], evidence: [], status: "Draft",
    objective: "To ensure the audit team remains independent of the client.",
    scope: "Review financial interests, family relationships, and non-audit services.",
    assertions: [],
    procedures: [
      { desc: "Obtain independence declarations from all team members", ref: "", conc: "Satisfactory", concColor: "bg-green-100 text-green-700" },
    ],
    risks: ["Familiarity threat due to long association"],
    recs: ["Rotate audit manager next year"],
    signoff: { prep: "A. Khan", rev: "S. Ali", ptr: "R. Ahmed", date: "16 Jul 2024" },
    cross: []
  },
  {
    ref: "PP-102", title: "Materiality Determination", isa: ["ISA 320"], evidence: ["A-100"], status: "Draft",
    objective: "To determine materiality for the financial statements as a whole.",
    scope: "Calculate overall, performance, and specific materiality thresholds.",
    assertions: ["Valuation"],
    procedures: [
      { desc: "Calculate benchmark (5% of PBT)", ref: "A-100", conc: "Satisfactory", concColor: "bg-green-100 text-green-700" },
    ],
    risks: [],
    recs: [],
    signoff: { prep: "A. Khan", rev: "S. Ali", ptr: "R. Ahmed", date: "16 Jul 2024" },
    cross: []
  },
  {
    ref: "PP-103", title: "Client Acceptance & Continuance", isa: ["ISA 220"], evidence: [], status: "Draft",
    objective: "To evaluate whether to accept or continue the client relationship.",
    scope: "Review integrity of management, firm's competence, and independence.",
    assertions: [],
    procedures: [
      { desc: "Perform background checks on key management", ref: "", conc: "Note Required", concColor: "bg-yellow-100 text-yellow-700" },
    ],
    risks: ["Management integrity risk"],
    recs: ["Obtain written representations regarding legal compliance"],
    signoff: { prep: "A. Khan", rev: "S. Ali", ptr: "R. Ahmed", date: "14 Jul 2024" },
    cross: []
  }
];

// ─── Financial Statement Types ────────────────────────────────────────────────
interface FSLine {
  id: string; label: string; cy: string; py: string;
  bold?: boolean; subtotal?: boolean; indent?: boolean; spacer?: boolean;
}
interface FSSection { id: string; title: string; color: string; lines: FSLine[]; }

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

export default function AuditWise() {
  const [step, setStep] = useState(0);
  const [selectedPapers, setSelectedPapers] = useState<string[]>(ALL_WP_REFS);
  
  const [expandedGroups, setExpandedGroups] = useState<string[]>(["PP"]);
  const [expandedWPs, setExpandedWPs] = useState<string[]>(["PP-100", "PP-101", "PP-102", "PP-103"]);
  
  const [analysisTab, setAnalysisTab] = useState("summary");

  // Company & NTN
  const [companyName, setCompanyName] = useState("Pak Textile Mills Ltd.");
  const [ntn, setNtn] = useState("1234567-8");
  const [secp, setSecp] = useState("K-123456");
  const [registered, setRegistered] = useState("Lahore, Pakistan");
  const [firmName, setFirmName] = useState("ANA & Co. Chartered Accountants");
  const [engType, setEngType] = useState("Statutory Audit");
  const [fy, setFy] = useState("Year ended June 30, 2024");

  // Financial Statement data
  const [bsData, setBsData] = useState<FSSection[]>(INITIAL_BS);
  const [plData, setPlData] = useState<FSSection[]>(INITIAL_PL);
  const [expandedFsSections, setExpandedFsSections] = useState<string[]>(["nca", "ca", "ta", "eq", "rev", "opex"]);
  const [activeFsTab, setActiveFsTab] = useState<"bs" | "pl">("bs");
  const [fsExpanded, setFsExpanded] = useState(true);

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
  const toggleFsSection = (id: string) => {
    setExpandedFsSections(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleWPGroup = (prefix: string) => {
    setExpandedGroups(prev => prev.includes(prefix) ? prev.filter(p => p !== prefix) : [...prev, prefix]);
  };

  const toggleWP = (ref: string) => {
    setExpandedWPs(prev => prev.includes(ref) ? prev.filter(r => r !== ref) : [...prev, ref]);
  };

  const togglePaperSelection = (ref: string) => {
    setSelectedPapers(prev => prev.includes(ref) ? prev.filter(r => r !== ref) : [...prev, ref]);
  };

  const toggleGroupSelection = (refs: string[]) => {
    const allSelected = refs.every(r => selectedPapers.includes(r));
    if (allSelected) {
      setSelectedPapers(prev => prev.filter(r => !refs.includes(r)));
    } else {
      setSelectedPapers(prev => [...new Set([...prev, ...refs])]);
    }
  };

  const toggleAllSelection = () => {
    if (selectedPapers.length === ALL_WP_REFS.length) {
      setSelectedPapers([]);
    } else {
      setSelectedPapers(ALL_WP_REFS);
    }
  };

  const nextStep = () => setStep(s => Math.min(4, s + 1));
  const prevStep = () => setStep(s => Math.max(0, s - 1));

  return (
    <div className="flex h-screen overflow-hidden font-['Inter'] text-slate-900 audit-wizard-content-bg">
      {/* LEFT RAIL */}
      <div className="w-[280px] shrink-0 audit-wizard-bg text-slate-100 flex flex-col h-full border-r border-slate-800 shadow-2xl z-10 relative">
        <div className="p-6 pb-8 border-b border-slate-800/80">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600/20 flex items-center justify-center border border-blue-500/30">
              <Shield className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h1 className="font-jakarta font-bold text-lg leading-none tracking-tight text-white">AuditWise</h1>
              <p className="text-[11px] font-medium text-slate-400 mt-1 tracking-wider uppercase">Enterprise Edition</p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-8">
          <div className="relative">
            <div className="absolute left-[15px] top-4 bottom-4 w-px bg-slate-800"></div>
            <div className="space-y-8 relative">
              {STEPS.map((s, idx) => {
                const isActive = step === idx;
                const isPast = step > idx;
                return (
                  <div key={s.id} className="flex items-start gap-4 relative">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 border-[2px] relative z-10 bg-slate-900 transition-colors duration-300
                      ${isActive ? 'border-blue-500 text-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.4)]' : isPast ? 'border-emerald-500 text-emerald-400' : 'border-slate-800 text-slate-600'}
                    `}>
                      {isPast ? <Check className="w-4 h-4" /> : <s.icon className="w-4 h-4" />}
                    </div>
                    <div className="flex flex-col pt-1.5 cursor-pointer" onClick={() => setStep(idx)}>
                      <span className={`text-[10px] uppercase tracking-wider font-bold mb-0.5 ${isActive ? 'text-blue-400' : isPast ? 'text-emerald-400' : 'text-slate-500'}`}>Step {idx + 1}</span>
                      <span className={`text-sm font-medium ${isActive ? 'text-white' : isPast ? 'text-slate-300' : 'text-slate-600'}`}>{s.shortLabel}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-12 bg-slate-800/40 border border-slate-700/50 rounded-xl p-4">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Engagement Details</h3>
            <div className="space-y-3">
              <div>
                <p className="text-[10px] text-slate-500 font-medium">Client</p>
                <p className="text-sm font-semibold text-slate-200">{companyName}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 font-medium">NTN</p>
                <p className="text-sm font-mono font-semibold text-blue-300 tracking-wider">{ntn}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 font-medium">Period</p>
                <p className="text-sm font-semibold text-slate-200">{fy}</p>
              </div>
              <div className="pt-2 flex flex-wrap gap-1.5">
                <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/20 hover:bg-blue-500/20 text-xs px-2 py-0">{engType}</Badge>
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-slate-800/80 bg-slate-900/50">
          <p className="text-sm font-bold text-white">ANA & Co.</p>
          <p className="text-xs text-slate-400 mb-3">Chartered Accountants</p>
          <div className="flex items-center gap-2 text-emerald-400 bg-emerald-400/10 px-3 py-1.5 rounded-lg border border-emerald-400/20 w-max">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span className="text-xs font-bold tracking-wide">100% ISA Compliant</span>
          </div>
        </div>
      </div>

      {/* RIGHT CONTENT */}
      <div className="flex-1 flex flex-col h-full relative overflow-hidden bg-slate-50/50">
        {/* Header */}
        <header className="h-16 flex items-center justify-between px-8 bg-white border-b border-slate-200/60 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-400">Audit Wizard</span>
            <ChevronRight className="w-4 h-4 text-slate-300" />
            <span className="text-sm font-bold text-slate-800">{STEPS[step].label}</span>
          </div>
          <div className="flex items-center gap-4">
            <Badge variant="outline" className="text-xs font-medium border-slate-200 text-slate-500 bg-slate-50">AuditWise Engine v3.1</Badge>
            <Button variant="ghost" size="sm" className="text-slate-500">Save Draft</Button>
          </div>
        </header>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-8 py-8 scrollbar-thin">
          <div className="max-w-5xl mx-auto pb-24">
            <AnimatePresence mode="wait">
              <motion.div
                key={step}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.3, ease: "easeInOut" }}
              >
                
                {/* STEP 0: UPLOAD */}
                {step === 0 && (
                  <div className="space-y-8">
                    <div>
                      <h2 className="font-jakarta text-2xl font-bold text-slate-900">Upload Audit Documents</h2>
                      <p className="text-slate-500 mt-1">Provide the foundational documents for AI analysis and working paper generation.</p>
                    </div>

                    <div className="border-2 border-dashed border-slate-300 hover:border-blue-400 bg-white hover:bg-blue-50/30 transition-all rounded-2xl p-12 flex flex-col items-center justify-center text-center cursor-pointer group relative overflow-hidden shadow-sm">
                      <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                      <div className="w-16 h-16 bg-white border border-slate-200 shadow-sm rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300 z-10">
                        <Upload className="w-8 h-8 text-blue-600" />
                      </div>
                      <h3 className="text-lg font-bold text-slate-800 z-10">Drop your audit documents here</h3>
                      <p className="text-sm text-slate-500 mt-2 z-10">PDF · Excel · CSV · Word · Images · Emails — up to 20 files</p>
                      
                      <div className="flex items-center gap-2 mt-4 z-10">
                        {["PDF", "XLSX", "CSV", "DOCX", "JPG", "EML"].map(ext => (
                          <Badge key={ext} variant="secondary" className="bg-slate-100 text-slate-500 hover:bg-slate-100">{ext}</Badge>
                        ))}
                      </div>

                      <Button className="mt-6 z-10 shadow-sm" variant="secondary">Browse Files</Button>
                    </div>

                    <div className="space-y-3">
                      <h4 className="text-sm font-bold text-slate-700 uppercase tracking-wider">Uploaded Files (4)</h4>
                      <div className="grid gap-3">
                        {[
                          { name: "Trial_Balance_FY2024.xlsx", size: "2.4 MB", type: "Financial", icon: FileSpreadsheet },
                          { name: "Bank_Statement_Jun2024.pdf", size: "1.1 MB", type: "Evidence", icon: FileText },
                          { name: "GL_Export_Q4.xlsx", size: "8.7 MB", type: "Financial", icon: FileSpreadsheet },
                          { name: "Contracts_Related_Party.pdf", size: "4.2 MB", type: "Legal", icon: FileText },
                        ].map((f, i) => (
                          <div key={i} className="flex items-center justify-between p-4 bg-white border border-slate-200 rounded-xl shadow-sm hover:shadow-md transition-shadow">
                            <div className="flex items-center gap-4">
                              <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center">
                                <f.icon className="w-5 h-5 text-slate-600" />
                              </div>
                              <div>
                                <p className="font-semibold text-sm text-slate-800">{f.name}</p>
                                <div className="flex items-center gap-2 mt-1">
                                  <span className="text-xs text-slate-500">{f.size}</span>
                                  <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-slate-100 text-slate-600 font-medium">{f.type}</Badge>
                                </div>
                              </div>
                            </div>
                            <Button variant="ghost" size="icon" className="text-slate-400 hover:text-red-500 hover:bg-red-50"><X className="w-4 h-4" /></Button>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <Label className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-2 block">Special Instructions (Optional)</Label>
                      <Textarea placeholder="E.g. Focus specifically on related party transactions in Q4..." className="h-24 resize-none bg-white border-slate-200 focus-visible:ring-blue-500 shadow-sm" />
                    </div>
                  </div>
                )}

                {/* STEP 1: CONFIGURE */}
                {step === 1 && (
                  <div className="space-y-8">
                    <div>
                      <h2 className="font-jakarta text-2xl font-bold text-slate-900">Engagement Configuration</h2>
                      <p className="text-slate-500 mt-1">Verify entity details, tax registration, and select the required working paper groups.</p>
                    </div>

                    {/* ── Entity & Firm Details ── */}
                    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-5">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-1 h-4 rounded-full bg-blue-600"></div>
                        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Entity & Engagement Details</h3>
                      </div>
                      <div className="grid grid-cols-2 gap-5">
                        <div className="space-y-2">
                          <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Company / Entity Name *</Label>
                          <Input value={companyName} onChange={e => setCompanyName(e.target.value)} className="bg-slate-50 font-medium" />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">NTN (National Tax Number) *</Label>
                          <Input value={ntn} onChange={e => setNtn(e.target.value)} className="bg-slate-50 font-mono font-medium tracking-wider" placeholder="0000000-0" />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">SECP / CUIN Registration No.</Label>
                          <Input value={secp} onChange={e => setSecp(e.target.value)} className="bg-slate-50 font-mono font-medium" placeholder="K-000000" />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Registered Office Address</Label>
                          <Input value={registered} onChange={e => setRegistered(e.target.value)} className="bg-slate-50 font-medium" />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Audit Firm Name</Label>
                          <Input value={firmName} onChange={e => setFirmName(e.target.value)} className="bg-slate-50 font-medium" />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Financial Year</Label>
                          <Input value={fy} onChange={e => setFy(e.target.value)} className="bg-slate-50 font-medium" />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Engagement Type</Label>
                          <Select value={engType} onValueChange={setEngType}>
                            <SelectTrigger className="bg-slate-50 font-medium"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Statutory Audit">Statutory Audit</SelectItem>
                              <SelectItem value="Internal Audit">Internal Audit</SelectItem>
                              <SelectItem value="Tax Audit">Tax Audit</SelectItem>
                              <SelectItem value="Review Engagement">Review Engagement</SelectItem>
                              <SelectItem value="Special Purpose Audit">Special Purpose Audit</SelectItem>
                              <SelectItem value="Due Diligence">Due Diligence</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Currency (PKR '000)</Label>
                          <Input defaultValue="PKR — Pakistani Rupees (000s)" className="bg-slate-50 font-medium text-slate-500" readOnly />
                        </div>
                      </div>
                    </div>

                    {/* ── Financial Statement Data ── */}
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                      <button
                        onClick={() => setFsExpanded(x => !x)}
                        className="w-full flex items-center justify-between p-5 hover:bg-slate-50 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center">
                            <FileSpreadsheet className="w-4 h-4 text-indigo-600" />
                          </div>
                          <div className="text-left">
                            <h3 className="text-sm font-bold text-slate-800">Financial Statement Data</h3>
                            <p className="text-xs text-slate-500 mt-0.5">Editable Balance Sheet & Profit & Loss — extracted from uploaded documents · PKR '000</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <Badge className="bg-indigo-50 text-indigo-600 border-indigo-200 font-mono text-xs">NTN: {ntn}</Badge>
                          <Badge variant="secondary" className="text-xs">{companyName}</Badge>
                          {fsExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                        </div>
                      </button>

                      <AnimatePresence>
                        {fsExpanded && (
                          <motion.div
                            initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }}
                            transition={{ duration: 0.25 }} className="overflow-hidden"
                          >
                            <div className="border-t border-slate-100">
                              {/* Company header strip */}
                              <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
                                <div>
                                  <p className="font-jakarta font-bold text-base">{companyName}</p>
                                  <p className="text-slate-400 text-xs mt-0.5">NTN: {ntn} · SECP: {secp} · {registered}</p>
                                </div>
                                <div className="text-right">
                                  <p className="text-xs text-slate-400 uppercase tracking-wider">Financial Year</p>
                                  <p className="text-sm font-semibold text-white">{fy}</p>
                                </div>
                              </div>

                              {/* Tab switcher */}
                              <div className="flex border-b border-slate-200 bg-slate-50 px-6">
                                {([["bs", "Balance Sheet"], ["pl", "Profit & Loss"]] as const).map(([id, label]) => (
                                  <button
                                    key={id}
                                    onClick={() => setActiveFsTab(id)}
                                    className={`px-5 py-3 text-sm font-semibold border-b-2 transition-all ${activeFsTab === id ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500 hover:text-slate-700"}`}
                                  >
                                    {label}
                                  </button>
                                ))}
                                <div className="ml-auto flex items-center gap-2 py-2">
                                  <span className="text-xs text-slate-400 font-medium">All amounts in PKR '000</span>
                                </div>
                              </div>

                              {/* Column headers */}
                              <div className="grid grid-cols-[1fr_160px_160px] gap-0 px-6 py-2 bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider">
                                <span>Account / Head of Accounts</span>
                                <span className="text-right pr-4">Current Year<br/><span className="font-normal normal-case text-slate-400">{fy.replace("Year ended", "").trim()}</span></span>
                                <span className="text-right pr-2">Prior Year<br/><span className="font-normal normal-case text-slate-400">Comparative</span></span>
                              </div>

                              {/* BS or PL data */}
                              <div className="divide-y divide-slate-100">
                                {(activeFsTab === "bs" ? bsData : plData).map(section => (
                                  <div key={section.id}>
                                    {/* Section header */}
                                    <button
                                      onClick={() => toggleFsSection(section.id)}
                                      className="w-full flex items-center gap-3 px-6 py-2.5 hover:bg-slate-50 transition-colors text-left"
                                    >
                                      <div className={`w-2 h-2 rounded-full ${section.color}`}></div>
                                      <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex-1">{section.title}</span>
                                      {expandedFsSections.includes(section.id)
                                        ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
                                        : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
                                    </button>

                                    {expandedFsSections.includes(section.id) && section.lines.map(line => (
                                      <div
                                        key={line.id}
                                        className={`grid grid-cols-[1fr_160px_160px] gap-0 px-6 items-center py-1.5 hover:bg-blue-50/40 transition-colors group
                                          ${line.subtotal ? "bg-slate-50 border-t border-slate-200" : ""}`}
                                      >
                                        <span className={`text-sm pl-4 ${line.bold ? "font-bold text-slate-900" : "font-medium text-slate-700"} ${line.subtotal ? "font-bold text-slate-900" : ""}`}>
                                          {line.label}
                                        </span>
                                        <div className="pr-4">
                                          <input
                                            type="text"
                                            value={line.cy}
                                            onChange={e => activeFsTab === "bs"
                                              ? updateBsLine(section.id, line.id, "cy", e.target.value)
                                              : updatePlLine(section.id, line.id, "cy", e.target.value)
                                            }
                                            className={`w-full text-right text-sm px-2 py-1 rounded border border-transparent group-hover:border-slate-200 focus:border-blue-400 focus:outline-none focus:bg-white bg-transparent transition-all font-mono
                                              ${line.bold || line.subtotal ? "font-bold text-slate-900" : "text-slate-700"}`}
                                          />
                                        </div>
                                        <div className="pr-2">
                                          <input
                                            type="text"
                                            value={line.py}
                                            onChange={e => activeFsTab === "bs"
                                              ? updateBsLine(section.id, line.id, "py", e.target.value)
                                              : updatePlLine(section.id, line.id, "py", e.target.value)
                                            }
                                            className={`w-full text-right text-sm px-2 py-1 rounded border border-transparent group-hover:border-slate-200 focus:border-blue-400 focus:outline-none focus:bg-white bg-transparent transition-all font-mono text-slate-500
                                              ${line.bold || line.subtotal ? "font-bold" : ""}`}
                                          />
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                ))}
                              </div>

                              <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
                                <p className="text-xs text-slate-500">Click any amount to edit · Data auto-extracted from uploaded Trial Balance</p>
                                <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs">
                                  <CheckCircle2 className="w-3 h-3 mr-1" /> Extracted from TB & GL
                                </Badge>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider">Working Papers to Generate</h3>
                        <div className="flex items-center gap-4">
                          <span className="text-sm font-semibold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-md">{selectedPapers.length} of {ALL_WP_REFS.length} Selected</span>
                          <Button variant="outline" size="sm" onClick={toggleAllSelection} className="h-8 text-xs font-semibold">Select All / Clear</Button>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        {WP_GROUPS.map((g) => {
                          const allSelected = g.refs.every(r => selectedPapers.includes(r));
                          return (
                            <div key={g.prefix} className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                              <div className="p-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className={`font-mono font-bold ${g.color}`}>{g.prefix}</Badge>
                                  <span className="font-semibold text-sm text-slate-800">{g.label}</span>
                                </div>
                                <Switch checked={allSelected} onCheckedChange={() => toggleGroupSelection(g.refs)} />
                              </div>
                              <div className="p-3 flex flex-wrap gap-2 bg-white">
                                {g.refs.map(ref => {
                                  const isSelected = selectedPapers.includes(ref);
                                  return (
                                    <button 
                                      key={ref}
                                      onClick={() => togglePaperSelection(ref)}
                                      className={`text-xs font-mono px-2 py-1 rounded-md transition-colors border ${isSelected ? 'bg-slate-800 text-white border-slate-800 shadow-sm' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'}`}
                                    >
                                      {ref}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {/* STEP 2: AI ANALYSIS */}
                {step === 2 && (
                  <div className="space-y-6">
                    <div className="flex items-end justify-between">
                      <div>
                        <h2 className="font-jakarta text-2xl font-bold text-slate-900">AI Analysis Results</h2>
                        <p className="text-slate-500 mt-1">Review the preliminary analysis before generating working papers.</p>
                      </div>
                      <div className="flex items-center gap-2 bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-lg border border-emerald-200 shadow-sm">
                        <CheckCircle2 className="w-4 h-4" />
                        <span className="text-xs font-bold">Analysis Complete</span>
                      </div>
                    </div>

                    {/* Tabs */}
                    <div className="flex space-x-1 border-b border-slate-200">
                      {[
                        { id: 'summary', label: 'Summary' },
                        { id: 'ratios', label: 'Analytical Procedures' },
                        { id: 'reconciliation', label: 'Reconciliation' },
                        { id: 'evidence', label: 'Evidence Items' },
                        { id: 'ic', label: 'IC Weaknesses' },
                      ].map(t => (
                        <button
                          key={t.id}
                          onClick={() => setAnalysisTab(t.id)}
                          className={`px-4 py-3 text-sm font-semibold transition-all relative ${analysisTab === t.id ? 'text-blue-600' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-t-lg'}`}
                        >
                          {t.label}
                          {analysisTab === t.id && (
                            <motion.div layoutId="activetab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
                          )}
                        </button>
                      ))}
                    </div>

                    <div className="min-h-[400px]">
                      {analysisTab === 'summary' && (
                        <div className="space-y-6">
                          <div className="grid grid-cols-4 gap-4">
                            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
                              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Assets</span>
                              <div className="mt-2 flex items-end justify-between">
                                <span className="text-xl font-bold text-slate-900">PKR 2,847M</span>
                                <span className="flex items-center text-xs font-bold text-emerald-600"><TrendingUp className="w-3 h-3 mr-0.5"/> +12%</span>
                              </div>
                            </div>
                            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
                              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Revenue</span>
                              <div className="mt-2 flex items-end justify-between">
                                <span className="text-xl font-bold text-slate-900">PKR 1,234M</span>
                                <span className="flex items-center text-xs font-bold text-emerald-600"><TrendingUp className="w-3 h-3 mr-0.5"/> +8%</span>
                              </div>
                            </div>
                            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
                              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Net Profit</span>
                              <div className="mt-2 flex items-end justify-between">
                                <span className="text-xl font-bold text-slate-900">PKR 187M</span>
                                <span className="flex items-center text-xs font-bold text-red-500"><TrendingDown className="w-3 h-3 mr-0.5"/> -3%</span>
                              </div>
                            </div>
                            <div className="bg-slate-900 p-5 rounded-xl border border-slate-800 shadow-sm flex flex-col justify-between text-white">
                              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Materiality</span>
                              <div className="mt-2 flex items-end justify-between">
                                <span className="text-xl font-bold text-white">PKR 28.5M</span>
                                <Scale className="w-4 h-4 text-slate-500" />
                              </div>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-6">
                            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
                              <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-amber-500" /> Key Risk Areas</h3>
                              <div className="space-y-3">
                                {[
                                  { area: "Revenue Recognition", level: "High", isa: "ISA 240", color: "bg-red-100 text-red-700" },
                                  { area: "Related Party Transactions", level: "High", isa: "ISA 550", color: "bg-red-100 text-red-700" },
                                  { area: "Inventory Valuation", level: "Medium", isa: "ISA 501", color: "bg-amber-100 text-amber-700" },
                                ].map((r, i) => (
                                  <div key={i} className="flex justify-between items-center py-2 border-b border-slate-100 last:border-0">
                                    <div>
                                      <p className="font-semibold text-sm text-slate-800">{r.area}</p>
                                      <p className="text-xs text-slate-500 font-mono mt-0.5">{r.isa}</p>
                                    </div>
                                    <span className={`text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wider ${r.color}`}>{r.level}</span>
                                  </div>
                                ))}
                              </div>
                            </div>

                            <div className="space-y-6">
                              <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 shadow-sm">
                                <h3 className="text-sm font-bold text-amber-800 mb-3">Missing Data Flags</h3>
                                <div className="flex flex-wrap gap-2">
                                  <Badge variant="outline" className="bg-white border-amber-300 text-amber-700 px-3 py-1 text-xs">Missing Fixed Asset Register</Badge>
                                  <Badge variant="outline" className="bg-white border-amber-300 text-amber-700 px-3 py-1 text-xs">Incomplete Board Minutes</Badge>
                                </div>
                              </div>
                              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                                <h3 className="text-sm font-bold text-slate-800 mb-3">Key Audit Areas</h3>
                                <ul className="space-y-2">
                                  {["Revenue & Receivables (EX-100)", "Inventory & COS (EX-103)", "Purchases & Payables (EX-101)", "Opening Balances (OB-100)"].map((item, i) => (
                                    <li key={i} className="flex items-start gap-2 text-sm text-slate-600 font-medium">
                                      <CheckCircle2 className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                                      {item}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {analysisTab === 'ratios' && (
                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                          <table className="w-full text-left">
                            <thead>
                              <tr className="bg-slate-50 border-b border-slate-200">
                                <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Ratio Name</th>
                                <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Current Yr</th>
                                <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Prior Yr</th>
                                <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Variance</th>
                                <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Audit Response</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {RATIOS.map((r, i) => (
                                <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                                  <td className="p-4 font-semibold text-sm text-slate-800">{r.name}</td>
                                  <td className="p-4 font-mono text-sm text-slate-700">{r.current}</td>
                                  <td className="p-4 font-mono text-sm text-slate-500">{r.prev}</td>
                                  <td className="p-4">
                                    <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-md ${r.trend === 'up' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                                      {r.trend === 'up' ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                                      {r.var}
                                    </span>
                                  </td>
                                  <td className="p-4 text-sm text-slate-600">{r.response}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {analysisTab === 'reconciliation' && (
                        <div className="grid grid-cols-2 gap-4">
                          {[
                            { name: "TB vs FS", status: "Reconciled", diff: "0", ok: true },
                            { name: "TB vs GL", status: "Unreconciled", diff: "47,500", ok: false, note: "Variance found in accrued expenses account." },
                            { name: "Opening vs Prior Year", status: "Reconciled", diff: "0", ok: true },
                            { name: "Bank Reconciliation", status: "Reconciled", diff: "0", ok: true },
                          ].map((r, i) => (
                            <div key={i} className={`p-5 rounded-xl border shadow-sm ${r.ok ? 'bg-white border-slate-200' : 'bg-red-50 border-red-200'}`}>
                              <div className="flex justify-between items-start">
                                <div>
                                  <h4 className={`font-bold ${r.ok ? 'text-slate-800' : 'text-red-900'}`}>{r.name}</h4>
                                  <p className={`text-xs mt-1 ${r.ok ? 'text-slate-500' : 'text-red-700'}`}>Difference: PKR {r.diff}</p>
                                </div>
                                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold ${r.ok ? 'bg-emerald-100 text-emerald-700' : 'bg-red-200 text-red-800'}`}>
                                  {r.ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                                  {r.status}
                                </div>
                              </div>
                              {!r.ok && r.note && (
                                <p className="text-sm text-red-800 mt-3 bg-white/50 p-2 rounded border border-red-100">{r.note}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {analysisTab === 'evidence' && (
                        <div className="space-y-3">
                          {[
                            { id: "A-100", name: "Trial Balance", type: "Excel", desc: "Final pre-audit TB", date: "10-Jul-2024" },
                            { id: "B-200", name: "General Ledger", type: "Excel", desc: "Full year GL dump", date: "10-Jul-2024" },
                            { id: "C-300", name: "Bank Statements", type: "PDF", desc: "All accounts June 2024", date: "12-Jul-2024" },
                            { id: "D-400", name: "Financial Statements", type: "PDF", desc: "Draft management accounts", date: "10-Jul-2024" },
                            { id: "E-500", name: "Contracts", type: "PDF", desc: "Major related party agreements", date: "14-Jul-2024" },
                          ].map((e, i) => (
                            <div key={i} className="flex items-center gap-4 p-4 bg-white border border-slate-200 rounded-xl shadow-sm hover:shadow-md transition-shadow">
                              <div className="bg-purple-100 text-purple-700 font-mono text-xs font-bold px-2.5 py-1.5 rounded-lg border border-purple-200 shrink-0">{e.id}</div>
                              <div className="flex-1">
                                <p className="font-semibold text-slate-800">{e.name}</p>
                                <p className="text-sm text-slate-500">{e.desc}</p>
                              </div>
                              <Badge variant="outline" className="bg-slate-50 text-slate-600">{e.type}</Badge>
                              <div className="text-xs text-slate-400 font-medium w-24 text-right">{e.date}</div>
                            </div>
                          ))}
                        </div>
                      )}

                      {analysisTab === 'ic' && (
                        <div className="space-y-4">
                          {[
                            { area: "Cash Disbursements", level: "High", desc: "Lack of segregation of duties in payment processing.", rec: "Implement dual authorization for payments above PKR 100k." },
                            { area: "Purchase Authorization", level: "Medium", desc: "Several POs approved by personnel exceeding their threshold.", rec: "Update ERP system to hard-block threshold overrides." },
                            { area: "Inventory Counting", level: "Low", desc: "No perpetual records maintained for consumable supplies.", rec: "Conduct periodic sample counts of supplies." },
                          ].map((w, i) => (
                            <div key={i} className="bg-white border border-slate-200 p-5 rounded-xl shadow-sm">
                              <div className="flex justify-between items-start mb-2">
                                <h4 className="font-bold text-slate-800 text-lg">{w.area}</h4>
                                <Badge className={w.level === 'High' ? 'bg-red-100 text-red-700 hover:bg-red-100' : w.level === 'Medium' ? 'bg-amber-100 text-amber-700 hover:bg-amber-100' : 'bg-green-100 text-green-700 hover:bg-green-100'}>{w.level} Risk</Badge>
                              </div>
                              <p className="text-slate-700 text-sm mb-4">{w.desc}</p>
                              <div className="bg-blue-50 border border-blue-100 p-3 rounded-lg flex items-start gap-2 text-sm">
                                <Info className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
                                <span className="text-blue-900 font-medium">{w.rec}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="pt-6 border-t border-slate-200 flex justify-end">
                      <Button onClick={nextStep} className="bg-[linear-gradient(110deg,#2563EB,#7C3AED)] hover:opacity-90 text-white shadow-lg shadow-blue-500/30 border-0 h-12 px-8 text-base font-bold animate-shimmer relative overflow-hidden group">
                        <span className="relative z-10 flex items-center gap-2">
                          <Sparkles className="w-5 h-5" /> Generate Working Papers
                        </span>
                      </Button>
                    </div>
                  </div>
                )}

                {/* STEP 3: GENERATE */}
                {step === 3 && (
                  <div className="space-y-6">
                    <div className="bg-gradient-to-r from-emerald-500 to-teal-600 rounded-xl p-6 text-white shadow-lg flex items-center justify-between">
                      <div>
                        <h2 className="font-jakarta text-2xl font-bold">27 Working Papers Generated</h2>
                        <p className="text-emerald-100 mt-1 font-medium flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> 100% ISA 200-720 Compliant</p>
                      </div>
                      <Button variant="secondary" className="bg-white/20 hover:bg-white/30 text-white border-0 font-bold backdrop-blur-sm shadow-sm">View Generation Log</Button>
                    </div>

                    <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-4 flex items-center gap-4">
                      <span className="text-xs font-bold text-slate-500 uppercase tracking-wider shrink-0 flex items-center gap-2">
                        <LayoutGrid className="w-4 h-4" /> Evidence Index
                      </span>
                      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
                        {["A-100", "B-200", "C-300", "D-400", "E-500"].map(e => (
                          <span key={e} className="bg-slate-50 border border-slate-200 text-slate-700 font-mono text-xs font-bold px-2 py-1 rounded shadow-sm shrink-0 hover:bg-slate-100">{e}</span>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-4">
                      {WP_GROUPS.slice(0, 4).map((g) => {
                        const isExpandedGroup = expandedGroups.includes(g.prefix);
                        const groupWPs = WP_DATA.filter(w => w.ref.startsWith(g.prefix));
                        
                        if (groupWPs.length === 0) return null;

                        return (
                          <div key={g.prefix} className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                            <button 
                              onClick={() => toggleWPGroup(g.prefix)}
                              className="w-full flex items-center justify-between p-4 bg-slate-50 hover:bg-slate-100 transition-colors border-b border-slate-200"
                            >
                              <div className="flex items-center gap-3">
                                <Badge variant="outline" className={`font-mono font-bold ${g.color}`}>{g.prefix}</Badge>
                                <span className="font-bold text-slate-800 text-lg">{g.label}</span>
                                <span className="text-xs font-bold text-slate-500 bg-white border border-slate-200 px-2 py-0.5 rounded-full shadow-sm">{groupWPs.length} items</span>
                              </div>
                              {isExpandedGroup ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
                            </button>
                            
                            <AnimatePresence>
                              {isExpandedGroup && (
                                <motion.div
                                  initial={{ height: 0 }}
                                  animate={{ height: 'auto' }}
                                  exit={{ height: 0 }}
                                  className="overflow-hidden"
                                >
                                  <div className="p-4 space-y-3 bg-slate-50/50">
                                    {groupWPs.map(wp => {
                                      const isWPExpanded = expandedWPs.includes(wp.ref);

                                      return (
                                        <div key={wp.ref} className="border border-slate-200 rounded-lg overflow-hidden transition-all hover:border-slate-300 bg-white shadow-sm">
                                          <div 
                                            className="flex items-center justify-between p-3 cursor-pointer select-none hover:bg-slate-50"
                                            onClick={() => toggleWP(wp.ref)}
                                          >
                                            <div className="flex items-center gap-3">
                                              <span className={`text-xs font-bold font-mono px-2 py-1 rounded border ${g.color}`}>{wp.ref}</span>
                                              <span className="font-semibold text-slate-800">{wp.title}</span>
                                              <div className="flex gap-1 ml-2">
                                                {wp.isa.map(i => <span key={i} className="text-[10px] font-mono font-medium text-slate-500 border border-slate-200 px-1.5 py-0.5 rounded bg-slate-50">{i}</span>)}
                                              </div>
                                            </div>
                                            <div className="flex items-center gap-3">
                                              {wp.evidence.length > 0 && (
                                                <div className="flex gap-1">
                                                  {wp.evidence.map(e => <span key={e} className="text-[10px] font-mono font-bold bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">{e}</span>)}
                                                </div>
                                              )}
                                              <Badge variant="secondary" className="bg-slate-100 text-slate-600 hover:bg-slate-100 border border-slate-200">{wp.status}</Badge>
                                            </div>
                                          </div>

                                          <AnimatePresence>
                                            {isWPExpanded && (
                                              <motion.div
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: 'auto', opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }}
                                                className="overflow-hidden border-t border-slate-100 bg-slate-50"
                                              >
                                                <div className="p-4 space-y-4">
                                                  <div className="grid grid-cols-2 gap-4">
                                                    <div>
                                                      <h5 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Objective</h5>
                                                      <p className="text-sm text-slate-700">{wp.objective}</p>
                                                    </div>
                                                    <div>
                                                      <h5 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Scope</h5>
                                                      <p className="text-sm text-slate-700">{wp.scope}</p>
                                                    </div>
                                                  </div>

                                                  {wp.assertions && wp.assertions.length > 0 && (
                                                    <div>
                                                      <h5 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Assertions (ISA 315)</h5>
                                                      <div className="flex gap-2">
                                                        {wp.assertions.map(a => <span key={a} className="text-[10px] font-bold bg-blue-100 text-blue-700 px-2 py-1 rounded-md">{a}</span>)}
                                                      </div>
                                                    </div>
                                                  )}

                                                  {wp.procedures && wp.procedures.length > 0 && (
                                                    <div>
                                                      <h5 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Procedures Performed</h5>
                                                      <div className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-sm">
                                                        <table className="w-full text-left text-sm">
                                                          <thead>
                                                            <tr className="bg-slate-100 border-b border-slate-200">
                                                              <th className="p-2 font-semibold text-slate-600">Procedure Description</th>
                                                              <th className="p-2 font-semibold text-slate-600 w-24">Ev. Ref</th>
                                                              <th className="p-2 font-semibold text-slate-600 w-32">Conclusion</th>
                                                            </tr>
                                                          </thead>
                                                          <tbody className="divide-y divide-slate-100">
                                                            {wp.procedures.map((p, idx) => (
                                                              <tr key={idx}>
                                                                <td className="p-2 text-slate-700">{p.desc}</td>
                                                                <td className="p-2 font-mono text-xs font-bold text-purple-600">{p.ref}</td>
                                                                <td className="p-2">
                                                                  <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${p.concColor}`}>{p.conc}</span>
                                                                </td>
                                                              </tr>
                                                            ))}
                                                          </tbody>
                                                        </table>
                                                      </div>
                                                    </div>
                                                  )}

                                                  {(wp.risks.length > 0 || wp.recs.length > 0) && (
                                                    <div className="grid grid-cols-2 gap-4">
                                                      {wp.risks.length > 0 && (
                                                        <div className="bg-red-50 p-3 rounded-lg border border-red-100">
                                                          <h5 className="text-[10px] font-bold uppercase tracking-wider text-red-800 mb-1">Risks Identified</h5>
                                                          <ul className="list-disc pl-4 text-xs text-red-900 space-y-1">
                                                            {wp.risks.map((r, i) => <li key={i}>{r}</li>)}
                                                          </ul>
                                                        </div>
                                                      )}
                                                      {wp.recs.length > 0 && (
                                                        <div className="bg-amber-50 p-3 rounded-lg border border-amber-100">
                                                          <h5 className="text-[10px] font-bold uppercase tracking-wider text-amber-800 mb-1">Recommendations</h5>
                                                          <ul className="list-disc pl-4 text-xs text-amber-900 space-y-1">
                                                            {wp.recs.map((r, i) => <li key={i}>{r}</li>)}
                                                          </ul>
                                                        </div>
                                                      )}
                                                    </div>
                                                  )}

                                                  <div className="flex items-center justify-between pt-3 border-t border-slate-200 text-[10px] text-slate-500 font-medium">
                                                    <div className="flex gap-4">
                                                      <span>Prep: <strong className="text-slate-800">{wp.signoff.prep}</strong></span>
                                                      <span>Rev: <strong className="text-slate-800">{wp.signoff.rev}</strong></span>
                                                      <span>Ptr: <strong className="text-slate-800">{wp.signoff.ptr}</strong></span>
                                                      <span>Date: <strong className="text-slate-800">{wp.signoff.date}</strong></span>
                                                    </div>
                                                    {wp.cross.length > 0 && (
                                                      <div className="flex items-center gap-1">
                                                        <span>Cross-ref:</span>
                                                        {wp.cross.map(c => <span key={c} className="font-mono text-teal-600 bg-teal-50 border border-teal-200 px-1 rounded">{c}</span>)}
                                                      </div>
                                                    )}
                                                  </div>
                                                </div>
                                              </motion.div>
                                            )}
                                          </AnimatePresence>
                                        </div>
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
                )}

                {/* STEP 4: EXPORT */}
                {step === 4 && (
                  <div className="space-y-8">
                    <div className="text-center max-w-2xl mx-auto mb-10">
                      <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4 border-4 border-white shadow-xl shadow-green-500/20">
                        <CheckCircle2 className="w-10 h-10" />
                      </div>
                      <h2 className="font-jakarta text-3xl font-bold text-slate-900">Audit File Complete</h2>
                      <p className="text-slate-500 mt-2 text-lg">Your working papers are ready for export and final review.</p>
                      
                      <div className="flex items-center justify-center gap-6 mt-6">
                        <div className="bg-white px-6 py-3 rounded-2xl border border-slate-200 shadow-sm flex flex-col items-center">
                          <span className="text-2xl font-bold text-slate-900">27</span>
                          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Working Papers</span>
                        </div>
                        <div className="bg-white px-6 py-3 rounded-2xl border border-slate-200 shadow-sm flex flex-col items-center">
                          <span className="text-2xl font-bold text-slate-900">5</span>
                          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Evidence Files</span>
                        </div>
                        <div className="bg-white px-6 py-3 rounded-2xl border border-slate-200 shadow-sm flex flex-col items-center">
                          <span className="text-2xl font-bold text-slate-900">4</span>
                          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Confirmations</span>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-6 max-w-4xl mx-auto">
                      {/* Excel */}
                      <div className="group bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-xl hover:border-green-300 transition-all duration-300 hover:-translate-y-1 relative overflow-hidden flex flex-col">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-green-500/5 rounded-bl-full -mr-8 -mt-8 transition-transform group-hover:scale-150"></div>
                        <div className="flex items-start gap-4 mb-6 relative z-10">
                          <div className="w-12 h-12 bg-green-100 text-green-600 rounded-xl flex items-center justify-center shrink-0">
                            <FileSpreadsheet className="w-6 h-6" />
                          </div>
                          <div>
                            <h3 className="text-lg font-bold text-slate-900">Structured Workbook (.xlsx)</h3>
                            <p className="text-sm text-slate-500 mt-1">Cover sheet, Index, all WP sections in separate tabs. Filter and sort within Excel.</p>
                          </div>
                        </div>
                        <div className="mt-auto relative z-10">
                          <Button className="w-full bg-green-600 hover:bg-green-700 text-white font-bold h-12"><Download className="w-4 h-4 mr-2"/> Download Excel</Button>
                        </div>
                      </div>

                      {/* Word */}
                      <div className="group bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-xl hover:border-blue-300 transition-all duration-300 hover:-translate-y-1 relative overflow-hidden flex flex-col">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-bl-full -mr-8 -mt-8 transition-transform group-hover:scale-150"></div>
                        <div className="flex items-start gap-4 mb-6 relative z-10">
                          <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center shrink-0">
                            <FileText className="w-6 h-6" />
                          </div>
                          <div>
                            <h3 className="text-lg font-bold text-slate-900">Editable Document (.docx)</h3>
                            <p className="text-sm text-slate-500 mt-1">Full working paper file with Table of Contents, Evidence Index, sign-off tables. Professional formatting.</p>
                          </div>
                        </div>
                        <div className="mt-auto relative z-10">
                          <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold h-12"><Download className="w-4 h-4 mr-2"/> Download Word</Button>
                        </div>
                      </div>

                      {/* PDF */}
                      <div className="group bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-xl hover:border-red-300 transition-all duration-300 hover:-translate-y-1 relative overflow-hidden flex flex-col">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/5 rounded-bl-full -mr-8 -mt-8 transition-transform group-hover:scale-150"></div>
                        <div className="flex items-start gap-4 mb-6 relative z-10">
                          <div className="w-12 h-12 bg-red-100 text-red-600 rounded-xl flex items-center justify-center shrink-0">
                            <FileText className="w-6 h-6" />
                          </div>
                          <div>
                            <h3 className="text-lg font-bold text-slate-900">Professional File (.pdf)</h3>
                            <p className="text-sm text-slate-500 mt-1">Watermarked audit file with headers, footers, page numbers. Court-admissible format.</p>
                          </div>
                        </div>
                        <div className="mt-auto relative z-10">
                          <Button className="w-full bg-red-600 hover:bg-red-700 text-white font-bold h-12"><Download className="w-4 h-4 mr-2"/> Download PDF</Button>
                        </div>
                      </div>

                      {/* Confirmations */}
                      <div className="group bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-xl hover:border-purple-300 transition-all duration-300 hover:-translate-y-1 relative overflow-hidden flex flex-col">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/5 rounded-bl-full -mr-8 -mt-8 transition-transform group-hover:scale-150"></div>
                        <div className="flex items-start gap-4 mb-6 relative z-10">
                          <div className="w-12 h-12 bg-purple-100 text-purple-600 rounded-xl flex items-center justify-center shrink-0">
                            <Mail className="w-6 h-6" />
                          </div>
                          <div>
                            <h3 className="text-lg font-bold text-slate-900">ISA Confirmation Letters</h3>
                            <p className="text-sm text-slate-500 mt-1">Bank (ISA 505), Debtors, Creditors, Legal (ISA 501) — pre-addressed letterhead format.</p>
                          </div>
                        </div>
                        <div className="mt-auto relative z-10">
                          <Button className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold h-12"><Download className="w-4 h-4 mr-2"/> Download Letters</Button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        {/* Footer Navigation */}
        <footer className="h-20 border-t border-slate-200/60 bg-white px-8 flex items-center justify-between shrink-0 z-10">
          <Button 
            variant="ghost" 
            onClick={prevStep} 
            disabled={step === 0}
            className="text-slate-500 font-bold px-6"
          >
            ← Back
          </Button>
          
          <div className="flex items-center gap-2">
            {STEPS.map((s, i) => (
              <div key={i} className={`w-2 h-2 rounded-full transition-colors ${i === step ? 'bg-blue-600' : i < step ? 'bg-emerald-400' : 'bg-slate-200'}`} />
            ))}
          </div>

          <Button 
            onClick={nextStep} 
            disabled={step === 4}
            className="bg-slate-900 hover:bg-slate-800 text-white font-bold px-8 h-10 shadow-md shadow-slate-900/10"
          >
            {step === 3 ? "Next: Export →" : "Next →"}
          </Button>
        </footer>
      </div>
    </div>
  );
}
