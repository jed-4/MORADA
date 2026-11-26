/**
 * Estimate assemblies — Library CRUD, dropping one into an estimate, and
 * keeping component quantities in step with the assembly line (migration 0142).
 *
 * The rules live in shared/assemblies.ts; this module is the database half.
 *
 * Access: team members only (same as the price list). Every read and write is
 * scoped to the caller's company — an assembly, estimate, cost code or price
 * list item from another company is a 404, never a silent link.
 */
import type { Express, Request, Response } from "express";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "./db";
import * as schema from "@shared/schema";
import {
  assemblyInputSchema,
  type AssemblyComponentInput,
  type AssemblyWithComponents,
} from "@shared/schema";
import {
  assemblyLineFields,
  checkInputDefs,
  componentLineFields,
  componentQuantityOf,
  initialInputValues,
  inputValueMap,
  mergeInputEdits,
  planAssemblyRescale,
  recipeInputKeys,
  resolveInputFormulas,
  type AssemblyInputDef,
  type AssemblyInputValue,
  type AssemblySource,
} from "@shared/assemblies";
import { evaluateQuantityFormula } from "@shared/quantityFormula";
import {
  planAssemblyUpdate,
  planPriceDrift,
  type AssemblyDrift,
  type PriceDrift,
} from "@shared/assemblyDrift";
import { centsToDollars, dollarsToCents } from "@shared/money";
import { resolveEstimateStoredPrice } from "@shared/pricing";
import { exGstFromInc } from "@shared/money";
import { requireAuth, requireTeamMember, getSessionCompanyId } from "./middleware/auth";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Db = typeof db | Tx;

// ── Reads ────────────────────────────────────────────────────────────────────

export async function listAssemblies(
  companyId: string,
  opts: { includeArchived?: boolean } = {},
): Promise<AssemblyWithComponents[]> {
  const rows = await db
    .select()
    .from(schema.assemblies)
    .where(
      opts.includeArchived
        ? eq(schema.assemblies.companyId, companyId)
        : and(eq(schema.assemblies.companyId, companyId), eq(schema.assemblies.isArchived, false)),
    )
    .orderBy(asc(schema.assemblies.name));
  if (rows.length === 0) return [];
  const components = await db
    .select()
    .from(schema.assemblyComponents)
    .where(inArray(schema.assemblyComponents.assemblyId, rows.map((r) => r.id)))
    .orderBy(asc(schema.assemblyComponents.order));
  const byAssembly = new Map<string, schema.AssemblyComponent[]>();
  for (const c of components) {
    const list = byAssembly.get(c.assemblyId) ?? [];
    list.push(c);
    byAssembly.set(c.assemblyId, list);
  }
  return rows.map((r) => ({ ...r, components: byAssembly.get(r.id) ?? [] }));
}

export async function getAssembly(id: string, companyId: string, tx: Db = db): Promise<AssemblyWithComponents | null> {
  const [row] = await tx
    .select()
    .from(schema.assemblies)
    .where(and(eq(schema.assemblies.id, id), eq(schema.assemblies.companyId, companyId)));
  if (!row) return null;
  const components = await tx
    .select()
    .from(schema.assemblyComponents)
    .where(eq(schema.assemblyComponents.assemblyId, id))
    .orderBy(asc(schema.assemblyComponents.order));
  return { ...row, components };
}

// ── Validation of foreign ids ────────────────────────────────────────────────

/**
 * Every cost code and price list item an assembly names must be this
 * company's. Returns the first offender's message, or null when all are fine.
 */
async function checkForeignIds(
  companyId: string,
  costCodeIds: Array<string | null | undefined>,
  priceListItemIds: Array<string | null | undefined>,
): Promise<string | null> {
  const codes = Array.from(new Set(costCodeIds.filter((x): x is string => !!x)));
  if (codes.length > 0) {
    const found = await db
      .select({ id: schema.costCodes.id })
      .from(schema.costCodes)
      .where(and(inArray(schema.costCodes.id, codes), eq(schema.costCodes.companyId, companyId)));
    if (found.length !== codes.length) return "Unknown cost code";
  }
  const items = Array.from(new Set(priceListItemIds.filter((x): x is string => !!x)));
  if (items.length > 0) {
    const found = await db
      .select({ id: schema.priceListItems.id })
      .from(schema.priceListItems)
      .where(and(inArray(schema.priceListItems.id, items), eq(schema.priceListItems.companyId, companyId)));
    if (found.length !== items.length) return "Price list item not found";
  }
  return null;
}

/**
 * Replace an assembly's components with `next`, keeping the row of any
 * component whose id is supplied. Estimate lines point at component ids for
 * provenance, so an edit must update in place rather than delete-and-recreate.
 */
async function writeComponents(tx: Tx, assemblyId: string, next: AssemblyComponentInput[]): Promise<void> {
  const existing = await tx
    .select({ id: schema.assemblyComponents.id })
    .from(schema.assemblyComponents)
    .where(eq(schema.assemblyComponents.assemblyId, assemblyId));
  const existingIds = new Set(existing.map((e) => e.id));
  const keep = new Set(next.map((c) => c.id).filter((id): id is string => !!id && existingIds.has(id)));

  const gone = Array.from(existingIds).filter((id) => !keep.has(id));
  if (gone.length > 0) {
    await tx.delete(schema.assemblyComponents).where(inArray(schema.assemblyComponents.id, gone));
  }

  const now = new Date();
  const fields = (c: AssemblyComponentInput, order: number) => ({
    order,
    name: c.name,
    type: c.type || "Material",
    priceListItemId: c.priceListItemId ?? null,
    unitType: c.unitType || "each",
    unitCostCents: c.unitCostCents ?? 0,
    qtyMode: c.qtyMode === "fixed" || c.qtyMode === "formula" ? c.qtyMode : "per_unit",
    qtyFactor: c.qtyFactor ?? 1,
    qtyFormula: c.qtyMode === "formula" ? (c.qtyFormula ?? "").trim() || null : null,
    wastagePercent: c.wastagePercent ?? 0,
    markupPercent: c.markupPercent ?? null,
    costCodeId: c.costCodeId ?? null,
    updatedAt: now,
  });

  const inserts: Array<ReturnType<typeof fields> & { assemblyId: string }> = [];
  for (let i = 0; i < next.length; i++) {
    const c = next[i];
    if (c.id && keep.has(c.id)) {
      await tx
        .update(schema.assemblyComponents)
        .set(fields(c, i))
        .where(eq(schema.assemblyComponents.id, c.id));
    } else {
      inserts.push({ ...fields(c, i), assemblyId });
    }
  }
  if (inserts.length > 0) await tx.insert(schema.assemblyComponents).values(inserts);
}

