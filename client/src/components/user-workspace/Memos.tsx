import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, Search, Pin, PinOff, Edit3, Trash2, Tag, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
import { RichTextEditor } from "@/components/RichTextEditor";
import type { User, Note } from "@shared/schema";
import { format } from "date-fns";

interface UserNotesProps {
  user: User;
  isOwnPage: boolean;
}

export default function Memos({ user, isOwnPage }: UserNotesProps) {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [showPinnedOnly, setShowPinnedOnly] = useState(false);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteContent, setNoteContent] = useState("");

  // Fetch personal notes for this user
  const { data: notes = [], isLoading } = useQuery<Note[]>({
    queryKey: ["/api/users", user.id, "notes"],
    queryFn: async () => {
      const response = await fetch(`/api/users/${user.id}/notes`, { credentials: 'include' });
      if (!response.ok) {
        throw new Error('Failed to fetch notes');
      }
      return response.json();
    },
    enabled: isOwnPage, // Only fetch if viewing own page
  });

  // Extract all unique tags from notes
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    notes.forEach(note => {
      if (note.tags && Array.isArray(note.tags)) {
        note.tags.forEach(tag => tagSet.add(tag));
      }
    });
    return Array.from(tagSet).sort();
  }, [notes]);

  // Filter notes
  const filteredNotes = useMemo(() => {
    return notes.filter(note => {
      const matchesSearch = searchTerm === "" || 
        note.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (note.contentText && note.contentText.toLowerCase().includes(searchTerm.toLowerCase()));
      
      const matchesPinned = !showPinnedOnly || note.pinned;
      
      const matchesTags = selectedTags.length === 0 || 
        (note.tags && note.tags.some(tag => selectedTags.includes(tag)));
      
      return matchesSearch && matchesPinned && matchesTags;
    });
  }, [notes, searchTerm, showPinnedOnly, selectedTags]);

  // Sort: pinned first, then by creation date
  const sortedNotes = useMemo(() => {
    return [...filteredNotes].sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [filteredNotes]);

  // Create note mutation
  const createMutation = useMutation({
    mutationFn: async (data: { title: string; contentHtml: string; contentText: string }) => {
      return await apiRequest("/api/notes", "POST", {
        title: data.title,
        content: data.contentText, // Legacy field
        contentHtml: data.contentHtml,
        contentText: data.contentText,
        scope: "personal",
        visibility: "private",
        pinned: false,
        tags: [],
      });
    },
    onSuccess: () => {
      // Invalidate all notes and memos queries (covers page and widget variations)
      queryClient.invalidateQueries({ 
        predicate: (query) => Array.isArray(query.queryKey) && 
          (query.queryKey[0] === "/api/notes" || query.queryKey[0] === "/api/memos" ||
           (query.queryKey[0] === "/api/users" && query.queryKey[2] === "notes"))
      });
      toast({ title: "Memo created successfully" });
      handleCloseDialog();
    },
    onError: () => {
      toast({ 
        title: "Failed to create memo",
        variant: "destructive" 
      });
    },
  });

  // Update note mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Note> }) => {
      return await apiRequest(`/api/notes/${id}`, "PATCH", data);
    },
    onSuccess: () => {
      // Invalidate all notes and memos queries (covers page and widget variations)
      queryClient.invalidateQueries({ 
        predicate: (query) => Array.isArray(query.queryKey) && 
          (query.queryKey[0] === "/api/notes" || query.queryKey[0] === "/api/memos" ||
           (query.queryKey[0] === "/api/users" && query.queryKey[2] === "notes"))
      });
      toast({ title: "Memo updated successfully" });
      handleCloseDialog();
    },
    onError: () => {
      toast({ 
        title: "Failed to update memo",
        variant: "destructive" 
      });
    },
  });

  // Delete note mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/notes/${id}`, "DELETE", {});
    },
    onSuccess: () => {
      // Invalidate all notes and memos queries (covers page and widget variations)
      queryClient.invalidateQueries({ 
        predicate: (query) => Array.isArray(query.queryKey) && 
          (query.queryKey[0] === "/api/notes" || query.queryKey[0] === "/api/memos" ||
           (query.queryKey[0] === "/api/users" && query.queryKey[2] === "notes"))
      });
      toast({ title: "Memo deleted successfully" });
    },
    onError: () => {
      toast({ 
        title: "Failed to delete memo",
        variant: "destructive" 
      });
    },
  });

  // Pin/unpin mutation
  const togglePinMutation = useMutation({
    mutationFn: async ({ id, pinned }: { id: string; pinned: boolean }) => {
      return await apiRequest(`/api/notes/${id}`, "PATCH", { pinned });
    },
    onSuccess: () => {
      // Invalidate all notes and memos queries (covers page and widget variations)
      queryClient.invalidateQueries({ 
        predicate: (query) => Array.isArray(query.queryKey) && 
          (query.queryKey[0] === "/api/notes" || query.queryKey[0] === "/api/memos" ||
           (query.queryKey[0] === "/api/users" && query.queryKey[2] === "notes"))
      });
    },
    onError: (error: any) => {
      toast({ 
        title: error?.message || "Failed to update memo",
        variant: "destructive" 
      });
    },
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
    // Extract plain text from HTML for contentText
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = noteContent;
    const plainText = tempDiv.textContent || tempDiv.innerText || "";

    if (!noteTitle.trim()) {
      toast({ title: "Title is required", variant: "destructive" });
      return;
    }

    if (editingNote) {
      updateMutation.mutate({
        id: editingNote.id,
        data: {
          title: noteTitle,
          content: plainText,
          contentHtml: noteContent,
          contentText: plainText,
        },
      });
    } else {
      createMutation.mutate({
        title: noteTitle,
        contentHtml: noteContent,
        contentText: plainText,
      });
    }
  };

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this memo?")) {
      deleteMutation.mutate(id);
    }
  };

  const handleTogglePin = (note: Note) => {
    togglePinMutation.mutate({ id: note.id, pinned: !note.pinned });
  };

  const toggleTagFilter = (tag: string) => {
    setSelectedTags(prev => 
      prev.includes(tag) 
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    );
  };

  if (!isOwnPage) {
    return (
      <div className="p-4" data-testid="memos-private">
        <div className="text-center py-8 text-muted-foreground">
          Personal memos are private
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" data-testid="memos">
      {/* 2-Row Header - BuildPro Pattern */}
      <div className="border-b bg-background">
        {/* Row 1: Title */}
        <div className="h-9 px-4 flex items-center">
          <h2 className="text-sm font-semibold">Memos</h2>
        </div>

        {/* Row 2: Controls & Filters */}
        <div className="h-9 px-4 flex items-center gap-2">
          {/* Search */}
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search memos..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-6 pl-7 text-xs"
              data-testid="input-search-memos"
            />
          </div>

          {/* Pinned Filter */}
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
                {notes.filter(n => n.pinned).length}
              </Badge>
            )}
          </Button>

          {/* Tags Filter */}
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
                    <Badge className="h-4 ml-0.5 px-1 text-[10px]">
                      {selectedTags.length}
                    </Badge>
                  )}
                  <ChevronDown className="h-3 w-3 ml-0.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48">
                {allTags.map((tag) => (
                  <div
                    key={tag}
                    className="flex items-center gap-2 px-2 py-1.5 cursor-pointer hover-elevate rounded-sm"
                    onClick={(e) => {
                      e.preventDefault();
                      toggleTagFilter(tag);
                    }}
                    data-testid={`checkbox-tag-${tag}`}
                  >
                    <Checkbox
                      checked={selectedTags.includes(tag)}
                      onCheckedChange={() => toggleTagFilter(tag)}
                    />
                    <span className="text-sm">{tag}</span>
                  </div>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <div className="flex-1" />

          {/* Add Note Button */}
          <Button
            size="sm"
            onClick={() => handleOpenDialog()}
            className="h-6 px-2 text-xs gap-1"
            data-testid="button-add-memo"
          >
            <Plus className="h-3 w-3" />
            New Memo
          </Button>
        </div>
      </div>

      {/* Notes Grid */}
      <div className="flex-1 overflow-auto p-4">
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            Loading memos...
          </div>
        ) : sortedNotes.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            {notes.length === 0 
              ? "No memos yet. Create your first memo to get started!"
              : "No memos match your filters."}
          </div>
        ) : (
          <div className="grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
            {sortedNotes.map((note) => (
              <div
                key={note.id}
                className="group border rounded-md p-3 bg-card hover-elevate transition-all"
                data-testid={`memo-card-${note.id}`}
              >
                {/* Note Header */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-sm truncate">{note.title}</h3>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(note.createdAt), "MMM d, yyyy 'at' h:mm a")}
                    </p>
                  </div>
                  
                  {/* Quick Actions */}
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      onClick={() => handleTogglePin(note)}
                      data-testid={`button-pin-${note.id}`}
                    >
                      {note.pinned ? (
                        <PinOff className="h-3 w-3" />
                      ) : (
                        <Pin className="h-3 w-3" />
                      )}
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      onClick={() => handleOpenDialog(note)}
                      data-testid={`button-edit-${note.id}`}
                    >
                      <Edit3 className="h-3 w-3" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      onClick={() => handleDelete(note.id)}
                      data-testid={`button-delete-${note.id}`}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>

                {/* Note Content Preview */}
                <div 
                  className="text-sm text-muted-foreground line-clamp-3"
                  dangerouslySetInnerHTML={{ __html: note.contentHtml || note.content }}
                />

                {/* Tags & Pin Badge */}
                <div className="flex items-center gap-1 mt-2 flex-wrap">
                  {note.pinned && (
                    <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                      <Pin className="h-2.5 w-2.5 mr-0.5" />
                      Pinned
                    </Badge>
                  )}
                  {note.tags && note.tags.length > 0 && note.tags.map((tag) => (
                    <Badge 
                      key={tag} 
                      variant="outline" 
                      className="h-4 px-1.5 text-[10px]"
                    >
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Note Editor Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>
              {editingNote ? "Edit Memo" : "New Personal Memo"}
            </DialogTitle>
            <DialogDescription>
              {editingNote 
                ? "Update your personal memo" 
                : "Create a new personal memo for quick capture"}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-auto space-y-4">
            {/* Title Input */}
            <div>
              <label className="text-sm font-medium mb-1.5 block">
                Title
              </label>
              <Input
                value={noteTitle}
                onChange={(e) => setNoteTitle(e.target.value)}
                placeholder="Memo title..."
                className="h-9"
                data-testid="input-memo-title"
              />
            </div>

            {/* Rich Text Editor */}
            <div>
              <label className="text-sm font-medium mb-1.5 block">
                Content
              </label>
              <div className="border rounded-md">
                <RichTextEditor
                  content={noteContent}
                  onChange={setNoteContent}
                  placeholder="Write your memo here..."
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button
              variant="ghost"
              onClick={handleCloseDialog}
              data-testid="button-cancel-memo"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={createMutation.isPending || updateMutation.isPending}
              data-testid="button-save-memo"
            >
              {createMutation.isPending || updateMutation.isPending 
                ? "Saving..." 
                : editingNote ? "Update Memo" : "Create Memo"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
