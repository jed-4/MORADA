import { useProject } from "@/contexts/ProjectContext";
import { useQuery, useMutation } from "@tanstack/react-query";
import type { Minute } from "@shared/schema";
import { useState } from "react";
import { Plus, Search, Loader2, Calendar, MapPin, Users, Trash2 } from "lucide-react";
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

export function ProjectMinutesTab() {
  const { currentProject } = useProject();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMinute, setSelectedMinute] = useState<Minute | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isAddOpen, setIsAddOpen] = useState(false);

  // Form state for new minute
  const [newTitle, setNewTitle] = useState("");
  const [newLocation, setNewLocation] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newAttendees, setNewAttendees] = useState("");

  const { data: minutes = [], isLoading, refetch } = useQuery<Minute[]>({
    queryKey: ["/api/minutes", { projectId: currentProject?.id }],
    queryFn: async () => {
      const baseUrl = getApiBaseUrl();
      const res = await fetch(`${baseUrl}/api/minutes?projectId=${currentProject?.id}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch minutes");
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

  const createMinuteMutation = useMutation({
    mutationFn: async (data: { 
      title: string; 
      location: string; 
      contentText: string;
      attendees: string[];
    }) => {
      return await apiRequest(`/api/minutes`, "POST", {
        ...data,
        projectId: currentProject?.id,
        meetingDate: new Date().toISOString(),
      });
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["/api/minutes", { projectId: currentProject?.id }] });
      const Haptics = await getHaptics();
      await Haptics.impact({ style: ImpactStyle.Medium });
      setIsAddOpen(false);
      setNewTitle("");
      setNewLocation("");
      setNewContent("");
      setNewAttendees("");
    },
  });

  const deleteMinuteMutation = useMutation({
    mutationFn: async (minuteId: string) => {
      return await apiRequest(`/api/minutes/${minuteId}`, "DELETE", {});
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["/api/minutes", { projectId: currentProject?.id }] });
      const Haptics = await getHaptics();
      await Haptics.impact({ style: ImpactStyle.Heavy });
    },
  });

  const filteredMinutes = minutes
    .filter((minute) => 
      minute.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      minute.contentText?.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) => new Date(b.meetingDate).getTime() - new Date(a.meetingDate).getTime());

  const getAttendeeCount = (minute: Minute) => {
    const attendees = minute.attendees as string[] | { name: string }[] | null;
    if (!attendees) return 0;
    return attendees.length;
  };

  return (
    <div className="flex flex-col h-full relative">
      <PullToRefreshIndicator {...pullToRefresh} />
      
      <div className="p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search minutes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-9 pl-9 pr-3 bg-background border rounded-lg text-sm"
            data-testid="input-search-minutes"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4" {...pullToRefresh.touchHandlers}>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : filteredMinutes.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">No meeting minutes found</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredMinutes.map((minute) => (
              <SwipeableCard
                key={minute.id}
                onSwipeLeft={() => deleteMinuteMutation.mutate(minute.id)}
                rightAction={{
                  icon: <Trash2 className="w-5 h-5" />,
                  color: "bg-red-500",
                  label: "Delete",
                }}
              >
                <div
                  onClick={() => {
                    setSelectedMinute(minute);
                    setIsDetailOpen(true);
                  }}
                  className="p-3 bg-card border rounded-lg"
                  data-testid={`minute-card-${minute.id}`}
                >
                  <h3 className="font-medium">{minute.title}</h3>
                  
                  <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      <span>{format(new Date(minute.meetingDate), "MMM d, yyyy")}</span>
                    </div>
                    {minute.location && (
                      <div className="flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        <span className="truncate max-w-[100px]">{minute.location}</span>
                      </div>
                    )}
                    {getAttendeeCount(minute) > 0 && (
                      <div className="flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        <span>{getAttendeeCount(minute)}</span>
                      </div>
                    )}
                  </div>

                  {minute.contentText && (
                    <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                      {minute.contentText}
                    </p>
                  )}

                  {minute.aiSummary && (
                    <div className="mt-2 p-2 bg-muted/50 rounded text-xs">
                      <span className="font-medium">AI Summary: </span>
                      <span className="text-muted-foreground line-clamp-2">{minute.aiSummary}</span>
                    </div>
                  )}
                </div>
              </SwipeableCard>
            ))}
          </div>
        )}
      </div>

      <button
        onClick={() => setIsAddOpen(true)}
        className="absolute bottom-6 right-6 w-14 h-14 bg-[#bba7db] text-white rounded-full shadow-lg flex items-center justify-center"
        data-testid="button-add-minute"
      >
        <Plus className="w-6 h-6" />
      </button>

      {/* Add Minute Sheet */}
      <BottomSheet isOpen={isAddOpen} onClose={() => setIsAddOpen(false)}>
        <div className="p-4">
          <h2 className="text-xl font-bold mb-6">Add Meeting Minutes</h2>
          
          <div className="space-y-4">
            <MobileInput
              label="Title"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Meeting title"
              data-testid="input-minute-title"
            />

            <MobileInput
              label="Location"
              value={newLocation}
              onChange={(e) => setNewLocation(e.target.value)}
              placeholder="Meeting location or link"
              data-testid="input-minute-location"
            />

            <MobileInput
              label="Attendees"
              value={newAttendees}
              onChange={(e) => setNewAttendees(e.target.value)}
              placeholder="Names separated by commas"
              data-testid="input-minute-attendees"
            />

            <MobileTextarea
              label="Notes"
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              placeholder="Meeting notes..."
              rows={5}
              data-testid="textarea-minute-content"
            />

            <div className="flex gap-3 pt-4">
              <MobileButton
                variant="outline"
                onClick={() => setIsAddOpen(false)}
                className="flex-1"
                data-testid="button-cancel-minute"
              >
                Cancel
              </MobileButton>
              <MobileButton
                onClick={() => createMinuteMutation.mutate({
                  title: newTitle,
                  location: newLocation,
                  contentText: newContent,
                  attendees: newAttendees.split(",").map(a => a.trim()).filter(Boolean),
                })}
                disabled={!newTitle || createMinuteMutation.isPending}
                className="flex-1"
                data-testid="button-save-minute"
              >
                {createMinuteMutation.isPending ? "Adding..." : "Add Minutes"}
              </MobileButton>
            </div>
          </div>
        </div>
      </BottomSheet>

      {/* Detail Sheet */}
      <BottomSheet isOpen={isDetailOpen} onClose={() => setIsDetailOpen(false)}>
        {selectedMinute && (
          <div className="p-4">
            <h2 className="text-xl font-bold mb-2">{selectedMinute.title}</h2>
            
            <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground mb-4">
              <div className="flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                <span>{format(new Date(selectedMinute.meetingDate), "MMMM d, yyyy")}</span>
              </div>
              {selectedMinute.location && (
                <div className="flex items-center gap-1">
                  <MapPin className="w-4 h-4" />
                  <span>{selectedMinute.location}</span>
                </div>
              )}
            </div>

            {getAttendeeCount(selectedMinute) > 0 && (
              <div className="mb-4">
                <h4 className="text-sm font-medium mb-2">Attendees</h4>
                <div className="flex flex-wrap gap-2">
                  {(selectedMinute.attendees as (string | { name: string })[]).map((attendee, idx) => (
                    <span key={idx} className="text-xs bg-muted px-2 py-1 rounded">
                      {typeof attendee === "string" ? attendee : attendee.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {selectedMinute.aiSummary && (
              <div className="mb-4 p-3 bg-muted/50 rounded-lg">
                <h4 className="text-sm font-medium mb-1">AI Summary</h4>
                <p className="text-sm text-muted-foreground">{selectedMinute.aiSummary}</p>
              </div>
            )}

            <div className="prose prose-sm dark:prose-invert max-w-none">
              {selectedMinute.contentHtml ? (
                <div dangerouslySetInnerHTML={{ __html: selectedMinute.contentHtml }} />
              ) : (
                <p className="text-muted-foreground whitespace-pre-wrap">
                  {selectedMinute.contentText}
                </p>
              )}
            </div>

            <div className="flex gap-3 pt-6">
              <MobileButton
                onClick={() => setIsDetailOpen(false)}
                className="flex-1"
                data-testid="button-close-minute-detail"
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
