import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { FileText, Plus, X, ChevronDown, ChevronRight, AlertCircle, Trash2, ArrowRight } from "lucide-react";
import { useState, useEffect } from "react";
import { WidgetProps } from "@/types/widgets";
import { useQuery, useMutation } from "@tanstack/react-query";
import { type Note } from "@shared/schema";
import { useProject } from "@/contexts/ProjectContext";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";

type Visibility = "team_only" | "everyone" | "project_team" | "private";

// Curated picker set — building-flavoured, stored in customFields.icon
const NOTE_EMOJIS = [
  "📝", "📌", "⚠️", "💡", "✅", "📞", "💰", "🧾",
  "🔨", "🧱", "🏠", "🚧", "📷", "🗓️", "📦", "🔑",
  "⚡", "💧", "🎨", "🌿", "🪵", "🪟", "🚿", "🔥",
];

function noteIcon(note: Note): string | null {
  const icon = (note.customFields as Record<string, unknown> | null | undefined)?.icon;
  return typeof icon === "string" && icon.trim() ? icon : null;
}

// Notes need a title for the full Notes page; derive one from the first line
// of content when the user doesn't type one.
function deriveTitle(title: string, content: string): string {
  const t = title.trim();
  if (t) return t;
  const firstLine = content.trim().split("\n")[0] ?? "";
  return firstLine.slice(0, 60) || "Untitled note";
}

function EmojiPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="h-9 w-9 flex-shrink-0 flex items-center justify-center rounded-md border border-border text-base hover:border-[hsl(var(--primary))]"
          aria-label="Choose note icon"
          data-testid="note-emoji-trigger"
        >
          {value || <FileText className="h-4 w-4 text-muted-foreground" />}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-2">
        <div className="grid grid-cols-8 gap-0.5">
          {NOTE_EMOJIS.map(e => (
            <button
              key={e}
              type="button"
              className={cn(
                "h-6 w-6 flex items-center justify-center rounded text-sm hover:bg-muted",
                value === e && "bg-[hsl(var(--primary-light))]",
              )}
              onClick={() => { onChange(e); setOpen(false); }}
            >
              {e}
            </button>
          ))}
        </div>
        {value && (
          <button
            type="button"
            className="w-full mt-1.5 text-[11px] text-muted-foreground hover:text-foreground text-center"
            onClick={() => { onChange(""); setOpen(false); }}
          >
            No icon
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}

export default function NotesWidget({ widget, onUpdate, isConfiguring, onCloseConfig, onSetHeaderActions }: WidgetProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [editingTitle, setEditingTitle] = useState(widget.title);
  const [configMaxNotes, setConfigMaxNotes] = useState(widget.config?.maxNotes || 3);
  const [, navigate] = useLocation();

  useEffect(() => {
    setEditingTitle(widget.title);
    setConfigMaxNotes(widget.config?.maxNotes || 3);
  }, [widget.title, widget.config]);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [expandedNoteIds, setExpandedNoteIds] = useState<Set<string>>(new Set());

  const toggleNoteExpanded = (id: string) => {
    setExpandedNoteIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const [newNote, setNewNote] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newEmoji, setNewEmoji] = useState("");
  const [newNoteVisibility, setNewNoteVisibility] = useState<Visibility>("team_only");
  const [editContent, setEditContent] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editEmoji, setEditEmoji] = useState("");
  const [editVisibility, setEditVisibility] = useState<Visibility>("team_only");
  const maxNotes = widget.config?.maxNotes || 3;
  const { currentProject } = useProject();
  const { toast } = useToast();

  const resetCreateForm = () => {
    setNewNote("");
    setNewTitle("");
    setNewEmoji("");
    setNewNoteVisibility("team_only");
  };

  // Fetch real notes from the API filtered by current project
  const { data: notes = [], isLoading, isError, refetch } = useQuery<Note[]>({
    queryKey: ["/api/notes", currentProject?.id],
    queryFn: async () => {
      if (!currentProject?.id) return [];
      const response = await fetch(`/api/notes?projectId=${currentProject.id}`, {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error(`${response.status}: ${response.statusText}`);
      }
      return response.json();
    },
    select: (data: any[]) => data.map(note => ({
      ...note,
      createdAt: new Date(note.createdAt),
      updatedAt: new Date(note.updatedAt),
    })),
    enabled: !!currentProject?.id,
  });

  const displayNotes = notes.slice(0, maxNotes);

  // Create note mutation
  const createNoteMutation = useMutation({
    mutationFn: async (data: { title: string; content: string; visibility: string; icon: string }) => {
      return await apiRequest("/api/notes", "POST", {
        title: deriveTitle(data.title, data.content),
        content: data.content,
        visibility: data.visibility,
        projectId: currentProject?.id,
        type: "note",
        customFields: data.icon ? { icon: data.icon } : {},
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notes", currentProject?.id] });
      resetCreateForm();
      setIsCreating(false);
      toast({
        title: "Note created",
        description: "Your note has been added successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create note. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Update note mutation
  const updateNoteMutation = useMutation({
    mutationFn: async (data: { id: string; title: string; content: string; visibility: string; icon: string; existingCustomFields: Record<string, unknown> }) => {
      return await apiRequest(`/api/notes/${data.id}`, "PATCH", {
        title: deriveTitle(data.title, data.content),
        content: data.content,
        visibility: data.visibility,
        customFields: { ...data.existingCustomFields, icon: data.icon || undefined },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notes", currentProject?.id] });
      setEditingNoteId(null);
      toast({
        title: "Note updated",
        description: "Your note has been updated successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update note. Please try again.",
        variant: "destructive",
      });
    },
  });

  const deleteNoteMutation = useMutation({
    mutationFn: async (noteId: string) => {
      return await apiRequest(`/api/notes/${noteId}`, "DELETE");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notes", currentProject?.id] });
      setEditingNoteId(null);
      toast({ title: "Note deleted" });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete note. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleCreateNote = () => {
    if (newNote.trim() && currentProject?.id) {
      createNoteMutation.mutate({
        title: newTitle,
        content: newNote,
        visibility: newNoteVisibility,
        icon: newEmoji,
      });
    }
  };

  const handleEditNote = (note: Note) => {
    setEditingNoteId(note.id);
    setEditTitle(note.title === "Project Note" ? "" : (note.title || ""));
    setEditContent(note.content);
    setEditEmoji(noteIcon(note) || "");
    setEditVisibility((note.visibility as Visibility) || "team_only");
  };

  const handleUpdateNote = (note: Note) => {
    if (editContent.trim()) {
      updateNoteMutation.mutate({
        id: note.id,
        title: editTitle,
        content: editContent,
        visibility: editVisibility,
        icon: editEmoji,
        existingCustomFields: (note.customFields as Record<string, unknown>) || {},
      });
    }
  };

  const handleCancelEdit = () => {
    setEditingNoteId(null);
    setEditContent("");
    setEditTitle("");
    setEditEmoji("");
    setEditVisibility("team_only");
  };

  const getVisibilityLabel = (visibility: string) => {
    switch (visibility) {
      case "team_only":
        return "Team only";
      case "everyone":
        return "Everyone";
      case "project_team":
        return "Project team";
      case "private":
        return "Private";
      default:
        return "Team only";
    }
  };

  // Header row: + add note (the count row is gone — room saved)
  useEffect(() => {
    onSetHeaderActions?.(
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon"
            variant="default"
            className="h-6 w-6"
            onClick={() => {
              setIsCreating(prev => {
                if (prev) resetCreateForm();
                return !prev;
              });
            }}
            data-testid="notes-widget-add"
            aria-label="Add note"
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">Add note</TooltipContent>
      </Tooltip>
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProject?.id]);

  // Configuration mode
  if (isConfiguring) {
    const handleSaveConfig = () => {
      if (onUpdate) {
        onUpdate({
          ...widget,
          title: editingTitle,
          config: { ...widget.config, maxNotes: configMaxNotes }
        });
      }
      onCloseConfig?.();
    };

    const handleCancelConfig = () => {
      setEditingTitle(widget.title);
      setConfigMaxNotes(widget.config?.maxNotes || 3);
      onCloseConfig?.();
    };

    return (
      <div className="flex-1 overflow-y-auto p-1 space-y-5 text-[12px]">
        <section>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Widget title
          </p>
          <Input
            value={editingTitle}
            onChange={(e) => setEditingTitle(e.target.value)}
            className="h-8 text-xs"
            placeholder="Widget title"
          />
        </section>

        <section>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Max notes to show
          </p>
          <Input
            type="number"
            min={1}
            max={10}
            value={configMaxNotes}
            onChange={(e) => setConfigMaxNotes(parseInt(e.target.value) || 3)}
            className="h-8 text-xs w-20"
          />
        </section>

        <div className="flex justify-end gap-2 pt-1">
          <Button size="sm" variant="outline" onClick={handleCancelConfig} className="h-7 px-3 text-xs">
            Cancel
          </Button>
          <Button size="sm" onClick={handleSaveConfig} className="h-7 px-3 text-xs">
            Save
          </Button>
        </div>
      </div>
    );
  }

  if (!currentProject) {
    return (
      <div className="text-center py-4 text-sm text-muted-foreground">
        Select a project to view notes
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center gap-2 py-6 text-sm text-muted-foreground">
        <AlertCircle className="h-4 w-4 text-destructive" />
        Couldn't load notes
        <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {isCreating && (
        <div className="space-y-3 p-3 border rounded-md" data-testid="notes-widget-editor">
          <div className="flex gap-2">
            <EmojiPicker value={newEmoji} onChange={setNewEmoji} />
            <Input
              placeholder="Title (optional)"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="h-9 text-sm"
              data-testid="input-note-title"
            />
          </div>
          <Textarea
            id="note-content"
            placeholder="Add a project note..."
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            rows={3}
            className="text-sm"
            data-testid="input-note-content"
          />
          <div className="flex items-center justify-between gap-2">
            <Select value={newNoteVisibility} onValueChange={(value: any) => setNewNoteVisibility(value)}>
              <SelectTrigger className="h-8 text-xs w-36" data-testid="select-note-visibility">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="private">Private</SelectItem>
                <SelectItem value="team_only">Team only</SelectItem>
                <SelectItem value="project_team">Project team</SelectItem>
                <SelectItem value="everyone">Everyone</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                onClick={() => { setIsCreating(false); resetCreateForm(); }}
                data-testid="button-cancel-note"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="h-8 text-xs"
                onClick={handleCreateNote}
                disabled={!newNote.trim() || createNoteMutation.isPending}
                data-testid="button-save-note"
              >
                {createNoteMutation.isPending ? "Saving..." : "Save note"}
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        {isLoading ? (
          <div className="space-y-1.5">
            {[1, 2, 3].slice(0, maxNotes).map((i) => (
              <div key={i} className="animate-pulse">
                <div className="flex items-start gap-2 p-3 border rounded-md">
                  <div className="h-4 w-4 bg-muted rounded"></div>
                  <div className="flex-1 min-w-0">
                    <div className="h-4 bg-muted rounded w-3/4 mb-2"></div>
                    <div className="h-3 bg-muted rounded w-1/2"></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          displayNotes.map((note) => (
            <div
              key={note.id}
              className={cn(
                "p-2.5 border rounded-md",
                editingNoteId !== note.id && "hover-elevate cursor-pointer group",
              )}
              data-testid={`note-widget-item-${note.id}`}
            >
              {editingNoteId === note.id ? (
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <EmojiPicker value={editEmoji} onChange={setEditEmoji} />
                    <Input
                      placeholder="Title (optional)"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="h-9 text-sm"
                      data-testid={`input-edit-title-${note.id}`}
                    />
                  </div>
                  <Textarea
                    id={`edit-content-${note.id}`}
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    rows={3}
                    className="text-sm"
                    data-testid={`textarea-edit-note-${note.id}`}
                  />
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1">
                      <Select value={editVisibility} onValueChange={(value: any) => setEditVisibility(value)}>
                        <SelectTrigger className="h-8 text-xs w-36" data-testid={`select-edit-visibility-${note.id}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="private">Private</SelectItem>
                          <SelectItem value="team_only">Team only</SelectItem>
                          <SelectItem value="project_team">Project team</SelectItem>
                          <SelectItem value="everyone">Everyone</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => deleteNoteMutation.mutate(note.id)}
                        disabled={deleteNoteMutation.isPending}
                        aria-label="Delete note"
                        data-testid={`button-delete-note-${note.id}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs"
                        onClick={handleCancelEdit}
                        data-testid={`button-cancel-edit-${note.id}`}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        className="h-8 text-xs"
                        onClick={() => handleUpdateNote(note)}
                        disabled={!editContent.trim() || updateNoteMutation.isPending}
                        data-testid={`button-update-note-${note.id}`}
                      >
                        {updateNoteMutation.isPending ? "Updating..." : "Update"}
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2">
                  <span className="flex-shrink-0 w-5 text-center leading-5">
                    {noteIcon(note) || <FileText className="h-4 w-4 text-muted-foreground inline mt-0.5" />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <p
                        className="text-sm font-semibold text-foreground flex-1 min-w-0 truncate cursor-pointer leading-5"
                        onClick={() => handleEditNote(note)}
                      >
                        {note.title?.trim() || note.content?.slice(0, 60) || "Untitled"}
                      </p>
                      {note.content?.trim() && note.content.trim() !== note.title?.trim() && (
                        <button
                          onClick={() => toggleNoteExpanded(note.id)}
                          className="flex-shrink-0 text-muted-foreground hover:text-foreground"
                          aria-label={expandedNoteIds.has(note.id) ? "Collapse note" : "Expand note"}
                        >
                          {expandedNoteIds.has(note.id)
                            ? <ChevronDown className="h-3.5 w-3.5" />
                            : <ChevronRight className="h-3.5 w-3.5" />}
                        </button>
                      )}
                    </div>
                    {expandedNoteIds.has(note.id) && note.content?.trim() && (
                      <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{note.content}</p>
                    )}
                    <div className="flex items-center gap-1.5 mt-1 text-[11px] text-muted-foreground">
                      <span>{note.ownerName || note.author}</span>
                      <span
                        className={cn(
                          "px-1.5 py-px rounded-full",
                          note.visibility === "private"
                            ? "bg-[hsl(var(--primary-light))] text-[hsl(261_25%_45%)]"
                            : "bg-muted",
                        )}
                      >
                        {getVisibilityLabel(note.visibility || "team_only")}
                      </span>
                      <span>
                        {note.createdAt
                          ? new Date(note.createdAt).toLocaleDateString("en-AU", {
                              month: "short",
                              day: "numeric",
                            })
                          : ""}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {displayNotes.length === 0 && !isCreating && !isLoading && (
        <div className="text-center py-4 text-sm text-muted-foreground">
          No project notes yet — click + to add one
        </div>
      )}

      {notes.length > maxNotes && (
        <button
          className="w-full text-xs text-muted-foreground hover:text-foreground py-1 text-center flex items-center justify-center gap-1"
          onClick={() => navigate("/notes")}
          data-testid="notes-widget-view-all"
        >
          Showing {displayNotes.length} of {notes.length} · View all
          <ArrowRight className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
