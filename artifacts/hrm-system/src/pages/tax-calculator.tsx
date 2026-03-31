import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { Link } from "wouter";
import {
  ArrowLeft, Calculator, FileText, Building2, Car, Home as HomeIcon,
  Banknote, Receipt, Truck, BarChart3, ChevronDown, ChevronUp, Info,
  CheckCircle2, AlertTriangle, Shield, TrendingUp, AlertCircle,
  Layers, Target, Zap, RefreshCw, Download, ClipboardList,
  ShoppingCart, Globe, CreditCard, Users, Upload, Loader2, FileSearch,
  Eye, Search, X, BookOpen, ShieldAlert
} from "lucide-react";

// ─── Formatters ────────────────────────────────────────────────────────────────
function fmt(v: number) {
  return new Intl.NumberFormat("en-PK", { style: "currency", currency: "PKR", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v);
}
function pct(v: number) { return `${(v * 100).toFixed(2)}%`; }
function n(s: string | number) { return parseFloat(String(s) || "0") || 0; }

// ─── Tax Rates & Data ──────────────────────────────────────────────────────────
const SALARY_SLABS = [
  { min: 0,       max: 600000,   base: 0,      rate: 0 },
  { min: 600001,  max: 1200000,  base: 0,      rate: 0.01 },
  { min: 1200001, max: 2200000,  base: 6000,   rate: 0.11 },
  { min: 2200001, max: 3200000,  base: 116000, rate: 0.23 },
  { min: 3200001, max: 4100000,  base: 346000, rate: 0.30 },
  { min: 4100001, max: Infinity, base: 616000, rate: 0.35 },
];

const BUSINESS_IND_SLABS = [
  { min: 0,        max: 600000,   base: 0,       rate: 0 },
  { min: 600001,   max: 1200000,  base: 0,       rate: 0.015 },
  { min: 1200001,  max: 1600000,  base: 9000,    rate: 0.075 },
  { min: 1600001,  max: 3200000,  base: 39000,   rate: 0.15 },
  { min: 3200001,  max: 5600000,  base: 279000,  rate: 0.20 },
  { min: 5600001,  max: 8000000,  base: 759000,  rate: 0.25 },
  { min: 8000001,  max: 12000000, base: 1359000, rate: 0.30 },
  { min: 12000001, max: Infinity, base: 2559000, rate: 0.35 },
];

const SUPER_TAX_SLABS = [
  { min: 0,         max: 150000000, rate: 0 },
  { min: 150000001, max: 200000000, rate: 0.01 },
  { min: 200000001, max: 250000000, rate: 0.02 },
  { min: 250000001, max: 300000000, rate: 0.03 },
  { min: 300000001, max: 350000000, rate: 0.04 },
  { min: 350000001, max: 400000000, rate: 0.06 },
  { min: 400000001, max: 500000000, rate: 0.08 },
  { min: 500000001, max: Infinity,  rate: 0.10 },
];

function calcSlabTax(income: number, slabs: typeof SALARY_SLABS): number {
  if (income <= 0) return 0;
  for (const s of slabs) {
    if (income >= s.min && income <= s.max) {
      return (s.base ?? 0) + (income - s.min + 1) * s.rate;
    }
  }
  return 0;
}

function calcSalaryTax(income: number): number {
  if (income <= 600000) return 0;
  let tax = calcSlabTax(income, SALARY_SLABS);
  if (income > 10000000) tax *= 1.09;
  return tax;
}

function calcBusinessIndTax(income: number): number {
  if (income <= 600000) return 0;
  let tax = calcSlabTax(income, BUSINESS_IND_SLABS);
  if (income > 10000000) tax *= 1.09;
  return tax;
}

function calcSuperTax(income: number, isBanking: boolean): number {
  if (isBanking) {
    return income > 300000000 ? income * 0.10 : 0;
  }
  for (const s of SUPER_TAX_SLABS) {
    if (income >= s.min && income <= s.max) return income * s.rate;
  }
  return 0;
}

function calcMinimumTax(turnover: number, isCompany: boolean): number {
  return turnover * (isCompany ? 0.0125 : 0.01);
}

const WHT_RATES: Record<string, { label: string; section: string; atl: number; nonatl: number }> = {
  import_part1:         { label: "Import Goods Part-I (Twelfth Schedule)",     section: "148",    atl: 0.01,  nonatl: 0.02 },
  import_part2:         { label: "Import Goods Part-II (Standard)",             section: "148",    atl: 0.02,  nonatl: 0.04 },
  import_part2_commercial: { label: "Import Goods Part-II (Commercial)",        section: "148",    atl: 0.035, nonatl: 0.07 },
  import_part3:         { label: "Import Goods Part-III (Standard)",            section: "148",    atl: 0.055, nonatl: 0.11 },
  import_part3_commercial: { label: "Import Goods Part-III (Commercial)",       section: "148",    atl: 0.06,  nonatl: 0.12 },
  import_pharma:        { label: "Import Pharma Products (Proviso 1b)",         section: "148",    atl: 0.04,  nonatl: 0.08 },
  import_ev_ckd:        { label: "Import CKD kits for EVs",                    section: "148",    atl: 0.01,  nonatl: 0.02 },
  supply_company:       { label: "Supply of Goods — Company",                   section: "153(1)(a)", atl: 0.05, nonatl: 0.10 },
  supply_noncompany:    { label: "Supply of Goods — Non-Company",               section: "153(1)(a)", atl: 0.055, nonatl: 0.11 },
  supply_rice_cotton:   { label: "Supply Rice/Cotton Seed/Edible Oils",         section: "153(1)(a)", atl: 0.015, nonatl: 0.03 },
  supply_toll_company:  { label: "Toll Manufacturing — Company",                section: "153(1)(a)", atl: 0.09, nonatl: 0.18 },
  supply_toll_noncompany: { label: "Toll Manufacturing — Non-Company",          section: "153(1)(a)", atl: 0.11, nonatl: 0.22 },
  services_it:          { label: "Services — IT/IT Enabled",                   section: "153(1)(b)", atl: 0.04, nonatl: 0.08 },
  services_general:     { label: "Services — General",                          section: "153(1)(b)", atl: 0.06, nonatl: 0.12 },
  services_other:       { label: "Services — Other (Div-III Para 5)",           section: "153(1)(b)", atl: 0.15, nonatl: 0.30 },
  contract_company:     { label: "Contract — Company",                          section: "153(1)(c)", atl: 0.075, nonatl: 0.15 },
  contract_noncompany:  { label: "Contract — Non-Company",                      section: "153(1)(c)", atl: 0.075, nonatl: 0.15 },
  contract_sportsperson: { label: "Contract — Sports Persons",                  section: "153(1)(c)", atl: 0.10, nonatl: 0.20 },
  rent_company:         { label: "Rent of Immovable Property — Company",        section: "155",    atl: 0.15, nonatl: 0.30 },
  dividend_ipp:         { label: "Dividend — IPPs",                             section: "150",    atl: 0.075, nonatl: 0.15 },
  dividend_reit:        { label: "Dividend — REIT / General",                   section: "150",    atl: 0.15, nonatl: 0.30 },
  dividend_mutual_debt: { label: "Dividend — Mutual Fund (Debt >50%)",          section: "150",    atl: 0.25, nonatl: 0.50 },
  dividend_mutual_equity: { label: "Dividend — Mutual Fund (Equity >50%)",      section: "150",    atl: 0.15, nonatl: 0.30 },
  dividend_spv_reit:    { label: "Dividend — REIT from SPV (Exempt)",           section: "150",    atl: 0.00, nonatl: 0.00 },
  dividend_spv_other:   { label: "Dividend — Others from SPV",                  section: "150",    atl: 0.35, nonatl: 0.70 },
  profit_bank:          { label: "Profit on Debt — Bank Deposit",               section: "151",    atl: 0.20, nonatl: 0.40 },
  profit_govt:          { label: "Profit — Govt Securities (Non-Individual)",   section: "151",    atl: 0.20, nonatl: 0.40 },
  profit_other:         { label: "Profit on Debt — Other",                      section: "151",    atl: 0.15, nonatl: 0.30 },
  profit_sukuk_company: { label: "Sukuk — Company Holder",                      section: "151",    atl: 0.25, nonatl: 0.50 },
  profit_sukuk_ind_high: { label: "Sukuk — Individual (Return >1M)",            section: "151",    atl: 0.125, nonatl: 0.25 },
  profit_sukuk_ind_low: { label: "Sukuk — Individual (Return <1M)",             section: "151",    atl: 0.10, nonatl: 0.20 },
  nonresident_general:  { label: "Non-Resident — General (Sec 152(1))",         section: "152",    atl: 0.15, nonatl: 0.15 },
  nonresident_1a:       { label: "Non-Resident — Sec 152(1A)",                  section: "152",    atl: 0.07, nonatl: 0.07 },
  nonresident_1aa:      { label: "Non-Resident — IT Services (Sec 152(1AA))",   section: "152",    atl: 0.05, nonatl: 0.05 },
  nonresident_1aaa:     { label: "Non-Resident — Sec 152(1AAA)",                section: "152",    atl: 0.10, nonatl: 0.10 },
  export_goods:         { label: "Export of Goods (Final Tax)",                 section: "154",    atl: 0.01, nonatl: 0.02 },
  export_indenting:     { label: "Export — Indenting Commission",               section: "154",    atl: 0.05, nonatl: 0.10 },
  export_services_pseb: { label: "Export IT Services (PSEB Registered)",        section: "154A",   atl: 0.0025, nonatl: 0.005 },
  prize_bond:           { label: "Prize Bond / Lottery",                        section: "156",    atl: 0.15, nonatl: 0.30 },
  prize_quiz:           { label: "Quiz/Promotion Prize",                        section: "156",    atl: 0.20, nonatl: 0.40 },
  petroleum:            { label: "Petroleum Products",                           section: "156A",   atl: 0.12, nonatl: 0.24 },
  brokerage_advertising: { label: "Commission — Advertising Agent",             section: "233",    atl: 0.10, nonatl: 0.20 },
  brokerage_life_insurance: { label: "Commission — Life Insurance Agent",       section: "233",    atl: 0.08, nonatl: 0.16 },
  brokerage_general:    { label: "Commission — General",                        section: "233",    atl: 0.12, nonatl: 0.24 },
  sale_distributor:     { label: "Sale to Distributor (Fertilizer)",            section: "236G",   atl: 0.0025, nonatl: 0.007 },
  sale_distributor_other: { label: "Sale to Distributor (Other)",               section: "236G",   atl: 0.005, nonatl: 0.01 },
  sale_retailer:        { label: "Sale to Retailer",                            section: "236H",   atl: 0.005, nonatl: 0.025 },
  function_gathering:   { label: "Functions & Gatherings",                      section: "236CB",  atl: 0.10, nonatl: 0.20 },
  remittance_abroad:    { label: "Remittance Abroad",                           section: "236Y",   atl: 0.05, nonatl: 0.10 },
  bonus_shares:         { label: "Bonus Shares",                                section: "236Z",   atl: 0.10, nonatl: 0.20 },
  cash_withdrawal:      { label: "Cash Withdrawal (Non-ATL only)",              section: "231AB",  atl: 0.00, nonatl: 0.008 },
  auction_goods:        { label: "Public Auction — Goods",                      section: "236A",   atl: 0.10, nonatl: 0.20 },
  auction_property:     { label: "Public Auction — Property",                   section: "236A",   atl: 0.05, nonatl: 0.10 },
  ecommerce_digital:    { label: "E-Commerce — Digital Payment",                section: "236W",   atl: 0.01, nonatl: 0.02 },
  ecommerce_cod:        { label: "E-Commerce — Cash on Delivery",               section: "236W",   atl: 0.02, nonatl: 0.04 },
};

const VEHICLE_FIXED_RATES: Record<string, { label: string; atl: number; nonatl: number }> = {
  upto850:      { label: "Up to 850 cc",      atl: 0,     nonatl: 0 },
  "851_1000":   { label: "851 – 1,000 cc",    atl: 5000,  nonatl: 15000 },
  "1001_1300":  { label: "1,001 – 1,300 cc",  atl: 7500,  nonatl: 22500 },
  "1301_1600":  { label: "1,301 – 1,600 cc",  atl: 12500, nonatl: 37500 },
  "1601_1800":  { label: "1,601 – 1,800 cc",  atl: 18750, nonatl: 56250 },
  "1801_2000":  { label: "1,801 – 2,000 cc",  atl: 25000, nonatl: 75000 },
  "2001_2500":  { label: "2,001 – 2,500 cc",  atl: 37500, nonatl: 112500 },
  "2501_3000":  { label: "2,501 – 3,000 cc",  atl: 50000, nonatl: 150000 },
  above3000:    { label: "Above 3,000 cc",     atl: 62500, nonatl: 187500 },
};

const ANNUAL_VEHICLE_TAX: Record<string, { atl: number; nonatl: number }> = {
  upto850:      { atl: 800,   nonatl: 1600 },
  "851_1000":   { atl: 1500,  nonatl: 3000 },
  "1001_1300":  { atl: 1750,  nonatl: 3500 },
  "1301_1600":  { atl: 2500,  nonatl: 5000 },
  "1601_1800":  { atl: 3750,  nonatl: 7500 },
  "1801_2000":  { atl: 4500,  nonatl: 9000 },
  "2001_2500":  { atl: 10000, nonatl: 20000 },
  "2501_3000":  { atl: 10000, nonatl: 20000 },
  above3000:    { atl: 10000, nonatl: 20000 },
};

// ─── Sub-components ────────────────────────────────────────────────────────────
function InputField({ label, value, onChange, placeholder, hint }: {
  label: string; value: string | number; onChange: (v: string) => void;
  placeholder?: string; hint?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-600 mb-1">{label}</label>
      <input
        type="number" value={value} onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all"
      />
      {hint && <p className="text-[10px] text-slate-400 mt-0.5">{hint}</p>}
    </div>
  );
}

function SelectField({ label, value, onChange, options, hint }: {
  label: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[]; hint?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-600 mb-1">{label}</label>
      <select
        value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all"
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {hint && <p className="text-[10px] text-slate-400 mt-0.5">{hint}</p>}
    </div>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-white rounded-2xl border border-slate-200/60 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_6px_24px_rgba(0,0,0,0.03)] p-5 hover:shadow-[0_1px_3px_rgba(0,0,0,0.06),0_8px_32px_rgba(0,0,0,0.05)] transition-shadow duration-300 ${className}`}>{children}</div>;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-[13px] font-bold text-slate-800 mb-4 flex items-center gap-2"><span className="w-1 h-4 rounded-full bg-gradient-to-b from-blue-500 to-indigo-600 inline-block" />{children}</h3>;
}

function RiskBadge({ level }: { level: "high" | "medium" | "low" | "none" }) {
  const config = {
    high:   { label: "High Risk",   bg: "bg-red-100",    text: "text-red-700",    icon: "🔴" },
    medium: { label: "Medium Risk", bg: "bg-amber-100",  text: "text-amber-700",  icon: "🟠" },
    low:    { label: "Low Risk",    bg: "bg-emerald-100", text: "text-emerald-700", icon: "🟢" },
    none:   { label: "No Exposure", bg: "bg-slate-100",  text: "text-slate-600",  icon: "⚪" },
  }[level];
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold ${config.bg} ${config.text}`}>
      {config.icon} {config.label}
    </span>
  );
}