/**
 * An assembly's inputs and recipes must agree: inputs well-formed, and every
 * recipe reads using only those inputs. Checked at the default values, so a
 * recipe that can't be worked out is refused here rather than landing at 0 on
 * a job. Returns an error message, or null.
 */
function checkRecipes(
  mainLabel: string | null | undefined,
  inputs: AssemblyInputDef[],
  components: AssemblyComponentInput[],
): string | null {
  const bad = checkInputDefs(mainLabel, inputs);
  if (bad) return bad;
  const values = inputValueMap(1, inputs);
  for (const c of components) {
    if (c.qtyMode !== "formula") continue;
    const formula = (c.qtyFormula ?? "").trim();
    if (!formula) return `"${c.name}" needs a recipe`;
    if (/\{takeoff:/.test(formula)) return `"${c.name}": a recipe reads the assembly's inputs, not the take-off`;
    const unknown = recipeInputKeys(formula).find((k) => !values.has(`input:${k}`));
    if (unknown) return `"${c.name}": its recipe uses an input that no longer exists`;
    const r = evaluateQuantityFormula(formula, values, { decimals: 4 });
    if (!r.ok) return `"${c.name}": ${r.error}`;
  }
  return null;
}

// ── Estimates ────────────────────────────────────────────────────────────────

/** The estimate, if it belongs to the company. */
async function getCompanyEstimate(estimateId: string, companyId: string): Promise<schema.Estimate | null> {
  const [row] = await db
    .select({ estimate: schema.estimates })
    .from(schema.estimates)
    .innerJoin(schema.projects, eq(schema.projects.id, schema.estimates.projectId))
    .where(and(eq(schema.estimates.id, estimateId), eq(schema.projects.companyId, companyId)));
  return row?.estimate ?? null;
}

/**
 * Current ex-GST cost in cents of each price list item, keyed by id. Used only
 * to decide whether a component line may keep its price-list link.
 */
async function catalogueCostsCents(ids: string[]): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({
      id: schema.priceListItems.id,
      costPrice: schema.priceListItems.costPrice,
      gstInclusive: schema.priceListItems.gstInclusive,
    })
    .from(schema.priceListItems)
    .where(inArray(schema.priceListItems.id, ids));
  return new Map(rows.map((r) => [r.id, r.gstInclusive ? exGstFromInc(r.costPrice) : r.costPrice] as const));
}

function toSource(a: AssemblyWithComponents): AssemblySource {
  return {
    id: a.id,
    name: a.name,
    description: a.description,
    unitType: a.unitType,
    costCodeId: a.costCodeId,
    version: a.version,
    quantityLabel: a.quantityLabel,
    inputs: a.inputs ?? [],
    components: a.components.map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type,
      priceListItemId: c.priceListItemId,
      unitType: c.unitType,
      unitCostCents: c.unitCostCents,
      qtyMode: c.qtyMode,
      qtyFactor: c.qtyFactor,
      qtyFormula: c.qtyFormula,
      wastagePercent: c.wastagePercent,
      markupPercent: c.markupPercent,
      costCodeId: c.costCodeId,
    })),
  };
}

/**
 * Drop an assembly into an estimate: the assembly line at the end of its group,
 * then its components under it. Two inserts, one transaction.
 */
export async function insertAssemblyIntoEstimate(
  estimate: schema.Estimate,
  assembly: AssemblyWithComponents,
  opts: { quantity: number; groupId: string | null; into?: schema.EstimateItem },
): Promise<schema.EstimateItem[]> {
  const source = toSource(assembly);
  const linked = source.components.map((c) => c.priceListItemId).filter((x): x is string => !!x);
  const catalogue = await catalogueCostsCents(linked);
  const pricing = { projectMarkupPercent: estimate.projectMarkupPercent, taxRate: estimate.taxRate };
  // Every input starts at the Library default; the estimator sets this job's.
  const inputs = initialInputValues(source);

  return db.transaction(async (tx) => {
    let parent: schema.EstimateItem;
    if (opts.into) {
      // Turn an existing line into the assembly line, where it already sits — the
      // name-cell autocomplete path. Its own cost and price-list link go: the
      // assembly line carries no money of its own. A take-off formula stays, so
      // a measured line keeps driving the quantity.
      const fields = assemblyLineFields(source, opts.quantity);
      [parent] = await tx
        .update(schema.estimateItems)
        .set({ ...fields, priceListItemId: null })
        .where(eq(schema.estimateItems.id, opts.into.id))
        .returning();
    } else {
    const [{ maxOrder }] = await tx
      .select({ maxOrder: sql<number>`coalesce(max(${schema.estimateItems.order}), -1)` })
      .from(schema.estimateItems)
      .where(and(
        eq(schema.estimateItems.estimateId, estimate.id),
        opts.groupId ? eq(schema.estimateItems.groupId, opts.groupId) : isNull(schema.estimateItems.groupId),
        isNull(schema.estimateItems.parentItemId),
      ));

    [parent] = await tx
      .insert(schema.estimateItems)
      .values({
        ...assemblyLineFields(source, opts.quantity),
        estimateId: estimate.id,
        groupId: opts.groupId,
        order: Number(maxOrder) + 1,
      })
      .returning();
    }

    if (source.components.length === 0) return [parent];

    const children = await tx
      .insert(schema.estimateItems)
      .values(source.components.map((c, i) => ({
        ...componentLineFields(c, source, opts.quantity, pricing, c.priceListItemId ? catalogue.get(c.priceListItemId) : undefined, inputs),
        estimateId: estimate.id,
        // A sub-item's group must equal its parent's: group totals sum by groupId.
        groupId: opts.groupId,
        parentItemId: parent.id,
        order: i,
      })))
      .returning();

    return [parent, ...children];
  });
}

