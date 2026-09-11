import { Document, Page, Text, View } from "@react-pdf/renderer";
import type { Rfq, RfqItem } from "@shared/schema";
import { registerPdfFonts, PDF_FONT_FAMILY } from "@/components/pdf/shared/registerPdfFonts";
import { PdfHeroBand } from "@/components/pdf/shared/PdfHeroBand";
import { PdfPartiesPanel, PdfDocumentTitle } from "@/components/pdf/shared/PdfPartiesPanel";
import { PdfSection, PdfCallout } from "@/components/pdf/shared/PdfPrimitives";
import { PdfLineTable, PdfDocFooter } from "@/components/pdf/shared/PdfLineTable";
import { PDF_COLORS, PDF_PAGE_MARGIN, PDF_SPACE, PDF_TYPE } from "@/components/pdf/shared/pdfTokens";
import { statusPaint } from "@/components/pdf/shared/pdfStatus";

/**
 * The request for quote, on the shared document kit.
 *
 * The RFQ used to render from its own StyleSheet with its own header, footer
 * and colour handling — the only client-facing document that did. That is why
 * it drifted: it took a hardcoded green while every other document took the
 * company's brand colour, and it read the logo from a field that does not
 * exist. It was moved onto the shared chrome once already; this moves it the
 * rest of the way, onto the same tokens, type and primitives as the others.
 *
 * Its own five-state status palette in Tailwind colours goes with it. The
 * labels it carried were better than the raw keys, though, so they are kept
 * and passed to the shared resolver rather than thrown away: a supplier
 * reading "Awaiting Quotes" learns more than one reading "Sent".
 *
 * The headline slot carries the RESPONSE DEADLINE rather than a figure. An RFQ
 * has no total — the whole point is that the supplier supplies one — and the
 * date is what the recipient needs to see first.
 *
 * Internal notes are not rendered here and never were. See the purchase order,
 * which did print them.
 */

registerPdfFonts();

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
  /** Who this copy is addressed to, when it is being sent to one supplier. */
  supplier?: { name?: string | null; email?: string | null } | null;
  brandColor?: string;
  documentStyle?: "style1" | "style2";
  logoUrl?: string | null;
}

/** Wording worth keeping — it says more than the status key does. */
const RFQ_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  sent: "Awaiting Quotes",
  quoted: "Quotes Received",
  closed: "Closed",
  cancelled: "Cancelled",
};

function formatDate(date: Date | string | null | undefined): string | null {
  if (!date) return null;
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-AU", { year: "numeric", month: "long", day: "numeric" });
}

/** The masthead slot is sized for currency. A long date ("18 September 2026")
 *  crowds it enough to wrap the company name onto two lines. */
function formatDateShort(date: Date | string | null | undefined): string | null {
  if (!date) return null;
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return null;
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
  supplier,
  brandColor = PDF_COLORS.brandFallback,
  documentStyle = "style1",
  logoUrl,
}: RFQDocumentProps) {
  const chip = statusPaint(rfq.status, RFQ_STATUS_LABELS[rfq.status]);
  const due = formatDate(rfq.dueDate);

  return (
    <Document title={`RFQ ${rfq.rfqNumber}`}>
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
          status={chip}
          // No total: the supplier is the one who supplies that. The deadline
          // is what they need to see first, so it takes the headline slot.
          figure={formatDateShort(rfq.dueDate) ?? "—"}
          figureLabel="Quotes due by"
          figureCaption={rfq.rfqNumber}
        />

        <View style={{ paddingHorizontal: PDF_PAGE_MARGIN, paddingTop: PDF_SPACE.xl }}>
          <PdfDocumentTitle>
            {rfq.title || `Request for Quote ${rfq.rfqNumber}`}
          </PdfDocumentTitle>

          <PdfSection>
            <PdfPartiesPanel
              recipient={{
                label: "Supplier",
                title: supplier?.name || "—",
                lines: [supplier?.email],
              }}
              project={{
                label: "Project",
                title: project?.name || "—",
                lines: [project?.address],
              }}
              document={{
                label: "Request",
                fields: [
                  { label: "Number", value: rfq.rfqNumber },
                  { label: "Quotes due", value: due },
                ],
              }}
            />
          </PdfSection>

          {rfq.scope && (
            <PdfSection label="Scope of Work">
              <PdfCallout>{rfq.scope}</PdfCallout>
            </PdfSection>
          )}

          {items.length > 0 && (
            <PdfSection label="Items">
              <PdfLineTable<RfqItem>
                brandColor={brandColor}
                grouped={false}
                textHeader="Description"
                renderText={(item) => (
                  <View>
                    <Text style={{ fontSize: PDF_TYPE.tableCell, color: PDF_COLORS.ink }}>
                      {item.description}
                    </Text>
                    {item.notes ? (
                      <Text style={{ fontSize: PDF_TYPE.caption + 0.5, color: PDF_COLORS.inkMuted }}>
                        {item.notes}
                      </Text>
                    ) : null}
                  </View>
                )}
                columns={[
                  { key: "qty", label: "Qty", width: 55, align: "right", value: (i) => formatQuantity(i.quantity) },
                  { key: "unit", label: "Unit", width: 50, align: "right", value: (i) => i.unit || "—" },
                  // Deliberately no price column: this is a request, and a
                  // pre-filled rate anchors the quote we are asking for.
                  { key: "yourRate", label: "Your Rate", width: 80, align: "right", value: () => "" },
                  { key: "yourTotal", label: "Your Total", width: 80, align: "right", value: () => "" },
                ]}
                groups={[{ key: "items", rows: items }]}
                rowKey={(item, i) => item.id || `rfq-item-${i}`}
              />
            </PdfSection>
          )}

          <View
            style={{
              marginTop: PDF_SPACE.xl,
              paddingTop: PDF_SPACE.lg,
              borderTopWidth: 1,
              borderTopColor: PDF_COLORS.border,
            }}
          >
            <Text style={{ fontSize: PDF_TYPE.body, color: PDF_COLORS.ink, lineHeight: 1.5, marginBottom: 3 }}>
              {due
                ? `Please review the scope and items above and return your quote by ${due}.`
                : "Please review the scope and items above and return your quote."}
            </Text>
            {company?.email && (
              <Text style={{ fontSize: PDF_TYPE.bodySmall, color: PDF_COLORS.inkMuted }}>
                {`Questions? Contact us at ${company.email}${company.phone ? ` or ${company.phone}` : ""}.`}
              </Text>
            )}
          </View>
        </View>

        <PdfDocFooter companyName={company?.name} />
      </Page>
    </Document>
  );
}
