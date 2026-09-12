import { Text, View, StyleSheet } from '@react-pdf/renderer';
import { PDF_COLORS } from "@/components/pdf/shared/pdfTokens";
import type { Proposal, ProposalSection, ProposalPaymentMilestone } from '@shared/schema';
import { RichTextBlocks, sharedSectionStyle, SectionIntro } from './RichTextBlocks';
import { tintOnWhite } from "@/components/pdf/shared/pdfColor";
import { PDF_FONT_FAMILY } from "@/components/pdf/shared/registerPdfFonts";

interface PaymentScheduleSectionProps {
  proposal: Proposal;
  section: ProposalSection;
  milestones: ProposalPaymentMilestone[];
  companyName?: string;
  companyPhone?: string;
  logoUrl?: string;
  primaryColor?: string;
  brandColor?: string;
  documentStyle?: 'style1' | 'style2';
  showFooter?: boolean;
  showGst?: boolean;
  /**
   * The contract price. The schedule is percentages OF this, so the two belong
   * on one page — and deriving milestones from `proposal.totalAmount`, written
   * only on send, printed a column of $0.00 on every draft.
   */
  totals?: { subtotalCents: number; gstCents: number; totalCents: number };
}

const formatCurrency = (cents: number) =>
  `$${(cents / 100).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function PaymentScheduleSection({
  proposal,
  section,
  milestones,
  companyName,
  companyPhone,
  logoUrl,
  primaryColor = PDF_COLORS.brandFallback,
  brandColor,
  documentStyle = 'style1',
  showFooter,
  showGst = true,
  totals,
}: PaymentScheduleSectionProps) {
  const resolvedColor = brandColor ?? primaryColor;
  const isS2 = documentStyle === 'style2';
  const content = (section.content as Record<string, unknown>) || {};
  const html = (content.scheduleText as string) || '';

  const headerBorderColor = isS2 ? tintOnWhite(resolvedColor, '60') : resolvedColor;

  const styles = StyleSheet.create({
    headerRow: {
      flexDirection: 'row',
      borderBottom: `1px solid ${headerBorderColor}`,
      paddingBottom: 4,
      marginBottom: 4,
      backgroundColor: isS2 ? resolvedColor + '0d' : 'transparent',
      paddingHorizontal: isS2 ? 6 : 0,
      paddingTop: isS2 ? 4 : 0,
    },
    row: { flexDirection: 'row', paddingVertical: 3, borderBottom: '1px solid #F3F4F6' },
    th: { fontWeight: 'bold', fontSize: 11 },
    name: { flex: 2, paddingRight: 8 },
    pct: { flex: 1, textAlign: 'right', paddingRight: 8 },
    // paddingLeft on desc: the right-aligned amount butted straight against
    // it, printing the header as "AmountDescription".
    amt: { flex: 1, textAlign: 'right', paddingRight: 8 },
    desc: { flex: 2, paddingLeft: 8 },
    totalRow: {
      flexDirection: 'row',
      marginTop: 8,
      paddingTop: 4,
      borderTop: `1px solid ${resolvedColor}`,
      backgroundColor: isS2 ? resolvedColor + '14' : 'transparent',
      paddingHorizontal: isS2 ? 6 : 0,
      paddingVertical: isS2 ? 4 : 0,
    },
    note: { marginTop: 10, fontSize: 9, fontStyle: 'italic', color: PDF_COLORS.inkMuted },
    priceWrap: {
      marginTop: 4,
      marginBottom: 18,
      ...(isS2
        ? {
            backgroundColor: resolvedColor + '0d',
            borderRadius: 5,
            padding: 14,
            borderLeftWidth: 3,
            borderLeftColor: resolvedColor,
          }
        : { paddingTop: 10, borderTop: `1px solid ${resolvedColor}` }),
    },
    priceRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
    priceLabel: { fontSize: 10, color: PDF_COLORS.inkMuted },
    priceValue: { fontSize: 10, color: PDF_COLORS.ink },
    grandRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingTop: 7,
      marginTop: 3,
      borderTop: `1px solid ${resolvedColor}`,
    },
    grandLabel: { fontSize: 13, fontFamily: PDF_FONT_FAMILY, fontWeight: 700, color: PDF_COLORS.ink },
    grandValue: { fontSize: 13, fontFamily: PDF_FONT_FAMILY, fontWeight: 700, color: resolvedColor },
  });

  const proposalTotalCents = totals?.totalCents ?? (Number(proposal.totalAmount) || 0);
  const subtotalCents = totals?.subtotalCents ?? (Number(proposal.subtotal) || 0);
  const gstCents = totals?.gstCents ?? (Number(proposal.gstAmount) || 0);
  const showContractPrice = proposalTotalCents > 0;
  const sortedMilestones = (() => {
    const rows = [...milestones]
      .sort((a, b) => a.order - b.order)
      .map((m) => {
        const pct = Number(m.percentage) || 0;
        const explicit = Number(m.amountCents) || 0;
        const derived = Math.round((proposalTotalCents * pct) / 100);
        return { ...m, _pct: pct, _amount: explicit > 0 ? explicit : derived, _derived: explicit <= 0 };
      });

    // Four milestones rounded independently summed to $3,321.74 under a
    // contract price of $3,321.73. A client reading a cent of daylight between
    // the two has every right to ask which one they owe, so the last derived
    // milestone absorbs the remainder.
    const derivedRows = rows.filter((r) => r._derived);
    if (derivedRows.length > 0) {
      const derivedPct = derivedRows.reduce((sum, r) => sum + r._pct, 0);
      const target = Math.round((proposalTotalCents * derivedPct) / 100);
      const actual = derivedRows.reduce((sum, r) => sum + r._amount, 0);
      derivedRows[derivedRows.length - 1]._amount += target - actual;
    }
    return rows;
  })();

  const totalPct = sortedMilestones.reduce((s, m) => s + m._pct, 0);
  const totalCents = sortedMilestones.reduce((s, m) => s + m._amount, 0);

  return (
      <View style={{ paddingHorizontal: 40 }}>
        <View style={sharedSectionStyle.section}>
          <Text minPresenceAhead={60} style={[sharedSectionStyle.sectionTitle, { color: resolvedColor }]}>
            {section.name || 'Payment Schedule'}
          </Text>
          <SectionIntro section={section} />
          {html ? <RichTextBlocks html={html} /> : null}

          {/* The contract price, then how it is paid. This used to be a page of
              its own headed "Summary" — three lines of figures and a page
              break, immediately before the schedule that divides them up. */}
          {showContractPrice && (
            <View wrap={false} style={styles.priceWrap}>
              {showGst ? (
                <>
                  <View style={styles.priceRow}>
                    <Text style={styles.priceLabel}>Subtotal (ex GST)</Text>
                    <Text style={styles.priceValue}>{formatCurrency(subtotalCents)}</Text>
                  </View>
                  <View style={styles.priceRow}>
                    <Text style={styles.priceLabel}>GST (10%)</Text>
                    <Text style={styles.priceValue}>{formatCurrency(gstCents)}</Text>
                  </View>
                  <View style={styles.grandRow}>
                    <Text style={styles.grandLabel}>Contract price (inc GST)</Text>
                    <Text style={styles.grandValue}>{formatCurrency(proposalTotalCents)}</Text>
                  </View>
                </>
              ) : (
                <View style={styles.grandRow}>
                  <Text style={styles.grandLabel}>Contract price</Text>
                  <Text style={styles.grandValue}>{formatCurrency(proposalTotalCents)}</Text>
                </View>
              )}
            </View>
          )}

          <View minPresenceAhead={90} style={{ marginTop: 8 }}>
            <View style={styles.headerRow}>
              <Text style={[styles.th, styles.name]}>Milestone</Text>
              <Text style={[styles.th, styles.pct]}>%</Text>
              <Text style={[styles.th, styles.amt]}>Amount</Text>
              <Text style={[styles.th, styles.desc]}>Description</Text>
            </View>
            {sortedMilestones.length === 0 ? (
              <Text style={sharedSectionStyle.muted}>No payment milestones defined.</Text>
            ) : (
              sortedMilestones.map((m) => (
                <View key={m.id} wrap={false} style={styles.row}>
                  <Text style={[sharedSectionStyle.text, styles.name]}>{m.name}</Text>
                  <Text style={[sharedSectionStyle.text, styles.pct]}>
                    {m._pct > 0 ? `${m._pct.toFixed(2)}%` : '—'}
                  </Text>
                  <Text style={[sharedSectionStyle.text, styles.amt]}>
                    {m._amount > 0 ? formatCurrency(m._amount) : '—'}
                  </Text>
                  <Text style={[sharedSectionStyle.text, styles.desc]}>{m.description || '—'}</Text>
                </View>
              ))
            )}
            {sortedMilestones.length > 0 && (
              <View wrap={false} style={styles.totalRow}>
                <Text style={[styles.th, styles.name]}>Total</Text>
                <Text style={[styles.th, styles.pct]}>
                  {totalPct > 0 ? `${totalPct.toFixed(2)}%` : '—'}
                </Text>
                <Text style={[styles.th, styles.amt]}>
                  {totalCents > 0 ? formatCurrency(totalCents) : '—'}
                </Text>
                <Text style={[styles.th, styles.desc]}> </Text>
              </View>
            )}
            {sortedMilestones.length > 0 && showGst && (
              <Text wrap={false} minPresenceAhead={20} style={styles.note}>Amounts shown inclusive of GST.</Text>
            )}
          </View>
        </View>
      </View>
  );
}
