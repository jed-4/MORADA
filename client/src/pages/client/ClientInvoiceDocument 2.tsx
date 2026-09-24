import { format } from "date-fns";
import { Building2 } from "lucide-react";
import { formatCents } from "@shared/money";
import { invoiceStatus, type ClientInvoiceRow } from "./ClientInvoices";

/**
 * A progress claim as the document the client was sent — the same shape as
 * the variation the portal already renders: brand hero band, To / Project /
 * Document panel, the lines, then the totals.
 *
 * Built here rather than reused because the invoice's only existing renderer
 * is a @react-pdf document (components/invoices/pdf/InvoiceDocument.tsx),
 * which draws to a PDF and cannot be put on a page. The structure deliberately
 * mirrors VariationPreviewContent so the two read as one product; the headline
 * figure is BALANCE DUE, not the total, for the same reason the PDF does that
 * — on a part-paid claim those are different numbers and the balance is the
 * one the client needs.
 */

interface Line {
  key: string;
  label: string;
  description?: string | null;
  amountIncCents: number;
}

export interface ClientInvoiceView {
  invoice: ClientInvoiceRow & {
    introductionText?: string | null;
    closingText?: string | null;
    termsAndConditions?: string | null;
    subtotal?: number;
    gstAmount?: number;
    lineBreakdown?: Array<{ source: string; description: string; amountIncCents: number }> | null;
  };
  items: Array<{ id: string; name?: string | null; description: string; totalPrice: number }>;
  payments: Array<{ id: string; amount: number; paymentDate: string; paymentMethod?: string | null; reference?: string | null }>;
  project?: { name?: string | null; address?: string | null; clientName?: string | null; clientEmail?: string | null; clientPhone?: string | null };
  company?: { name?: string | null; abn?: string | null; phone?: string | null; email?: string | null; logo?: string | null; brandColor?: string | null };
}

const hexToRgba = (hex: string, alpha: number) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
};

