// Business expenses suggested from Xero (cashflow PR 6).
//
//   1. Read a year of Xero spend: bills (ACCPAY) and SPEND bank transactions.
//   2. Rules find suppliers paid on a regular pattern (shared/cashflow/
//      expenseDetection) — that decides WHAT is suggested.
//   3. Claude names each one, picks a category, says whether it looks like a
//      business overhead or a job cost, and writes the one-line reason shown
//      on the card. If the AI is unavailable, the rules' own wording is used.
//   4. Upsert: the builder's decision on a supplier sticks across re-scans;
//      only pending suggestions are refreshed or removed.
//
// A scan takes 10–60 s (Xero paging + one AI call), so it runs in the
// background and the page polls the status.

import Anthropic from "@anthropic-ai/sdk";
import { and, eq, ne, notInArray } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { xeroService } from "./xeroService";
import { businessExpenses, expenseSuggestions, projects, type ExpenseSuggestion } from "@shared/schema";
import {
  addDays,
  detectRecurring,
  spendRecordsFromXero,
  toDateKey,
  type DetectedPattern,
  type SkippedSupplier,
} from "@shared/cashflow";
import { formatCents } from "@shared/money";

export const EXPENSE_CATEGORIES = [
  "People",
  "Premises",
  "Vehicles & equipment",
  "Insurance",
  "Software & subscriptions",
  "Admin & professional",
  "Utilities & phones",
  "Finance & loans",
  "Marketing",
  "Other",
] as const;

// ── Scan status (per company, in memory — one server process) ────────────────

export interface ScanStatus {
  state: "idle" | "running" | "done" | "error";
  startedAt?: string;
  finishedAt?: string;
  error?: string;
  /** Found this scan, and why others were left out. */
  found?: number;
  skipped?: { jobCost: number; ato: number; irregular: number; oneOff: number };
  aiUsed?: boolean;
}

const scans = new Map<string, ScanStatus>();

export function getScanStatus(companyId: string): ScanStatus {
  return scans.get(companyId) ?? { state: "idle" };
}

export function startScan(companyId: string): ScanStatus {
  const current = scans.get(companyId);
  if (current?.state === "running") return current;
  const status: ScanStatus = { state: "running", startedAt: new Date().toISOString() };
  scans.set(companyId, status);
  runScan(companyId)
    .then((result) => scans.set(companyId, { ...status, ...result, state: "done", finishedAt: new Date().toISOString() }))
    .catch((err) => {
      console.error("[expense suggestions] scan failed:", err);
      scans.set(companyId, {
        ...status,
        state: "error",
        finishedAt: new Date().toISOString(),
        error: err instanceof ScanError ? err.message : "The scan failed. Try again in a minute.",
      });
    });
  return status;
}

class ScanError extends Error {}

// ── The scan ─────────────────────────────────────────────────────────────────

async function runScan(companyId: string): Promise<Partial<ScanStatus>> {
  const connection = await storage.getXeroConnectionByCompanyId(companyId);
  if (!connection) throw new ScanError("Xero isn't connected.");

  const today = toDateKey(new Date())!;
  const since = new Date(`${addDays(today, -365)}T00:00:00Z`);

  const [bills, bankTransactions, accounts, projectRows, existingExpenses] = await Promise.all([
    xeroService.listAllBills(connection.id, { statuses: ["PAID", "AUTHORISED"], since, maxPages: 20 }),
    xeroService.listAllSpendTransactions(connection.id, { since, maxPages: 20 }),
    xeroService.getAccounts(connection.id),
    db
      .select({ optionId: projects.xeroTrackingOptionId })
      .from(projects)
      .where(eq(projects.companyId, companyId)),
    db
      .select({ contactId: businessExpenses.xeroContactId })
      .from(businessExpenses)
      .where(eq(businessExpenses.companyId, companyId)),
  ]);

  const records = spendRecordsFromXero({
    bills,
    bankTransactions,
    accountNames: new Map(accounts.map((a: any) => [String(a.Code), String(a.Name)])),
    jobTrackingOptionIds: new Set(projectRows.map((p) => p.optionId).filter((x): x is string => !!x)),
  });
  const { patterns: found, skipped } = detectRecurring(records, today);

  // Suppliers already in the register don't need suggesting again.
  const inRegister = new Set(existingExpenses.map((e) => e.contactId).filter(Boolean));
  const patterns = found.filter((p) => !p.contactId || !inRegister.has(p.contactId)).slice(0, 60);

  const notes = await describeWithAi(patterns).catch((err) => {
    console.error("[expense suggestions] AI step failed, using rule wording:", err);
    return null;
  });

  await saveSuggestions(companyId, patterns, notes);

  const count = (r: SkippedSupplier["reason"]) => skipped.filter((s) => s.reason === r).length;
  return {
    found: patterns.length,
    skipped: { jobCost: count("job_cost"), ato: count("ato"), irregular: count("irregular"), oneOff: count("one_off") },
    aiUsed: notes != null,
  };
}

