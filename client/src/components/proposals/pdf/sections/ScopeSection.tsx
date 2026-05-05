import { Page, Text, View } from '@react-pdf/renderer';
import type { Proposal, ProposalSection } from '@shared/schema';
import { PageHeader, PageFooter, RichTextBlocks, sharedPageStyle, sharedSectionStyle } from './RichTextBlocks';

interface ScopeSectionProps {
  proposal: Proposal;
  section: ProposalSection;
  companyName?: string;
  primaryColor?: string;
}

export function ScopeSection({ proposal, section, companyName, primaryColor = '#3B82F6' }: ScopeSectionProps) {
  const content = (section.content as Record<string, unknown>) || {};
  const isCoverLetter = section.sectionType === 'cover_letter';
  const html =
    (content.scopeText as string) ||
    (content.letterText as string) ||
    (content.customText as string) ||
    '';
  const defaultTitle = isCoverLetter ? 'Cover Letter' : 'Scope of Work';
  const emptyMessage = isCoverLetter ? 'No cover letter content provided.' : 'No scope content provided.';
  return (
    <Page size="A4" style={sharedPageStyle}>
      <PageHeader
        proposalName={proposal.name}
        proposalNumber={proposal.proposalNumber}
        expiryDate={proposal.expiryDate as Date | string | null}
        primaryColor={primaryColor}
      />
      <View style={sharedSectionStyle.section}>
        <Text style={[sharedSectionStyle.sectionTitle, { color: primaryColor }]}>{section.name || defaultTitle}</Text>
        {html ? (
          <RichTextBlocks html={html} />
        ) : (
          <Text style={sharedSectionStyle.muted}>{emptyMessage}</Text>
        )}
      </View>
      <PageFooter companyName={companyName} primaryColor={primaryColor} />
    </Page>
  );
}
