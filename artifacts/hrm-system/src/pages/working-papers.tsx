import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useLocation, useParams } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import {
  Upload, FileText, Loader2, CheckCircle2, Download, ChevronRight,
  ChevronDown, ChevronUp, BookOpen, Shield, AlertTriangle, TrendingUp,
  Building2, Calendar as CalendarIcon, Briefcase, X, RefreshCw,
  BarChart2, FileCheck, ClipboardCheck, Sparkles,
  FileSearch, Scale, Layers, FileOutput, Check, Table2,
  Activity, FileSpreadsheet, Hash, Settings2,
  Trash2, AlertCircle, ArrowRight, Zap, Database,
  Edit3, RotateCcw, Lock, Unlock,
  ChevronLeft, CheckSquare, Square,
  Globe, Users, Package, TrendingDown, DollarSign, Percent,
  Flag, Book, Clipboard, Award, BarChart, Info,
  Plus, Eye, Link2, Target
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format, parse, isValid } from "date-fns";
import { cn } from "@/lib/utils";

// ─── TYPES ────────────────────────────────────────────────────────────────────

interface UploadedFile { file: File; id: string; category: "fs" | "st"; }

interface VariableMatrix {
  // A. Engagement Profile
  engagementType: string; yearEnd: string; periodStart: string; periodEnd: string;
  firstYearAudit: boolean; recurringEngagement: boolean; groupAudit: boolean;
  componentAuditor: boolean; engagementPartner: string; eqcrRequired: boolean;
  preparer: string; reviewer: string; approver: string;
  // B. Entity Profile
  entityName: string; legalForm: string; incorporationStatus: string;
  ntn: string; strn: string; listedStatus: string; pie: boolean;
  industry: string; numberOfLocations: number;
  branchOperations: boolean; foreignOperations: boolean; relatedPartiesExist: boolean;
  // C. Financial Reporting
  framework: string; currency: string; booksMaintained: boolean;
  accountingSoftware: string; tbAvailable: boolean; glAvailable: boolean;
  priorYearFsAvailable: boolean; auditAdjustmentsExpected: boolean;
  // D. Tax & Regulatory
  incomeTaxApplicable: boolean; salesTaxApplicable: boolean;
  provincialSalesTax: string; fedApplicable: boolean; whtApplicable: boolean;
  taxAuditExposure: boolean; deferredTaxApplicable: boolean;
  // E. FS Components
  hasCashBank: boolean; hasReceivables: boolean; hasInventory: boolean;
  hasFixedAssets: boolean; hasIntangibles: boolean; hasInvestments: boolean;
  hasLoansAdvances: boolean; hasPayables: boolean; hasBorrowings: boolean;
  hasLeaseLiabilities: boolean; hasProvisions: boolean; hasContingentLiabilities: boolean;
  hasShareCapital: boolean; hasReserves: boolean; hasRetainedEarnings: boolean;
  hasMultipleRevenue: boolean; hasCostOfSales: boolean; hasOperatingExpenses: boolean;
  hasFinanceCost: boolean; hasOtherIncome: boolean;
  // F. Risk Assessment
  fraudRiskIndicators: boolean; goingConcernIssue: boolean;
  significantEstimates: boolean; complexTransactions: boolean; relatedPartyRisk: boolean;
  revenueRecognitionRisk: boolean; internalControlStrength: string;
  itSystemReliance: boolean; manualAccounting: boolean;
  // G. Audit Approach
  auditApproach: string; samplingMethod: string; materialityBasis: string;
  performanceMaterialityPct: number; useOfExperts: boolean; externalConfirmations: boolean;
  // H. Sales Tax Data
  stPeriodFrom: string; stPeriodTo: string;
  outputTax: number; inputTax: number; stAdjustments: number; refundClaimed: boolean;
  // I. Document Availability
  bankStatementsAvailable: boolean; invoicesAvailable: boolean;
  contractsAvailable: boolean; priorYearWPsAvailable: boolean;
  // J. Output Control
  generateTB: boolean; generateGL: boolean; generateWPs: boolean;
  detailLevel: string; outputFormat: string;
}

interface TBAccount {
  account_code: string; account_name: string; fs_head: string;
  classification: string; debit_total: number; credit_total: number;
  balance_dr: number; balance_cr: number; fs_mapping: string;
  source: "Extracted" | "Derived" | "Estimated" | "User-confirmed";
  confidence: number; notes: string;
}

interface GLEntry {
  date: string; voucher_no: string; account_code: string;
  account_name: string; narration: string; debit: number; credit: number; ref: string;
}

interface GLAccount {
  account_code: string; account_name: string; group: string;
  type: string; opening_balance: number; closing_balance: number;
  entries: GLEntry[]; source: string;
}

interface WPProcedure {
  no: string; procedure: string; finding: string;
  conclusion: "Satisfactory" | "Note Required" | "Matters Arising";
  evidence_ref: string;
}

interface WPDoc {
  ref: string; title: string; section: string; section_label: string;
  isa_references: string[]; assertions: string[]; objective: string;
  scope: string; procedures: WPProcedure[];
  summary_table: { item: string; value: string; comment: string }[] | null;
  key_findings: string[]; auditor_conclusion: string;
  risks_identified: string[]; recommendations: string[];
  evidence_refs: string[]; cross_references: string[];
  status: "Draft" | "Review" | "Approved";
  prepared_by: string; reviewed_by: string; approved_by: string;
  prepared_date: string; reviewed_date: string;
  source: "Extracted" | "Derived" | "Estimated" | "User-confirmed";
  isOpen?: boolean; isEditing?: boolean;
}

interface ExtractedData {
  entity: any; financials: any; taxData: any;
  tbLines: any[]; glSummary: any[]; flags: string[];
  documents_found: any[]; extractionLog: string[];
  analysis: any; confidenceScores: Record<string, number>;
  assumptions: string[]; missingData: string[];
}

interface WPSession {
  vars: VariableMatrix;
  extractedData: ExtractedData | null;
  trialBalance: TBAccount[];
  glEntries: GLEntry[];
  glAccounts: GLAccount[];
  chartOfAccounts: any[];
  tbSummary: { is_balanced: boolean; total_debit: number; total_credit: number; gl_entries: number; tb_accounts: number; };
  workingPapers: WPDoc[];
  selectedPapers: string[];
  draftSavedAt: string | null;
}

// ─── CONSTANTS ─────────────────────────────────────────────────────────────────

const STEPS = [
  { id: 0, slug: "upload",          label: "Upload Documents",     icon: Upload },
  { id: 1, slug: "variables",       label: "Engagement Variables", icon: Settings2 },
  { id: 2, slug: "extraction",      label: "AI Extraction",        icon: Sparkles },
  { id: 3, slug: "trial-balance",   label: "Trial Balance",        icon: Table2 },
  { id: 4, slug: "general-ledger",  label: "General Ledger",       icon: BookOpen },
  { id: 5, slug: "working-papers",  label: "Working Papers",       icon: FileText },
  { id: 6, slug: "export",          label: "Export",               icon: Download },
];

const WP_INDEX_FULL: { section: string; color: string; icon: any; papers: { code: string; title: string; trigger: string; standard: string }[] }[] = [
  {
    section: "A — Pre-Engagement & Acceptance", color: "bg-blue-50 border-blue-200", icon: ClipboardCheck,
    papers: [
      { code: "A1", title: "Client Acceptance Checklist", trigger: "New client", standard: "ISA 210, ISQM 1" },
      { code: "A2", title: "Continuance Evaluation", trigger: "Existing client", standard: "ISQM 1" },
      { code: "A3", title: "Engagement Letter", trigger: "All", standard: "ISA 210" },
      { code: "A4", title: "Independence Declarations (Firm & Team)", trigger: "All", standard: "IESBA Code" },
      { code: "A5", title: "Conflict of Interest Assessment", trigger: "All", standard: "IESBA" },
      { code: "A6", title: "Ethical Compliance (IESBA)", trigger: "All", standard: "IESBA Code" },
      { code: "A7", title: "Client Risk Profiling", trigger: "All", standard: "ISA 220" },
      { code: "A8", title: "KYC / AML Documentation", trigger: "Regulated entities", standard: "AMLA 2010" },
      { code: "A9", title: "Previous Auditor Communication", trigger: "New client", standard: "ISA 300" },
      { code: "A10", title: "Terms of Engagement Approval", trigger: "All", standard: "ISA 210" },
    ],
  },
  {
    section: "B — Planning", color: "bg-violet-50 border-violet-200", icon: BarChart,
    papers: [
      { code: "B1", title: "Understanding the Entity & Environment", trigger: "All", standard: "ISA 315" },
      { code: "B2", title: "Industry Analysis", trigger: "All", standard: "ISA 315" },
      { code: "B3", title: "Regulatory Framework Assessment", trigger: "All", standard: "ISA 250" },
      { code: "B4", title: "Business Model & Revenue Streams", trigger: "All", standard: "ISA 315" },
      { code: "B5", title: "Internal Control Narratives", trigger: "All", standard: "ISA 315" },
      { code: "B6", title: "Process Flowcharts", trigger: "All", standard: "ISA 315" },
      { code: "B7", title: "IT Environment Assessment", trigger: "IT reliance", standard: "ISA 315" },
      { code: "B8", title: "Risk Assessment (Financial Statement Level)", trigger: "All", standard: "ISA 315" },
      { code: "B9", title: "Risk Assessment (Assertion Level)", trigger: "All", standard: "ISA 315" },
      { code: "B10", title: "Fraud Risk Assessment", trigger: "All", standard: "ISA 240" },
      { code: "B11", title: "Laws & Regulations Compliance Review", trigger: "All", standard: "ISA 250" },
      { code: "B12", title: "Materiality Calculation (Overall, PM, Trivial)", trigger: "All", standard: "ISA 320" },
      { code: "B13", title: "Audit Strategy Memorandum", trigger: "All", standard: "ISA 300" },
      { code: "B14", title: "Detailed Audit Plan", trigger: "All", standard: "ISA 300" },
      { code: "B15", title: "Related Party Identification", trigger: "Related parties", standard: "ISA 550" },
    ],
  },
  {
    section: "C — Trial Balance & Financials", color: "bg-green-50 border-green-200", icon: Table2,
    papers: [
      { code: "C1", title: "Raw Trial Balance", trigger: "All", standard: "ISA 500" },
      { code: "C2", title: "Adjusted Trial Balance", trigger: "All", standard: "ISA 500" },
      { code: "C3", title: "Lead Schedules (FS Mapping)", trigger: "All", standard: "ISA 500" },
      { code: "C4", title: "Financial Statements (Draft)", trigger: "All", standard: "IAS 1" },
      { code: "C5", title: "Financial Statements (Final)", trigger: "All", standard: "IAS 1" },
      { code: "C6", title: "Prior Year Comparatives", trigger: "All", standard: "ISA 510" },
      { code: "C7", title: "Chart of Accounts Mapping", trigger: "All", standard: "ISA 315" },
      { code: "C8", title: "Consolidation (if applicable)", trigger: "Group audit", standard: "IFRS 10" },
    ],
  },
  {
    section: "D — Analytical Review", color: "bg-cyan-50 border-cyan-200", icon: BarChart,
    papers: [
      { code: "D1", title: "Ratio Analysis (Liquidity, Profitability, Leverage, Efficiency)", trigger: "All", standard: "ISA 520" },
      { code: "D2", title: "Trend Analysis (YoY / Monthly)", trigger: "All", standard: "ISA 520" },
      { code: "D3", title: "Budget vs Actual Analysis", trigger: "Budget available", standard: "ISA 520" },
      { code: "D4", title: "Variance Analysis", trigger: "All", standard: "ISA 520" },
      { code: "D5", title: "Expectation vs Actual Comparison", trigger: "All", standard: "ISA 520" },
      { code: "D6", title: "Analytical Review Conclusion", trigger: "All", standard: "ISA 520" },
    ],
  },
  {
    section: "E — Internal Control & Risk", color: "bg-pink-50 border-pink-200", icon: Shield,
    papers: [
      { code: "E1", title: "Walkthrough Documentation", trigger: "All", standard: "ISA 315" },
      { code: "E2", title: "Control Identification Matrix", trigger: "All", standard: "ISA 315" },
      { code: "E3", title: "Risk-Control Matrix (RCM)", trigger: "All", standard: "ISA 315, ISA 330" },
      { code: "E4", title: "Test of Controls (ToC)", trigger: "Controls approach", standard: "ISA 330" },
      { code: "E5", title: "Control Deviations Log", trigger: "Controls approach", standard: "ISA 330" },
      { code: "E6", title: "IT General Controls (ITGC) Testing", trigger: "IT reliance", standard: "ISA 315" },
      { code: "E7", title: "Application Controls Testing", trigger: "IT reliance", standard: "ISA 315" },
      { code: "E8", title: "Control Deficiency Evaluation", trigger: "All", standard: "ISA 265" },
      { code: "E9", title: "Controls Conclusion", trigger: "All", standard: "ISA 265" },
    ],
  },
  {
    section: "F — Substantive Procedures (Test of Details)", color: "bg-orange-50 border-orange-200", icon: FileSearch,
    papers: [
      { code: "F1", title: "Sampling Plan", trigger: "All", standard: "ISA 530" },
      { code: "F2", title: "Sampling Selection Sheet", trigger: "All", standard: "ISA 530" },
      { code: "F3", title: "Substantive Testing Strategy", trigger: "All", standard: "ISA 330" },
      { code: "F4", title: "Misstatement Tracking Sheet", trigger: "All", standard: "ISA 450" },
      { code: "F5", title: "Cash & Bank Testing", trigger: "Has Cash & Bank", standard: "ISA 505" },
      { code: "F6", title: "Bank Reconciliation Testing", trigger: "Has Cash & Bank", standard: "ISA 500" },
      { code: "F7", title: "Receivables Testing (Aging, Confirmations)", trigger: "Has Receivables", standard: "ISA 505" },
      { code: "F8", title: "Inventory Testing (Existence, Valuation)", trigger: "Has Inventory", standard: "ISA 501, IAS 2" },
      { code: "F9", title: "PPE Testing (Additions, Disposals, Depreciation)", trigger: "Has Fixed Assets", standard: "IAS 16" },
      { code: "F10", title: "Intangible Assets Testing", trigger: "Has Intangibles", standard: "IAS 38" },
      { code: "F11", title: "Investment Testing", trigger: "Has Investments", standard: "IFRS 9" },
      { code: "F12", title: "Payables Testing", trigger: "Has Payables", standard: "ISA 330" },
      { code: "F13", title: "Borrowings Testing", trigger: "Has Borrowings", standard: "ISA 540" },
      { code: "F14", title: "Accruals Testing", trigger: "All", standard: "ISA 330" },
      { code: "F15", title: "Provisions & Contingencies", trigger: "Has Provisions", standard: "IAS 37" },
      { code: "F16", title: "Share Capital Verification", trigger: "Has Share Capital", standard: "Companies Act" },
      { code: "F17", title: "Reserves & Retained Earnings", trigger: "Has Reserves", standard: "IAS 1" },
      { code: "F18", title: "Revenue Testing (Cut-off, Occurrence)", trigger: "All", standard: "IFRS 15, ISA 240" },
      { code: "F19", title: "Cost of Sales Testing", trigger: "Has Cost of Sales", standard: "ISA 330" },
      { code: "F20", title: "Operating Expenses Testing", trigger: "Has Operating Expenses", standard: "ISA 330" },
      { code: "F21", title: "Payroll Testing", trigger: "Has Payroll", standard: "ISA 330" },
      { code: "F22", title: "Finance Cost Testing", trigger: "Has Finance Cost", standard: "ISA 540" },
      { code: "F23", title: "Other Income Testing", trigger: "Has Other Income", standard: "ISA 330" },
      { code: "F24", title: "Current Tax Computation", trigger: "Income Tax applicable", standard: "ITO 2001" },
      { code: "F25", title: "Deferred Tax Calculation", trigger: "Deferred Tax applicable", standard: "IAS 12" },
      { code: "F26", title: "Sales Tax / VAT Testing", trigger: "Sales Tax applicable", standard: "STA 1990" },
      { code: "F27", title: "Withholding Tax Testing", trigger: "WHT applicable", standard: "ITO 2001" },
    ],
  },
  {
    section: "G — Audit Evidence", color: "bg-amber-50 border-amber-200", icon: FileCheck,
    papers: [
      { code: "G1", title: "Bank Confirmations", trigger: "Has Cash & Bank", standard: "ISA 505" },
      { code: "G2", title: "Debtors Confirmations", trigger: "Has Receivables", standard: "ISA 505" },
      { code: "G3", title: "Creditors Confirmations", trigger: "Has Payables", standard: "ISA 505" },
      { code: "G4", title: "Legal Confirmations", trigger: "All", standard: "ISA 501" },
      { code: "G5", title: "Third Party Confirmations", trigger: "All", standard: "ISA 505" },
      { code: "G6", title: "Physical Verification Reports", trigger: "Has Fixed Assets / Inventory", standard: "ISA 501" },
      { code: "G7", title: "Supporting Documents Index", trigger: "All", standard: "ISA 500" },
      { code: "G8", title: "Evidence Cross-Reference Sheet", trigger: "All", standard: "ISA 500" },
    ],
  },
  {
    section: "H — Completion", color: "bg-red-50 border-red-200", icon: CheckCircle2,
    papers: [
      { code: "H1", title: "Summary of Misstatements (Unadjusted & Adjusted)", trigger: "All", standard: "ISA 450" },
      { code: "H2", title: "Subsequent Events Review", trigger: "All", standard: "ISA 560" },
      { code: "H3", title: "Going Concern Assessment", trigger: "All", standard: "ISA 570" },
      { code: "H4", title: "Final Analytical Review", trigger: "All", standard: "ISA 520" },
      { code: "H5", title: "Disclosure Checklist (IFRS / Companies Act)", trigger: "All", standard: "IFRS / Companies Act" },
      { code: "H6", title: "Management Representation Letter", trigger: "All", standard: "ISA 580" },
      { code: "H7", title: "Engagement Completion Checklist", trigger: "All", standard: "ISA 220, ISA 230" },
    ],
  },
  {
    section: "I — Reporting", color: "bg-indigo-50 border-indigo-200", icon: FileOutput,
    papers: [
      { code: "I1", title: "Draft Auditor's Report", trigger: "All", standard: "ISA 700" },
      { code: "I2", title: "Final Auditor's Report", trigger: "All", standard: "ISA 700" },
      { code: "I3", title: "Key Audit Matters (KAM)", trigger: "Listed entity", standard: "ISA 701" },
      { code: "I4", title: "Emphasis of Matter (EOM)", trigger: "Emphasis needed", standard: "ISA 706" },
      { code: "I5", title: "Other Matter Paragraph", trigger: "As needed", standard: "ISA 706" },
      { code: "I6", title: "Other Information Review (ISA 720)", trigger: "All", standard: "ISA 720" },
    ],
  },
  {
    section: "J — Quality Control & EQCR", color: "bg-teal-50 border-teal-200", icon: Award,
    papers: [
      { code: "J1", title: "Engagement Quality Control Review Checklist", trigger: "EQCR required", standard: "ISQM 2" },
      { code: "J2", title: "Reviewer Notes & Clearance", trigger: "All", standard: "ISA 220" },
      { code: "J3", title: "Consultation Documentation", trigger: "Complex matters", standard: "ISA 220, ISQM 1" },
      { code: "J4", title: "Independence Reconfirmation", trigger: "All", standard: "IESBA Code" },
      { code: "J5", title: "Quality Control Sign-offs", trigger: "All", standard: "ISA 220" },
    ],
  },
  {
    section: "K — Client Communication", color: "bg-slate-50 border-slate-200", icon: Users,
    papers: [
      { code: "K1", title: "Audit Planning Letter", trigger: "All", standard: "ISA 260" },
      { code: "K2", title: "Management Letter (Control Weaknesses)", trigger: "Deficiencies found", standard: "ISA 265" },
      { code: "K3", title: "TCWG Communication", trigger: "All", standard: "ISA 260" },
      { code: "K4", title: "Audit Findings Report", trigger: "All", standard: "ISA 260" },
      { code: "K5", title: "Exit Meeting Minutes", trigger: "All", standard: "ISA 260" },
    ],
  },
  {
    section: "L — Regulatory & Compliance (Pakistan)", color: "bg-emerald-50 border-emerald-200", icon: Shield,
    papers: [
      { code: "L1", title: "Companies Act Compliance Checklist", trigger: "All", standard: "Companies Act 2017" },
      { code: "L2", title: "SECP Filings Review", trigger: "Listed / SECP", standard: "SECP Regulations" },
      { code: "L3", title: "Income Tax Compliance (FBR)", trigger: "All", standard: "ITO 2001" },
      { code: "L4", title: "Sales Tax Compliance (FBR / PRA / SRB / KPRA / BRA)", trigger: "Sales Tax applicable", standard: "STA 1990" },
      { code: "L5", title: "Withholding Tax Compliance", trigger: "WHT applicable", standard: "ITO 2001" },
      { code: "L6", title: "Zakat / WWF / EOBI Compliance", trigger: "All", standard: "Pakistan Laws" },
    ],
  },
  {
    section: "M — Administrative", color: "bg-gray-50 border-gray-200", icon: ClipboardCheck,
    papers: [
      { code: "M1", title: "Engagement Budget & Time Sheet", trigger: "All", standard: "ISQM 1" },
      { code: "M2", title: "Team Allocation", trigger: "All", standard: "ISA 220" },
      { code: "M3", title: "Billing & Fee Note", trigger: "All", standard: "ISQM 1" },
      { code: "M4", title: "Document Indexing", trigger: "All", standard: "ISA 230" },
      { code: "M5", title: "Version Control Log", trigger: "All", standard: "ISA 230" },
    ],
  },
  {
    section: "N — IT & Data (AI / Digital Audit)", color: "bg-purple-50 border-purple-200", icon: Sparkles,
    papers: [
      { code: "N1", title: "Data Extraction Log (OCR Output)", trigger: "All", standard: "AI Process" },
      { code: "N2", title: "Data Validation Sheet", trigger: "All", standard: "AI Process" },
      { code: "N3", title: "TB vs GL Reconciliation", trigger: "All", standard: "AI Process" },
      { code: "N4", title: "FS Mapping Sheet", trigger: "All", standard: "AI Process" },
      { code: "N5", title: "AI Assumptions Log", trigger: "All", standard: "AI Process" },
      { code: "N6", title: "Exception & Error Log", trigger: "All", standard: "AI Process" },
    ],
  },
  {
    section: "O — Inspection / QCR / Archiving", color: "bg-rose-50 border-rose-200", icon: FileCheck,
    papers: [
      { code: "O1", title: "ICAP QCR Checklist", trigger: "All", standard: "ICAP / ISQM 1" },
      { code: "O2", title: "ISA Compliance Mapping", trigger: "All", standard: "ISA 200-720" },
      { code: "O3", title: "Working Paper Index", trigger: "All", standard: "ISA 230" },
      { code: "O4", title: "Deficiency Tracking", trigger: "All", standard: "ISA 265" },
      { code: "O5", title: "Final Archive File", trigger: "All", standard: "ISA 230" },
      { code: "O6", title: "File Lock & Retention Record", trigger: "All", standard: "ISA 230" },
    ],
  },
];

