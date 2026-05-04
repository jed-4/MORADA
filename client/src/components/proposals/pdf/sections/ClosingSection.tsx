import { Page, Text, View } from '@react-pdf/renderer';
import type { Proposal, ProposalSection } from '@shared/schema';
import { PageHeader, PageFooter, RichTextBlocks, sharedPageStyle, sharedSectionStyle } from './RichTextBlocks';

interface ClosingSectionProps {
  proposal: Proposal;
  section: ProposalSection;
  companyName?: string;
  primaryColor?: string;
}

export function ClosingSection({ proposal, section, companyName, primaryColor = '#3B82F6' }: ClosingSectionProps) {
  const content = (section.content as Record<string, unknown>) || {};
  const html = (content.closingText as string) || (content.letterText as string) || '';
  return (
    <Page size="A4" style={sharedPageStyle}>
      <PageHeader
        proposalName={proposal.name}
        proposalNumber={proposal.proposalNumber}
        expiryDate={proposal.expiryDate as any}
        primaryColor={primaryColor}
      />
      <View style={sharedSectionStyle.section}>
        <Text style={sharedSectionStyle.sectionTitle}>{section.name || 'Closing'}</Text>
        {html ? (
          <RichTextBlocks html={html} />
        ) : (
          <Text style={sharedSectionStyle.muted}>No closing content provided.</Text>
        )}
      </View>
      <PageFooter companyName={companyName} primaryColor={primaryColor} />
    </Page>
  );
}
