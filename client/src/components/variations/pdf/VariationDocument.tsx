import { Document, Page, Text, View } from "@react-pdf/renderer";
import type { Variation, VariationItem } from "@shared/schema";
import { format } from "date-fns";
import { registerPdfFonts, PDF_FONT_FAMILY } from "@/components/pdf/shared/registerPdfFonts";
import { PdfHeroBand } from "@/components/pdf/shared/PdfHeroBand";
import {
  PdfSection,
  PdfProse,
  PdfPanel,
  PdfTotalsCard,
  PdfSignatureCards,
  PdfCallout,
} from "@/components/pdf/shared/PdfPrimitives";
import {
  PdfPartiesPanel,
  PdfDocumentTitle,
} from "@/components/pdf/shared/PdfPartiesPanel";
import {
  PdfLineTable,
  PdfSimpleRows,
  PdfDocFooter,
  type PdfTableColumn,
} from "@/components/pdf/shared/PdfLineTable";
import {
  PDF_COLORS,
  PDF_PAGE_MARGIN,
  PDF_SPACE,
  PDF_TYPE,
  PDF_WEIGHT,
  brandRamp,
} from "@/components/pdf/shared/pdfTokens";
import {
  buildVariationDocumentModel,
  variationStatusPresentation,
  type VariationDocLine,
} from "../variationDocumentModel";
import {
  DEFAULT_VARIATION_DOCUMENT_COLUMNS,
  type VariationDocumentColumns,
} from "@shared/variationDocumentColumns";

/**
 * The variation, as a PDF — built on the portal's composition.
 *
 * Jed's note, holding the two side by side: "Why does the app for the variation
 * doc look so different to the pdf version. I really like the in app version."
 * The figures were never the problem (both renderers share
 * buildVariationDocumentModel, so they cannot disagree). The *look* was, and in
 * four specific ways, all of which this rewrite removes:
 *
 *   1. Three identity blocks — a brand band with only the company in it, a grey
 *      CLIENT/PROJECT bar, then a third row with the number, the status and a
 *      money card — burned ~40% of page one before any content. The portal says
 *      all of it in one band, so now this does too.
 *
 *   2. The headline figure printed in the *bills* amber (#F8F3E8 / #B8853A)
 *      whatever the company's brand colour was, so a builder branded green got
 *      an orange price. Every colour now derives from brandRamp().
 *
 *   3. The logo tile was drawn even with no logo, leaving an empty grey box in
 *      the corner of every document. It falls back to initials.
 *
 *   4. The signature panel printed blank ruled lines for both parties even when
 *      the client had signed in the portal — throwing away the one piece of
 *      evidence you would reach for if the agreement were questioned. A captured
 *      signature is now shown.
 *
 * Also new here, because the portal had it and the PDF did not: a rejected
 * variation carries its rejection reason.
 */

registerPdfFonts();

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
  /** Which columns/sections the client sees. Defaults to everything. */
  columns?: VariationDocumentColumns;
  /** cost-code id -> "code - title". Without it the Cost Code column renders
   *  the stored UUID. */
  costCodeLabels?: Record<string, string>;
  /** How the parties block lays out. See PdfPartiesPanel. */
  partiesLayout?: "columns" | "stacked";
}

/**
 * Fixed-width numeric columns, in render order. The name/description cell is
 * flexible and takes whatever is left, so enabling every column narrows the
 * description rather than overflowing the page.
 *
 * Deliberately the same keys, order and labels as the portal's `lineCols`
 * (VariationPreviewContent.tsx) — the two tables have to agree about what is
 * on the page, not just what the numbers are.
 */
const LINE_COLUMN_SPECS: Array<PdfTableColumn<VariationDocLine> & {
  key: "costCode" | "quantity" | "unit" | "unitCost" | "unitPrice" | "markupPercent" | "markupAmount" | "amountEx" | "amountInc";
}> = [
  { key: "costCode", label: "Cost Code", width: 52, align: "left", value: (l) => l.costCode || "" },
  { key: "quantity", label: "Qty", width: 34, align: "right", value: (l) => String(l.quantity ?? "") },
  { key: "unit", label: "Unit", width: 32, align: "right", value: (l) => l.unitType || "" },
  { key: "unitCost", label: "Unit Cost", width: 56, align: "right", value: (l) => formatAUD(l.unitCostExCents / 100) },
  { key: "unitPrice", label: "Unit Price", width: 56, align: "right", value: (l) => formatAUD(l.unitPriceExCents / 100) },
  { key: "markupPercent", label: "Mkup %", width: 38, align: "right", value: (l) => (l.markupPercent == null ? "" : `${l.markupPercent}%`) },
  { key: "markupAmount", label: "Markup", width: 56, align: "right", value: (l) => formatAUD(l.markupAmountExCents / 100) },
  { key: "amountEx", label: "Amt ex. GST", width: 60, align: "right", value: (l) => formatAUD(l.amountExCents / 100) },
  { key: "amountInc", label: "Amt inc. GST", width: 64, align: "right", value: (l) => formatAUD(l.amountIncCents / 100) },
];

