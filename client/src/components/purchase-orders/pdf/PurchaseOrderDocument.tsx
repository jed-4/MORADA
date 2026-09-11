import { Document, Page, Text, View } from "@react-pdf/renderer";
import { format } from "date-fns";
import { registerPdfFonts, PDF_FONT_FAMILY } from "@/components/pdf/shared/registerPdfFonts";
import { PdfHeroBand } from "@/components/pdf/shared/PdfHeroBand";
import { PdfPartiesPanel, PdfDocumentTitle } from "@/components/pdf/shared/PdfPartiesPanel";
import { PdfSection, PdfProse, PdfTotalsCard } from "@/components/pdf/shared/PdfPrimitives";
import { PdfLineTable, PdfDocFooter } from "@/components/pdf/shared/PdfLineTable";
import { PDF_COLORS, PDF_PAGE_MARGIN, PDF_SPACE, PDF_TYPE, PDF_WEIGHT } from "@/components/pdf/shared/pdfTokens";
import { statusPaint } from "@/components/pdf/shared/pdfStatus";

/**
 * The purchase order, on the shared document kit.
 *
 * Two real defects fixed along with the look:
 *
 *   1. INTERNAL NOTES WERE PRINTED ON THE SUPPLIER'S COPY. The schema is
 *      explicit — purchase_orders.internal_notes is commented "Internal only,
 *      not on PDF" — and this document rendered them in a highlighted NOTES
 *      box on the page that gets emailed to the supplier. The RFQ document
 *      omits its equivalent field correctly; this one never did. The prop is
 *      gone rather than merely unused, so it cannot be reinstated by accident.
 *
 *   2. THE SUPPLIER WAS NOT NAMED IN THE PARTIES BLOCK. DocProjectBar's props
 *      are hard-coded to a client, so this document passed only the project
 *      and the recipient appeared, if at all, in an ad-hoc block further down.
 *      A purchase order that does not say who it is addressed to is not a
 *      purchase order.
 *
 * The headline figure is the order total inc GST, and the parties block's
 * recipient is labelled "Supplier" rather than "To" — the same primitive, told
 * who is on the other end.
 */

registerPdfFonts();

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

function safeFormatDate(d?: Date | string | null): string | null {
  if (!d) return null;
  try {
    return format(new Date(d), "d MMMM yyyy");
  } catch {
    return null;
  }
}

export function PurchaseOrderDocument({
  purchaseOrder,
  items,
  company,
  supplier,
  project,
  brandColor = PDF_COLORS.brandFallback,
  documentStyle = "style1",
  logoUrl,
}: PurchaseOrderDocumentProps) {
  const chip = statusPaint(purchaseOrder.status);

  return (
    <Document title={`Purchase Order ${purchaseOrder.poNumber}`}>
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
        <PdfHeroBand
          variant={documentStyle === "style2" ? "brand" : "light"}
          companyName={company?.name || "—"}
          logoUrl={logoUrl}
          brandColor={brandColor}
          contactLines={[company?.phone, company?.email, company?.abn ? `ABN ${company.abn}` : null]}
          status={purchaseOrder.status ? chip : null}
          figure={formatAUD(purchaseOrder.total)}
          figureLabel="Order total inc. GST"
          figureCaption={purchaseOrder.poNumber}
        />

        <View style={{ paddingHorizontal: PDF_PAGE_MARGIN, paddingTop: PDF_SPACE.xl }}>
          <PdfDocumentTitle>
            {purchaseOrder.title || `Purchase Order ${purchaseOrder.poNumber}`}
          </PdfDocumentTitle>

          <PdfSection>
            <PdfPartiesPanel
              recipient={{
                label: "Supplier",
                title: supplier?.name || "—",
                lines: [
                  supplier?.email,
                  supplier?.phone,
                  supplier?.abn ? `ABN ${supplier.abn}` : null,
                  supplier?.address,
                ],
              }}
              project={{
                label: "Deliver to",
                title: project?.name || "—",
                lines: [project?.address || company?.address],
              }}
              document={{
                label: "Order",
                fields: [
                  { label: "Ordered", value: safeFormatDate(purchaseOrder.poDate) },
                  { label: "Required by", value: safeFormatDate(purchaseOrder.requiredByDate) },
                  {
                    label: "Pricing",
                    value: purchaseOrder.gstMode === "inclusive" ? "Inc. GST" : "Ex. GST",
                  },
                ],
              }}
            />
          </PdfSection>

          {purchaseOrder.description ? (
            <PdfSection>
              <PdfProse>{purchaseOrder.description}</PdfProse>
            </PdfSection>
          ) : null}

          {items.length > 0 && (
            <PdfSection label="Order Items">
              <PdfLineTable<POItem>
                brandColor={brandColor}
                grouped={false}
                textHeader="Description"
                renderText={(item) => (
                  <Text style={{ fontSize: PDF_TYPE.tableCell, color: PDF_COLORS.ink }}>
                    {item.description}
                    {item.isGstFree ? (
                      <Text style={{ color: PDF_COLORS.inkMuted }}> (GST free)</Text>
                    ) : null}
                  </Text>
                )}
                columns={[
                  { key: "qty", label: "Qty", width: 44, align: "right", value: (i) => String(i.quantity ?? "") },
                  { key: "unit", label: "Unit", width: 40, align: "right", value: (i) => i.unit || "" },
                  { key: "price", label: "Unit Price", width: 74, align: "right", value: (i) => formatAUD(i.unitPrice) },
                  {
                    key: "total",
                    label: "Total",
                    width: 80,
                    align: "right",
                    value: (i) =>
                      formatAUD(i.total || Math.round(Number(i.quantity || 0) * (i.unitPrice || 0))),
                  },
                ]}
                groups={[{ key: "items", rows: items }]}
                rowKey={(_, i) => `po-line-${i}`}
              />
            </PdfSection>
          )}

          <View style={{ marginTop: PDF_SPACE.xl }}>
            <PdfTotalsCard
              brandColor={brandColor}
              rows={[
                { label: "Subtotal (ex. GST)", value: formatAUD(purchaseOrder.subtotal) },
                { label: "GST (10%)", value: formatAUD(purchaseOrder.gstAmount) },
              ]}
              totalLabel="Order total (inc. GST)"
              totalValue={formatAUD(purchaseOrder.total)}
            />
          </View>

          <PdfSection>
            <Text style={{ fontSize: PDF_TYPE.caption, color: PDF_COLORS.inkFaint, lineHeight: 1.5 }}>
              {`Please quote ${purchaseOrder.poNumber} on all invoices and delivery dockets.`}
            </Text>
          </PdfSection>
        </View>

        <PdfDocFooter companyName={company?.name} />
      </Page>
    </Document>
  );
}
