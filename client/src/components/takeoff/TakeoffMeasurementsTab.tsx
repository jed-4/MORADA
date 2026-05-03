import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Search, ChevronDown, ChevronRight, Calculator, GripVertical, Trash2,
  BookmarkPlus, FolderDown,
} from "lucide-react";
import {
  DndContext, PointerSensor, closestCenter, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, arrayMove, useSortable, verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { TakeoffMeasurement, TakeoffCategory, TakeoffPlan } from "@shared/schema";
import TakeoffColorPicker from "./TakeoffColorPicker";
import { SaveTemplateModal, LoadTemplateModal } from "./TakeoffTemplatesModal";

interface Props {
  projectId: string;
}

export default function TakeoffMeasurementsTab({ projectId }: Props) {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [saveOpen, setSaveOpen] = useState(false);
  const [loadOpen, setLoadOpen] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const measurementsKey = ["/api/projects", projectId, "takeoff/measurements"];

  const { data: measurements = [], isLoading } = useQuery<TakeoffMeasurement[]>({
    queryKey: measurementsKey,
  });
  const { data: categories = [] } = useQuery<TakeoffCategory[]>({
    queryKey: ["/api/projects", projectId, "takeoff/categories"],
  });
  const { data: plans = [] } = useQuery<TakeoffPlan[]>({
    queryKey: ["/api/projects", projectId, "takeoff/plans"],
  });

  const updateMeasurement = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<TakeoffMeasurement> }) => {
      return await apiRequest(`/api/projects/${projectId}/takeoff/measurements/${id}`, "PATCH", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: measurementsKey });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "takeoff/pages"] });
    },
    onError: (e: any) => toast({ title: "Update failed", description: e?.message, variant: "destructive" }),
  });

  const deleteMeasurement = useMutation({
    mutationFn: async (id: string) => apiRequest(`/api/projects/${projectId}/takeoff/measurements/${id}`, "DELETE"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: measurementsKey });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "takeoff/pages"] });
      toast({ title: "Deleted" });
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return measurements;
    return measurements.filter((m) => m.name.toLowerCase().includes(q));
  }, [measurements, search]);

  const grouped = useMemo(() => {
    const groups = new Map<string, TakeoffMeasurement[]>();
    for (const m of filtered) {
      const key = m.categoryId ?? "__uncat__";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(m);
    }
    return groups;
  }, [filtered]);

  const planById = useMemo(() => {
    const m = new Map<string, TakeoffPlan>();
    plans.forEach((p) => m.set(p.id, p));
    return m;
  }, [plans]);

  const categoryName = (id: string) => id === "__uncat__"
    ? "Uncategorised"
    : categories.find((c) => c.id === id)?.name ?? "Category";

  const totalsForGroup = (rows: TakeoffMeasurement[]) => {
    const byUnit = new Map<string, number>();
    for (const r of rows) {
      const u = r.unit || "";
      byUnit.set(u, (byUnit.get(u) ?? 0) + (r.quantity ?? 0));
    }
    return Array.from(byUnit.entries()).filter(([, v]) => v > 0);
  };

  const handleDragEnd = (rows: TakeoffMeasurement[]) => async (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = rows.findIndex((r) => r.id === active.id);
    const newIndex = rows.findIndex((r) => r.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const reordered = arrayMove(rows, oldIndex, newIndex);
    await Promise.all(
      reordered.map((r, idx) =>
        r.order === idx ? Promise.resolve()
          : updateMeasurement.mutateAsync({ id: r.id, data: { order: idx } as any }),
      ),
    );
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold">Measurements</h2>
          <p className="text-sm text-muted-foreground">
            All measurements across every plan in this project
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setLoadOpen(true)} data-testid="button-load-template">
            <FolderDown className="h-4 w-4 mr-1" /> Load template
          </Button>
          <Button variant="outline" size="sm" onClick={() => setSaveOpen(true)} data-testid="button-save-template">
            <BookmarkPlus className="h-4 w-4 mr-1" /> Save as template
          </Button>
          <div className="relative w-64">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search measurements"
              className="pl-8"
              data-testid="input-search-measurements"
            />
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground py-12 text-center">Loading…</div>
      ) : filtered.length === 0 ? (
        <Card className="py-16 flex flex-col items-center justify-center gap-3 border-2 border-dashed">
          <Calculator className="h-10 w-10 text-muted-foreground" />
          <div className="text-base font-medium">No measurements yet</div>
          <div className="text-sm text-muted-foreground">
            Open a plan from the Plans tab to start measuring
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {Array.from(grouped.entries()).map(([catId, rows]) => {
            const isCollapsed = collapsed[catId] ?? false;
            const totals = totalsForGroup(rows);
            return (
              <Card key={catId} className="overflow-hidden">
                <button
                  onClick={() => setCollapsed((s) => ({ ...s, [catId]: !isCollapsed }))}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-primary/5 hover-elevate"
                  data-testid={`button-toggle-cat-${catId}`}
                >
                  <div className="flex items-center gap-2">
                    {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    <span className="font-medium">{categoryName(catId)}</span>
                    <span className="text-xs text-muted-foreground">
                      {rows.length} item{rows.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {totals.map(([unit, total]) => (
                      <Badge key={unit} variant="secondary">
                        {Math.round(total * 100) / 100} {unit}
                      </Badge>
                    ))}
                  </div>
                </button>

                {!isCollapsed && (
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => void handleDragEnd(rows)(e)}>
                    <SortableContext items={rows.map((r) => r.id)} strategy={verticalListSortingStrategy}>
                      <div className="divide-y divide-border">
                        {rows.map((m) => (
                          <SortableTabRow
                            key={m.id}
                            m={m}
                            planName={planById.get(m.planId)?.name ?? "Unknown plan"}
                            editing={editingId === m.id}
                            editName={editName}
                            setEditName={setEditName}
                            onStartEdit={() => { setEditingId(m.id); setEditName(m.name); }}
                            onCommitName={() => {
                              if (editName.trim() && editName !== m.name) {
                                updateMeasurement.mutate({ id: m.id, data: { name: editName.trim() } as any });
                              }
                              setEditingId(null);
                            }}
                            onColor={(color) => updateMeasurement.mutate({ id: m.id, data: { color } as any })}
                            onMultiplier={(v) => updateMeasurement.mutate({ id: m.id, data: { multiplier: v } as any })}
                            onWaste={(v) => updateMeasurement.mutate({ id: m.id, data: { wastePercent: v } as any })}
                            onDelete={() => deleteMeasurement.mutate(m.id)}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <SaveTemplateModal
        open={saveOpen}
        onOpenChange={setSaveOpen}
        measurements={measurements}
        categories={categories}
      />
      <LoadTemplateModal
        open={loadOpen}
        onOpenChange={setLoadOpen}
        projectId={projectId}
        plans={plans}
        categories={categories}
      />
    </div>
  );
}

function SortableTabRow({
  m, planName, editing, editName, setEditName, onStartEdit, onCommitName,
  onColor, onMultiplier, onWaste, onDelete,
}: {
  m: TakeoffMeasurement;
  planName: string;
  editing: boolean;
  editName: string;
  setEditName: (s: string) => void;
  onStartEdit: () => void;
  onCommitName: () => void;
  onColor: (c: string) => void;
  onMultiplier: (v: number) => void;
  onWaste: (v: number) => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: m.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-3 px-3 py-2.5" data-testid={`row-measurement-${m.id}`}>
      <button {...attributes} {...listeners} className="text-muted-foreground cursor-grab" aria-label="Drag to reorder">
        <GripVertical className="h-4 w-4" />
      </button>
      <TakeoffColorPicker color={m.color} onChange={onColor} testId={`color-${m.id}`} />
      <div className="flex-1 min-w-0">
        {editing ? (
          <Input
            autoFocus
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={onCommitName}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") onCommitName(); }}
            className="h-7 text-sm"
          />
        ) : (
          <div className="text-sm font-medium truncate cursor-text" onDoubleClick={onStartEdit} title="Double-click to rename">
            {m.name}
          </div>
        )}
        <div className="text-xs text-muted-foreground truncate">{planName}</div>
      </div>
      <Badge variant="outline" className="text-xs">{m.measurementType}</Badge>
      <div className="flex items-center gap-1">
        <span className="text-[10px] text-muted-foreground">×</span>
        <Input
          type="number"
          step="0.1"
          value={m.multiplier ?? 1}
          onChange={(e) => onMultiplier(parseFloat(e.target.value) || 0)}
          className="h-7 w-16 text-xs"
        />
      </div>
      <div className="flex items-center gap-1">
        <Input
          type="number"
          step="1"
          value={m.wastePercent ?? 0}
          onChange={(e) => onWaste(parseFloat(e.target.value) || 0)}
          className="h-7 w-16 text-xs"
        />
        <span className="text-[10px] text-muted-foreground">% waste</span>
      </div>
      <div className="text-sm tabular-nums w-28 text-right">
        {Math.round((m.quantity ?? 0) * 100) / 100} {m.unit}
      </div>
      <Button size="icon" variant="ghost" onClick={onDelete} data-testid={`button-delete-${m.id}`}>
        <Trash2 className="h-4 w-4 text-muted-foreground" />
      </Button>
    </div>
  );
}
