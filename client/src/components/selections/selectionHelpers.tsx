// Shared helpers + small display components for the Selections list surfaces
// (list rows, gallery cards, quick-view drawer). Extracted from
// pages/Selections.tsx so the page owns data/orchestration only.

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Image as ImageIcon } from "lucide-react";
import { format, differenceInCalendarDays } from "date-fns";
import type { SelectionWithOptions, SelectionOption, OptionAttachment } from "@shared/schema";

export type DerivedStatus = "open" | "submitted" | "approved" | "overdue" | "ordered" | "received";

export const CATEGORY_DOT_COLOURS: Record<string, string> = {
  Tiles: "#7C5CBF",
  Cladding: "#B5813B",
  Flooring: "#4A7A9B",
  Lighting: "#9B7A4A",
  Appliances: "#5C7A5C",
  Fixtures: "#C46B5A",
  Joinery: "#8B6B4A",
  Plumbing: "#4A8B7A",
};

export function getCategoryColour(category?: string | null): string {
  if (!category) return "#94a3b8";
  return CATEGORY_DOT_COLOURS[category] ?? "#94a3b8";
}

export function getDerivedStatus(sel: SelectionWithOptions): DerivedStatus {
  if ((sel as any).status === "received") return "received";
  if ((sel as any).status === "ordered") return "ordered";
  if (sel.status === "approved" || sel.status === "completed") return "approved";
  const isPastDue = sel.deadline && new Date(sel.deadline).getTime() < Date.now();
  if (isPastDue) return "overdue";
  if (sel.options?.some((o) => o.isSelectedByClient)) return "submitted";
  return "open";
}

export function getSelectedOption(sel: SelectionWithOptions): SelectionOption | undefined {
  return sel.options?.find((o) => o.isSelectedByClient);
}

export function getActualCents(sel: SelectionWithOptions): number | null {
  const chosen = getSelectedOption(sel);
  return chosen?.totalCost ?? null;
}

