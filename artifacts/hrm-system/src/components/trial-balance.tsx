import React, { useState, useMemo, useCallback } from "react";
import {
  Search, Plus, Trash2, RefreshCw, AlertTriangle, CheckCircle2,
  ChevronDown, Filter, ArrowUpDown, Download
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export interface TBLine {
  id: string;
  accountCode: string;
  accountName: string;
  debit: string;
  credit: string;
  pyBalance: string;
  group: string;
  fsHead: string;
  mappingStatus: "mapped" | "unmapped" | "review";
  isCustom?: boolean;
}

const TB_GROUPS = [
  "Non-Current Assets", "Current Assets",
  "Equity",
  "Non-Current Liabilities", "Current Liabilities",
  "Revenue", "Cost of Sales",
  "Operating Expenses", "Finance Costs", "Other Income",
  "Taxation", "Other Comprehensive Income",
];

const FS_HEADS: Record<string, string[]> = {
  "Non-Current Assets": ["Property, Plant & Equipment", "Capital Work-in-Progress", "Right-of-Use Assets", "Intangible Assets", "Long-term Investments", "Long-term Deposits & Prepayments"],
  "Current Assets": ["Stores, Spare Parts & Loose Tools", "Stock-in-Trade", "Trade Debts", "Loans & Advances", "Short-term Prepayments", "Other Receivables", "Tax Refunds Due from Government", "Cash & Bank Balances"],
  "Equity": ["Share Capital", "Share Premium", "General Reserve", "Unappropriated Profit"],
  "Non-Current Liabilities": ["Long-term Financing", "Lease Liabilities (Non-Current)", "Deferred Tax Liability", "Staff Retirement Benefits"],
  "Current Liabilities": ["Trade & Other Payables", "Accrued Liabilities & Provisions", "Short-term Borrowings", "Current Portion of Long-term Financing", "Sales Tax Payable", "Income Tax Payable"],
  "Revenue": ["Net Sales / Revenue from Contracts"],
  "Cost of Sales": ["Cost of Sales"],
  "Operating Expenses": ["Distribution & Selling Expenses", "Administrative & General Expenses", "Other Operating Expenses"],
  "Finance Costs": ["Finance Costs"],
  "Other Income": ["Other Income / Gain on Disposal"],
  "Taxation": ["Current Tax Expense", "Deferred Tax (Charge)/Credit"],
  "Other Comprehensive Income": ["Actuarial Gains/(Losses)", "Exchange Differences"],
};

function parseNum(s: string): number {
  if (!s) return 0;
  const cleaned = s.replace(/[^0-9.\-()]/g, "");
  if (cleaned.startsWith("(") && cleaned.endsWith(")")) return -parseFloat(cleaned.slice(1, -1)) || 0;
  return parseFloat(cleaned) || 0;
}

function fmtNum(n: number): string {
  if (n === 0) return "";
  const abs = Math.abs(n);
  const formatted = abs.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  return n < 0 ? `(${formatted})` : formatted;
}

interface TrialBalanceProps {
  lines: TBLine[];
  onLinesChange: (lines: TBLine[]) => void;
  onRerunAI: () => void;
  isLoading: boolean;
}

export default function TrialBalance({ lines, onLinesChange, onRerunAI, isLoading }: TrialBalanceProps) {
  const [search, setSearch] = useState("");
  const [filterGroup, setFilterGroup] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const updateLine = useCallback((id: string, field: keyof TBLine, value: string) => {
    onLinesChange(lines.map(l => {
      if (l.id !== id) return l;
      const updated = { ...l, [field]: value };
      if (field === "group" || field === "fsHead") {
        updated.mappingStatus = updated.group && updated.fsHead ? "mapped" : "unmapped";
      }
      return updated;
    }));
  }, [lines, onLinesChange]);

  const addRow = useCallback(() => {
    const newLine: TBLine = {
      id: `tb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      accountCode: "",
      accountName: "",
      debit: "",
      credit: "",
      pyBalance: "",
      group: "",
      fsHead: "",
      mappingStatus: "unmapped",
      isCustom: true,
    };
    onLinesChange([...lines, newLine]);
  }, [lines, onLinesChange]);

  const deleteRow = useCallback((id: string) => {
    onLinesChange(lines.filter(l => l.id !== id));
  }, [lines, onLinesChange]);

  const filtered = useMemo(() => {
    let result = lines;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(l =>
        l.accountCode.toLowerCase().includes(q) ||
        l.accountName.toLowerCase().includes(q) ||
        l.fsHead.toLowerCase().includes(q)
      );
    }
    if (filterGroup !== "all") result = result.filter(l => l.group === filterGroup);
    if (filterStatus !== "all") result = result.filter(l => l.mappingStatus === filterStatus);
    if (sortCol) {
      result = [...result].sort((a, b) => {
        let aVal = (a as any)[sortCol] || "";
        let bVal = (b as any)[sortCol] || "";
        if (sortCol === "debit" || sortCol === "credit" || sortCol === "pyBalance") {
          aVal = parseNum(aVal);
          bVal = parseNum(bVal);
        }
        if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
        if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
        return 0;
      });
    }
    return result;
  }, [lines, search, filterGroup, filterStatus, sortCol, sortDir]);

  const totals = useMemo(() => {
    let totalDebit = 0, totalCredit = 0, totalPy = 0;
    let mapped = 0, unmapped = 0, review = 0;
    lines.forEach(l => {
      totalDebit += parseNum(l.debit);
      totalCredit += parseNum(l.credit);
      totalPy += parseNum(l.pyBalance);
      if (l.mappingStatus === "mapped") mapped++;
      else if (l.mappingStatus === "review") review++;
      else unmapped++;
    });
    const difference = Math.abs(totalDebit - totalCredit);
    const balanced = difference < 1;
    return { totalDebit, totalCredit, totalPy, difference, balanced, mapped, unmapped, review, total: lines.length };
  }, [lines]);

  const handleSort = (col: string) => {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("asc"); }
  };

  const SortHeader = ({ col, children, className = "" }: { col: string; children: React.ReactNode; className?: string }) => (
    <th
      onClick={() => handleSort(col)}
      className={`font-bold text-slate-500 py-2.5 px-2 cursor-pointer hover:text-slate-700 select-none transition-colors ${className}`}
    >
      <div className="flex items-center gap-1">
        {children}
        <ArrowUpDown className={`w-3 h-3 shrink-0 ${sortCol === col ? 'text-blue-500' : 'text-slate-300'}`} />
      </div>
    </th>
  );

  const statusBadge = (status: string) => {
    if (status === "mapped") return <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Mapped</span>;
    if (status === "review") return <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">Review</span>;
    return <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-600">Unmapped</span>;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by code, name, or FS head..."
            className="h-9 pl-9 rounded-lg text-sm"
          />
        </div>
        <Select value={filterGroup} onValueChange={setFilterGroup}>
          <SelectTrigger className="h-9 w-[180px] rounded-lg text-xs font-medium">
            <Filter className="w-3 h-3 mr-1.5 text-slate-400" />
            <SelectValue placeholder="All Groups" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Groups</SelectItem>
            {TB_GROUPS.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="h-9 w-[140px] rounded-lg text-xs font-medium">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="mapped">Mapped</SelectItem>
            <SelectItem value="unmapped">Unmapped</SelectItem>
            <SelectItem value="review">Review</SelectItem>
          </SelectContent>
        </Select>
        <button
          onClick={onRerunAI}
          disabled={isLoading}
          className="h-9 px-3 flex items-center gap-1.5 text-xs font-bold text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          Re-run AI Coding
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-white rounded-lg border border-slate-200 p-3 text-center">
          <p className="text-[10px] font-bold text-slate-400 uppercase">Total Lines</p>
          <p className="text-lg font-black text-slate-800">{totals.total}</p>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-3 text-center">
          <p className="text-[10px] font-bold text-slate-400 uppercase">Total Debits</p>
          <p className="text-sm font-bold text-slate-800 font-mono">{fmtNum(totals.totalDebit)}</p>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-3 text-center">
          <p className="text-[10px] font-bold text-slate-400 uppercase">Total Credits</p>
          <p className="text-sm font-bold text-slate-800 font-mono">{fmtNum(totals.totalCredit)}</p>
        </div>
        <div className={`rounded-lg border p-3 text-center ${totals.balanced ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
          <p className="text-[10px] font-bold uppercase">{totals.balanced ? <span className="text-emerald-600">Balanced</span> : <span className="text-red-600">Difference</span>}</p>
          <div className="flex items-center justify-center gap-1 mt-0.5">
            {totals.balanced ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertTriangle className="w-4 h-4 text-red-500" />}
            <p className={`text-sm font-bold font-mono ${totals.balanced ? 'text-emerald-700' : 'text-red-700'}`}>{totals.balanced ? "0" : fmtNum(totals.difference)}</p>
          </div>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-3 text-center">
          <p className="text-[10px] font-bold text-slate-400 uppercase">Mapping</p>
          <div className="flex items-center justify-center gap-2 mt-0.5">
            <span className="text-[10px] font-bold text-emerald-600">{totals.mapped}</span>
            {totals.review > 0 && <span className="text-[10px] font-bold text-amber-600">{totals.review}</span>}
            {totals.unmapped > 0 && <span className="text-[10px] font-bold text-red-500">{totals.unmapped}</span>}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
              <tr>
                <SortHeader col="accountCode" className="w-[80px] text-left">Code</SortHeader>
                <SortHeader col="accountName" className="text-left min-w-[200px]">Account Name</SortHeader>
                <SortHeader col="debit" className="w-[110px] text-right">Debit (CY)</SortHeader>
                <SortHeader col="credit" className="w-[110px] text-right">Credit (CY)</SortHeader>
                <th className="font-bold text-slate-500 py-2.5 px-2 w-[110px] text-right">CY Net</th>
                <SortHeader col="pyBalance" className="w-[110px] text-right">PY Balance</SortHeader>
                <SortHeader col="group" className="w-[150px] text-left">Group</SortHeader>
                <SortHeader col="fsHead" className="w-[180px] text-left">FS Head</SortHeader>
                <th className="font-bold text-slate-500 py-2.5 px-2 w-[70px] text-center">Status</th>
                <th className="w-[40px]"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400 text-sm">
                    {isLoading ? "AI is extracting and coding trial balance..." : lines.length === 0 ? "No trial balance data yet. Upload documents or add rows manually." : "No lines match your filters."}
                  </td>
                </tr>
              )}
              {filtered.map((line) => {
                const cyNet = parseNum(line.debit) - parseNum(line.credit);
                const isUnmapped = line.mappingStatus === "unmapped";
                return (
                  <tr key={line.id} className={`group hover:bg-slate-50/70 transition-colors ${isUnmapped ? 'bg-red-50/30' : ''}`}>
                    <td className="py-1.5 px-2">
                      <input
                        value={line.accountCode}
                        onChange={e => updateLine(line.id, "accountCode", e.target.value)}
                        placeholder="Code"
                        className="w-full bg-transparent border-transparent hover:border-slate-200 focus:border-blue-500 focus:bg-white rounded px-1 py-1 outline-none font-mono text-xs transition-all"
                      />
                    </td>
                    <td className="py-1.5 px-2">
                      <input
                        value={line.accountName}
                        onChange={e => updateLine(line.id, "accountName", e.target.value)}
                        placeholder="Account name..."
                        className="w-full bg-transparent border-transparent hover:border-slate-200 focus:border-blue-500 focus:bg-white rounded px-1 py-1 outline-none text-xs font-medium transition-all"
                      />
                    </td>
                    <td className="py-1.5 px-2">
                      <input
                        value={line.debit}
                        onChange={e => updateLine(line.id, "debit", e.target.value)}
                        placeholder="0"
                        className="w-full text-right bg-transparent border-transparent hover:border-slate-200 focus:border-blue-500 focus:bg-white rounded px-1 py-1 outline-none font-mono text-xs transition-all"
                      />
                    </td>
                    <td className="py-1.5 px-2">
                      <input
                        value={line.credit}
                        onChange={e => updateLine(line.id, "credit", e.target.value)}
                        placeholder="0"
                        className="w-full text-right bg-transparent border-transparent hover:border-slate-200 focus:border-blue-500 focus:bg-white rounded px-1 py-1 outline-none font-mono text-xs transition-all"
                      />
                    </td>
                    <td className="py-1.5 px-2 text-right font-mono font-bold text-xs">
                      <span className={cyNet < 0 ? 'text-red-600' : cyNet > 0 ? 'text-slate-800' : 'text-slate-300'}>
                        {fmtNum(cyNet)}
                      </span>
                    </td>
                    <td className="py-1.5 px-2">
                      <input
                        value={line.pyBalance}
                        onChange={e => updateLine(line.id, "pyBalance", e.target.value)}
                        placeholder="0"
                        className="w-full text-right bg-transparent border-transparent hover:border-slate-200 focus:border-blue-500 focus:bg-white rounded px-1 py-1 outline-none font-mono text-xs transition-all"
                      />
                    </td>
                    <td className="py-1.5 px-2">
                      <select
                        value={line.group}
                        onChange={e => {
                          updateLine(line.id, "group", e.target.value);
                          updateLine(line.id, "fsHead", "");
                        }}
                        className="w-full bg-transparent border-transparent hover:border-slate-200 focus:border-blue-500 focus:bg-white rounded px-0.5 py-1 outline-none text-[11px] cursor-pointer transition-all"
                      >
                        <option value="">—</option>
                        {TB_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
                      </select>
                    </td>
                    <td className="py-1.5 px-2">
                      <select
                        value={line.fsHead}
                        onChange={e => updateLine(line.id, "fsHead", e.target.value)}
                        className="w-full bg-transparent border-transparent hover:border-slate-200 focus:border-blue-500 focus:bg-white rounded px-0.5 py-1 outline-none text-[11px] cursor-pointer transition-all"
                      >
                        <option value="">—</option>
                        {(FS_HEADS[line.group] || []).map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </td>
                    <td className="py-1.5 px-2 text-center">
                      {statusBadge(line.mappingStatus)}
                    </td>
                    <td className="py-1.5 px-1">
                      <button
                        onClick={() => deleteRow(line.id)}
                        className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-red-50 text-slate-400 hover:text-red-500 transition-all"
                        title="Delete row"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {lines.length > 0 && (
              <tfoot className="bg-slate-50 border-t-2 border-slate-200">
                <tr className="font-bold text-xs">
                  <td className="py-3 px-2 text-slate-500" colSpan={2}>TOTALS ({lines.length} lines)</td>
                  <td className="py-3 px-2 text-right font-mono text-slate-800">{fmtNum(totals.totalDebit)}</td>
                  <td className="py-3 px-2 text-right font-mono text-slate-800">{fmtNum(totals.totalCredit)}</td>
                  <td className="py-3 px-2 text-right font-mono font-black">
                    <span className={totals.balanced ? 'text-emerald-700' : 'text-red-600'}>
                      {fmtNum(totals.totalDebit - totals.totalCredit)}
                    </span>
                  </td>
                  <td className="py-3 px-2 text-right font-mono text-slate-600">{fmtNum(totals.totalPy)}</td>
                  <td colSpan={4}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      <button
        onClick={addRow}
        className="flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-700 px-3 py-2 rounded-lg hover:bg-blue-50 transition-colors"
      >
        <Plus className="w-3.5 h-3.5" /> Add Row
      </button>
    </div>
  );
}
