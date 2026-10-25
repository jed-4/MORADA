import { z } from "zod";

/**
 * Company-wide take-off templates.
 *
 * A template is a named set of measurement ITEMS — what you measure and how it
 * is drawn — with no geometry. Loading one into a project creates the items
 * ready to mark up; nothing is measured until someone draws.
 *
 * They live as a JSON array on `company_settings.takeoff_measurement_templates`
 * rather than in their own table. That is how the in-take-off Save/Load flow
 * has always stored them, and these types are shared so the server, the
 * management page and that modal cannot drift apart on the shape.
 */

/** What a template item records. Mirrors the drawable fields of takeoff_measurements. */
export const takeoffTemplateItemSchema = z.object({
  name: z.string().min(1, "Every item needs a name"),
  measurementType: z.string().min(1),
  color: z.string().min(1),
  categoryName: z.string().nullable().optional(),
  multiplier: z.number(),
  wastePercent: z.number(),
  /** Wall height in mm for a linear item measured as a run; null for a plain run. */
  heightMm: z.number().nullable().optional(),
  /**
   * How the item is DRAWN. Optional because templates saved before #307 carry
   * none of them — absent means "the schema default", which is exactly what
   * those templates produced. Never make these required: it would invalidate
   * every template saved before they existed.
   */
  fillPattern: z.string().optional(),
  lineType: z.string().optional(),
  lineSize: z.number().optional(),
  /** The unit as it was, rather than re-derived from measurementType on apply. */
  unit: z.string().optional(),
});

export const takeoffTemplateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1, "Template name is required"),
  items: z.array(takeoffTemplateItemSchema),
});

export type TakeoffTemplateItem = z.infer<typeof takeoffTemplateItemSchema>;
export type TakeoffTemplate = z.infer<typeof takeoffTemplateSchema>;

/** Create: the server assigns the id, so the client must not send one. */
export const createTakeoffTemplateSchema = takeoffTemplateSchema.omit({ id: true }).extend({
  items: z.array(takeoffTemplateItemSchema).default([]),
});

/** Update: name and items are independently optional, the id comes from the path. */
export const updateTakeoffTemplateSchema = takeoffTemplateSchema.omit({ id: true }).partial();

/**
 * Read the stored blob.
 *
 * Deliberately LENIENT, and strict only on write. It is a `json` column with
 * no shape enforced by the database, so the array can hold anything — and
 * validating each item on the way out would mean a single odd field silently
 * erasing a builder's template from the list. An entry needs an id, a name and
 * an array of items to be listed; its items are passed through as they are and
 * judged where it matters, when something tries to use them.
 *
 * The failure this avoids is the one that keeps happening here: a read path
 * that swallows what it cannot parse and returns an empty list, so the screen
 * says "no templates yet" and nobody suspects the data is still there.
 */
export function readTakeoffTemplates(stored: unknown): TakeoffTemplate[] {
  if (!Array.isArray(stored)) return [];
  return stored.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const { id, name, items } = entry as Record<string, unknown>;
    if (typeof id !== "string" || !id) return [];
    if (typeof name !== "string") return [];
    return [{
      id,
      name,
      items: Array.isArray(items) ? (items as TakeoffTemplateItem[]) : [],
    }];
  });
}
