import { Text, View } from '@react-pdf/renderer';
import type { Proposal, ProposalSection } from '@shared/schema';
import { RichTextBlocks, sharedSectionStyle, SectionIntro } from './RichTextBlocks';
import { PDF_COLORS } from "@/components/pdf/shared/pdfTokens";

interface TermsSectionProps {
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

export function TermsSection({
  proposal,
  section,
  companyName,
  companyPhone,
  logoUrl,
  primaryColor = PDF_COLORS.brandFallback,
  brandColor,
  documentStyle = 'style1',
  showFooter,
}: TermsSectionProps) {
  const resolvedColor = brandColor ?? primaryColor;
  const content = (section.content as Record<string, unknown>) || {};
  const html = (content.termsText as string) || '';

  return (
      <View style={{ paddingHorizontal: 40 }}>
        <View style={sharedSectionStyle.section}>
          <Text minPresenceAhead={60} style={sharedSectionStyle.sectionTitle}>
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
  );
}
