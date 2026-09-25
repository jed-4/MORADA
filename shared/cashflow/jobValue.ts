import type { CashflowJobRow, JobPhase } from "./types";

/**
 * What a job is worth before variations, and where that came from. A signed
 * contract always wins; until there is one, the builder's own forecast value,
 * then the client budget (leads) or the project's cost figure.
 */
export function jobBaseValue(
  p: { contractPrice: number | null; clientBudget: number | null; contractCost: number | null },
  frozenIncGstCents: number | null | undefined,
  phase: JobPhase,
  forecastValueCents: number | null | undefined,
): { cents: number; source: CashflowJobRow["valueSource"] } {
  const contract = frozenIncGstCents ?? (p.contractPrice && p.contractPrice > 0 ? p.contractPrice : null);
  if (contract != null) return { cents: contract, source: "contract" };
  if (forecastValueCents != null) return { cents: forecastValueCents, source: "forecast" };
  const fallback = (phase === "lead" ? p.clientBudget : null) ?? p.contractCost;
  if (fallback) return { cents: fallback, source: "budget" };
  return { cents: 0, source: "none" };
}
