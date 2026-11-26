// Server side of shared/allowanceUsage.ts: find where allowances are used, and
// refuse edits to locked ones. Every lookup is batched — one query per source
// table regardless of how many allowances are asked about (~400ms per Neon
// round trip, so never query in a loop).

import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import { db } from "../db";
import * as schema from "@shared/schema";
import {
  allowanceAdjustmentDescription,
  describeAllowanceUse,
  isPermanentInvoiceUse,
  isPermanentVariationUse,
  isReleasingInvoiceStatus,
  isReleasingVariationStatus,
  type AllowanceUse,
} from "@shared/allowanceUsage";

export interface AllowanceRef {
  id: string;
  name: string | null;
  projectId: string;
}

/**
 * Every live use of each allowance, keyed by estimate item id. Rejected
 * variations and rejected/cancelled invoices are left out — they no longer
 * hold the allowance.
 *
 * `excludeVariationId` drops one variation from the result, so the variation
 * editor can ask "is this allowance used anywhere ELSE?".
 */
export async function getAllowanceUsage(
  refs: AllowanceRef[],
  opts: { excludeVariationId?: string } = {},
): Promise<Map<string, AllowanceUse[]>> {
  const out = new Map<string, AllowanceUse[]>();
  if (refs.length === 0) return out;
  const ids = refs.map((r) => r.id);
  const push = (itemId: string, use: AllowanceUse) => {
    const list = out.get(itemId) ?? [];
    if (!list.some((u) => u.kind === use.kind && u.id === use.id)) list.push(use);
    out.set(itemId, list);
  };

  const variationUse = (v: { id: string; variationNumber: string | null; status: string }): AllowanceUse => ({
    kind: "variation",
    id: v.id,
    number: v.variationNumber,
    status: v.status,
    permanent: isPermanentVariationUse(v.status),
  });

  // 1. Variation lines linked to their allowance (written since 0143).
  const linked = await db
    .select({
      itemId: schema.variationItems.sourceEstimateItemId,
      id: schema.variations.id,
      variationNumber: schema.variations.variationNumber,
      status: schema.variations.status,
    })
    .from(schema.variationItems)
    .innerJoin(schema.variations, eq(schema.variations.id, schema.variationItems.variationId))
    .where(
      and(
        eq(schema.variationItems.itemType, "allowance"),
        inArray(schema.variationItems.sourceEstimateItemId, ids),
      ),
    );
  for (const r of linked) {
    if (!r.itemId || isReleasingVariationStatus(r.status)) continue;
    if (r.id === opts.excludeVariationId) continue;
    push(r.itemId, variationUse(r));
  }

  // 2. Older allowance lines carry no link — recognise them by the
  //    description the picker always wrote, within the same project.
  const byDescription = new Map<string, string[]>(); // `${projectId}|${desc}` -> item ids
  for (const r of refs) {
    if (!r.name) continue;
    const key = `${r.projectId}|${allowanceAdjustmentDescription(r.name)}`;
    byDescription.set(key, [...(byDescription.get(key) ?? []), r.id]);
  }
  const projectIds = Array.from(new Set(refs.map((r) => r.projectId)));
  const descriptions = Array.from(
    new Set(refs.filter((r) => r.name).map((r) => allowanceAdjustmentDescription(r.name!))),
  );
  if (descriptions.length > 0) {
    const legacy = await db
      .select({
        description: schema.variationItems.description,
        projectId: schema.variations.projectId,
        id: schema.variations.id,
        variationNumber: schema.variations.variationNumber,
        status: schema.variations.status,
      })
      .from(schema.variationItems)
      .innerJoin(schema.variations, eq(schema.variations.id, schema.variationItems.variationId))
      .where(
        and(
          eq(schema.variationItems.itemType, "allowance"),
          isNull(schema.variationItems.sourceEstimateItemId),
          inArray(schema.variations.projectId, projectIds),
          inArray(schema.variationItems.description, descriptions),
          ne(schema.variations.status, "rejected"),
        ),
      );
    for (const r of legacy) {
      if (r.id === opts.excludeVariationId) continue;
      for (const itemId of byDescription.get(`${r.projectId}|${r.description}`) ?? []) {
        push(itemId, variationUse(r));
      }
    }
  }

  // 3. Client invoice claims.
  const claims = await db
    .select({
      itemId: schema.invoiceAllowances.estimateItemId,
      id: schema.clientInvoices.id,
      invoiceNumber: schema.clientInvoices.invoiceNumber,
      status: schema.clientInvoices.status,
    })
    .from(schema.invoiceAllowances)
    .innerJoin(schema.clientInvoices, eq(schema.clientInvoices.id, schema.invoiceAllowances.invoiceId))
    .where(inArray(schema.invoiceAllowances.estimateItemId, ids));
  for (const r of claims) {
    if (isReleasingInvoiceStatus(r.status)) continue;
    push(r.itemId, {
      kind: "invoice",
      id: r.id,
      number: r.invoiceNumber,
      status: r.status,
      permanent: isPermanentInvoiceUse(r.status),
    });
  }

  return out;
}

