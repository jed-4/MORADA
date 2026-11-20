/**
 * Site board settings shared by the server (which enforces them) and the
 * client (which edits them).
 *
 * 1. Which selection details the public site QR page shows, per project
 *    (`projects.site_selection_fields`, migration 0138). The server strips a
 *    hidden detail from the payload, so hiding it really hides it — the page
 *    is public.
 * 2. The company's branded sign template: an uploaded A4 PDF or image plus the
 *    box the QR goes in (`company_settings.site_sign_*`, migration 0138).
 */
import { z } from "zod";

export const SITE_SELECTION_FIELDS = [
  { key: "photos", label: "Photos", hint: "Product photos" },
  { key: "description", label: "Descriptions", hint: "Selection and option descriptions" },
  { key: "brand", label: "Brand", hint: "Manufacturer or brand" },
  { key: "sku", label: "SKU / code", hint: "Product code" },
  { key: "quantity", label: "Quantity", hint: "Quantity and unit" },
  { key: "specifications", label: "Specifications", hint: "Colour, finish, size and other specs" },
  { key: "productLink", label: "Product link", hint: "The supplier's web page" },
  { key: "documents", label: "Documents", hint: "Spec sheets and other attached files" },
  { key: "otherOptions", label: "Other options", hint: "Options not chosen, once one is confirmed" },
  { key: "tradeNotes", label: "Notes for trades", hint: "The selection's trades notes" },
] as const;

export type SiteSelectionField = (typeof SITE_SELECTION_FIELDS)[number]["key"];
export type SiteSelectionFields = Partial<Record<SiteSelectionField, boolean>>;

/** Everything the page showed before this setting existed stays on; trades
 *  notes are new to the page, so they start off. */
export const SITE_SELECTION_FIELD_DEFAULTS: Record<SiteSelectionField, boolean> = {
  photos: true,
  description: true,
  brand: true,
  sku: true,
  quantity: true,
  specifications: true,
  productLink: true,
  documents: true,
  otherOptions: true,
  tradeNotes: false,
};

export function resolveSiteSelectionFields(saved: unknown): Record<SiteSelectionField, boolean> {
  const out = { ...SITE_SELECTION_FIELD_DEFAULTS };
  if (saved && typeof saved === "object") {
    for (const { key } of SITE_SELECTION_FIELDS) {
      const v = (saved as Record<string, unknown>)[key];
      if (typeof v === "boolean") out[key] = v;
    }
  }
  return out;
}

export const siteSelectionFieldsSchema = z.object(
  Object.fromEntries(SITE_SELECTION_FIELDS.map(({ key }) => [key, z.boolean().optional()])) as Record<
    SiteSelectionField,
    z.ZodOptional<z.ZodBoolean>
  >,
).strict();

// ── Branded sign ────────────────────────────────────────────────────────────

/** Where the QR (and the job name/address under it) goes on page 1 of the
 *  template. Fractions of the page, origin top-left, so they survive any page
 *  size. */
export const siteSignLayoutSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  w: z.number().min(0.05).max(1),
  h: z.number().min(0.05).max(1),
  showName: z.boolean(),
  showAddress: z.boolean(),
  /** Text colour for the job name/address: dark ink or white (for a dark background). */
  textColor: z.enum(["dark", "light"]),
}).refine((l) => l.x + l.w <= 1.0001 && l.y + l.h <= 1.0001, { message: "The box must sit inside the page" });

export type SiteSignLayout = z.infer<typeof siteSignLayoutSchema>;

/** A sensible first box: centred, a little below the middle. */
export const DEFAULT_SITE_SIGN_LAYOUT: SiteSignLayout = {
  x: 0.2,
  y: 0.32,
  w: 0.6,
  h: 0.5,
  showName: true,
  showAddress: true,
  textColor: "dark",
};

export const SITE_SIGN_TEMPLATE_MIMES = ["application/pdf", "image/png", "image/jpeg"] as const;
export type SiteSignTemplateMime = (typeof SITE_SIGN_TEMPLATE_MIMES)[number];

export const saveSiteSignSchema = z.object({
  /** A new upload; omit to keep the current file and change only the layout. */
  template: z.object({
    objectPath: z.string().startsWith("/objects/"),
    uploadGrant: z.string().min(1),
    name: z.string().trim().min(1).max(255),
    mimeType: z.enum(SITE_SIGN_TEMPLATE_MIMES),
  }).optional(),
  layout: siteSignLayoutSchema,
});

/** What the staff UI reads about the company's sign. */
export interface SiteSignSettings {
  hasTemplate: boolean;
  templateName: string | null;
  templateMime: SiteSignTemplateMime | null;
  layout: SiteSignLayout;
}
