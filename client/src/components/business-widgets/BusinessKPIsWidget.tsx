import { useMemo, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { GripVertical, Lock, RefreshCw, ChevronDown, AlertCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { WidgetEmpty } from "@/components/ui/WidgetEmpty";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { WidgetProps } from "@/types/widgets";
import { useFinancialPermission } from "@/hooks/use-permission";
import { cn } from "@/lib/utils";
import {
  KPI_DEFINITIONS,
  KPI_KEY_ORDER,
  DEFAULT_SELECTED_KPIS,
  ACCENT_VAR,
  formatKPIValue,
  type KPIKey,
  type KPIPeriod,
  type KPIDefinition,
} from "./kpiDefinitions";
import { getPeriodLabel } from "./kpiPeriod";

type CashBalanceType = "statement" | "xero";

interface CashAccount {
  id: string;
  name: string;
  statementBalance: number;
  xeroBalance: number;
}

interface CashKpiResponse {
  accounts?: CashAccount[];
  totalStatement?: number;
  totalXero?: number;
  error?: string;
}

interface CashConfig {
  accountIds: string[];
  balanceType: CashBalanceType;
}

function readCashConfig(config: Record<string, any>): CashConfig {
  const raw = (config?.cashXero ?? {}) as Partial<CashConfig>;
  const accountIds = Array.isArray(raw.accountIds)
    ? raw.accountIds.filter((s): s is string => typeof s === "string")
    : [];
  const balanceType: CashBalanceType =
    raw.balanceType === "xero" ? "xero" : "statement";
  return { accountIds, balanceType };
}

function useXeroStatus() {
  return useQuery<{ connected: boolean }>({
    queryKey: ["/api/xero/status"],
    staleTime: 60_000,
  });
}

function SortableKPIRow({
  kpiKey,
  checked,
  onToggle,
  xeroConnected,
  cashConfigSlot,
}: {
  kpiKey: KPIKey;
  checked: boolean;
  onToggle: (next: boolean) => void;
  xeroConnected: boolean;
  cashConfigSlot?: React.ReactNode;
}) {
  const def = KPI_DEFINITIONS[kpiKey];
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: kpiKey,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  const accentColor = `hsl(var(${ACCENT_VAR[def.accent]}))`;
  const xeroGated = !!def.requiresXero && !xeroConnected;
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "rounded-md border border-bp-border bg-bp-card",
        xeroGated && "opacity-70",
      )}
      data-testid={`kpi-edit-row-${kpiKey}`}
    >
      <div className="flex items-center gap-2 px-2 py-1.5">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="cursor-grab text-bp-muted hover-elevate rounded p-0.5"
          data-testid={`kpi-drag-${kpiKey}`}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
        <Checkbox
          checked={checked}
          onCheckedChange={(v) => onToggle(!!v)}
          data-testid={`kpi-check-${kpiKey}`}
        />
        <span
          className="h-2.5 w-2.5 rounded-full shrink-0"
          style={{ backgroundColor: accentColor }}
          aria-hidden
        />
        <div className="flex-1 min-w-0 flex items-baseline gap-1.5">
          <span className="text-sm truncate">{def.label}</span>
          {def.labelDetail && (
            <span className="text-[10px] text-bp-muted uppercase tracking-wide shrink-0">
              {def.labelDetail}
            </span>
          )}
        </div>
        {xeroGated && (
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="inline-flex items-center gap-1 text-[10px] text-bp-amber">
              <AlertCircle className="h-2.5 w-2.5" />
              Requires Xero
            </span>
            <Link
              href="/settings?tab=integrations"
              className="text-[10px] underline text-bp-card-foreground hover:text-primary"
              data-testid={`kpi-connect-xero-${kpiKey}`}
            >
              Connect
            </Link>
          </div>
        )}
        {def.financialGated && !xeroGated && (
          <span className="inline-flex items-center gap-1 text-[10px] text-bp-amber shrink-0">
            <Lock className="h-2.5 w-2.5" />
            Financial
          </span>
        )}
      </div>
      {cashConfigSlot}
    </div>
  );
}

