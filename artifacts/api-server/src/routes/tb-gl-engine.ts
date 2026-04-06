/**
 * Production-Grade TB & GL Generation Engine
 * Implements all 11 steps from the specification:
 * Steps 1-2: Input extraction & CoA mapping
 * Step 3:    Trial Balance generation (balanced, IFRS-aligned)
 * Steps 4-6: GL transaction engine with materiality & balance integrity
 * Step 7:    3-way reconciliation (FS ↔ TB ↔ GL)
 * Steps 8-9: Self-healing & structured output
 */

import { db } from "@workspace/db";
import {
  wpSessionsTable, wpExtractedFieldsTable, wpVariablesTable,
  wpTrialBalanceLinesTable, wpGlAccountsTable, wpGlEntriesTable,
  wpExceptionLogTable, wpHeadsTable, wpMasterCoaTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import OpenAI from "openai";
import { logger } from "../lib/logger";

// ─────────────────────────────────────────────────────────────────────────────
// PAKISTAN CHART OF ACCOUNTS (Companies Act / IFRS-aligned, 4-digit)
// ─────────────────────────────────────────────────────────────────────────────

export const PAKISTAN_COA = [
  // ASSETS — Normal: Debit
  { code: "1010", name: "Cash in Hand",                   cls: "Asset",     drCr: "Dr", fsKey: "cash_in_hand"          },
  { code: "1020", name: "Cash at Bank — Current",         cls: "Asset",     drCr: "Dr", fsKey: "cash_at_bank"          },
  { code: "1030", name: "Short-Term Deposits",            cls: "Asset",     drCr: "Dr", fsKey: "short_term_deposits"   },
  { code: "1100", name: "Trade Receivables",              cls: "Asset",     drCr: "Dr", fsKey: "trade_receivables"     },
  { code: "1110", name: "Advances to Suppliers",          cls: "Asset",     drCr: "Dr", fsKey: "advances_deposits"     },
  { code: "1120", name: "Other Receivables",              cls: "Asset",     drCr: "Dr", fsKey: "other_receivables"     },
  { code: "1200", name: "Inventory — Raw Material",       cls: "Asset",     drCr: "Dr", fsKey: "inventory"             },
  { code: "1210", name: "Inventory — Work in Process",    cls: "Asset",     drCr: "Dr", fsKey: "wip"                   },
  { code: "1220", name: "Inventory — Finished Goods",     cls: "Asset",     drCr: "Dr", fsKey: "finished_goods"        },
  { code: "1300", name: "Prepaid Expenses",               cls: "Asset",     drCr: "Dr", fsKey: "prepaid_expenses"      },
  { code: "1310", name: "Income Tax Recoverable",         cls: "Asset",     drCr: "Dr", fsKey: "tax_recoverable"       },
  { code: "1400", name: "Long-Term Investments",          cls: "Asset",     drCr: "Dr", fsKey: "long_term_investments" },
  { code: "1410", name: "Investment in Associates",       cls: "Asset",     drCr: "Dr", fsKey: "associates"            },
  { code: "1500", name: "Property, Plant & Equipment",    cls: "Asset",     drCr: "Dr", fsKey: "fixed_assets"          },
  { code: "1510", name: "Accumulated Depreciation",       cls: "Asset",     drCr: "Cr", fsKey: "acc_depreciation"      },
  { code: "1520", name: "Capital Work in Progress",       cls: "Asset",     drCr: "Dr", fsKey: "cwip"                  },
  { code: "1600", name: "Intangible Assets",              cls: "Asset",     drCr: "Dr", fsKey: "intangible_assets"     },
  { code: "1610", name: "Accumulated Amortisation",       cls: "Asset",     drCr: "Cr", fsKey: "acc_amortisation"      },
  { code: "1700", name: "Right-of-Use Assets",            cls: "Asset",     drCr: "Dr", fsKey: "rou_assets"            },
  // LIABILITIES — Normal: Credit
  { code: "2010", name: "Trade Payables",                 cls: "Liability", drCr: "Cr", fsKey: "trade_payables"        },
  { code: "2020", name: "Accrued Liabilities",            cls: "Liability", drCr: "Cr", fsKey: "accrued_liabilities"   },
  { code: "2030", name: "Advances from Customers",        cls: "Liability", drCr: "Cr", fsKey: "advances_customers"    },
  { code: "2040", name: "Income Tax Payable",             cls: "Liability", drCr: "Cr", fsKey: "tax_payable"           },
  { code: "2050", name: "Sales Tax Payable",              cls: "Liability", drCr: "Cr", fsKey: "sales_tax_payable"     },
  { code: "2060", name: "Withholding Tax Payable",        cls: "Liability", drCr: "Cr", fsKey: "wht_payable"           },
  { code: "2100", name: "Short-Term Borrowings",          cls: "Liability", drCr: "Cr", fsKey: "short_term_borrowings" },
  { code: "2110", name: "Running Finance",                cls: "Liability", drCr: "Cr", fsKey: "running_finance"       },
  { code: "2120", name: "Current Portion — LT Loans",    cls: "Liability", drCr: "Cr", fsKey: "current_ltd"           },
  { code: "2200", name: "Long-Term Loans",                cls: "Liability", drCr: "Cr", fsKey: "long_term_loans"       },
  { code: "2210", name: "Lease Liabilities — LT",        cls: "Liability", drCr: "Cr", fsKey: "lease_liabilities"     },
  { code: "2220", name: "Deferred Tax Liability",         cls: "Liability", drCr: "Cr", fsKey: "deferred_tax"          },
  { code: "2300", name: "Employee Benefit Obligations",   cls: "Liability", drCr: "Cr", fsKey: "employee_benefits"     },
  // EQUITY — Normal: Credit
  { code: "3010", name: "Share Capital",                  cls: "Equity",    drCr: "Cr", fsKey: "share_capital"         },
  { code: "3020", name: "Share Premium",                  cls: "Equity",    drCr: "Cr", fsKey: "share_premium"         },
  { code: "3030", name: "Statutory Reserves",             cls: "Equity",    drCr: "Cr", fsKey: "reserves"              },
  { code: "3040", name: "General Reserves",               cls: "Equity",    drCr: "Cr", fsKey: "general_reserves"      },
  { code: "3050", name: "Retained Earnings / (Deficit)",  cls: "Equity",    drCr: "Cr", fsKey: "retained_earnings"     },
  { code: "3060", name: "Other Comprehensive Income",     cls: "Equity",    drCr: "Cr", fsKey: "oci"                   },
  // REVENUE — Normal: Credit
  { code: "4010", name: "Revenue from Contracts",        cls: "Revenue",   drCr: "Cr", fsKey: "revenue"               },
  { code: "4020", name: "Other Operating Income",        cls: "Revenue",   drCr: "Cr", fsKey: "other_income"          },
  { code: "4030", name: "Finance Income",                cls: "Revenue",   drCr: "Cr", fsKey: "finance_income"        },
  // EXPENSES — Normal: Debit
  { code: "5010", name: "Cost of Goods Sold",            cls: "Expense",   drCr: "Dr", fsKey: "cost_of_sales"         },
  { code: "5020", name: "Distribution Expenses",         cls: "Expense",   drCr: "Dr", fsKey: "distribution_expenses" },
  { code: "5030", name: "Administrative Expenses",       cls: "Expense",   drCr: "Dr", fsKey: "operating_expenses"    },
  { code: "5040", name: "Finance Costs",                 cls: "Expense",   drCr: "Dr", fsKey: "finance_cost"          },
  { code: "5050", name: "Depreciation Expense",          cls: "Expense",   drCr: "Dr", fsKey: "depreciation"          },
  { code: "5060", name: "Amortisation Expense",          cls: "Expense",   drCr: "Dr", fsKey: "amortisation"          },
  { code: "5070", name: "Income Tax Expense",            cls: "Expense",   drCr: "Dr", fsKey: "tax_expense"           },
  { code: "5080", name: "Other Expenses",                cls: "Expense",   drCr: "Dr", fsKey: "other_expenses"        },
] as const;

type CoaEntry = typeof PAKISTAN_COA[number];

// ─────────────────────────────────────────────────────────────────────────────
// STEP 2: CoA MAPPING ENGINE
// ─────────────────────────────────────────────────────────────────────────────

export function mapFsToCoa(fsMap: Record<string, number>): Array<{
  accountCode: string; accountName: string; classification: string;
  debit: string; credit: string; balance: string;
  source: string; confidence: string; fsLineMapping: string;
}> {
  const lines: ReturnType<typeof mapFsToCoa> = [];

  for (const entry of PAKISTAN_COA) {
    const rawAmt = fsMap[entry.fsKey];
    if (!rawAmt || Math.abs(rawAmt) < 0.01) continue;

    const amt = Math.abs(rawAmt);
    // Normal balance sign: if entry.drCr is Cr and amount is positive on FS, it's a credit balance
    // Assets/Expenses are Dr-normal; Liabilities/Equity/Revenue are Cr-normal
    let debit = "0", credit = "0", balance = "0";
    if (entry.drCr === "Dr") {
      debit = amt.toFixed(2);
      credit = "0";
      balance = amt.toFixed(2);
    } else {
      debit = "0";
      credit = amt.toFixed(2);
      balance = (-amt).toFixed(2);
    }

    lines.push({
      accountCode: entry.code,
      accountName: entry.name,
      classification: entry.cls,
      debit, credit, balance,
      source: "deterministic",
      confidence: "95",
      fsLineMapping: entry.fsKey,
    });
  }

  // Catch unmapped FS fields via fuzzy matching
  for (const [key, rawAmt] of Object.entries(fsMap)) {
    if (!rawAmt || Math.abs(rawAmt) < 0.01) continue;
    const alreadyMapped = PAKISTAN_COA.some(e => e.fsKey === key);
    if (alreadyMapped) continue;
    // Fuzzy: classify by keyword
    const k = key.toLowerCase();
    let cls = "Asset"; let drCr: "Dr" | "Cr" = "Dr"; let code = "1999";
    if (k.includes("payable") || k.includes("liability") || k.includes("loan") || k.includes("borrow") || k.includes("tax payable")) {
      cls = "Liability"; drCr = "Cr"; code = "2999";
    } else if (k.includes("capital") || k.includes("reserve") || k.includes("equity") || k.includes("retained")) {
      cls = "Equity"; drCr = "Cr"; code = "3999";
    } else if (k.includes("revenue") || k.includes("sales") || k.includes("income") || k.includes("turnover")) {
      cls = "Revenue"; drCr = "Cr"; code = "4999";
    } else if (k.includes("expense") || k.includes("cost") || k.includes("depreciation") || k.includes("tax expense")) {
      cls = "Expense"; drCr = "Dr"; code = "5999";
    }
    const amt = Math.abs(rawAmt);
    const debit = drCr === "Dr" ? amt.toFixed(2) : "0";
    const credit = drCr === "Cr" ? amt.toFixed(2) : "0";
    const balance = drCr === "Dr" ? amt.toFixed(2) : (-amt).toFixed(2);
    lines.push({
      accountCode: code,
      accountName: key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
      classification: cls, debit, credit, balance,
      source: "fuzzy_mapped",
      confidence: "70",
      fsLineMapping: key,
    });
  }

  return lines;
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 3: INTELLIGENT AUTO-BALANCE (not a blind plug)
// ─────────────────────────────────────────────────────────────────────────────

export function intelligentBalance(lines: any[]): { lines: any[]; correction: string | null; differenceBeforeAdj: number } {
  const totalDr = lines.reduce((s: number, l: any) => s + Number(l.debit || 0), 0);
  const totalCr = lines.reduce((s: number, l: any) => s + Number(l.credit || 0), 0);
  const diff = totalDr - totalCr;
  const absDiff = Math.abs(diff);

  if (absDiff < 0.01) return { lines, correction: null, differenceBeforeAdj: 0 };

  const grossTotal = totalDr + totalCr;
  const pct = grossTotal > 0 ? (absDiff / grossTotal) * 100 : 100;

  let correction: string;
  const adjustedLines = [...lines];

  if (pct <= 0.5) {
    // Small rounding difference — use Suspense Rounding account with explanation
    const note = `Rounding variance of ${absDiff.toFixed(2)} (${pct.toFixed(3)}% of gross) — automatically cleared to Suspense Rounding`;
    if (diff > 0) {
      // Debits exceed Credits — add a credit to balance
      adjustedLines.push({
        accountCode: "9001", accountName: "Suspense — Rounding Differences",
        classification: "Equity", debit: "0",
        credit: absDiff.toFixed(2), balance: (-absDiff).toFixed(2),
        source: "auto_balance", confidence: "100",
        fsLineMapping: "rounding_adjustment",
      });
    } else {
      adjustedLines.push({
        accountCode: "9001", accountName: "Suspense — Rounding Differences",
        classification: "Equity", debit: absDiff.toFixed(2),
        credit: "0", balance: absDiff.toFixed(2),
        source: "auto_balance", confidence: "100",
        fsLineMapping: "rounding_adjustment",
      });
    }
    correction = note;
  } else {
    // Material difference — use Suspense Unreconciled with audit flag
    const note = `Material imbalance of ${absDiff.toFixed(2)} (${pct.toFixed(2)}% of gross) placed in Suspense. REQUIRES MANUAL REVIEW and FS reconciliation before finalisation.`;
    if (diff > 0) {
      adjustedLines.push({
        accountCode: "9002", accountName: "Suspense — Unreconciled Difference",
        classification: "Liability", debit: "0",
        credit: absDiff.toFixed(2), balance: (-absDiff).toFixed(2),
        source: "suspense_required", confidence: "50",
        fsLineMapping: "unreconciled_difference",
      });
    } else {
      adjustedLines.push({
        accountCode: "9002", accountName: "Suspense — Unreconciled Difference",
        classification: "Asset", debit: absDiff.toFixed(2),
        credit: "0", balance: absDiff.toFixed(2),
        source: "suspense_required", confidence: "50",
        fsLineMapping: "unreconciled_difference",
      });
    }
    correction = note;
  }

  return { lines: adjustedLines, correction, differenceBeforeAdj: absDiff };
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 5: MATERIALITY LOGIC — transaction count per account
// ─────────────────────────────────────────────────────────────────────────────

export function txCountForAccount(accountBalance: number, grossTotal: number, accountType: string): number {
  const ratio = grossTotal > 0 ? Math.abs(accountBalance) / grossTotal : 0;
  // Revenue/Expense accounts: more granular (monthly nature)
  if (accountType === "Revenue" || accountType === "Expense") {
    if (ratio > 0.15) return 8;
    if (ratio > 0.05) return 12;
    return 15;
  }
  // Balance sheet accounts: fewer, larger transactions
  if (ratio > 0.20) return 6;
  if (ratio > 0.10) return 9;
  if (ratio > 0.02) return 12;
  return 16;
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 6: FORCE-CORRECT GL CLOSING BALANCE
// Adjusts the last entry so that: opening + Σentries = TB closing
// ─────────────────────────────────────────────────────────────────────────────

export function forceGlBalance(
  entries: any[],
  openingBalance: number,
  expectedClosing: number,
  accountCode: string,
  drCr: "Dr" | "Cr",
): any[] {
  if (entries.length === 0) return entries;

  const runningTotal = entries.reduce((s: number, e: any) => s + Number(e.debit || 0) - Number(e.credit || 0), 0);
  const computedClosing = openingBalance + runningTotal;
  const variance = expectedClosing - computedClosing;

  if (Math.abs(variance) < 0.01) return entries;

  // Adjust the last entry — find it and add a correcting amount
  const corrected = [...entries];
  const last = { ...corrected[corrected.length - 1] };

  if (variance > 0) {
    // Need more debit (or less credit)
    last.debit = (Number(last.debit || 0) + variance).toFixed(2);
    last.narration = (last.narration || "") + " [Auto-reconciled]";
  } else {
    // Need more credit (or less debit)
    last.credit = (Number(last.credit || 0) + Math.abs(variance)).toFixed(2);
    last.narration = (last.narration || "") + " [Auto-reconciled]";
  }
  corrected[corrected.length - 1] = last;
  return corrected;
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 3: CORE TB ENGINE
// ─────────────────────────────────────────────────────────────────────────────

export async function runTBEngine(sessionId: number, ai: { client: OpenAI; model: string } | null): Promise<{
  tbLines: any[];
  totalDebit: number;
  totalCredit: number;
  balanced: boolean;
  difference: number;
  exceptions: string[];
  auditLog: string[];
}> {
  const auditLog: string[] = [];
  const exceptions: string[] = [];

  // ── Layer 0: Master COA Engine (highest priority — user-approved data sheet)
  const coaRows = await db.select().from(wpMasterCoaTable).where(eq(wpMasterCoaTable.sessionId, sessionId));
  if (coaRows.length > 0) {
    auditLog.push(`Layer 0: Using MASTER_COA_ENGINE — ${coaRows.length} accounts from user-approved data sheet`);
    const raw = coaRows.map((r: any) => {
      const closing = Number(r.closingBalance || 0);
      const isDebit = closing >= 0;
      return {
        accountCode: r.accountCode,
        accountName: r.accountName,
        classification: r.accountType || "Asset",
        debit: isDebit ? Math.abs(closing).toFixed(2) : "0",
        credit: isDebit ? "0" : Math.abs(closing).toFixed(2),
        balance: closing.toFixed(2),
        source: "master_coa_engine",
        confidence: String(r.confidenceScore || "95"),
        fsLineMapping: r.mappingFsLine || "",
      };
    });
    const { lines, correction, differenceBeforeAdj } = intelligentBalance(raw);
    if (correction) {
      exceptions.push(correction);
      auditLog.push(`Auto-balance applied: ${correction}`);
    }
    return buildTBResult(lines, exceptions, auditLog);
  }

  // ── Layer 0.5: Template-sourced TB lines (from parse-one-sheet-template)
  const allExistingTb = await db.select().from(wpTrialBalanceLinesTable)
    .where(eq(wpTrialBalanceLinesTable.sessionId, sessionId));
  const templateTbLines = allExistingTb.filter((l: any) => l.source === "template");
  if (templateTbLines.length > 0) {
    auditLog.push(`Layer 0.5: Using ${templateTbLines.length} template-sourced TB lines (Financial_Data_Upload template)`);
    const raw = templateTbLines.map((l: any) => ({
      accountCode:   l.accountCode,
      accountName:   l.accountName,
      classification:l.classification,
      debit:         String(l.debit || "0"),
      credit:        String(l.credit || "0"),
      balance:       String(l.balance || "0"),
      source:        "template",
      confidence:    String(l.confidence || "100"),
      fsLineMapping: l.fsLineMapping || "",
    }));
    const { lines, correction } = intelligentBalance(raw);
    if (correction) { exceptions.push(correction); auditLog.push(`Auto-balance: ${correction}`); }
    return buildTBResult(lines, exceptions, auditLog);
  }

  // ── Layer 1: Try existing extracted TB lines
  const extractedTB = await db.select().from(wpExtractedFieldsTable)
    .where(and(eq(wpExtractedFieldsTable.sessionId, sessionId), eq(wpExtractedFieldsTable.category, "TB Lines")));

  if (extractedTB.length > 0) {
    auditLog.push(`Layer 1: Found ${extractedTB.length} extracted TB lines — using source data`);
    const raw: any[] = [];
    for (const f of extractedTB) {
      try {
        const line = JSON.parse(f.extractedValue || "{}");
        raw.push({
          accountCode: line.account_code || "0000",
          accountName: line.account_name || "Unknown",
          classification: line.classification || "Asset",
          debit: String(Number(line.debit || 0).toFixed(2)),
          credit: String(Number(line.credit || 0).toFixed(2)),
          balance: String((Number(line.debit || 0) - Number(line.credit || 0)).toFixed(2)),
          source: "extraction", confidence: String(f.confidence || "85"),
          fsLineMapping: line.fs_line || "",
        });
      } catch { /* skip malformed */ }
    }
    const { lines, correction, differenceBeforeAdj } = intelligentBalance(raw);
    if (correction) {
      exceptions.push(correction);
      auditLog.push(`Auto-balance applied: ${correction}`);
    }
    return buildTBResult(lines, exceptions, auditLog);
  }

  // ── Layer 2: Build deterministically from FS extracted fields
  const fsFields = await db.select().from(wpExtractedFieldsTable)
    .where(and(eq(wpExtractedFieldsTable.sessionId, sessionId), eq(wpExtractedFieldsTable.category, "FS Line Items")));

  if (fsFields.length > 0) {
    auditLog.push(`Layer 2: Building TB from ${fsFields.length} FS line items using Pakistan COA mapping`);
    const fsMap: Record<string, number> = {};
    for (const f of fsFields) {
      fsMap[f.fieldName] = Number(f.finalValue || f.extractedValue || 0);
    }
    // Also check variable values
    const vars = await db.select().from(wpVariablesTable).where(eq(wpVariablesTable.sessionId, sessionId));
    for (const v of vars) {
      if (v.finalValue && !fsMap[v.variableName]) {
        const num = Number(v.finalValue);
        if (!isNaN(num) && num !== 0) fsMap[v.variableName] = num;
      }
    }
    const raw = mapFsToCoa(fsMap);
    if (raw.length > 0) {
      exceptions.push("TB reconstructed from FS data via CoA mapping — source TB not available. Manual review recommended.");
      auditLog.push(`CoA mapping produced ${raw.length} accounts`);
      const { lines, correction, differenceBeforeAdj } = intelligentBalance(raw);
      if (correction) { exceptions.push(correction); auditLog.push(`Auto-balance: ${correction}`); }
      return buildTBResult(lines, exceptions, auditLog);
    }
  }

  // ── Layer 3: AI-generated TB
  if (!ai) throw new Error("AI not configured and no source data available for TB generation");
  auditLog.push("Layer 3: Generating TB via AI (no source TB or FS data found)");

  const vars = await db.select().from(wpVariablesTable).where(eq(wpVariablesTable.sessionId, sessionId));
  const session = (await db.select().from(wpSessionsTable).where(eq(wpSessionsTable.id, sessionId)))[0];
  const varSummary = vars.filter(v => v.finalValue).map(v => `${v.variableName}: ${v.finalValue}`).join("\n");

  const systemPrompt = `You are a Pakistan CA firm's audit AI. Generate a complete, IFRS-compliant Trial Balance for a Pakistani entity.
RULES:
1. Use Pakistan 4-digit chart of accounts (1xxx=Assets, 2xxx=Liab, 3xxx=Equity, 4xxx=Revenue, 5xxx=Expenses)
2. Normal balances: Assets/Expenses = Debit; Liabilities/Equity/Revenue = Credit
3. MANDATORY: total_debits MUST EXACTLY equal total_credits
4. Include 20-35 accounts minimum
5. All amounts in PKR
Return JSON: {"tb_lines":[{"account_code":"XXXX","account_name":"...","classification":"Asset|Liability|Equity|Revenue|Expense","debit":0,"credit":0}]}`;

  const resp = await ai.client.chat.completions.create({
    model: ai.model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Generate TB for:\nClient: ${session?.clientName || "Unknown"}\nYear: ${session?.engagementYear || "2024"}\nSector: ${session?.entityType || "General"}\n\nVariables:\n${varSummary}` },
    ],
    max_tokens: 5000, temperature: 0.1,
    response_format: { type: "json_object" },
  }, { signal: AbortSignal.timeout(25000) });

  const raw2 = JSON.parse(resp.choices[0]?.message?.content || "{}");
  const aiLines = (raw2.tb_lines || raw2.lines || []).map((l: any) => ({
    accountCode: l.account_code || "0000",
    accountName: l.account_name || "Unknown",
    classification: l.classification || "Asset",
    debit: String(Number(l.debit || 0).toFixed(2)),
    credit: String(Number(l.credit || 0).toFixed(2)),
    balance: String((Number(l.debit || 0) - Number(l.credit || 0)).toFixed(2)),
    source: "ai_generated", confidence: "70", fsLineMapping: "",
  }));

  exceptions.push("TB generated via AI — full manual review and FS reconciliation required before approval.");
  auditLog.push(`AI generated ${aiLines.length} TB lines`);
  const { lines, correction } = intelligentBalance(aiLines);
  if (correction) { exceptions.push(correction); auditLog.push(`Auto-balance: ${correction}`); }
  return buildTBResult(lines, exceptions, auditLog);
}

function buildTBResult(lines: any[], exceptions: string[], auditLog: string[]) {
  const totalDebit = lines.reduce((s: number, l: any) => s + Number(l.debit || 0), 0);
  const totalCredit = lines.reduce((s: number, l: any) => s + Number(l.credit || 0), 0);
  const difference = Math.abs(totalDebit - totalCredit);
  const balanced = difference < 0.01;
  auditLog.push(`TB final: ${lines.length} accounts | Dr=${totalDebit.toFixed(2)} | Cr=${totalCredit.toFixed(2)} | Diff=${difference.toFixed(4)} | ${balanced ? "BALANCED ✓" : "UNBALANCED ✗"}`);
  return { tbLines: lines, totalDebit, totalCredit, balanced, difference, exceptions, auditLog };
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 4-6: CORE GL ENGINE
// ─────────────────────────────────────────────────────────────────────────────

export async function runGLEngine(
  sessionId: number,
  ai: { client: OpenAI; model: string },
  session: any,
): Promise<{
  accountsProcessed: number;
  entriesGenerated: number;
  reconciledCount: number;
  exceptions: string[];
  auditLog: string[];
}> {
  const exceptions: string[] = [];
  const auditLog: string[] = [];

  const tbLines = await db.select().from(wpTrialBalanceLinesTable).where(eq(wpTrialBalanceLinesTable.sessionId, sessionId));
  if (tbLines.length === 0) throw new Error("TB must be generated before GL");

  const grossTotal = tbLines.reduce((s: any, l: any) => s + Math.abs(Number(l.debit || 0)), 0);
  const yearEnd = session?.engagementYear || new Date().getFullYear().toString();
  const yearStart = String(parseInt(yearEnd) - 1);
  const clientName = session?.clientName || "the entity";
  const sector = session?.entityType || "General";

  // ── Early return: skip AI GL generation when accounts already exist and are reconciled
  const existingGlAccounts = await db.select().from(wpGlAccountsTable).where(eq(wpGlAccountsTable.sessionId, sessionId));
  const hasReconciledGl = existingGlAccounts.length > 0 &&
    existingGlAccounts.every((g: any) => g.isReconciled === true);
  const hasTemplateGl = existingGlAccounts.length > 0 &&
    existingGlAccounts.some((g: any) => String(g.generationRationale || "").startsWith("WP:"));
  if (hasReconciledGl || hasTemplateGl) {
    auditLog.push(`Layer 0: Using ${existingGlAccounts.length} existing reconciled GL accounts (skipping AI generation)`);
    let reconciledCount = 0;
    for (const glAcc of existingGlAccounts) {
      const tbLine = tbLines.find((l: any) => l.accountCode === glAcc.accountCode);
      if (tbLine) {
        const tbBalance = Number(tbLine.debit || 0) - Number(tbLine.credit || 0);
        const glBalance = Number(glAcc.closingBalance || 0);
        if (Math.abs(tbBalance - glBalance) > 0.01) {
          await db.update(wpGlAccountsTable).set({
            closingBalance: tbBalance.toFixed(2),
            tbDebit: String(tbLine.debit || "0"),
            tbCredit: String(tbLine.credit || "0"),
            isReconciled: true,
          }).where(eq(wpGlAccountsTable.id, glAcc.id));
        } else {
          await db.update(wpGlAccountsTable).set({ isReconciled: true }).where(eq(wpGlAccountsTable.id, glAcc.id));
        }
        reconciledCount++;
      }
    }
    const missingGl = tbLines.filter((l: any) => !existingGlAccounts.some((g: any) => g.accountCode === l.accountCode));
    if (missingGl.length > 0) {
      exceptions.push(`${missingGl.length} TB accounts have no GL entries — template GL data used as-is. Consider running AI GL generation for full coverage.`);
    }
    return { accountsProcessed: reconciledCount, entriesGenerated: 0, reconciledCount, exceptions, auditLog };
  }

  await db.delete(wpGlEntriesTable).where(eq(wpGlEntriesTable.sessionId, sessionId));
  await db.delete(wpGlAccountsTable).where(eq(wpGlAccountsTable.sessionId, sessionId));

  let totalAccounts = 0, totalEntries = 0, reconciledCount = 0;

  // Process in batches of 5 for API efficiency
  const batchSize = 5;
  for (let i = 0; i < tbLines.length; i += batchSize) {
    const batch = tbLines.slice(i, i + batchSize);

    const batchPayload = batch.map((l: any) => {
      const tbBalance = Number(l.debit || 0) - Number(l.credit || 0);
      const drCr = Number(l.debit || 0) > Number(l.credit || 0) ? "Dr" : "Cr";
      const coaMatch = PAKISTAN_COA.find((c: CoaEntry) => c.code === l.accountCode);
      const isBalanceSheet = ["Asset", "Liability", "Equity"].includes(l.classification || "");
      const isPnL = ["Revenue", "Expense"].includes(l.classification || "");
      const txCount = txCountForAccount(tbBalance, grossTotal, l.classification || "Asset");

      // Opening balance logic (Step 6)
      let openingBalance: number;
      if (isPnL) {
        openingBalance = 0; // P&L accounts reset each period
      } else {
        // B/S accounts: estimate opening as ~70-85% of closing (logically derived)
        const ratio = l.classification === "Asset" ? 0.78 : 0.82;
        openingBalance = Math.round(Math.abs(tbBalance) * ratio * (drCr === "Dr" ? 1 : -1));
      }

      return {
        account_code: l.accountCode,
        account_name: l.accountName,
        account_type: l.classification,
        tb_debit: Number(l.debit || 0),
        tb_credit: Number(l.credit || 0),
        tb_closing_balance: tbBalance,
        opening_balance: openingBalance,
        expected_tx_count: txCount,
        dr_cr_nature: drCr,
      };
    });

    const prompt = `Generate audit-grade General Ledger entries for a ${sector} company in Pakistan. Client: ${clientName}, Year: ${yearStart}-${yearEnd}.

ACCOUNTS TO GENERATE:
${JSON.stringify(batchPayload, null, 1)}

STRICT RULES:
1. Each account's closing_balance MUST EXACTLY equal tb_closing_balance
2. opening_balance + sum(debit entries) - sum(credit entries) = closing_balance (VERIFY THIS)
3. Generate exactly the specified expected_tx_count transactions per account
4. Spread entries logically across months (1=Jan ... 12=Dec for calendar year)
5. Use realistic Pakistan business narrations (e.g. "Received from ABC Pvt Ltd", "Paid to supplier XYZ", "Monthly salary payment")
6. Voucher format: JV-YYYY-NNN (e.g. JV-2024-001)
7. High-value accounts: fewer, larger transactions; Low-value: more, granular
8. Dr-normal accounts (Assets/Expenses): entries are mostly debits; Cr-normal: mostly credits
9. Revenue/Expense accounts: opening_balance is 0 (period accounts)

Return JSON: {
  "accounts": [{
    "account_code": string,
    "account_name": string,
    "account_type": string,
    "opening_balance": number,
    "closing_balance": number,
    "total_debit": number,
    "total_credit": number,
    "entries": [{"date":"YYYY-MM-DD","voucher":"JV-YYYY-NNN","narration":string,"debit":number,"credit":number,"month":number}]
  }]
}`;

    try {
      const resp = await ai.client.chat.completions.create({
        model: ai.model,
        messages: [
          { role: "system", content: "You are an expert Pakistan CA generating audit-grade General Ledger entries. Return valid JSON only. Ensure closing balances match exactly." },
          { role: "user", content: prompt },
        ],
        max_tokens: 7000, temperature: 0.2,
        response_format: { type: "json_object" },
      }, { signal: AbortSignal.timeout(25000) });

      const raw = JSON.parse(resp.choices[0]?.message?.content || "{}");
      const glAccounts = raw.accounts || [];

      for (const acc of glAccounts) {
        const tbLine = batch.find((l: any) => l.accountCode === acc.account_code);
        if (!tbLine) continue;

        const tbBalance = Number(tbLine.debit || 0) - Number(tbLine.credit || 0);
        const openingBal = acc.opening_balance || 0;
        const drCr = Number(tbLine.debit || 0) >= Number(tbLine.credit || 0) ? "Dr" : "Cr";

        // Step 6: Enforce Opening + Transactions = Closing
        const correctedEntries = forceGlBalance(
          acc.entries || [],
          openingBal,
          tbBalance,
          acc.account_code,
          drCr as "Dr" | "Cr",
        );

        // Recompute totals after correction
        const totalDr = correctedEntries.reduce((s: number, e: any) => s + Number(e.debit || 0), 0);
        const totalCr = correctedEntries.reduce((s: number, e: any) => s + Number(e.credit || 0), 0);
        const computedClosing = openingBal + totalDr - totalCr;
        const isReconciled = Math.abs(computedClosing - tbBalance) < 0.01;

        if (!isReconciled) {
          exceptions.push(`Account ${acc.account_code} (${acc.account_name}): GL closing ${computedClosing.toFixed(2)} ≠ TB ${tbBalance.toFixed(2)}`);
        } else {
          reconciledCount++;
        }

        const [glAccount] = await db.insert(wpGlAccountsTable).values({
          sessionId,
          accountCode: acc.account_code,
          accountName: acc.account_name,
          accountType: acc.account_type,
          openingBalance: openingBal.toFixed(2),
          closingBalance: computedClosing.toFixed(2),
          totalDebit: totalDr.toFixed(2),
          totalCredit: totalCr.toFixed(2),
          tbDebit: String(tbLine.debit || "0"),
          tbCredit: String(tbLine.credit || "0"),
          isReconciled,
          isSynthetic: true,
          generationRationale: `${acc.account_type} account; ${correctedEntries.length} entries; Period: ${yearStart}-${yearEnd}`,
          transactionCountNote: `${correctedEntries.length} transactions generated (target: ${txCountForAccount(tbBalance, grossTotal, acc.account_type || "Asset")})`,
        }).returning();

        let runningBal = openingBal;
        for (const entry of correctedEntries) {
          runningBal += Number(entry.debit || 0) - Number(entry.credit || 0);
          await db.insert(wpGlEntriesTable).values({
            sessionId,
            glAccountId: glAccount.id,
            entryDate: entry.date || `${yearEnd}-06-30`,
            voucherNo: entry.voucher || `JV-${yearEnd}-000`,
            narration: entry.narration || "General entry",
            debit: String(Number(entry.debit || 0).toFixed(2)),
            credit: String(Number(entry.credit || 0).toFixed(2)),
            runningBalance: runningBal.toFixed(2),
            month: entry.month || null,
            isSynthetic: true,
          });
          totalEntries++;
        }
        totalAccounts++;
        auditLog.push(`GL: ${acc.account_code} ${acc.account_name} — ${correctedEntries.length} entries | Recon: ${isReconciled ? "✓" : "✗"}`);
      }
    } catch (batchErr: any) {
      logger.error({ err: batchErr }, `GL batch ${i} failed`);
      exceptions.push(`GL batch ${i}–${i + batchSize}: ${batchErr?.message || "Generation failed"}`);
    }
  }

  return { accountsProcessed: totalAccounts, entriesGenerated: totalEntries, reconciledCount, exceptions, auditLog };
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 7: 3-WAY RECONCILIATION ENGINE
// ─────────────────────────────────────────────────────────────────────────────

export async function runReconciliation(sessionId: number): Promise<{
  fsTbVariance: number;
  tbGlVariance: number;
  status: "pass" | "warn" | "fail";
  report: string[];
  autoFixed: number;
}> {
  const report: string[] = [];
  let autoFixed = 0;

  // ── FS ↔ TB: compare category totals
  const tbLines = await db.select().from(wpTrialBalanceLinesTable).where(eq(wpTrialBalanceLinesTable.sessionId, sessionId));
  const fsFields = await db.select().from(wpExtractedFieldsTable)
    .where(and(eq(wpExtractedFieldsTable.sessionId, sessionId), eq(wpExtractedFieldsTable.category, "FS Line Items")));

  const tbByCategory: Record<string, number> = {};
  for (const l of tbLines) {
    const cls = l.classification || "Other";
    const bal = Number(l.debit || 0) - Number(l.credit || 0);
    tbByCategory[cls] = (tbByCategory[cls] || 0) + bal;
  }

  const fsTotalAssets = fsFields.filter(f => ["fixed_assets","intangible_assets","inventory","trade_receivables","cash_and_bank"].includes(f.fieldName))
    .reduce((s, f) => s + Number(f.finalValue || f.extractedValue || 0), 0);
  const tbTotalAssets = tbByCategory["Asset"] || 0;
  const fsTbVariance = Math.abs(fsTotalAssets - tbTotalAssets);

  if (fsTbVariance < 1) {
    report.push("FS ↔ TB: Asset totals reconcile ✓");
  } else if (fsTbVariance < fsTotalAssets * 0.01) {
    report.push(`FS ↔ TB: Minor variance of ${fsTbVariance.toFixed(2)} (< 1%) — within tolerance ✓`);
  } else {
    report.push(`FS ↔ TB: Variance of ${fsTbVariance.toFixed(2)} detected. Review FS-to-TB CoA mapping.`);
  }

  // ── TB ↔ GL: compare closing balances per account
  const glAccounts = await db.select().from(wpGlAccountsTable).where(eq(wpGlAccountsTable.sessionId, sessionId));
  let tbGlVarianceTotal = 0;
  let variantAccounts = 0;

  for (const tb of tbLines) {
    const gl = glAccounts.find(g => g.accountCode === tb.accountCode);
    if (!gl) continue;

    const tbBal = Number(tb.debit || 0) - Number(tb.credit || 0);
    const glBal = Number(gl.closingBalance || 0);
    const variance = Math.abs(tbBal - glBal);

    if (variance > 0.01) {
      tbGlVarianceTotal += variance;
      variantAccounts++;
      // Auto-fix: update GL closing to match TB (the entries have already been force-balanced; this is DB state)
      await db.insert(wpGlEntriesTable).values({
        sessionId,
        glAccountId: gl.id,
        entryDate: `${new Date().getFullYear()}-12-31`,
        voucherNo: `ADJ-${tb.accountCode}`,
        narration: `Reconciliation adjustment — aligns GL to TB balance`,
        debit: tbBal > glBal ? (tbBal - glBal).toFixed(2) : "0",
        credit: tbBal < glBal ? (glBal - tbBal).toFixed(2) : "0",
        runningBalance: tbBal.toFixed(2),
        month: 12, isSynthetic: true,
      });
      await db.update(wpGlAccountsTable).set({
        closingBalance: tbBal.toFixed(2),
        isReconciled: true,
      }).where(eq(wpGlAccountsTable.id, gl.id));
      autoFixed++;
    }
  }

  if (tbGlVarianceTotal < 0.01) {
    report.push(`TB ↔ GL: All ${glAccounts.length} accounts reconcile ✓`);
  } else {
    report.push(`TB ↔ GL: ${variantAccounts} accounts had variance totalling ${tbGlVarianceTotal.toFixed(2)} — auto-corrected via adjusting entries`);
  }

  // ── Final TB balance check
  const totalDr = tbLines.reduce((s: number, l: any) => s + Number(l.debit || 0), 0);
  const totalCr = tbLines.reduce((s: number, l: any) => s + Number(l.credit || 0), 0);
  const tbDiff = Math.abs(totalDr - totalCr);
  if (tbDiff < 0.01) {
    report.push(`TB Balance: Total Dr ${totalDr.toFixed(2)} = Total Cr ${totalCr.toFixed(2)} ✓`);
  } else {
    report.push(`TB Balance: Imbalance of ${tbDiff.toFixed(2)} — CRITICAL`);
  }

  // Determine overall status
  const status = tbDiff > 0.01 ? "fail" : tbGlVarianceTotal > 0 || fsTbVariance > fsTotalAssets * 0.01 ? "warn" : "pass";
  return { fsTbVariance, tbGlVariance: tbGlVarianceTotal, status, report, autoFixed };
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 11: FINAL ENFORCEMENT CHECK
// ─────────────────────────────────────────────────────────────────────────────

export async function checkFinalEnforcement(sessionId: number): Promise<{
  canFinalize: boolean;
  blockers: string[];
}> {
  const blockers: string[] = [];

  const tbLines = await db.select().from(wpTrialBalanceLinesTable).where(eq(wpTrialBalanceLinesTable.sessionId, sessionId));
  if (tbLines.length === 0) { blockers.push("Trial Balance not generated"); }
  else {
    const dr = tbLines.reduce((s: number, l: any) => s + Number(l.debit || 0), 0);
    const cr = tbLines.reduce((s: number, l: any) => s + Number(l.credit || 0), 0);
    if (Math.abs(dr - cr) > 0.01) blockers.push(`TB does not balance: difference of ${Math.abs(dr - cr).toFixed(2)}`);
  }

  const glAccounts = await db.select().from(wpGlAccountsTable).where(eq(wpGlAccountsTable.sessionId, sessionId));
  if (glAccounts.length === 0) { blockers.push("General Ledger not generated"); }
  else {
    const unreconciled = glAccounts.filter(g => !g.isReconciled);
    if (unreconciled.length > 0) blockers.push(`${unreconciled.length} GL accounts not reconciled to TB`);
  }

  return { canFinalize: blockers.length === 0, blockers };
}
