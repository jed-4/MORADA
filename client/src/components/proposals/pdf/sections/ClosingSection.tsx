import { Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import type { Proposal, ProposalSection } from '@shared/schema';
import { sharedSectionStyle, htmlToBlocks } from './RichTextBlocks';
import { DocProposalInnerHeader } from '@/components/pdf/shared/DocProposalInnerHeader';
import { DocFooter } from '@/components/pdf/shared/DocFooter';

interface ClosingSectionProps {
  proposal: Proposal;
  section: ProposalSection;
  companyName?: string;
  companyPhone?: string;
  logoUrl?: string;
  primaryColor?: string;
  brandColor?: string;
  documentStyle?: 'style1' | 'style2';
}

export function ClosingSection({
  proposal,
  section,
  companyName,
  companyPhone,
  logoUrl,
  primaryColor = '#3B82F6',
  brandColor,
  documentStyle = 'style1',
}: ClosingSectionProps) {
  const resolvedColor = brandColor ?? primaryColor;
  const content = (section.content as Record<string, unknown>) || {};
  const html = (content.closingText as string) || (content.letterText as string) || '';
  const blocks = htmlToBlocks(html);

  const styles = StyleSheet.create({
    body: { marginTop: 12, alignItems: 'center' },
    paragraph: {
      fontSize: 14,
      lineHeight: 1.6,
      color: '#4B5563',
      textAlign: 'center',
      marginBottom: 8,
      maxWidth: 420,
    },
  });

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
          <Text style={[sharedSectionStyle.sectionTitle, { color: resolvedColor, textAlign: 'center' }]}>
            {section.name || 'Closing'}
          </Text>
          {blocks.length > 0 ? (
            <View style={styles.body}>
              {blocks.map((b, i) => (
                <Text key={i} style={styles.paragraph}>{b.text}</Text>
              ))}
            </View>
          ) : (
            <Text style={[sharedSectionStyle.muted, { textAlign: 'center' }]}>
              No closing content provided.
            </Text>
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
