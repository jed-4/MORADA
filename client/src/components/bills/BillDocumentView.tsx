import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { MoneySummary } from "@/components/detail/MoneySummary";
import { formatCents } from "@shared/money";

/**
 * An approved bill, read as a document — the way Xero shows an Awaiting
 * Payment bill: who it's from, the dates and reference, the lines and the
 * totals, as plain text. Edit on the page swaps this back for the form.
 *
 * It replaced a `<fieldset disabled>` over the form, which still drew every
 * empty picker ("Select project…"), the Net 7/14/30 chips, "Add line" and a
 * delete button per row — greyed out, but reading as a form you couldn't use.
 *
 * Pure presentation: the page resolves every id to a label and every amount
 * to cents before it gets here.
 */

export interface BillDocumentField {
  label: string;
  value: ReactNode;
  testId?: string;
}

export interface BillDocumentLine {
  key: string;
  description: string;
  costCode?: string;
  quantity: number;
  unit?: string;
  /** As entered, in the bill's own tax mode. */
  unitPriceCents: number;
  tax: string;
  account?: string;
  allowance?: string;
  vehicle?: string;
  /** The line amount as entered (inc or ex GST per the bill's tax mode). */
  amountCents: number;
}

export interface BillDocumentViewProps {
  fields: BillDocumentField[];
  notes?: string | null;
  lines: BillDocumentLine[];
  taxMode: "inclusive" | "exclusive";
  totals: {
    subtotalCents: number;
    taxCents: number;
    roundingCents: number;
    totalCents: number;
    paidCents: number;
    dueCents: number;
  };
}

const Dash = () => <span className="text-muted-foreground/60">—</span>;

export function BillDocumentFields({ fields, notes }: Pick<BillDocumentViewProps, "fields" | "notes">) {
  return (
    <Card className="p-4" data-testid="bill-document-fields">
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
      {notes && notes.trim() && (
        <div className="mt-4 pt-3 border-t space-y-0.5">
          <div className="doc-field-label">Notes</div>
          <p className="doc-prose whitespace-pre-wrap" data-testid="text-bill-notes">{notes}</p>
        </div>
      )}
    </Card>
  );
}

export function BillDocumentLines({ lines, taxMode, totals }: Omit<BillDocumentViewProps, "fields" | "notes">) {
  // Optional columns only appear when a line uses them — most bills have no
  // allowance or vehicle, and an empty column of dashes is noise.
  const showCostCode = lines.some((l) => l.costCode);
  const showAccount = lines.some((l) => l.account);
  const showAllowance = lines.some((l) => l.allowance);
  const showVehicle = lines.some((l) => l.vehicle);
  const incl = taxMode === "inclusive";

  return (
    <Card className="p-0 overflow-hidden" data-testid="bill-document-lines">
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
        <h3 className="text-xs font-semibold">Cost Lines</h3>
        <span className="doc-caption" data-testid="text-tax-mode">
          Amounts are {incl ? "tax inclusive" : "tax exclusive"}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-body-sm">
          <thead>
            <tr className="border-b">
              <th className="doc-col-label text-left px-3 py-2">Description</th>
              {showCostCode && <th className="doc-col-label text-left px-3 py-2">Cost code</th>}
              <th className="doc-col-label text-right px-3 py-2">Qty</th>
              <th className="doc-col-label text-right px-3 py-2">Unit price</th>
              <th className="doc-col-label text-left px-3 py-2">Tax</th>
              {showAccount && <th className="doc-col-label text-left px-3 py-2">Account</th>}
              {showAllowance && <th className="doc-col-label text-left px-3 py-2">Allowance</th>}
              {showVehicle && <th className="doc-col-label text-left px-3 py-2">Vehicle</th>}
              <th className="doc-col-label text-right px-3 py-2">Amount</th>
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-4 doc-body-muted">No lines on this bill.</td>
              </tr>
            ) : (
              lines.map((l) => (
                <tr key={l.key} className="border-b last:border-b-0 align-top" data-testid={`bill-document-line-${l.key}`}>
                  <td className="px-3 py-2 whitespace-pre-wrap">{l.description || <Dash />}</td>
                  {showCostCode && <td className="px-3 py-2">{l.costCode || <Dash />}</td>}
                  <td className="px-3 py-2 money">
                    {l.quantity}
                    {l.unit && l.unit !== "Unit" ? <span className="text-muted-foreground"> {l.unit}</span> : null}
                  </td>
                  <td className="px-3 py-2 money">{formatCents(l.unitPriceCents, { alwaysShowDecimals: true })}</td>
                  <td className="px-3 py-2 text-muted-foreground">{l.tax === "GST on expenses" ? "GST" : "No GST"}</td>
                  {showAccount && <td className="px-3 py-2">{l.account || <Dash />}</td>}
                  {showAllowance && <td className="px-3 py-2">{l.allowance || <Dash />}</td>}
                  {showVehicle && <td className="px-3 py-2">{l.vehicle || <Dash />}</td>}
                  <td className="px-3 py-2 money-figure">{formatCents(l.amountCents, { alwaysShowDecimals: true })}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="border-t">
        <MoneySummary
          rows={[
            { label: "Subtotal", cents: totals.subtotalCents, testId: "text-subtotal" },
            { label: "GST", cents: totals.taxCents, testId: "text-tax" },
            { label: "Rounding", cents: totals.roundingCents, hidden: totals.roundingCents === 0, testId: "text-rounding" },
            { label: "Total", cents: totals.totalCents, tone: "strong", rule: true },
            { label: "Paid", cents: totals.paidCents, tone: totals.paidCents ? "normal" : "zero", testId: "text-paid" },
          ]}
          total={{ label: "Amount due", cents: totals.dueCents }}
          alwaysShowDecimals
        />
      </div>
    </Card>
  );
}