/**
 * Bring every following component of an assembly line into step with its
 * quantity. Overridden components are left alone. One UPDATE for the lot —
 * a round trip to Neon is ~400ms, so never one per line.
 *
 * Callers write the assembly line first; this reads its saved quantity, so the
 * same function serves the grid, the take-off and anything else that moves it.
 * Returns the ids of the components that moved.
 */
export async function rescaleAssemblyComponents(assemblyLineId: string): Promise<string[]> {
  const [parent] = await db
    .select()
    .from(schema.estimateItems)
    .where(eq(schema.estimateItems.id, assemblyLineId));
  if (!parent || !parent.assemblyId) return [];
  const [estimate] = await db.select().from(schema.estimates).where(eq(schema.estimates.id, parent.estimateId));
  if (!estimate || estimate.isLocked) return [];

  const children = await db
    .select()
    .from(schema.estimateItems)
    .where(eq(schema.estimateItems.parentItemId, parent.id));
  const plan = planAssemblyRescale(Number(parent.quantity) || 0, children, parent.assemblyInputs as AssemblyInputValue[] | null);
  if (plan.length === 0) return [];

  const byId = new Map(children.map((c) => [c.id, c] as const));
  const rows = plan.map(({ id, quantity }) => {
    const c = byId.get(id)!;
    const { priceIncTax, taxAmount } = resolveEstimateStoredPrice({
      unitCostExTax: c.unitCostExTax,
      unitCostIncTax: c.unitCostIncTax,
      quantity,
      markupPercent: c.markupPercent,
      projectMarkupPercent: estimate.projectMarkupPercent,
      taxRate: estimate.taxRate,
      wastagePercent: c.wastagePercent,
      existingPriceIncTax: c.priceIncTax,
    });
    return { id, quantity, priceIncTax, taxAmount };
  });

  const ids = rows.map((r) => r.id);
  const caseOf = (col: "quantity" | "priceIncTax" | "taxAmount") =>
    sql.join(
      [sql`CASE ${schema.estimateItems.id}`, ...rows.map((r) => sql`WHEN ${r.id} THEN ${r[col]}::double precision`), sql`END`],
      sql` `,
    );
  await db
    .update(schema.estimateItems)
    .set({
      quantity: caseOf("quantity"),
      priceIncTax: caseOf("priceIncTax"),
      taxAmount: caseOf("taxAmount"),
      // A per-unit component's formula, if it ever had one, no longer decides it.
      quantityFormula: null,
      updatedAt: new Date(),
    })
    .where(inArray(schema.estimateItems.id, ids));
  return ids;
}

/**
 * Assembly rules for a PATCH to one estimate line, applied to `updateData` in
 * place BEFORE the route prices and saves it.
 *
 *  - The assembly line has no money of its own: unit cost and amount edits are
 *    refused (it would become a lump sum on top of its components).
 *  - A component whose quantity is typed by hand becomes OVERRIDDEN.
 *  - `assemblyQtyOverridden: false` on a component is a RESET: its quantity is
 *    recomputed from the assembly line.
 *
 * Returns an error message to send as a 400, or null.
 */
