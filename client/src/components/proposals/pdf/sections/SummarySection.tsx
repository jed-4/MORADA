import { Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import type { Proposal, ProposalSection } from '@shared/schema';
import { RichTextBlocks, sharedSectionStyle } from './RichTextBlocks';
import { DocProposalInnerHeader } from '@/components/pdf/shared/DocProposalInnerHeader';
import { DocFooter } from '@/components/pdf/shared/DocFooter';

interface SummarySectionProps {
  proposal: Proposal;
  section: ProposalSection;
  companyName?: string;
  companyPhone?: string;
  logoUrl?: string;
  primaryColor?: string;
  brandColor?: string;
  documentStyle?: 'style1' | 'style2';
  showGst?: boolean;
}

const formatCurrency = (cents: number) =>
  `$${(cents / 100).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function SummarySection({
  proposal,
  section,
  companyName,
  companyPhone,
  logoUrl,
  primaryColor = '#3B82F6',
  brandColor,
  documentStyle = 'style1',
  showGst = true,
}: SummarySectionProps) {
  const resolvedColor = brandColor ?? primaryColor;
  const isS2 = documentStyle === 'style2';

  const content = (section.content as Record<string, unknown>) || {};
  const html = (content.summaryText as string) || '';

  const subtotal = Number(proposal.subtotal) || 0;
  const gst = Number(proposal.gstAmount) || 0;
  const total = Number(proposal.totalAmount) || subtotal + gst;

  const styles = StyleSheet.create({
    totalsWrap: {
      marginTop: 16,
      ...(isS2
        ? {
            backgroundColor: resolvedColor + '0d',
            borderRadius: 5,
            padding: 16,
            borderLeftWidth: 3,
            borderLeftColor: resolvedColor,
          }
        : {
            paddingTop: 12,
            borderTop: `1px solid ${resolvedColor}`,
          }),
    },
    row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
    label: { fontSize: 11, color: '#374151' },
    value: { fontSize: 11, color: '#1F2937' },
    grandRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingTop: 8,
      marginTop: 4,
      borderTop: `1px solid ${resolvedColor}`,
    },
    grandLabel: {
      fontSize: 14,
      fontFamily: 'Helvetica-Bold',
      color: '#1F2937',
    },
    grandValue: {
      fontSize: 14,
      fontFamily: 'Helvetica-Bold',
      color: resolvedColor,
    },
  });

  return (
    <Page
      size="A4"
      style={{ paddingBottom: 60, fontFamily: 'Helvetica', backgroundColor: '#ffffff' }}
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
          <Text style={[sharedSectionStyle.sectionTitle, { color: resolvedColor }]}>
            {section.name || 'Summary'}
          </Text>
          {html ? <RichTextBlocks html={html} /> : null}

          <View style={styles.totalsWrap}>
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
      </View>
      <DocFooter
        companyName={companyName}
        brandColor={resolvedColor}
        docStyle={documentStyle}
      />
    </Page>
  );
}
