import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";
import type { Variation, VariationItem } from "@shared/schema";
import { format } from "date-fns";

interface Company {
  name: string;
  abn?: string | null;
  phone?: string | null;
  email?: string | null;
  logo?: string | null;
}

interface Project {
  name: string;
  address?: string | null;
  clientName?: string | null;
  clientEmail?: string | null;
  clientPhone?: string | null;
}

interface Bill {
  id: string;
  billNumber?: string | null;
  supplierName?: string | null;
  invoiceDate?: string | null;
  totalAmountCents?: number | null;
  totalAmount?: number | null;
}

interface VariationDocumentProps {
  variation: Variation & {
    clientSignedName?: string | null;
    clientSignedDate?: string | Date | null;
    builderSignedName?: string | null;
    builderSignedDate?: string | Date | null;
  };
  items: VariationItem[];
  bills?: Bill[];
  company?: Company | null;
  project?: Project | null;
  brandColor?: string;
}

const TYPE_LABELS: Record<string, string> = {
  material: "Materials",
  labour: "Labour",
  subcontractor: "Subcontractor",
  fee: "Fee / Overhead",
  allowance: "Allowances",
  other: "Other",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  action: "Action Required",
  pending: "Pending Approval",
  approved: "Approved",
  rejected: "Rejected",
};

function formatAUD(dollars: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 2,
  }).format(dollars);
}

const createStyles = (primaryColor: string) =>
  StyleSheet.create({
    page: { padding: 40, fontSize: 10, fontFamily: "Helvetica", backgroundColor: "#ffffff" },
    hero: {
      backgroundColor: primaryColor,
      padding: "20 24",
      marginBottom: 20,
      borderRadius: 4,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
    },
    heroLeft: { flexDirection: "column", gap: 2 },
    heroRight: { alignItems: "flex-end" },
    heroCompanyName: { fontSize: 16, fontFamily: "Helvetica-Bold", color: "#ffffff" },
    heroContact: { fontSize: 9, color: "rgba(255,255,255,0.8)", marginTop: 2 },
    heroTotal: { fontSize: 20, fontFamily: "Helvetica-Bold", color: "#ffffff" },
    heroNum: { fontSize: 10, color: "rgba(255,255,255,0.7)", marginTop: 2 },
    statusBadge: {
      backgroundColor: "rgba(255,255,255,0.25)",
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 10,
      marginBottom: 6,
    },
    statusBadgeText: { fontSize: 9, color: "#ffffff", fontFamily: "Helvetica-Bold" },
    sectionTitle: {
      fontSize: 8,
      fontFamily: "Helvetica-Bold",
      color: "#9ca3af",
      textTransform: "uppercase",
      letterSpacing: 0.5,
      marginBottom: 6,
    },
    infoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 16 },
    infoItem: { width: "30%", marginBottom: 8 },
    infoLabel: { fontSize: 8, color: "#9ca3af", marginBottom: 2 },
    infoValue: { fontSize: 10, color: "#111827", fontFamily: "Helvetica-Bold" },
    introText: { fontSize: 9, color: "#374151", lineHeight: 1.5, marginBottom: 16 },
    tableHeader: {
      flexDirection: "row",
      backgroundColor: primaryColor,
      paddingHorizontal: 8,
      paddingVertical: 5,
    },
    typeRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingHorizontal: 8,
      paddingVertical: 4,
      backgroundColor: "#f3f4f6",
      borderBottomWidth: 1,
      borderBottomColor: "#e5e7eb",
    },
    typeLabel: { fontSize: 8, fontFamily: "Helvetica-Bold", color: "#6b7280" },
    tableRow: {
      flexDirection: "row",
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderBottomWidth: 1,
      borderBottomColor: "#f3f4f6",
    },
    tableRowAlt: { backgroundColor: "#f9fafb" },
    thText: { fontSize: 8, color: "#ffffff", fontFamily: "Helvetica-Bold" },
    tdText: { fontSize: 9, color: "#374151" },
    tdRight: { textAlign: "right" },
    divider: { borderTopWidth: 1, borderTopColor: "#e5e7eb", marginVertical: 12 },
    summaryBox: {
      alignSelf: "flex-end",
      width: "220",
      borderWidth: 1,
      borderColor: "#e5e7eb",
      borderRadius: 4,
      overflow: "hidden",
      marginBottom: 16,
    },
    summaryRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingHorizontal: 12,
      paddingVertical: 5,
      borderBottomWidth: 1,
      borderBottomColor: "#f3f4f6",
    },
    summaryLabel: { fontSize: 9, color: "#6b7280" },
    summaryValue: { fontSize: 9, color: "#111827", fontFamily: "Helvetica-Bold" },
    summaryTotalRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: primaryColor + "20",
    },
    summaryTotalLabel: { fontSize: 10, color: primaryColor, fontFamily: "Helvetica-Bold" },
    summaryTotalValue: { fontSize: 12, color: primaryColor, fontFamily: "Helvetica-Bold" },
    sigSection: { flexDirection: "row", gap: 16, marginTop: 8 },
    sigBox: {
      flex: 1,
      borderWidth: 1,
      borderColor: "#e5e7eb",
      borderRadius: 4,
      padding: 10,
    },
    sigTitle: { fontSize: 8, color: "#9ca3af", fontFamily: "Helvetica-Bold", marginBottom: 10 },
    sigLine: { borderBottomWidth: 1, borderBottomColor: "#d1d5db", marginBottom: 8, height: 18 },
    sigLineLabelRow: { flexDirection: "row", gap: 4, marginBottom: 10 },
    sigLineLabel: { fontSize: 8, color: "#9ca3af", width: 50 },
    footer: { marginTop: 16, textAlign: "center", fontSize: 8, color: "#9ca3af" },
    closingText: { fontSize: 9, color: "#374151", lineHeight: 1.5, marginBottom: 12 },
    tncTitle: { fontSize: 8, color: "#9ca3af", fontFamily: "Helvetica-Bold", marginBottom: 4 },
    tncText: { fontSize: 8, color: "#9ca3af", lineHeight: 1.4 },
  });