export async function applyAssemblyPatchRules(
  updateData: Record<string, any>,
  existing: schema.EstimateItem,
  projectId?: string,
): Promise<string | null> {
  // Provenance is the server's to set, never a client's.
  delete updateData.assemblyId;
  delete updateData.assemblyVersion;
  delete updateData.assemblyComponentId;
  delete updateData.assemblyQtyMode;
  delete updateData.assemblyQtyFactor;
  delete updateData.assemblyQtyFormula;
  delete updateData.assemblyQtyLabel;

  // Named inputs live on the assembly line only. The client sends
  // [{ key, value, formula }]; labels and defaults stay the line's snapshot.
  // A take-off formula decides its input's value, here on the server.
  if (updateData.assemblyInputs !== undefined) {
    if (!existing.assemblyId || !Array.isArray(updateData.assemblyInputs)) {
      delete updateData.assemblyInputs;
    } else {
      const merged = mergeInputEdits(existing.assemblyInputs as AssemblyInputValue[] | null, updateData.assemblyInputs);
      if (merged.some((i) => i.formula && !/^[^{}]*(\{takeoff:[0-9a-zA-Z_-]+\}[^{}]*)+$/.test(i.formula))) {
        return "An input can only follow a take-off measurement";
      }
      if (merged.some((i) => i.formula) && projectId) {
        const { loadMeasurementQuantities } = await import("./services/quantityFormulas");
        const r = resolveInputFormulas(merged, await loadMeasurementQuantities(projectId));
        if (r.errors.length > 0) return r.errors[0];
        updateData.assemblyInputs = r.inputs;
      } else {
        updateData.assemblyInputs = merged;
      }
    }
  }

  if (existing.assemblyId) {
    const touchesMoney = ["unitCostExTax", "unitCostIncTax", "priceIncTax", "markupPercent", "wastagePercent"]
      .some((k) => updateData[k] !== undefined && Number(updateData[k] ?? 0) !== Number((existing as any)[k] ?? 0));
    if (touchesMoney) {
      return "An assembly line is priced by its components — edit those instead";
    }
    for (const k of ["unitCostExTax", "unitCostIncTax", "priceIncTax", "markupPercent", "wastagePercent"]) {
      delete updateData[k];
    }
    delete updateData.assemblyQtyOverridden;
    return null;
  }

  if (!existing.assemblyQtyMode) {
    delete updateData.assemblyQtyOverridden;
    return null;
  }

  if (updateData.assemblyQtyOverridden === false) {
    const [parent] = existing.parentItemId
      ? await db.select().from(schema.estimateItems).where(eq(schema.estimateItems.id, existing.parentItemId))
      : [];
    const qty = componentQuantityOf(
      { mode: existing.assemblyQtyMode, factor: existing.assemblyQtyFactor, formula: existing.assemblyQtyFormula },
      { quantity: parent?.quantity ?? 0, inputs: parent?.assemblyInputs as AssemblyInputValue[] | null },
    );
    if (qty === null) return "This component's recipe can't be worked out — check the assembly's inputs";
    updateData.quantity = qty;
    updateData.quantityFormula = null;
    return null;
  }

  delete updateData.assemblyQtyOverridden;
  const qtyChanged = updateData.quantity !== undefined
    && Math.abs(Number(updateData.quantity) - Number(existing.quantity ?? 0)) > 1e-9;
  const formulaSet = updateData.quantityFormula !== undefined && updateData.quantityFormula !== null
    && String(updateData.quantityFormula).trim() !== "";
  if (qtyChanged || formulaSet) updateData.assemblyQtyOverridden = true;
  return null;
}

/**
 * The bulk-edit variant of applyAssemblyPatchRules: a broad brush across many
 * lines, so money fields are quietly dropped for assembly lines rather than
 * failing the whole batch.
 */
export function applyAssemblyBulkRules(next: Record<string, any>, item: schema.EstimateItem): void {
  if (item.assemblyId) {
    delete next.unitCostExTax;
    delete next.unitCostIncTax;
    delete next.markupPercent;
    delete next.wastagePercent;
    return;
  }
  if (item.assemblyQtyMode && next.quantity !== undefined
    && Math.abs(Number(next.quantity) - Number(item.quantity ?? 0)) > 1e-9) {
    next.assemblyQtyOverridden = true;
  }
}

/**
 * Follow-ups once an assembly line has been saved: its components rescale to
 * a new quantity, and follow it into a new group (group totals sum by groupId,
 * so a component left behind would be counted in the wrong section).
 * A no-op for any other line.
 */
export async function afterAssemblyLineSaved(
  before: Pick<schema.EstimateItem, "id" | "assemblyId" | "quantity" | "groupId"> & { assemblyInputs?: unknown },
  after: Pick<schema.EstimateItem, "quantity" | "groupId"> & { assemblyInputs?: unknown } | null | undefined,
): Promise<void> {
  if (!before.assemblyId || !after) return;
  if ((after.groupId ?? null) !== (before.groupId ?? null)) {
    await db
      .update(schema.estimateItems)
      .set({ groupId: after.groupId ?? null, updatedAt: new Date() })
      .where(eq(schema.estimateItems.parentItemId, before.id));
  }
  const inputsMoved = JSON.stringify(after.assemblyInputs ?? null) !== JSON.stringify(before.assemblyInputs ?? null);
  if (inputsMoved || Math.abs(Number(after.quantity ?? 0) - Number(before.quantity ?? 0)) > 1e-9) {
    await rescaleAssemblyComponents(before.id);
  }
}

/**
 * Follow the take-off for an assembly line's inputs: re-evaluate each input's
 * formula, save the values that moved, and rescale. For the re-measure path.
 * Returns true when any input moved.
 */
export async function refreshAssemblyInputs(
  item: Pick<schema.EstimateItem, "id" | "assemblyId"> & { assemblyInputs?: unknown },
  takeoffQuantities: Map<string, number>,
): Promise<boolean> {
  if (!item.assemblyId || !Array.isArray(item.assemblyInputs)) return false;
  const r = resolveInputFormulas(item.assemblyInputs as AssemblyInputValue[], takeoffQuantities);
  if (!r.changed) return false;
  await db
    .update(schema.estimateItems)
    .set({ assemblyInputs: r.inputs, updatedAt: new Date() })
    .where(eq(schema.estimateItems.id, item.id));
  return true;
}

/**
 * Copy an assembly line's components under a copy of that line — duplicate in
 * place, or copy to another estimate. The line-copy paths in storage.ts copy
 * ONE row, which for an assembly line is a heading with no money under it.
 * Components are repriced against the target estimate, as the line copy is.
 */
