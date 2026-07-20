import { Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { ProposalSection, Estimate, EstimateGroup, EstimateItem } from "@shared/schema";
import { round2, isFixedPriceLine, computeEstimateItemPrice } from "@shared/pricing";
import { DocProposalInnerHeader } from "@/components/pdf/shared/DocProposalInnerHeader";
import { DocFooter } from "@/components/pdf/shared/DocFooter";

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
  proposalName?: string;
  proposalNumber?: string;
  expiryDate?: string;
  pricingMode?: "lump_sum" | "itemised" | "section_totals";
  showGst?: boolean;
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
  proposalName,
  proposalNumber,
  pricingMode = "itemised",
  showGst = true,
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

  const { estimate, groups, items } = estimateData;

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
    .filter((g) => !g.parentGroupId)
    .sort((a, b) => a.order - b.order);
  const subgroupsByParent: Record<string, EstimateGroup[]> = {};
  for (const g of groups) {
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

  const formatCurrency = (amount: number) => `$${amount.toFixed(2)}`;
  const formatQuantity = (qty: number) => qty.toFixed(2).replace(/\.?0+$/, "");

  // The stored priceIncTax is the PRE-margin line amount (line markup only).
  // The builder's margin (project markup) is a single global uplift on the
  // ex-GST subtotal. Because it is a flat percentage, distributing it
  // proportionally across every line is exact: per-line and group figures still
  // sum to the grand total, and the grand total equals the estimate's canonical
  // contract price. It is also the right client-facing behaviour — the margin
  // is embedded in the prices, never shown as its own line. (Summing the raw
  // pre-margin cache here previously under-quoted by the whole margin.)
  const marginFactor = 1 + (Number(estimate?.projectMarkupPercent ?? 0) / 100);
  const taxRatePct = Number(estimate?.taxRate ?? 10);

  // Pre-margin line amounts. Priced lines are RECOMPUTED from qty × unitCost ×
  // line markup (never the stored cache), so a legacy margin-baked cache can't
  // double-count the margin here. Fixed-price allowances use their authoritative
  // typed priceIncTax. This mirrors the estimate grid and computeEstimateSummary.
  const preMarginIncTax = (item: EstimateItem): number => {
    if (isFixedPriceLine(item.unitCostExTax)) return round2(Number(item.priceIncTax ?? 0));
    return computeEstimateItemPrice({
      unitCostExTax: item.unitCostExTax ?? 0,
      quantity: item.quantity ?? 0,
      markupPercent: item.markupPercent,
      projectMarkupPercent: 0,
      taxRate: taxRatePct,
      wastagePercent: (item as any).wastagePercent,
    }).lineIncTax;
  };
  const preMarginExTax = (item: EstimateItem): number => {
    if (isFixedPriceLine(item.unitCostExTax)) {
      const inc = round2(Number(item.priceIncTax ?? 0));
      return round2(inc / (1 + taxRatePct / 100));
    }
    return computeEstimateItemPrice({
      unitCostExTax: item.unitCostExTax ?? 0,
      quantity: item.quantity ?? 0,
      markupPercent: item.markupPercent,
      projectMarkupPercent: 0,
      taxRate: taxRatePct,
      wastagePercent: (item as any).wastagePercent,
    }).lineExTax;
  };
  const lineIncTaxClient = (item: EstimateItem) => round2(preMarginIncTax(item) * marginFactor);
  const lineExTaxClient = (item: EstimateItem) => round2(preMarginExTax(item) * marginFactor);

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
      fontFamily: "Helvetica-Bold",
      marginTop: 15,
      marginBottom: 0,
    },
    tableHeader: {
      flexDirection: "row",
      backgroundColor: isS2 ? resolvedColor + "14" : "#f5f5f5",
      padding: 6,
      fontFamily: "Helvetica-Bold",
      fontSize: 9,
      borderBottom: `1px solid ${isS2 ? resolvedColor + "40" : "#cccccc"}`,
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
      fontFamily: "Helvetica-Bold",
      fontSize: 9,
      marginTop: 0,
    },
    totalRow: {
      flexDirection: "row",
      padding: 8,
      backgroundColor: resolvedColor,
      color: "#ffffff",
      fontFamily: "Helvetica-Bold",
      fontSize: 11,
      marginTop: 15,
    },
    col: {
      paddingHorizontal: 4,
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

  const renderTableHeader = () => (
    <View style={styles.tableHeader}>
      <Text style={[styles.col, { width: colWidths.item }]}>Item</Text>
      {toggles.description && (
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
      <View key={item.id} style={styles.tableRow}>
        <Text style={[styles.col, { width: colWidths.item }]}>{item.name || "Untitled"}</Text>
        {toggles.description && (
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
            {formatCurrency(lineExTaxClient(item))}
          </Text>
        )}
        {toggles.amountIncTax && (
          <Text style={[styles.col, styles.textRight, { width: colWidths.numeric }]}>
            {formatCurrency(lineIncTaxClient(item))}
          </Text>
        )}
      </View>
    );
  };

  const renderGroup = (group: EstimateGroup): any => {
    const directItems = itemsByGroup[group.id] || [];
    const subgroups = subgroupsByParent[group.id] || [];
    // Subtotal spans the group AND its descendants so the printed subtotals add
    // up to the printed grand total even when a group is a pure container.
    const { incTax, exTax } = calculateGroupSubtotals(collectGroupItems(group.id));

    return (
      <View key={group.id}>
        <View style={styles.groupHeader}>
          <Text style={{ color: "#ffffff" }}>{group.name}</Text>
        </View>
        {!hideLineItems && directItems.length > 0 && renderTableHeader()}
        {!hideLineItems && directItems.map(renderTableRow)}
        {subgroups.map((sg) => renderGroup(sg))}
        {toggles.showSubtotals && (
          <>
            {toggles.amountExTax && (
              <View style={styles.subtotalRow}>
                <Text style={[styles.col, { flex: 1 }]}>
                  Subtotal (ex. tax) — {group.name}
                </Text>
                <Text style={[styles.col, styles.textRight, { width: colWidths.numeric }]}>
                  {formatCurrency(exTax)}
                </Text>
              </View>
            )}
            {toggles.amountIncTax && (
              <View style={styles.subtotalRow}>
                <Text style={[styles.col, { flex: 1 }]}>
                  Subtotal (inc. tax) — {group.name}
                </Text>
                <Text style={[styles.col, styles.textRight, { width: colWidths.numeric }]}>
                  {formatCurrency(incTax)}
                </Text>
              </View>
            )}
            {!toggles.amountExTax && !toggles.amountIncTax && (
              <View style={styles.subtotalRow}>
                <Text style={[styles.col, { flex: 1 }]}>Subtotal — {group.name}</Text>
                <Text style={[styles.col, styles.textRight, { width: colWidths.numeric }]}>
                  {formatCurrency(incTax)}
                </Text>
              </View>
            )}
          </>
        )}
      </View>
    );
  };

  return (
    <Page
      size="A4"
      style={{ paddingBottom: 60, fontFamily: "Helvetica", backgroundColor: "#ffffff" }}
    >
      <DocProposalInnerHeader
        companyName={companyName}
        companyPhone={companyPhone}
        logoUrl={companyLogo}
        proposalNumber={proposalNumber}
        proposalName={proposalName}
        brandColor={resolvedColor}
        docStyle={documentStyle}
      />
      <View style={{ paddingHorizontal: 40, paddingTop: 16 }}>
        <Text
          style={{
            fontSize: 16,
            fontFamily: "Helvetica-Bold",
            color: resolvedColor,
            marginBottom: 12,
          }}
        >
          {section.name || "Estimate"}
        </Text>

        {typeof content.estimateDescription === "string" && content.estimateDescription && (
          <Text style={styles.description}>{content.estimateDescription}</Text>
        )}

        {rootGroups.map((g) => renderGroup(g))}

        {ungroupedItems.length > 0 && !hideLineItems && (
          <View>
            <View style={styles.groupHeader}>
              <Text style={{ color: "#ffffff" }}>Other Items</Text>
            </View>
            {renderTableHeader()}
            {ungroupedItems.map(renderTableRow)}
          </View>
        )}

        {toggles.amountExTax && (
          <View style={styles.totalRow}>
            <Text style={[styles.col, { flex: 1, color: "#ffffff" }]}>
              Total Price (ex. tax)
            </Text>
            <Text style={[styles.col, styles.textRight, { width: colWidths.numeric, color: "#ffffff" }]}>
              {formatCurrency(grandTotalExTax)}
            </Text>
          </View>
        )}
        {toggles.amountIncTax && showGst && (
          <View style={styles.totalRow}>
            <Text style={[styles.col, { flex: 1, color: "#ffffff" }]}>
              Total Price (inc. tax)
            </Text>
            <Text style={[styles.col, styles.textRight, { width: colWidths.numeric, color: "#ffffff" }]}>
              {formatCurrency(grandTotalIncTax)}
            </Text>
          </View>
        )}
        {!toggles.amountExTax && !(toggles.amountIncTax && showGst) && (
          <View style={styles.totalRow}>
            <Text style={[styles.col, { flex: 1, color: "#ffffff" }]}>Total Price</Text>
            <Text style={[styles.col, styles.textRight, { width: colWidths.numeric, color: "#ffffff" }]}>
              {formatCurrency(showGst ? grandTotalIncTax : grandTotalExTax)}
            </Text>
          </View>
        )}
      </View>
      <DocFooter
        companyName={companyName}
        brandColor={resolvedColor}
        docStyle={documentStyle}
      />
    </Page>
  );
}
