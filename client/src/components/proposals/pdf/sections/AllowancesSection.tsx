import { Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import type { Proposal, ProposalSection } from '@shared/schema';
import { PageHeader, PageFooter, RichTextBlocks, sharedPageStyle, sharedSectionStyle } from './RichTextBlocks';

interface AllowanceRow {
  name: string;
  amountCents?: number | null;
  notes?: string | null;
}

interface AllowancesSectionProps {
  proposal: Proposal;
  section: ProposalSection;
  companyName?: string;
  primaryColor?: string;
}

export function AllowancesSection({ proposal, section, companyName, primaryColor = '#3B82F6' }: AllowancesSectionProps) {
  const content = (section.content as Record<string, unknown>) || {};
  const html = (content.allowancesText as string) || '';
  const rows = Array.isArray(content.allowances) ? (content.allowances as AllowanceRow[]) : [];

  const styles = StyleSheet.create({
    headerRow: { flexDirection: 'row', borderBottom: `1px solid ${primaryColor}`, paddingBottom: 4, marginBottom: 4 },
    row: { flexDirection: 'row', paddingVertical: 3, borderBottom: '1px solid #F3F4F6' },
    th: { fontWeight: 'bold', fontSize: 11 },
    name: { flex: 2 },
    amount: { flex: 1, textAlign: 'right' },
    notes: { flex: 2 },
  });

  return (
    <Page size="A4" style={sharedPageStyle}>
      <PageHeader
        proposalName={proposal.name}
        proposalNumber={proposal.proposalNumber}
        expiryDate={proposal.expiryDate as any}
        primaryColor={primaryColor}
      />
      <View style={sharedSectionStyle.section}>
        <Text style={sharedSectionStyle.sectionTitle}>{section.name || 'Allowances'}</Text>
        {html ? <RichTextBlocks html={html} /> : null}

        {rows.length > 0 ? (
          <View style={{ marginTop: 8 }}>
            <View style={styles.headerRow}>
              <Text style={[styles.th, styles.name]}>Allowance</Text>
              <Text style={[styles.th, styles.amount]}>Amount</Text>
              <Text style={[styles.th, styles.notes]}>Notes</Text>
            </View>
            {rows.map((r, i) => (
              <View key={i} style={styles.row}>
                <Text style={[sharedSectionStyle.text, styles.name]}>{r.name}</Text>
                <Text style={[sharedSectionStyle.text, styles.amount]}>
                  {r.amountCents != null ? `$${(Number(r.amountCents) / 100).toFixed(2)}` : '—'}
                </Text>
                <Text style={[sharedSectionStyle.text, styles.notes]}>{r.notes || '—'}</Text>
              </View>
            ))}
          </View>
        ) : (
          !html && (
            <Text style={sharedSectionStyle.muted}>
              Allowances are calculated from the linked estimate(s).
            </Text>
          )
        )}
      </View>
      <PageFooter companyName={companyName} primaryColor={primaryColor} />
    </Page>
  );
}
