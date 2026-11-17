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
import { optionClientPriceCents } from "@shared/selectionPricing";

// `./db` and `./middleware/auth` are imported lazily inside
// computeSelectionViewer. Both open a database pool at module load, and the
// redaction functions below are pure — keeping them import-free is what lets
// them be unit-tested without a database.

export const SELECTIONS_PENDING_KEY = "projects.selections.pending";
export const SELECTIONS_PRICING_KEY = "projects.selections.pricing";
export const CLIENT_SELECTIONS_PRICING_KEY = "portal.selections.pricing";

export interface SelectionViewer {
  /** Client-portal user — sees pending (that's the point) but never raw costs. */
  isClient: boolean;
  canSeePending: boolean;
  /**
   * Team: see costs, markups and allowances.
   * Client: may be shown the client PRICE (portal.selections.pricing) — still
   * only on selections set to show price, and never the cost base.
   */
  canSeePricing: boolean;
}

const FULL_ACCESS: SelectionViewer = { isClient: false, canSeePending: true, canSeePricing: true };
const SPEC_ONLY: SelectionViewer = { isClient: false, canSeePending: false, canSeePricing: false };

/**
 * Money fields on an option that only a pricing-permitted TEAM viewer may see.
 * `unitCharge` is the client's price, but it sits here too: beside a markup it
 * gives the cost away, and a trade without pricing access gets no money at all.
 *
 * 🚨 Adding a column to selection_options? It must be listed here or in
 * OPTION_NON_MONEY_FIELDS — selection-visibility.test.ts fails otherwise.
 */
export const OPTION_MONEY_FIELDS = ["unitCost", "unitTax", "markupPercent", "unitCharge", "totalCost", "gstInclusive"] as const;

/** Every other selection_options column: safe for a team member without pricing access. */
export const OPTION_NON_MONEY_FIELDS = [
  "id", "selectionId", "name", "description", "sku", "brand", "category", "subcategory",
  "quantity", "unitType", "url", "visibleToClient", "isSelectedByClient", "sortOrder",
  "approvedAt", "approvedById", "approvedBy", "lockedAt", "productId", "specifications",
  "notes", "clientSuggested", "suggestedBy", "createdAt", "updatedAt",
] as const;

/**
 * The ONLY option fields a client is ever sent — an allow-list, so a column
 * added later stays private until someone deliberately lists it here. No cost,
 * no markup, no internal notes. A price, when the client may see one, is
 * written into `totalCost` by clientOptionView().
 */
export const CLIENT_OPTION_FIELDS = [
  "id", "selectionId", "name", "description", "sku", "brand", "category", "subcategory",
  "quantity", "unitType", "url", "visibleToClient", "isSelectedByClient", "sortOrder",
  "approvedAt", "approvedBy", "lockedAt", "specifications", "clientSuggested", "suggestedBy",
  "createdAt", "updatedAt", "attachments",
] as const;

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
    // but never the builder's cost base. Whether they get a PRICE needs both
    // their role (portal.selections.pricing) and the selection's own
    // `clientCanSeePrice`; see redactForClient().
    try {
      const { storage } = await import("./storage");
      const pricing = await storage.checkUserPermission(user.id, CLIENT_SELECTIONS_PRICING_KEY, "view");
      return { isClient: true, canSeePending: true, canSeePricing: pricing };
    } catch (error) {
      console.error("[selectionVisibility] failed to resolve client pricing:", error);
      return { isClient: true, canSeePending: true, canSeePricing: false };
    }
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
 * The option as a client sees it. `totalCost` carries the client's price for
 * the line (what they pay, inc GST) when they may see one, and is otherwise
 * absent. Never the cost, the markup or the per-unit charge.
 */
function clientOptionView(option: any, showPrice: boolean): any {
  const out: any = {};
  for (const field of CLIENT_OPTION_FIELDS) {
    if (option[field] !== undefined) out[field] = option[field];
  }
  const price = showPrice ? optionClientPriceCents(option) : null;
  if (price !== null) out.totalCost = price;
  return out;
}

