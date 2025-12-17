import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageSquare, Send, Trash2, Loader2 } from "lucide-react";
import type { EstimateNote, User } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";

interface EstimateNotesPopoverProps {
  estimateId: string;
}

export function EstimateNotesPopover({ estimateId }: EstimateNotesPopoverProps) {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [newNote, setNewNote] = useState("");

  const { data: notes = [], isLoading } = useQuery<EstimateNote[]>({
    queryKey: ["/api/estimates", estimateId, "notes"],
    queryFn: async () => {
      const res = await fetch(`/api/estimates/${estimateId}/notes`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch notes");
      return res.json();
    },
    enabled: isOpen,
  });

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
    enabled: isOpen,
  });

  const createNoteMutation = useMutation({
    mutationFn: async (content: string) => {
      return apiRequest(`/api/estimates/${estimateId}/notes`, "POST", { content });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/estimates", estimateId, "notes"] });
      setNewNote("");
    },
  });

  const deleteNoteMutation = useMutation({
    mutationFn: async (noteId: string) => {
      return apiRequest(`/api/estimate-notes/${noteId}`, "DELETE");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/estimates", estimateId, "notes"] });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNote.trim()) return;
    createNoteMutation.mutate(newNote.trim());
  };

  const getUserName = (userId: string) => {
    const noteUser = users.find(u => u.id === userId);
    return noteUser?.firstName 
      ? `${noteUser.firstName} ${noteUser.lastName || ''}`.trim()
      : noteUser?.username || 'Unknown';
  };

  const getUserInitials = (userId: string) => {
    const noteUser = users.find(u => u.id === userId);
    if (noteUser?.firstName) {
      return `${noteUser.firstName[0]}${noteUser.lastName?.[0] || ''}`.toUpperCase();
    }
    return noteUser?.username?.[0]?.toUpperCase() || '?';
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button
          className="h-6 w-6 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center justify-center relative"
          data-testid="button-estimate-notes"
        >
          <MessageSquare className="w-3 h-3" />
          {notes.length > 0 && (
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-primary text-primary-foreground text-[8px] rounded-full flex items-center justify-center">
              {notes.length > 9 ? '9+' : notes.length}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="p-3 border-b">
          <h4 className="font-medium text-sm">Estimate Notes</h4>
          <p className="text-xs text-muted-foreground">Running notes for your team</p>
        </div>
        
        <form onSubmit={handleSubmit} className="p-3 border-b">
          <div className="flex gap-2">
            <Textarea
              placeholder="Add a note..."
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              className="min-h-[60px] text-sm resize-none"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
              data-testid="input-new-note"
            />
          </div>
          <div className="flex justify-between items-center mt-2">
            <span className="text-[10px] text-muted-foreground">Cmd+Enter to send</span>
            <Button 
              type="submit" 
              size="sm" 
              disabled={!newNote.trim() || createNoteMutation.isPending}
              data-testid="button-submit-note"
            >
              {createNoteMutation.isPending ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Send className="w-3 h-3" />
              )}
            </Button>
          </div>
        </form>

        <ScrollArea className="h-64">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          ) : notes.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No notes yet
            </div>
          ) : (
            <div className="p-2 space-y-2">
              {notes.map((note) => (
                <div 
                  key={note.id} 
                  className="group p-2 rounded-md bg-muted/50 hover:bg-muted transition-colors"
                  data-testid={`note-${note.id}`}
                >
                  <div className="flex items-start gap-2">
                    <div className="w-6 h-6 rounded-full bg-primary/10 text-primary text-[10px] font-medium flex items-center justify-center flex-shrink-0">
                      {getUserInitials(note.userId)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs font-medium truncate">
                          {getUserName(note.userId)}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {formatDistanceToNow(new Date(note.createdAt), { addSuffix: true })}
                        </span>
                      </div>
                      <p className="text-xs whitespace-pre-wrap break-words">{note.content}</p>
                    </div>
                    {note.userId === user?.id && (
                      <button
                        onClick={() => deleteNoteMutation.mutate(note.id)}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-destructive/10 text-destructive transition-opacity"
                        data-testid={`button-delete-note-${note.id}`}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
