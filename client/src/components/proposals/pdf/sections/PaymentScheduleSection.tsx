import { Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import type { Proposal, ProposalSection, ProposalPaymentMilestone } from '@shared/schema';
import { PageHeader, PageFooter, RichTextBlocks, sharedPageStyle, sharedSectionStyle } from './RichTextBlocks';

interface PaymentScheduleSectionProps {
  proposal: Proposal;
  section: ProposalSection;
  milestones: ProposalPaymentMilestone[];
  companyName?: string;
  primaryColor?: string;
}

export function PaymentScheduleSection({
  proposal,
  section,
  milestones,
  companyName,
  primaryColor = '#3B82F6',
}: PaymentScheduleSectionProps) {
  const content = (section.content as Record<string, unknown>) || {};
  const html = (content.scheduleText as string) || '';

  const styles = StyleSheet.create({
    headerRow: {
      flexDirection: 'row',
      borderBottom: `1px solid ${primaryColor}`,
      paddingBottom: 4,
      marginBottom: 4,
    },
    row: { flexDirection: 'row', paddingVertical: 3, borderBottom: '1px solid #F3F4F6' },
    th: { fontWeight: 'bold', fontSize: 11 },
    name: { flex: 2 },
    pct: { flex: 1, textAlign: 'right' },
    amt: { flex: 1, textAlign: 'right' },
    desc: { flex: 2 },
    totalRow: { flexDirection: 'row', marginTop: 8, paddingTop: 4, borderTop: `1px solid ${primaryColor}` },
  });

  const sortedMilestones = [...milestones].sort((a, b) => a.order - b.order);
  const totalPct = sortedMilestones.reduce((s, m) => s + (Number(m.percentage) || 0), 0);
  const totalCents = sortedMilestones.reduce((s, m) => s + (Number(m.amountCents) || 0), 0);

  return (
    <Page size="A4" style={sharedPageStyle}>
      <PageHeader
        proposalName={proposal.name}
        proposalNumber={proposal.proposalNumber}
        expiryDate={proposal.expiryDate as any}
        primaryColor={primaryColor}
      />
      <View style={sharedSectionStyle.section}>
        <Text style={sharedSectionStyle.sectionTitle}>{section.name || 'Payment Schedule'}</Text>
        {html ? <RichTextBlocks html={html} /> : null}

        <View style={{ marginTop: 8 }}>
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
              <View key={m.id} style={styles.row}>
                <Text style={[sharedSectionStyle.text, styles.name]}>{m.name}</Text>
                <Text style={[sharedSectionStyle.text, styles.pct]}>
                  {m.percentage != null ? `${Number(m.percentage).toFixed(2)}%` : '—'}
                </Text>
                <Text style={[sharedSectionStyle.text, styles.amt]}>
                  {m.amountCents != null ? `$${(Number(m.amountCents) / 100).toFixed(2)}` : '—'}
                </Text>
                <Text style={[sharedSectionStyle.text, styles.desc]}>{m.description || '—'}</Text>
              </View>
            ))
          )}
          {sortedMilestones.length > 0 && (
            <View style={styles.totalRow}>
              <Text style={[styles.th, styles.name]}>Total</Text>
              <Text style={[styles.th, styles.pct]}>{totalPct > 0 ? `${totalPct.toFixed(2)}%` : '—'}</Text>
              <Text style={[styles.th, styles.amt]}>{totalCents > 0 ? `$${(totalCents / 100).toFixed(2)}` : '—'}</Text>
              <Text style={[styles.th, styles.desc]}> </Text>
            </View>
          )}
        </View>
      </View>
      <PageFooter companyName={companyName} primaryColor={primaryColor} />
    </Page>
  );
}