// ── Claude: name, category, business vs job cost, one-line reason ────────────

interface AiNote {
  key: string;
  kind: "business" | "job_cost" | "not_expense";
  name: string;
  category: (typeof EXPENSE_CATEGORIES)[number];
  reason: string;
}

const AI_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          key: { type: "string" },
          kind: { type: "string", enum: ["business", "job_cost", "not_expense"] },
          name: { type: "string" },
          category: { type: "string", enum: [...EXPENSE_CATEGORIES] },
          reason: { type: "string" },
        },
        required: ["key", "kind", "name", "category", "reason"],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
} as const;

const SYSTEM = `You help an Australian residential builder set up a cashflow forecast. You'll get suppliers the business paid on a regular pattern over the last year, found in their Xero accounts.

For each supplier, return:
- kind: "business" if it's an overhead of running the business (rent, office wages, insurance, software, phones, vehicle finance, accountant); "job_cost" if it's most likely materials, hire or trades for building jobs, even though it wasn't coded to a job; "not_expense" if it shouldn't be forecast as an expense (transfers between the business's own accounts, loan drawdowns, refunds).
- name: a short plain name for the expense, as the builder would say it ("Yard rent", "Office wages", "Ranger finance"). Not the supplier's legal name unless that's clearest.
- category: the closest one from the list.
- reason: one sentence the builder reads on the suggestion card, under 25 words, plain Australian English, citing the evidence (how often, typical amount, the account it's coded to). If lapsed is true, say payments seem to have stopped and ask if it was cancelled. For job_cost, say why it looks like a job cost.

Use only the evidence given. Return one item per supplier, with the same key.`;

export async function describeWithAi(patterns: DetectedPattern[]): Promise<Map<string, AiNote> | null> {
  if (patterns.length === 0) return new Map();
  if (!process.env.ANTHROPIC_API_KEY) return null;

  const client = new Anthropic({ timeout: 120_000, maxRetries: 2 });
  const input = patterns.map((p) => ({
    key: p.contactKey,
    supplier: p.contactName,
    how_often: p.frequency,
    typical_payment: formatCents(p.amountCents),
    payments_last_year: p.count,
    first_paid: p.firstDate,
    last_paid: p.lastDate,
    lapsed: p.lapsed,
    includes_gst: p.hasGst,
    xero_accounts: p.accounts,
    descriptions: p.samples,
    share_coded_to_jobs: p.jobShare,
  }));

  const response = await client.beta.messages.create({
    model: "claude-opus-5",
    max_tokens: 16000,
    // If the model declines for policy reasons, the API retries on this one.
    betas: ["server-side-fallback-2026-06-01"],
    fallbacks: [{ model: "claude-opus-4-8" }],
    output_config: { effort: "medium", format: { type: "json_schema", schema: AI_SCHEMA } },
    system: SYSTEM,
    messages: [{ role: "user", content: JSON.stringify(input) }],
  });

  if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") {
    throw new Error(`AI stopped: ${response.stop_reason}`);
  }
  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") throw new Error("AI returned no text");
  const parsed = JSON.parse(text.text) as { items: AiNote[] };
  return new Map(parsed.items.map((i) => [i.key, i]));
}

// ── Saving ───────────────────────────────────────────────────────────────────

const FREQ_WORDS: Record<string, string> = {
  weekly: "a week",
  fortnightly: "a fortnight",
  monthly: "a month",
  quarterly: "a quarter",
  yearly: "a year",
};