/** Options the builder has hidden from the client never reach them. */
const clientVisibleOptions = (options: any[]) => options.filter((o) => o?.visibleToClient !== false);

/** Trades/builder notes live on both the selection and each option. */
const stripNotes = <T extends Record<string, any>>(row: T): T => {
  const copy = { ...row };
  delete (copy as any).notes;
  return copy;
};

function redactForClient(selection: any, rolePricing: boolean): any {
  const showPrice = rolePricing && selection?.clientCanSeePrice === true;
  const options = Array.isArray(selection?.options) ? clientVisibleOptions(selection.options) : null;
  const out: any = stripNotes(selection);

  delete out.portalToken;
  if (!showPrice) delete out.allowance;
  if (options) {
    out.options = options.map((option: any) => clientOptionView(option, showPrice));
  }
  return out;
}

/**
 * A single option row as `viewer` may see it — for write responses (create,
 * update), which otherwise hand the saved row, cost and all, straight back.
 * A client gets no price here; they read prices from the GET routes.
 */
export function redactOptionForViewer(option: any, viewer: SelectionViewer): any {
  if (!option) return option;
  if (viewer.isClient) return clientOptionView(option, false);
  return viewer.canSeePricing ? option : stripOptionMoney(option);
}

/**
 * The decision log ("Jane chose “X” ($1,250.00 inc GST)") is written once, as
 * text, when the choice is made — but read later by people with different
 * rights, and a selection's "show prices" setting can be switched off after
 * the fact. So the price is taken out on READ for anyone who may not see it.
 * Only the system's "Decision log" entries are touched; a person's own comment
 * is left exactly as they wrote it.
 */
const DECISION_LOG_PRICE = / \(\$[\d,]+(?:\.\d{1,2})? inc GST\)/g;

export function redactDecisionLogPrices<T extends { createdByName?: string | null; content?: string | null }>(
  comments: T[],
  showPrice: boolean,
): T[] {
  if (showPrice || !Array.isArray(comments)) return comments;
  return comments.map((c) =>
    c?.createdByName === "Decision log" && typeof c.content === "string"
      ? { ...c, content: c.content.replace(DECISION_LOG_PRICE, "") }
      : c,
  );
}

/**
 * Money a caller may WRITE. A team role without selections pricing can't see
 * cost, markup or charge, so it must not set them either — and its forms,
 * which never received the figures, would otherwise save them back as blanks
 * and wipe the real ones. Clients never reach these routes.
 */
export function stripOptionMoneyForWrite<T extends Record<string, any>>(data: T, viewer: SelectionViewer): T {
  if (viewer.canSeePricing && !viewer.isClient) return data;
  const copy: any = { ...data };
  for (const field of OPTION_MONEY_FIELDS) delete copy[field];
  return copy;
}

/** Product Library money: cost, markup and charge are for pricing-permitted team only. */
export const PRODUCT_MONEY_FIELDS = ["defaultUnitCost", "defaultMarkupPercent", "defaultUnitCharge", "gstInclusive"] as const;

/** As stripOptionMoneyForWrite, for Product Library writes. */
export function stripProductMoneyForWrite<T extends Record<string, any>>(data: T, viewer: SelectionViewer): T {
  if (viewer.canSeePricing && !viewer.isClient) return data;
  const copy: any = { ...data };
  for (const field of PRODUCT_MONEY_FIELDS) delete copy[field];
  return copy;
}

export function redactProductForViewer<T extends Record<string, any>>(product: T, viewer: SelectionViewer): T {
  if (!product || (!viewer.isClient && viewer.canSeePricing)) return product;
  const copy: any = { ...product };
  for (const field of PRODUCT_MONEY_FIELDS) delete copy[field];
  return copy;
}

