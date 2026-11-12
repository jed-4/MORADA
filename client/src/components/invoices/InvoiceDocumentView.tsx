import type { ReactNode } from "react";
import { MoneySummary } from "@/components/detail/MoneySummary";
import { formatCents } from "@shared/money";
import { sanitizeNoteHtml } from "@/lib/sanitize";

/**
 * An issued client invoice, read as a document — the way Xero shows an
 * approved invoice. Edit on the page swaps this back for the editor.
 *
 * It replaced a `<fieldset disabled>` over the whole editor: claim-row
 * builders, "Select Variations", contract warnings, all greyed out.
 *
 * The lines and totals come from the invoice's SAVED snapshot
 * (`client_invoices.line_breakdown` + the stored totals) — what was issued
 * and what Xero holds — not a live recalculation. The editor recomputes from
 * the project's current contract, variations and bills, so an issued invoice
 * could show a different total from the one the client received.
 */

export interface InvoiceDocumentField {
  label: string;
  value: ReactNode;
  testId?: string;
}

export interface InvoiceDocumentLine {
  key: string;
  /** The line's name — "Fit Off", "Variation VO-003". */
  description: string;
  /** What it's for, under the name — the same text the PDF prints. */
  detail?: string | null;
  amountExCents: number;
  gstCents: number;
  amountIncCents: number;
}

export interface InvoiceDocumentViewProps {
  fields: InvoiceDocumentField[];
  introductionHtml?: string | null;
  lines: InvoiceDocumentLine[];
  totals: {
    subtotalCents: number;
    gstCents: number;
    totalCents: number;
    paidCents: number;
  };
  /** True when the invoice predates the saved snapshot and the lines were rebuilt live. */
  rebuiltLive?: boolean;
}

const Dash = () => <span className="text-muted-foreground/60">—</span>;

export function InvoiceDocumentView({ fields, introductionHtml, lines, totals, rebuiltLive }: InvoiceDocumentViewProps) {
  const intro = introductionHtml ? sanitizeNoteHtml(introductionHtml) : "";
  const hasIntro = intro.replace(/<[^>]*>/g, "").trim().length > 0;

  return (
    <div className="space-y-3" data-testid="invoice-document">
      <div className="rounded-lg border border-border bg-card p-4" data-testid="invoice-document-fields">
        <dl className="grid grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-3">
          {fields.map((f) => (
            <div key={f.label} className="min-w-0 space-y-0.5">
              <dt className="doc-field-label">{f.label}</dt>
              <dd className="doc-body truncate" data-testid={f.testId}>
                {f.value === null || f.value === undefined || f.value === "" ? <Dash /> : f.value}
              </dd>
            </div>
          ))}
        </dl>
        {hasIntro && (
          <div className="mt-4 pt-3 border-t space-y-0.5">
            <div className="doc-field-label">Introduction</div>
            <div className="doc-prose" dangerouslySetInnerHTML={{ __html: intro }} data-testid="text-invoice-intro" />
          </div>
        )}
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden" data-testid="invoice-document-lines">
        <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
          <h3 className="text-xs font-semibold">Lines</h3>
          {rebuiltLive && (
            <span className="doc-caption" data-testid="text-invoice-rebuilt-live">
              Saved before line snapshots — lines rebuilt from the project
            </span>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-body-sm">
            <thead>
              <tr className="border-b">
                <th className="doc-col-label text-left px-3 py-2">Description</th>
                <th className="doc-col-label text-right px-3 py-2">Ex GST</th>
                <th className="doc-col-label text-right px-3 py-2">GST</th>
                <th className="doc-col-label text-right px-3 py-2">Amount</th>
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-4 doc-body-muted">No lines on this invoice.</td>
                </tr>
              ) : (
                lines.map((l) => (
                  <tr key={l.key} className="border-b last:border-b-0 align-top" data-testid={`invoice-document-line-${l.key}`}>
                    <td className="px-3 py-2">
                      <div className="font-medium whitespace-pre-wrap">{l.description || <Dash />}</div>
                      {l.detail?.trim() && (
                        <div className="doc-body-muted whitespace-pre-wrap mt-0.5" data-testid={`invoice-document-line-detail-${l.key}`}>
                          {l.detail.trim()}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 money">{formatCents(l.amountExCents, { alwaysShowDecimals: true })}</td>
                    <td className="px-3 py-2 money text-muted-foreground">{formatCents(l.gstCents, { alwaysShowDecimals: true })}</td>
                    <td className="px-3 py-2 money-figure">{formatCents(l.amountIncCents, { alwaysShowDecimals: true })}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="border-t">
          <MoneySummary
            rows={[
              { label: "Subtotal", cents: totals.subtotalCents, testId: "text-invoice-subtotal" },
              { label: "GST", cents: totals.gstCents, testId: "text-invoice-gst" },
              { label: "Total", cents: totals.totalCents, tone: "strong", rule: true, testId: "text-invoice-total" },
              { label: "Paid", cents: totals.paidCents, tone: totals.paidCents ? "normal" : "zero", testId: "text-invoice-paid" },
            ]}
            total={{ label: "Amount due", cents: totals.totalCents - totals.paidCents }}
            alwaysShowDecimals
          />
        </div>
      </div>
    </div>
  );
}
