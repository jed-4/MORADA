import { Text, View, StyleSheet } from '@react-pdf/renderer';
import { PDF_COLORS, brandRamp } from "@/components/pdf/shared/pdfTokens";
import { PDF_FONT_FAMILY } from "@/components/pdf/shared/registerPdfFonts";
import { pdfHasText, pdfPlainText } from "@/components/pdf/shared/pdfText";
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
  lineAppearsOnProposal,
} from '@shared/proposalTotals';
import { resolveSectionTextStyle } from "../sectionTextStyle";

interface AllowanceRow {
  name: string;
  amountCents?: number | null;
  /**
   * The line's DESCRIPTION, printed under the item and labelled "Description"
   * in the builder.
   *
   * The field keeps the name `notes` on purpose: legacy hand-typed rows are
   * stored as jsonb with a `notes` key, and the column toggle saved in existing
   * sections and templates is `columnToggles.notes`. Renaming either would
   * silently drop text and toggles that are already out there.
   *
   * `estimate_items.notes` is a DIFFERENT field — the note-icon popover in the
   * estimate grid — and is deliberately not printed in any client-facing
   * document. Do not wire it in here without asking first; it reads like a
   * scratchpad.
   */
  notes?: string | null;
  /** "Prime Cost" / "Provisional Sum" when the row came from the estimate. */
  kind?: string | null;
  quantity?: number | null;
  unit?: string | null;
  unitExCents?: number | null;
  unitIncCents?: number | null;
}