/**
 * Money on the selection row itself. `allowance` is the budget in cents — a
 * trade without pricing access gets none of it (the read routes already drop
 * it; this is the list the WRITE paths share).
 */
export const SELECTION_MONEY_FIELDS = ["allowance"] as const;

/** As stripOptionMoneyForWrite, for the selection row (its allowance). */
export function stripSelectionMoneyForWrite<T extends Record<string, any>>(data: T, viewer: SelectionViewer): T {
  if (viewer.canSeePricing && !viewer.isClient) return data;
  const copy: any = { ...data };
  for (const field of SELECTION_MONEY_FIELDS) delete copy[field];
  return copy;
}

/**
 * A selection row handed back by a WRITE route (create, update, duplicate,
 * mark received, create-from-estimate, create PO). The read routes have
 * redacted money for a while, but these responses handed the saved row —
 * allowance and every option's cost and markup — straight back to whoever made
 * the change. Unlike applySelectionVisibilityToOne this never collapses the row
 * to the "awaiting approval" stub: the caller just wrote it, so it keeps its
 * shape, minus the money (and the share token, as on the read routes).
 */
export function redactSelectionForViewer<T extends Record<string, any>>(selection: T, viewer: SelectionViewer): any {
  if (!selection) return selection;
  if (viewer.isClient) return redactForClient(selection, viewer.canSeePricing);
  if (viewer.canSeePricing) {
    if (viewer.canSeePending) return selection;
    const copy: any = { ...selection };
    delete copy.portalToken;
    return copy;
  }
  const out: any = { ...selection };
  for (const field of SELECTION_MONEY_FIELDS) delete out[field];
  if (!viewer.canSeePending) delete out.portalToken;
  if (Array.isArray(out.options)) out.options = out.options.map(stripOptionMoney);
  return out;
}

// ── Selection templates ─────────────────────────────────────────────────────
//
// A template is company-wide, not tied to a job, but it carries exactly the
// same money as the selections it becomes: per-option cost / markup / charge
// inside `templateData`, and a budget (`budgetAmount`) on the template and, in
// the legacy `itemName` format, on each item. Every team member could read all
// of it from GET /api/selection-templates(/:id).

/** Money on a template option inside templateData (both blob formats). */
export const TEMPLATE_OPTION_MONEY_FIELDS = [...OPTION_MONEY_FIELDS, "unitCostOverride"] as const;
/** Money on the template row, and on a legacy-format item. */
export const TEMPLATE_MONEY_FIELDS = ["budgetAmount"] as const;

const isLegacyTemplateData = (data: any[]): boolean =>
  data.length > 0 && data[0] != null && typeof data[0] === "object" && "itemName" in data[0];

function stripFields(row: any, fields: readonly string[]): any {
  if (!row || typeof row !== "object") return row;
  const copy = { ...row };
  for (const f of fields) delete copy[f];
  return copy;
}

/** templateData with every cost, markup, charge and budget removed. */
export function stripTemplateDataMoney(data: any): any {
  if (!Array.isArray(data)) return data;
  if (isLegacyTemplateData(data)) {
    return data.map((item) => {
      const out = stripFields(item, TEMPLATE_MONEY_FIELDS);
      if (Array.isArray(out?.options)) out.options = out.options.map((o: any) => stripFields(o, TEMPLATE_OPTION_MONEY_FIELDS));
      return out;
    });
  }
  return data.map((o) => stripFields(o, TEMPLATE_OPTION_MONEY_FIELDS));
}

/** A selection template as `viewer` may read it. */
export function redactTemplateForViewer<T extends Record<string, any>>(template: T, viewer: SelectionViewer): any {
  if (!template || (viewer.canSeePricing && !viewer.isClient)) return template;
  const out: any = stripFields(template, TEMPLATE_MONEY_FIELDS);
  if ("templateData" in out) out.templateData = stripTemplateDataMoney(out.templateData);
  return out;
}