function formatAUD(dollars: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 2,
  }).format(dollars);
}

const fmtDate = (d: string | Date | null | undefined) =>
  d ? format(new Date(d), "d MMMM yyyy") : null;

export function VariationDocument({
  variation,
  items,
  bills = [],
  labourTotalCents = 0,
  company,
  project,
  brandColor = PDF_COLORS.brandFallback,
  documentStyle = "style1",
  logoUrl,
  originalContractCents,
  currentContractCents,
  revisedContractCents,
  revisedIsAgreed = false,
  columns = DEFAULT_VARIATION_DOCUMENT_COLUMNS,
  costCodeLabels,
  partiesLayout = "columns",
}: VariationDocumentProps) {
  const brand = brandRamp(brandColor);
  const statusCfg = variationStatusPresentation(variation.status);

  const activeLineCols = LINE_COLUMN_SPECS.filter((c) => columns[c.key]);
  const showTextCell = columns.name || columns.description;

  // Shared with the portal page so both documents group, label and total
  // identically.
  const docModel = buildVariationDocumentModel({
    variation,
    items,
    bills,
    labourExCents: labourTotalCents,
    costCodeLabels,
  });

  const attachmentList: Array<{ name?: string }> = Array.isArray((variation as any).attachments)
    ? ((variation as any).attachments as any[])
    : [];

  const showContractCard =
    columns.contractSummary &&
    originalContractCents !== undefined &&
    originalContractCents > 0;
  const contractBeforeCents = currentContractCents ?? originalContractCents ?? 0;

  // Rows that are real money but not line items. They live inside the table,
  // or the rows above stop reconciling with the Total below it.
  const trailingRows = [
    docModel.globalMarkupIncCents !== 0
      ? {
          label: docModel.globalMarkupPercent
            ? `Margin (${docModel.globalMarkupPercent}%)`
            : "Margin",
          value: formatAUD(docModel.globalMarkupIncCents / 100),
          emphasis: true,
        }
      : null,
    docModel.notItemisedIncCents !== 0
      ? {
          label: "Additional works (not itemised)",
          value: formatAUD(docModel.notItemisedIncCents / 100),
        }
      : null,
  ].filter(Boolean) as Array<{ label: string; value: string; emphasis?: boolean }>;

  return (
    <Document title={`Variation ${variation.variationNumber}`}>
      <Page
        size="A4"
        style={{
          fontSize: PDF_TYPE.body,
          fontFamily: PDF_FONT_FAMILY,
          color: PDF_COLORS.ink,
          backgroundColor: PDF_COLORS.surface,
          paddingBottom: 56,
        }}
      >
        {/* One band: who it is from, what state it is in, and what it costs. */}
        <PdfHeroBand
          variant={documentStyle === "style2" ? "brand" : "light"}
          companyName={company?.name || "—"}
          logoUrl={logoUrl}
          brandColor={brandColor}
          contactLines={[
            company?.phone,
            company?.email,
            company?.abn ? `ABN ${company.abn}` : null,
          ]}
          status={{ label: statusCfg.label, bg: statusCfg.bg, text: statusCfg.text }}
          figure={formatAUD(docModel.totalCents / 100)}
          figureLabel="Inc. GST"
          figureCaption={variation.variationNumber || undefined}
        />

        <View style={{ paddingHorizontal: PDF_PAGE_MARGIN, paddingTop: PDF_SPACE.xl }}>
          {/* The subject line. It was a field labelled "Name" inside the details
              grid, which is the wrong shape — it IS the document. */}
          {variation.name ? <PdfDocumentTitle>{variation.name}</PdfDocumentTitle> : null}

          {/* Who it's for, where the job is, what this document is — three
              kinds of fact that used to read as one undifferentiated list. */}
          <PdfSection>
            <PdfPartiesPanel
              layout={partiesLayout}
              // An em dash rather than an empty block when a field is missing:
              // the layout stays stable, and a builder looking at their own
              // document can see the client has not been filled in. Matches
              // what the portal does.
              recipient={{
                label: "To",
                title: project?.clientName || "—",
                lines: [project?.clientEmail, project?.clientPhone],
              }}
              project={{
                label: "Project",
                title: project?.name || "—",
                lines: [project?.address],
              }}
              document={{
                label: "Document",
                fields: [
                  // No "Number" row: the masthead already captions the figure
                  // with it, and repeating it is what made this column read as
                  // busy.
                  { label: "Issued", value: fmtDate((variation as any).createdAt) },
                  { label: "Respond by", value: fmtDate((variation as any).approvalDeadline) },
                  {
                    label: "Days changed",
                    value:
                      variation.daysChanged && variation.daysChanged !== 0
                        ? `${variation.daysChanged > 0 ? "+" : ""}${variation.daysChanged} working days`
                        : null,
                  },
                ],
              }}
            />
          </PdfSection>

          {variation.introductionText ? (
            <PdfSection>
              <PdfProse>{variation.introductionText}</PdfProse>
            </PdfSection>
          ) : null}

          {/* What this does to the contract sum. */}
          {showContractCard && (
            <PdfSection label="Contract Summary" wrap={false}>
              <PdfPanel>
                <View style={{ flexDirection: "row" }}>
                  {[
                    {
                      label: "Current Contract Sum",
                      value: formatAUD(contractBeforeCents / 100),
                      strong: false,
                    },
                    {
                      label: "This Variation",
                      value: formatAUD(docModel.totalCents / 100),
                      strong: false,
                    },
                    {
                      label: revisedIsAgreed ? "Revised Contract Sum" : "Proposed Revised Total",
                      value: formatAUD(
                        (revisedContractCents ?? contractBeforeCents + docModel.totalCents) / 100,
                      ),
                      strong: true,
                    },
                  ].map((c, i) => (
                    <View
                      key={c.label}
                      style={{
                        flex: 1,
                        paddingHorizontal: 14,
                        paddingVertical: 12,
                        borderLeftWidth: i === 0 ? 0 : 1,
                        borderLeftColor: PDF_COLORS.border,
                        backgroundColor: c.strong ? brand.wash : PDF_COLORS.surface,
                      }}
                    >
                      {/* Two lines reserved, so "Proposed Revised Total"
                          wrapping cannot push its figure out of line with the
                          figures beside it. */}
                      <Text
                        style={{
                          fontSize: PDF_TYPE.caption,
                          fontFamily: PDF_FONT_FAMILY,
                          fontWeight: PDF_WEIGHT.semibold,
                          letterSpacing: 0.4,
                          textTransform: "uppercase",
                          color: PDF_COLORS.inkFaint,
                          minHeight: 18,
                          marginBottom: 4,
                        }}
                      >
                        {c.label}
                      </Text>
                      <Text
                        style={{
                          fontFamily: PDF_FONT_FAMILY,
                          fontWeight: PDF_WEIGHT.bold,
                          fontSize: c.strong ? PDF_TYPE.totalFigure : PDF_TYPE.docTitle,
                          color: c.strong ? brand.onWhite : PDF_COLORS.ink,
                        }}
                      >
                        {c.value}
                      </Text>
                    </View>
                  ))}
                </View>
              </PdfPanel>
            </PdfSection>
          )}

          {/* Cost lines */}
          {docModel.costLines.length > 0 && (
            <PdfSection label="Cost Lines">
              <PdfLineTable<VariationDocLine>
                brandColor={brandColor}
                grouped={!!columns.grouping}
                columns={activeLineCols}
                textHeader={showTextCell ? (columns.description ? "Description" : "Name") : null}
                renderText={
                  showTextCell
                    ? (line) => (
                        <View>
                          {columns.name && line.name ? (
                            <Text
                              style={{
                                fontFamily: PDF_FONT_FAMILY,
                                fontWeight: PDF_WEIGHT.semibold,
                                fontSize: PDF_TYPE.tableCell,
                                color: PDF_COLORS.ink,
                              }}
                            >
                              {line.name}
                            </Text>
                          ) : null}
                          {columns.description && line.description ? (
                            <Text style={{ fontSize: PDF_TYPE.caption + 0.5, color: PDF_COLORS.inkMuted }}>
                              {line.description}
                            </Text>
                          ) : null}
                          {!(columns.name && line.name) && !(columns.description && line.description) ? (
                            <Text style={{ fontSize: PDF_TYPE.tableCell, color: PDF_COLORS.inkFaint }}>—</Text>
                          ) : null}
                        </View>
                      )
                    : undefined
                }
                // Trade breakdown off means ONE flat list in the builder's own
                // order — not the same clusters with their headings hidden.
                groups={
                  columns.grouping
                    ? docModel.costGroups.map((g) => ({
                        key: g.type,
                        label: g.label,
                        total: formatAUD(g.totalIncCents / 100),
                        rows: g.lines,
                      }))
                    : [{ key: "all", rows: docModel.costLines }]
                }
                trailingRows={trailingRows}
                rowKey={(line, i) => line.id || `line-${i}`}
              />
            </PdfSection>
          )}

          {docModel.allowanceLines.length > 0 && (
            <PdfSection label="Allowances">
              <PdfSimpleRows
                rows={docModel.allowanceLines.map((l) => ({
                  key: l.id,
                  label: l.description,
                  value: formatAUD(l.amountIncCents / 100),
                  negative: l.amountIncCents < 0,
                }))}
              />
            </PdfSection>
          )}

          {columns.bills && docModel.bills.length > 0 && (
            <PdfSection label="Linked Bills">
              <PdfLineTable<(typeof docModel.bills)[number]>
                brandColor={brandColor}
                grouped={false}
                textHeader="Supplier"
                renderText={(b) => (
                  <View>
                    <Text style={{ fontSize: PDF_TYPE.tableCell, color: PDF_COLORS.ink }}>
                      {b.supplierName || "—"}
                    </Text>
                    <Text style={{ fontSize: PDF_TYPE.caption + 0.5, color: PDF_COLORS.inkMuted }}>
                      {b.billNumber || "—"}
                    </Text>
                  </View>
                )}
                columns={[
                  {
                    key: "date",
                    label: "Date",
                    width: 70,
                    align: "right",
                    value: (b) => (b.invoiceDate ? format(new Date(b.invoiceDate), "d MMM yy") : "—"),
                  },
                  {
                    key: "total",
                    label: "Total",
                    width: 80,
                    align: "right",
                    value: (b) => formatAUD(b.totalIncCents / 100),
                  },
                ]}
                groups={[{ key: "bills", rows: docModel.bills }]}
                rowKey={(b, i) => b.id || `bill-${i}`}
              />
            </PdfSection>
          )}

          {docModel.labourIncCents > 0 && (
            <PdfSection label="Site Labour">
              <PdfSimpleRows
                rows={[
                  { key: "labour", label: "Labour", value: formatAUD(docModel.labourIncCents / 100) },
                ]}
              />
            </PdfSection>
          )}

          {attachmentList.length > 0 && (
            <PdfSection label="Attachments">
              <PdfSimpleRows
                rows={attachmentList.map((att, idx) => ({
                  key: `att-${idx}`,
                  label: att?.name || `Attachment ${idx + 1}`,
                }))}
              />
              <Text style={{ fontSize: PDF_TYPE.caption, color: PDF_COLORS.inkFaint, marginTop: 4 }}>
                Attached files can be downloaded from your variation link.
              </Text>
            </PdfSection>
          )}

          {/* Why it was refused. Captured at rejection, shown on the portal,
              and previously missing from the document entirely. */}
          {variation.status === "rejected" && variation.rejectionReason ? (
            <PdfSection>
              <PdfCallout label="Reason for rejection" tone="negative">
                {variation.rejectionReason}
              </PdfCallout>
            </PdfSection>
          ) : null}

          <View style={{ marginTop: PDF_SPACE.xl }}>
            <PdfTotalsCard
              brandColor={brandColor}
              rows={[
                { label: "Subtotal (ex. GST)", value: formatAUD(docModel.subtotalCents / 100) },
                { label: "GST (10%)", value: formatAUD(docModel.gstCents / 100) },
              ]}
              totalLabel="Total (inc. GST)"
              totalValue={formatAUD(docModel.totalCents / 100)}
            />
          </View>

          {variation.closingText ? (
            <View
              style={{
                borderTopWidth: 1,
                borderTopColor: PDF_COLORS.border,
                paddingTop: PDF_SPACE.lg,
                marginTop: PDF_SPACE.xl,
              }}
            >
              <PdfProse>{variation.closingText}</PdfProse>
            </View>
          ) : null}

          {variation.termsAndConditions ? (
            <View style={{ borderTopWidth: 1, borderTopColor: PDF_COLORS.border, paddingTop: PDF_SPACE.lg }}>
              <PdfSection label="Terms & Conditions">
                <Text
                  style={{
                    fontSize: PDF_TYPE.bodySmall,
                    color: PDF_COLORS.inkMuted,
                    lineHeight: 1.5,
                  }}
                >
                  {variation.termsAndConditions}
                </Text>
              </PdfSection>
            </View>
          ) : null}

          <View style={{ borderTopWidth: 1, borderTopColor: PDF_COLORS.border, paddingTop: PDF_SPACE.lg }}>
            <PdfSection label="Signatures">
              <PdfSignatureCards
                signatories={[
                  {
                    title: `Legal Representative of ${company?.name || "Builder"}`,
                    signedName: variation.builderSignedName,
                    signedDate: fmtDate(variation.builderSignedDate),
                  },
                  {
                    title: "Client Authorisation",
                    signedName: variation.clientSignedName,
                    signedDate: fmtDate(variation.clientSignedDate),
                  },
                ]}
              />
            </PdfSection>
          </View>
        </View>

        <PdfDocFooter companyName={company?.name} />
      </Page>
    </Document>
  );
}
