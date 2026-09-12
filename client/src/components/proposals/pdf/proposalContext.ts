import type { Proposal, ProposalSection, Project, Contact, Estimate, EstimateGroup, EstimateItem } from '@shared/schema';
import { computeProposalTotals, EMPTY_PROPOSAL_TOTALS, type ProposalTotals } from '@shared/proposalTotals';
import type { PlaceholderContext } from './placeholders';

/**
 * The one place the proposal's own price is worked out.
 *
 * It used to live inside ProposalDocument, which was fine while the document
 * was the only thing that printed money. Imported pages broke that: a cover
 * stamped with `{{estimate.total_inc_gst}}` is drawn by pdf-lib AFTER
 * @react-pdf has finished, from a different call site — so a second copy of
 * this logic would be a second answer, and the cover would eventually disagree
 * with the summary two pages later. The same figure has to come from the same
 * function.
 */

export type EstimatesData = Record<string, {
  estimate: Estimate;
  groups: EstimateGroup[];
  items: EstimateItem[];
}>;

export function resolveEstimateId(
  proposal: Proposal,
  sectionContent: Record<string, unknown> | null | undefined,
): string | undefined {
  const explicit =
    sectionContent && typeof sectionContent.estimateId === 'string' ? sectionContent.estimateId : undefined;
  return explicit || proposal.estimateId || undefined;
}

/**
 * Live totals from the linked estimate, falling back to the stored columns.
 *
 * `proposals.subtotal/gstAmount/totalAmount` are written only on send, so a
 * draft that read them summarised itself as $0.00 while the estimate table on
 * the page above showed real money. They still stand in for an accepted
 * proposal whose estimate was later unlinked — that document knows what it was
 * accepted at, and nothing live can tell us.
 */
export function resolveProposalTotals(
  proposal: Proposal,
  sections: ProposalSection[],
  estimatesData: EstimatesData,
): ProposalTotals {
  for (const section of sections) {
    if (section.sectionType !== 'estimate') continue;
    const content = (section.content as Record<string, unknown> | null) ?? {};
    const estimateId = resolveEstimateId(proposal, content);
    const data = estimateId ? estimatesData[estimateId] : undefined;
    if (!data) continue;
    return computeProposalTotals(data.items, {
      projectMarkupPercent: data.estimate?.projectMarkupPercent,
      taxRate: data.estimate?.taxRate,
      estimateId,
      groups: data.groups,
    });
  }

  const stored: ProposalTotals = {
    subtotalCents: Number(proposal.subtotal) || 0,
    gstCents: Number(proposal.gstAmount) || 0,
    totalCents: Number(proposal.totalAmount) || 0,
    // The stored columns are money only — the line counts were never written,
    // and the panels that show them are driven by live estimate data anyway.
    includedItemCount: 0,
    excludedItemCount: 0,
  };
  return stored.totalCents > 0 ? stored : EMPTY_PROPOSAL_TOTALS;
}

/** company_settings.company_name is NULL until a builder fills it in. */
export function resolveCompanyName(companyName?: string): string {
  return (companyName || '').trim() || 'Your Company';
}

export function buildProposalPlaceholderContext(args: {
  proposal: Proposal;
  sections: ProposalSection[];
  project?: Project;
  client?: Contact;
  companyName?: string;
  companyPhone?: string;
  estimatesData: EstimatesData;
}): PlaceholderContext {
  const totals = resolveProposalTotals(args.proposal, args.sections, args.estimatesData);
  return {
    proposal: args.proposal,
    project: args.project,
    client: args.client,
    companyName: resolveCompanyName(args.companyName),
    companyPhone: args.companyPhone,
    estimateTotalIncGstCents: totals.totalCents || undefined,
  };
}
