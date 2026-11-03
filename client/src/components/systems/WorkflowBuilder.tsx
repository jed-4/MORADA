import { useState, forwardRef, useImperativeHandle } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Plus,
  MoreVertical,
  Trash2,
  Edit,
  Play,
  Power,
  PowerOff,
  ListTodo,
  Bell,
  History,
  ArrowUp,
  ArrowDown,
  Zap,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { usePermission } from "@/hooks/use-permission";
import type { WorkflowTemplate, TaskTemplate, UserRole } from "@shared/schema";
import {
  PROJECT_PHASES,
  WORKFLOW_TRIGGERS,
  type WorkflowAction,
  type WorkflowAssignee,
  type WorkflowTriggerConfig,
  type WorkflowTriggerType,
  type WorkflowRunResult,
} from "@shared/workflows";
import { LIBRARY_DOC_TYPES } from "@shared/schema";

export interface WorkflowBuilderHandle {
  openNewWorkflowDialog: () => void;
}

interface WorkflowBuilderProps {
  searchQuery?: string;
}

type StatusOption = { id: string; key: string; name: string; parentId?: string | null; isActive?: boolean; sortOrder?: number | null };
type FieldCategory = { key: string; options?: StatusOption[] };
type Person = { id: string; firstName?: string | null; lastName?: string | null; email?: string | null };
type Run = {
  id: string;
  triggerType: string;
  summary: string | null;
  status: "running" | "done" | "partial" | "failed";
  result: WorkflowRunResult | null;
  projectName: string | null;
  firedByName: string | null;
  createdAt: string;
};

type FormState = {
  name: string;
  description: string;
  triggerType: WorkflowTriggerType;
  triggerConfig: WorkflowTriggerConfig;
  actions: WorkflowAction[];
  isActive: boolean;
};

const EMPTY_FORM: FormState = {
  name: "",
  description: "",
  triggerType: "project_status",
  triggerConfig: {},
  actions: [],
  isActive: true,
};

const DOC_TYPE_LABELS: Record<string, string> = {
  sop: "SOP", policy: "Policy", template: "Template", checklist: "Checklist", reference: "Reference", document: "Document",
};

// Open a dialog from a menu item one tick after the menu has closed. Opened in
// the same tick, the menu's closing pointer-up lands outside the new dialog and
// a mouse click opened it only to shut it again (keyboard was fine).
const afterMenu = (open: () => void) => { setTimeout(open, 0); };

const personName = (p: Person | undefined) => (p ? [p.firstName, p.lastName].filter(Boolean).join(" ") || p.email || "Someone" : "Someone");

