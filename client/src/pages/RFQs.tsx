import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
  MoreVertical,
  Search,
  Download,
  Send,
  ClipboardList,
  ArrowRight,
  Paperclip,
  Columns3,
  Loader2,
  ExternalLink,
  EyeOff,
  ImageIcon,
  FileIcon,
} from "lucide-react";
import { useToolbarVisible } from "@/hooks/useToolbarVisible";
import { type ColumnDef } from "@tanstack/react-table";
import {
  DataTable,
  DataTableColumnPicker,
  type DataTableColumnMeta,
} from "@/components/data-table/DataTable";
import { type Rfq, type Project, type RfqQuote } from "@shared/schema";
import { ProjectIcon } from "@/components/ProjectIcon";
import { StatusBadge } from "@/components/StatusBadge";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

// ── Attachment types & helpers ────────────────────────────────────────────────

interface Attachment {
  name: string;
  url: string;
  size?: number;
}

function isImage(name: string) {
  return /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(name);
}

function isPdf(name: string) {
  return /\.pdf$/i.test(name);
}

function formatBytes(bytes?: number) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

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

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft", sent: "Sent", pending: "Pending",
  quoted: "Quoted", accepted: "Accepted", declined: "Declined",
};

function StatusChip({ status }: { status: string }) {
  return <StatusBadge status={status} label={STATUS_LABEL[status]} />;
}

const QUOTE_LABEL: Record<string, string> = {
  pending: "Awaiting", accepted: "Accepted", declined: "Declined",
};

