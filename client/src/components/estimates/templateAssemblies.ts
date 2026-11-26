/**
 * Assemblies inside an estimate TEMPLATE (phase 2).
 *
 * A template has no server and no estimate_items rows: its lines are one JSON
 * blob, money in CENTS. So the rules the estimate keeps server-side
 * (server/assemblies.ts) are kept here, client-side, in template terms:
 *
 *  - The assembly line carries no money of its own: unitPrice 0, no
 *    price-list link. Its components are lines with `parentItemId` pointing at
 *    it, hidden from the proposal, in the same group.
 *  - Changing the assembly line's quantity rescales every component that
 *    follows it; a component quantity typed by hand is OVERRIDDEN and stops.
 *  - Applying the template sends components as sub-item rows right after
 *    their assembly line, carrying the link, so the estimate gets a real
 *    assembly — not a $0 line with loose lines under it.
 *
 * The quantity and line rules themselves are the shared ones
 * (shared/assemblies.ts), so a template and an estimate cannot disagree about
 * what 0.105 m³ per m² at 120 m² comes to.
 */
import { componentQuantity, planAssemblyRescale } from "@shared/assemblies";
import { exGstFromInc } from "@shared/money";
import type { AssemblyWithComponents, CostCode } from "@shared/schema";

/** The assembly fields a template line can carry. All JSON — no migration. */
export interface TemplateAssemblyFields {
  /** On a component: the template line id of its assembly line. */
  parentItemId?: string | null;
  /** On the assembly line. */
  assemblyId?: string | null;
  assemblyVersion?: number | null;
  /** On a component. */
  assemblyComponentId?: string | null;
  assemblyQtyMode?: string | null;
  assemblyQtyFactor?: number | null;
  assemblyQtyOverridden?: boolean | null;
}

/** The minimum a template line needs for these rules. */
export interface TemplateLineLike extends TemplateAssemblyFields {
  id: string;
  name: string;
  isGroup: boolean;
  groupName?: string;
  quantity?: number;
  quantityFormula?: string | null;
  sortOrder: number;
}

/** A catalogue row's current ex-GST cost in cents, as the price list stores it. */
export function catalogueExGstCents(row: { costPrice: number; gstInclusive?: boolean | null }): number {
  return row.gstInclusive ? exGstFromInc(row.costPrice) : row.costPrice;
}

const costCodeTitle = (costCodes: CostCode[], id: string | null | undefined): string | undefined => {
  if (!id) return undefined;
  const cc = costCodes.find((c) => c.id === id);
  return cc ? `${cc.code} - ${cc.title}` : undefined;
};

/**
 * Turn `line` into `assembly`'s line and build its components under it.
 *
 * Returns the patch for the line and the new component lines (fresh ids,
 * `sortOrder` from `nextSortOrder` on). A quantity already on the line is
 * kept; a blank line starts at 1. A take-off formula on the line is kept too —
 * it drives the assembly once the template is applied to a measured job.
 *
 * `catalogueCents` is the price list's CURRENT ex-GST cost for linked
 * components. A component keeps its price-list link only while its cost still
 * equals that — the same invariant the estimate keeps (componentLineFields).
 */
