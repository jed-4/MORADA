import { Text, View, StyleSheet } from '@react-pdf/renderer';
import type { Proposal, ProposalSection } from '@shared/schema';
import { RichTextBlocks, sharedSectionStyle, SectionIntro } from './RichTextBlocks';
import { PDF_COLORS } from "@/components/pdf/shared/pdfTokens";

interface InclusionsExclusionsSectionProps {
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

export function InclusionsExclusionsSection({
  proposal,
  section,
  companyName,
  companyPhone,
  logoUrl,
  primaryColor = PDF_COLORS.brandFallback,
  brandColor,
  documentStyle = 'style1',
  showFooter,
}: InclusionsExclusionsSectionProps) {
  const resolvedColor = brandColor ?? primaryColor;
  const isS2 = documentStyle === 'style2';
  const content = (section.content as Record<string, unknown>) || {};
  const inclusionsHtml = (content.inclusionsText as string) || '';
  const exclusionsHtml = (content.exclusionsText as string) || '';

  const styles = StyleSheet.create({
    columns: { flexDirection: 'row', marginTop: 8, gap: 16 },
    column: { flex: 1 },
    columnTitle: {
      fontSize: 13,
      fontWeight: 'bold',
      marginBottom: 6,
      color: resolvedColor,
      borderBottom: `${isS2 ? 2 : 1}px solid ${resolvedColor}`,
      paddingBottom: 4,
    },
  });

  return (
      <View style={{ paddingHorizontal: 40 }}>
        <View style={sharedSectionStyle.section}>
          <Text minPresenceAhead={60} style={[sharedSectionStyle.sectionTitle, { color: resolvedColor }]}>
            {section.name || 'Inclusions & Exclusions'}
          </Text>
          <SectionIntro section={section} />

          <View style={styles.columns}>
            <View style={styles.column}>
              <Text style={styles.columnTitle}>Inclusions</Text>
              {inclusionsHtml ? (
                <RichTextBlocks html={inclusionsHtml} />
              ) : (
                <Text style={sharedSectionStyle.muted}>No inclusions specified.</Text>
              )}
            </View>

            <View style={styles.column}>
              <Text style={styles.columnTitle}>Exclusions</Text>
              {exclusionsHtml ? (
                <RichTextBlocks html={exclusionsHtml} />
              ) : (
                <Text style={sharedSectionStyle.muted}>No exclusions specified.</Text>
              )}
            </View>
          </View>
        </View>
      </View>
  );
}
