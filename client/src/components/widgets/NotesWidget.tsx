import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { FileText, Plus, Edit3, X } from "lucide-react";
import { useState } from "react";
import { WidgetProps } from "@/types/widgets";
import { useQuery, useMutation } from "@tanstack/react-query";
import { type Note } from "@shared/schema";
import { useProject } from "@/contexts/ProjectContext";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function NotesWidget({ widget }: WidgetProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [newNote, setNewNote] = useState("");
  const [newNoteVisibility, setNewNoteVisibility] = useState<"team_only" | "everyone" | "project_team" | "private">("team_only");
  const [editContent, setEditContent] = useState("");
  const [editVisibility, setEditVisibility] = useState<"team_only" | "everyone" | "project_team" | "private">("team_only");
  const maxNotes = widget.config?.maxNotes || 3;
  const { currentProject } = useProject();
  const { toast } = useToast();
  
  // Fetch real notes from the API filtered by current project
  const { data: notes = [], isLoading } = useQuery<Note[]>({
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
    mutationFn: async (data: { content: string; visibility: string }) => {
      return await apiRequest("/api/notes", {
        method: "POST",
        body: JSON.stringify({
          title: "Project Note",
          content: data.content,
          visibility: data.visibility,
          projectId: currentProject?.id,
          type: "note",
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notes", currentProject?.id] });
      setNewNote("");
      setNewNoteVisibility("team_only");
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
    mutationFn: async (data: { id: string; content: string; visibility: string }) => {
      return await apiRequest(`/api/notes/${data.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          content: data.content,
          visibility: data.visibility,
        }),
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

  const handleCreateNote = () => {
    if (newNote.trim() && currentProject?.id) {
      createNoteMutation.mutate({
        content: newNote,
        visibility: newNoteVisibility,
      });
    }
  };

  const handleEditNote = (note: Note) => {
    setEditingNoteId(note.id);
    setEditContent(note.content);
    setEditVisibility((note.visibility as "team_only" | "everyone" | "project_team" | "private") || "team_only");
  };

  const handleUpdateNote = (noteId: string) => {
    if (editContent.trim()) {
      updateNoteMutation.mutate({
        id: noteId,
        content: editContent,
        visibility: editVisibility,
      });
    }
  };

  const handleCancelEdit = () => {
    setEditingNoteId(null);
    setEditContent("");
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

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {displayNotes.length} note{displayNotes.length !== 1 ? 's' : ''}
        </div>
        <Button 
          size="sm" 
          variant="ghost"
          onClick={() => {
            setIsCreating(!isCreating);
            if (isCreating) {
              setNewNote("");
              setNewNoteVisibility("team_only");
            }
          }}
          data-testid="notes-widget-add"
        >
          {isCreating ? <X className="h-3 w-3 mr-1" /> : <Plus className="h-3 w-3 mr-1" />}
          {isCreating ? 'Cancel' : 'Add'}
        </Button>
      </div>
      
      {isCreating && (
        <div className="space-y-3 p-3 border rounded" data-testid="notes-widget-editor">
          <div className="space-y-2">
            <Label htmlFor="note-content">Note</Label>
            <Textarea
              id="note-content"
              placeholder="Add a project note..."
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              rows={3}
              className="text-sm"
              data-testid="input-note-content"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="note-visibility">Who can view</Label>
            <Select value={newNoteVisibility} onValueChange={(value: any) => setNewNoteVisibility(value)}>
              <SelectTrigger id="note-visibility" data-testid="select-note-visibility">
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
          <div className="flex justify-end gap-2">
            <Button 
              size="sm" 
              variant="outline" 
              onClick={() => {
                setIsCreating(false);
                setNewNote("");
                setNewNoteVisibility("team_only");
              }}
              data-testid="button-cancel-note"
            >
              Cancel
            </Button>
            <Button 
              size="sm" 
              onClick={handleCreateNote} 
              disabled={!newNote.trim() || createNoteMutation.isPending}
              data-testid="button-save-note"
            >
              {createNoteMutation.isPending ? "Saving..." : "Save Note"}
            </Button>
          </div>
        </div>
      )}
      
      <div className="space-y-2">
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].slice(0, maxNotes).map((i) => (
              <div key={i} className="animate-pulse">
                <div className="flex items-start gap-2 p-3 border rounded">
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
              className={`p-3 border rounded ${editingNoteId !== note.id ? 'hover-elevate cursor-pointer' : ''}`}
              data-testid={`note-widget-item-${note.id}`}
            >
              {editingNoteId === note.id ? (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor={`edit-content-${note.id}`}>Note</Label>
                    <Textarea
                      id={`edit-content-${note.id}`}
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      rows={3}
                      className="text-sm"
                      data-testid={`textarea-edit-note-${note.id}`}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`edit-visibility-${note.id}`}>Who can view</Label>
                    <Select value={editVisibility} onValueChange={(value: any) => setEditVisibility(value)}>
                      <SelectTrigger id={`edit-visibility-${note.id}`} data-testid={`select-edit-visibility-${note.id}`}>
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
                  <div className="flex justify-end gap-2">
                    <Button 
                      size="sm" 
                      variant="outline" 
                      onClick={handleCancelEdit}
                      data-testid={`button-cancel-edit-${note.id}`}
                    >
                      Cancel
                    </Button>
                    <Button 
                      size="sm" 
                      onClick={() => handleUpdateNote(note.id)}
                      disabled={!editContent.trim() || updateNoteMutation.isPending}
                      data-testid={`button-update-note-${note.id}`}
                    >
                      {updateNoteMutation.isPending ? "Updating..." : "Update"}
                    </Button>
                  </div>
                </div>
              ) : (
                <div 
                  className="flex items-start gap-2"
                  onClick={() => handleEditNote(note)}
                >
                  <FileText className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">{note.content}</p>
                    <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                      <span>{note.ownerName || note.author}</span>
                      <span>•</span>
                      <span>{getVisibilityLabel(note.visibility || "team_only")}</span>
                      <span>•</span>
                      <span>
                        {note.createdAt 
                          ? new Date(note.createdAt).toLocaleDateString("en-AU", { 
                              month: "short", 
                              day: "numeric", 
                              hour: "2-digit", 
                              minute: "2-digit" 
                            })
                          : "Unknown date"
                        }
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
      
      {displayNotes.length === 0 && !isCreating && (
        <div className="text-center py-4 text-sm text-muted-foreground">
          No project notes yet
        </div>
      )}
    </div>
  );
}