export function buildTemplateAssembly<T extends TemplateLineLike>(
  line: T,
  assembly: AssemblyWithComponents,
  opts: { costCodes: CostCode[]; catalogueCents: Map<string, number>; nextSortOrder: number },
): { linePatch: Record<string, any>; components: Array<Record<string, any>> } {
  const quantity = Number(line.quantity) > 0 ? Number(line.quantity) : 1;
  const linePatch = {
    name: assembly.name,
    description: assembly.description || undefined,
    unit: assembly.unitType,
    quantity,
    // No money of its own — every dollar lives on the components.
    unitPrice: 0,
    markup: 0,
    wastagePercent: 0,
    priceListItemId: null,
    ...(assembly.costCodeId
      ? { costCodeId: assembly.costCodeId, costCodeTitle: costCodeTitle(opts.costCodes, assembly.costCodeId) }
      : {}),
    assemblyId: assembly.id,
    assemblyVersion: assembly.version,
    parentItemId: null,
    proposalVisible: true,
  };

  const components = assembly.components.map((c, i) => {
    const catalogue = c.priceListItemId ? opts.catalogueCents.get(c.priceListItemId) : undefined;
    const keepsLink = !!c.priceListItemId && catalogue !== undefined && catalogue === c.unitCostCents;
    const costCodeId = c.costCodeId ?? assembly.costCodeId ?? undefined;
    return {
      id: crypto.randomUUID(),
      groupName: line.groupName,
      name: c.name,
      type: c.type || "Material",
      unit: c.unitType,
      quantity: componentQuantity(c.qtyMode, c.qtyFactor, quantity),
      unitPrice: c.unitCostCents, // both CENTS ex GST — no conversion
      markup: c.markupPercent ?? 0,
      wastagePercent: c.wastagePercent ?? 0,
      allowance: "None",
      costCodeId: costCodeId || undefined,
      costCodeTitle: costCodeTitle(opts.costCodes, costCodeId),
      priceListItemId: keepsLink ? c.priceListItemId : null,
      parentItemId: line.id,
      assemblyComponentId: c.id,
      assemblyQtyMode: c.qtyMode === "fixed" ? "fixed" : "per_unit",
      assemblyQtyFactor: c.qtyFactor,
      assemblyQtyOverridden: false,
      // The client sees the assembly line, not its recipe.
      proposalVisible: false,
      shownAs: "price",
      sortOrder: opts.nextSortOrder + i,
      isGroup: false,
    };
  });

  return { linePatch, components };
}

/**
 * Bring `lineId`'s components into step with its quantity. Overridden ones
 * are left alone. Returns the same array when nothing moved.
 */
export function rescaleTemplateAssembly<T extends TemplateLineLike>(items: T[], lineId: string): T[] {
  const line = items.find((i) => i.id === lineId);
  if (!line?.assemblyId) return items;
  const children = items.filter((i) => i.parentItemId === lineId);
  const plan = planAssemblyRescale(Number(line.quantity) || 0, children.map((c) => ({
    id: c.id,
    parentItemId: c.parentItemId,
    assemblyQtyMode: c.assemblyQtyMode,
    assemblyQtyFactor: c.assemblyQtyFactor,
    assemblyQtyOverridden: c.assemblyQtyOverridden,
    quantity: c.quantity,
  })));
  if (plan.length === 0) return items;
  const next = new Map(plan.map((p) => [p.id, p.quantity] as const));
  return items.map((i) => (next.has(i.id) ? { ...i, quantity: next.get(i.id)!, quantityFormula: null } : i));
}

/**
 * The fix-ups every template write ends with, so no edit path has to remember
 * them: a component whose assembly line is gone goes with it, and a component
 * always sits in its assembly line's group (moving or bulk-regrouping the line
 * takes its components along). Returns the same array when nothing changed.
 */
export function normaliseTemplateSubLines<T extends TemplateLineLike>(items: T[]): T[] {
  if (!items.some((i) => i.parentItemId)) return items;
  const byId = new Map(items.map((i) => [i.id, i] as const));
  let changed = false;
  const out: T[] = [];
  for (const i of items) {
    if (!i.parentItemId) { out.push(i); continue; }
    const parent = byId.get(i.parentItemId);
    if (!parent || parent.isGroup) { changed = true; continue; }
    if ((parent.groupName || undefined) !== (i.groupName || undefined)) {
      changed = true;
      out.push({ ...i, groupName: parent.groupName });
    } else {
      out.push(i);
    }
  }
  return changed ? out : items;
}

/**
 * Lines in apply/export order with every sub-line moved to straight after its
 * parent (and its siblings), which is how the import route and the sheet
 * attach a sub-item: to the nearest row above that is not one. `lineOf`
 * reaches the template line inside whatever the caller is ordering.
 */
export function nestSubLines<W>(
  ordered: W[],
  lineOf: (w: W) => { id: string; parentItemId?: string | null },
): W[] {
  const ids = new Set(ordered.map((w) => lineOf(w).id));
  const isChild = (w: W) => {
    const p = lineOf(w).parentItemId;
    return !!p && ids.has(p);
  };
  const childrenOf = new Map<string, W[]>();
  for (const w of ordered) {
    if (isChild(w)) {
      const p = lineOf(w).parentItemId!;
      childrenOf.set(p, [...(childrenOf.get(p) ?? []), w]);
    }
  }
  if (childrenOf.size === 0) return ordered;
  const out: W[] = [];
  for (const w of ordered) {
    if (isChild(w)) continue;
    out.push(w, ...(childrenOf.get(lineOf(w).id) ?? []));
  }
  return out;
}