function TaxRow({ label, amount, sub, highlight }: { label: string; amount: number; sub?: string; highlight?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-2.5 px-3 rounded-lg ${highlight ? "bg-blue-50 border border-blue-100" : "border-b border-slate-50"}`}>
      <div>
        <p className={`text-xs font-semibold ${highlight ? "text-blue-800" : "text-slate-700"}`}>{label}</p>
        {sub && <p className="text-[10px] text-slate-400">{sub}</p>}
      </div>
      <p className={`text-sm font-bold tabular-nums ${amount > 0 ? (highlight ? "text-blue-700" : "text-slate-800") : "text-slate-400"}`}>
        {fmt(amount)}
      </p>
    </div>
  );
}

function AlertBox({ type, children }: { type: "info" | "warn" | "success" | "danger"; children: React.ReactNode }) {
  const cfg = {
    info:    { bg: "bg-blue-50",    border: "border-blue-200",   text: "text-blue-800",    Icon: Info },
    warn:    { bg: "bg-amber-50",   border: "border-amber-200",  text: "text-amber-800",   Icon: AlertTriangle },
    success: { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-800", Icon: CheckCircle2 },
    danger:  { bg: "bg-red-50",     border: "border-red-200",    text: "text-red-800",     Icon: AlertCircle },
  }[type];
  const { bg, border, text, Icon } = cfg;
  return (
    <div className={`flex items-start gap-2 p-3 rounded-xl border ${bg} ${border}`}>
      <Icon className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${text}`} />
      <p className={`text-[11px] leading-relaxed ${text}`}>{children}</p>
    </div>
  );
}

// ─── RATE TABLE SECTIONS ───────────────────────────────────────────────────────
const RATE_TABLE_SECTIONS = [
  { title: "Imports (Sec 148)", rows: ["import_part1","import_part2","import_part2_commercial","import_part3","import_part3_commercial","import_pharma","import_ev_ckd"] },
  { title: "Supplies & Goods (Sec 153(1)(a))", rows: ["supply_company","supply_noncompany","supply_rice_cotton","supply_toll_company","supply_toll_noncompany"] },
  { title: "Services (Sec 153(1)(b))", rows: ["services_it","services_general","services_other"] },
  { title: "Contracts (Sec 153(1)(c))", rows: ["contract_company","contract_noncompany","contract_sportsperson"] },
  { title: "Dividend (Sec 150)", rows: ["dividend_ipp","dividend_reit","dividend_mutual_debt","dividend_mutual_equity","dividend_spv_reit","dividend_spv_other"] },
  { title: "Profit on Debt (Sec 151)", rows: ["profit_bank","profit_govt","profit_other","profit_sukuk_company","profit_sukuk_ind_high","profit_sukuk_ind_low"] },
  { title: "Non-Resident Payments (Sec 152)", rows: ["nonresident_general","nonresident_1a","nonresident_1aa","nonresident_1aaa"] },
  { title: "Exports (Sec 154 / 154A)", rows: ["export_goods","export_indenting","export_services_pseb"] },
  { title: "Rent (Sec 155)", rows: ["rent_company"] },
  { title: "Prizes & Petroleum (Sec 156 / 156A)", rows: ["prize_bond","prize_quiz","petroleum"] },
  { title: "Brokerage & Commission (Sec 233)", rows: ["brokerage_advertising","brokerage_life_insurance","brokerage_general"] },
  { title: "Sales, Functions & Others (Sec 236 series)", rows: ["sale_distributor","sale_distributor_other","sale_retailer","function_gathering","remittance_abroad","bonus_shares","cash_withdrawal","auction_goods","auction_property","ecommerce_digital","ecommerce_cod"] },
];

// ─── TAB DEFINITION ────────────────────────────────────────────────────────────
type TabKey = "docanalyzer" | "exposure" | "income" | "wht" | "salestax" | "property" | "vehicle" | "investment" | "rental" | "rates";

const TABS: { key: TabKey; label: string; icon: any; badge?: string }[] = [
  { key: "docanalyzer", label: "Intelligent Analyzer", icon: FileSearch, badge: "IA" },
  { key: "exposure",  label: "Tax Exposure",  icon: Target },
  { key: "income",    label: "Income Tax",    icon: Banknote },
  { key: "wht",       label: "WHT Calc",      icon: Calculator },
  { key: "salestax",  label: "Sales Tax",     icon: ShoppingCart },
  { key: "property",  label: "Property",      icon: HomeIcon },
  { key: "vehicle",   label: "Vehicle",       icon: Car },
  { key: "investment", label: "Investment",   icon: BarChart3 },
  { key: "rental",    label: "Rental",        icon: Building2 },
  { key: "rates",     label: "Rate Tables",   icon: FileText },
];

