import React, { useState, useMemo, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useProject } from "@/contexts/ProjectContext";
import { cn } from "@/lib/utils";
import {
  type Selection,
  type InsertSelection,
  type FieldCategoryWithOptions,
  type SelectionWithOptions,
  type SelectionOption,
  type OptionAttachment,
} from "@shared/schema";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
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
  Image as ImageIcon,
  Check,
  MessageSquare,
  Paperclip,
  X,
} from "lucide-react";
import { format, differenceInCalendarDays } from "date-fns";

// ───────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────

type DerivedStatus = "open" | "submitted" | "approved" | "overdue";

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

function getDeadlineMeta(deadline: Date | null | undefined, derived: DerivedStatus) {
  if (!deadline) return { text: "—", className: "text-muted-foreground/40" };
  const date = new Date(deadline);
  if (derived === "approved") return { text: "Done", className: "text-muted-foreground/50" };
  const days = differenceInCalendarDays(date, new Date());
  if (days < 0) return { text: format(date, "dd MMM"), className: "font-semibold text-[hsl(var(--coral))]" };
  if (days <= 7) return { text: format(date, "dd MMM"), className: "font-semibold text-[hsl(var(--amber))]" };
  return { text: format(date, "dd MMM yyyy"), className: "text-muted-foreground" };
}

const STATUS_CHIP_CLASS: Record<DerivedStatus, string> = {
  open: "bg-primary/10 text-primary border-primary/30",
  submitted: "bg-[hsl(var(--amber-bg))] text-[hsl(var(--amber))] border-[hsl(var(--amber))]/30",
  approved: "bg-[hsl(var(--sage-bg))] text-[hsl(var(--sage))] border-[hsl(var(--sage))]/30",
  overdue: "bg-[hsl(var(--coral-bg))] text-[hsl(var(--coral))] border-[hsl(var(--coral))]/30",
};

