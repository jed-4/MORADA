import type { InsertProposal, Proposal, ProposalSection, ProposalTemplate } from '@shared/schema';

/**
 * Where a proposal document lives, so the builder does not have to know.
 *
 * ProposalBuilder edits a document: a list of sections and a layout. A real
 * proposal keeps that in `proposal_sections` and `proposals.layout_settings`;
 * a template keeps the same thing in one `proposal_templates` row. Everything
 * between those two facts — every section editor, the Layout panel, the PDF
 * preview, the page-break controls, the cover templates — is identical, and
 * has to STAY identical as it is iterated.
 *
 * That is what this interface buys. There is one builder. A new section type,
 * a new layout control or a new cover design appears in both places because
 * there is only one place it can be written. The alternative is what happened
 * to estimate templates: EstimateTemplateDetail is a 676-line reimplementation
 * of a 7,564-line page, and the two have been drifting ever since.
 *
 * `can` is the honest part of the abstraction. A template is not a lesser
 * proposal that happens to be unsent — it has no project, no client and no
 * estimate, so sending it, revising it or scheduling payments against it are
 * not features that are missing, they are features that do not apply. The
 * builder hides them rather than disabling them.
 */

export interface ProposalDocumentCapabilities {
  /** Send to a client, and the status that goes with it. */
  send: boolean;
  /** Rev A / Rev B history. */
  revisions: boolean;
  /** A linked estimate revision, and the money that comes from it. */
  linkEstimate: boolean;
  /** Payment milestones, which are rows keyed on a real proposal. */
  milestones: boolean;
  /** The client portal share link. */
  share: boolean;
  /** Project, client, dates — the Details card. */
  details: boolean;
}

export const PROPOSAL_CAPABILITIES: ProposalDocumentCapabilities = {
  send: true,
  revisions: true,
  linkEstimate: true,
  milestones: true,
  share: true,
  details: true,
};

export const TEMPLATE_CAPABILITIES: ProposalDocumentCapabilities = {
  send: false,
  revisions: false,
  linkEstimate: false,
  milestones: false,
  share: false,
  details: false,
};

export interface ProposalDocumentSource {
  kind: 'proposal' | 'template';
  /** For a template this is a stand-in — see templateProposal(). */
  proposal: Proposal;
  sections: ProposalSection[];
  updateSection: (sectionId: string, updates: Partial<ProposalSection>) => void;
  addSection: (section: Partial<ProposalSection>) => void;
  /**
   * Add several at once, in order.
   *
   * Separate from addSection because "start from the standard structure" is
   * one action to the builder and eleven writes to a proposal, and the two
   * storage backends need to do that differently: a proposal posts them
   * sequentially so a partial failure is legible, a template folds them into
   * one row write. Calling addSection in a loop would be wrong for both.
   */
  addSections: (sections: Partial<ProposalSection>[]) => Promise<void> | void;
  reorderSections: (sections: ProposalSection[]) => void;
  updateProposal: (updates: Partial<InsertProposal>) => void;
  can: ProposalDocumentCapabilities;
  /** True while a write is in flight, for the header's saved indicator. */
  isSaving?: boolean;
}

/* ── Templates ────────────────────────────────────────────────────────────
 *
 * A template's sections are stored WITHOUT ids: they are a shape to be
 * inserted, not rows. The builder needs ids for React keys and to address an
 * edit, so they are minted on read and stripped on write. They are stable for
 * the life of the editing session, which is all anything needs — nothing
 * outside this file ever persists one.
 */

const TEMPLATE_SECTION_PREFIX = 'tpl-sec-';

export function templateSectionId(index: number): string {
  return `${TEMPLATE_SECTION_PREFIX}${index}`;
}

/** The template's sections, in the shape the builder edits. */
export function templateSectionsToRows(template: ProposalTemplate): ProposalSection[] {
  const stored = Array.isArray(template.sections) ? template.sections : [];
  return stored.map((s, i) => ({
    id: templateSectionId(i),
    proposalId: template.id,
    name: s.name ?? '',
    description: s.description ?? null,
    descriptionHtml: s.descriptionHtml ?? null,
    order: typeof s.order === 'number' ? s.order : i,
    isCollapsed: false,
    isEnabled: s.isEnabled !== false,
    sectionType: s.sectionType || 'custom',
    templateId: null,
    content: (s.content ?? {}) as Record<string, unknown>,
    showPricing: s.showPricing !== false,
    showSubtotal: s.showSubtotal !== false,
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
  })) as unknown as ProposalSection[];
}