export function formatMoneyCents(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "—";
  return `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export function formatVarianceCents(cents: number | null): { text: string; tone: "under" | "over" | "none" } {
  if (cents === null || cents === 0) return { text: cents === 0 ? "$0" : "—", tone: "none" };
  const sign = cents > 0 ? "+" : "−";
  return {
    text: `${sign}$${Math.abs(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
    tone: cents > 0 ? "over" : "under",
  };
}

// Relative deadline: "Overdue 3d" / "Due today" / "5d left" / date. Decided
// selections show "Done" — the date stops mattering once the choice is made.
export function getDeadlineMeta(deadline: Date | null | undefined, derived: DerivedStatus) {
  if (derived === "approved" || derived === "ordered" || derived === "received") {
    return { text: "Done", className: "text-muted-foreground/50" };
  }
  if (!deadline) return { text: "—", className: "text-muted-foreground/40" };
  const date = new Date(deadline);
  const days = differenceInCalendarDays(date, new Date());
  if (days < 0) return { text: `Overdue ${Math.abs(days)}d`, className: "font-semibold text-[hsl(var(--coral))]" };
  if (days === 0) return { text: "Due today", className: "font-semibold text-[hsl(var(--amber))]" };
  if (days <= 7) return { text: `${days}d left`, className: "font-semibold text-[hsl(var(--amber))]" };
  return { text: format(date, "dd MMM"), className: "text-muted-foreground" };
}

// A selection is "decided" once the client has chosen (or beyond)
export function isDecided(derived: DerivedStatus): boolean {
  return derived === "submitted" || derived === "approved" || derived === "ordered" || derived === "received";
}

export const STATUS_LABEL: Record<DerivedStatus, string> = {
  open: "Open",
  submitted: "Submitted",
  approved: "Approved",
  overdue: "Overdue",
  ordered: "Ordered",
  received: "Received",
};

// House pill standard: Badge's compact status-* variants (BuildPro
// table-restyle spec) rather than hand-rolled chips.
const STATUS_BADGE_VARIANT: Record<DerivedStatus, "status-action" | "status-warning" | "status-success" | "status-danger" | "status-info"> = {
  open: "status-action",
  submitted: "status-warning",
  approved: "status-success",
  overdue: "status-danger",
  ordered: "status-info",
  received: "status-success",
};

export function SelectionStatusPill({ derived, className }: { derived: DerivedStatus; className?: string }) {
  // rounded-[5px]: squarer corners than the stock pill radius (Jed's call)
  return (
    <Badge variant={STATUS_BADGE_VARIANT[derived]} className={cn("rounded-[5px]", className)}>
      {STATUS_LABEL[derived]}
    </Badge>
  );
}

export function firstImage(option: SelectionOption | undefined | null): OptionAttachment | undefined {
  return ((option as any)?.attachments as OptionAttachment[] | undefined)?.find(
    (a) => a.fileType?.toLowerCase() === "image",
  );
}

export function SelectionThumbnail({
  category,
  attachment,
  size = 32,
}: {
  category?: string | null;
  attachment?: OptionAttachment;
  size?: number;
}) {
  const colour = getCategoryColour(category);
  const isImage = attachment && attachment.fileType?.toLowerCase() === "image";
  return (
    <div
      className="rounded-md overflow-hidden flex items-center justify-center shrink-0"
      style={{ width: size, height: size, backgroundColor: `${colour}26` }}
    >
      {isImage && attachment?.filePath ? (
        <img
          src={attachment.filePath}
          alt=""
          className="w-full h-full object-cover"
          style={{ objectPosition: `${attachment.thumbnailX ?? 50}% ${attachment.thumbnailY ?? 50}%` }}
        />
      ) : (
        <ImageIcon className="text-muted-foreground/60" style={{ width: size * 0.4, height: size * 0.4 }} />
      )}
    </div>
  );
}

// Image stack for a row/card: the chosen option's photo, or up to three
// overlapping option thumbnails when nothing is chosen yet.
export function OptionThumbStack({ selection, size = 48 }: { selection: SelectionWithOptions; size?: number }) {
  const chosen = getSelectedOption(selection);
  const chosenImg = firstImage(chosen);
  if (chosenImg) {
    return <SelectionThumbnail category={selection.category} attachment={chosenImg} size={size} />;
  }
  const imgs = (selection.options ?? []).map((o) => firstImage(o)).filter(Boolean).slice(0, 3) as OptionAttachment[];
  if (imgs.length <= 1) {
    return (
      <SelectionThumbnail
        category={selection.category}
        attachment={imgs[0] ?? ((selection.options?.[0] as any)?.attachments as OptionAttachment[] | undefined)?.[0]}
        size={size}
      />
    );
  }
  const offset = Math.round(size * 0.28);
  return (
    <div className="relative shrink-0" style={{ width: size + offset * (imgs.length - 1), height: size }}>
      {imgs.map((att, i) => (
        <div
          key={att.id}
          className="absolute top-0 rounded-md overflow-hidden ring-2 ring-background"
          style={{ left: i * offset, zIndex: imgs.length - i, width: size, height: size }}
        >
          <img
            src={att.filePath}
            alt=""
            className="w-full h-full object-cover"
            style={{ objectPosition: `${att.thumbnailX ?? 50}% ${att.thumbnailY ?? 50}%` }}
          />
        </div>
      ))}
    </div>
  );
}

// Merged budget cell: actual over allowance + variance chip. The progress bar
// is opt-in (cards/drawer) — stacked bars in the list read as noise.
export function BudgetCell({
  selection,
  align = "right",
  bar = false,
}: {
  selection: SelectionWithOptions;
  align?: "right" | "left";
  bar?: boolean;
}) {
  const actual = getActualCents(selection);
  const allowance = selection.allowance ?? null;
  const variance = actual !== null && allowance !== null ? actual - allowance : null;
  const varianceMeta = formatVarianceCents(variance);
  const pct = actual !== null && allowance ? Math.min((actual / allowance) * 100, 100) : null;
  const over = variance !== null && variance > 0;

  if (actual === null && allowance === null) {
    return <div className={`text-[11px] text-muted-foreground/40 ${align === "right" ? "text-right" : ""}`}>—</div>;
  }
  return (
    <div className={`min-w-0 ${align === "right" ? "text-right" : ""}`}>
      <div className={`flex items-baseline gap-1.5 ${align === "right" ? "justify-end" : ""}`}>
        <span className="text-[12.5px] font-semibold tabular-nums text-foreground">{formatMoneyCents(actual)}</span>
        {allowance !== null && (
          <span className="text-[10px] tabular-nums text-muted-foreground/60">/ {formatMoneyCents(allowance)}</span>
        )}
        {varianceMeta.tone !== "none" && (
          <span
            className={`rounded-full px-1.5 py-px text-[9.5px] font-semibold tabular-nums ${
              varianceMeta.tone === "over"
                ? "bg-[hsl(var(--coral))]/15 text-[hsl(var(--coral))]"
                : "bg-[hsl(var(--sage))]/15 text-[hsl(var(--sage))]"
            }`}
          >
            {varianceMeta.text}
          </span>
        )}
      </div>
      {bar && pct !== null && (
        <div className="mt-1 h-[3px] rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full"
            style={{ width: `${pct}%`, backgroundColor: over ? "hsl(var(--coral))" : "hsl(var(--sage))" }}
          />
        </div>
      )}
    </div>
  );
}

// Decision pipeline: "7 of 12 decided" + segmented progress bar
export function ProgressStrip({ selections }: { selections: SelectionWithOptions[] }) {
  const total = selections.length;
  if (total === 0) return null;
  let decided = 0, open = 0, overdue = 0;
  for (const sel of selections) {
    const d = getDerivedStatus(sel);
    if (isDecided(d)) decided++;
    else if (d === "overdue") overdue++;
    else open++;
  }
  const seg = (n: number) => `${(n / total) * 100}%`;
  return (
    <div className="min-w-[180px]" data-testid="progress-strip">
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <span className="text-[11px] font-semibold text-foreground">
          {decided} of {total} decided
        </span>
        <span className="text-[9.5px] text-muted-foreground">
          {open > 0 && `${open} awaiting`}{open > 0 && overdue > 0 && " · "}
          {overdue > 0 && <span className="text-[hsl(var(--coral))] font-medium">{overdue} overdue</span>}
        </span>
      </div>
      <div className="flex h-1.5 rounded-full overflow-hidden bg-muted">
        {decided > 0 && <div style={{ width: seg(decided), backgroundColor: "hsl(var(--sage))" }} />}
        {open > 0 && <div style={{ width: seg(open), backgroundColor: "hsl(var(--primary) / 0.45)" }} />}
        {overdue > 0 && <div style={{ width: seg(overdue), backgroundColor: "hsl(var(--coral))" }} />}
      </div>
    </div>
  );
}
