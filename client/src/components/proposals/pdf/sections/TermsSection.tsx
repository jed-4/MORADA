import { Page, Text, View } from '@react-pdf/renderer';
import type { Proposal, ProposalSection } from '@shared/schema';
import { RichTextBlocks, sharedSectionStyle, SectionIntro } from './RichTextBlocks';
import { DocProposalInnerHeader } from '@/components/pdf/shared/DocProposalInnerHeader';
import { DocFooter } from '@/components/pdf/shared/DocFooter';
import { registerPdfFonts, PDF_FONT_FAMILY } from "@/components/pdf/shared/registerPdfFonts";
import { PDF_COLORS } from "@/components/pdf/shared/pdfTokens";

registerPdfFonts();

interface TermsSectionProps {
  proposal: Proposal;
  section: ProposalSection;
  companyName?: string;
  companyPhone?: string;
  logoUrl?: string;
  primaryColor?: string;
  brandColor?: string;
  documentStyle?: 'style1' | 'style2';
}

export function TermsSection({
  proposal,
  section,
  companyName,
  companyPhone,
  logoUrl,
  primaryColor = PDF_COLORS.brandFallback,
  brandColor,
  documentStyle = 'style1',
}: TermsSectionProps) {
  const resolvedColor = brandColor ?? primaryColor;
  const content = (section.content as Record<string, unknown>) || {};
  const html = (content.termsText as string) || '';

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
          <Text style={sharedSectionStyle.sectionTitle}>
            {section.name || 'Terms & Conditions'}
          </Text>
          <SectionIntro section={section} />
          {html ? (
            <RichTextBlocks html={html} />
          ) : (
            <Text style={sharedSectionStyle.muted}>No terms provided.</Text>
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