const STATUS_LABEL: Record<DerivedStatus, string> = {
  open: "Open",
  submitted: "Submitted",
  approved: "Approved",
  overdue: "Overdue",
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
        <img src={attachment.filePath} alt="" className="w-full h-full object-cover" />
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

interface SelectionRowProps {
  selection: SelectionWithOptions;
  expanded: boolean;
  onToggleExpand: () => void;
  onSelectOption: (selectionId: string, optionId: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  isPending: boolean;
}

function SelectionRow({
  selection,
  expanded,
  onToggleExpand,
  onSelectOption,
  onEdit,
  onDelete,
  isPending,
}: SelectionRowProps) {
  const derived = getDerivedStatus(selection);
  const selectedOption = getSelectedOption(selection);
  const actual = getActualCents(selection);
  const allowance = selection.allowance ?? null;
  const variance = actual !== null && allowance !== null ? actual - allowance : null;
  const varianceMeta = formatVarianceCents(variance);
  const deadlineMeta = getDeadlineMeta(selection.deadline, derived);

  // Use first attachment of the selected option for the row thumbnail
  const rowThumb = selectedOption?.attachments?.[0] ?? selection.options?.[0]?.attachments?.[0];

  return (
    <>
      <div
        className={`grid grid-cols-[24px_40px_minmax(160px,1fr)_120px_120px_100px_100px_100px_100px_110px_90px_32px] gap-3 items-center h-12 px-3 border-b border-border cursor-pointer ${
          expanded ? "bg-[#F5F3F0] dark:bg-[#2A2720]" : "hover:bg-muted/30"
        }`}
        onClick={onToggleExpand}
        data-testid={`row-selection-${selection.id}`}
      >
        {/* Expand toggle */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleExpand();
          }}
          className={`flex items-center justify-center rounded ${expanded ? "text-primary" : "text-muted-foreground"} hover-elevate w-5 h-5`}
          data-testid={`button-expand-${selection.id}`}
        >
          {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </button>

        {/* Thumbnail */}
        <SelectionThumbnail category={selection.category} attachment={rowThumb} size={32} />

        {/* Selection name + sub-label */}
        <div className="min-w-0">
          <div className="text-[12px] font-medium text-foreground truncate" data-testid={`text-name-${selection.id}`}>
            {selection.name}
          </div>
          {selectedOption ? (
            <div className="text-[10px] text-muted-foreground/60 truncate">{selectedOption.name}</div>
          ) : selection.description ? (
            <div className="text-[10px] text-muted-foreground/60 truncate">{selection.description}</div>
          ) : null}
        </div>

        {/* Category */}
        <div className="flex items-center gap-1.5 min-w-0">
          {selection.category && (
            <>
              <span
                className="rounded-full shrink-0"
                style={{ width: 7, height: 7, backgroundColor: getCategoryColour(selection.category) }}
              />
              <span className="text-[11px] text-muted-foreground truncate">{selection.category}</span>
            </>
          )}
        </div>

        {/* Location */}
        <div className="text-[11px] text-muted-foreground truncate">{selection.room || ""}</div>

        {/* Status */}
        <div>
          <span
            className={`inline-block rounded px-2 py-1 text-[10px] font-medium border ${STATUS_CHIP_CLASS[derived]}`}
            data-testid={`badge-status-${selection.id}`}
          >
            {STATUS_LABEL[derived]}
          </span>
        </div>

        {/* Allowance */}
        <div className="text-[12px] text-muted-foreground tabular-nums text-right">
          {formatMoneyCents(allowance)}
        </div>

        {/* Actual */}
        <div
          className={`text-[12px] tabular-nums text-right ${actual === null ? "text-muted-foreground/50" : "text-foreground"}`}
          data-testid={`text-actual-${selection.id}`}
        >
          {formatMoneyCents(actual)}
        </div>

        {/* Variance */}
        <div
          className={`text-[12px] font-semibold tabular-nums text-right ${
            varianceMeta.tone === "under"
              ? "text-[hsl(var(--sage))]"
              : varianceMeta.tone === "over"
                ? "text-[hsl(var(--coral))]"
                : "text-muted-foreground/40"
          }`}
        >
          {varianceMeta.text}
        </div>

        {/* Deadline */}
        <div className={`text-[11px] truncate ${deadlineMeta.className}`}>{deadlineMeta.text}</div>

        {/* Options count badge (only when collapsed) */}
        <div className="flex justify-center">
          {!expanded && selection.options && selection.options.length > 0 && (
            <span className="bg-muted/40 text-muted-foreground rounded-full text-[10px] font-medium px-2 py-0.5">
              {selection.options.length} options
            </span>
          )}
        </div>

        {/* Actions */}
        <div onClick={(e) => e.stopPropagation()} className="flex items-center justify-center">
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
              <DropdownMenuItem onClick={() => onEdit(selection.id)}>
                <Eye className="w-4 h-4 mr-2" />
                View Details
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onEdit(selection.id)}>
                <Edit3 className="w-4 h-4 mr-2" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onDelete(selection.id)} className="text-destructive">
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {expanded && (
        <OptionsPanel
          selection={selection}
          onSelectOption={(optionId) => onSelectOption(selection.id, optionId)}
          isPending={isPending}
        />
      )}
    </>
  );
}

interface OptionsPanelProps {
  selection: SelectionWithOptions;
  onSelectOption: (optionId: string) => void;
  isPending: boolean;
}