/** Which columns this section prints. Mirrors the estimate's toggles. */
const DEFAULT_ALLOWANCE_COLUMNS = {
  allowanceType: true,
  quantity: true,
  unit: true,
  unitCostExTax: true,
  unitCostIncTax: true,
  amountExTax: false,
  amountIncTax: false,
  notes: true,
};
type AllowanceColumns = typeof DEFAULT_ALLOWANCE_COLUMNS;

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
  /** Stand-in figures are in play — say so on the page. */
  sampleData?: boolean;
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
  primaryColor = PDF_COLORS.brandFallback,
  brandColor,
  documentStyle = 'style1',
  showFooter,
  sampleData = false,
  estimateData,
}: AllowancesSectionProps) {
  const resolvedColor = brandColor ?? primaryColor;
  const isS2 = documentStyle === 'style2';
  const content = (section.content as Record<string, unknown>) || {};
  const textStyle = resolveSectionTextStyle(content);
  const html = (content.allowancesText as string) || '';

  const itemRows = proposalItems
    .filter((it) => it.sectionId === section.id)
    .sort((a, b) => a.order - b.order)
    .map((it) => ({
      name: it.name,
      amountCents: typeof it.totalPrice === 'number' ? it.totalPrice : null,
      notes: it.description ?? null,
      quantity: typeof it.quantity === 'number' ? it.quantity : null,
      unit: it.unitType ?? null,
      // proposal_items stores the client price; GST is the document's rate.
      unitIncCents: typeof it.unitPrice === 'number' ? it.unitPrice : null,
      unitExCents: null,
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
   * another.
   *
   * Rows and money follow the proposal-wide rule: a line hidden from the
   * proposal does not print here, but its money is still the estimate's —
   * see estimateAllowanceTotalCents below.
   */
  const allowanceOpts = {
    projectMarkupPercent: estimateData?.estimate?.projectMarkupPercent,
    taxRate: estimateData?.estimate?.taxRate,
  };
  const isAllowanceLine = (it: { allowance?: string | null }) => {
    const kind = String(it.allowance ?? 'None');
    return kind === 'Prime Cost' || kind === 'Provisional Sum';
  };
  const estimateAllowanceTotalCents = estimateData
    ? estimateData.items
        .filter((it) => isAllowanceLine(it as { allowance?: string }))
        .reduce((sum, it) => sum + Math.round(clientLineAmounts(it, allowanceOpts).incTax * 100), 0)
    : 0;

  const estimateRows: AllowanceRow[] = (() => {
    if (!estimateData) return [];
    const hidden = collectHiddenGroupIds(estimateData.groups);
    const opts = allowanceOpts;
    return estimateData.items
      .filter((it) => isAllowanceLine(it as { allowance?: string }) && lineAppearsOnProposal(it, hidden))
      .map((it) => {
        const amounts = clientLineAmounts(it, opts);
        const qty = Number((it as { quantity?: number }).quantity) || 0;
        return {
          name: it.name || 'Untitled',
          amountCents: Math.round(amounts.incTax * 100),
          notes: it.description ?? null,
          kind: String((it as { allowance?: string }).allowance),
          quantity: qty || null,
          unit: (it as { unit?: string | null }).unit ?? null,
          /* Unit cost is derived from the line total, not read off the item:
             the item's own unit price is pre-margin, so printing it beside a
             marked-up amount would quote the client two different rates for
             the same thing. */
          unitExCents: qty ? Math.round((amounts.exTax * 100) / qty) : null,
          unitIncCents: qty ? Math.round((amounts.incTax * 100) / qty) : null,
        };
      });
  })();

  // Rows typed into the section win: they are a deliberate override of what
  // the estimate says, not a duplicate of it.
  const rows: AllowanceRow[] =
    itemRows.length > 0 ? itemRows : estimateRows.length > 0 ? estimateRows : legacyRows;

  /* When the rows come from the estimate, the total is the estimate's — every
     Prime Cost and Provisional Sum line, including any the client is not shown.
     Rows typed into the section are their own document and still sum. */
  const usingEstimateRows = itemRows.length === 0 && estimateRows.length > 0;
  const total = usingEstimateRows ? estimateAllowanceTotalCents : rows.reduce(
    (sum, r) => sum + (typeof r.amountCents === 'number' ? r.amountCents : 0),
    0,
  );

  const headerBorderColor = isS2 ? tintOnWhite(resolvedColor, '60') : resolvedColor;
  const ramp = brandRamp(resolvedColor);

  /* Jed's layout: the item and its type on the left, the numbers on the
     right, and the note on its own line underneath rather than fighting the
     amount for width. */
  const cols: AllowanceColumns = {
    ...DEFAULT_ALLOWANCE_COLUMNS,
    ...((content.columnToggles as Partial<AllowanceColumns> | undefined) ?? {}),
  };

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
    row: { paddingVertical: 4, borderBottom: '1px solid #F3F4F6' },
    cells: { flexDirection: 'row', alignItems: 'flex-start' },
    th: { fontWeight: 'bold', fontSize: 9 },
    name: { flex: 1, paddingRight: 8 },
    num: { width: 46, textAlign: 'right', paddingLeft: 6 },
    unit: { width: 38, textAlign: 'left', paddingLeft: 6 },
    money: { width: 62, textAlign: 'right', paddingLeft: 6 },
    totalRow: {
      flexDirection: 'row',
      paddingVertical: 6,
      marginTop: 4,
      borderTop: `1px solid ${resolvedColor}`,
      backgroundColor: isS2 ? resolvedColor + '14' : 'transparent',
      paddingHorizontal: isS2 ? 6 : 0,
    },
    /* The chip sits beside the name, not under it: "Prime Cost" is what KIND
       of allowance this is, and reads as a label on the item. */
    chip: {
      fontSize: 7,
      fontFamily: PDF_FONT_FAMILY,
      fontWeight: 700,
      color: ramp.onWhite,
      backgroundColor: ramp.wash,
      paddingHorizontal: 4,
      paddingVertical: 1,
      borderRadius: 2,
      marginLeft: 6,
    },
    notes: { fontSize: 8, color: PDF_COLORS.inkMuted, marginTop: 2, paddingRight: 8 },
    note: { marginTop: 10, fontSize: 9, fontStyle: 'italic', color: PDF_COLORS.inkMuted },
  });

  return (
      <View style={{ paddingHorizontal: 40 }}>
        <View style={sharedSectionStyle.section}>
          <Text minPresenceAhead={60} style={[sharedSectionStyle.sectionTitle, { color: resolvedColor }]}>
            {section.name || 'Allowances'}
          </Text>
          {/* Same warning the estimate page carries: a template preview can be
              downloaded, and invented figures with nothing marking them as
              invented are the kind of thing that reaches a client by accident. */}
          {sampleData && (
            <Text
              style={{
                fontSize: 8,
                fontFamily: PDF_FONT_FAMILY,
                fontWeight: 700,
                color: PDF_COLORS.inkMuted,
                letterSpacing: 0.6,
                marginBottom: 8,
              }}
            >
              SAMPLE FIGURES — EACH PROPOSAL SHOWS ITS OWN ALLOWANCES
            </Text>
          )}
          <SectionIntro section={section} textStyle={textStyle} />
          {html ? <RichTextBlocks html={html} textStyle={textStyle} /> : null}

          {rows.length > 0 ? (
            <View minPresenceAhead={90} style={{ marginTop: 8 }}>
              <View style={styles.headerRow}>
                <Text style={[styles.th, styles.name]}>Item</Text>
                {cols.quantity && <Text style={[styles.th, styles.num]}>Qty</Text>}
                {cols.unit && <Text style={[styles.th, styles.unit]}>Unit</Text>}
                {cols.unitCostExTax && <Text style={[styles.th, styles.money]}>Unit (ex)</Text>}
                {cols.unitCostIncTax && <Text style={[styles.th, styles.money]}>Unit (inc)</Text>}
                {cols.amountExTax && <Text style={[styles.th, styles.money]}>Amount (ex)</Text>}
                {cols.amountIncTax && <Text style={[styles.th, styles.money]}>Amount (inc)</Text>}
              </View>
              {rows.map((r, i) => (
                <View key={i} wrap={false} style={styles.row}>
                  <View style={styles.cells}>
                    <View style={[styles.name, { flexDirection: 'row', alignItems: 'center' }]}>
                      <Text style={sharedSectionStyle.text}>{r.name}</Text>
                      {cols.allowanceType && r.kind ? <Text style={styles.chip}>{r.kind}</Text> : null}
                    </View>
                    {cols.quantity && (
                      <Text style={[sharedSectionStyle.text, styles.num]}>
                        {typeof r.quantity === 'number' ? r.quantity : ''}
                      </Text>
                    )}
                    {cols.unit && (
                      <Text style={[sharedSectionStyle.text, styles.unit]}>{r.unit || ''}</Text>
                    )}
                    {cols.unitCostExTax && (
                      <Text style={[sharedSectionStyle.text, styles.money]}>
                        {typeof r.unitExCents === 'number' ? formatCurrency(r.unitExCents) : ''}
                      </Text>
                    )}
                    {cols.unitCostIncTax && (
                      <Text style={[sharedSectionStyle.text, styles.money]}>
                        {typeof r.unitIncCents === 'number' ? formatCurrency(r.unitIncCents) : ''}
                      </Text>
                    )}
                    {cols.amountExTax && (
                      <Text style={[sharedSectionStyle.text, styles.money]}>
                        {typeof r.unitExCents === 'number' && typeof r.quantity === 'number'
                          ? formatCurrency(r.unitExCents * r.quantity)
                          : ''}
                      </Text>
                    )}
                    {cols.amountIncTax && (
                      <Text style={[sharedSectionStyle.text, styles.money]}>
                        {typeof r.amountCents === 'number' ? formatCurrency(r.amountCents) : ''}
                      </Text>
                    )}
                  </View>
                  {/* The description on its own line, and ONLY when there is one.
                      An em dash in an empty cell reads as "nothing here on
                      purpose"; there is nothing to say, so nothing is said.
                      Stripped, because the field is written by a rich-text
                      editor and an emptied one leaves "<p></p>" behind. */}
                  {cols.notes && pdfHasText(r.notes) ? (
                    <Text style={styles.notes}>{pdfPlainText(r.notes)}</Text>
                  ) : null}
                </View>
              ))}
              {total > 0 && (
                <View wrap={false} style={styles.totalRow}>
                  <Text style={[styles.th, styles.name]}>Total allowances (inc GST)</Text>
                  <Text style={[styles.th, styles.money, { width: 'auto' }]}>{formatCurrency(total)}</Text>
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
