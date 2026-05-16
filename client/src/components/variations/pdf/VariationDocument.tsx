import { Document, Page, Text, View } from "@react-pdf/renderer";
import type { Variation, VariationItem } from "@shared/schema";
import { format } from "date-fns";
import { DocBrandedHeader } from "@/components/pdf/shared/DocBrandedHeader";
import { DocProjectBar } from "@/components/pdf/shared/DocProjectBar";
import { DocFooter } from "@/components/pdf/shared/DocFooter";

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
  documentStyle?: "style1" | "style2";
  logoUrl?: string | null;
  originalContractCents?: number;
  revisedContractCents?: number;
}

const TYPE_LABELS: Record<string, string> = {
  material: "Materials",
  labour: "Labour",
  subcontractor: "Subcontractor",
  fee: "Fee / Overhead",
  allowance: "Allowances",
  other: "Other",
};

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  draft:    { label: "Draft",            bg: "#f3f4f6", text: "#6b7280" },
  action:   { label: "Action Required",  bg: "#fff7ed", text: "#c2410c" },
  pending:  { label: "Awaiting Approval",bg: "#fef3c7", text: "#d97706" },
  approved: { label: "Approved",         bg: "#dcfce7", text: "#15803d" },
  rejected: { label: "Rejected",         bg: "#fee2e2", text: "#dc2626" },
};

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
  company,
  project,
  brandColor = "#3B82F6",
  documentStyle = "style1",
  logoUrl,
  originalContractCents,
  revisedContractCents,
}: VariationDocumentProps) {
  const isS2 = documentStyle === "style2";
  const thBg = isS2 ? brandColor : "#F8F8F8";
  const thTextColor = isS2 ? "#ffffff" : "#374151";
  const altRowBg = isS2 ? brandColor + "14" : "#f9fafb";
  const accentBg = isS2 ? brandColor + "14" : "#f3f4f6";
  const docBarBorderColor = isS2 ? brandColor + "26" : "#e5e7eb";

  const statusCfg = STATUS_CONFIG[variation.status ?? "draft"] || STATUS_CONFIG.draft;

  const subtotalCents = variation.subtotal ?? 0;
  const gstCents = variation.gstAmount ?? 0;
  const totalCents = variation.totalAmount ?? 0;

  const costItems = items.filter((i) => (i as any).itemType !== "allowance");
  const allowanceItems = items.filter((i) => (i as any).itemType === "allowance");
  const visibleCostItems = costItems.filter((i) => (i as any).showInPdf !== false);

  const typeGroups = visibleCostItems.reduce<Record<string, VariationItem[]>>((acc, item) => {
    const type = ((item as any).type || "other").toLowerCase();
    if (!acc[type]) acc[type] = [];
    acc[type].push(item);
    return acc;
  }, {});

  const showContractCard =
    originalContractCents !== undefined && originalContractCents > 0;

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
              width: showContractCard ? 340 : 160,
            }}
          >
            {/* Variation amount */}
            <View style={{ flex: 1, alignItems: "center" }}>
              <Text
                style={{
                  fontSize: 7,
                  fontFamily: "Helvetica-Bold",
                  color: "#9ca3af",
                  textTransform: "uppercase",
                  marginBottom: 4,
                }}
              >
                Variation Amount
              </Text>
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
                {/* Original contract */}
                <View style={{ flex: 1, alignItems: "center" }}>
                  <Text
                    style={{
                      fontSize: 7,
                      fontFamily: "Helvetica-Bold",
                      color: "#9ca3af",
                      textTransform: "uppercase",
                      marginBottom: 4,
                    }}
                  >
                    Original Contract
                  </Text>
                  <Text
                    style={{
                      fontSize: 11,
                      color: "#9ca3af",
                      textDecorationLine: "line-through",
                    }}
                  >
                    {formatAUD((originalContractCents ?? 0) / 100)}
                  </Text>
                  <Text style={{ fontSize: 7, color: "#9ca3af", marginTop: 2 }}>
                    Before variation
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
                  <Text
                    style={{
                      fontSize: 7,
                      fontFamily: "Helvetica-Bold",
                      color: "#9ca3af",
                      textTransform: "uppercase",
                      marginBottom: 4,
                    }}
                  >
                    Revised Total
                  </Text>
                  <Text
                    style={{ fontSize: 13, fontFamily: "Helvetica-Bold", color: "#111827" }}
                  >
                    {formatAUD((revisedContractCents ?? 0) / 100)}
                  </Text>
                  <Text style={{ fontSize: 7, color: "#9ca3af", marginTop: 2 }}>
                    New contract value
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
          {Object.keys(typeGroups).length > 0 && (
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
                <Text style={{ fontSize: 8, color: thTextColor, fontFamily: "Helvetica-Bold", width: 65, textAlign: "right" }}>
                  Unit Cost
                </Text>
                <Text style={{ fontSize: 8, color: thTextColor, fontFamily: "Helvetica-Bold", width: 45, textAlign: "right" }}>
                  Markup
                </Text>
                <Text style={{ fontSize: 8, color: thTextColor, fontFamily: "Helvetica-Bold", width: 65, textAlign: "right" }}>
                  Amt inc. GST
                </Text>
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
                        {TYPE_LABELS[type] ?? type}
                      </Text>
                      <Text style={{ fontSize: 8, fontFamily: "Helvetica-Bold", color: "#6b7280" }}>
                        {formatAUD(typeTotal)}
                      </Text>
                    </View>
                    {typeItems.map((item, idx) => {
                      const unitCost = item.unitCostExTax ?? (item.unitPrice ?? 0) / 100;
                      const qty = item.quantity ?? 1;
                      const exTax = qty * unitCost * (1 + ((item.markupPercent ?? 0) / 100));
                      const incTax = (item as any).taxable !== false ? exTax * 1.1 : exTax;
                      return (
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
                          <View style={{ flex: 1 }}>
                            {(item as any).name ? (
                              <Text style={{ fontSize: 9, fontFamily: "Helvetica-Bold", color: "#111827" }}>
                                {(item as any).name}
                              </Text>
                            ) : null}
                            {item.description ? (
                              <Text style={{ fontSize: 8, color: "#6b7280" }}>{item.description}</Text>
                            ) : null}
                            {!(item as any).name && !item.description ? (
                              <Text style={{ fontSize: 9, color: "#374151" }}>—</Text>
                            ) : null}
                          </View>
                          <Text style={{ fontSize: 9, color: "#374151", width: 50, textAlign: "right" }}>
                            {qty} {(item as any).unitType || ""}
                          </Text>
                          <Text style={{ fontSize: 9, color: "#374151", width: 65, textAlign: "right" }}>
                            {formatAUD(unitCost)}
                          </Text>
                          <Text style={{ fontSize: 9, color: "#374151", width: 45, textAlign: "right" }}>
                            {item.markupPercent ? `${item.markupPercent}%` : "—"}
                          </Text>
                          <Text style={{ fontSize: 9, color: "#374151", width: 65, textAlign: "right" }}>
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
              {allowanceItems.map((item, idx) => (
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
                  <Text style={{ fontSize: 9, color: "#374151", flex: 1 }}>{item.description}</Text>
                  <Text style={{ fontSize: 9, color: "#374151", width: 80, textAlign: "right" }}>
                    {formatAUD((item.unitPrice ?? 0) / 100)}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* Bills */}
          {bills.length > 0 && (
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
              {bills.map((bill, idx) => {
                const total = (bill.totalAmountCents ?? bill.totalAmount ?? 0) / 100;
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
