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
  ProposalItem,
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
  brandColor?: string;
  documentStyle?: 'style1' | 'style2';
  estimatesData?: Record<string, {
    estimate: Estimate;
    groups: EstimateGroup[];
    items: EstimateItem[];
  }>;
  milestones?: ProposalPaymentMilestone[];
  acceptance?: ProposalAcceptance | null;
  proposalItems?: ProposalItem[];
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
  brandColor,
  documentStyle = 'style1',
  estimatesData = {},
  milestones = [],
  acceptance = null,
  proposalItems = [],
}: ProposalDocumentProps) {
  // Resolved brand color: explicit brandColor overrides primaryColor for new-style rendering
  const resolvedColor = brandColor ?? primaryColor;

  const layout = (proposal.layoutSettings as {
    pricingMode?: 'lump_sum' | 'itemised' | 'section_totals';
    showGst?: boolean;
    showLogo?: boolean;
  } | null) ?? null;
  const pricingMode = layout?.pricingMode ?? 'itemised';
  const showGst = layout?.showGst ?? true;
  const showLogo = layout?.showLogo ?? true;
  const effectiveLogo = showLogo ? companyLogo : undefined;

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

  // Shared props forwarded to every inner-page section
  const sharedSectionProps = {
    companyName,
    companyPhone,
    logoUrl: effectiveLogo,
    brandColor: resolvedColor,
    documentStyle,
  };

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
                companyLogo={effectiveLogo}
                companyName={companyName}
                companyPhone={companyPhone}
                primaryColor={primaryColor}
                brandColor={resolvedColor}
                documentStyle={documentStyle}
              />
            );
          case 'cover_letter':
          case 'scope':
            return (
              <ScopeSection
                key={section.id}
                proposal={proposal}
                section={section}
                {...sharedSectionProps}
                primaryColor={primaryColor}
              />
            );
          case 'summary':
            return (
              <SummarySection
                key={section.id}
                proposal={proposal}
                section={section}
                {...sharedSectionProps}
                primaryColor={primaryColor}
                showGst={showGst}
              />
            );
          case 'allowances':
            return (
              <AllowancesSection
                key={section.id}
                proposal={proposal}
                section={section}
                proposalItems={proposalItems}
                {...sharedSectionProps}
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
                {...sharedSectionProps}
                primaryColor={primaryColor}
                showGst={showGst}
              />
            );
          case 'inclusions_exclusions':
            return (
              <InclusionsExclusionsSection
                key={section.id}
                proposal={proposal}
                section={section}
                {...sharedSectionProps}
                primaryColor={primaryColor}
              />
            );
          case 'terms_conditions':
            return (
              <TermsSection
                key={section.id}
                proposal={proposal}
                section={section}
                {...sharedSectionProps}
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
                {...sharedSectionProps}
                primaryColor={primaryColor}
              />
            );
          case 'attachments':
            return (
              <AttachmentsSection
                key={section.id}
                proposal={proposal}
                section={section}
                {...sharedSectionProps}
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
                {...sharedSectionProps}
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
                companyLogo={effectiveLogo}
                companyName={companyName}
                companyPhone={companyPhone}
                primaryColor={primaryColor}
                brandColor={resolvedColor}
                documentStyle={documentStyle}
                proposalName={proposal.name}
                proposalNumber={proposal.proposalNumber}
                expiryDate={proposal.expiryDate ? new Date(proposal.expiryDate).toISOString() : undefined}
                pricingMode={pricingMode}
                showGst={showGst}
              />
            );
          }
          case 'custom':
          default:
            return (
              <ScopeSection
                key={section.id}
                proposal={proposal}
                section={section}
                {...sharedSectionProps}
                primaryColor={primaryColor}
              />
            );
        }
      })}
    </Document>
  );
}
