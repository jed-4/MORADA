import { Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import type { Proposal, ProposalSection } from '@shared/schema';
import { PageHeader, PageFooter, RichTextBlocks, sharedPageStyle, sharedSectionStyle } from './RichTextBlocks';

interface SummarySectionProps {
  proposal: Proposal;
  section: ProposalSection;
  companyName?: string;
  primaryColor?: string;
  showGst?: boolean;
}

const formatCurrency = (cents: number) =>
  `$${(cents / 100).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function SummarySection({
  proposal,
  section,
  companyName,
  primaryColor = '#3B82F6',
  showGst = true,
}: SummarySectionProps) {
  const content = (section.content as Record<string, unknown>) || {};
  const html = (content.summaryText as string) || '';

  const subtotal = Number(proposal.subtotal) || 0;
  const gst = Number(proposal.gstAmount) || 0;
  const total = Number(proposal.totalAmount) || subtotal + gst;

  const styles = StyleSheet.create({
    totals: {
      marginTop: 16,
      paddingTop: 12,
      borderTop: `1px solid ${primaryColor}`,
    },
    row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
    label: { fontSize: 11, color: '#374151' },
    value: { fontSize: 11, color: '#1F2937' },
    grandRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingTop: 8,
      marginTop: 4,
      borderTop: `1px solid ${primaryColor}`,
    },
    grandLabel: { fontSize: 14, fontWeight: 'bold', color: '#1F2937' },
    grandValue: { fontSize: 14, fontWeight: 'bold', color: primaryColor },
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
        <Text style={[sharedSectionStyle.sectionTitle, { color: primaryColor }]}>{section.name || 'Summary'}</Text>
        {html ? <RichTextBlocks html={html} /> : null}

        <View style={styles.totals}>
          {showGst ? (
            <>
              <View style={styles.row}>
                <Text style={styles.label}>Subtotal (ex GST)</Text>
                <Text style={styles.value}>{formatCurrency(subtotal)}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.label}>GST (10%)</Text>
                <Text style={styles.value}>{formatCurrency(gst)}</Text>
              </View>
              <View style={styles.grandRow}>
                <Text style={styles.grandLabel}>Total (inc GST)</Text>
                <Text style={styles.grandValue}>{formatCurrency(total)}</Text>
              </View>
            </>
          ) : (
            <View style={styles.grandRow}>
              <Text style={styles.grandLabel}>Total</Text>
              <Text style={styles.grandValue}>{formatCurrency(total)}</Text>
            </View>
          )}
        </View>
      </View>
      <PageFooter companyName={companyName} primaryColor={primaryColor} />
    </Page>
  );
}
