import { Text, View } from '@react-pdf/renderer';
import type { Proposal, ProposalSection } from '@shared/schema';
import { RichTextBlocks, sharedSectionStyle, SectionIntro } from './RichTextBlocks';

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
  primaryColor = '#3B82F6',
  brandColor,
  documentStyle = 'style1',
  showFooter,
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
      <View style={{ paddingHorizontal: 40 }}>
        <View style={sharedSectionStyle.section}>
          <Text minPresenceAhead={60} style={[sharedSectionStyle.sectionTitle, { color: resolvedColor }]}>
            {section.name || defaultTitle}
          </Text>
          <SectionIntro section={section} />
          {html ? (
            <RichTextBlocks html={html} />
          ) : (
            <Text style={sharedSectionStyle.muted}>{emptyMessage}</Text>
          )}
        </View>
      </View>
  );
}
