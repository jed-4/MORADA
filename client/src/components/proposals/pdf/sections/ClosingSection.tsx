import { Text, View, StyleSheet } from '@react-pdf/renderer';
import { PDF_COLORS } from "@/components/pdf/shared/pdfTokens";
import type { Proposal, ProposalSection } from '@shared/schema';
import { sharedSectionStyle, htmlToBlocks, SectionIntro } from './RichTextBlocks';

interface ClosingSectionProps {
  proposal: Proposal;
  section: ProposalSection;
  companyName?: string;
  companyPhone?: string;
  logoUrl?: string;
  primaryColor?: string;
  brandColor?: string;
  documentStyle?: 'style1' | 'style2';
  showFooter?: boolean;
}

export function ClosingSection({
  proposal,
  section,
  companyName,
  companyPhone,
  logoUrl,
  primaryColor = PDF_COLORS.brandFallback,
  brandColor,
  documentStyle = 'style1',
  showFooter,
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
      color: PDF_COLORS.inkMuted,
      textAlign: 'center',
      marginBottom: 8,
      maxWidth: 420,
    },
  });

  return (
      <View style={{ paddingHorizontal: 40 }}>
        <View style={sharedSectionStyle.section}>
          <Text minPresenceAhead={60} style={[sharedSectionStyle.sectionTitle, { color: resolvedColor, textAlign: 'center' }]}>
            {section.name || 'Closing'}
          </Text>
          <SectionIntro section={section} />
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
  );
}
