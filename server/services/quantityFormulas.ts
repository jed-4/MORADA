import { db } from "../db";
import * as schema from "@shared/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  evaluateQuantityFormula,
  extractTakeoffRefs,
  indexTakeoffByName,
  isWaitingFormula,
  resolveNameRefs,
} from "@shared/quantityFormula";
import { resolveEstimateStoredPrice } from "@shared/pricing";
import { refreshAssemblyInputs, rescaleAssemblyComponents } from "../assemblies";
import { inputFormulas, resolveInputFormulas, type AssemblyInputValue } from "@shared/assemblies";

/**
 * Every take-off formula a line follows: its quantity's, and — on an assembly
 * line — each named input's (phase 3). The ref index holds them all, so
 * re-measuring finds an assembly whose Edge follows the measurement.
 */
export function lineTakeoffFormulas(item: { quantityFormula?: string | null; assemblyInputs?: unknown }): string[] {
  return [
    ...(item.quantityFormula ? [item.quantityFormula] : []),
    ...inputFormulas(Array.isArray(item.assemblyInputs) ? (item.assemblyInputs as AssemblyInputValue[]) : null),
  ];
}

/**
 * Take-off-backed quantities.
 *
 * An estimate line's quantity can be an expression over take-off measurements
 * ("{takeoff:9f3…} * 1.1"). The formula is the estimator's; the NUMBER is what
 * everything else reads, so it is resolved here — on the server, on every write
 * path — rather than trusting whatever the client posted.
 *
 * Two flows:
 *
 *   Writing a line     → resolveFormulaOnWrite: evaluate, set quantity, and
 *                        remember which measurements it depends on.
 *   Re-measuring       → repriceLinesForMeasurement: find the lines that depend
 *                        on the measurement, re-evaluate them, re-price them.
 *
 * A failed formula NEVER changes a quantity. A line priced at 48.26 m² whose
 * take-off item was deleted keeps 48.26 and shows as broken in the grid —
 * quietly re-pricing it at zero would put a hole in a quote nobody looked at.
 */

/** Every take-off measurement in a project, id → its quantity. */
export async function loadMeasurementQuantities(projectId: string): Promise<Map<string, number>> {
  const rows = await db
    .select({ id: schema.takeoffMeasurements.id, quantity: schema.takeoffMeasurements.quantity })
    .from(schema.takeoffMeasurements)
    .where(eq(schema.takeoffMeasurements.projectId, projectId));
  return new Map(rows.map((r) => [r.id, Number(r.quantity) || 0] as const));
}

export type FormulaWriteOutcome =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Settle the quantity for a create/update of an estimate line, in place.
 *
 * - A formula is evaluated here and decides `quantity`.
 * - Clearing the formula (null / "") leaves whatever quantity was sent.
 * - Typing a quantity with no formula in the same request CLEARS the formula:
 *   the number is the estimator's own now. Same rule as the price-list link on
 *   unit cost — so a drift warning can only ever mean "the take-off moved".
 */
export async function resolveFormulaOnWrite(
  data: Record<string, any>,
  existing: { quantity?: number | null; quantityFormula?: string | null } | null,
  projectId: string,
): Promise<FormulaWriteOutcome> {
  const hasFormulaField = Object.prototype.hasOwnProperty.call(data, "quantityFormula");
  const formula = hasFormulaField ? (data.quantityFormula ?? null) : undefined;

  if (hasFormulaField && (formula === null || String(formula).trim() === "")) {
    data.quantityFormula = null;
    return { ok: true };
  }

  if (hasFormulaField) {
    const quantities = await loadMeasurementQuantities(projectId);
    const result = evaluateQuantityFormula(String(formula), quantities);
    if (!result.ok) return { ok: false, error: result.error };
    data.quantityFormula = String(formula).trim();
    data.quantity = result.value;
    return { ok: true };
  }

  // A hand-typed quantity takes the line off the take-off.
  if (data.quantity !== undefined && existing?.quantityFormula) {
    data.quantityFormula = null;
  }
  return { ok: true };
}