const DEFAULT_VARS: VariableMatrix = {
  engagementType: "Statutory Audit", yearEnd: "", periodStart: "", periodEnd: "",
  firstYearAudit: false, recurringEngagement: true, groupAudit: false,
  componentAuditor: false, engagementPartner: "", eqcrRequired: false,
  preparer: "", reviewer: "", approver: "",
  entityName: "", legalForm: "Private Limited Company", incorporationStatus: "SECP Registered",
  ntn: "", strn: "", listedStatus: "Unlisted", pie: false,
  industry: "Manufacturing / Trading", numberOfLocations: 1,
  branchOperations: false, foreignOperations: false, relatedPartiesExist: false,
  framework: "IFRS", currency: "PKR", booksMaintained: true,
  accountingSoftware: "", tbAvailable: false, glAvailable: false,
  priorYearFsAvailable: true, auditAdjustmentsExpected: false,
  incomeTaxApplicable: true, salesTaxApplicable: true,
  provincialSalesTax: "None", fedApplicable: false, whtApplicable: true,
  taxAuditExposure: false, deferredTaxApplicable: true,
  hasCashBank: true, hasReceivables: true, hasInventory: false,
  hasFixedAssets: true, hasIntangibles: false, hasInvestments: false,
  hasLoansAdvances: false, hasPayables: true, hasBorrowings: false,
  hasLeaseLiabilities: false, hasProvisions: true, hasContingentLiabilities: false,
  hasShareCapital: true, hasReserves: true, hasRetainedEarnings: true,
  hasMultipleRevenue: false, hasCostOfSales: true, hasOperatingExpenses: true,
  hasFinanceCost: false, hasOtherIncome: false,
  fraudRiskIndicators: false, goingConcernIssue: false,
  significantEstimates: true, complexTransactions: false, relatedPartyRisk: false,
  revenueRecognitionRisk: false, internalControlStrength: "Moderate",
  itSystemReliance: false, manualAccounting: false,
  auditApproach: "Substantive", samplingMethod: "Judgmental",
  materialityBasis: "Revenue", performanceMaterialityPct: 75,
  useOfExperts: false, externalConfirmations: true,
  stPeriodFrom: "", stPeriodTo: "", outputTax: 0, inputTax: 0, stAdjustments: 0, refundClaimed: false,
  bankStatementsAvailable: false, invoicesAvailable: false,
  contractsAvailable: false, priorYearWPsAvailable: false,
  generateTB: true, generateGL: true, generateWPs: true,
  detailLevel: "Full Audit File", outputFormat: "All",
};

const DRAFT_KEY = "ana_wp_v3";

// ─── HELPERS ───────────────────────────────────────────────────────────────────

const fmtPKR = (n: number) => `PKR ${(n || 0).toLocaleString("en-PK")}`;

type DataSource = "Extracted" | "Derived" | "Estimated" | "User-confirmed";

function SourceBadge({ source }: { source: DataSource }) {
  const cfg: Record<DataSource, { cls: string; label: string }> = {
    "Extracted":      { cls: "bg-blue-100 text-blue-800 border-blue-200",    label: "Extracted" },
    "Derived":        { cls: "bg-green-100 text-green-800 border-green-200",  label: "Derived" },
    "Estimated":      { cls: "bg-amber-100 text-amber-800 border-amber-200",  label: "Estimated" },
    "User-confirmed": { cls: "bg-purple-100 text-purple-800 border-purple-200", label: "Confirmed" },
  };
  const c = cfg[source] || cfg["Estimated"];
  return (
    <span className={cn("inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border", c.cls)}>
      {source === "Extracted" && <FileSearch className="w-2.5 h-2.5" />}
      {source === "Derived"   && <Link2 className="w-2.5 h-2.5" />}
      {source === "Estimated" && <Sparkles className="w-2.5 h-2.5" />}
      {source === "User-confirmed" && <Check className="w-2.5 h-2.5" />}
      {c.label}
    </span>
  );
}

function ConfidenceBadge({ pct }: { pct: number }) {
  const color = pct >= 80 ? "text-green-700 bg-green-50" : pct >= 50 ? "text-amber-700 bg-amber-50" : "text-red-700 bg-red-50";
  return <span className={cn("inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded", color)}>{pct}%</span>;
}

function StatusBadge({ status }: { status: "Draft" | "Review" | "Approved" }) {
  const cfg = {
    Draft:    "bg-slate-100 text-slate-700 border-slate-200",
    Review:   "bg-blue-100 text-blue-700 border-blue-200",
    Approved: "bg-green-100 text-green-700 border-green-200",
  };
  return <span className={cn("inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border", cfg[status])}>{status}</span>;
}

