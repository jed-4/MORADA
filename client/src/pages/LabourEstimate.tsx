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
} from "lucide-react";
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

export function LabourEstimatePanel({ projectId }: { projectId: string }) {
  const { toast } = useToast();
  const [selectedCatId, setSelectedCatId] = useState<string | null>(null);
  const [editingCell, setEditingCell] = useState<{ taskId: string; field: string } | null>(null);
  const [editValue, setEditValue] = useState("");
  const addRowRef = useRef<HTMLInputElement>(null);

  const { data: estimate, isLoading: estimateLoading } = useQuery<LabourEstimate>({
    queryKey: ["/api/projects", projectId, "labour-estimate"],
    queryFn: () => fetch(`/api/projects/${projectId}/labour-estimate`, { credentials: "include" }).then(r => r.json()),
    enabled: !!projectId,
  });

  const { data: categories = [] } = useQuery<LabourEstimateCategory[]>({
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

  const updateEstimateMutation = useMutation({
    mutationFn: (data: { labourRatePerHour?: number; title?: string }) =>
      apiRequest(`/api/labour-estimates/${estimate!.id}`, "PATCH", data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "labour-estimate"] }),
  });

  const updateCategoryMutation = useMutation({
    mutationFn: ({ catId, data }: { catId: string; data: { status?: string } }) =>
      apiRequest(`/api/labour-estimates/${estimate!.id}/categories/${catId}`, "PATCH", data),
    onMutate: async ({ catId, data }) => {
      await queryClient.cancelQueries({ queryKey: ["/api/labour-estimates", estimate?.id, "categories"] });
      const prev = queryClient.getQueryData<LabourEstimateCategory[]>(["/api/labour-estimates", estimate?.id, "categories"]);
      queryClient.setQueryData<LabourEstimateCategory[]>(["/api/labour-estimates", estimate?.id, "categories"], old =>
        old?.map(c => c.id === catId ? { ...c, ...data } : c) ?? []
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      queryClient.setQueryData(["/api/labour-estimates", estimate?.id, "categories"], ctx?.prev);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["/api/labour-estimates", estimate?.id, "categories"] }),
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
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["/api/labour-estimate-categories", effectiveCatId, "tasks"] }),
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
        // Skip numMen/hoursPerMan for subheading rows
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
      // For numeric fields, skip subheading rows
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

  const [newRowDesc, setNewRowDesc] = useState("");
  const addRow = () => {
    if (!newRowDesc.trim() && newRowDesc !== "") return;
    addTaskMutation.mutate({ description: newRowDesc.trim() || "New Item" });
    setNewRowDesc("");
  };

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
        <div className="w-56 flex-shrink-0 border-r border-border flex flex-col bg-muted/20">
          <div className="h-9 flex items-center px-3 border-b border-border/50">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Categories</span>
          </div>
          <div className="flex-1 overflow-y-auto">
            {categories.map(cat => {
              const cfg = STATUS_CONFIG[cat.status] ?? STATUS_CONFIG.not_complete;
              const StatusIcon = cfg.icon;
              const isSelected = (selectedCatId === cat.id) || (!selectedCatId && cat === categories[0]);

              return (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCatId(cat.id)}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover-elevate transition-colors ${
                    isSelected ? "bg-[#bba7db]/10 border-l-2 border-[#bba7db]" : "border-l-2 border-transparent"
                  }`}
                >
                  <StatusIcon className={`w-3.5 h-3.5 flex-shrink-0 ${cfg.color}`} />
                  <span className="flex-1 min-w-0 truncate text-xs leading-snug">{cat.name}</span>
                  {isSelected && (
                    <ChevronRight className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
          {/* Category status legend */}
          <div className="border-t border-border/50 px-3 py-2 space-y-1">
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
            className="grid text-[10px] font-medium text-muted-foreground uppercase tracking-wide bg-muted/40 border-b border-border/50 px-4 py-1.5 flex-shrink-0"
            style={{ gridTemplateColumns: "1fr 70px 80px 80px 32px" }}
          >
            <span>Description</span>
            <span className="text-center">No. Men</span>
            <span className="text-center">Hrs / Man</span>
            <span className="text-right">Total Hrs</span>
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
              tasks.map(task => (
                <div
                  key={task.id}
                  className={`grid items-center px-4 border-b border-border/10 group/row min-h-[34px] ${
                    task.subHeading ? "bg-muted/30 font-medium" : ""
                  }`}
                  style={{ gridTemplateColumns: "1fr 70px 80px 80px 32px" }}
                >
                  {/* Description */}
                  <div className="pr-2 py-0.5">
                    {editingCell?.taskId === task.id && editingCell.field === 'description' ? (
                      <Input
                        autoFocus
                        value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        onFocus={e => e.target.select()}
                        onBlur={() => commitEdit(task, 'description')}
                        onKeyDown={e => {
                          if (e.key === 'Escape') { setEditingCell(null); return; }
                          if (e.key === 'Enter') { e.preventDefault(); commitEdit(task, 'description'); navigateCell(task.id, 'description', 'down'); return; }
                          if (e.key === 'Tab') { e.preventDefault(); commitEdit(task, 'description'); navigateCell(task.id, 'description', e.shiftKey ? 'prev' : 'next'); }
                        }}
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
                        onBlur={() => commitEdit(task, 'numMen')}
                        onKeyDown={e => {
                          if (e.key === 'Escape') { setEditingCell(null); return; }
                          if (e.key === 'Enter') { e.preventDefault(); commitEdit(task, 'numMen'); navigateCell(task.id, 'numMen', 'down'); return; }
                          if (e.key === 'Tab') { e.preventDefault(); commitEdit(task, 'numMen'); navigateCell(task.id, 'numMen', e.shiftKey ? 'prev' : 'next'); }
                        }}
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
                        onBlur={() => commitEdit(task, 'hoursPerMan')}
                        onKeyDown={e => {
                          if (e.key === 'Escape') { setEditingCell(null); return; }
                          if (e.key === 'Enter') { e.preventDefault(); commitEdit(task, 'hoursPerMan'); navigateCell(task.id, 'hoursPerMan', 'down'); return; }
                          if (e.key === 'Tab') { e.preventDefault(); commitEdit(task, 'hoursPerMan'); navigateCell(task.id, 'hoursPerMan', e.shiftKey ? 'prev' : 'next'); }
                        }}
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
                  <div className="text-right">
                    <span className="text-sm tabular-nums font-medium">
                      {task.subHeading ? "" : task.totalHours.toFixed(2)}
                    </span>
                  </div>

                  {/* Delete */}
                  <div className="flex justify-center opacity-0 group-hover/row:opacity-100 transition-opacity">
                    <button
                      onClick={() => deleteTaskMutation.mutate(task.id)}
                      className="h-5 w-5 flex items-center justify-center text-muted-foreground hover:text-destructive rounded"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))
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
