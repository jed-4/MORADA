import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Heading2,
  List,
  CheckSquare,
  Plus,
  Type,
  Trash2,
  MoreHorizontal,
  Pencil,
  Check,
  X,
} from "lucide-react";
import type { WidgetProps } from "@/types/widgets";
import { useProject } from "@/contexts/ProjectContext";
import { WidgetSkeleton, WidgetEmpty, WidgetError } from "@/components/ui/widget-states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type BlockKind = "heading" | "text" | "bullet" | "todo";

const QUICK_TAG = "quickblock";

interface QuickNoteRow {
  id: string;
  title: string;
  content: string;
  tags?: string[] | null;
  customFields?: Record<string, any> | null;
  status?: string | null;
  createdAt: string | Date;
}

function inferKind(n: QuickNoteRow): BlockKind {
  const cf = (n.customFields as any) || {};
  if (cf.blockType === "heading" || cf.blockType === "bullet" || cf.blockType === "todo") {
    return cf.blockType;
  }
  const tags = (n.tags as string[] | null) || [];
  for (const t of tags) {
    const m = /^block:(heading|bullet|todo|text)$/.exec(String(t));
    if (m) return m[1] as BlockKind;
  }
  return "text";
}

function blockMeta(kind: BlockKind) {
  switch (kind) {
    case "heading":
      return { icon: Heading2, label: "Heading", placeholder: "Section heading…" };
    case "bullet":
      return { icon: List, label: "Bullet", placeholder: "Add a bullet…" };
    case "todo":
      return { icon: CheckSquare, label: "To-do", placeholder: "Add a to-do…" };
    default:
      return { icon: Type, label: "Text", placeholder: "Quick note…" };
  }
}

