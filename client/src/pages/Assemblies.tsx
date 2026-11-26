import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ChevronRight, Layers, Plus, Search, Archive } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/EmptyState";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { AssemblyWithComponents } from "@shared/schema";
import { assemblyRateBreakdown } from "@shared/assemblies";
import { dollarsToCents, formatCents } from "@shared/money";

/**
 * Assemblies — company recipes that drop into an estimate as one line with
 * their components underneath (shared/assemblies.ts). Lives under Templates.
 */
export default function Assemblies() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  const { data: assemblies = [], isLoading } = useQuery<AssemblyWithComponents[]>({
    queryKey: ["/api/assemblies", { includeArchived: showArchived }],
    queryFn: async () => {
      const res = await fetch(`/api/assemblies${showArchived ? "?includeArchived=true" : ""}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load assemblies");
      return res.json();
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      return apiRequest("/api/assemblies", "POST", { name: "New assembly", unitType: "m2", components: [] }) as Promise<AssemblyWithComponents>;
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["/api/assemblies"] });
      navigate(`/assemblies/${created.id}`);
    },
    onError: (e: Error) => toast({ title: "Couldn't create the assembly", description: e.message, variant: "destructive" }),
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return assemblies;
    return assemblies.filter((a) =>
      a.name.toLowerCase().includes(q) ||
      (a.description ?? "").toLowerCase().includes(q) ||
      a.components.some((c) => c.name.toLowerCase().includes(q)),
    );
  }, [assemblies, search]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 px-4 pt-3 pb-1 flex-shrink-0">
        <button className="text-xs text-muted-foreground hover:text-foreground" onClick={() => navigate("/templates")}>
          Templates
        </button>
        <ChevronRight className="h-3 w-3 text-muted-foreground/50 flex-shrink-0" />
        <span className="text-xs font-medium text-foreground" data-testid="text-page-title">Assemblies</span>
      </div>

      <div className="border border-border rounded-t-lg bg-card flex-shrink-0">
        <div className="h-9 flex items-center justify-between px-3 gap-2">
          <div className="relative w-64">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search assemblies or components…"
              className="h-6 pl-7 text-xs"
              data-testid="input-search-assemblies"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <button
              className={`h-6 w-auto px-2 text-xs border rounded-md flex items-center gap-1 hover-elevate active-elevate-2 ${
                showArchived ? "bg-primary/10 text-primary border-primary/20" : "border-border/50 text-muted-foreground"
              }`}
              onClick={() => setShowArchived((v) => !v)}
              data-testid="button-toggle-archived"
            >
              <Archive className="h-3 w-3" />
              Archived
            </button>
            <button
              className="h-6 w-auto px-2 text-xs border rounded-md bg-primary text-white border-primary/20 hover:bg-primary/90 active-elevate-2 flex items-center gap-0.5 disabled:opacity-50"
              onClick={() => create.mutate()}
              disabled={create.isPending}
              data-testid="button-new-assembly"
            >
              <Plus className="h-3.5 w-3.5" />
              New assembly
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto border-x border-b border-border rounded-b-lg bg-card">
        {isLoading ? (
          <div className="p-3 space-y-2">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Layers}
            title={assemblies.length === 0 ? "No assemblies yet" : "Nothing matches"}
            description={
              assemblies.length === 0
                ? "An assembly is one estimate line — Slab Pour, per m² — that brings its materials, labour and hire with it. Change its quantity and they all rescale."
                : "Try a different search."
            }
          />
        ) : (
          <table className="w-full text-xs">
            <thead className="text-muted-foreground border-b border-border">
              <tr className="h-8">
                <th className="text-left font-medium px-3">Assembly</th>
                <th className="text-left font-medium px-3 w-20">Unit</th>
                <th className="text-right font-medium px-3 w-24">Components</th>
                <th className="text-right font-medium px-3 w-48">Cost (ex GST)</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => {
                const { perUnitExTax, fixedExTax } = assemblyRateBreakdown(a.components, a.inputs);
                return (
                  <tr
                    key={a.id}
                    className="h-10 border-b border-border/60 hover:bg-primary/5 cursor-pointer"
                    onClick={() => navigate(`/assemblies/${a.id}`)}
                    data-testid={`row-assembly-${a.id}`}
                  >
                    <td className="px-3">
                      <div className="font-medium text-foreground flex items-center gap-1.5">
                        {a.name}
                        {a.isArchived && (
                          <span className="text-[10px] px-1 rounded bg-muted text-muted-foreground">Archived</span>
                        )}
                      </div>
                      {a.description && <div className="text-muted-foreground truncate max-w-xl">{a.description}</div>}
                    </td>
                    <td className="px-3 text-muted-foreground">{a.unitType}</td>
                    <td className="px-3 text-right tabular-nums">{a.components.length}</td>
                    <td className="px-3 text-right tabular-nums">
                      {formatCents(dollarsToCents(perUnitExTax), { alwaysShowDecimals: true })} / {a.unitType}
                      {fixedExTax > 0 && (
                        <span className="text-muted-foreground"> + {formatCents(dollarsToCents(fixedExTax))} fixed</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
