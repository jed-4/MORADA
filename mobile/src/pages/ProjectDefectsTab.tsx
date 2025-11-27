import { useProject } from "@/contexts/ProjectContext";
import { useQuery, useMutation } from "@tanstack/react-query";
import type { Defect } from "@shared/schema";
import { useState } from "react";
import { Plus, Search, Loader2, Check, Trash2, AlertTriangle, MapPin } from "lucide-react";
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

type DefectStatus = "open" | "in_progress" | "resolved" | "closed";
type DefectPriority = "critical" | "high" | "medium" | "low";

export function ProjectDefectsTab() {
  const { currentProject } = useProject();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedDefect, setSelectedDefect] = useState<Defect | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isAddOpen, setIsAddOpen] = useState(false);

  // Form state for new defect
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newLocation, setNewLocation] = useState("");
  const [newPriority, setNewPriority] = useState<DefectPriority>("medium");
  const [newType, setNewType] = useState("builder");

  const { data: defects = [], isLoading, refetch } = useQuery<Defect[]>({
    queryKey: ["/api/defects", { projectId: currentProject?.id }],
    queryFn: async () => {
      const baseUrl = getApiBaseUrl();
      const res = await fetch(`${baseUrl}/api/defects?projectId=${currentProject?.id}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch defects");
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

  const createDefectMutation = useMutation({
    mutationFn: async (data: { 
      title: string; 
      description: string; 
      location: string;
      priority: DefectPriority;
      type: string;
    }) => {
      return await apiRequest(`/api/defects`, "POST", {
        ...data,
        projectId: currentProject?.id,
        status: "open",
      });
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["/api/defects", { projectId: currentProject?.id }] });
      const Haptics = await getHaptics();
      await Haptics.impact({ style: ImpactStyle.Medium });
      setIsAddOpen(false);
      setNewTitle("");
      setNewDescription("");
      setNewLocation("");
      setNewPriority("medium");
      setNewType("builder");
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ defectId, status }: { defectId: string; status: DefectStatus }) => {
      return await apiRequest(`/api/defects/${defectId}`, "PATCH", { status });
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["/api/defects", { projectId: currentProject?.id }] });
      const Haptics = await getHaptics();
      await Haptics.impact({ style: ImpactStyle.Medium });
    },
  });

  const deleteDefectMutation = useMutation({
    mutationFn: async (defectId: string) => {
      return await apiRequest(`/api/defects/${defectId}`, "DELETE", {});
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["/api/defects", { projectId: currentProject?.id }] });
      const Haptics = await getHaptics();
      await Haptics.impact({ style: ImpactStyle.Heavy });
    },
  });

  const handleResolve = (defect: Defect) => {
    const newStatus: DefectStatus = defect.status === "resolved" ? "open" : "resolved";
    updateStatusMutation.mutate({ defectId: defect.id, status: newStatus });
  };

  const filteredDefects = defects
    .filter((defect) => {
      const matchesSearch = defect.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        defect.description?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === "all" || defect.status === statusFilter;
      return matchesSearch && matchesStatus;
    })
    .sort((a, b) => {
      // Sort by priority, then by date
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      const aPriority = priorityOrder[a.priority as DefectPriority] ?? 2;
      const bPriority = priorityOrder[b.priority as DefectPriority] ?? 2;
      if (aPriority !== bPriority) return aPriority - bPriority;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

  const statusCounts = {
    all: defects.length,
    open: defects.filter((d) => d.status === "open").length,
    in_progress: defects.filter((d) => d.status === "in_progress").length,
    resolved: defects.filter((d) => d.status === "resolved").length,
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "critical": return "bg-red-500 text-white";
      case "high": return "bg-orange-500 text-white";
      case "medium": return "bg-yellow-500 text-white";
      case "low": return "bg-green-500 text-white";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "open": return "bg-red-100 text-red-800";
      case "in_progress": return "bg-blue-100 text-blue-800";
      case "resolved": return "bg-green-100 text-green-800";
      case "closed": return "bg-gray-100 text-gray-800";
      default: return "bg-muted text-muted-foreground";
    }
  };

  return (
    <div className="flex flex-col h-full relative">
      <PullToRefreshIndicator {...pullToRefresh} />
      
      <div className="p-4 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search defects..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-9 pl-9 pr-3 bg-background border rounded-lg text-sm"
            data-testid="input-search-defects"
          />
        </div>

        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-1">
          {(["all", "open", "in_progress", "resolved"] as const).map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`h-6 px-2.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
                statusFilter === status
                  ? "bg-[#bba7db] text-white"
                  : "bg-muted text-muted-foreground hover-elevate"
              }`}
              data-testid={`filter-${status}`}
            >
              {status === "all" ? "All" : status === "in_progress" ? "In Progress" : status.charAt(0).toUpperCase() + status.slice(1)} ({statusCounts[status as keyof typeof statusCounts] || 0})
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4" {...pullToRefresh.touchHandlers}>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : filteredDefects.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">No defects found</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredDefects.map((defect) => (
              <SwipeableCard
                key={defect.id}
                onSwipeRight={() => handleResolve(defect)}
                onSwipeLeft={() => deleteDefectMutation.mutate(defect.id)}
                leftAction={{
                  icon: <Check className="w-5 h-5" />,
                  color: "bg-green-500",
                  label: defect.status === "resolved" ? "Reopen" : "Resolve",
                }}
                rightAction={{
                  icon: <Trash2 className="w-5 h-5" />,
                  color: "bg-red-500",
                  label: "Delete",
                }}
              >
                <div
                  onClick={() => {
                    setSelectedDefect(defect);
                    setIsDetailOpen(true);
                  }}
                  className={`p-3 bg-card border rounded-lg ${defect.status === "resolved" ? "opacity-60" : ""}`}
                  data-testid={`defect-card-${defect.id}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {defect.priority === "critical" && (
                          <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
                        )}
                        <h3 className={`font-medium truncate ${defect.status === "resolved" ? "line-through" : ""}`}>
                          {defect.title}
                        </h3>
                      </div>
                      {defect.location && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                          <MapPin className="w-3 h-3" />
                          <span>{defect.location}</span>
                        </div>
                      )}
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded ${getPriorityColor(defect.priority)}`}>
                      {defect.priority}
                    </span>
                  </div>
                  
                  {defect.description && (
                    <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                      {defect.description}
                    </p>
                  )}

                  <div className="flex items-center justify-between mt-2">
                    <span className={`text-xs px-2 py-0.5 rounded ${getStatusColor(defect.status)}`}>
                      {defect.status === "in_progress" ? "In Progress" : defect.status}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(defect.dateIdentified), "MMM d")}
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
        data-testid="button-add-defect"
      >
        <Plus className="w-6 h-6" />
      </button>

      {/* Add Defect Sheet */}
      <BottomSheet isOpen={isAddOpen} onClose={() => setIsAddOpen(false)}>
        <div className="p-4">
          <h2 className="text-xl font-bold mb-6">Report Defect</h2>
          
          <div className="space-y-4">
            <MobileInput
              label="Title"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="What's the issue?"
              data-testid="input-defect-title"
            />

            <MobileInput
              label="Location"
              value={newLocation}
              onChange={(e) => setNewLocation(e.target.value)}
              placeholder="Where is the defect?"
              data-testid="input-defect-location"
            />

            <div>
              <label className="block text-sm font-medium mb-2">Priority</label>
              <div className="flex gap-2">
                {(["low", "medium", "high", "critical"] as DefectPriority[]).map((priority) => (
                  <button
                    key={priority}
                    onClick={() => setNewPriority(priority)}
                    className={`flex-1 h-8 rounded-md text-xs font-medium ${
                      newPriority === priority
                        ? getPriorityColor(priority)
                        : "border hover-elevate"
                    }`}
                    data-testid={`priority-select-${priority}`}
                  >
                    {priority.charAt(0).toUpperCase() + priority.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Type</label>
              <div className="flex flex-wrap gap-2">
                {["builder", "subcontractor", "client", "warranty"].map((type) => (
                  <button
                    key={type}
                    onClick={() => setNewType(type)}
                    className={`h-8 px-3 rounded-md text-sm font-medium ${
                      newType === type
                        ? "bg-[#bba7db] text-white"
                        : "border hover-elevate"
                    }`}
                    data-testid={`type-select-${type}`}
                  >
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <MobileTextarea
              label="Description"
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder="Describe the defect..."
              rows={3}
              data-testid="textarea-defect-description"
            />

            <div className="flex gap-3 pt-4">
              <MobileButton
                variant="outline"
                onClick={() => setIsAddOpen(false)}
                className="flex-1"
                data-testid="button-cancel-defect"
              >
                Cancel
              </MobileButton>
              <MobileButton
                onClick={() => createDefectMutation.mutate({
                  title: newTitle,
                  description: newDescription,
                  location: newLocation,
                  priority: newPriority,
                  type: newType,
                })}
                disabled={!newTitle || createDefectMutation.isPending}
                className="flex-1"
                data-testid="button-save-defect"
              >
                {createDefectMutation.isPending ? "Adding..." : "Report Defect"}
              </MobileButton>
            </div>
          </div>
        </div>
      </BottomSheet>

      {/* Detail Sheet */}
      <BottomSheet isOpen={isDetailOpen} onClose={() => setIsDetailOpen(false)}>
        {selectedDefect && (
          <div className="p-4">
            <div className="flex items-center gap-2 mb-2">
              {selectedDefect.priority === "critical" && (
                <AlertTriangle className="w-5 h-5 text-red-500" />
              )}
              <h2 className="text-xl font-bold">{selectedDefect.title}</h2>
            </div>
            
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <span className={`text-xs px-2 py-1 rounded ${getPriorityColor(selectedDefect.priority)}`}>
                {selectedDefect.priority}
              </span>
              <span className={`text-xs px-2 py-1 rounded ${getStatusColor(selectedDefect.status)}`}>
                {selectedDefect.status === "in_progress" ? "In Progress" : selectedDefect.status}
              </span>
              <span className="text-xs bg-muted px-2 py-1 rounded">
                {selectedDefect.type}
              </span>
            </div>

            {selectedDefect.location && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
                <MapPin className="w-4 h-4" />
                <span>{selectedDefect.location}</span>
              </div>
            )}
            
            {selectedDefect.description && (
              <p className="text-muted-foreground mb-4 whitespace-pre-wrap">
                {selectedDefect.description}
              </p>
            )}

            <div className="space-y-2 text-sm border-t pt-4">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Identified:</span>
                <span>{format(new Date(selectedDefect.dateIdentified), "MMM d, yyyy")}</span>
              </div>
              {selectedDefect.dueDate && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Due:</span>
                  <span>{format(new Date(selectedDefect.dueDate), "MMM d, yyyy")}</span>
                </div>
              )}
              {selectedDefect.assignedContactName && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Assigned:</span>
                  <span>{selectedDefect.assignedContactName}</span>
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-6">
              <MobileButton
                variant="outline"
                onClick={() => handleResolve(selectedDefect)}
                className="flex-1"
                data-testid="button-toggle-resolve"
              >
                {selectedDefect.status === "resolved" ? "Reopen" : "Mark Resolved"}
              </MobileButton>
              <MobileButton
                onClick={() => setIsDetailOpen(false)}
                className="flex-1"
                data-testid="button-close-defect-detail"
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
