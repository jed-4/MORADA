import { Text, View, StyleSheet } from '@react-pdf/renderer';
import { PDF_COLORS } from "@/components/pdf/shared/pdfTokens";
import type { Proposal, ProposalSection } from '@shared/schema';
import { RichTextBlocks, sharedSectionStyle, SectionIntro } from './RichTextBlocks';
import { PDF_FONT_FAMILY } from "@/components/pdf/shared/registerPdfFonts";

interface SummarySectionProps {
  proposal: Proposal;
  section: ProposalSection;
  companyName?: string;
  companyPhone?: string;
  logoUrl?: string;
  primaryColor?: string;
  brandColor?: string;
  documentStyle?: 'style1' | 'style2';
  showFooter?: boolean;
  showGst?: boolean;
  /**
   * Live figures from the linked estimate. The stored proposal columns are only
   * written on send, so without these every draft summarised itself as $0.00
   * under an estimate table showing real money.
   */
  totals?: { subtotalCents: number; gstCents: number; totalCents: number };
  /**
   * False when a payment schedule is in the document: it carries the contract
   * price above its milestones, and printing the same three figures twice
   * invites the reader to look for the difference.
   */
  showTotals?: boolean;
}

const formatCurrency = (cents: number) =>
  `$${(cents / 100).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Whether a Summary section has anything to print.
 *
 * With the figures on the payment schedule, a Summary that was only ever its
 * totals has nothing left to say, and every existing proposal has one — so
 * without this they all gained a page holding a heading and white space.
 *
 * ProposalDocument has to ask this BEFORE it opens a sheet: returning null
 * from inside the component is too late, the page already exists.
 */
export function summaryHasContent(
  section: { content?: unknown; description?: string | null; descriptionHtml?: string | null },
  showTotals: boolean,
): boolean {
  if (showTotals) return true;
  const strip = (v: string | null | undefined) => (v ?? '').replace(/<[^>]*>/g, '').trim();
  const body = ((section.content as Record<string, unknown> | null)?.summaryText as string) || '';
  return (
    strip(body).length > 0 ||
    strip(section.descriptionHtml).length > 0 ||
    strip(section.description).length > 0
  );
}

export function SummarySection({
  proposal,
  section,
  companyName,
  companyPhone,
  logoUrl,
  primaryColor = '#3B82F6',
  brandColor,
  documentStyle = 'style1',
  showFooter,
  showGst = true,
  totals,
  showTotals = true,
}: SummarySectionProps) {
  const resolvedColor = brandColor ?? primaryColor;
  const isS2 = documentStyle === 'style2';

  const content = (section.content as Record<string, unknown>) || {};
  const html = (content.summaryText as string) || '';

  if (!summaryHasContent(section, showTotals)) return null;

  const subtotal = totals?.subtotalCents ?? (Number(proposal.subtotal) || 0);
  const gst = totals?.gstCents ?? (Number(proposal.gstAmount) || 0);
  const total = totals?.totalCents ?? (Number(proposal.totalAmount) || subtotal + gst);

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
    label: { fontSize: 11, color: PDF_COLORS.inkMuted },
    value: { fontSize: 11, color: PDF_COLORS.ink },
    grandRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingTop: 8,
      marginTop: 4,
      borderTop: `1px solid ${resolvedColor}`,
    },
    grandLabel: {
      fontSize: 14,
      fontFamily: PDF_FONT_FAMILY, fontWeight: 700,
      color: PDF_COLORS.ink,
    },
    grandValue: {
      fontSize: 14,
      fontFamily: PDF_FONT_FAMILY, fontWeight: 700,
      color: resolvedColor,
    },
  });

  return (
      <View style={{ paddingHorizontal: 40 }}>
        <View style={sharedSectionStyle.section}>
          <Text minPresenceAhead={60} style={[sharedSectionStyle.sectionTitle, { color: resolvedColor }]}>
            {section.name || 'Summary'}
          </Text>
          <SectionIntro section={section} />
          {html ? <RichTextBlocks html={html} /> : null}

          {showTotals && (
          <View wrap={false} style={styles.totalsWrap}>
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
          )}
        </View>
      </View>
  );
}