// A workflow saved before the engine only has the legacy columns. Read them
// into the builder's shape so editing one keeps what it did (the server reads
// them the same way: normaliseWorkflow in server/services/workflowEngine.ts).
function toForm(w: WorkflowTemplate): FormState {
  const base = { name: w.name, description: w.description || "", isActive: w.isActive !== false };
  const actions = Array.isArray(w.actions) ? (w.actions as WorkflowAction[]) : [];
  if (actions.length > 0 && w.triggerType in WORKFLOW_TRIGGERS) {
    return { ...base, triggerType: w.triggerType as WorkflowTriggerType, triggerConfig: (w.triggerConfig ?? {}) as WorkflowTriggerConfig, actions };
  }
  const configs = Array.isArray(w.taskConfigs) ? (w.taskConfigs as any[]) : [];
  const ids = Array.isArray(w.taskTemplateIds) ? (w.taskTemplateIds as string[]) : [];
  const legacyActions: WorkflowAction[] = configs.length
    ? configs.filter((c) => c?.templateId).map((c) => ({
        type: "create_task", taskTemplateId: c.templateId, offsetDays: Math.max(0, Number(c.offsetDays) || 0),
        assignee: c.assigneeRoleId ? { type: "role", roleId: c.assigneeRoleId } : { type: "template" },
      }))
    : ids.map((id) => ({ type: "create_task", taskTemplateId: id, offsetDays: 0, assignee: { type: "template" } }));
  if (w.triggerType === "status_change") return { ...base, triggerType: "project_status", triggerConfig: { statusKey: w.triggerStatus || undefined }, actions: legacyActions };
  if (w.triggerType === "stage_change") {
    const phase = (w.triggerStage || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
    const known = PROJECT_PHASES.some((p) => p.value === phase);
    return { ...base, triggerType: "project_phase", triggerConfig: known ? { phase: phase as any } : {}, actions: legacyActions };
  }
  return { ...base, triggerType: "manual", triggerConfig: {}, actions: legacyActions };
}

export const WorkflowBuilder = forwardRef<WorkflowBuilderHandle, WorkflowBuilderProps>(({ searchQuery }, ref) => {
  const { toast } = useToast();
  const canAdd = usePermission("operations.workflows", "add");
  const canEdit = usePermission("operations.workflows", "edit");
  const canDelete = usePermission("operations.workflows", "delete");

  const [showDialog, setShowDialog] = useState(false);
  const [editingWorkflow, setEditingWorkflow] = useState<WorkflowTemplate | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [runTarget, setRunTarget] = useState<WorkflowTemplate | null>(null);
  const [runProjectId, setRunProjectId] = useState<string>("none");
  const [historyFor, setHistoryFor] = useState<WorkflowTemplate | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<WorkflowTemplate | null>(null);

  const { data: workflows = [], isLoading: workflowsLoading } = useQuery<WorkflowTemplate[]>({
    queryKey: ["/api/systems/workflow-templates"],
  });
  const { data: taskTemplates = [] } = useQuery<TaskTemplate[]>({ queryKey: ["/api/systems/task-templates"] });
  const { data: allRoles = [] } = useQuery<(UserRole & { userCategory?: string | null; isActive?: boolean })[]>({ queryKey: ["/api/roles/assignable"] });
  const { data: allUsers = [] } = useQuery<(Person & { userCategory?: string | null; isActive?: boolean })[]>({ queryKey: ["/api/users/assignable"] });
  // Workflows act for the team: no client or trade roles/people to pick.
  const roles = allRoles.filter((r) => r.isActive !== false && (!r.userCategory || r.userCategory === "team"));
  const users = allUsers.filter((u) => u.isActive !== false && (!u.userCategory || u.userCategory === "team"));
  const { data: fieldCategories = [] } = useQuery<FieldCategory[]>({ queryKey: ["/api/field-categories"] });
  const { data: projects = [] } = useQuery<any[]>({ queryKey: ["/api/projects"], enabled: !!runTarget });
  const { data: docs = [] } = useQuery<any[]>({ queryKey: ["/api/docs"], enabled: showDialog });
  const { data: runs = [], isLoading: runsLoading } = useQuery<Run[]>({
    queryKey: ["/api/systems/workflow-templates", historyFor?.id, "runs"],
    queryFn: () => apiRequest(`/api/systems/workflow-templates/${historyFor!.id}/runs`, "GET"),
    enabled: !!historyFor,
  });

  // Detailed statuses only (a project's projectSubStatus is always one of
  // these), labelled with their phase so same-named ones can be told apart.
  const allStatusOptions = fieldCategories.find((c) => c.key === "project.status")?.options || [];
  const statusOptions = allStatusOptions
    .filter((o) => o.parentId && o.isActive !== false)
    .map((o) => {
      const phase = allStatusOptions.find((p) => p.id === o.parentId)?.name;
      return { ...o, label: phase ? `${phase} · ${o.name}` : o.name };
    });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["/api/systems/workflow-templates"] });

  const saveMutation = useMutation({
    mutationFn: (data: any) => editingWorkflow
      ? apiRequest(`/api/systems/workflow-templates/${editingWorkflow.id}`, "PATCH", data)
      : apiRequest("/api/systems/workflow-templates", "POST", data),
    onSuccess: () => {
      invalidate();
      setShowDialog(false);
      setEditingWorkflow(null);
      toast({ title: editingWorkflow ? "Workflow saved" : "Workflow created" });
    },
    onError: (error: Error) => toast({ title: "Couldn't save the workflow", description: error.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/systems/workflow-templates/${id}`, "DELETE"),
    onSuccess: () => { invalidate(); setDeleteTarget(null); toast({ title: "Workflow deleted" }); },
    onError: () => toast({ title: "Couldn't delete the workflow", variant: "destructive" }),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiRequest(`/api/systems/workflow-templates/${id}`, "PATCH", { isActive }),
    onSuccess: () => invalidate(),
    onError: (error: Error) => toast({ title: "Couldn't change the workflow", description: error.message, variant: "destructive" }),
  });

  const runMutation = useMutation({
    mutationFn: ({ id, projectId }: { id: string; projectId: string | null }): Promise<{ status: string; result: WorkflowRunResult }> =>
      apiRequest(`/api/systems/workflow-templates/${id}/run`, "POST", { projectId }),
    onSuccess: (run, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/systems/workflow-templates", id, "runs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      setRunTarget(null);
      toast({
        title: run.status === "done" ? "Workflow ran" : run.status === "partial" ? "Workflow ran, with problems" : "Workflow failed",
        description: runOutcome(run.result) + (run.result?.errors?.length ? ` ${run.result.errors.join(" ")}` : ""),
        variant: run.status === "failed" ? "destructive" : undefined,
      });
    },
    onError: (error: Error) => toast({ title: "Couldn't run the workflow", description: error.message, variant: "destructive" }),
  });

  const openNewWorkflowDialog = () => {
    setEditingWorkflow(null);
    setForm(EMPTY_FORM);
    setShowDialog(true);
  };
  useImperativeHandle(ref, () => ({ openNewWorkflowDialog }));

  const openEdit = (w: WorkflowTemplate) => {
    setEditingWorkflow(w);
    setForm(toForm(w));
    setShowDialog(true);
  };

  const save = () => {
    saveMutation.mutate({
      name: form.name.trim(),
      description: form.description,
      triggerType: form.triggerType,
      triggerConfig: form.triggerConfig,
      actions: form.actions,
      isActive: form.isActive,
      // Saved in the engine's shape from now on, so the legacy columns retire.
      taskTemplateIds: [],
      taskConfigs: [],
      triggerStage: null,
      triggerStatus: null,
    });
  };

  // --- Labels ---------------------------------------------------------------

  const templateTitle = (id?: string) => taskTemplates.find((t) => t.id === id)?.title || "a deleted task";
  const roleName = (id?: string) => allRoles.find((r) => r.id === id)?.name || "a deleted role";
  const userName = (id?: string) => personName(allUsers.find((u) => u.id === id));
  const assigneeLabel = (a: WorkflowAssignee) =>
    a.type === "role" ? `everyone in ${roleName(a.roleId)}` : a.type === "user" ? userName(a.userId) : "the task's usual people";

  const triggerSentence = (f: FormState): string => {
    const c = f.triggerConfig;
    switch (f.triggerType) {
      case "project_status": return `When a project moves to ${statusOptions.find((o) => o.key === c.statusKey)?.label || c.statusKey || "…"}`;
      case "project_phase": return `When a project enters ${PROJECT_PHASES.find((p) => p.value === c.phase)?.label || "…"}`;
      case "task_completed": return `When "${c.taskTemplateId ? templateTitle(c.taskTemplateId) : "…"}" is completed`;
      case "doc_approved":
        if (c.docId) return `When "${docs.find((d) => d.id === c.docId)?.title || "a document"}" is approved`;
        return `When ${c.docType ? `an ${DOC_TYPE_LABELS[c.docType] || c.docType}` : "any document"} is approved`;
      case "manual": return "Only when run by hand";
    }
  };

  const actionSentence = (a: WorkflowAction): string =>
    a.type === "create_task"
      ? `Create "${templateTitle(a.taskTemplateId)}" for ${assigneeLabel(a.assignee)}${a.offsetDays ? `, due in ${a.offsetDays} day${a.offsetDays === 1 ? "" : "s"}` : ", due the same day"}`
      : `Notify ${assigneeLabel(a.recipient)}: "${a.message}"`;

  // --- Form helpers ---------------------------------------------------------

  const setAction = (i: number, next: WorkflowAction) =>
    setForm((f) => ({ ...f, actions: f.actions.map((a, j) => (j === i ? next : a)) }));
  const moveAction = (i: number, dir: -1 | 1) =>
    setForm((f) => {
      const actions = [...f.actions];
      const j = i + dir;
      if (j < 0 || j >= actions.length) return f;
      [actions[i], actions[j]] = [actions[j], actions[i]];
      return { ...f, actions };
    });
  const removeAction = (i: number) => setForm((f) => ({ ...f, actions: f.actions.filter((_, j) => j !== i) }));
  const addTaskStep = () => setForm((f) => ({ ...f, actions: [...f.actions, { type: "create_task", taskTemplateId: "", offsetDays: 0, assignee: { type: "template" } }] }));
  const addNotifyStep = () => setForm((f) => ({ ...f, actions: [...f.actions, { type: "notify", recipient: { type: "role", roleId: "" }, message: "" }] }));

  const formProblem = (): string | null => {
    if (!form.name.trim()) return "Give it a name";
    const c = form.triggerConfig;
    if (form.triggerType === "project_status" && !c.statusKey) return "Choose the status";
    if (form.triggerType === "project_phase" && !c.phase) return "Choose the phase";
    if (form.triggerType === "task_completed" && !c.taskTemplateId) return "Choose the task";
    if (form.actions.length === 0) return "Add at least one step";
    for (const a of form.actions) {
      if (a.type === "create_task" && !a.taskTemplateId) return "Choose a task for every task step";
      const who = a.type === "create_task" ? a.assignee : a.recipient;
      if (who.type === "role" && !who.roleId) return "Choose a role";
      if (who.type === "user" && !who.userId) return "Choose a person";
      if (a.type === "notify" && !a.message.trim()) return "Write the notification message";
    }
    return null;
  };

  // --- Render ---------------------------------------------------------------

  if (workflowsLoading) {
    return (
      <Card className="p-6">
        <div className="text-center text-muted-foreground">Loading…</div>
      </Card>
    );
  }

  const q = (searchQuery || "").trim().toLowerCase();
  const visible = q ? workflows.filter((w) => w.name.toLowerCase().includes(q) || (w.description || "").toLowerCase().includes(q)) : workflows;
  const activeWorkflows = visible.filter((w) => w.isActive);
  const inactiveWorkflows = visible.filter((w) => !w.isActive);

  const card = (workflow: WorkflowTemplate) => {
    const f = toForm(workflow);
    return (
      <Card key={workflow.id} className={`p-4 ${workflow.isActive ? "" : "opacity-60"}`} data-testid={`workflow-card-${workflow.id}`}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h4 className="font-medium">{workflow.name}</h4>
              <Badge variant="outline" className="gap-1 no-default-hover-elevate no-default-active-elevate">
                {workflow.isActive ? <Power className="h-3 w-3 text-status-success" /> : <PowerOff className="h-3 w-3" />}
                {workflow.isActive ? "On" : "Off"}
              </Badge>
            </div>
            {workflow.description && <p className="text-sm text-muted-foreground mb-2">{workflow.description}</p>}
            <div className="flex items-center gap-2 text-sm mb-1.5">
              <Zap className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span>{triggerSentence(f)}</span>
            </div>
            <ol className="space-y-1 pl-5">
              {f.actions.map((a, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                  {a.type === "create_task" ? <ListTodo className="h-3.5 w-3.5 mt-0.5 shrink-0" /> : <Bell className="h-3.5 w-3.5 mt-0.5 shrink-0" />}
                  <span>{actionSentence(a)}</span>
                </li>
              ))}
              {f.actions.length === 0 && <li className="text-sm text-muted-foreground">No steps yet</li>}
            </ol>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" data-testid={`workflow-menu-${workflow.id}`}>
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {canEdit && (
                <DropdownMenuItem onSelect={() => afterMenu(() => openEdit(workflow))} data-testid="menu-edit-workflow">
                  <Edit className="h-4 w-4 mr-2" />Edit
                </DropdownMenuItem>
              )}
              {canEdit && f.actions.length > 0 && (
                <DropdownMenuItem onSelect={() => afterMenu(() => { setRunProjectId("none"); setRunTarget(workflow); })} data-testid="menu-run-workflow">
                  <Play className="h-4 w-4 mr-2" />Run now…
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onSelect={() => afterMenu(() => setHistoryFor(workflow))} data-testid="menu-history-workflow">
                <History className="h-4 w-4 mr-2" />History
              </DropdownMenuItem>
              {canEdit && (
                <DropdownMenuItem
                  onClick={() => toggleActiveMutation.mutate({ id: workflow.id, isActive: !workflow.isActive })}
                  data-testid={workflow.isActive ? "menu-deactivate-workflow" : "menu-activate-workflow"}
                >
                  {workflow.isActive ? <PowerOff className="h-4 w-4 mr-2" /> : <Power className="h-4 w-4 mr-2" />}
                  {workflow.isActive ? "Turn off" : "Turn on"}
                </DropdownMenuItem>
              )}
              {canDelete && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => afterMenu(() => setDeleteTarget(workflow))} className="text-destructive" data-testid="menu-delete-workflow">
                    <Trash2 className="h-4 w-4 mr-2" />Delete
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </Card>
    );
  };

  const assigneePicker = (
    value: WorkflowAssignee,
    onChange: (a: WorkflowAssignee) => void,
    allowTemplate: boolean,
    testId: string,
  ) => (
    <div className="flex gap-2">
      <Select
        value={value.type}
        onValueChange={(t) => {
          if (!t) return; // Radix emits "" on hydrate
          if (t === "template") onChange({ type: "template" });
          else if (t === "role") onChange({ type: "role", roleId: "" });
          else onChange({ type: "user", userId: "" });
        }}
      >
        <SelectTrigger className="w-44" data-testid={`${testId}-type`}><SelectValue /></SelectTrigger>
        <SelectContent>
          {allowTemplate && <SelectItem value="template">Task's usual people</SelectItem>}
          <SelectItem value="role">Everyone in a role</SelectItem>
          <SelectItem value="user">A person</SelectItem>
        </SelectContent>
      </Select>
      {value.type === "role" && (
        <Select value={value.roleId || undefined} onValueChange={(v) => v && onChange({ type: "role", roleId: v })}>
          <SelectTrigger className="flex-1" data-testid={`${testId}-role`}><SelectValue placeholder="Choose a role" /></SelectTrigger>
          <SelectContent>
            {roles.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
          </SelectContent>
        </Select>
      )}
      {value.type === "user" && (
        <Select value={value.userId || undefined} onValueChange={(v) => v && onChange({ type: "user", userId: v })}>
          <SelectTrigger className="flex-1" data-testid={`${testId}-user`}><SelectValue placeholder="Choose a person" /></SelectTrigger>
          <SelectContent>
            {users.map((u) => <SelectItem key={u.id} value={u.id}>{personName(u)}</SelectItem>)}
          </SelectContent>
        </Select>
      )}
    </div>
  );

  const problem = formProblem();

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto space-y-4 p-3">
        {activeWorkflows.length > 0 && (
          <div>
            <h3 className="text-sm font-medium mb-2 text-muted-foreground">On</h3>
            <div className="grid gap-3">{activeWorkflows.map(card)}</div>
          </div>
        )}
        {inactiveWorkflows.length > 0 && (
          <div>
            <h3 className="text-sm font-medium mb-2 text-muted-foreground">Off</h3>
            <div className="grid gap-3">{inactiveWorkflows.map(card)}</div>
          </div>
        )}
        {workflows.length === 0 && (
          <Card className="p-8">
            <div className="text-center space-y-2">
              <Zap className="h-8 w-8 mx-auto text-muted-foreground/40" />
              <p className="text-sm font-medium text-muted-foreground">No workflows yet</p>
              <p className="text-xs text-muted-foreground max-w-md mx-auto">
                A workflow does the next thing for you. For example: when a project moves to Construction,
                create the site set-up tasks and let the office know.
              </p>
              {canAdd && (
                <Button size="sm" className="mt-2" onClick={openNewWorkflowDialog} data-testid="button-new-workflow-empty">
                  <Plus className="h-4 w-4 mr-1" />New workflow
                </Button>
              )}
            </div>
          </Card>
        )}
      </div>

      {/* Build / edit */}
      <Dialog open={showDialog} onOpenChange={(open) => { setShowDialog(open); if (!open) setEditingWorkflow(null); }}>
        <DialogContent className="max-w-2xl" data-testid="dialog-workflow">
          <DialogHeader>
            <DialogTitle>{editingWorkflow ? "Edit workflow" : "New workflow"}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-5 overflow-y-auto pr-1">
            <div className="grid gap-3">
              <div>
                <Label>Name</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Construction start" data-testid="input-workflow-name" />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Optional" rows={2} data-testid="input-workflow-description" />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-1.5"><Zap className="h-3.5 w-3.5" />When</Label>
              <Select
                value={form.triggerType}
                onValueChange={(v) => v && setForm({ ...form, triggerType: v as WorkflowTriggerType, triggerConfig: {} })}
              >
                <SelectTrigger data-testid="select-workflow-trigger-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(WORKFLOW_TRIGGERS) as WorkflowTriggerType[]).map((t) => (
                    <SelectItem key={t} value={t}>{WORKFLOW_TRIGGERS[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.triggerType === "project_status" && (
                <Select value={form.triggerConfig.statusKey || undefined} onValueChange={(v) => v && setForm({ ...form, triggerConfig: { statusKey: v } })}>
                  <SelectTrigger data-testid="select-workflow-status"><SelectValue placeholder="Choose a status" /></SelectTrigger>
                  <SelectContent>
                    {statusOptions.map((o) => <SelectItem key={o.id} value={o.key}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
              {form.triggerType === "project_phase" && (
                <Select value={form.triggerConfig.phase || undefined} onValueChange={(v) => v && setForm({ ...form, triggerConfig: { phase: v as any } })}>
                  <SelectTrigger data-testid="select-workflow-phase"><SelectValue placeholder="Choose a phase" /></SelectTrigger>
                  <SelectContent>
                    {PROJECT_PHASES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
              {form.triggerType === "task_completed" && (
                <Select value={form.triggerConfig.taskTemplateId || undefined} onValueChange={(v) => v && setForm({ ...form, triggerConfig: { taskTemplateId: v } })}>
                  <SelectTrigger data-testid="select-workflow-trigger-task"><SelectValue placeholder="Choose the task" /></SelectTrigger>
                  <SelectContent>
                    {taskTemplates.map((t) => <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
              {form.triggerType === "doc_approved" && (
                <Select
                  value={form.triggerConfig.docId ? `doc:${form.triggerConfig.docId}` : form.triggerConfig.docType ? `type:${form.triggerConfig.docType}` : "any"}
                  onValueChange={(v) => {
                    if (!v) return;
                    if (v === "any") setForm({ ...form, triggerConfig: {} });
                    else if (v.startsWith("type:")) setForm({ ...form, triggerConfig: { docType: v.slice(5) } });
                    else setForm({ ...form, triggerConfig: { docId: v.slice(4) } });
                  }}
                >
                  <SelectTrigger data-testid="select-workflow-doc"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any document</SelectItem>
                    {LIBRARY_DOC_TYPES.map((t) => <SelectItem key={t} value={`type:${t}`}>Any {DOC_TYPE_LABELS[t]}</SelectItem>)}
                    {docs.filter((d) => d.status !== "archived").map((d) => <SelectItem key={d.id} value={`doc:${d.id}`}>{d.title}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
              <p className="text-xs text-muted-foreground">
                {form.triggerType === "manual"
                  ? "Runs only when someone picks Run now. Any workflow can also be run by hand."
                  : "Runs once per event. A project that moves away and back doesn't run it twice."}
              </p>
            </div>

            <div className="space-y-2">
              <Label>Then</Label>
              {form.actions.map((a, i) => (
                <Card key={i} className="p-3 space-y-2" data-testid={`workflow-step-${i}`}>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-muted-foreground w-5">{i + 1}.</span>
                    {a.type === "create_task" ? <ListTodo className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
                    <span className="text-sm font-medium flex-1">{a.type === "create_task" ? "Create a task" : "Send a notification"}</span>
                    <Button variant="ghost" size="icon" className="h-7 w-7" disabled={i === 0} onClick={() => moveAction(i, -1)} aria-label="Move up"><ArrowUp className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" disabled={i === form.actions.length - 1} onClick={() => moveAction(i, 1)} aria-label="Move down"><ArrowDown className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeAction(i)} aria-label="Remove step" data-testid={`workflow-step-${i}-remove`}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                  {a.type === "create_task" ? (
                    <div className="grid gap-2 pl-7">
                      <Select value={a.taskTemplateId || undefined} onValueChange={(v) => v && setAction(i, { ...a, taskTemplateId: v })}>
                        <SelectTrigger data-testid={`workflow-step-${i}-task`}><SelectValue placeholder="Choose the task" /></SelectTrigger>
                        <SelectContent>
                          {taskTemplates.map((t) => <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      {assigneePicker(a.assignee, (assignee) => setAction(i, { ...a, assignee }), true, `workflow-step-${i}-assignee`)}
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-muted-foreground">Due</span>
                        <Input
                          type="number"
                          min={0}
                          max={365}
                          className="w-20 h-8"
                          value={a.offsetDays}
                          onChange={(e) => setAction(i, { ...a, offsetDays: Math.max(0, Math.min(365, parseInt(e.target.value, 10) || 0)) })}
                          data-testid={`workflow-step-${i}-offset`}
                        />
                        <span className="text-muted-foreground">days after it fires (0 = same day)</span>
                      </div>
                    </div>
                  ) : (
                    <div className="grid gap-2 pl-7">
                      {assigneePicker(a.recipient, (recipient) => setAction(i, { ...a, recipient: recipient as typeof a.recipient }), false, `workflow-step-${i}-recipient`)}
                      <Textarea
                        rows={2}
                        maxLength={500}
                        value={a.message}
                        onChange={(e) => setAction(i, { ...a, message: e.target.value })}
                        placeholder="e.g. Construction has started. Book the site set-up."
                        data-testid={`workflow-step-${i}-message`}
                      />
                    </div>
                  )}
                </Card>
              ))}
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={addTaskStep} data-testid="button-add-task-step"><ListTodo className="h-4 w-4 mr-1" />Create a task</Button>
                <Button variant="outline" size="sm" onClick={addNotifyStep} data-testid="button-add-notify-step"><Bell className="h-4 w-4 mr-1" />Send a notification</Button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label>On</Label>
                <p className="text-xs text-muted-foreground">Off stops it running. It can still be run by hand.</p>
              </div>
              <Switch checked={form.isActive} onCheckedChange={(checked) => setForm({ ...form, isActive: checked })} data-testid="switch-workflow-active" />
            </div>
          </div>
          <DialogFooter className="items-center">
            {problem && <span className="text-xs text-muted-foreground mr-auto">{problem}</span>}
            <Button variant="outline" onClick={() => setShowDialog(false)} data-testid="button-cancel-workflow">Cancel</Button>
            <Button onClick={save} disabled={!!problem || saveMutation.isPending} data-testid="button-save-workflow">
              {saveMutation.isPending ? "Saving…" : editingWorkflow ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Run now */}
      <Dialog open={!!runTarget} onOpenChange={(open) => !open && setRunTarget(null)}>
        <DialogContent className="max-w-md" data-testid="dialog-run-workflow">
          <DialogHeader>
            <DialogTitle>Run "{runTarget?.name}"</DialogTitle>
            <DialogDescription>Runs its steps now. Tasks it creates are attached to the project you choose.</DialogDescription>
          </DialogHeader>
          <Select value={runProjectId} onValueChange={(v) => v && setRunProjectId(v)}>
            <SelectTrigger data-testid="select-run-project"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No project (business task)</SelectItem>
              {projects.filter((p) => !p.isBusiness).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRunTarget(null)}>Cancel</Button>
            <Button
              onClick={() => runTarget && runMutation.mutate({ id: runTarget.id, projectId: runProjectId === "none" ? null : runProjectId })}
              disabled={runMutation.isPending}
              data-testid="button-run-workflow-confirm"
            >
              <Play className="h-4 w-4 mr-1" />{runMutation.isPending ? "Running…" : "Run now"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* History */}
      <Dialog open={!!historyFor} onOpenChange={(open) => !open && setHistoryFor(null)}>
        <DialogContent className="max-w-xl" data-testid="dialog-workflow-history">
          <DialogHeader>
            <DialogTitle>History: {historyFor?.name}</DialogTitle>
            <DialogDescription>The last 50 times it ran.</DialogDescription>
          </DialogHeader>
          <div className="overflow-y-auto space-y-2">
            {runsLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
            {!runsLoading && runs.length === 0 && <p className="text-sm text-muted-foreground">It hasn't run yet.</p>}
            {runs.map((r) => (
              <div key={r.id} className="border rounded-md p-2.5 text-sm space-y-1" data-testid={`workflow-run-${r.id}`}>
                <div className="flex items-center gap-2">
                  <RunStatus status={r.status} />
                  <span className="flex-1 min-w-0 truncate">{r.summary || r.triggerType}</span>
                  <span className="text-xs text-muted-foreground shrink-0" title={new Date(r.createdAt).toLocaleString()}>
                    {formatDistanceToNow(new Date(r.createdAt), { addSuffix: true })}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {runOutcome(r.result)}{r.firedByName && r.triggerType !== "manual" ? ` · by ${r.firedByName}` : ""}{r.projectName ? ` · ${r.projectName}` : ""}
                </p>
                {r.result?.errors?.map((e, i) => <p key={i} className="text-xs text-[hsl(var(--status-danger-fg))]">{e}</p>)}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleteTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              It stops running and its history goes with it. Tasks it already created stay. To pause it instead, turn it off.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)} data-testid="button-confirm-delete-workflow">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
});

WorkflowBuilder.displayName = "WorkflowBuilder";

function runOutcome(result: WorkflowRunResult | null | undefined): string {
  if (!result) return "Running…";
  const parts: string[] = [];
  const t = result.createdTaskIds?.length ?? 0;
  const n = result.notifiedUserIds?.length ?? 0;
  if (t) parts.push(`${t} task${t === 1 ? "" : "s"} created`);
  if (n) parts.push(`${n} ${n === 1 ? "person" : "people"} notified`);
  return parts.join(", ") || "Nothing created";
}

function RunStatus({ status }: { status: Run["status"] }) {
  const map: Record<Run["status"], { label: string; cls: string }> = {
    done: { label: "Done", cls: "bg-[hsl(var(--status-success-bg))] text-[hsl(var(--status-success-fg))]" },
    partial: { label: "Partly", cls: "bg-[hsl(var(--status-warning-bg))] text-[hsl(var(--status-warning-fg))]" },
    failed: { label: "Failed", cls: "bg-[hsl(var(--status-danger-bg))] text-[hsl(var(--status-danger-fg))]" },
    running: { label: "Running", cls: "bg-muted text-muted-foreground" },
  };
  const s = map[status] ?? map.running;
  return <span className={`text-xs px-1.5 py-0.5 rounded-full shrink-0 ${s.cls}`}>{s.label}</span>;
}
