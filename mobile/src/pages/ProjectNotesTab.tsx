import { useProject } from "@/contexts/ProjectContext";
import { useQuery, useMutation } from "@tanstack/react-query";
import type { Note } from "@shared/schema";
import { useState } from "react";
import { Plus, Search, Loader2, Pin, PinOff, Trash2 } from "lucide-react";
import { SwipeableCard } from "@/components/SwipeableCard";
import { BottomSheet } from "@/components/BottomSheet";
import { MobileInput } from "@/components/ui/MobileInput";
import { MobileTextarea } from "@/components/ui/MobileTextarea";
import { MobileButton } from "@/components/ui/MobileButton";
import { PullToRefreshIndicator } from "@/components/PullToRefresh";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { apiRequest, queryClient, getApiBaseUrl } from "@lib/queryClient";
import { ImpactStyle } from "@capacitor/haptics";
import { getHaptics } from "@/lib/capacitor";
import { format } from "date-fns";

export function ProjectNotesTab() {
  const { currentProject } = useProject();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isAddOpen, setIsAddOpen] = useState(false);

  // Form state for new note
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newCategory, setNewCategory] = useState("General");

  const { data: notes = [], isLoading, refetch } = useQuery<Note[]>({
    queryKey: ["/api/notes", { projectId: currentProject?.id }],
    queryFn: async () => {
      const baseUrl = getApiBaseUrl();
      const res = await fetch(`${baseUrl}/api/notes?projectId=${currentProject?.id}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch notes");
      return res.json();
    },
    enabled: !!currentProject,
    retry: false,
  });

  const pullToRefresh = usePullToRefresh({
    onRefresh: async () => {
      await refetch().then(() => undefined);
    },
  });

  const createNoteMutation = useMutation({
    mutationFn: async (data: { title: string; content: string; category: string }) => {
      return await apiRequest(`/api/notes`, "POST", {
        ...data,
        projectId: currentProject?.id,
        scope: "project",
        type: "note",
      });
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notes", { projectId: currentProject?.id }] });
      const Haptics = await getHaptics();
      await Haptics.impact({ style: ImpactStyle.Medium });
      setIsAddOpen(false);
      setNewTitle("");
      setNewContent("");
      setNewCategory("General");
    },
  });

  const togglePinMutation = useMutation({
    mutationFn: async ({ noteId, pinned }: { noteId: string; pinned: boolean }) => {
      return await apiRequest(`/api/notes/${noteId}`, "PATCH", { pinned });
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notes", { projectId: currentProject?.id }] });
      const Haptics = await getHaptics();
      await Haptics.impact({ style: ImpactStyle.Light });
    },
  });

  const deleteNoteMutation = useMutation({
    mutationFn: async (noteId: string) => {
      return await apiRequest(`/api/notes/${noteId}`, "DELETE", {});
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notes", { projectId: currentProject?.id }] });
      const Haptics = await getHaptics();
      await Haptics.impact({ style: ImpactStyle.Heavy });
    },
  });

  // Filter and sort notes
  const filteredNotes = notes
    .filter((note) => 
      note.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      note.content?.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) => {
      // Pinned notes first
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      // Then by date
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

  const categories = ["General", "Important", "Client", "Internal", "Follow-up"];

  return (
    <div className="flex flex-col h-full relative">
      <PullToRefreshIndicator {...pullToRefresh} />
      
      <div className="p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search notes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-9 pl-9 pr-3 bg-background border rounded-lg text-sm"
            data-testid="input-search-notes"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4" {...pullToRefresh.handlers}>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : notes.length === 0 ? (
          <div className="text-center py-16 px-6">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[#bba7db]/10 flex items-center justify-center">
              <Plus className="w-8 h-8 text-[#bba7db]" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No Notes Yet</h3>
            <p className="text-muted-foreground text-sm mb-6">
              Create notes to keep track of important project information, meeting summaries, and reminders.
            </p>
            <button
              onClick={() => setIsAddOpen(true)}
              className="inline-flex items-center gap-2 bg-[#bba7db] text-white px-4 py-2 rounded-lg font-medium"
              data-testid="button-add-first-note"
            >
              <Plus className="w-4 h-4" />
              Add First Note
            </button>
          </div>
        ) : filteredNotes.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">No matching notes found</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredNotes.map((note) => (
              <SwipeableCard
                key={note.id}
                onSwipeRight={() => togglePinMutation.mutate({ noteId: note.id, pinned: !note.pinned })}
                onSwipeLeft={() => deleteNoteMutation.mutate(note.id)}
                leftAction={{
                  icon: note.pinned ? <PinOff className="w-5 h-5" /> : <Pin className="w-5 h-5" />,
                  color: "bg-[#bba7db]",
                  label: note.pinned ? "Unpin" : "Pin",
                }}
                rightAction={{
                  icon: <Trash2 className="w-5 h-5" />,
                  color: "bg-red-500",
                  label: "Delete",
                }}
              >
                <div
                  onClick={() => {
                    setSelectedNote(note);
                    setIsDetailOpen(true);
                  }}
                  className="p-3 bg-card border rounded-lg"
                  data-testid={`note-card-${note.id}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {note.pinned && (
                          <Pin className="w-3 h-3 text-[#bba7db] flex-shrink-0" />
                        )}
                        <h3 className="font-medium truncate">{note.title}</h3>
                      </div>
                      {note.content && (
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                          {note.contentText || note.content}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs bg-muted px-2 py-0.5 rounded">
                      {note.category}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(note.createdAt), "MMM d")}
                    </span>
                  </div>
                </div>
              </SwipeableCard>
            ))}
          </div>
        )}
      </div>

      <button
        onClick={() => setIsAddOpen(true)}
        className="absolute bottom-6 right-6 w-14 h-14 bg-[#bba7db] text-white rounded-full shadow-lg flex items-center justify-center"
        data-testid="button-add-note"
      >
        <Plus className="w-6 h-6" />
      </button>

      {/* Add Note Sheet */}
      <BottomSheet isOpen={isAddOpen} onClose={() => setIsAddOpen(false)}>
        <div className="p-4">
          <h2 className="text-xl font-bold mb-6">Add Note</h2>
          
          <div className="space-y-4">
            <MobileInput
              label="Title"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Enter note title"
              data-testid="input-note-title"
            />

            <div>
              <label className="block text-sm font-medium mb-2">Category</label>
              <div className="flex flex-wrap gap-2">
                {categories.map((category) => (
                  <button
                    key={category}
                    onClick={() => setNewCategory(category)}
                    className={`h-8 px-3 rounded-md text-sm font-medium ${
                      newCategory === category
                        ? "bg-[#bba7db] text-white"
                        : "border hover-elevate"
                    }`}
                    data-testid={`category-select-${category}`}
                  >
                    {category}
                  </button>
                ))}
              </div>
            </div>

            <MobileTextarea
              label="Content"
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              placeholder="Write your note..."
              rows={5}
              data-testid="textarea-note-content"
            />

            <div className="flex gap-3 pt-4">
              <MobileButton
                variant="outline"
                onClick={() => setIsAddOpen(false)}
                className="flex-1"
                data-testid="button-cancel-note"
              >
                Cancel
              </MobileButton>
              <MobileButton
                onClick={() => createNoteMutation.mutate({
                  title: newTitle,
                  content: newContent,
                  category: newCategory,
                })}
                disabled={!newTitle || createNoteMutation.isPending}
                className="flex-1"
                data-testid="button-save-note"
              >
                {createNoteMutation.isPending ? "Adding..." : "Add Note"}
              </MobileButton>
            </div>
          </div>
        </div>
      </BottomSheet>

      {/* Detail Sheet */}
      <BottomSheet isOpen={isDetailOpen} onClose={() => setIsDetailOpen(false)}>
        {selectedNote && (
          <div className="p-4">
            <div className="flex items-center gap-2 mb-2">
              {selectedNote.pinned && (
                <Pin className="w-4 h-4 text-[#bba7db]" />
              )}
              <h2 className="text-xl font-bold">{selectedNote.title}</h2>
            </div>
            
            <div className="flex items-center gap-2 mb-4">
              <span className="text-xs bg-muted px-2 py-1 rounded">
                {selectedNote.category}
              </span>
              <span className="text-xs text-muted-foreground">
                {format(new Date(selectedNote.createdAt), "MMM d, yyyy")}
              </span>
            </div>
            
            <div className="prose prose-sm dark:prose-invert max-w-none">
              {selectedNote.contentHtml ? (
                <div dangerouslySetInnerHTML={{ __html: selectedNote.contentHtml }} />
              ) : (
                <p className="text-muted-foreground whitespace-pre-wrap">
                  {selectedNote.content}
                </p>
              )}
            </div>

            <div className="flex gap-3 pt-6">
              <MobileButton
                variant="outline"
                onClick={() => togglePinMutation.mutate({ 
                  noteId: selectedNote.id, 
                  pinned: !selectedNote.pinned 
                })}
                className="flex-1"
                data-testid="button-toggle-pin"
              >
                {selectedNote.pinned ? "Unpin" : "Pin"}
              </MobileButton>
              <MobileButton
                onClick={() => setIsDetailOpen(false)}
                className="flex-1"
                data-testid="button-close-note-detail"
              >
                Close
              </MobileButton>
            </div>
          </div>
        )}
      </BottomSheet>
    </div>
  );
}
