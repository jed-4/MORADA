import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import { Loader2, Plus, Search, Truck } from "lucide-react";
import { DataTable, type DataTableColumnMeta } from "@/components/data-table/DataTable";
import { AssetDetail } from "@/components/assets/AssetDetail";
import { AssetDialog } from "@/components/assets/AssetDialogs";
import {
  ASSETS_KEY,
  ASSIGNABLE_USERS_KEY,
  DueChip,
  meter,
  relativeDays,
  shortDate,
  type AssignableUser,
} from "@/components/assets/assetsShared";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { usePermission } from "@/hooks/use-permission";
import { cn } from "@/lib/utils";
import type { AssetListRow } from "@shared/schema";
import {
  ASSET_STATUS_LABELS,
  ASSET_TYPES,
  ASSET_TYPE_LABELS,
  assetDueSummary,
  isHeavyVehicle,
  todayKey,
  type AssetDueSummary,
  type AssetStatus,
  type AssetType,
} from "@shared/assets";

type Row = AssetListRow & { due: AssetDueSummary };
type TypeFilter = "all" | AssetType;

const INACTIVE: string[] = ["archived", "sold"];

export default function BusinessAssets() {
  const [location, navigate] = useLocation();
  const detailId = location.match(/^\/business\/assets\/([^/]+)/)?.[1];
  if (detailId) return <AssetDetail assetId={detailId} />;
  return <AssetRegister onOpen={(id) => navigate(`/business/assets/${id}`)} />;
}

