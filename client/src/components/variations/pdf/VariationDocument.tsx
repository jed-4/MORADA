import { Document, Page, Text, View } from "@react-pdf/renderer";
import type { Variation, VariationItem } from "@shared/schema";
import { format } from "date-fns";
import { DocBrandedHeader } from "@/components/pdf/shared/DocBrandedHeader";
import { DocProjectBar } from "@/components/pdf/shared/DocProjectBar";
import { DocFooter } from "@/components/pdf/shared/DocFooter";
import {
  buildVariationDocumentModel,
  variationStatusPresentation,
} from "../variationDocumentModel";

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
  /** On-charged labour total in ex-GST cents (aggregated; timesheet detail stays internal). */
  labourTotalCents?: number;
  company?: Company | null;
  project?: Project | null;
  brandColor?: string;
  documentStyle?: "style1" | "style2";
  logoUrl?: string | null;
  originalContractCents?: number;
  /** Contract sum as it stands today: original + every OTHER approved variation. */
  currentContractCents?: number;
  revisedContractCents?: number;
  /** True once the client has agreed this variation, which turns the figure from
   *  a proposal into the actual contract sum. Drives the wording only. */
  revisedIsAgreed?: boolean;
}

function formatAUD(dollars: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 2,
  }).format(dollars);
}

