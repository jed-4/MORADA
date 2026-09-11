import { Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import type { Proposal, ProposalSection } from '@shared/schema';
import { sharedSectionStyle, htmlToBlocks, SectionIntro } from './RichTextBlocks';
import { DocProposalInnerHeader } from '@/components/pdf/shared/DocProposalInnerHeader';
import { DocFooter } from '@/components/pdf/shared/DocFooter';
import { registerPdfFonts, PDF_FONT_FAMILY } from "@/components/pdf/shared/registerPdfFonts";
import { PDF_COLORS } from "@/components/pdf/shared/pdfTokens";

registerPdfFonts();

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
  primaryColor = PDF_COLORS.brandFallback,
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
      color: PDF_COLORS.inkMuted,
      textAlign: 'center',
      marginBottom: 8,
      maxWidth: 420,
    },
  });

  return (
    <Page
      size="A4"
      style={{ paddingBottom: 60, fontFamily: PDF_FONT_FAMILY, backgroundColor: '#ffffff' }}
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
      <DocFooter
        companyName={companyName}
        brandColor={resolvedColor}
        docStyle={documentStyle}
      />
    </Page>
  );
}
