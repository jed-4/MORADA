import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { format } from "date-fns";

interface Company {
  name: string;
  abn?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
}

interface Supplier {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  abn?: string | null;
}

interface Project {
  name?: string | null;
  address?: string | null;
}

interface POItem {
  description: string;
  quantity: string | number;
  unit?: string | null;
  unitPrice: number;
  total: number;
  isGstFree?: boolean;
  gstAmount?: number;
}

interface PurchaseOrderDocumentProps {
  purchaseOrder: {
    poNumber: string;
    poDate?: Date | string | null;
    requiredByDate?: Date | string | null;
    title?: string | null;
    description?: string | null;
    internalNotes?: string | null;
    subtotal: number;
    gstAmount: number;
    total: number;
    gstMode?: string | null;
    status?: string | null;
  };
  items: POItem[];
  company?: Company | null;
  supplier?: Supplier | null;
  project?: Project | null;
  brandColor?: string;
}

function formatAUD(cents: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

function safeFormatDate(d?: Date | string | null): string {
  if (!d) return "—";
  try {
    return format(new Date(d), "d MMM yyyy");
  } catch {
    return "—";
  }
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
    heroTitle: { fontSize: 8, color: "rgba(255,255,255,0.7)", fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 },
    heroNum: { fontSize: 18, fontFamily: "Helvetica-Bold", color: "#ffffff" },
    heroTotal: { fontSize: 14, color: "rgba(255,255,255,0.85)", marginTop: 4 },
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
    supplierBox: {
      borderWidth: 1,
      borderColor: "#e5e7eb",
      borderRadius: 4,
      padding: "10 12",
      marginBottom: 16,
      backgroundColor: "#f9fafb",
    },
    supplierName: { fontSize: 11, fontFamily: "Helvetica-Bold", color: "#111827", marginBottom: 3 },
    supplierDetail: { fontSize: 9, color: "#6b7280", marginBottom: 2 },
    tableHeader: {
      flexDirection: "row",
      backgroundColor: primaryColor,
      paddingHorizontal: 8,
      paddingVertical: 5,
      borderRadius: 2,
    },
    tableRow: {
      flexDirection: "row",
      paddingHorizontal: 8,
      paddingVertical: 5,
      borderBottomWidth: 1,
      borderBottomColor: "#f3f4f6",
    },
    tableRowAlt: { backgroundColor: "#f9fafb" },
    thText: { fontSize: 8, color: "#ffffff", fontFamily: "Helvetica-Bold" },
    tdText: { fontSize: 9, color: "#374151" },
    tdRight: { textAlign: "right" },
    tdMuted: { fontSize: 8, color: "#9ca3af" },
    divider: { borderTopWidth: 1, borderTopColor: "#e5e7eb", marginVertical: 12 },
    summaryBox: {
      alignSelf: "flex-end",
      width: "220",
      borderWidth: 1,
      borderColor: "#e5e7eb",
      borderRadius: 4,
      overflow: "hidden",
      marginTop: 12,
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
    notesBox: {
      borderWidth: 1,
      borderColor: "#e5e7eb",
      borderRadius: 4,
      padding: "10 12",
      marginBottom: 16,
      backgroundColor: "#fffbeb",
    },
    notesLabel: { fontSize: 8, fontFamily: "Helvetica-Bold", color: "#92400e", marginBottom: 4 },
    notesText: { fontSize: 9, color: "#78350f", lineHeight: 1.5 },
    footer: { marginTop: 16, textAlign: "center", fontSize: 8, color: "#9ca3af" },
  });

export function PurchaseOrderDocument({
  purchaseOrder,
  items,
  company,
  supplier,
  project,
  brandColor = "#6d28d9",
}: PurchaseOrderDocumentProps) {
  const styles = createStyles(brandColor);

  return (
    <Document title={`Purchase Order ${purchaseOrder.poNumber}`}>
      <Page size="A4" style={styles.page}>
        {/* Hero */}
        <View style={styles.hero}>
          <View style={styles.heroLeft}>
            <Text style={styles.heroCompanyName}>{company?.name || "BuildPro"}</Text>
            {company?.abn && <Text style={styles.heroContact}>ABN {company.abn}</Text>}
            {company?.phone && <Text style={styles.heroContact}>{company.phone}</Text>}
            {company?.email && <Text style={styles.heroContact}>{company.email}</Text>}
            {company?.address && <Text style={styles.heroContact}>{company.address}</Text>}
          </View>
          <View style={styles.heroRight}>
            <Text style={styles.heroTitle}>Purchase Order</Text>
            <Text style={styles.heroNum}>{purchaseOrder.poNumber}</Text>
            <Text style={styles.heroTotal}>{formatAUD(purchaseOrder.total)}</Text>
          </View>
        </View>

        {/* Info grid */}
        <Text style={styles.sectionTitle}>Order Details</Text>
        <View style={styles.infoGrid}>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Issue Date</Text>
            <Text style={styles.infoValue}>{safeFormatDate(purchaseOrder.poDate)}</Text>
          </View>
          {purchaseOrder.requiredByDate && (
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Required By</Text>
              <Text style={styles.infoValue}>{safeFormatDate(purchaseOrder.requiredByDate)}</Text>
            </View>
          )}
          {project?.name && (
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Project</Text>
              <Text style={styles.infoValue}>{project.name}</Text>
            </View>
          )}
          {project?.address && (
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Site Address</Text>
              <Text style={styles.infoValue}>{project.address}</Text>
            </View>
          )}
          {purchaseOrder.title && (
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Title</Text>
              <Text style={styles.infoValue}>{purchaseOrder.title}</Text>
            </View>
          )}
        </View>

        {/* Supplier */}
        {supplier?.name && (
          <View>
            <Text style={styles.sectionTitle}>Supplier</Text>
            <View style={styles.supplierBox}>
              <Text style={styles.supplierName}>{supplier.name}</Text>
              {supplier.abn && <Text style={styles.supplierDetail}>ABN {supplier.abn}</Text>}
              {supplier.email && <Text style={styles.supplierDetail}>{supplier.email}</Text>}
              {supplier.phone && <Text style={styles.supplierDetail}>{supplier.phone}</Text>}
              {supplier.address && <Text style={styles.supplierDetail}>{supplier.address}</Text>}
            </View>
          </View>
        )}

        {/* Description */}
        {purchaseOrder.description && (
          <View style={{ marginBottom: 12 }}>
            <Text style={styles.sectionTitle}>Description</Text>
            <Text style={{ fontSize: 9, color: "#374151", lineHeight: 1.5 }}>{purchaseOrder.description}</Text>
          </View>
        )}

        {/* Line items */}
        {items.length > 0 && (
          <View style={{ marginBottom: 4 }}>
            <Text style={styles.sectionTitle}>Line Items</Text>
            <View style={styles.tableHeader}>
              <Text style={[styles.thText, { flex: 1 }]}>Description</Text>
              <Text style={[styles.thText, { width: 40, textAlign: "right" }]}>Qty</Text>
              <Text style={[styles.thText, { width: 40, textAlign: "center" }]}>Unit</Text>
              <Text style={[styles.thText, { width: 70, textAlign: "right" }]}>Unit Price</Text>
              <Text style={[styles.thText, { width: 70, textAlign: "right" }]}>Amount</Text>
            </View>
            {items.map((item, idx) => {
              const qty = parseFloat(String(item.quantity || "1"));
              const unitPrice = item.unitPrice || 0;
              const lineTotal = item.total || Math.round(qty * unitPrice);
              return (
                <View key={idx} style={[styles.tableRow, idx % 2 === 1 ? styles.tableRowAlt : {}]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.tdText}>{item.description || "—"}</Text>
                    {item.isGstFree && (
                      <Text style={styles.tdMuted}>GST Free</Text>
                    )}
                  </View>
                  <Text style={[styles.tdText, styles.tdRight, { width: 40 }]}>{qty}</Text>
                  <Text style={[styles.tdText, { width: 40, textAlign: "center" }]}>{item.unit || ""}</Text>
                  <Text style={[styles.tdText, styles.tdRight, { width: 70 }]}>{formatAUD(unitPrice)}</Text>
                  <Text style={[styles.tdText, styles.tdRight, { width: 70 }]}>{formatAUD(lineTotal)}</Text>
                </View>
              );
            })}
          </View>
        )}

        {/* Summary */}
        <View style={styles.summaryBox}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Subtotal (ex. GST)</Text>
            <Text style={styles.summaryValue}>{formatAUD(purchaseOrder.subtotal)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>GST (10%)</Text>
            <Text style={styles.summaryValue}>{formatAUD(purchaseOrder.gstAmount)}</Text>
          </View>
          <View style={styles.summaryTotalRow}>
            <Text style={styles.summaryTotalLabel}>Total (inc. GST)</Text>
            <Text style={styles.summaryTotalValue}>{formatAUD(purchaseOrder.total)}</Text>
          </View>
        </View>

        {/* Notes */}
        {purchaseOrder.internalNotes && (
          <View style={styles.notesBox}>
            <Text style={styles.notesLabel}>NOTES</Text>
            <Text style={styles.notesText}>{purchaseOrder.internalNotes}</Text>
          </View>
        )}

        {/* Footer */}
        <View style={styles.divider} />
        <Text style={styles.footer}>{company?.name || "BuildPro"} — Generated by BuildPro</Text>
      </Page>
    </Document>
  );
}
