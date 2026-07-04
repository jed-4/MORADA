import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { MessageSquare, Pencil, Trash2, X, Check } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import type { TaskComment } from "@shared/schema";

interface TaskCommentsProps {
  taskId: string;
  users: any[];
  currentUserId?: string;
}

const MENTION_MARKUP = /@\[([^\]]+)\]\(userId:([^)]+)\)/g;

function getUserDisplayName(user: any): string {
  if (!user) return "Unknown";
  const name = `${user.firstName || ""} ${user.lastName || ""}`.trim();
  return name || user.email || "Unknown";
}

function getInitials(name: string): string {
  return (
    name
      ?.split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) || "?"
  );
}

// Turn stored @[Name](userId:x) markup into highlighted, readable text.
function renderContent(content: string) {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  MENTION_MARKUP.lastIndex = 0;
  let key = 0;
  while ((match = MENTION_MARKUP.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push(content.slice(lastIndex, match.index));
    }
    parts.push(
      <span
        key={`m-${key++}`}
        className="inline-flex items-center px-1 rounded text-sm font-medium bg-muted/60 text-foreground"
      >
        @{match[1]}
      </span>,
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < content.length) {
    parts.push(content.slice(lastIndex));
  }
  return parts;
}

interface MentionState {
  active: boolean;
  query: string;
  start: number;
}

function useMentionComposer(users: any[]) {
  const [value, setValue] = useState("");
  const [mention, setMention] = useState<MentionState>({ active: false, query: "", start: -1 });
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const filtered = useMemo(() => {
    if (!mention.active) return [];
    const q = mention.query.toLowerCase();
    return users
      .filter((u) => getUserDisplayName(u).toLowerCase().includes(q))
      .slice(0, 6);
  }, [mention, users]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    setValue(text);
    const cursor = e.target.selectionStart ?? text.length;
    const upToCursor = text.slice(0, cursor);
    const atMatch = upToCursor.match(/(?:^|\s)@([\w'-]*)$/);
    if (atMatch) {
      setMention({
        active: true,
        query: atMatch[1] || "",
        start: cursor - (atMatch[1]?.length || 0) - 1,
      });
    } else {
      setMention({ active: false, query: "", start: -1 });
    }
  };

  const selectUser = (user: any) => {
    const name = getUserDisplayName(user);
    const before = value.slice(0, mention.start);
    const cursor = textareaRef.current?.selectionStart ?? value.length;
    const after = value.slice(cursor);
    // Store markup inline so the server can extract mentions.
    const inserted = `@[${name}](userId:${user.id}) `;
    const next = `${before}${inserted}${after}`;
    setValue(next);
    setMention({ active: false, query: "", start: -1 });
    requestAnimationFrame(() => {
      const pos = (before + inserted).length;
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(pos, pos);
    });
  };

  const reset = () => {
    setValue("");
    setMention({ active: false, query: "", start: -1 });
  };

  return { value, setValue, mention, filtered, handleChange, selectUser, reset, textareaRef };
}

export default function TaskComments({ taskId, users, currentUserId }: TaskCommentsProps) {
  const { toast } = useToast();
  const composer = useMentionComposer(users);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const { data: comments = [], isLoading } = useQuery<TaskComment[]>({
    queryKey: ["/api/tasks", taskId, "comments"],
    enabled: !!taskId,
    staleTime: 0,
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["/api/tasks", taskId, "comments"] });

  const createMutation = useMutation({
    mutationFn: async (content: string) =>
      apiRequest("/api/task-comments", "POST", { taskId, content }),
    onSuccess: () => {
      composer.reset();
      invalidate();
    },
    onError: () =>
      toast({ title: "Couldn't post comment", description: "Please try again.", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, content }: { id: string; content: string }) =>
      apiRequest(`/api/task-comments/${id}`, "PATCH", { content }),
    onSuccess: () => {
      setEditingId(null);
      setEditValue("");
      invalidate();
    },
    onError: () =>
      toast({ title: "Couldn't save changes", description: "Please try again.", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => apiRequest(`/api/task-comments/${id}`, "DELETE"),
    onSuccess: invalidate,
    onError: () =>
      toast({ title: "Couldn't delete comment", description: "Please try again.", variant: "destructive" }),
  });

  const handleSubmit = () => {
    const content = composer.value.trim();
    if (!content) return;
    createMutation.mutate(content);
  };

  return (
    <div className="space-y-3">
      <label className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
        <MessageSquare className="h-3.5 w-3.5" />
        Comments {comments.length > 0 && `(${comments.length})`}
      </label>

      {/* Thread (oldest first) */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading comments…</p>
      ) : comments.length === 0 ? (
        <p className="text-sm text-muted-foreground">No comments yet. Start the conversation.</p>
      ) : (
        <div className="space-y-3">
          {comments.map((comment) => {
            const isOwn = !!currentUserId && comment.createdById === currentUserId;
            const isEditing = editingId === comment.id;
            return (
              <div key={comment.id} className="flex gap-2.5" data-testid={`comment-${comment.id}`}>
                <Avatar className="h-7 w-7 shrink-0">
                  <AvatarFallback className="text-xs">
                    {getInitials(comment.createdByName)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{comment.createdByName}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
                      {comment.editedAt ? " (edited)" : ""}
                    </span>
                  </div>

                  {isEditing ? (
                    <div className="space-y-2">
                      <Textarea
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        rows={2}
                        className="text-sm"
                        data-testid={`textarea-edit-comment-${comment.id}`}
                      />
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          onClick={() =>
                            editValue.trim() &&
                            updateMutation.mutate({ id: comment.id, content: editValue.trim() })
                          }
                          disabled={updateMutation.isPending}
                          data-testid={`button-save-comment-${comment.id}`}
                        >
                          <Check className="h-3.5 w-3.5" /> Save
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditingId(null);
                            setEditValue("");
                          }}
                        >
                          <X className="h-3.5 w-3.5" /> Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm whitespace-pre-wrap break-words">
                      {renderContent(comment.content)}
                    </div>
                  )}

                  {isOwn && !isEditing && (
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditingId(comment.id);
                          setEditValue(comment.content);
                        }}
                        data-testid={`button-edit-comment-${comment.id}`}
                      >
                        <Pencil className="h-3 w-3" /> Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          if (window.confirm("Delete this comment?")) {
                            deleteMutation.mutate(comment.id);
                          }
                        }}
                        data-testid={`button-delete-comment-${comment.id}`}
                      >
                        <Trash2 className="h-3 w-3 text-destructive" /> Delete
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Composer */}
      <div className="relative space-y-2">
        <Textarea
          ref={composer.textareaRef}
          value={composer.value}
          onChange={composer.handleChange}
          placeholder="Add a comment… use @ to mention a teammate"
          rows={2}
          className="text-sm"
          data-testid="textarea-new-comment"
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              handleSubmit();
            }
          }}
        />
        {composer.mention.active && composer.filtered.length > 0 && (
          <div className="absolute z-50 bottom-full mb-1 left-0 w-64 max-h-56 overflow-y-auto rounded-md border bg-popover shadow-md">
            {composer.filtered.map((user) => (
              <button
                key={user.id}
                type="button"
                className="flex items-center gap-2 w-full px-2 py-1.5 text-left text-sm hover-elevate"
                onClick={() => composer.selectUser(user)}
                data-testid={`mention-option-${user.id}`}
              >
                <Avatar className="h-6 w-6">
                  <AvatarFallback className="text-xs">
                    {getInitials(getUserDisplayName(user))}
                  </AvatarFallback>
                </Avatar>
                <span>{getUserDisplayName(user)}</span>
              </button>
            ))}
          </div>
        )}
        <div className="flex justify-end">
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={!composer.value.trim() || createMutation.isPending}
            data-testid="button-post-comment"
          >
            {createMutation.isPending ? "Posting…" : "Comment"}
          </Button>
        </div>
      </div>
    </div>
  );
}