/** Back to storage shape: ids dropped, order normalised to the array order. */
export function rowsToTemplateSections(rows: ProposalSection[]): ProposalTemplate['sections'] {
  return [...rows]
    .sort((a, b) => a.order - b.order)
    .map((s, i) => ({
      sectionType: s.sectionType || 'custom',
      name: s.name ?? '',
      order: i,
      content: (s.content ?? {}) as Record<string, unknown>,
      description: s.description ?? null,
      descriptionHtml: (s as { descriptionHtml?: string | null }).descriptionHtml ?? null,
      isEnabled: s.isEnabled !== false,
      showPricing: s.showPricing !== false,
      showSubtotal: s.showSubtotal !== false,
    }));
}

/**
 * The live document, as template payload.
 *
 * `estimateId` is stripped. It is the one thing in a section's content that
 * points AT something rather than describing it — a specific estimate on a
 * specific project — so carrying it into a template means the next proposal
 * built from that template silently prices somebody else's job.
 *
 * Everything else is kept verbatim: the section names, every rich-text body,
 * the column settings, the cover template and its image, and any {{tokens}}
 * the builder typed. Placeholders especially — a template full of
 * `{{project.name}}` is the entire point, and stripping or resolving them
 * here would turn a reusable document into a snapshot of one job.
 */
export function documentToTemplatePayload(
  sections: ProposalSection[],
  layoutSettings: Record<string, unknown> | null | undefined,
): Pick<ProposalTemplate, 'sections'> & { layoutSettings: Record<string, unknown> } {
  return {
    sections: [...sections]
      .sort((a, b) => a.order - b.order)
      .map((s, i) => {
        const { estimateId: _linkedEstimate, ...content } = (s.content ?? {}) as Record<string, unknown>;
        return {
          sectionType: s.sectionType || 'custom',
          name: s.name ?? '',
          order: i,
          content,
          description: s.description ?? null,
          descriptionHtml: (s as { descriptionHtml?: string | null }).descriptionHtml ?? null,
          isEnabled: s.isEnabled !== false,
          showPricing: s.showPricing !== false,
          showSubtotal: s.showSubtotal !== false,
        };
      }),
    layoutSettings: (layoutSettings ?? {}) as Record<string, unknown>,
  };
}

/**
 * A Proposal-shaped stand-in, so the builder and the PDF renderer work on a
 * template unchanged.
 *
 * The placeholder name and number are what the document will print, and that
 * is the point: a template is exactly where you want to SEE that the cover
 * says "{{project.name}}" and the reference is a sample. Money is zero because
 * no estimate is linked — the totals a real proposal computes cannot exist
 * here, and printing a made-up figure would be worse than printing none.
 */
export function templateProposal(template: ProposalTemplate): Proposal {
  return {
    id: template.id,
    proposalNumber: 'PROP-0000',
    companyId: template.companyId,
    name: template.name,
    projectId: '',
    estimateId: null,
    clientId: null,
    introductionText: null,
    closingText: null,
    termsAndConditions: null,
    subtotal: 0,
    gstAmount: 0,
    totalAmount: 0,
    status: 'draft',
    expiryDate: null,
    sentDate: null,
    viewedDate: null,
    acceptedDate: null,
    acceptedBy: null,
    acceptedByName: null,
    acceptedByEmail: null,
    signature: null,
    rejectedDate: null,
    rejectionReason: null,
    convertedToInvoiceId: null,
    convertedDate: null,
    showPricing: true,
    allowClientOptions: false,
    createdBy: template.createdById,
    createdByName: null,
    notes: null,
    isArchived: false,
    version: 1,
    parentProposalId: null,
    shareToken: '',
    contentSnapshot: null,
    sentPdfPath: null,
    sentTo: [],
    remindersEnabled: false,
    viewCount: 0,
    lastViewedAt: null,
    viewerDevice: null,
    layoutSettings: (template.layoutSettings ?? {}) as Record<string, any>,
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
  } as unknown as Proposal;
}
