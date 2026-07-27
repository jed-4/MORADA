import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { FileText, Plus, ChevronLeft, AlertCircle, Trash2, ExternalLink, ArrowRight } from "lucide-react";
import { useState, useEffect } from "react";
import { WidgetProps } from "@/types/widgets";
import { useQuery, useMutation } from "@tanstack/react-query";
import { type Note } from "@shared/schema";
import { useProject } from "@/contexts/ProjectContext";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import NotionEditor from "@/components/NotionEditor";

// Legacy notes only have plain-text content; lift it into simple paragraphs
function plainToHtml(text: string): string {
  const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return escaped
    .split("\n")
    .map(line => `<p>${line || "<br>"}</p>`)
    .join("");
}

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

function displayTitle(note: Note): string {
  const t = note.title?.trim();
  if (t && t !== "Project Note") return t;
  const body = note.contentText || note.content || "";
  return body.trim().split("\n")[0]?.slice(0, 60) || "Untitled";
}

function previewLine(note: Note): string {
  const body = (note.contentText || note.content || "").trim();
  return body.split("\n")[0] || "";
}

const VISIBILITY_LABELS: Record<string, string> = {
  team_only: "Team only",
  everyone: "Everyone",
  project_team: "Project team",
  private: "Private",
};

function EmojiPicker({ value, onChange, large }: { value: string; onChange: (v: string) => void; large?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex-shrink-0 flex items-center justify-center rounded-md hover:bg-muted transition-colors",
            large ? "h-10 w-10 text-2xl" : "h-8 w-8 text-base",
          )}
          aria-label="Choose note icon"
          data-testid="note-emoji-trigger"
        >
          {value || <FileText className={cn("text-muted-foreground", large ? "h-5 w-5" : "h-4 w-4")} />}
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
  const [editingTitle, setEditingTitle] = useState(widget.title);
  const [configMaxNotes, setConfigMaxNotes] = useState(widget.config?.maxNotes || 3);
  const [, navigate] = useLocation();

  useEffect(() => {
    setEditingTitle(widget.title);
    setConfigMaxNotes(widget.config?.maxNotes || 3);
  }, [widget.title, widget.config]);

  // Drawer: open/closed, and which note it shows ("new", note id, or null = list)
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerNoteId, setDrawerNoteId] = useState<string | null>(null);

  // Editor state (lives while drawer shows a single note)
  const [formTitle, setFormTitle] = useState("");
  const [formHtml, setFormHtml] = useState("");
  const [formText, setFormText] = useState("");
  const [formEmoji, setFormEmoji] = useState("");
  const [formVisibility, setFormVisibility] = useState<Visibility>("team_only");

  const maxNotes = widget.config?.maxNotes || 3;
  const { currentProject } = useProject();
  const { toast } = useToast();

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
  const activeNote = drawerNoteId && drawerNoteId !== "new"
    ? notes.find(n => n.id === drawerNoteId)
    : undefined;

  const openNote = (note: Note) => {
    setFormTitle(note.title === "Project Note" ? "" : (note.title || ""));
    setFormHtml(note.contentHtml || (note.content ? plainToHtml(note.content) : ""));
    setFormText(note.contentText || note.content || "");
    setFormEmoji(noteIcon(note) || "");
    setFormVisibility((note.visibility as Visibility) || "team_only");
    setDrawerNoteId(note.id);
    setDrawerOpen(true);
  };

  const openNewNote = () => {
    setFormTitle("");
    setFormHtml("");
    setFormText("");
    setFormEmoji("");
    setFormVisibility("team_only");
    setDrawerNoteId("new");
    setDrawerOpen(true);
  };

  const openList = () => {
    setDrawerNoteId(null);
    setDrawerOpen(true);
  };

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["/api/notes", currentProject?.id] });

  const createNoteMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("/api/notes", "POST", {
        title: deriveTitle(formTitle, formText),
        content: formText,
        contentHtml: formHtml,
        contentText: formText,
        visibility: formVisibility,
        projectId: currentProject?.id,
        type: "note",
        customFields: formEmoji ? { icon: formEmoji } : {},
      });
    },
    onSuccess: () => {
      invalidate();
      setDrawerNoteId(null);
    },
    onError: () => {
      toast({ title: "Couldn't save the note", description: "Try again.", variant: "destructive" });
    },
  });

  const updateNoteMutation = useMutation({
    mutationFn: async (note: Note) => {
      return await apiRequest(`/api/notes/${note.id}`, "PATCH", {
        title: deriveTitle(formTitle, formText),
        content: formText,
        contentHtml: formHtml,
        contentText: formText,
        visibility: formVisibility,
        customFields: { ...((note.customFields as Record<string, unknown>) || {}), icon: formEmoji || undefined },
      });
    },
    onSuccess: () => {
      invalidate();
      setDrawerNoteId(null);
    },
    onError: () => {
      toast({ title: "Couldn't save the note", description: "Try again.", variant: "destructive" });
    },
  });

  const deleteNoteMutation = useMutation({
    mutationFn: async (noteId: string) => {
      return await apiRequest(`/api/notes/${noteId}`, "DELETE");
    },
    onSuccess: () => {
      invalidate();
      setDrawerNoteId(null);
    },
    onError: () => {
      toast({ title: "Couldn't delete the note", description: "Try again.", variant: "destructive" });
    },
  });

  const savePending = createNoteMutation.isPending || updateNoteMutation.isPending;
  const handleSaveNote = () => {
    if (!formText.trim() && !formTitle.trim()) return;
    if (drawerNoteId === "new") createNoteMutation.mutate();
    else if (activeNote) updateNoteMutation.mutate(activeNote);
  };

  // Header row: + opens the drawer on a new note; hover arrow opens all notes
  useEffect(() => {
    onSetHeaderActions?.(
      <>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="default"
              className="h-6 w-6"
              onClick={openNewNote}
              data-testid="notes-widget-add"
              aria-label="Add note"
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Add note</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
              onClick={openList}
              data-testid="notes-widget-open-all"
              aria-label="View all notes"
            >
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">All notes</TooltipContent>
        </Tooltip>
      </>
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

  const noteDate = (note: Note) =>
    note.createdAt
      ? new Date(note.createdAt).toLocaleDateString("en-AU", { month: "short", day: "numeric" })
      : "";

  return (
    <>
      {/* Widget body: simple Notion-style rows */}
      <div className="space-y-0.5">
        {isLoading ? (
          <div className="space-y-1.5 py-1">
            {[1, 2, 3].slice(0, maxNotes).map((i) => (
              <div key={i} className="animate-pulse flex items-center gap-2 px-1 py-1.5">
                <div className="h-4 w-4 bg-muted rounded" />
                <div className="h-3.5 bg-muted rounded flex-1" />
              </div>
            ))}
          </div>
        ) : (
          displayNotes.map((note) => (
            <div
              key={note.id}
              className="flex items-center gap-2 px-1.5 py-1.5 rounded-md hover:bg-muted/60 cursor-pointer group"
              data-testid={`note-widget-item-${note.id}`}
              onClick={() => openNote(note)}
            >
              <span className="flex-shrink-0 w-5 text-center text-sm leading-5">
                {noteIcon(note) || <FileText className="h-4 w-4 text-muted-foreground inline" />}
              </span>
              <span className="flex-1 min-w-0 text-sm truncate">{displayTitle(note)}</span>
              <span className="flex-shrink-0 text-[11px] text-muted-foreground">{noteDate(note)}</span>
            </div>
          ))
        )}

        {!isLoading && displayNotes.length === 0 && (
          <div className="text-center py-4 text-sm text-muted-foreground">
            No project notes yet — click + to add one
          </div>
        )}

      </div>

      {/* Right-hand drawer: list of all notes, or a single note as a mini page */}
      <Sheet open={drawerOpen} onOpenChange={open => { setDrawerOpen(open); if (!open) setDrawerNoteId(null); }}>
        <SheetContent side="right" className="w-full sm:max-w-md flex flex-col p-0">
          {drawerNoteId === null ? (
            <>
              <SheetHeader className="px-5 pt-5 pb-2">
                <SheetTitle className="flex items-center justify-between text-base">
                  <span>Project notes</span>
                  <div className="flex items-center gap-1 mr-6">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => navigate("/notes")} aria-label="Open notes page">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">Notes page</TooltipContent>
                    </Tooltip>
                    <Button size="sm" className="h-7 text-xs" onClick={openNewNote}>
                      <Plus className="h-3 w-3 mr-1" />
                      New
                    </Button>
                  </div>
                </SheetTitle>
              </SheetHeader>
              <div className="flex-1 overflow-y-auto px-3 pb-4">
                {notes.length === 0 ? (
                  <div className="text-center py-10 text-sm text-muted-foreground">
                    No project notes yet
                  </div>
                ) : (
                  notes.map(note => (
                    <div
                      key={note.id}
                      className="flex items-start gap-2.5 px-2 py-2 rounded-md hover:bg-muted/60 cursor-pointer"
                      onClick={() => openNote(note)}
                      data-testid={`note-drawer-item-${note.id}`}
                    >
                      <span className="flex-shrink-0 w-5 text-center text-base leading-5">
                        {noteIcon(note) || <FileText className="h-4 w-4 text-muted-foreground inline" />}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{displayTitle(note)}</p>
                        {previewLine(note) && previewLine(note) !== displayTitle(note) && (
                          <p className="text-xs text-muted-foreground truncate">{previewLine(note)}</p>
                        )}
                      </div>
                      <span className="flex-shrink-0 text-[11px] text-muted-foreground pt-0.5">{noteDate(note)}</span>
                    </div>
                  ))
                )}
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between px-3 pt-3">
                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-muted-foreground" onClick={() => setDrawerNoteId(null)}>
                  <ChevronLeft className="h-3.5 w-3.5 mr-0.5" />
                  Notes
                </Button>
                <div className="flex items-center gap-1 mr-6">
                  {activeNote && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => deleteNoteMutation.mutate(activeNote.id)}
                      disabled={deleteNoteMutation.isPending}
                      aria-label="Delete note"
                      data-testid="note-drawer-delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button
                    size="sm"
                    className="h-7 text-xs"
                    onClick={handleSaveNote}
                    disabled={savePending || (!formText.trim() && !formTitle.trim())}
                    data-testid="note-drawer-save"
                  >
                    {savePending ? "Saving..." : "Save"}
                  </Button>
                </div>
              </div>

              {/* Notion-style page: big emoji, borderless title, open writing area */}
              <div className="flex-1 overflow-y-auto flex flex-col px-6 pt-4 pb-5">
                <EmojiPicker value={formEmoji} onChange={setFormEmoji} large />
                <input
                  value={formTitle}
                  onChange={e => setFormTitle(e.target.value)}
                  placeholder="Untitled"
                  className="mt-2 w-full bg-transparent border-none outline-none text-xl font-semibold placeholder:text-muted-foreground/50"
                  data-testid="note-drawer-title"
                />
                <div className="mt-2 flex-1 min-h-[220px]" data-testid="note-drawer-content">
                  <NotionEditor
                    key={drawerNoteId ?? "new"}
                    content={formHtml}
                    onChange={(html, text) => { setFormHtml(html); setFormText(text); }}
                    placeholder="Write your note, or press '/' for commands…"
                  />
                </div>
                <div className="flex items-center justify-between pt-3 mt-2 border-t">
                  <Select value={formVisibility} onValueChange={(v: any) => setFormVisibility(v)}>
                    <SelectTrigger className="h-7 text-xs w-36 border-none shadow-none px-1 text-muted-foreground" data-testid="note-drawer-visibility">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="private">Private</SelectItem>
                      <SelectItem value="team_only">Team only</SelectItem>
                      <SelectItem value="project_team">Project team</SelectItem>
                      <SelectItem value="everyone">Everyone</SelectItem>
                    </SelectContent>
                  </Select>
                  {activeNote && (
                    <span className="text-[11px] text-muted-foreground">
                      {activeNote.ownerName || activeNote.author} · {noteDate(activeNote)}
                    </span>
                  )}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
