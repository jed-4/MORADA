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

  const styles = StyleSheet.create({
    column: { marginBottom: 16 },
    columnTitle: { fontSize: 13, fontWeight: 'bold', marginBottom: 6, color: '#1F2937' },
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
        <Text style={sharedSectionStyle.sectionTitle}>{section.name || 'Inclusions & Exclusions'}</Text>

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
      <PageFooter companyName={companyName} primaryColor={primaryColor} />
    </Page>
  );
}
