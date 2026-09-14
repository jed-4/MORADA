import { Text, View } from '@react-pdf/renderer';
import type { Proposal, ProposalSection } from '@shared/schema';
import { RichTextBlocks, sharedSectionStyle, SectionIntro } from './RichTextBlocks';
import { PDF_COLORS } from "@/components/pdf/shared/pdfTokens";
import { resolveSectionTextStyle } from "../sectionTextStyle";

interface ScopeSectionProps {
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

export function ScopeSection({
  proposal,
  section,
  companyName,
  companyPhone,
  logoUrl,
  primaryColor = PDF_COLORS.brandFallback,
  brandColor,
  documentStyle = 'style1',
  showFooter,
}: ScopeSectionProps) {
  const resolvedColor = brandColor ?? primaryColor;
  const content = (section.content as Record<string, unknown>) || {};
  const textStyle = resolveSectionTextStyle(content);
  const isCoverLetter = section.sectionType === 'cover_letter';
  const html =
    (content.scopeText as string) ||
    (content.letterText as string) ||
    (content.customText as string) ||
    '';
  const defaultTitle = isCoverLetter ? 'Cover Letter' : 'Scope of Work';
  const emptyMessage = isCoverLetter ? 'No cover letter content provided.' : 'No scope content provided.';

  return (
      <View style={{ paddingHorizontal: 40 }}>
        <View style={sharedSectionStyle.section}>
          <Text minPresenceAhead={60} style={[sharedSectionStyle.sectionTitle, { color: resolvedColor }]}>
            {section.name || defaultTitle}
          </Text>
          <SectionIntro section={section} textStyle={textStyle} />
          {html ? (
            <RichTextBlocks html={html} textStyle={textStyle} />
          ) : (
            <Text style={sharedSectionStyle.muted}>{emptyMessage}</Text>
          )}
        </View>
      </View>
  );
}
