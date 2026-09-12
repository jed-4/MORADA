import { Document, View } from '@react-pdf/renderer';
import { SectionPage, SectionDivider } from './SectionPage';
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
import { computeProposalTotals, EMPTY_PROPOSAL_TOTALS } from '@shared/proposalTotals';
import { substituteSectionContent, type PlaceholderContext } from './placeholders';
import { CoverPageSection } from './sections/CoverPageSection';
import { EstimateSection } from './sections/EstimateSection';
import { SummarySection, summaryHasContent } from './sections/SummarySection';
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

  /**
   * company_settings.company_name is NULL until a builder fills it in, and a
   * default parameter only fires for undefined — so every `companyName =
   * "Your Company"` down the section tree has been dead code, and the footer,
   * the running header and the cover all printed a blank where the company's
   * name goes. Normalised once here rather than defended against in twelve
   * places.
   */
  const resolvedCompanyName = (companyName || "").trim() || "Your Company";

  const layout = (proposal.layoutSettings as {
    pricingMode?: 'lump_sum' | 'itemised' | 'section_totals';
    showGst?: boolean;
    showLogo?: boolean;
    showFooter?: boolean;
    pageHeader?: 'none' | 'minimal' | 'compact' | 'full';
  } | null) ?? null;
  const pricingMode = layout?.pricingMode ?? 'itemised';
  const showGst = layout?.showGst ?? true;
  const showLogo = layout?.showLogo ?? true;
  // The Layout panel has always written showFooter and nothing has ever read
  // it, so the switch did nothing. A section can now override the document
  // default — a cover page or a signature sheet usually wants a clean edge.
  const showFooterDefault = layout?.showFooter ?? true;
  const footerFor = (s: ProposalSection): boolean => {
    const override = (s.content as Record<string, unknown> | null)?.showFooter;
    return typeof override === 'boolean' ? override : showFooterDefault;
  };
  const effectiveLogo = showLogo ? companyLogo : undefined;

  const resolveEstimateId = (sectionContent: Record<string, unknown> | null | undefined): string | undefined => {
    const explicit = sectionContent && typeof sectionContent.estimateId === 'string' ? sectionContent.estimateId : undefined;
    return explicit || proposal.estimateId || undefined;
  };

  /**
   * The document's own price, computed from the linked estimate.
   *
   * Two things used to be wrong here. It summed `item.priceIncTax` raw, which
   * is the PRE-margin cache — so the figure was short by the whole project
   * margin, and disagreed with the estimate table on the page after it. And
   * the summary read `proposal.subtotal`/`gstAmount`/`totalAmount`, columns
   * only written when a proposal is SENT, so every draft summarised itself as
   * $0.00 while the estimate above it showed real money.
   *
   * computeProposalTotals is the same function the server uses on send, so the
   * table, the summary, the placeholders and the sent record all agree.
   */
  const liveTotals = (() => {
    for (const s of sections) {
      if (s.sectionType !== 'estimate') continue;
      const sectionContent = (s.content as Record<string, unknown> | null) ?? {};
      const estimateId = resolveEstimateId(sectionContent);
      const data = estimateId ? estimatesData[estimateId] : undefined;
      if (!data) continue;
      return computeProposalTotals(data.items, {
        projectMarkupPercent: data.estimate?.projectMarkupPercent,
        taxRate: data.estimate?.taxRate,
        estimateId,
        groups: data.groups,
      });
    }
    return null;
  })();

  // Stored columns stand in when nothing is linked — an accepted proposal whose
  // estimate was later unlinked still knows what it was accepted at.
  const storedTotals = {
    subtotalCents: Number(proposal.subtotal) || 0,
    gstCents: Number(proposal.gstAmount) || 0,
    totalCents: Number(proposal.totalAmount) || 0,
  };
  const totals = liveTotals ?? (storedTotals.totalCents > 0 ? storedTotals : EMPTY_PROPOSAL_TOTALS);
  const estimateTotalIncGstCents = totals.totalCents || undefined;

  const placeholderCtx: PlaceholderContext = {
    proposal,
    project,
    client,
    companyName: resolvedCompanyName,
    companyPhone,
    estimateTotalIncGstCents,
  };
  const enabledSections = sections.filter((s) => s.isEnabled !== false);
  // The price appears once. The payment schedule owns it — the milestones are
  // percentages of it — and a proposal with no schedule keeps it on Summary
  // rather than losing it.
  const hasPaymentSchedule = enabledSections.some((s) => s.sectionType === 'payment_schedule');
  const sortedSections = [...enabledSections]
    .sort((a, b) => a.order - b.order)
    .map((s) => substituteSectionContent(s, placeholderCtx));

  // Shared props forwarded to every inner-page section
  const sharedSectionProps = {
    companyName: resolvedCompanyName,
    companyPhone,
    logoUrl: effectiveLogo,
    brandColor: resolvedColor,
    documentStyle,
  };

  /** The body for one section, with no page chrome around it. */
  const bodyFor = (section: ProposalSection, sharesPage = false) => {
        switch (section.sectionType) {
          case 'cover_page':
            return (
              <CoverPageSection
                key={section.id}
                showFooter={footerFor(section)}
                totals={totals}
                showGst={showGst}
                proposal={proposal}
                section={section}
                project={project}
                client={client}
                companyLogo={effectiveLogo}
                companyName={resolvedCompanyName}
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
                showFooter={footerFor(section)}
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
                showFooter={footerFor(section)}
                totals={totals}
                showTotals={!hasPaymentSchedule}
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
                showFooter={footerFor(section)}
                estimateData={proposal.estimateId ? estimatesData[proposal.estimateId] : undefined}
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
                showFooter={footerFor(section)}
                totals={totals}
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
                showFooter={footerFor(section)}
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
                showFooter={footerFor(section)}
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
                showFooter={footerFor(section)}
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
                showFooter={footerFor(section)}
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
                showFooter={footerFor(section)}
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
                sharesPage={sharesPage}
                showFooter={footerFor(section)}
                section={section}
                estimateData={estimateData}
                companyLogo={effectiveLogo}
                companyName={resolvedCompanyName}
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
                showFooter={footerFor(section)}
                proposal={proposal}
                section={section}
                {...sharedSectionProps}
                primaryColor={primaryColor}
              />
            );
        }
  };

  /**
   * Sections into sheets.
   *
   * A section opens a new sheet unless it is marked to continue, in which case
   * its body is appended to the sheet before it. Nothing is forced together:
   * @react-pdf flows content, so a continuing section fills whatever space is
   * left and spills onto the next page by itself if there isn't any. The
   * toggle is really "don't force a break here".
   *
   * The cover page never joins a group — it has its own layout, no running
   * header, and is the one page that should never have something land on it.
   */
  const ALWAYS_STANDALONE = new Set(['cover_page']);

  // Asked here rather than inside the component: a section that returns null
  // from its own render is too late — the sheet already exists, and you get a
  // page with a header, a footer and nothing between them.
  const willRender = (section: ProposalSection): boolean =>
    section.sectionType !== 'summary' || summaryHasContent(section, !hasPaymentSchedule);

  const pageGroups: ProposalSection[][] = [];
  for (const section of sortedSections.filter(willRender)) {
    const prev = pageGroups[pageGroups.length - 1];
    const startsNew =
      !prev ||
      ALWAYS_STANDALONE.has(section.sectionType) ||
      ALWAYS_STANDALONE.has(prev[0].sectionType) ||
      (section.content as Record<string, unknown> | null)?.startOnNewPage !== false;
    if (startsNew) pageGroups.push([section]);
    else prev.push(section);
  }

  return (
    <Document>
      {pageGroups.map((group) => {
        // The cover page renders its own <Page>: a different layout entirely.
        if (ALWAYS_STANDALONE.has(group[0].sectionType)) {
          return group.map((section) => bodyFor(section));
        }

        const bodies = group
          .map((section) => ({ section, body: bodyFor(section, group.length > 1) }))
          .filter((entry) => entry.body !== null);
        if (bodies.length === 0) return null;

        return (
          <SectionPage
            key={group[0].id}
            companyName={resolvedCompanyName}
            companyPhone={companyPhone}
            logoUrl={effectiveLogo}
            proposalNumber={proposal.proposalNumber}
            proposalName={proposal.name}
            brandColor={resolvedColor}
            docStyle={documentStyle}
            // One sheet, one footer: the first section in the group owns it.
            showFooter={footerFor(group[0])}
            headerStyle={layout?.pageHeader ?? 'full'}
          >
            {bodies.map((entry, i) => (
              <View key={entry.section.id}>
                {i > 0 && <SectionDivider brandColor={resolvedColor} />}
                {entry.body}
              </View>
            ))}
          </SectionPage>
        );
      })}
    </Document>
  );
}