// ─── MAIN COMPONENT ────────────────────────────────────────────────────────────
export default function TaxCalculator() {
  const [activeTab, setActiveTab] = useState<TabKey>("docanalyzer");
  const [filerStatus, setFilerStatus] = useState("atl");
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  // ── Doc Analyzer State ─────────────────────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [docFile, setDocFile] = useState<File | null>(null);
  const [docAnalyzing, setDocAnalyzing] = useState(false);
  const [docError, setDocError] = useState<string | null>(null);
  const [docResult, setDocResult] = useState<any>(null);
  const resultScrollRef = useRef<HTMLDivElement>(null);
  const [showScrollUp, setShowScrollUp] = useState(false);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const [docDragOver, setDocDragOver] = useState(false);
  const [docTextInput, setDocTextInput] = useState("");
  const [docTextAnalyzing, setDocTextAnalyzing] = useState(false);
  const [docInputMode, setDocInputMode] = useState<"file" | "text">("file");
  const [calcModalTab, setCalcModalTab] = useState<string | null>(null);

  React.useEffect(() => {
    if (calcModalTab || docResult) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [calcModalTab, docResult]);

  const handleResultScroll = useCallback(() => {
    const el = resultScrollRef.current;
    if (!el) return;
    setShowScrollUp(el.scrollTop > 100);
    setShowScrollDown(el.scrollTop + el.clientHeight < el.scrollHeight - 100);
  }, []);

  useEffect(() => {
    if (docResult) {
      const el = resultScrollRef.current;
      if (el) {
        el.scrollTop = 0;
        setTimeout(handleResultScroll, 100);
      }
    }
  }, [docResult, handleResultScroll]);

  const handleTextAnalyze = useCallback(async () => {
    if (docTextInput.trim().length < 10) {
      setDocError("Please enter at least 10 characters describing the transaction.");
      return;
    }
    setDocError(null);
    setDocResult(null);
    setDocTextAnalyzing(true);
    try {
      const apiBase = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
      const resp = await fetch(`${apiBase}/api/tax-analyze/text`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: docTextInput, filer: filerStatus }),
      });
      const contentType = resp.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        throw new Error(
          resp.status === 502 || resp.status === 503 ? "Intelligent analysis service temporarily unavailable. Please try again." :
          resp.status === 429 ? "Rate limit reached. Please wait and try again." :
          `Server returned an unexpected response (HTTP ${resp.status}).`
        );
      }
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Analysis failed");
      setDocResult(data);
    } catch (err: any) {
      setDocError(err.message || "Failed to analyze text");
    } finally {
      setDocTextAnalyzing(false);
    }
  }, [docTextInput, filerStatus]);

  const handleDocUpload = useCallback(async (file: File) => {
    setDocFile(file);
    setDocError(null);
    setDocResult(null);
    setDocAnalyzing(true);
    try {
      const formData = new FormData();
      formData.append("document", file);
      const apiBase = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
      const resp = await fetch(`${apiBase}/api/tax-analyze?filer=${filerStatus}`, {
        method: "POST",
        body: formData,
      });
      const contentType = resp.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        throw new Error(
          resp.status === 413 ? "File too large. Please reduce file size and try again." :
          resp.status === 502 || resp.status === 503 ? "Intelligent analysis service temporarily unavailable. Please try again in a few seconds." :
          resp.status === 429 ? "Rate limit reached. Please wait a moment and try again." :
          `Server returned an unexpected response (HTTP ${resp.status}). Please try again.`
        );
      }
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Analysis failed");
      setDocResult(data);
    } catch (err: any) {
      setDocError(err.message || "Failed to analyze document");
    } finally {
      setDocAnalyzing(false);
    }
  }, [filerStatus]);

  // ── Exposure Tab State ───────────────────────────────────────────────────────
  const [entityType,    setEntityType]    = useState("company_private");
  const [sector,        setSector]        = useState("services");
  const [atlStatus,     setAtlStatus]     = useState("atl");
  const [pstReg,        setPstReg]        = useState("none");
  const [revenue,       setRevenue]       = useState("50000000");
  const [cogs,          setCogs]          = useState("30000000");
  const [expenses,      setExpenses]      = useState("8000000");
  const [salaryPayroll, setSalaryPayroll] = useState("5000000");
  const [importValue,   setImportValue]   = useState("0");
  const [contractsRcvd, setContractsRcvd] = useState("0");
  const [servicesRcvd,  setServicesRcvd]  = useState("0");
  const [advancePaidExp, setAdvancePaidExp] = useState("0");
  const [whtCreditsExp,  setWhtCreditsExp]  = useState("0");
  const [inputTaxPaid,   setInputTaxPaid]   = useState("0");
  const [showExposure, setShowExposure] = useState(false);

  // ── Income Tab State ─────────────────────────────────────────────────────────
  const [salaryType,    setSalaryType]    = useState("company");
  const [salaryIncome,  setSalaryIncome]  = useState("3500000");
  const [advancePaid,   setAdvancePaid]   = useState("0");
  const [whtCredits,    setWhtCredits]    = useState("0");
  const [turnoverIT,    setTurnoverIT]    = useState("50000000");

  // ── WHT Tab State ────────────────────────────────────────────────────────────
  const [whtType,   setWhtType]   = useState("supply_company");
  const [whtAmount, setWhtAmount] = useState("500000");

  // ── Sales Tax Tab State ──────────────────────────────────────────────────────
  const [stRate,        setStRate]        = useState("0.18");
  const [outputSales,   setOutputSales]   = useState("5000000");
  const [inputPurchases, setInputPurchases] = useState("3000000");
  const [inputTaxRate,  setInputTaxRate]  = useState("0.18");
  const [disallowedPct, setDisallowedPct] = useState("0");
  const [stProvince,    setStProvince]    = useState("federal");
  const [serviceAmt,    setServiceAmt]    = useState("1000000");
  const [pstRate,       setPstRate]       = useState("0.16");

  // ── Property Tab State ───────────────────────────────────────────────────────
  const [propType,  setPropType]  = useState("transfer");
  const [propValue, setPropValue] = useState("45000000");
  const [propFiler, setPropFiler] = useState("atl");

  // ── Vehicle Tab State ────────────────────────────────────────────────────────
  const [vehicleCC,    setVehicleCC]    = useState("1301_1600");
  const [vehicleValue, setVehicleValue] = useState("5000000");

  // ── Investment Tab State ─────────────────────────────────────────────────────
  const [investType,   setInvestType]   = useState("dividend_reit");
  const [investAmount, setInvestAmount] = useState("1000000");

  // ── Rental Tab State ─────────────────────────────────────────────────────────
  const [rentAmount, setRentAmount] = useState("1200000");
  const [rentEntity, setRentEntity] = useState("individual");

  // ── Rate Tables Tab State ────────────────────────────────────────────────────
  const [rateSearch,   setRateSearch]   = useState("");
  const [rateCategory, setRateCategory] = useState("all");
  const [rateTableType, setRateTableType] = useState("wht");

  // ── WHT Result ───────────────────────────────────────────────────────────────
  const whtResult = useMemo(() => {
    const rate = WHT_RATES[whtType];
    if (!rate) return { tax: 0, rateUsed: 0, label: "" };
    const r = filerStatus === "atl" ? rate.atl : rate.nonatl;
    return { tax: n(whtAmount) * r, rateUsed: r, label: rate.label };
  }, [whtType, whtAmount, filerStatus]);

  // ── Income Tax Result ────────────────────────────────────────────────────────
  const incomeResult = useMemo(() => {
    const income = n(salaryIncome);
    const credits = n(advancePaid) + n(whtCredits);
    const turnover = n(turnoverIT);
    let tax = 0;
    let corporate = false;
    let minTaxAmt = 0;
    let superTaxAmt = 0;

    if (salaryType === "company_small") {
      tax = income * 0.21; corporate = true;
    } else if (salaryType === "company_banking") {
      tax = income * 0.39; corporate = true;
    } else if (salaryType === "company") {
      tax = income * 0.29; corporate = true;
    } else if (salaryType === "salaried") {
      tax = calcSalaryTax(income);
    } else {
      tax = calcBusinessIndTax(income);
    }

    if (corporate) {
      minTaxAmt = calcMinimumTax(turnover, true);
      superTaxAmt = calcSuperTax(income, salaryType === "company_banking");
    }

    const effectiveTax = Math.max(tax, minTaxAmt) + superTaxAmt;
    return { tax, minTaxAmt, superTaxAmt, effectiveTax, net: effectiveTax - credits, quarterly: effectiveTax / 4, corporate };
  }, [salaryType, salaryIncome, advancePaid, whtCredits, turnoverIT]);

  // ── Sales Tax Result ─────────────────────────────────────────────────────────
  const salesTaxResult = useMemo(() => {
    const sales = n(outputSales);
    const purchases = n(inputPurchases);
    const sRate = n(stRate);
    const iRate = n(inputTaxRate);
    const dis = n(disallowedPct) / 100;

    const outputTax = sales * sRate;
    const grossInput = purchases * iRate;
    const disallowedInput = grossInput * dis;
    const allowedInput = grossInput - disallowedInput;
    const netPayable = Math.max(0, outputTax - allowedInput);
    const refundable = Math.max(0, allowedInput - outputTax);

    const pstAmt = n(serviceAmt) * n(pstRate);

    return { outputTax, allowedInput, disallowedInput, netPayable, refundable, pstAmt };
  }, [outputSales, inputPurchases, stRate, inputTaxRate, disallowedPct, serviceAmt, pstRate]);

  // ── Property Result ───────────────────────────────────────────────────────────
  const propResult = useMemo(() => {
    const val = n(propValue);
    let rate = 0;
    if (propType === "transfer") {
      if (val <= 50000000)       rate = propFiler === "atl" ? 0.045 : propFiler === "nonatl" ? 0.115 : 0.075;
      else if (val <= 100000000) rate = propFiler === "atl" ? 0.050 : propFiler === "nonatl" ? 0.115 : 0.085;
      else                       rate = propFiler === "atl" ? 0.055 : propFiler === "nonatl" ? 0.115 : 0.095;
    } else {
      if (val <= 50000000)       rate = propFiler === "atl" ? 0.015 : propFiler === "nonatl" ? 0.105 : 0.045;
      else if (val <= 100000000) rate = propFiler === "atl" ? 0.020 : propFiler === "nonatl" ? 0.145 : 0.055;
      else                       rate = propFiler === "atl" ? 0.025 : propFiler === "nonatl" ? 0.185 : 0.065;
    }
    return { tax: val * rate, rate };
  }, [propValue, propType, propFiler]);

  // ── Vehicle Result ────────────────────────────────────────────────────────────
  const vehicleResult = useMemo(() => {
    const fixed = VEHICLE_FIXED_RATES[vehicleCC];
    const annual = ANNUAL_VEHICLE_TAX[vehicleCC];
    const atl = filerStatus === "atl";
    let reg = atl ? fixed.atl : fixed.nonatl;
    let percentTax = vehicleCC === "above3000" ? n(vehicleValue) * (atl ? 0.12 : 0.36) : 0;
    return { registration: reg, percentBased: percentTax, total: reg + percentTax, annual: atl ? annual.atl : annual.nonatl, label: fixed.label };
  }, [vehicleCC, vehicleValue, filerStatus]);

  // ── Exposure Computation ──────────────────────────────────────────────────────
  const exposureResult = useMemo(() => {
    const rev = n(revenue);
    const cogsV = n(cogs);
    const expV = n(expenses);
    const payroll = n(salaryPayroll);
    const imports = n(importValue);
    const contracts = n(contractsRcvd);
    const services = n(servicesRcvd);
    const advPaid = n(advancePaidExp);
    const whtCrd = n(whtCreditsExp);
    const inputTax = n(inputTaxPaid);

    const isCompany = entityType.startsWith("company");
    const isBanking = entityType === "company_banking";
    const isATL = atlStatus === "atl";

    // Taxable income
    const grossProfit = rev - cogsV;
    const taxableIncome = Math.max(0, grossProfit - expV - payroll);

    // Income Tax
    let incomeTax = 0;
    if (entityType === "company_banking")  incomeTax = taxableIncome * 0.39;
    else if (entityType === "company_small") incomeTax = taxableIncome * 0.21;
    else if (isCompany)                    incomeTax = taxableIncome * 0.29;
    else if (entityType === "individual_salaried") incomeTax = calcSalaryTax(taxableIncome);
    else incomeTax = calcBusinessIndTax(taxableIncome);

    // Minimum Tax (Sec 113) for companies
    const minTax = isCompany ? rev * 0.0125 : rev * 0.01;
    const effectiveIncomeTax = Math.max(incomeTax, minTax);

    // Super Tax (Sec 4C)
    const superTax = calcSuperTax(taxableIncome, isBanking);

    // WHT on payroll (Sec 149) — employer's liability
    const payrollWHT = calcSalaryTax(payroll * 0.7); // avg estimate per employee

    // WHT on imports (Sec 148)
    const importRate = isATL ? 0.02 : 0.04;
    const importWHT = imports * importRate;

    // WHT on contracts received (Sec 153)
    const contractRate = isATL ? (isCompany ? 0.075 : 0.075) : 0.15;
    const contractWHT = contracts * contractRate;

    // WHT on services (Sec 153)
    const serviceWHT = services * (isATL ? 0.06 : 0.12);

    // Sales Tax estimate (if registered)
    const hasSalesTax = pstReg !== "none";
    const outputST = hasSalesTax ? rev * 0.18 : 0;
    const inputST = hasSalesTax ? cogsV * 0.18 : 0;
    const netSalesTax = Math.max(0, outputST - inputST - inputTax);

    // Total liability
    const totalLiability = effectiveIncomeTax + superTax + importWHT + contractWHT + serviceWHT + netSalesTax;
    const totalCredits = advPaid + whtCrd;
    const netExposure = Math.max(0, totalLiability - totalCredits);

    // Risk classification
    const riskRatio = rev > 0 ? netExposure / rev : 0;
    const risk: "high" | "medium" | "low" | "none" =
      netExposure === 0 ? "none" : riskRatio > 0.1 ? "high" : riskRatio > 0.05 ? "medium" : "low";

    // Penalty simulation (default surcharge + late filing)
    const lateFilingPenalty = Math.max(40000, effectiveIncomeTax * 0.0025);
    const defaultSurcharge = netExposure * (1 / 12) * 0.12; // KIBOR-linked estimate

    // Suggestions
    const suggestions: { type: "warn" | "danger" | "info"; text: string }[] = [];
    if (!isATL) suggestions.push({ type: "danger", text: "Entity is Non-ATL — all WHT rates are doubled. Ensure ATL compliance to reduce exposure significantly." });
    if (minTax > incomeTax && isCompany) suggestions.push({ type: "warn", text: `Minimum Tax (Sec 113) applies at Rs ${fmt(minTax)} — higher than computed income tax of Rs ${fmt(incomeTax)}.` });
    if (superTax > 0) suggestions.push({ type: "warn", text: `Super Tax (Sec 4C) of Rs ${fmt(superTax)} is applicable. Consider income planning strategies.` });
    if (payroll > 0 && payrollWHT === 0) suggestions.push({ type: "info", text: "No withholding tax on payroll detected. Ensure Sec 149 deduction is being made and deposited." });
    if (imports > 0) suggestions.push({ type: "info", text: `Import WHT (Sec 148) of Rs ${fmt(importWHT)} is deductible against final income tax liability.` });
    if (!hasSalesTax && rev > 10000000) suggestions.push({ type: "warn", text: "Turnover exceeds Rs 10M — verify Sales Tax registration requirement under the Sales Tax Act 1990." });
    if (netExposure > 0) suggestions.push({ type: "danger", text: `Net tax exposure of Rs ${fmt(netExposure)} is unpaid. Late payment will attract ${pct(0.12)} default surcharge.` });

    return {
      taxableIncome, incomeTax, minTax, effectiveIncomeTax, superTax,
      payrollWHT, importWHT, contractWHT, serviceWHT,
      netSalesTax, totalLiability, totalCredits, netExposure,
      risk, lateFilingPenalty, defaultSurcharge, suggestions,
    };
  }, [revenue, cogs, expenses, salaryPayroll, importValue, contractsRcvd, servicesRcvd,
      advancePaidExp, whtCreditsExp, inputTaxPaid, entityType, atlStatus, pstReg]);

  return (
    <div className="min-h-screen bg-[#f8f9fc]">

      {/* ── Header ── */}
      <header className="sticky top-0 z-50 bg-gradient-to-r from-[#1e293b] via-[#1e3a5f] to-[#1e293b] shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/landing">
              <button className="flex items-center gap-1.5 text-sm text-slate-300 hover:text-white transition-colors">
                <ArrowLeft className="w-4 h-4" /> Back
              </button>
            </Link>
            <div className="h-6 w-px bg-white/20" />
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-500/30 ring-2 ring-white/10">
                <Calculator className="w-4.5 h-4.5 text-white" />
              </div>
              <div>
                <h1 className="text-[15px] font-bold text-white leading-tight tracking-tight">Pakistan Tax Calculator</h1>
                <p className="text-[10px] text-blue-200/80 font-medium">Finance Act 2025 • All Tax Heads • Alam & Aulakh CA</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-medium text-blue-200/70 hidden sm:block">Filer Status:</span>
            <div className="flex rounded-xl overflow-hidden text-[11px] font-bold ring-1 ring-white/20 shadow-inner">
              {[{ value: "atl", label: "ATL" }, { value: "nonatl", label: "Non-ATL" }].map((s) => (
                <button key={s.value} onClick={() => setFilerStatus(s.value)}
                  className={`px-4 py-2 transition-all duration-200 ${filerStatus === s.value
                    ? "bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-lg"
                    : "bg-white/10 text-slate-300 hover:bg-white/20"}`}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      {/* ── Tab Bar ── */}
      <div className="bg-white/80 backdrop-blur-md border-b border-slate-200/60 sticky top-16 z-40 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex gap-0.5 overflow-x-auto py-2.5 scrollbar-hide">
            {TABS.map(({ key, label, icon: Icon, badge }) => (
              <button key={key} onClick={() => setActiveTab(key)}
                className={`relative flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all duration-200 ${
                  activeTab === key
                    ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/25 scale-[1.02]"
                    : "text-slate-500 hover:text-slate-800 hover:bg-slate-100/80"
                }`}>
                <Icon className="w-3.5 h-3.5" /> {label}
                {badge && (
                  <span className={`absolute -top-1.5 -right-1.5 px-1.5 py-0.5 rounded-md text-[8px] font-black leading-none shadow-sm ${
                    badge === "IA" ? "bg-gradient-to-r from-violet-500 to-purple-600 text-white" : "bg-emerald-500 text-white"
                  }`}>{badge}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">

        {/* ══════════════════════════════════════════════════════════════════════
            TAB 0 — INTELLIGENT DOCUMENT TAX ANALYZER
            ══════════════════════════════════════════════════════════════════════ */}
        {activeTab === "docanalyzer" && (
          <div className="space-y-6">
            {/* Hero Banner */}
            <div className="relative rounded-xl overflow-hidden bg-gradient-to-r from-[#312e81] via-[#4338ca] to-[#6366f1] px-5 py-4 text-white shadow-md shadow-indigo-500/10">
              <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNCI+PHBhdGggZD0iTTM2IDM0aDR2MWgtNHYtMXptMC04aDR2MWgtNHYtMXptLTE2IDhoNHYxaC00di0xem0wLThoNHYxaC00di0xeiIvPjwvZz48L2c+PC9zdmc+')] opacity-60" />
              <div className="relative flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h2 className="text-base font-bold tracking-tight">Intelligent Tax Analysis Engine</h2>
                    <span className="px-1.5 py-0.5 rounded bg-emerald-400/20 text-emerald-200 text-[8px] font-bold uppercase tracking-wider shrink-0">GPT-4o + OCR</span>
                  </div>
                  <p className="text-indigo-200 text-[11px] leading-relaxed">Describe a transaction or upload a document — our engine maps it to ITO 2001, Sales Tax Act 1990, Provincial ST, FED Act 2005 & Finance Act 2025 with section-wise legal citations.</p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-white/10 backdrop-blur-sm flex items-center justify-center ring-1 ring-white/20 shrink-0">
                  <FileSearch className="w-5 h-5 text-white" />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Input Area */}
              <div className="lg:col-span-2 space-y-4">
                {/* Text Input Area */}
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <textarea
                    value={docTextInput}
                    onChange={e => setDocTextInput(e.target.value)}
                    placeholder={"Describe the transaction or scenario...\n\nExamples:\n• Company ABC (NTN 1234567) received IT consulting services worth PKR 500,000 from XYZ Ltd in Punjab\n• Imported raw materials worth PKR 2,000,000 via Karachi port\n• Paid rent PKR 150,000/month for office in Lahore to an individual landlord\n• Construction contract of PKR 5,000,000 awarded to a non-ATL contractor"}
                    className="w-full h-36 resize-none rounded-xl border border-slate-200 bg-slate-50/50 p-4 text-sm text-slate-700 placeholder:text-slate-400 placeholder:text-[11px] focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all"
                    disabled={docTextAnalyzing || docAnalyzing}
                  />
                  <p className="text-[10px] text-slate-400 mt-2">{docTextInput.length} characters</p>
                </div>

                {/* Divider */}
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-slate-200" />
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">and / or</span>
                  <div className="flex-1 h-px bg-slate-200" />
                </div>

                {/* File Upload Area */}
                <div
                  onDragOver={e => { e.preventDefault(); setDocDragOver(true); }}
                  onDragLeave={() => setDocDragOver(false)}
                  onDrop={e => {
                    e.preventDefault(); setDocDragOver(false);
                    const f = e.dataTransfer.files[0];
                    if (f) { setDocFile(f); }
                  }}
                  onClick={() => !docAnalyzing && fileInputRef.current?.click()}
                  className={`relative rounded-2xl border-2 border-dashed p-8 text-center cursor-pointer transition-all duration-300 group
                    ${docDragOver
                      ? "border-indigo-500 bg-indigo-50 scale-[1.01] shadow-xl shadow-indigo-500/10"
                      : docFile
                        ? "border-emerald-300 bg-gradient-to-b from-emerald-50/50 to-white"
                        : "border-slate-200 bg-white hover:border-indigo-300 hover:bg-gradient-to-b hover:from-indigo-50/30 hover:to-white hover:shadow-lg hover:shadow-indigo-500/5"}`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.xlsx,.xls,.csv"
                    onChange={e => { const f = e.target.files?.[0]; if (f) { setDocFile(f); } }}
                  />
                  {docAnalyzing ? (
                    <div className="space-y-4 py-4">
                      <div className="relative mx-auto w-16 h-16">
                        <div className="absolute inset-0 rounded-full bg-indigo-100 animate-ping opacity-30" />
                        <div className="relative w-16 h-16 rounded-full bg-gradient-to-br from-indigo-100 to-violet-100 flex items-center justify-center">
                          <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
                        </div>
                      </div>
                      <div>
                        <p className="text-sm font-bold text-indigo-700">Intelligent engine is analyzing your document…</p>
                        <p className="text-[11px] text-slate-500 mt-1">Extracting data • Mapping to tax laws • Computing exposure</p>
                      </div>
                      <div className="flex justify-center gap-1.5">
                        {[0,1,2].map(i => (
                          <div key={i} className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3 py-1">
                      <div className="w-12 h-12 mx-auto rounded-2xl bg-gradient-to-br from-slate-100 to-slate-50 flex items-center justify-center group-hover:from-indigo-100 group-hover:to-indigo-50 transition-all duration-300 ring-1 ring-slate-200/60 group-hover:ring-indigo-200/60">
                        <Upload className="w-6 h-6 text-slate-400 group-hover:text-indigo-500 transition-colors duration-300" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-700 group-hover:text-indigo-700 transition-colors">{docFile ? docFile.name : "Drop document here or click to browse"}</p>
                        <p className="text-[11px] text-slate-400 mt-1">Supports PDF, Images (JPG, PNG), Excel (.xlsx), CSV — up to 15MB</p>
                      </div>
                      <div className="flex justify-center gap-2">
                        {["PDF", "JPG", "PNG", "XLSX", "CSV"].map(f => (
                          <span key={f} className="px-2 py-0.5 rounded-md bg-slate-100 text-[9px] font-bold text-slate-500 tracking-wider">{f}</span>
                        ))}
                      </div>
                      {docFile && (
                        <button
                          onClick={e => { e.stopPropagation(); setDocFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                          className="mt-1 px-4 py-1.5 bg-red-50 text-red-600 rounded-lg text-[10px] font-bold hover:bg-red-100 transition-colors"
                        >
                          Remove File
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Unified Analyze Button */}
                <div className="flex justify-end gap-3">
                  {(docFile || docTextInput.trim().length > 0 || docResult || docError) && (
                    <button
                      onClick={() => { setDocFile(null); setDocTextInput(""); setDocResult(null); setDocError(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                      disabled={docAnalyzing || docTextAnalyzing}
                      className="px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      <RefreshCw className="w-3.5 h-3.5" /> Refresh
                    </button>
                  )}
                  <button
                    onClick={() => {
                      if (docFile) {
                        handleDocUpload(docFile);
                      } else if (docTextInput.trim().length >= 10) {
                        handleTextAnalyze();
                      }
                    }}
                    disabled={docAnalyzing || docTextAnalyzing || (!docFile && docTextInput.trim().length < 10)}
                    className="px-8 py-3 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl text-xs font-bold hover:shadow-lg hover:shadow-indigo-500/25 transition-all duration-200 shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {(docAnalyzing || docTextAnalyzing) ? (
                      <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Analyzing…</>
                    ) : (
                      <><Search className="w-3.5 h-3.5" /> Analyze Transaction</>
                    )}
                  </button>
                </div>

                {docError && (
                  <div className="flex items-start gap-3 p-4 rounded-xl border border-red-200 bg-gradient-to-r from-red-50 to-red-50/50 shadow-sm">
                    <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center shrink-0">
                      <AlertCircle className="w-4 h-4 text-red-600" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-red-800">Analysis Failed</p>
                      <p className="text-[11px] text-red-600 mt-0.5">{docError}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Info Panel */}
              <div className="space-y-5">
                <Card>
                  <SectionTitle>Compliance Base</SectionTitle>
                  <div className="space-y-3">
                    {[
                      { heading: "Income Tax Laws", items: ["Income Tax Ordinance, 2001", "Income Tax Rules, 2002", "WHT Regime (Sec 148–236)", "Advance Tax (Sec 147 & Transaction-based)"] },
                      { heading: "Sales Tax (Goods)", items: ["Sales Tax Act, 1990", "Sales Tax Rules, 2006", "ST Special Procedures & SROs", "Withholding Sales Tax Rules"] },
                      { heading: "Provincial ST on Services", items: ["Punjab (PRA) — ST on Services Act, 2012", "Sindh (SRB) — ST on Services Act, 2011", "KPK (KPRA) — KP Finance Act", "Balochistan (BRA) — Revenue Authority Act", "ICT — Tax on Services Ordinance, 2001"] },
                      { heading: "FED & Finance Act", items: ["Federal Excise Act, 2005", "FED Rules & First Schedule", "Finance Act (Latest — Dynamic Rates)"] },
                      { heading: "Schedules & Rates", items: ["Income Tax Schedules (1st–8th)", "Sales Tax Schedules (1st, 2nd, 3rd, 6th)", "Provincial Service Schedules", "FED First Schedule"] },
                      { heading: "Regulatory Framework", items: ["SROs & Notifications (FBR/PRA/SRB)", "Public Rulings & Clarifications", "IRIS / FBR / PRA / SRB Portals"] },
                      { heading: "Special Regimes", items: ["Final Tax Regime (FTR)", "Minimum Tax (Sec 113)", "Super Tax (Sec 4C)", "Retail / Tier-1 POS Regime", "Builders & Developers Regime", "Export Facilitation Schemes"] },
                      { heading: "Cross-Tax Integration", items: ["Income Tax ↔ Sales Tax linkage", "WHT ↔ Adjustable tax reconciliation", "FED ↔ Sales Tax interaction"] },
                    ].map(group => (
                      <div key={group.heading}>
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">{group.heading}</p>
                        <div className="space-y-0.5">
                          {group.items.map(item => (
                            <div key={item} className="flex items-center gap-2 text-[10px] text-slate-600 py-0.5">
                              <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                              <span>{item}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
                <div className="p-4 rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200/60">
                  <div className="flex items-start gap-2.5">
                    <Shield className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[11px] font-bold text-amber-800">Professional Advisory</p>
                      <p className="text-[10px] text-amber-600 mt-0.5 leading-relaxed">Intelligent analysis is for reference only. Always verify with applicable legislation and consult your tax advisor.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ── RESULTS MODAL ─────────────────────────────── */}
            {docResult && (
              <div ref={resultScrollRef} onScroll={handleResultScroll} className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto scroll-smooth" onClick={() => setDocResult(null)}>
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" />

                <div className="relative w-full max-w-5xl mx-4 my-6 sm:my-10 animate-in fade-in slide-in-from-bottom-4 duration-300" onClick={e => e.stopPropagation()}>
                  {(showScrollUp || showScrollDown) && (
                    <div className="fixed right-4 sm:right-8 top-1/2 -translate-y-1/2 z-[110] flex flex-col gap-2">
                      {showScrollUp && (
                        <button
                          onClick={(e) => { e.stopPropagation(); resultScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" }); }}
                          className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-500/30 flex items-center justify-center hover:scale-110 transition-transform animate-in fade-in duration-200"
                          title="Scroll to top"
                        >
                          <ChevronUp className="w-4 h-4" />
                        </button>
                      )}
                      {showScrollDown && (
                        <button
                          onClick={(e) => { e.stopPropagation(); resultScrollRef.current?.scrollTo({ top: resultScrollRef.current.scrollHeight, behavior: "smooth" }); }}
                          className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-500/30 flex items-center justify-center hover:scale-110 transition-transform animate-in fade-in duration-200"
                          title="Scroll to bottom"
                        >
                          <ChevronDown className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  )}
                  {/* Modal Header */}
                  <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 bg-gradient-to-r from-[#312e81] via-[#4338ca] to-[#6366f1] rounded-t-2xl shadow-lg shadow-indigo-900/30">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center backdrop-blur-sm ring-1 ring-white/20">
                        <FileSearch className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <h2 className="text-base font-bold text-white tracking-tight">Tax Analysis Report</h2>
                        <p className="text-[11px] text-indigo-200">{docResult.filename} • {filerStatus === "atl" ? "Active Taxpayer" : "Non-Active Taxpayer"}</p>
                      </div>
                    </div>
                    <button onClick={() => setDocResult(null)} className="w-9 h-9 rounded-xl bg-white/15 hover:bg-white/25 flex items-center justify-center transition-colors">
                      <X className="w-5 h-5 text-white" />
                    </button>
                  </div>

                  {/* Modal Body */}
                  <div className="bg-[#f8f9fc] rounded-b-2xl shadow-2xl">
                    <div className="p-6 space-y-5">

                      {/* Total Exposure Summary - Top */}
                      {docResult.total_tax_exposure && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 p-5 text-white shadow-xl shadow-blue-500/15">
                            <div className="absolute top-0 right-0 w-20 h-20 bg-white/5 rounded-full -translate-y-6 translate-x-6" />
                            <div className="relative">
                              <div className="flex items-center gap-2 mb-1.5">
                                <CheckCircle2 className="w-3.5 h-3.5 text-blue-200" />
                                <p className="text-[10px] font-bold uppercase tracking-wider text-blue-200">Total Tax — ATL</p>
                              </div>
                              <p className="text-2xl font-bold tabular-nums tracking-tight">{fmt(docResult.total_tax_exposure.atl ?? 0)}</p>
                              <p className="text-[10px] text-blue-200/80 mt-0.5">Active Taxpayer List rate</p>
                            </div>
                          </div>
                          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-red-500 to-rose-700 p-5 text-white shadow-xl shadow-red-500/15">
                            <div className="absolute top-0 right-0 w-20 h-20 bg-white/5 rounded-full -translate-y-6 translate-x-6" />
                            <div className="relative">
                              <div className="flex items-center gap-2 mb-1.5">
                                <AlertTriangle className="w-3.5 h-3.5 text-red-200" />
                                <p className="text-[10px] font-bold uppercase tracking-wider text-red-200">Total Tax — Non-ATL</p>
                              </div>
                              <p className="text-2xl font-bold tabular-nums tracking-tight">{fmt(docResult.total_tax_exposure.non_atl ?? 0)}</p>
                              <p className="text-[10px] text-red-200/80 mt-0.5">Non-ATL higher withholding rate</p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Document Summary */}
                      {docResult.document_summary && (
                        <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-5">
                          <h3 className="text-[13px] font-bold text-slate-800 mb-3 flex items-center gap-2"><span className="w-1 h-4 rounded-full bg-gradient-to-b from-blue-500 to-indigo-600 inline-block" />Document Summary</h3>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            {[
                              { l: "Type", v: docResult.document_summary.document_type, icon: FileText, c: "from-blue-50 to-blue-100/50 border-blue-200/40" },
                              { l: "Nature", v: docResult.document_summary.nature, icon: Layers, c: "from-violet-50 to-violet-100/50 border-violet-200/40" },
                              { l: "Date", v: docResult.document_summary.date || "—", icon: ClipboardList, c: "from-slate-50 to-slate-100/50 border-slate-200/40" },
                              { l: "Total Amount", v: docResult.document_summary.total_amount ? fmt(docResult.document_summary.total_amount) : "—", icon: Banknote, c: "from-emerald-50 to-emerald-100/50 border-emerald-200/40" },
                            ].map(f => (
                              <div key={f.l} className={`bg-gradient-to-br ${f.c} rounded-xl p-3 border`}>
                                <div className="flex items-center gap-1.5 mb-1">
                                  <f.icon className="w-3 h-3 text-slate-400" />
                                  <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">{f.l}</p>
                                </div>
                                <p className="text-[12px] font-bold text-slate-800">{f.v}</p>
                              </div>
                            ))}
                          </div>
                          {docResult.document_summary.parties?.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-slate-100">
                              <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider mb-1.5">Involved Parties</p>
                              <div className="flex flex-wrap gap-2">
                                {docResult.document_summary.parties.map((p: any, i: number) => (
                                  <span key={i} className="text-[10px] bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-700 border border-blue-200/60 px-2.5 py-1 rounded-lg font-semibold">
                                    {p.name} {p.ntn_cnic ? `(${p.ntn_cnic})` : ""} — <span className="text-blue-500">{p.role}</span>
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Extracted Line Items */}
                      {docResult.extracted_items?.length > 0 && (
                        <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-5">
                          <h3 className="text-[13px] font-bold text-slate-800 mb-3 flex items-center gap-2"><span className="w-1 h-4 rounded-full bg-gradient-to-b from-blue-500 to-indigo-600 inline-block" />Extracted Items</h3>
                          <div className="overflow-x-auto rounded-xl border border-slate-100">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="bg-slate-50/80">
                                  <th className="text-left py-2.5 px-3 text-[10px] font-bold text-slate-500 uppercase">Description</th>
                                  <th className="text-right py-2.5 px-3 text-[10px] font-bold text-slate-500 uppercase">Gross</th>
                                  <th className="text-right py-2.5 px-3 text-[10px] font-bold text-slate-500 uppercase">Tax</th>
                                  <th className="text-right py-2.5 px-3 text-[10px] font-bold text-slate-500 uppercase">Net</th>
                                </tr>
                              </thead>
                              <tbody>
                                {docResult.extracted_items.map((item: any, i: number) => (
                                  <tr key={i} className="border-t border-slate-50 hover:bg-slate-50/50">
                                    <td className="py-2 px-3 text-slate-700 font-medium">{item.description}</td>
                                    <td className="py-2 px-3 text-right tabular-nums">{item.gross_amount ? fmt(item.gross_amount) : "—"}</td>
                                    <td className="py-2 px-3 text-right tabular-nums text-red-600">{item.tax_amount ? fmt(item.tax_amount) : "—"}</td>
                                    <td className="py-2 px-3 text-right tabular-nums font-semibold">{item.net_amount ? fmt(item.net_amount) : "—"}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {/* Tax Analysis Table */}
                      {docResult.tax_analysis?.length > 0 && (
                        <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden">
                          <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
                            <h3 className="text-[13px] font-bold text-slate-800 flex items-center gap-2"><span className="w-1 h-4 rounded-full bg-gradient-to-b from-blue-500 to-indigo-600 inline-block" />Tax Exposure Analysis</h3>
                            <span className="text-[10px] font-semibold text-violet-600 bg-violet-50 px-2.5 py-1 rounded-lg">
                              {docResult.tax_analysis.length} tax head{docResult.tax_analysis.length > 1 ? "s" : ""} identified
                            </span>
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="bg-slate-50/80">
                                  <th className="text-left py-2.5 px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Tax Type</th>
                                  <th className="text-left py-2.5 px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Law / Section</th>
                                  <th className="text-left py-2.5 px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Nature</th>
                                  <th className="text-right py-2.5 px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Rate</th>
                                  <th className="text-right py-2.5 px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Tax Amount</th>
                                  <th className="text-center py-2.5 px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Adjust.</th>
                                  <th className="text-center py-2.5 px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Basis</th>
                                  <th className="text-center py-2.5 px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Risk</th>
                                </tr>
                              </thead>
                              <tbody>
                                {docResult.tax_analysis.map((t: any, i: number) => {
                                  const isHigh = t.risk_flag?.toLowerCase() === "high";
                                  const isMed = t.risk_flag?.toLowerCase() === "medium";
                                  const isInsufficient = t.legal_basis?.toLowerCase().includes("insufficient");
                                  return (
                                    <tr key={i} className={`border-t border-slate-50 hover:bg-slate-50/50 ${isHigh ? "bg-red-50/40" : ""}`}>
                                      <td className="py-2.5 px-3 font-semibold text-slate-800">{t.tax_type}</td>
                                      <td className="py-2.5 px-3">
                                        <div className="text-slate-800 font-medium">{t.section_reference}</div>
                                        {t.applicable_law && <div className="text-[9px] text-slate-400 mt-0.5">{t.applicable_law}</div>}
                                      </td>
                                      <td className="py-2.5 px-3 text-slate-600 max-w-48 truncate" title={t.nature_of_transaction}>{t.nature_of_transaction}</td>
                                      <td className="py-2.5 px-3 text-right font-bold text-blue-700 tabular-nums">
                                        {filerStatus === "atl" ? t.atl_rate : t.non_atl_rate}
                                      </td>
                                      <td className="py-2.5 px-3 text-right font-bold tabular-nums text-slate-800">
                                        {fmt(filerStatus === "atl" ? (t.tax_amount_atl ?? 0) : (t.tax_amount_non_atl ?? 0))}
                                      </td>
                                      <td className="py-2.5 px-3 text-center">
                                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                                          t.adjustability === "Final" ? "bg-red-100 text-red-700" :
                                          t.adjustability === "Minimum" ? "bg-amber-100 text-amber-700" :
                                          "bg-green-100 text-green-700"
                                        }`}>{t.adjustability}</span>
                                      </td>
                                      <td className="py-2.5 px-3 text-center">
                                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                                          isInsufficient ? "bg-orange-100 text-orange-700" : "bg-emerald-100 text-emerald-700"
                                        }`}>{isInsufficient ? "Review" : "Confirmed"}</span>
                                      </td>
                                      <td className="py-2.5 px-3 text-center">
                                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                                          isHigh ? "bg-red-100 text-red-700" :
                                          isMed ? "bg-amber-100 text-amber-700" :
                                          "bg-green-100 text-green-700"
                                        }`}>{t.risk_flag}</span>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>

                          {/* Source Text / Legal Citations */}
                          {docResult.tax_analysis.some((t: any) => t.source_text) && (
                            <div className="px-5 py-3 border-t border-slate-100 space-y-2">
                              <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mb-1">Legal Citations</p>
                              {docResult.tax_analysis.filter((t: any) => t.source_text).map((t: any, i: number) => (
                                <div key={i} className="flex items-start gap-2 text-[10px] p-2.5 rounded-lg bg-indigo-50/60 text-indigo-800 border border-indigo-100/60">
                                  <BookOpen className="w-3 h-3 shrink-0 mt-0.5 text-indigo-400" />
                                  <span><strong>{t.section_reference}:</strong> {t.source_text}</span>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Conditions / Notes per tax row */}
                          <div className="px-5 py-3 border-t border-slate-100 space-y-2">
                            {docResult.tax_analysis.filter((t: any) => t.conditions || t.risk_reason).map((t: any, i: number) => (
                              <div key={i} className={`flex items-start gap-2 text-[10px] p-2 rounded-lg ${
                                t.risk_flag?.toLowerCase() === "high" ? "bg-red-50 text-red-700" : "bg-slate-50 text-slate-600"
                              }`}>
                                <Info className="w-3 h-3 shrink-0 mt-0.5" />
                                <span><strong>{t.tax_type}:</strong> {t.conditions}{t.risk_reason ? ` — ${t.risk_reason}` : ""}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Compliance Notes */}
                      {docResult.compliance_notes?.length > 0 && (
                        <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-5">
                          <h3 className="text-[13px] font-bold text-slate-800 mb-3 flex items-center gap-2"><span className="w-1 h-4 rounded-full bg-gradient-to-b from-amber-500 to-orange-600 inline-block" />Compliance Notes & Advisory</h3>
                          <div className="space-y-2">
                            {docResult.compliance_notes.map((note: string, i: number) => (
                              <div key={i} className="flex items-start gap-3 text-[11px] text-slate-700 p-3 rounded-xl bg-gradient-to-r from-amber-50 to-orange-50/50 border border-amber-200/50">
                                <div className="w-5 h-5 rounded-md bg-amber-100 flex items-center justify-center shrink-0">
                                  <AlertTriangle className="w-2.5 h-2.5 text-amber-600" />
                                </div>
                                <span className="leading-relaxed">{note}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Missing Tax Check */}
                      {docResult.missing_tax_check?.length > 0 && (
                        <div className="bg-white rounded-2xl border border-red-200/60 shadow-sm p-5">
                          <h3 className="text-[13px] font-bold text-red-800 mb-3 flex items-center gap-2"><span className="w-1 h-4 rounded-full bg-gradient-to-b from-red-500 to-rose-600 inline-block" />Non-Compliance / Missing Tax Deductions</h3>
                          <div className="space-y-2">
                            {docResult.missing_tax_check.map((item: string, i: number) => (
                              <div key={i} className="flex items-start gap-3 text-[11px] text-red-800 p-3 rounded-xl bg-gradient-to-r from-red-50 to-rose-50/50 border border-red-200/50">
                                <div className="w-5 h-5 rounded-md bg-red-100 flex items-center justify-center shrink-0">
                                  <ShieldAlert className="w-2.5 h-2.5 text-red-600" />
                                </div>
                                <span className="leading-relaxed">{item}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Modal Footer */}
                    <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200/60 bg-white rounded-b-2xl">
                      <p className="text-[10px] text-slate-400">Law-integrated Intelligent analysis — always verify with applicable legislation</p>
                      <div className="flex gap-3">
                        <button
                          onClick={() => { setDocResult(null); setDocFile(null); setDocError(null); }}
                          className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl text-xs font-bold hover:shadow-lg hover:shadow-indigo-500/25 transition-all duration-200 flex items-center gap-2"
                        >
                          <RefreshCw className="w-3.5 h-3.5" /> Analyze Another
                        </button>
                        <button
                          onClick={() => setDocResult(null)}
                          className="px-5 py-2.5 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-200 transition-colors flex items-center gap-2"
                        >
                          <X className="w-3.5 h-3.5" /> Close
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            TAB 1 — TAX EXPOSURE CALCULATOR
            ══════════════════════════════════════════════════════════════════════ */}
        {activeTab === "exposure" && (
          <div className="space-y-5">
            <Card>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center text-white text-[10px] font-bold">1</div>
                <SectionTitle>Entity Profile</SectionTitle>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <SelectField label="Entity Type" value={entityType} onChange={setEntityType} options={[
                  { value: "individual_salaried",  label: "Individual — Salaried (75%+ salary)" },
                  { value: "individual_business",  label: "Individual — Business / AOP" },
                  { value: "company_private",      label: "Private Company (29%)" },
                  { value: "company_small",        label: "Small Company (21%)" },
                  { value: "company_listed",       label: "Listed Company (29%)" },
                  { value: "company_banking",      label: "Banking Company (39%)" },
                  { value: "npo",                  label: "NPO / Trust" },
                ]} />
                <SelectField label="Sector" value={sector} onChange={setSector} options={[
                  { value: "services",       label: "Services" },
                  { value: "manufacturing",  label: "Manufacturing" },
                  { value: "trading",        label: "Trading / Wholesale" },
                  { value: "banking",        label: "Banking & Finance" },
                  { value: "it",             label: "IT / IT-Enabled" },
                  { value: "construction",   label: "Construction" },
                  { value: "export",         label: "Export" },
                  { value: "npo",            label: "NPO / Charity" },
                ]} />
                <SelectField label="ATL / Filer Status" value={atlStatus} onChange={setAtlStatus} options={[
                  { value: "atl",     label: "ATL — Active Taxpayer" },
                  { value: "late",    label: "Late Filer" },
                  { value: "nonatl",  label: "Non-Filer / Non-ATL" },
                ]} />
                <SelectField label="Sales Tax / PST Registration" value={pstReg} onChange={setPstReg} options={[
                  { value: "none",    label: "Not Registered" },
                  { value: "federal", label: "Federal — Sales Tax (FBR)" },
                  { value: "punjab",  label: "Punjab Revenue Authority (PRA)" },
                  { value: "sindh",   label: "Sindh Revenue Board (SRB)" },
                  { value: "ict",     label: "ICT (Islamabad)" },
                ]} />
              </div>
            </Card>
            <Card>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center text-white text-[10px] font-bold">2</div>
                <SectionTitle>Financial Data (Annual)</SectionTitle>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <InputField label="Total Revenue / Turnover (Rs)" value={revenue} onChange={setRevenue} />
                <InputField label="Cost of Goods Sold (Rs)" value={cogs} onChange={setCogs} />
                <InputField label="Operating Expenses (Rs)" value={expenses} onChange={setExpenses} />
                <InputField label="Salaries & Payroll (Rs)" value={salaryPayroll} onChange={setSalaryPayroll} />
                <InputField label="Import Value (Rs)" value={importValue} onChange={setImportValue} />
                <InputField label="Contracts Received (Rs)" value={contractsRcvd} onChange={setContractsRcvd} />
                <InputField label="Services Rendered (Rs)" value={servicesRcvd} onChange={setServicesRcvd} />
              </div>
            </Card>
            <Card>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-6 h-6 rounded-full bg-emerald-600 flex items-center justify-center text-white text-[10px] font-bold">3</div>
                <SectionTitle>Taxes Already Paid / Adjustable Credits</SectionTitle>
              </div>
              <div className="grid sm:grid-cols-3 gap-4">
                <InputField label="Advance Tax Paid (Rs)" value={advancePaidExp} onChange={setAdvancePaidExp} />
                <InputField label="WHT Credits (Rs)" value={whtCreditsExp} onChange={setWhtCreditsExp} />
                <InputField label="Input Sales Tax (Rs)" value={inputTaxPaid} onChange={setInputTaxPaid} />
              </div>
            </Card>
            <button onClick={() => { setShowExposure(true); setCalcModalTab("exposure"); }}
              className="w-full py-4 rounded-2xl bg-gradient-to-r from-blue-600 to-blue-700 text-white font-bold text-sm shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50 hover:from-blue-700 hover:to-blue-800 transition-all flex items-center justify-center gap-2">
              <Calculator className="w-5 h-5" /> Calculate
            </button>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            TAB 2 — INCOME TAX ENGINE
            ══════════════════════════════════════════════════════════════════════ */}
        {activeTab === "income" && (
          <div className="space-y-5">
            <Card>
              <SectionTitle>Income Tax Calculator</SectionTitle>
              <div className="space-y-4">
                <SelectField label="Taxpayer Category" value={salaryType} onChange={setSalaryType} options={[
                  { value: "salaried",        label: "Individual — Salaried (75%+ from salary)" },
                  { value: "business",        label: "Individual — Business / AOP" },
                  { value: "company",         label: "Private / Listed Company (29%)" },
                  { value: "company_small",   label: "Small Company (21%)" },
                  { value: "company_banking", label: "Banking Company (39%)" },
                ]} />
                <InputField label="Annual Taxable Income (Rs)" value={salaryIncome} onChange={setSalaryIncome} />
                {(salaryType === "company" || salaryType === "company_small" || salaryType === "company_banking") && (
                  <InputField label="Annual Turnover / Revenue (Rs)" value={turnoverIT} onChange={setTurnoverIT} />
                )}
                <InputField label="Advance Tax Paid — Sec 147 (Rs)" value={advancePaid} onChange={setAdvancePaid} />
                <InputField label="WHT Credits Adjustable (Rs)" value={whtCredits} onChange={setWhtCredits} />
              </div>
            </Card>
            <button onClick={() => setCalcModalTab("income")}
              className="w-full py-4 rounded-2xl bg-gradient-to-r from-blue-600 to-blue-700 text-white font-bold text-sm shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50 hover:from-blue-700 hover:to-blue-800 transition-all flex items-center justify-center gap-2">
              <Calculator className="w-5 h-5" /> Calculate
            </button>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            TAB 3 — WHT CALCULATOR
            ══════════════════════════════════════════════════════════════════════ */}
        {activeTab === "wht" && (
          <div className="space-y-5">
            <Card>
              <SectionTitle>Withholding Tax Calculator</SectionTitle>
              <div className="space-y-4">
                <SelectField label="WHT Section / Transaction Type" value={whtType} onChange={setWhtType}
                  options={Object.entries(WHT_RATES).map(([k, v]) => ({ value: k, label: `Sec ${v.section} — ${v.label}` }))}
                />
                <InputField label="Transaction Amount (Rs)" value={whtAmount} onChange={setWhtAmount} placeholder="Enter gross amount" />
              </div>
            </Card>
            <button onClick={() => setCalcModalTab("wht")}
              className="w-full py-4 rounded-2xl bg-gradient-to-r from-blue-600 to-blue-700 text-white font-bold text-sm shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50 hover:from-blue-700 hover:to-blue-800 transition-all flex items-center justify-center gap-2">
              <Calculator className="w-5 h-5" /> Calculate
            </button>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            TAB 4 — SALES TAX ENGINE
            ══════════════════════════════════════════════════════════════════════ */}
        {activeTab === "salestax" && (
          <div className="space-y-5">
            <Card>
              <SectionTitle>Sales Tax on Goods (Federal — STA 1990)</SectionTitle>
              <div className="space-y-4">
                <SelectField label="Output Sales Tax Rate" value={stRate} onChange={setStRate} options={[
                  { value: "0.18", label: "18% — Standard Rate" },
                  { value: "0.17", label: "17% — Specified Goods" },
                  { value: "0.25", label: "25% — Luxury / Specified" },
                  { value: "0.10", label: "10% — Reduced Rate" },
                  { value: "0.05", label: "5% — Specified Category" },
                  { value: "0.00", label: "0% — Zero-rated / Exempt" },
                ]} />
                <InputField label="Taxable Sales (Rs)" value={outputSales} onChange={setOutputSales} />
                <InputField label="Taxable Purchases / Inputs (Rs)" value={inputPurchases} onChange={setInputPurchases} />
                <SelectField label="Input Tax Rate" value={inputTaxRate} onChange={setInputTaxRate} options={[
                  { value: "0.18", label: "18% Standard" },
                  { value: "0.17", label: "17%" },
                  { value: "0.10", label: "10%" },
                  { value: "0.05", label: "5%" },
                ]} />
                <InputField label="Disallowed Input Tax (%)" value={disallowedPct} onChange={setDisallowedPct} />
              </div>
            </Card>
            <Card>
              <SectionTitle>Provincial Services Tax (PST)</SectionTitle>
              <div className="space-y-4">
                <SelectField label="Province / Authority" value={stProvince} onChange={setStProvince} options={[
                  { value: "punjab",  label: "Punjab Revenue Authority (PRA) — 16%" },
                  { value: "sindh",   label: "Sindh Revenue Board (SRB) — 13-15%" },
                  { value: "ict",     label: "ICT (Islamabad) — 15%" },
                  { value: "kpk",     label: "KPK Revenue Authority (KPKRA) — 15%" },
                  { value: "baloch",  label: "Balochistan (BRA) — 15%" },
                ]} />
                <SelectField label="PST Rate" value={pstRate} onChange={setPstRate} options={[
                  { value: "0.16", label: "16% — Punjab (PRA)" },
                  { value: "0.15", label: "15% — KPK / ICT / Balochistan" },
                  { value: "0.13", label: "13% — Sindh (SRB) Standard" },
                  { value: "0.05", label: "5% — Reduced Rate Services" },
                ]} />
                <InputField label="Service Value (Rs)" value={serviceAmt} onChange={setServiceAmt} />
              </div>
            </Card>
            <button onClick={() => setCalcModalTab("salestax")}
              className="w-full py-4 rounded-2xl bg-gradient-to-r from-blue-600 to-blue-700 text-white font-bold text-sm shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50 hover:from-blue-700 hover:to-blue-800 transition-all flex items-center justify-center gap-2">
              <Calculator className="w-5 h-5" /> Calculate
            </button>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            TAB 5 — PROPERTY TAX
            ══════════════════════════════════════════════════════════════════════ */}
        {activeTab === "property" && (
          <div className="space-y-5">
            <Card>
              <SectionTitle>Property Tax Calculator (Sec 236C / 236K)</SectionTitle>
              <div className="space-y-4">
                <SelectField label="Transaction Type" value={propType} onChange={setPropType} options={[
                  { value: "transfer", label: "Transfer of Property (Seller) — Sec 236C" },
                  { value: "purchase", label: "Purchase of Property (Buyer) — Sec 236K" },
                ]} />
                <InputField label="Property Value / Consideration (Rs)" value={propValue} onChange={setPropValue} />
                <SelectField label="Filer Status" value={propFiler} onChange={setPropFiler} options={[
                  { value: "atl",    label: "ATL — Active Taxpayer" },
                  { value: "nonatl", label: "Non-ATL / Non-Filer" },
                  { value: "late",   label: "Late Filer" },
                ]} />
              </div>
            </Card>
            <button onClick={() => setCalcModalTab("property")}
              className="w-full py-4 rounded-2xl bg-gradient-to-r from-blue-600 to-blue-700 text-white font-bold text-sm shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50 hover:from-blue-700 hover:to-blue-800 transition-all flex items-center justify-center gap-2">
              <Calculator className="w-5 h-5" /> Calculate
            </button>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            TAB 6 — VEHICLE TAX
            ══════════════════════════════════════════════════════════════════════ */}
        {activeTab === "vehicle" && (
          <div className="space-y-5">
            <Card>
              <SectionTitle>Motor Vehicle Tax (Sec 231B / 234)</SectionTitle>
              <div className="space-y-4">
                <SelectField label="Engine Capacity (cc)" value={vehicleCC} onChange={setVehicleCC}
                  options={Object.entries(VEHICLE_FIXED_RATES).map(([k, v]) => ({ value: k, label: v.label }))} />
                {vehicleCC === "above3000" && (
                  <InputField label="Vehicle Value (Rs)" value={vehicleValue} onChange={setVehicleValue} />
                )}
              </div>
            </Card>
            <button onClick={() => setCalcModalTab("vehicle")}
              className="w-full py-4 rounded-2xl bg-gradient-to-r from-blue-600 to-blue-700 text-white font-bold text-sm shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50 hover:from-blue-700 hover:to-blue-800 transition-all flex items-center justify-center gap-2">
              <Calculator className="w-5 h-5" /> Calculate
            </button>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            TAB 7 — INVESTMENT INCOME
            ══════════════════════════════════════════════════════════════════════ */}
        {activeTab === "investment" && (
          <div className="space-y-5">
            <Card>
              <SectionTitle>Investment Income Tax (Sec 150 / 151)</SectionTitle>
              <div className="space-y-4">
                <SelectField label="Investment / Income Type" value={investType} onChange={setInvestType}
                  options={[
                    { value: "dividend_ipp",         label: "Dividend — IPPs" },
                    { value: "dividend_reit",         label: "Dividend — REIT / General" },
                    { value: "dividend_mutual_debt",  label: "Dividend — Mutual Fund (Debt >50%)" },
                    { value: "dividend_mutual_equity", label: "Dividend — Mutual Fund (Equity)" },
                    { value: "dividend_spv_reit",     label: "Dividend — REIT from SPV (Exempt)" },
                    { value: "dividend_spv_other",    label: "Dividend — Others from SPV" },
                    { value: "profit_bank",           label: "Profit on Debt — Bank Deposit" },
                    { value: "profit_govt",           label: "Profit — Govt Securities" },
                    { value: "profit_other",          label: "Profit on Debt — Other" },
                    { value: "profit_sukuk_company",  label: "Sukuk — Company Holder" },
                    { value: "profit_sukuk_ind_high", label: "Sukuk — Individual (>1M)" },
                    { value: "profit_sukuk_ind_low",  label: "Sukuk — Individual (<1M)" },
                  ]}
                />
                <InputField label="Income Amount (Rs)" value={investAmount} onChange={setInvestAmount} />
              </div>
            </Card>
            <button onClick={() => setCalcModalTab("investment")}
              className="w-full py-4 rounded-2xl bg-gradient-to-r from-blue-600 to-blue-700 text-white font-bold text-sm shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50 hover:from-blue-700 hover:to-blue-800 transition-all flex items-center justify-center gap-2">
              <Calculator className="w-5 h-5" /> Calculate
            </button>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            TAB 8 — RENTAL INCOME
            ══════════════════════════════════════════════════════════════════════ */}
        {activeTab === "rental" && (
          <div className="space-y-5">
            <Card>
              <SectionTitle>Rental Income Tax (Sec 155)</SectionTitle>
              <div className="space-y-4">
                <SelectField label="Entity Type" value={rentEntity} onChange={setRentEntity} options={[
                  { value: "individual", label: "Individual / AOP" },
                  { value: "company",    label: "Company" },
                ]} />
                <InputField label="Annual Rent Received (Rs)" value={rentAmount} onChange={setRentAmount} />
              </div>
            </Card>
            <button onClick={() => setCalcModalTab("rental")}
              className="w-full py-4 rounded-2xl bg-gradient-to-r from-blue-600 to-blue-700 text-white font-bold text-sm shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50 hover:from-blue-700 hover:to-blue-800 transition-all flex items-center justify-center gap-2">
              <Calculator className="w-5 h-5" /> Calculate
            </button>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            TAB 9 — RATE TABLES
            ══════════════════════════════════════════════════════════════════════ */}
        {activeTab === "rates" && (() => {
          // Build flat WHT rows with category
          const allWhtRows = RATE_TABLE_SECTIONS.flatMap(section =>
            section.rows.map(key => {
              const r = WHT_RATES[key];
              return r ? { key, label: r.label, section: r.section, atl: r.atl, nonatl: r.nonatl, category: section.title } : null;
            }).filter(Boolean)
          ) as { key: string; label: string; section: string; atl: number; nonatl: number; category: string }[];

          const q = rateSearch.toLowerCase().trim();
          const filteredWht = allWhtRows.filter(r =>
            (rateCategory === "all" || r.category === rateCategory) &&
            (!q || r.label.toLowerCase().includes(q) || r.section.toLowerCase().includes(q) || r.category.toLowerCase().includes(q))
          );

          const slabTables = [
            {
              key: "salaried", label: "Salaried Individual", ref: "Div-I, Part-I, First Schedule",
              cols: ["Taxable Income (Rs)", "Base Tax (Rs)", "Rate on Excess"],
              rows: SALARY_SLABS.map(s => [
                s.max === Infinity ? `Above ${fmt(s.min - 1)}` : `${fmt(s.min)} – ${fmt(s.max)}`,
                fmt(s.base ?? 0), pct(s.rate)
              ])
            },
            {
              key: "business", label: "Business Individual / AOP", ref: "Div-I, Part-I",
              cols: ["Taxable Income (Rs)", "Base Tax (Rs)", "Rate on Excess"],
              rows: BUSINESS_IND_SLABS.map(s => [
                s.max === Infinity ? `Above ${fmt(s.min - 1)}` : `${fmt(s.min)} – ${fmt(s.max)}`,
                fmt(s.base ?? 0), pct(s.rate)
              ])
            },
            {
              key: "supertax", label: "Super Tax (Sec 4C)", ref: "Finance Act 2025",
              cols: ["Income (Rs)", "Super Tax Rate"],
              rows: SUPER_TAX_SLABS.map(s => [
                s.max === Infinity ? `Above ${fmt(s.min - 1)}` : `${fmt(s.min)} – ${fmt(s.max)}`,
                pct(s.rate)
              ])
            },
            {
              key: "vehicle_token", label: "Motor Vehicle Token Tax (Annual)", ref: "Sec 231B",
              cols: ["Engine Capacity", "ATL (Rs/year)", "Non-ATL (Rs/year)"],
              rows: Object.entries(ANNUAL_VEHICLE_TAX).map(([k, v]) => [
                VEHICLE_FIXED_RATES[k]?.label ?? k, fmt(v.atl), fmt(v.nonatl)
              ])
            },
          ];

          const filteredSlabs = slabTables.filter(t =>
            !q || t.label.toLowerCase().includes(q) || t.ref.toLowerCase().includes(q) ||
            t.rows.some(r => r.some(cell => cell.toLowerCase().includes(q)))
          );

          return (
            <div className="space-y-4">
              {/* Controls Bar */}
              <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4">
                <div className="flex flex-col sm:flex-row gap-3">
                  {/* Search */}
                  <div className="flex-1 relative">
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                    <input
                      type="text" value={rateSearch} onChange={e => setRateSearch(e.target.value)}
                      placeholder="Search by description, section or category…"
                      className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 focus:bg-white transition-all"
                    />
                  </div>
                  {/* Table type */}
                  <div className="flex gap-1.5 flex-wrap">
                    {[
                      { v: "wht", l: "WHT Rates" },
                      { v: "slabs", l: "Income Tax Slabs" },
                    ].map(t => (
                      <button key={t.v} onClick={() => { setRateTableType(t.v); setRateSearch(""); setRateCategory("all"); }}
                        className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${rateTableType === t.v ? "bg-blue-600 text-white border-blue-600 shadow-sm" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>
                        {t.l}
                      </button>
                    ))}
                  </div>
                  {/* ATL badge */}
                  <div className={`self-center px-2.5 py-1.5 rounded-xl text-[10px] font-bold border ${filerStatus === "atl" ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-red-50 text-red-700 border-red-200"}`}>
                    {filerStatus === "atl" ? "ATL" : "Non-ATL"}
                  </div>
                </div>

                {/* Category filter — only for WHT */}
                {rateTableType === "wht" && (
                  <div className="mt-3 flex gap-1.5 flex-wrap">
                    <button onClick={() => setRateCategory("all")}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold border transition-all ${rateCategory === "all" ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>
                      All ({allWhtRows.length})
                    </button>
                    {RATE_TABLE_SECTIONS.map(s => (
                      <button key={s.title} onClick={() => setRateCategory(s.title)}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold border transition-all ${rateCategory === s.title ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>
                        {s.title.replace(/ \(.*\)/, "")} ({s.rows.length})
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* WHT Rates Table */}
              {rateTableType === "wht" && (
                <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
                  <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-800">Withholding Tax Rates — Finance Act 2025</h3>
                    <span className="text-[10px] text-slate-400 font-medium">{filteredWht.length} of {allWhtRows.length} rates</span>
                  </div>
                  <div className="overflow-x-auto">
                    {filteredWht.length === 0 ? (
                      <div className="py-12 text-center text-slate-400 text-xs">No rates match your search.</div>
                    ) : (
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200">
                            <th className="text-left py-2.5 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Description</th>
                            <th className="text-left py-2.5 px-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider w-28">Category</th>
                            <th className="text-center py-2.5 px-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider w-20">Section</th>
                            <th className="text-right py-2.5 px-4 text-[10px] font-bold text-blue-600 uppercase tracking-wider w-24">ATL Rate</th>
                            <th className="text-right py-2.5 px-4 text-[10px] font-bold text-red-600 uppercase tracking-wider w-28">Non-ATL Rate</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredWht.map((r, i) => (
                            <tr key={r.key} className={`border-b border-slate-50 hover:bg-blue-50/30 transition-colors ${i % 2 === 0 ? "" : "bg-slate-50/40"}`}>
                              <td className="py-2.5 px-4 text-slate-700 font-medium">{r.label}</td>
                              <td className="py-2.5 px-3">
                                <span className="text-[9px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded leading-none">
                                  {r.category.replace(/ \(.*\)/, "")}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-center text-[10px] text-slate-500">Sec {r.section}</td>
                              <td className="py-2.5 px-4 text-right font-bold text-blue-700 tabular-nums">{pct(r.atl)}</td>
                              <td className="py-2.5 px-4 text-right font-bold text-red-600 tabular-nums">{pct(r.nonatl)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                  <div className="px-5 py-2.5 border-t border-slate-100 bg-slate-50/50">
                    <p className="text-[10px] text-slate-400">Non-ATL rates are generally double the ATL rates. Sec 152 non-resident rates are the same for ATL/Non-ATL. Finance Act 2025.</p>
                  </div>
                </div>
              )}

              {/* Income Tax Slabs & Other Tables */}
              {rateTableType === "slabs" && (
                <div className="space-y-4">
                  {filteredSlabs.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm py-12 text-center text-slate-400 text-xs">No tables match your search.</div>
                  ) : filteredSlabs.map(t => {
                    return (
                      <div key={t.key} className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
                        <div className="px-5 py-3 border-b border-slate-100">
                          <h3 className="text-sm font-bold text-slate-800">{t.label}</h3>
                          <p className="text-[10px] text-slate-400 mt-0.5">{t.ref}</p>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="bg-slate-50 border-b border-slate-200">
                                {t.cols.map((col, ci) => (
                                  <th key={ci} className={`py-2.5 px-4 text-[10px] font-bold uppercase tracking-wider ${ci === 0 ? "text-left text-slate-500" : ci === t.cols.length - 1 ? "text-right text-blue-600" : "text-right text-slate-500"}`}>
                                    {col}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {t.rows.map((row, ri) => (
                                <tr key={ri} className={`border-b border-slate-50 hover:bg-blue-50/30 transition-colors ${ri % 2 === 0 ? "" : "bg-slate-50/40"}`}>
                                  {row.map((cell, ci) => (
                                    <td key={ci} className={`py-2.5 px-4 ${ci === 0 ? "text-slate-700 font-medium" : ci === row.length - 1 ? "text-right font-bold text-blue-700 tabular-nums" : "text-right text-slate-600 tabular-nums"}`}>
                                      {cell}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}
      </div>

        {/* ══════════════════════════════════════════════════════════════════════
            CALCULATOR RESULTS POPUP MODAL
            ══════════════════════════════════════════════════════════════════════ */}
        {calcModalTab && (
          <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 backdrop-blur-sm overflow-y-auto p-4 pt-12 pb-12" onClick={() => { setCalcModalTab(null); setShowExposure(false); }}>
            <div className="w-full max-w-3xl" onClick={e => e.stopPropagation()}>
              <div className="bg-gradient-to-r from-blue-700 to-indigo-800 rounded-t-2xl px-6 py-4 flex items-center justify-between shadow-2xl">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center">
                    <Calculator className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-white tracking-tight">
                      {calcModalTab === "exposure" ? "Tax Exposure Results" :
                       calcModalTab === "income" ? "Income Tax Results" :
                       calcModalTab === "wht" ? "WHT Calculation Results" :
                       calcModalTab === "salestax" ? "Sales Tax Results" :
                       calcModalTab === "property" ? "Property Tax Results" :
                       calcModalTab === "vehicle" ? "Vehicle Tax Results" :
                       calcModalTab === "investment" ? "Investment Tax Results" :
                       "Rental Tax Results"}
                    </h2>
                    <p className="text-[11px] text-blue-200">Finance Act 2025 • {filerStatus === "atl" ? "Active Taxpayer (ATL)" : "Non-Active Taxpayer"}</p>
                  </div>
                </div>
                <button onClick={() => { setCalcModalTab(null); setShowExposure(false); }} className="w-9 h-9 rounded-xl bg-white/15 hover:bg-white/25 flex items-center justify-center transition-colors">
                  <X className="w-5 h-5 text-white" />
                </button>
              </div>

              <div className="bg-[#f8f9fc] rounded-b-2xl shadow-2xl p-6 space-y-5">

                {/* EXPOSURE RESULTS */}
                {calcModalTab === "exposure" && (
                  <>
                    <div className="grid sm:grid-cols-4 gap-3">
                      {[
                        { label: "Total Liability", value: exposureResult.totalLiability, color: "text-slate-800", bg: "bg-white" },
                        { label: "Credits & Paid", value: exposureResult.totalCredits, color: "text-emerald-700", bg: "bg-emerald-50" },
                        { label: "Net Exposure", value: exposureResult.netExposure, color: "text-red-700", bg: "bg-red-50" },
                        { label: "Taxable Income", value: exposureResult.taxableIncome, color: "text-blue-700", bg: "bg-blue-50" },
                      ].map(c => (
                        <div key={c.label} className={`rounded-xl border border-slate-200/80 shadow-sm p-3 ${c.bg}`}>
                          <p className="text-[9px] font-semibold text-slate-500 uppercase tracking-wide mb-1">{c.label}</p>
                          <p className={`text-lg font-black tabular-nums ${c.color}`}>{fmt(c.value)}</p>
                        </div>
                      ))}
                    </div>
                    <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm p-4">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-xs font-bold text-slate-700">Exposure Breakdown</p>
                        <RiskBadge level={exposureResult.risk} />
                      </div>
                      <div className="space-y-1">
                        <TaxRow label="Income Tax" amount={exposureResult.incomeTax} sub={`Taxable income: ${fmt(exposureResult.taxableIncome)}`} />
                        <TaxRow label="Minimum Tax (Sec 113)" amount={exposureResult.minTax} sub={`${entityType.startsWith("company") ? "1.25%" : "1%"} of turnover${exposureResult.minTax > exposureResult.incomeTax ? " — APPLIES" : ""}`} />
                        <TaxRow label="Super Tax (Sec 4C)" amount={exposureResult.superTax} sub={exposureResult.superTax > 0 ? "Applicable on income above Rs 150M" : "Not applicable"} />
                        <TaxRow label="WHT on Imports (Sec 148)" amount={exposureResult.importWHT} sub={`Rate: ${pct(atlStatus === "atl" ? 0.02 : 0.04)}`} />
                        <TaxRow label="WHT on Contracts (Sec 153)" amount={exposureResult.contractWHT} sub={`Rate: ${pct(atlStatus === "atl" ? 0.075 : 0.15)}`} />
                        <TaxRow label="WHT on Services (Sec 153)" amount={exposureResult.serviceWHT} sub={`Rate: ${pct(atlStatus === "atl" ? 0.06 : 0.12)}`} />
                        <TaxRow label="Net Sales Tax" amount={exposureResult.netSalesTax} sub={pstReg === "none" ? "Not registered" : "18% standard rate"} />
                        <div className="mt-2 border-t border-slate-100 pt-2">
                          <TaxRow label="Total Gross Liability" amount={exposureResult.totalLiability} highlight />
                          <TaxRow label="Less: Credits & Tax Paid" amount={-exposureResult.totalCredits} sub="Advance tax + WHT credits" />
                          <TaxRow label="Net Exposure (Unpaid)" amount={exposureResult.netExposure} highlight />
                        </div>
                      </div>
                    </div>
                    {exposureResult.netExposure > 0 && (
                      <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm p-4">
                        <p className="text-xs font-bold text-slate-700 mb-3">Penalty & Default Surcharge</p>
                        <div className="grid sm:grid-cols-3 gap-3">
                          <div className="p-3 rounded-xl bg-red-50 border border-red-100">
                            <p className="text-[9px] font-semibold text-red-500 uppercase">Late Filing (Sec 182)</p>
                            <p className="text-lg font-bold text-red-700">{fmt(exposureResult.lateFilingPenalty)}</p>
                          </div>
                          <div className="p-3 rounded-xl bg-amber-50 border border-amber-100">
                            <p className="text-[9px] font-semibold text-amber-500 uppercase">Default Surcharge (Sec 205)</p>
                            <p className="text-lg font-bold text-amber-700">{fmt(exposureResult.defaultSurcharge)}</p>
                          </div>
                          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                            <p className="text-[9px] font-semibold text-slate-500 uppercase">Total Worst Case</p>
                            <p className="text-lg font-bold text-slate-800">{fmt(exposureResult.netExposure + exposureResult.lateFilingPenalty + exposureResult.defaultSurcharge)}</p>
                          </div>
                        </div>
                      </div>
                    )}
                    {exposureResult.suggestions.length > 0 && (
                      <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm p-4">
                        <p className="text-xs font-bold text-slate-700 mb-3">Tax Advisory</p>
                        <div className="space-y-2">
                          {exposureResult.suggestions.map((s, i) => (
                            <AlertBox key={i} type={s.type}>{s.text}</AlertBox>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm p-4">
                      <p className="text-xs font-bold text-slate-700 mb-3">Scenario Comparison</p>
                      <div className="grid sm:grid-cols-3 gap-3">
                        {[
                          { label: "Best Case", value: Math.max(0, exposureResult.totalLiability * 0.75 - exposureResult.totalCredits), sub: "Tax optimized, all credits utilized", bg: "bg-emerald-50 border-emerald-200", text: "text-emerald-700" },
                          { label: "Recommended", value: Math.max(0, exposureResult.netExposure), sub: "Compliant filing, no penalties", bg: "bg-blue-50 border-blue-200", text: "text-blue-700" },
                          { label: "Worst Case", value: exposureResult.netExposure * 1.5 + exposureResult.lateFilingPenalty + exposureResult.defaultSurcharge, sub: "FBR audit + penalties", bg: "bg-red-50 border-red-200", text: "text-red-700" },
                        ].map(s => (
                          <div key={s.label} className={`p-3 rounded-xl border ${s.bg}`}>
                            <p className="text-[10px] font-bold text-slate-600 mb-1">{s.label}</p>
                            <p className={`text-lg font-black tabular-nums ${s.text}`}>{fmt(s.value)}</p>
                            <p className="text-[9px] text-slate-400 mt-1">{s.sub}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {/* INCOME TAX RESULTS */}
                {calcModalTab === "income" && (
                  <>
                    <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm p-4">
                      <p className="text-xs font-bold text-slate-700 mb-3">Tax Computation</p>
                      <div className="space-y-2">
                        <TaxRow label="Base Income Tax" amount={incomeResult.tax}
                          sub={salaryType === "company" ? "29% corporate rate" : salaryType === "company_small" ? "21% small company rate" : salaryType === "company_banking" ? "39% banking rate" : "Progressive slab rates"} />
                        {incomeResult.corporate && (
                          <TaxRow label="Minimum Tax (Sec 113)" amount={incomeResult.minTaxAmt}
                            sub={`1.25% of turnover ${fmt(n(turnoverIT))} — ${incomeResult.minTaxAmt > incomeResult.tax ? "APPLIES" : "Not applicable"}`} />
                        )}
                        {incomeResult.corporate && (
                          <TaxRow label="Super Tax (Sec 4C)" amount={incomeResult.superTaxAmt}
                            sub={incomeResult.superTaxAmt > 0 ? "Income exceeds Rs 150M" : "Not applicable"} />
                        )}
                        <TaxRow label="Effective Tax Liability" amount={incomeResult.effectiveTax} highlight />
                        <TaxRow label="Less: Credits & Advance Tax" amount={-Math.min(incomeResult.effectiveTax, incomeResult.effectiveTax - incomeResult.net)} sub="Advance tax + WHT credits" />
                        <div className={`flex items-center justify-between px-3 py-3 rounded-xl border ${incomeResult.net > 0 ? "bg-red-50 border-red-200" : "bg-emerald-50 border-emerald-200"}`}>
                          <p className={`text-xs font-bold ${incomeResult.net > 0 ? "text-red-700" : "text-emerald-700"}`}>{incomeResult.net > 0 ? "Net Tax Payable" : "Refundable Amount"}</p>
                          <p className={`text-lg font-black tabular-nums ${incomeResult.net > 0 ? "text-red-700" : "text-emerald-700"}`}>{fmt(Math.abs(incomeResult.net))}</p>
                        </div>
                      </div>
                    </div>
                    <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm p-4">
                      <p className="text-xs font-bold text-slate-700 mb-3">Quarterly Advance Tax (Sec 147)</p>
                      <div className="p-3 rounded-xl bg-blue-50 border border-blue-100 mb-3">
                        <p className="text-[10px] font-semibold text-blue-500 uppercase mb-1">Per Quarter (25% of annual tax)</p>
                        <p className="text-2xl font-black text-blue-700">{fmt(incomeResult.quarterly)}</p>
                      </div>
                      <div className="space-y-1.5">
                        {["Q1 — 15 September", "Q2 — 15 December", "Q3 — 15 March", "Q4 — 15 June"].map(q => (
                          <div key={q} className="flex items-center justify-between text-xs p-2 rounded-lg border border-slate-100">
                            <span className="text-slate-600">{q}</span>
                            <span className="font-bold text-slate-800">{fmt(incomeResult.quarterly)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm p-4">
                      <p className="text-xs font-bold text-slate-700 mb-3">Super Tax Slabs (Sec 4C)</p>
                      <table className="w-full text-xs">
                        <thead><tr className="border-b border-slate-100">
                          <th className="text-left py-2 px-2 text-slate-500">Income Slab (Rs)</th>
                          <th className="text-right py-2 px-2 text-blue-600">Rate</th>
                        </tr></thead>
                        <tbody>
                          {[
                            { range: "Up to 150M", rate: "Nil" }, { range: "150M – 200M", rate: "1%" }, { range: "200M – 250M", rate: "2%" },
                            { range: "250M – 300M", rate: "3%" }, { range: "300M – 350M", rate: "4%" }, { range: "350M – 400M", rate: "6%" },
                            { range: "400M – 500M", rate: "8%" }, { range: "Above 500M", rate: "10%" },
                          ].map(r => (
                            <tr key={r.range} className="border-b border-slate-50">
                              <td className="py-1.5 px-2 text-slate-700">{r.range}</td>
                              <td className={`py-1.5 px-2 text-right font-bold ${r.rate === "Nil" ? "text-emerald-600" : "text-red-600"}`}>{r.rate}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}

                {/* WHT RESULTS */}
                {calcModalTab === "wht" && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-4 rounded-xl bg-blue-50 border border-blue-100 text-center">
                        <p className="text-[10px] font-semibold text-blue-500 uppercase">ATL Rate</p>
                        <p className="text-2xl font-black text-blue-700">{pct(WHT_RATES[whtType]?.atl ?? 0)}</p>
                        <p className="text-xs text-blue-600 font-bold mt-1">Tax: {fmt((WHT_RATES[whtType]?.atl ?? 0) * n(whtAmount))}</p>
                      </div>
                      <div className="p-4 rounded-xl bg-red-50 border border-red-100 text-center">
                        <p className="text-[10px] font-semibold text-red-500 uppercase">Non-ATL Rate</p>
                        <p className="text-2xl font-black text-red-700">{pct(WHT_RATES[whtType]?.nonatl ?? 0)}</p>
                        <p className="text-xs text-red-600 font-bold mt-1">Tax: {fmt((WHT_RATES[whtType]?.nonatl ?? 0) * n(whtAmount))}</p>
                      </div>
                    </div>
                    <div className={`p-4 rounded-xl border ${filerStatus === "atl" ? "bg-blue-50 border-blue-200" : "bg-red-50 border-red-200"}`}>
                      <p className={`text-[10px] font-semibold uppercase ${filerStatus === "atl" ? "text-blue-500" : "text-red-500"}`}>
                        Your WHT Liability ({filerStatus === "atl" ? "ATL" : "Non-ATL"})
                      </p>
                      <p className={`text-3xl font-black tabular-nums ${filerStatus === "atl" ? "text-blue-700" : "text-red-700"}`}>
                        {fmt(whtResult.tax)}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-1">Section {WHT_RATES[whtType]?.section} — {whtResult.label}</p>
                    </div>
                    {WHT_RATES[whtType]?.atl !== WHT_RATES[whtType]?.nonatl && (
                      <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                        <p className="text-[10px] font-semibold text-emerald-600">ATL Saving on this Transaction</p>
                        <p className="text-lg font-bold text-emerald-700">{fmt(n(whtAmount) * ((WHT_RATES[whtType]?.nonatl ?? 0) - (WHT_RATES[whtType]?.atl ?? 0)))}</p>
                      </div>
                    )}
                    <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm p-4 space-y-2.5">
                      <p className="text-xs font-bold text-slate-700">Compliance Notes</p>
                      <AlertBox type="info">WHT must be deposited by the 15th of the following month via CPR. Failure attracts penalties under Sec 182 and default surcharge under Sec 205.</AlertBox>
                      <AlertBox type="warn">Non-ATL rates are generally double the ATL rates. Verify taxpayer's ATL status on FBR's Active Taxpayer List before applying any rate.</AlertBox>
                    </div>
                  </>
                )}

                {/* SALES TAX RESULTS */}
                {calcModalTab === "salestax" && (
                  <>
                    <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm p-4">
                      <p className="text-xs font-bold text-slate-700 mb-3">Sales Tax Computation</p>
                      <div className="space-y-2">
                        <TaxRow label="Output Sales Tax" amount={salesTaxResult.outputTax} sub={`${pct(n(stRate))} on ${fmt(n(outputSales))}`} />
                        <TaxRow label="Gross Input Tax" amount={salesTaxResult.allowedInput + salesTaxResult.disallowedInput} sub={`${pct(n(inputTaxRate))} on ${fmt(n(inputPurchases))}`} />
                        <TaxRow label="Disallowed Input (Sec 8)" amount={-salesTaxResult.disallowedInput} sub={`${n(disallowedPct).toFixed(0)}% restricted`} />
                        <TaxRow label="Allowable Input Credit" amount={salesTaxResult.allowedInput} />
                        <div className="border-t border-slate-100 mt-2 pt-2">
                          {salesTaxResult.netPayable > 0 ? (
                            <TaxRow label="Net Sales Tax Payable" amount={salesTaxResult.netPayable} highlight />
                          ) : (
                            <div className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-emerald-50 border border-emerald-200">
                              <p className="text-xs font-bold text-emerald-700">Refund / Carry Forward</p>
                              <p className="text-lg font-black text-emerald-700">{fmt(salesTaxResult.refundable)}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm p-4">
                      <p className="text-xs font-bold text-slate-700 mb-3">Provincial Services Tax (PST)</p>
                      <TaxRow label={`PST — ${stProvince.toUpperCase()}`} amount={salesTaxResult.pstAmt} sub={`${pct(n(pstRate))} on ${fmt(n(serviceAmt))}`} />
                    </div>
                    <div className="p-4 rounded-xl bg-gradient-to-r from-slate-800 to-slate-900 text-white">
                      <p className="text-[10px] text-slate-300 font-semibold uppercase mb-1">Total Indirect Tax Obligation</p>
                      <p className="text-2xl font-black tabular-nums">{fmt(salesTaxResult.netPayable + salesTaxResult.pstAmt)}</p>
                      <p className="text-[10px] text-slate-400 mt-1">Federal Sales Tax + PST combined</p>
                    </div>
                    <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm p-4 space-y-2.5">
                      <p className="text-xs font-bold text-slate-700">Compliance Notes</p>
                      <AlertBox type="info">Returns due by 15th of following month. Late filing attracts Rs 10,000 per return penalty (Sec 33).</AlertBox>
                      <AlertBox type="warn">Input tax on electricity, gas for non-business use; vehicles; food & beverages restricted under Sec 8(1).</AlertBox>
                    </div>
                  </>
                )}

                {/* PROPERTY TAX RESULTS */}
                {calcModalTab === "property" && (
                  <>
                    <div className="p-5 rounded-xl bg-blue-50 border border-blue-100 text-center">
                      <p className="text-[10px] font-semibold text-blue-500 uppercase mb-1">Advance Tax on Property</p>
                      <p className="text-3xl font-black text-blue-700">{fmt(propResult.tax)}</p>
                      <p className="text-sm text-slate-500 mt-2">Rate: {pct(propResult.rate)} on {fmt(n(propValue))}</p>
                      <p className="text-xs text-slate-400 mt-1">Section {propType === "transfer" ? "236C (Seller)" : "236K (Buyer)"}</p>
                    </div>
                    <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm p-4">
                      <p className="text-xs font-bold text-slate-700 mb-3">Property Tax Rate Table</p>
                      {[
                        { title: "236C — Transfer (Seller)", rows: [
                          { slab: "Up to 50M", atl: "4.5%", nonatl: "11.5%", late: "7.5%" },
                          { slab: "50M – 100M", atl: "5.0%", nonatl: "11.5%", late: "8.5%" },
                          { slab: "Above 100M", atl: "5.5%", nonatl: "11.5%", late: "9.5%" },
                        ]},
                        { title: "236K — Purchase (Buyer)", rows: [
                          { slab: "Up to 50M", atl: "1.5%", nonatl: "10.5%", late: "4.5%" },
                          { slab: "50M – 100M", atl: "2.0%", nonatl: "14.5%", late: "5.5%" },
                          { slab: "Above 100M", atl: "2.5%", nonatl: "18.5%", late: "6.5%" },
                        ]},
                      ].map(tbl => (
                        <div key={tbl.title} className="mb-4">
                          <p className="text-[11px] font-bold text-slate-600 mb-2">{tbl.title}</p>
                          <table className="w-full text-xs">
                            <thead><tr className="border-b border-slate-100">
                              <th className="text-left py-1.5 px-2 text-slate-500">Slab</th>
                              <th className="text-right py-1.5 px-2 text-blue-600">ATL</th>
                              <th className="text-right py-1.5 px-2 text-red-600">Non-ATL</th>
                              <th className="text-right py-1.5 px-2 text-amber-600">Late</th>
                            </tr></thead>
                            <tbody>{tbl.rows.map(r => (
                              <tr key={r.slab} className="border-b border-slate-50">
                                <td className="py-1.5 px-2 text-slate-700">{r.slab}</td>
                                <td className="py-1.5 px-2 text-right font-semibold text-blue-700">{r.atl}</td>
                                <td className="py-1.5 px-2 text-right font-semibold text-red-600">{r.nonatl}</td>
                                <td className="py-1.5 px-2 text-right font-semibold text-amber-600">{r.late}</td>
                              </tr>
                            ))}</tbody>
                          </table>
                        </div>
                      ))}
                      <AlertBox type="info">Tax under Sec 236C/236K is adjustable against annual income tax liability (not final tax for ATL filers).</AlertBox>
                    </div>
                  </>
                )}

                {/* VEHICLE TAX RESULTS */}
                {calcModalTab === "vehicle" && (
                  <>
                    <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm p-4">
                      <p className="text-xs font-bold text-slate-700 mb-3">Vehicle Tax Computation</p>
                      <div className="space-y-2">
                        <TaxRow label="Registration Tax (Sec 231B)" amount={vehicleResult.registration} />
                        {vehicleCC === "above3000" && (
                          <TaxRow label="% of Value Component" amount={vehicleResult.percentBased} sub={`${filerStatus === "atl" ? "12%" : "36%"} of Rs ${fmt(n(vehicleValue))}`} />
                        )}
                        <TaxRow label="Total Registration Tax" amount={vehicleResult.total} highlight />
                      </div>
                    </div>
                    <div className="p-4 rounded-xl bg-amber-50 border border-amber-100">
                      <p className="text-[10px] font-semibold text-amber-600 uppercase mb-1">Annual Token Tax (Sec 234)</p>
                      <p className="text-2xl font-bold text-amber-700">{fmt(vehicleResult.annual)}</p>
                      <p className="text-[10px] text-amber-500 mt-0.5">Payable annually at token renewal</p>
                    </div>
                    <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm p-4">
                      <p className="text-xs font-bold text-slate-700 mb-3">Registration Tax Schedule</p>
                      <table className="w-full text-xs">
                        <thead><tr className="border-b border-slate-100">
                          <th className="text-left py-2 px-2 text-slate-500">Engine CC</th>
                          <th className="text-right py-2 px-2 text-blue-600">ATL (Rs)</th>
                          <th className="text-right py-2 px-2 text-red-600">Non-ATL (Rs)</th>
                        </tr></thead>
                        <tbody>{Object.entries(VEHICLE_FIXED_RATES).map(([k, v]) => (
                          <tr key={k} className={`border-b border-slate-50 ${vehicleCC === k ? "bg-blue-50" : ""}`}>
                            <td className="py-2 px-2 text-slate-700">{v.label}</td>
                            <td className="py-2 px-2 text-right font-semibold text-blue-700">{fmt(v.atl)}</td>
                            <td className="py-2 px-2 text-right font-semibold text-red-600">{fmt(v.nonatl)}</td>
                          </tr>
                        ))}</tbody>
                      </table>
                      <div className="mt-3">
                        <AlertBox type="info">Above 3000cc: additional 12% (ATL) or 36% (Non-ATL) of vehicle value under Sec 231B(1). Reduces 10% per year.</AlertBox>
                      </div>
                    </div>
                  </>
                )}

                {/* INVESTMENT TAX RESULTS */}
                {calcModalTab === "investment" && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-4 rounded-xl bg-blue-50 border border-blue-100 text-center">
                        <p className="text-[10px] font-semibold text-blue-500 uppercase">ATL Rate</p>
                        <p className="text-2xl font-black text-blue-700">{pct(WHT_RATES[investType]?.atl ?? 0)}</p>
                        <p className="text-xs text-blue-600 font-bold mt-1">Tax: {fmt((WHT_RATES[investType]?.atl ?? 0) * n(investAmount))}</p>
                      </div>
                      <div className="p-4 rounded-xl bg-red-50 border border-red-100 text-center">
                        <p className="text-[10px] font-semibold text-red-500 uppercase">Non-ATL Rate</p>
                        <p className="text-2xl font-black text-red-700">{pct(WHT_RATES[investType]?.nonatl ?? 0)}</p>
                        <p className="text-xs text-red-600 font-bold mt-1">Tax: {fmt((WHT_RATES[investType]?.nonatl ?? 0) * n(investAmount))}</p>
                      </div>
                    </div>
                    <div className={`p-4 rounded-xl border ${filerStatus === "atl" ? "bg-blue-50 border-blue-200" : "bg-red-50 border-red-200"}`}>
                      <p className="text-[10px] font-semibold uppercase text-slate-500">Your Investment Tax ({filerStatus === "atl" ? "ATL" : "Non-ATL"})</p>
                      <p className={`text-2xl font-black tabular-nums ${filerStatus === "atl" ? "text-blue-700" : "text-red-700"}`}>
                        {fmt(((filerStatus === "atl" ? WHT_RATES[investType]?.atl : WHT_RATES[investType]?.nonatl) ?? 0) * n(investAmount))}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-1">Section {WHT_RATES[investType]?.section} — {WHT_RATES[investType]?.label}</p>
                    </div>
                    <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm p-4">
                      <p className="text-xs font-bold text-slate-700 mb-3">Investment Tax Rate Reference</p>
                      <div className="space-y-1.5">
                        {["dividend_ipp","dividend_reit","dividend_mutual_debt","dividend_mutual_equity","profit_bank","profit_govt","profit_other","profit_sukuk_company","profit_sukuk_ind_high","profit_sukuk_ind_low"].map(key => {
                          const r = WHT_RATES[key];
                          if (!r) return null;
                          return (
                            <div key={key} className={`flex items-center justify-between p-2 rounded-lg border ${investType === key ? "bg-blue-50 border-blue-200" : "bg-white border-slate-100"}`}>
                              <div>
                                <p className="text-[11px] text-slate-700 font-medium">{r.label}</p>
                                <p className="text-[10px] text-slate-400">Sec {r.section}</p>
                              </div>
                              <div className="flex gap-3 text-right">
                                <div><p className="text-[9px] text-blue-400">ATL</p><p className="text-xs font-bold text-blue-700">{pct(r.atl)}</p></div>
                                <div><p className="text-[9px] text-red-400">Non-ATL</p><p className="text-xs font-bold text-red-600">{pct(r.nonatl)}</p></div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}

                {/* RENTAL TAX RESULTS */}
                {calcModalTab === "rental" && (() => {
                  const amt = n(rentAmount);
                  let tax = 0;
                  if (rentEntity === "company") {
                    tax = amt * (filerStatus === "atl" ? 0.15 : 0.30);
                  } else {
                    if (amt > 2000000) tax = 15000 + 140000 + (amt - 2000000) * 0.15;
                    else if (amt > 600000) tax = 15000 + (amt - 600000) * 0.10;
                    else if (amt > 300000) tax = (amt - 300000) * 0.05;
                    if (filerStatus === "nonatl") tax *= 2;
                  }
                  return (
                    <>
                      <div className="p-5 rounded-xl bg-blue-50 border border-blue-100 text-center">
                        <p className="text-[10px] font-semibold text-blue-500 uppercase mb-1">Rental Income Tax (Sec 155)</p>
                        <p className="text-3xl font-black text-blue-700">{fmt(tax)}</p>
                        <p className="text-sm text-slate-500 mt-2">{rentEntity === "company" ? `Flat ${filerStatus === "atl" ? "15%" : "30%"} — Company` : `Progressive slabs — Individual${filerStatus === "nonatl" ? " (2x for Non-ATL)" : ""}`}</p>
                      </div>
                      <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm p-4">
                        <p className="text-xs font-bold text-slate-700 mb-3">Rental Tax Slabs — Individual</p>
                        <table className="w-full text-xs mb-3">
                          <thead><tr className="border-b border-slate-100">
                            <th className="text-left py-2 px-2 text-slate-500">Annual Rent</th>
                            <th className="text-right py-2 px-2 text-blue-600">ATL Rate</th>
                            <th className="text-right py-2 px-2 text-red-600">Non-ATL</th>
                          </tr></thead>
                          <tbody>
                            {[
                              { range: "Up to 300,000", atl: "0%", nonatl: "0%" },
                              { range: "300,001 – 600,000", atl: "5%", nonatl: "10%" },
                              { range: "600,001 – 2,000,000", atl: "10%", nonatl: "20%" },
                              { range: "Above 2,000,000", atl: "15%", nonatl: "30%" },
                            ].map(r => (
                              <tr key={r.range} className="border-b border-slate-50">
                                <td className="py-2 px-2 text-slate-700">{r.range}</td>
                                <td className="py-2 px-2 text-right font-semibold text-blue-700">{r.atl}</td>
                                <td className="py-2 px-2 text-right font-semibold text-red-600">{r.nonatl}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <AlertBox type="info">Companies pay flat 15% (ATL) or 30% (Non-ATL). Individual tax under Sec 155 is adjustable in annual return.</AlertBox>
                      </div>
                    </>
                  );
                })()}

                {/* Modal Footer */}
                <div className="flex items-center justify-between pt-3 border-t border-slate-200/60">
                  <p className="text-[10px] text-slate-400">Finance Act 2025 — Verify with applicable legislation</p>
                  <button onClick={() => { setCalcModalTab(null); setShowExposure(false); }}
                    className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl text-xs font-bold hover:shadow-lg hover:shadow-indigo-500/25 transition-all flex items-center gap-2">
                    <X className="w-3.5 h-3.5" /> Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

      {/* Footer */}
      <footer className="border-t border-slate-200/60 mt-12 py-6 bg-gradient-to-b from-transparent to-slate-50/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 text-center">
          <p className="text-[11px] text-slate-400 font-medium">
            Finance Act 2025 • Income Tax Ordinance 2001 • Sales Tax Act 1990 • For CA Professional Use
          </p>
          <p className="text-[10px] text-slate-300 mt-1.5">
            Alam & Aulakh — Chartered Accountants • Rates are for reference only; verify with applicable legislation
          </p>
        </div>
      </footer>
    </div>
  );
}
