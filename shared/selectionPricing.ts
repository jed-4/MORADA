/**
 * Cost / charge / markup for selection options and Product Library products.
 *
 * One rule set, used by the forms and the server, so the three figures can't
 * drift apart:
 *
 *   cost    what the builder pays, per unit
 *   charge  what the client pays, per unit
 *   markup  the gap between them, as a percentage of COST (never margin):
 *           $100 cost at 50% is a $150 charge
 *
 * All amounts here are integer cents INC GST. Fill in any two and the third is
 * worked out. Once all three exist, which one gives way depends on what was
 * edited (Jed, 2026-10-14):
 *
 *   edit cost    markup holds, charge moves
 *   edit markup  cost holds, charge moves
 *   edit charge  cost holds, MARKUP moves — the charge is the number that has
 *                to be right, so it is never nudged to preserve a percentage
 *
 * 🚨 Cost and markup must never reach a client, and showing charge AND markup
 * gives cost away. Only the charge is client-facing.
 */
import { exGstFromInc, incGstFromEx } from "./money";

export type PricingField = "cost" | "charge" | "markup";

export interface PricingTriple {
  costCents: number | null;
  chargeCents: number | null;
  markupPercent: number | null;
}

const roundMarkup = (m: number) => Math.round(m * 100) / 100;

const chargeFrom = (cost: number, markup: number) => Math.round(cost * (1 + markup / 100));
const markupFrom = (cost: number, charge: number) => roundMarkup((charge / cost - 1) * 100);
const costFrom = (charge: number, markup: number) => Math.round(charge / (1 + markup / 100));

/**
 * Re-solve the triple after `edited` changed. Pass the new value already in
 * `values`. Clearing a field leaves the other two alone.
 */
export function solvePricing(values: PricingTriple, edited: PricingField): PricingTriple {
  const { costCents: cost, chargeCents: charge, markupPercent: markup } = values;
  const out: PricingTriple = { ...values };
  const has = (n: number | null): n is number => n !== null && Number.isFinite(n);

  if (edited === "cost" && has(cost)) {
    if (has(markup)) out.chargeCents = chargeFrom(cost, markup);
    else if (has(charge) && cost > 0) out.markupPercent = markupFrom(cost, charge);
  } else if (edited === "markup" && has(markup)) {
    if (has(cost)) out.chargeCents = chargeFrom(cost, markup);
    else if (has(charge) && markup > -100) out.costCents = costFrom(charge, markup);
  } else if (edited === "charge" && has(charge)) {
    if (has(cost) && cost > 0) out.markupPercent = markupFrom(cost, charge);
    else if (has(markup) && markup > -100) out.costCents = costFrom(charge, markup);
  }
  return out;
}

/** A stored unit cost as cents INC GST, whichever way it was entered. */
export function costIncGstCents(unitCost: number | null | undefined, gstInclusive: boolean | null | undefined): number | null {
  if (unitCost == null) return null;
  return gstInclusive ? unitCost : incGstFromEx(unitCost);
}

interface PricedOption {
  unitCost?: number | null;
  unitCharge?: number | null;
  gstInclusive?: boolean | null;
  markupPercent?: number | null;
  quantity?: number | null;
}

/**
 * What the client pays for the whole line, cents INC GST.
 *
 * A stored `unitCharge` is the answer. Options priced before the charge was
 * stored fall back to cost × qty × markup, computed exactly as it always was
 * so no existing figure moves. NEVER read `totalCost` for this — its GST basis
 * is unreliable. Null when the option has no price at all.
 */
export function optionClientPriceCents(option: PricedOption | null | undefined): number | null {
  if (!option) return null;
  const qty = Number(option.quantity) || 1;
  if (option.unitCharge != null) return Math.round(option.unitCharge * qty);
  const rawUnit = option.unitCost;
  if (rawUnit == null) return null;
  const markup = Number(option.markupPercent) || 0;
  const unitEx = option.gstInclusive ? exGstFromInc(rawUnit) : rawUnit;
  const totalEx = Math.round(unitEx * qty * (1 + markup / 100));
  return incGstFromEx(totalEx);
}

/** The per-unit charge, cents INC GST: stored, or derived from cost and markup. */
export function optionUnitChargeCents(option: PricedOption | null | undefined): number | null {
  if (!option) return null;
  if (option.unitCharge != null) return option.unitCharge;
  return optionClientPriceCents({ ...option, quantity: 1 });
}
