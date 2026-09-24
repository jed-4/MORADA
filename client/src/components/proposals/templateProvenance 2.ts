import type { Proposal, ProposalSection } from '@shared/schema';

/* Structural, not `Pick<ProposalTemplate, …>`. ProposalBuilder carries its own
   hand-rolled template type alongside the schema's, and a helper used by both
   should not have to pick a side. */
interface TemplateIdentity {
  id: string;
  updatedAt?: string | Date | null;
}
interface TemplateSections {
  sections?: Array<{
    sectionType?: string;
    name?: string | null;
    content?: unknown;
    description?: string | null;
    descriptionHtml?: string | null;
  }> | null;
}

/**
 * Which template built this proposal, and when.
 *
 * Applying a template COPIES it. The proposal keeps whatever the template said
 * at that moment and never hears about it again — which is the right model (a
 * sent proposal must not change under the client), but nothing recorded the
 * snapshot, so there was no way to notice the template had moved on since.
 * Jed lost a terms page and a set of allowance column settings to exactly
 * that: he applied the template at 07:16 and kept writing it until 07:28.
 *
 * ── Why layoutSettings and not a column ────────────────────────────────────
 * `proposals.layout_settings` is jsonb that already exists, is already
 * proposal-level, and is already written by the apply. A column would be
 * tidier, but it would also be a migration that has to land BEFORE the deploy
 * or every proposal query 500s — a trap this project has hit repeatedly. The
 * stamp is small, additive and ignorable by anything that does not know it.
 *
 * It is stripped when a proposal is saved back as a template: provenance
 * belongs to a document, not to the pattern it was cut from.
 */
export interface AppliedTemplateStamp {
  id: string;
  name: string;
  /** ISO instant the apply ran. Compared against the template's updatedAt. */
  at: string;
}

const KEY = 'appliedTemplate';

export function readTemplateStamp(
  proposal: Pick<Proposal, 'layoutSettings'> | null | undefined,
): AppliedTemplateStamp | null {
  const raw = (proposal?.layoutSettings as Record<string, unknown> | null)?.[KEY];
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Partial<AppliedTemplateStamp>;
  if (typeof s.id !== 'string' || typeof s.at !== 'string') return null;
  return { id: s.id, name: typeof s.name === 'string' ? s.name : 'the template', at: s.at };
}

export function withTemplateStamp(
  layoutSettings: Record<string, unknown> | null | undefined,
  stamp: AppliedTemplateStamp,
): Record<string, unknown> {
  return { ...(layoutSettings ?? {}), [KEY]: stamp };
}

/** Provenance is about this document, so it never travels into a template. */
export function withoutTemplateStamp(
  layoutSettings: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const { [KEY]: _stamp, ...rest } = (layoutSettings ?? {}) as Record<string, unknown>;
  return rest;
}

/**
 * Has the template changed since it was applied here?
 *
 * Deliberately one-directional and conservative: only a template whose
 * `updatedAt` is strictly later than the stamp counts. A missing or unparseable
 * date says nothing rather than crying wolf — a false "your template changed"
 * on every proposal would be worse than the silence it replaces.
 */
export function templateHasMovedOn(
  stamp: AppliedTemplateStamp | null,
  template: TemplateIdentity | undefined,
): boolean {
  if (!stamp || !template || template.id !== stamp.id) return false;
  const applied = Date.parse(stamp.at);
  const updated = Date.parse(String(template.updatedAt ?? ''));
  if (!Number.isFinite(applied) || !Number.isFinite(updated)) return false;
  return updated > applied;
}

/** Everything about a section that a builder could have typed. */
function signature(s: {
  name?: string | null;
  content?: unknown;
  description?: string | null;
  descriptionHtml?: string | null;
}): string {
  return JSON.stringify({
    name: s.name ?? '',
    content: s.content ?? {},
    description: s.description ?? '',
    descriptionHtml: s.descriptionHtml ?? '',
  });
}

/**
 * The names of sections that would lose work if the template were re-applied.
 *
 * Re-applying replaces every section, so "what will I lose" is "which sections
 * no longer match the template". Matched by position first — apply writes the
 * template's order straight through — and by type as a fallback, because a
 * section added or removed by hand shifts everything after it.
 *
 * A section the template has no counterpart for is a section the re-apply
 * deletes outright, so it always counts.
 */
export function sectionsWithLocalEdits(
  sections: ProposalSection[],
  template: TemplateSections | undefined,
): string[] {
  if (!template) return [];
  const templateSections = Array.isArray(template.sections) ? template.sections : [];
  const ordered = [...sections].sort((a, b) => a.order - b.order);
  const used = new Set<number>();

  return ordered
    .filter((s, i) => {
      const byIndex = templateSections[i];
      let match = byIndex && byIndex.sectionType === s.sectionType ? byIndex : undefined;
      let matchIndex = match ? i : -1;
      if (!match) {
        matchIndex = templateSections.findIndex(
          (t, ti) => !used.has(ti) && t.sectionType === s.sectionType,
        );
        match = matchIndex >= 0 ? templateSections[matchIndex] : undefined;
      }
      if (!match) return true;
      used.add(matchIndex);
      return signature(s) !== signature(match);
    })
    .map((s) => s.name || s.sectionType || 'Untitled section');
}