export function VariationDocument({
  variation,
  items,
  bills = [],
  company,
  project,
  brandColor = "#6d28d9",
}: VariationDocumentProps) {
  const styles = createStyles(brandColor);

  const costItems = items.filter((i) => (i as any).itemType !== "allowance");
  const allowanceItems = items.filter((i) => (i as any).itemType === "allowance");

  const visibleCostItems = costItems.filter((i) => (i as any).showInPdf !== false);

  const typeGroups = visibleCostItems.reduce<Record<string, VariationItem[]>>((acc, item) => {
    const type = (item as any).type || "other";
    if (!acc[type]) acc[type] = [];
    acc[type].push(item);
    return acc;
  }, {});

  const subtotalCents = variation.subtotal ?? 0;
  const gstCents = variation.gstAmount ?? 0;
  const totalCents = variation.totalAmount ?? 0;

  return (
    <Document title={`Variation ${variation.variationNumber}`}>
      <Page size="A4" style={styles.page}>
        {/* Hero */}
        <View style={styles.hero}>
          <View style={styles.heroLeft}>
            <Text style={styles.heroCompanyName}>{company?.name || "BuildPro"}</Text>
            {company?.phone && <Text style={styles.heroContact}>{company.phone}</Text>}
            {company?.email && <Text style={styles.heroContact}>{company.email}</Text>}
            {company?.abn && <Text style={styles.heroContact}>ABN {company.abn}</Text>}
          </View>
          <View style={styles.heroRight}>
            <View style={styles.statusBadge}>
              <Text style={styles.statusBadgeText}>
                {STATUS_LABELS[variation.status ?? "draft"] || variation.status}
              </Text>
            </View>
            <Text style={styles.heroTotal}>{formatAUD(totalCents / 100)}</Text>
            <Text style={styles.heroNum}>{variation.variationNumber}</Text>
          </View>
        </View>

        {/* Details Grid */}
        <Text style={styles.sectionTitle}>Variation Details</Text>
        <View style={styles.infoGrid}>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Name</Text>
            <Text style={styles.infoValue}>{variation.name}</Text>
          </View>
          {project?.name && (
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Project</Text>
              <Text style={styles.infoValue}>{project.name}</Text>
            </View>
          )}
          {project?.clientName && (
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Client</Text>
              <Text style={styles.infoValue}>{project.clientName}</Text>
            </View>
          )}
          {project?.address && (
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Site Address</Text>
              <Text style={styles.infoValue}>{project.address}</Text>
            </View>
          )}
          {variation.approvalDeadline && (
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Effective Until</Text>
              <Text style={styles.infoValue}>
                {format(new Date(variation.approvalDeadline), "d MMM yyyy")}
              </Text>
            </View>
          )}
          {!!variation.daysChanged && (
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Schedule Impact</Text>
              <Text style={styles.infoValue}>
                {variation.daysChanged > 0 ? "+" : ""}{variation.daysChanged} working day{Math.abs(variation.daysChanged) !== 1 ? "s" : ""}
              </Text>
            </View>
          )}
        </View>

        {/* Intro text */}
        {variation.introductionText && (
          <Text style={styles.introText}>{variation.introductionText}</Text>
        )}

        {/* Cost Lines */}
        {Object.keys(typeGroups).length > 0 && (
          <View style={{ marginBottom: 12 }}>
            <Text style={styles.sectionTitle}>Cost Lines</Text>
            {/* Table header */}
            <View style={styles.tableHeader}>
              <Text style={[styles.thText, { flex: 1 }]}>Description</Text>
              <Text style={[styles.thText, { width: 50, textAlign: "right" }]}>Qty</Text>
              <Text style={[styles.thText, { width: 65, textAlign: "right" }]}>Unit Cost</Text>
              <Text style={[styles.thText, { width: 45, textAlign: "right" }]}>Markup</Text>
              <Text style={[styles.thText, { width: 65, textAlign: "right" }]}>Amt inc. GST</Text>
            </View>

            {Object.entries(typeGroups).map(([type, typeItems]) => {
              const typeTotal = typeItems.reduce((sum, item) => {
                const unitCost = item.unitCostExTax ?? (item.unitPrice ?? 0) / 100;
                const qty = item.quantity ?? 1;
                const exTax = qty * unitCost * (1 + ((item.markupPercent ?? 0) / 100));
                return sum + ((item as any).taxable !== false ? exTax * 1.1 : exTax);
              }, 0);

              return (
                <View key={type}>
                  <View style={styles.typeRow}>
                    <Text style={styles.typeLabel}>{TYPE_LABELS[type] ?? type}</Text>
                    <Text style={styles.typeLabel}>{formatAUD(typeTotal)}</Text>
                  </View>
                  {typeItems.map((item, idx) => {
                    const unitCost = item.unitCostExTax ?? (item.unitPrice ?? 0) / 100;
                    const qty = item.quantity ?? 1;
                    const exTax = qty * unitCost * (1 + ((item.markupPercent ?? 0) / 100));
                    const incTax = (item as any).taxable !== false ? exTax * 1.1 : exTax;
                    return (
                      <View key={item.id} style={[styles.tableRow, idx % 2 === 1 ? styles.tableRowAlt : {}]}>
                        <View style={{ flex: 1 }}>
                          {(item as any).name ? <Text style={[styles.tdText, { fontWeight: "bold" }]}>{(item as any).name}</Text> : null}
                          {item.description ? <Text style={[styles.tdText, { color: "#555", fontSize: 9 }]}>{item.description}</Text> : null}
                          {!(item as any).name && !item.description ? <Text style={styles.tdText}>—</Text> : null}
                        </View>
                        <Text style={[styles.tdText, styles.tdRight, { width: 50 }]}>
                          {qty} {(item as any).unitType || ""}
                        </Text>
                        <Text style={[styles.tdText, styles.tdRight, { width: 65 }]}>
                          {formatAUD(unitCost)}
                        </Text>
                        <Text style={[styles.tdText, styles.tdRight, { width: 45 }]}>
                          {item.markupPercent ? `${item.markupPercent}%` : "—"}
                        </Text>
                        <Text style={[styles.tdText, styles.tdRight, { width: 65 }]}>
                          {formatAUD(incTax)}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              );
            })}
          </View>
        )}

        {/* Allowances */}
        {allowanceItems.length > 0 && (
          <View style={{ marginBottom: 12 }}>
            <Text style={styles.sectionTitle}>Allowances</Text>
            {allowanceItems.map((item, idx) => {
              const amount = (item.unitPrice ?? 0) / 100;
              return (
                <View key={item.id} style={[styles.tableRow, idx % 2 === 1 ? styles.tableRowAlt : {}]}>
                  <Text style={[styles.tdText, { flex: 1 }]}>{item.description}</Text>
                  <Text style={[styles.tdText, styles.tdRight, { width: 80 }]}>{formatAUD(amount)}</Text>
                </View>
              );
            })}
          </View>
        )}

        {/* Bills */}
        {bills.length > 0 && (
          <View style={{ marginBottom: 12 }}>
            <Text style={styles.sectionTitle}>Linked Bills</Text>
            <View style={styles.tableHeader}>
              <Text style={[styles.thText, { width: 70 }]}>Bill #</Text>
              <Text style={[styles.thText, { flex: 1 }]}>Supplier</Text>
              <Text style={[styles.thText, { width: 60, textAlign: "right" }]}>Date</Text>
              <Text style={[styles.thText, { width: 70, textAlign: "right" }]}>Total</Text>
            </View>
            {bills.map((bill, idx) => {
              const total = (bill.totalAmountCents ?? bill.totalAmount ?? 0) / 100;
              return (
                <View key={bill.id} style={[styles.tableRow, idx % 2 === 1 ? styles.tableRowAlt : {}]}>
                  <Text style={[styles.tdText, { width: 70 }]}>{bill.billNumber || "—"}</Text>
                  <Text style={[styles.tdText, { flex: 1 }]}>{bill.supplierName || "—"}</Text>
                  <Text style={[styles.tdText, styles.tdRight, { width: 60 }]}>
                    {bill.invoiceDate ? format(new Date(bill.invoiceDate), "d MMM yy") : "—"}
                  </Text>
                  <Text style={[styles.tdText, styles.tdRight, { width: 70 }]}>{formatAUD(total)}</Text>
                </View>
              );
            })}
          </View>
        )}

        {/* Summary */}
        <View style={styles.summaryBox}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Subtotal (ex. GST)</Text>
            <Text style={styles.summaryValue}>{formatAUD(subtotalCents / 100)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>GST (10%)</Text>
            <Text style={styles.summaryValue}>{formatAUD(gstCents / 100)}</Text>
          </View>
          <View style={styles.summaryTotalRow}>
            <Text style={styles.summaryTotalLabel}>Total (inc. GST)</Text>
            <Text style={styles.summaryTotalValue}>{formatAUD(totalCents / 100)}</Text>
          </View>
        </View>

        {/* Closing text */}
        {variation.closingText && (
          <Text style={styles.closingText}>{variation.closingText}</Text>
        )}

        {/* T&C */}
        {variation.termsAndConditions && (
          <View style={{ marginBottom: 12 }}>
            <Text style={styles.tncTitle}>TERMS &amp; CONDITIONS</Text>
            <Text style={styles.tncText}>{variation.termsAndConditions}</Text>
          </View>
        )}

        {/* Signatures */}
        <View style={styles.divider} />
        <Text style={styles.sectionTitle}>Signatures</Text>
        <View style={styles.sigSection}>
          {/* Builder sig */}
          <View style={styles.sigBox}>
            <Text style={styles.sigTitle}>
              LEGAL REPRESENTATIVE OF {(company?.name || "BUILDER").toUpperCase()}
            </Text>
            {variation.builderSignedName ? (
              <View>
                <Text style={{ fontSize: 9, color: "#374151", marginBottom: 2 }}>{variation.builderSignedName}</Text>
                {variation.builderSignedDate && (
                  <Text style={{ fontSize: 8, color: "#9ca3af" }}>
                    Signed {format(new Date(variation.builderSignedDate), "d MMM yyyy")}
                  </Text>
                )}
              </View>
            ) : (
              <>
                <View style={styles.sigLineLabelRow}>
                  <Text style={styles.sigLineLabel}>Name:</Text>
                  <View style={[styles.sigLine, { flex: 1 }]} />
                </View>
                <View style={styles.sigLineLabelRow}>
                  <Text style={styles.sigLineLabel}>Signature:</Text>
                  <View style={[styles.sigLine, { flex: 1 }]} />
                </View>
                <View style={styles.sigLineLabelRow}>
                  <Text style={styles.sigLineLabel}>Date:</Text>
                  <View style={[styles.sigLine, { flex: 1 }]} />
                </View>
              </>
            )}
          </View>
          {/* Client sig */}
          <View style={styles.sigBox}>
            <Text style={styles.sigTitle}>CLIENT AUTHORISATION</Text>
            {variation.clientSignedName ? (
              <View>
                <Text style={{ fontSize: 9, color: "#374151", marginBottom: 2 }}>{variation.clientSignedName}</Text>
                {variation.clientSignedDate && (
                  <Text style={{ fontSize: 8, color: "#9ca3af" }}>
                    Signed {format(new Date(variation.clientSignedDate), "d MMM yyyy")}
                  </Text>
                )}
              </View>
            ) : (
              <>
                <View style={styles.sigLineLabelRow}>
                  <Text style={styles.sigLineLabel}>Name:</Text>
                  <View style={[styles.sigLine, { flex: 1 }]} />
                </View>
                <View style={styles.sigLineLabelRow}>
                  <Text style={styles.sigLineLabel}>Signature:</Text>
                  <View style={[styles.sigLine, { flex: 1 }]} />
                </View>
                <View style={styles.sigLineLabelRow}>
                  <Text style={styles.sigLineLabel}>Date:</Text>
                  <View style={[styles.sigLine, { flex: 1 }]} />
                </View>
              </>
            )}
          </View>
        </View>

        {/* Footer */}
        <Text style={styles.footer}>Powered by BuildPro</Text>
      </Page>
    </Document>
  );
}