/** Rewrite the reverse index for one line. Call after the line is saved. */
export async function syncItemRefs(
  itemId: string,
  formula: string | null | undefined | Array<string | null | undefined>,
): Promise<void> {
  const refs = Array.from(new Set(
    (Array.isArray(formula) ? formula : [formula]).flatMap((f) => extractTakeoffRefs(f)),
  ));
  await db
    .delete(schema.estimateItemTakeoffRefs)
    .where(eq(schema.estimateItemTakeoffRefs.estimateItemId, itemId));
  if (refs.length === 0) return;
  // A formula can name a measurement that has since been deleted; the row would
  // fail its foreign key, and the formula keeps the dead id anyway (that is what
  // shows as broken in the grid). Index only the ones that still exist.
  const live = await db
    .select({ id: schema.takeoffMeasurements.id })
    .from(schema.takeoffMeasurements)
    .where(inArray(schema.takeoffMeasurements.id, refs));
  if (live.length === 0) return;
  await db
    .insert(schema.estimateItemTakeoffRefs)
    .values(live.map((m) => ({ estimateItemId: itemId, measurementId: m.id })))
    .onConflictDoNothing();
}

/**
 * Re-price every estimate line that depends on a measurement.
 *
 * Skipped deliberately:
 *   - locked estimates — a locked or issued estimate is a record, not a
 *     working document. The grid shows the difference and an Update button.
 *   - superseded revisions — Rev A is what you quoted; only the latest revision
 *     of each family follows the plan.
 *
 * Returns the ids of the lines whose quantity actually moved.
 */
export async function repriceLinesForMeasurement(measurementId: string): Promise<string[]> {
  const refs = await db
    .select({ itemId: schema.estimateItemTakeoffRefs.estimateItemId })
    .from(schema.estimateItemTakeoffRefs)
    .where(eq(schema.estimateItemTakeoffRefs.measurementId, measurementId));
  if (refs.length === 0) return [];

  const items = await db
    .select()
    .from(schema.estimateItems)
    .where(inArray(schema.estimateItems.id, refs.map((r) => r.itemId)));
  if (items.length === 0) return [];

  const estimateIds = Array.from(new Set(items.map((i) => i.estimateId)));
  const estimates = await db
    .select()
    .from(schema.estimates)
    .where(inArray(schema.estimates.id, estimateIds));
  const estimateById = new Map(estimates.map((e) => [e.id, e] as const));

  // The latest revision of each family is the only one that follows the plan.
  const latestOfFamily = await resolveLatestRevisions(estimates);

  const projectIds = Array.from(new Set(estimates.map((e) => e.projectId)));
  const quantitiesByProject = new Map<string, Map<string, number>>();
  for (const pid of projectIds) {
    quantitiesByProject.set(pid, await loadMeasurementQuantities(pid));
  }

  const moved: string[] = [];
  for (const item of items) {
    const estimate = estimateById.get(item.estimateId);
    if (!estimate || estimate.isLocked) continue;
    if (!latestOfFamily.has(estimate.id)) continue;

    const quantities = quantitiesByProject.get(estimate.projectId);
    if (!quantities) continue;
    // An assembly line can follow the take-off through its named inputs as
    // well as its quantity (phase 3); either moving rescales its components.
    const inputsMoved = item.assemblyId ? await refreshAssemblyInputs(item as any, quantities) : false;
    const result = item.quantityFormula
      ? evaluateQuantityFormula(item.quantityFormula, quantities)
      : ({ ok: false } as const);
    // A broken formula keeps the line's last number, on purpose.
    if (!result.ok || Math.abs(result.value - Number(item.quantity ?? 0)) < 0.0001) {
      if (inputsMoved) moved.push(item.id, ...(await rescaleAssemblyComponents(item.id)));
      continue;
    }

    const { taxAmount, priceIncTax } = resolveEstimateStoredPrice({
      unitCostExTax: item.unitCostExTax,
      unitCostIncTax: (item as any).unitCostIncTax,
      quantity: result.value,
      markupPercent: item.markupPercent,
      projectMarkupPercent: estimate.projectMarkupPercent,
      taxRate: estimate.taxRate,
      wastagePercent: item.wastagePercent,
      existingPriceIncTax: item.priceIncTax,
    });

    await db
      .update(schema.estimateItems)
      .set({ quantity: result.value, taxAmount, priceIncTax, updatedAt: new Date() })
      .where(eq(schema.estimateItems.id, item.id));
    moved.push(item.id);
    // An assembly line's components follow its quantity (server/assemblies.ts).
    if (item.assemblyId) moved.push(...(await rescaleAssemblyComponents(item.id)));
  }
  return moved;
}

