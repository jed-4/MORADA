import React, { useState, useMemo, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useProject } from "@/contexts/ProjectContext";
import { useClientPortal } from "@/hooks/use-client-portal";
import { cn } from "@/lib/utils";
import { DndContext, closestCenter, DragEndEvent, useSensor, useSensors, PointerSensor } from "@dnd-kit/core";
import { arrayMove, SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  type Selection,
  type InsertSelection,
  type FieldCategoryWithOptions,
  type SelectionWithOptions,
  type SelectionOption,
  type OptionAttachment,
  type Contact,
  type SelectionTemplate,
} from "@shared/schema";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import {
  Package,
  Plus,
  Search,
  MoreVertical,
  Edit3,
  Trash2,
  CalendarIcon,
  Eye,
  ChevronRight,
  ChevronDown,
  ChevronsUpDown,
  Image as ImageIcon,
  Check,
  MessageSquare,
  Paperclip,
  X,
  ShoppingCart,
  ExternalLink,
  Loader2,
  HardHat,
  FileText,
  Copy,
  GripVertical,
  LayoutTemplate,
  Layers,
  ChevronLeft,
  BookCopy,
  CheckSquare,
  Filter,
  LayoutGrid,
  LayoutList,
  Send,
  Link as LinkIcon,
} from "lucide-react";
import { format, differenceInCalendarDays } from "date-fns";

// ───────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────

type DerivedStatus = "open" | "submitted" | "approved" | "overdue" | "ordered" | "received";

const CATEGORY_DOT_COLOURS: Record<string, string> = {
  Tiles: "#7C5CBF",
  Cladding: "#B5813B",
  Flooring: "#4A7A9B",
  Lighting: "#9B7A4A",
  Appliances: "#5C7A5C",
  Fixtures: "#C46B5A",
  Joinery: "#8B6B4A",
  Plumbing: "#4A8B7A",
};

function getCategoryColour(category?: string | null): string {
  if (!category) return "#94a3b8"; // neutral slate
  return CATEGORY_DOT_COLOURS[category] ?? "#94a3b8";
}

function getDerivedStatus(sel: SelectionWithOptions): DerivedStatus {
  if ((sel as any).status === "received") return "received";
  if ((sel as any).status === "ordered") return "ordered";
  if (sel.status === "approved" || sel.status === "completed") return "approved";
  const isPastDue = sel.deadline && new Date(sel.deadline).getTime() < Date.now();
  if (isPastDue) return "overdue";
  if (sel.options?.some((o) => o.isSelectedByClient)) return "submitted";
  return "open";
}

function getSelectedOption(sel: SelectionWithOptions): SelectionOption | undefined {
  return sel.options?.find((o) => o.isSelectedByClient);
}

function getActualCents(sel: SelectionWithOptions): number | null {
  const sel0 = getSelectedOption(sel);
  return sel0?.totalCost ?? null;
}

