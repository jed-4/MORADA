import { useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Receipt } from "lucide-react";
import { useProject } from "@/contexts/ProjectContext";
import { usePermission } from "@/hooks/use-permission";
import { cn } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { SearchableSelect } from "@/components/ui/searchable-select";

/** A client invoice linked to a schedule item (client_invoices.schedule_item_id). */
export interface ScheduleInvoiceLink {
  scheduleItemId: string;
  invoiceId: string;
  invoiceNumber: string | null;
  name: string;
  status: string;
  totalAmount: number;
}

export const scheduleInvoiceLinksKey = (projectId: string | undefined) => [`/api/projects/${projectId}/schedule-invoice-links`];

/**
 * The job's invoices linked to schedule items, by item. Only fetched for people
 * whose role includes "Progress Claims" — the server refuses everyone else, and
 * the schedule payload itself never carries invoice details.
 */
export function useScheduleInvoiceLinks(projectIdOverride?: string) {
  const { currentProject } = useProject();
  const projectId = projectIdOverride ?? (currentProject && !currentProject.isBusiness ? currentProject.id : undefined);
  const canView = usePermission("projects.invoices", "view");
  const { data = [] } = useQuery<ScheduleInvoiceLink[]>({
    queryKey: scheduleInvoiceLinksKey(projectId),
    enabled: !!projectId && canView,
  });
  const byItem = useMemo(() => {
    const map = new Map<string, ScheduleInvoiceLink[]>();
    for (const l of data) map.set(l.scheduleItemId, [...(map.get(l.scheduleItemId) ?? []), l]);
    return map;
  }, [data]);
  return { projectId, canView, byItem };
}

// client_invoices.status: draft | approved | sent | partial | paid | overdue
const STATUS_CLASS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  paid: "bg-status-success-bg text-status-success",
  partial: "bg-status-warning-bg text-status-warning",
  overdue: "bg-destructive/10 text-destructive",
};

const shortMoney = (cents: number) => {
  const d = Math.abs(cents) / 100;
  return d >= 1000 ? `$${Math.round(d / 1000)}k` : `$${Math.round(d)}`;
};
const STATUS_LABEL: Record<string, string> = { draft: "Draft", approved: "Approved", sent: "Sent", partial: "Part paid", paid: "Paid", overdue: "Overdue" };

/** "Claim 3 · $174k · Draft" — opens the invoice. */
export function ScheduleInvoiceBadge({
  link,
  projectId,
  className,
  compact,
}: {
  link: ScheduleInvoiceLink;
  projectId: string;
  className?: string;
  /** Icon only (details on hover) — for narrow name columns like the Gantt's. */
  compact?: boolean;
}) {
  const label = link.invoiceNumber || link.name || "Invoice";
  const full = `${label} · ${shortMoney(link.totalAmount)} · ${STATUS_LABEL[link.status] ?? link.status}`;
  return (
    <Link
      href={`/projects/${projectId}/client-invoices/${link.invoiceId}`}
      onClick={(e) => e.stopPropagation()}
      title={`${compact ? `${full}\n` : ""}${link.name}${link.invoiceNumber ? ` (${link.invoiceNumber})` : ""} — claimed when this item finishes`}
      className={cn(
        "inline-flex items-center gap-1 h-4 px-1.5 rounded text-[10px] leading-none whitespace-nowrap flex-shrink-0 hover:underline",
        STATUS_CLASS[link.status] ?? "bg-primary/10 text-primary",
        className,
      )}
      data-testid={`badge-schedule-invoice-${link.invoiceId}`}
    >
      <Receipt className="h-2.5 w-2.5" />
      {!compact && full}
    </Link>
  );
}

/** Every invoice linked to one schedule item, or nothing. */
export function ScheduleItemInvoiceBadges({ itemId, className, compact }: { itemId: string; className?: string; compact?: boolean }) {
  const { projectId, byItem } = useScheduleInvoiceLinks();
  const links = byItem.get(itemId);
  if (!projectId || !links?.length) return null;
  return (
    <>
      {links.map((l) => (
        <ScheduleInvoiceBadge key={l.invoiceId} link={l} projectId={projectId} className={className} compact={compact} />
      ))}
    </>
  );
}

