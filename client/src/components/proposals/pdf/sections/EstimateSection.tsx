import { Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { ProposalSection, Estimate, EstimateGroup, EstimateItem } from "@shared/schema";

interface EstimateSectionProps {
  section: ProposalSection;
  estimateData?: {
    estimate: Estimate;
    groups: EstimateGroup[];
    items: EstimateItem[];
  };
  companyLogo?: string;
  companyName?: string;
  primaryColor?: string;
  proposalName?: string;
  proposalNumber?: string;
  expiryDate?: string;
}

export function EstimateSection({
  section,
  estimateData,
  companyLogo,
  companyName,
  primaryColor = "#3B82F6",
  proposalName,
  proposalNumber,
  expiryDate,
}: EstimateSectionProps) {
  if (!estimateData) {
    return null;
  }

  const content = section.content as Record<string, any> || {};
  const toggles = content.columnToggles || {
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

  const { estimate, groups, items } = estimateData;

  // Group items by their groupId
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

  // Sort groups by order
  const sortedGroups = [...groups].sort((a, b) => a.order - b.order);

  // Helper function to format currency
  const formatCurrency = (amount: number) => {
    return `$${amount.toFixed(2)}`;
  };

  const formatQuantity = (qty: number) => {
    return qty.toFixed(2).replace(/\.?0+$/, '');
  };

  // Calculate group subtotals
  const calculateGroupSubtotals = (groupItems: EstimateItem[]) => {
    const incTax = groupItems.reduce((sum, item) => sum + (item.priceIncTax ?? 0), 0);
    const exTax = groupItems.reduce((sum, item) => sum + ((item.priceIncTax ?? 0) - (item.taxAmount ?? 0)), 0);
    return { incTax, exTax };
  };

  // Calculate grand totals
  const grandTotalIncTax = items.reduce((sum, item) => sum + (item.priceIncTax ?? 0), 0);
  const grandTotalExTax = items.reduce((sum, item) => sum + ((item.priceIncTax ?? 0) - (item.taxAmount ?? 0)), 0);

  // Create styles
  const styles = StyleSheet.create({
    page: {
      padding: 40,
      fontSize: 10,
      fontFamily: "Helvetica",
    },
    header: {
      marginBottom: 20,
      borderBottom: `2px solid ${primaryColor}`,
      paddingBottom: 10,
    },
    title: {
      fontSize: 16,
      fontWeight: "bold",
      marginBottom: 5,
    },
    subtitle: {
      fontSize: 10,
      color: "#666666",
    },
    description: {
      marginBottom: 15,
      fontSize: 10,
      color: "#333333",
    },
    groupHeader: {
      backgroundColor: "#000000",
      color: "#ffffff",
      padding: 8,
      fontSize: 11,
      fontWeight: "bold",
      marginTop: 15,
      marginBottom: 5,
    },
    tableHeader: {
      flexDirection: "row",
      backgroundColor: "#f5f5f5",
      padding: 6,
      fontWeight: "bold",
      fontSize: 9,
      borderBottom: "1px solid #cccccc",
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
      backgroundColor: "#f9f9f9",
      fontWeight: "bold",
      fontSize: 9,
      marginTop: 5,
    },
    totalRow: {
      flexDirection: "row",
      padding: 8,
      backgroundColor: "#000000",
      color: "#ffffff",
      fontWeight: "bold",
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

  // Calculate column widths based on visible columns
  const getColumnWidth = () => {
    const visibleCols = [
      "Item",
      toggles.description && "Description",
      toggles.quantity && "Qty",
      toggles.unitCostExTax && "Unit Cost (ex. tax)",
      toggles.unitCostIncTax && "Unit Cost (inc. tax)",
      toggles.markup && "Markup %",
      toggles.amountExTax && "Amount (ex. tax)",
      toggles.amountIncTax && "Amount (inc. tax)",
    ].filter(Boolean);

    const numericColWidth = 60;
    const itemColWidth = 150;
    const descColWidth = 200;
    
    return {
      item: itemColWidth,
      description: descColWidth,
      numeric: numericColWidth,
    };
  };

  const colWidths = getColumnWidth();

  // Render table header
  const renderTableHeader = () => (
    <View style={styles.tableHeader}>
      <Text style={[styles.col, { width: colWidths.item }]}>Item</Text>
      {toggles.description && <Text style={[styles.col, { width: colWidths.description }]}>Description</Text>}
      {toggles.quantity && <Text style={[styles.col, styles.textRight, { width: colWidths.numeric }]}>Qty</Text>}
      {toggles.unitCostExTax && <Text style={[styles.col, styles.textRight, { width: colWidths.numeric }]}>Unit Cost (ex)</Text>}
      {toggles.unitCostIncTax && <Text style={[styles.col, styles.textRight, { width: colWidths.numeric }]}>Unit Cost (inc)</Text>}
      {toggles.markup && <Text style={[styles.col, styles.textRight, { width: colWidths.numeric }]}>Markup %</Text>}
      {toggles.amountExTax && <Text style={[styles.col, styles.textRight, { width: colWidths.numeric }]}>Amount (ex)</Text>}
      {toggles.amountIncTax && <Text style={[styles.col, styles.textRight, { width: colWidths.numeric }]}>Amount (inc)</Text>}
    </View>
  );

  // Render table row
  const renderTableRow = (item: EstimateItem) => {
    // Skip zero-price items if toggle is off
    if (!toggles.showZeroLines && (item.priceIncTax ?? 0) === 0) {
      return null;
    }

    const unitCostTax = Math.round(item.unitCostExTax * (estimate.taxRate || 10)) / 100;
    const unitCostIncTax = Math.round((item.unitCostExTax + unitCostTax) * 100) / 100;

    return (
      <View key={item.id} style={styles.tableRow}>
        <Text style={[styles.col, { width: colWidths.item }]}>{item.name || "Untitled"}</Text>
        {toggles.description && <Text style={[styles.col, { width: colWidths.description }]}>{item.description || "-"}</Text>}
        {toggles.quantity && <Text style={[styles.col, styles.textRight, { width: colWidths.numeric }]}>{formatQuantity(item.quantity)}</Text>}
        {toggles.unitCostExTax && <Text style={[styles.col, styles.textRight, { width: colWidths.numeric }]}>{formatCurrency(item.unitCostExTax)}</Text>}
        {toggles.unitCostIncTax && <Text style={[styles.col, styles.textRight, { width: colWidths.numeric }]}>{formatCurrency(unitCostIncTax)}</Text>}
        {toggles.markup && <Text style={[styles.col, styles.textRight, { width: colWidths.numeric }]}>{item.markupPercent ?? estimate.projectMarkupPercent ?? 0}%</Text>}
        {toggles.amountExTax && <Text style={[styles.col, styles.textRight, { width: colWidths.numeric }]}>{formatCurrency((item.priceIncTax ?? 0) - (item.taxAmount ?? 0))}</Text>}
        {toggles.amountIncTax && <Text style={[styles.col, styles.textRight, { width: colWidths.numeric }]}>{formatCurrency(item.priceIncTax ?? 0)}</Text>}
      </View>
    );
  };

  // Render group
  const renderGroup = (group: EstimateGroup) => {
    const groupItems = itemsByGroup[group.id] || [];
    const { incTax, exTax } = calculateGroupSubtotals(groupItems);

    return (
      <View key={group.id}>
        <View style={styles.groupHeader}>
          <Text>{group.name}</Text>
        </View>
        {renderTableHeader()}
        {groupItems.map(renderTableRow)}
        {toggles.showSubtotals && (
          <>
            {toggles.amountExTax && (
              <View style={styles.subtotalRow}>
                <Text style={[styles.col, { flex: 1 }]}>Subtotal (ex. tax) - {group.name}</Text>
                <Text style={[styles.col, styles.textRight, { width: colWidths.numeric }]}>{formatCurrency(exTax)}</Text>
              </View>
            )}
            {toggles.amountIncTax && (
              <View style={styles.subtotalRow}>
                <Text style={[styles.col, { flex: 1 }]}>Subtotal (inc. tax) - {group.name}</Text>
                <Text style={[styles.col, styles.textRight, { width: colWidths.numeric }]}>{formatCurrency(incTax)}</Text>
              </View>
            )}
            {!toggles.amountExTax && !toggles.amountIncTax && (
              <View style={styles.subtotalRow}>
                <Text style={[styles.col, { flex: 1 }]}>Subtotal - {group.name}</Text>
                <Text style={[styles.col, styles.textRight, { width: colWidths.numeric }]}>{formatCurrency(incTax)}</Text>
              </View>
            )}
          </>
        )}
      </View>
    );
  };

  return (
    <Page size="A4" style={styles.page}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>{proposalName || "Proposal"}</Text>
        <Text style={styles.subtitle}>Proposal #{proposalNumber}</Text>
        {expiryDate && (
          <Text style={styles.subtitle}>
            Valid until: {new Date(expiryDate).toLocaleDateString()}
          </Text>
        )}
      </View>

      {/* Section title */}
      <Text style={styles.title}>{section.name || "Estimate"}</Text>

      {/* Optional description */}
      {content.estimateDescription && (
        <Text style={styles.description}>{content.estimateDescription}</Text>
      )}

      {/* Render groups */}
      {sortedGroups.map(renderGroup)}

      {/* Render ungrouped items */}
      {ungroupedItems.length > 0 && (
        <View>
          <View style={styles.groupHeader}>
            <Text>Other Items</Text>
          </View>
          {renderTableHeader()}
          {ungroupedItems.map(renderTableRow)}
        </View>
      )}

      {/* Grand Total */}
      {toggles.amountExTax && (
        <View style={styles.totalRow}>
          <Text style={[styles.col, { flex: 1 }]}>Total Price (ex. tax)</Text>
          <Text style={[styles.col, styles.textRight, { width: colWidths.numeric }]}>{formatCurrency(grandTotalExTax)}</Text>
        </View>
      )}
      {toggles.amountIncTax && (
        <View style={styles.totalRow}>
          <Text style={[styles.col, { flex: 1 }]}>Total Price (inc. tax)</Text>
          <Text style={[styles.col, styles.textRight, { width: colWidths.numeric }]}>{formatCurrency(grandTotalIncTax)}</Text>
        </View>
      )}
      {!toggles.amountExTax && !toggles.amountIncTax && (
        <View style={styles.totalRow}>
          <Text style={[styles.col, { flex: 1 }]}>Total Price</Text>
          <Text style={[styles.col, styles.textRight, { width: colWidths.numeric }]}>{formatCurrency(grandTotalIncTax)}</Text>
        </View>
      )}
    </Page>
  );
}
