import { Page, Text, View } from '@react-pdf/renderer';
import type { Proposal, ProposalSection } from '@shared/schema';
import { PageHeader, PageFooter, RichTextBlocks, sharedPageStyle, sharedSectionStyle } from './RichTextBlocks';

interface SummarySectionProps {
  proposal: Proposal;
  section: ProposalSection;
  companyName?: string;
  primaryColor?: string;
}

export function SummarySection({ proposal, section, companyName, primaryColor = '#3B82F6' }: SummarySectionProps) {
  const content = (section.content as Record<string, unknown>) || {};
  const html = (content.summaryText as string) || '';
  return (
    <Page size="A4" style={sharedPageStyle}>
      <PageHeader
        proposalName={proposal.name}
        proposalNumber={proposal.proposalNumber}
        expiryDate={proposal.expiryDate as any}
        primaryColor={primaryColor}
      />
      <View style={sharedSectionStyle.section}>
        <Text style={sharedSectionStyle.sectionTitle}>{section.name || 'Summary'}</Text>
        {html ? (
          <RichTextBlocks html={html} />
        ) : (
          <Text style={sharedSectionStyle.muted}>No summary content provided.</Text>
        )}
      </View>
      <PageFooter companyName={companyName} primaryColor={primaryColor} />
    </Page>
  );
}
