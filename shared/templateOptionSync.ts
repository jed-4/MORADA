/**
 * Keeps `selection_template_options` in step with `selection_templates.templateData`.
 *
 * Step 2 made /apply read rows with the blob as a fallback. That only holds while
 * the two agree, and today every template edit writes the blob and nothing writes
 * the rows — so a template edited after the backfill would apply stale options.
 * This is the write-through that closes that window: every route that writes
 * templateData mirrors it into rows in the same request.
 *
 * Once nothing writes the blob any more, dropping the column becomes a one-line
 * change instead of a migration nobody dares run.
 *
 * The DIFF is pure and lives here; the applier is a thin wrapper in
 * server/services/templateOptionSync.ts. The interesting mistakes are all in the
 * diff — deleting a row that should have survived, or duplicating one that
 * should have been updated — so that is the part with tests.
 */
import type { TemplateOption } from "./templateOptions";

/** The subset of a `selection_template_options` row the diff needs. */
export interface ExistingLink {
  id: string;
  productId: number;
  templateOptionId: string | null;
}

export interface SyncPlan {
  creates: TemplateOption[];
  updates: Array<{ link: ExistingLink; option: TemplateOption }>;
  deletes: ExistingLink[];
  /** Rows left alone because the blob has no say over them. */
  preserved: ExistingLink[];
}

/**
 * Works out what to create, update and delete so the rows match the blob.
 *
 * Matching is by `templateOptionId`, the same key the backfill uses — the
 * option's own id where the blob stored one, else its position (`idx:0`,
 * `idx:2/1`). See shared/templateOptions.ts for why the position fallback is
 * necessary.
 *
 * Two rules that are easy to get wrong:
 *
 *  1. A row with a NULL templateOptionId came from somewhere other than the blob
 *     — a future "add to library" UI, say. The blob never described it, so a blob
 *     sync must not delete it. It is preserved, untouched.
 *
 *  2. Duplicate templateOptionIds among existing rows can only come from a
 *     partial write or a hand-edited database; the partial unique index makes
 *     them impossible otherwise. The first is updated and the rest deleted, so
 *     the sync converges rather than failing forever.
 */
export function planTemplateOptionSync(
  existing: ExistingLink[],
  extracted: TemplateOption[],
): SyncPlan {
  const plan: SyncPlan = { creates: [], updates: [], deletes: [], preserved: [] };

  const byKey = new Map<string, ExistingLink>();
  for (const link of existing) {
    if (link.templateOptionId === null) {
      plan.preserved.push(link);
      continue;
    }
    if (byKey.has(link.templateOptionId)) {
      // Duplicate — see rule 2. Keep the first, drop the rest.
      plan.deletes.push(link);
      continue;
    }
    byKey.set(link.templateOptionId, link);
  }

  const seen = new Set<string>();
  for (const option of extracted) {
    // A duplicate key within one blob would otherwise update the same row twice
    // and then delete nothing; extractTemplateOptions guarantees uniqueness, and
    // this keeps the diff correct even if that ever stops being true.
    if (seen.has(option.templateOptionId)) continue;
    seen.add(option.templateOptionId);

    const link = byKey.get(option.templateOptionId);
    if (link) {
      plan.updates.push({ link, option });
      byKey.delete(option.templateOptionId);
    } else {
      plan.creates.push(option);
    }
  }

  // Whatever the blob no longer mentions has been removed from the template.
  // Array.from rather than iterating the Map directly — this tsconfig predates
  // downlevelIteration, and the codebase uses the same workaround elsewhere.
  for (const link of Array.from(byKey.values())) plan.deletes.push(link);

  return plan;
}
