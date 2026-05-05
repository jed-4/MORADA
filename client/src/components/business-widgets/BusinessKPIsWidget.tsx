import { useMemo, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GripVertical, Pencil, Lock } from "lucide-react";
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

function SortableKPIRow({
  kpiKey,
  checked,
  onToggle,
}: {
  kpiKey: KPIKey;
  checked: boolean;
  onToggle: (next: boolean) => void;
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
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 rounded-md border border-bp-border bg-bp-card px-2 py-1.5"
      data-testid={`kpi-edit-row-${kpiKey}`}
    >
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
      {def.financialGated && (
        <span className="inline-flex items-center gap-1 text-[10px] text-bp-amber">
          <Lock className="h-2.5 w-2.5" />
          Financial
        </span>
      )}
    </div>
  );
}

interface KPIResponse {
  value?: number | null;
  trend?: Array<{ month: string; variance: number }>;
  totalStatement?: number | null;
  totalXero?: number | null;
  error?: string;
}

function KPICell({
  def,
  period,
  hasFinancialAccess,
}: {
  def: KPIDefinition;
  period: KPIPeriod;
  hasFinancialAccess: boolean;
}) {
  const gated = def.financialGated && !hasFinancialAccess;
  const useDate = def.periodFilter;
  const url = useDate ? `${def.endpoint}?period=${period}` : def.endpoint;

  const { data, isLoading, isError } = useQuery<KPIResponse>({
    queryKey: useDate ? [def.endpoint, period] : [def.endpoint],
    queryFn: async () => {
      const r = await fetch(url, { credentials: "include" });
      if (!r.ok) {
        if (r.status === 503) {
          const body = await r.json().catch(() => null);
          if (body && typeof body === "object" && (body as any).error === "xero_unavailable") {
            return { error: "xero_unavailable", value: null };
          }
        }
        throw new Error(`Failed to load (${r.status})`);
      }
      return r.json();
    },
    enabled: !gated,
    retry: 1,
    staleTime: 60_000,
  });

  const accentColor = `hsl(var(${ACCENT_VAR[def.accent]}))`;
  const xeroUnavailable = data?.error === "xero_unavailable";

  const renderValue = () => {
    if (gated) return <span className="text-bp-muted">—</span>;
    if (isLoading) return <Skeleton className="h-6 w-20 bg-bp-subtle" />;
    if (xeroUnavailable) {
      return <span className="text-xs text-bp-muted font-normal">Xero unavailable</span>;
    }
    if (isError) return <span className="text-bp-muted">—</span>;
    const v = data?.value ?? null;
    return formatKPIValue(v, def.format);
  };

  return (
    <div
      className="relative rounded-md border border-bp-border bg-bp-card px-3 py-2 flex flex-col gap-1 min-h-[78px]"
      data-testid={`kpi-${def.key}`}
    >
      <div
        className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-md"
        style={{ backgroundColor: accentColor }}
        aria-hidden
      />
      <div className="flex items-baseline justify-between gap-2 text-bp-muted">
        <div className="flex items-baseline gap-1.5 min-w-0">
          <span className="text-[11px] font-medium uppercase tracking-wide truncate text-bp-card-foreground">
            {def.label}
          </span>
          {def.labelDetail && (
            <span className="text-[9px] uppercase tracking-wide shrink-0">
              {def.labelDetail}
            </span>
          )}
        </div>
        {gated && <Lock className="h-3 w-3 text-bp-amber shrink-0" />}
      </div>
      <div
        className="text-xl font-semibold leading-tight"
        data-testid={`kpi-value-${def.key}`}
      >
        {renderValue()}
      </div>
      {def.periodFilter && !gated && (
        <div className="text-[10px] text-bp-muted mt-auto">{getPeriodLabel(period)}</div>
      )}
    </div>
  );
}

export default function BusinessKPIsWidget({ widget, onUpdate }: WidgetProps) {
  const hasFinancialAccess = useFinancialPermission();

  const config = widget.config || {};
  const period = (config.period as KPIPeriod) || "month";
  const selectedKeys: KPIKey[] = useMemo(() => {
    const fromConfig = Array.isArray(config.selectedKpis) ? (config.selectedKpis as KPIKey[]) : null;
    const valid = (fromConfig || []).filter((k): k is KPIKey => k in KPI_DEFINITIONS);
    return valid.length > 0 ? valid : DEFAULT_SELECTED_KPIS;
  }, [config.selectedKpis]);

  const [editOpen, setEditOpen] = useState(false);
  const [editKeys, setEditKeys] = useState<KPIKey[]>(selectedKeys);

  useEffect(() => {
    if (editOpen) setEditKeys(selectedKeys);
  }, [editOpen, selectedKeys]);

  const setPeriod = (next: KPIPeriod) => {
    onUpdate?.({ ...widget, config: { ...config, period: next } });
  };

  const saveSelection = () => {
    const ordered = editKeys.length > 0 ? editKeys : DEFAULT_SELECTED_KPIS;
    onUpdate?.({ ...widget, config: { ...config, selectedKpis: ordered } });
    setEditOpen(false);
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

  return (
    <div className="flex h-full flex-col" data-testid="business-kpis-widget">
      <div className="mb-3 flex items-center justify-between gap-2">
        <Tabs value={period} onValueChange={(v) => setPeriod(v as KPIPeriod)}>
          <TabsList className="h-7">
            <TabsTrigger value="month" className="h-6 text-xs px-2" data-testid="kpi-period-month">
              Month
            </TabsTrigger>
            <TabsTrigger value="quarter" className="h-6 text-xs px-2" data-testid="kpi-period-quarter">
              Quarter
            </TabsTrigger>
            <TabsTrigger value="year" className="h-6 text-xs px-2" data-testid="kpi-period-year">
              Year
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setEditOpen(true)}
          data-testid="kpi-edit-button"
        >
          <Pencil className="h-3 w-3 mr-1" />
          Edit KPIs
        </Button>
      </div>

      {selectedKeys.length === 0 ? (
        <WidgetEmpty
          title="No KPIs selected"
          message="Click Edit KPIs to choose which metrics to display."
        />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 flex-1 content-start">
          {selectedKeys.map((key) => {
            const def = KPI_DEFINITIONS[key];
            if (!def) return null;
            return (
              <KPICell
                key={key}
                def={def}
                period={period}
                hasFinancialAccess={hasFinancialAccess}
              />
            );
          })}
        </div>
      )}

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
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
                  {editorOrder.map((key) => (
                    <SortableKPIRow
                      key={key}
                      kpiKey={key}
                      checked={editKeys.includes(key)}
                      onToggle={(v) => toggleKey(key, v)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} data-testid="kpi-edit-cancel">
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
