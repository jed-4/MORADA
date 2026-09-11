import { Text, View, StyleSheet } from "@react-pdf/renderer";
import type { ProposalSection, Estimate, EstimateGroup, EstimateItem } from "@shared/schema";
import { round2 } from "@shared/pricing";
import {
  clientLineAmounts,
  collectHiddenGroupIds,
  lineAppearsOnProposal,
  lineCountsTowardProposalTotal,
} from "@shared/proposalTotals";
import { SectionIntro } from "./RichTextBlocks";
import { tintOnWhite } from "@/components/pdf/shared/pdfColor";
import { PDF_FONT_FAMILY } from "@/components/pdf/shared/registerPdfFonts";

interface EstimateSectionProps {
  section: ProposalSection;
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
  estimateData,
  companyLogo,
  companyName,
  companyPhone,
  primaryColor = "#3B82F6",
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

  // Honour the estimate grid's two client-facing switches. Both were written by
  // the grid and read by nothing, so a line the user hid with the eye toggle
  // printed anyway, with its price. Filtering here rather than at each call
  // site means the grouping, every subtotal and the grand total all agree —
  // and they agree with computeProposalTotals on the server, which drives the
  // figure the payment schedule is a percentage of. If the two ever diverge
  // the client gets a column that does not add up to its own total.
  // Sections hidden from the proposal, resolved once — nested groups inherit
  // their parent's hiding.
  const hiddenGroupIds = collectHiddenGroupIds(groups);
  const items = allItems.filter((it) => lineAppearsOnProposal(it, hiddenGroupIds));

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