/**
 * The schedule item dialog's "Invoices" section: the claims this item
 * triggers, and linking another one. Hidden without "Progress Claims"; linking
 * or unlinking needs its edit action (the server enforces both).
 */
export function ScheduleItemInvoicesSection({ itemId, projectId: projectIdProp }: { itemId: string; projectId?: string }) {
  const { projectId, canView, byItem } = useScheduleInvoiceLinks(projectIdProp);
  const canEdit = usePermission("projects.invoices", "edit");
  const { toast } = useToast();
  const { data: invoices = [], isLoading: invoicesLoading } = useQuery<Array<{ id: string; name: string; invoiceNumber: string | null; status: string; totalAmount: number; scheduleItemId?: string | null }>>({
    queryKey: ["/api/client-invoices", { projectId }],
    queryFn: async () => {
      const r = await fetch(`/api/client-invoices?projectId=${projectId}`, { credentials: "include" });
      if (!r.ok) throw new Error(`Failed to load invoices (${r.status})`);
      return r.json();
    },
    enabled: !!projectId && canView,
  });
  const link = useMutation({
    mutationFn: ({ invoiceId, scheduleItemId }: { invoiceId: string; scheduleItemId: string | null }) =>
      apiRequest(`/api/client-invoices/${invoiceId}`, "PATCH", { scheduleItemId }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: scheduleInvoiceLinksKey(projectId) }),
        queryClient.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === "string" && (q.queryKey[0].startsWith("/api/client-invoices") || q.queryKey[0].startsWith("/api/cashflow")) }),
      ]);
    },
    onError: (e: any) => toast({ title: e?.message?.replace(/^\d+:\s*/, "") || "Couldn't change the link", variant: "destructive" }),
  });

  if (!canView || !projectId) return null;
  const linked = byItem.get(itemId) ?? [];
  const options = invoices
    .filter((i) => i.status !== "cancelled" && i.scheduleItemId !== itemId)
    .map((i) => ({
      value: i.id,
      label: i.invoiceNumber ? `${i.invoiceNumber} — ${i.name}` : i.name,
      description: `${shortMoney(i.totalAmount)} · ${STATUS_LABEL[i.status] ?? i.status}${i.scheduleItemId ? " · linked to another item" : ""}`,
    }));

  return (
    <div className="space-y-2" data-testid="section-schedule-item-invoices">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium flex items-center gap-1.5"><Receipt className="h-3.5 w-3.5" />Invoices</p>
        <Link href={`/projects/${projectId}/client-invoices/new`} className="text-xs text-primary hover:underline">New claim</Link>
      </div>
      <p className="text-xs text-muted-foreground">Claims raised when this item finishes. A linked draft is forecast then, and moves with the schedule.</p>
      {linked.length > 0 && (
        <div className="space-y-1">
          {linked.map((l) => (
            <div key={l.invoiceId} className="flex items-center justify-between gap-2 rounded-md border px-2 py-1">
              <ScheduleInvoiceBadge link={l} projectId={projectId} />
              <span className="text-xs text-muted-foreground truncate flex-1">{l.name}</span>
              {canEdit && (
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-destructive"
                  disabled={link.isPending}
                  onClick={() => link.mutate({ invoiceId: l.invoiceId, scheduleItemId: null })}
                  data-testid={`button-unlink-invoice-${l.invoiceId}`}
                >
                  Unlink
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {canEdit && (
        <SearchableSelect
          options={options}
          value=""
          onValueChange={(v) => v && link.mutate({ invoiceId: v, scheduleItemId: itemId })}
          placeholder={invoicesLoading ? "Loading invoices…" : options.length ? "Link an invoice…" : "No other invoices on this job"}
          searchPlaceholder="Search invoices…"
          disabled={options.length === 0 || link.isPending}
          triggerClassName="h-8 text-xs"
          data-testid="select-link-invoice"
        />
      )}
    </div>
  );
}