function AssetRegister({ onOpen }: { onOpen: (id: string) => void }) {
  const canAdd = usePermission("business.assets", "add");
  const { data: assets = [], isLoading, error } = useQuery<AssetListRow[]>({ queryKey: ASSETS_KEY });
  const { data: people = [] } = useQuery<AssignableUser[]>({ queryKey: ASSIGNABLE_USERS_KEY });
  const [adding, setAdding] = useState(false);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [showInactive, setShowInactive] = useState(false);
  const [search, setSearch] = useState("");

  const today = todayKey();
  const nameOf = (id: string | null) => (id ? people.find((p) => p.id === id)?.displayName ?? "Former team member" : null);

  const withDue = useMemo<Row[]>(
    () =>
      assets.map((a) => ({
        ...a,
        // An archived or sold asset has nothing due, whatever its rows say.
        due: INACTIVE.includes(a.status)
          ? { state: "ok", overdue: 0, dueSoon: 0, next: null }
          : assetDueSummary(a, a.complianceItems, a.serviceSchedules, today),
      })),
    [assets, today],
  );

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return withDue
      .filter((a) => showInactive || !INACTIVE.includes(a.status))
      .filter((a) => typeFilter === "all" || a.assetType === typeFilter)
      .filter((a) => !q || [a.name, a.rego, a.make, a.model, a.vin, nameOf(a.assignedUserId)].some((v) => v?.toLowerCase().includes(q)))
      // Overdue first, then due soon, then A–Z.
      .sort((a, b) => {
        const rank = { overdue: 0, due_soon: 1, ok: 2 } as const;
        return rank[a.due.state] - rank[b.due.state] || a.name.localeCompare(b.name);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [withDue, showInactive, typeFilter, search, people]);

  const active = withDue.filter((a) => !INACTIVE.includes(a.status));
  const overdue = active.filter((a) => a.due.state === "overdue").length;
  const dueSoon = active.filter((a) => a.due.state === "due_soon").length;
  const offRoad = active.filter((a) => a.status === "off_road").length;
  const typeCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const a of withDue) if (showInactive || !INACTIVE.includes(a.status)) c[a.assetType] = (c[a.assetType] ?? 0) + 1;
    return c;
  }, [withDue, showInactive]);

  const columns = useMemo<ColumnDef<Row, unknown>[]>(
    () => [
      {
        id: "name",
        header: "Asset",
        accessorFn: (r) => r.name,
        cell: ({ row }) => {
          const a = row.original;
          const sub = [a.year, a.make, a.model].filter(Boolean).join(" ");
          return (
            <div className="flex flex-col justify-center h-full min-w-0 py-1">
              <span className="text-xs font-medium truncate">{a.name}</span>
              {sub && sub !== a.name && <span className="text-data text-muted-foreground truncate">{sub}</span>}
            </div>
          );
        },
        size: 240,
        meta: { defaultWidth: 240, headerLabel: "Asset", flex: true } satisfies DataTableColumnMeta,
      },
      {
        id: "rego",
        header: "Rego",
        accessorFn: (r) => r.rego ?? "",
        cell: ({ row }) => (
          <span className="text-xs font-mono">
            {row.original.rego ?? "—"}
            {row.original.rego && row.original.regoState && <span className="text-muted-foreground font-sans"> {row.original.regoState}</span>}
          </span>
        ),
        size: 110,
        meta: { defaultWidth: 110, headerLabel: "Rego" } satisfies DataTableColumnMeta,
      },
      {
        id: "type",
        header: "Type",
        accessorFn: (r) => r.assetType,
        cell: ({ row }) => (
          <span className="text-xs">
            {ASSET_TYPE_LABELS[row.original.assetType as AssetType] ?? row.original.assetType}
            {isHeavyVehicle(row.original.gvmKg) && <span className="text-muted-foreground"> · heavy</span>}
          </span>
        ),
        size: 110,
        meta: { defaultWidth: 110, headerLabel: "Type" } satisfies DataTableColumnMeta,
      },
      {
        id: "assigned",
        header: "Assigned to",
        accessorFn: (r) => nameOf(r.assignedUserId) ?? "",
        cell: ({ row }) => <span className="text-xs truncate">{nameOf(row.original.assignedUserId) ?? <span className="text-muted-foreground">Pool</span>}</span>,
        size: 150,
        meta: { defaultWidth: 150, headerLabel: "Assigned to" } satisfies DataTableColumnMeta,
      },
      {
        id: "meter",
        header: "Meter",
        accessorFn: (r) => r.currentMeter ?? -1,
        cell: ({ row }) => <span className="text-xs tabular-nums">{meter(row.original.currentMeter, row.original.meterType)}</span>,
        size: 110,
        meta: { defaultWidth: 110, align: "right", headerLabel: "Meter" } satisfies DataTableColumnMeta,
      },
      {
        id: "due",
        header: "Next due",
        enableSorting: false,
        cell: ({ row }) => {
          const n = row.original.due.next;
          if (!n) return <span className="text-xs text-muted-foreground">Nothing set</span>;
          return (
            <div className="flex items-center gap-2 h-full min-w-0">
              <DueChip state={n.state}>{n.state === "ok" ? "OK" : n.state === "overdue" ? "Overdue" : "Due soon"}</DueChip>
              <span className="text-xs truncate">
                {n.label}
                <span className="text-muted-foreground">
                  {" "}
                  {n.daysLeft != null ? `${relativeDays(n.daysLeft)} · ${shortDate(n.dueDate)}` : n.meterLeft != null ? `${n.meterLeft.toLocaleString("en-AU")} to go` : ""}
                </span>
              </span>
            </div>
          );
        },
        size: 280,
        meta: { defaultWidth: 280, headerLabel: "Next due" } satisfies DataTableColumnMeta,
      },
      {
        id: "status",
        header: "Status",
        accessorFn: (r) => r.status,
        cell: ({ row }) => (
          <Badge variant={row.original.status === "off_road" ? "destructive" : "secondary"} className="text-[11px] no-default-active-elevate">
            {ASSET_STATUS_LABELS[row.original.status as AssetStatus] ?? row.original.status}
          </Badge>
        ),
        size: 100,
        meta: { defaultWidth: 100, headerLabel: "Status" } satisfies DataTableColumnMeta,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [people],
  );

  if (isLoading) {
    return <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }
  if (error) return <p className="py-16 text-center text-sm text-muted-foreground">Couldn't load the asset register.</p>;

  const filterButtons: { id: TypeFilter; label: string }[] = [
    { id: "all", label: "All" },
    ...ASSET_TYPES.filter((t) => typeCounts[t]).map((t) => ({ id: t as TypeFilter, label: `${ASSET_TYPE_LABELS[t]}s` })),
  ];

  return (
    <div className="flex flex-col gap-4 p-4" data-testid="page-business-assets">
      {active.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="On the books" value={active.length} />
          <Stat label="Overdue" value={overdue} tone={overdue ? "overdue" : undefined} />
          <Stat label="Due in 30 days" value={dueSoon} tone={dueSoon ? "due_soon" : undefined} />
          <Stat label="Off road" value={offRoad} tone={offRoad ? "overdue" : undefined} />
        </div>
      )}

      <Card className="overflow-hidden min-w-0" data-testid="card-asset-register">
        <div className="flex items-center justify-between gap-3 flex-wrap px-4 py-3 border-b border-border">
          <div>
            <h3 className="text-sm font-semibold">Asset register</h3>
            <p className="text-xs text-muted-foreground">Vehicles, trailers, plant and tools — rego, insurance, servicing, and who has them.</p>
          </div>
          {canAdd && (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="h-6 w-auto px-2 text-xs border rounded-md bg-primary text-white border-primary/20 hover:bg-primary/90 active-elevate-2 flex items-center gap-0.5"
              data-testid="button-add-asset"
            >
              <Plus className="w-3.5 h-3.5" />Add asset
            </button>
          )}
        </div>

        {assets.length === 0 ? (
          <div className="py-12 flex flex-col items-center gap-2 text-center">
            <Truck className="w-8 h-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No assets yet.</p>
            <p className="text-xs text-muted-foreground max-w-sm">
              Add your utes, trucks and trailers, then their rego and service intervals. Morada flags what's coming due.
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 flex-wrap px-4 py-2 border-b border-border">
              <div className="flex items-center gap-1">
                {filterButtons.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => setTypeFilter(b.id)}
                    className={cn(
                      "h-6 px-2 text-xs rounded-md border",
                      typeFilter === b.id ? "bg-primary/10 border-primary/30 text-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground",
                    )}
                    data-testid={`filter-asset-type-${b.id}`}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
              <div className="relative ml-auto">
                <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search name, rego, driver"
                  className="h-7 w-[220px] pl-7 text-xs"
                  data-testid="input-asset-search"
                />
              </div>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Switch checked={showInactive} onCheckedChange={setShowInactive} data-testid="switch-asset-inactive" />
                Archived &amp; sold
              </label>
            </div>
            {rows.length === 0 ? (
              <p className="py-10 text-center text-xs text-muted-foreground">Nothing matches.</p>
            ) : (
              <DataTable
                data={rows}
                columns={columns}
                storageKey="business-assets"
                rowKey={(r) => r.id}
                rowHeight={44}
                rowClassName={(r) => cn("cursor-pointer", INACTIVE.includes(r.status) && "opacity-50")}
                onRowClick={(r) => onOpen(r.id)}
              />
            )}
          </>
        )}
      </Card>

      <AssetDialog open={adding} asset={null} onClose={() => setAdding(false)} onCreated={(a) => onOpen(a.id)} />
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "overdue" | "due_soon" }) {
  return (
    <Card className="px-4 py-3">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="flex items-center gap-2">
        <span className="text-lg font-semibold tabular-nums">{value}</span>
        {tone && <DueChip state={tone} />}
      </div>
    </Card>
  );
}