function QuoteStatusChip({ status }: { status: string }) {
  return <StatusBadge status={status} label={QUOTE_LABEL[status] ?? "Awaiting"} />;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(date: Date | string | null | undefined) {
  if (!date) return null;
  return format(new Date(date), "d MMM yyyy");
}

// ── Expanded supplier-quote panel ────────────────────────────────────────────
// Lazy-fetches the quotes for a given RFQ when its row is expanded and renders
// one row per supplier with status, amount, and an attachments badge that
// opens the attachment preview modal.
function RfqQuotesPanel({
  rfq,
  project,
  showProject,
  onOpenAttachments,
  onNavigate,
}: {
  rfq: Rfq;
  project: Project | undefined;
  showProject: boolean;
  onOpenAttachments: (label: string, attachments: Attachment[]) => void;
  onNavigate: (rfqId: string) => void;
}) {
  const { data: quotes, isLoading } = useQuery<RfqQuote[]>({
    queryKey: ["/api/rfqs", rfq.id, "quotes"],
    queryFn: async () => {
      const res = await fetch(`/api/rfqs/${rfq.id}/quotes`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const supplierRows = rfq.supplierNames.map((name, idx) => {
    const supplierId = rfq.supplierIds[idx] ?? null;
    const quote = quotes?.find(
      (q) => (supplierId && q.supplierId === supplierId) || q.supplierName === name,
    ) ?? null;
    return { name, supplierId, quote };
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-4 h-8 text-xs text-muted-foreground">
        <Loader2 className="w-3 h-3 animate-spin" />
        Loading quotes…
      </div>
    );
  }

  if (supplierRows.length === 0) {
    return (
      <div className="flex items-center px-4 h-8 text-xs text-muted-foreground italic">
        No suppliers added to this RFQ
      </div>
    );
  }

  return (
    <div className="divide-y divide-border/30">
      {supplierRows.map(({ name, quote }, idx) => {
        const files = (quote?.attachments as Attachment[] | undefined) ?? [];
        return (
          <div
            key={idx}
            className="flex items-center px-4 h-8 cursor-pointer hover-elevate"
            onClick={() => onNavigate(rfq.id)}
            data-testid={`row-supplier-${rfq.id}-${idx}`}
          >
            {/* Supplier name */}
            <div className="flex items-center min-w-[200px] flex-shrink-0 pr-3">
              <span className="text-xs text-foreground truncate font-medium">{name}</span>
            </div>
            {/* Project */}
            {showProject && (
              <div className="flex items-center gap-1.5 min-w-[140px] flex-shrink-0 pr-3">
                {project && (
                  <>
                    <ProjectIcon
                      icon={project.icon || "Briefcase"}
                      color={project.color}
                      className="w-3 h-3 flex-shrink-0"
                    />
                    <span className="text-xs text-muted-foreground truncate">{project.name}</span>
                  </>
                )}
              </div>
            )}
            {/* Due date */}
            <div className="flex items-center min-w-[88px] flex-shrink-0 pr-3">
              <span className="text-xs text-muted-foreground">
                {formatDate(rfq.dueDate) ?? <span className="text-muted-foreground/40">—</span>}
              </span>
            </div>
            {/* Sent date */}
            <div className="flex items-center min-w-[88px] flex-shrink-0 pr-3">
              <span className="text-xs text-muted-foreground">
                {rfq.sentAt
                  ? formatDate(rfq.sentAt)
                  : <span className="text-muted-foreground/30">Not sent</span>}
              </span>
            </div>
            {/* Seen — placeholder for future email open tracking */}
            <div className="flex items-center justify-center min-w-[40px] flex-shrink-0">
              <span title="Email open tracking — coming soon">
                <EyeOff className="w-3 h-3 text-muted-foreground/25" />
              </span>
            </div>
            {/* Attachments */}
            <div className="flex items-center justify-center min-w-[60px] flex-shrink-0">
              {files.length === 0 ? (
                <span className="text-muted-foreground/25"><Paperclip className="w-3 h-3" /></span>
              ) : (
                <button
                  type="button"
                  className="flex items-center gap-0.5 px-1.5 py-0.5 rounded hover-elevate text-[#8b6bb1]"
                  title={`${files.length} file${files.length !== 1 ? "s" : ""}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenAttachments(`${rfq.rfqNumber} — ${name}`, files);
                  }}
                  data-testid={`button-attachments-${rfq.id}-${idx}`}
                >
                  <Paperclip className="w-3 h-3" />
                  <span className="text-data font-semibold">{files.length}</span>
                </button>
              )}
            </div>
            {/* Quote status */}
            <div className="flex items-center min-w-[88px] flex-shrink-0 pr-3 pl-3">
              <QuoteStatusChip status={quote?.status ?? "pending"} />
            </div>
            {/* Quote amount */}
            <div className="flex items-center min-w-[96px] flex-shrink-0 pr-3">
              <span className={cn(
                "text-xs tabular-nums font-medium",
                quote && quote.totalAmount > 0 ? "text-foreground" : "text-muted-foreground/40"
              )}>
                {quote && quote.totalAmount > 0 ? formatCurrency(quote.totalAmount) : "—"}
              </span>
            </div>
            <div className="flex items-center justify-center min-w-[24px] flex-shrink-0">
              <ExternalLink className="w-3 h-3 text-muted-foreground/40" />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function RFQs() {
  const [, setLocation] = useLocation();
  const params = useParams<{ projectId?: string }>();
  const projectIdFromUrl = params.projectId || "";

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [colPopoverOpen, setColPopoverOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const { toolbarVisible } = useToolbarVisible();

  useEffect(() => {
    if (isSearchOpen) {
      searchInputRef.current?.focus();
    }
  }, [isSearchOpen]);

  // Attachment preview modal
  const [attachmentModal, setAttachmentModal] = useState<{
    label: string;
    attachments: Attachment[];
  } | null>(null);
  const [activeAttachment, setActiveAttachment] = useState<Attachment | null>(null);
  const [previewError, setPreviewError] = useState(false);

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
    pending:  rfqs.filter((r) => (r.status as string) === "pending").length,
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

  const handleNavigate = (rfqId: string) => {
    setLocation(getNavigationPath(`/rfqs/${rfqId}`));
  };

  const showProject = !projectIdFromUrl;

  // ── DataTable column defs ───────────────────────────────────────────────
  const rfqColumns = useMemo<ColumnDef<Rfq, unknown>[]>(() => {
    const cols: (ColumnDef<Rfq, unknown> & { meta?: DataTableColumnMeta })[] = [
      {
        id: "rfqNumber",
        header: "ID",
        accessorFn: (r) => r.rfqNumber,
        cell: ({ row }) => (
          <div className="flex items-center gap-1.5" data-testid={`cell-number-${row.original.id}`}>
            <FileText className="w-3 h-3 text-muted-foreground flex-shrink-0" />
            <span className="text-xs font-semibold text-foreground">{row.original.rfqNumber}</span>
          </div>
        ),
        size: 110,
        meta: { defaultWidth: 110, headerLabel: "ID" },
      },
      {
        id: "title",
        header: "Title",
        accessorFn: (r) => r.title,
        cell: ({ row }) => (
          <span className="text-xs text-foreground truncate" data-testid={`cell-title-${row.original.id}`}>
            {row.original.title}
          </span>
        ),
        size: 240,
        meta: { defaultWidth: 240, headerLabel: "Title" },
      },
    ];

    if (showProject) {
      cols.push({
        id: "project",
        header: "Project",
        accessorFn: (r) => getProject(r.projectId)?.name ?? "",
        cell: ({ row }) => {
          const project = getProject(row.original.projectId);
          if (!project) return <span className="text-xs text-muted-foreground">—</span>;
          return (
            <div className="flex items-center gap-1.5" data-testid={`cell-project-${row.original.id}`}>
              <ProjectIcon
                icon={project.icon || "Briefcase"}
                color={project.color}
                className="w-3 h-3 flex-shrink-0"
              />
              <span className="text-xs text-muted-foreground truncate">{project.name}</span>
            </div>
          );
        },
        size: 160,
        meta: { defaultWidth: 160, headerLabel: "Project" },
      });
    }

    cols.push(
      {
        id: "suppliers",
        header: "Suppliers",
        accessorFn: (r) => r.supplierNames.join(", "),
        cell: ({ row }) => {
          const names = row.original.supplierNames;
          if (names.length === 0) {
            return <span className="text-xs text-muted-foreground/40">—</span>;
          }
          return (
            <span className="text-xs text-foreground truncate" data-testid={`cell-suppliers-${row.original.id}`}>
              {names.join(", ")}
            </span>
          );
        },
        size: 220,
        meta: { defaultWidth: 220, headerLabel: "Suppliers" },
      },
      {
        id: "dueDate",
        header: "Due Date",
        accessorFn: (r) => (r.dueDate ? new Date(r.dueDate).getTime() : 0),
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground" data-testid={`cell-due-${row.original.id}`}>
            {formatDate(row.original.dueDate) ?? <span className="text-muted-foreground/40">—</span>}
          </span>
        ),
        size: 100,
        meta: { defaultWidth: 100, headerLabel: "Due Date" },
      },
      {
        id: "sentAt",
        header: "Sent",
        accessorFn: (r) => (r.sentAt ? new Date(r.sentAt).getTime() : 0),
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground" data-testid={`cell-sent-${row.original.id}`}>
            {row.original.sentAt
              ? formatDate(row.original.sentAt)
              : <span className="text-muted-foreground/30">Not sent</span>}
          </span>
        ),
        size: 100,
        meta: { defaultWidth: 100, headerLabel: "Sent" },
      },
      {
        id: "status",
        header: "Status",
        accessorFn: (r) => r.status,
        cell: ({ row }) => <StatusChip status={row.original.status} />,
        size: 110,
        meta: { defaultWidth: 110, headerLabel: "Status" },
      },
      {
        id: "attachments",
        header: "Files",
        enableSorting: false,
        accessorFn: (r) => r.attachmentUrls.length,
        cell: ({ row }) => {
          const count = row.original.attachmentUrls.length;
          if (count === 0) {
            return <span className="text-muted-foreground/25"><Paperclip className="w-3 h-3" /></span>;
          }
          return (
            <span className="inline-flex items-center gap-0.5 text-[#8b6bb1]" data-testid={`cell-files-${row.original.id}`}>
              <Paperclip className="w-3 h-3" />
              <span className="text-data font-semibold">{count}</span>
            </span>
          );
        },
        size: 70,
        meta: { defaultWidth: 70, align: "center", headerLabel: "Files" },
      },
      {
        id: "createdAt",
        header: "Created",
        accessorFn: (r) => new Date(r.createdAt).getTime(),
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground" data-testid={`cell-created-${row.original.id}`}>
            {formatDate(row.original.createdAt)}
          </span>
        ),
        size: 100,
        meta: { defaultWidth: 100, headerLabel: "Created", defaultHidden: true },
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex items-center justify-center" data-testid={`cell-actions-${row.original.id}`}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  className="p-1 rounded hover-elevate text-muted-foreground"
                  data-testid={`button-rfq-actions-${row.original.id}`}
                >
                  <MoreHorizontal className="w-3.5 h-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={(e) => { e.stopPropagation(); handleNavigate(row.original.id); }}
                >
                  <FileText className="mr-2 h-4 w-4" />
                  View Details
                </DropdownMenuItem>
                <DropdownMenuItem onClick={(e) => e.stopPropagation()}>
                  <Download className="mr-2 h-4 w-4" />
                  Download PDF
                </DropdownMenuItem>
                {row.original.status === "draft" && (
                  <DropdownMenuItem onClick={(e) => e.stopPropagation()}>
                    <Send className="mr-2 h-4 w-4" />
                    Send RFQ
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ),
        size: 48,
        meta: { defaultWidth: 48, align: "center", pinned: true, headerLabel: "Actions" },
      },
    );

    return cols;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showProject, projects]);

  const pickerColumns = useMemo(() => {
    return rfqColumns
      .filter((c) => c.id !== "actions")
      .map((c) => {
        const meta = (c.meta as DataTableColumnMeta | undefined) ?? {};
        return {
          id: c.id as string,
          label: meta.headerLabel ?? (c.id as string),
          pinned: !!meta.pinned,
        };
      });
  }, [rfqColumns]);

  const openAttachments = (label: string, attachments: Attachment[]) => {
    setActiveAttachment(attachments[0] ?? null);
    setPreviewError(false);
    setAttachmentModal({ label, attachments });
  };

  const handleSelectAttachment = (file: Attachment) => {
    setActiveAttachment(file);
    setPreviewError(false);
  };

  return (
    <div className="flex flex-col h-full" data-testid="page-rfqs">

      {/* Unified header card */}
      <div className="mx-3 mt-3 rounded-lg border border-border bg-card flex-shrink-0 overflow-hidden">
        {/* Single h-9 toolbar row */}
        <div className="h-9 flex items-center px-3 gap-2">
          {/* Left: optional context prefix (only when global bar hidden) + status tabs + search */}
          <div className="flex items-center gap-1 min-w-0 flex-1 overflow-x-auto">
            {!toolbarVisible && (
              <span
                className="text-xs text-muted-foreground font-medium truncate flex-shrink-0 pr-2 mr-1 border-r border-border/50"
                data-testid="text-toolbar-context"
              >
                {currentProject ? currentProject.name : "RFQs"}
              </span>
            )}

            {STATUS_OPTIONS.map((status) => {
              const isActive = selectedStatus === status.key;
              const count = statusCounts[status.key as keyof typeof statusCounts];
              return (
                <button
                  key={status.key}
                  onClick={() => setSelectedStatus(status.key)}
                  className={cn(
                    "relative flex items-center gap-1.5 h-9 px-3 text-xs font-medium whitespace-nowrap transition-colors border-b-2 flex-shrink-0",
                    isActive
                      ? "text-foreground border-primary"
                      : "text-muted-foreground hover:text-foreground border-transparent"
                  )}
                  data-testid={`tab-status-${status.key}`}
                >
                  {status.label}
                  {status.key !== "all" && count > 0 && (
                    <span className={cn(
                      "inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-sm text-data font-semibold",
                      isActive
                        ? "bg-primary/20 text-[#8b6bb1]"
                        : "bg-muted text-muted-foreground"
                    )}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}

            {/* Search — icon-expand (input expands rightward) */}
            <div className="flex items-center flex-shrink-0 ml-1">
              <button
                type="button"
                onClick={() => setIsSearchOpen((o) => !o)}
                className={cn(
                  "h-6 w-6 flex items-center justify-center rounded-md border border-border/50 hover-elevate active-elevate-2",
                  isSearchOpen && "bg-primary/10 text-primary border-primary/20"
                )}
                data-testid="button-search-toggle"
                aria-label="Search"
              >
                <Search className="h-3 w-3" />
              </button>
              <Input
                ref={searchInputRef}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.preventDefault();
                    setSearchQuery("");
                    setIsSearchOpen(false);
                  }
                }}
                onBlur={() => {
                  if (!searchQuery) setIsSearchOpen(false);
                }}
                placeholder="Search RFQs…"
                className={cn(
                  "h-6 text-xs transition-all duration-200 overflow-hidden",
                  isSearchOpen
                    ? "w-48 ml-1 px-2 opacity-100"
                    : "w-0 ml-0 px-0 opacity-0 pointer-events-none border-0"
                )}
                data-testid="input-search-rfqs"
              />
            </div>
          </div>

          {/* Right side: Columns, Create RFQ, Options */}
          <div className="ml-auto flex items-center gap-1 flex-shrink-0">
            <Popover open={colPopoverOpen} onOpenChange={setColPopoverOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="h-6 w-6 flex items-center justify-center rounded-md border border-border/50 hover-elevate active-elevate-2"
                  data-testid="button-columns"
                  aria-label="Columns"
                >
                  <Columns3 className="h-3 w-3" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <DataTableColumnPicker storageKey="rfqs" columns={pickerColumns} />
              </PopoverContent>
            </Popover>

            <button
              type="button"
              className="h-6 w-auto px-2 text-xs border rounded-md bg-primary text-white border-primary/20 hover:bg-primary/90 active-elevate-2 flex items-center gap-0.5"
              onClick={() => setLocation(getNavigationPath("/rfqs/new"))}
              data-testid="button-create-rfq"
            >
              <Plus className="h-3 w-3" />
              <span>Create RFQ</span>
            </button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="h-6 w-6 flex items-center justify-center rounded-md border border-border/50 hover-elevate active-elevate-2"
                  data-testid="button-rfqs-options"
                  aria-label="More options"
                >
                  <MoreVertical className="h-3 w-3" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuItem disabled>No options</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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
              <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-6">
                <ClipboardList className="w-10 h-10 text-primary" />
              </div>
              <h3 className="text-xl font-semibold mb-2">No Requests for Quote yet</h3>
              <p className="text-muted-foreground text-center max-w-md mb-8 text-sm">
                Request quotes from your suppliers to get competitive pricing on materials and services for your projects.
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  onClick={() => setLocation(getNavigationPath("/rfqs/new"))}
                  className="bg-primary hover:bg-primary/90 text-white gap-2"
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
          <div className="rounded-lg border border-border bg-card overflow-hidden h-full">
            <DataTable
              data={filteredRFQs}
              columns={rfqColumns}
              storageKey="rfqs"
              legacyConfigKey="rfqs-column-config-v1"
              rowKey={(r) => r.id}
              onRowClick={(r) => handleNavigate(r.id)}
              renderExpandedPanel={(rfq) => (
                <RfqQuotesPanel
                  rfq={rfq}
                  project={getProject(rfq.projectId)}
                  showProject={showProject}
                  onOpenAttachments={openAttachments}
                  onNavigate={handleNavigate}
                />
              )}
            />
          </div>
        )}
      </div>

      {/* ── Attachment preview modal ── */}
      <Dialog
        open={!!attachmentModal}
        onOpenChange={(open) => {
          if (!open) {
            setAttachmentModal(null);
            setActiveAttachment(null);
          }
        }}
      >
        <DialogContent className="max-w-3xl w-full p-0 overflow-hidden flex flex-col gap-0" style={{ maxHeight: "80vh" }}>
          <DialogHeader className="px-4 py-3 border-b border-border/50 flex-shrink-0">
            <DialogTitle className="text-sm font-semibold flex items-center gap-2">
              <Paperclip className="w-3.5 h-3.5 text-[#8b6bb1]" />
              {attachmentModal?.label}
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-1 min-h-0">
            {/* Left — file list */}
            <div className="w-56 flex-shrink-0 border-r border-border/50 overflow-y-auto">
              {attachmentModal?.attachments.map((file, idx) => (
                <button
                  key={idx}
                  type="button"
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-2.5 text-left border-b border-border/30 hover-elevate",
                    activeAttachment?.url === file.url && "bg-primary/10"
                  )}
                  onClick={() => handleSelectAttachment(file)}
                  data-testid={`button-attachment-file-${idx}`}
                >
                  {isImage(file.name)
                    ? <ImageIcon className="w-3.5 h-3.5 text-sky-500 flex-shrink-0" />
                    : isPdf(file.name)
                    ? <FileText className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                    : <FileIcon className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />}
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs font-medium truncate">{file.name}</span>
                    {file.size && (
                      <span className="text-data text-muted-foreground">{formatBytes(file.size)}</span>
                    )}
                  </div>
                </button>
              ))}
            </div>

            {/* Right — preview pane */}
            <div className="flex-1 min-w-0 bg-muted/20 flex flex-col overflow-hidden">
              {activeAttachment ? (
                <>
                  {/* Header — file name + universal download */}
                  <div className="flex items-center justify-between px-3 py-2 border-b border-border/50 bg-background/40 flex-shrink-0">
                    <span className="text-xs text-muted-foreground truncate pr-2" data-testid="text-active-attachment">
                      {activeAttachment.name}
                    </span>
                    <a
                      href={activeAttachment.url}
                      download={activeAttachment.name}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 text-xs text-[#8b6bb1] hover:underline flex-shrink-0"
                      data-testid="link-download-active"
                    >
                      <Download className="w-3 h-3" />
                      Download
                    </a>
                  </div>

                  {/* Body — preview by file type, with fallback */}
                  <div className="flex-1 min-h-0 flex items-center justify-center overflow-auto">
                    {previewError ? (
                      <div className="flex flex-col items-center gap-3 text-muted-foreground p-8">
                        <FileIcon className="w-10 h-10 opacity-30" />
                        <p className="text-xs">Preview unavailable</p>
                      </div>
                    ) : isImage(activeAttachment.name) ? (
                      <img
                        src={activeAttachment.url}
                        alt={activeAttachment.name}
                        className="max-w-full max-h-full object-contain p-4"
                        onError={() => setPreviewError(true)}
                      />
                    ) : isPdf(activeAttachment.name) ? (
                      <iframe
                        src={activeAttachment.url}
                        className="w-full h-full border-0"
                        title={activeAttachment.name}
                        onError={() => setPreviewError(true)}
                      />
                    ) : (
                      <div className="flex flex-col items-center gap-3 text-muted-foreground p-8">
                        <FileIcon className="w-10 h-10 opacity-30" />
                        <p className="text-sm text-center">No inline preview for this file type.</p>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground">
                  Select a file to preview
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
