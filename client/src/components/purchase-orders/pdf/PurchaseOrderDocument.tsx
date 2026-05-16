import { Document, Page, Text, View } from "@react-pdf/renderer";
import { format } from "date-fns";
import { DocBrandedHeader } from "@/components/pdf/shared/DocBrandedHeader";
import { DocProjectBar } from "@/components/pdf/shared/DocProjectBar";
import { DocFooter } from "@/components/pdf/shared/DocFooter";

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
  documentStyle?: "style1" | "style2";
  logoUrl?: string | null;
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

export function PurchaseOrderDocument({
  purchaseOrder,
  items,
  company,
  supplier,
  project,
  brandColor = "#3B82F6",
  documentStyle = "style1",
  logoUrl,
}: PurchaseOrderDocumentProps) {
  const isS2 = documentStyle === "style2";
  const thBg = isS2 ? brandColor : "#F8F8F8";
  const thTextColor = isS2 ? "#ffffff" : "#374151";
  const altRowBg = isS2 ? brandColor + "14" : "#f9fafb";
  const accentBg = isS2 ? brandColor + "14" : "#f3f4f6";
  const docBarBorderColor = isS2 ? brandColor + "26" : "#e5e7eb";

  return (
    <Document title={`Purchase Order ${purchaseOrder.poNumber}`}>
      <Page
        size="A4"
        style={{
          fontSize: 10,
          fontFamily: "Helvetica",
          backgroundColor: "#ffffff",
          paddingBottom: 60,
        }}
      >
        {/* Header */}
        <DocBrandedHeader
          companyName={company?.name || ""}
          abn={company?.abn}
          phone={company?.phone}
          email={company?.email}
          logoUrl={logoUrl}
          brandColor={brandColor}
          docStyle={documentStyle}
        />

        {/* Project bar (no client on POs) */}
        <DocProjectBar
          projectName={project?.name}
          projectAddress={project?.address}
          brandColor={brandColor}
          docStyle={documentStyle}
        />

        {/* Document bar */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 40,
            paddingVertical: 14,
            borderBottomWidth: 1,
            borderBottomColor: docBarBorderColor,
            gap: 20,
            minHeight: 70,
          }}
        >
          {/* Left: PO info */}
          <View style={{ flex: 2 }}>
            <Text
              style={{
                fontSize: 8,
                fontFamily: "Helvetica-Bold",
                color: brandColor,
                textTransform: "uppercase",
                letterSpacing: 0.5,
                marginBottom: 3,
              }}
            >
              Purchase Order
            </Text>
            <Text style={{ fontSize: 16, fontFamily: "Helvetica-Bold", color: "#111827" }}>
              {purchaseOrder.poNumber}
            </Text>
            <Text style={{ fontSize: 8, color: "#9ca3af", marginTop: 3 }}>
              {safeFormatDate(purchaseOrder.poDate)}
              {purchaseOrder.requiredByDate
                ? `  ·  Required by ${safeFormatDate(purchaseOrder.requiredByDate)}`
                : ""}
            </Text>
          </View>

          {/* Right: supplier */}
          {supplier?.name && (
            <View style={{ alignItems: "flex-end" }}>
              <Text
                style={{
                  fontSize: 7,
                  fontFamily: "Helvetica-Bold",
                  color: "#9ca3af",
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                  marginBottom: 3,
                }}
              >
                Supplier
              </Text>
              <Text style={{ fontSize: 11, fontFamily: "Helvetica-Bold", color: "#111827" }}>
                {supplier.name}
              </Text>
              {supplier.email && (
                <Text style={{ fontSize: 8, color: "#6b7280", marginTop: 2 }}>{supplier.email}</Text>
              )}
              {supplier.phone && (
                <Text style={{ fontSize: 8, color: "#6b7280", marginTop: 1 }}>{supplier.phone}</Text>
              )}
              {supplier.abn && (
                <Text style={{ fontSize: 8, color: "#6b7280", marginTop: 1 }}>ABN {supplier.abn}</Text>
              )}
            </View>
          )}
        </View>

        {/* Content */}
        <View style={{ paddingHorizontal: 40, paddingTop: 14 }}>
          {/* Description */}
          {purchaseOrder.description ? (
            <View style={{ marginBottom: 14 }}>
              <Text
                style={{
                  fontSize: 8,
                  fontFamily: "Helvetica-Bold",
                  color: "#9ca3af",
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                  marginBottom: 4,
                }}
              >
                Description
              </Text>
              <Text style={{ fontSize: 9, color: "#374151", lineHeight: 1.5 }}>
                {purchaseOrder.description}
              </Text>
            </View>
          ) : null}

          {/* Line items */}
          {items.length > 0 && (
            <View style={{ marginBottom: 4 }}>
              <Text
                style={{
                  fontSize: 8,
                  fontFamily: "Helvetica-Bold",
                  color: "#9ca3af",
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                  marginBottom: 6,
                }}
              >
                Line Items
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  backgroundColor: thBg,
                  paddingHorizontal: 8,
                  paddingVertical: 5,
                  borderRadius: isS2 ? 0 : 2,
                }}
              >
                <Text style={{ fontSize: 8, color: thTextColor, fontFamily: "Helvetica-Bold", flex: 1 }}>
                  Description
                </Text>
                <Text style={{ fontSize: 8, color: thTextColor, fontFamily: "Helvetica-Bold", width: 40, textAlign: "right" }}>
                  Qty
                </Text>
                <Text style={{ fontSize: 8, color: thTextColor, fontFamily: "Helvetica-Bold", width: 40, textAlign: "center" }}>
                  Unit
                </Text>
                <Text style={{ fontSize: 8, color: thTextColor, fontFamily: "Helvetica-Bold", width: 70, textAlign: "right" }}>
                  Unit Price
                </Text>
                <Text style={{ fontSize: 8, color: thTextColor, fontFamily: "Helvetica-Bold", width: 70, textAlign: "right" }}>
                  Amount
                </Text>
              </View>
              {items.map((item, idx) => {
                const qty = parseFloat(String(item.quantity || "1"));
                const unitPrice = item.unitPrice || 0;
                const lineTotal = item.total || Math.round(qty * unitPrice);
                return (
                  <View
                    key={idx}
                    style={{
                      flexDirection: "row",
                      paddingHorizontal: 8,
                      paddingVertical: 5,
                      borderBottomWidth: 1,
                      borderBottomColor: "#f3f4f6",
                      backgroundColor: idx % 2 === 1 ? altRowBg : "#ffffff",
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 9, color: "#374151" }}>{item.description || "—"}</Text>
                      {item.isGstFree && (
                        <Text style={{ fontSize: 8, color: "#9ca3af" }}>GST Free</Text>
                      )}
                    </View>
                    <Text style={{ fontSize: 9, color: "#374151", width: 40, textAlign: "right" }}>
                      {qty}
                    </Text>
                    <Text style={{ fontSize: 9, color: "#374151", width: 40, textAlign: "center" }}>
                      {item.unit || ""}
                    </Text>
                    <Text style={{ fontSize: 9, color: "#374151", width: 70, textAlign: "right" }}>
                      {formatAUD(unitPrice)}
                    </Text>
                    <Text style={{ fontSize: 9, color: "#374151", width: 70, textAlign: "right" }}>
                      {formatAUD(lineTotal)}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}

          {/* Summary */}
          <View style={{ alignItems: "flex-end", marginTop: 12, marginBottom: 16 }}>
            <View
              style={{
                width: 220,
                borderWidth: 1,
                borderColor: "#e5e7eb",
                borderRadius: 4,
                overflow: "hidden",
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  paddingHorizontal: 12,
                  paddingVertical: 5,
                  borderBottomWidth: 1,
                  borderBottomColor: "#f3f4f6",
                }}
              >
                <Text style={{ fontSize: 9, color: "#6b7280" }}>Subtotal (ex. GST)</Text>
                <Text style={{ fontSize: 9, color: "#111827", fontFamily: "Helvetica-Bold" }}>
                  {formatAUD(purchaseOrder.subtotal)}
                </Text>
              </View>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  paddingHorizontal: 12,
                  paddingVertical: 5,
                  borderBottomWidth: 1,
                  borderBottomColor: "#f3f4f6",
                }}
              >
                <Text style={{ fontSize: 9, color: "#6b7280" }}>GST (10%)</Text>
                <Text style={{ fontSize: 9, color: "#111827", fontFamily: "Helvetica-Bold" }}>
                  {formatAUD(purchaseOrder.gstAmount)}
                </Text>
              </View>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  backgroundColor: accentBg,
                }}
              >
                <Text style={{ fontSize: 10, color: brandColor, fontFamily: "Helvetica-Bold" }}>
                  Total (inc. GST)
                </Text>
                <Text style={{ fontSize: 12, color: brandColor, fontFamily: "Helvetica-Bold" }}>
                  {formatAUD(purchaseOrder.total)}
                </Text>
              </View>
            </View>
          </View>

          {/* Notes */}
          {purchaseOrder.internalNotes ? (
            <View
              style={{
                borderWidth: 1,
                borderColor: "#e5e7eb",
                borderRadius: 4,
                padding: "10 12",
                marginBottom: 16,
                backgroundColor: "#fffbeb",
              }}
            >
              <Text
                style={{ fontSize: 8, fontFamily: "Helvetica-Bold", color: "#92400e", marginBottom: 4 }}
              >
                NOTES
              </Text>
              <Text style={{ fontSize: 9, color: "#78350f", lineHeight: 1.5 }}>
                {purchaseOrder.internalNotes}
              </Text>
            </View>
          ) : null}

          {/* Supplier address block (if not shown in doc bar) */}
          {supplier?.address && (
            <View style={{ marginBottom: 14 }}>
              <Text
                style={{
                  fontSize: 8,
                  fontFamily: "Helvetica-Bold",
                  color: "#9ca3af",
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                  marginBottom: 4,
                }}
              >
                Delivery Address
              </Text>
              <Text style={{ fontSize: 9, color: "#374151" }}>{supplier.address}</Text>
            </View>
          )}
        </View>

        <DocFooter
          companyName={company?.name}
          brandColor={brandColor}
          docStyle={documentStyle}
        />
      </Page>
    </Document>
  );
}
