import { Text, View, StyleSheet } from '@react-pdf/renderer';
import { PDF_COLORS } from "@/components/pdf/shared/pdfTokens";
import type { Proposal, ProposalSection } from '@shared/schema';
import { sharedSectionStyle, htmlToBlocks, SectionIntro } from './RichTextBlocks';
import { resolveSectionTextStyle, scaleFont } from "../sectionTextStyle";

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

  /* This section used to be hard-coded to 14pt centred in a 420pt column — a
     sign-off card, not a body of text. It reads badly the moment there is more
     than a sentence, and there was no way to change it. Now it is the ordinary
     section text style, defaulting to left like every other section; centring
     is still one choice away in the builder. */
  const textStyle = resolveSectionTextStyle(content);
  const centred = textStyle.align === 'center';

  const styles = StyleSheet.create({
    // Centred text needs a narrow measure, so the column shrinks to it. Every
    // other alignment needs the OPPOSITE: a paragraph that only spans its own
    // text has nowhere to move, and `textAlign: right` silently does nothing.
    body: { marginTop: 12, alignItems: centred ? 'center' : 'stretch' },
    paragraph: {
      fontSize: scaleFont(11, textStyle),
      fontFamily: textStyle.fontFamily,
      lineHeight: 1.6,
      color: PDF_COLORS.inkMuted,
      textAlign: textStyle.align,
      marginBottom: 8,
      // The narrow measure is what makes a centred sign-off read as one. Left
      // aligned it just orphans the right half of the page.
      ...(centred ? { maxWidth: 420 } : null),
    },
  });

  return (
      <View style={{ paddingHorizontal: 40 }}>
        <View style={sharedSectionStyle.section}>
          <Text minPresenceAhead={60} style={[sharedSectionStyle.sectionTitle, { color: resolvedColor, textAlign: textStyle.align }]}>
            {section.name || 'Closing'}
          </Text>
          <SectionIntro section={section} textStyle={textStyle} />
          {blocks.length > 0 ? (
            <View style={styles.body}>
              {blocks.map((b, i) => (
                <Text key={i} style={styles.paragraph}>{b.text}</Text>
              ))}
            </View>
          ) : (
            <Text style={[sharedSectionStyle.muted, { textAlign: textStyle.align }]}>
              No closing content provided.
            </Text>
          )}
        </View>
      </View>
  );
}
