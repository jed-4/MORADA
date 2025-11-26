import { useProject } from "@/contexts/ProjectContext";
import { useQuery, useMutation } from "@tanstack/react-query";
import type { SiteDiaryEntry } from "@shared/schema";
import { useState } from "react";
import { Plus, Search, Loader2, Calendar, Cloud, Trash2, ChevronLeft, ChevronRight, Image } from "lucide-react";
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
import { format, addDays, subDays, startOfDay, isSameDay } from "date-fns";

interface WeatherData {
  temp?: number;
  condition?: string;
  icon?: string;
}

export function ProjectSiteDiaryTab() {
  const { currentProject } = useProject();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedEntry, setSelectedEntry] = useState<SiteDiaryEntry | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isAddOpen, setIsAddOpen] = useState(false);

  // Form state for new entry
  const [newTitle, setNewTitle] = useState("");
  const [newNotes, setNewNotes] = useState("");

  const { data: entries = [], isLoading, refetch } = useQuery<SiteDiaryEntry[]>({
    queryKey: ["/api/projects", currentProject?.id, "site-diary-entries"],
    queryFn: async () => {
      const baseUrl = getApiBaseUrl();
      const res = await fetch(`${baseUrl}/api/projects/${currentProject?.id}/site-diary-entries`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch site diary entries");
      return res.json();
    },
    enabled: !!currentProject?.id,
    retry: false,
  });

  // Fetch templates for creating entries
  const { data: templates = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["/api/site-diary-templates"],
    queryFn: async () => {
      const baseUrl = getApiBaseUrl();
      const res = await fetch(`${baseUrl}/api/site-diary-templates`, {
        credentials: "include",
      });
      if (!res.ok) return [];
      return res.json();
    },
    retry: false,
  });

  const pullToRefresh = usePullToRefresh({
    onRefresh: async () => {
      await refetch().then(() => undefined);
    },
  });

  const createEntryMutation = useMutation({
    mutationFn: async (data: { title: string; notes: string }) => {
      // Use first template or a default
      const templateId = templates[0]?.id;
      if (!templateId) {
        throw new Error("No template available");
      }

      return await apiRequest(`/api/site-diary-entries`, "POST", {
        projectId: currentProject?.id,
        templateId,
        templateName: templates[0]?.name || "Daily Log",
        title: data.title,
        entryDateTime: selectedDate.toISOString(),
        fieldValues: { notes: data.notes },
      });
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", currentProject?.id, "site-diary-entries"] });
      const Haptics = await getHaptics();
      await Haptics.impact({ style: ImpactStyle.Medium });
      setIsAddOpen(false);
      setNewTitle("");
      setNewNotes("");
    },
  });

  const deleteEntryMutation = useMutation({
    mutationFn: async (entryId: string) => {
      return await apiRequest(`/api/site-diary-entries/${entryId}`, "DELETE", {});
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", currentProject?.id, "site-diary-entries"] });
      const Haptics = await getHaptics();
      await Haptics.impact({ style: ImpactStyle.Heavy });
    },
  });

  // Filter entries by selected date
  const filteredEntries = entries
    .filter((entry) => {
      const entryDate = new Date(entry.entryDateTime);
      return isSameDay(entryDate, selectedDate);
    })
    .filter((entry) => 
      !searchQuery || 
      entry.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      entry.templateName?.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) => new Date(b.entryDateTime).getTime() - new Date(a.entryDateTime).getTime());

  // Get dates with entries for the calendar dots
  const datesWithEntries = new Set(
    entries.map(e => format(new Date(e.entryDateTime), "yyyy-MM-dd"))
  );

  const getWeatherDisplay = (entry: SiteDiaryEntry) => {
    const weather = entry.weather as WeatherData | null;
    if (!weather) return null;
    
    return (
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <Cloud className="w-3 h-3" />
        {weather.temp && <span>{weather.temp}°</span>}
        {weather.condition && <span>{weather.condition}</span>}
      </div>
    );
  };

  const getPhotoCount = (entry: SiteDiaryEntry) => {
    const photos = entry.overallPhotos as string[] | null;
    return photos?.length || 0;
  };

  return (
    <div className="flex flex-col h-full relative">
      <PullToRefreshIndicator {...pullToRefresh} />
      
      <div className="p-4 space-y-3">
        {/* Date Navigation */}
        <div className="flex items-center justify-between bg-card border rounded-lg p-2">
          <button
            onClick={() => setSelectedDate(d => subDays(d, 1))}
            className="p-2 hover-elevate rounded-md"
            data-testid="button-prev-day"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="text-center flex-1">
            <div className="text-lg font-medium">
              {format(selectedDate, "EEEE")}
            </div>
            <div className="text-sm text-muted-foreground">
              {format(selectedDate, "MMMM d, yyyy")}
            </div>
          </div>
          <button
            onClick={() => setSelectedDate(d => addDays(d, 1))}
            className="p-2 hover-elevate rounded-md"
            data-testid="button-next-day"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {/* Quick date buttons */}
        <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
          {[-3, -2, -1, 0, 1, 2, 3].map((offset) => {
            const date = addDays(startOfDay(new Date()), offset);
            const dateStr = format(date, "yyyy-MM-dd");
            const hasEntries = datesWithEntries.has(dateStr);
            const isSelected = isSameDay(date, selectedDate);
            
            return (
              <button
                key={offset}
                onClick={() => setSelectedDate(date)}
                className={`flex flex-col items-center min-w-[48px] p-2 rounded-lg ${
                  isSelected
                    ? "bg-[#bba7db] text-white"
                    : "bg-card border hover-elevate"
                }`}
                data-testid={`date-${offset}`}
              >
                <span className="text-xs">{format(date, "EEE")}</span>
                <span className="text-lg font-medium">{format(date, "d")}</span>
                {hasEntries && !isSelected && (
                  <span className="w-1.5 h-1.5 bg-[#bba7db] rounded-full mt-0.5" />
                )}
              </button>
            );
          })}
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search entries..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-9 pl-9 pr-3 bg-background border rounded-lg text-sm"
            data-testid="input-search-diary"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4" {...pullToRefresh.handlers}>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : filteredEntries.length === 0 ? (
          <div className="text-center py-12">
            <Calendar className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">No entries for this date</p>
            <p className="text-xs text-muted-foreground mt-1">Tap + to add a site diary entry</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredEntries.map((entry) => (
              <SwipeableCard
                key={entry.id}
                onSwipeLeft={() => deleteEntryMutation.mutate(entry.id)}
                rightAction={{
                  icon: <Trash2 className="w-5 h-5" />,
                  color: "bg-red-500",
                  label: "Delete",
                }}
              >
                <div
                  onClick={() => {
                    setSelectedEntry(entry);
                    setIsDetailOpen(true);
                  }}
                  className="p-3 bg-card border rounded-lg"
                  data-testid={`diary-card-${entry.id}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium">{entry.title}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(entry.entryDateTime), "h:mm a")}
                        </span>
                        {entry.templateName && (
                          <span className="text-xs bg-muted px-2 py-0.5 rounded">
                            {entry.templateName}
                          </span>
                        )}
                      </div>
                    </div>
                    {getWeatherDisplay(entry)}
                  </div>

                  {/* Labels */}
                  {entry.labels && (entry.labels as string[]).length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {(entry.labels as string[]).slice(0, 3).map((label, idx) => (
                        <span key={idx} className="text-xs bg-[#bba7db]/20 text-[#bba7db] px-2 py-0.5 rounded">
                          {label}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Photos indicator */}
                  {getPhotoCount(entry) > 0 && (
                    <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                      <Image className="w-3 h-3" />
                      <span>{getPhotoCount(entry)} photo{getPhotoCount(entry) > 1 ? "s" : ""}</span>
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
        data-testid="button-add-diary"
      >
        <Plus className="w-6 h-6" />
      </button>

      {/* Add Entry Sheet */}
      <BottomSheet isOpen={isAddOpen} onClose={() => setIsAddOpen(false)}>
        <div className="p-4">
          <h2 className="text-xl font-bold mb-2">Add Site Diary Entry</h2>
          <p className="text-sm text-muted-foreground mb-6">
            {format(selectedDate, "EEEE, MMMM d, yyyy")}
          </p>
          
          <div className="space-y-4">
            <MobileInput
              label="Title"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Entry title"
              data-testid="input-diary-title"
            />

            <MobileTextarea
              label="Notes"
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
              placeholder="Site notes, observations, progress..."
              rows={5}
              data-testid="textarea-diary-notes"
            />

            {templates.length === 0 && (
              <p className="text-xs text-amber-600 bg-amber-50 p-2 rounded">
                No templates available. Create a template in the web app first.
              </p>
            )}

            <div className="flex gap-3 pt-4">
              <MobileButton
                variant="outline"
                onClick={() => setIsAddOpen(false)}
                className="flex-1"
                data-testid="button-cancel-diary"
              >
                Cancel
              </MobileButton>
              <MobileButton
                onClick={() => createEntryMutation.mutate({
                  title: newTitle,
                  notes: newNotes,
                })}
                disabled={!newTitle || templates.length === 0 || createEntryMutation.isPending}
                className="flex-1"
                data-testid="button-save-diary"
              >
                {createEntryMutation.isPending ? "Adding..." : "Add Entry"}
              </MobileButton>
            </div>
          </div>
        </div>
      </BottomSheet>

      {/* Detail Sheet */}
      <BottomSheet isOpen={isDetailOpen} onClose={() => setIsDetailOpen(false)}>
        {selectedEntry && (
          <div className="p-4">
            <h2 className="text-xl font-bold mb-2">{selectedEntry.title}</h2>
            
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground mb-4">
              <div className="flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                <span>{format(new Date(selectedEntry.entryDateTime), "MMMM d, yyyy 'at' h:mm a")}</span>
              </div>
              {selectedEntry.templateName && (
                <span className="text-xs bg-muted px-2 py-1 rounded">
                  {selectedEntry.templateName}
                </span>
              )}
            </div>

            {getWeatherDisplay(selectedEntry) && (
              <div className="mb-4 p-3 bg-muted/50 rounded-lg">
                {getWeatherDisplay(selectedEntry)}
              </div>
            )}

            {/* Labels */}
            {selectedEntry.labels && (selectedEntry.labels as string[]).length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {(selectedEntry.labels as string[]).map((label, idx) => (
                  <span key={idx} className="text-sm bg-[#bba7db]/20 text-[#bba7db] px-3 py-1 rounded">
                    {label}
                  </span>
                ))}
              </div>
            )}

            {/* Field Values */}
            {selectedEntry.fieldValues && Object.keys(selectedEntry.fieldValues as object).length > 0 && (
              <div className="space-y-3 mb-4">
                {Object.entries(selectedEntry.fieldValues as Record<string, unknown>).map(([key, value]) => (
                  <div key={key}>
                    <h4 className="text-sm font-medium capitalize">{key.replace(/_/g, " ")}</h4>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {String(value)}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {/* Photos */}
            {getPhotoCount(selectedEntry) > 0 && (
              <div className="mb-4">
                <h4 className="text-sm font-medium mb-2">Photos</h4>
                <div className="grid grid-cols-3 gap-2">
                  {(selectedEntry.overallPhotos as string[]).map((photo, idx) => (
                    <img
                      key={idx}
                      src={photo}
                      alt={`Photo ${idx + 1}`}
                      className="w-full aspect-square object-cover rounded-lg"
                    />
                  ))}
                </div>
              </div>
            )}

            <div className="text-xs text-muted-foreground border-t pt-4">
              {selectedEntry.createdByName && (
                <p>Created by: {selectedEntry.createdByName}</p>
              )}
              {selectedEntry.shareWithClient && (
                <p className="text-green-600 mt-1">Shared with client</p>
              )}
            </div>

            <div className="flex gap-3 pt-6">
              <MobileButton
                onClick={() => setIsDetailOpen(false)}
                className="flex-1"
                data-testid="button-close-diary-detail"
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
