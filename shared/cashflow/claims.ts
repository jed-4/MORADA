// Claim stages: a job's claim schedule, resolved against what's been invoiced.
// Pure — the server loads the rows, this decides each stage's value, date and
// how much of it is still to claim.

import { toDateKey, type DateKey } from "./dates";

export interface ResolvedClaimStage {
  id: string;
  name: string;
  percent: number | null;
  amountCents: number | null;
  scheduleItemId: string | null;
  scheduleItemName: string | null;
  plannedDate: DateKey | null;
  /** When it's expected to be claimed: the item's finish, else the planned date. */
  date: DateKey | null;
  dateSource: "schedule" | "planned" | null;
  /** Its full value in cents (a % is of the original contract). */
  valueCents: number;
  /** What's still to claim on it after the invoices so far. */
  unclaimedCents: number;
  state: "claimed" | "part" | "to_claim";
}

export type StageRow = {
  id: string;
  name: string;
  percent: number | null;
  amountCents: number | null;
  scheduleItemId: string | null;
  plannedDate: string | null;
  itemName: string | null;
  itemEnd: Date | null;
  itemActualEnd: Date | null;
};

/** Sum of claim % across a job's issued invoices (client_invoices.contract_claim_rows). */
export function claimedPercentOf(rows: unknown): number {
  if (!Array.isArray(rows)) return 0;
  return rows.reduce((s, r: any) => s + (Number(r?.claimPercent) || 0), 0);
}

/**
 * Resolves each stage's value and date, then uses them up IN ORDER against
 * what's been claimed: the claim % on issued invoices, or — when a job has
 * been invoiced without claim rows — the invoiced total.
 */
const CLAIMED_TOLERANCE_CENTS = 100;

export function resolveClaimStages(
  rows: StageRow[],
  originalContractCents: number,
  claimedPercent: number,
  invoicedCents: number,
): ResolvedClaimStage[] {
  let consumed =
    claimedPercent > 0
      ? Math.round((claimedPercent / 100) * originalContractCents)
      : Math.min(invoicedCents, originalContractCents);
  return rows.map((r) => {
    const value = r.amountCents ?? Math.round(((r.percent ?? 0) / 100) * originalContractCents);
    let used = Math.min(value, Math.max(0, consumed));
    consumed -= used;
    // Percentages rarely divide into whole cents: a stage left with under a
    // dollar owing is claimed, not a 1-cent claim still to come.
    if (value - used > 0 && value - used < CLAIMED_TOLERANCE_CENTS && used > 0) used = value;
    const itemDate = toDateKey(r.itemActualEnd ?? r.itemEnd);
    const date = r.scheduleItemId && itemDate ? itemDate : r.plannedDate;
    return {
      id: r.id,
      name: r.name,
      percent: r.percent,
      amountCents: r.amountCents,
      scheduleItemId: r.scheduleItemId,
      scheduleItemName: r.itemName,
      plannedDate: r.plannedDate,
      date,
      dateSource: r.scheduleItemId && itemDate ? "schedule" : r.plannedDate ? "planned" : null,
      valueCents: value,
      unclaimedCents: value - used,
      state: used >= value && value > 0 ? "claimed" : used > 0 ? "part" : "to_claim",
    };
  });
}


export interface ClaimScheduleItem {
  id: string;
  name: string;
  type: string;
  category: string;
  endDate: DateKey | null;
}

const STOP_WORDS = new Set(["the", "and", "claim", "stage", "payment", "progress", "for", "of", "to", "complete", "completion"]);
const words = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 3 && !STOP_WORDS.has(w)),
  );

/** The schedule item whose name shares the most words with the stage's; milestones win ties. */
export function suggestScheduleItem(stageName: string, items: ClaimScheduleItem[]): string | null {
  const want = words(stageName);
  if (want.size === 0) return null;
  let best: { id: string; score: number } | null = null;
  for (const it of items) {
    let score = 0;
    for (const w of Array.from(words(it.name))) if (want.has(w)) score += 1;
    if (score === 0) continue;
    if (it.type === "milestone") score += 0.5;
    if (!best || score > best.score) best = { id: it.id, score };
  }
  return best?.id ?? null;
}
