import type { ReactNode } from "react";
import { formatCents } from "@shared/money";

/**
 * A sent purchase order, read as a document — the same treatment as an
 * approved bill (BillDocumentView): the details and lines as plain text.
 *
 * It replaced the draft form with every input disabled, which still drew
 * placeholders ("Pick a date", "Your reference"), empty cost-code pickers, GST
 * switches and drag handles — greyed out, but reading as a form you couldn't
 * use.
 *
 * Pure presentation: the page resolves every id to a label before it gets here.
 */

const labelCls = "doc-field-label";
const Dash = () => <span className="text-muted-foreground/60">—</span>;
const show = (v: ReactNode) => (v === null || v === undefined || v === "" ? <Dash /> : v);

export interface PODocumentField {
  label: string;
  value: ReactNode;
  testId?: string;
  /** Wide fields (description, address) span the row and keep their line breaks. */
  wide?: boolean;
}

export function PODocumentFields({ fields }: { fields: PODocumentField[] }) {
  return (
    <dl className="p-3.5 border-t border-border/60 grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-3" data-testid="po-document-fields">
      {fields.map((f) => (
        <div key={f.label} className={`min-w-0 space-y-0.5 ${f.wide ? "col-span-2 md:col-span-3" : ""}`}>
          <dt className={labelCls}>{f.label}</dt>
          <dd className={`doc-body ${f.wide ? "whitespace-pre-wrap break-words" : "truncate"}`} data-testid={f.testId}>
            {show(f.value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export interface PODocumentLine {
  key: string;
  description: string;
  quantity: number;
  unit?: string | null;
  unitPriceCents: number;
  totalCents: number;
  gstFree: boolean;
  costCode?: string | null;
}

export function PODocumentLines({ lines }: { lines: PODocumentLine[] }) {
  // Optional columns only appear when a line uses them.
  const showCostCode = lines.some((l) => l.costCode);
  const anyGstFree = lines.some((l) => l.gstFree);

  return (
    <div className="border-t border-border/60 overflow-x-auto" data-testid="po-document-lines">
      <table className="w-full text-body-sm">
        <thead>
          <tr className="border-b bg-muted/40">
            <th className="doc-col-label text-left px-3 py-2">Description</th>
            <th className="doc-col-label text-right px-3 py-2">Qty</th>
            <th className="doc-col-label text-right px-3 py-2">Unit price</th>
            {anyGstFree && <th className="doc-col-label text-left px-3 py-2">GST</th>}
            {showCostCode && <th className="doc-col-label text-left px-3 py-2">Cost code</th>}
            <th className="doc-col-label text-right px-3 py-2">Amount</th>
          </tr>
        </thead>
        <tbody>
          {lines.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-3 py-4 doc-body-muted">No lines on this purchase order.</td>
            </tr>
          ) : (
            lines.map((l) => (
              <tr key={l.key} className="border-b last:border-b-0 align-top" data-testid={`po-document-line-${l.key}`}>
                <td className="px-3 py-2 whitespace-pre-wrap">{l.description || <Dash />}</td>
                <td className="px-3 py-2 money">
                  {l.quantity}
                  {l.unit ? <span className="text-muted-foreground"> {l.unit}</span> : null}
                </td>
                <td className="px-3 py-2 money">{formatCents(l.unitPriceCents, { alwaysShowDecimals: true })}</td>
                {anyGstFree && <td className="px-3 py-2 text-muted-foreground">{l.gstFree ? "GST free" : "GST"}</td>}
                {showCostCode && <td className="px-3 py-2">{l.costCode || <Dash />}</td>}
                <td className="px-3 py-2 money-figure">{formatCents(l.totalCents, { alwaysShowDecimals: true })}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
