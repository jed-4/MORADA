/**
 * Server-side visibility rules for Selections.
 *
 * `projects.selections:view` used to be all-or-nothing: anyone in the company
 * with a session got every option, every cost, every markup and every
 * allowance — including trades, and including logged-in CLIENTS, who were
 * being handed the builder's margin.
 *
 * Two view-only permission keys narrow it (seeded in storage.ts):
 *
 *   projects.selections.pending — see selections that aren't approved yet,
 *                                 and the options still being considered
 *   projects.selections.pricing — see costs, markups and allowances
 *
 * A role with neither gets the on-site spec view: approved selections only,
 * showing only the approved option, with no money anywhere. That is what a
 * carpenter or trade should see standing in the room.
 *
 * This runs on the SERVER for a reason. Hiding fields in the client would
 * leave the payload intact for anyone who opens the network tab, and would
 * have to be reimplemented in both web and mobile.
 */

import { and, eq, inArray } from "drizzle-orm";
import * as schema from "@shared/schema";
import { exGstFromInc, incGstFromEx } from "@shared/money";

// `./db` and `./middleware/auth` are imported lazily inside
// computeSelectionViewer. Both open a database pool at module load, and the
// redaction functions below are pure — keeping them import-free is what lets
// them be unit-tested without a database.

export const SELECTIONS_PENDING_KEY = "projects.selections.pending";
export const SELECTIONS_PRICING_KEY = "projects.selections.pricing";

export interface SelectionViewer {
  /** Client-portal user — sees pending (that's the point) but never raw costs. */
  isClient: boolean;
  canSeePending: boolean;
  canSeePricing: boolean;
}

const FULL_ACCESS: SelectionViewer = { isClient: false, canSeePending: true, canSeePricing: true };
const SPEC_ONLY: SelectionViewer = { isClient: false, canSeePending: false, canSeePricing: false };

/** Cost fields on an option that only a pricing-permitted viewer may see. */
const OPTION_MONEY_FIELDS = ["unitCost", "unitTax", "markupPercent", "totalCost", "gstInclusive"] as const;

/**
 * Resolve what the caller is allowed to see. Cached on the request — a single
 * route can redact several payloads without re-querying, which matters against
 * a ~400ms-RTT database.
 */
export async function resolveSelectionViewer(req: any): Promise<SelectionViewer> {
  if (req._selectionViewer) return req._selectionViewer as SelectionViewer;
  const viewer = await computeSelectionViewer(req);
  req._selectionViewer = viewer;
  return viewer;
}

async function computeSelectionViewer(req: any): Promise<SelectionViewer> {
  // The dev auth block injects a lighter user object whose `id` may be a
  // replitId; the real row hangs off `dbUser`. Production sets the full user.
  const user = req?.user?.dbUser ?? req?.user;
  if (!user) return SPEC_ONLY;

  if (user.userCategory === "client") {
    // A client must see unapproved selections — choosing is the whole point —
    // but never the builder's cost base. Per-selection `clientCanSeePrice`
    // decides whether they get a price at all; see redactForClient().
    return { isClient: true, canSeePending: true, canSeePricing: false };
  }

  if (!user.roleId) return SPEC_ONLY;

  try {
    const [{ db }, { isAdminRole }] = await Promise.all([
      import("./db"),
      import("./middleware/auth"),
    ]);

    // One round trip: the role row, plus whichever of the two keys it holds.
    // The permissions join is a filtered cross join, so this returns exactly
    // one row per key with a null rolePermission when the key isn't granted.
    const rows = await db
      .select({
        roleName: schema.userRoles.name,
        roleIsBuiltIn: schema.userRoles.isBuiltIn,
        permissionKey: schema.permissions.key,
        allowedActions: schema.rolePermissions.allowedActions,
      })
      .from(schema.userRoles)
      .leftJoin(
        schema.permissions,
        inArray(schema.permissions.key, [SELECTIONS_PENDING_KEY, SELECTIONS_PRICING_KEY]),
      )
      .leftJoin(
        schema.rolePermissions,
        and(
          eq(schema.rolePermissions.roleId, schema.userRoles.id),
          eq(schema.rolePermissions.permissionId, schema.permissions.id),
        ),
      )
      .where(eq(schema.userRoles.id, user.roleId));

    if (rows.length === 0) return SPEC_ONLY;

    // Admin / Owner / General Manager bypass every permission check, exactly as
    // requirePermission and checkUserPermission already do.
    if (isAdminRole({ name: rows[0].roleName, isBuiltIn: rows[0].roleIsBuiltIn })) {
      return FULL_ACCESS;
    }

    const grants = (key: string) =>
      rows.some((r) => {
        if (r.permissionKey !== key) return false;
        const actions = Array.isArray(r.allowedActions) ? (r.allowedActions as string[]) : [];
        return actions.includes("view");
      });

    return {
      isClient: false,
      canSeePending: grants(SELECTIONS_PENDING_KEY),
      canSeePricing: grants(SELECTIONS_PRICING_KEY),
    };
  } catch (error) {
    // Fail closed: an error resolving permissions must never widen access.
    console.error("[selectionVisibility] failed to resolve viewer:", error);
    return SPEC_ONLY;
  }
}