function SectionHeader({ icon: Icon, title, subtitle, color }: { icon: any; title: string; subtitle?: string; color?: string }) {
  return (
    <div className={cn("flex items-center gap-3 mb-4 p-3 rounded-lg border", color || "bg-slate-50 border-slate-200")}>
      <div className="p-2 rounded-md bg-white shadow-sm"><Icon className="w-4 h-4 text-slate-600" /></div>
      <div>
        <h3 className="font-semibold text-slate-800 text-sm">{title}</h3>
        {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
      </div>
    </div>
  );
}

function DatePickerField({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [open, setOpen] = useState(false);
  const dateObj = value ? parse(value, "yyyy-MM-dd", new Date()) : undefined;
  const selected = dateObj && isValid(dateObj) ? dateObj : undefined;
  const displayText = selected ? format(selected, "dd MMM yyyy") : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className={cn("h-8 w-full justify-start text-left text-xs font-normal gap-2", !displayText && "text-muted-foreground")}>
          <CalendarIcon className="w-3.5 h-3.5 shrink-0 opacity-60" />
          {displayText || <span>{placeholder || "Pick a date"}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 rounded-xl shadow-lg border border-slate-200" align="start" sideOffset={4}>
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(day) => {
            if (day) {
              onChange(format(day, "yyyy-MM-dd"));
            } else {
              onChange("");
            }
            setOpen(false);
          }}
          defaultMonth={selected}
          captionLayout="dropdown"
          fromYear={2015}
          toYear={2035}
        />
      </PopoverContent>
    </Popover>
  );
}

function YesNoToggle({ label, value, onChange, hint }: { label: string; value: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
      <div>
        <span className="text-sm text-slate-700">{label}</span>
        {hint && <p className="text-xs text-slate-400">{hint}</p>}
      </div>
      <Switch checked={value} onCheckedChange={onChange} />
    </div>
  );
}

function VarGroupPanel({ id, label, icon: Icon, color, children, openGroup, onToggle }:
  { id: string; label: string; icon: any; color: string; children: React.ReactNode; openGroup: string | null; onToggle: (g: string) => void }) {
  const isOpen = openGroup === id;
  return (
    <div className={cn("border rounded-xl", color)}>
      <button className="w-full flex items-center justify-between p-3 text-left hover:bg-white/50 transition-colors"
        onClick={() => onToggle(id)}>
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-slate-600" />
          <span className="font-medium text-sm text-slate-800">{label}</span>
        </div>
        <ChevronDown className={cn("w-4 h-4 text-slate-400 transition-transform duration-200", isOpen && "rotate-180")} />
      </button>
      <div className={cn("overflow-hidden transition-all duration-200", isOpen ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0")}>
        <div className="p-4 bg-white border-t border-slate-100">{children}</div>
      </div>
    </div>
  );
}

function VarField({ label, children, span }: { label: string; children: React.ReactNode; span?: boolean }) {
  return (
    <div className={cn("space-y-1", span ? "col-span-2" : "")}>
      <Label className="text-xs text-slate-600">{label}</Label>
      {children}
    </div>
  );
}

// ─── STEP 0: UPLOAD ────────────────────────────────────────────────────────────

function UploadStep({ fsFiles, stFiles, onFsAdd, onStAdd, onFsRemove, onStRemove, onContinue }:
  { fsFiles: File[]; stFiles: File[]; onFsAdd: (f: File[]) => void; onStAdd: (f: File[]) => void;
    onFsRemove: (i: number) => void; onStRemove: (i: number) => void; onContinue: () => void }) {

  const fsRef = useRef<HTMLInputElement>(null);
  const stRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback((e: React.DragEvent, cb: (f: File[]) => void) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    if (files.length) cb(files);
  }, []);

  const DropZone = ({ label, files, inputRef, onAdd, onRemove, icon: Icon, accent }:
    { label: string; files: File[]; inputRef: React.RefObject<HTMLInputElement>; onAdd: (f: File[]) => void;
      onRemove: (i: number) => void; icon: any; accent: string }) => (
    <div className="flex-1">
      <div
        className={cn("border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors hover:border-opacity-80", accent)}
        onDragOver={e => e.preventDefault()}
        onDrop={e => handleDrop(e, onAdd)}
        onClick={() => inputRef.current?.click()}
      >
        <Icon className="w-10 h-10 mx-auto mb-2 opacity-60 text-slate-500" />
        <p className="font-semibold text-slate-700 text-sm">{label}</p>
        <p className="text-xs text-slate-500 mt-1">PDF, scanned PDF, images, Excel — drag & drop or click</p>
        <input ref={inputRef} type="file" multiple accept=".pdf,.xlsx,.xls,.jpg,.jpeg,.png,.tiff,.tif"
          className="hidden" onChange={e => { if (e.target.files) onAdd(Array.from(e.target.files)); e.target.value = ""; }} />
      </div>
      {files.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {files.map((f, i) => (
            <div key={i} className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2">
              <FileText className="w-4 h-4 text-slate-400 shrink-0" />
              <span className="text-xs text-slate-700 flex-1 truncate">{f.name}</span>
              <span className="text-xs text-slate-400">{(f.size / 1024).toFixed(0)} KB</span>
              <button onClick={e => { e.stopPropagation(); onRemove(i); }} className="p-0.5 hover:text-red-500 text-slate-400"><X className="w-3.5 h-3.5" /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const canContinue = fsFiles.length > 0;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="text-center mb-6">
        <h2 className="text-xl font-bold text-slate-800">Upload Documents</h2>
        <p className="text-sm text-slate-500 mt-1">Upload your Financial Statements and Sales Tax Returns. AI will do the rest automatically.</p>
      </div>

      <div className="flex flex-col md:flex-row gap-4">
        <DropZone label="Financial Statements" files={fsFiles} inputRef={fsRef} onAdd={onFsAdd} onRemove={onFsRemove}
          icon={BarChart2} accent="border-blue-300 bg-blue-50 hover:bg-blue-100" />
        <DropZone label="Sales Tax Returns" files={stFiles} inputRef={stRef} onAdd={onStAdd} onRemove={onStRemove}
          icon={DollarSign} accent="border-green-300 bg-green-50 hover:bg-green-100" />
      </div>

      {!canContinue && (
        <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700">Please upload at least one Financial Statements file to continue.</p>
        </div>
      )}

      <div className="flex items-center gap-3 p-4 bg-slate-50 border border-slate-200 rounded-xl">
        <Info className="w-5 h-5 text-slate-400 shrink-0" />
        <div className="text-xs text-slate-500 space-y-1">
          <p><strong>Supported:</strong> PDF, scanned PDF (OCR applied), Excel, JPG, PNG, TIFF</p>
          <p><strong>No TB or GL required</strong> — AI generates both from your Financial Statements</p>
          <p><strong>Privacy:</strong> Files are processed securely and not stored permanently</p>
        </div>
      </div>

      <div className="flex justify-end">
        <Button disabled={!canContinue} onClick={onContinue} className="gap-2">
          Continue to Variables <ArrowRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

// ─── STEP 1: VARIABLES ─────────────────────────────────────────────────────────

function VariablesStep({ vars, onChange, onContinue, onBack }:
  { vars: VariableMatrix; onChange: (v: VariableMatrix) => void; onContinue: () => void; onBack: () => void }) {

  const [openGroup, setOpenGroup] = useState<string | null>("A");
  const set = (field: keyof VariableMatrix, val: any) => onChange({ ...vars, [field]: val });
  const toggle = useCallback((g: string) => setOpenGroup(prev => g === prev ? null : g), []);

  const Field = VarField;

  const canContinue = vars.entityName.trim() !== "" && vars.yearEnd !== "";

  return (
    <div className="max-w-3xl mx-auto space-y-3">
      <div className="text-center mb-4">
        <h2 className="text-xl font-bold text-slate-800">Engagement Variables</h2>
        <p className="text-sm text-slate-500 mt-1">Review and confirm engagement variables. AI will pre-fill these from uploaded documents.</p>
      </div>

      {/* A. Engagement Profile */}
      <VarGroupPanel id="A" label="A. Engagement Profile" icon={Briefcase} color="bg-blue-50 border-blue-200" openGroup={openGroup} onToggle={toggle}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Engagement Type *">
            <Select value={vars.engagementType} onValueChange={v => set("engagementType", v)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["Statutory Audit","Review Engagement","Agreed Upon Procedures","Compilation"].map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Year End *">
            <DatePickerField value={vars.yearEnd} onChange={v => set("yearEnd", v)} placeholder="Select year end" />
          </Field>
          <Field label="Period From">
            <DatePickerField value={vars.periodStart} onChange={v => set("periodStart", v)} placeholder="Period start" />
          </Field>
          <Field label="Period To">
            <DatePickerField value={vars.periodEnd} onChange={v => set("periodEnd", v)} placeholder="Period end" />
          </Field>
          <Field label="Engagement Partner">
            <Input value={vars.engagementPartner} onChange={e => set("engagementPartner", e.target.value)} className="h-8 text-xs" placeholder="Partner name" maxLength={100} />
          </Field>
          <Field label="Preparer / Senior">
            <Input value={vars.preparer} onChange={e => set("preparer", e.target.value)} className="h-8 text-xs" placeholder="Preparer name" maxLength={100} />
          </Field>
          <Field label="Reviewer / Manager">
            <Input value={vars.reviewer} onChange={e => set("reviewer", e.target.value)} className="h-8 text-xs" placeholder="Reviewer name" maxLength={100} />
          </Field>
          <Field label="Approver / Partner">
            <Input value={vars.approver} onChange={e => set("approver", e.target.value)} className="h-8 text-xs" placeholder="Approver name" maxLength={100} />
          </Field>
        </div>
        <div className="mt-3 space-y-0">
          <YesNoToggle label="First Year Audit" value={vars.firstYearAudit} onChange={v => set("firstYearAudit", v)} hint="ISA 510 applies" />
          <YesNoToggle label="Recurring Engagement" value={vars.recurringEngagement} onChange={v => set("recurringEngagement", v)} hint="ISQM 1 continuance" />
          <YesNoToggle label="Group Audit" value={vars.groupAudit} onChange={v => set("groupAudit", v)} hint="ISA 600 applies" />
          <YesNoToggle label="EQCR Required" value={vars.eqcrRequired} onChange={v => set("eqcrRequired", v)} hint="ISQM 2 — for PIE or complex engagements" />
        </div>
      </VarGroupPanel>

      {/* B. Entity Profile */}
      <VarGroupPanel id="B" label="B. Entity Profile" icon={Building2} color="bg-violet-50 border-violet-200" openGroup={openGroup} onToggle={toggle}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Entity Name *" span>
            <Input value={vars.entityName} onChange={e => set("entityName", e.target.value)} className="h-8 text-xs truncate" placeholder="Company name" maxLength={200} />
          </Field>
          <Field label="Legal Form">
            <Select value={vars.legalForm} onValueChange={v => set("legalForm", v)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["Private Limited Company","Public Limited Company","SMC-Private Limited","LLP","Partnership","AOP","Sole Proprietor","NGO/NPO","Trust"].map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Incorporation Status">
            <Select value={vars.incorporationStatus} onValueChange={v => set("incorporationStatus", v)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["SECP Registered","Unregistered","Under Incorporation"].map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Industry">
            <Select value={vars.industry} onValueChange={v => set("industry", v)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["Manufacturing / Trading","Services","Financial Services","NGO / NPO","Real Estate","Textile","Construction","Healthcare","Education","Other"].map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="NTN">
            <Input value={vars.ntn} onChange={e => set("ntn", e.target.value)} className="h-8 text-xs" placeholder="7-digit NTN" maxLength={20} />
          </Field>
          <Field label="STRN (Sales Tax Reg. No.)">
            <Input value={vars.strn} onChange={e => set("strn", e.target.value)} className="h-8 text-xs" placeholder="STRN / GST No." maxLength={30} />
          </Field>
          <Field label="Listed Status">
            <Select value={vars.listedStatus} onValueChange={v => set("listedStatus", v)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["Listed (PSX)","Unlisted"].map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="No. of Locations">
            <Input type="number" min={1} value={vars.numberOfLocations} onChange={e => set("numberOfLocations", Number(e.target.value))} className="h-8 text-xs" />
          </Field>
        </div>
        <div className="mt-3 space-y-0">
          <YesNoToggle label="Public Interest Entity (PIE)" value={vars.pie} onChange={v => set("pie", v)} hint="Listed / regulated / financial sector" />
          <YesNoToggle label="Branch Operations" value={vars.branchOperations} onChange={v => set("branchOperations", v)} />
          <YesNoToggle label="Foreign Operations" value={vars.foreignOperations} onChange={v => set("foreignOperations", v)} hint="ISA 600 — component auditor may apply" />
          <YesNoToggle label="Related Parties Exist" value={vars.relatedPartiesExist} onChange={v => set("relatedPartiesExist", v)} hint="ISA 550, IAS 24" />
        </div>
      </VarGroupPanel>

      {/* C. Financial Reporting */}
      <VarGroupPanel id="C" label="C. Financial Reporting" icon={BookOpen} color="bg-green-50 border-green-200" openGroup={openGroup} onToggle={toggle}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Reporting Framework">
            <Select value={vars.framework} onValueChange={v => set("framework", v)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["IFRS","IFRS for SMEs","Local GAAP / Companies Act"].map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Functional Currency">
            <Select value={vars.currency} onValueChange={v => set("currency", v)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["PKR","USD","GBP","AED","EUR"].map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Accounting Software" span>
            <Input value={vars.accountingSoftware} onChange={e => set("accountingSoftware", e.target.value)} className="h-8 text-xs" placeholder="e.g. SAP, Oracle, QuickBooks, Excel, Manual" maxLength={100} />
          </Field>
        </div>
        <div className="mt-3 space-y-0">
          <YesNoToggle label="Books Maintained" value={vars.booksMaintained} onChange={v => set("booksMaintained", v)} hint="Are proper books of account maintained?" />
          <YesNoToggle label="Trial Balance Available" value={vars.tbAvailable} onChange={v => set("tbAvailable", v)} hint="If No — AI will generate TB from FS" />
          <YesNoToggle label="General Ledger Available" value={vars.glAvailable} onChange={v => set("glAvailable", v)} hint="If No — AI will reconstruct GL" />
          <YesNoToggle label="Prior Year FS Available" value={vars.priorYearFsAvailable} onChange={v => set("priorYearFsAvailable", v)} hint="ISA 510 — opening balances" />
          <YesNoToggle label="Audit Adjustments Expected" value={vars.auditAdjustmentsExpected} onChange={v => set("auditAdjustmentsExpected", v)} hint="ISA 450" />
        </div>
      </VarGroupPanel>

      {/* D. Tax & Regulatory */}
      <VarGroupPanel id="D" label="D. Tax & Regulatory" icon={DollarSign} color="bg-yellow-50 border-yellow-200" openGroup={openGroup} onToggle={toggle}>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <Field label="Provincial Sales Tax">
            <Select value={vars.provincialSalesTax} onValueChange={v => set("provincialSalesTax", v)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["None","PRA (Punjab)","SRB (Sindh)","KPRA (KPK)","BRA (Balochistan)"].map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <div className="space-y-0">
          <YesNoToggle label="Income Tax Applicable" value={vars.incomeTaxApplicable} onChange={v => set("incomeTaxApplicable", v)} hint="ITO 2001" />
          <YesNoToggle label="Sales Tax Applicable (Federal)" value={vars.salesTaxApplicable} onChange={v => set("salesTaxApplicable", v)} hint="STA 1990 — 17% standard rate" />
          <YesNoToggle label="Federal Excise Duty (FED)" value={vars.fedApplicable} onChange={v => set("fedApplicable", v)} hint="FED Act 2005" />
          <YesNoToggle label="Withholding Tax (WHT)" value={vars.whtApplicable} onChange={v => set("whtApplicable", v)} hint="ITO 2001 Sec 148/149/153" />
          <YesNoToggle label="Deferred Tax Applicable" value={vars.deferredTaxApplicable} onChange={v => set("deferredTaxApplicable", v)} hint="IAS 12" />
          <YesNoToggle label="Tax Audit Exposure" value={vars.taxAuditExposure} onChange={v => set("taxAuditExposure", v)} hint="Prior FBR notices or pending assessments" />
        </div>
      </VarGroupPanel>

      {/* E. FS Components */}
      <VarGroupPanel id="E" label="E. Financial Statement Components" icon={Layers} color="bg-orange-50 border-orange-200" openGroup={openGroup} onToggle={toggle}>
        <div className="space-y-3">
          <p className="text-xs font-medium text-slate-600 uppercase tracking-wide">Assets</p>
          <div className="grid grid-cols-2 gap-0">
            {([
              ["hasCashBank","Cash & Bank","ISA 505"],["hasReceivables","Receivables","ISA 330"],
              ["hasInventory","Inventory","ISA 501"],["hasFixedAssets","Fixed Assets","IAS 16"],
              ["hasIntangibles","Intangible Assets","IAS 38"],["hasInvestments","Investments","IFRS 9"],
              ["hasLoansAdvances","Loans & Advances","ISA 540"],
            ] as [keyof VariableMatrix, string, string][]).map(([k, l, s]) => (
              <YesNoToggle key={k} label={l} value={vars[k] as boolean} onChange={v => set(k, v)} hint={s} />
            ))}
          </div>
          <Separator />
          <p className="text-xs font-medium text-slate-600 uppercase tracking-wide">Liabilities</p>
          <div className="grid grid-cols-2 gap-0">
            {([
              ["hasPayables","Trade Payables","ISA 330"],["hasBorrowings","Borrowings","ISA 540"],
              ["hasLeaseLiabilities","Lease Liabilities","IFRS 16"],["hasProvisions","Provisions","IAS 37"],
              ["hasContingentLiabilities","Contingent Liabilities","ISA 501"],
            ] as [keyof VariableMatrix, string, string][]).map(([k, l, s]) => (
              <YesNoToggle key={k} label={l} value={vars[k] as boolean} onChange={v => set(k, v)} hint={s} />
            ))}
          </div>
          <Separator />
          <p className="text-xs font-medium text-slate-600 uppercase tracking-wide">Equity & Income Statement</p>
          <div className="grid grid-cols-2 gap-0">
            {([
              ["hasShareCapital","Share Capital","Companies Act"],["hasReserves","Reserves","IAS 1"],
              ["hasRetainedEarnings","Retained Earnings","IAS 1"],["hasMultipleRevenue","Multiple Revenue Streams","IFRS 15"],
              ["hasCostOfSales","Cost of Sales","ISA 330"],["hasOperatingExpenses","Operating Expenses","ISA 330"],
              ["hasFinanceCost","Finance Cost","IAS 23"],["hasOtherIncome","Other Income","ISA 520"],
            ] as [keyof VariableMatrix, string, string][]).map(([k, l, s]) => (
              <YesNoToggle key={k} label={l} value={vars[k] as boolean} onChange={v => set(k, v)} hint={s} />
            ))}
          </div>
        </div>
      </VarGroupPanel>

      {/* F. Risk Assessment */}
      <VarGroupPanel id="F" label="F. Risk Assessment" icon={Shield} color="bg-red-50 border-red-200" openGroup={openGroup} onToggle={toggle}>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <Field label="Internal Control Strength" span>
            <Select value={vars.internalControlStrength} onValueChange={v => set("internalControlStrength", v)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["Strong","Moderate","Weak"].map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <div className="space-y-0">
          <YesNoToggle label="Fraud Risk Indicators" value={vars.fraudRiskIndicators} onChange={v => set("fraudRiskIndicators", v)} hint="ISA 240 — management override, revenue recognition" />
          <YesNoToggle label="Going Concern Issue" value={vars.goingConcernIssue} onChange={v => set("goingConcernIssue", v)} hint="ISA 570 — doubt about entity's ability to continue" />
          <YesNoToggle label="Significant Estimates" value={vars.significantEstimates} onChange={v => set("significantEstimates", v)} hint="ISA 540 — fair value, provisions, impairment" />
          <YesNoToggle label="Complex Transactions" value={vars.complexTransactions} onChange={v => set("complexTransactions", v)} hint="ISA 315 — unusual or one-off transactions" />
          <YesNoToggle label="Related Party Risk" value={vars.relatedPartyRisk} onChange={v => set("relatedPartyRisk", v)} hint="ISA 550 — arm's length concerns" />
          <YesNoToggle label="Revenue Recognition Risk" value={vars.revenueRecognitionRisk} onChange={v => set("revenueRecognitionRisk", v)} hint="ISA 240, IFRS 15" />
          <YesNoToggle label="IT System Reliance" value={vars.itSystemReliance} onChange={v => set("itSystemReliance", v)} hint="ISA 315 — IT general controls" />
          <YesNoToggle label="Manual Accounting" value={vars.manualAccounting} onChange={v => set("manualAccounting", v)} hint="ISA 315 — higher error risk" />
        </div>
      </VarGroupPanel>

      {/* G. Audit Approach */}
      <VarGroupPanel id="G" label="G. Audit Approach" icon={Target} color="bg-cyan-50 border-cyan-200" openGroup={openGroup} onToggle={toggle}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Audit Approach">
            <Select value={vars.auditApproach} onValueChange={v => set("auditApproach", v)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["Substantive Only","Controls + Substantive"].map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Sampling Method">
            <Select value={vars.samplingMethod} onValueChange={v => set("samplingMethod", v)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["Judgmental","Random","Systematic (Interval)"].map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Materiality Basis">
            <Select value={vars.materialityBasis} onValueChange={v => set("materialityBasis", v)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["Revenue","Total Assets","Net Profit","Equity"].map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Performance Materiality %">
            <Input type="number" min={50} max={90} value={vars.performanceMaterialityPct} onChange={e => set("performanceMaterialityPct", Number(e.target.value))} className="h-8 text-xs" />
          </Field>
        </div>
        <div className="mt-3 space-y-0">
          <YesNoToggle label="Use of Experts Required" value={vars.useOfExperts} onChange={v => set("useOfExperts", v)} hint="ISA 620" />
          <YesNoToggle label="External Confirmations Required" value={vars.externalConfirmations} onChange={v => set("externalConfirmations", v)} hint="ISA 505" />
        </div>
      </VarGroupPanel>

      {/* H. Sales Tax Data */}
      <VarGroupPanel id="H" label="H. Sales Tax Data" icon={Hash} color="bg-pink-50 border-pink-200" openGroup={openGroup} onToggle={toggle}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="ST Period From">
            <DatePickerField value={vars.stPeriodFrom} onChange={v => set("stPeriodFrom", v)} placeholder="ST period start" />
          </Field>
          <Field label="ST Period To">
            <DatePickerField value={vars.stPeriodTo} onChange={v => set("stPeriodTo", v)} placeholder="ST period end" />
          </Field>
          <Field label="Output Tax (PKR)">
            <Input type="number" value={vars.outputTax || ""} onChange={e => set("outputTax", Number(e.target.value))} className="h-8 text-xs" placeholder="0" />
          </Field>
          <Field label="Input Tax (PKR)">
            <Input type="number" value={vars.inputTax || ""} onChange={e => set("inputTax", Number(e.target.value))} className="h-8 text-xs" placeholder="0" />
          </Field>
          <Field label="Adjustments (PKR)">
            <Input type="number" value={vars.stAdjustments || ""} onChange={e => set("stAdjustments", Number(e.target.value))} className="h-8 text-xs" placeholder="0" />
          </Field>
        </div>
        <div className="mt-3">
          <YesNoToggle label="Sales Tax Refund Claimed" value={vars.refundClaimed} onChange={v => set("refundClaimed", v)} />
        </div>
      </VarGroupPanel>

      {/* I. Document Availability */}
      <VarGroupPanel id="I" label="I. Document Availability" icon={FileCheck} color="bg-teal-50 border-teal-200" openGroup={openGroup} onToggle={toggle}>
        <div className="space-y-0">
          <YesNoToggle label="Bank Statements Available" value={vars.bankStatementsAvailable} onChange={v => set("bankStatementsAvailable", v)} />
          <YesNoToggle label="Invoices / Tax Invoices Available" value={vars.invoicesAvailable} onChange={v => set("invoicesAvailable", v)} />
          <YesNoToggle label="Contracts / Agreements Available" value={vars.contractsAvailable} onChange={v => set("contractsAvailable", v)} />
          <YesNoToggle label="Prior Year Working Papers Available" value={vars.priorYearWPsAvailable} onChange={v => set("priorYearWPsAvailable", v)} />
        </div>
      </VarGroupPanel>

      {/* J. Output Control */}
      <VarGroupPanel id="J" label="J. Output Control" icon={FileOutput} color="bg-slate-50 border-slate-300" openGroup={openGroup} onToggle={toggle}>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <Field label="Detail Level">
            <Select value={vars.detailLevel} onValueChange={v => set("detailLevel", v)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["Summary","Detailed","Full Audit File"].map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Export Format">
            <Select value={vars.outputFormat} onValueChange={v => set("outputFormat", v)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["All (Word + Excel + PDF)","Word Only","Excel Only","PDF Only"].map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <div className="space-y-0">
          <YesNoToggle label="Generate Trial Balance" value={vars.generateTB} onChange={v => set("generateTB", v)} />
          <YesNoToggle label="Generate General Ledger" value={vars.generateGL} onChange={v => set("generateGL", v)} />
          <YesNoToggle label="Generate Working Papers" value={vars.generateWPs} onChange={v => set("generateWPs", v)} />
        </div>
      </VarGroupPanel>

      {!canContinue && (
        <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700">Entity Name and Year End are required before running AI Extraction.</p>
        </div>
      )}

      <div className="flex justify-between pt-2">
        <Button variant="outline" onClick={onBack} className="gap-2"><ChevronLeft className="w-4 h-4" /> Back</Button>
        <Button disabled={!canContinue} onClick={onContinue} className="gap-2">
          Run AI Extraction <Sparkles className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

// ─── STEP 2: EXTRACTION PREVIEW ────────────────────────────────────────────────

function ExtractionStep({ extractedData, vars, onContinue, onBack, onRerun }:
  { extractedData: ExtractedData | null; vars: VariableMatrix;
    onContinue: () => void; onBack: () => void; onRerun: () => void }) {

  const [openSection, setOpenSection] = useState<string>("entity");

  if (!extractedData) {
    return (
      <div className="max-w-3xl mx-auto text-center py-16">
        <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4 text-blue-500" />
        <p className="text-slate-600 font-medium">Running AI Extraction...</p>
        <p className="text-sm text-slate-400 mt-1">OCR reading files · Extracting financial data · Running analysis</p>
      </div>
    );
  }

  const { entity, financials, taxData, flags, assumptions, missingData, extractionLog, confidenceScores, analysis } = extractedData;

  const SectionToggle = ({ id, label, icon: Icon }: { id: string; label: string; icon: any }) => (
    <button onClick={() => setOpenSection(id === openSection ? "" : id)}
      className={cn("flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
        id === openSection ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200")}>
      <Icon className="w-3.5 h-3.5" />{label}
    </button>
  );

  const DataRow = ({ label, value, source, confidence }: { label: string; value: any; source?: DataSource; confidence?: number }) => {
    const displayValue = value == null ? null
      : typeof value === "object" ? JSON.stringify(value)
      : String(value);
    return (
      <div className="flex items-start gap-3 py-1.5 border-b border-slate-50 last:border-0">
        <span className="text-xs text-slate-500 w-36 shrink-0">{label}</span>
        <span className="text-xs text-slate-800 flex-1 font-medium">{displayValue ?? <span className="text-red-400 italic">Not found</span>}</span>
        {source && <SourceBadge source={source} />}
        {confidence !== undefined && <ConfidenceBadge pct={confidence} />}
      </div>
    );
  };

  const mat = analysis?.materiality || {};
  const risks = analysis?.risk_assessment || {};

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800">AI Extraction Preview</h2>
          <p className="text-sm text-slate-500 mt-0.5">Review what AI extracted. All data is tagged by confidence level.</p>
        </div>
        <Button variant="outline" size="sm" onClick={onRerun} className="gap-2"><RefreshCw className="w-3.5 h-3.5" /> Re-extract</Button>
      </div>

      {/* Navigation tabs */}
      <div className="flex flex-wrap gap-2">
        <SectionToggle id="entity" label="Entity Info" icon={Building2} />
        <SectionToggle id="financials" label="Financials" icon={BarChart2} />
        <SectionToggle id="tax" label="Tax Data" icon={DollarSign} />
        <SectionToggle id="materiality" label="Materiality" icon={Scale} />
        <SectionToggle id="risks" label="Risk Assessment" icon={Shield} />
        <SectionToggle id="flags" label="Flags & Assumptions" icon={Flag} />
        <SectionToggle id="log" label="Extraction Log" icon={Clipboard} />
      </div>

      {/* Entity Info */}
      {openSection === "entity" && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1">
          <SectionHeader icon={Building2} title="Entity Information" color="bg-blue-50 border-blue-200" />
          <DataRow label="Entity Name" value={entity?.entity_name || vars.entityName} source="Extracted" confidence={confidenceScores?.entity_name || 90} />
          <DataRow label="Legal Form" value={entity?.legal_form || vars.legalForm} source="Extracted" />
          <DataRow label="NTN" value={entity?.ntn || vars.ntn} source="Extracted" />
          <DataRow label="STRN" value={entity?.strn || vars.strn} source="Extracted" />
          <DataRow label="Financial Year" value={entity?.financial_year || vars.yearEnd} source="Extracted" />
          <DataRow label="Engagement Type" value={entity?.engagement_type || vars.engagementType} source="Extracted" />
          <DataRow label="Framework" value={entity?.reporting_framework || vars.framework} source="Extracted" />
          <DataRow label="Industry" value={entity?.industry || vars.industry} source="Extracted" />
          <DataRow label="Registered Address" value={entity?.registered_address} source="Extracted" />
          <DataRow label="Bankers" value={Array.isArray(entity?.bankers) ? entity.bankers.join(", ") : entity?.bankers} source="Extracted" />
          <DataRow label="Directors" value={Array.isArray(entity?.directors) ? entity.directors.join(", ") : entity?.directors} source="Extracted" />
          <DataRow label="Auditors" value={entity?.auditors} source="Extracted" />
        </div>
      )}

      {/* Financials */}
      {openSection === "financials" && (
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <SectionHeader icon={BarChart2} title="Extracted Financial Data" color="bg-violet-50 border-violet-200" />
          <div className="grid grid-cols-2 gap-x-6">
            <div>
              <p className="text-xs font-semibold text-slate-500 mb-2 uppercase">Balance Sheet</p>
              {[
                ["Total Assets", financials?.total_assets],["Fixed Assets", financials?.fixed_assets],
                ["Inventory", financials?.inventory],["Trade Receivables", financials?.trade_receivables],
                ["Cash & Bank", financials?.cash_and_bank],["Total Liabilities", financials?.total_liabilities],
                ["Trade Payables", financials?.trade_payables],["Borrowings", financials?.borrowings],
                ["Equity", financials?.equity],["Share Capital", financials?.share_capital],
                ["Retained Earnings", financials?.retained_earnings],
              ].map(([l, v]) => (
                <DataRow key={l as string} label={l as string} value={v ? fmtPKR(Number(v)) : null} source={v ? "Extracted" : "Estimated"} />
              ))}
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 mb-2 uppercase">Income Statement</p>
              {[
                ["Revenue", financials?.revenue],["Gross Profit", financials?.gross_profit],
                ["Operating Expenses", financials?.operating_expenses],["Finance Cost", financials?.finance_cost],
                ["Net Profit", financials?.net_profit],["Tax Expense", financials?.tax_expense],
                ["Prior Year Revenue", financials?.prior_year_revenue],["Prior Year Net Profit", financials?.prior_year_net_profit],
              ].map(([l, v]) => (
                <DataRow key={l as string} label={l as string} value={v ? fmtPKR(Number(v)) : null} source={v ? "Extracted" : "Estimated"} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tax Data */}
      {openSection === "tax" && (
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <SectionHeader icon={DollarSign} title="Tax Data" color="bg-yellow-50 border-yellow-200" />
          <DataRow label="Advance Tax (Sec 147)" value={taxData?.advance_tax ? fmtPKR(Number(taxData.advance_tax)) : null} source="Extracted" />
          <DataRow label="WHT Deducted" value={taxData?.wht_deducted ? fmtPKR(Number(taxData.wht_deducted)) : null} source="Extracted" />
          <DataRow label="Output Tax (GST)" value={taxData?.output_tax ? fmtPKR(Number(taxData.output_tax)) : null} source="Extracted" />
          <DataRow label="Input Tax (GST)" value={taxData?.input_tax ? fmtPKR(Number(taxData.input_tax)) : null} source="Extracted" />
          <DataRow label="Net Tax Payable" value={taxData?.net_tax_payable ? fmtPKR(Number(taxData.net_tax_payable)) : null} source="Derived" />
          <DataRow label="Deferred Tax" value={taxData?.deferred_tax ? fmtPKR(Number(taxData.deferred_tax)) : null} source="Extracted" />
          <DataRow label="Current Tax Provision" value={taxData?.current_tax_provision ? fmtPKR(Number(taxData.current_tax_provision)) : null} source="Extracted" />
          <DataRow label="Effective Tax Rate" value={analysis?.tax_analysis?.effective_tax_rate ? `${(analysis.tax_analysis.effective_tax_rate * 100).toFixed(1)}%` : null} source="Derived" />
        </div>
      )}

      {/* Materiality */}
      {openSection === "materiality" && (
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <SectionHeader icon={Scale} title="Materiality (ISA 320)" color="bg-green-50 border-green-200" />
          <DataRow label="Basis" value={mat?.basis} source="Derived" />
          <DataRow label="Benchmark Amount" value={mat?.benchmark_amount ? fmtPKR(Number(mat.benchmark_amount)) : null} source="Extracted" />
          <DataRow label="Percentage Used" value={mat?.percentage_used ? `${mat.percentage_used}%` : null} source="Derived" />
          <DataRow label="Overall Materiality (OM)" value={mat?.overall_materiality ? fmtPKR(Number(mat.overall_materiality)) : null} source="Derived" confidence={95} />
          <DataRow label="Performance Materiality (PM)" value={mat?.performance_materiality ? fmtPKR(Number(mat.performance_materiality)) : null} source="Derived" confidence={95} />
          <DataRow label="Trivial Threshold" value={mat?.trivial_threshold ? fmtPKR(Number(mat.trivial_threshold)) : null} source="Derived" />
          <DataRow label="Justification" value={mat?.justification} source="Derived" />
        </div>
      )}

      {/* Risk Assessment */}
      {openSection === "risks" && (
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <SectionHeader icon={Shield} title="Risk Assessment (ISA 315)" color="bg-red-50 border-red-200" />
          <DataRow label="Overall Risk" value={risks?.overall_risk} source="Derived" />
          <DataRow label="Inherent Risk" value={risks?.inherent_risk_level} source="Derived" />
          <DataRow label="Control Risk" value={risks?.control_risk_level} source="Derived" />
          {Array.isArray(risks?.significant_risks) && (
            <div className="mt-3">
              <p className="text-xs font-semibold text-slate-600 mb-2">Significant Risks</p>
              <div className="space-y-2">
                {risks.significant_risks.slice(0, 8).map((r: any, i: number) => (
                  <div key={i} className="p-2 bg-red-50 border border-red-100 rounded-lg">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium text-red-800">{r.area || r.risk_area}</span>
                      <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium",
                        r.risk_level === "High" ? "bg-red-200 text-red-800" : r.risk_level === "Medium" ? "bg-amber-200 text-amber-800" : "bg-green-200 text-green-800")}>
                        {r.risk_level || r.level}
                      </span>
                    </div>
                    <p className="text-xs text-red-700">{r.description || r.risk_description}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Flags & Assumptions */}
      {openSection === "flags" && (
        <div className="space-y-4">
          {flags && flags.length > 0 && (
            <div className="bg-white border border-amber-200 rounded-xl p-4">
              <SectionHeader icon={AlertTriangle} title="Flags & Exceptions" color="bg-amber-50 border-amber-200" />
              <div className="space-y-1">
                {flags.map((f, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-amber-800 py-1">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                    <span>{typeof f === "object" ? JSON.stringify(f) : String(f)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {missingData && missingData.length > 0 && (
            <div className="bg-white border border-red-200 rounded-xl p-4">
              <SectionHeader icon={AlertCircle} title="Missing Data" color="bg-red-50 border-red-200" />
              <div className="space-y-1">
                {missingData.map((m, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-red-700 py-1">
                    <X className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
                    <span>{typeof m === "object" ? JSON.stringify(m) : String(m)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {assumptions && assumptions.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <SectionHeader icon={Info} title="AI Assumptions Register" color="bg-slate-50 border-slate-200" />
              <div className="space-y-1">
                {assumptions.map((a, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-slate-700 py-1">
                    <Sparkles className="w-3.5 h-3.5 text-purple-400 shrink-0 mt-0.5" />
                    <span>{typeof a === "object" ? JSON.stringify(a) : String(a)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Extraction Log */}
      {openSection === "log" && (
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <SectionHeader icon={Clipboard} title="Extraction Log (AI Process)" color="bg-slate-50 border-slate-200" />
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {(extractionLog || []).map((log, i) => (
              <div key={i} className="flex items-start gap-2 text-xs text-slate-600 py-0.5">
                <Check className="w-3 h-3 text-green-500 shrink-0 mt-0.5" />
                <span>{log}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-between pt-2">
        <Button variant="outline" onClick={onBack} className="gap-2"><ChevronLeft className="w-4 h-4" /> Back</Button>
        <Button onClick={onContinue} className="gap-2">Generate Trial Balance <ArrowRight className="w-4 h-4" /></Button>
      </div>
    </div>
  );
}

// ─── STEP 3: TRIAL BALANCE ─────────────────────────────────────────────────────

function EditableCell({ value, onChange, type = "text", align = "left" }: {
  value: string | number; onChange: (v: any) => void; type?: "text" | "number"; align?: "left" | "right";
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setDraft(String(value)); }, [value]);
  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  const committedRef = useRef(false);
  const commit = () => {
    if (committedRef.current) return;
    committedRef.current = true;
    setEditing(false);
    const finalVal = type === "number" ? Number(draft) || 0 : draft;
    if (finalVal !== value) onChange(finalVal);
  };

  useEffect(() => { if (editing) committedRef.current = false; }, [editing]);

  if (editing) {
    return (
      <input
        ref={inputRef}
        type={type}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); commit(); } if (e.key === "Escape") { setDraft(String(value)); setEditing(false); } }}
        className={cn("w-full h-6 px-1.5 text-xs bg-white border border-blue-300 rounded outline-none ring-2 ring-blue-100 font-mono", align === "right" && "text-right")}
      />
    );
  }

  return (
    <span
      onClick={() => setEditing(true)}
      className={cn("block w-full px-1.5 py-0.5 rounded cursor-text hover:bg-blue-50 hover:ring-1 hover:ring-blue-200 transition-all",
        type === "number" ? "font-mono" : "font-medium text-slate-800",
        align === "right" && "text-right")}
      title="Click to edit"
    >
      {type === "number" ? (Number(value) || 0).toLocaleString("en-PK") : value}
    </span>
  );
}

function TrialBalanceStep({ accounts, summary, onContinue, onBack, onRegenerate, onAccountChange }:
  { accounts: TBAccount[]; summary: any; onContinue: () => void; onBack: () => void;
    onRegenerate: () => void; onAccountChange: (accounts: TBAccount[]) => void }) {

  const [searchQ, setSearchQ] = useState("");
  const [filterClass, setFilterClass] = useState("All");

  const filtered = useMemo(() => {
    return accounts.filter(a => {
      const q = searchQ.toLowerCase();
      const matchQ = !q || a.account_name.toLowerCase().includes(q) || a.account_code.toLowerCase().includes(q);
      const matchC = filterClass === "All" || a.classification === filterClass;
      return matchQ && matchC;
    });
  }, [accounts, searchQ, filterClass]);

  const classes = useMemo(() => ["All", ...Array.from(new Set(accounts.map(a => a.classification).filter(Boolean)))], [accounts]);

  const updateAccount = (idx: number, field: keyof TBAccount, val: any) => {
    const updated = [...accounts];
    const realIdx = accounts.indexOf(filtered[idx]);
    if (realIdx >= 0) {
      (updated[realIdx] as any)[field] = val;
      if (field === "debit_total" || field === "credit_total") {
        const dr = Number(updated[realIdx].debit_total);
        const cr = Number(updated[realIdx].credit_total);
        updated[realIdx].balance_dr = dr > cr ? dr - cr : 0;
        updated[realIdx].balance_cr = cr > dr ? cr - dr : 0;
        updated[realIdx].source = "User-confirmed";
      }
      onAccountChange(updated);
    }
  };

  const totalDr = accounts.reduce((s, a) => s + (a.balance_dr || 0), 0);
  const totalCr = accounts.reduce((s, a) => s + (a.balance_cr || 0), 0);
  const isBalanced = Math.abs(totalDr - totalCr) < 1;

  if (accounts.length === 0) {
    return (
      <div className="max-w-3xl mx-auto text-center py-16">
        <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4 text-blue-500" />
        <p className="text-slate-600 font-medium">Generating Trial Balance...</p>
        <p className="text-sm text-slate-400 mt-1">AI is building a reconciled trial balance from your financial data</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Trial Balance</h2>
          <p className="text-sm text-slate-500 mt-0.5">{accounts.length} accounts · Click any cell to edit · Changes auto-save</p>
        </div>
        <div className="flex items-center gap-2">
          <div className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border",
            isBalanced ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-700 border-red-200")}>
            {isBalanced ? <Check className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
            {isBalanced ? "Balanced" : "Out of Balance"}
          </div>
          <Button variant="outline" size="sm" onClick={onRegenerate} className="gap-1.5"><RefreshCw className="w-3.5 h-3.5" /> Regenerate</Button>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Input placeholder="Search accounts..." value={searchQ} onChange={e => setSearchQ(e.target.value)} className="h-8 text-xs max-w-48" />
        <Select value={filterClass} onValueChange={setFilterClass}>
          <SelectTrigger className="h-8 text-xs w-44"><SelectValue /></SelectTrigger>
          <SelectContent>{classes.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
        </Select>
        <div className="flex items-center gap-3 ml-auto text-xs text-slate-500">
          <span>Total Dr: <strong className="text-slate-800">{fmtPKR(totalDr)}</strong></span>
          <span>Total Cr: <strong className="text-slate-800">{fmtPKR(totalCr)}</strong></span>
          {!isBalanced && <span className="text-red-600 font-medium">Diff: {fmtPKR(Math.abs(totalDr - totalCr))}</span>}
        </div>
      </div>

      <div className="border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-3 py-2 font-semibold text-slate-600 w-16">Code</th>
                <th className="text-left px-3 py-2 font-semibold text-slate-600">Account Name</th>
                <th className="text-left px-3 py-2 font-semibold text-slate-600 w-28">Classification</th>
                <th className="text-left px-3 py-2 font-semibold text-slate-600 w-20">Source</th>
                <th className="text-right px-3 py-2 font-semibold text-slate-600 w-28">Debit Total</th>
                <th className="text-right px-3 py-2 font-semibold text-slate-600 w-28">Credit Total</th>
                <th className="text-right px-3 py-2 font-semibold text-slate-600 w-28">Balance Dr</th>
                <th className="text-right px-3 py-2 font-semibold text-slate-600 w-28">Balance Cr</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a, i) => (
                <tr key={i} className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                  <td className="px-3 py-1.5 font-mono text-slate-600">{a.account_code}</td>
                  <td className="px-3 py-1.5">
                    <EditableCell value={a.account_name} onChange={v => updateAccount(i, "account_name", v)} />
                  </td>
                  <td className="px-3 py-1.5 text-slate-500">{a.classification}</td>
                  <td className="px-3 py-1.5"><SourceBadge source={a.source || "Estimated"} /></td>
                  <td className="px-3 py-1.5 text-right">
                    <EditableCell value={a.debit_total} onChange={v => updateAccount(i, "debit_total", v)} type="number" align="right" />
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <EditableCell value={a.credit_total} onChange={v => updateAccount(i, "credit_total", v)} type="number" align="right" />
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    {a.balance_dr > 0 ? <span className="font-semibold text-slate-800 font-mono">{(a.balance_dr).toLocaleString("en-PK")}</span> : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    {a.balance_cr > 0 ? <span className="font-semibold text-slate-800 font-mono">{(a.balance_cr).toLocaleString("en-PK")}</span> : <span className="text-slate-300">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 font-semibold border-t-2 border-slate-300">
                <td colSpan={6} className="px-3 py-2 text-slate-700 text-xs">GRAND TOTAL</td>
                <td className="px-3 py-2 text-right text-xs font-mono">{totalDr.toLocaleString("en-PK")}</td>
                <td className="px-3 py-2 text-right text-xs font-mono">{totalCr.toLocaleString("en-PK")}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Accounts", value: accounts.length, icon: Hash },
          { label: "GL Entries", value: summary?.gl_entries || 0, icon: BookOpen },
          { label: "Total Dr Balance", value: fmtPKR(totalDr), icon: TrendingUp },
          { label: "Balanced", value: isBalanced ? "Yes ✓" : "No ✗", icon: Scale, err: !isBalanced },
        ].map((s, i) => (
          <div key={i} className={cn("p-3 rounded-xl border text-center", s.err ? "bg-red-50 border-red-200" : "bg-white border-slate-200")}>
            <s.icon className={cn("w-4 h-4 mx-auto mb-1", s.err ? "text-red-500" : "text-slate-400")} />
            <p className="text-xs text-slate-500">{s.label}</p>
            <p className={cn("text-sm font-bold", s.err ? "text-red-700" : "text-slate-800")}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="flex justify-between pt-2">
        <Button variant="outline" onClick={onBack} className="gap-2"><ChevronLeft className="w-4 h-4" /> Back</Button>
        <Button onClick={onContinue} className="gap-2">Review General Ledger <ArrowRight className="w-4 h-4" /></Button>
      </div>
    </div>
  );
}

// ─── STEP 4: GENERAL LEDGER ────────────────────────────────────────────────────

function GeneralLedgerStep({ glAccounts, glEntries, onContinue, onBack }:
  { glAccounts: GLAccount[]; glEntries: GLEntry[]; onContinue: () => void; onBack: () => void }) {

  const [openAccount, setOpenAccount] = useState<string | null>(null);
  const [searchQ, setSearchQ] = useState("");

  const filteredAccounts = useMemo(() => {
    const q = searchQ.toLowerCase();
    return glAccounts.filter(a => !q || a.account_name.toLowerCase().includes(q) || a.account_code.toLowerCase().includes(q));
  }, [glAccounts, searchQ]);

  if (glAccounts.length === 0 && glEntries.length === 0) {
    return (
      <div className="max-w-3xl mx-auto text-center py-16">
        <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4 text-blue-500" />
        <p className="text-slate-600 font-medium">Building General Ledger...</p>
        <p className="text-sm text-slate-400 mt-1">Reconstructing transaction history from financial data</p>
      </div>
    );
  }

  const sourceAccounts: GLAccount[] = glAccounts.length > 0 ? glAccounts : [];

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h2 className="text-xl font-bold text-slate-800">General Ledger</h2>
          <p className="text-sm text-slate-500 mt-0.5">{glEntries.length} journal entries across {sourceAccounts.length || "all"} accounts</p>
        </div>
        <div className="flex items-center gap-2">
          <SourceBadge source="Estimated" />
          <span className="text-xs text-slate-500">AI-reconstructed from financial data</span>
        </div>
      </div>

      <Input placeholder="Search accounts..." value={searchQ} onChange={e => setSearchQ(e.target.value)} className="h-8 text-xs max-w-64" />

      <div className="space-y-2">
        {(filteredAccounts.length > 0 ? filteredAccounts : glEntries.length > 0 ? [{ account_code: "ALL", account_name: "All Journal Entries", group: "All", type: "All", opening_balance: 0, closing_balance: 0, entries: glEntries, source: "Estimated" }] : []).map((account, ai) => {
          const acctEntries = account.entries?.length > 0 ? account.entries : glEntries.filter(e => e.account_code === account.account_code);
          const isOpen = openAccount === account.account_code;
          const totalDr = acctEntries.reduce((s, e) => s + (e.debit || 0), 0);
          const totalCr = acctEntries.reduce((s, e) => s + (e.credit || 0), 0);

          return (
            <div key={ai} className="border border-slate-200 rounded-xl overflow-hidden">
              <button onClick={() => setOpenAccount(isOpen ? null : account.account_code)}
                className="w-full flex items-center justify-between p-3 bg-white hover:bg-slate-50 text-left transition-colors">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono text-slate-500 w-12">{account.account_code}</span>
                  <span className="text-sm font-semibold text-slate-800">{account.account_name}</span>
                  <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded">{account.type || account.group}</span>
                  {acctEntries.length > 0 && <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded">{acctEntries.length} entries</span>}
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <span className="text-slate-500">Dr: <strong className="text-slate-800">{totalDr.toLocaleString("en-PK")}</strong></span>
                  <span className="text-slate-500">Cr: <strong className="text-slate-800">{totalCr.toLocaleString("en-PK")}</strong></span>
                  <span className="text-slate-500">Closing: <strong className={cn(totalDr >= totalCr ? "text-blue-700" : "text-red-700")}>{Math.abs(totalDr - totalCr).toLocaleString("en-PK")} {totalDr >= totalCr ? "Dr" : "Cr"}</strong></span>
                  {isOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                </div>
              </button>

              {isOpen && acctEntries.length > 0 && (
                <div className="border-t border-slate-100 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-50">
                        <th className="text-left px-3 py-1.5 text-slate-500 font-medium">Date</th>
                        <th className="text-left px-3 py-1.5 text-slate-500 font-medium">Voucher</th>
                        <th className="text-left px-3 py-1.5 text-slate-500 font-medium flex-1">Narration</th>
                        <th className="text-right px-3 py-1.5 text-slate-500 font-medium w-28">Debit</th>
                        <th className="text-right px-3 py-1.5 text-slate-500 font-medium w-28">Credit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {acctEntries.map((e, ei) => (
                        <tr key={ei} className="border-b border-slate-50 hover:bg-slate-50">
                          <td className="px-3 py-1.5 text-slate-600">{e.date}</td>
                          <td className="px-3 py-1.5 font-mono text-slate-500">{e.voucher_no}</td>
                          <td className="px-3 py-1.5 text-slate-700 max-w-sm truncate">{e.narration}</td>
                          <td className="px-3 py-1.5 text-right font-mono">{e.debit > 0 ? e.debit.toLocaleString("en-PK") : "—"}</td>
                          <td className="px-3 py-1.5 text-right font-mono">{e.credit > 0 ? e.credit.toLocaleString("en-PK") : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-50 font-semibold border-t border-slate-200">
                        <td colSpan={3} className="px-3 py-1.5 text-slate-600">Total</td>
                        <td className="px-3 py-1.5 text-right font-mono">{totalDr.toLocaleString("en-PK")}</td>
                        <td className="px-3 py-1.5 text-right font-mono">{totalCr.toLocaleString("en-PK")}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex justify-between pt-2">
        <Button variant="outline" onClick={onBack} className="gap-2"><ChevronLeft className="w-4 h-4" /> Back</Button>
        <Button onClick={onContinue} className="gap-2">Generate Working Papers <ArrowRight className="w-4 h-4" /></Button>
      </div>
    </div>
  );
}

// ─── STEP 5: WORKING PAPERS ────────────────────────────────────────────────────

function WorkingPapersStep({ papers, selectedPapers, vars, onContinue, onBack, onRegenerate,
  onPaperStatusChange, onSelectPaper, onUnselectPaper }:
  { papers: WPDoc[]; selectedPapers: string[]; vars: VariableMatrix;
    onContinue: () => void; onBack: () => void; onRegenerate: () => void;
    onPaperStatusChange: (ref: string, status: "Draft" | "Review" | "Approved") => void;
    onSelectPaper: (code: string) => void; onUnselectPaper: (code: string) => void }) {

  const [openSection, setOpenSection] = useState<string | null>("A");
  const [openPaper, setOpenPaper] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"papers" | "select">("papers");

  if (papers.length === 0) {
    return (
      <div className="max-w-3xl mx-auto text-center py-16">
        <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4 text-blue-500" />
        <p className="text-slate-600 font-medium">Generating Working Papers...</p>
        <p className="text-sm text-slate-400 mt-1">AI is writing ISA-compliant working papers using all extracted data</p>
        <p className="text-xs text-slate-400 mt-1">This may take 2-3 minutes for a full audit file</p>
      </div>
    );
  }

  const papersMap = Object.fromEntries(papers.map(p => [p.ref, p]));
  const approvedCount = papers.filter(p => p.status === "Approved").length;
  const reviewCount = papers.filter(p => p.status === "Review").length;

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Working Papers</h2>
          <p className="text-sm text-slate-500 mt-0.5">{papers.length} papers generated · {approvedCount} approved · {reviewCount} under review</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setViewMode(viewMode === "papers" ? "select" : "papers")} className="gap-1.5">
            {viewMode === "papers" ? <><CheckSquare className="w-3.5 h-3.5" /> Select Papers</> : <><FileText className="w-3.5 h-3.5" /> View Papers</>}
          </Button>
          <Button variant="outline" size="sm" onClick={onRegenerate} className="gap-1.5"><RefreshCw className="w-3.5 h-3.5" /> Regenerate</Button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Total Papers", value: papers.length, icon: FileText },
          { label: "Approved", value: approvedCount, icon: CheckCircle2 },
          { label: "Under Review", value: reviewCount, icon: Eye },
          { label: "Draft", value: papers.length - approvedCount - reviewCount, icon: Edit3 },
        ].map((s, i) => (
          <div key={i} className="p-3 bg-white border border-slate-200 rounded-xl text-center">
            <s.icon className="w-4 h-4 mx-auto mb-1 text-slate-400" />
            <p className="text-xs text-slate-500">{s.label}</p>
            <p className="text-sm font-bold text-slate-800">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Select Papers Mode */}
      {viewMode === "select" && (
        <div className="space-y-3">
          <p className="text-xs text-slate-500">Select which working papers to include in the export. Currently selected: {selectedPapers.length} papers.</p>
          {WP_INDEX_FULL.map((group, gi) => {
            const letter = group.section.split("—")[0].trim().split(" ")[0];
            return (
              <div key={gi} className={cn("border rounded-xl p-3", group.color)}>
                <p className="text-xs font-semibold text-slate-700 mb-2">{group.section}</p>
                <div className="grid grid-cols-2 gap-1">
                  {group.papers.map(p => {
                    const isSelected = selectedPapers.includes(p.code);
                    const isGenerated = !!papersMap[p.code];
                    return (
                      <button key={p.code} onClick={() => isSelected ? onUnselectPaper(p.code) : onSelectPaper(p.code)}
                        className={cn("flex items-center gap-2 p-1.5 rounded-lg text-xs text-left transition-colors",
                          isSelected ? "bg-blue-600 text-white" : "bg-white text-slate-700 hover:bg-slate-50 border border-slate-200")}>
                        {isSelected ? <CheckSquare className="w-3.5 h-3.5 shrink-0" /> : <Square className="w-3.5 h-3.5 shrink-0 text-slate-400" />}
                        <span className="font-mono text-[10px] opacity-70 shrink-0">{p.code}</span>
                        <span className="truncate">{p.title}</span>
                        {isGenerated && <span className="ml-auto shrink-0 w-2 h-2 rounded-full bg-green-400"></span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Papers View Mode */}
      {viewMode === "papers" && (
        <div className="space-y-3">
          {WP_INDEX_FULL.map((group, gi) => {
            const letter = group.section.split("—")[0].trim().split(" ")[0];
            const groupPapers = papers.filter(p => p.ref.startsWith(letter));
            if (groupPapers.length === 0) return null;
            const isOpen = openSection === letter;

            return (
              <div key={gi} className={cn("border rounded-xl overflow-hidden", group.color)}>
                <button onClick={() => setOpenSection(isOpen ? null : letter)}
                  className="w-full flex items-center justify-between p-3 text-left hover:bg-white/30 transition-colors">
                  <div className="flex items-center gap-2">
                    <group.icon className="w-4 h-4 text-slate-600" />
                    <span className="font-semibold text-sm text-slate-800">{group.section}</span>
                    <span className="text-xs text-slate-500 bg-white/60 px-2 py-0.5 rounded-full">{groupPapers.length} papers</span>
                  </div>
                  {isOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                </button>

                {isOpen && (
                  <div className="bg-white border-t border-white/60 divide-y divide-slate-100">
                    {groupPapers.map((wp, wi) => {
                      const isPaperOpen = openPaper === wp.ref;
                      return (
                        <div key={wi}>
                          <button onClick={() => setOpenPaper(isPaperOpen ? null : wp.ref)}
                            className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 transition-colors">
                            <div className="flex items-center gap-3">
                              <span className="text-xs font-mono font-semibold text-slate-500 w-10">{wp.ref}</span>
                              <span className="text-sm font-medium text-slate-800">{wp.title}</span>
                              <StatusBadge status={wp.status || "Draft"} />
                              {wp.isa_references?.slice(0,2).map((isa, j) => (
                                <span key={j} className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded hidden md:inline">{isa}</span>
                              ))}
                            </div>
                            <div className="flex items-center gap-2">
                              <Select value={wp.status || "Draft"} onValueChange={v => onPaperStatusChange(wp.ref, v as any)}>
                                <SelectTrigger className="h-6 text-xs w-24 border-0 bg-transparent p-0 focus:ring-0" onClick={e => e.stopPropagation()}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent><SelectItem value="Draft">Draft</SelectItem><SelectItem value="Review">Review</SelectItem><SelectItem value="Approved">Approved</SelectItem></SelectContent>
                              </Select>
                              {isPaperOpen ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
                            </div>
                          </button>

                          {isPaperOpen && (
                            <div className="px-4 pb-4 pt-2 bg-slate-50/50 border-t border-slate-100">
                              {/* Header */}
                              <div className="grid grid-cols-3 gap-4 mb-4">
                                <div className="bg-white rounded-lg p-3 border border-slate-100">
                                  <p className="text-[10px] text-slate-400 uppercase font-medium mb-1">Objective</p>
                                  <p className="text-xs text-slate-700">{wp.objective}</p>
                                </div>
                                <div className="bg-white rounded-lg p-3 border border-slate-100">
                                  <p className="text-[10px] text-slate-400 uppercase font-medium mb-1">Scope</p>
                                  <p className="text-xs text-slate-700">{wp.scope}</p>
                                </div>
                                <div className="bg-white rounded-lg p-3 border border-slate-100">
                                  <p className="text-[10px] text-slate-400 uppercase font-medium mb-1">Sign-off</p>
                                  <div className="space-y-0.5 text-xs text-slate-600">
                                    <p>Prepared: <strong>{wp.prepared_by || vars.preparer || "—"}</strong></p>
                                    <p>Reviewed: <strong>{wp.reviewed_by || vars.reviewer || "—"}</strong></p>
                                    <p>Approved: <strong>{wp.approved_by || vars.approver || "—"}</strong></p>
                                    <p>Date: <strong>{wp.prepared_date || new Date().toLocaleDateString("en-PK")}</strong></p>
                                  </div>
                                </div>
                              </div>

                              {/* Procedures */}
                              {wp.procedures && wp.procedures.length > 0 && (
                                <div className="mb-4">
                                  <p className="text-xs font-semibold text-slate-600 mb-2">Audit Procedures</p>
                                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                                    <table className="w-full text-xs">
                                      <thead>
                                        <tr className="bg-slate-50 border-b border-slate-200">
                                          <th className="text-left px-3 py-1.5 text-slate-500 font-medium w-10">#</th>
                                          <th className="text-left px-3 py-1.5 text-slate-500 font-medium">Procedure</th>
                                          <th className="text-left px-3 py-1.5 text-slate-500 font-medium">Finding</th>
                                          <th className="text-left px-3 py-1.5 text-slate-500 font-medium w-24">Conclusion</th>
                                          <th className="text-left px-3 py-1.5 text-slate-500 font-medium w-20">Evidence</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {wp.procedures.map((proc, pi) => (
                                          <tr key={pi} className="border-b border-slate-50 hover:bg-white">
                                            <td className="px-3 py-2 text-slate-400">{proc.no}</td>
                                            <td className="px-3 py-2 text-slate-700">{proc.procedure}</td>
                                            <td className="px-3 py-2 text-slate-600">{proc.finding}</td>
                                            <td className="px-3 py-2">
                                              <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium",
                                                proc.conclusion === "Satisfactory" ? "bg-green-100 text-green-700" :
                                                proc.conclusion === "Note Required" ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700")}>
                                                {proc.conclusion}
                                              </span>
                                            </td>
                                            <td className="px-3 py-2 font-mono text-slate-500 text-[10px]">{proc.evidence_ref}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              )}

                              {/* Summary Table */}
                              {wp.summary_table && wp.summary_table.length > 0 && (
                                <div className="mb-4">
                                  <p className="text-xs font-semibold text-slate-600 mb-2">Summary</p>
                                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                                    <table className="w-full text-xs">
                                      <thead><tr className="bg-slate-50"><th className="text-left px-3 py-1.5 text-slate-500">Item</th><th className="text-left px-3 py-1.5 text-slate-500">Value</th><th className="text-left px-3 py-1.5 text-slate-500">Comment</th></tr></thead>
                                      <tbody>{wp.summary_table.map((r, ri) => <tr key={ri} className="border-b border-slate-50"><td className="px-3 py-1.5 font-medium text-slate-700">{r.item}</td><td className="px-3 py-1.5 text-slate-800">{r.value}</td><td className="px-3 py-1.5 text-slate-500">{r.comment}</td></tr>)}</tbody>
                                    </table>
                                  </div>
                                </div>
                              )}

                              {/* Conclusion & Findings */}
                              <div className="grid grid-cols-2 gap-3">
                                <div className="bg-green-50 border border-green-100 rounded-lg p-3">
                                  <p className="text-[10px] font-semibold text-green-700 uppercase mb-1">Auditor Conclusion</p>
                                  <p className="text-xs text-green-800">{wp.auditor_conclusion}</p>
                                </div>
                                {wp.key_findings?.length > 0 && (
                                  <div className="bg-amber-50 border border-amber-100 rounded-lg p-3">
                                    <p className="text-[10px] font-semibold text-amber-700 uppercase mb-1">Key Findings</p>
                                    <ul className="text-xs text-amber-800 space-y-0.5">
                                      {wp.key_findings.map((f, fi) => <li key={fi} className="flex items-start gap-1"><span className="shrink-0">•</span>{f}</li>)}
                                    </ul>
                                  </div>
                                )}
                              </div>

                              {/* Evidence & Cross Refs */}
                              {(wp.evidence_refs?.length > 0 || wp.cross_references?.length > 0) && (
                                <div className="flex gap-4 mt-3 text-xs text-slate-500">
                                  {wp.evidence_refs?.length > 0 && <span>Evidence: {wp.evidence_refs.join(", ")}</span>}
                                  {wp.cross_references?.length > 0 && <span>Cross-ref: {wp.cross_references.join(", ")}</span>}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="flex justify-between pt-2">
        <Button variant="outline" onClick={onBack} className="gap-2"><ChevronLeft className="w-4 h-4" /> Back</Button>
        <Button onClick={onContinue} className="gap-2">Export Audit File <ArrowRight className="w-4 h-4" /></Button>
      </div>
    </div>
  );
}

// ─── STEP 6: EXPORT ────────────────────────────────────────────────────────────

function ExportStep({ onBack, onExport, exporting, session }:
  { onBack: () => void; onExport: (fmt: string) => void; exporting: string | null; session: WPSession }) {

  const stats = [
    { label: "Working Papers", value: session.workingPapers.length },
    { label: "TB Accounts", value: session.trialBalance.length },
    { label: "GL Entries", value: session.glEntries.length },
    { label: "Risk Flags", value: session.extractedData?.flags?.length || 0 },
  ];

  const approved = session.workingPapers.filter(p => p.status === "Approved").length;
  const total = session.workingPapers.length;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="text-center mb-4">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
          <CheckCircle2 className="w-8 h-8 text-green-600" />
        </div>
        <h2 className="text-xl font-bold text-slate-800">Audit File Ready</h2>
        <p className="text-sm text-slate-500 mt-1">Your complete AI-generated audit working papers are ready for export.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        {stats.map((s, i) => (
          <div key={i} className="p-3 bg-white border border-slate-200 rounded-xl text-center">
            <p className="text-xl font-bold text-slate-800">{s.value}</p>
            <p className="text-xs text-slate-500">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Review status */}
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold text-slate-700">Review Status</p>
          <span className="text-xs text-slate-500">{approved}/{total} papers approved</span>
        </div>
        <Progress value={total > 0 ? (approved / total) * 100 : 0} className="h-2 mb-2" />
        {approved < total && (
          <p className="text-xs text-amber-600">{total - approved} papers still in Draft / Review. You can still export — all papers are included.</p>
        )}
      </div>

      {/* Download All — Excel & Word */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-2xl p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold">Download Complete Audit File</h3>
            <p className="text-sm text-blue-100 mt-1">Excel Workbook + Word Document — full audit package in one click</p>
          </div>
          <Button
            size="lg"
            className="bg-white text-blue-700 hover:bg-blue-50 gap-2 font-bold px-8 shadow-lg"
            onClick={() => onExport("excel-word")}
            disabled={!!exporting}
          >
            {exporting === "excel-word" ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
            Download All (Excel & Word)
          </Button>
        </div>
      </div>

      {/* Individual Export Options */}
      <div className="grid grid-cols-3 gap-4">
        {[
          {
            fmt: "excel", label: "Excel Workbook", icon: FileSpreadsheet, desc: "Trial Balance, GL, Analytics",
            color: "bg-green-50 border-green-200 hover:bg-green-100",
          },
          {
            fmt: "docx", label: "Word Document", icon: FileText, desc: "Complete Working Papers file",
            color: "bg-blue-50 border-blue-200 hover:bg-blue-100",
          },
          {
            fmt: "pdf", label: "PDF Report", icon: FileOutput, desc: "Print-ready audit file",
            color: "bg-red-50 border-red-200 hover:bg-red-100",
          },
        ].map(exp => (
          <button key={exp.fmt} onClick={() => onExport(exp.fmt)} disabled={!!exporting}
            className={cn("flex flex-col items-center gap-2 p-5 rounded-xl border-2 transition-colors cursor-pointer", exp.color, exporting === exp.fmt && "opacity-70")}>
            {exporting === exp.fmt
              ? <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
              : <exp.icon className="w-8 h-8 text-slate-600" />}
            <p className="font-semibold text-sm text-slate-800">{exp.label}</p>
            <p className="text-xs text-slate-500 text-center">{exp.desc}</p>
          </button>
        ))}
      </div>

      {/* Export All Formats */}
      <Button variant="outline" className="w-full gap-2" size="lg" onClick={() => onExport("all")} disabled={!!exporting}>
        {exporting === "all" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
        Export All Formats (Excel + Word + PDF)
      </Button>

      <div className="flex items-start gap-2 p-3 bg-slate-50 border border-slate-200 rounded-xl">
        <Lock className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
        <div className="text-xs text-slate-500">
          <p>All exported files include: entity name, financial year, engagement partner, and ANA & Co. branding.</p>
          <p className="mt-1">AI-estimated values are marked as <strong>Estimated</strong> in all exports. User-confirmed values are marked as <strong>Confirmed</strong>.</p>
        </div>
      </div>

      <div className="flex justify-start">
        <Button variant="outline" onClick={onBack} className="gap-2"><ChevronLeft className="w-4 h-4" /> Back to Working Papers</Button>
      </div>
    </div>
  );
}

// ─── STEP INDICATOR ────────────────────────────────────────────────────────────

function StepIndicator({ currentStep }: { currentStep: number }) {
  return (
    <div className="w-full overflow-x-auto">
      <div className="flex items-center min-w-max gap-0 mb-6">
        {STEPS.map((s, i) => {
          const done = i < currentStep;
          const active = i === currentStep;
          return (
            <div key={i} className="flex items-center">
              <div className="flex items-center gap-1.5">
                <div className={cn("w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 transition-colors",
                  done ? "bg-green-500 text-white" : active ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-500")}>
                  {done ? <Check className="w-3.5 h-3.5" /> : i + 1}
                </div>
                <span className={cn("text-xs font-medium whitespace-nowrap", active ? "text-blue-700" : done ? "text-green-700" : "text-slate-400")}>{s.label}</span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={cn("w-8 h-0.5 mx-2 transition-colors shrink-0", done ? "bg-green-400" : "bg-slate-200")} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── MAIN COMPONENT ────────────────────────────────────────────────────────────

export default function WorkingPapers() {
  const { user, token } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const params = useParams<{ stepId?: string }>();

  const stepSlug = params.stepId || "upload";
  const currentStep = STEPS.findIndex(s => s.slug === stepSlug);
  const stepIdx = Math.max(0, currentStep);

  const goToStep = useCallback((n: number) => {
    if (n >= 0 && n < STEPS.length) {
      navigate(`/working-papers/${STEPS[n].slug}`);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [navigate]);

  // ─ Files (in-memory only — not serializable) ─
  const fsFilesRef = useRef<File[]>([]);
  const stFilesRef = useRef<File[]>([]);
  const [fsFilesList, setFsFilesList] = useState<File[]>([]);
  const [stFilesList, setStFilesList] = useState<File[]>([]);

  // ─ Session State ─
  const [session, setSession] = useState<WPSession>(() => {
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return { ...getDefaultSession(), ...parsed };
      }
    } catch {}
    return getDefaultSession();
  });

  function getDefaultSession(): WPSession {
    return {
      vars: { ...DEFAULT_VARS },
      extractedData: null,
      trialBalance: [],
      glEntries: [],
      glAccounts: [],
      chartOfAccounts: [],
      tbSummary: { is_balanced: false, total_debit: 0, total_credit: 0, gl_entries: 0, tb_accounts: 0 },
      workingPapers: [],
      selectedPapers: computeDefaultSelectedPapers({ ...DEFAULT_VARS }),
      draftSavedAt: null,
    };
  }

  // ─ Save Draft ─
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const toSave = { ...session, draftSavedAt: new Date().toISOString() };
        localStorage.setItem(DRAFT_KEY, JSON.stringify(toSave));
      } catch {}
    }, 1500);
    return () => clearTimeout(timer);
  }, [session]);

  // ─ Loading States ─
  const [extracting, setExtracting] = useState(false);
  const [extractPhase, setExtractPhase] = useState<{ step: number; label: string; detail: string }>({ step: 0, label: "", detail: "" });
  const [generatingTB, setGeneratingTB] = useState(false);
  const [generatingWPs, setGeneratingWPs] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);
  const [wpGenProgress, setWpGenProgress] = useState(0);

  function computeDefaultSelectedPapers(v: VariableMatrix): string[] {
    const selected: string[] = [];
    for (const group of WP_INDEX_FULL) {
      for (const p of group.papers) {
        selected.push(p.code);
      }
    }
    return selected;
  }

  // ─ HANDLER: Run AI Extraction ─
  const handleExtract = useCallback(async () => {
    const fsFiles = fsFilesRef.current;
    const stFiles = stFilesRef.current;

    if (fsFiles.length === 0) {
      toast({ title: "No files", description: "Please upload Financial Statements first.", variant: "destructive" });
      goToStep(0);
      return;
    }

    setExtracting(true);
    const totalFiles = fsFiles.length + stFiles.length;

    try {
      // Phase 1: Scanning & uploading files
      setExtractPhase({ step: 1, label: "Scanning Documents", detail: `Reading ${totalFiles} file(s) — scanning every sheet and page` });

      const fd1 = new FormData();
      [...fsFiles, ...stFiles].forEach(f => fd1.append("files", f));
      fd1.append("entityName", session.vars.entityName);
      fd1.append("financialYear", session.vars.yearEnd ? `Year ended ${session.vars.yearEnd}` : "");
      fd1.append("engagementType", session.vars.engagementType);
      fd1.append("classifications", JSON.stringify(
        [...fsFiles.map(f => [f.name, "Financial Statements"]),
         ...stFiles.map(f => [f.name, "Sales Tax Return"])
        ].reduce((acc, [k, v]) => ({ ...acc, [k as string]: v }), {})
      ));

      // Phase 2: Entity & Financial Extraction
      setExtractPhase({ step: 2, label: "Extracting Financial Data", detail: "OCR scanning all pages · Extracting every account, figure, and reference" });

      const r1 = await fetch("/api/working-papers/extract-entity", {
        method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd1,
      });
      if (!r1.ok) throw new Error(`Extraction failed: ${r1.status}`);
      const extraction = await r1.json();

      const stats = extraction._extraction_stats || {};
      setExtractPhase({ step: 3, label: "Structuring Datasets", detail: `${stats.files_processed || totalFiles} files · ${stats.total_sheets || 0} Excel sheets · ${stats.total_pages || 0} pages scanned` });

      // Phase 3: Full ISA Analysis
      setExtractPhase({ step: 4, label: "Running ISA 315 Analysis", detail: "Risk assessment · Materiality computation · Ratio analysis · Reconciliation checks" });

      const fd2 = new FormData();
      [...fsFiles, ...stFiles].forEach(f => fd2.append("files", f));
      fd2.append("entityName", extraction.entity_name || session.vars.entityName);
      fd2.append("financialYear", extraction.financial_year || session.vars.yearEnd);
      fd2.append("engagementType", session.vars.engagementType);
      fd2.append("instructions", `Framework: ${session.vars.framework}. Industry: ${session.vars.industry}. Materiality basis: ${session.vars.materialityBasis}. Performance materiality: ${session.vars.performanceMaterialityPct}%.`);

      const r2 = await fetch("/api/working-papers/analyze", {
        method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd2,
      });
      if (!r2.ok) throw new Error(`Analysis failed: ${r2.status}`);
      const analysis = await r2.json();

      // Phase 4: Validating & Mapping
      setExtractPhase({ step: 5, label: "Validating & Mapping", detail: "Cross-checking figures · Mapping to audit-ready datasets · Verifying completeness" });

      // Build extractedData from both responses
      const extractedData: ExtractedData = {
        entity: { ...(extraction.entity || {}), entity_name: extraction.entity_name, ntn: extraction.ntn, strn: extraction.strn, financial_year: extraction.financial_year, legal_form: extraction.legal_form, industry: extraction.industry, reporting_framework: extraction.reporting_framework, registered_address: extraction.registered_address, bankers: extraction.bankers, directors: extraction.directors, auditors: extraction.auditors, engagement_type: extraction.engagement_type, ...(analysis.entity || {}) },
        financials: { ...extraction.financials, ...analysis.financials },
        taxData: extraction.tax_data || {},
        tbLines: extraction.tb_lines || [],
        glSummary: extraction.gl_summary || [],
        flags: [...(extraction.flags || []), ...(analysis.flags || [])],
        documents_found: extraction.documents_found || [],
        extractionLog: [
          `Scanned ${stats.files_processed || totalFiles} file(s) · ${stats.total_sheets || 0} Excel sheets · ${stats.total_pages || 0} document pages`,
          `Total content scanned: ${((stats.total_chars_scanned || 0) / 1000).toFixed(0)}K characters`,
          `Processed ${fsFiles.length} Financial Statement file(s)`,
          `Processed ${stFiles.length} Sales Tax Return file(s)`,
          `Entity identified: ${extraction.entity_name || "Unknown"}`,
          `Framework: ${session.vars.framework}`,
          `Financial year: ${extraction.financial_year || session.vars.yearEnd}`,
          `Risk assessment: ${analysis.analysis?.risk_assessment?.overall_risk || "Medium"}`,
          `Materiality computed: ${analysis.analysis?.materiality?.overall_materiality ? fmtPKR(analysis.analysis.materiality.overall_materiality) : "Pending"}`,
          ...(analysis.analysis?.analytical_procedures?.ratios ? ["Financial ratios computed"] : []),
          `Reconciliation checks: ${analysis.analysis?.reconciliation?.flags?.length || 0} flags`,
        ],
        analysis: analysis.analysis || analysis,
        confidenceScores: extraction.confidence_scores || {},
        assumptions: extraction.assumptions || analysis.assumptions || [],
        missingData: extraction.missing_data || analysis.analysis?.missing_data_flags || [],
      };

      setExtractPhase({ step: 6, label: "Complete", detail: "All data extracted, structured, and validated" });

      // Auto-fill variables from extraction
      const updatedVars: VariableMatrix = {
        ...session.vars,
        entityName: extractedData.entity?.entity_name || session.vars.entityName,
        ntn: extractedData.entity?.ntn || session.vars.ntn,
        strn: extractedData.entity?.strn || session.vars.strn,
        legalForm: extractedData.entity?.legal_form || session.vars.legalForm,
        industry: extractedData.entity?.industry || session.vars.industry,
      };

      setSession(s => ({ ...s, extractedData, vars: updatedVars }));
      toast({ title: "AI Extraction Complete", description: "Financial data extracted and analysed." });

    } catch (err: any) {
      toast({ title: "Extraction failed", description: err.message, variant: "destructive" });
      setExtracting(false);
      return;
    }

    setExtracting(false);
  }, [session.vars, token, toast, goToStep]);

  // ─ HANDLER: Generate TB + GL ─
  const handleGenerateTBGL = useCallback(async () => {
    if (!session.extractedData) {
      toast({ title: "Run extraction first", description: "Please complete Step 2 before generating the Trial Balance.", variant: "destructive" });
      return;
    }

    setGeneratingTB(true);

    try {
      const fin = session.extractedData.financials || {};
      const bsData = fin.bs_sections || [];
      const plData = fin.pl_sections || [];

      const body = {
        entityName: session.vars.entityName,
        industry: session.vars.industry,
        financialYear: session.vars.yearEnd ? `Year ended ${session.vars.yearEnd}` : "Year ended June 30, 2024",
        ntn: session.vars.ntn,
        strn: session.vars.strn,
        engagementType: session.vars.engagementType,
        framework: session.vars.framework,
        bsData: bsData.length ? bsData : [
          { lines: [
            { label: "Total Assets", cy: fin.total_assets || 0, py: fin.prior_year_total_assets || 0 },
            { label: "Fixed Assets", cy: fin.fixed_assets || 0, py: 0 },
            { label: "Inventory", cy: fin.inventory || 0, py: 0 },
            { label: "Trade Receivables", cy: fin.trade_receivables || 0, py: 0 },
            { label: "Cash & Bank", cy: fin.cash_and_bank || 0, py: 0 },
            { label: "Total Liabilities", cy: fin.total_liabilities || 0, py: 0 },
            { label: "Trade Payables", cy: fin.trade_payables || 0, py: 0 },
            { label: "Equity", cy: fin.equity || 0, py: 0 },
            { label: "Share Capital", cy: fin.share_capital || 0, py: 0 },
            { label: "Retained Earnings", cy: fin.retained_earnings || 0, py: 0 },
          ]}
        ],
        plData: plData.length ? plData : [
          { lines: [
            { label: "Revenue", cy: fin.revenue || 0, py: fin.prior_year_revenue || 0 },
            { label: "Cost of Sales", cy: fin.cost_of_sales || 0, py: 0 },
            { label: "Gross Profit", cy: fin.gross_profit || 0, py: 0 },
            { label: "Operating Expenses", cy: fin.operating_expenses || 0, py: 0 },
            { label: "Finance Cost", cy: fin.finance_cost || 0, py: 0 },
            { label: "Net Profit", cy: fin.net_profit || 0, py: fin.prior_year_net_profit || 0 },
            { label: "Tax Expense", cy: fin.tax_expense || 0, py: 0 },
          ]}
        ],
      };

      const res = await fetch("/api/working-papers/generate-gl-tb", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error(`GL/TB generation failed: ${res.status}`);
      const data = await res.json();

      const tb: TBAccount[] = (data.trial_balance || []).map((a: any) => ({
        account_code: a.account_code || "",
        account_name: a.account_name || "",
        fs_head: a.fs_head || "",
        classification: a.classification || a.type || "",
        debit_total: Number(a.debit_total) || 0,
        credit_total: Number(a.credit_total) || 0,
        balance_dr: Number(a.balance_dr) || 0,
        balance_cr: Number(a.balance_cr) || 0,
        fs_mapping: a.fs_mapping || "",
        source: "Estimated" as DataSource,
        confidence: 70,
        notes: "",
      }));

      const glEntries: GLEntry[] = data.general_ledger || [];

      // Build GL accounts from entries
      const accountMap = new Map<string, GLAccount>();
      for (const entry of glEntries) {
        if (!accountMap.has(entry.account_code)) {
          accountMap.set(entry.account_code, {
            account_code: entry.account_code,
            account_name: entry.account_name,
            group: "",
            type: "",
            opening_balance: 0,
            closing_balance: 0,
            entries: [],
            source: "Estimated",
          });
        }
        accountMap.get(entry.account_code)!.entries.push(entry);
      }

      // Link COA data
      for (const coa of (data.chart_of_accounts || [])) {
        if (accountMap.has(coa.code)) {
          const a = accountMap.get(coa.code)!;
          a.group = coa.group || coa.sub_group || "";
          a.type = coa.type || "";
        }
      }

      const glAccounts = Array.from(accountMap.values());

      const reconProof = data.reconciliation_proof || {};
      setSession(s => ({
        ...s,
        trialBalance: tb,
        glEntries,
        glAccounts,
        chartOfAccounts: data.chart_of_accounts || [],
        tbSummary: {
          is_balanced: data.summary?.is_balanced ?? Math.abs((data.summary?.total_debit || 0) - (data.summary?.total_credit || 0)) < 1,
          total_debit: data.summary?.total_debit || 0,
          total_credit: data.summary?.total_credit || 0,
          gl_entries: data.summary?.gl_entries || glEntries.length,
          tb_accounts: data.summary?.tb_accounts || tb.length,
          phases_completed: data.summary?.phases_completed || 1,
          coa_accounts: data.summary?.coa_accounts || (data.chart_of_accounts || []).length,
          accounting_equation_satisfied: data.summary?.accounting_equation_satisfied ?? reconProof.accounting_equation_satisfied ?? false,
          reconciliation_proof: reconProof,
        },
      }));

      const balText = data.summary?.is_balanced ? "Balanced" : "Adjustment applied";
      const eqText = reconProof.accounting_equation_satisfied ? "A=L+E verified" : "Equation pending";
      toast({ title: "Trial Balance Generated (3-Phase)", description: `${tb.length} accounts · ${glEntries.length} GL entries · ${balText} · ${eqText}` });

    } catch (err: any) {
      toast({ title: "Generation failed", description: err.message, variant: "destructive" });
    }

    setGeneratingTB(false);
  }, [session, token, toast]);

  // ─ HANDLER: Generate Working Papers ─
  const handleGenerateWPs = useCallback(async () => {
    if (!session.extractedData) {
      toast({ title: "Run extraction first", variant: "destructive" });
      return;
    }

    setGeneratingWPs(true);
    setWpGenProgress(10);

    try {
      const analysis = session.extractedData.analysis || {};
      const fin = session.extractedData.financials || {};
      const v = session.vars;

      const papersToGenerate = session.selectedPapers.filter(p => {
        if (p === "B7" && !v.itSystemReliance) return false;
        if (p === "B15" && !v.relatedPartiesExist) return false;
        if (p === "C8" && !v.groupAudit) return false;
        if (["E4","E5"].includes(p) && v.auditApproach === "Substantive Only") return false;
        if (["E6","E7"].includes(p) && !v.itSystemReliance) return false;
        if (["F5","F6"].includes(p) && !v.hasCashBank) return false;
        if (p === "F7" && !v.hasReceivables) return false;
        if (p === "F8" && !v.hasInventory) return false;
        if (p === "F9" && !v.hasFixedAssets) return false;
        if (p === "F10" && !v.hasIntangibles) return false;
        if (p === "F11" && !v.hasInvestments) return false;
        if (p === "F12" && !v.hasPayables) return false;
        if (p === "F13" && !v.hasBorrowings) return false;
        if (p === "F15" && !v.hasProvisions && !v.hasContingentLiabilities) return false;
        if (p === "F16" && !v.hasShareCapital) return false;
        if (p === "F17" && !v.hasReserves && !v.hasRetainedEarnings) return false;
        if (p === "F19" && !v.hasCostOfSales) return false;
        if (p === "F20" && !v.hasOperatingExpenses) return false;
        if (p === "F22" && !v.hasFinanceCost) return false;
        if (p === "F23" && !v.hasOtherIncome) return false;
        if (p === "F24" && !v.incomeTaxApplicable) return false;
        if (p === "F25" && !v.deferredTaxApplicable) return false;
        if (p === "F26" && !v.salesTaxApplicable) return false;
        if (p === "F27" && !v.whtApplicable) return false;
        if (["G1","G2","G3"].includes(p) && !v.externalConfirmations) return false;
        if (p === "J1" && !v.eqcrRequired) return false;
        if (["L4","L5"].includes(p) && !v.salesTaxApplicable && !v.whtApplicable) return false;
        return true;
      });

      setWpGenProgress(20);

      const res = await fetch("/api/working-papers/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          analysis,
          selectedPapers: papersToGenerate,
          // Entity variables
          entityName: v.entityName,
          industry: v.industry,
          engagementType: v.engagementType,
          financialYear: v.yearEnd ? `Year ended ${v.yearEnd}` : analysis.entity?.financial_year || "",
          framework: v.framework,
          listedStatus: v.listedStatus,
          entityType: v.legalForm,
          ntn: v.ntn,
          strn: v.strn,
          currency: v.currency,
          periodStart: v.periodStart,
          periodEnd: v.periodEnd,
          // Team
          preparer: v.preparer,
          reviewer: v.reviewer,
          approver: v.approver,
          engagementPartner: v.engagementPartner,
          firmName: "ANA & Co. Chartered Accountants",
          // Flags
          firstYearAudit: v.firstYearAudit,
          eqcrRequired: v.eqcrRequired,
          relatedPartyFlag: v.relatedPartiesExist || v.relatedPartyRisk,
          estimatesFlag: v.significantEstimates,
          litigationFlag: v.hasContingentLiabilities,
          expertRequired: v.useOfExperts,
          goingConcernFlag: v.goingConcernIssue,
          // Tax
          currentTaxApplicable: v.incomeTaxApplicable,
          deferredTaxApplicable: v.deferredTaxApplicable,
          whtExposure: v.whtApplicable,
          salesTaxRegistered: v.salesTaxApplicable,
          independenceConfirmed: true,
          conflictCheck: true,
          // Audit approach
          samplingMethod: v.samplingMethod,
          auditApproach: v.auditApproach,
          // Financial data fallback
          bsData: [{ lines: [
            { label: "Total Assets", cy: fin.total_assets || 0, py: 0 },
            { label: "Total Liabilities", cy: fin.total_liabilities || 0, py: 0 },
            { label: "Equity", cy: fin.equity || 0, py: 0 },
          ]}],
          plData: [{ lines: [
            { label: "Revenue", cy: fin.revenue || 0, py: fin.prior_year_revenue || 0 },
            { label: "Net Profit", cy: fin.net_profit || 0, py: fin.prior_year_net_profit || 0 },
          ]}],
        }),
      });

      setWpGenProgress(60);

      if (!res.ok) throw new Error(`Working papers generation failed: ${res.status}`);
      const data = await res.json();

      setWpGenProgress(90);

      const wps: WPDoc[] = (data.working_papers || []).map((wp: any) => ({
        ...wp,
        status: "Draft" as const,
        prepared_by: wp.prepared_by || v.preparer || "Audit Senior",
        reviewed_by: wp.reviewed_by || v.reviewer || "Audit Manager",
        approved_by: wp.approved_by || v.approver || "Engagement Partner",
        prepared_date: wp.prepared_date || new Date().toLocaleDateString("en-PK"),
        reviewed_date: wp.reviewed_date || "",
        approved_date: wp.approved_date || "",
        source: "Estimated" as DataSource,
        isOpen: false,
        isEditing: false,
      }));

      setSession(s => ({ ...s, workingPapers: wps }));
      setWpGenProgress(100);
      toast({ title: "Working Papers Generated", description: `${wps.length} ISA-compliant papers created.` });

    } catch (err: any) {
      toast({ title: "Generation failed", description: err.message, variant: "destructive" });
    }

    setGeneratingWPs(false);
    setWpGenProgress(0);
  }, [session, token, toast]);

  // ─ HANDLER: Export ─
  const handleExport = useCallback(async (fmt: string) => {
    if (!session.extractedData && session.workingPapers.length === 0) {
      toast({ title: "Nothing to export", variant: "destructive" });
      return;
    }

    const doExport = async (format: string, silent = false) => {
      if (!silent) setExporting(format);
      try {
        const endpoint = format === "excel" ? "export-excel" : format === "docx" ? "export-docx" : "export-pdf";
        const res = await fetch(`/api/working-papers/${endpoint}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            workingPapers: session.workingPapers,
            meta: {
              entity: session.vars.entityName,
              financial_year: session.vars.yearEnd ? `Year ended ${session.vars.yearEnd}` : "",
              engagement_type: session.vars.engagementType,
              firm_name: "ANA & Co. Chartered Accountants",
              sampling_method: session.vars.samplingMethod || "Statistical",
              preparer: session.vars.preparer,
              reviewer: session.vars.reviewer,
              approver: session.vars.approver,
            },
            analysis: session.extractedData?.analysis || {},
            trialBalance: session.trialBalance,
            generalLedger: session.glEntries,
          }),
        });

        if (!res.ok) throw new Error(`Export failed: ${res.status}`);
        const blob = await res.blob();
        const ext = format === "excel" ? "xlsx" : format === "docx" ? "docx" : "pdf";
        const safeName = session.vars.entityName.replace(/[^a-z0-9]/gi, "_").toLowerCase() || "audit_file";
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = `${safeName}_working_papers.${ext}`; a.click();
        URL.revokeObjectURL(url);
        toast({ title: `${format.toUpperCase()} exported`, description: "Download started." });
      } catch (err: any) {
        toast({ title: "Export failed", description: err.message, variant: "destructive" });
      }
      if (!silent) setExporting(null);
    };

    if (fmt === "all") {
      setExporting("all");
      try {
        for (const f of ["excel","docx","pdf"]) await doExport(f, true);
      } finally {
        setExporting(null);
      }
    } else if (fmt === "excel-word") {
      setExporting("excel-word");
      try {
        await Promise.all([doExport("excel", true), doExport("docx", true)]);
      } finally {
        setExporting(null);
      }
    } else {
      await doExport(fmt);
    }
  }, [session, token, toast]);

  // ─ Step transitions with side-effects ─
  const handleStepContinue = useCallback(async (from: number) => {
    if (from === 0) {
      goToStep(1);
    } else if (from === 1) {
      goToStep(2);
      if (!session.extractedData && !extracting) {
        await handleExtract();
      }
    } else if (from === 2) {
      goToStep(3);
      if (session.trialBalance.length === 0 && !generatingTB) {
        await handleGenerateTBGL();
      }
    } else if (from === 3) {
      goToStep(4);
    } else if (from === 4) {
      goToStep(5);
      if (session.workingPapers.length === 0 && !generatingWPs) {
        await handleGenerateWPs();
      }
    } else if (from === 5) {
      goToStep(6);
    }
  }, [goToStep, session, extracting, generatingTB, generatingWPs, handleExtract, handleGenerateTBGL, handleGenerateWPs]);

  const updateVars = (v: VariableMatrix) => setSession(s => ({ ...s, vars: v, selectedPapers: computeDefaultSelectedPapers(v) }));
  const updateTBAccounts = (accounts: TBAccount[]) => setSession(s => ({ ...s, trialBalance: accounts }));
  const updatePaperStatus = (ref: string, status: "Draft" | "Review" | "Approved") => {
    setSession(s => ({ ...s, workingPapers: s.workingPapers.map(p => p.ref === ref ? { ...p, status } : p) }));
  };
  const selectPaper = (code: string) => setSession(s => ({ ...s, selectedPapers: [...new Set([...s.selectedPapers, code])] }));
  const unselectPaper = (code: string) => setSession(s => ({ ...s, selectedPapers: s.selectedPapers.filter(p => p !== code) }));

  const handleRerunExtraction = async () => {
    setSession(s => ({ ...s, extractedData: null }));
    await handleExtract();
  };

  const handleRerunTBGL = async () => {
    setSession(s => ({ ...s, trialBalance: [], glEntries: [], glAccounts: [] }));
    await handleGenerateTBGL();
  };

  const handleRerunWPs = async () => {
    setSession(s => ({ ...s, workingPapers: [] }));
    await handleGenerateWPs();
  };

  // ─ Redirect /working-papers to /working-papers/upload ─
  useEffect(() => {
    if (!params.stepId) {
      navigate("/working-papers/upload", { replace: true });
    }
  }, [params.stepId, navigate]);

  // ─ Page title ─
  const pageTitle = session.vars.entityName
    ? `Working Papers — ${session.vars.entityName}`
    : "AI Working Paper Generator";

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-1">
            <h1 className="text-2xl font-bold text-slate-900">{pageTitle}</h1>
            <div className="flex items-center gap-2">
              {session.extractedData && (
                <span className="text-xs text-green-600 bg-green-50 border border-green-200 px-2 py-1 rounded-full flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Data extracted
                </span>
              )}
              {session.draftSavedAt && (
                <span className="text-xs text-slate-400">Draft saved {new Date(session.draftSavedAt).toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit" })}</span>
              )}
              <Button variant="ghost" size="sm" className="gap-1 text-xs text-slate-500"
                onClick={() => { if (confirm("Reset all data and start over?")) { setSession(getDefaultSession()); fsFilesRef.current = []; stFilesRef.current = []; setFsFilesList([]); setStFilesList([]); navigate("/working-papers/upload"); } }}>
                <RotateCcw className="w-3.5 h-3.5" /> Reset
              </Button>
            </div>
          </div>
          <p className="text-sm text-slate-500">Upload Financial Statements & Sales Tax Returns — AI generates TB, GL, and all working papers automatically</p>
        </div>

        {/* Step Indicator */}
        <StepIndicator currentStep={stepIdx} />

        {/* Step Content */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">

          {/* STEP 0: Upload */}
          {stepIdx === 0 && (
            <UploadStep
              fsFiles={fsFilesList}
              stFiles={stFilesList}
              onFsAdd={files => { fsFilesRef.current = [...fsFilesRef.current, ...files]; setFsFilesList([...fsFilesRef.current]); }}
              onStAdd={files => { stFilesRef.current = [...stFilesRef.current, ...files]; setStFilesList([...stFilesRef.current]); }}
              onFsRemove={i => { fsFilesRef.current.splice(i, 1); setFsFilesList([...fsFilesRef.current]); }}
              onStRemove={i => { stFilesRef.current.splice(i, 1); setStFilesList([...stFilesRef.current]); }}
              onContinue={() => handleStepContinue(0)}
            />
          )}

          {/* STEP 1: Variables */}
          {stepIdx === 1 && (
            <VariablesStep
              vars={session.vars}
              onChange={updateVars}
              onContinue={() => handleStepContinue(1)}
              onBack={() => goToStep(0)}
            />
          )}

          {/* STEP 2: Extraction */}
          {stepIdx === 2 && (
            extracting ? (
              <div className="max-w-lg mx-auto py-10">
                <div className="text-center mb-6">
                  <Loader2 className="w-10 h-10 animate-spin mx-auto mb-3 text-blue-500" />
                  <h3 className="text-lg font-bold text-slate-800">Running AI Extraction</h3>
                  <p className="text-sm text-slate-500 mt-1">Every sheet and every page is being scanned exhaustively</p>
                </div>

                <div className="space-y-2 mb-6">
                  {[
                    { step: 1, label: "Scanning Documents" },
                    { step: 2, label: "Extracting Financial Data" },
                    { step: 3, label: "Structuring Datasets" },
                    { step: 4, label: "Running ISA 315 Analysis" },
                    { step: 5, label: "Validating & Mapping" },
                    { step: 6, label: "Complete" },
                  ].map(phase => {
                    const isCurrent = extractPhase.step === phase.step;
                    const isDone = extractPhase.step > phase.step;
                    return (
                      <div key={phase.step} className={cn(
                        "flex items-center gap-3 px-4 py-2.5 rounded-xl border transition-all",
                        isCurrent ? "bg-blue-50 border-blue-200 shadow-sm" : isDone ? "bg-green-50 border-green-200" : "bg-slate-50 border-slate-100 opacity-50"
                      )}>
                        <div className={cn("w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-xs font-bold",
                          isDone ? "bg-green-500 text-white" : isCurrent ? "bg-blue-500 text-white" : "bg-slate-200 text-slate-400"
                        )}>
                          {isDone ? <Check className="w-3.5 h-3.5" /> : isCurrent ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : phase.step}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={cn("text-sm font-medium", isCurrent ? "text-blue-800" : isDone ? "text-green-700" : "text-slate-400")}>{phase.label}</p>
                          {isCurrent && extractPhase.detail && (
                            <p className="text-xs text-blue-500 mt-0.5 truncate">{extractPhase.detail}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <Progress value={(extractPhase.step / 6) * 100} className="h-2 mb-2" />
                <p className="text-xs text-slate-400 text-center">This typically takes 30–90 seconds depending on document size and complexity</p>
              </div>
            ) : (
              <ExtractionStep
                extractedData={session.extractedData}
                vars={session.vars}
                onContinue={() => handleStepContinue(2)}
                onBack={() => goToStep(1)}
                onRerun={handleRerunExtraction}
              />
            )
          )}

          {/* STEP 3: Trial Balance */}
          {stepIdx === 3 && (
            generatingTB ? (
              <div className="text-center py-16">
                <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4 text-blue-500" />
                <p className="text-slate-600 font-medium">Generating Trial Balance & General Ledger...</p>
                <p className="text-sm text-slate-400 mt-1">Building 80–100 journal entries with Pakistan COA coding</p>
              </div>
            ) : (
              <TrialBalanceStep
                accounts={session.trialBalance}
                summary={session.tbSummary}
                onContinue={() => handleStepContinue(3)}
                onBack={() => goToStep(2)}
                onRegenerate={handleRerunTBGL}
                onAccountChange={updateTBAccounts}
              />
            )
          )}

          {/* STEP 4: General Ledger */}
          {stepIdx === 4 && (
            <GeneralLedgerStep
              glAccounts={session.glAccounts}
              glEntries={session.glEntries}
              onContinue={() => handleStepContinue(4)}
              onBack={() => goToStep(3)}
            />
          )}

          {/* STEP 5: Working Papers */}
          {stepIdx === 5 && (
            generatingWPs ? (
              <div className="text-center py-16">
                <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4 text-blue-500" />
                <p className="text-slate-600 font-medium">Generating Working Papers...</p>
                <p className="text-sm text-slate-400 mt-1">Writing ISA-compliant audit documentation for {session.selectedPapers.length} papers</p>
                {wpGenProgress > 0 && <Progress value={wpGenProgress} className="h-2 max-w-xs mx-auto mt-4" />}
                <p className="text-xs text-slate-400 mt-2">This may take 2-4 minutes for a full audit file</p>
              </div>
            ) : (
              <WorkingPapersStep
                papers={session.workingPapers}
                selectedPapers={session.selectedPapers}
                vars={session.vars}
                onContinue={() => handleStepContinue(5)}
                onBack={() => goToStep(4)}
                onRegenerate={handleRerunWPs}
                onPaperStatusChange={updatePaperStatus}
                onSelectPaper={selectPaper}
                onUnselectPaper={unselectPaper}
              />
            )
          )}

          {/* STEP 6: Export */}
          {stepIdx === 6 && (
            <ExportStep
              onBack={() => goToStep(5)}
              onExport={handleExport}
              exporting={exporting}
              session={session}
            />
          )}
        </div>
      </div>
    </div>
  );
}
