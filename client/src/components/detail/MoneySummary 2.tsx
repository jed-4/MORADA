import type { ReactNode } from "react";
import { formatCents } from "@shared/money";
import { cn } from "@/lib/utils";

/**
 * The totals block for a document — variation, allowance, purchase order,
 * invoice, proposal. Five pages each drew their own; this is the one.
 *
 * Everything is CENTS in, formatted here through `formatCents` — the canonical
 * AUD formatter — so no caller hand-rolls a `/ 100` on the way to the screen.
 *
 * The label/figure pairs use the `.money-line` treatment from index.css: label
 * left, figure hard right, dotted leader across the gap, tabular numerals so
 * decimal points stack down the column.
 */

export type MoneyRowTone = "normal" | "strong" | "zero" | "negative";

export interface MoneyRow {
  label: string;
  /** Ex or inc GST is the caller's business — this only formats. */
  cents: number;
  tone?: MoneyRowTone;
  /** Hairline above the row, for the line that closes a group. */
  rule?: boolean;
  /**
   * Rendered between the label and the leader — the global-markup percentage
   * input lives here, so the control sits with the figure it drives.
   */
  adornment?: ReactNode;
  /** Hide the row entirely. Use for a component that genuinely does not apply. */
  hidden?: boolean;
  testId?: string;
}

const TONE_CLASS: Record<MoneyRowTone, string> = {
  normal: "money-figure",
  strong: "money-strong",
  zero: "money-zero",
  negative: "money-negative",
};

export interface MoneySummaryProps {
  rows: MoneyRow[];
  /** The one number the document exists to state. */
  total: { label: string; cents: number };
  className?: string;
  "data-testid"?: string;
}

export function MoneySummary({ rows, total, className, "data-testid": testId }: MoneySummaryProps) {
  const visible = rows.filter((r) => !r.hidden);

  return (
    <div
      className={cn("flex items-end gap-10 px-3.5 py-3.5", className)}
      data-testid={testId}
    >
      {/* The figure column is fixed and sits directly beside its label rather
          than pushed to the far edge — a label stranded from its own number by
          half a screen is harder to read, not easier. The total is the only
          figure that goes hard right. */}
      <div className="min-w-0 flex flex-col gap-0.5">
        {visible.map((row) => (
          <div
            key={row.label}
            className={cn("money-line", row.rule && "money-line-rule")}
            data-testid={row.testId}
          >
            <span className="money-line-label w-[132px]">{row.label}</span>
            {/* The adornment slot is reserved on every row, not only the rows
                that use one. Letting it size to its content pushed the markup
                row's figure out of the column the other figures sit in. */}
            <span className="w-[58px] flex items-baseline flex-shrink-0">{row.adornment}</span>
            <span className={cn(TONE_CLASS[row.tone ?? "normal"], "w-[104px]")}>
              {formatCents(row.cents)}
            </span>
          </div>
        ))}
      </div>
      <span className="flex-1" />

      <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
        <span className="doc-field-label">{total.label}</span>
        <span className="money-total" data-testid="text-total">
          {formatCents(total.cents)}
        </span>
      </div>
    </div>
  );
}

/**
 * The header strip: a row of labelled figures with the headline number pushed
 * to the right. Same grammar on every document page, so the eye lands in the
 * same place whatever you opened.
 */
export interface MoneyStripItem {
  label: string;
  /** Pre-formatted, because a strip also carries dates and counts. */
  value: string;
  /** Tint the value — for a variance that is over or under. */
  className?: string;
}

export function MoneyStrip({
  items,
  headline,
  className,
}: {
  items: MoneyStripItem[];
  headline?: { label: string; value: string; className?: string };
  className?: string;
}) {
  return (
    <div className={cn("flex items-end gap-9 px-3.5 py-2.5", className)}>
      {items.map((item) => (
        <div key={item.label} className="flex flex-col gap-0.5 min-w-0">
          <span className="doc-field-label truncate">{item.label}</span>
          <span className={cn("money text-body-lg font-semibold text-foreground", item.className)}>
            {item.value}
          </span>
        </div>
      ))}

      {headline && (
        <>
          <span className="flex-1" />
          <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
            <span className="doc-field-label">{headline.label}</span>
            <span className={cn("money-total", headline.className)}>{headline.value}</span>
          </div>
        </>
      )}
    </div>
  );
}
