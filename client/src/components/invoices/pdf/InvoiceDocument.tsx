import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { format } from "date-fns";

interface Company {
  name: string;
  abn?: string | null;
  phone?: string | null;
  email?: string | null;
}

interface InvoiceLineItem {
  label: string;
  description?: string | null;
  claimPct?: number | null;
  amountExTax: number;
  gst: number;
  amountIncTax: number;
}

interface InvoiceDocumentProps {
  invoiceNumber: string;
  issueDate?: string | Date | null;
  dueDate?: string | Date | null;
  company?: Company | null;
  clientName?: string | null;
  projectName?: string | null;
  projectAddress?: string | null;
  lineItems: InvoiceLineItem[];
  subtotalCents: number;
  gstCents: number;
  totalCents: number;
  paidCents: number;
  balanceDueCents: number;
  brandColor?: string;
}

function formatAUD(cents: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

function safeFormatDate(d?: string | Date | null): string {
  if (!d) return "—";
  try { return format(new Date(d), "d MMM yyyy"); } catch { return "—"; }
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
    heroLeft: { flexDirection: "column" },
    heroRight: { alignItems: "flex-end" },
    heroTitle: { fontSize: 8, color: "rgba(255,255,255,0.7)", fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 },
    heroCompanyName: { fontSize: 16, fontFamily: "Helvetica-Bold", color: "#ffffff" },
    heroContact: { fontSize: 9, color: "rgba(255,255,255,0.8)", marginTop: 2 },
    heroNum: { fontSize: 10, color: "rgba(255,255,255,0.7)", marginBottom: 4 },
    heroTotal: { fontSize: 22, fontFamily: "Helvetica-Bold", color: "#ffffff" },
    metaRow: { flexDirection: "row", gap: 24, marginBottom: 16 },
    metaBlock: { flex: 1 },
    metaLabel: { fontSize: 8, color: "#9ca3af", marginBottom: 2 },
    metaValue: { fontSize: 10, color: "#111827", fontFamily: "Helvetica-Bold" },
    metaValueSm: { fontSize: 9, color: "#374151" },
    divider: { borderBottomWidth: 1, borderBottomColor: "#e5e7eb", marginBottom: 14 },
    sectionTitle: {
      fontSize: 8,
      fontFamily: "Helvetica-Bold",
      color: "#9ca3af",
      textTransform: "uppercase",
      letterSpacing: 0.5,
      marginBottom: 6,
    },
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
      paddingVertical: 4,
      borderBottomWidth: 1,
      borderBottomColor: "#f3f4f6",
    },
    tableRowAlt: { backgroundColor: "#f9fafb" },
    thText: { fontSize: 8, color: "#ffffff", fontFamily: "Helvetica-Bold" },
    tdText: { fontSize: 9, color: "#374151" },
    tdBold: { fontSize: 9, color: "#111827", fontFamily: "Helvetica-Bold" },
    summarySection: { marginTop: 16, alignItems: "flex-end" },
    summaryRow: { flexDirection: "row", justifyContent: "flex-end", gap: 24, marginBottom: 4 },
    summaryLabel: { fontSize: 9, color: "#6b7280", width: 130, textAlign: "right" },
    summaryValue: { fontSize: 9, color: "#374151", width: 80, textAlign: "right" },
    summaryTotalRow: {
      flexDirection: "row",
      justifyContent: "flex-end",
      gap: 24,
      backgroundColor: primaryColor,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 4,
      marginTop: 4,
      marginBottom: 4,
    },
    summaryTotalLabel: { fontSize: 11, color: "#ffffff", fontFamily: "Helvetica-Bold", width: 130, textAlign: "right" },
    summaryTotalValue: { fontSize: 11, color: "#ffffff", fontFamily: "Helvetica-Bold", width: 80, textAlign: "right" },
    footer: { position: "absolute", bottom: 20, left: 40, right: 40, fontSize: 8, color: "#d1d5db", textAlign: "center" },
  });

