import { Document, Page, Text, View } from "@react-pdf/renderer";
import type { Rfq, RfqItem } from "@shared/schema";
import { DocBrandedHeader } from "@/components/pdf/shared/DocBrandedHeader";
import { DocProjectBar } from "@/components/pdf/shared/DocProjectBar";
import { DocFooter } from "@/components/pdf/shared/DocFooter";
import { tintOnWhite } from "@/components/pdf/shared/pdfColor";

// The RFQ used to render from its own StyleSheet with its own header, footer
// and colour handling — the only client-facing document that did. That is why
// it drifted: it took a hardcoded green while every other document took the
// company's brand colour, and it read the logo from a field that does not
// exist. It now renders from the same primitives as Variations, Invoices and
// Purchase Orders, so a branding change lands everywhere at once.

interface Company {
  name: string;
  abn?: string | null;
  phone?: string | null;
  email?: string | null;
}

interface Project {
  name: string;
  address?: string | null;
}

interface RFQDocumentProps {
  rfq: Rfq;
  items: RfqItem[];
  company?: Company | null;
  project?: Project | null;
  brandColor?: string;
  documentStyle?: "style1" | "style2";
  logoUrl?: string | null;
}

const RFQ_STATUS_LABELS: Record<string, { label: string; bg: string; text: string }> = {
  draft: { label: "Draft", bg: "#e5e7eb", text: "#374151" },
  sent: { label: "Awaiting Quotes", bg: "#dbeafe", text: "#1e40af" },
  quoted: { label: "Quotes Received", bg: "#d1fae5", text: "#065f46" },
  closed: { label: "Closed", bg: "#e5e7eb", text: "#374151" },
  cancelled: { label: "Cancelled", bg: "#fee2e2", text: "#991b1b" },
};

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-AU", { year: "numeric", month: "short", day: "numeric" });
}

function formatQuantity(qty: number | string | null | undefined): string {
  if (qty === null || qty === undefined || qty === "") return "—";
  const num = typeof qty === "string" ? parseFloat(qty) : qty;
  if (Number.isNaN(num)) return "—";
  // Trailing zeros on a whole number read as false precision on a quote request.
  return Number.isInteger(num) ? String(num) : num.toFixed(2);
}

