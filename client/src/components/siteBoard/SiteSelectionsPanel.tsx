import { useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, ShieldCheck } from "lucide-react";
import { SITE_SELECTION_FIELDS, type SiteSelectionField } from "@shared/siteBoard";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

interface SiteSelectionRow {
  id: string;
  name: string;
  room: string | null;
  category: string | null;
  status: string;
  showOnSite: boolean;
}

interface SiteSettings {
  selectionFields: Record<SiteSelectionField, boolean>;
  selections: SiteSelectionRow[];
}

const CHIP = "h-6 w-auto px-2 text-xs border rounded-md border-border/50 text-muted-foreground hover-elevate active-elevate-2 flex items-center gap-1 disabled:opacity-50";

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  pending: "With client",
  selected: "Chosen",
  approved: "Approved",
  ordered: "Ordered",
  received: "Received",
};

/**
 * Site board → Selections: which selections the public site QR page lists,
 * and which of their details it shows. The server leaves anything switched
 * off out of the page's data, so "off" really is off.
 */
export function SiteSelectionsPanel({ projectId }: { projectId: string }) {
  const { toast } = useToast();
  const key = [`/api/projects/${projectId}/site-settings`];
  const { data, isLoading } = useQuery<SiteSettings>({ queryKey: key });

  const patchCache = (fn: (d: SiteSettings) => SiteSettings) => {
    const prev = queryClient.getQueryData<SiteSettings>(key);
    if (prev) queryClient.setQueryData<SiteSettings>(key, fn(prev));
    return { prev };
  };
  const rollback = (ctx?: { prev?: SiteSettings }) => {
    if (ctx?.prev) queryClient.setQueryData(key, ctx.prev);
    toast({ title: "Couldn't save that change", variant: "destructive" });
  };

  const setField = useMutation({
    mutationFn: (patch: Partial<Record<SiteSelectionField, boolean>>) =>
      apiRequest(`/api/projects/${projectId}/site-settings`, "PATCH", { selectionFields: patch }),
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: key });
      return patchCache((d) => ({ ...d, selectionFields: { ...d.selectionFields, ...patch } }));
    },
    onError: (_e, _v, ctx) => rollback(ctx),
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  const setOnSite = useMutation({
    mutationFn: (v: { ids: string[]; showOnSite: boolean }) =>
      apiRequest(`/api/projects/${projectId}/site-selections`, "PATCH", v),
    onMutate: async ({ ids, showOnSite }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const set = new Set(ids);
      return patchCache((d) => ({ ...d, selections: d.selections.map((s) => (set.has(s.id) ? { ...s, showOnSite } : s)) }));
    },
    onError: (_e, _v, ctx) => rollback(ctx),
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  const rows = data?.selections ?? [];
  const onCount = rows.filter((s) => s.showOnSite).length;
  const draftsOn = rows.filter((s) => s.showOnSite && s.status === "draft");

  const byRoom = useMemo(() => {
    const out = new Map<string, SiteSelectionRow[]>();
    for (const s of rows) {
      const k = s.room || "General";
      if (!out.has(k)) out.set(k, []);
      out.get(k)!.push(s);
    }
    return Array.from(out.entries());
  }, [rows]);

  if (isLoading || !data) {
    return <div className="flex items-center justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="p-4 space-y-5" data-testid="site-selections-panel">
      <section>
        <h3 className="text-xs font-semibold text-foreground mb-1">Details shown</h3>
        <p className="text-xs text-muted-foreground mb-2.5">
          For every selection on the site QR. Name, room and whether it's confirmed always show.
        </p>
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-x-4 gap-y-2">
          {SITE_SELECTION_FIELDS.map(({ key: field, label, hint }) => (
            <label key={field} className="flex items-start gap-2 cursor-pointer select-none" title={hint}>
              <Checkbox
                checked={data.selectionFields[field]}
                onCheckedChange={(v) => setField.mutate({ [field]: v === true })}
                className="mt-0.5"
                data-testid={`checkbox-site-field-${field}`}
              />
              <span className="min-w-0">
                <span className="block text-xs">{label}</span>
                <span className="block text-[10px] text-muted-foreground leading-tight">{hint}</span>
              </span>
            </label>
          ))}
        </div>
        <p className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <ShieldCheck className="w-3.5 h-3.5 text-[hsl(var(--sage))]" />
          Never shown: prices, cost, allowances, internal notes, and options hidden from the client.
        </p>
      </section>

      <section>
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="min-w-0">
            <h3 className="text-xs font-semibold text-foreground">Selections on the site QR</h3>
            <p className="text-xs text-muted-foreground" data-testid="text-site-selection-count">
              {rows.length === 0 ? "This project has no selections yet." : `${onCount} of ${rows.length} showing`}
              {draftsOn.length > 0 && (
                <span className="text-[hsl(var(--coral))]"> · {draftsOn.length} still in draft</span>
              )}
            </p>
          </div>
          {rows.length > 0 && (
            <div className="flex items-center gap-1.5 shrink-0">
              {draftsOn.length > 0 && (
                <button type="button" className={CHIP} onClick={() => setOnSite.mutate({ ids: draftsOn.map((s) => s.id), showOnSite: false })} data-testid="button-hide-drafts">
                  Hide drafts
                </button>
              )}
              <button type="button" className={CHIP} disabled={onCount === rows.length} onClick={() => setOnSite.mutate({ ids: rows.map((s) => s.id), showOnSite: true })} data-testid="button-show-all-selections">
                Show all
              </button>
              <button type="button" className={CHIP} disabled={onCount === 0} onClick={() => setOnSite.mutate({ ids: rows.map((s) => s.id), showOnSite: false })} data-testid="button-hide-all-selections">
                Hide all
              </button>
            </div>
          )}
        </div>

        {rows.length > 0 && (
          <table className="w-full text-xs border-t border-border">
            <thead>
              <tr className="text-muted-foreground border-b border-border">
                <th className="text-left font-normal px-3 h-8">Selection</th>
                <th className="text-left font-normal px-3 h-8 w-36">Category</th>
                <th className="text-left font-normal px-3 h-8 w-28">Status</th>
                <th className="text-left font-normal px-3 h-8 w-24">On site</th>
              </tr>
            </thead>
            {byRoom.map(([room, list]) => (
              <tbody key={room}>
                <tr>
                  <td colSpan={4} className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{room}</td>
                </tr>
                {list.map((s) => (
                  <tr key={s.id} className={cn("border-b border-border/60 hover:bg-muted/40", !s.showOnSite && "text-muted-foreground")} data-testid={`row-site-selection-${s.id}`}>
                    <td className="px-3 h-9 truncate max-w-0 w-full">{s.name}</td>
                    <td className="px-3 truncate">{s.category || ""}</td>
                    <td className="px-3 whitespace-nowrap">
                      <span className={cn(s.status === "draft" && "text-[hsl(var(--coral))]")}>{STATUS_LABEL[s.status] ?? s.status}</span>
                    </td>
                    <td className="px-3">
                      <Switch
                        checked={s.showOnSite}
                        onCheckedChange={(showOnSite) => setOnSite.mutate({ ids: [s.id], showOnSite })}
                        aria-label={`Show ${s.name} on the site QR`}
                        data-testid={`switch-site-selection-${s.id}`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        )}
      </section>
    </div>
  );
}