/** Resolve estimate item ids to the refs getAllowanceUsage needs. Non-allowance
 *  lines are dropped. */
export async function allowanceRefsFor(estimateItemIds: string[]): Promise<
  Array<AllowanceRef & { allowanceStatus: string | null }>
> {
  const ids = Array.from(new Set(estimateItemIds.filter(Boolean)));
  if (ids.length === 0) return [];
  const rows = await db
    .select({
      id: schema.estimateItems.id,
      name: schema.estimateItems.name,
      allowance: schema.estimateItems.allowance,
      allowanceStatus: schema.estimateItems.allowanceStatus,
      projectId: schema.estimates.projectId,
    })
    .from(schema.estimateItems)
    .innerJoin(schema.estimates, eq(schema.estimates.id, schema.estimateItems.estimateId))
    .where(inArray(schema.estimateItems.id, ids));
  return rows
    .filter((r) => r.allowance === "Prime Cost" || r.allowance === "Provisional Sum")
    .map((r) => ({ id: r.id, name: r.name, projectId: r.projectId!, allowanceStatus: r.allowanceStatus }));
}

export class AllowanceLockedError extends Error {
  status = 409;
  constructor(message: string, public uses: AllowanceUse[]) {
    super(message);
  }
}

/**
 * Throw AllowanceLockedError if this allowance is on a live variation or
 * invoice. Call before any write that changes an allowance's cost or status.
 * A no-op for ids that aren't allowances.
 */
export async function assertAllowanceEditable(estimateItemId: string | null | undefined): Promise<void> {
  if (!estimateItemId) return;
  const refs = await allowanceRefsFor([estimateItemId]);
  if (refs.length === 0) return;
  const uses = (await getAllowanceUsage(refs)).get(estimateItemId) ?? [];
  if (uses.length === 0) return;
  const list = (us: AllowanceUse[]) => us.map(describeAllowanceUse).join(", ");
  const permanent = uses.filter((u) => u.permanent);
  throw new AllowanceLockedError(
    permanent.length > 0
      ? `This allowance is on ${list(permanent)}, which has been approved or issued, so it can no longer be changed.`
      : `This allowance is on ${list(uses)}. Remove it from there before changing it.`,
    uses,
  );
}

/**
 * The allowance was just changed and is not locked: if it was finalised, put
 * it back to open so someone re-checks it. Returns true when it reopened.
 */
export async function reopenIfFinalised(estimateItemId: string | null | undefined): Promise<boolean> {
  if (!estimateItemId) return false;
  const res = await db
    .update(schema.estimateItems)
    .set({ allowanceStatus: "in_progress" })
    .where(
      and(
        eq(schema.estimateItems.id, estimateItemId),
        inArray(schema.estimateItems.allowanceStatus, ["finalized", "finalised"]),
      ),
    )
    .returning({ id: schema.estimateItems.id });
  return res.length > 0;
}

/**
 * Route helper: answer 409 and return false when the allowance is locked.
 * The body carries `code: "ALLOWANCE_LOCKED"` and the uses so the client can
 * say where it is.
 */
export async function guardAllowanceEdit(
  res: { status: (code: number) => { json: (body: unknown) => unknown } },
  estimateItemId: string | null | undefined,
): Promise<boolean> {
  try {
    await assertAllowanceEditable(estimateItemId);
    return true;
  } catch (e) {
    if (e instanceof AllowanceLockedError) {
      res.status(409).json({ error: e.message, code: "ALLOWANCE_LOCKED", usedOn: e.uses });
      return false;
    }
    throw e;
  }
}