/**
 * True once a selection has been signed off. The gate is deliberately
 * `approvedAt` on an option, not "the client chose" — a pick the builder
 * hasn't approved is not yet something to order against. `ordered`/`received`
 * are included because those states can predate the approval writer.
 */
function isApproved(selection: any): boolean {
  const status = String(selection?.status ?? "");
  if (status === "ordered" || status === "received") return true;
  const options = Array.isArray(selection?.options) ? selection.options : [];
  if (options.some((o: any) => o?.approvedAt)) return true;
  // A selection fetched without its options (GET /api/selections) can only be
  // judged by its stored status.
  return options.length === 0 && (status === "approved" || status === "completed");
}

/** The option(s) a spec-only viewer is allowed to see: the approved one. */
function approvedOptionsOnly(options: any[]): any[] {
  const approved = options.filter((o) => o?.approvedAt);
  if (approved.length > 0) return approved;
  // Ordered/received selections whose approval predates the writer still have
  // exactly one real answer: the option the client landed on.
  const chosen = options.filter((o) => o?.isSelectedByClient);
  return chosen.length > 0 ? chosen : [];
}

function stripOptionMoney(option: any): any {
  const copy = { ...option };
  for (const field of OPTION_MONEY_FIELDS) delete copy[field];
  return copy;
}

/**
 * The price a client may be shown: cost × qty × markup, inc GST — the same
 * figure the selection portal quotes. Never the raw cost or the markup itself.
 */
function clientPriceCents(option: any): number | null {
  const rawUnit = option?.unitCost;
  if (rawUnit == null) return null;
  const qty = Number(option.quantity) || 1;
  const markup = Number(option.markupPercent) || 0;
  const unitEx = option.gstInclusive ? exGstFromInc(rawUnit) : rawUnit;
  const totalEx = Math.round(unitEx * qty * (1 + markup / 100));
  return incGstFromEx(totalEx);
}

function redactForClient(selection: any): any {
  const showPrice = selection?.clientCanSeePrice === true;
  const options = Array.isArray(selection?.options) ? selection.options : null;
  const out: any = { ...selection };

  delete out.portalToken;
  if (!showPrice) delete out.allowance;
  if (options) {
    out.options = options.map((option: any) => {
      const price = showPrice ? clientPriceCents(option) : null;
      const stripped = stripOptionMoney(option);
      if (price !== null) stripped.totalCost = price;
      return stripped;
    });
  }
  return out;
}

/**
 * Apply the caller's visibility to a list of selections. Safe to call with
 * rows that carry `options` (with-options routes) or without (bare list).
 */
export function applySelectionVisibility<T extends Record<string, any>>(
  selections: T[],
  viewer: SelectionViewer,
): any[] {
  if (!Array.isArray(selections)) return selections;
  return selections
    .map((selection) => applySelectionVisibilityToOne(selection, viewer))
    .filter(Boolean);
}

/** Single-selection form, for GET /api/selections/:id. */
export function applySelectionVisibilityToOne<T extends Record<string, any>>(
  selection: T,
  viewer: SelectionViewer,
): any {
  if (!selection) return selection;

  if (viewer.isClient) return redactForClient(selection);
  if (viewer.canSeePending && viewer.canSeePricing) return selection;

  let out: any = { ...selection };

  // The portal token is a shareable client-facing link. Anyone narrowed to the
  // spec view has no reason to hold one, so it never rides along.
  delete out.portalToken;

  if (!viewer.canSeePending) {
    if (!isApproved(selection)) {
      // Reduced to the fact that a decision is outstanding. Enough for a trade
      // to know not to order; not enough to see what's being weighed up, or a
      // client's pick the builder hasn't signed off.
      return {
        id: out.id,
        projectId: out.projectId,
        name: out.name,
        category: out.category,
        room: out.room,
        sortOrder: out.sortOrder,
        selectionType: out.selectionType,
        status: "awaiting_approval",
        restricted: true,
        options: [],
      };
    }
    if (Array.isArray(out.options)) {
      out.options = approvedOptionsOnly(out.options);
    }
  }

  if (!viewer.canSeePricing) {
    delete out.allowance;
    if (Array.isArray(out.options)) {
      out.options = out.options.map(stripOptionMoney);
    }
  }

  return out;
}

/** Options-only form, for GET /api/selections/:selectionId/options. */
export function applyOptionVisibility(
  options: any[],
  parentSelection: any,
  viewer: SelectionViewer,
): any[] {
  if (!Array.isArray(options)) return options;

  if (viewer.isClient) {
    const showPrice = parentSelection?.clientCanSeePrice === true;
    return options.map((option) => {
      const price = showPrice ? clientPriceCents(option) : null;
      const stripped = stripOptionMoney(option);
      if (price !== null) stripped.totalCost = price;
      return stripped;
    });
  }

  let out = options;
  if (!viewer.canSeePending) {
    const approved = isApproved({ ...parentSelection, options });
    out = approved ? approvedOptionsOnly(options) : [];
  }
  if (!viewer.canSeePricing) {
    out = out.map(stripOptionMoney);
  }
  return out;
}