export async function copyAssemblyComponents(
  sourceLineId: string,
  newLine: Pick<schema.EstimateItem, "id" | "estimateId" | "groupId" | "assemblyId"> & { assemblyInputs?: unknown },
): Promise<void> {
  if (!newLine.assemblyId) return;
  // The copy keeps the numbers, not the take-off links — the same rule the
  // line copy applies to its own quantity formula.
  if (Array.isArray(newLine.assemblyInputs) && (newLine.assemblyInputs as AssemblyInputValue[]).some((i) => i.formula)) {
    await db
      .update(schema.estimateItems)
      .set({ assemblyInputs: (newLine.assemblyInputs as AssemblyInputValue[]).map((i) => ({ ...i, formula: null })) })
      .where(eq(schema.estimateItems.id, newLine.id));
  }
  const children = await db
    .select()
    .from(schema.estimateItems)
    .where(eq(schema.estimateItems.parentItemId, sourceLineId))
    .orderBy(asc(schema.estimateItems.order));
  if (children.length === 0) return;
  const [target] = await db.select().from(schema.estimates).where(eq(schema.estimates.id, newLine.estimateId));
  if (!target) return;
  await db.insert(schema.estimateItems).values(children.map((c) => {
    const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = c;
    const { priceIncTax, taxAmount } = resolveEstimateStoredPrice({
      unitCostExTax: c.unitCostExTax,
      unitCostIncTax: c.unitCostIncTax,
      quantity: c.quantity,
      markupPercent: c.markupPercent,
      projectMarkupPercent: target.projectMarkupPercent,
      taxRate: target.taxRate,
      wastagePercent: c.wastagePercent,
      existingPriceIncTax: c.priceIncTax,
    });
    return {
      ...rest,
      estimateId: newLine.estimateId,
      groupId: newLine.groupId ?? null,
      parentItemId: newLine.id,
      quantityFormula: null,
      priceIncTax,
      taxAmount,
    };
  }));
}

// ── Drift + Update (phase 4) ─────────────────────────────────────────────────
//
// The rules are shared/assemblyDrift.ts. Here: load an estimate's lines, the
// catalogue and the Library once, and report or apply. The apply route
// recomputes the plan itself — a client only says WHICH lines to update,
// never what to update them to.

export interface EstimateDrift {
  prices: PriceDrift[];
  assemblies: AssemblyDrift[];
}

async function loadDriftContext(estimate: schema.Estimate, companyId: string) {
  const items = await db
    .select()
    .from(schema.estimateItems)
    .where(eq(schema.estimateItems.estimateId, estimate.id))
    .orderBy(asc(schema.estimateItems.order));
  const assemblyIds = Array.from(new Set(items.map((i) => i.assemblyId).filter((x): x is string => !!x)));
  const assemblies = assemblyIds.length
    ? (await listAssemblies(companyId, { includeArchived: true })).filter((a) => assemblyIds.includes(a.id))
    : [];
  const linked = new Set<string>(items.map((i) => i.priceListItemId).filter((x): x is string => !!x));
  for (const a of assemblies) for (const c of a.components) if (c.priceListItemId) linked.add(c.priceListItemId);
  const catalogue = await catalogueCostsCents(Array.from(linked));
  return { items, assemblies: new Map(assemblies.map((a) => [a.id, a] as const)), catalogue };
}

function toDriftComponent(c: schema.EstimateItem) {
  return {
    id: c.id,
    name: c.name,
    assemblyComponentId: c.assemblyComponentId,
    unitType: c.unitType,
    unitCostCents: dollarsToCents(c.unitCostExTax),
    qtyMode: c.assemblyQtyMode,
    qtyFactor: c.assemblyQtyFactor,
    qtyFormula: c.assemblyQtyFormula,
    markupPercent: c.markupPercent,
    wastagePercent: c.wastagePercent,
    costCodeId: c.costCode,
    priceListItemId: c.priceListItemId,
    overridden: c.assemblyQtyOverridden,
  };
}

function planDrift(ctx: Awaited<ReturnType<typeof loadDriftContext>>): EstimateDrift {
  const prices = planPriceDrift(
    ctx.items.map((i) => ({ id: i.id, name: i.name, priceListItemId: i.priceListItemId, unitCostCents: dollarsToCents(i.unitCostExTax) })),
    ctx.catalogue,
  );
  const assemblies: AssemblyDrift[] = [];
  for (const line of ctx.items) {
    if (!line.assemblyId || line.parentItemId) continue;
    const lib = ctx.assemblies.get(line.assemblyId);
    if (!lib) continue;
    const plan = planAssemblyUpdate(
      {
        id: line.id,
        name: line.name,
        assemblyVersion: line.assemblyVersion,
        unitType: line.unitType,
        assemblyInputs: line.assemblyInputs as AssemblyInputValue[] | null,
      },
      ctx.items.filter((i) => i.parentItemId === line.id).map(toDriftComponent),
      toSource(lib),
      ctx.catalogue,
    );
    if (plan) assemblies.push(plan);
  }
  return { prices, assemblies };
}

export async function getEstimateDrift(estimate: schema.Estimate, companyId: string): Promise<EstimateDrift> {
  return planDrift(await loadDriftContext(estimate, companyId));
}

/**
 * Pull the chosen updates in. Assemblies first (their components may also be
 * in the price list), then prices for lines still out of step. Returns what
 * was done, including components kept because something else points at them.
 */
