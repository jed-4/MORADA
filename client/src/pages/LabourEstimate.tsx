import { useState, useCallback, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft,
  Plus,
  Trash2,
  CheckCircle2,
  Circle,
  MinusCircle,
  GripVertical,
  BookOpen,
  FolderOpen,
  MoreVertical,
  Copy,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

type CategoryWithHours = LabourEstimateCategory & { totalHours: number };

// ─── Sortable category sidebar row ───────────────────────────────────────────

function SortableCategoryItem({
  cat,
  isSelected,
  onSelect,
  onDelete,
  onStatusCycle,
  onCopyToTemplate,
}: {
  cat: CategoryWithHours;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onStatusCycle: () => void;
  onCopyToTemplate: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: cat.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };
  const cfg = STATUS_CONFIG[cat.status] ?? STATUS_CONFIG.not_complete;
  const StatusIcon = cfg.icon;
  const isNotRequired = cat.status === 'not_required';

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group/cat flex items-center border-l-2 transition-colors min-h-[32px] ${
        isSelected ? "bg-[#bba7db]/10 border-[#bba7db]" : "border-transparent hover-elevate"
      }`}
    >
      {/* Drag handle */}
      <div
        {...attributes}
        {...listeners}
        className="flex-shrink-0 flex items-center justify-center w-5 h-8 cursor-grab active:cursor-grabbing text-muted-foreground/25 hover:text-muted-foreground/60 transition-colors"
      >
        <GripVertical className="w-3 h-3" />
      </div>

      {/* Hours tally — narrow column with right border */}
      <div className="w-7 flex-shrink-0 border-r border-border/40 mr-2 text-right pr-1 self-stretch flex items-center justify-end">
        {cat.totalHours > 0 && (
          <span className="text-xs tabular-nums font-medium text-muted-foreground/70">
            {Number.isInteger(cat.totalHours) ? cat.totalHours : cat.totalHours.toFixed(1)}
          </span>
        )}
      </div>

      {/* Status icon — click to cycle, stops propagation */}
      <div
        role="button"
        tabIndex={0}
        onClick={e => { e.stopPropagation(); onStatusCycle(); }}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); onStatusCycle(); } }}
        className="flex-shrink-0 mr-1.5 cursor-pointer"
        title={cfg.label}
      >
        <StatusIcon className={`w-3.5 h-3.5 ${cfg.color}`} />
      </div>

      {/* Name — click to select */}
      <div
        role="button"
        tabIndex={0}
        onClick={onSelect}
        onKeyDown={e => { if (e.key === 'Enter') onSelect(); }}
        className="flex-1 min-w-0 py-2 pr-1 cursor-pointer"
      >
        <span className={`text-xs leading-snug truncate block ${isNotRequired ? 'line-through text-muted-foreground/50' : ''}`}>
          {cat.name}
        </span>
      </div>

      {/* 3-dot menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            onClick={e => e.stopPropagation()}
            className="flex-shrink-0 w-6 flex items-center justify-center opacity-0 group-hover/cat:opacity-100 transition-opacity text-muted-foreground mr-1"
          >
            <MoreVertical className="w-3 h-3" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onClick={e => { e.stopPropagation(); onCopyToTemplate(); }}>
            <Copy className="w-3.5 h-3.5 mr-2" />
            Copy to Template
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={e => { e.stopPropagation(); onDelete(); }} className="text-destructive focus:text-destructive">
            <Trash2 className="w-3.5 h-3.5 mr-2" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// ─── Sortable task row (project tasks and template tasks share this) ──────────

type TaskLike = {
  id: string;
  description: string;
  subHeading?: string | null;
  numMen: number;
  hoursPerMan: number;
  totalHours: number;
};

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
  isTemplate,
}: {
  task: TaskLike;
  editingCell: { taskId: string; field: string } | null;
  editValue: string;
  suppressBlurRef: React.MutableRefObject<boolean>;
  setEditValue: (v: string) => void;
  startEdit: (taskId: string, field: string, val: string | number | null) => void;
  commitEdit: (task: TaskLike, field: 'description' | 'numMen' | 'hoursPerMan') => void;
  navigateCell: (taskId: string, field: 'description' | 'numMen' | 'hoursPerMan', dir: 'next' | 'prev' | 'down') => void;
  setEditingCell: (v: null) => void;
  onDelete: () => void;
  onCopyToTemplate?: () => void;
  isTemplate?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  const dndStyle = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };

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
      style={{ ...dndStyle, gridTemplateColumns: "20px 1fr 70px 80px 80px 32px" } as React.CSSProperties}
      className={`grid items-center border-b border-border/10 group/row min-h-[34px] ${
        task.subHeading ? "bg-muted/30 font-medium" : ""
      }`}
    >
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
            onClick={() => task.subHeading ? undefined : startEdit(task.id, 'numMen', task.numMen)}
          >
            {task.subHeading ? "" : task.numMen}
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
            onClick={() => task.subHeading ? undefined : startEdit(task.id, 'hoursPerMan', task.hoursPerMan)}
          >
            {task.subHeading ? "" : task.hoursPerMan}
          </span>
        )}
      </div>

      {/* Total / default hrs */}
      <div className="text-right pr-1">
        <span className="text-sm tabular-nums font-medium">
          {task.subHeading ? "" : isTemplate ? `${task.hoursPerMan}h` : task.totalHours.toFixed(2)}
        </span>
      </div>

      {/* 3-dot menu */}
      <div className="flex justify-center opacity-0 group-hover/row:opacity-100 transition-opacity">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="h-5 w-5 flex items-center justify-center text-muted-foreground rounded">
              <MoreVertical className="w-3 h-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            {!isTemplate && onCopyToTemplate && (
              <DropdownMenuItem onClick={onCopyToTemplate}>
                <Copy className="w-3.5 h-3.5 mr-2" />
                Copy to Template
              </DropdownMenuItem>
            )}
            {!isTemplate && onCopyToTemplate && <DropdownMenuSeparator />}
            <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
              <Trash2 className="w-3.5 h-3.5 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export function LabourEstimatePanel({ projectId }: { projectId: string }) {
  const { toast } = useToast();
  const [mode, setMode] = useState<'project' | 'template'>('project');
  const [selectedCatId, setSelectedCatId] = useState<string | null>(null);
  const [editingCell, setEditingCell] = useState<{ taskId: string; field: string } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [newRowDesc, setNewRowDesc] = useState("");
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [confirmDeleteCatId, setConfirmDeleteCatId] = useState<string | null>(null);
  const [confirmDeleteTaskId, setConfirmDeleteTaskId] = useState<string | null>(null);
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
    enabled: !!effectiveCatId && mode === 'project',
  });

  const { data: templateTasks = [] } = useQuery<TaskLike[]>({
    queryKey: ["/api/labour-task-templates", selectedCat?.name],
    queryFn: () => fetch(`/api/labour-task-templates?categoryName=${encodeURIComponent(selectedCat!.name)}`, { credentials: "include" }).then(r => r.json()),
    enabled: !!selectedCat?.name && mode === 'template',
  });

  const activeTasks = mode === 'template' ? templateTasks : tasks;

  // ── Mutations ──────────────────────────────────────────────────────────────

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
    onError: (_e, _v, ctx) => queryClient.setQueryData(["/api/labour-estimates", estimate?.id, "categories"], ctx?.prev),
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
    onError: (_e, _v, ctx) => queryClient.setQueryData(["/api/labour-estimates", estimate?.id, "categories"], ctx?.prev),
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
    onError: (_e, _v, ctx) => queryClient.setQueryData(["/api/labour-estimate-categories", effectiveCatId, "tasks"], ctx?.prev),
    onSettled: () => {
      // Only refresh category totals, not tasks — avoids reordering
      queryClient.invalidateQueries({ queryKey: ["/api/labour-estimates", estimate?.id, "categories"] });
    },
  });

  const addTaskMutation = useMutation({
    mutationFn: (data: { description: string; sortOrder?: number }) =>
      apiRequest(`/api/labour-estimate-categories/${effectiveCatId}/tasks`, "POST", data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/labour-estimate-categories", effectiveCatId, "tasks"] }),
    onError: () => toast({ title: "Failed to add task", variant: "destructive" }),
  });

  const deleteTaskMutation = useMutation({
    mutationFn: (taskId: string) => apiRequest(`/api/labour-estimate-tasks/${taskId}`, "DELETE"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/labour-estimate-categories", effectiveCatId, "tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/labour-estimates", estimate?.id, "categories"] });
    },
  });

  const reorderTasksMutation = useMutation({
    mutationFn: (updates: { id: string; sortOrder: number }[]) =>
      apiRequest(`/api/labour-estimate-categories/${effectiveCatId}/tasks/reorder`, "PATCH", { updates }),
    onError: () => queryClient.invalidateQueries({ queryKey: ["/api/labour-estimate-categories", effectiveCatId, "tasks"] }),
  });

  const applyTemplateMutation = useMutation({
    mutationFn: () => apiRequest(`/api/labour-estimate-categories/${effectiveCatId}/apply-template`, "POST", { labourEstimateId: estimate!.id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/labour-estimate-categories", effectiveCatId, "tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/labour-estimates", estimate?.id, "categories"] });
      setMode('project');
      toast({ title: "Template applied" });
    },
    onError: () => toast({ title: "No template tasks for this category", variant: "destructive" }),
  });

  // Template mutations
  const addTemplateMutation = useMutation({
    mutationFn: (data: { description: string; categoryName: string; sortOrder?: number }) =>
      apiRequest(`/api/labour-task-templates`, "POST", data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/labour-task-templates", selectedCat?.name] }),
  });

  const updateTemplateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<TaskLike> }) =>
      apiRequest(`/api/labour-task-templates/${id}`, "PATCH", data),
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: ["/api/labour-task-templates", selectedCat?.name] });
      const prev = queryClient.getQueryData<TaskLike[]>(["/api/labour-task-templates", selectedCat?.name]);
      queryClient.setQueryData<TaskLike[]>(["/api/labour-task-templates", selectedCat?.name], old =>
        old?.map(t => t.id === id ? { ...t, ...data } : t) ?? []
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => queryClient.setQueryData(["/api/labour-task-templates", selectedCat?.name], ctx?.prev),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["/api/labour-task-templates", selectedCat?.name] }),
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/labour-task-templates/${id}`, "DELETE"),
    onMutate: async (id) => {
      const prev = queryClient.getQueryData<TaskLike[]>(["/api/labour-task-templates", selectedCat?.name]);
      queryClient.setQueryData<TaskLike[]>(["/api/labour-task-templates", selectedCat?.name], old =>
        old?.filter(t => t.id !== id) ?? []
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => queryClient.setQueryData(["/api/labour-task-templates", selectedCat?.name], ctx?.prev),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["/api/labour-task-templates", selectedCat?.name] }),
  });

  const reorderTemplatesMutation = useMutation({
    mutationFn: (updates: { id: string; sortOrder: number }[]) =>
      apiRequest(`/api/labour-task-templates/reorder`, "PATCH", { updates }),
    onError: () => queryClient.invalidateQueries({ queryKey: ["/api/labour-task-templates", selectedCat?.name] }),
  });

  const copyTaskToTemplateMutation = useMutation({
    mutationFn: (task: TaskLike) =>
      apiRequest(`/api/labour-task-templates`, "POST", {
        categoryName: selectedCat?.name ?? "",
        description: task.description,
        numMen: task.numMen,
        hoursPerMan: task.hoursPerMan,
        sortOrder: templateTasks.length,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/labour-task-templates", selectedCat?.name] });
      toast({ title: "Task copied to template" });
    },
    onError: () => toast({ title: "Failed to copy to template", variant: "destructive" }),
  });

  const copyCategoryToTemplateMutation = useMutation({
    mutationFn: (cat: CategoryWithHours) =>
      apiRequest(`/api/labour-estimate-categories/${cat.id}/copy-to-template`, "POST", { categoryName: cat.name }),
    onSuccess: (_, cat) => {
      queryClient.invalidateQueries({ queryKey: ["/api/labour-task-templates", cat.name] });
      toast({ title: `"${cat.name}" tasks copied to template` });
    },
    onError: () => toast({ title: "Failed to copy category to template", variant: "destructive" }),
  });

  // ── Cell editing ───────────────────────────────────────────────────────────

  const startEdit = (taskId: string, field: string, val: string | number | null) => {
    setEditingCell({ taskId, field });
    setEditValue(String(val ?? ""));
  };

  const commitEdit = useCallback((task: TaskLike, field: 'description' | 'numMen' | 'hoursPerMan') => {
    if (!editingCell || editingCell.taskId !== task.id || editingCell.field !== field) return;
    setEditingCell(null);
    if (mode === 'template') {
      const data: Partial<TaskLike> = {};
      if (field === 'description') data.description = editValue;
      else if (field === 'numMen') data.numMen = parseFloat(editValue) || 0;
      else data.hoursPerMan = parseFloat(editValue) || 0;
      updateTemplateMutation.mutate({ id: task.id, data });
    } else {
      if (field === 'numMen' || field === 'hoursPerMan') {
        const parsed = parseFloat(editValue) || 0;
        const numMen = field === 'numMen' ? parsed : (task as LabourEstimateTask).numMen;
        const hoursPerMan = field === 'hoursPerMan' ? parsed : task.hoursPerMan;
        const totalHours = numMen * hoursPerMan;
        updateTaskMutation.mutate({ taskId: task.id, data: { [field]: parsed, totalHours } });
      } else {
        updateTaskMutation.mutate({ taskId: task.id, data: { description: editValue } });
      }
    }
  }, [editingCell, editValue, mode, updateTaskMutation, updateTemplateMutation]);

  const FIELD_ORDER = ['description', 'numMen', 'hoursPerMan'] as const;
  type EditField = typeof FIELD_ORDER[number];

  const getFieldValue = (t: TaskLike, f: EditField): string | number => {
    if (f === 'description') return t.description;
    if (f === 'numMen') return t.numMen;
    return t.hoursPerMan;
  };

  const navigateCell = useCallback((currentTaskId: string, currentField: EditField, dir: 'next' | 'prev' | 'down') => {
    const all = activeTasks;
    const taskIdx = all.findIndex(t => t.id === currentTaskId);
    const fieldIdx = FIELD_ORDER.indexOf(currentField);
    let nextTaskIdx = taskIdx;
    let nextFieldIdx = fieldIdx;

    if (dir === 'next') {
      if (fieldIdx < FIELD_ORDER.length - 1) {
        nextFieldIdx = fieldIdx + 1;
        while (nextTaskIdx < all.length && all[nextTaskIdx]?.subHeading && nextFieldIdx > 0) {
          nextTaskIdx++; nextFieldIdx = 0;
        }
      } else {
        nextTaskIdx = taskIdx + 1; nextFieldIdx = 0;
      }
    } else if (dir === 'prev') {
      if (fieldIdx > 0) {
        nextFieldIdx = fieldIdx - 1;
        while (nextTaskIdx >= 0 && all[nextTaskIdx]?.subHeading && nextFieldIdx > 0) nextFieldIdx = 0;
      } else {
        nextTaskIdx = taskIdx - 1; nextFieldIdx = FIELD_ORDER.length - 1;
        while (nextTaskIdx >= 0 && all[nextTaskIdx]?.subHeading && nextFieldIdx > 0) nextFieldIdx = 0;
      }
    } else {
      nextTaskIdx = taskIdx + 1;
      while (nextTaskIdx < all.length && all[nextTaskIdx]?.subHeading && nextFieldIdx > 0) nextTaskIdx++;
    }

    if (nextTaskIdx < 0 || nextTaskIdx >= all.length) return;
    const nextTask = all[nextTaskIdx];
    startEdit(nextTask.id, FIELD_ORDER[nextFieldIdx], getFieldValue(nextTask, FIELD_ORDER[nextFieldIdx]));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTasks]);

  // ── DnD handlers ──────────────────────────────────────────────────────────

  const handleCategoryDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const reordered = arrayMove(categories, categories.findIndex(c => c.id === active.id), categories.findIndex(c => c.id === over.id));
    queryClient.setQueryData<CategoryWithHours[]>(["/api/labour-estimates", estimate?.id, "categories"], reordered);
    reorderCategoriesMutation.mutate(reordered.map((c, i) => ({ id: c.id, sortOrder: i })));
  };

  const handleTaskDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const reordered = arrayMove(tasks, tasks.findIndex(t => t.id === active.id), tasks.findIndex(t => t.id === over.id));
    queryClient.setQueryData<LabourEstimateTask[]>(["/api/labour-estimate-categories", effectiveCatId, "tasks"], reordered);
    reorderTasksMutation.mutate(reordered.map((t, i) => ({ id: t.id, sortOrder: i })));
  };

  const handleTemplateDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const reordered = arrayMove(templateTasks, templateTasks.findIndex(t => t.id === active.id), templateTasks.findIndex(t => t.id === over.id));
    queryClient.setQueryData<TaskLike[]>(["/api/labour-task-templates", selectedCat?.name], reordered);
    reorderTemplatesMutation.mutate(reordered.map((t, i) => ({ id: t.id, sortOrder: i })));
  };

  // ── Add row ────────────────────────────────────────────────────────────────

  const addRow = () => {
    if (!selectedCat) return;
    const desc = newRowDesc.trim();
    if (mode === 'template') {
      addTemplateMutation.mutate({ description: desc, categoryName: selectedCat.name, sortOrder: templateTasks.length });
    } else {
      addTaskMutation.mutate({ description: desc, sortOrder: tasks.length });
    }
    setNewRowDesc("");
  };

  const submitNewCategory = () => {
    const name = newCatName.trim();
    if (!name) { setAddingCategory(false); return; }
    addCategoryMutation.mutate(name);
    setNewCatName("");
    setAddingCategory(false);
  };

  // ── Derived ────────────────────────────────────────────────────────────────

  const totalHours = tasks.reduce((sum, t) => sum + t.totalHours, 0);

  if (estimateLoading) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        Loading Labour Estimate…
      </div>
    );
  }

  // Name of cat to confirm deletion
  const catToDeleteName = categories.find(c => c.id === confirmDeleteCatId)?.name;

  return (
    <div className="flex flex-col flex-1 min-h-0">

      {/* Delete category confirmation */}
      <AlertDialog open={!!confirmDeleteCatId} onOpenChange={open => !open && setConfirmDeleteCatId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Category</AlertDialogTitle>
            <AlertDialogDescription>
              Delete "<strong>{catToDeleteName}</strong>" and all its tasks? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (confirmDeleteCatId) deleteCategoryMutation.mutate(confirmDeleteCatId); setConfirmDeleteCatId(null); }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete task confirmation */}
      <AlertDialog open={!!confirmDeleteTaskId} onOpenChange={open => !open && setConfirmDeleteTaskId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {mode === 'template' ? 'Template Item' : 'Task'}</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this {mode === 'template' ? 'template item' : 'task'}? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (confirmDeleteTaskId) {
                  if (mode === 'template') deleteTemplateMutation.mutate(confirmDeleteTaskId);
                  else deleteTaskMutation.mutate(confirmDeleteTaskId);
                }
                setConfirmDeleteTaskId(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Main layout — sidebar + task area */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* Left sidebar — categories */}
        <div className="w-60 flex-shrink-0 border-r border-border flex flex-col bg-muted/20">
          {/* Sidebar header with mode toggle */}
          <div className="h-9 flex items-center justify-between pl-2 pr-1 border-b border-border/50 flex-shrink-0 gap-1">
            <div className="flex items-center gap-1">
              <button
                onClick={() => setMode('project')}
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs transition-colors ${
                  mode === 'project' ? 'bg-[#bba7db]/20 text-foreground font-medium' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <FolderOpen className="w-3 h-3" />
                <span>Project</span>
              </button>
              <button
                onClick={() => setMode('template')}
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs transition-colors ${
                  mode === 'template' ? 'bg-[#bba7db]/20 text-foreground font-medium' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <BookOpen className="w-3 h-3" />
                <span>Template</span>
              </button>
            </div>
            {mode === 'project' && (
              <Button
                size="icon"
                variant="ghost"
                onClick={() => { setAddingCategory(true); setNewCatName(""); }}
                title="Add category"
              >
                <Plus className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>

          {/* New category input */}
          {addingCategory && mode === 'project' && (
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

          {/* Category list */}
          <div className="flex-1 overflow-y-auto">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleCategoryDragEnd}>
              <SortableContext items={categories.map(c => c.id)} strategy={verticalListSortingStrategy}>
                {categories.map(cat => (
                  <SortableCategoryItem
                    key={cat.id}
                    cat={cat}
                    isSelected={(selectedCatId === cat.id) || (!selectedCatId && cat === categories[0])}
                    onSelect={() => setSelectedCatId(cat.id)}
                    onDelete={() => setConfirmDeleteCatId(cat.id)}
                    onCopyToTemplate={() => copyCategoryToTemplateMutation.mutate(cat)}
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
          {mode === 'project' && (
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
          )}
        </div>

        {/* Right panel — tasks */}
        <div className="flex-1 flex flex-col min-w-0">

          {/* Category header */}
          {selectedCat && (
            <div className="h-9 flex items-center justify-between px-4 border-b border-border/50 bg-background flex-shrink-0 gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm font-semibold truncate">{selectedCat.name}</span>
                {mode === 'template' && (
                  <span className="text-[10px] text-muted-foreground border border-border/50 rounded px-1.5 py-0.5">Template</span>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {mode === 'template' && (
                  <button
                    onClick={() => applyTemplateMutation.mutate()}
                    disabled={applyTemplateMutation.isPending || templateTasks.length === 0}
                    className="flex items-center gap-1.5 text-xs border rounded-md px-2 h-6 hover-elevate active-elevate-2 disabled:opacity-40"
                    title="Apply this template to the project category"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Apply to Project</span>
                  </button>
                )}
                {mode === 'project' && (
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
                )}
              </div>
            </div>
          )}

          {/* Column headers */}
          <div
            className="grid text-[10px] font-medium text-muted-foreground uppercase tracking-wide bg-muted/40 border-b border-border/50 py-1.5 flex-shrink-0"
            style={{ gridTemplateColumns: "20px 1fr 70px 80px 80px 32px" }}
          >
            <span />
            <span>Description</span>
            <span className="text-center">No. Men</span>
            <span className="text-center">Hrs / Man</span>
            <span className="text-right pr-1">{mode === 'template' ? 'Default' : 'Total Hrs'}</span>
            <span />
          </div>

          {/* Task rows */}
          <div className="flex-1 overflow-y-auto">
            {!selectedCat ? (
              <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                Select a category to view {mode === 'template' ? 'template items' : 'tasks'}.
              </div>
            ) : activeTasks.length === 0 ? (
              <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                No {mode === 'template' ? 'template items' : 'tasks'} yet. Add one below.
              </div>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={mode === 'template' ? handleTemplateDragEnd : handleTaskDragEnd}
              >
                <SortableContext items={activeTasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
                  {activeTasks.map(task => (
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
                      onDelete={() => setConfirmDeleteTaskId(task.id)}
                      onCopyToTemplate={mode === 'project' ? () => copyTaskToTemplateMutation.mutate(task) : undefined}
                      isTemplate={mode === 'template'}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            )}
          </div>

          {/* Add row */}
          {selectedCat && (
            <div className="flex items-center gap-2 px-4 py-2 border-t border-border/30 flex-shrink-0">
              <Input
                placeholder={mode === 'template' ? "Add template item…" : "Add item…"}
                value={newRowDesc}
                onChange={e => setNewRowDesc(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addRow(); }}
                className="h-7 text-sm flex-1"
              />
              <Button size="sm" variant="outline" className="h-7 px-3 text-xs" onClick={addRow} disabled={addTaskMutation.isPending || addTemplateMutation.isPending}>
                <Plus className="w-3 h-3 mr-1" />
                Add
              </Button>
            </div>
          )}

          {/* Hours summary (project mode only) */}
          {mode === 'project' && selectedCat && tasks.length > 0 && (
            <div className="flex items-center justify-end gap-3 px-4 py-2 bg-muted/20 border-t border-border/50 text-xs flex-shrink-0">
              <span className="text-muted-foreground">{selectedCat.name}</span>
              <span className="font-medium tabular-nums">{totalHours.toFixed(2)} hrs</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Standalone page wrapper ──────────────────────────────────────────────────

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
      <div className="mx-3 mt-3 rounded-lg border border-border bg-card flex-shrink-0 overflow-hidden">
        <div className="h-9 flex items-center px-3 border-b border-border/50">
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
      <div className="flex-1 min-h-0 mx-3 mt-2 mb-4 border border-border rounded-md overflow-hidden flex flex-col">
        {projectId && <LabourEstimatePanel projectId={projectId} />}
      </div>
    </div>
  );
}
