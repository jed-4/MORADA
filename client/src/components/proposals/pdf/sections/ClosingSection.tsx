import { Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import type { Proposal, ProposalSection } from '@shared/schema';
import { PageHeader, PageFooter, sharedPageStyle, sharedSectionStyle, htmlToBlocks } from './RichTextBlocks';

interface ClosingSectionProps {
  proposal: Proposal;
  section: ProposalSection;
  companyName?: string;
  primaryColor?: string;
}

export function ClosingSection({ proposal, section, companyName, primaryColor = '#3B82F6' }: ClosingSectionProps) {
  const content = (section.content as Record<string, unknown>) || {};
  const html = (content.closingText as string) || (content.letterText as string) || '';
  // Closing copy is rendered with centred, slightly larger, subdued type
  // rather than the standard rich-text body so it reads as a sign-off.
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
    <Page size="A4" style={sharedPageStyle}>
      <PageHeader
        proposalName={proposal.name}
        proposalNumber={proposal.proposalNumber}
        expiryDate={proposal.expiryDate}
        primaryColor={primaryColor}
      />
      <View style={sharedSectionStyle.section}>
        <Text style={[sharedSectionStyle.sectionTitle, { color: primaryColor, textAlign: 'center' }]}>
          {section.name || 'Closing'}
        </Text>
        {blocks.length > 0 ? (
          <View style={styles.body}>
            {blocks.map((b, i) => (
              <Text key={i} style={styles.paragraph}>{b.text}</Text>
            ))}
          </View>
        ) : (
          <Text style={[sharedSectionStyle.muted, { textAlign: 'center' }]}>No closing content provided.</Text>
        )}
      </View>
      <PageFooter companyName={companyName} primaryColor={primaryColor} />
    </Page>
  );
}
