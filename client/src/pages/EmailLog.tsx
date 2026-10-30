import { useEffect, useMemo, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { type ColumnDef } from "@tanstack/react-table";
import { format, isThisYear, isToday } from "date-fns";
import { ChevronRight, Filter, Loader2, Mail, Paperclip, Search, X } from "lucide-react";
import { DataTable, type DataTableColumnMeta } from "@/components/data-table/DataTable";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { cn } from "@/lib/utils";
import { getApiBaseUrl } from "@/lib/queryClient";
import { EmailStatusChip } from "@/components/email-log/EmailStatusChip";
import { EmailDetailSheet } from "@/components/email-log/EmailDetailSheet";
import {
  EMAIL_TYPE_OPTIONS,
  emailTypeLabel,
  type EmailLogListResponse,
  type EmailLogRow,
} from "@shared/emailLog";

type StatusTab = "all" | "attention" | "delivered" | "opened";

function sentLabel(iso: string) {
  const d = new Date(iso);
  if (isToday(d)) return format(d, "h:mm a");
  return format(d, isThisYear(d) ? "d MMM, h:mm a" : "d MMM yyyy");
}

/**
 * Every email Morada has sent for the company — and, more to the point, which
 * ones did not arrive. Opens on "Needs attention" when there is something in
 * it, because that is the reason anyone comes here.
 */
export default function EmailLog() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const selectedId = useMemo(() => new URLSearchParams(search).get("id"), [search]);

  const [tab, setTab] = useState<StatusTab>("all");
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [type, setType] = useState("");
  const [projectId, setProjectId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const params = useMemo(() => {
    const p = new URLSearchParams();
    if (tab !== "all") p.set("status", tab);
    if (debouncedQ) p.set("q", debouncedQ);
    if (type) p.set("type", type);
    if (projectId) p.set("projectId", projectId);
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    if (from || to) p.set("tz", Intl.DateTimeFormat().resolvedOptions().timeZone);
    return p.toString();
  }, [tab, debouncedQ, type, projectId, from, to]);

  const list = useInfiniteQuery<EmailLogListResponse>({
    queryKey: ["/api/email-deliveries", "list", params],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const p = new URLSearchParams(params);
      if (pageParam) p.set("cursor", pageParam as string);
      const res = await fetch(`${getApiBaseUrl()}/api/email-deliveries?${p}`, { credentials: "include" });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || "Failed to load the email log");
      return res.json();
    },
    getNextPageParam: (last) => last.nextCursor,
    // A log is only useful if it is current — the global default never refetches.
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  const first = list.data?.pages[0];
  const rows = useMemo(() => list.data?.pages.flatMap((p) => p.rows) ?? [], [list.data]);
  const trackingEnabled = first?.trackingEnabled ?? true;
  const summary = first?.summary;

  // Land on the problems when there are any — once, on first load only.
  const [landed, setLanded] = useState(false);
  useEffect(() => {
    if (landed || !summary) return;
    setLanded(true);
    if (summary.attention > 0 && !selectedId) setTab("attention");
  }, [summary, landed, selectedId]);

  const { data: projects = [] } = useQuery<Array<{ id: string; name: string }>>({ queryKey: ["/api/projects"] });
  const projectOptions = useMemo(
    () => projects.map((p) => ({ value: p.id, label: p.name })).sort((a, b) => a.label.localeCompare(b.label)),
    [projects],
  );

  const activeFilters = [type, projectId, from || to].filter(Boolean).length;

  const openEmail = (id: string | null) => {
    navigate(id ? `/emails?id=${id}` : "/emails", { replace: !!selectedId && !!id });
  };

  const columns = useMemo<ColumnDef<EmailLogRow, unknown>[]>(() => {
    const cols: (ColumnDef<EmailLogRow, unknown> & { meta?: DataTableColumnMeta })[] = [
      {
        id: "sentAt",
        header: "Sent",
        accessorFn: (r) => r.sentAt,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground whitespace-nowrap" title={format(new Date(row.original.sentAt), "d MMM yyyy, h:mm:ss a")}>
            {sentLabel(row.original.sentAt)}
          </span>
        ),
        size: 120,
        meta: { defaultWidth: 120, headerLabel: "Sent", pinned: true },
      },
      {
        id: "status",
        header: "Status",
        accessorFn: (r) => r.status,
        cell: ({ row }) => <EmailStatusChip row={row.original} trackingEnabled={trackingEnabled} />,
        size: 140,
        meta: { defaultWidth: 140, headerLabel: "Status" },
      },
      {
        id: "to",
        header: "To",
        accessorFn: (r) => r.toAddresses.join(", "),
        cell: ({ row }) => (
          <span className="text-xs truncate block" title={row.original.toAddresses.join(", ")}>
            {row.original.toAddresses[0] ?? "—"}
            {row.original.toAddresses.length > 1 && (
              <span className="text-muted-foreground"> +{row.original.toAddresses.length - 1}</span>
            )}
          </span>
        ),
        size: 220,
        meta: { defaultWidth: 220, headerLabel: "To" },
      },
      {
        id: "subject",
        header: "Subject",
        accessorFn: (r) => r.subject ?? "",
        cell: ({ row }) => (
          <span className="flex items-center gap-1.5 min-w-0 text-xs">
            <span className="truncate">{row.original.subject || "(no subject)"}</span>
            {row.original.attachmentCount > 0 && (
              <Paperclip className="h-3 w-3 text-muted-foreground flex-shrink-0" aria-label="Has attachments" />
            )}
          </span>
        ),
        size: 340,
        meta: { defaultWidth: 340, headerLabel: "Subject", flex: true },
      },
      {
        id: "type",
        header: "About",
        accessorFn: (r) => emailTypeLabel(r.contextType),
        cell: ({ row }) => (
          <span className="text-xs truncate block">
            <span className="text-muted-foreground">{emailTypeLabel(row.original.contextType)}</span>
            {row.original.contextRef && <span className="ml-1">{row.original.contextRef}</span>}
          </span>
        ),
        size: 180,
        meta: { defaultWidth: 180, headerLabel: "About" },
      },
      {
        id: "project",
        header: "Project",
        accessorFn: (r) => r.projectName ?? "",
        cell: ({ row }) => (
          <span className="text-xs truncate block text-muted-foreground">{row.original.projectName ?? "—"}</span>
        ),
        size: 180,
        meta: { defaultWidth: 180, headerLabel: "Project" },
      },
      {
        id: "sender",
        header: "Sent by",
        accessorFn: (r) => r.senderName ?? "",
        cell: ({ row }) => (
          <span className="text-xs truncate block text-muted-foreground">{row.original.senderName ?? "Automatic"}</span>
        ),
        size: 140,
        meta: { defaultWidth: 140, headerLabel: "Sent by" },
      },
    ];
    return cols;
  }, [trackingEnabled]);

  const tabs: Array<{ id: StatusTab; label: string; count?: number; alert?: boolean }> = [
    { id: "all", label: "All" },
    { id: "attention", label: "Needs attention", count: summary?.attention, alert: (summary?.attention ?? 0) > 0 },
    { id: "delivered", label: "Delivered" },
    { id: "opened", label: "Opened" },
  ];

  const clearFilters = () => {
    setType("");
    setProjectId("");
    setFrom("");
    setTo("");
  };

  return (
    <div className="flex h-full flex-col" data-testid="page-email-log">
      <div className="flex items-center gap-1 px-4 pt-3 pb-1 flex-shrink-0">
        <span className="text-xs text-muted-foreground">Resources</span>
        <ChevronRight className="h-3 w-3 text-muted-foreground/50 flex-shrink-0" />
        <span className="text-xs font-medium text-foreground" data-testid="text-page-title">Emails</span>
        {first && !first.scopeAll && (
          <span className="ml-2 text-xs text-muted-foreground">· showing emails you sent</span>
        )}
      </div>

      <div className="border border-border rounded-t-lg bg-card flex-shrink-0">
        <div className="h-9 flex items-center justify-between px-3 gap-2">
          <div className="flex items-center gap-1 min-w-0 overflow-x-auto">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  "h-6 w-auto px-2 text-xs border rounded-md flex items-center gap-1 whitespace-nowrap",
                  tab === t.id
                    ? "bg-primary/10 text-primary border-primary/20"
                    : "border-border/50 text-muted-foreground hover-elevate active-elevate-2",
                )}
                data-testid={`tab-emails-${t.id}`}
              >
                {t.label}
                {t.count !== undefined && t.count > 0 && (
                  <span
                    className={cn(
                      "min-w-[16px] h-4 px-1 rounded-full text-[10px] leading-4 font-semibold text-center",
                      t.alert ? "bg-status-danger-bg text-status-danger" : "bg-muted text-muted-foreground",
                    )}
                  >
                    {t.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search address or subject"
                className="h-6 w-48 pl-6 pr-2 text-xs border border-border/50 rounded-md bg-transparent focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
                data-testid="input-email-search"
              />
            </div>
            <Popover open={filtersOpen} onOpenChange={setFiltersOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="relative h-6 w-6 border border-border/50 rounded-md text-muted-foreground hover-elevate active-elevate-2 flex items-center justify-center"
                  aria-label="Filters"
                  data-testid="button-email-filters"
                >
                  <Filter className="h-3 w-3" />
                  {activeFilters > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] px-1 rounded-full bg-primary text-white text-[9px] leading-[14px] font-semibold">
                      {activeFilters}
                    </span>
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-72 space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs">About</Label>
                  <SearchableSelect
                    value={type}
                    onValueChange={setType}
                    options={EMAIL_TYPE_OPTIONS}
                    placeholder="Any kind of email"
                    allowClear
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Project</Label>
                  <SearchableSelect
                    value={projectId}
                    onValueChange={setProjectId}
                    options={projectOptions}
                    placeholder="Any project"
                    allowClear
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">From</Label>
                    <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} data-testid="input-email-from" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">To</Label>
                    <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} data-testid="input-email-to" />
                  </div>
                </div>
                {activeFilters > 0 && (
                  <button type="button" onClick={clearFilters} className="text-xs text-primary hover:underline flex items-center gap-1">
                    <X className="h-3 w-3" /> Clear filters
                  </button>
                )}
              </PopoverContent>
            </Popover>
          </div>
        </div>
        {!trackingEnabled && (
          <div className="px-3 py-1.5 border-t border-border bg-status-warning-bg/40 text-xs text-status-warning" data-testid="banner-tracking-off">
            Delivery tracking isn't switched on yet, so emails show as Sent with no way to tell whether they arrived. Bounces will
            appear here once the Resend webhook is connected.
          </div>
        )}
      </div>

      <div className="flex-1 overflow-auto border-x border-b border-border rounded-b-lg bg-card">
        {list.isLoading ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground text-sm gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading emails…
          </div>
        ) : list.error ? (
          <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
            {(list.error as Error).message}
          </div>
        ) : (
          <>
            <DataTable
              data={rows}
              columns={columns}
              storageKey="email-log"
              rowKey={(r) => r.id}
              onRowClick={(r) => openEmail(r.id)}
              isRowSelected={(r) => r.id === selectedId}
              emptyState={
                <div className="flex flex-col items-center justify-center h-48 text-center">
                  <Mail className="h-10 w-10 mb-3 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">
                    {tab === "attention" ? "Nothing needs attention — every recent email arrived." : "No emails match"}
                  </p>
                </div>
              }
            />
            {list.hasNextPage && (
              <div className="flex justify-center py-3">
                <button
                  type="button"
                  onClick={() => list.fetchNextPage()}
                  disabled={list.isFetchingNextPage}
                  className="h-6 px-2 text-xs border border-border/50 rounded-md text-muted-foreground hover-elevate active-elevate-2 flex items-center gap-1"
                  data-testid="button-email-load-more"
                >
                  {list.isFetchingNextPage && <Loader2 className="h-3 w-3 animate-spin" />}
                  Load older emails
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <EmailDetailSheet
        id={selectedId}
        trackingEnabled={trackingEnabled}
        onClose={() => openEmail(null)}
        onOpenEmail={(id) => openEmail(id)}
      />
    </div>
  );
}
