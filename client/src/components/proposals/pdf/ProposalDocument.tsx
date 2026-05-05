import { Document } from '@react-pdf/renderer';
import type {
  Proposal,
  ProposalSection,
  Project,
  Contact,
  Estimate,
  EstimateGroup,
  EstimateItem,
  ProposalPaymentMilestone,
  ProposalAcceptance,
} from '@shared/schema';
import { substituteSectionContent, type PlaceholderContext } from './placeholders';
import { CoverPageSection } from './sections/CoverPageSection';
import { EstimateSection } from './sections/EstimateSection';
import { SummarySection } from './sections/SummarySection';
import { AllowancesSection } from './sections/AllowancesSection';
import { PaymentScheduleSection } from './sections/PaymentScheduleSection';
import { ScopeSection } from './sections/ScopeSection';
import { InclusionsExclusionsSection } from './sections/InclusionsExclusionsSection';
import { TermsSection } from './sections/TermsSection';
import { ClosingSection } from './sections/ClosingSection';
import { SignatureSection } from './sections/SignatureSection';
import { AttachmentsSection } from './sections/AttachmentsSection';

interface ProposalDocumentProps {
  proposal: Proposal;
  sections: ProposalSection[];
  project?: Project;
  client?: Contact;
  companyLogo?: string;
  companyName?: string;
  companyPhone?: string;
  primaryColor?: string;
  estimatesData?: Record<string, {
    estimate: Estimate;
    groups: EstimateGroup[];
    items: EstimateItem[];
  }>;
  milestones?: ProposalPaymentMilestone[];
  acceptance?: ProposalAcceptance | null;
}

export function ProposalDocument({
  proposal,
  sections,
  project,
  client,
  companyLogo,
  companyName,
  companyPhone,
  primaryColor = '#3B82F6',
  estimatesData = {},
  milestones = [],
  acceptance = null,
}: ProposalDocumentProps) {
  // Compute the estimate total (inc GST, in cents) from any linked estimate
  // section so {{estimate.total_inc_gst}} renders against real data.
  // EstimateItem.priceIncTax is stored in dollars (doublePrecision in the
  // schema), so we convert to integer cents for the formatter.
  // Resolve the effective estimate id for an estimate section: prefer the
  // explicit per-section pick, then fall back to the proposal-level
  // estimateId so revision changes from the Revisions panel still surface
  // in the live preview.
  const resolveEstimateId = (sectionContent: Record<string, unknown> | null | undefined): string | undefined => {
    const explicit = sectionContent && typeof sectionContent.estimateId === 'string' ? sectionContent.estimateId : undefined;
    return explicit || proposal.estimateId || undefined;
  };

  let estimateTotalIncGstCents: number | undefined;
  for (const s of sections) {
    if (s.sectionType !== 'estimate') continue;
    const sectionContent = (s.content as Record<string, unknown> | null) ?? {};
    const estimateId = resolveEstimateId(sectionContent);
    const data = estimateId ? estimatesData[estimateId] : undefined;
    if (!data) continue;
    const incDollars = data.items.reduce((acc: number, item: EstimateItem) => {
      const value = item.priceIncTax;
      return acc + (typeof value === 'number' && !Number.isNaN(value) ? value : 0);
    }, 0);
    if (incDollars > 0) {
      estimateTotalIncGstCents = Math.round(incDollars * 100);
      break;
    }
  }
  const placeholderCtx: PlaceholderContext = {
    proposal,
    project,
    client,
    companyName,
    companyPhone,
    estimateTotalIncGstCents,
  };
  const enabledSections = sections.filter((s) => s.isEnabled !== false);
  const sortedSections = [...enabledSections]
    .sort((a, b) => a.order - b.order)
    .map((s) => substituteSectionContent(s, placeholderCtx));

  return (
    <Document>
      {sortedSections.map((section) => {
        switch (section.sectionType) {
          case 'cover_page':
            return (
              <CoverPageSection
                key={section.id}
                proposal={proposal}
                section={section}
                project={project}
                client={client}
                companyLogo={companyLogo}
                companyName={companyName}
                primaryColor={primaryColor}
              />
            );
          case 'cover_letter':
          case 'scope': {
            return (
              <ScopeSection
                key={section.id}
                proposal={proposal}
                section={section}
                companyName={companyName}
                primaryColor={primaryColor}
              />
            );
          }
          case 'summary':
            return (
              <SummarySection
                key={section.id}
                proposal={proposal}
                section={section}
                companyName={companyName}
                primaryColor={primaryColor}
              />
            );
          case 'allowances':
            return (
              <AllowancesSection
                key={section.id}
                proposal={proposal}
                section={section}
                companyName={companyName}
                primaryColor={primaryColor}
              />
            );
          case 'payment_schedule':
            return (
              <PaymentScheduleSection
                key={section.id}
                proposal={proposal}
                section={section}
                milestones={milestones}
                companyName={companyName}
                primaryColor={primaryColor}
              />
            );
          case 'inclusions_exclusions':
            return (
              <InclusionsExclusionsSection
                key={section.id}
                proposal={proposal}
                section={section}
                companyName={companyName}
                primaryColor={primaryColor}
              />
            );
          case 'terms_conditions':
            return (
              <TermsSection
                key={section.id}
                proposal={proposal}
                section={section}
                companyName={companyName}
                primaryColor={primaryColor}
              />
            );
          case 'closing':
          case 'closing_letter':
            return (
              <ClosingSection
                key={section.id}
                proposal={proposal}
                section={section}
                companyName={companyName}
                primaryColor={primaryColor}
              />
            );
          case 'attachments':
            return (
              <AttachmentsSection
                key={section.id}
                proposal={proposal}
                section={section}
                companyName={companyName}
                primaryColor={primaryColor}
              />
            );
          case 'signature':
            return (
              <SignatureSection
                key={section.id}
                proposal={proposal}
                section={section}
                acceptance={acceptance}
                companyName={companyName}
                primaryColor={primaryColor}
              />
            );
          case 'estimate': {
            const content = (section.content as Record<string, unknown>) || {};
            const estimateId = resolveEstimateId(content);
            const estimateData = estimateId ? estimatesData[estimateId] : undefined;
            if (!estimateData) return null;
            return (
              <EstimateSection
                key={section.id}
                section={section}
                estimateData={estimateData}
                companyLogo={companyLogo}
                companyName={companyName}
                primaryColor={primaryColor}
                proposalName={proposal.name}
                proposalNumber={proposal.proposalNumber}
                expiryDate={proposal.expiryDate ? new Date(proposal.expiryDate).toISOString() : undefined}
              />
            );
          }
          case 'custom':
          default:
            // Render custom (and unknown) sections via the scope renderer (rich text body)
            return (
              <ScopeSection
                key={section.id}
                proposal={proposal}
                section={section}
                companyName={companyName}
                primaryColor={primaryColor}
              />
            );
        }
      })}
    </Document>
  );
}
