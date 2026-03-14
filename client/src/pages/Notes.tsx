import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useProject } from "@/contexts/ProjectContext";
import { useParams } from "wouter";
import { usePageTitle } from "@/hooks/usePageTitle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  type Note,
  type InsertNote,
  type NoteGroup,
  type User as UserType,
} from "@shared/schema";
import NotionEditor from "@/components/NotionEditor";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FileText,
  Plus,
  Search,
  MoreHorizontal,
  Trash2,
  Pin,
  PinOff,
  Archive,
  ArchiveRestore,
  FolderPlus,
  Folder,
  ChevronDown,
  ChevronRight,
  ArrowUpDown,
  Filter,
  Eye,
  EyeOff,
  Check,
  LayoutTemplate,
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface NotesParams {
  projectId?: string;
}

interface NotesProps {
  projectId?: string | null;
}

// ─── Note list item ──────────────────────────────────────────────────────────

interface NoteListItemProps {
  note: Note;
  selected: boolean;
  onSelect: () => void;
  onPin: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onMoveToGroup: (groupId: string | null) => void;
  noteGroups: NoteGroup[];
}

function NoteListItem({
  note,
  selected,
  onSelect,
  onPin,
  onArchive,
  onDelete,
  onMoveToGroup,
  noteGroups,
}: NoteListItemProps) {
  const preview = note.contentText?.replace(/\n/g, " ").trim().slice(0, 80) || "";

  return (
    <div
      className={cn(
        "group relative px-3 py-2.5 cursor-pointer rounded-md mx-1",
        selected ? "bg-accent" : "hover-elevate"
      )}
      onClick={onSelect}
    >
      <div className="flex items-start justify-between gap-1">
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          {note.pinned && <Pin className="h-3 w-3 text-primary shrink-0" />}
          <span className="text-sm font-medium truncate">
            {note.title || "Untitled"}
          </span>
        </div>
        <div className="invisible group-hover:visible shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onPin(); }}>
                {note.pinned ? (
                  <><PinOff className="h-3.5 w-3.5 mr-2" />Unpin</>
                ) : (
                  <><Pin className="h-3.5 w-3.5 mr-2" />Pin to top</>
                )}
              </DropdownMenuItem>
              {noteGroups.length > 0 && (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Folder className="h-3.5 w-3.5 mr-2" />
                    Move to group
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onMoveToGroup(null); }}>
                      No group
                    </DropdownMenuItem>
                    {noteGroups.map((g) => (
                      <DropdownMenuItem
                        key={g.id}
                        onClick={(e) => { e.stopPropagation(); onMoveToGroup(g.id); }}
                      >
                        {g.name}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onArchive(); }}>
                <Archive className="h-3.5 w-3.5 mr-2" />
                Archive
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive"
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
              >
                <Trash2 className="h-3.5 w-3.5 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {preview && (
        <p className="text-xs text-muted-foreground truncate mt-0.5 pl-0">{preview}</p>
      )}
      <p className="text-[10px] text-muted-foreground/70 mt-0.5">
        {format(new Date(note.updatedAt), "MMM d")}
      </p>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Notes({ projectId: propProjectId }: NotesProps = {}) {
  // ── selected / edit state ──────────────────────────────────────────────────
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const lastSavedRef = useRef<{ title: string; html: string }>({ title: "", html: "" });
  const isCreatingRef = useRef(false);

  // ── ui state ───────────────────────────────────────────────────────────────
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [sortBy, setSortBy] = useState("newest");
  const [showArchived, setShowArchived] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingGroupName, setEditingGroupName] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [propertiesOpen, setPropertiesOpen] = useState(false);
  const [editVisibility, setEditVisibility] = useState<string>("team_only");
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [templateSearch, setTemplateSearch] = useState("");

  const { toast } = useToast();
  useProject(); // keeps ProjectContext in sync
  const params = useParams<NotesParams>();
  usePageTitle({ pageName: "Notes" });

  const effectiveProjectId = propProjectId !== undefined ? propProjectId : params.projectId;

  // ── queries ────────────────────────────────────────────────────────────────
  const { data: currentUser } = useQuery<UserType>({ queryKey: ["/api/auth/user"] });

  const { data: notes = [], isLoading } = useQuery<Note[]>({
    queryKey: ["/api/notes", effectiveProjectId],
    queryFn: async () => {
      const url =
        effectiveProjectId === null
          ? "/api/notes?projectId=null"
          : effectiveProjectId
          ? `/api/notes?projectId=${effectiveProjectId}`
          : "/api/notes";
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
      return res.json();
    },
    select: (data: any[]) =>
      data.map((n) => ({
        ...n,
        createdAt: new Date(n.createdAt),
        updatedAt: new Date(n.updatedAt),
      })),
  });

  const { data: noteGroups = [] } = useQuery<NoteGroup[]>({
    queryKey: ["/api/note-groups", effectiveProjectId],
    queryFn: async () => {
      const url =
        effectiveProjectId === null
          ? "/api/note-groups?projectId=null"
          : effectiveProjectId
          ? `/api/note-groups?projectId=${effectiveProjectId}`
          : "/api/note-groups";
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch note groups");
      return res.json();
    },
  });

  interface NoteTemplate {
    id: string;
    name: string;
    description?: string;
    defaultTitle?: string;
    contentHtml?: string;
    contentText?: string;
    isActive?: boolean;
  }

  const { data: noteTemplates = [] } = useQuery<NoteTemplate[]>({
    queryKey: ["/api/note-templates", { activeOnly: "true" }],
    queryFn: async () => {
      const res = await fetch("/api/note-templates?activeOnly=true", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: templateDialogOpen,
  });

  const filteredTemplates = templateSearch.trim()
    ? noteTemplates.filter(
        (t) =>
          t.name.toLowerCase().includes(templateSearch.toLowerCase()) ||
          (t.description || "").toLowerCase().includes(templateSearch.toLowerCase()),
      )
    : noteTemplates;

  const currentUserName = currentUser
    ? `${currentUser.firstName || ""} ${currentUser.lastName || ""}`.trim() ||
      currentUser.email ||
      "Unknown User"
    : "Unknown User";

  // ── mutations ──────────────────────────────────────────────────────────────

  const invalidateNotes = useCallback(() => {
    queryClient.invalidateQueries({
      predicate: (q) =>
        Array.isArray(q.queryKey) && q.queryKey[0] === "/api/notes",
    });
    if (effectiveProjectId) {
      queryClient.invalidateQueries({
        queryKey: ["/api/activities", effectiveProjectId],
      });
    }
  }, [effectiveProjectId]);

  const createNoteMutation = useMutation({
    mutationFn: async (data: Partial<InsertNote>) =>
      apiRequest("/api/notes", "POST", data),
    onSuccess: (newNote: Note) => {
      invalidateNotes();
      setSelectedNoteId(newNote.id);
      setEditTitle(newNote.title || "");
      lastSavedRef.current = { title: newNote.title || "", html: newNote.contentHtml || "" };
      setSaveState("idle");
      isCreatingRef.current = false;
    },
    onError: () => {
      isCreatingRef.current = false;
      toast({ title: "Failed to create note", variant: "destructive" });
    },
  });

  const silentUpdateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<InsertNote> }) =>
      apiRequest(`/api/notes/${id}`, "PATCH", data),
    onSuccess: () => {
      invalidateNotes();
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 2000);
    },
    onError: () => {
      setSaveState("idle");
      toast({ title: "Auto-save failed", variant: "destructive" });
    },
  });

  const deleteNoteMutation = useMutation({
    mutationFn: async (id: string) => apiRequest(`/api/notes/${id}`, "DELETE"),
    onSuccess: (_, id) => {
      invalidateNotes();
      if (selectedNoteId === id) setSelectedNoteId(null);
      toast({ title: "Note deleted" });
    },
    onError: () => toast({ title: "Failed to delete note", variant: "destructive" }),
  });

  const togglePinMutation = useMutation({
    mutationFn: async ({ id, pinned }: { id: string; pinned: boolean }) =>
      apiRequest(`/api/notes/${id}`, "PATCH", { pinned }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["/api/notes", effectiveProjectId] }),
    onError: () => toast({ title: "Failed to pin note", variant: "destructive" }),
  });

  const archiveNoteMutation = useMutation({
    mutationFn: async (id: string) => apiRequest(`/api/notes/${id}/archive`, "POST"),
    onSuccess: (_, id) => {
      invalidateNotes();
      if (selectedNoteId === id) setSelectedNoteId(null);
      toast({ title: "Note archived" });
    },
    onError: () => toast({ title: "Failed to archive note", variant: "destructive" }),
  });

  const unarchiveNoteMutation = useMutation({
    mutationFn: async (id: string) => apiRequest(`/api/notes/${id}/unarchive`, "POST"),
    onSuccess: () => { invalidateNotes(); toast({ title: "Note restored" }); },
    onError: () => toast({ title: "Failed to restore note", variant: "destructive" }),
  });

  const createGroupMutation = useMutation({
    mutationFn: async (data: { name: string; projectId?: string | null }) =>
      apiRequest("/api/note-groups", "POST", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/note-groups", effectiveProjectId] });
      toast({ title: "Group created" });
      setIsCreateGroupOpen(false);
      setNewGroupName("");
    },
    onError: () => toast({ title: "Failed to create group", variant: "destructive" }),
  });

  const updateGroupMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) =>
      apiRequest(`/api/note-groups/${id}`, "PATCH", { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/note-groups", effectiveProjectId] });
      setEditingGroupId(null);
      setEditingGroupName("");
    },
    onError: () => toast({ title: "Failed to rename group", variant: "destructive" }),
  });

  const deleteGroupMutation = useMutation({
    mutationFn: async (id: string) => apiRequest(`/api/note-groups/${id}`, "DELETE"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/note-groups", effectiveProjectId] });
      toast({ title: "Group deleted" });
    },
    onError: () => toast({ title: "Failed to delete group", variant: "destructive" }),
  });

  const moveNoteToGroupMutation = useMutation({
    mutationFn: async ({ noteId, groupId }: { noteId: string; groupId: string | null }) =>
      apiRequest(`/api/notes/${noteId}`, "PATCH", { groupId }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["/api/notes", effectiveProjectId] }),
    onError: () => toast({ title: "Failed to move note", variant: "destructive" }),
  });

  // ── filter / sort / group ─────────────────────────────────────────────────

  const { activeNotes, archivedNotes } = useMemo(() => {
    const active: Note[] = [];
    const archived: Note[] = [];
    notes.forEach((n) => (n.archivedAt ? archived.push(n) : active.push(n)));
    return { activeNotes: active, archivedNotes: archived };
  }, [notes]);

  const filteredNotes = useMemo(() => {
    let filtered = activeNotes.filter((note) => {
      const searchable = [note.title, note.content, note.contentText || "", note.author]
        .join(" ")
        .toLowerCase();
      const matchesSearch = searchable.includes(searchTerm.toLowerCase());
      const matchesCategory =
        selectedCategory === "All" || note.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });

    switch (sortBy) {
      case "oldest":
        filtered.sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
        break;
      case "alphabetical":
        filtered.sort((a, b) => a.title.localeCompare(b.title));
        break;
      default:
        filtered.sort(
          (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );
    }
    filtered.sort((a, b) => (a.pinned === b.pinned ? 0 : a.pinned ? -1 : 1));
    return filtered;
  }, [activeNotes, searchTerm, selectedCategory, sortBy]);

  const { groupedNotes, ungroupedNotes } = useMemo(() => {
    const grouped: Record<string, Note[]> = {};
    const ungrouped: Note[] = [];
    filteredNotes.forEach((note) => {
      if (note.groupId) {
        grouped[note.groupId] = grouped[note.groupId] || [];
        grouped[note.groupId].push(note);
      } else {
        ungrouped.push(note);
      }
    });
    return { groupedNotes: grouped, ungroupedNotes: ungrouped };
  }, [filteredNotes]);

  const categories = useMemo(
    () => Array.from(new Set(notes.map((n) => n.category).filter(Boolean))),
    [notes]
  );

  const toggleGroupExpanded = (id: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // ── selected note sync ────────────────────────────────────────────────────

  const selectedNote = useMemo(
    () => notes.find((n) => n.id === selectedNoteId) ?? null,
    [notes, selectedNoteId]
  );

  useEffect(() => {
    if (selectedNote && !isCreatingRef.current) {
      setEditTitle(selectedNote.title || "");
      lastSavedRef.current = {
        title: selectedNote.title || "",
        html: selectedNote.contentHtml || "",
      };
      setEditVisibility(selectedNote.visibility || "team_only");
    }
  }, [selectedNoteId]); // only re-sync when selection changes

  // ── auto-save ─────────────────────────────────────────────────────────────

  const scheduleAutoSave = useCallback(
    (title: string, html: string) => {
      if (!selectedNoteId) return;
      clearTimeout(saveTimerRef.current);
      setSaveState("saving");
      saveTimerRef.current = setTimeout(() => {
        const contentText = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        silentUpdateMutation.mutate({
          id: selectedNoteId,
          data: { title, contentHtml: html, contentText, content: contentText },
        });
        lastSavedRef.current = { title, html };
      }, 800);
    },
    [selectedNoteId]
  );

  const handleTitleChange = (value: string) => {
    setEditTitle(value);
    scheduleAutoSave(value, lastSavedRef.current.html);
  };

  const handleContentChange = useCallback(
    (html: string) => {
      scheduleAutoSave(lastSavedRef.current.title !== editTitle ? editTitle : lastSavedRef.current.title, html);
      lastSavedRef.current = { ...lastSavedRef.current, html };
    },
    [scheduleAutoSave, editTitle]
  );

  // flush on unmount
  useEffect(() => () => clearTimeout(saveTimerRef.current), []);

  // ── handlers ──────────────────────────────────────────────────────────────

  const handleNewNote = () => {
    if (isCreatingRef.current) return;
    isCreatingRef.current = true;
    createNoteMutation.mutate({
      title: "Untitled",
      content: "",
      contentHtml: "",
      contentText: "",
      author: currentUserName,
      ownerId: currentUser?.id,
      ownerName: currentUserName,
      visibility: "team_only",
      projectId: effectiveProjectId,
      category: "General",
      customFields: {},
    } as any);
  };

  const handleCreateFromTemplate = (template: NoteTemplate) => {
    if (isCreatingRef.current) return;
    isCreatingRef.current = true;
    setTemplateDialogOpen(false);
    setTemplateSearch("");
    let html = template.contentHtml || "";
    if (!html && template.contentText) {
      html = template.contentText
        .split("\n")
        .map((line) => `<p>${line || "<br>"}</p>`)
        .join("");
    }
    const payload: Partial<InsertNote> = {
      title: template.defaultTitle || "Untitled",
      content: template.contentText || "",
      contentHtml: html,
      contentText: template.contentText || "",
      author: currentUserName,
      ownerId: currentUser?.id,
      ownerName: currentUserName,
      visibility: "team_only",
      projectId: effectiveProjectId ?? undefined,
      category: "General",
    };
    createNoteMutation.mutate(payload);
  };

  const handleTogglePin = (note: Note) => {
    if (!note.pinned) {
      const pinCount = notes.filter((n) => n.pinned).length;
      if (pinCount >= 3) {
        toast({
          title: "Maximum pinned notes reached",
          description: "Unpin another note first.",
          variant: "destructive",
        });
        return;
      }
    }
    togglePinMutation.mutate({ id: note.id, pinned: !note.pinned });
  };

  const handleSaveVisibility = () => {
    if (!selectedNoteId) return;
    silentUpdateMutation.mutate({
      id: selectedNoteId,
      data: { visibility: editVisibility as any },
    });
    setPropertiesOpen(false);
    toast({ title: "Properties saved" });
  };

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full" data-testid="notes-page">
      {/* ── LEFT PANEL ─────────────────────────────────────────────────── */}
      <div className="w-72 shrink-0 border-r flex flex-col overflow-hidden">
        {/* header */}
        <div className="flex items-center gap-2 px-3 py-2 border-b shrink-0">
          <h2 className="text-sm font-semibold flex-1">Notes</h2>
          <Button
            size="icon"
            variant="ghost"
            title="New Group"
            onClick={() => setIsCreateGroupOpen(true)}
          >
            <FolderPlus className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setTemplateDialogOpen(true)}
          >
            <LayoutTemplate className="h-3.5 w-3.5 mr-1" />
            From template
          </Button>
          <Button
            size="icon"
            variant="ghost"
            title="New Note"
            onClick={handleNewNote}
            disabled={createNoteMutation.isPending}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {/* search + sort row */}
        <div className="flex items-center gap-1.5 px-2 py-1.5 border-b shrink-0">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-7 pl-7 text-xs"
            />
          </div>
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="h-7 w-7 p-0 shrink-0 border-0 bg-transparent" title="Sort">
              <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
            </SelectTrigger>
            <SelectContent align="end">
              <SelectItem value="newest">Newest first</SelectItem>
              <SelectItem value="oldest">Oldest first</SelectItem>
              <SelectItem value="alphabetical">Alphabetical</SelectItem>
            </SelectContent>
          </Select>
          {categories.length > 0 && (
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="h-7 w-7 p-0 shrink-0 border-0 bg-transparent" title="Filter">
                <Filter className="h-3.5 w-3.5 text-muted-foreground" />
              </SelectTrigger>
              <SelectContent align="end">
                <SelectItem value="All">All categories</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c} value={c!}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* notes list */}
        <div className="flex-1 overflow-y-auto py-1">
          {isLoading ? (
            <p className="text-xs text-muted-foreground text-center py-8">Loading…</p>
          ) : filteredNotes.length === 0 && !showArchived ? (
            <div className="text-center py-10 px-4">
              <FileText className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-xs text-muted-foreground">
                {searchTerm ? "No notes found" : "No notes yet"}
              </p>
              {!searchTerm && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="mt-2 h-7 text-xs"
                  onClick={handleNewNote}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  New Note
                </Button>
              )}
            </div>
          ) : (
            <>
              {/* grouped notes */}
              {noteGroups.map((group) => {
                const groupNotes = groupedNotes[group.id] || [];
                const isExpanded = expandedGroups.has(group.id);
                return (
                  <div key={group.id} className="mb-0.5">
                    <div
                      className="flex items-center gap-1.5 px-2 py-1 cursor-pointer hover-elevate mx-1 rounded-md"
                      onClick={() => toggleGroupExpanded(group.id)}
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-3.5 w-3.5 text-primary shrink-0" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5 text-primary shrink-0" />
                      )}
                      <Folder className="h-3.5 w-3.5 text-primary shrink-0" />
                      {editingGroupId === group.id ? (
                        <Input
                          value={editingGroupName}
                          onChange={(e) => setEditingGroupName(e.target.value)}
                          onBlur={() => {
                            if (editingGroupName.trim()) {
                              updateGroupMutation.mutate({
                                id: group.id,
                                name: editingGroupName.trim(),
                              });
                            } else {
                              setEditingGroupId(null);
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && editingGroupName.trim()) {
                              updateGroupMutation.mutate({
                                id: group.id,
                                name: editingGroupName.trim(),
                              });
                            } else if (e.key === "Escape") {
                              setEditingGroupId(null);
                            }
                          }}
                          className="h-5 text-xs flex-1"
                          autoFocus
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <span className="text-xs font-medium text-foreground flex-1 truncate">
                          {group.name}
                        </span>
                      )}
                      <Badge variant="secondary" className="text-[10px] px-1 h-4 shrink-0">
                        {groupNotes.length}
                      </Badge>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-5 w-5 invisible group-hover:visible"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreHorizontal className="h-3 w-3" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-36">
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingGroupId(group.id);
                              setEditingGroupName(group.name);
                            }}
                          >
                            Rename
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteGroupMutation.mutate(group.id);
                            }}
                          >
                            Delete group
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    {isExpanded &&
                      groupNotes.map((note) => (
                        <NoteListItem
                          key={note.id}
                          note={note}
                          selected={selectedNoteId === note.id}
                          onSelect={() => setSelectedNoteId(note.id)}
                          onPin={() => handleTogglePin(note)}
                          onArchive={() => archiveNoteMutation.mutate(note.id)}
                          onDelete={() => setConfirmDeleteId(note.id)}
                          onMoveToGroup={(gid) =>
                            moveNoteToGroupMutation.mutate({ noteId: note.id, groupId: gid })
                          }
                          noteGroups={noteGroups}
                        />
                      ))}
                  </div>
                );
              })}

              {/* ungrouped notes */}
              {ungroupedNotes.map((note) => (
                <NoteListItem
                  key={note.id}
                  note={note}
                  selected={selectedNoteId === note.id}
                  onSelect={() => setSelectedNoteId(note.id)}
                  onPin={() => handleTogglePin(note)}
                  onArchive={() => archiveNoteMutation.mutate(note.id)}
                  onDelete={() => setConfirmDeleteId(note.id)}
                  onMoveToGroup={(gid) =>
                    moveNoteToGroupMutation.mutate({ noteId: note.id, groupId: gid })
                  }
                  noteGroups={noteGroups}
                />
              ))}
            </>
          )}

          {/* archived toggle */}
          {archivedNotes.length > 0 && (
            <div className="border-t mt-2">
              <button
                className="flex items-center gap-2 w-full px-3 py-2 text-xs text-muted-foreground hover-elevate"
                onClick={() => setShowArchived((v) => !v)}
              >
                {showArchived ? (
                  <EyeOff className="h-3.5 w-3.5" />
                ) : (
                  <Eye className="h-3.5 w-3.5" />
                )}
                {showArchived ? "Hide archived" : `Show archived (${archivedNotes.length})`}
              </button>
              {showArchived &&
                archivedNotes.map((note) => (
                  <div
                    key={note.id}
                    className={cn(
                      "group relative px-3 py-2 cursor-pointer rounded-md mx-1 opacity-60",
                      selectedNoteId === note.id ? "bg-accent" : "hover-elevate"
                    )}
                    onClick={() => setSelectedNoteId(note.id)}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs text-muted-foreground truncate flex-1">
                        {note.title || "Untitled"}
                      </span>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-5 w-5 invisible group-hover:visible shrink-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          unarchiveNoteMutation.mutate(note.id);
                        }}
                        title="Restore"
                      >
                        <ArchiveRestore className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>

      {/* ── RIGHT PANEL ────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedNote ? (
          <>
            {/* top bar */}
            <div className="flex items-center gap-2 px-6 py-2 border-b shrink-0">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs gap-1 text-muted-foreground"
                onClick={() => setPropertiesOpen(true)}
              >
                Properties
              </Button>
              <div className="flex-1" />
              {saveState === "saving" && (
                <span className="text-[11px] text-muted-foreground">Saving…</span>
              )}
              {saveState === "saved" && (
                <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <Check className="h-3 w-3" />
                  Saved
                </span>
              )}
              <Button
                size="icon"
                variant="ghost"
                title="Archive note"
                onClick={() => archiveNoteMutation.mutate(selectedNote.id)}
              >
                <Archive className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                title="Delete note"
                onClick={() => setConfirmDeleteId(selectedNote.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>

            {/* editor area */}
            <div className="flex-1 overflow-y-auto">
              <div className="max-w-3xl mx-auto px-10 py-10">
                <input
                  value={editTitle}
                  onChange={(e) => handleTitleChange(e.target.value)}
                  placeholder="Untitled"
                  className="w-full text-3xl font-bold bg-transparent border-none outline-none placeholder:text-muted-foreground/40 mb-6"
                />
                <NotionEditor
                  key={selectedNote.id}
                  content={selectedNote.contentHtml || ""}
                  onChange={handleContentChange}
                  placeholder="Start writing, or press '/' for commands…"
                />
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center flex-col gap-3 text-center px-8">
            <FileText className="h-12 w-12 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">
              Select a note to view, or create a new one
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                size="sm"
                onClick={handleNewNote}
                disabled={createNoteMutation.isPending}
              >
                <Plus className="h-4 w-4 mr-1" />
                New Note
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setTemplateDialogOpen(true)}
              >
                <LayoutTemplate className="h-4 w-4 mr-1" />
                From Template
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ── CREATE GROUP DIALOG ───────────────────────────────────────── */}
      <Dialog open={isCreateGroupOpen} onOpenChange={setIsCreateGroupOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>New Group</DialogTitle>
          </DialogHeader>
          <div className="flex gap-2 mt-2">
            <Input
              placeholder="Group name…"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newGroupName.trim()) {
                  createGroupMutation.mutate({
                    name: newGroupName.trim(),
                    projectId: effectiveProjectId,
                  });
                }
              }}
              autoFocus
            />
            <Button
              onClick={() => {
                if (newGroupName.trim()) {
                  createGroupMutation.mutate({
                    name: newGroupName.trim(),
                    projectId: effectiveProjectId,
                  });
                }
              }}
              disabled={!newGroupName.trim() || createGroupMutation.isPending}
            >
              Create
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── PROPERTIES DIALOG ─────────────────────────────────────────── */}
      <Dialog open={propertiesOpen} onOpenChange={setPropertiesOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Note Properties</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Owner</label>
              <p className="text-sm">{selectedNote?.ownerName || currentUserName}</p>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Who can view</label>
              <Select value={editVisibility} onValueChange={setEditVisibility}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="private">Private</SelectItem>
                  <SelectItem value="team_only">Team only</SelectItem>
                  <SelectItem value="project_team">Project team</SelectItem>
                  <SelectItem value="everyone">Everyone</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleSaveVisibility} className="w-full">
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── CONFIRM DELETE ─────────────────────────────────────────────── */}
      <AlertDialog
        open={!!confirmDeleteId}
        onOpenChange={(open) => !open && setConfirmDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete note?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The note will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmDeleteId) {
                  deleteNoteMutation.mutate(confirmDeleteId);
                  setConfirmDeleteId(null);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={templateDialogOpen} onOpenChange={(open) => { setTemplateDialogOpen(open); if (!open) setTemplateSearch(""); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create from Template</DialogTitle>
          </DialogHeader>
          <div className="relative mb-3">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search templates..."
              value={templateSearch}
              onChange={(e) => setTemplateSearch(e.target.value)}
              className="pl-8"
            />
          </div>
          <div className="max-h-72 overflow-y-auto -mx-1 px-1">
            {filteredTemplates.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                {noteTemplates.length === 0 ? "No templates available" : "No matching templates"}
              </p>
            ) : (
              <div className="space-y-1">
                {filteredTemplates.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center gap-2 rounded-md px-3 py-2.5 hover-elevate"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">{t.name}</div>
                      {t.description && (
                        <div className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{t.description}</div>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleCreateFromTemplate(t)}
                    >
                      Use
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
