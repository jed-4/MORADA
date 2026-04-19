// NOTE(data-table-migration): The previous bespoke RFQs table supported
// expandable rows showing supplier quote breakdowns inline plus an attachment
// preview modal. Both behaviours are preserved on the RFQ detail page
// (/rfqs/:id) and were intentionally not carried over to this list view to
// keep parity with other list pages migrated to the shared DataTable.
// Row click navigates to the detail page where the full quote/attachment UX
// lives.
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
  Search,
  Download,
  Send,
  ClipboardList,
  ArrowRight,
  Paperclip,
  Columns3,
} from "lucide-react";
import { type ColumnDef } from "@tanstack/react-table";
import {
  DataTable,
  DataTableColumnPicker,
  type DataTableColumnMeta,
} from "@/components/data-table/DataTable";
import { type Rfq, type Project } from "@shared/schema";
import { ProjectIcon } from "@/components/ProjectIcon";
import { StatusBadge } from "@/components/StatusBadge";
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

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft", sent: "Sent", pending: "Pending",
  quoted: "Quoted", accepted: "Accepted", declined: "Declined",
};

function StatusChip({ status }: { status: string }) {
  return <StatusBadge status={status} label={STATUS_LABEL[status]} />;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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
  const [colPopoverOpen, setColPopoverOpen] = useState(false);

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
              <span className="text-[10px] font-semibold">{count}</span>
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
            className="h-6 w-auto px-2 text-xs border rounded-md bg-[#A890D4] text-white border-[#A890D4]/20 hover:bg-[#A890D4]/90 active-elevate-2 flex items-center gap-0.5 flex-shrink-0"
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
                    ? "text-foreground border-[#A890D4]"
                    : "text-muted-foreground hover:text-foreground border-transparent"
                )}
                data-testid={`tab-status-${status.key}`}
              >
                {status.label}
                {status.key !== "all" && count > 0 && (
                  <span className={cn(
                    "inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-sm text-[10px] font-semibold",
                    isActive
                      ? "bg-[#A890D4]/20 text-[#8b6bb1]"
                      : "bg-muted text-muted-foreground"
                  )}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Row 3 — Search + columns */}
        <div className="h-8 flex items-center justify-between px-3 gap-2">
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
          <Popover open={colPopoverOpen} onOpenChange={setColPopoverOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="h-6 px-2 text-xs border rounded-md flex items-center gap-1 hover-elevate"
                data-testid="button-columns"
              >
                <Columns3 className="w-3 h-3" />
                <span>Columns</span>
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <DataTableColumnPicker storageKey="rfqs" columns={pickerColumns} />
            </PopoverContent>
          </Popover>
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
              <div className="w-20 h-20 rounded-full bg-[#A890D4]/10 flex items-center justify-center mb-6">
                <ClipboardList className="w-10 h-10 text-[#A890D4]" />
              </div>
              <h3 className="text-xl font-semibold mb-2">No Requests for Quote yet</h3>
              <p className="text-muted-foreground text-center max-w-md mb-8 text-sm">
                Request quotes from your suppliers to get competitive pricing on materials and services for your projects.
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  onClick={() => setLocation(getNavigationPath("/rfqs/new"))}
                  className="bg-[#A890D4] hover:bg-[#A890D4]/90 text-white gap-2"
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
            />
          </div>
        )}
      </div>
    </div>
  );
}
