import { cn } from "@/lib/utils";

export interface PageHeaderProps {
  /** Page title — rendered as the page's single <h1>. */
  title: string;
  /** Optional supporting copy under the title. */
  description?: string;
  /** Right-aligned slot for buttons/filters. */
  actions?: React.ReactNode;
  className?: string;
  "data-testid"?: string;
}

/**
 * Standard page header for full-page views (settings, docs, detail pages).
 * One title scale app-wide: text-2xl/semibold <h1> + muted description +
 * an actions slot. Replaces the per-page mix of text-sm/text-2xl/text-3xl
 * headers. Data-table list pages keep their compact toolbar pattern
 * (ListPageToolbar) — this is for everything else.
 */
export function PageHeader({ title, description, actions, className, ...rest }: PageHeaderProps) {
  return (
    <div
      className={cn("flex items-start justify-between gap-3 mb-4", className)}
      data-testid={rest["data-testid"] ?? "page-header"}
    >
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight truncate">{title}</h1>
        {description ? (
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}