export function RFQDocument({
  rfq,
  items,
  company,
  project,
  brandColor = "#3B82F6",
  documentStyle = "style1",
  logoUrl,
}: RFQDocumentProps) {
  const isS2 = documentStyle === "style2";
  const thBg = isS2 ? brandColor : "#F8F8F8";
  const thTextColor = isS2 ? "#ffffff" : "#374151";
  const altRowBg = isS2 ? brandColor + "14" : "#f9fafb";

  const statusCfg = RFQ_STATUS_LABELS[rfq.status] ?? RFQ_STATUS_LABELS.draft;

  return (
    <Document title={`RFQ ${rfq.rfqNumber}`}>
      <Page
        size="A4"
        style={{
          fontSize: 10,
          fontFamily: "Helvetica",
          backgroundColor: "#ffffff",
          paddingBottom: 60,
        }}
      >
        <DocBrandedHeader
          companyName={company?.name || ""}
          abn={company?.abn}
          phone={company?.phone}
          email={company?.email}
          logoUrl={logoUrl}
          brandColor={brandColor}
          docStyle={documentStyle}
        />

        {/* Project only — deliberately no client details. This document goes to
            suppliers, who have no business receiving the homeowner's name,
            email or phone number. */}
        <DocProjectBar
          projectName={project?.name}
          projectAddress={project?.address}
          brandColor={brandColor}
          docStyle={documentStyle}
        />

        {/* Document bar: what this is, and the date that matters */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: 40,
            paddingVertical: 14,
            borderBottomWidth: 1,
            borderBottomColor: isS2 ? tintOnWhite(brandColor, "26") : "#e5e7eb",
          }}
        >
          <View>
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
              Request for Quote
            </Text>
            <Text
              style={{
                fontSize: 13,
                fontFamily: "Helvetica-Bold",
                color: "#111827",
                marginBottom: 4,
              }}
            >
              {rfq.rfqNumber}
            </Text>
            <View
              style={{
                alignSelf: "flex-start",
                backgroundColor: statusCfg.bg,
                borderRadius: 3,
                paddingHorizontal: 6,
                paddingVertical: 2,
              }}
            >
              <Text style={{ fontSize: 7, fontFamily: "Helvetica-Bold", color: statusCfg.text }}>
                {statusCfg.label}
              </Text>
            </View>
          </View>

          <View
            style={{
              backgroundColor: "#FFF4E6",
              borderRadius: 4,
              paddingHorizontal: 14,
              paddingVertical: 10,
              alignItems: "center",
              minWidth: 150,
            }}
          >
            <Text
              style={{
                fontSize: 7,
                fontFamily: "Helvetica-Bold",
                color: "#9ca3af",
                textTransform: "uppercase",
                marginBottom: 4,
              }}
            >
              Quote Due
            </Text>
            <Text style={{ fontSize: 13, fontFamily: "Helvetica-Bold", color: "#e8952a" }}>
              {formatDate(rfq.dueDate)}
            </Text>
            <Text style={{ fontSize: 7, color: "#9ca3af", marginTop: 2 }}>
              Issued {formatDate(rfq.createdAt)}
            </Text>
          </View>
        </View>

        <View style={{ paddingHorizontal: 40, paddingTop: 14 }}>
          {rfq.title && (
            <View style={{ marginBottom: 12 }}>
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
                Works Requested
              </Text>
              <Text style={{ fontSize: 11, fontFamily: "Helvetica-Bold", color: "#111827" }}>
                {rfq.title}
              </Text>
            </View>
          )}

          {rfq.scope && (
            <View style={{ marginBottom: 12 }}>
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
                Scope of Work
              </Text>
              <View
                style={{
                  backgroundColor: isS2 ? brandColor + "0D" : "#f9fafb",
                  borderLeftWidth: 3,
                  borderLeftColor: brandColor,
                  paddingHorizontal: 10,
                  paddingVertical: 8,
                }}
              >
                <Text style={{ fontSize: 9, color: "#374151", lineHeight: 1.5 }}>{rfq.scope}</Text>
              </View>
            </View>
          )}

          {items.length > 0 && (
            <View style={{ marginBottom: 12 }}>
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
                Items
              </Text>
              <View style={{ borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 3 }}>
                <View
                  style={{
                    flexDirection: "row",
                    backgroundColor: thBg,
                    paddingHorizontal: 8,
                    paddingVertical: 5,
                  }}
                >
                  <Text
                    style={{ fontSize: 8, color: thTextColor, fontFamily: "Helvetica-Bold", flex: 1 }}
                  >
                    Description
                  </Text>
                  <Text
                    style={{
                      fontSize: 8,
                      color: thTextColor,
                      fontFamily: "Helvetica-Bold",
                      width: 55,
                      textAlign: "right",
                    }}
                  >
                    Qty
                  </Text>
                  <Text
                    style={{
                      fontSize: 8,
                      color: thTextColor,
                      fontFamily: "Helvetica-Bold",
                      width: 55,
                      textAlign: "right",
                    }}
                  >
                    Unit
                  </Text>
                  <Text
                    style={{
                      fontSize: 8,
                      color: thTextColor,
                      fontFamily: "Helvetica-Bold",
                      width: 150,
                      paddingLeft: 10,
                    }}
                  >
                    Notes
                  </Text>
                </View>

                {items.map((item, idx) => (
                  <View
                    key={item.id}
                    style={{
                      flexDirection: "row",
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                      borderBottomWidth: 1,
                      borderBottomColor: "#f3f4f6",
                      backgroundColor: idx % 2 === 1 ? altRowBg : "#ffffff",
                    }}
                  >
                    <Text style={{ fontSize: 9, color: "#111827", flex: 1 }}>
                      {item.description}
                    </Text>
                    <Text
                      style={{ fontSize: 9, color: "#374151", width: 55, textAlign: "right" }}
                    >
                      {formatQuantity(item.quantity)}
                    </Text>
                    <Text
                      style={{ fontSize: 9, color: "#374151", width: 55, textAlign: "right" }}
                    >
                      {item.unit || "—"}
                    </Text>
                    <Text style={{ fontSize: 8, color: "#6b7280", width: 150, paddingLeft: 10 }}>
                      {item.notes || ""}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          <View
            style={{
              marginTop: 4,
              paddingTop: 10,
              borderTopWidth: 1,
              borderTopColor: "#e5e7eb",
            }}
          >
            <Text style={{ fontSize: 9, color: "#374151", marginBottom: 3 }}>
              Please review the scope and items above and return your quote by{" "}
              {formatDate(rfq.dueDate)}.
            </Text>
            {company?.email && (
              <Text style={{ fontSize: 9, color: "#6b7280" }}>
                Questions? Contact us at {company.email}
                {company.phone ? ` or ${company.phone}` : ""}.
              </Text>
            )}
          </View>
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
