import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus,
  FileText,
  MoreHorizontal,
  Search,
  Download,
  Send,
  ClipboardList,
  ArrowRight,
  ChevronRight,
  ChevronDown,
  Loader2,
  ExternalLink,
} from "lucide-react";
import { type Rfq, type Project, type RfqQuote } from "@shared/schema";
import { ProjectIcon } from "@/components/ProjectIcon";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

// ── Status chips ──────────────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { key: "all",      label: "All" },
  { key: "draft",    label: "Draft" },
  { key: "sent",     label: "Sent" },
  { key: "pending",  label: "Pending" },
  { key: "quoted",   label: "Quoted" },
  { key: "accepted", label: "Accepted" },
  { key: "declined", label: "Declined" },
];

const STATUS_CHIP: Record<string, string> = {
  draft:    "bg-muted text-muted-foreground border-transparent",
  sent:     "bg-blue-50   dark:bg-blue-950/60   text-blue-700   dark:text-blue-300   border-blue-200   dark:border-blue-800",
  pending:  "bg-amber-50  dark:bg-amber-950/60  text-amber-700  dark:text-amber-300  border-amber-200  dark:border-amber-800",
  quoted:   "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
  accepted: "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
  declined: "bg-red-50    dark:bg-red-950/60    text-red-700    dark:text-red-300    border-red-200    dark:border-red-800",
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft", sent: "Sent", pending: "Pending",
  quoted: "Quoted", accepted: "Accepted", declined: "Declined",
};

function StatusChip({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center w-20 py-0.5 rounded text-[11px] font-medium border",
        STATUS_CHIP[status] ?? "bg-muted text-muted-foreground border-transparent"
      )}
    >
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

const QUOTE_CHIP: Record<string, string> = {
  pending:  "bg-amber-50  dark:bg-amber-950/60  text-amber-700  dark:text-amber-300  border-amber-200  dark:border-amber-800",
  accepted: "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
  declined: "bg-red-50    dark:bg-red-950/60    text-red-700    dark:text-red-300    border-red-200    dark:border-red-800",
};

const QUOTE_LABEL: Record<string, string> = {
  pending: "Awaiting", accepted: "Accepted", declined: "Declined",
};

function QuoteStatusChip({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center w-20 py-0.5 rounded text-[11px] font-medium border",
        QUOTE_CHIP[status] ?? QUOTE_CHIP["pending"]
      )}
    >
      {QUOTE_LABEL[status] ?? "Awaiting"}
    </span>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function formatDate(date: Date | string | null | undefined) {
  if (!date) return null;
  return format(new Date(date), "d MMM yyyy");
}

// ── Main component ────────────────────────────────────────────────────────────