export function InvoiceDocument({
  invoiceNumber,
  issueDate,
  dueDate,
  company,
  clientName,
  projectName,
  projectAddress,
  lineItems,
  subtotalCents,
  gstCents,
  totalCents,
  paidCents,
  balanceDueCents,
  brandColor = "#6d28d9",
}: InvoiceDocumentProps) {
  const styles = createStyles(brandColor);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Hero */}
        <View style={styles.hero}>
          <View style={styles.heroLeft}>
            <Text style={styles.heroTitle}>Tax Invoice</Text>
            <Text style={styles.heroCompanyName}>{company?.name || "BuildPro"}</Text>
            {company?.abn && <Text style={styles.heroContact}>ABN: {company.abn}</Text>}
            {company?.phone && <Text style={styles.heroContact}>{company.phone}</Text>}
            {company?.email && <Text style={styles.heroContact}>{company.email}</Text>}
          </View>
          <View style={styles.heroRight}>
            <Text style={styles.heroNum}>{invoiceNumber}</Text>
            <Text style={styles.heroTotal}>{formatAUD(totalCents)}</Text>
          </View>
        </View>

        {/* Dates + Bill To grid */}
        <View style={styles.metaRow}>
          <View style={styles.metaBlock}>
            <Text style={styles.metaLabel}>Issue Date</Text>
            <Text style={styles.metaValue}>{safeFormatDate(issueDate)}</Text>
          </View>
          <View style={styles.metaBlock}>
            <Text style={styles.metaLabel}>Due Date</Text>
            <Text style={styles.metaValue}>{safeFormatDate(dueDate)}</Text>
          </View>
          <View style={{ flex: 2 }}>
            <Text style={styles.metaLabel}>Bill To</Text>
            {clientName && <Text style={styles.metaValue}>{clientName}</Text>}
            {projectName && <Text style={styles.metaValueSm}>{projectName}</Text>}
            {projectAddress && <Text style={styles.metaValueSm}>{projectAddress}</Text>}
          </View>
        </View>

        <View style={styles.divider} />

        {/* Line items table */}
        <Text style={styles.sectionTitle}>Invoice Items</Text>
        <View style={styles.tableHeader}>
          <Text style={[styles.thText, { flex: 3 }]}>Description</Text>
          <Text style={[styles.thText, { width: 50, textAlign: "right" }]}>Claim %</Text>
          <Text style={[styles.thText, { width: 80, textAlign: "right" }]}>Ex. Tax</Text>
          <Text style={[styles.thText, { width: 50, textAlign: "right" }]}>GST</Text>
          <Text style={[styles.thText, { width: 80, textAlign: "right" }]}>Inc. Tax</Text>
        </View>
        {lineItems.map((item, idx) => (
          <View key={idx} style={[styles.tableRow, idx % 2 === 1 ? styles.tableRowAlt : {}]}>
            <View style={{ flex: 3 }}>
              <Text style={styles.tdBold}>{item.label}</Text>
              {item.description && <Text style={[styles.tdText, { fontSize: 8, color: "#6b7280" }]}>{item.description}</Text>}
            </View>
            <Text style={[styles.tdText, { width: 50, textAlign: "right" }]}>
              {item.claimPct != null ? `${item.claimPct}%` : "100%"}
            </Text>
            <Text style={[styles.tdText, { width: 80, textAlign: "right" }]}>{formatAUD(item.amountExTax)}</Text>
            <Text style={[styles.tdText, { width: 50, textAlign: "right" }]}>{formatAUD(item.gst)}</Text>
            <Text style={[styles.tdBold, { width: 80, textAlign: "right" }]}>{formatAUD(item.amountIncTax)}</Text>
          </View>
        ))}

        {/* Summary */}
        <View style={styles.summarySection}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Subtotal (ex. GST)</Text>
            <Text style={styles.summaryValue}>{formatAUD(subtotalCents)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>GST (10%)</Text>
            <Text style={styles.summaryValue}>{formatAUD(gstCents)}</Text>
          </View>
          <View style={styles.summaryTotalRow}>
            <Text style={styles.summaryTotalLabel}>Total (inc. GST)</Text>
            <Text style={styles.summaryTotalValue}>{formatAUD(totalCents)}</Text>
          </View>
          {paidCents > 0 && (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Amount Paid</Text>
              <Text style={[styles.summaryValue, { color: "#059669" }]}>({formatAUD(paidCents)})</Text>
            </View>
          )}
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { fontFamily: "Helvetica-Bold", color: "#111827" }]}>Balance Due</Text>
            <Text style={[styles.summaryValue, { fontFamily: "Helvetica-Bold", color: balanceDueCents <= 0 ? "#059669" : "#dc2626" }]}>
              {formatAUD(Math.max(0, balanceDueCents))}
            </Text>
          </View>
        </View>

        <Text style={styles.footer}>Powered by BuildPro</Text>
      </Page>
    </Document>
  );
}