export default function QuickNotesWidget(_: WidgetProps) {
  const { currentProject } = useProject();
  const { toast } = useToast();
  const projectId = currentProject?.id;

  const [draft, setDraft] = useState("");
  const [kind, setKind] = useState<BlockKind>("text");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  const notesQ = useQuery<QuickNoteRow[]>({
    queryKey: ["/api/notes", projectId, QUICK_TAG],
    queryFn: async () => {
      if (!projectId) return [];
      const r = await fetch(`/api/notes?projectId=${projectId}`, { credentials: "include" });
      if (!r.ok) throw new Error(`${r.status}`);
      const all: QuickNoteRow[] = await r.json();
      return all.filter((n) => {
        const tags = (n.tags as string[] | null) || [];
        return Array.isArray(tags) && tags.some((t) => String(t).toLowerCase() === QUICK_TAG);
      });
    },
    enabled: !!projectId,
  });

  const create = useMutation({
    mutationFn: async (vars: { kind: BlockKind; text: string }) => {
      const text = vars.text.trim();
      if (!text || !projectId) throw new Error("missing");
      return apiRequest("/api/notes", "POST", {
        title: vars.kind === "heading" ? text.slice(0, 80) : "Quick note",
        content: text,
        contentText: text,
        type: "note",
        scope: "project",
        projectId,
        category: "Quick Notes",
        priority: "low",
        tags: [QUICK_TAG, `block:${vars.kind}`],
        customFields: { blockType: vars.kind },
        status: vars.kind === "todo" ? "todo" : undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notes", projectId, QUICK_TAG] });
      setDraft("");
    },
    onError: (e: any) => toast({ title: "Couldn't add note", description: e.message, variant: "destructive" }),
  });

  const update = useMutation({
    mutationFn: async (vars: { id: string; kind: BlockKind; text: string }) => {
      const text = vars.text.trim();
      if (!text) throw new Error("empty");
      return apiRequest(`/api/notes/${vars.id}`, "PATCH", {
        title: vars.kind === "heading" ? text.slice(0, 80) : "Quick note",
        content: text,
        contentText: text,
      });
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/notes", projectId, QUICK_TAG] });
      setEditingId((prev) => (prev === vars.id ? null : prev));
      setEditText((prev) => (editingId === vars.id ? "" : prev));
    },
    onError: (e: any) => toast({ title: "Couldn't save note", description: e.message, variant: "destructive" }),
  });

  const toggleTodo = useMutation({
    mutationFn: async (vars: { id: string; status: string }) => {
      return apiRequest(`/api/notes/${vars.id}`, "PATCH", { status: vars.status });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/notes", projectId, QUICK_TAG] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => apiRequest(`/api/notes/${id}`, "DELETE"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/notes", projectId, QUICK_TAG] }),
  });

  if (!currentProject) return <WidgetEmpty message="Select a project to capture quick notes" />;
  if (notesQ.isLoading) return <WidgetSkeleton />;
  if (notesQ.isError) return <WidgetError onRetry={() => notesQ.refetch()} />;

  const notes = (notesQ.data || []).slice().sort((a, b) => {
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });

  const meta = blockMeta(kind);
  const KindIcon = meta.icon;

  const startEdit = (n: QuickNoteRow) => {
    setEditingId(n.id);
    setEditText(n.content);
  };
  const cancelEdit = () => {
    setEditingId(null);
    setEditText("");
  };
  const commitEdit = (n: QuickNoteRow, k: BlockKind) => {
    if (!editText.trim()) return;
    update.mutate({ id: n.id, kind: k, text: editText });
  };

  return (
    <div className="flex flex-col h-full" data-testid="widget-quick-notes">
      <div className="flex-1 overflow-auto px-3 py-3 divide-y divide-border">
        {notes.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">
            No quick notes yet. Add the first block below.
          </p>
        )}
        {notes.map((n) => {
          const k = inferKind(n);
          const done = k === "todo" && n.status === "done";
          const isEditing = editingId === n.id;
          const rowAlign = k === "heading" ? "items-center" : "items-start";

          return (
            <div
              key={n.id}
              className={`group flex ${rowAlign} gap-2 py-2 first:pt-0`}
              data-testid={`quicknote-${n.id}`}
            >
              {k === "todo" && (
                <Checkbox
                  checked={done}
                  className="mt-1"
                  onCheckedChange={(checked) =>
                    toggleTodo.mutate({ id: n.id, status: checked ? "done" : "todo" })
                  }
                  data-testid={`checkbox-quicknote-${n.id}`}
                />
              )}
              {k === "bullet" && <span className="text-muted-foreground mt-1.5 leading-none">•</span>}

              {isEditing ? (
                <Input
                  autoFocus
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      commitEdit(n, k);
                    } else if (e.key === "Escape") {
                      e.preventDefault();
                      cancelEdit();
                    }
                  }}
                  className="h-7 text-sm flex-1"
                  data-testid={`input-edit-quicknote-${n.id}`}
                />
              ) : k === "heading" ? (
                <h4 className="text-sm font-semibold flex-1 truncate">{n.content}</h4>
              ) : (
                <span
                  className={`text-sm flex-1 break-words ${done ? "line-through text-muted-foreground" : ""}`}
                >
                  {n.content}
                </span>
              )}

              {isEditing ? (
                <div className="flex items-center gap-0.5">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 text-muted-foreground"
                    onClick={() => commitEdit(n, k)}
                    disabled={!editText.trim() || update.isPending}
                    title="Save"
                    data-testid={`button-save-quicknote-${n.id}`}
                  >
                    <Check className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 text-muted-foreground"
                    onClick={cancelEdit}
                    title="Cancel"
                    data-testid={`button-cancel-quicknote-${n.id}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
                      title="More"
                      data-testid={`button-quicknote-menu-${n.id}`}
                    >
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() => startEdit(n)}
                      data-testid={`button-edit-quicknote-${n.id}`}
                    >
                      <Pencil className="h-3.5 w-3.5 mr-2" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => remove.mutate(n.id)}
                      data-testid={`button-delete-quicknote-${n.id}`}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          );
        })}
      </div>
      <form
        className="border-t border-border p-2 flex items-center gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (draft.trim()) create.mutate({ kind, text: draft });
        }}
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-muted-foreground"
              title={`Format: ${meta.label}`}
              data-testid="button-block-kind"
            >
              <KindIcon className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="top">
            {(["text", "heading", "bullet", "todo"] as BlockKind[]).map((kk) => {
              const m = blockMeta(kk);
              const Ico = m.icon;
              return (
                <DropdownMenuItem
                  key={kk}
                  onClick={() => setKind(kk)}
                  data-testid={`button-block-kind-${kk}`}
                >
                  <Ico className="h-3.5 w-3.5 mr-2" />
                  {m.label}
                  {kind === kk && <Check className="h-3.5 w-3.5 ml-auto" />}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={meta.placeholder}
          className="h-8 text-sm flex-1"
          data-testid="input-quicknote"
        />
        <Button
          type="submit"
          size="icon"
          variant="default"
          className="h-8 w-8"
          disabled={!draft.trim() || create.isPending}
          data-testid="button-add-quicknote"
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </form>
    </div>
  );
}
