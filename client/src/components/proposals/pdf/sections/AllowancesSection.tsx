import { Text, View, StyleSheet } from '@react-pdf/renderer';
import type {
  Proposal,
  ProposalSection,
  ProposalItem,
  Estimate,
  EstimateGroup,
  EstimateItem,
} from '@shared/schema';
import { RichTextBlocks, sharedSectionStyle, SectionIntro } from './RichTextBlocks';
import { tintOnWhite } from "@/components/pdf/shared/pdfColor";
import {
  clientLineAmounts,
  collectHiddenGroupIds,
  lineCountsTowardProposalTotal,
} from '@shared/proposalTotals';

interface AllowanceRow {
  name: string;
  amountCents?: number | null;
  notes?: string | null;
  /** "Prime Cost" / "Provisional Sum" when the row came from the estimate. */
  kind?: string | null;
}

interface AllowancesSectionProps {
  proposal: Proposal;
  section: ProposalSection;
  proposalItems?: ProposalItem[];
  companyName?: string;
  companyPhone?: string;
  logoUrl?: string;
  primaryColor?: string;
  brandColor?: string;
  documentStyle?: 'style1' | 'style2';
  showFooter?: boolean;
  /** The linked estimate, so PC/PS lines can be listed without re-entry. */
  estimateData?: {
    estimate: Estimate;
    groups: EstimateGroup[];
    items: EstimateItem[];
  };
}

const formatCurrency = (cents: number) =>
  `$${(cents / 100).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function AllowancesSection({
  proposal,
  section,
  proposalItems = [],
  companyName,
  companyPhone,
  logoUrl,
  primaryColor = '#3B82F6',
  brandColor,
  documentStyle = 'style1',
  showFooter,
  estimateData,
}: AllowancesSectionProps) {
  const resolvedColor = brandColor ?? primaryColor;
  const isS2 = documentStyle === 'style2';
  const content = (section.content as Record<string, unknown>) || {};
  const html = (content.allowancesText as string) || '';

  const itemRows = proposalItems
    .filter((it) => it.sectionId === section.id)
    .sort((a, b) => a.order - b.order)
    .map((it) => ({
      name: it.name,
      amountCents: typeof it.totalPrice === 'number' ? it.totalPrice : null,
      notes: it.description ?? null,
    }));
  const legacyRows = Array.isArray(content.allowances)
    ? (content.allowances as AllowanceRow[])
    : [];

  /**
   * Allowances the estimate already knows about.
   *
   * This page used to read only rows typed into it by hand, so an estimate
   * full of Prime Cost and Provisional Sum lines produced "No allowances
   * defined." two pages after the estimate table listed those very lines. The
   * estimate is the record of what was allowed for; this reflects it.
   *
   * Prices go through clientLineAmounts, the same helper the estimate table
   * uses, so an allowance cannot be quoted here at one figure and there at
   * another. Lines hidden from the proposal, or marked as excluded, are left
   * out for the same reason they are left out of the price.
   */
  const estimateRows: AllowanceRow[] = (() => {
    if (!estimateData) return [];
    const hidden = collectHiddenGroupIds(estimateData.groups);
    const opts = {
      projectMarkupPercent: estimateData.estimate?.projectMarkupPercent,
      taxRate: estimateData.estimate?.taxRate,
    };
    return estimateData.items
      .filter((it) => {
        const kind = String((it as { allowance?: string }).allowance ?? 'None');
        if (kind !== 'Prime Cost' && kind !== 'Provisional Sum') return false;
        return lineCountsTowardProposalTotal(it, hidden);
      })
      .map((it) => ({
        name: it.name || 'Untitled',
        amountCents: Math.round(clientLineAmounts(it, opts).incTax * 100),
        notes: it.description ?? null,
        kind: String((it as { allowance?: string }).allowance),
      }));
  })();

  // Rows typed into the section win: they are a deliberate override of what
  // the estimate says, not a duplicate of it.
  const rows: AllowanceRow[] =
    itemRows.length > 0 ? itemRows : estimateRows.length > 0 ? estimateRows : legacyRows;

  const total = rows.reduce(
    (sum, r) => sum + (typeof r.amountCents === 'number' ? r.amountCents : 0),
    0,
  );

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
    // paddingLeft on notes: the right-aligned amount used to butt straight up
    // against it, printing the header as "AmountNotes".
    amount: { flex: 1, textAlign: 'right', paddingRight: 8 },
    notes: { flex: 2, paddingLeft: 8 },
    totalRow: {
      flexDirection: 'row',
      paddingVertical: 6,
      marginTop: 4,
      borderTop: `1px solid ${resolvedColor}`,
      backgroundColor: isS2 ? resolvedColor + '14' : 'transparent',
      paddingHorizontal: isS2 ? 6 : 0,
    },
    kind: { fontSize: 8, color: resolvedColor, marginTop: 1 },
    note: { marginTop: 10, fontSize: 9, fontStyle: 'italic', color: '#6B7280' },
  });

  return (
      <View style={{ paddingHorizontal: 40 }}>
        <View style={sharedSectionStyle.section}>
          <Text minPresenceAhead={60} style={[sharedSectionStyle.sectionTitle, { color: resolvedColor }]}>
            {section.name || 'Allowances'}
          </Text>
          <SectionIntro section={section} />
          {html ? <RichTextBlocks html={html} /> : null}

          {rows.length > 0 ? (
            <View minPresenceAhead={90} style={{ marginTop: 8 }}>
              <View style={styles.headerRow}>
                <Text style={[styles.th, styles.name]}>Item</Text>
                <Text style={[styles.th, styles.amount]}>Amount</Text>
                <Text style={[styles.th, styles.notes]}>Notes</Text>
              </View>
              {rows.map((r, i) => (
                <View key={i} wrap={false} style={styles.row}>
                  <View style={styles.name}>
                    <Text style={sharedSectionStyle.text}>{r.name}</Text>
                    {r.kind ? <Text style={styles.kind}>{r.kind}</Text> : null}
                  </View>
                  <Text style={[sharedSectionStyle.text, styles.amount]}>
                    {typeof r.amountCents === 'number' ? formatCurrency(r.amountCents) : '—'}
                  </Text>
                  <Text style={[sharedSectionStyle.text, styles.notes]}>{r.notes || '—'}</Text>
                </View>
              ))}
              {total > 0 && (
                <View wrap={false} style={styles.totalRow}>
                  <Text style={[styles.th, styles.name]}>Total Allowances</Text>
                  <Text style={[styles.th, styles.amount]}>{formatCurrency(total)}</Text>
                  <Text style={[styles.th, styles.notes]}> </Text>
                </View>
              )}
              <Text wrap={false} minPresenceAhead={20} style={styles.note}>
                Allowances are provisional. Final amounts are reconciled against actual costs and may vary.
              </Text>
            </View>
          ) : (
            !html && (
              <Text style={sharedSectionStyle.muted}>No allowances defined.</Text>
            )
          )}
        </View>
      </View>
  );
}