function ruleReason(p: DetectedPattern): string {
  if (p.lapsed) return `Paid ${p.count} times, about ${formatCents(p.amountCents)} each, but nothing since ${p.lastDate}. Cancelled?`;
  if (p.count === 1) return `Paid once, ${formatCents(p.amountCents)} on ${p.firstDate}. Looks like a yearly renewal.`;
  return `Paid ${p.count} times in the last year, about ${formatCents(p.amountCents)} ${FREQ_WORDS[p.frequency] ?? ""}.`;
}

async function saveSuggestions(companyId: string, patterns: DetectedPattern[], notes: Map<string, AiNote> | null): Promise<void> {
  const existing = await db.select().from(expenseSuggestions).where(eq(expenseSuggestions.companyId, companyId));
  const byKey = new Map(existing.map((e) => [e.contactKey, e]));
  const now = new Date();

  await db.transaction(async (tx) => {
    for (const p of patterns) {
      const note = notes?.get(p.contactKey);
      const values = {
        xeroContactId: p.contactId,
        contactName: p.contactName,
        name: note?.name || p.contactName,
        category: note?.category ?? null,
        aiKind: note?.kind ?? null,
        amountCents: p.amountCents,
        hasGst: p.hasGst,
        frequency: p.frequency,
        nextDate: p.nextDate,
        confidence: p.confidence,
        lapsed: p.lapsed,
        reason: note?.reason || ruleReason(p),
        evidence: { count: p.count, firstDate: p.firstDate, lastDate: p.lastDate, amounts: p.amounts, accounts: p.accounts, jobShare: p.jobShare },
        scannedAt: now,
        updatedAt: now,
      };
      const prior = byKey.get(p.contactKey);
      if (!prior) {
        await tx.insert(expenseSuggestions).values({ ...values, companyId, contactKey: p.contactKey });
      } else if (prior.status === "pending") {
        await tx.update(expenseSuggestions).set(values).where(eq(expenseSuggestions.id, prior.id));
      }
      // A decided supplier (added / job cost / ignored) is left as the builder set it.
    }

    // Pending suggestions this scan didn't find again are stale.
    const keys = patterns.map((p) => p.contactKey);
    await tx
      .delete(expenseSuggestions)
      .where(
        and(
          eq(expenseSuggestions.companyId, companyId),
          eq(expenseSuggestions.status, "pending"),
          ...(keys.length ? [notInArray(expenseSuggestions.contactKey, keys)] : []),
        ),
      );
  });
}

// ── Decisions ────────────────────────────────────────────────────────────────

export async function listSuggestions(companyId: string): Promise<ExpenseSuggestion[]> {
  return db
    .select()
    .from(expenseSuggestions)
    .where(and(eq(expenseSuggestions.companyId, companyId), ne(expenseSuggestions.status, "accepted")))
    .orderBy(expenseSuggestions.status, expenseSuggestions.createdAt);
}

/** Adds the suggestion to the business expenses register (with any edits) and marks it accepted. */
export async function acceptSuggestion(
  companyId: string,
  id: string,
  overrides: Partial<{ name: string; category: string | null; amountCents: number; hasGst: boolean; frequency: string; nextDate: string }>,
) {
  return db.transaction(async (tx) => {
    const [s] = await tx
      .select()
      .from(expenseSuggestions)
      .where(and(eq(expenseSuggestions.id, id), eq(expenseSuggestions.companyId, companyId)))
      .limit(1);
    if (!s) return null;
    const [expense] = await tx
      .insert(businessExpenses)
      .values({
        companyId,
        name: overrides.name ?? s.name,
        category: overrides.category !== undefined ? overrides.category : s.category,
        amountCents: overrides.amountCents ?? s.amountCents,
        hasGst: overrides.hasGst ?? s.hasGst,
        frequency: overrides.frequency ?? s.frequency,
        nextDate: overrides.nextDate ?? s.nextDate,
        source: "suggestion",
        xeroContactId: s.xeroContactId,
        notes: `From Xero: ${s.contactName}`,
      })
      .returning();
    await tx
      .update(expenseSuggestions)
      .set({ status: "accepted", businessExpenseId: expense.id, updatedAt: new Date() })
      .where(eq(expenseSuggestions.id, s.id));
    return expense;
  });
}

export async function decideSuggestion(companyId: string, id: string, status: "job_cost" | "ignored" | "pending") {
  const [row] = await db
    .update(expenseSuggestions)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(expenseSuggestions.id, id), eq(expenseSuggestions.companyId, companyId)))
    .returning();
  return row ?? null;
}
