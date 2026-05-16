import { Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import type { Proposal, ProposalSection, ProposalItem } from '@shared/schema';
import { RichTextBlocks, sharedSectionStyle } from './RichTextBlocks';
import { DocProposalInnerHeader } from '@/components/pdf/shared/DocProposalInnerHeader';
import { DocFooter } from '@/components/pdf/shared/DocFooter';

interface AllowanceRow {
  name: string;
  amountCents?: number | null;
  notes?: string | null;
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
  const rows: AllowanceRow[] = itemRows.length > 0 ? itemRows : legacyRows;

  const total = rows.reduce(
    (sum, r) => sum + (typeof r.amountCents === 'number' ? r.amountCents : 0),
    0,
  );

  const headerBorderColor = isS2 ? resolvedColor + '60' : resolvedColor;

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
    name: { flex: 2 },
    amount: { flex: 1, textAlign: 'right' },
    notes: { flex: 2 },
    totalRow: {
      flexDirection: 'row',
      paddingVertical: 6,
      marginTop: 4,
      borderTop: `1px solid ${resolvedColor}`,
      backgroundColor: isS2 ? resolvedColor + '14' : 'transparent',
      paddingHorizontal: isS2 ? 6 : 0,
    },
    note: { marginTop: 10, fontSize: 9, fontStyle: 'italic', color: '#6B7280' },
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
            {section.name || 'Allowances'}
          </Text>
          {html ? <RichTextBlocks html={html} /> : null}

          {rows.length > 0 ? (
            <View style={{ marginTop: 8 }}>
              <View style={styles.headerRow}>
                <Text style={[styles.th, styles.name]}>Item</Text>
                <Text style={[styles.th, styles.amount]}>Amount</Text>
                <Text style={[styles.th, styles.notes]}>Notes</Text>
              </View>
              {rows.map((r, i) => (
                <View key={i} style={styles.row}>
                  <Text style={[sharedSectionStyle.text, styles.name]}>{r.name}</Text>
                  <Text style={[sharedSectionStyle.text, styles.amount]}>
                    {typeof r.amountCents === 'number' ? formatCurrency(r.amountCents) : '—'}
                  </Text>
                  <Text style={[sharedSectionStyle.text, styles.notes]}>{r.notes || '—'}</Text>
                </View>
              ))}
              {total > 0 && (
                <View style={styles.totalRow}>
                  <Text style={[styles.th, styles.name]}>Total Allowances</Text>
                  <Text style={[styles.th, styles.amount]}>{formatCurrency(total)}</Text>
                  <Text style={[styles.th, styles.notes]}> </Text>
                </View>
              )}
              <Text style={styles.note}>
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
      <DocFooter
        companyName={companyName}
        brandColor={resolvedColor}
        docStyle={documentStyle}
      />
    </Page>
  );
}