/** The id of the highest-version estimate in each revision family. */
async function resolveLatestRevisions(estimates: schema.Estimate[]): Promise<Set<string>> {
  const rootIds = Array.from(new Set(estimates.map((e) => e.parentEstimateId || e.id)));
  if (rootIds.length === 0) return new Set();
  const family = await db
    .select({
      id: schema.estimates.id,
      version: schema.estimates.version,
      parentEstimateId: schema.estimates.parentEstimateId,
    })
    .from(schema.estimates)
    .where(inArray(schema.estimates.id, rootIds));
  const children = await db
    .select({
      id: schema.estimates.id,
      version: schema.estimates.version,
      parentEstimateId: schema.estimates.parentEstimateId,
    })
    .from(schema.estimates)
    .where(inArray(schema.estimates.parentEstimateId, rootIds));

  const best = new Map<string, { id: string; version: number }>();
  for (const row of [...family, ...children]) {
    const root = row.parentEstimateId || row.id;
    const current = best.get(root);
    if (!current || row.version > current.version) best.set(root, { id: row.id, version: row.version });
  }
  return new Set(Array.from(best.values()).map((b) => b.id));
}

export type MeasurementUsage = {
  measurementId: string;
  /** Lines that use this measurement, newest estimate first. */
  items: Array<{ itemId: string; itemName: string; estimateId: string; estimateName: string }>;
};

/**
 * Which estimate lines use each take-off measurement in a project — the
 * "used by 3 estimate lines" note in the take-off list, and the warning shown
 * before one is deleted.
 */
export async function getMeasurementUsage(projectId: string): Promise<MeasurementUsage[]> {
  const rows = await db
    .select({
      measurementId: schema.estimateItemTakeoffRefs.measurementId,
      itemId: schema.estimateItems.id,
      itemName: schema.estimateItems.name,
      estimateId: schema.estimates.id,
      estimateName: schema.estimates.name,
      version: schema.estimates.version,
    })
    .from(schema.estimateItemTakeoffRefs)
    .innerJoin(
      schema.estimateItems,
      eq(schema.estimateItems.id, schema.estimateItemTakeoffRefs.estimateItemId),
    )
    .innerJoin(schema.estimates, eq(schema.estimates.id, schema.estimateItems.estimateId))
    .innerJoin(
      schema.takeoffMeasurements,
      eq(schema.takeoffMeasurements.id, schema.estimateItemTakeoffRefs.measurementId),
    )
    .where(and(eq(schema.estimates.projectId, projectId), eq(schema.takeoffMeasurements.projectId, projectId)));

  const byMeasurement = new Map<string, MeasurementUsage>();
  for (const r of rows) {
    if (!byMeasurement.has(r.measurementId)) {
      byMeasurement.set(r.measurementId, { measurementId: r.measurementId, items: [] });
    }
    byMeasurement.get(r.measurementId)!.items.push({
      itemId: r.itemId,
      itemName: r.itemName,
      estimateId: r.estimateId,
      estimateName: `${r.estimateName} (v${r.version})`,
    });
  }
  return Array.from(byMeasurement.values());
}

/** A project's take-off, indexed for linking names: one query. */
export async function loadTakeoffIndex(projectId: string) {
  const rows = await db
    .select({
      id: schema.takeoffMeasurements.id,
      name: schema.takeoffMeasurements.name,
      quantity: schema.takeoffMeasurements.quantity,
    })
    .from(schema.takeoffMeasurements)
    .where(eq(schema.takeoffMeasurements.projectId, projectId));
  return {
    byName: indexTakeoffByName(rows),
    quantities: new Map(rows.map((r) => [r.id, Number(r.quantity) || 0] as const)),
  };
}

/**
 * Index the take-off refs of lines just created, in ONE insert.
 *
 * syncItemRefs is per line (delete, check, insert) — fine for one edit, and
 * three round trips a line for a 60-line template load. New lines have no refs
 * to delete, and `liveIds` (the project's measurements, already loaded) says
 * which ids exist.
 */
export async function insertRefsForNewItems(
  items: Array<{ id: string; quantityFormula?: string | null; assemblyInputs?: unknown }>,
  liveIds: Set<string>,
): Promise<void> {
  const values = items.flatMap((item) =>
    Array.from(new Set(lineTakeoffFormulas(item).flatMap((f) => extractTakeoffRefs(f))))
      .filter((id) => liveIds.has(id))
      .map((measurementId) => ({ estimateItemId: item.id, measurementId })),
  );
  if (values.length === 0) return;
  await db.insert(schema.estimateItemTakeoffRefs).values(values).onConflictDoNothing();
}

/**
 * Link the estimate lines that are waiting for a take-off item.
 *
 * A line loaded from a template before its item was measured keeps the item's
 * NAME in its formula (`{Wall tiles} * 1.1`) at quantity 0. Call this whenever
 * a project's take-off gains a name — an item created (drawn, or loaded from a
 * take-off template) or renamed — and every waiting line that now matches
 * exactly one item is linked, evaluated and re-priced. So it doesn't matter
 * which was loaded first, the estimate template or the take-off.
 *
 * Same exclusions as re-measuring: locked estimates and superseded revisions
 * are records, not working documents, and are left as they are.
 *
 * Returns the ids of the lines it changed.
 */
