import { useState, useCallback, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft,
  Plus,
  Trash2,
  CheckCircle2,
  Circle,
  MinusCircle,
  ChevronRight,
  GripVertical,
} from "lucide-react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { LabourEstimate, LabourEstimateCategory, LabourEstimateTask, Project } from "@shared/schema";
import { usePageTitle } from "@/hooks/usePageTitle";

const STATUS_CONFIG: Record<string, { label: string; icon: typeof Circle; color: string }> = {
  not_required: { label: "Not Required", icon: MinusCircle, color: "text-muted-foreground" },
  not_complete: { label: "Not Complete", icon: Circle, color: "text-amber-500" },
  complete: { label: "Complete", icon: CheckCircle2, color: "text-green-500" },
};

const STATUS_CYCLE: Record<string, string> = {
  not_required: "not_complete",
  not_complete: "complete",
  complete: "not_required",
};

function formatCurrency(val: number): string {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", minimumFractionDigits: 2 }).format(val);
}

type CategoryWithHours = LabourEstimateCategory & { totalHours: number };

// ─── Sortable category row ──────────────────────────────────────────────────

function SortableCategoryItem({
  cat,
  isSelected,
  onSelect,
  onDelete,
  onStatusCycle,
}: {
  cat: CategoryWithHours;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onStatusCycle: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: cat.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };
  const cfg = STATUS_CONFIG[cat.status] ?? STATUS_CONFIG.not_complete;
  const StatusIcon = cfg.icon;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group/cat flex items-center border-l-2 transition-colors ${
        isSelected ? "bg-[#bba7db]/10 border-[#bba7db]" : "border-transparent hover-elevate"
      }`}
    >
      {/* Drag handle */}
      <div
        {...attributes}
        {...listeners}
        className="flex-shrink-0 flex items-center justify-center w-5 h-8 cursor-grab active:cursor-grabbing text-muted-foreground/30 hover:text-muted-foreground/60 transition-colors"
      >
        <GripVertical className="w-3 h-3" />
      </div>

      {/* Hours column — narrow */}
      <div className="w-10 flex-shrink-0 text-right pr-1.5">
        {cat.totalHours > 0 && (
          <span className="text-[10px] tabular-nums text-muted-foreground/70">{cat.totalHours % 1 === 0 ? cat.totalHours : cat.totalHours.toFixed(1)}</span>
        )}
      </div>

      {/* Clickable name area */}
      <button
        onClick={onSelect}
        className="flex-1 min-w-0 flex items-center gap-1.5 py-2 pr-1 text-left"
      >
        <button
          onClick={e => { e.stopPropagation(); onStatusCycle(); }}
          className="flex-shrink-0"
          title={cfg.label}
        >
          <StatusIcon className={`w-3.5 h-3.5 ${cfg.color}`} />
        </button>
        <span className="text-xs leading-snug truncate flex-1">{cat.name}</span>
        {isSelected && <ChevronRight className="w-3 h-3 text-muted-foreground flex-shrink-0" />}
      </button>

      {/* Delete button — visible on hover */}
      <button
        onClick={e => { e.stopPropagation(); onDelete(); }}
        className="flex-shrink-0 w-6 flex items-center justify-center opacity-0 group-hover/cat:opacity-100 transition-opacity text-muted-foreground hover:text-destructive mr-1"
        title="Delete category"
      >
        <Trash2 className="w-3 h-3" />
      </button>
    </div>
  );
}

// ─── Sortable task row ───────────────────────────────────────────────────────

function SortableTaskRow({
  task,
  editingCell,
  editValue,
  suppressBlurRef,
  setEditValue,
  startEdit,
  commitEdit,
  navigateCell,
  setEditingCell,
  onDelete,
}: {
  task: LabourEstimateTask;
  editingCell: { taskId: string; field: string } | null;
  editValue: string;
  suppressBlurRef: React.MutableRefObject<boolean>;
  setEditValue: (v: string) => void;
  startEdit: (taskId: string, field: string, val: string | number | null) => void;
  commitEdit: (task: LabourEstimateTask, field: 'description' | 'numMen' | 'hoursPerMan') => void;
  navigateCell: (taskId: string, field: 'description' | 'numMen' | 'hoursPerMan', dir: 'next' | 'prev' | 'down') => void;
  setEditingCell: (v: null) => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };

  const handleKeyDown = (field: 'description' | 'numMen' | 'hoursPerMan') => (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') { setEditingCell(null); return; }
    if (e.key === 'Enter') {
      e.preventDefault();
      suppressBlurRef.current = true;
      commitEdit(task, field);
      navigateCell(task.id, field, 'down');
      setTimeout(() => { suppressBlurRef.current = false; }, 0);
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      suppressBlurRef.current = true;
      commitEdit(task, field);
      navigateCell(task.id, field, e.shiftKey ? 'prev' : 'next');
      setTimeout(() => { suppressBlurRef.current = false; }, 0);
    }
  };

  const handleBlur = (field: 'description' | 'numMen' | 'hoursPerMan') => () => {
    if (suppressBlurRef.current) return;
    commitEdit(task, field);
  };

  return (
    <div
      ref={setNodeRef}
      style={{ ...style, gridTemplateColumns: "20px 1fr 70px 80px 80px 32px" } as React.CSSProperties}
      className={`grid items-center border-b border-border/10 group/row min-h-[34px] ${
        task.subHeading ? "bg-muted/30 font-medium" : ""
      }`}
    >
      {/* Drag handle */}
      <div
        {...attributes}
        {...listeners}
        className="flex items-center justify-center h-full cursor-grab active:cursor-grabbing text-muted-foreground/20 hover:text-muted-foreground/50 transition-colors pl-1"
      >
        <GripVertical className="w-3 h-3" />
      </div>

      {/* Description */}
      <div className="pr-2 py-0.5">
        {editingCell?.taskId === task.id && editingCell.field === 'description' ? (
          <Input
            autoFocus
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            onFocus={e => e.target.select()}
            onBlur={handleBlur('description')}
            onKeyDown={handleKeyDown('description')}
            className="h-6 text-sm focus-visible:ring-0 border-primary"
          />
        ) : (
          <span
            className="text-sm cursor-pointer hover:text-foreground truncate block"
            onClick={() => startEdit(task.id, 'description', task.description)}
          >
            {task.description || <span className="text-muted-foreground italic text-xs">Click to edit…</span>}
          </span>
        )}
      </div>

      {/* No. Men */}
      <div className="flex justify-center">
        {task.subHeading ? <span /> : editingCell?.taskId === task.id && editingCell.field === 'numMen' ? (
          <Input
            autoFocus
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            onFocus={e => e.target.select()}
            onBlur={handleBlur('numMen')}
            onKeyDown={handleKeyDown('numMen')}
            className="h-6 text-sm text-center focus-visible:ring-0 border-primary w-16"
          />
        ) : (
          <span
            className="text-sm cursor-pointer text-center hover:text-foreground w-full text-center"
            onClick={() => startEdit(task.id, 'numMen', task.numMen)}
          >
            {task.numMen}
          </span>
        )}
      </div>

      {/* Hrs / Man */}
      <div className="flex justify-center">
        {task.subHeading ? <span /> : editingCell?.taskId === task.id && editingCell.field === 'hoursPerMan' ? (
          <Input
            autoFocus
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            onFocus={e => e.target.select()}
            onBlur={handleBlur('hoursPerMan')}
            onKeyDown={handleKeyDown('hoursPerMan')}
            className="h-6 text-sm text-center focus-visible:ring-0 border-primary w-20"
          />
        ) : (
          <span
            className="text-sm cursor-pointer text-center hover:text-foreground w-full text-center"
            onClick={() => startEdit(task.id, 'hoursPerMan', task.hoursPerMan)}
          >
            {task.hoursPerMan}
          </span>
        )}
      </div>

      {/* Total Hours */}
      <div className="text-right pr-1">
        <span className="text-sm tabular-nums font-medium">
          {task.subHeading ? "" : task.totalHours.toFixed(2)}
        </span>
      </div>

      {/* Delete */}
      <div className="flex justify-center opacity-0 group-hover/row:opacity-100 transition-opacity">
        <button
          onClick={onDelete}
          className="h-5 w-5 flex items-center justify-center text-muted-foreground hover:text-destructive rounded"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

// ─── Main panel ──────────────────────────────────────────────────────────────

export function LabourEstimatePanel({ projectId }: { projectId: string }) {
  const { toast } = useToast();
  const [selectedCatId, setSelectedCatId] = useState<string | null>(null);
  const [editingCell, setEditingCell] = useState<{ taskId: string; field: string } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [newRowDesc, setNewRowDesc] = useState("");
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const addRowRef = useRef<HTMLInputElement>(null);
  const suppressBlurRef = useRef(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const { data: estimate, isLoading: estimateLoading } = useQuery<LabourEstimate>({
    queryKey: ["/api/projects", projectId, "labour-estimate"],
    queryFn: () => fetch(`/api/projects/${projectId}/labour-estimate`, { credentials: "include" }).then(r => r.json()),
    enabled: !!projectId,
  });

  const { data: categories = [] } = useQuery<CategoryWithHours[]>({
    queryKey: ["/api/labour-estimates", estimate?.id, "categories"],
    queryFn: () => fetch(`/api/labour-estimates/${estimate!.id}/categories`, { credentials: "include" }).then(r => r.json()),
    enabled: !!estimate?.id,
  });

  const selectedCat = categories.find(c => c.id === selectedCatId) ?? categories[0] ?? null;
  const effectiveCatId = selectedCat?.id ?? null;

  const { data: tasks = [] } = useQuery<LabourEstimateTask[]>({
    queryKey: ["/api/labour-estimate-categories", effectiveCatId, "tasks"],
    queryFn: () => fetch(`/api/labour-estimate-categories/${effectiveCatId}/tasks`, { credentials: "include" }).then(r => r.json()),
    enabled: !!effectiveCatId,
  });

  // ── Mutations ──────────────────────────────────────────────────────────────

  const updateEstimateMutation = useMutation({
    mutationFn: (data: { labourRatePerHour?: number; title?: string }) =>
      apiRequest(`/api/labour-estimates/${estimate!.id}`, "PATCH", data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "labour-estimate"] }),
  });

  const updateCategoryMutation = useMutation({
    mutationFn: ({ catId, data }: { catId: string; data: Partial<CategoryWithHours> }) =>
      apiRequest(`/api/labour-estimates/${estimate!.id}/categories/${catId}`, "PATCH", data),
    onMutate: async ({ catId, data }) => {
      await queryClient.cancelQueries({ queryKey: ["/api/labour-estimates", estimate?.id, "categories"] });
      const prev = queryClient.getQueryData<CategoryWithHours[]>(["/api/labour-estimates", estimate?.id, "categories"]);
      queryClient.setQueryData<CategoryWithHours[]>(["/api/labour-estimates", estimate?.id, "categories"], old =>
        old?.map(c => c.id === catId ? { ...c, ...data } : c) ?? []
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      queryClient.setQueryData(["/api/labour-estimates", estimate?.id, "categories"], ctx?.prev);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["/api/labour-estimates", estimate?.id, "categories"] }),
  });

  const addCategoryMutation = useMutation({
    mutationFn: (name: string) => apiRequest(`/api/labour-estimates/${estimate!.id}/categories`, "POST", { name }),
    onSuccess: (newCat: CategoryWithHours) => {
      queryClient.invalidateQueries({ queryKey: ["/api/labour-estimates", estimate?.id, "categories"] });
      setSelectedCatId(newCat.id);
    },
    onError: () => toast({ title: "Failed to add category", variant: "destructive" }),
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: (catId: string) => apiRequest(`/api/labour-estimate-categories/${catId}`, "DELETE"),
    onMutate: async (catId) => {
      await queryClient.cancelQueries({ queryKey: ["/api/labour-estimates", estimate?.id, "categories"] });
      const prev = queryClient.getQueryData<CategoryWithHours[]>(["/api/labour-estimates", estimate?.id, "categories"]);
      queryClient.setQueryData<CategoryWithHours[]>(["/api/labour-estimates", estimate?.id, "categories"], old =>
        old?.filter(c => c.id !== catId) ?? []
      );
      if (selectedCatId === catId) setSelectedCatId(null);
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      queryClient.setQueryData(["/api/labour-estimates", estimate?.id, "categories"], ctx?.prev);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["/api/labour-estimates", estimate?.id, "categories"] }),
  });

  const reorderCategoriesMutation = useMutation({
    mutationFn: (updates: { id: string; sortOrder: number }[]) =>
      apiRequest(`/api/labour-estimates/${estimate!.id}/categories/reorder`, "PATCH", { updates }),
    onError: () => queryClient.invalidateQueries({ queryKey: ["/api/labour-estimates", estimate?.id, "categories"] }),
  });

  const updateTaskMutation = useMutation({
    mutationFn: ({ taskId, data }: { taskId: string; data: Partial<LabourEstimateTask> }) =>
      apiRequest(`/api/labour-estimate-tasks/${taskId}`, "PATCH", data),
    onMutate: async ({ taskId, data }) => {
      await queryClient.cancelQueries({ queryKey: ["/api/labour-estimate-categories", effectiveCatId, "tasks"] });
      const prev = queryClient.getQueryData<LabourEstimateTask[]>(["/api/labour-estimate-categories", effectiveCatId, "tasks"]);
      queryClient.setQueryData<LabourEstimateTask[]>(["/api/labour-estimate-categories", effectiveCatId, "tasks"], old =>
        old?.map(t => t.id === taskId ? { ...t, ...data } : t) ?? []
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      queryClient.setQueryData(["/api/labour-estimate-categories", effectiveCatId, "tasks"], ctx?.prev);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/labour-estimate-categories", effectiveCatId, "tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/labour-estimates", estimate?.id, "categories"] });
    },
  });

  const addTaskMutation = useMutation({
    mutationFn: (data: { description: string; numMen?: number; hoursPerMan?: number; subHeading?: string | null }) =>
      apiRequest(`/api/labour-estimate-categories/${effectiveCatId}/tasks`, "POST", data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/labour-estimate-categories", effectiveCatId, "tasks"] }),
    onError: () => toast({ title: "Failed to add task", variant: "destructive" }),
  });

  const deleteTaskMutation = useMutation({
    mutationFn: (taskId: string) => apiRequest(`/api/labour-estimate-tasks/${taskId}`, "DELETE"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/labour-estimate-categories", effectiveCatId, "tasks"] }),
  });

  const reorderTasksMutation = useMutation({
    mutationFn: (updates: { id: string; sortOrder: number }[]) =>
      apiRequest(`/api/labour-estimate-categories/${effectiveCatId}/tasks/reorder`, "PATCH", { updates }),
    onError: () => queryClient.invalidateQueries({ queryKey: ["/api/labour-estimate-categories", effectiveCatId, "tasks"] }),
  });

  // ── Cell editing ───────────────────────────────────────────────────────────

  const startEdit = (taskId: string, field: string, val: string | number | null) => {
    setEditingCell({ taskId, field });
    setEditValue(String(val ?? ""));
  };

  const commitEdit = useCallback((task: LabourEstimateTask, field: 'description' | 'numMen' | 'hoursPerMan') => {
    if (!editingCell || editingCell.taskId !== task.id || editingCell.field !== field) return;
    let parsed: string | number = editValue;
    if (field === 'numMen' || field === 'hoursPerMan') {
      parsed = parseFloat(editValue) || 0;
      const numMen = field === 'numMen' ? parsed as number : task.numMen;
      const hoursPerMan = field === 'hoursPerMan' ? parsed as number : task.hoursPerMan;
      const totalHours = numMen * hoursPerMan;
      updateTaskMutation.mutate({ taskId: task.id, data: { [field]: parsed, totalHours } });
    } else {
      updateTaskMutation.mutate({ taskId: task.id, data: { description: String(editValue) } });
    }
    setEditingCell(null);
  }, [editingCell, editValue, updateTaskMutation]);

  const FIELD_ORDER = ['description', 'numMen', 'hoursPerMan'] as const;
  type EditField = typeof FIELD_ORDER[number];

  const getFieldValue = (t: LabourEstimateTask, f: EditField): string | number => {
    if (f === 'description') return t.description;
    if (f === 'numMen') return t.numMen;
    return t.hoursPerMan;
  };

  const navigateCell = useCallback((
    currentTaskId: string,
    currentField: EditField,
    dir: 'next' | 'prev' | 'down'
  ) => {
    const allTasks = tasks;
    const taskIdx = allTasks.findIndex(t => t.id === currentTaskId);
    const fieldIdx = FIELD_ORDER.indexOf(currentField);
    let nextTaskIdx = taskIdx;
    let nextFieldIdx = fieldIdx;

    if (dir === 'next') {
      if (fieldIdx < FIELD_ORDER.length - 1) {
        nextFieldIdx = fieldIdx + 1;
        while (nextTaskIdx < allTasks.length && allTasks[nextTaskIdx]?.subHeading && nextFieldIdx > 0) {
          nextTaskIdx++;
          nextFieldIdx = 0;
        }
      } else {
        nextTaskIdx = taskIdx + 1;
        nextFieldIdx = 0;
      }
    } else if (dir === 'prev') {
      if (fieldIdx > 0) {
        nextFieldIdx = fieldIdx - 1;
        while (nextTaskIdx >= 0 && allTasks[nextTaskIdx]?.subHeading && nextFieldIdx > 0) {
          nextFieldIdx = 0;
        }
      } else {
        nextTaskIdx = taskIdx - 1;
        nextFieldIdx = FIELD_ORDER.length - 1;
        while (nextTaskIdx >= 0 && allTasks[nextTaskIdx]?.subHeading && nextFieldIdx > 0) {
          nextFieldIdx = 0;
        }
      }
    } else if (dir === 'down') {
      nextTaskIdx = taskIdx + 1;
      while (nextTaskIdx < allTasks.length && allTasks[nextTaskIdx]?.subHeading && nextFieldIdx > 0) {
        nextTaskIdx++;
      }
    }

    if (nextTaskIdx < 0 || nextTaskIdx >= allTasks.length) return;
    const nextTask = allTasks[nextTaskIdx];
    const nextField = FIELD_ORDER[nextFieldIdx];
    startEdit(nextTask.id, nextField, getFieldValue(nextTask, nextField));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks]);

  // ── Drag end handlers ──────────────────────────────────────────────────────

  const handleCategoryDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = categories.findIndex(c => c.id === active.id);
    const newIndex = categories.findIndex(c => c.id === over.id);
    const reordered = arrayMove(categories, oldIndex, newIndex);
    queryClient.setQueryData<CategoryWithHours[]>(["/api/labour-estimates", estimate?.id, "categories"], reordered);
    reorderCategoriesMutation.mutate(reordered.map((c, i) => ({ id: c.id, sortOrder: i })));
  };

  const handleTaskDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = tasks.findIndex(t => t.id === active.id);
    const newIndex = tasks.findIndex(t => t.id === over.id);
    const reordered = arrayMove(tasks, oldIndex, newIndex);
    queryClient.setQueryData<LabourEstimateTask[]>(["/api/labour-estimate-categories", effectiveCatId, "tasks"], reordered);
    reorderTasksMutation.mutate(reordered.map((t, i) => ({ id: t.id, sortOrder: i })));
  };

  // ── Add row ────────────────────────────────────────────────────────────────

  const addRow = () => {
    if (!newRowDesc.trim() && !selectedCat) return;
    addTaskMutation.mutate({ description: newRowDesc.trim() });
    setNewRowDesc("");
  };

  const submitNewCategory = () => {
    const name = newCatName.trim();
    if (!name) { setAddingCategory(false); return; }
    addCategoryMutation.mutate(name);
    setNewCatName("");
    setAddingCategory(false);
  };

  // ── Derived values ─────────────────────────────────────────────────────────

  const [labourRateEdit, setLabourRateEdit] = useState(false);
  const [labourRateVal, setLabourRateVal] = useState("");

  const totalHours = tasks.reduce((sum, t) => sum + t.totalHours, 0);
  const totalCost = totalHours * (estimate?.labourRatePerHour ?? 0);

  if (estimateLoading) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        Loading Labour Estimate…
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Main layout — sidebar + task area */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* Left sidebar — categories */}
        <div className="w-60 flex-shrink-0 border-r border-border flex flex-col bg-muted/20">
          <div className="h-9 flex items-center justify-between pl-5 pr-2 border-b border-border/50 flex-shrink-0">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Categories</span>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => { setAddingCategory(true); setNewCatName(""); }}
              title="Add category"
            >
              <Plus className="w-3.5 h-3.5" />
            </Button>
          </div>

          {/* New category input */}
          {addingCategory && (
            <div className="flex items-center gap-1 px-2 py-1.5 border-b border-border/30 flex-shrink-0">
              <Input
                autoFocus
                placeholder="Category name…"
                value={newCatName}
                onChange={e => setNewCatName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') submitNewCategory();
                  if (e.key === 'Escape') { setAddingCategory(false); setNewCatName(""); }
                }}
                onBlur={submitNewCategory}
                className="h-6 text-xs flex-1 focus-visible:ring-0 border-primary"
              />
            </div>
          )}

          {/* Sortable category list */}
          <div className="flex-1 overflow-y-auto">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleCategoryDragEnd}>
              <SortableContext items={categories.map(c => c.id)} strategy={verticalListSortingStrategy}>
                {categories.map(cat => (
                  <SortableCategoryItem
                    key={cat.id}
                    cat={cat}
                    isSelected={(selectedCatId === cat.id) || (!selectedCatId && cat === categories[0])}
                    onSelect={() => setSelectedCatId(cat.id)}
                    onDelete={() => deleteCategoryMutation.mutate(cat.id)}
                    onStatusCycle={() => {
                      const next = STATUS_CYCLE[cat.status] ?? "not_complete";
                      updateCategoryMutation.mutate({ catId: cat.id, data: { status: next } });
                    }}
                  />
                ))}
              </SortableContext>
            </DndContext>
          </div>

          {/* Status legend */}
          <div className="border-t border-border/50 px-3 py-2 space-y-1 flex-shrink-0">
            {Object.entries(STATUS_CONFIG).map(([status, { label, icon: Icon, color }]) => {
              const count = categories.filter(c => c.status === status).length;
              return count > 0 ? (
                <div key={status} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <Icon className={`w-3 h-3 ${color}`} />
                  <span>{count} {label}</span>
                </div>
              ) : null;
            })}
          </div>
        </div>

        {/* Right panel — tasks */}
        <div className="flex-1 flex flex-col min-w-0">

          {/* Category header + status toggle */}
          {selectedCat && (
            <div className="h-9 flex items-center justify-between px-4 border-b border-border/50 bg-background flex-shrink-0">
              <span className="text-sm font-semibold truncate">{selectedCat.name}</span>
              <button
                onClick={() => {
                  const next = STATUS_CYCLE[selectedCat.status] ?? "not_complete";
                  updateCategoryMutation.mutate({ catId: selectedCat.id, data: { status: next } });
                }}
                className="flex items-center gap-1.5 text-xs border rounded-md px-2 h-6 hover-elevate active-elevate-2"
              >
                {(() => {
                  const cfg = STATUS_CONFIG[selectedCat.status] ?? STATUS_CONFIG.not_complete;
                  const Icon = cfg.icon;
                  return <><Icon className={`w-3 h-3 ${cfg.color}`} /><span>{cfg.label}</span></>;
                })()}
              </button>
            </div>
          )}

          {/* Column headers */}
          <div
            className="grid text-[10px] font-medium text-muted-foreground uppercase tracking-wide bg-muted/40 border-b border-border/50 px-0 py-1.5 flex-shrink-0"
            style={{ gridTemplateColumns: "20px 1fr 70px 80px 80px 32px" }}
          >
            <span />
            <span className="pl-0">Description</span>
            <span className="text-center">No. Men</span>
            <span className="text-center">Hrs / Man</span>
            <span className="text-right pr-1">Total Hrs</span>
            <span />
          </div>

          {/* Task rows */}
          <div className="flex-1 overflow-y-auto">
            {!selectedCat ? (
              <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                Select a category to view tasks.
              </div>
            ) : tasks.length === 0 ? (
              <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                No tasks yet. Add a row below.
              </div>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleTaskDragEnd}>
                <SortableContext items={tasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
                  {tasks.map(task => (
                    <SortableTaskRow
                      key={task.id}
                      task={task}
                      editingCell={editingCell}
                      editValue={editValue}
                      suppressBlurRef={suppressBlurRef}
                      setEditValue={setEditValue}
                      startEdit={startEdit}
                      commitEdit={commitEdit}
                      navigateCell={navigateCell}
                      setEditingCell={setEditingCell}
                      onDelete={() => deleteTaskMutation.mutate(task.id)}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            )}
          </div>

          {/* Add row input */}
          {selectedCat && (
            <div className="flex items-center gap-2 px-4 py-2 border-t border-border/30 flex-shrink-0">
              <Input
                ref={addRowRef}
                placeholder="Add item…"
                value={newRowDesc}
                onChange={e => setNewRowDesc(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addRow(); }}
                className="h-7 text-sm flex-1"
              />
              <Button size="sm" variant="outline" className="h-7 px-3 text-xs" onClick={addRow} disabled={addTaskMutation.isPending}>
                <Plus className="w-3 h-3 mr-1" />
                Add
              </Button>
            </div>
          )}

          {/* Category summary */}
          {selectedCat && tasks.length > 0 && (
            <div className="flex items-center justify-end gap-3 px-4 py-2 bg-muted/20 border-t border-border/50 text-xs flex-shrink-0">
              <span className="text-muted-foreground">{selectedCat.name}</span>
              <span className="font-medium tabular-nums">{totalHours.toFixed(2)} hrs</span>
            </div>
          )}
        </div>
      </div>

      {/* Footer — labour rate + totals */}
      <div className="flex items-center justify-between px-4 py-2.5 border-t border-border gap-4 flex-shrink-0 bg-card">
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Labour Rate</span>
          {labourRateEdit ? (
            <Input
              autoFocus
              value={labourRateVal}
              onChange={e => setLabourRateVal(e.target.value)}
              onBlur={() => {
                const val = parseFloat(labourRateVal);
                if (!isNaN(val)) updateEstimateMutation.mutate({ labourRatePerHour: val });
                setLabourRateEdit(false);
              }}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === 'Escape') {
                  const val = parseFloat(labourRateVal);
                  if (!isNaN(val) && e.key === 'Enter') updateEstimateMutation.mutate({ labourRatePerHour: val });
                  setLabourRateEdit(false);
                }
              }}
              className="h-7 w-28 text-sm focus-visible:ring-0 border-primary"
            />
          ) : (
            <button
              onClick={() => { setLabourRateVal(String(estimate?.labourRatePerHour ?? 0)); setLabourRateEdit(true); }}
              className="text-sm font-medium tabular-nums border-b border-dashed border-muted-foreground/40 hover:border-foreground transition-colors"
            >
              {formatCurrency(estimate?.labourRatePerHour ?? 0)}/hr
            </button>
          )}
        </div>

        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Category Hours:</span>
            <span className="text-sm font-semibold tabular-nums">{totalHours.toFixed(2)}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Category Labour Cost:</span>
            <span className="text-base font-bold tabular-nums text-[#bba7db]">
              {formatCurrency(totalCost)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LabourEstimate() {
  const { projectId } = useParams<{ projectId: string }>();
  const [, setLocation] = useLocation();

  usePageTitle({ pageName: "Labour Estimate" });

  const { data: project } = useQuery<Project>({
    queryKey: ["/api/projects", projectId],
    queryFn: () => fetch(`/api/projects/${projectId}`, { credentials: "include" }).then(r => r.json()),
    enabled: !!projectId,
  });

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="mx-3 mt-3 rounded-lg border border-border bg-card flex-shrink-0 overflow-hidden">
        <div className="h-9 flex items-center justify-between px-3 border-b border-border/50">
          <div className="flex items-center gap-2 min-w-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 flex-shrink-0"
              onClick={() => setLocation(`/projects/${projectId}/estimates`)}
            >
              <ArrowLeft className="w-3 h-3" />
            </Button>
            <div className="flex items-center gap-1.5 text-xs min-w-0">
              <span className="text-muted-foreground flex-shrink-0">{project?.name || "Project"}</span>
              <span className="text-muted-foreground flex-shrink-0">/</span>
              <span className="font-semibold truncate">Labour Estimate</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main panel — inherits remaining height */}
      <div className="flex-1 min-h-0 mx-3 mt-2 mb-4 border border-border rounded-md overflow-hidden flex flex-col">
        {projectId && <LabourEstimatePanel projectId={projectId} />}
      </div>
    </div>
  );
}