export function ClientInvoiceDocument({ data }: { data: ClientInvoiceView }) {
  const { invoice, items, payments, project, company } = data;
  const primaryColor = company?.brandColor || "#87749A";
  const { label } = invoiceStatus(invoice);

  // The saved money snapshot is what the builder's own PDF prints; custom
  // lines are stored separately and append to it.
  const lines: Line[] = [
    ...(invoice.lineBreakdown ?? []).map((line, i) => ({
      key: `${line.source}-${i}`,
      label: line.description,
      amountIncCents: line.amountIncCents,
    })),
    ...items.map((item) => ({
      key: item.id,
      label: item.name || item.description,
      description: item.name ? item.description : null,
      amountIncCents: item.totalPrice,
    })),
  ];

  const balance = invoice.balanceAmount ?? invoice.totalAmount ?? 0;

  return (
    <div className="bg-white text-foreground font-sans" style={{ maxWidth: "900px", margin: "0 auto" }}>
      <div
        className="relative overflow-hidden"
        style={{
          background: `linear-gradient(135deg, ${primaryColor} 0%, ${hexToRgba(primaryColor, 0.7)} 100%)`,
          minHeight: "160px",
          padding: "28px 32px",
        }}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            {company?.logo ? (
              <img src={company.logo} alt={company.name ?? ""} className="h-14 w-14 rounded-lg object-contain bg-white/20 p-1" />
            ) : (
              <div className="h-14 w-14 rounded-lg bg-white/20 flex items-center justify-center">
                <Building2 className="w-7 h-7 text-white/80" />
              </div>
            )}
            <div>
              <p className="text-white font-bold text-xl leading-tight">{company?.name || "Morada"}</p>
              {company?.phone && <p className="text-white/80 text-sm mt-0.5">{company.phone}</p>}
              {company?.email && <p className="text-white/80 text-sm">{company.email}</p>}
              {company?.abn && <p className="text-white/60 text-xs mt-0.5">ABN {company.abn}</p>}
            </div>
          </div>

          <div className="text-right">
            <span className="inline-block px-2.5 py-1 rounded-full text-xs font-semibold mb-2 bg-white/20 text-white">
              {label}
            </span>
            <p className="text-white font-bold text-2xl">{formatCents(balance)}</p>
            <p className="text-white/70 text-sm">
              {balance > 0 ? "Balance due" : "Paid in full"}
              {invoice.invoiceNumber ? ` · ${invoice.invoiceNumber}` : ""}
            </p>
          </div>
        </div>
      </div>

      <div className="p-8 space-y-8">
        {invoice.name && <h1 className="text-xl font-bold leading-tight -mb-2">{invoice.name}</h1>}

        <div className="border border-border rounded-xl overflow-hidden">
          <div className="grid grid-cols-1 sm:grid-cols-3">
            <div className="p-4 sm:border-r border-border">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">To</p>
              <p className="text-sm font-semibold leading-snug">{project?.clientName || "—"}</p>
              {project?.clientEmail && <p className="text-xs text-muted-foreground mt-0.5">{project.clientEmail}</p>}
              {project?.clientPhone && <p className="text-xs text-muted-foreground mt-0.5">{project.clientPhone}</p>}
            </div>
            <div className="p-4 border-t sm:border-t-0 sm:border-r border-border">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Project</p>
              <p className="text-sm font-semibold leading-snug">{project?.name || "—"}</p>
              {project?.address && <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{project.address}</p>}
            </div>
            <div className="p-4 border-t sm:border-t-0 border-border">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Invoice</p>
              <dl className="space-y-1">
                {[
                  { label: "Issued", value: invoice.invoiceDate ? format(new Date(invoice.invoiceDate), "d MMMM yyyy") : null },
                  { label: "Due", value: invoice.dueDate ? format(new Date(invoice.dueDate), "d MMMM yyyy") : null },
                ]
                  .filter((row) => row.value)
                  .map((row) => (
                    <div key={row.label} className="flex justify-between gap-3 text-xs">
                      <dt className="text-muted-foreground">{row.label}</dt>
                      <dd className="font-medium">{row.value}</dd>
                    </div>
                  ))}
              </dl>
            </div>
          </div>
        </div>

        {invoice.introductionText && (
          <p className="text-sm whitespace-pre-wrap">{invoice.introductionText}</p>
        )}

        {lines.length > 0 && (
          <div>
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">This claim</h2>
            <div className="border border-border rounded-lg overflow-hidden">
              <div className="flex items-center gap-4 px-3 py-2 text-xs font-semibold text-white" style={{ backgroundColor: primaryColor }}>
                <span className="flex-1">Description</span>
                <span className="w-32 text-right">Amount inc GST</span>
              </div>
              {lines.map((line, idx) => (
                <div
                  key={line.key}
                  className="flex items-start gap-4 px-3 py-2 border-t border-border text-sm"
                  style={{ backgroundColor: idx % 2 === 1 ? "#f9fafb" : "#ffffff" }}
                >
                  <div className="flex-1 min-w-0">
                    <div>{line.label}</div>
                    {line.description && <div className="text-xs text-muted-foreground">{line.description}</div>}
                  </div>
                  <span className="w-32 text-right tabular-nums">{formatCents(line.amountIncCents)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end">
          <div className="w-full sm:w-80 border border-border rounded-lg p-4 space-y-1.5 text-sm">
            {invoice.subtotal != null && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal (ex. GST)</span>
                <span className="tabular-nums">{formatCents(invoice.subtotal)}</span>
              </div>
            )}
            {invoice.gstAmount != null && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">GST (10%)</span>
                <span className="tabular-nums">{formatCents(invoice.gstAmount)}</span>
              </div>
            )}
            <div className="flex justify-between pt-1.5 border-t border-border font-semibold">
              <span>Total (inc. GST)</span>
              <span className="tabular-nums">{formatCents(invoice.totalAmount ?? 0)}</span>
            </div>
            {!!invoice.paidAmount && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Paid</span>
                <span className="tabular-nums">−{formatCents(invoice.paidAmount)}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-bold" style={{ color: primaryColor }}>
              <span>Balance due</span>
              <span className="tabular-nums">{formatCents(balance)}</span>
            </div>
          </div>
        </div>

        {payments.length > 0 && (
          <div>
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Payments received</h2>
            <div className="border border-border rounded-lg overflow-hidden">
              {payments.map((payment, idx) => (
                <div
                  key={payment.id}
                  className="flex items-center justify-between gap-4 px-3 py-2 border-t first:border-t-0 border-border text-sm"
                  style={{ backgroundColor: idx % 2 === 1 ? "#f9fafb" : "#ffffff" }}
                >
                  <span className="text-muted-foreground">
                    {format(new Date(payment.paymentDate), "d MMM yyyy")}
                    {payment.paymentMethod ? ` · ${payment.paymentMethod}` : ""}
                    {payment.reference ? ` · ${payment.reference}` : ""}
                  </span>
                  <span className="tabular-nums">{formatCents(payment.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {invoice.closingText && <p className="text-sm whitespace-pre-wrap">{invoice.closingText}</p>}

        {invoice.termsAndConditions && (
          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground">Terms and conditions</summary>
            <p className="mt-2 whitespace-pre-wrap">{invoice.termsAndConditions}</p>
          </details>
        )}
      </div>

      <div className="border-t border-border py-3 text-center text-xs text-muted-foreground">Powered by Morada</div>
    </div>
  );
}
