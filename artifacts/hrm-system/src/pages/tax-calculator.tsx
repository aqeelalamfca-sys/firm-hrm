import React, { useState, useMemo } from "react";
import { Link } from "wouter";
import { ArrowLeft, Calculator, FileText, Building2, Car, Home as HomeIcon, Banknote, Receipt, Truck, Phone, Zap, Globe, PartyPopper, ShoppingCart, CreditCard, Gift, Users, BarChart3, ChevronDown, ChevronUp, Info, CheckCircle2 } from "lucide-react";

function formatPKR(value: number): string {
  return new Intl.NumberFormat("en-PK", { style: "currency", currency: "PKR", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);
}

const SALARY_SLABS = [
  { min: 0, max: 600000, base: 0, rate: 0 },
  { min: 600001, max: 1200000, base: 0, rate: 0.01 },
  { min: 1200001, max: 2200000, base: 6000, rate: 0.11 },
  { min: 2200001, max: 3200000, base: 116000, rate: 0.23 },
  { min: 3200001, max: 4100000, base: 346000, rate: 0.30 },
  { min: 4100001, max: Infinity, base: 616000, rate: 0.35 },
];

function calcSalaryTax(income: number): number {
  if (income <= 600000) return 0;
  let tax = 0;
  for (const slab of SALARY_SLABS) {
    if (income >= slab.min && income <= slab.max) {
      tax = slab.base + (income - slab.min + 1) * slab.rate;
      break;
    }
  }
  if (income > 10000000) tax *= 1.09;
  return tax;
}

const WHT_RATES: Record<string, { label: string; atl: number; nonatl: number; late?: number }> = {
  import_part1: { label: "Import Goods Part-I (Twelfth Schedule)", atl: 0.01, nonatl: 0.02 },
  import_part2: { label: "Import Goods Part-II (Standard)", atl: 0.02, nonatl: 0.04 },
  import_part2_commercial: { label: "Import Goods Part-II (Commercial)", atl: 0.035, nonatl: 0.07 },
  import_part3: { label: "Import Goods Part-III (Standard)", atl: 0.055, nonatl: 0.11 },
  import_part3_commercial: { label: "Import Goods Part-III (Commercial)", atl: 0.06, nonatl: 0.12 },
  import_pharma: { label: "Import Pharma Products (Proviso 1b)", atl: 0.04, nonatl: 0.08 },
  import_ev_ckd: { label: "Import CKD kits for EVs", atl: 0.01, nonatl: 0.02 },
  supply_company: { label: "Supply of Goods — Company", atl: 0.05, nonatl: 0.10 },
  supply_noncompany: { label: "Supply of Goods — Non-Company", atl: 0.055, nonatl: 0.11 },
  supply_rice_cotton: { label: "Supply Rice/Cotton Seed/Edible Oils", atl: 0.015, nonatl: 0.03 },
  supply_toll_company: { label: "Toll Manufacturing — Company", atl: 0.09, nonatl: 0.18 },
  supply_toll_noncompany: { label: "Toll Manufacturing — Non-Company", atl: 0.11, nonatl: 0.22 },
  services_it: { label: "Services — IT/IT Enabled", atl: 0.04, nonatl: 0.08 },
  services_general: { label: "Services — General", atl: 0.06, nonatl: 0.12 },
  services_other: { label: "Services — Other (Div-III Para 5)", atl: 0.15, nonatl: 0.30 },
  contract_company: { label: "Contract — Company", atl: 0.075, nonatl: 0.15 },
  contract_noncompany: { label: "Contract — Non-Company", atl: 0.075, nonatl: 0.15 },
  contract_sportsperson: { label: "Contract — Sports Persons", atl: 0.10, nonatl: 0.20 },
  rent_company: { label: "Rent of Immovable Property — Company", atl: 0.15, nonatl: 0.30 },
  dividend_ipp: { label: "Dividend — IPPs", atl: 0.075, nonatl: 0.15 },
  dividend_reit: { label: "Dividend — REIT/General", atl: 0.15, nonatl: 0.30 },
  dividend_mutual_debt: { label: "Dividend — Mutual Fund (Debt >50%)", atl: 0.25, nonatl: 0.50 },
  dividend_mutual_equity: { label: "Dividend — Mutual Fund (Equity >50%)", atl: 0.15, nonatl: 0.30 },
  dividend_spv_reit: { label: "Dividend — REIT from SPV", atl: 0.00, nonatl: 0.00 },
  dividend_spv_other: { label: "Dividend — Others from SPV", atl: 0.35, nonatl: 0.70 },
  profit_bank: { label: "Profit on Debt — Bank Deposit", atl: 0.20, nonatl: 0.40 },
  profit_govt: { label: "Profit — Govt Securities (Non-Individual)", atl: 0.20, nonatl: 0.40 },
  profit_other: { label: "Profit on Debt — Other", atl: 0.15, nonatl: 0.30 },
  profit_sukuk_company: { label: "Sukuk — Company Holder", atl: 0.25, nonatl: 0.50 },
  profit_sukuk_ind_high: { label: "Sukuk — Individual (Return >1M)", atl: 0.125, nonatl: 0.25 },
  profit_sukuk_ind_low: { label: "Sukuk — Individual (Return <1M)", atl: 0.10, nonatl: 0.20 },
  nonresident_general: { label: "Non-Resident — General (Sec 152(1))", atl: 0.15, nonatl: 0.15 },
  nonresident_1a: { label: "Non-Resident — Sec 152(1A)", atl: 0.07, nonatl: 0.07 },
  nonresident_1aa: { label: "Non-Resident — IT Services (Sec 152(1AA))", atl: 0.05, nonatl: 0.05 },
  nonresident_1aaa: { label: "Non-Resident — Sec 152(1AAA)", atl: 0.10, nonatl: 0.10 },
  export_goods: { label: "Export of Goods (Sec 154)", atl: 0.01, nonatl: 0.02 },
  export_indenting: { label: "Export — Indenting Commission", atl: 0.05, nonatl: 0.10 },
  export_services_pseb: { label: "Export IT Services (PSEB Registered)", atl: 0.0025, nonatl: 0.005 },
  prize_bond: { label: "Prize Bond / Lottery", atl: 0.15, nonatl: 0.30 },
  prize_quiz: { label: "Quiz/Promotion Prize", atl: 0.20, nonatl: 0.40 },
  petroleum: { label: "Petroleum Products (Sec 156A)", atl: 0.12, nonatl: 0.24 },
  brokerage_advertising: { label: "Commission — Advertising Agent", atl: 0.10, nonatl: 0.20 },
  brokerage_life_insurance: { label: "Commission — Life Insurance Agent", atl: 0.08, nonatl: 0.16 },
  brokerage_general: { label: "Commission — General", atl: 0.12, nonatl: 0.24 },
  sale_distributor: { label: "Sale to Distributor (Fertilizer)", atl: 0.0025, nonatl: 0.007 },
  sale_distributor_other: { label: "Sale to Distributor (Other)", atl: 0.005, nonatl: 0.01 },
  sale_retailer: { label: "Sale to Retailer (Sec 236H)", atl: 0.005, nonatl: 0.025 },
  function_gathering: { label: "Functions & Gatherings (Sec 236CB)", atl: 0.10, nonatl: 0.20 },
  remittance_abroad: { label: "Remittance Abroad (Sec 236Y)", atl: 0.05, nonatl: 0.10 },
  bonus_shares: { label: "Bonus Shares (Sec 236Z)", atl: 0.10, nonatl: 0.20 },
  cash_withdrawal: { label: "Cash Withdrawal (Sec 231AB)", atl: 0.00, nonatl: 0.008 },
  auction_goods: { label: "Public Auction — Goods (Sec 236A)", atl: 0.10, nonatl: 0.20 },
  auction_property: { label: "Public Auction — Property", atl: 0.05, nonatl: 0.10 },
  foreign_tv_serial: { label: "Foreign TV Serial Episode (Sec 236CA)", atl: 0, nonatl: 0 },
  ecommerce_digital: { label: "E-Commerce — Digital Payment", atl: 0.01, nonatl: 0.02 },
  ecommerce_cod: { label: "E-Commerce — Cash on Delivery", atl: 0.02, nonatl: 0.04 },
};

const VEHICLE_FIXED_RATES: Record<string, { label: string; atl: number; nonatl: number }> = {
  upto850: { label: "Up to 850 cc", atl: 0, nonatl: 0 },
  "851_1000": { label: "851 – 1,000 cc", atl: 5000, nonatl: 15000 },
  "1001_1300": { label: "1,001 – 1,300 cc", atl: 7500, nonatl: 22500 },
  "1301_1600": { label: "1,301 – 1,600 cc", atl: 12500, nonatl: 37500 },
  "1601_1800": { label: "1,601 – 1,800 cc", atl: 18750, nonatl: 56250 },
  "1801_2000": { label: "1,801 – 2,000 cc", atl: 25000, nonatl: 75000 },
  "2001_2500": { label: "2,001 – 2,500 cc", atl: 37500, nonatl: 112500 },
  "2501_3000": { label: "2,501 – 3,000 cc", atl: 50000, nonatl: 150000 },
  above3000: { label: "Above 3,000 cc", atl: 62500, nonatl: 187500 },
};

const ANNUAL_VEHICLE_TAX: Record<string, { atl: number; nonatl: number }> = {
  upto850: { atl: 800, nonatl: 1600 },
  "851_1000": { atl: 1500, nonatl: 3000 },
  "1001_1300": { atl: 1750, nonatl: 3500 },
  "1301_1600": { atl: 2500, nonatl: 5000 },
  "1601_1800": { atl: 3750, nonatl: 7500 },
  "1801_2000": { atl: 4500, nonatl: 9000 },
  "2001_2500": { atl: 10000, nonatl: 20000 },
  "2501_3000": { atl: 10000, nonatl: 20000 },
  above3000: { atl: 10000, nonatl: 20000 },
};

const RENT_SLABS_INDIVIDUAL = [
  { min: 0, max: 300000, rate: 0 },
  { min: 300001, max: 600000, rate: 0.05 },
  { min: 600001, max: 2000000, rate: 0.10 },
  { min: 2000001, max: Infinity, rate: 0.15 },
];

function calcRentTax(amount: number, isCompany: boolean, filer: string): number {
  if (isCompany) {
    return amount * (filer === "atl" ? 0.15 : 0.30);
  }
  let tax = 0;
  let remaining = amount;
  for (const slab of RENT_SLABS_INDIVIDUAL) {
    if (remaining <= 0) break;
    const slabWidth = slab.max === Infinity ? remaining : Math.min(remaining, slab.max - slab.min + 1);
    if (amount > slab.min) {
      const taxable = Math.min(remaining, slab.max - Math.max(slab.min, 0));
      tax += taxable * slab.rate;
      remaining -= taxable;
    }
  }
  if (filer === "nonatl") tax *= 2;
  return tax;
}

function calcPropertyTax(value: number, type: string, filer: string): { tax: number; rate: number } {
  let rate = 0;
  if (type === "transfer") {
    if (value <= 50000000) {
      rate = filer === "atl" ? 0.045 : filer === "nonatl" ? 0.115 : 0.075;
    } else if (value <= 100000000) {
      rate = filer === "atl" ? 0.05 : filer === "nonatl" ? 0.115 : 0.085;
    } else {
      rate = filer === "atl" ? 0.055 : filer === "nonatl" ? 0.115 : 0.095;
    }
  } else {
    if (value <= 50000000) {
      rate = filer === "atl" ? 0.015 : filer === "nonatl" ? 0.105 : 0.045;
    } else if (value <= 100000000) {
      rate = filer === "atl" ? 0.02 : filer === "nonatl" ? 0.145 : 0.055;
    } else {
      rate = filer === "atl" ? 0.025 : filer === "nonatl" ? 0.185 : 0.065;
    }
  }
  return { tax: value * rate, rate };
}

type TabKey = "rates" | "wht" | "salary" | "property" | "vehicle" | "investment" | "rental" | "misc";

const TABS: { key: TabKey; label: string; icon: any }[] = [
  { key: "rates", label: "Rate Tables", icon: FileText },
  { key: "wht", label: "WHT Calculator", icon: Calculator },
  { key: "salary", label: "Income Tax", icon: Banknote },
  { key: "property", label: "Property Tax", icon: HomeIcon },
  { key: "vehicle", label: "Vehicle Tax", icon: Car },
  { key: "investment", label: "Investment Income", icon: BarChart3 },
  { key: "rental", label: "Rental Income", icon: Building2 },
  { key: "misc", label: "Other Sections", icon: Receipt },
];

function InputField({ label, value, onChange, type = "number", placeholder }: { label: string; value: string | number; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-600 mb-1.5">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all"
      />
    </div>
  );
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-600 mb-1.5">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

function ResultBox({ label, value, breakdown }: { label: string; value: string; breakdown?: string }) {
  return (
    <div className="mt-4 p-4 rounded-xl bg-gradient-to-r from-blue-50 to-slate-50 border border-blue-100">
      <p className="text-xs text-slate-500 font-medium mb-1">{label}</p>
      <p className="text-xl font-bold text-blue-700">{value}</p>
      {breakdown && <p className="text-[11px] text-slate-500 mt-1">{breakdown}</p>}
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6">
      <h3 className="text-base font-bold text-slate-800 mb-5">{title}</h3>
      {children}
    </div>
  );
}

export default function TaxCalculator() {
  const [activeTab, setActiveTab] = useState<TabKey>("wht");
  const [filerStatus, setFilerStatus] = useState("atl");

  const [whtType, setWhtType] = useState("supply_company");
  const [whtAmount, setWhtAmount] = useState("500000");

  const [salaryIncome, setSalaryIncome] = useState("3500000");
  const [salaryType, setSalaryType] = useState("salaried");
  const [advancePaid, setAdvancePaid] = useState("0");
  const [whtCredits, setWhtCredits] = useState("0");

  const [propType, setPropType] = useState("transfer");
  const [propValue, setPropValue] = useState("45000000");
  const [propFiler, setPropFiler] = useState("atl");

  const [vehicleCC, setVehicleCC] = useState("1301_1600");
  const [vehicleValue, setVehicleValue] = useState("5000000");

  const [investType, setInvestType] = useState("dividend_reit");
  const [investAmount, setInvestAmount] = useState("1000000");

  const [rentAmount, setRentAmount] = useState("1200000");
  const [rentEntity, setRentEntity] = useState("individual");

  const [miscType, setMiscType] = useState("function_gathering");
  const [miscAmount, setMiscAmount] = useState("500000");

  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  const whtResult = useMemo(() => {
    const rate = WHT_RATES[whtType];
    if (!rate) return { tax: 0, rateUsed: 0, label: "" };
    const r = filerStatus === "atl" ? rate.atl : rate.nonatl;
    return { tax: parseFloat(whtAmount || "0") * r, rateUsed: r, label: rate.label };
  }, [whtType, whtAmount, filerStatus]);

  const salaryResult = useMemo(() => {
    const income = parseFloat(salaryIncome || "0");
    const credits = parseFloat(advancePaid || "0") + parseFloat(whtCredits || "0");
    if (salaryType === "company") {
      const tax = income * 0.29;
      return { tax, net: tax - credits, quarterly: tax / 4 };
    }
    const tax = calcSalaryTax(income);
    return { tax, net: tax - credits, quarterly: tax / 4 };
  }, [salaryIncome, salaryType, advancePaid, whtCredits]);

  const propResult = useMemo(() => {
    return calcPropertyTax(parseFloat(propValue || "0"), propType, propFiler);
  }, [propValue, propType, propFiler]);

  const vehicleResult = useMemo(() => {
    const cc = vehicleCC;
    const val = parseFloat(vehicleValue || "0");
    const fixed = VEHICLE_FIXED_RATES[cc];
    const annual = ANNUAL_VEHICLE_TAX[cc];
    let reg = filerStatus === "atl" ? fixed.atl : fixed.nonatl;
    let percentTax = 0;
    if (cc === "above3000") {
      percentTax = val * (filerStatus === "atl" ? 0.12 : 0.36);
    }
    return {
      registration: reg,
      percentBased: percentTax,
      total: reg + percentTax,
      annual: filerStatus === "atl" ? annual.atl : annual.nonatl,
      label: fixed.label,
    };
  }, [vehicleCC, vehicleValue, filerStatus]);

  const investResult = useMemo(() => {
    const rate = WHT_RATES[investType];
    if (!rate) return { tax: 0, rateUsed: 0, label: "" };
    const r = filerStatus === "atl" ? rate.atl : rate.nonatl;
    return { tax: parseFloat(investAmount || "0") * r, rateUsed: r, label: rate.label };
  }, [investType, investAmount, filerStatus]);

  const miscResult = useMemo(() => {
    const rate = WHT_RATES[miscType];
    if (!rate) return { tax: 0, rateUsed: 0, label: "" };
    const r = filerStatus === "atl" ? rate.atl : rate.nonatl;
    return { tax: parseFloat(miscAmount || "0") * r, rateUsed: r, label: rate.label };
  }, [miscType, miscAmount, filerStatus]);

  const RATE_TABLE_SECTIONS = [
    {
      title: "Imports (Sec 148)",
      rows: ["import_part1", "import_part2", "import_part2_commercial", "import_part3", "import_part3_commercial", "import_pharma", "import_ev_ckd"],
    },
    {
      title: "Supplies & Goods (Sec 153(1)(a))",
      rows: ["supply_company", "supply_noncompany", "supply_rice_cotton", "supply_toll_company", "supply_toll_noncompany"],
    },
    {
      title: "Services (Sec 153(1)(b))",
      rows: ["services_it", "services_general", "services_other"],
    },
    {
      title: "Contracts (Sec 153(1)(c))",
      rows: ["contract_company", "contract_noncompany", "contract_sportsperson"],
    },
    {
      title: "Dividend (Sec 150)",
      rows: ["dividend_ipp", "dividend_reit", "dividend_mutual_debt", "dividend_mutual_equity", "dividend_spv_reit", "dividend_spv_other"],
    },
    {
      title: "Profit on Debt (Sec 151)",
      rows: ["profit_bank", "profit_govt", "profit_other", "profit_sukuk_company", "profit_sukuk_ind_high", "profit_sukuk_ind_low"],
    },
    {
      title: "Non-Resident Payments (Sec 152)",
      rows: ["nonresident_general", "nonresident_1a", "nonresident_1aa", "nonresident_1aaa"],
    },
    {
      title: "Exports (Sec 154)",
      rows: ["export_goods", "export_indenting", "export_services_pseb"],
    },
    {
      title: "Rent (Sec 155)",
      rows: ["rent_company"],
    },
    {
      title: "Prizes & Misc (Sec 156)",
      rows: ["prize_bond", "prize_quiz", "petroleum"],
    },
    {
      title: "Brokerage & Commission (Sec 233)",
      rows: ["brokerage_advertising", "brokerage_life_insurance", "brokerage_general"],
    },
    {
      title: "Sales, Functions & Others",
      rows: ["sale_distributor", "sale_distributor_other", "sale_retailer", "function_gathering", "remittance_abroad", "bonus_shares", "cash_withdrawal", "auction_goods", "auction_property", "ecommerce_digital", "ecommerce_cod"],
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-xl border-b border-slate-200/60 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/landing">
              <button className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-blue-600 transition-colors">
                <ArrowLeft className="w-4 h-4" /> Back
              </button>
            </Link>
            <div className="h-5 w-px bg-slate-200" />
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
                <Calculator className="w-4.5 h-4.5 text-white" />
              </div>
              <div>
                <h1 className="text-sm font-bold text-slate-800 leading-tight">WHT Calculator</h1>
                <p className="text-[10px] text-slate-400 font-medium">Finance Act 2025</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium text-slate-500 hidden sm:block">Taxpayer Status:</span>
            <div className="flex rounded-lg border border-slate-200 overflow-hidden">
              {[
                { value: "atl", label: "ATL" },
                { value: "nonatl", label: "Non-ATL" },
              ].map((s) => (
                <button
                  key={s.value}
                  onClick={() => setFilerStatus(s.value)}
                  className={`px-3 py-1.5 text-[11px] font-semibold transition-all ${filerStatus === s.value ? "bg-blue-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex gap-2 overflow-x-auto pb-3 mb-6 scrollbar-hide">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${activeTab === key ? "bg-blue-600 text-white shadow-md shadow-blue-500/20" : "bg-white text-slate-600 border border-slate-200 hover:border-blue-200 hover:text-blue-600"}`}
            >
              <Icon className="w-3.5 h-3.5" /> {label}
            </button>
          ))}
        </div>

        {activeTab === "rates" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="px-2.5 py-1 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-700">
                {filerStatus === "atl" ? "Active Taxpayer (ATL)" : "Non-Active Taxpayer"}
              </div>
            </div>
            {RATE_TABLE_SECTIONS.map((section) => (
              <div key={section.title} className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
                <button
                  onClick={() => setExpandedSection(expandedSection === section.title ? null : section.title)}
                  className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-slate-50 transition-colors"
                >
                  <h3 className="text-sm font-bold text-slate-800">{section.title}</h3>
                  {expandedSection === section.title ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                </button>
                {expandedSection === section.title && (
                  <div className="px-5 pb-4">
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-slate-100">
                            <th className="text-left py-2 px-2 text-slate-500 font-semibold">Description</th>
                            <th className="text-right py-2 px-2 text-blue-600 font-semibold">ATL Rate</th>
                            <th className="text-right py-2 px-2 text-red-600 font-semibold">Non-ATL Rate</th>
                          </tr>
                        </thead>
                        <tbody>
                          {section.rows.map((key) => {
                            const r = WHT_RATES[key];
                            if (!r) return null;
                            return (
                              <tr key={key} className="border-b border-slate-50 hover:bg-slate-50/50">
                                <td className="py-2 px-2 text-slate-700">{r.label}</td>
                                <td className="py-2 px-2 text-right font-semibold text-blue-700">{(r.atl * 100).toFixed(2)}%</td>
                                <td className="py-2 px-2 text-right font-semibold text-red-600">{(r.nonatl * 100).toFixed(2)}%</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            ))}

            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
              <button
                onClick={() => setExpandedSection(expandedSection === "salary_slabs" ? null : "salary_slabs")}
                className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-slate-50 transition-colors"
              >
                <h3 className="text-sm font-bold text-slate-800">Income Tax Slabs (Sec 149) — Individual / AOP</h3>
                {expandedSection === "salary_slabs" ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
              </button>
              {expandedSection === "salary_slabs" && (
                <div className="px-5 pb-4">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-100">
                        <th className="text-left py-2 px-2 text-slate-500 font-semibold">Taxable Income (Rs)</th>
                        <th className="text-left py-2 px-2 text-blue-600 font-semibold">Tax Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-slate-50"><td className="py-2 px-2 text-slate-700">Up to 600,000</td><td className="py-2 px-2 font-semibold text-emerald-600">0%</td></tr>
                      <tr className="border-b border-slate-50"><td className="py-2 px-2 text-slate-700">600,001 – 1,200,000</td><td className="py-2 px-2 font-semibold text-blue-700">1% of amount exceeding 600,000</td></tr>
                      <tr className="border-b border-slate-50"><td className="py-2 px-2 text-slate-700">1,200,001 – 2,200,000</td><td className="py-2 px-2 font-semibold text-blue-700">Rs 6,000 + 11% exceeding 1.2M</td></tr>
                      <tr className="border-b border-slate-50"><td className="py-2 px-2 text-slate-700">2,200,001 – 3,200,000</td><td className="py-2 px-2 font-semibold text-blue-700">Rs 116,000 + 23% exceeding 2.2M</td></tr>
                      <tr className="border-b border-slate-50"><td className="py-2 px-2 text-slate-700">3,200,001 – 4,100,000</td><td className="py-2 px-2 font-semibold text-blue-700">Rs 346,000 + 30% exceeding 3.2M</td></tr>
                      <tr><td className="py-2 px-2 text-slate-700">Above 4,100,000</td><td className="py-2 px-2 font-semibold text-blue-700">Rs 616,000 + 35% exceeding 4.1M + surcharge 9% if &gt;10M</td></tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "wht" && (
          <div className="grid lg:grid-cols-2 gap-6">
            <SectionCard title="Calculate Withholding Tax on Transaction">
              <div className="space-y-4">
                <SelectField
                  label="Transaction Type"
                  value={whtType}
                  onChange={setWhtType}
                  options={[
                    { value: "supply_company", label: "Supply of Goods — Company" },
                    { value: "supply_noncompany", label: "Supply of Goods — Non-Company" },
                    { value: "supply_rice_cotton", label: "Supply Rice/Cotton Seed/Edible Oils" },
                    { value: "supply_toll_company", label: "Toll Manufacturing — Company" },
                    { value: "services_it", label: "Services — IT/IT Enabled" },
                    { value: "services_general", label: "Services — General" },
                    { value: "contract_company", label: "Contract — Company" },
                    { value: "contract_noncompany", label: "Contract — Non-Company" },
                    { value: "contract_sportsperson", label: "Contract — Sports Persons" },
                    { value: "rent_company", label: "Rent — Company" },
                    { value: "import_part1", label: "Import — Part I Goods" },
                    { value: "import_part2", label: "Import — Part II Goods" },
                    { value: "import_part2_commercial", label: "Import — Part II (Commercial)" },
                    { value: "import_part3", label: "Import — Part III Goods" },
                    { value: "import_pharma", label: "Import — Pharma Products" },
                    { value: "sale_retailer", label: "Sale to Retailer (236H)" },
                    { value: "sale_distributor", label: "Sale to Distributor — Fertilizer" },
                    { value: "function_gathering", label: "Functions & Gatherings (236CB)" },
                    { value: "remittance_abroad", label: "Remittance Abroad (236Y)" },
                    { value: "bonus_shares", label: "Bonus Shares (236Z)" },
                    { value: "cash_withdrawal", label: "Cash Withdrawal (231AB)" },
                    { value: "ecommerce_digital", label: "E-Commerce — Digital Payment" },
                    { value: "ecommerce_cod", label: "E-Commerce — Cash on Delivery" },
                    { value: "auction_goods", label: "Public Auction — Goods" },
                    { value: "auction_property", label: "Public Auction — Property" },
                    { value: "export_goods", label: "Export of Goods (Sec 154)" },
                    { value: "export_services_pseb", label: "Export IT Services (PSEB)" },
                  ]}
                />
                <InputField label="Transaction Amount (Rs)" value={whtAmount} onChange={setWhtAmount} placeholder="Enter amount" />
                <ResultBox
                  label="WHT Liability"
                  value={formatPKR(whtResult.tax)}
                  breakdown={`Rate: ${(whtResult.rateUsed * 100).toFixed(2)}% (${filerStatus === "atl" ? "ATL" : "Non-ATL"}) on ${formatPKR(parseFloat(whtAmount || "0"))}`}
                />
              </div>
            </SectionCard>
            <SectionCard title="Rate Reference">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                <p className="text-sm font-semibold text-slate-700 mb-2">{whtResult.label}</p>
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <div className="p-3 rounded-lg bg-blue-50 border border-blue-100">
                    <p className="text-[10px] font-semibold text-blue-500 uppercase">ATL Rate</p>
                    <p className="text-lg font-bold text-blue-700">{(WHT_RATES[whtType]?.atl * 100 || 0).toFixed(2)}%</p>
                  </div>
                  <div className="p-3 rounded-lg bg-red-50 border border-red-100">
                    <p className="text-[10px] font-semibold text-red-500 uppercase">Non-ATL Rate</p>
                    <p className="text-lg font-bold text-red-600">{(WHT_RATES[whtType]?.nonatl * 100 || 0).toFixed(2)}%</p>
                  </div>
                </div>
                <div className="mt-4 p-3 rounded-lg bg-amber-50 border border-amber-100">
                  <div className="flex items-start gap-2">
                    <Info className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                    <p className="text-[11px] text-amber-700 leading-relaxed">
                      Non-ATL taxpayers pay double the ATL rate in most cases. Get listed on the Active Taxpayer List (ATL) to reduce your withholding tax burden.
                    </p>
                  </div>
                </div>
              </div>
              <div className="mt-4 p-3 rounded-xl bg-emerald-50 border border-emerald-100">
                <p className="text-[11px] text-emerald-700 font-semibold">Savings as ATL</p>
                <p className="text-lg font-bold text-emerald-700">
                  {formatPKR(parseFloat(whtAmount || "0") * (WHT_RATES[whtType]?.nonatl - WHT_RATES[whtType]?.atl || 0))}
                </p>
                <p className="text-[10px] text-emerald-600">You save this amount by being an Active Taxpayer</p>
              </div>
            </SectionCard>
          </div>
        )}

        {activeTab === "salary" && (
          <div className="grid lg:grid-cols-2 gap-6">
            <SectionCard title="Income Tax Calculator (Sec 149)">
              <div className="space-y-4">
                <SelectField
                  label="Taxpayer Category"
                  value={salaryType}
                  onChange={setSalaryType}
                  options={[
                    { value: "salaried", label: "Individual (Salaried — 75%+ income from salary)" },
                    { value: "business", label: "Business Individual / AOP" },
                    { value: "company", label: "Company" },
                  ]}
                />
                <InputField label="Annual Taxable Income (Rs)" value={salaryIncome} onChange={setSalaryIncome} />
                <InputField label="Advance Tax Paid (Rs)" value={advancePaid} onChange={setAdvancePaid} />
                <InputField label="WHT Credits (Rs)" value={whtCredits} onChange={setWhtCredits} />
                <ResultBox
                  label="Annual Income Tax"
                  value={formatPKR(salaryResult.tax)}
                  breakdown={salaryType === "company" ? "Corporate tax @ 29% flat rate" : salaryType === "salaried" ? `Salaried individual — progressive slab rates (Div-I, Part-I, First Schedule)${parseFloat(salaryIncome || "0") > 10000000 ? " + 9% surcharge" : ""}` : `Business individual/AOP — progressive slab rates${parseFloat(salaryIncome || "0") > 10000000 ? " + 9% surcharge" : ""}`}
                />
                <div className={`p-4 rounded-xl border ${salaryResult.net > 0 ? "bg-red-50 border-red-100" : "bg-emerald-50 border-emerald-100"}`}>
                  <p className="text-xs font-semibold text-slate-600 mb-1">{salaryResult.net > 0 ? "Net Tax Payable" : "Refundable Amount"}</p>
                  <p className={`text-xl font-bold ${salaryResult.net > 0 ? "text-red-700" : "text-emerald-700"}`}>{formatPKR(Math.abs(salaryResult.net))}</p>
                </div>
              </div>
            </SectionCard>
            <SectionCard title="Quarterly Advance Tax Estimate">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 mb-4">
                <p className="text-sm font-semibold text-slate-700 mb-2">Estimated Quarterly Installment</p>
                <p className="text-2xl font-bold text-blue-700">{formatPKR(salaryResult.quarterly)}</p>
                <p className="text-[11px] text-slate-500 mt-2">Each quarter: 25% of estimated annual tax</p>
              </div>
              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-600 mb-2">Due Dates</p>
                {["Sep 15 — Q1", "Dec 15 — Q2", "Mar 15 — Q3", "Jun 15 — Q4"].map((d) => (
                  <div key={d} className="flex items-center gap-2 text-xs text-slate-600 p-2 rounded-lg bg-white border border-slate-100">
                    <CheckCircle2 className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                    <span>{d} — {formatPKR(salaryResult.quarterly)}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 p-3 rounded-xl bg-slate-50 border border-slate-200">
                <h4 className="text-xs font-bold text-slate-700 mb-2">Tax Slab Applied</h4>
                {salaryType === "company" ? (
                  <p className="text-xs text-slate-600">Flat corporate rate: 29%</p>
                ) : (
                  <div className="space-y-1">
                    <p className="text-[10px] text-slate-400 mb-1.5">{salaryType === "salaried" ? "Salaried Individual (75%+ from salary) — Div-I, Part-I" : "Business Individual / AOP — Div-I, Part-I"}</p>
                    {SALARY_SLABS.map((slab, i) => {
                      const income = parseFloat(salaryIncome || "0");
                      const isActive = income >= slab.min && (income <= slab.max || slab.max === Infinity);
                      return (
                        <div key={i} className={`text-[11px] px-2 py-1 rounded ${isActive ? "bg-blue-100 text-blue-800 font-semibold" : "text-slate-500"}`}>
                          {slab.max === Infinity ? `Above ${formatPKR(slab.min)}` : `${formatPKR(slab.min)} – ${formatPKR(slab.max)}`}: {(slab.rate * 100).toFixed(0)}%
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </SectionCard>
          </div>
        )}

        {activeTab === "property" && (
          <div className="grid lg:grid-cols-2 gap-6">
            <SectionCard title="Property Tax Calculator (Sec 236C / 236K)">
              <div className="space-y-4">
                <SelectField
                  label="Transaction Type"
                  value={propType}
                  onChange={setPropType}
                  options={[
                    { value: "transfer", label: "Transfer of Property (Seller) — Sec 236C" },
                    { value: "purchase", label: "Purchase of Property (Buyer) — Sec 236K" },
                  ]}
                />
                <InputField label="Property Value / Consideration (Rs)" value={propValue} onChange={setPropValue} />
                <SelectField
                  label="Filer Status"
                  value={propFiler}
                  onChange={setPropFiler}
                  options={[
                    { value: "atl", label: "ATL (Active Taxpayer)" },
                    { value: "nonatl", label: "Non-ATL" },
                    { value: "late", label: "Late Filer" },
                  ]}
                />
                <ResultBox
                  label="Advance Tax on Property"
                  value={formatPKR(propResult.tax)}
                  breakdown={`Rate: ${(propResult.rate * 100).toFixed(2)}% on ${formatPKR(parseFloat(propValue || "0"))}`}
                />
              </div>
            </SectionCard>
            <SectionCard title="Property Tax Rate Slabs">
              <div className="space-y-4">
                <div>
                  <h4 className="text-xs font-bold text-slate-700 mb-2">236C — Transfer (Seller)</h4>
                  <table className="w-full text-xs">
                    <thead><tr className="border-b border-slate-100"><th className="text-left py-1.5 px-2 text-slate-500">Slab</th><th className="text-right py-1.5 px-2 text-blue-600">ATL</th><th className="text-right py-1.5 px-2 text-red-600">Non-ATL</th><th className="text-right py-1.5 px-2 text-amber-600">Late</th></tr></thead>
                    <tbody>
                      <tr className="border-b border-slate-50"><td className="py-1.5 px-2">Up to 50M</td><td className="py-1.5 px-2 text-right font-semibold text-blue-700">4.5%</td><td className="py-1.5 px-2 text-right font-semibold text-red-600">11.5%</td><td className="py-1.5 px-2 text-right font-semibold text-amber-600">7.5%</td></tr>
                      <tr className="border-b border-slate-50"><td className="py-1.5 px-2">50M – 100M</td><td className="py-1.5 px-2 text-right font-semibold text-blue-700">5.0%</td><td className="py-1.5 px-2 text-right font-semibold text-red-600">11.5%</td><td className="py-1.5 px-2 text-right font-semibold text-amber-600">8.5%</td></tr>
                      <tr><td className="py-1.5 px-2">Above 100M</td><td className="py-1.5 px-2 text-right font-semibold text-blue-700">5.5%</td><td className="py-1.5 px-2 text-right font-semibold text-red-600">11.5%</td><td className="py-1.5 px-2 text-right font-semibold text-amber-600">9.5%</td></tr>
                    </tbody>
                  </table>
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-700 mb-2">236K — Purchase (Buyer)</h4>
                  <table className="w-full text-xs">
                    <thead><tr className="border-b border-slate-100"><th className="text-left py-1.5 px-2 text-slate-500">Slab</th><th className="text-right py-1.5 px-2 text-blue-600">ATL</th><th className="text-right py-1.5 px-2 text-red-600">Non-ATL</th><th className="text-right py-1.5 px-2 text-amber-600">Late</th></tr></thead>
                    <tbody>
                      <tr className="border-b border-slate-50"><td className="py-1.5 px-2">Up to 50M</td><td className="py-1.5 px-2 text-right font-semibold text-blue-700">1.5%</td><td className="py-1.5 px-2 text-right font-semibold text-red-600">10.5%</td><td className="py-1.5 px-2 text-right font-semibold text-amber-600">4.5%</td></tr>
                      <tr className="border-b border-slate-50"><td className="py-1.5 px-2">50M – 100M</td><td className="py-1.5 px-2 text-right font-semibold text-blue-700">2.0%</td><td className="py-1.5 px-2 text-right font-semibold text-red-600">14.5%</td><td className="py-1.5 px-2 text-right font-semibold text-amber-600">5.5%</td></tr>
                      <tr><td className="py-1.5 px-2">Above 100M</td><td className="py-1.5 px-2 text-right font-semibold text-blue-700">2.5%</td><td className="py-1.5 px-2 text-right font-semibold text-red-600">18.5%</td><td className="py-1.5 px-2 text-right font-semibold text-amber-600">6.5%</td></tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </SectionCard>
          </div>
        )}

        {activeTab === "vehicle" && (
          <div className="grid lg:grid-cols-2 gap-6">
            <SectionCard title="Motor Vehicle Tax (Sec 231B / 234)">
              <div className="space-y-4">
                <SelectField
                  label="Engine Capacity (cc)"
                  value={vehicleCC}
                  onChange={setVehicleCC}
                  options={Object.entries(VEHICLE_FIXED_RATES).map(([k, v]) => ({ value: k, label: v.label }))}
                />
                {vehicleCC === "above3000" && (
                  <InputField label="Vehicle Value (Rs) — for % based rate" value={vehicleValue} onChange={setVehicleValue} />
                )}
                <ResultBox
                  label="Registration Tax (Sec 231B)"
                  value={formatPKR(vehicleResult.total)}
                  breakdown={vehicleCC === "above3000"
                    ? `Fixed: ${formatPKR(vehicleResult.registration)} + ${filerStatus === "atl" ? "12%" : "36%"} of value: ${formatPKR(vehicleResult.percentBased)}`
                    : `Fixed rate for ${vehicleResult.label} (${filerStatus === "atl" ? "ATL" : "Non-ATL"})`
                  }
                />
                <div className="p-4 rounded-xl bg-amber-50 border border-amber-100">
                  <p className="text-xs font-semibold text-amber-700 mb-1">Annual Motor Vehicle Tax (Sec 234)</p>
                  <p className="text-lg font-bold text-amber-700">{formatPKR(vehicleResult.annual)}</p>
                  <p className="text-[10px] text-amber-600 mt-1">Payable annually at time of token renewal</p>
                </div>
              </div>
            </SectionCard>
            <SectionCard title="Registration Tax Schedule (Sec 231B(2))">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="text-left py-2 px-2 text-slate-500">Engine CC</th>
                      <th className="text-right py-2 px-2 text-blue-600">ATL</th>
                      <th className="text-right py-2 px-2 text-red-600">Non-ATL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(VEHICLE_FIXED_RATES).map(([k, v]) => (
                      <tr key={k} className={`border-b border-slate-50 ${vehicleCC === k ? "bg-blue-50" : ""}`}>
                        <td className="py-2 px-2 text-slate-700">{v.label}</td>
                        <td className="py-2 px-2 text-right font-semibold text-blue-700">{formatPKR(v.atl)}</td>
                        <td className="py-2 px-2 text-right font-semibold text-red-600">{formatPKR(v.nonatl)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 p-3 rounded-lg bg-slate-50 border border-slate-100">
                <div className="flex items-start gap-2">
                  <Info className="w-3.5 h-3.5 text-slate-500 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-slate-600">For vehicles above 3000cc, an additional 12% (ATL) / 36% (Non-ATL) of vehicle value applies under Sec 231B(1). Tax reduces by 10% per year from date of registration.</p>
                </div>
              </div>
            </SectionCard>
          </div>
        )}

        {activeTab === "investment" && (
          <div className="grid lg:grid-cols-2 gap-6">
            <SectionCard title="Investment Income Tax (Sec 150 / 151)">
              <div className="space-y-4">
                <SelectField
                  label="Investment Type"
                  value={investType}
                  onChange={setInvestType}
                  options={[
                    { value: "dividend_ipp", label: "Dividend — IPPs" },
                    { value: "dividend_reit", label: "Dividend — REIT / General" },
                    { value: "dividend_mutual_debt", label: "Dividend — Mutual Fund (Debt >50%)" },
                    { value: "dividend_mutual_equity", label: "Dividend — Mutual Fund (Equity)" },
                    { value: "dividend_spv_reit", label: "Dividend — REIT from SPV (Exempt)" },
                    { value: "dividend_spv_other", label: "Dividend — Others from SPV" },
                    { value: "profit_bank", label: "Profit on Debt — Bank Deposit" },
                    { value: "profit_govt", label: "Profit — Govt Securities" },
                    { value: "profit_other", label: "Profit on Debt — Other" },
                    { value: "profit_sukuk_company", label: "Sukuk — Company Holder" },
                    { value: "profit_sukuk_ind_high", label: "Sukuk — Individual (Return >1M)" },
                    { value: "profit_sukuk_ind_low", label: "Sukuk — Individual (Return <1M)" },
                  ]}
                />
                <InputField label="Investment Amount / Income (Rs)" value={investAmount} onChange={setInvestAmount} />
                <ResultBox
                  label="Withholding Tax on Investment"
                  value={formatPKR(investResult.tax)}
                  breakdown={`Rate: ${(investResult.rateUsed * 100).toFixed(2)}% (${filerStatus === "atl" ? "ATL" : "Non-ATL"}) — ${investResult.label}`}
                />
              </div>
            </SectionCard>
            <SectionCard title="Investment Tax Rate Reference">
              <div className="space-y-3">
                {["dividend_ipp", "dividend_reit", "dividend_mutual_debt", "dividend_mutual_equity", "profit_bank", "profit_govt", "profit_other", "profit_sukuk_company", "profit_sukuk_ind_high", "profit_sukuk_ind_low"].map((key) => {
                  const r = WHT_RATES[key];
                  if (!r) return null;
                  return (
                    <div key={key} className={`flex items-center justify-between p-2.5 rounded-lg border ${investType === key ? "bg-blue-50 border-blue-200" : "bg-white border-slate-100"}`}>
                      <span className="text-[11px] text-slate-700 font-medium">{r.label}</span>
                      <div className="flex gap-3">
                        <span className="text-[11px] font-bold text-blue-600">{(r.atl * 100).toFixed(1)}%</span>
                        <span className="text-[11px] font-bold text-red-500">{(r.nonatl * 100).toFixed(1)}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </SectionCard>
          </div>
        )}

        {activeTab === "rental" && (
          <div className="grid lg:grid-cols-2 gap-6">
            <SectionCard title="Rental Income Tax (Sec 155)">
              <div className="space-y-4">
                <SelectField
                  label="Entity Type"
                  value={rentEntity}
                  onChange={setRentEntity}
                  options={[
                    { value: "individual", label: "Individual / AOP" },
                    { value: "company", label: "Company" },
                  ]}
                />
                <InputField label="Annual Rent Amount (Rs)" value={rentAmount} onChange={setRentAmount} />
                <ResultBox
                  label="Rental Income Tax"
                  value={formatPKR(
                    rentEntity === "company"
                      ? parseFloat(rentAmount || "0") * (filerStatus === "atl" ? 0.15 : 0.30)
                      : (() => {
                          const amt = parseFloat(rentAmount || "0");
                          let tax = 0;
                          if (amt > 2000000) {
                            tax = (300000 * 0) + (300000 * 0.05) + (1400000 * 0.10) + ((amt - 2000000) * 0.15);
                          } else if (amt > 600000) {
                            tax = (300000 * 0) + (300000 * 0.05) + ((amt - 600000) * 0.10);
                          } else if (amt > 300000) {
                            tax = (300000 * 0) + ((amt - 300000) * 0.05);
                          }
                          if (filerStatus === "nonatl") tax *= 2;
                          return tax;
                        })()
                  )}
                  breakdown={rentEntity === "company" ? `Flat rate: ${filerStatus === "atl" ? "15%" : "30%"} (${filerStatus === "atl" ? "ATL" : "Non-ATL"})` : "Progressive slab rates for individuals"}
                />
              </div>
            </SectionCard>
            <SectionCard title="Individual Rent Tax Slabs">
              <table className="w-full text-xs">
                <thead><tr className="border-b border-slate-100"><th className="text-left py-2 px-2 text-slate-500">Annual Rent</th><th className="text-right py-2 px-2 text-blue-600">ATL Rate</th></tr></thead>
                <tbody>
                  <tr className="border-b border-slate-50"><td className="py-2 px-2">Up to 300,000</td><td className="py-2 px-2 text-right font-semibold text-emerald-600">0%</td></tr>
                  <tr className="border-b border-slate-50"><td className="py-2 px-2">300,001 – 600,000</td><td className="py-2 px-2 text-right font-semibold text-blue-700">5%</td></tr>
                  <tr className="border-b border-slate-50"><td className="py-2 px-2">600,001 – 2,000,000</td><td className="py-2 px-2 text-right font-semibold text-blue-700">10%</td></tr>
                  <tr><td className="py-2 px-2">Above 2,000,000</td><td className="py-2 px-2 text-right font-semibold text-blue-700">15%</td></tr>
                </tbody>
              </table>
              <div className="mt-4 p-3 rounded-lg bg-slate-50 border border-slate-100">
                <p className="text-[11px] text-slate-600">Companies: Flat 15% (ATL) / 30% (Non-ATL). Individuals use progressive slabs. Non-ATL individuals pay double the ATL slab rates.</p>
              </div>
            </SectionCard>
          </div>
        )}

        {activeTab === "misc" && (
          <div className="grid lg:grid-cols-2 gap-6">
            <SectionCard title="Other WHT Sections">
              <div className="space-y-4">
                <SelectField
                  label="Section / Category"
                  value={miscType}
                  onChange={setMiscType}
                  options={[
                    { value: "function_gathering", label: "Functions & Gatherings (236CB)" },
                    { value: "remittance_abroad", label: "Remittance Abroad (236Y)" },
                    { value: "bonus_shares", label: "Bonus Shares (236Z)" },
                    { value: "cash_withdrawal", label: "Cash Withdrawal (231AB)" },
                    { value: "prize_bond", label: "Prize Bond / Lottery" },
                    { value: "prize_quiz", label: "Quiz / Promotion Prize" },
                    { value: "petroleum", label: "Petroleum Products (156A)" },
                    { value: "brokerage_advertising", label: "Commission — Advertising Agent" },
                    { value: "brokerage_life_insurance", label: "Commission — Life Insurance" },
                    { value: "brokerage_general", label: "Commission — General (Sec 233)" },
                    { value: "sale_distributor", label: "Sale to Distributor — Fertilizer" },
                    { value: "sale_distributor_other", label: "Sale to Distributor — Other" },
                    { value: "sale_retailer", label: "Sale to Retailer (236H)" },
                    { value: "auction_goods", label: "Public Auction — Goods (236A)" },
                    { value: "auction_property", label: "Public Auction — Property" },
                    { value: "nonresident_general", label: "Non-Resident — General (152(1))" },
                    { value: "nonresident_1aa", label: "Non-Resident — IT Services" },
                    { value: "export_goods", label: "Export of Goods (154)" },
                    { value: "export_services_pseb", label: "Export IT Services — PSEB" },
                    { value: "ecommerce_digital", label: "E-Commerce Digital Payment" },
                    { value: "ecommerce_cod", label: "E-Commerce COD" },
                  ]}
                />
                <InputField label="Amount (Rs)" value={miscAmount} onChange={setMiscAmount} />
                <ResultBox
                  label="Tax Liability"
                  value={formatPKR(miscResult.tax)}
                  breakdown={`Rate: ${(miscResult.rateUsed * 100).toFixed(2)}% (${filerStatus === "atl" ? "ATL" : "Non-ATL"}) — ${miscResult.label}`}
                />
              </div>
            </SectionCard>
            <SectionCard title="Quick Reference — Miscellaneous Rates">
              <div className="space-y-2">
                {[
                  "function_gathering", "remittance_abroad", "bonus_shares", "cash_withdrawal",
                  "prize_bond", "prize_quiz", "petroleum", "brokerage_general",
                  "sale_retailer", "auction_goods", "nonresident_general",
                ].map((key) => {
                  const r = WHT_RATES[key];
                  if (!r) return null;
                  return (
                    <div key={key} className={`flex items-center justify-between p-2 rounded-lg border ${miscType === key ? "bg-blue-50 border-blue-200" : "bg-white border-slate-100"}`}>
                      <span className="text-[11px] text-slate-700">{r.label}</span>
                      <div className="flex gap-3">
                        <span className="text-[10px] font-bold text-blue-600">{(r.atl * 100).toFixed(1)}%</span>
                        <span className="text-[10px] font-bold text-red-500">{(r.nonatl * 100).toFixed(1)}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </SectionCard>
          </div>
        )}

        <div className="mt-8 text-center py-4 border-t border-slate-200">
          <p className="text-[11px] text-slate-400">
            Based on Finance Act 2025 (FBR Rate Card). For statutory accuracy, refer to the Income Tax Ordinance, 2001. Rates subject to change.
          </p>
          <p className="text-[10px] text-slate-400 mt-1">
            Powered by Alam &amp; Aulakh, Chartered Accountants — <a href="https://www.ana-ca.com" className="text-blue-500 hover:underline">www.ana-ca.com</a>
          </p>
        </div>
      </div>
    </div>
  );
}
