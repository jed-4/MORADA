import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, Search, Pin, PinOff, Edit3, Trash2, Tag, ChevronDown, User as UserIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import NotionEditor from "@/components/NotionEditor";
import type { User, Note } from "@shared/schema";
import { formatDateTimeInTimezone, useTimezone } from "@/hooks/useTimezone";

interface UserNotesProps {
  user: User;
  isOwnPage: boolean;
}

interface NotesResponse {
  myNotes: Note[];
  assignedNotes: Note[];
}

export default function UserNotes({ user, isOwnPage }: UserNotesProps) {
  const { toast } = useToast();
  const { effectiveTimezone } = useTimezone();
  const [searchTerm, setSearchTerm] = useState("");
  const [showPinnedOnly, setShowPinnedOnly] = useState(false);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteContent, setNoteContent] = useState("");

  const { data: notesResponse, isLoading } = useQuery<NotesResponse>({
    queryKey: ["/api/users", user.id, "notes"],
    queryFn: async () => {
      const response = await fetch(`/api/users/${user.id}/notes`, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch notes");
      return response.json();
    },
    enabled: isOwnPage,
  });

  const myNotes = notesResponse?.myNotes ?? [];
  const assignedNotes = notesResponse?.assignedNotes ?? [];
  const allNotes = [...myNotes, ...assignedNotes];

  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    allNotes.forEach(note => {
      if (note.tags && Array.isArray(note.tags)) {
        note.tags.forEach((tag: string) => tagSet.add(tag));
      }
    });
    return Array.from(tagSet).sort();
  }, [allNotes]);

  const filterNote = (note: Note) => {
    const matchesSearch =
      searchTerm === "" ||
      note.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (note.contentText && note.contentText.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesPinned = !showPinnedOnly || note.pinned;
    const matchesTags =
      selectedTags.length === 0 ||
      (note.tags && (note.tags as string[]).some((tag: string) => selectedTags.includes(tag)));
    return matchesSearch && matchesPinned && matchesTags;
  };

  const filteredMyNotes = useMemo(() => {
    return [...myNotes]
      .filter(filterNote)
      .sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  }, [myNotes, searchTerm, showPinnedOnly, selectedTags]);

  const filteredAssignedNotes = useMemo(() => {
    return [...assignedNotes]
      .filter(filterNote)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [assignedNotes, searchTerm, showPinnedOnly, selectedTags]);

  const invalidateNotes = () => {
    queryClient.invalidateQueries({
      predicate: (query) =>
        Array.isArray(query.queryKey) &&
        (query.queryKey[0] === "/api/notes" ||
          (query.queryKey[0] === "/api/users" && query.queryKey[2] === "notes")),
    });
  };

  const createMutation = useMutation({
    mutationFn: async (data: { title: string; contentHtml: string; contentText: string }) => {
      return await apiRequest("/api/notes", "POST", {
        title: data.title,
        content: data.contentText,
        contentHtml: data.contentHtml,
        contentText: data.contentText,
        scope: "personal",
        visibility: "private",
        pinned: false,
        tags: [],
      });
    },
    onSuccess: () => {
      invalidateNotes();
      toast({ title: "Note created" });
      handleCloseDialog();
    },
    onError: () => toast({ title: "Failed to create note", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Note> }) => {
      return await apiRequest(`/api/notes/${id}`, "PATCH", data);
    },
    onSuccess: () => {
      invalidateNotes();
      toast({ title: "Note updated" });
      handleCloseDialog();
    },
    onError: () => toast({ title: "Failed to update note", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => await apiRequest(`/api/notes/${id}`, "DELETE", {}),
    onSuccess: () => { invalidateNotes(); toast({ title: "Note deleted" }); },
    onError: () => toast({ title: "Failed to delete note", variant: "destructive" }),
  });

  const togglePinMutation = useMutation({
    mutationFn: async ({ id, pinned }: { id: string; pinned: boolean }) =>
      await apiRequest(`/api/notes/${id}`, "PATCH", { pinned }),
    onSuccess: () => invalidateNotes(),
    onError: (error: any) =>
      toast({ title: error?.message || "Failed to update note", variant: "destructive" }),
  });

  const handleOpenDialog = (note?: Note) => {
    if (note) {
      setEditingNote(note);
      setNoteTitle(note.title);
      setNoteContent(note.contentHtml || note.content);
    } else {
      setEditingNote(null);
      setNoteTitle("");
      setNoteContent("");
    }
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingNote(null);
    setNoteTitle("");
    setNoteContent("");
  };

  const handleSave = () => {
    if (!noteTitle.trim()) {
      toast({ title: "Title is required", variant: "destructive" });
      return;
    }
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = noteContent;
    const plainText = tempDiv.textContent || tempDiv.innerText || "";

    if (editingNote) {
      updateMutation.mutate({
        id: editingNote.id,
        data: { title: noteTitle, content: plainText, contentHtml: noteContent, contentText: plainText },
      });
    } else {
      createMutation.mutate({ title: noteTitle, contentHtml: noteContent, contentText: plainText });
    }
  };

  const toggleTagFilter = (tag: string) => {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  if (!isOwnPage) {
    return (
      <div className="p-4" data-testid="notes-private">
        <div className="text-center py-8 text-muted-foreground">
          Personal notes are private
        </div>
      </div>
    );
  }

  const NoteCard = ({ note, isAssigned }: { note: Note; isAssigned?: boolean }) => (
    <div
      key={note.id}
      className="group border rounded-md p-3 bg-card hover-elevate transition-all"
      data-testid={`note-card-${note.id}`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm truncate">{note.title}</h3>
          <p className="text-xs text-muted-foreground">
            {formatDateTimeInTimezone(new Date(note.createdAt), effectiveTimezone)}
          </p>
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {!isAssigned && (
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              onClick={() => togglePinMutation.mutate({ id: note.id, pinned: !note.pinned })}
              data-testid={`button-pin-${note.id}`}
            >
              {note.pinned ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
            </Button>
          )}
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            onClick={() => handleOpenDialog(note)}
            data-testid={`button-edit-${note.id}`}
          >
            <Edit3 className="h-3 w-3" />
          </Button>
          {!isAssigned && (
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              onClick={() => {
                if (confirm("Delete this note?")) deleteMutation.mutate(note.id);
              }}
              data-testid={`button-delete-${note.id}`}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>

      <div
        className="text-sm text-muted-foreground line-clamp-3"
        dangerouslySetInnerHTML={{ __html: note.contentHtml || note.content }}
      />

      <div className="flex items-center gap-1 mt-2 flex-wrap">
        {note.pinned && !isAssigned && (
          <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
            <Pin className="h-2.5 w-2.5 mr-0.5" />
            Pinned
          </Badge>
        )}
        {isAssigned && note.ownerName && (
          <Badge variant="outline" className="h-4 px-1.5 text-[10px]">
            <UserIcon className="h-2.5 w-2.5 mr-0.5" />
            {note.ownerName}
          </Badge>
        )}
        {note.tags && (note.tags as string[]).map((tag: string) => (
          <Badge key={tag} variant="outline" className="h-4 px-1.5 text-[10px]">
            {tag}
          </Badge>
        ))}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full" data-testid="user-notes">
      {/* Header */}
      <div className="border-b bg-background">
        <div className="h-9 px-4 flex items-center">
          <h2 className="text-sm font-semibold">Notes</h2>
        </div>

        <div className="h-9 px-4 flex items-center gap-2">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search notes..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-6 pl-7 text-xs"
              data-testid="input-search-notes"
            />
          </div>

          <Button
            size="sm"
            variant={showPinnedOnly ? "default" : "ghost"}
            className={`h-6 px-2 text-xs gap-1 ${!showPinnedOnly ? "hover-elevate active-elevate-2" : ""}`}
            onClick={() => setShowPinnedOnly(!showPinnedOnly)}
            data-testid="button-filter-pinned"
          >
            <Pin className="h-3 w-3" />
            Pinned
            {showPinnedOnly && (
              <Badge className="h-4 ml-0.5 px-1 text-[10px]">
                {myNotes.filter(n => n.pinned).length}
              </Badge>
            )}
          </Button>

          {allTags.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  variant={selectedTags.length > 0 ? "default" : "ghost"}
                  className={`h-6 px-2 text-xs gap-1 ${selectedTags.length === 0 ? "hover-elevate active-elevate-2" : ""}`}
                  data-testid="button-filter-tags"
                >
                  <Tag className="h-3 w-3" />
                  Tags
                  {selectedTags.length > 0 && (
                    <Badge className="h-4 ml-0.5 px-1 text-[10px]">{selectedTags.length}</Badge>
                  )}
                  <ChevronDown className="h-3 w-3 ml-0.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48">
                {allTags.map((tag) => (
                  <div
                    key={tag}
                    className="flex items-center gap-2 px-2 py-1.5 cursor-pointer hover-elevate rounded-sm"
                    onClick={() => toggleTagFilter(tag)}
                  >
                    <Checkbox checked={selectedTags.includes(tag)} onCheckedChange={() => toggleTagFilter(tag)} />
                    <span className="text-sm">{tag}</span>
                  </div>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <div className="flex-1" />

          <Button
            size="sm"
            onClick={() => handleOpenDialog()}
            className="h-6 px-2 text-xs gap-1"
            data-testid="button-add-note"
          >
            <Plus className="h-3 w-3" />
            New Note
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 space-y-6">
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground text-sm">Loading notes...</div>
        ) : (
          <>
            {/* My Notes section */}
            <div>
              {filteredAssignedNotes.length > 0 && (
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
                  My Notes
                </h3>
              )}
              {filteredMyNotes.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  {myNotes.length === 0
                    ? "No notes yet. Create your first note to get started."
                    : "No notes match your filters."}
                </div>
              ) : (
                <div className="grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                  {filteredMyNotes.map(note => (
                    <NoteCard key={note.id} note={note} />
                  ))}
                </div>
              )}
            </div>

            {/* Assigned to Me section — only if there are any */}
            {assignedNotes.length > 0 && (
              <div>
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
                  Assigned to Me
                </h3>
                {filteredAssignedNotes.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No assigned notes match your filters.</div>
                ) : (
                  <div className="grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                    {filteredAssignedNotes.map(note => (
                      <NoteCard key={note.id} note={note} isAssigned />
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Note Editor Dialog — uses NotionEditor */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{editingNote ? "Edit Note" : "New Note"}</DialogTitle>
            <DialogDescription>
              {editingNote ? "Update your personal note" : "Create a new personal note"}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-auto space-y-4 min-h-0">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Title</label>
              <Input
                value={noteTitle}
                onChange={(e) => setNoteTitle(e.target.value)}
                placeholder="Note title..."
                className="h-9"
                data-testid="input-note-title"
              />
            </div>

            <div className="flex-1">
              <label className="text-sm font-medium mb-1.5 block">Content</label>
              <div className="border rounded-md min-h-[300px]">
                <NotionEditor
                  content={noteContent}
                  onChange={(html) => setNoteContent(html)}
                  placeholder="Write your note here..."
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t flex-shrink-0">
            <Button variant="ghost" onClick={handleCloseDialog} data-testid="button-cancel-note">
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={createMutation.isPending || updateMutation.isPending}
              data-testid="button-save-note"
            >
              {createMutation.isPending || updateMutation.isPending
                ? "Saving..."
                : editingNote
                ? "Update Note"
                : "Create Note"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
