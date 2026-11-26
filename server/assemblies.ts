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
  componentLineFields,
  componentQuantity,
  planAssemblyRescale,
  type AssemblySource,
} from "@shared/assemblies";
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
    qtyMode: c.qtyMode === "fixed" ? "fixed" : "per_unit",
    qtyFactor: c.qtyFactor ?? 1,
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
    components: a.components.map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type,
      priceListItemId: c.priceListItemId,
      unitType: c.unitType,
      unitCostCents: c.unitCostCents,
      qtyMode: c.qtyMode,
      qtyFactor: c.qtyFactor,
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
        ...componentLineFields(c, source, opts.quantity, pricing, c.priceListItemId ? catalogue.get(c.priceListItemId) : undefined),
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
  const plan = planAssemblyRescale(Number(parent.quantity) || 0, children);
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
): Promise<string | null> {
  // Provenance is the server's to set, never a client's.
  delete updateData.assemblyId;
  delete updateData.assemblyVersion;
  delete updateData.assemblyComponentId;
  delete updateData.assemblyQtyMode;
  delete updateData.assemblyQtyFactor;

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
    updateData.quantity = componentQuantity(existing.assemblyQtyMode, existing.assemblyQtyFactor, parent?.quantity ?? 0);
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
  before: Pick<schema.EstimateItem, "id" | "assemblyId" | "quantity" | "groupId">,
  after: Pick<schema.EstimateItem, "quantity" | "groupId"> | null | undefined,
): Promise<void> {
  if (!before.assemblyId || !after) return;
  if ((after.groupId ?? null) !== (before.groupId ?? null)) {
    await db
      .update(schema.estimateItems)
      .set({ groupId: after.groupId ?? null, updatedAt: new Date() })
      .where(eq(schema.estimateItems.parentItemId, before.id));
  }
  if (Math.abs(Number(after.quantity ?? 0) - Number(before.quantity ?? 0)) > 1e-9) {
    await rescaleAssemblyComponents(before.id);
  }
}

/**
 * Copy an assembly line's components under a copy of that line — duplicate in
 * place, or copy to another estimate. The line-copy paths in storage.ts copy
 * ONE row, which for an assembly line is a heading with no money under it.
 * Components are repriced against the target estimate, as the line copy is.
 */
export async function copyAssemblyComponents(
  sourceLineId: string,
  newLine: Pick<schema.EstimateItem, "id" | "estimateId" | "groupId" | "assemblyId">,
): Promise<void> {
  if (!newLine.assemblyId) return;
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
      );
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
      );
      if (bad) return res.status(400).json({ error: bad });

      await db.transaction(async (tx) => {
        const set: Partial<typeof schema.assemblies.$inferInsert> = { updatedAt: new Date() };
        if (input.name !== undefined) set.name = input.name;
        if (input.description !== undefined) set.description = input.description ?? null;
        if (input.unitType !== undefined) set.unitType = input.unitType;
        if (input.costCodeId !== undefined) set.costCodeId = input.costCodeId ?? null;
        if (input.isArchived !== undefined) set.isArchived = input.isArchived;
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
