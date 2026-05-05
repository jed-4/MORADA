import { Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import type { Proposal, ProposalSection } from '@shared/schema';
import { PageHeader, PageFooter, RichTextBlocks, sharedPageStyle, sharedSectionStyle } from './RichTextBlocks';

interface InclusionsExclusionsSectionProps {
  proposal: Proposal;
  section: ProposalSection;
  companyName?: string;
  primaryColor?: string;
}

export function InclusionsExclusionsSection({
  proposal,
  section,
  companyName,
  primaryColor = '#3B82F6',
}: InclusionsExclusionsSectionProps) {
  const content = (section.content as Record<string, unknown>) || {};
  const inclusionsHtml = (content.inclusionsText as string) || '';
  const exclusionsHtml = (content.exclusionsText as string) || '';

  // Two-column layout per spec — Inclusions on the left, Exclusions on the
  // right, separated by a thin divider so each side stays scannable.
  const styles = StyleSheet.create({
    columns: { flexDirection: 'row', marginTop: 8, gap: 16 },
    column: { flex: 1 },
    columnTitle: {
      fontSize: 13,
      fontWeight: 'bold',
      marginBottom: 6,
      color: primaryColor,
      borderBottom: `1px solid ${primaryColor}`,
      paddingBottom: 4,
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
        <Text style={[sharedSectionStyle.sectionTitle, { color: primaryColor }]}>
          {section.name || 'Inclusions & Exclusions'}
        </Text>

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
      <PageFooter companyName={companyName} primaryColor={primaryColor} />
    </Page>
  );
}