export function VariationDocument({
  variation,
  items,
  bills = [],
  labourTotalCents = 0,
  company,
  project,
  brandColor = "#3B82F6",
  documentStyle = "style1",
  logoUrl,
  originalContractCents,
  currentContractCents,
  revisedContractCents,
  revisedIsAgreed = false,
}: VariationDocumentProps) {
  const isS2 = documentStyle === "style2";
  const thBg = isS2 ? brandColor : "#F8F8F8";
  const thTextColor = isS2 ? "#ffffff" : "#374151";
  const altRowBg = isS2 ? brandColor + "14" : "#f9fafb";
  const accentBg = isS2 ? brandColor + "14" : "#f3f4f6";
  const docBarBorderColor = isS2 ? brandColor + "26" : "#e5e7eb";

  const statusCfg = variationStatusPresentation(variation.status);

  // Shared with the portal page so both documents group, label and total
  // identically (they previously diverged on both wording and grouping).
  const docModel = buildVariationDocumentModel({
    variation,
    items,
    bills,
    labourExCents: labourTotalCents,
  });

  const subtotalCents = docModel.subtotalCents;
  const gstCents = docModel.gstCents;
  const totalCents = docModel.totalCents;

  const attachmentList: Array<{ name?: string }> = Array.isArray((variation as any).attachments)
    ? ((variation as any).attachments as any[])
    : [];

  const showContractCard =
    originalContractCents !== undefined && originalContractCents > 0;
  // Contract as it stands today. Falls back to the original for callers that
  // predate the three-figure card.
  const contractBeforeCents = currentContractCents ?? originalContractCents ?? 0;
  // Reserves two lines for every caption so a label that wraps ("Proposed
  // Revised Total") doesn't push its own figure out of line with the others.
  const cardLabel = {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: "#9ca3af",
    textTransform: "uppercase" as const,
    textAlign: "center" as const,
    minHeight: 18,
    marginBottom: 4,
  };

  return (
    <Document title={`Variation ${variation.variationNumber}`}>
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
          clientName={project?.clientName}
          clientEmail={project?.clientEmail}
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
            gap: 16,
            minHeight: 82,
          }}
        >
          {/* Left: variation info */}
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontSize: 8,
                fontFamily: "Helvetica-Bold",
                color: "#e8952a",
                textTransform: "uppercase",
                letterSpacing: 0.5,
                marginBottom: 3,
              }}
            >
              Variation Order
            </Text>
            <Text
              style={{ fontSize: 13, fontFamily: "Helvetica-Bold", color: "#111827", marginBottom: 3 }}
            >
              {variation.variationNumber}
            </Text>
            {variation.approvalDeadline && (
              <Text style={{ fontSize: 8, color: "#9ca3af", marginBottom: 4 }}>
                Effective until {format(new Date(variation.approvalDeadline), "d MMM yyyy")}
              </Text>
            )}
            {/* Status chip */}
            <View
              style={{
                alignSelf: "flex-start",
                backgroundColor: statusCfg.bg,
                paddingHorizontal: 7,
                paddingVertical: 2,
                borderRadius: 10,
              }}
            >
              <Text
                style={{
                  fontSize: 8,
                  fontFamily: "Helvetica-Bold",
                  color: statusCfg.text,
                }}
              >
                {statusCfg.label}
              </Text>
            </View>
          </View>

          {/* Right: price change card */}
          <View
            style={{
              backgroundColor: "#FFF4E6",
              borderRadius: 4,
              paddingHorizontal: 14,
              paddingVertical: 10,
              flexDirection: "row",
              gap: 0,
              width: showContractCard ? 380 : 160,
            }}
          >
            {/* Variation amount */}
            <View style={{ flex: 1, alignItems: "center" }}>
              <Text style={cardLabel}>Variation Amount</Text>
              <Text
                style={{ fontSize: 13, fontFamily: "Helvetica-Bold", color: "#e8952a" }}
              >
                {formatAUD(totalCents / 100)}
              </Text>
              <Text style={{ fontSize: 7, color: "#9ca3af", marginTop: 2 }}>Inc. GST</Text>
            </View>

            {showContractCard && (
              <>
                {/* Divider */}
                <View
                  style={{
                    width: 1,
                    backgroundColor: "#e5e7eb",
                    marginHorizontal: 10,
                  }}
                />
                {/* Contract as it stands today */}
                <View style={{ flex: 1, alignItems: "center" }}>
                  <Text style={cardLabel}>Current Contract Sum</Text>
                  <Text
                    style={{
                      fontSize: 11,
                      color: "#9ca3af",
                      textDecorationLine: "line-through",
                    }}
                  >
                    {formatAUD(contractBeforeCents / 100)}
                  </Text>
                  <Text style={{ fontSize: 7, color: "#9ca3af", marginTop: 2 }}>
                    Incl. approved variations
                  </Text>
                </View>

                {/* Divider */}
                <View
                  style={{
                    width: 1,
                    backgroundColor: "#e5e7eb",
                    marginHorizontal: 10,
                  }}
                />
                {/* Revised total */}
                <View style={{ flex: 1, alignItems: "center" }}>
                  <Text style={cardLabel}>
                    {revisedIsAgreed ? "Revised Total" : "Proposed Revised Total"}
                  </Text>
                  <Text
                    style={{ fontSize: 13, fontFamily: "Helvetica-Bold", color: "#111827" }}
                  >
                    {formatAUD((revisedContractCents ?? 0) / 100)}
                  </Text>
                  <Text style={{ fontSize: 7, color: "#9ca3af", marginTop: 2 }}>
                    {revisedIsAgreed ? "New contract value" : "If approved"}
                  </Text>
                </View>
              </>
            )}
          </View>
        </View>

        {/* Content */}
        <View style={{ paddingHorizontal: 40, paddingTop: 14 }}>
          {/* Details grid */}
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
            Variation Details
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 14 }}>
            <View style={{ width: "30%" }}>
              <Text style={{ fontSize: 8, color: "#9ca3af", marginBottom: 2 }}>Name</Text>
              <Text style={{ fontSize: 10, fontFamily: "Helvetica-Bold", color: "#111827" }}>
                {variation.name}
              </Text>
            </View>
            {!!variation.daysChanged && (
              <View style={{ width: "30%" }}>
                <Text style={{ fontSize: 8, color: "#9ca3af", marginBottom: 2 }}>
                  Schedule Impact
                </Text>
                <Text style={{ fontSize: 10, fontFamily: "Helvetica-Bold", color: "#111827" }}>
                  {variation.daysChanged > 0 ? "+" : ""}
                  {variation.daysChanged} working day{Math.abs(variation.daysChanged) !== 1 ? "s" : ""}
                </Text>
              </View>
            )}
          </View>

          {/* Intro text */}
          {variation.introductionText ? (
            <Text style={{ fontSize: 9, color: "#374151", lineHeight: 1.5, marginBottom: 14 }}>
              {variation.introductionText}
            </Text>
          ) : null}

          {/* Cost lines */}
          {docModel.costGroups.length > 0 && (
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
                Cost Lines
              </Text>
              {/* Header */}
              <View
                style={{
                  flexDirection: "row",
                  backgroundColor: thBg,
                  paddingHorizontal: 8,
                  paddingVertical: 5,
                }}
              >
                <Text style={{ fontSize: 8, color: thTextColor, fontFamily: "Helvetica-Bold", flex: 1 }}>
                  Description
                </Text>
                <Text style={{ fontSize: 8, color: thTextColor, fontFamily: "Helvetica-Bold", width: 50, textAlign: "right" }}>
                  Qty
                </Text>
                <Text style={{ fontSize: 8, color: thTextColor, fontFamily: "Helvetica-Bold", width: 75, textAlign: "right" }}>
                  Unit Price
                </Text>
                <Text style={{ fontSize: 8, color: thTextColor, fontFamily: "Helvetica-Bold", width: 75, textAlign: "right" }}>
                  Amt inc. GST
                </Text>
              </View>

              {docModel.costGroups.map((group) => (
                <View key={group.type}>
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                      backgroundColor: "#f3f4f6",
                      borderBottomWidth: 1,
                      borderBottomColor: "#e5e7eb",
                    }}
                  >
                    <Text style={{ fontSize: 8, fontFamily: "Helvetica-Bold", color: "#6b7280" }}>
                      {group.label}
                    </Text>
                    <Text style={{ fontSize: 8, fontFamily: "Helvetica-Bold", color: "#6b7280" }}>
                      {formatAUD(group.totalIncCents / 100)}
                    </Text>
                  </View>
                  {group.lines.map((line, idx) => (
                    <View
                      key={line.id}
                      style={{
                        flexDirection: "row",
                        paddingHorizontal: 8,
                        paddingVertical: 4,
                        borderBottomWidth: 1,
                        borderBottomColor: "#f3f4f6",
                        backgroundColor: idx % 2 === 1 ? altRowBg : "#ffffff",
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        {line.name ? (
                          <Text style={{ fontSize: 9, fontFamily: "Helvetica-Bold", color: "#111827" }}>
                            {line.name}
                          </Text>
                        ) : null}
                        {line.description ? (
                          <Text style={{ fontSize: 8, color: "#6b7280" }}>{line.description}</Text>
                        ) : null}
                        {!line.name && !line.description ? (
                          <Text style={{ fontSize: 9, color: "#374151" }}>—</Text>
                        ) : null}
                      </View>
                      <Text style={{ fontSize: 9, color: "#374151", width: 50, textAlign: "right" }}>
                        {line.quantity} {line.unitType || ""}
                      </Text>
                      <Text style={{ fontSize: 9, color: "#374151", width: 75, textAlign: "right" }}>
                        {formatAUD(line.unitPriceExCents / 100)}
                      </Text>
                      <Text style={{ fontSize: 9, color: "#374151", width: 75, textAlign: "right" }}>
                        {formatAUD(line.amountIncCents / 100)}
                      </Text>
                    </View>
                  ))}
                </View>
              ))}

              {/* Document-level markup, inc GST, sitting with the rows rather
                  than in the ex-GST summary below — every amount in this table
                  is inc-GST and the table has to add up to the Total. Per-line
                  markup is already inside the line amounts and is never broken
                  out; only this one is a separate, visible charge. */}
              {docModel.globalMarkupIncCents !== 0 && (
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                    borderBottomWidth: 1,
                    borderBottomColor: "#f3f4f6",
                  }}
                >
                  <Text style={{ fontSize: 9, color: "#374151" }}>
                    {docModel.globalMarkupPercent
                      ? `Margin (${docModel.globalMarkupPercent}%)`
                      : "Margin"}
                  </Text>
                  <Text style={{ fontSize: 9, color: "#374151" }}>
                    {formatAUD(docModel.globalMarkupIncCents / 100)}
                  </Text>
                </View>
              )}

              {/* Value not itemised for the client, shown so the rows above
                  still reconcile with the Total. */}
              {docModel.notItemisedIncCents !== 0 && (
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                    borderBottomWidth: 1,
                    borderBottomColor: "#f3f4f6",
                  }}
                >
                  <Text style={{ fontSize: 9, color: "#374151" }}>Additional works (not itemised)</Text>
                  <Text style={{ fontSize: 9, color: "#374151" }}>
                    {formatAUD(docModel.notItemisedIncCents / 100)}
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* Allowances */}
          {docModel.allowanceLines.length > 0 && (
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
                Allowances
              </Text>
              {docModel.allowanceLines.map((line, idx) => (
                <View
                  key={line.id}
                  style={{
                    flexDirection: "row",
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                    borderBottomWidth: 1,
                    borderBottomColor: "#f3f4f6",
                    backgroundColor: idx % 2 === 1 ? altRowBg : "#ffffff",
                  }}
                >
                  <Text style={{ fontSize: 9, color: "#374151", flex: 1 }}>{line.description}</Text>
                  <Text style={{ fontSize: 9, color: "#374151", width: 80, textAlign: "right" }}>
                    {formatAUD(line.amountIncCents / 100)}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* Bills */}
          {docModel.bills.length > 0 && (
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
                Linked Bills
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  backgroundColor: thBg,
                  paddingHorizontal: 8,
                  paddingVertical: 5,
                }}
              >
                <Text style={{ fontSize: 8, color: thTextColor, fontFamily: "Helvetica-Bold", width: 70 }}>
                  Bill #
                </Text>
                <Text style={{ fontSize: 8, color: thTextColor, fontFamily: "Helvetica-Bold", flex: 1 }}>
                  Supplier
                </Text>
                <Text style={{ fontSize: 8, color: thTextColor, fontFamily: "Helvetica-Bold", width: 60, textAlign: "right" }}>
                  Date
                </Text>
                <Text style={{ fontSize: 8, color: thTextColor, fontFamily: "Helvetica-Bold", width: 70, textAlign: "right" }}>
                  Total
                </Text>
              </View>
              {docModel.bills.map((bill, idx) => {
                const total = bill.totalIncCents / 100;
                return (
                  <View
                    key={bill.id}
                    style={{
                      flexDirection: "row",
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                      borderBottomWidth: 1,
                      borderBottomColor: "#f3f4f6",
                      backgroundColor: idx % 2 === 1 ? altRowBg : "#ffffff",
                    }}
                  >
                    <Text style={{ fontSize: 9, color: "#374151", width: 70 }}>
                      {bill.billNumber || "—"}
                    </Text>
                    <Text style={{ fontSize: 9, color: "#374151", flex: 1 }}>
                      {bill.supplierName || "—"}
                    </Text>
                    <Text style={{ fontSize: 9, color: "#374151", width: 60, textAlign: "right" }}>
                      {bill.invoiceDate
                        ? format(new Date(bill.invoiceDate), "d MMM yy")
                        : "—"}
                    </Text>
                    <Text style={{ fontSize: 9, color: "#374151", width: 70, textAlign: "right" }}>
                      {formatAUD(total)}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}

          {/* On-charged site labour (aggregated) */}
          {docModel.labourIncCents > 0 && (
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
                Site Labour
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                  borderBottomWidth: 1,
                  borderBottomColor: "#f3f4f6",
                }}
              >
                <Text style={{ fontSize: 9, color: "#374151" }}>Labour</Text>
                <Text style={{ fontSize: 9, color: "#374151" }}>{formatAUD(docModel.labourIncCents / 100)}</Text>
              </View>
            </View>
          )}

          {/* Attachments — listed by name; the files themselves are available
              through the client portal link. */}
          {attachmentList.length > 0 && (
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
                Attachments
              </Text>
              {attachmentList.map((att, idx) => (
                <View
                  key={idx}
                  style={{
                    flexDirection: "row",
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                    borderBottomWidth: 1,
                    borderBottomColor: "#f3f4f6",
                    backgroundColor: idx % 2 === 1 ? altRowBg : "#ffffff",
                  }}
                >
                  <Text style={{ fontSize: 9, color: "#374151" }}>
                    {att?.name || `Attachment ${idx + 1}`}
                  </Text>
                </View>
              ))}
              <Text style={{ fontSize: 7, color: "#9ca3af", marginTop: 4 }}>
                Attached files can be downloaded from your variation link.
              </Text>
            </View>
          )}

          {/* Summary */}
          <View style={{ alignItems: "flex-end", marginBottom: 16 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", width: 220, paddingHorizontal: 12, paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: "#f3f4f6" }}>
              <Text style={{ fontSize: 9, color: "#6b7280" }}>Subtotal (ex. GST)</Text>
              <Text style={{ fontSize: 9, color: "#111827", fontFamily: "Helvetica-Bold" }}>
                {formatAUD(subtotalCents / 100)}
              </Text>
            </View>
            <View style={{ flexDirection: "row", justifyContent: "space-between", width: 220, paddingHorizontal: 12, paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: "#f3f4f6" }}>
              <Text style={{ fontSize: 9, color: "#6b7280" }}>GST (10%)</Text>
              <Text style={{ fontSize: 9, color: "#111827", fontFamily: "Helvetica-Bold" }}>
                {formatAUD(gstCents / 100)}
              </Text>
            </View>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                width: 220,
                paddingHorizontal: 12,
                paddingVertical: 8,
                backgroundColor: accentBg,
              }}
            >
              <Text style={{ fontSize: 10, color: brandColor, fontFamily: "Helvetica-Bold" }}>
                Variation Total (inc. GST)
              </Text>
              <Text style={{ fontSize: 12, color: brandColor, fontFamily: "Helvetica-Bold" }}>
                {formatAUD(totalCents / 100)}
              </Text>
            </View>
          </View>

          {/* Divider */}
          <View
            style={{
              borderBottomWidth: 1,
              borderBottomColor: isS2 ? brandColor + "33" : "#e5e7eb",
              marginBottom: 12,
            }}
          />

          {/* Closing text / T&C */}
          {variation.closingText ? (
            <Text style={{ fontSize: 9, color: "#374151", lineHeight: 1.5, marginBottom: 12 }}>
              {variation.closingText}
            </Text>
          ) : null}

          {variation.termsAndConditions ? (
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
                Terms &amp; Conditions
              </Text>
              <Text style={{ fontSize: 8, color: "#9ca3af", lineHeight: 1.4 }}>
                {variation.termsAndConditions}
              </Text>
            </View>
          ) : null}

          {/* Signatures */}
          <Text
            style={{
              fontSize: 8,
              fontFamily: "Helvetica-Bold",
              color: "#9ca3af",
              textTransform: "uppercase",
              letterSpacing: 0.5,
              marginBottom: 8,
            }}
          >
            Signatures
          </Text>
          <View style={{ flexDirection: "row", gap: 16 }}>
            {/* Builder */}
            <View
              style={{
                flex: 1,
                borderWidth: 1,
                borderColor: "#e5e7eb",
                borderRadius: 4,
                padding: 10,
              }}
            >
              <Text
                style={{
                  fontSize: 8,
                  color: "#9ca3af",
                  fontFamily: "Helvetica-Bold",
                  marginBottom: 10,
                }}
              >
                LEGAL REPRESENTATIVE OF {(company?.name || "BUILDER").toUpperCase()}
              </Text>
              {variation.builderSignedName ? (
                <View>
                  <Text style={{ fontSize: 9, color: "#374151", marginBottom: 2 }}>
                    {variation.builderSignedName}
                  </Text>
                  {variation.builderSignedDate && (
                    <Text style={{ fontSize: 8, color: "#9ca3af" }}>
                      Signed {format(new Date(variation.builderSignedDate), "d MMM yyyy")}
                    </Text>
                  )}
                </View>
              ) : (
                <>
                  <View style={{ flexDirection: "row", gap: 4, marginBottom: 10 }}>
                    <Text style={{ fontSize: 8, color: "#9ca3af", width: 50 }}>Name:</Text>
                    <View style={{ flex: 1, borderBottomWidth: 1, borderBottomColor: "#d1d5db", height: 18 }} />
                  </View>
                  <View style={{ flexDirection: "row", gap: 4, marginBottom: 10 }}>
                    <Text style={{ fontSize: 8, color: "#9ca3af", width: 50 }}>Signature:</Text>
                    <View style={{ flex: 1, borderBottomWidth: 1, borderBottomColor: "#d1d5db", height: 18 }} />
                  </View>
                  <View style={{ flexDirection: "row", gap: 4 }}>
                    <Text style={{ fontSize: 8, color: "#9ca3af", width: 50 }}>Date:</Text>
                    <View style={{ flex: 1, borderBottomWidth: 1, borderBottomColor: "#d1d5db", height: 18 }} />
                  </View>
                </>
              )}
            </View>

            {/* Client */}
            <View
              style={{
                flex: 1,
                borderWidth: 1,
                borderColor: "#e5e7eb",
                borderRadius: 4,
                padding: 10,
              }}
            >
              <Text
                style={{
                  fontSize: 8,
                  color: "#9ca3af",
                  fontFamily: "Helvetica-Bold",
                  marginBottom: 10,
                }}
              >
                CLIENT AUTHORISATION
              </Text>
              {variation.clientSignedName ? (
                <View>
                  <Text style={{ fontSize: 9, color: "#374151", marginBottom: 2 }}>
                    {variation.clientSignedName}
                  </Text>
                  {variation.clientSignedDate && (
                    <Text style={{ fontSize: 8, color: "#9ca3af" }}>
                      Signed {format(new Date(variation.clientSignedDate), "d MMM yyyy")}
                    </Text>
                  )}
                </View>
              ) : (
                <>
                  <View style={{ flexDirection: "row", gap: 4, marginBottom: 10 }}>
                    <Text style={{ fontSize: 8, color: "#9ca3af", width: 50 }}>Name:</Text>
                    <View style={{ flex: 1, borderBottomWidth: 1, borderBottomColor: "#d1d5db", height: 18 }} />
                  </View>
                  <View style={{ flexDirection: "row", gap: 4, marginBottom: 10 }}>
                    <Text style={{ fontSize: 8, color: "#9ca3af", width: 50 }}>Signature:</Text>
                    <View style={{ flex: 1, borderBottomWidth: 1, borderBottomColor: "#d1d5db", height: 18 }} />
                  </View>
                  <View style={{ flexDirection: "row", gap: 4 }}>
                    <Text style={{ fontSize: 8, color: "#9ca3af", width: 50 }}>Date:</Text>
                    <View style={{ flex: 1, borderBottomWidth: 1, borderBottomColor: "#d1d5db", height: 18 }} />
                  </View>
                </>
              )}
            </View>
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