export async function linkWaitingLines(projectId: string): Promise<string[]> {
  // Only lines with a NAME in braces; id references (`{takeoff:…}`) are the
  // linked ones. Postgres ARE supports the lookahead.
  const rows = await db
    .select({ item: schema.estimateItems, estimate: schema.estimates })
    .from(schema.estimateItems)
    .innerJoin(schema.estimates, eq(schema.estimates.id, schema.estimateItems.estimateId))
    .where(
      and(
        eq(schema.estimates.projectId, projectId),
        // …or an assembly line whose named input waits for one. In the jsonb
        // text every object brace is followed by a quote or a closing brace,
        // so those are excluded.
        sql`(${schema.estimateItems.quantityFormula} ~ ${"\\{(?!takeoff:)"} OR ${schema.estimateItems.assemblyInputs}::text ~ ${'\\{(?!takeoff:|"|\\})'})`,
      ),
    );
  const waitingInputs = (item: schema.EstimateItem) =>
    inputFormulas(item.assemblyInputs as AssemblyInputValue[] | null).some((f) => isWaitingFormula(f));
  const waiting = rows.filter((r) => !r.estimate.isLocked
    && (isWaitingFormula(r.item.quantityFormula) || waitingInputs(r.item)));
  if (waiting.length === 0) return [];

  const latest = await resolveLatestRevisions(Array.from(new Map(waiting.map((r) => [r.estimate.id, r.estimate])).values()));
  const candidates = waiting.filter((r) => latest.has(r.estimate.id));
  if (candidates.length === 0) return [];

  const { byName, quantities } = await loadTakeoffIndex(projectId);
  const changed: Array<{ id: string; quantityFormula: string | null; assemblyInputs?: unknown }> = [];
  for (const { item, estimate } of candidates) {
    // Named inputs first: link each waiting name, evaluate the fully linked.
    let inputsLinked: AssemblyInputValue[] | null = null;
    if (waitingInputs(item)) {
      let any = false;
      const next = (item.assemblyInputs as AssemblyInputValue[]).map((i) => {
        if (!i.formula || !isWaitingFormula(i.formula)) return i;
        const r = resolveNameRefs(i.formula, byName);
        if (r.linked.length === 0) return i;
        any = true;
        return { ...i, formula: r.formula };
      });
      if (any) inputsLinked = resolveInputFormulas(next, quantities).inputs;
    }
    if (!isWaitingFormula(item.quantityFormula)) {
      if (!inputsLinked) continue;
      await db.update(schema.estimateItems)
        .set({ assemblyInputs: inputsLinked, updatedAt: new Date() })
        .where(eq(schema.estimateItems.id, item.id));
      changed.push({ id: item.id, quantityFormula: item.quantityFormula, assemblyInputs: inputsLinked });
      await rescaleAssemblyComponents(item.id);
      continue;
    }
    const r = resolveNameRefs(item.quantityFormula!, byName);
    if (r.linked.length === 0 && !inputsLinked) continue; // nothing new matched
    const patch: Record<string, any> = { quantityFormula: r.formula, updatedAt: new Date() };
    if (inputsLinked) patch.assemblyInputs = inputsLinked;
    if (r.waiting.length === 0 && r.ambiguous.length === 0) {
      const value = evaluateQuantityFormula(r.formula, quantities);
      if (value.ok) {
        const { taxAmount, priceIncTax } = resolveEstimateStoredPrice({
          unitCostExTax: item.unitCostExTax,
          unitCostIncTax: (item as any).unitCostIncTax,
          quantity: value.value,
          markupPercent: item.markupPercent,
          projectMarkupPercent: estimate.projectMarkupPercent,
          taxRate: estimate.taxRate,
          wastagePercent: item.wastagePercent,
          existingPriceIncTax: item.priceIncTax,
        });
        Object.assign(patch, { quantity: value.value, taxAmount, priceIncTax });
      }
    }
    await db.update(schema.estimateItems).set(patch).where(eq(schema.estimateItems.id, item.id));
    changed.push({ id: item.id, quantityFormula: r.formula, assemblyInputs: inputsLinked ?? item.assemblyInputs });
    if (item.assemblyId && (patch.quantity !== undefined || inputsLinked)) await rescaleAssemblyComponents(item.id);
  }
  await insertRefsForNewItems(changed, new Set(quantities.keys()));
  return changed.map((c) => c.id);
}