  // A group's items PLUS all of its descendant subgroups' items — so a container
  // group's subtotal includes the money nested inside it (the flat version
  // summed direct children only and printed $0 for pure container groups).
  const collectGroupItems = (groupId: string, seen = new Set<string>()): EstimateItem[] => {
    if (seen.has(groupId)) return []; // guard against legacy corrupt parent cycles
    seen.add(groupId);
    const own = itemsByGroup[groupId] || [];
    const kids = subgroupsByParent[groupId] || [];
    return kids.reduce((acc, k) => acc.concat(collectGroupItems(k.id, seen)), [...own]);
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
  // A line marked "excluded" is named on the proposal as NOT part of this
  // price, so it contributes nothing — matching lineCountsTowardProposalTotal
  // on the server. "included" and "empty" only change the printed cell; the
  // client is still paying for those lines.
  const lineIncTaxClient = (item: EstimateItem) =>
    lineCountsTowardProposalTotal(item, hiddenGroupIds) ? clientLineAmounts(item, amountOpts).incTax : 0;
  const lineExTaxClient = (item: EstimateItem) =>
    lineCountsTowardProposalTotal(item, hiddenGroupIds) ? clientLineAmounts(item, amountOpts).exTax : 0;

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

  const grandTotalIncTax = round2(items.reduce((sum, item) => sum + lineIncTaxClient(item), 0));
  const grandTotalExTax = round2(items.reduce((sum, item) => sum + lineExTaxClient(item), 0));

  const styles = StyleSheet.create({
    description: {
      marginBottom: 15,
      fontSize: 10,
      color: "#333333",
    },
    groupHeader: {
      backgroundColor: resolvedColor,
      color: "#ffffff",
      padding: 8,
      fontSize: 11,
      fontFamily: PDF_FONT_FAMILY, fontWeight: 700,
      marginTop: 15,
      marginBottom: 0,
    },
    groupDescription: {
      fontSize: 9,
      color: "#444444",
      lineHeight: 1.4,
      paddingTop: 6,
      paddingBottom: 2,
      paddingHorizontal: 2,
    },
    tableHeader: {
      flexDirection: "row",
      backgroundColor: isS2 ? resolvedColor + "14" : "#f5f5f5",
      padding: 6,
      fontFamily: PDF_FONT_FAMILY, fontWeight: 700,
      fontSize: 9,
      borderBottom: `1px solid ${isS2 ? tintOnWhite(resolvedColor, "40") : "#cccccc"}`,
    },
    tableRow: {
      flexDirection: "row",
      padding: 6,
      borderBottom: "1px solid #eeeeee",
      fontSize: 9,
    },
    subtotalRow: {
      flexDirection: "row",
      padding: 6,
      backgroundColor: isS2 ? resolvedColor + "0d" : "#f9f9f9",
      fontFamily: PDF_FONT_FAMILY, fontWeight: 700,
      fontSize: 9,
      marginTop: 0,
    },
    totalRow: {
      flexDirection: "row",
      padding: 8,
      backgroundColor: resolvedColor,
      color: "#ffffff",
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
      color: "#666666",
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

  const renderTableHeader = () => (
    // Repeats while the table runs — a second page of unlabelled figures makes
    // the reader page back to find out which column is the price. Only when the
    // estimate has the sheet to itself: `fixed` is scoped to the <Page>, so on a
    // shared sheet it would reprint above whatever follows the table.
    <View fixed={!sharesPage} style={styles.tableHeader}>
      <Text style={[styles.col, { width: nameWidth }]}>Item</Text>
      {toggles.description && !descriptionUnderName && (
        <Text style={[styles.col, { width: colWidths.description }]}>Description</Text>
      )}
      {toggles.quantity && (
        <Text style={[styles.col, styles.textRight, { width: colWidths.numeric }]}>Qty</Text>
      )}
      {toggles.unit && (
        <Text style={[styles.col, { width: colWidths.numeric }]}>Unit</Text>
      )}
      {toggles.unitCostExTax && (
        <Text style={[styles.col, styles.textRight, { width: colWidths.numeric }]}>
          Unit Cost (ex)
        </Text>
      )}
      {toggles.unitCostIncTax && (
        <Text style={[styles.col, styles.textRight, { width: colWidths.numeric }]}>
          Unit Cost (inc)
        </Text>
      )}
      {toggles.markup && (
        <Text style={[styles.col, styles.textRight, { width: colWidths.numeric }]}>Markup %</Text>
      )}
      {toggles.amountExTax && (
        <Text style={[styles.col, styles.textRight, { width: colWidths.numeric }]}>
          Amount (ex)
        </Text>
      )}
      {toggles.amountIncTax && (
        <Text style={[styles.col, styles.textRight, { width: colWidths.numeric }]}>
          Amount (inc)
        </Text>
      )}
    </View>
  );

  const renderTableRow = (item: EstimateItem) => {
    // Use the recomputed amount (not the possibly-stale cache) so a zeroed
    // priced line is correctly hidden.
    if (!toggles.showZeroLines && preMarginIncTax(item) === 0) {
      return null;
    }
    const unitCostTax = Math.round(item.unitCostExTax * (estimate.taxRate || 10)) / 100;
    const unitCostIncTax = Math.round((item.unitCostExTax + unitCostTax) * 100) / 100;

    return (
      <View key={item.id} wrap={false} style={styles.tableRow}>
        <View style={[styles.col, { width: nameWidth }]}>
          <View style={styles.itemCell}>
            <Text>{item.name || "Untitled"}</Text>
            {toggles.showAllowanceType && allowanceLabel(item) ? (
              <Text style={styles.allowanceTag}>{allowanceLabel(item)}</Text>
            ) : null}
          </View>
          {/* Under the name rather than in a column of its own: descriptions
              are sentences, and a 200pt column of wrapped prose beside a short
              name left the table ragged and the page half empty. A dash is not
              printed for lines that simply have no description. */}
          {toggles.description && descriptionUnderName && item.description ? (
            <Text style={styles.itemDescription}>{item.description}</Text>
          ) : null}
        </View>
        {toggles.description && !descriptionUnderName && (
          <Text style={[styles.col, { width: colWidths.description }]}>
            {item.description || "-"}
          </Text>
        )}
        {toggles.quantity && (
          <Text style={[styles.col, styles.textRight, { width: colWidths.numeric }]}>
            {formatQuantity(item.quantity)}
          </Text>
        )}
        {toggles.unit && (
          <Text style={[styles.col, { width: colWidths.numeric }]}>{item.unitType || ""}</Text>
        )}
        {toggles.unitCostExTax && (
          <Text style={[styles.col, styles.textRight, { width: colWidths.numeric }]}>
            {formatCurrency(item.unitCostExTax)}
          </Text>
        )}
        {toggles.unitCostIncTax && (
          <Text style={[styles.col, styles.textRight, { width: colWidths.numeric }]}>
            {formatCurrency(unitCostIncTax)}
          </Text>
        )}
        {toggles.markup && (
          <Text style={[styles.col, styles.textRight, { width: colWidths.numeric }]}>
            {item.markupPercent ?? 0}%
          </Text>
        )}
        {toggles.amountExTax && (
          <Text style={[styles.col, styles.textRight, { width: colWidths.numeric }]}>
            {amountCell(item, lineExTaxClient(item))}
          </Text>
        )}
        {toggles.amountIncTax && (
          <Text style={[styles.col, styles.textRight, { width: colWidths.numeric }]}>
            {amountCell(item, lineIncTaxClient(item))}
          </Text>
        )}
      </View>
    );
  };


  const subtotalRow = (label: string, value: number) => (
    <View wrap={false} minPresenceAhead={30} style={styles.subtotalRow}>
      <Text style={[styles.col, { flex: 1 }]}>{label}</Text>
      <Text style={[styles.col, styles.textRight, { width: colWidths.numeric }]}>
        {formatCurrency(value)}
      </Text>
    </View>
  );

  /**
   * `isRoot` because a subtotal is only meaningful once per top-level group.
   * Nested groups used to print their own as well, so "Subtotal — Joinery
   * $1,100.00" sat directly above "Subtotal — Kitchen $2,200.00" with nothing
   * saying the second contained the first — it read as $3,300 of work.
   */
  const renderGroup = (group: EstimateGroup, isRoot = false): any => {
    const directItems = itemsByGroup[group.id] || [];
    const subgroups = subgroupsByParent[group.id] || [];
    // Spans the group AND its descendants, so the printed subtotals add up to
    // the printed grand total even when a group is a pure container.
    const { incTax, exTax } = calculateGroupSubtotals(collectGroupItems(group.id));

    return (
      <View key={group.id}>
        <View minPresenceAhead={70} style={styles.groupHeader}>
          <Text style={{ color: "#ffffff" }}>{group.name}</Text>
        </View>
        {/* The group's description is the section's specification — it reads as
            the blurb under the heading, above that section's lines. */}
        {group.description ? (
          <Text style={styles.groupDescription}>{group.description}</Text>
        ) : null}
        {!hideLineItems && toggles.showColumnHeader && directItems.length > 0 && renderTableHeader()}
        {!hideLineItems && directItems.map(renderTableRow)}
        {subgroups.map((sg) => renderGroup(sg))}
        {toggles.showSubtotals && isRoot && (
          <>
            {(subtotalBasis === "ex" || subtotalBasis === "both") &&
              subtotalRow(
                `${group.name} subtotal${showGst ? " (ex GST)" : ""}`,
                exTax,
              )}
            {(subtotalBasis === "inc" || subtotalBasis === "both") &&
              subtotalRow(`${group.name} subtotal (inc GST)`, incTax)}
          </>
        )}
      </View>
    );
  };

  return (
      <View style={{ paddingHorizontal: 40, paddingTop: 16 }}>
        <Text
          minPresenceAhead={60}
          style={{
            fontSize: 16,
            fontFamily: PDF_FONT_FAMILY, fontWeight: 700,
            color: resolvedColor,
            marginBottom: 12,
          }}
        >
          {section.name || "Estimate"}
        </Text>

        {/* The section's own Description, same as every other section type. */}
        <SectionIntro section={section} />

        {/* The estimate editor's separate description field. Kept rendering so
            proposals that already use it are unchanged; new text is better put
            in the Description above, which every section shares. */}
        {typeof content.estimateDescription === "string" && content.estimateDescription && (
          <Text style={styles.description}>{content.estimateDescription}</Text>
        )}

        {rootGroups.map((g) => renderGroup(g, true))}

        {ungroupedItems.length > 0 && !hideLineItems && (
          <View>
            <View style={styles.groupHeader}>
              <Text style={{ color: "#ffffff" }}>Other Items</Text>
            </View>
            {toggles.showColumnHeader && renderTableHeader()}
            {ungroupedItems.map(renderTableRow)}
          </View>
        )}

        {toggles.amountExTax && (
          <View wrap={false} style={styles.totalRow}>
            <Text style={[styles.col, { flex: 1, color: "#ffffff" }]}>
              Total Price (ex. tax)
            </Text>
            <Text style={[styles.col, styles.textRight, { width: colWidths.numeric, color: "#ffffff" }]}>
              {formatCurrency(grandTotalExTax)}
            </Text>
          </View>
        )}
        {toggles.amountIncTax && showGst && (
          <View wrap={false} style={styles.totalRow}>
            <Text style={[styles.col, { flex: 1, color: "#ffffff" }]}>
              Total Price (inc. tax)
            </Text>
            <Text style={[styles.col, styles.textRight, { width: colWidths.numeric, color: "#ffffff" }]}>
              {formatCurrency(grandTotalIncTax)}
            </Text>
          </View>
        )}
        {!toggles.amountExTax && !(toggles.amountIncTax && showGst) && (
          <View wrap={false} style={styles.totalRow}>
            <Text style={[styles.col, { flex: 1, color: "#ffffff" }]}>Total Price</Text>
            <Text style={[styles.col, styles.textRight, { width: colWidths.numeric, color: "#ffffff" }]}>
              {formatCurrency(showGst ? grandTotalIncTax : grandTotalExTax)}
            </Text>
          </View>
        )}
      </View>
  );
}