const optionSignature = (o: any) =>
  [o?.name, o?.brand, o?.sku].map((v) => String(v ?? "").trim().toLowerCase()).join("|");

/**
 * A template write from a viewer without pricing access. Their editor never
 * received the money, so the blob it sends back has none — saved as-is, that
 * would wipe every price on the template. Instead: anything money-shaped they
 * send is dropped, and each option they send keeps the price it already has.
 *
 * Options are matched to the stored blob by id, then — for stored options that
 * never had one (ids were historically minted in the browser on read) — by the
 * `old-<item>-<option>` id the editor gives legacy options, then by
 * name + brand + sku. An option that matches nothing is new, and has no price.
 */
export function mergeTemplateWriteForViewer<T extends Record<string, any>>(
  data: T,
  existing: any,
  viewer: SelectionViewer,
): T {
  if (viewer.canSeePricing && !viewer.isClient) return data;
  const out: any = stripFields(data, TEMPLATE_MONEY_FIELDS);
  if (!Array.isArray(out.templateData)) return out;

  const stored: any[] = Array.isArray(existing?.templateData) ? existing.templateData : [];
  const storedLegacy = isLegacyTemplateData(stored);

  // Every stored option, wherever it sits, under each key it can be found by.
  const byId = new Map<string, any>();
  const bySignature = new Map<string, any[]>();
  const register = (option: any, positional?: string) => {
    if (!option || typeof option !== "object") return;
    const keys: string[] = [];
    if (option.id) keys.push(String(option.id));
    if (positional) keys.push(positional);
    for (const k of keys) if (!byId.has(k)) byId.set(k, option);
    const sig = optionSignature(option);
    if (!bySignature.has(sig)) bySignature.set(sig, []);
    bySignature.get(sig)!.push(option);
  };
  if (storedLegacy) {
    stored.forEach((item, i) => (Array.isArray(item?.options) ? item.options : []).forEach((o: any, j: number) => register(o, `old-${i}-${j}`)));
  } else {
    stored.forEach((o) => register(o));
  }

  const used = new Set<any>();
  const findStored = (option: any) => {
    const id = option?.id ? String(option.id) : null;
    const hit = id ? byId.get(id) : undefined;
    if (hit && !used.has(hit)) return hit;
    for (const candidate of bySignature.get(optionSignature(option)) ?? []) {
      // Only fall back to the signature for a stored option that has no id of
      // its own — one WITH an id is only ever claimed by that id.
      if (!used.has(candidate) && !candidate.id) return candidate;
    }
    return undefined;
  };

  const withStoredMoney = (option: any) => {
    const clean = stripFields(option, TEMPLATE_OPTION_MONEY_FIELDS);
    const match = findStored(option);
    if (!match) return clean;
    used.add(match);
    for (const f of TEMPLATE_OPTION_MONEY_FIELDS) {
      if (match[f] !== undefined) clean[f] = match[f];
    }
    return clean;
  };

  if (isLegacyTemplateData(out.templateData)) {
    out.templateData = out.templateData.map((item: any, i: number) => {
      const clean = stripFields(item, TEMPLATE_MONEY_FIELDS);
      const storedItem = storedLegacy
        ? stored.find((s) => item?.id && s?.id === item.id) ?? stored.find((s) => s?.itemName === item?.itemName) ?? stored[i]
        : undefined;
      if (storedItem && storedItem.budgetAmount !== undefined) clean.budgetAmount = storedItem.budgetAmount;
      if (Array.isArray(item?.options)) clean.options = item.options.map(withStoredMoney);
      return clean;
    });
  } else {
    out.templateData = out.templateData.map(withStoredMoney);
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

  if (viewer.isClient) return redactForClient(selection, viewer.canSeePricing);
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
    const showPrice = viewer.canSeePricing && parentSelection?.clientCanSeePrice === true;
    return clientVisibleOptions(options).map((option) => clientOptionView(option, showPrice));
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