function OptionsPanel({ selection, onSelectOption, isPending }: OptionsPanelProps) {
  const allowance = selection.allowance ?? null;
  const options = selection.options ?? [];

  return (
    <div className="relative border-b border-border bg-muted/20" data-testid={`panel-options-${selection.id}`}>
      {/* Left accent bar */}
      <div aria-hidden="true" className="absolute top-0 left-0 bottom-0 w-[3px] bg-primary" />

      <div className="pl-4">
        {/* Sub-column header row */}
        <div className="grid grid-cols-[18px_40px_minmax(160px,1.5fr)_minmax(140px,1fr)_120px_120px_140px] gap-3 items-center h-6 border-b border-border/60 px-3 text-[9px] uppercase tracking-wider font-semibold text-muted-foreground/60">
          <div></div>
          <div></div>
          <div>Option</div>
          <div>Specifications</div>
          <div className="text-right">Price</div>
          <div className="text-right">Vs Allowance</div>
          <div></div>
        </div>

        {options.length === 0 ? (
          <div className="px-3 py-4 text-[11px] text-muted-foreground/60 text-center">
            No options yet. Add an option below to begin.
          </div>
        ) : (
          options.map((option) => {
            const isSelected = !!option.isSelectedByClient;
            const price = option.totalCost ?? null;
            const variance = price !== null && allowance !== null ? price - allowance : null;
            const varMeta = formatVarianceCents(variance);
            const optThumb = option.attachments?.[0];
            const specsParts: string[] = [];
            if (option.brand) specsParts.push(option.brand);
            if (option.sku) specsParts.push(`SKU ${option.sku}`);
            if (option.unitType && option.quantity)
              specsParts.push(`${option.quantity} ${option.unitType}`);
            const specsText = specsParts.join(" · ") || (option.description ?? "—");

            return (
              <div
                key={option.id}
                className="grid grid-cols-[18px_40px_minmax(160px,1.5fr)_minmax(140px,1fr)_120px_120px_140px] gap-3 items-center h-[52px] border-b border-border/60 last:border-0 px-3"
                data-testid={`row-option-${option.id}`}
              >
                {/* Radio */}
                <button
                  type="button"
                  onClick={() => !isSelected && !isPending && onSelectOption(option.id)}
                  disabled={isPending}
                  className={`w-[18px] h-[18px] rounded-full flex items-center justify-center border-2 transition-colors ${
                    isSelected
                      ? "bg-primary border-primary"
                      : "bg-transparent border-border hover:border-primary"
                  }`}
                  aria-label={isSelected ? "Selected option" : "Select this option"}
                  data-testid={`radio-option-${option.id}`}
                >
                  {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                </button>

                {/* Thumbnail */}
                <SelectionThumbnail category={option.category ?? selection.category} attachment={optThumb} size={36} />

                {/* Option name + supplier */}
                <div className="min-w-0">
                  <div
                    className={`text-[12px] font-medium truncate ${isSelected ? "text-foreground" : "text-muted-foreground"}`}
                  >
                    {option.name}
                  </div>
                  {option.brand && (
                    <div className="text-[10px] text-muted-foreground/60 truncate">{option.brand}</div>
                  )}
                </div>

                {/* Specs */}
                <div className="text-[11px] text-muted-foreground truncate">{specsText}</div>

                {/* Price */}
                <div
                  className={`text-[12px] tabular-nums text-right ${
                    isSelected ? "font-semibold text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {formatMoneyCents(price)}
                </div>

                {/* Variance vs allowance */}
                <div
                  className={`text-[11px] font-semibold tabular-nums text-right ${
                    varMeta.tone === "under"
                      ? "text-[hsl(var(--sage))]"
                      : varMeta.tone === "over"
                        ? "text-[hsl(var(--coral))]"
                        : "text-muted-foreground/40"
                  }`}
                >
                  {varMeta.text}
                </div>

                {/* Right side: Selected pill or Select button + comment/attach */}
                <div className="flex items-center justify-end gap-1.5">
                  <button
                    type="button"
                    className="text-muted-foreground/50 hover:text-muted-foreground p-1 rounded hover-elevate"
                    aria-label="Comment"
                  >
                    <MessageSquare className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    className="text-muted-foreground/50 hover:text-muted-foreground p-1 rounded hover-elevate"
                    aria-label="Attach"
                  >
                    <Paperclip className="w-3 h-3" />
                  </button>
                  {isSelected ? (
                    <span className="bg-primary/10 text-primary rounded px-2 py-1 text-[10px] font-medium inline-flex items-center gap-1">
                      Selected
                      <Check className="w-3 h-3" />
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => !isPending && onSelectOption(option.id)}
                      disabled={isPending}
                      className="border border-border rounded px-3 py-1 text-[11px] text-muted-foreground hover:border-primary hover:text-primary disabled:opacity-50"
                      data-testid={`button-select-${option.id}`}
                    >
                      Select
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}

        {/* Add option ghost row */}
        <button
          type="button"
          className="w-full h-9 flex items-center text-[11px] text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/10 px-3"
          data-testid={`button-add-option-${selection.id}`}
        >
          <span className="pl-[136px]">+ Add option</span>
        </button>
      </div>
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
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { currentProject } = useProject();

  const [showSummaryCards, setShowSummaryCards] = useState<boolean>(() => {
    const stored = localStorage.getItem("selections-cards-visible");
    return stored === null ? true : stored === "true";
  });
  useEffect(() => {
    localStorage.setItem("selections-cards-visible", String(showSummaryCards));
  }, [showSummaryCards]);

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

  // Fetch selection categories for filter
  const { data: selectionCategories } = useQuery<FieldCategoryWithOptions>({
    queryKey: ["/api/field-categories/by-key/selection.category"],
  });

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
    let open = 0, submitted = 0, approved = 0, overdue = 0;
    let totalAllowance = 0, totalActual = 0, pendingAmount = 0;
    let openCount = 0;
    selectionsWithOptions.forEach((sel) => {
      const d = getDerivedStatus(sel);
      if (d === "open") { open++; openCount++; }
      if (d === "submitted") submitted++;
      if (d === "approved") approved++;
      if (d === "overdue") overdue++;
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
      totalAllowance,
      totalActual,
      variance: totalActual - totalAllowance,
      pendingAmount,
      openCount,
    };
  }, [selectionsWithOptions]);

  // Filtered list
  const filtered = useMemo(() => {
    return selectionsWithOptions.filter((sel) => {
      const d = getDerivedStatus(sel);
      if (statusTab !== "all" && statusTab !== d) return false;
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
  }, [selectionsWithOptions, statusTab, categoryFilter, searchTerm]);

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
  const toggleExpand = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

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
  ];

  const varianceMeta = formatVarianceCents(stats.variance);

  return (
    <div className="flex flex-col h-full bg-background rounded-lg border overflow-hidden">
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
          </div>

          {/* Right: budget summary */}
          <div className="rounded-lg border border-border bg-card px-4 py-2 flex items-center gap-6">
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
            {/* Category dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="h-6 px-2 text-xs border border-border/50 rounded-md hover-elevate active-elevate-2 flex items-center gap-1 text-muted-foreground"
                  data-testid="button-category-filter"
                >
                  <span className="truncate max-w-[140px]">
                    {categoryFilter || "Category"}
                  </span>
                  <ChevronDown className="w-3 h-3" />
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

            {/* Add Selection primary */}
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

            {/* Options dropdown */}
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
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuCheckboxItem
                  checked={showSummaryCards}
                  onCheckedChange={(c) => setShowSummaryCards(!!c)}
                  onSelect={(e) => e.preventDefault()}
                  data-testid="option-show-summary-cards"
                >
                  Show summary cards
                </DropdownMenuCheckboxItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {/* Table header */}
        <div className="grid grid-cols-[24px_40px_minmax(160px,1fr)_120px_120px_100px_100px_100px_100px_110px_90px_32px] gap-3 items-center bg-muted/30 border-b border-border h-[34px] px-3 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground sticky top-0 z-10">
          <div></div>
          <div></div>
          <div>Selection</div>
          <div>Category</div>
          <div>Location</div>
          <div>Status</div>
          <div className="text-right">Allowance</div>
          <div className="text-right">Actual</div>
          <div className="text-right">Variance</div>
          <div>Deadline</div>
          <div className="text-center">Options</div>
          <div></div>
        </div>

        {/* Body */}
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
            {!searchTerm && !categoryFilter && statusTab === "all" && (
              <Button onClick={handleAddSelection} disabled={createSelectionMutation.isPending} size="sm">
                <Plus className="w-4 h-4 mr-2" />
                Add Selection
              </Button>
            )}
          </div>
        ) : (
          <div>
            {filtered.map((sel) => (
              <SelectionRow
                key={sel.id}
                selection={sel}
                expanded={expandedRows.has(sel.id)}
                onToggleExpand={() => toggleExpand(sel.id)}
                onSelectOption={(selectionId, optionId) =>
                  selectOptionMutation.mutate({ selectionId, optionId })
                }
                onEdit={handleEdit}
                onDelete={handleDelete}
                isPending={selectOptionMutation.isPending}
              />
            ))}
          </div>
        )}
      </div>

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
    </div>
  );
}
