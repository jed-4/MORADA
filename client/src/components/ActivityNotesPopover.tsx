import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { ActivityNote } from "@shared/schema";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { MessageSquare, Send, Loader2, User } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useToast } from "@/hooks/use-toast";

interface ActivityNotesPopoverProps {
  scheduleItemId: string;
  noteCount?: number;
  onNoteCountChange?: (count: number) => void;
}

export function ActivityNotesPopover({ 
  scheduleItemId, 
  noteCount: externalNoteCount,
  onNoteCountChange 
}: ActivityNotesPopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [newNoteContent, setNewNoteContent] = useState("");
  const [offset, setOffset] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();

  const LIMIT = 10;

  // Fetch activity notes with pagination
  const { data, isLoading, refetch } = useQuery({
    queryKey: [`/api/schedule-items/${scheduleItemId}/activity-notes`, offset],
    enabled: isOpen,
  });

  const notes = (data as any)?.notes || [];
  const totalCount = (data as any)?.totalCount || 0;
  const hasMore = (data as any)?.hasMore || false;

  // Update external note count when it changes
  useEffect(() => {
    if (totalCount > 0 && onNoteCountChange) {
      onNoteCountChange(totalCount);
    }
  }, [totalCount, onNoteCountChange]);

  // Create note mutation
  const createNoteMutation = useMutation({
    mutationFn: async (content: string) => {
      return await apiRequest(`/api/schedule-items/${scheduleItemId}/activity-notes`, "POST", {
        content,
        type: "user",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        queryKey: [`/api/schedule-items/${scheduleItemId}/activity-notes`] 
      });
      setNewNoteContent("");
      setOffset(0);
      toast({
        title: "Note added",
        description: "Your note has been added successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to add note",
        description: error.message || "Something went wrong",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = () => {
    if (!newNoteContent.trim()) return;
    createNoteMutation.mutate(newNoteContent);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleLoadMore = () => {
    setOffset(prev => prev + LIMIT);
  };

  const getInitials = (name: string) => {
    if (!name) return "?";
    const parts = name.split(" ");
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  const hasNotes = externalNoteCount !== undefined ? externalNoteCount > 0 : totalCount > 0;

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={hasNotes ? "text-blue-600 dark:text-blue-400" : ""}
          data-testid="button-activity-notes"
        >
          <MessageSquare className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent 
        className="w-[400px] p-0" 
        align="start"
        data-testid="popover-activity-notes"
      >
        <div className="flex flex-col h-[500px]">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b">
            <h3 className="font-semibold text-sm">Activity Notes</h3>
            {totalCount > 0 && (
              <span className="text-xs text-muted-foreground">
                {totalCount} {totalCount === 1 ? "note" : "notes"}
              </span>
            )}
          </div>

          {/* Add Note Section */}
          <div className="p-4 border-b bg-muted/30">
            <div className="flex gap-2">
              <Textarea
                ref={textareaRef}
                placeholder="Add a note... (Cmd/Ctrl+Enter to send)"
                value={newNoteContent}
                onChange={(e) => setNewNoteContent(e.target.value)}
                onKeyDown={handleKeyDown}
                className="min-h-[80px] resize-none text-sm"
                disabled={createNoteMutation.isPending}
                data-testid="textarea-add-note"
              />
            </div>
            <div className="flex justify-end mt-2">
              <Button
                size="sm"
                onClick={handleSubmit}
                disabled={!newNoteContent.trim() || createNoteMutation.isPending}
                data-testid="button-send-note"
              >
                {createNoteMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-1" />
                    Send
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Notes Feed */}
          <ScrollArea className="flex-1">
            <div className="p-4 space-y-4">
              {isLoading && offset === 0 ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : notes.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  No notes yet. Add one above to get started.
                </div>
              ) : (
                <>
                  {notes.map((note: ActivityNote) => (
                    <div 
                      key={note.id} 
                      className="flex gap-3"
                      data-testid={`note-${note.id}`}
                    >
                      <Avatar className="h-8 w-8 flex-shrink-0">
                        <AvatarFallback className="text-xs">
                          {note.type === "system" ? (
                            <User className="h-4 w-4" />
                          ) : (
                            getInitials(note.userName || "")
                          )}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">
                            {note.type === "system" ? "System" : note.userName}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(note.createdAt), { addSuffix: true })}
                          </span>
                          {note.isEdited && (
                            <span className="text-xs text-muted-foreground italic">
                              (edited)
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-foreground whitespace-pre-wrap">
                          {note.content}
                        </p>
                      </div>
                    </div>
                  ))}
                  
                  {hasMore && (
                    <div className="flex justify-center pt-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleLoadMore}
                        disabled={isLoading}
                        data-testid="button-load-more"
                      >
                        {isLoading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          "Load more"
                        )}
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>
          </ScrollArea>
        </div>
      </PopoverContent>
    </Popover>
  );
}