function formatMoneyCents(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "—";
  return `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function formatVarianceCents(cents: number | null): { text: string; tone: "under" | "over" | "none" } {
  if (cents === null || cents === 0) return { text: cents === 0 ? "$0" : "—", tone: "none" };
  const sign = cents > 0 ? "+" : "−";
  return {
    text: `${sign}$${Math.abs(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
    tone: cents > 0 ? "over" : "under",
  };
}

// Relative deadline: "Overdue 3d" / "Due today" / "5d left" / date. Decided
// selections show "Done" — the date stops mattering once the choice is made.
function getDeadlineMeta(deadline: Date | null | undefined, derived: DerivedStatus) {
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
function isDecided(derived: DerivedStatus): boolean {
  return derived === "submitted" || derived === "approved" || derived === "ordered" || derived === "received";
}

const STATUS_CHIP_CLASS: Record<DerivedStatus, string> = {
  open: "bg-primary/10 text-primary border-primary/30",
  submitted: "bg-[hsl(var(--amber-bg))] text-[hsl(var(--amber))] border-[hsl(var(--amber))]/30",
  approved: "bg-[hsl(var(--sage-bg))] text-[hsl(var(--sage))] border-[hsl(var(--sage))]/30",
  overdue: "bg-[hsl(var(--coral-bg))] text-[hsl(var(--coral))] border-[hsl(var(--coral))]/30",
  ordered: "bg-[#4a90d4]/10 text-[#4a90d4] border-[#4a90d4]/30",
  received: "bg-[#68b088]/10 text-[#68b088] border-[#68b088]/30",
};

const STATUS_LABEL: Record<DerivedStatus, string> = {
  open: "Open",
  submitted: "Submitted",
  approved: "Approved",
  overdue: "Overdue",
  ordered: "Ordered",
  received: "Received",
};

// ───────────────────────────────────────────────────────────────────────
// Sub-components
// ───────────────────────────────────────────────────────────────────────

interface SelectionThumbnailProps {
  category?: string | null;
  attachment?: OptionAttachment;
  size?: number;
}

function SelectionThumbnail({ category, attachment, size = 32 }: SelectionThumbnailProps) {
  const colour = getCategoryColour(category);
  const isImage = attachment && attachment.fileType?.toLowerCase() === "image";
  return (
    <div
      className="rounded-md overflow-hidden flex items-center justify-center shrink-0"
      style={{
        width: size,
        height: size,
        backgroundColor: `${colour}26`, // ~15% alpha
      }}
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

interface StatCardProps {
  value: number | string;
  label: string;
  variant: "default" | "primary" | "amber" | "sage" | "coral";
  active?: boolean;
  onClick?: () => void;
  testId?: string;
}

function StatCard({ value, label, variant, active = false, onClick, testId }: StatCardProps) {
  const variantClasses: Record<typeof variant, string> = {
    default: "bg-card border-border text-foreground",
    primary: "bg-primary/10 border-primary/30 text-primary",
    amber: "bg-[hsl(var(--amber-bg))] border-[hsl(var(--amber))]/30 text-[hsl(var(--amber))]",
    sage: "bg-[hsl(var(--sage-bg))] border-[hsl(var(--sage))]/30 text-[hsl(var(--sage))]",
    coral: "bg-[hsl(var(--coral-bg))] border-[hsl(var(--coral))]/30 text-[hsl(var(--coral))]",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className={`rounded-lg border px-3 py-2 w-[120px] text-left transition-shadow ${variantClasses[variant]} hover-elevate active-elevate-2 ${
        active ? "ring-2 ring-primary/40" : ""
      }`}
    >
      <div className="text-[17px] font-bold leading-tight tabular-nums">{value}</div>
      <div className="text-[9px] font-semibold uppercase tracking-wide opacity-90">{label}</div>
    </button>
  );
}

// Image stack for a row/card: the chosen option's photo, or up to three
// overlapping option thumbnails when nothing is chosen yet.
function OptionThumbStack({ selection, size = 48 }: { selection: SelectionWithOptions; size?: number }) {
  const chosen = getSelectedOption(selection);
  const chosenImg = ((chosen as any)?.attachments as OptionAttachment[] | undefined)?.find((a) => a.fileType?.toLowerCase() === "image");
  if (chosenImg) {
    return <SelectionThumbnail category={selection.category} attachment={chosenImg} size={size} />;
  }
  const imgs = (selection.options ?? [])
    .map((o) => ((o as any).attachments as OptionAttachment[] | undefined)?.find((a) => a.fileType?.toLowerCase() === "image"))
    .filter(Boolean)
    .slice(0, 3) as OptionAttachment[];
  if (imgs.length <= 1) {
    return <SelectionThumbnail category={selection.category} attachment={imgs[0] ?? ((selection.options?.[0] as any)?.attachments as OptionAttachment[] | undefined)?.[0]} size={size} />;
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

// Merged budget cell: actual over allowance, variance chip, thin progress bar
function BudgetCell({ selection, align = "right" }: { selection: SelectionWithOptions; align?: "right" | "left" }) {
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
      {pct !== null && (
        <div className="mt-1 h-[3px] rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full"
            style={{
              width: `${pct}%`,
              backgroundColor: over ? "hsl(var(--coral))" : "hsl(var(--sage))",
            }}
          />
        </div>
      )}
    </div>
  );
}

// Decision pipeline: "7 of 12 decided" + segmented progress bar
function ProgressStrip({ selections }: { selections: SelectionWithOptions[] }) {
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

interface SelectionRowProps {
  selection: SelectionWithOptions;
  gridTemplate: string;
  onOpenDrawer: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  isChecked: boolean;
  onCheck: (id: string, checked: boolean) => void;
  projectId: string;
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
  isDraggable?: boolean;
}

function SelectionRow({
  selection,
  gridTemplate,
  onOpenDrawer,
  onEdit,
  onDelete,
  onDuplicate,
  isChecked,
  onCheck,
  projectId,
  dragHandleProps,
  isDraggable = false,
}: SelectionRowProps) {
  const derived = getDerivedStatus(selection);
  const selectedOption = getSelectedOption(selection);
  const deadlineMeta = getDeadlineMeta(selection.deadline, derived);
  const purchaseOrderId = (selection as any).purchaseOrderId ?? null;
  const optionCount = selection.options?.length ?? 0;

  return (
    <div
      className={`group grid gap-3 items-center h-16 px-3 border-b border-border/70 cursor-pointer transition-colors ${
        isChecked ? "bg-primary/5" : "hover:bg-muted/40"
      }`}
      style={{ gridTemplateColumns: gridTemplate }}
      onClick={() => onOpenDrawer(selection.id)}
      data-testid={`row-selection-${selection.id}`}
    >
      {/* Drag handle */}
      <div
        className={`flex items-center justify-center flex-shrink-0 ${isDraggable ? "cursor-grab opacity-0 group-hover:opacity-100" : "opacity-0 pointer-events-none"}`}
        onClick={(e) => e.stopPropagation()}
        {...(isDraggable ? dragHandleProps : {})}
      >
        <GripVertical className="w-3.5 h-3.5 text-muted-foreground" />
      </div>

      {/* Image-led thumbnail */}
      <div className="flex items-center overflow-hidden">
        <OptionThumbStack selection={selection} size={48} />
      </div>

      {/* Name + meta (chosen option / options ready, category dot, room) */}
      <div className="min-w-0">
        <a
          href={`/selections/${selection.id}`}
          onClick={(e) => { e.stopPropagation(); e.preventDefault(); onEdit(selection.id); }}
          className="text-[13px] font-medium text-foreground truncate hover:underline block leading-tight"
          data-testid={`text-name-${selection.id}`}
        >
          {selection.name}
        </a>
        <div className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-muted-foreground truncate">
          {selection.category && (
            <span className="inline-flex items-center gap-1 shrink-0">
              <span
                className="rounded-full"
                style={{ width: 6, height: 6, backgroundColor: getCategoryColour(selection.category) }}
              />
              {selection.category}
            </span>
          )}
          {selection.category && selection.room && <span className="text-muted-foreground/40">·</span>}
          {selection.room && <span className="shrink-0">{selection.room}</span>}
          {(selection.category || selection.room) && (selectedOption || optionCount > 0) && (
            <span className="text-muted-foreground/40">·</span>
          )}
          {selectedOption ? (
            <span className="truncate text-muted-foreground/70">{selectedOption.name}</span>
          ) : optionCount > 0 ? (
            <span className="truncate text-muted-foreground/70">
              {optionCount} option{optionCount === 1 ? "" : "s"} ready
            </span>
          ) : null}
        </div>
      </div>

      {/* Status pill (+ PO link when ordered) */}
      <div className="min-w-0 flex items-center gap-1.5">
        <span
          className={`inline-block rounded-full px-2.5 py-1 text-[10px] font-semibold border ${STATUS_CHIP_CLASS[derived]}`}
          data-testid={`badge-status-${selection.id}`}
        >
          {STATUS_LABEL[derived]}
        </span>
        {purchaseOrderId && (
          <a
            href={`/projects/${projectId}/purchase-orders/${purchaseOrderId}`}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-0.5 text-[10px] font-medium text-[#4a90d4] hover:underline shrink-0"
            data-testid={`chip-po-${selection.id}`}
          >
            <ExternalLink className="w-3 h-3" />
            PO
          </a>
        )}
      </div>

      {/* Merged budget cell */}
      <BudgetCell selection={selection} />

      {/* Relative deadline */}
      <div className={`text-[11px] truncate text-right ${deadlineMeta.className}`}>{deadlineMeta.text}</div>

      {/* Actions — sticky right per the app table standard */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex items-center justify-center sticky right-0 h-full bg-gradient-to-l from-background via-background/95 to-transparent"
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="h-6 w-6 rounded-md hover-elevate active-elevate-2 flex items-center justify-center text-muted-foreground hover:text-foreground"
              data-testid={`button-actions-${selection.id}`}
            >
              <MoreVertical className="h-3 w-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onOpenDrawer(selection.id)}>
              <Eye className="w-4 h-4 mr-2" />
              Quick View
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onEdit(selection.id)}>
              <Edit3 className="w-4 h-4 mr-2" />
              Open
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onDuplicate(selection.id)} data-testid={`button-duplicate-${selection.id}`}>
              <Copy className="w-4 h-4 mr-2" />
              Duplicate
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onDelete(selection.id)} className="text-destructive">
              <Trash2 className="w-4 h-4 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

// Gallery card for the Cards view — image mosaic, status, budget
function SelectionCard({
  selection,
  onOpenDrawer,
  onEdit,
  onDelete,
  onDuplicate,
  projectId,
}: {
  selection: SelectionWithOptions;
  onOpenDrawer: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  projectId: string;
}) {
  const derived = getDerivedStatus(selection);
  const deadlineMeta = getDeadlineMeta(selection.deadline, derived);
  const chosen = getSelectedOption(selection);
  const optionCount = selection.options?.length ?? 0;
  const images = (chosen
    ? [((chosen as any).attachments as OptionAttachment[] | undefined)?.find((a) => a.fileType?.toLowerCase() === "image")]
    : (selection.options ?? []).map((o) => ((o as any).attachments as OptionAttachment[] | undefined)?.find((a) => a.fileType?.toLowerCase() === "image"))
  ).filter(Boolean).slice(0, 3) as OptionAttachment[];

  return (
    <div
      className="group bg-card rounded-xl border border-border/80 overflow-hidden cursor-pointer hover-elevate transition-shadow"
      onClick={() => onOpenDrawer(selection.id)}
      data-testid={`card-selection-${selection.id}`}
    >
      {/* Image mosaic */}
      <div className="relative h-36 bg-muted/60 overflow-hidden">
        {images.length === 0 ? (
          <div
            className="w-full h-full flex items-center justify-center"
            style={{ backgroundColor: `${getCategoryColour(selection.category)}1f` }}
          >
            <ImageIcon className="w-8 h-8 text-muted-foreground/30" />
          </div>
        ) : images.length === 1 ? (
          <img
            src={images[0].filePath}
            alt=""
            className="w-full h-full object-cover"
            style={{ objectPosition: `${images[0].thumbnailX ?? 50}% ${images[0].thumbnailY ?? 50}%` }}
            loading="lazy"
          />
        ) : (
          <div className="grid grid-cols-3 gap-px h-full">
            {images.map((att, i) => (
              <img
                key={att.id}
                src={att.filePath}
                alt=""
                className={cn("w-full h-full object-cover", i === 0 && images.length === 2 && "col-span-2")}
                style={{ objectPosition: `${att.thumbnailX ?? 50}% ${att.thumbnailY ?? 50}%` }}
                loading="lazy"
              />
            ))}
          </div>
        )}
        <span
          className={`absolute top-2 left-2 rounded-full px-2 py-0.5 text-[9.5px] font-semibold border backdrop-blur-sm ${STATUS_CHIP_CLASS[derived]}`}
        >
          {STATUS_LABEL[derived]}
        </span>
        {optionCount > 0 && !chosen && (
          <span className="absolute bottom-2 right-2 rounded-full bg-black/55 text-white text-[9.5px] px-2 py-0.5">
            {optionCount} option{optionCount === 1 ? "" : "s"}
          </span>
        )}
        {/* Hover actions */}
        <div
          className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => e.stopPropagation()}
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="h-6 w-6 rounded-md bg-black/45 text-white flex items-center justify-center">
                <MoreVertical className="h-3 w-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit(selection.id)}>
                <Edit3 className="w-4 h-4 mr-2" /> Open
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onDuplicate(selection.id)}>
                <Copy className="w-4 h-4 mr-2" /> Duplicate
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onDelete(selection.id)} className="text-destructive">
                <Trash2 className="w-4 h-4 mr-2" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Body */}
      <div className="p-3">
        <div className="text-[12.5px] font-medium leading-snug truncate">{selection.name}</div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground truncate">
          {selection.category && (
            <span className="inline-flex items-center gap-1">
              <span className="rounded-full" style={{ width: 5, height: 5, backgroundColor: getCategoryColour(selection.category) }} />
              {selection.category}
            </span>
          )}
          {selection.category && selection.room && <span className="text-muted-foreground/40">·</span>}
          {selection.room && <span>{selection.room}</span>}
          <span className={cn("ml-auto shrink-0", deadlineMeta.className)}>{deadlineMeta.text}</span>
        </div>
        <div className="mt-2">
          <BudgetCell selection={selection} align="left" />
        </div>
      </div>
    </div>
  );
}

// Quick-view drawer: options gallery, budget, actions, comments — without
// leaving the list. Replaces the old inline expand panel (whose Comment and
// Attach buttons were dead).
function SelectionDrawer({
  selection,
  open,
  onClose,
  onEdit,
  onSelectOption,
  selectPending,
  projectId,
}: {
  selection: SelectionWithOptions | null;
  open: boolean;
  onClose: () => void;
  onEdit: (id: string) => void;
  onSelectOption: (selectionId: string, optionId: string) => void;
  selectPending: boolean;
  projectId: string;
}) {
  const { toast } = useToast();
  const [commentText, setCommentText] = useState("");
  const [sendOpen, setSendOpen] = useState(false);
  const [sendTo, setSendTo] = useState("");
  const [linkCopied, setLinkCopied] = useState(false);
  const selId = selection?.id;

  const { data: comments = [] } = useQuery<any[]>({
    queryKey: ["/api/selections", selId, "comments"],
    queryFn: () => apiRequest(`/api/selections/${selId}/comments`, "GET"),
    enabled: open && !!selId,
  });

  const postCommentMutation = useMutation({
    mutationFn: async () => apiRequest(`/api/selections/${selId}/comments`, "POST", { content: commentText.trim() }),
    onSuccess: () => {
      setCommentText("");
      queryClient.invalidateQueries({ queryKey: ["/api/selections", selId, "comments"] });
    },
  });

  const sendPortalMutation = useMutation({
    mutationFn: async () => apiRequest(`/api/selections/${selId}/send-portal`, "POST", { to: sendTo.trim() }),
    onSuccess: () => {
      setSendOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/selections/with-options"] });
      toast({ title: "Sent to client", description: `Portal link emailed to ${sendTo.trim()}.` });
    },
    onError: (err: any) => {
      toast({ title: "Send failed", description: err?.message?.replace(/^\d+:\s*/, "") ?? "Failed to send.", variant: "destructive" });
    },
  });

  const copyPortalLink = async () => {
    if (!selection) return;
    let token = (selection as any).portalToken;
    if (!token) {
      const fresh: any = await apiRequest(`/api/selections/${selection.id}`, "GET");
      token = fresh?.portalToken;
    }
    if (!token) return;
    navigator.clipboard.writeText(`${window.location.origin}/portal/selections/${token}`).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    });
  };

  if (!selection) return null;
  const derived = getDerivedStatus(selection);
  const chosen = getSelectedOption(selection);
  const isLockedForChange = derived === "ordered" || derived === "received";

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) { onClose(); setSendOpen(false); setSendTo(""); } }}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto p-0">
        <SheetHeader className="px-4 pt-4 pb-3 border-b border-border sticky top-0 bg-background z-10">
          <div className="flex items-start justify-between gap-2 pr-6">
            <div className="min-w-0">
              <SheetTitle className="text-[15px] leading-snug truncate">{selection.name}</SheetTitle>
              <div className="mt-1 flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
                <span className={`rounded-full px-2 py-0.5 font-semibold border text-[9.5px] ${STATUS_CHIP_CLASS[derived]}`}>
                  {STATUS_LABEL[derived]}
                </span>
                {[selection.category, selection.room].filter(Boolean).join(" · ")}
              </div>
            </div>
            <Button size="sm" variant="outline" className="h-7 text-xs shrink-0" onClick={() => onEdit(selection.id)}>
              Open
            </Button>
          </div>
          {/* Quick actions */}
          <div className="flex items-center gap-1.5 pt-2">
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setSendOpen((v) => !v)} data-testid="drawer-send-client">
              <Send className="w-3 h-3 mr-1" /> Send to client
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={copyPortalLink}>
              <LinkIcon className="w-3 h-3 mr-1" /> {linkCopied ? "Copied!" : "Copy link"}
            </Button>
            <Button
              size="sm" variant="outline" className="h-7 text-xs"
              onClick={() => window.open(`/api/selections/${selection.id}/pdf`, "_blank")}
            >
              <FileText className="w-3 h-3 mr-1" /> PDF
            </Button>
          </div>
          {sendOpen && (
            <form
              className="flex items-center gap-1.5 pt-1"
              onSubmit={(e) => { e.preventDefault(); if (sendTo.trim()) sendPortalMutation.mutate(); }}
            >
              <Input
                type="email"
                autoFocus
                required
                placeholder="client@example.com"
                value={sendTo}
                onChange={(e) => setSendTo(e.target.value)}
                className="h-7 text-xs"
              />
              <Button type="submit" size="sm" className="h-7 text-xs shrink-0" disabled={!sendTo.trim() || sendPortalMutation.isPending}>
                {sendPortalMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Send"}
              </Button>
            </form>
          )}
        </SheetHeader>

        <div className="px-4 py-3 space-y-4">
          {/* Budget */}
          <BudgetCell selection={selection} align="left" />

          {/* Options gallery */}
          <div className="space-y-1.5">
            <div className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">
              Options ({selection.options?.length ?? 0})
            </div>
            {(selection.options ?? []).map((o) => {
              const img = ((o as any).attachments as OptionAttachment[] | undefined)?.find((a) => a.fileType?.toLowerCase() === "image");
              const isChosen = o.isSelectedByClient;
              const isApproved = !!o.approvedAt;
              return (
                <div
                  key={o.id}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg border p-2",
                    isChosen ? "border-[hsl(var(--sage))]/60 bg-[hsl(var(--sage))]/5" : "border-border/70",
                  )}
                >
                  <SelectionThumbnail category={selection.category} attachment={img} size={40} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[11.5px] font-medium truncate">{o.name}</div>
                    <div className="text-[10px] text-muted-foreground truncate">
                      {[o.brand, o.totalCost != null ? formatMoneyCents(o.totalCost) : null].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  {isApproved ? (
                    <span className="text-[9.5px] font-semibold text-[hsl(var(--sage))] shrink-0">Approved</span>
                  ) : isChosen ? (
                    <span className="text-[9.5px] font-semibold text-primary shrink-0">Selected</span>
                  ) : !isLockedForChange ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 text-[10px] shrink-0"
                      disabled={selectPending}
                      onClick={() => onSelectOption(selection.id, o.id)}
                    >
                      Select
                    </Button>
                  ) : null}
                </div>
              );
            })}
            {(selection.options ?? []).length === 0 && (
              <div className="text-[11px] text-muted-foreground border border-dashed rounded-lg p-3 text-center">
                No options yet — open the selection to add products.
              </div>
            )}
          </div>

          {/* Comments */}
          <div className="space-y-1.5">
            <div className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">
              Comments ({comments.length})
            </div>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {comments.map((c: any) => (
                <div key={c.id} className="rounded-lg bg-muted/50 px-2.5 py-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-semibold">{c.isClientComment ? `${c.createdByName} (client)` : c.createdByName}</span>
                    <span className="text-[9px] text-muted-foreground">{format(new Date(c.createdAt), "d MMM, h:mm a")}</span>
                  </div>
                  <div className="text-[11px] whitespace-pre-wrap">{c.content}</div>
                </div>
              ))}
            </div>
            <form
              className="flex items-end gap-1.5"
              onSubmit={(e) => { e.preventDefault(); if (commentText.trim()) postCommentMutation.mutate(); }}
            >
              <Textarea
                placeholder="Write a comment…"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                className="min-h-[52px] text-xs resize-none"
              />
              <Button type="submit" size="icon" className="h-8 w-8 shrink-0" disabled={!commentText.trim() || postCommentMutation.isPending}>
                {postCommentMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              </Button>
            </form>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function SortableSelectionRow(props: SelectionRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: props.selection.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: "relative",
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <SelectionRow {...props} dragHandleProps={{ ...attributes, ...listeners }} />
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────
// Main page
// ───────────────────────────────────────────────────────────────────────

export default function Selections() {
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [statusTab, setStatusTab] = useState<"all" | DerivedStatus>("all");
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [showCreatePOModal, setShowCreatePOModal] = useState(false);
  const [createPOSupplierId, setCreatePOSupplierId] = useState<string>("");
  const [orderedIds, setOrderedIds] = useState<string[]>([]);
  const [showTemplatePanel, setShowTemplatePanel] = useState<boolean>(() => {
    return localStorage.getItem("selections-template-panel") === "true";
  });
  const [groupBy, setGroupBy] = useState<"none" | "category" | "location">(() => {
    return (localStorage.getItem("selections-group-by") as "none" | "category" | "location") || "none";
  });
  // List/Cards toggle — persisted like the detail page's grid/table toggle
  const [viewMode, setViewMode] = useState<"list" | "cards">(() => {
    return (localStorage.getItem("selections-view-mode") as "list" | "cards") || "list";
  });
  useEffect(() => {
    localStorage.setItem("selections-view-mode", viewMode);
  }, [viewMode]);
  // Quick-view drawer (replaces the old inline expand panel)
  const [drawerId, setDrawerId] = useState<string | null>(null);
  // Saved column widths per the app table standard (status/budget/deadline are
  // resizable via the header dividers; name is the filler column)
  const [columnWidths, setColumnWidths] = useState<{ status: number; budget: number; deadline: number }>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("selections-column-widths") || "null");
      if (stored && typeof stored.status === "number") return stored;
    } catch { /* corrupted — fall through to defaults */ }
    return { status: 130, budget: 210, deadline: 90 };
  });
  useEffect(() => {
    localStorage.setItem("selections-column-widths", JSON.stringify(columnWidths));
  }, [columnWidths]);
  const gridTemplate = `16px 64px minmax(200px,1fr) ${columnWidths.status}px ${columnWidths.budget}px ${columnWidths.deadline}px 36px`;

  const resizeRef = useRef<{ key: "status" | "budget" | "deadline"; startX: number; startW: number } | null>(null);
  const startColumnResize = (key: "status" | "budget" | "deadline") => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizeRef.current = { key, startX: e.clientX, startW: columnWidths[key] };
    const onMove = (ev: MouseEvent) => {
      const r = resizeRef.current;
      if (!r) return;
      const next = Math.max(70, Math.min(360, r.startW + (ev.clientX - r.startX)));
      setColumnWidths((prev) => ({ ...prev, [r.key]: next }));
    };
    const onUp = () => {
      resizeRef.current = null;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };
  const [expandedTemplateIds, setExpandedTemplateIds] = useState<Set<string>>(new Set());
  const [expandedGroupIds, setExpandedGroupIds] = useState<Set<string>>(new Set());
  const [templateSearch, setTemplateSearch] = useState("");
  const [showSaveTemplateDialog, setShowSaveTemplateDialog] = useState(false);
  const [saveTemplateName, setSaveTemplateName] = useState("");
  const [saveTemplateCategory, setSaveTemplateCategory] = useState("");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { currentProject } = useProject();
  const { isClient } = useClientPortal();

  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const [showSummaryCards, setShowSummaryCards] = useState<boolean>(() => {
    const stored = localStorage.getItem("selections-cards-visible");
    return stored === null ? true : stored === "true";
  });
  useEffect(() => {
    localStorage.setItem("selections-cards-visible", String(showSummaryCards));
  }, [showSummaryCards]);

  useEffect(() => {
    localStorage.setItem("selections-template-panel", String(showTemplatePanel));
  }, [showTemplatePanel]);

  useEffect(() => {
    localStorage.setItem("selections-group-by", groupBy);
  }, [groupBy]);

  const [searchExpanded, setSearchExpanded] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchWrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (searchExpanded) {
      searchInputRef.current?.focus();
    }
  }, [searchExpanded]);
  useEffect(() => {
    if (!searchExpanded) return;
    const onClick = (e: MouseEvent) => {
      if (
        searchWrapRef.current &&
        !searchWrapRef.current.contains(e.target as Node) &&
        !searchTerm
      ) {
        setSearchExpanded(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [searchExpanded, searchTerm]);

  const projectId = currentProject?.id;

  // Fetch selections WITH options & attachments in a single call
  const { data: selectionsWithOptions = [], isLoading } = useQuery<SelectionWithOptions[]>({
    queryKey: ["/api/selections/with-options", projectId],
    queryFn: () => apiRequest(`/api/selections/with-options?projectId=${projectId}`, "GET"),
    enabled: !!projectId,
  });

  // Sync orderedIds from server data (preserve local order if already set for same IDs)
  useEffect(() => {
    const incoming = selectionsWithOptions.map((s) => s.id);
    setOrderedIds((prev) => {
      // Both empty — data not yet loaded. Return prev (same ref) so we don't trigger a re-render.
      if (incoming.length === 0 && prev.length === 0) return prev;
      if (prev.length === 0) return incoming;
      const prevSet = new Set(prev);
      const incomingSet = new Set(incoming);
      const same = incoming.every((id) => prevSet.has(id)) && prev.every((id) => incomingSet.has(id));
      if (same) return prev; // preserve local drag order
      // IDs changed (add/delete) — rebuild: keep existing order, add new at end, remove gone
      const kept = prev.filter((id) => incomingSet.has(id));
      const added = incoming.filter((id) => !prevSet.has(id));
      return [...kept, ...added];
    });
  }, [selectionsWithOptions]);

  const batchSortMutation = useMutation({
    mutationFn: (updates: { id: string; sortOrder: number }[]) =>
      apiRequest("/api/selections/batch-sort", "POST", { updates }),
    onError: () => {
      toast({ title: "Failed to save order", variant: "destructive" });
      // Revert to server order
      setOrderedIds(selectionsWithOptions.map((s) => s.id));
    },
  });

  const isDraggable = !searchTerm && !categoryFilter && statusTab === "all";

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setOrderedIds((prev) => {
      const oldIndex = prev.indexOf(active.id as string);
      const newIndex = prev.indexOf(over.id as string);
      const next = arrayMove(prev, oldIndex, newIndex);
      batchSortMutation.mutate(next.map((id, idx) => ({ id, sortOrder: idx })));
      return next;
    });
  };

  // Fetch selection categories for filter
  const { data: selectionCategories } = useQuery<FieldCategoryWithOptions>({
    queryKey: ["/api/field-categories/by-key/selection.category"],
  });

  // Fetch selection templates for the template panel
  const { data: selectionTemplates = [] } = useQuery<SelectionTemplate[]>({
    queryKey: ["/api/selection-templates"],
    queryFn: () => apiRequest("/api/selection-templates", "GET"),
  });

  // Fetch contacts for supplier picker in Create PO modal
  const { data: contacts = [] } = useQuery<Contact[]>({
    queryKey: ["/api/contacts"],
    queryFn: () => apiRequest(`/api/contacts?projectId=${projectId}`, "GET"),
    enabled: !!projectId,
  });
  const supplierContacts = useMemo(
    () => contacts.filter((c) => c.contactType === "supplier" || c.contactType === "subcontractor"),
    [contacts],
  );

  // Mutations
  const createSelectionMutation = useMutation({
    mutationFn: async (selection: InsertSelection) => {
      return await apiRequest("/api/selections", "POST", selection);
    },
    onSuccess: (newSelection: Selection) => {
      queryClient.invalidateQueries({ queryKey: ["/api/selections/with-options", projectId] });
      toast({ title: "Selection created" });
      setLocation(`/selections/${newSelection.id}`);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create selection.", variant: "destructive" });
    },
  });

  const deleteSelectionMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest(`/api/selections/${id}`, "DELETE");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/selections/with-options", projectId] });
      toast({ title: "Selection deleted" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete selection.", variant: "destructive" });
    },
  });

  const duplicateSelectionMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/selections/${id}/duplicate`, "POST");
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/selections/with-options", projectId] });
      toast({ title: "Selection duplicated", description: `"${data.selection.name}" has been created.` });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to duplicate selection.", variant: "destructive" });
    },
  });

  const selectOptionMutation = useMutation({
    mutationFn: async ({ selectionId, optionId }: { selectionId: string; optionId: string }) => {
      const sel = selectionsWithOptions.find((s) => s.id === selectionId);
      if (!sel) throw new Error("Selection not found");

      // Clear any previously selected option(s)
      const previouslySelected = sel.options.filter((o) => o.isSelectedByClient && o.id !== optionId);
      await Promise.all(
        previouslySelected.map((o) =>
          apiRequest(`/api/selection-options/${o.id}`, "PATCH", { isSelectedByClient: false }),
        ),
      );

      // Set the chosen one
      await apiRequest(`/api/selection-options/${optionId}`, "PATCH", { isSelectedByClient: true });

      // Bump status from draft → pending so it shows as Submitted
      if (sel.status === "draft") {
        await apiRequest(`/api/selections/${selectionId}`, "PATCH", { status: "pending" });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/selections/with-options", projectId] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update selection.", variant: "destructive" });
    },
  });

  // Computed stats (across the unfiltered set so they're stable)
  const stats = useMemo(() => {
    let open = 0, submitted = 0, approved = 0, overdue = 0, ordered = 0;
    let totalAllowance = 0, totalActual = 0, pendingAmount = 0;
    let openCount = 0;
    selectionsWithOptions.forEach((sel) => {
      const d = getDerivedStatus(sel);
      if (d === "open") { open++; openCount++; }
      if (d === "submitted") submitted++;
      if (d === "approved") approved++;
      if (d === "overdue") overdue++;
      if (d === "ordered" || d === "received") ordered++;
      if (sel.allowance) totalAllowance += sel.allowance;
      const a = getActualCents(sel);
      if (a !== null) totalActual += a;
      if (d === "open" && sel.allowance) pendingAmount += sel.allowance;
    });
    return {
      total: selectionsWithOptions.length,
      open,
      submitted,
      approved,
      overdue,
      ordered,
      totalAllowance,
      totalActual,
      variance: totalActual - totalAllowance,
      pendingAmount,
      openCount,
    };
  }, [selectionsWithOptions]);

  // Filtered list — ordered by orderedIds (drag order), then filtered
  const filtered = useMemo(() => {
    const idToSel = new Map(selectionsWithOptions.map((s) => [s.id, s]));
    const ordered = orderedIds.length > 0
      ? orderedIds.map((id) => idToSel.get(id)).filter(Boolean) as typeof selectionsWithOptions
      : selectionsWithOptions;
    return ordered.filter((sel) => {
      const d = getDerivedStatus(sel);
      // "ordered" tab shows both ordered + received
      if (statusTab === "ordered") {
        if (d !== "ordered" && d !== "received") return false;
      } else if (statusTab !== "all" && statusTab !== d) {
        return false;
      }
      if (categoryFilter && sel.category !== categoryFilter) return false;
      if (searchTerm) {
        const t = searchTerm.toLowerCase();
        if (
          !sel.name.toLowerCase().includes(t) &&
          !(sel.category?.toLowerCase().includes(t)) &&
          !(sel.room?.toLowerCase().includes(t))
        ) {
          return false;
        }
      }
      return true;
    });
  }, [selectionsWithOptions, orderedIds, statusTab, categoryFilter, searchTerm]);

  // Approved spend
  const approvedSpend = useMemo(() => {
    return selectionsWithOptions.reduce((sum, sel) => {
      const d = getDerivedStatus(sel);
      if (d === "approved") {
        const a = getActualCents(sel);
        if (a !== null) return sum + a;
      }
      return sum;
    }, 0);
  }, [selectionsWithOptions]);

  // Handlers
  const handleAddSelection = () => {
    if (!projectId) return;
    createSelectionMutation.mutate({
      projectId,
      name: "New Selection",
      description: "",
      category: "",
      room: "",
      selectionType: "selection",
      status: "draft",
      clientCanChange: true,
      clientCanSeePrice: false,
    });
  };

  const handleEdit = (id: string) => setLocation(`/selections/${id}`);
  const handleDelete = (id: string) => deleteSelectionMutation.mutate(id);
  const handleDuplicate = (id: string) => duplicateSelectionMutation.mutate(id);

  const handleCheck = (id: string, checked: boolean) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  };

  // Create PO mutation
  const createPOMutation = useMutation({
    mutationFn: async ({ selectionIds, supplierId }: { selectionIds: string[]; supplierId: string }) => {
      return await apiRequest("/api/selections/create-po", "POST", {
        projectId,
        selectionIds,
        supplierId: supplierId || null,
      });
    },
    onSuccess: (result: any) => {
      toast({ title: `PO ${result.poNumber} created`, description: `${result.count} item(s) added to purchase order.` });
      setCheckedIds(new Set());
      setShowCreatePOModal(false);
      setCreatePOSupplierId("");
      queryClient.invalidateQueries({ queryKey: ["/api/selections/with-options", projectId] });
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
      if (result.purchaseOrderId) {
        setLocation(`/projects/${projectId}/purchase-orders/${result.purchaseOrderId}`);
      }
    },
    onError: (err: any) => {
      toast({ title: "Error creating PO", description: err?.message ?? "Something went wrong.", variant: "destructive" });
    },
  });

  const applyTemplateMutation = useMutation({
    mutationFn: async ({ templateId, itemIds }: { templateId: string; itemIds?: string[] }) => {
      const endpoint = itemIds
        ? `/api/selection-templates/${templateId}/apply-items`
        : `/api/selection-templates/${templateId}/apply`;
      return await apiRequest(endpoint, "POST", itemIds ? { projectId, itemIds } : { projectId });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/selections/with-options", projectId] });
      toast({ title: `${data.created} selection${data.created !== 1 ? "s" : ""} added from template` });
    },
    onError: (err: any) => {
      toast({ title: "Failed to apply template", description: err?.message ?? "Something went wrong.", variant: "destructive" });
    },
  });

  const saveAsTemplateMutation = useMutation({
    mutationFn: async ({ name, category }: { name: string; category?: string }) => {
      return await apiRequest(`/api/projects/${projectId}/save-as-template`, "POST", { name, category: category || null });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/selection-templates"] });
      setShowSaveTemplateDialog(false);
      setSaveTemplateName("");
      setSaveTemplateCategory("");
      toast({ title: "Template saved", description: "Your selections have been saved as a template." });
    },
    onError: (err: any) => {
      toast({ title: "Failed to save template", description: err?.message ?? "Something went wrong.", variant: "destructive" });
    },
  });

  // ── Grouping helpers ── must be above the early return to respect Rules of Hooks ──
  const groupedFiltered = useMemo(() => {
    if (groupBy === "none") return null;
    const key = groupBy === "category" ? "category" : "room";
    const groups = new Map<string, typeof filtered>();
    for (const sel of filtered) {
      const g = (sel as any)[key] || "Uncategorised";
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g)!.push(sel);
    }
    return groups;
  }, [filtered, groupBy]);

  const allGroupKeys = useMemo(() => (groupedFiltered ? [...groupedFiltered.keys()] : []), [groupedFiltered]);

  // Initialise all groups as expanded when grouping first turns on
  useEffect(() => {
    if (groupBy !== "none" && allGroupKeys.length > 0) {
      setExpandedGroupIds((prev) => prev.size === 0 ? new Set(allGroupKeys) : prev);
    }
  }, [groupBy, allGroupKeys]);

  if (!currentProject) {
    return (
      <div className="p-6">
        <div className="text-center text-muted-foreground">
          <Package className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>Please select a project to view selections.</p>
        </div>
      </div>
    );
  }

  // Status tab definition
  const tabs: { key: "all" | DerivedStatus; label: string; count: number }[] = [
    { key: "all", label: "All", count: stats.total },
    { key: "open", label: "Open", count: stats.open },
    { key: "submitted", label: "Submitted", count: stats.submitted },
    { key: "approved", label: "Approved", count: stats.approved },
    { key: "overdue", label: "Overdue", count: stats.overdue },
    { key: "ordered", label: "Ordered", count: stats.ordered },
  ];

  const varianceMeta = formatVarianceCents(stats.variance);

  const toggleGroup = (key: string) => {
    setExpandedGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  return (
    <div className="flex h-full bg-background rounded-lg border overflow-hidden">
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
      {/* Summary strip (hideable) */}
      {showSummaryCards && (
        <div className="px-4 py-2 border-b border-border flex items-center justify-between gap-3 flex-shrink-0 flex-wrap">
          {/* Left: stat cards */}
          <div className="flex items-center gap-3 flex-wrap">
            <StatCard
              value={stats.total}
              label="Total"
              variant="default"
              active={statusTab === "all"}
              onClick={() => setStatusTab("all")}
              testId="stat-total"
            />
            <StatCard
              value={stats.open}
              label="Open"
              variant="primary"
              active={statusTab === "open"}
              onClick={() => setStatusTab("open")}
              testId="stat-open"
            />
            <StatCard
              value={stats.submitted}
              label="Submitted"
              variant="amber"
              active={statusTab === "submitted"}
              onClick={() => setStatusTab("submitted")}
              testId="stat-submitted"
            />
            <StatCard
              value={stats.approved}
              label="Approved"
              variant="sage"
              active={statusTab === "approved"}
              onClick={() => setStatusTab("approved")}
              testId="stat-approved"
            />
            <StatCard
              value={stats.overdue}
              label="Overdue"
              variant="coral"
              active={statusTab === "overdue"}
              onClick={() => setStatusTab("overdue")}
              testId="stat-overdue"
            />
            <StatCard
              value={stats.ordered}
              label="Ordered"
              variant="primary"
              active={statusTab === "ordered"}
              onClick={() => setStatusTab("ordered")}
              testId="stat-ordered"
            />
          </div>

          {/* Right: decision progress + budget summary */}
          <div className="rounded-lg border border-border bg-card px-4 py-2 flex items-center gap-6">
            <ProgressStrip selections={selectionsWithOptions} />
            <div className="w-px self-stretch bg-border/70" />
            <div>
              <div className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">Allowance</div>
              <div className="text-[13px] font-bold text-foreground tabular-nums" data-testid="text-total-allowance">
                {formatMoneyCents(stats.totalAllowance)}
              </div>
            </div>
            <div>
              <div className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">Actual</div>
              <div
                className={`text-[13px] font-bold tabular-nums ${
                  stats.variance > 0 ? "text-[hsl(var(--coral))]" : "text-[hsl(var(--sage))]"
                }`}
                data-testid="text-total-actual"
              >
                {formatMoneyCents(stats.totalActual)}
              </div>
            </div>
            <div>
              <div className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">Variance</div>
              <div
                className={`text-[13px] font-bold tabular-nums ${
                  varianceMeta.tone === "over"
                    ? "text-[hsl(var(--coral))]"
                    : varianceMeta.tone === "under"
                      ? "text-[hsl(var(--sage))]"
                      : "text-foreground"
                }`}
                data-testid="text-total-variance"
              >
                {varianceMeta.text}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Single-row toolbar */}
      <div className="h-9 flex items-center px-2 gap-2 border-b border-border flex-shrink-0">
          {/* Left: status pill tabs (scroll on narrow) */}
          <div className="flex items-center gap-1 overflow-x-auto min-w-0">
            {tabs.map((tab) => {
              const isActive = statusTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setStatusTab(tab.key)}
                  data-testid={`tab-${tab.key}`}
                  className={cn(
                    "h-6 rounded-md px-2 text-xs flex items-center gap-1.5 whitespace-nowrap border border-transparent hover-elevate active-elevate-2",
                    isActive
                      ? "bg-primary text-white"
                      : "text-muted-foreground"
                  )}
                >
                  <span>{tab.label}</span>
                  <span
                    className={cn(
                      "tabular-nums text-[10px] px-1 rounded",
                      isActive ? "bg-white/20 text-white" : "bg-muted text-muted-foreground"
                    )}
                  >
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Icon-expand search */}
          <div ref={searchWrapRef} className="flex items-center flex-shrink-0">
            <div
              className={cn(
                "flex items-center transition-all duration-200 overflow-hidden",
                searchExpanded ? "w-56" : "w-6"
              )}
            >
              {searchExpanded ? (
                <div className="relative w-full">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                  <Input
                    ref={searchInputRef}
                    placeholder="Search selections…"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        setSearchTerm("");
                        setSearchExpanded(false);
                      }
                    }}
                    className="pl-7 pr-7 h-6 text-xs"
                    data-testid="input-search-selections"
                  />
                  {searchTerm && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchTerm("");
                        searchInputRef.current?.focus();
                      }}
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-4 w-4 flex items-center justify-center rounded hover-elevate text-muted-foreground"
                      aria-label="Clear search"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setSearchExpanded(true)}
                  className="h-6 w-6 flex items-center justify-center rounded-md border border-border/50 hover-elevate active-elevate-2 text-muted-foreground"
                  data-testid="button-search-toggle"
                  aria-label="Search"
                >
                  <Search className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* Right side */}
          <div className="ml-auto flex items-center gap-1 flex-shrink-0">
            {/* List / Cards toggle */}
            <div className="flex items-center rounded-md border border-border/50 p-px mr-1">
              <button
                onClick={() => setViewMode("list")}
                className={cn(
                  "h-5 w-6 flex items-center justify-center rounded",
                  viewMode === "list" ? "bg-primary/15 text-primary" : "text-muted-foreground",
                )}
                data-testid="button-view-list"
                aria-label="List view"
              >
                <LayoutList className="w-3 h-3" />
              </button>
              <button
                onClick={() => setViewMode("cards")}
                className={cn(
                  "h-5 w-6 flex items-center justify-center rounded",
                  viewMode === "cards" ? "bg-primary/15 text-primary" : "text-muted-foreground",
                )}
                data-testid="button-view-cards"
                aria-label="Cards view"
              >
                <LayoutGrid className="w-3 h-3" />
              </button>
            </div>
            {/* Group-by dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className={`h-6 w-6 flex items-center justify-center border rounded-md hover-elevate active-elevate-2 ${groupBy !== "none" ? "border-primary/50 text-primary bg-primary/5" : "border-border/50 text-muted-foreground"}`}
                  data-testid="button-group-by"
                  aria-label="Group by"
                >
                  <Layers className="w-3.5 h-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setGroupBy("none")}>
                  <span className={groupBy === "none" ? "font-medium" : ""}>No grouping</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setGroupBy("category")}>
                  <span className={groupBy === "category" ? "font-medium" : ""}>Group by Category</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setGroupBy("location")}>
                  <span className={groupBy === "location" ? "font-medium" : ""}>Group by Location</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Category filter dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className={`h-6 w-6 flex items-center justify-center border rounded-md hover-elevate active-elevate-2 ${categoryFilter ? "border-primary/50 text-primary bg-primary/5" : "border-border/50 text-muted-foreground"}`}
                  data-testid="button-category-filter"
                  aria-label="Filter by category"
                >
                  <Filter className="w-3.5 h-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setCategoryFilter("")}>
                  <span className={!categoryFilter ? "font-medium" : ""}>All Categories</span>
                </DropdownMenuItem>
                {selectionCategories?.options?.map((opt) => (
                  <DropdownMenuItem
                    key={opt.key}
                    onClick={() => setCategoryFilter(opt.name)}
                    className={categoryFilter === opt.name ? "bg-accent" : ""}
                  >
                    {opt.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Add Selection primary — builder-only; clients view and approve. */}
            {!isClient && (
            <button
              className="h-6 w-auto px-2 text-xs border rounded-md bg-primary text-white border-primary/20 hover:bg-primary/90 active-elevate-2 flex items-center gap-0.5 disabled:opacity-60 disabled:pointer-events-none"
              onClick={handleAddSelection}
              disabled={createSelectionMutation.isPending}
              data-testid="button-add-selection"
            >
              {createSelectionMutation.isPending ? (
                <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Plus className="w-3 h-3" />
              )}
              <span>Add Selection</span>
            </button>
            )}

            {/* Options dropdown — templates, exports, share links: builder-only. */}
            {!isClient && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="h-6 w-6 flex items-center justify-center rounded-md border border-border/50 hover-elevate active-elevate-2 text-muted-foreground"
                  data-testid="button-selections-options"
                  aria-label="Selections options"
                >
                  <MoreVertical className="w-3 h-3" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuItem
                  onClick={() => setShowTemplatePanel((p) => !p)}
                  data-testid="button-toggle-templates"
                >
                  <LayoutTemplate className="w-3.5 h-3.5 mr-2" />
                  {showTemplatePanel ? "Hide Templates" : "Show Templates"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuCheckboxItem
                  checked={showSummaryCards}
                  onCheckedChange={(c) => setShowSummaryCards(!!c)}
                  onSelect={(e) => e.preventDefault()}
                  data-testid="option-show-summary-cards"
                >
                  Show summary cards
                </DropdownMenuCheckboxItem>
                {projectId && (
                  <>
                    <DropdownMenuItem
                      onClick={async () => {
                        try {
                          const res = await fetch(`/api/projects/${projectId}/trades-portal-token`, { method: "POST" });
                          if (!res.ok) throw new Error();
                          const { url } = await res.json();
                          await navigator.clipboard.writeText(url);
                          toast({ title: "Trades portal link copied!", description: "Share this link with your trades." });
                        } catch {
                          toast({ title: "Failed to copy link", variant: "destructive" });
                        }
                      }}
                    >
                      <HardHat className="w-3.5 h-3.5 mr-2" />
                      Copy Trades View Link
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => window.open(`/api/selections/project/${projectId}/pdf`, "_blank")}
                    >
                      <FileText className="w-3.5 h-3.5 mr-2" />
                      Export Schedule PDF
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => setShowSaveTemplateDialog(true)}
                      data-testid="option-save-as-template"
                    >
                      <BookCopy className="w-3.5 h-3.5 mr-2" />
                      Save as Template
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            )}
          </div>
        </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {/* Table header — hidden in cards view; status/budget/deadline are
            resizable via the divider handles (widths persisted) */}
        {viewMode === "list" && (
          <div
            className="grid gap-3 items-center bg-muted border-b border-border h-[34px] px-3 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground sticky top-0 z-10"
            style={{ gridTemplateColumns: gridTemplate }}
          >
            <div></div>
            <div></div>
            <div>Selection</div>
            <div className="relative flex items-center h-full">
              Status
              <div
                className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-primary/30"
                onMouseDown={startColumnResize("status")}
                data-testid="resize-status"
              />
            </div>
            <div className="relative flex items-center justify-end h-full">
              Budget
              <div
                className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-primary/30"
                onMouseDown={startColumnResize("budget")}
                data-testid="resize-budget"
              />
            </div>
            <div className="relative flex items-center justify-end h-full">
              Due
              <div
                className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-primary/30"
                onMouseDown={startColumnResize("deadline")}
                data-testid="resize-deadline"
              />
            </div>
            <div></div>
          </div>
        )}

        {/* Body — DndContext always mounted so hook count stays stable */}
        <DndContext
          sensors={dndSensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          {isLoading ? (
            <div className="px-3 py-12 text-center text-sm text-muted-foreground">Loading selections…</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12">
              <Package className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-base font-medium mb-2">No selections found</h3>
              <p className="text-xs text-muted-foreground mb-4">
                {searchTerm || categoryFilter || statusTab !== "all"
                  ? "Try adjusting your filters."
                  : "Create your first selection to get started."}
              </p>
              {!isClient && !searchTerm && !categoryFilter && statusTab === "all" && (
                <Button onClick={handleAddSelection} disabled={createSelectionMutation.isPending} size="sm">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Selection
                </Button>
              )}
            </div>
          ) : groupBy !== "none" && groupedFiltered ? (
            /* Grouped rendering — DnD enabled within each group */
            <div>
              {allGroupKeys.map((groupKey) => {
                const groupItems = groupedFiltered.get(groupKey) || [];
                const isOpen = expandedGroupIds.has(groupKey);
                return (
                  <div key={groupKey}>
                    {/* Floating group header — sticky, compact, does not occupy a full row */}
                    <div className="sticky top-[34px] z-[9]">
                      <button
                        type="button"
                        onClick={() => toggleGroup(groupKey)}
                        className="flex items-center gap-1.5 px-3 py-1 bg-background/90 backdrop-blur-sm border-b border-border/40 text-left w-full"
                      >
                        {isOpen
                          ? <ChevronDown className="w-3 h-3 text-muted-foreground/50 shrink-0" />
                          : <ChevronRight className="w-3 h-3 text-muted-foreground/50 shrink-0" />}
                        <span className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-widest">{groupKey}</span>
                        <span className="text-[9px] text-muted-foreground/40 bg-muted/50 rounded px-1 py-px ml-0.5">{groupItems.length}</span>
                      </button>
                    </div>
                    {/* Group items — cards grid or sortable rows */}
                    {isOpen && (viewMode === "cards" ? (
                      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 px-3 py-3">
                        {groupItems.map((sel) => (
                          <SelectionCard
                            key={sel.id}
                            selection={sel}
                            onOpenDrawer={setDrawerId}
                            onEdit={handleEdit}
                            onDelete={handleDelete}
                            onDuplicate={handleDuplicate}
                            projectId={projectId!}
                          />
                        ))}
                      </div>
                    ) : (
                      <SortableContext
                        items={groupItems.map((s) => s.id)}
                        strategy={verticalListSortingStrategy}
                      >
                        {groupItems.map((sel) => (
                          <SortableSelectionRow
                            key={sel.id}
                            selection={sel}
                            gridTemplate={gridTemplate}
                            onOpenDrawer={setDrawerId}
                            onEdit={handleEdit}
                            onDelete={handleDelete}
                            onDuplicate={handleDuplicate}
                            isChecked={checkedIds.has(sel.id)}
                            onCheck={handleCheck}
                            projectId={projectId!}
                            isDraggable={isDraggable}
                          />
                        ))}
                      </SortableContext>
                    ))}
                  </div>
                );
              })}
            </div>
          ) : (
            /* Flat rendering — cards grid or sortable rows */
            viewMode === "cards" ? (
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 px-3 py-3">
                {filtered.map((sel) => (
                  <SelectionCard
                    key={sel.id}
                    selection={sel}
                    onOpenDrawer={setDrawerId}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    onDuplicate={handleDuplicate}
                    projectId={projectId!}
                  />
                ))}
              </div>
            ) : (
            <SortableContext
              items={filtered.map((s) => s.id)}
              strategy={verticalListSortingStrategy}
            >
              <div>
                {filtered.map((sel) => (
                  <SortableSelectionRow
                    key={sel.id}
                    selection={sel}
                    gridTemplate={gridTemplate}
                    onOpenDrawer={setDrawerId}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    onDuplicate={handleDuplicate}
                    isChecked={checkedIds.has(sel.id)}
                    onCheck={handleCheck}
                    projectId={projectId!}
                    isDraggable={isDraggable}
                  />
                ))}
              </div>
            </SortableContext>
            )
          )}
        </DndContext>
      </div>

      {/* Bulk action toolbar */}
      {checkedIds.size > 0 && (
        <div className="flex-none border-t border-border bg-primary/5 flex items-center justify-between px-4 py-2 gap-3 flex-shrink-0">
          <span className="text-sm font-medium text-foreground">
            {checkedIds.size} selection{checkedIds.size !== 1 ? "s" : ""} selected
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCheckedIds(new Set())}
            >
              <X className="w-3.5 h-3.5 mr-1" />
              Clear
            </Button>
            <Button
              size="sm"
              onClick={() => setShowCreatePOModal(true)}
              data-testid="button-create-po"
            >
              <ShoppingCart className="w-3.5 h-3.5 mr-1" />
              Convert to PO
            </Button>
          </div>
        </div>
      )}

      {/* Sticky footer */}
      <div className="flex-none h-11 bg-muted/30 border-t border-border flex items-center justify-between px-4 text-xs text-muted-foreground flex-shrink-0">
        <span data-testid="text-footer-count">
          {filtered.length} of {stats.total} selections shown
        </span>
        <span data-testid="text-footer-summary">
          Approved spend: <span className="text-foreground font-medium tabular-nums">{formatMoneyCents(approvedSpend)}</span>
          {" · "}
          Pending: <span className="text-foreground font-medium tabular-nums">{formatMoneyCents(stats.pendingAmount)}</span>
          {" across "}
          <span className="text-foreground font-medium">{stats.openCount}</span>
          {" open selections"}
        </span>
      </div>

      {/* Create PO modal */}
      <Dialog open={showCreatePOModal} onOpenChange={(open) => { if (!open) { setShowCreatePOModal(false); setCreatePOSupplierId(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShoppingCart className="w-4 h-4" />
              Convert Selections to Purchase Order
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              {checkedIds.size} approved selection{checkedIds.size !== 1 ? "s" : ""} will be converted into a new Purchase Order.
              Each selection's chosen option becomes a line item.
            </p>
            <div className="space-y-2">
              <label className="text-sm font-medium">Supplier <span className="text-muted-foreground font-normal">(optional)</span></label>
              <Select value={createPOSupplierId} onValueChange={setCreatePOSupplierId}>
                <SelectTrigger data-testid="select-po-supplier">
                  <SelectValue placeholder="No supplier assigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No supplier</SelectItem>
                  {supplierContacts.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="rounded-md border border-border bg-muted/20 px-3 py-2 space-y-1 max-h-40 overflow-y-auto">
              {[...checkedIds].map((id) => {
                const sel = selectionsWithOptions.find((s) => s.id === id);
                const opt = sel?.options?.find((o) => o.isSelectedByClient);
                return sel ? (
                  <div key={id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="font-medium truncate">{sel.name}</span>
                    <span className="text-muted-foreground text-xs truncate">{opt?.name ?? "—"}</span>
                  </div>
                ) : null;
              })}
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => { setShowCreatePOModal(false); setCreatePOSupplierId(""); }}
              disabled={createPOMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={() => createPOMutation.mutate({ selectionIds: [...checkedIds], supplierId: createPOSupplierId === "none" ? "" : createPOSupplierId })}
              disabled={createPOMutation.isPending}
              data-testid="button-confirm-create-po"
            >
              {createPOMutation.isPending ? (
                <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Creating…</>
              ) : (
                <><ShoppingCart className="w-3.5 h-3.5 mr-1.5" />Create PO</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Save as Template Dialog */}
      <Dialog open={showSaveTemplateDialog} onOpenChange={(open) => { if (!open) { setShowSaveTemplateDialog(false); setSaveTemplateName(""); setSaveTemplateCategory(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookCopy className="w-4 h-4" />
              Save as Template
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              Save all {filtered.length} visible selection{filtered.length !== 1 ? "s" : ""} as a reusable template.
            </p>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Template Name *</label>
              <Input
                placeholder="e.g., Standard 4-bed Home"
                value={saveTemplateName}
                onChange={(e) => setSaveTemplateName(e.target.value)}
                data-testid="input-save-template-name"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Category <span className="text-muted-foreground font-normal">(optional)</span></label>
              <Input
                placeholder="e.g., Residential, Commercial"
                value={saveTemplateCategory}
                onChange={(e) => setSaveTemplateCategory(e.target.value)}
                data-testid="input-save-template-category"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setShowSaveTemplateDialog(false); setSaveTemplateName(""); setSaveTemplateCategory(""); }} disabled={saveAsTemplateMutation.isPending}>
              Cancel
            </Button>
            <Button
              onClick={() => { if (saveTemplateName.trim()) saveAsTemplateMutation.mutate({ name: saveTemplateName.trim(), category: saveTemplateCategory.trim() || undefined }); }}
              disabled={saveAsTemplateMutation.isPending || !saveTemplateName.trim()}
              data-testid="button-confirm-save-template"
            >
              {saveAsTemplateMutation.isPending ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Saving…</> : <><BookCopy className="w-3.5 h-3.5 mr-1.5" />Save Template</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      </div>{/* end main flex-col */}

      {/* Template Panel */}
      {showTemplatePanel && (
        <div className="w-80 border-l bg-background flex flex-col overflow-hidden shrink-0" data-testid="panel-templates">
          {/* Panel header */}
          <div className="h-9 flex items-center justify-between px-3 border-b border-border flex-shrink-0">
            <div className="flex items-center gap-2">
              <LayoutTemplate className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-sm font-medium">Templates</span>
              <span className="text-xs text-muted-foreground bg-muted rounded px-1.5 py-0.5">{selectionTemplates.length}</span>
            </div>
            <button
              type="button"
              onClick={() => setShowTemplatePanel(false)}
              className="h-6 w-6 flex items-center justify-center rounded-md hover-elevate text-muted-foreground"
              data-testid="button-close-template-panel"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Panel search */}
          <div className="px-2 py-1.5 border-b border-border flex-shrink-0">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
              <Input
                placeholder="Search templates…"
                value={templateSearch}
                onChange={(e) => setTemplateSearch(e.target.value)}
                className="pl-7 h-7 text-xs"
                data-testid="input-template-search"
              />
              {templateSearch && (
                <button
                  type="button"
                  onClick={() => setTemplateSearch("")}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 h-4 w-4 flex items-center justify-center rounded hover-elevate text-muted-foreground"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* Panel body */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
            {selectionTemplates.length === 0 ? (
              <div className="text-center py-8 text-xs text-muted-foreground">
                <LayoutTemplate className="w-8 h-8 mx-auto mb-2 opacity-30" />
                No templates yet
              </div>
            ) : (() => {
              const visibleTemplates = templateSearch
                ? selectionTemplates.filter((t) =>
                    t.name.toLowerCase().includes(templateSearch.toLowerCase()) ||
                    (t.category?.toLowerCase().includes(templateSearch.toLowerCase()))
                  )
                : selectionTemplates;
              if (visibleTemplates.length === 0) return (
                <div className="text-center py-8 text-xs text-muted-foreground">No templates match your search</div>
              );
              return visibleTemplates.map((tmpl) => {
                const tmplItems: any[] = (tmpl.templateData as any[]) || [];
                const isExpanded = expandedTemplateIds.has(tmpl.id);
                return (
                  <div key={tmpl.id} className="border rounded-md overflow-hidden">
                    {/* Template header row */}
                    <div className="flex items-center gap-2 px-2 py-1.5 bg-muted/30">
                      <button
                        type="button"
                        onClick={() => setExpandedTemplateIds((prev) => { const n = new Set(prev); if (n.has(tmpl.id)) n.delete(tmpl.id); else n.add(tmpl.id); return n; })}
                        className="flex-1 flex items-center gap-1.5 text-left min-w-0"
                      >
                        {isExpanded ? <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" /> : <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />}
                        <span className="text-xs font-medium truncate">{tmpl.name}</span>
                        {tmpl.category && <span className="text-[10px] text-muted-foreground border rounded px-1 py-0 shrink-0">{tmpl.category}</span>}
                        <span className="text-[10px] text-muted-foreground shrink-0">{tmplItems.length}</span>
                      </button>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            disabled={!projectId || applyTemplateMutation.isPending}
                            onClick={() => projectId && applyTemplateMutation.mutate({ templateId: tmpl.id })}
                            className="h-5 px-1.5 text-[10px] border border-primary/30 text-primary rounded hover-elevate active-elevate-2 disabled:opacity-40 shrink-0"
                            data-testid={`button-apply-template-${tmpl.id}`}
                          >
                            Apply all
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="left">Apply all {tmplItems.length} items to this project</TooltipContent>
                      </Tooltip>
                    </div>

                    {/* Expanded items */}
                    {isExpanded && (
                      <div className="divide-y divide-border/50">
                        {tmplItems.length === 0 ? (
                          <p className="text-[10px] text-muted-foreground px-3 py-2">No items in this template</p>
                        ) : (
                          tmplItems.map((item: any) => (
                            <div key={item.id} className="flex items-center gap-1.5 px-2 py-1.5">
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium truncate">{item.itemName}</p>
                                {(item.categoryName || item.room) && (
                                  <p className="text-[10px] text-muted-foreground truncate">
                                    {[item.categoryName, item.room].filter(Boolean).join(" · ")}
                                  </p>
                                )}
                              </div>
                              {item.budgetAmount && (
                                <span className="text-[10px] text-muted-foreground shrink-0">${(item.budgetAmount / 100).toLocaleString("en-AU", { maximumFractionDigits: 0 })}</span>
                              )}
                              <button
                                type="button"
                                disabled={!projectId || applyTemplateMutation.isPending}
                                onClick={() => projectId && applyTemplateMutation.mutate({ templateId: tmpl.id, itemIds: [item.id] })}
                                className="h-5 px-1.5 text-[10px] border rounded hover-elevate active-elevate-2 disabled:opacity-40 shrink-0 text-muted-foreground"
                                data-testid={`button-apply-item-${item.id}`}
                              >
                                Add
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                );
              });
            })()}
          </div>
        </div>
      )}

      {/* Quick-view drawer */}
      <SelectionDrawer
        selection={selectionsWithOptions.find((s) => s.id === drawerId) ?? null}
        open={!!drawerId}
        onClose={() => setDrawerId(null)}
        onEdit={handleEdit}
        onSelectOption={(selectionId, optionId) => selectOptionMutation.mutate({ selectionId, optionId })}
        selectPending={selectOptionMutation.isPending}
        projectId={projectId ?? ""}
      />
    </div>
  );
}
