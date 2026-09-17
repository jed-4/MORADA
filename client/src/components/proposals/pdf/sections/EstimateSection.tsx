import { Text, View, StyleSheet } from "@react-pdf/renderer";
import type { ProposalSection, Estimate, EstimateGroup, EstimateItem } from "@shared/schema";
import { computeEstimateSummary, round2 } from "@shared/pricing";
import {
  clientLineAmounts,
  collectHiddenGroupIds,
  lineAppearsOnProposal,
} from "@shared/proposalTotals";
import { RichTextBlocks, SectionIntro } from "./RichTextBlocks";
import { tintOnWhite } from "@/components/pdf/shared/pdfColor";
import { PdfLineTable, type PdfTableColumn, type PdfTableGroup } from "@/components/pdf/shared/PdfLineTable";
import { PdfTotalsCard } from "@/components/pdf/shared/PdfPrimitives";
import { PDF_COLORS, PDF_TYPE, PDF_WEIGHT, PDF_SPACE, PDF_PAGE_MARGIN } from "@/components/pdf/shared/pdfTokens";
import { PDF_FONT_FAMILY } from "@/components/pdf/shared/registerPdfFonts";
import { pdfHasText, pdfPlainText } from "@/components/pdf/shared/pdfText";
import { resolveSectionTextStyle, type SectionTextStyle } from "../sectionTextStyle";

/**
 * Group descriptions print at the table's note size — the same 8.5pt the
 * header note always used — so rich text doesn't come out louder than the plain
 * note it replaces. RichTextBlocks scales every block from this.
 */
const GROUP_NOTE_TEXT_STYLE: SectionTextStyle = {
  align: "left",
  fontSize: PDF_TYPE.bodySmall,
  fontFamily: PDF_FONT_FAMILY,
};

interface EstimateSectionProps {
  section: ProposalSection;
  /** True when the figures are stand-ins for a template. Says so on the page. */
  sampleData?: boolean;
  estimateData?: {
    estimate: Estimate;
    groups: EstimateGroup[];
    items: EstimateItem[];
  };
  companyLogo?: string;
  companyName?: string;
  companyPhone?: string;
  primaryColor?: string;
  brandColor?: string;
  documentStyle?: "style1" | "style2";
  showFooter?: boolean;
  proposalName?: string;
  proposalNumber?: string;
  expiryDate?: string;
  pricingMode?: "lump_sum" | "itemised" | "section_totals";
  showGst?: boolean;
  /**
   * True when another section shares this sheet. A `fixed` header repeats on
   * every page of its <Page>, not just while the table runs — so on a shared
   * sheet it reprints above whatever follows the table. Repeating is right for
   * a long estimate on its own page and wrong here.
   */
  sharesPage?: boolean;
}

