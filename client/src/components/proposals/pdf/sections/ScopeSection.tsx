import { Page, Text, View } from '@react-pdf/renderer';
import type { Proposal, ProposalSection } from '@shared/schema';
import { RichTextBlocks, sharedSectionStyle } from './RichTextBlocks';
import { DocProposalInnerHeader } from '@/components/pdf/shared/DocProposalInnerHeader';
import { DocFooter } from '@/components/pdf/shared/DocFooter';

interface ScopeSectionProps {
  proposal: Proposal;
  section: ProposalSection;
  companyName?: string;
  companyPhone?: string;
  logoUrl?: string;
  primaryColor?: string;
  brandColor?: string;
  documentStyle?: 'style1' | 'style2';
}

export function ScopeSection({
  proposal,
  section,
  companyName,
  companyPhone,
  logoUrl,
  primaryColor = '#3B82F6',
  brandColor,
  documentStyle = 'style1',
}: ScopeSectionProps) {
  const resolvedColor = brandColor ?? primaryColor;
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
    <Page
      size="A4"
      style={{ paddingBottom: 60, fontFamily: 'Helvetica', backgroundColor: '#ffffff' }}
    >
      <DocProposalInnerHeader
        companyName={companyName}
        companyPhone={companyPhone}
        logoUrl={logoUrl}
        proposalNumber={proposal.proposalNumber}
        proposalName={proposal.name}
        brandColor={resolvedColor}
        docStyle={documentStyle}
      />
      <View style={{ paddingHorizontal: 40 }}>
        <View style={sharedSectionStyle.section}>
          <Text style={[sharedSectionStyle.sectionTitle, { color: resolvedColor }]}>
            {section.name || defaultTitle}
          </Text>
          {html ? (
            <RichTextBlocks html={html} />
          ) : (
            <Text style={sharedSectionStyle.muted}>{emptyMessage}</Text>
          )}
        </View>
      </View>
      <DocFooter
        companyName={companyName}
        brandColor={resolvedColor}
        docStyle={documentStyle}
      />
    </Page>
  );
}