export async function applyEstimateDrift(
  estimate: schema.Estimate,
  companyId: string,
  choice: { priceItemIds: string[]; assemblyLineIds: string[] },
): Promise<{ prices: number; assemblies: number; keptReferenced: string[] }> {
  const pricing = { projectMarkupPercent: estimate.projectMarkupPercent, taxRate: estimate.taxRate };
  const keptReferenced: string[] = [];
  let assembliesDone = 0;

  // ── Assemblies ──
  if (choice.assemblyLineIds.length > 0) {
    const ctx = await loadDriftContext(estimate, companyId);
    const plans = planDrift(ctx).assemblies.filter((a) => choice.assemblyLineIds.includes(a.itemId));
    const byId = new Map(ctx.items.map((i) => [i.id, i] as const));

    // Components the Library dropped but a PO or proposal still points at stay,
    // detached from the assembly, rather than failing the delete.
    const removeIds = plans.flatMap((p) => p.components.filter((c) => c.kind === "remove").map((c) => (c as any).lineId as string));
    const referenced = new Set<string>();
    if (removeIds.length > 0) {
      const [po, prop] = await Promise.all([
        db.select({ id: schema.purchaseOrderItems.sourceEstimateItemId }).from(schema.purchaseOrderItems)
          .where(inArray(schema.purchaseOrderItems.sourceEstimateItemId, removeIds)),
        db.select({ id: schema.proposalItems.estimateItemId }).from(schema.proposalItems)
          .where(inArray(schema.proposalItems.estimateItemId, removeIds)),
      ]);
      for (const r of [...po, ...prop]) if (r.id) referenced.add(r.id);
    }

    await db.transaction(async (tx) => {
      for (const plan of plans) {
        const line = byId.get(plan.itemId)!;
        const lib = toSource(ctx.assemblies.get(plan.assemblyId)!);
        const qty = Number(line.quantity) || 0;
        const ctxQty = { quantity: qty, inputs: plan.inputs };

        await tx.update(schema.estimateItems).set({
          assemblyVersion: plan.toVersion,
          assemblyInputs: plan.inputs,
          assemblyQtyLabel: plan.qtyLabel,
          ...(plan.unitType ? { unitType: plan.unitType } : {}),
          updatedAt: new Date(),
        }).where(eq(schema.estimateItems.id, line.id));

        let order = Math.max(-1, ...ctx.items.filter((i) => i.parentItemId === line.id).map((i) => i.order ?? 0)) + 1;
        for (const change of plan.components) {
          if (change.kind === "remove") {
            if (referenced.has(change.lineId)) {
              keptReferenced.push(change.name);
              await tx.update(schema.estimateItems)
                .set({ assemblyComponentId: null, assemblyQtyMode: null, assemblyQtyFactor: null, assemblyQtyFormula: null, updatedAt: new Date() })
                .where(eq(schema.estimateItems.id, change.lineId));
            } else {
              await tx.delete(schema.estimateItems).where(eq(schema.estimateItems.id, change.lineId));
            }
            continue;
          }
          if (change.kind === "add") {
            const src = lib.components.find((c) => c.id === change.componentId)!;
            await tx.insert(schema.estimateItems).values({
              ...componentLineFields(src, lib, qty, pricing, src.priceListItemId ? ctx.catalogue.get(src.priceListItemId) : undefined, plan.inputs),
              estimateId: estimate.id,
              groupId: line.groupId,
              parentItemId: line.id,
              order: order++,
            });
            continue;
          }
          // update
          const have = byId.get(change.lineId)!;
          const n = change.next;
          const nextQty = have.assemblyQtyOverridden
            ? Number(have.quantity) || 0
            : componentQuantityOf({ mode: n.qtyMode, factor: n.qtyFactor, formula: n.qtyFormula }, ctxQty) ?? (Number(have.quantity) || 0);
          const unitCostExTax = centsToDollars(n.unitCostCents);
          const { priceIncTax, taxAmount } = resolveEstimateStoredPrice({
            unitCostExTax,
            quantity: nextQty,
            markupPercent: n.markupPercent,
            projectMarkupPercent: estimate.projectMarkupPercent,
            taxRate: estimate.taxRate,
            wastagePercent: n.wastagePercent,
            existingPriceIncTax: 0,
          });
          await tx.update(schema.estimateItems).set({
            name: n.name,
            type: n.type,
            unitType: n.unitType,
            unitCostExTax,
            unitCostIncTax: null,
            markupPercent: n.markupPercent,
            wastagePercent: n.wastagePercent,
            costCode: n.costCodeId,
            priceListItemId: n.priceListItemId,
            assemblyQtyMode: n.qtyMode,
            assemblyQtyFactor: n.qtyFactor,
            assemblyQtyFormula: n.qtyFormula,
            quantity: nextQty,
            priceIncTax,
            taxAmount,
            updatedAt: new Date(),
          }).where(eq(schema.estimateItems.id, change.lineId));
        }
        assembliesDone++;
      }
    });
    // Unchanged components still follow the (possibly new) inputs.
    for (const plan of plans) await rescaleAssemblyComponents(plan.itemId);
  }

  // ── Prices ── re-read: an assembly update may already have moved some.
  let pricesDone = 0;
  if (choice.priceItemIds.length > 0) {
    const ctx = await loadDriftContext(estimate, companyId);
    const want = new Set(choice.priceItemIds);
    const plans = planDrift(ctx).prices.filter((p) => want.has(p.itemId));
    const byId = new Map(ctx.items.map((i) => [i.id, i] as const));
    for (const p of plans) {
      const item = byId.get(p.itemId)!;
      const unitCostExTax = centsToDollars(p.afterCents);
      const { priceIncTax, taxAmount } = resolveEstimateStoredPrice({
        unitCostExTax,
        quantity: item.quantity,
        markupPercent: item.markupPercent,
        projectMarkupPercent: estimate.projectMarkupPercent,
        taxRate: estimate.taxRate,
        wastagePercent: item.wastagePercent,
        existingPriceIncTax: item.priceIncTax,
      });
      await db.update(schema.estimateItems)
        .set({ unitCostExTax, unitCostIncTax: null, priceIncTax, taxAmount, updatedAt: new Date() })
        .where(eq(schema.estimateItems.id, item.id));
      pricesDone++;
    }
  }
  return { prices: pricesDone, assemblies: assembliesDone, keptReferenced };
}

// ── Routes ───────────────────────────────────────────────────────────────────