export function EstimateSection({
  section,
  sampleData,
  estimateData,
  companyLogo,
  companyName,
  companyPhone,
  primaryColor = PDF_COLORS.brandFallback,
  brandColor,
  documentStyle = "style1",
  showFooter,
  proposalName,
  proposalNumber,
  pricingMode = "itemised",
  showGst = true,
  sharesPage = false,
}: EstimateSectionProps) {
  if (!estimateData) {
    return null;
  }

  const resolvedColor = brandColor ?? primaryColor;
  const isS2 = documentStyle === "style2";

  const content = (section.content as Record<string, unknown>) || {};
  const textStyle = resolveSectionTextStyle(content);
  const visibleColumns: string[] | undefined = Array.isArray(content.visibleColumns)
    ? (content.visibleColumns as string[])
    : undefined;
  const fallbackToggles = (content.columnToggles as Record<string, boolean>) || {
    description: true,
    quantity: false,
    unitCostExTax: false,
    unitCostIncTax: false,
    markup: false,
    amountExTax: false,
    amountIncTax: false,
    showSubtotals: true,
    showZeroLines: false,
    showColumnHeader: true,
    showAllowanceType: true,
    descriptionUnderName: true,
    groupDescriptions: true,
  };
  const baseToggles: Record<string, boolean> = visibleColumns
    ? {
        description: visibleColumns.includes("description"),
        quantity: visibleColumns.includes("quantity"),
        unit: visibleColumns.includes("unit"),
        unitCostExTax: visibleColumns.includes("unitCostExTax"),
        unitCostIncTax: visibleColumns.includes("unitCostIncTax"),
        markup: visibleColumns.includes("markup"),
        amountExTax: visibleColumns.includes("amountExTax"),
        amountIncTax: visibleColumns.includes("amountIncTax"),
        showSubtotals: fallbackToggles.showSubtotals !== false,
        showZeroLines: fallbackToggles.showZeroLines === true,
        showColumnHeader: fallbackToggles.showColumnHeader !== false,
        showAllowanceType: fallbackToggles.showAllowanceType !== false,
        descriptionUnderName: fallbackToggles.descriptionUnderName !== false,
        groupDescriptions: fallbackToggles.groupDescriptions !== false,
      }
    : fallbackToggles;

  const toggles: Record<string, boolean> = (() => {
    if (pricingMode === "lump_sum") {
      return {
        description: false,
        quantity: false,
        unit: false,
        unitCostExTax: false,
        unitCostIncTax: false,
        markup: false,
        amountExTax: false,
        amountIncTax: false,
        showSubtotals: false,
        showZeroLines: false,
        showColumnHeader: false,
        showAllowanceType: false,
        descriptionUnderName: false,
        // Lump sum prints a price and nothing that itemises it.
        groupDescriptions: false,
      };
    }
    const next = { ...baseToggles };
    if (pricingMode === "section_totals") {
      next.description = false;
      next.quantity = false;
      next.unit = false;
      next.unitCostExTax = false;
      next.unitCostIncTax = false;
      next.markup = false;
      next.amountExTax = false;
      next.amountIncTax = false;
      next.showSubtotals = true;
    }
    if (!showGst) {
      next.unitCostIncTax = false;
      next.amountIncTax = false;
      if (!next.amountExTax && (baseToggles.amountIncTax || pricingMode === "itemised")) {
        next.amountExTax = true;
      }
    }
    return next;
  })();
  const hideLineItems = pricingMode === "lump_sum" || pricingMode === "section_totals";

  /**
   * Which figure a subtotal shows. This used to be inferred from the amount
   * columns, so turning both off still printed an inc-tax subtotal under lines
   * with no prices on them — money in the summary rows and none in the table.
   * It is a deliberate choice now, and GST off forces ex.
   */
  const subtotalBasis: "ex" | "inc" | "both" = (() => {
    const stored = content.subtotalBasis;
    if (!showGst) return "ex";
    if (stored === "ex" || stored === "inc" || stored === "both") return stored;
    // Legacy rows: keep what the amount-column inference used to produce.
    if (baseToggles.amountExTax && baseToggles.amountIncTax) return "both";
    if (baseToggles.amountExTax) return "ex";
    return "inc";
  })();

  const { estimate, groups, items: allItems } = estimateData;

  /* Two different sets, and keeping them apart is the whole rule.

     ROWS honour the eye toggle: a line the builder hid, or a line inside a
     hidden group, does not print.

     MONEY does not. The estimate is the source of truth for every figure, and
     visibility "has nothing to do with the money" (Jed). Hidden lines stay in
     their group's subtotal and in the grand total. This section used to drop
     them, which priced 11 Coolum at $27,550.02 against a $41,030.03 estimate
     and printed Preliminaries at $0.00. */
  const hiddenGroupIds = collectHiddenGroupIds(groups);
  const items = allItems.filter((it) => lineAppearsOnProposal(it, hiddenGroupIds));

  // Every line by group, hidden or not — the basis for subtotals.
  const allItemsByGroup: Record<string, EstimateItem[]> = {};
  for (const item of allItems) {
    if (item.groupId) (allItemsByGroup[item.groupId] ||= []).push(item);
  }

  const itemsByGroup: Record<string, EstimateItem[]> = {};
  const ungroupedItems: EstimateItem[] = [];

  items.forEach((item) => {
    if (item.groupId) {
      if (!itemsByGroup[item.groupId]) {
        itemsByGroup[item.groupId] = [];
      }
      itemsByGroup[item.groupId].push(item);
    } else {
      ungroupedItems.push(item);
    }
  });

  // Hierarchy-aware grouping: only ROOT groups render at the top level; each
  // group's subgroups render nested underneath it, sorted within their sibling
  // set. (The old flat `[...groups].sort(order)` flattened the tree and
  // interleaved subgroups arbitrarily.)
  const rootGroups = [...groups]
    .filter((g) => !g.parentGroupId && !hiddenGroupIds.has(g.id))
    .sort((a, b) => a.order - b.order);
  const subgroupsByParent: Record<string, EstimateGroup[]> = {};
  for (const g of groups) {
    // Hidden subgroups are dropped as the tree is built, not at each use, so
    // both consumers below inherit it: the render recursion and
    // collectGroupItems, which sums a group's descendants for its subtotal.
    if (hiddenGroupIds.has(g.id)) continue;
    if (g.parentGroupId) (subgroupsByParent[g.parentGroupId] ||= []).push(g);
  }
  for (const k of Object.keys(subgroupsByParent)) {
    subgroupsByParent[k].sort((a, b) => a.order - b.order);
  }

  // The full tree, hidden subgroups included — for money only.
  const allSubgroupsByParent: Record<string, EstimateGroup[]> = {};
  for (const g of groups) {
    if (g.parentGroupId) (allSubgroupsByParent[g.parentGroupId] ||= []).push(g);
  }

  /* A group's money: every line under it, at any depth, whether or not it or
     its sub-group prints. A container group sums what is nested inside it (the
     flat version summed direct children only and printed $0 for pure
     containers), and a hidden sub-group's cost stays in its parent. */
  const collectGroupMoneyItems = (groupId: string, seen = new Set<string>()): EstimateItem[] => {
    if (seen.has(groupId)) return []; // guard against legacy corrupt parent cycles
    seen.add(groupId);
    const own = allItemsByGroup[groupId] || [];
    const kids = allSubgroupsByParent[groupId] || [];
    return kids.reduce((acc, k) => acc.concat(collectGroupMoneyItems(k.id, seen)), [...own]);
  };

  const formatCurrency = (amount: number) =>
    `$${amount.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  /**
   * Prime Cost and Provisional Sum lines are a different promise from a fixed
   * price — PC is an allowance the client still chooses within, PS is the
   * builder's estimate of work not yet fully scoped. A client reading a column
   * of dollar figures cannot tell which is which, so they are named on the
   * line.
   */
  const ALLOWANCE_TYPES = new Set(["Prime Cost", "Provisional Sum"]);
  // Spelled out, not "PC" / "PS". The client reading this has no reason to know
  // the trade shorthand, and the whole point of the tag is that they can tell
  // an allowance from a fixed price at a glance.
  const allowanceLabel = (item: EstimateItem): string | null => {
    const kind = String((item as { allowance?: string }).allowance ?? "None");
    return ALLOWANCE_TYPES.has(kind) ? kind : null;
  };
  const formatQuantity = (qty: number) => qty.toFixed(2).replace(/\.?0+$/, "");

  // The stored priceIncTax is the PRE-margin line amount (line markup only).
  // The builder's margin (project markup) is a single global uplift on the
  // ex-GST subtotal. Because it is a flat percentage, distributing it
  // proportionally across every line is exact: per-line and group figures still
  // sum to the grand total, and the grand total equals the estimate's canonical
  // contract price. It is also the right client-facing behaviour — the margin
  // is embedded in the prices, never shown as its own line. (Summing the raw
  // pre-margin cache here previously under-quoted by the whole margin.)
  const taxRatePct = Number(estimate?.taxRate ?? 10);

  // Pre-margin line amounts. Priced lines are RECOMPUTED from qty × unitCost ×
  // line markup (never the stored cache), so a legacy margin-baked cache can't
  // double-count the margin here. Fixed-price allowances use their authoritative
  // typed priceIncTax. This mirrors the estimate grid and computeEstimateSummary.
  // clientLineAmounts is shared with the Allowances page, so the two cannot
  // quote the same line at two different prices.
  const amountOpts = { projectMarkupPercent: estimate?.projectMarkupPercent, taxRate: taxRatePct };
  const preMarginIncTax = (item: EstimateItem): number =>
    clientLineAmounts(item, { projectMarkupPercent: 0, taxRate: taxRatePct }).incTax;
  // What a line is worth to the client. "Shown As" changes only the printed
  // cell (see amountCell) — the money is the estimate's, whatever it says.
  const lineIncTaxClient = (item: EstimateItem) => clientLineAmounts(item, amountOpts).incTax;
  const lineExTaxClient = (item: EstimateItem) => clientLineAmounts(item, amountOpts).exTax;

  /**
   * What goes in an amount cell. "Included" and "Excluded" say in words what a
   * figure cannot: that the work is covered by the price, or explicitly is not.
   * "empty" blanks the cell for lines quoted elsewhere.
   */
  const amountCell = (item: EstimateItem, value: number): string => {
    switch ((item.shownAs ?? "price") as string) {
      case "included": return "Included";
      case "excluded": return "Excluded";
      case "empty": return "";
      default: return formatCurrency(value);
    }
  };

  const calculateGroupSubtotals = (groupItems: EstimateItem[]) => {
    const incTax = round2(groupItems.reduce((sum, item) => sum + lineIncTaxClient(item), 0));
    const exTax = round2(groupItems.reduce((sum, item) => sum + lineExTaxClient(item), 0));
    return { incTax, exTax };
  };

  /* The grand total is the estimate's own figure, from the same function over
     the same lines as the header of the estimate page — not a re-sum of rounded
     per-line amounts, which drifts by a cent or two and would put two different
     prices on the same job. */
  const estimateSummary = computeEstimateSummary(allItems, {
    projectMarkupPercent: estimate?.projectMarkupPercent,
    taxRate: taxRatePct,
    estimateId: estimate?.id,
  });
  const grandTotalIncTax = estimateSummary.total;
  const grandTotalExTax = estimateSummary.totalExTax;

  const styles = StyleSheet.create({
    description: {
      marginBottom: 15,
      fontSize: 10,
      color: PDF_COLORS.ink,
    },
    groupHeader: {
      backgroundColor: resolvedColor,
      color: PDF_COLORS.surface,
      padding: 8,
      fontSize: 11,
      fontFamily: PDF_FONT_FAMILY, fontWeight: 700,
      marginTop: 15,
      marginBottom: 0,
    },
    groupDescription: {
      fontSize: 9,
      color: PDF_COLORS.inkMuted,
      lineHeight: 1.4,
      paddingTop: 6,
      paddingBottom: 2,
      paddingHorizontal: 2,
    },
    tableHeader: {
      flexDirection: "row",
      backgroundColor: isS2 ? resolvedColor + "14" : PDF_COLORS.surfaceMuted,
      padding: 6,
      fontFamily: PDF_FONT_FAMILY, fontWeight: 700,
      fontSize: 9,
      borderBottom: `1px solid ${isS2 ? tintOnWhite(resolvedColor, "40") : PDF_COLORS.borderStrong}`,
    },
    tableRow: {
      flexDirection: "row",
      padding: 6,
      borderBottom: "1px solid ${PDF_COLORS.border}",
      fontSize: 9,
    },
    subtotalRow: {
      flexDirection: "row",
      padding: 6,
      backgroundColor: isS2 ? resolvedColor + "0d" : PDF_COLORS.surfaceSubtle,
      fontFamily: PDF_FONT_FAMILY, fontWeight: 700,
      fontSize: 9,
      marginTop: 0,
    },
    totalRow: {
      flexDirection: "row",
      padding: 8,
      backgroundColor: resolvedColor,
      color: PDF_COLORS.surface,
      fontFamily: PDF_FONT_FAMILY, fontWeight: 700,
      fontSize: 11,
      marginTop: 15,
    },
    col: {
      paddingHorizontal: 4,
    },
    itemCell: {
      flexDirection: "row",
      alignItems: "center",
    },
    itemDescription: {
      marginTop: 2,
      fontSize: 8,
      color: PDF_COLORS.inkFaint,
      lineHeight: 1.35,
    },
    allowanceTag: {
      marginLeft: 5,
      paddingHorizontal: 3,
      paddingVertical: 1,
      fontSize: 7,
      color: resolvedColor,
      backgroundColor: tintOnWhite(resolvedColor, "1f"),
      borderRadius: 2,
    },
    textRight: {
      textAlign: "right",
    },
  });

  const colWidths = {
    item: 150,
    description: 200,
    numeric: 60,
  };

  // With the description tucked under the name, the name column absorbs the
  // width the description column used to take, so the table still reaches the
  // right-hand edge instead of stranding it.
  const descriptionUnderName = toggles.descriptionUnderName !== false;
  const nameWidth =
    toggles.description && descriptionUnderName
      ? colWidths.item + colWidths.description
      : colWidths.item;

  /* ── Model for the shared table ──────────────────────────────────────────
   *
   * The rendering moved to PdfLineTable, the same component the variation,
   * invoice, purchase order and RFQ documents use. What it brings that the
   * hand-rolled table did not:
   *
   *  - column widths that fill the page, and a squeeze that gives width back
   *    to the text cell when too many numeric columns are switched on;
   *  - a neutral grey group heading instead of a full-width brand bar, which
   *    made a six-group estimate look like six separate tables;
   *  - the group total right-aligned ON the heading row, so it costs no row,
   *    and only where it earns its place (more than one line, or sub-groups);
   *  - nesting shown by indent and weight rather than a second identical bar;
   *  - continuous zebra and 1pt hairlines (0.5 renders unevenly).
   */
  const money = (n: number) => formatCurrency(n);

  const columns: Array<PdfTableColumn<EstimateItem>> = [];
  if (toggles.quantity)
    columns.push({ key: "qty", label: "Qty", width: 34, align: "right",
      value: (i) => formatQuantity(i.quantity) });
  if (toggles.unit)
    columns.push({ key: "unit", label: "Unit", width: 32, align: "left",
      value: (i) => i.unitType || "" });
  if (toggles.unitCostExTax)
    columns.push({ key: "uex", label: "Unit (ex)", width: 56, align: "right",
      value: (i) => money(i.unitCostExTax) });
  if (toggles.unitCostIncTax)
    columns.push({ key: "uinc", label: "Unit (inc)", width: 56, align: "right",
      value: (i) => {
        const tax = Math.round(i.unitCostExTax * (estimate.taxRate || 10)) / 100;
        return money(Math.round((i.unitCostExTax + tax) * 100) / 100);
      } });
  if (toggles.markup)
    columns.push({ key: "mkup", label: "Markup %", width: 38, align: "right",
      value: (i) => `${i.markupPercent ?? 0}%` });
  if (toggles.amountExTax)
    columns.push({ key: "aex", label: "Amount (ex)", width: 60, align: "right",
      value: (i) => amountCell(i, lineExTaxClient(i)) });
  if (toggles.amountIncTax)
    columns.push({ key: "ainc", label: "Amount (inc)", width: 64, align: "right",
      value: (i) => amountCell(i, lineIncTaxClient(i)) });

  const visibleItems = (rows: EstimateItem[]) =>
    rows.filter((i) => toggles.showZeroLines || preMarginIncTax(i) !== 0);

  const groupTotal = (groupId: string): string => {
    const { incTax, exTax } = calculateGroupSubtotals(collectGroupMoneyItems(groupId));
    if (subtotalBasis === "ex") return money(exTax);
    if (subtotalBasis === "both") return `${money(exTax)} ex · ${money(incTax)} inc`;
    return money(incTax);
  };

  const toTableGroup = (group: EstimateGroup): PdfTableGroup<EstimateItem> => {
    const rows = hideLineItems ? [] : visibleItems(itemsByGroup[group.id] || []);
    const children = (subgroupsByParent[group.id] || []).map(toTableGroup);
    /* When a group prints its total.

       The old rule — more than one line, or sub-groups — assumed a single line
       already shows its own amount, so a total would repeat it. That is only
       true when an Amount column is on. With the amount columns off (Jed's
       layout) or in Section Totals mode (which prints no lines at all), a
       one-line or zero-line group then showed its price NOWHERE: Structural
       Steel, Brickwork, Insulation, Plastering and Painting on 11 Coolum, and
       every group in Section Totals.

       So: without an amount column, any group with money under it shows its
       total. With one, the total shows when it adds something — several rows,
       sub-groups, or cost in lines the client cannot see. */
    const moneyItems = collectGroupMoneyItems(group.id);
    const linesPrintAmounts = toggles.amountExTax || toggles.amountIncTax;
    const hasHiddenMoney = moneyItems.some((i) => !lineAppearsOnProposal(i, hiddenGroupIds));
    const earnsTotal = linesPrintAmounts
      ? rows.length > 1 || children.length > 0 || hasHiddenMoney
      : moneyItems.length > 0;
    /* The group's own words. `estimate_groups.description` has existed as long
       as the table and no document has ever printed one, so a builder could
       write a paragraph explaining a stage of the work and the client would
       never see it.

       It is written in a rich-text editor, and it used to go through
       pdfPlainText, which strips every tag — so bold, italics and bullet lists
       reached the client as flat lines. It renders through RichTextBlocks now,
       the renderer the proposal's own section text uses, so it prints the way
       it was written. Line descriptions still go through pdfPlainText: they
       sit inside a narrow table cell, where block formatting has no room. */
    const groupText = (group as { description?: string | null }).description;
    return {
      key: group.id,
      label: group.name,
      total: toggles.showSubtotals && earnsTotal ? groupTotal(group.id) : undefined,
      description:
        toggles.groupDescriptions !== false && pdfHasText(groupText)
          ? <RichTextBlocks html={groupText!} textStyle={GROUP_NOTE_TEXT_STYLE} />
          : undefined,
      rows,
      children,
    };
  };

  const renderRowText = (item: EstimateItem) => (
    <View>
      <View style={styles.itemCell}>
        <Text>{item.name || "Untitled"}</Text>
        {toggles.showAllowanceType && allowanceLabel(item) ? (
          <Text style={styles.allowanceTag}>{allowanceLabel(item)}</Text>
        ) : null}
      </View>
      {toggles.description && pdfHasText(item.description) ? (
        <Text style={styles.itemDescription}>{pdfPlainText(item.description)}</Text>
      ) : null}
    </View>
  );

  const tableGroups: Array<PdfTableGroup<EstimateItem>> = rootGroups.map(toTableGroup);
  if (ungroupedItems.length > 0 && !hideLineItems) {
    tableGroups.push({
      key: "__ungrouped__",
      label: "Other items",
      rows: visibleItems(ungroupedItems),
    });
  }

  // The grand total moves into the shared totals card: a bordered panel with
  // the figure in the brand colour, rather than a full-width brand bar. The
  // kit's note is that a fill behind the total fights the table above it.
  const totalRows = [] as Array<{ label: string; value: string }>;
  if (showGst) {
    totalRows.push({ label: "Subtotal (ex GST)", value: money(grandTotalExTax) });
    totalRows.push({
      label: `GST (${Number(estimate?.taxRate ?? 10)}%)`,
      value: money(round2(grandTotalIncTax - grandTotalExTax)),
    });
  }

  return (
      <View style={{ paddingHorizontal: PDF_PAGE_MARGIN, paddingTop: 16 }}>
        <Text
          minPresenceAhead={60}
          style={{
            fontSize: PDF_TYPE.docTitle,
            fontFamily: PDF_FONT_FAMILY,
            fontWeight: PDF_WEIGHT.bold,
            color: PDF_COLORS.ink,
            marginBottom: 12,
          }}
        >
          {section.name || "Estimate"}
        </Text>

        {/* Said on the page, not just in the editor's chrome: a template
            preview can be downloaded, and a page of plausible figures with
            nothing marking them as invented is the kind of thing that reaches
            a client by accident. */}
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
            SAMPLE FIGURES — EACH PROPOSAL SHOWS ITS OWN ESTIMATE
          </Text>
        )}

        {/* The section's own Description, same as every other section type. */}
        <SectionIntro section={section} textStyle={textStyle} />

        {/* The estimate editor's separate description field. Kept rendering so
            proposals that already use it are unchanged; new text is better put
            in the Description above, which every section shares. */}
        {typeof content.estimateDescription === "string" && content.estimateDescription && (
          <Text style={styles.description}>{pdfPlainText(String(content.estimateDescription))}</Text>
        )}

        {/* One table per top-level group rather than a single continuous
            block. A 60-line estimate reads as one undifferentiated slab
            otherwise; a builder thinks in trades and areas, and so does the
            client reading it. Sub-groups still nest INSIDE their parent's
            table — splitting those out too would lose the containment that
            makes Joinery read as part of Kitchen. */}
        {tableGroups.map((group, i) => (
          <View key={group.key} style={i > 0 ? { marginTop: PDF_SPACE.lg } : undefined}>
            <PdfLineTable<EstimateItem>
              columns={columns}
              // The group's own band is suppressed: its name and total are the
              // header row now. "Item" above a block already headed KITCHEN
              // was labelling the obvious.
              groups={[{ ...group, label: undefined, total: undefined, description: undefined }]}
              textHeader={group.label}
              // The group's own words. It has no label row of its own here —
              // its name IS the table header — so the note hangs off that.
              headerNote={group.description}
              // Only where the right edge is free. With an amount column on,
              // the figures own that edge and the group total stays with the
              // trailing row instead.
              headerRight={columns.length === 0 ? group.total : undefined}
              /* With columns on, the header's right edge belongs to them, so the
                 total goes below the rows. It used to go nowhere: the comment
                 above promised a trailing row that was never passed, so any
                 layout with a Qty or Unit column printed no group totals. */
              trailingRows={
                columns.length > 0 && group.total
                  ? [{ label: `${group.label} total`, value: group.total, emphasis: true }]
                  : undefined
              }
              renderText={renderRowText}
              brandColor={resolvedColor}
              rowKey={(item) => item.id}
              repeatHeader={!sharesPage}
            />
          </View>
        ))}

        {/* The estimate's own total, not the Summary section — it belongs to
            the table above it, so it is named and ruled off rather than
            floating after the last group. */}
        <View style={{ marginTop: PDF_SPACE.xl }}>
          <View
            style={{
              borderTopWidth: 1,
              borderTopColor: PDF_COLORS.border,
              paddingTop: PDF_SPACE.md,
              marginBottom: PDF_SPACE.sm,
            }}
          >
            <Text
              style={{
                fontFamily: PDF_FONT_FAMILY,
                fontWeight: PDF_WEIGHT.semibold,
                fontSize: PDF_TYPE.sectionLabel,
                letterSpacing: PDF_TYPE.sectionLabelTracking,
                textTransform: "uppercase",
                color: PDF_COLORS.inkMuted,
              }}
            >
              Estimate total
            </Text>
          </View>
          <PdfTotalsCard
            rows={totalRows}
            totalLabel={showGst ? "Total (inc GST)" : "Total"}
            totalValue={money(showGst ? grandTotalIncTax : grandTotalExTax)}
            brandColor={resolvedColor}
          />
        </View>
      </View>
  );
}
