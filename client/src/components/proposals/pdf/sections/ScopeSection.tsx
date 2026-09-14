import { Text, View, StyleSheet } from '@react-pdf/renderer';
import type { Proposal, ProposalSection, Project } from '@shared/schema';
import { RichTextBlocks, sharedSectionStyle, SectionIntro } from './RichTextBlocks';
import { PDF_COLORS } from "@/components/pdf/shared/pdfTokens";
import { PDF_FONT_FAMILY } from "@/components/pdf/shared/registerPdfFonts";
import { resolveSectionTextStyle } from "../sectionTextStyle";

interface ScopeSectionProps {
  proposal: Proposal;
  section: ProposalSection;
  project?: Project | null;
  companyName?: string;
  companyPhone?: string;
  logoUrl?: string;
  primaryColor?: string;
  brandColor?: string;
  documentStyle?: 'style1' | 'style2';
  showFooter?: boolean;
  showGst?: boolean;
  /** The document's own price, from proposalContext — never recomputed here. */
  totals?: { subtotalCents: number; gstCents: number; totalCents: number };
}

/** Where the at-a-glance block sits, if anywhere. */
type SummaryPlacement = 'none' | 'top' | 'bottom';

const formatCurrency = (cents: number) =>
  `$${(cents / 100).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatDate = (value: unknown): string | null => {
  if (!value) return null;
  const d = new Date(value as string);
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
};

export function ScopeSection({
  proposal,
  section,
  project,
  companyName,
  companyPhone,
  logoUrl,
  primaryColor = PDF_COLORS.brandFallback,
  brandColor,
  documentStyle = 'style1',
  showFooter,
  showGst = true,
  totals,
}: ScopeSectionProps) {
  const resolvedColor = brandColor ?? primaryColor;
  const content = (section.content as Record<string, unknown>) || {};
  const textStyle = resolveSectionTextStyle(content);
  const isCoverLetter = section.sectionType === 'cover_letter';
  const html =
    (content.scopeText as string) ||
    (content.letterText as string) ||
    (content.customText as string) ||
    '';
  const defaultTitle = isCoverLetter ? 'Cover Letter' : 'Scope of Work';
  const emptyMessage = isCoverLetter ? 'No cover letter content provided.' : 'No scope content provided.';

  /*
   * The at-a-glance block.
   *
   * A client opening a proposal wants the number, and the number lived on the
   * payment schedule — several pages in, under a heading about instalments.
   * This puts it on the page they are already reading.
   *
   * Off by default, deliberately. The document has a standing rule that the
   * price appears ONCE (see ProposalDocument: the payment schedule owns it,
   * and a proposal without one keeps it on Summary). Turning this on is a
   * considered decision to state it twice, so it is made per section rather
   * than assumed.
   */
  const placement = ((content.summaryPlacement as string) ?? 'none') as SummaryPlacement;
  const total = totals?.totalCents ?? (Number(proposal.totalAmount) || 0);
  const subtotal = totals?.subtotalCents ?? (Number(proposal.subtotal) || 0);
  const gst = totals?.gstCents ?? (Number(proposal.gstAmount) || 0);
  const validUntil = formatDate((proposal as { expiryDate?: unknown }).expiryDate);

  const facts: Array<{ label: string; value: string; strong?: boolean }> = [];
  if (proposal.proposalNumber) facts.push({ label: 'Proposal', value: proposal.proposalNumber });
  if (project?.name) facts.push({ label: 'Project', value: project.name });
  if (validUntil) facts.push({ label: 'Valid until', value: validUntil });
  // A price of zero is a proposal that has not been costed yet; printing
  // "$0.00" at the top of a cover letter is worse than printing nothing.
  if (total > 0) {
    facts.push({
      label: showGst ? 'Total (inc GST)' : 'Total',
      value: formatCurrency(showGst ? total : subtotal),
      strong: true,
    });
  }
  const showSummary = placement !== 'none' && facts.length > 0;

  const styles = StyleSheet.create({
    summary: {
      marginTop: placement === 'bottom' ? 16 : 4,
      marginBottom: placement === 'top' ? 14 : 0,
      paddingVertical: 10,
      paddingHorizontal: 12,
      backgroundColor: resolvedColor + '0d',
      borderLeftWidth: 3,
      borderLeftColor: resolvedColor,
      borderRadius: 3,
    },
    row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
    label: { fontSize: 9, color: PDF_COLORS.inkMuted },
    value: { fontSize: 9, color: PDF_COLORS.ink },
    strongLabel: {
      fontSize: 11,
      fontFamily: PDF_FONT_FAMILY,
      fontWeight: 700,
      color: PDF_COLORS.ink,
    },
    strongValue: {
      fontSize: 11,
      fontFamily: PDF_FONT_FAMILY,
      fontWeight: 700,
      color: resolvedColor,
    },
    gstNote: { fontSize: 8, color: PDF_COLORS.inkMuted, marginTop: 4 },
  });

  const summaryBlock = showSummary ? (
    <View wrap={false} style={styles.summary}>
      {facts.map((f) => (
        <View key={f.label} style={styles.row}>
          <Text style={f.strong ? styles.strongLabel : styles.label}>{f.label}</Text>
          <Text style={f.strong ? styles.strongValue : styles.value}>{f.value}</Text>
        </View>
      ))}
      {showGst && total > 0 && (
        <Text style={styles.gstNote}>
          {`${formatCurrency(subtotal)} ex GST + ${formatCurrency(gst)} GST`}
        </Text>
      )}
    </View>
  ) : null;

  return (
      <View style={{ paddingHorizontal: 40 }}>
        <View style={sharedSectionStyle.section}>
          <Text minPresenceAhead={60} style={[sharedSectionStyle.sectionTitle, { color: resolvedColor }]}>
            {section.name || defaultTitle}
          </Text>
          {placement === 'top' && summaryBlock}
          <SectionIntro section={section} textStyle={textStyle} />
          {html ? (
            <RichTextBlocks html={html} textStyle={textStyle} />
          ) : (
            <Text style={sharedSectionStyle.muted}>{emptyMessage}</Text>
          )}
          {placement === 'bottom' && summaryBlock}
        </View>
      </View>
  );
}