export function registerAssemblyRoutes(
  app: Express,
  hooks: { onEstimateItemsChanged: (estimateId: string) => void },
): void {
  const company = (req: Request, res: Response): string | null => {
    const id = getSessionCompanyId(req);
    if (!id) {
      res.status(401).json({ error: "Unauthorized" });
      return null;
    }
    return id;
  };

  app.get("/api/assemblies", requireAuth, requireTeamMember, async (req, res) => {
    const companyId = company(req, res);
    if (!companyId) return;
    try {
      res.json(await listAssemblies(companyId, { includeArchived: req.query.includeArchived === "true" }));
    } catch (error: any) {
      console.error("[assemblies] list:", error);
      res.status(500).json({ error: "Failed to load assemblies" });
    }
  });

  app.get("/api/assemblies/:id", requireAuth, requireTeamMember, async (req, res) => {
    const companyId = company(req, res);
    if (!companyId) return;
    try {
      const assembly = await getAssembly(req.params.id, companyId);
      if (!assembly) return res.status(404).json({ error: "Assembly not found" });
      res.json(assembly);
    } catch (error: any) {
      console.error("[assemblies] get:", error);
      res.status(500).json({ error: "Failed to load assembly" });
    }
  });

  app.post("/api/assemblies", requireAuth, requireTeamMember, async (req, res) => {
    const companyId = company(req, res);
    if (!companyId) return;
    const parsed = assemblyInputSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid assembly" });
    }
    const input = parsed.data;
    const components = input.components ?? [];
    try {
      const bad = await checkForeignIds(
        companyId,
        [input.costCodeId, ...components.map((c) => c.costCodeId)],
        components.map((c) => c.priceListItemId),
      ) ?? checkRecipes(input.quantityLabel, input.inputs ?? [], components);
      if (bad) return res.status(400).json({ error: bad });

      const id = await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(schema.assemblies)
          .values({
            companyId,
            name: input.name,
            description: input.description ?? null,
            unitType: input.unitType,
            costCodeId: input.costCodeId ?? null,
            quantityLabel: input.quantityLabel?.trim() || null,
            inputs: input.inputs ?? [],
            createdBy: (req.user as any)?.id ?? null,
          })
          .returning({ id: schema.assemblies.id });
        // New rows only — ids on a brand-new assembly mean nothing.
        await writeComponents(tx, row.id, components.map(({ id: _id, ...c }) => c));
        return row.id;
      });
      res.status(201).json(await getAssembly(id, companyId));
    } catch (error: any) {
      console.error("[assemblies] create:", error);
      res.status(500).json({ error: "Failed to create assembly" });
    }
  });

  app.patch("/api/assemblies/:id", requireAuth, requireTeamMember, async (req, res) => {
    const companyId = company(req, res);
    if (!companyId) return;
    const parsed = assemblyInputSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid assembly" });
    }
    const input = parsed.data;
    try {
      const current = await getAssembly(req.params.id, companyId);
      if (!current) return res.status(404).json({ error: "Assembly not found" });
      const bad = await checkForeignIds(
        companyId,
        [input.costCodeId, ...(input.components ?? []).map((c) => c.costCodeId)],
        (input.components ?? []).map((c) => c.priceListItemId),
      ) ?? checkRecipes(
        input.quantityLabel !== undefined ? input.quantityLabel : current.quantityLabel,
        input.inputs ?? current.inputs ?? [],
        input.components ?? current.components.map((c) => ({ ...c, qtyMode: c.qtyMode as any })),
      );
      if (bad) return res.status(400).json({ error: bad });

      await db.transaction(async (tx) => {
        const set: Partial<typeof schema.assemblies.$inferInsert> = { updatedAt: new Date() };
        if (input.name !== undefined) set.name = input.name;
        if (input.description !== undefined) set.description = input.description ?? null;
        if (input.unitType !== undefined) set.unitType = input.unitType;
        if (input.costCodeId !== undefined) set.costCodeId = input.costCodeId ?? null;
        if (input.isArchived !== undefined) set.isArchived = input.isArchived;
        if (input.quantityLabel !== undefined) set.quantityLabel = input.quantityLabel?.trim() || null;
        if (input.inputs !== undefined) set.inputs = input.inputs;
        // Archiving is not a change to the recipe; everything else is.
        const recipeChanged = Object.keys(input).some((k) => k !== "isArchived");
        await tx
          .update(schema.assemblies)
          .set(recipeChanged ? { ...set, version: sql`${schema.assemblies.version} + 1` } : set)
          .where(and(eq(schema.assemblies.id, current.id), eq(schema.assemblies.companyId, companyId)));
        if (input.components) await writeComponents(tx, current.id, input.components);
      });
      res.json(await getAssembly(current.id, companyId));
    } catch (error: any) {
      console.error("[assemblies] update:", error);
      res.status(500).json({ error: "Failed to save assembly" });
    }
  });

  app.delete("/api/assemblies/:id", requireAuth, requireTeamMember, async (req, res) => {
    const companyId = company(req, res);
    if (!companyId) return;
    try {
      // Estimate lines built from it keep their numbers; their link is set null.
      const gone = await db
        .delete(schema.assemblies)
        .where(and(eq(schema.assemblies.id, req.params.id), eq(schema.assemblies.companyId, companyId)))
        .returning({ id: schema.assemblies.id });
      if (gone.length === 0) return res.status(404).json({ error: "Assembly not found" });
      res.status(204).end();
    } catch (error: any) {
      console.error("[assemblies] delete:", error);
      res.status(500).json({ error: "Failed to delete assembly" });
    }
  });

  /** What on this estimate has moved on since it was priced: catalogue prices and Library recipes. */
  app.get("/api/estimates/:id/drift", requireAuth, requireTeamMember, async (req, res) => {
    const companyId = company(req, res);
    if (!companyId) return;
    try {
      const estimate = await getCompanyEstimate(req.params.id, companyId);
      if (!estimate) return res.status(404).json({ error: "Estimate not found" });
      res.json(await getEstimateDrift(estimate, companyId));
    } catch (error: any) {
      console.error("[assemblies] drift:", error);
      res.status(500).json({ error: "Failed to check for updates" });
    }
  });

  /** Pull chosen updates in. Body: { priceItemIds: string[], assemblyLineIds: string[] } */
  app.post("/api/estimates/:id/drift/apply", requireAuth, requireTeamMember, async (req, res) => {
    const companyId = company(req, res);
    if (!companyId) return;
    try {
      const estimate = await getCompanyEstimate(req.params.id, companyId);
      if (!estimate) return res.status(404).json({ error: "Estimate not found" });
      if (estimate.isLocked) {
        return res.status(409).json({ error: "This estimate is locked — unlock it to update prices" });
      }
      const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
      const result = await applyEstimateDrift(estimate, companyId, {
        priceItemIds: ids(req.body?.priceItemIds),
        assemblyLineIds: ids(req.body?.assemblyLineIds),
      });
      hooks.onEstimateItemsChanged(estimate.id);
      res.json(result);
    } catch (error: any) {
      console.error("[assemblies] drift apply:", error);
      res.status(500).json({ error: "Failed to update" });
    }
  });

  /** Drop an assembly into an estimate. Body: { assemblyId, quantity?, groupId?, intoItemId? } */
  app.post("/api/estimates/:id/assemblies", requireAuth, requireTeamMember, async (req, res) => {
    const companyId = company(req, res);
    if (!companyId) return;
    try {
      const estimate = await getCompanyEstimate(req.params.id, companyId);
      if (!estimate) return res.status(404).json({ error: "Estimate not found" });
      if (estimate.isLocked) {
        return res.status(409).json({ error: "This estimate is locked — unlock it to add an assembly" });
      }
      const assemblyId = typeof req.body?.assemblyId === "string" ? req.body.assemblyId : "";
      const assembly = assemblyId ? await getAssembly(assemblyId, companyId) : null;
      if (!assembly) return res.status(404).json({ error: "Assembly not found" });

      let quantity = req.body?.quantity === undefined ? 1 : Number(req.body.quantity);
      if (!Number.isFinite(quantity) || quantity < 0) {
        return res.status(400).json({ error: "Quantity must be zero or more" });
      }
      // intoItemId: turn this existing line into the assembly line (name-cell pick).
      const intoItemId = typeof req.body?.intoItemId === "string" ? req.body.intoItemId : "";
      let into: schema.EstimateItem | undefined;
      if (intoItemId) {
        const [line] = await db
          .select()
          .from(schema.estimateItems)
          .where(and(eq(schema.estimateItems.id, intoItemId), eq(schema.estimateItems.estimateId, estimate.id)));
        if (!line) return res.status(404).json({ error: "Line not found" });
        if (line.parentItemId) {
          return res.status(400).json({ error: "A sub-item can't become an assembly — add it as its own line" });
        }
        if (line.assemblyId) return res.status(400).json({ error: "This line is already an assembly" });
        const [child] = await db
          .select({ id: schema.estimateItems.id })
          .from(schema.estimateItems)
          .where(eq(schema.estimateItems.parentItemId, line.id))
          .limit(1);
        if (child) return res.status(400).json({ error: "This line already has sub-items — add the assembly as a new line" });
        into = line;
      }
      const groupId = into
        ? into.groupId
        : typeof req.body?.groupId === "string" && req.body.groupId ? req.body.groupId : null;
      if (groupId && !into) {
        const [group] = await db
          .select({ id: schema.estimateGroups.id })
          .from(schema.estimateGroups)
          .where(and(eq(schema.estimateGroups.id, groupId), eq(schema.estimateGroups.estimateId, estimate.id)));
        if (!group) return res.status(404).json({ error: "Group not found" });
      }

      // A line that already had a quantity keeps it; a blank one starts at 1.
      if (into && req.body?.quantity === undefined && Number(into.quantity) > 0) quantity = Number(into.quantity);
      const lines = await insertAssemblyIntoEstimate(estimate, assembly, { quantity, groupId, into });
      hooks.onEstimateItemsChanged(estimate.id);
      res.status(201).json(lines);
    } catch (error: any) {
      console.error("[assemblies] insert into estimate:", error);
      res.status(500).json({ error: "Failed to add the assembly" });
    }
  });
}

