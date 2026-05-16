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
  documentStyle?: "style1" | "style2";
  logoUrl?: string | null;
  paymentDetails?: string | null;
  termsAndConditions?: string | null;
  status?: string | null;
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
  try {
    return format(new Date(d), "d MMM yyyy");
  } catch {
    return "—";
  }
}

function isOverdue(dueDate?: string | Date | null): boolean {
  if (!dueDate) return false;
  try {
    return new Date(dueDate) < new Date();
  } catch {
    return false;
  }
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  draft:   { bg: "#f3f4f6", text: "#6b7280" },
  sent:    { bg: "#dbeafe", text: "#1d4ed8" },
  partial: { bg: "#fef3c7", text: "#d97706" },
  paid:    { bg: "#dcfce7", text: "#15803d" },
  overdue: { bg: "#fee2e2", text: "#dc2626" },
};

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
  brandColor = "#3B82F6",
  documentStyle = "style1",
  logoUrl,
  paymentDetails,
  termsAndConditions,
  status,
}: InvoiceDocumentProps) {
  const isS2 = documentStyle === "style2";
  const overdue = isOverdue(dueDate) && status !== "paid";
  const chipColors = STATUS_COLORS[status || "draft"] || STATUS_COLORS.draft;

  const thBg = isS2 ? brandColor : "#F8F8F8";
  const thTextColor = isS2 ? "#ffffff" : "#374151";
  const altRowBg = isS2 ? brandColor + "14" : "#f9fafb";
  const accentBg = isS2 ? brandColor + "14" : "#f3f4f6";
  const docBarBorderColor = isS2 ? brandColor + "26" : "#e5e7eb";
  const docBarBorderLeft = isS2 ? 4 : 0;

  return (
    <Document>
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

        {/* Project bar */}
        <DocProjectBar
          clientName={clientName}
          projectName={projectName}
          projectAddress={projectAddress}
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
            borderLeftWidth: docBarBorderLeft,
            borderLeftColor: brandColor,
            gap: 20,
          }}
        >
          {/* Left: invoice id + date */}
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
              Invoice
            </Text>
            <Text style={{ fontSize: 13, fontFamily: "Helvetica-Bold", color: "#111827" }}>
              {invoiceNumber}
            </Text>
            <Text style={{ fontSize: 8, color: "#9ca3af", marginTop: 3 }}>
              Issued {safeFormatDate(issueDate)}
            </Text>
          </View>

          {/* Centre: due date */}
          <View style={{ flex: 1 }}>
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
              Due Date
            </Text>
            <Text
              style={{
                fontSize: 10,
                fontFamily: "Helvetica-Bold",
                color: overdue ? "#d97706" : "#111827",
              }}
            >
              {safeFormatDate(dueDate)}
            </Text>
            {overdue && (
              <Text style={{ fontSize: 8, color: "#d97706" }}>Overdue</Text>
            )}
          </View>

          {/* Right: amount due */}
          <View style={{ alignItems: "flex-end" }}>
            <Text
              style={{
                fontSize: 7,
                fontFamily: "Helvetica-Bold",
                color: brandColor,
                textTransform: "uppercase",
                letterSpacing: 0.5,
                marginBottom: 3,
              }}
            >
              Amount Due
            </Text>
            <Text
              style={{
                fontSize: 18,
                fontFamily: "Helvetica-Bold",
                color: balanceDueCents <= 0 ? "#15803d" : brandColor,
              }}
            >
              {formatAUD(Math.max(0, balanceDueCents))}
            </Text>
          </View>
        </View>

        {/* Content */}
        <View style={{ paddingHorizontal: 40, paddingTop: 16 }}>
          {/* Line items table */}
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
            Invoice Items
          </Text>

          {/* Table header */}
          <View
            style={{
              flexDirection: "row",
              backgroundColor: thBg,
              paddingHorizontal: 8,
              paddingVertical: 5,
              borderRadius: isS2 ? 0 : 2,
            }}
          >
            <Text style={{ fontSize: 8, color: thTextColor, fontFamily: "Helvetica-Bold", flex: 3 }}>
              Description
            </Text>
            <Text style={{ fontSize: 8, color: thTextColor, fontFamily: "Helvetica-Bold", width: 50, textAlign: "right" }}>
              Claim %
            </Text>
            <Text style={{ fontSize: 8, color: thTextColor, fontFamily: "Helvetica-Bold", width: 80, textAlign: "right" }}>
              Ex. Tax
            </Text>
            <Text style={{ fontSize: 8, color: thTextColor, fontFamily: "Helvetica-Bold", width: 50, textAlign: "right" }}>
              GST
            </Text>
            <Text style={{ fontSize: 8, color: thTextColor, fontFamily: "Helvetica-Bold", width: 80, textAlign: "right" }}>
              Inc. Tax
            </Text>
          </View>

          {lineItems.map((item, idx) => (
            <View
              key={idx}
              style={{
                flexDirection: "row",
                paddingHorizontal: 8,
                paddingVertical: 4,
                borderBottomWidth: 1,
                borderBottomColor: "#f3f4f6",
                backgroundColor: idx % 2 === 1 ? altRowBg : "#ffffff",
              }}
            >
              <View style={{ flex: 3 }}>
                <Text style={{ fontSize: 9, color: "#111827", fontFamily: "Helvetica-Bold" }}>
                  {item.label}
                </Text>
                {item.description ? (
                  <Text style={{ fontSize: 8, color: "#6b7280" }}>{item.description}</Text>
                ) : null}
              </View>
              <Text style={{ fontSize: 9, color: "#374151", width: 50, textAlign: "right" }}>
                {item.claimPct != null ? `${item.claimPct}%` : "100%"}
              </Text>
              <Text style={{ fontSize: 9, color: "#374151", width: 80, textAlign: "right" }}>
                {formatAUD(item.amountExTax)}
              </Text>
              <Text style={{ fontSize: 9, color: "#374151", width: 50, textAlign: "right" }}>
                {formatAUD(item.gst)}
              </Text>
              <Text style={{ fontSize: 9, color: "#111827", fontFamily: "Helvetica-Bold", width: 80, textAlign: "right" }}>
                {formatAUD(item.amountIncTax)}
              </Text>
            </View>
          ))}

          {/* Summary */}
          <View style={{ alignItems: "flex-end", marginTop: 16 }}>
            {/* Subtotal */}
            <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 24, marginBottom: 4 }}>
              <Text style={{ fontSize: 9, color: "#6b7280", width: 140, textAlign: "right" }}>
                Subtotal (ex. GST)
              </Text>
              <Text style={{ fontSize: 9, color: "#374151", width: 90, textAlign: "right" }}>
                {formatAUD(subtotalCents)}
              </Text>
            </View>
            {/* GST */}
            <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 24, marginBottom: 6 }}>
              <Text style={{ fontSize: 9, color: "#6b7280", width: 140, textAlign: "right" }}>
                GST (10%)
              </Text>
              <Text style={{ fontSize: 9, color: "#374151", width: 90, textAlign: "right" }}>
                {formatAUD(gstCents)}
              </Text>
            </View>

            {/* Thin divider */}
            <View
              style={{
                width: 254,
                borderBottomWidth: 1,
                borderBottomColor: "#e5e7eb",
                marginBottom: 6,
              }}
            />

            {/* Contract total */}
            <View
              style={{
                flexDirection: "row",
                justifyContent: "flex-end",
                gap: 24,
                backgroundColor: accentBg,
                paddingHorizontal: 10,
                paddingVertical: 5,
                borderRadius: 2,
                marginBottom: 6,
                width: 254,
              }}
            >
              <Text
                style={{
                  fontSize: 11,
                  fontFamily: "Helvetica-Bold",
                  color: "#111827",
                  width: 130,
                  textAlign: "right",
                }}
              >
                Contract Total (inc. GST)
              </Text>
              <Text
                style={{
                  fontSize: 11,
                  fontFamily: "Helvetica-Bold",
                  color: "#111827",
                  width: 90,
                  textAlign: "right",
                }}
              >
                {formatAUD(totalCents)}
              </Text>
            </View>

            {/* Paid to date */}
            {paidCents > 0 && (
              <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 24, marginBottom: 4 }}>
                <Text style={{ fontSize: 9, color: "#6b7280", width: 140, textAlign: "right" }}>
                  Paid to Date
                </Text>
                <Text style={{ fontSize: 9, color: "#15803d", width: 90, textAlign: "right" }}>
                  ({formatAUD(paidCents)})
                </Text>
              </View>
            )}

            {/* Thin divider */}
            <View
              style={{
                width: 254,
                borderBottomWidth: 1,
                borderBottomColor: "#e5e7eb",
                marginBottom: 6,
              }}
            />

            {/* Balance due */}
            <View
              style={{
                flexDirection: "row",
                justifyContent: "flex-end",
                gap: 24,
                backgroundColor: accentBg,
                paddingHorizontal: 10,
                paddingVertical: 7,
                borderRadius: 2,
                width: 254,
                borderLeftWidth: isS2 ? 3 : 0,
                borderLeftColor: brandColor,
              }}
            >
              <Text
                style={{
                  fontSize: 10,
                  fontFamily: "Helvetica-Bold",
                  color: "#374151",
                  width: 130,
                  textAlign: "right",
                }}
              >
                Balance Due
              </Text>
              <Text
                style={{
                  fontSize: 14,
                  fontFamily: "Helvetica-Bold",
                  color: balanceDueCents <= 0 ? "#15803d" : brandColor,
                  width: 90,
                  textAlign: "right",
                }}
              >
                {formatAUD(Math.max(0, balanceDueCents))}
              </Text>
            </View>

            {/* Status chip */}
            {status && (
              <View
                style={{
                  alignSelf: "flex-start",
                  marginTop: 8,
                  backgroundColor: chipColors.bg,
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                  borderRadius: 10,
                }}
              >
                <Text
                  style={{
                    fontSize: 8,
                    fontFamily: "Helvetica-Bold",
                    color: chipColors.text,
                    textTransform: "uppercase",
                  }}
                >
                  {status}
                </Text>
              </View>
            )}
          </View>

          {/* Divider */}
          <View
            style={{
              borderBottomWidth: 1,
              borderBottomColor: isS2 ? brandColor + "33" : "#e5e7eb",
              marginTop: 16,
              marginBottom: 12,
            }}
          />

          {/* Payment Details */}
          {paymentDetails ? (
            <View style={{ marginBottom: 12 }}>
              <Text
                style={{
                  fontSize: 7,
                  fontFamily: "Helvetica-Bold",
                  color: isS2 ? brandColor : "#9ca3af",
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                  marginBottom: 4,
                }}
              >
                Payment Details
              </Text>
              <Text style={{ fontSize: 9, color: "#374151", lineHeight: 1.5 }}>
                {paymentDetails}
              </Text>
            </View>
          ) : null}

          {/* Terms & Conditions */}
          {termsAndConditions ? (
            <View style={{ marginBottom: 12 }}>
              <Text
                style={{
                  fontSize: 7,
                  fontFamily: "Helvetica-Bold",
                  color: "#9ca3af",
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                  marginBottom: 4,
                }}
              >
                Terms &amp; Conditions
              </Text>
              <Text style={{ fontSize: 8, color: "#9ca3af", lineHeight: 1.4 }}>
                {termsAndConditions}
              </Text>
            </View>
          ) : null}
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