function CashConfigPanel({
  cashConfig,
  onChange,
  xeroConnected,
}: {
  cashConfig: CashConfig;
  onChange: (next: CashConfig) => void;
  xeroConnected: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { data, isLoading, isError } = useQuery<CashKpiResponse>({
    queryKey: ["/api/kpis/cash-xero"],
    queryFn: async () => {
      const r = await fetch("/api/kpis/cash-xero", { credentials: "include" });
      if (!r.ok) {
        if (r.status === 503) return { error: "xero_unavailable" };
        throw new Error(`Failed (${r.status})`);
      }
      return r.json();
    },
    enabled: open && xeroConnected,
    staleTime: 60_000,
  });

  if (!xeroConnected) return null;

  const accounts = data?.accounts ?? [];
  const selected = new Set(cashConfig.accountIds);

  const toggleAccount = (id: string, on: boolean) => {
    const next = new Set(selected);
    if (on) next.add(id);
    else next.delete(id);
    onChange({ ...cashConfig, accountIds: Array.from(next) });
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="w-full flex items-center justify-between gap-2 px-2 py-1.5 border-t border-bp-border text-[11px] text-bp-muted hover-elevate"
          data-testid="kpi-cash-config-toggle"
        >
          <span>Configure accounts &amp; balance type</span>
          <ChevronDown
            className={cn("h-3 w-3 transition-transform", open && "rotate-180")}
          />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="px-2 pb-2 pt-1 flex flex-col gap-2">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wide text-bp-muted">
              Bank accounts
            </span>
            {isLoading && <Skeleton className="h-12 w-full bg-bp-subtle" />}
            {isError && (
              <span className="text-[11px] text-bp-muted">
                Couldn't load accounts.
              </span>
            )}
            {!isLoading && !isError && data?.error === "xero_unavailable" && (
              <span className="text-[11px] text-bp-muted">Xero unavailable.</span>
            )}
            {!isLoading && !isError && accounts.length === 0 && !data?.error && (
              <span className="text-[11px] text-bp-muted">
                No bank accounts found in Xero.
              </span>
            )}
            <div className="flex flex-col gap-1">
              {accounts.map((a) => {
                const balance = cashConfig.balanceType === "xero"
                  ? a.xeroBalance
                  : a.statementBalance;
                return (
                  <label
                    key={a.id}
                    className="flex items-center gap-2 text-xs px-1.5 py-1 rounded hover-elevate"
                    data-testid={`kpi-cash-account-${a.id}`}
                  >
                    <Checkbox
                      checked={selected.has(a.id)}
                      onCheckedChange={(v) => toggleAccount(a.id, !!v)}
                    />
                    <span className="flex-1 truncate">{a.name}</span>
                    <span className="text-bp-muted tabular-nums">
                      {formatKPIValue(balance, "currency")}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wide text-bp-muted">
              Balance type
            </span>
            <RadioGroup
              value={cashConfig.balanceType}
              onValueChange={(v) =>
                onChange({ ...cashConfig, balanceType: v as CashBalanceType })
              }
              className="flex flex-col gap-1"
            >
              <label className="flex items-center gap-2 text-xs">
                <RadioGroupItem value="statement" data-testid="kpi-cash-radio-statement" />
                Statement balance
              </label>
              <label className="flex items-center gap-2 text-xs">
                <RadioGroupItem value="xero" data-testid="kpi-cash-radio-xero" />
                Xero balance
              </label>
            </RadioGroup>
            <p className="text-[10px] text-bp-muted leading-snug">
              Xero balance includes unreconciled transactions; statement balance
              matches the bank.
            </p>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

interface KPIResponse {
  value?: number | null;
  trend?: Array<{ month: string; variance: number }>;
  totalStatement?: number | null;
  totalXero?: number | null;
  accounts?: CashAccount[];
  error?: string;
}

function XeroUnavailableValue({ onRetry }: { onRetry: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-bp-muted font-normal">
      Xero unavailable
      <button
        type="button"
        onClick={onRetry}
        className="rounded p-0.5 hover-elevate text-bp-muted"
        aria-label="Retry"
        data-testid="kpi-xero-retry"
      >
        <RefreshCw className="h-3 w-3" />
      </button>
    </span>
  );
}

function KPICell({
  def,
  period,
  hasFinancialAccess,
  xeroConnected,
  cashConfig,
}: {
  def: KPIDefinition;
  period: KPIPeriod;
  hasFinancialAccess: boolean;
  xeroConnected: boolean;
  cashConfig: CashConfig;
}) {
  const gated = def.financialGated && !hasFinancialAccess;
  const xeroGated = !!def.requiresXero && !xeroConnected;
  const isCash = def.key === "cash_xero";

  const cashIdsParam = isCash && cashConfig.accountIds.length > 0
    ? cashConfig.accountIds.slice().sort().join(",")
    : "";
  const url = isCash
    ? `${def.endpoint}${cashIdsParam ? `?accountIds=${encodeURIComponent(cashIdsParam)}` : ""}`
    : def.periodFilter
    ? `${def.endpoint}?period=${period}`
    : def.endpoint;
  const queryKey = isCash
    ? [def.endpoint, cashIdsParam]
    : def.periodFilter
    ? [def.endpoint, period]
    : [def.endpoint];

  const query = useQuery<KPIResponse>({
    queryKey,
    queryFn: async () => {
      const r = await fetch(url, { credentials: "include" });
      if (!r.ok) {
        if (r.status === 503) {
          const body: unknown = await r.json().catch(() => null);
          if (
            body !== null &&
            typeof body === "object" &&
            "error" in body &&
            (body as { error?: unknown }).error === "xero_unavailable"
          ) {
            return { error: "xero_unavailable", value: null };
          }
        }
        throw new Error(`Failed to load (${r.status})`);
      }
      return r.json();
    },
    enabled: !gated && !xeroGated,
    retry: 1,
    staleTime: 60_000,
  });

  const { data, isLoading, isError, refetch } = query;

  const accentColor = `hsl(var(${ACCENT_VAR[def.accent]}))`;
  const xeroUnavailable = data?.error === "xero_unavailable" || xeroGated;

  // Cash-specific computed values.
  const cashAccounts = isCash ? data?.accounts ?? [] : [];
  const cashValue = isCash
    ? cashConfig.balanceType === "xero"
      ? data?.totalXero ?? null
      : data?.totalStatement ?? null
    : null;
  const cashUnreconciledTotal = isCash
    ? cashAccounts.reduce(
        (s, a) => s + Math.abs((a.xeroBalance ?? 0) - (a.statementBalance ?? 0)),
        0,
      )
    : 0;
  const cashHasUnreconciled = isCash && cashUnreconciledTotal > 0.005;

  const renderValue = () => {
    if (gated) return <span className="text-bp-muted">—</span>;
    if (xeroGated) {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs text-bp-muted font-normal">
          <Link
            href="/settings?tab=integrations"
            className="underline"
            data-testid={`kpi-cell-connect-${def.key}`}
          >
            Connect Xero
          </Link>
        </span>
      );
    }
    if (isLoading) return <Skeleton className="h-6 w-20 bg-bp-subtle" />;
    if (xeroUnavailable) {
      return <XeroUnavailableValue onRetry={() => refetch()} />;
    }
    if (isError) return <span className="text-bp-muted">—</span>;
    const v = isCash ? cashValue : data?.value ?? null;
    return formatKPIValue(v, def.format);
  };

  return (
    <div
      className="relative px-4 py-2.5 flex flex-col gap-1 min-h-[64px]"
      data-testid={`kpi-${def.key}`}
    >
      <div
        className="absolute left-0 top-0 bottom-0 w-[3px]"
        style={{ backgroundColor: accentColor }}
        aria-hidden
      />
      <div className="flex items-baseline justify-between gap-2 text-bp-muted">
        <div className="flex items-baseline gap-1.5 min-w-0">
          <span className="text-[9px] font-medium uppercase tracking-wide truncate text-bp-muted">
            {def.label}
          </span>
          {def.labelDetail && (
            <span className="text-[9px] uppercase tracking-wide shrink-0">
              {def.labelDetail}
            </span>
          )}
        </div>
        {gated && <Lock className="h-3 w-3 text-bp-amber shrink-0" />}
        {isCash && cashHasUnreconciled && !xeroUnavailable && !isLoading && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className="inline-flex items-center text-bp-amber cursor-help"
                data-testid="kpi-cash-unreconciled"
              >
                <AlertCircle className="h-3 w-3" />
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              {formatKPIValue(cashUnreconciledTotal, "currency")} unreconciled
              between statement and Xero balances.
            </TooltipContent>
          </Tooltip>
        )}
      </div>
      <div
        className="text-[20px] font-bold leading-tight text-bp-card-foreground"
        data-testid={`kpi-value-${def.key}`}
      >
        {renderValue()}
      </div>
      {isCash && !xeroUnavailable && !isLoading && cashAccounts.length > 0 && (
        <div className="text-[10px] text-bp-muted mt-auto">
          {cashAccounts.length} {cashAccounts.length === 1 ? "account" : "accounts"} ·{" "}
          {cashConfig.balanceType === "xero" ? "Xero" : "Statement"}
        </div>
      )}
      {!isCash && def.periodFilter && !gated && !xeroGated && (
        <div className="text-[10px] text-bp-muted mt-auto">{getPeriodLabel(period)}</div>
      )}
    </div>
  );
}

export default function BusinessKPIsWidget({ widget, onUpdate, isConfiguring, onCloseConfig }: WidgetProps) {
  const hasFinancialAccess = useFinancialPermission();
  const { data: xeroStatus } = useXeroStatus();
  const xeroConnected = !!xeroStatus?.connected;

  const config = widget.config || {};
  const period = (config.period as KPIPeriod) || "month";
  const cashConfig = useMemo(() => readCashConfig(config), [config]);
  const selectedKeys: KPIKey[] = useMemo(() => {
    const fromConfig = Array.isArray(config.selectedKpis) ? (config.selectedKpis as KPIKey[]) : null;
    const valid = (fromConfig || []).filter((k): k is KPIKey => k in KPI_DEFINITIONS);
    return valid.length > 0 ? valid : DEFAULT_SELECTED_KPIS;
  }, [config.selectedKpis]);

  const [editOpen, setEditOpen] = useState(false);
  const [editKeys, setEditKeys] = useState<KPIKey[]>(selectedKeys);
  const [editCashConfig, setEditCashConfig] = useState<CashConfig>(cashConfig);

  useEffect(() => {
    if (editOpen) {
      setEditKeys(selectedKeys);
      setEditCashConfig(cashConfig);
    }
  }, [editOpen, selectedKeys, cashConfig]);

  const columnsRaw = config.columns;
  const columns: 1 | 2 | 3 | 4 = ([1, 2, 3, 4].includes(columnsRaw)
    ? columnsRaw
    : 4) as 1 | 2 | 3 | 4;

  useEffect(() => {
    if (isConfiguring) setEditOpen(true);
  }, [isConfiguring]);

  const handleEditOpenChange = (open: boolean) => {
    setEditOpen(open);
    if (!open && isConfiguring) {
      onCloseConfig?.();
    }
  };

  const saveSelection = () => {
    const ordered = editKeys.length > 0 ? editKeys : DEFAULT_SELECTED_KPIS;
    onUpdate?.({
      ...widget,
      config: {
        ...config,
        selectedKpis: ordered,
        cashXero: editCashConfig,
      },
    });
    handleEditOpenChange(false);
  };

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const toggleKey = (key: KPIKey, checked: boolean) => {
    setEditKeys((prev) => {
      if (checked) {
        if (prev.includes(key)) return prev;
        return [...prev, key];
      }
      return prev.filter((k) => k !== key);
    });
  };

  const editorOrder: KPIKey[] = useMemo(() => {
    const remaining = KPI_KEY_ORDER.filter((k) => !editKeys.includes(k));
    return [...editKeys, ...remaining];
  }, [editKeys]);

  const gridColsClass: Record<2 | 3 | 4, string> = {
    2: "grid-cols-2",
    3: "grid-cols-3",
    4: "grid-cols-4",
  };
  const gridDividerClass: Record<2 | 3 | 4, string> = {
    2: "[&>*:not(:nth-child(2n+1))]:border-l [&>*]:border-bp-border",
    3: "[&>*:not(:nth-child(3n+1))]:border-l [&>*]:border-bp-border",
    4: "[&>*:not(:nth-child(4n+1))]:border-l [&>*]:border-bp-border",
  };
  const oneColScroll = columns === 1 && selectedKeys.length > 6;

  const renderCells = () =>
    selectedKeys.map((key) => {
      const def = KPI_DEFINITIONS[key];
      if (!def) return null;
      return (
        <KPICell
          key={key}
          def={def}
          period={period}
          hasFinancialAccess={hasFinancialAccess}
          xeroConnected={xeroConnected}
          cashConfig={cashConfig}
        />
      );
    });

  return (
    <div className="flex h-full flex-col" data-testid="business-kpis-widget">
      {selectedKeys.length === 0 ? (
        <WidgetEmpty
          title="No KPIs selected"
          message="Open the menu and choose Edit KPIs to add metrics."
        />
      ) : columns === 1 ? (
        <div
          className={cn(
            "flex-1",
            oneColScroll && "max-h-[400px] overflow-y-auto",
          )}
        >
          <div className="flex flex-col [&>*:not(:last-child)]:border-b [&>*]:border-bp-border">
            {renderCells()}
          </div>
        </div>
      ) : (
        <div className="flex-1">
          <div
            className={cn(
              "grid content-start",
              gridColsClass[columns],
              gridDividerClass[columns],
            )}
          >
            {renderCells()}
          </div>
        </div>
      )}

      <Dialog open={editOpen} onOpenChange={handleEditOpenChange}>
        <DialogContent className="max-w-md" data-testid="kpi-edit-dialog">
          <DialogHeader>
            <DialogTitle>Edit KPIs</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[420px] pr-2">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={(e) => {
                const { active, over } = e;
                if (!over || active.id === over.id) return;
                const oldIndex = editorOrder.indexOf(active.id as KPIKey);
                const newIndex = editorOrder.indexOf(over.id as KPIKey);
                if (oldIndex < 0 || newIndex < 0) return;
                const reordered = arrayMove(editorOrder, oldIndex, newIndex);
                setEditKeys(reordered.filter((k) => editKeys.includes(k)));
              }}
            >
              <SortableContext items={editorOrder} strategy={verticalListSortingStrategy}>
                <div className="flex flex-col gap-1.5">
                  {editorOrder.map((key) => {
                    const isCashRow = key === "cash_xero";
                    const showCashConfig =
                      isCashRow && editKeys.includes("cash_xero") && xeroConnected;
                    return (
                      <SortableKPIRow
                        key={key}
                        kpiKey={key}
                        checked={editKeys.includes(key)}
                        onToggle={(v) => toggleKey(key, v)}
                        xeroConnected={xeroConnected}
                        cashConfigSlot={
                          showCashConfig ? (
                            <CashConfigPanel
                              cashConfig={editCashConfig}
                              onChange={setEditCashConfig}
                              xeroConnected={xeroConnected}
                            />
                          ) : null
                        }
                      />
                    );
                  })}
                </div>
              </SortableContext>
            </DndContext>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => handleEditOpenChange(false)} data-testid="kpi-edit-cancel">
              Cancel
            </Button>
            <Button onClick={saveSelection} data-testid="kpi-edit-save">
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