/**
 * Which assembly ids in an import payload (a template being applied) are this
 * company's. Ids arrive from the client: an unknown or foreign one is dropped
 * — the line comes in as a plain line rather than pointing at someone else's
 * Library, or at an assembly deleted since the template was saved.
 */
export async function resolveImportedAssemblyRefs(
  companyId: string,
  items: Array<{ assemblyId?: unknown; assemblyComponentId?: unknown }>,
): Promise<{ assemblyIds: Set<string>; componentIds: Set<string> }> {
  const askedAssemblies = Array.from(new Set(
    items.map((i) => i?.assemblyId).filter((x): x is string => typeof x === "string" && !!x),
  ));
  const askedComponents = Array.from(new Set(
    items.map((i) => i?.assemblyComponentId).filter((x): x is string => typeof x === "string" && !!x),
  ));
  if (askedAssemblies.length === 0 && askedComponents.length === 0) {
    return { assemblyIds: new Set(), componentIds: new Set() };
  }
  const [owned, components] = await Promise.all([
    askedAssemblies.length
      ? db.select({ id: schema.assemblies.id }).from(schema.assemblies)
          .where(and(eq(schema.assemblies.companyId, companyId), inArray(schema.assemblies.id, askedAssemblies)))
      : Promise.resolve([] as { id: string }[]),
    askedComponents.length
      ? db.select({ id: schema.assemblyComponents.id }).from(schema.assemblyComponents)
          .innerJoin(schema.assemblies, eq(schema.assemblies.id, schema.assemblyComponents.assemblyId))
          .where(and(eq(schema.assemblies.companyId, companyId), inArray(schema.assemblyComponents.id, askedComponents)))
      : Promise.resolve([] as { id: string }[]),
  ]);
  return { assemblyIds: new Set(owned.map((r) => r.id)), componentIds: new Set(components.map((r) => r.id)) };
}
