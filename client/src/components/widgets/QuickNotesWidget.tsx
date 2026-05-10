import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Heading2, List, CheckSquare, Plus, Type, Trash2 } from "lucide-react";
import type { WidgetProps } from "@/types/widgets";
import { useProject } from "@/contexts/ProjectContext";
import { WidgetSkeleton, WidgetEmpty, WidgetError } from "@/components/ui/widget-states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
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
          if (k === "heading") {
            return (
              <div
                key={n.id}
                className="group flex items-center gap-2 py-2 first:pt-0"
                data-testid={`quicknote-${n.id}`}
              >
                <h4 className="text-sm font-semibold flex-1 truncate">{n.content}</h4>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 opacity-0 group-hover:opacity-100"
                  onClick={() => remove.mutate(n.id)}
                  data-testid={`button-delete-quicknote-${n.id}`}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            );
          }
          if (k === "bullet") {
            return (
              <div key={n.id} className="group flex items-start gap-2 py-2 first:pt-0" data-testid={`quicknote-${n.id}`}>
                <span className="text-muted-foreground mt-1.5">•</span>
                <span className="text-sm flex-1 break-words">{n.content}</span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 opacity-0 group-hover:opacity-100"
                  onClick={() => remove.mutate(n.id)}
                  data-testid={`button-delete-quicknote-${n.id}`}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            );
          }
          if (k === "todo") {
            const done = n.status === "done";
            return (
              <div key={n.id} className="group flex items-start gap-2 py-2 first:pt-0" data-testid={`quicknote-${n.id}`}>
                <Checkbox
                  checked={done}
                  className="mt-1"
                  onCheckedChange={(checked) =>
                    toggleTodo.mutate({ id: n.id, status: checked ? "done" : "todo" })
                  }
                  data-testid={`checkbox-quicknote-${n.id}`}
                />
                <span
                  className={`text-sm flex-1 break-words ${done ? "line-through text-muted-foreground" : ""}`}
                >
                  {n.content}
                </span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 opacity-0 group-hover:opacity-100"
                  onClick={() => remove.mutate(n.id)}
                  data-testid={`button-delete-quicknote-${n.id}`}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            );
          }
          return (
            <div key={n.id} className="group flex items-start gap-2 py-2 first:pt-0" data-testid={`quicknote-${n.id}`}>
              <span className="text-sm flex-1 break-words">{n.content}</span>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 opacity-0 group-hover:opacity-100"
                onClick={() => remove.mutate(n.id)}
                data-testid={`button-delete-quicknote-${n.id}`}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
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
        <div className="flex items-center gap-0.5">
          {(["text", "heading", "bullet", "todo"] as BlockKind[]).map((k) => {
            const m = blockMeta(k);
            const Ico = m.icon;
            const active = kind === k;
            return (
              <Button
                key={k}
                type="button"
                size="icon"
                variant="ghost"
                className={`h-7 w-7 ${active ? "toggle-elevate toggle-elevated" : ""}`}
                onClick={() => setKind(k)}
                title={m.label}
                data-testid={`button-block-kind-${k}`}
              >
                <Ico className="h-3.5 w-3.5" />
              </Button>
            );
          })}
        </div>
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
        {/* Hidden icon to satisfy unused */}
        <span className="sr-only">
          <KindIcon />
        </span>
      </form>
    </div>
  );
}