export default function RFQs() {
  const [, setLocation] = useLocation();
  const params = useParams<{ projectId?: string }>();
  const projectIdFromUrl = params.projectId || "";

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");

  // Expanded RFQ IDs
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  // Cached quotes keyed by rfqId
  const [quoteCache, setQuoteCache] = useState<Record<string, RfqQuote[]>>({});
  // In-flight fetches
  const [loadingQuotes, setLoadingQuotes] = useState<Set<string>>(new Set());

  const queryParams: Record<string, string> = {};
  if (projectIdFromUrl) queryParams.projectId = projectIdFromUrl;

  const { data: rfqs = [], isLoading } = useQuery<Rfq[]>({
    queryKey: ["/api/rfqs", queryParams],
    queryFn: async () => {
      const p = new URLSearchParams(queryParams);
      const qs = p.toString();
      const url = qs ? `/api/rfqs?${qs}` : "/api/rfqs";
      const response = await fetch(url, { credentials: "include" });
      if (!response.ok) throw new Error(`${response.status}: ${response.statusText}`);
      return response.json();
    },
  });

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const getProject = (projectId: string) => projects.find((p) => p.id === projectId);
  const currentProject = projectIdFromUrl ? getProject(projectIdFromUrl) : null;

  const getNavigationPath = (path: string) =>
    projectIdFromUrl ? `/projects/${projectIdFromUrl}${path}` : path;

  const statusCounts = useMemo(() => ({
    all:      rfqs.length,
    draft:    rfqs.filter(r => r.status === "draft").length,
    sent:     rfqs.filter(r => r.status === "sent").length,
    pending:  rfqs.filter(r => r.status === "pending").length,
    quoted:   rfqs.filter(r => r.status === "quoted").length,
    accepted: rfqs.filter(r => r.status === "accepted").length,
    declined: rfqs.filter(r => r.status === "declined").length,
  }), [rfqs]);

  const filteredRFQs = useMemo(() => {
    return rfqs.filter((rfq) => {
      const matchesSearch =
        searchQuery === "" ||
        rfq.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        rfq.rfqNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        rfq.supplierNames.some((name) =>
          name.toLowerCase().includes(searchQuery.toLowerCase())
        );
      const matchesStatus = selectedStatus === "all" || rfq.status === selectedStatus;
      return matchesSearch && matchesStatus;
    });
  }, [rfqs, searchQuery, selectedStatus]);

  const fetchQuotes = useCallback(async (rfqId: string) => {
    if (quoteCache[rfqId] !== undefined || loadingQuotes.has(rfqId)) return;
    setLoadingQuotes(prev => new Set(prev).add(rfqId));
    try {
      const res = await fetch(`/api/rfqs/${rfqId}/quotes`, { credentials: "include" });
      const quotes: RfqQuote[] = res.ok ? await res.json() : [];
      setQuoteCache(prev => ({ ...prev, [rfqId]: quotes }));
    } catch {
      setQuoteCache(prev => ({ ...prev, [rfqId]: [] }));
    } finally {
      setLoadingQuotes(prev => {
        const next = new Set(prev);
        next.delete(rfqId);
        return next;
      });
    }
  }, [quoteCache, loadingQuotes]);

  const toggleRow = useCallback((rfqId: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(rfqId)) {
        next.delete(rfqId);
      } else {
        next.add(rfqId);
        fetchQuotes(rfqId);
      }
      return next;
    });
  }, [fetchQuotes]);

  const handleNavigate = (rfqId: string) => {
    setLocation(getNavigationPath(`/rfqs/${rfqId}`));
  };

  // Column widths (px) — used to keep header and body aligned
  const COL = {
    toggle:   28,
    number:   100,
    title:    220,
    project:  140,
    suppliers: 110,
    dueDate:  96,
    status:   96,
    created:  96,
    actions:  40,
  };

  const showProject = !projectIdFromUrl;

  const headerCellClass = "h-7 px-2 text-[10px] font-medium text-muted-foreground uppercase tracking-wide flex items-center flex-shrink-0";

  return (
    <div className="flex flex-col h-full" data-testid="page-rfqs">

      {/* Unified header card */}
      <div className="mx-3 mt-3 rounded-lg border border-border bg-card flex-shrink-0 overflow-hidden">

        {/* Row 1 — Title & Create button */}
        <div className="h-8 flex items-center justify-between px-3 border-b border-border/50">
          <h2 className="text-sm font-semibold truncate" data-testid="text-page-title">
            {currentProject
              ? <>{currentProject.name} <span className="text-muted-foreground font-normal">· RFQs</span></>
              : "Requests for Quote"}
          </h2>
          <button
            className="h-6 w-auto px-2 text-xs border rounded-md bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90 active-elevate-2 flex items-center gap-0.5 flex-shrink-0"
            onClick={() => setLocation(getNavigationPath("/rfqs/new"))}
            data-testid="button-create-rfq"
          >
            <Plus className="w-3 h-3" />
            <span>Create RFQ</span>
          </button>
        </div>

        {/* Row 2 — Status tabs */}
        <div className="flex items-center px-3 border-b border-border/50 overflow-x-auto">
          {STATUS_OPTIONS.map((status) => {
            const isActive = selectedStatus === status.key;
            const count = statusCounts[status.key as keyof typeof statusCounts];
            return (
              <button
                key={status.key}
                onClick={() => setSelectedStatus(status.key)}
                className={cn(
                  "relative flex items-center gap-1.5 px-3 py-2 text-xs font-medium whitespace-nowrap transition-colors border-b-2",
                  isActive
                    ? "text-foreground border-[#bba7db]"
                    : "text-muted-foreground hover:text-foreground border-transparent"
                )}
                data-testid={`tab-status-${status.key}`}
              >
                {status.label}
                {status.key !== "all" && count > 0 && (
                  <span className={cn(
                    "inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-sm text-[10px] font-semibold",
                    isActive
                      ? "bg-[#bba7db]/20 text-[#8b6bb1]"
                      : "bg-muted text-muted-foreground"
                  )}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Row 3 — Search */}
        <div className="h-8 flex items-center px-3">
          <div className="relative w-48">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
            <Input
              placeholder="Search RFQs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-7 pr-2 py-0 h-6 text-xs border"
              data-testid="input-search-rfqs"
            />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden mx-3 mt-2 mb-3">
        {isLoading ? (
          <Card className="p-8 text-center text-muted-foreground text-xs">
            Loading RFQs...
          </Card>
        ) : filteredRFQs.length === 0 ? (
          searchQuery || selectedStatus !== "all" ? (
            <Card className="p-8 text-center text-muted-foreground text-xs">
              No RFQs match your search
            </Card>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 px-4">
              <div className="w-20 h-20 rounded-full bg-[#bba7db]/10 flex items-center justify-center mb-6">
                <ClipboardList className="w-10 h-10 text-[#bba7db]" />
              </div>
              <h3 className="text-xl font-semibold mb-2">No Requests for Quote yet</h3>
              <p className="text-muted-foreground text-center max-w-md mb-8 text-sm">
                Request quotes from your suppliers to get competitive pricing on materials and services for your projects.
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  onClick={() => setLocation(getNavigationPath("/rfqs/new"))}
                  className="bg-[#bba7db] hover:bg-[#bba7db]/90 text-white gap-2"
                  data-testid="button-create-rfq-empty"
                >
                  <Plus className="w-4 h-4" />
                  Create New RFQ
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setLocation("/estimates")}
                  className="gap-2"
                  data-testid="button-rfq-from-estimate"
                >
                  <FileText className="w-4 h-4" />
                  Create from Estimate
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )
        ) : (
          <div className="rounded-lg border border-border bg-card overflow-hidden h-full flex flex-col">
            {/* Table header */}
            <div className="flex items-center border-b border-border/50 flex-shrink-0 px-2">
              <div style={{ width: COL.toggle }} className={headerCellClass} />
              <div style={{ width: COL.number }} className={headerCellClass}>RFQ #</div>
              <div style={{ width: COL.title }} className={headerCellClass}>Title</div>
              {showProject && <div style={{ width: COL.project }} className={headerCellClass}>Project</div>}
              <div style={{ width: COL.suppliers }} className={headerCellClass}>Suppliers</div>
              <div style={{ width: COL.dueDate }} className={headerCellClass}>Due Date</div>
              <div style={{ width: COL.status }} className={headerCellClass}>Status</div>
              <div style={{ width: COL.created }} className={headerCellClass}>Created</div>
              <div style={{ width: COL.actions }} className={headerCellClass} />
            </div>

            {/* Scrollable body */}
            <div className="overflow-auto flex-1">
              {filteredRFQs.map((rfq) => {
                const project = getProject(rfq.projectId);
                const isExpanded = expandedIds.has(rfq.id);
                const isLoadingQ = loadingQuotes.has(rfq.id);
                const quotes = quoteCache[rfq.id];

                // Build per-supplier rows from supplierIds / supplierNames
                // Match quotes to suppliers by supplierId or supplierName
                const supplierRows = rfq.supplierNames.map((name, idx) => {
                  const supplierId = rfq.supplierIds[idx] ?? null;
                  const quote = quotes?.find(
                    q => (supplierId && q.supplierId === supplierId) || q.supplierName === name
                  ) ?? null;
                  return { name, supplierId, quote };
                });

                return (
                  <div key={rfq.id} data-testid={`group-rfq-${rfq.id}`}>
                    {/* RFQ header row */}
                    <div
                      className={cn(
                        "flex items-center px-2 h-9 cursor-pointer hover-elevate active-elevate-2 border-b border-border/30",
                        isExpanded && "bg-muted/20"
                      )}
                      onClick={() => toggleRow(rfq.id)}
                      data-testid={`row-rfq-${rfq.id}`}
                    >
                      {/* Chevron */}
                      <div style={{ width: COL.toggle }} className="flex items-center justify-center flex-shrink-0">
                        {isExpanded
                          ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                          : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
                      </div>
                      {/* RFQ # */}
                      <div style={{ width: COL.number }} className="flex items-center gap-1.5 flex-shrink-0 px-2">
                        <FileText className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                        <span className="text-xs font-semibold truncate">{rfq.rfqNumber}</span>
                      </div>
                      {/* Title */}
                      <div style={{ width: COL.title }} className="flex items-center flex-shrink-0 px-2">
                        <span className="text-xs truncate">{rfq.title}</span>
                      </div>
                      {/* Project */}
                      {showProject && (
                        <div style={{ width: COL.project }} className="flex items-center gap-1.5 flex-shrink-0 px-2">
                          {project && (
                            <>
                              <ProjectIcon
                                icon={project.icon || "Briefcase"}
                                color={project.color}
                                className="w-3 h-3 flex-shrink-0"
                              />
                              <span className="text-xs truncate">{project.name}</span>
                            </>
                          )}
                        </div>
                      )}
                      {/* Supplier count */}
                      <div style={{ width: COL.suppliers }} className="flex items-center flex-shrink-0 px-2">
                        <span className="text-xs text-muted-foreground">
                          {rfq.supplierNames.length === 0
                            ? <span className="text-muted-foreground/40">—</span>
                            : `${rfq.supplierNames.length} supplier${rfq.supplierNames.length !== 1 ? "s" : ""}`}
                        </span>
                      </div>
                      {/* Due date */}
                      <div style={{ width: COL.dueDate }} className="flex items-center flex-shrink-0 px-2">
                        <span className="text-xs text-muted-foreground">
                          {formatDate(rfq.dueDate) ?? <span className="text-muted-foreground/40">—</span>}
                        </span>
                      </div>
                      {/* Status */}
                      <div style={{ width: COL.status }} className="flex items-center flex-shrink-0 px-2">
                        <StatusChip status={rfq.status} />
                      </div>
                      {/* Created */}
                      <div style={{ width: COL.created }} className="flex items-center flex-shrink-0 px-2">
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(rfq.createdAt), "d MMM yyyy")}
                        </span>
                      </div>
                      {/* Actions */}
                      <div style={{ width: COL.actions }} className="flex items-center justify-center flex-shrink-0">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              className="p-1 rounded hover-elevate text-muted-foreground"
                              data-testid={`button-rfq-actions-${rfq.id}`}
                            >
                              <MoreHorizontal className="w-3.5 h-3.5" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={(e) => { e.stopPropagation(); handleNavigate(rfq.id); }}
                            >
                              <FileText className="mr-2 h-4 w-4" />
                              View Details
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={(e) => e.stopPropagation()}>
                              <Download className="mr-2 h-4 w-4" />
                              Download PDF
                            </DropdownMenuItem>
                            {rfq.status === "draft" && (
                              <DropdownMenuItem onClick={(e) => e.stopPropagation()}>
                                <Send className="mr-2 h-4 w-4" />
                                Send RFQ
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>

                    {/* Expanded supplier rows */}
                    {isExpanded && (
                      <>
                        {isLoadingQ ? (
                          <div className="flex items-center gap-2 px-4 h-8 bg-muted/10 border-b border-border/20 text-xs text-muted-foreground">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            Loading quotes…
                          </div>
                        ) : supplierRows.length === 0 ? (
                          <div className="flex items-center px-4 h-8 bg-muted/10 border-b border-border/20 text-xs text-muted-foreground italic">
                            No suppliers added to this RFQ
                          </div>
                        ) : (
                          supplierRows.map(({ name, quote }, idx) => (
                            <div
                              key={idx}
                              className="flex items-center px-2 h-8 bg-muted/10 border-b border-border/20 hover-elevate"
                              data-testid={`row-supplier-${rfq.id}-${idx}`}
                            >
                              {/* Indent spacer (chevron col) */}
                              <div style={{ width: COL.toggle }} className="flex-shrink-0" />
                              {/* Empty RFQ # col — indent line */}
                              <div style={{ width: COL.number }} className="flex items-center flex-shrink-0 px-2">
                                <div className="w-px h-4 bg-border/60 mr-2" />
                              </div>
                              {/* Supplier name in title col */}
                              <div style={{ width: COL.title }} className="flex items-center flex-shrink-0 px-2">
                                <span className="text-xs text-foreground truncate font-medium">{name}</span>
                              </div>
                              {/* Project col spacer */}
                              {showProject && <div style={{ width: COL.project }} className="flex-shrink-0 px-2" />}
                              {/* Suppliers col spacer */}
                              <div style={{ width: COL.suppliers }} className="flex-shrink-0 px-2" />
                              {/* Quote valid until (due date col) */}
                              <div style={{ width: COL.dueDate }} className="flex items-center flex-shrink-0 px-2">
                                <span className="text-xs text-muted-foreground">
                                  {quote?.validUntil
                                    ? formatDate(quote.validUntil)
                                    : <span className="text-muted-foreground/40">—</span>}
                                </span>
                              </div>
                              {/* Quote status */}
                              <div style={{ width: COL.status }} className="flex items-center flex-shrink-0 px-2">
                                <QuoteStatusChip status={quote?.status ?? "pending"} />
                              </div>
                              {/* Quote amount (created col) */}
                              <div style={{ width: COL.created }} className="flex items-center flex-shrink-0 px-2">
                                <span className={cn(
                                  "text-xs tabular-nums font-medium",
                                  quote && quote.totalAmount > 0 ? "text-foreground" : "text-muted-foreground/40"
                                )}>
                                  {quote && quote.totalAmount > 0
                                    ? formatCurrency(quote.totalAmount)
                                    : "—"}
                                </span>
                              </div>
                              {/* View link */}
                              <div style={{ width: COL.actions }} className="flex items-center justify-center flex-shrink-0">
                                <button
                                  type="button"
                                  className="p-1 rounded hover-elevate text-muted-foreground"
                                  onClick={(e) => { e.stopPropagation(); handleNavigate(rfq.id); }}
                                  title="Open RFQ"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
