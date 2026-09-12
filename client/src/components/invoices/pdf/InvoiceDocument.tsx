import { Document, Page, Text, View, Link, Image } from "@react-pdf/renderer";
import { format } from "date-fns";
import { registerPdfFonts, PDF_FONT_FAMILY } from "@/components/pdf/shared/registerPdfFonts";
import { PdfHeroBand } from "@/components/pdf/shared/PdfHeroBand";
import { PdfPartiesPanel, PdfDocumentTitle } from "@/components/pdf/shared/PdfPartiesPanel";
import {
  PdfSection,
  PdfProse,
  PdfTotalsCard,
  PdfCallout,
} from "@/components/pdf/shared/PdfPrimitives";
import { PdfLineTable, PdfDocFooter } from "@/components/pdf/shared/PdfLineTable";
import { PDF_COLORS, PDF_PAGE_MARGIN, PDF_SPACE, PDF_TYPE, PDF_WEIGHT } from "@/components/pdf/shared/pdfTokens";
import { statusPaint } from "@/components/pdf/shared/pdfStatus";

/**
 * The client invoice, on the shared document kit.
 *
 * Three things this fixes beyond the look:
 *
 *   - it defaulted to `brandColor = "#3B82F6"`, Tailwind blue, so a company
 *     that had not set a brand colour sent invoices in a colour from nowhere in
 *     the product. The fallback is now the Morada token.
 *
 *   - it rendered in Helvetica, like every document except the variation.
 *
 *   - it carried its own five-state status palette in Tailwind colours
 *     (#dbeafe, #fef3c7, #dcfce7 …) with no relationship to the app's chips.
 *
 * The headline figure in the masthead is BALANCE DUE, not the invoice total.
 * On an invoice the number the client needs is what is still owed, and on a
 * part-paid invoice those are different figures.
 */

registerPdfFonts();

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
  clientEmail?: string | null;
  clientPhone?: string | null;
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
  /** Files attached to the invoice. Listed as links; the ones flagged
   *  includeInPdf and holding an image are also appended as full pages. */
  attachments?: Array<{ name: string; url: string; type?: string; includeInPdf?: boolean }>;
}

function absoluteUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}${path.startsWith("/") ? "" : "/"}${path}`;
}

function formatAUD(cents: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

function safeFormatDate(d?: string | Date | null): string | null {
  if (!d) return null;
  try {
    return format(new Date(d), "d MMMM yyyy");
  } catch {
    return null;
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

export function InvoiceDocument({
  invoiceNumber,
  issueDate,
  dueDate,
  company,
  clientName,
  clientEmail,
  clientPhone,
  projectName,
  projectAddress,
  lineItems,
  subtotalCents,
  gstCents,
  totalCents,
  paidCents,
  balanceDueCents,
  brandColor = PDF_COLORS.brandFallback,
  documentStyle = "style1",
  logoUrl,
  paymentDetails,
  termsAndConditions,
  attachments = [],
  status,
}: InvoiceDocumentProps) {
  const overdue = isOverdue(dueDate) && status !== "paid";
  // Overdue outranks the stored status: an invoice past its due date is
  // overdue whatever the workflow last called it.
  const chipStatus = overdue ? "overdue" : status || "draft";
  const chip = statusPaint(chipStatus);

  return (
    <Document title={`Invoice ${invoiceNumber}`}>
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
          figure={formatAUD(Math.max(0, balanceDueCents))}
          figureLabel={balanceDueCents <= 0 ? "Paid in full" : "Balance due"}
          figureCaption={invoiceNumber}
        />

        <View style={{ paddingHorizontal: PDF_PAGE_MARGIN, paddingTop: PDF_SPACE.xl }}>
          <PdfDocumentTitle>{`Invoice ${invoiceNumber}`}</PdfDocumentTitle>

          <PdfSection>
            <PdfPartiesPanel
              recipient={{
                label: "To",
                title: clientName || "—",
                lines: [clientEmail, clientPhone],
              }}
              project={{
                label: "Project",
                title: projectName || "—",
                lines: [projectAddress],
              }}
              document={{
                label: "Invoice",
                fields: [
                  { label: "Issued", value: safeFormatDate(issueDate) },
                  { label: "Due", value: safeFormatDate(dueDate) },
                  { label: "Status", value: overdue ? "Overdue" : status ? chip.label : null },
                ],
              }}
            />
          </PdfSection>

          {/* The one thing a client must not miss. Only when it is actually
              late — an amber band on every invoice would stop meaning anything. */}
          {overdue && (
            <PdfSection>
              <PdfCallout label="Payment overdue" tone="caution">
                {`This invoice was due on ${safeFormatDate(dueDate)}. ${formatAUD(Math.max(0, balanceDueCents))} remains outstanding.`}
              </PdfCallout>
            </PdfSection>
          )}

          {lineItems.length > 0 && (
            <PdfSection label="Invoice Items">
              <PdfLineTable<InvoiceLineItem>
                brandColor={brandColor}
                grouped={false}
                textHeader="Description"
                renderText={(item) => (
                  <View>
                    <Text
                      style={{
                        fontFamily: PDF_FONT_FAMILY,
                        fontWeight: PDF_WEIGHT.semibold,
                        fontSize: PDF_TYPE.tableCell,
                        color: PDF_COLORS.ink,
                      }}
                    >
                      {item.label}
                    </Text>
                    {item.description ? (
                      <Text style={{ fontSize: PDF_TYPE.caption + 0.5, color: PDF_COLORS.inkMuted }}>
                        {item.description}
                      </Text>
                    ) : null}
                  </View>
                )}
                columns={[
                  {
                    key: "claim",
                    label: "Claim %",
                    width: 46,
                    align: "right",
                    value: (i) => (i.claimPct != null ? `${i.claimPct}%` : "100%"),
                  },
                  { key: "ex", label: "Ex. GST", width: 72, align: "right", value: (i) => formatAUD(i.amountExTax) },
                  { key: "gst", label: "GST", width: 58, align: "right", value: (i) => formatAUD(i.gst) },
                  { key: "inc", label: "Inc. GST", width: 76, align: "right", value: (i) => formatAUD(i.amountIncTax) },
                ]}
                groups={[{ key: "items", rows: lineItems }]}
                rowKey={(_, i) => `line-${i}`}
              />
            </PdfSection>
          )}

          <View style={{ marginTop: PDF_SPACE.xl }}>
            <PdfTotalsCard
              brandColor={brandColor}
              width={260}
              rows={[
                { label: "Subtotal (ex. GST)", value: formatAUD(subtotalCents) },
                { label: "GST (10%)", value: formatAUD(gstCents) },
                { label: "Invoice total (inc. GST)", value: formatAUD(totalCents), subtotal: true },
                ...(paidCents > 0
                  ? [{ label: "Paid to date", value: `(${formatAUD(paidCents)})`, tone: "credit" as const }]
                  : []),
              ]}
              totalLabel={balanceDueCents <= 0 ? "Paid in full" : "Balance due"}
              totalValue={formatAUD(Math.max(0, balanceDueCents))}
            />
          </View>

          {paymentDetails ? (
            <PdfSection label="Payment Details">
              <PdfProse>{paymentDetails}</PdfProse>
            </PdfSection>
          ) : null}

          {attachments.length > 0 ? (
            <PdfSection label="Attachments">
              {/* Real links, so a client can open them straight from the
                  emailed PDF without an account. */}
              {attachments.map((a, i) => (
                <Link
                  key={`${a.url}-${i}`}
                  src={absoluteUrl(a.url)}
                  style={{ fontSize: PDF_TYPE.bodySmall, color: brandColor, marginBottom: 2 }}
                >
                  {a.name}
                </Link>
              ))}
            </PdfSection>
          ) : null}

          {termsAndConditions ? (
            <View style={{ borderTopWidth: 1, borderTopColor: PDF_COLORS.border, paddingTop: PDF_SPACE.lg }}>
              <PdfSection label="Terms & Conditions">
                <Text style={{ fontSize: PDF_TYPE.bodySmall, color: PDF_COLORS.inkMuted, lineHeight: 1.5 }}>
                  {termsAndConditions}
                </Text>
              </PdfSection>
            </View>
          ) : null}
        </View>

        <PdfDocFooter companyName={company?.name} />
      </Page>

      {attachments
        .filter((a) => a.includeInPdf && (a.type || "").startsWith("image/"))
        .map((a, i) => (
          <Page key={`att-${i}`} size="A4" style={{ padding: 24, fontFamily: PDF_FONT_FAMILY }}>
            <Text style={{ fontSize: PDF_TYPE.caption, color: PDF_COLORS.inkFaint, marginBottom: 8 }}>
              {a.name}
            </Text>
            <Image src={absoluteUrl(a.url)} style={{ width: "100%", objectFit: "contain" }} />
          </Page>
        ))}
    </Document>
  );
}
