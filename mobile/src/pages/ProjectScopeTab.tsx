import { useProject } from "@/contexts/ProjectContext";
import { useQuery, useMutation } from "@tanstack/react-query";
import type { ScopeItem, ScopeStage } from "@shared/schema";
import { useState } from "react";
import { Plus, Search, Loader2, ChevronRight, ChevronDown, Check, Trash2 } from "lucide-react";
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

export function ProjectScopeTab() {
  const { currentProject } = useProject();
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedStages, setExpandedStages] = useState<Set<string>>(new Set());
  const [selectedItem, setSelectedItem] = useState<ScopeItem | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isAddOpen, setIsAddOpen] = useState(false);

  // Form state for new item
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newStage, setNewStage] = useState("Prelim");

  const { data: stages = [], isLoading: stagesLoading, refetch: refetchStages } = useQuery<ScopeStage[]>({
    queryKey: ["/api/projects", currentProject?.id, "scope-stages"],
    queryFn: async () => {
      const baseUrl = getApiBaseUrl();
      const res = await fetch(`${baseUrl}/api/projects/${currentProject?.id}/scope-stages`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch stages");
      return res.json();
    },
    enabled: !!currentProject?.id,
    retry: false,
  });

  const { data: items = [], isLoading: itemsLoading, refetch: refetchItems } = useQuery<ScopeItem[]>({
    queryKey: ["/api/projects", currentProject?.id, "scope"],
    queryFn: async () => {
      const baseUrl = getApiBaseUrl();
      const res = await fetch(`${baseUrl}/api/projects/${currentProject?.id}/scope`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch scope items");
      return res.json();
    },
    enabled: !!currentProject?.id,
    retry: false,
  });

  const pullToRefresh = usePullToRefresh({
    onRefresh: async () => {
      await Promise.all([refetchStages(), refetchItems()]);
    },
  });

  const createItemMutation = useMutation({
    mutationFn: async (data: { title: string; description: string; stage: string }) => {
      return await apiRequest(`/api/projects/${currentProject?.id}/scope`, "POST", data);
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", currentProject?.id, "scope"] });
      const Haptics = await getHaptics();
      await Haptics.impact({ style: ImpactStyle.Medium });
      setIsAddOpen(false);
      setNewTitle("");
      setNewDescription("");
      setNewStage("Prelim");
    },
  });

  const deleteItemMutation = useMutation({
    mutationFn: async (itemId: string) => {
      return await apiRequest(`/api/scope/${itemId}`, "DELETE", {});
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", currentProject?.id, "scope"] });
      const Haptics = await getHaptics();
      await Haptics.impact({ style: ImpactStyle.Heavy });
    },
  });

  const toggleStage = (stageId: string) => {
    setExpandedStages(prev => {
      const next = new Set(prev);
      if (next.has(stageId)) {
        next.delete(stageId);
      } else {
        next.add(stageId);
      }
      return next;
    });
  };

  // Group items by stage
  const itemsByStage = items.reduce((acc, item) => {
    const stage = item.stage || "Uncategorized";
    if (!acc[stage]) acc[stage] = [];
    acc[stage].push(item);
    return acc;
  }, {} as Record<string, ScopeItem[]>);

  // Get unique stage names from items (since stages table might be empty)
  const stageNames = Array.from(new Set(items.map(i => i.stage))).filter(Boolean);
  if (stageNames.length === 0) {
    stageNames.push("Prelim", "Frame", "Lockup", "Fixing", "Completion");
  }

  const filteredStageNames = stageNames.filter(stage => {
    const stageItems = itemsByStage[stage] || [];
    if (searchQuery) {
      return stageItems.some(item => 
        item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.description?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    return true;
  });

  const isLoading = stagesLoading || itemsLoading;

  if (!currentProject) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Please select a project</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full relative">
      <PullToRefreshIndicator {...pullToRefresh} />
      
      <div className="p-4 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search scope items..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-9 pl-9 pr-3 bg-background border rounded-lg text-sm"
            data-testid="input-search-scope"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4" {...pullToRefresh.touchHandlers}>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-16 px-6">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[#bba7db]/10 flex items-center justify-center">
              <Plus className="w-8 h-8 text-[#bba7db]" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No Scope Items Yet</h3>
            <p className="text-muted-foreground text-sm mb-6">
              Add scope items to track project requirements, selections, and specifications.
            </p>
            <button
              onClick={() => setIsAddOpen(true)}
              className="inline-flex items-center gap-2 bg-[#bba7db] text-white px-4 py-2 rounded-lg font-medium"
              data-testid="button-add-first-scope"
            >
              <Plus className="w-4 h-4" />
              Add First Scope Item
            </button>
          </div>
        ) : filteredStageNames.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">No matching items found</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredStageNames.map((stageName) => {
              const stageItems = (itemsByStage[stageName] || []).filter(item =>
                !searchQuery ||
                item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                item.description?.toLowerCase().includes(searchQuery.toLowerCase())
              );
              const isExpanded = expandedStages.has(stageName);

              return (
                <div key={stageName} className="bg-card border rounded-lg overflow-hidden">
                  <button
                    onClick={() => toggleStage(stageName)}
                    className="w-full flex items-center justify-between p-3 hover-elevate"
                    data-testid={`stage-${stageName}`}
                  >
                    <div className="flex items-center gap-2">
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      )}
                      <span className="font-medium">{stageName}</span>
                    </div>
                    <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                      {stageItems.length}
                    </span>
                  </button>

                  {isExpanded && stageItems.length > 0 && (
                    <div className="border-t">
                      {stageItems.map((item) => (
                        <SwipeableCard
                          key={item.id}
                          onSwipeLeft={() => deleteItemMutation.mutate(item.id)}
                          leftAction={{
                            icon: <Check className="w-5 h-5" />,
                            color: "bg-green-500",
                            label: "Done",
                          }}
                          rightAction={{
                            icon: <Trash2 className="w-5 h-5" />,
                            color: "bg-red-500",
                            label: "Delete",
                          }}
                        >
                          <div
                            onClick={() => {
                              setSelectedItem(item);
                              setIsDetailOpen(true);
                            }}
                            className="p-3 bg-background border-b last:border-b-0"
                            data-testid={`scope-item-${item.id}`}
                          >
                            <h4 className="font-medium text-sm">{item.title}</h4>
                            {item.description && (
                              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                {item.description}
                              </p>
                            )}
                            <div className="flex gap-2 mt-2">
                              {item.itemType && item.itemType !== "scope" && (
                                <span className="text-xs bg-muted px-2 py-0.5 rounded">
                                  {item.itemType}
                                </span>
                              )}
                              {item.needsRfi && (
                                <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded">
                                  RFI
                                </span>
                              )}
                              {item.needsRfq && (
                                <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
                                  RFQ
                                </span>
                              )}
                            </div>
                          </div>
                        </SwipeableCard>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <button
        onClick={() => setIsAddOpen(true)}
        className="absolute bottom-6 right-6 w-14 h-14 bg-[#bba7db] text-white rounded-full shadow-lg flex items-center justify-center"
        data-testid="button-add-scope"
      >
        <Plus className="w-6 h-6" />
      </button>

      {/* Add Scope Item Sheet */}
      <BottomSheet isOpen={isAddOpen} onClose={() => setIsAddOpen(false)}>
        <div className="p-4">
          <h2 className="text-xl font-bold mb-6">Add Scope Item</h2>
          
          <div className="space-y-4">
            <MobileInput
              label="Title"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Enter item title"
              data-testid="input-scope-title"
            />

            <div>
              <label className="block text-sm font-medium mb-2">Stage</label>
              <div className="flex flex-wrap gap-2">
                {["Prelim", "Frame", "Lockup", "Fixing", "Completion"].map((stage) => (
                  <button
                    key={stage}
                    onClick={() => setNewStage(stage)}
                    className={`h-8 px-3 rounded-md text-sm font-medium ${
                      newStage === stage
                        ? "bg-[#bba7db] text-white"
                        : "border hover-elevate"
                    }`}
                    data-testid={`stage-select-${stage}`}
                  >
                    {stage}
                  </button>
                ))}
              </div>
            </div>

            <MobileTextarea
              label="Description"
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder="Add description..."
              rows={3}
              data-testid="textarea-scope-description"
            />

            <div className="flex gap-3 pt-4">
              <MobileButton
                variant="outline"
                onClick={() => setIsAddOpen(false)}
                className="flex-1"
                data-testid="button-cancel-scope"
              >
                Cancel
              </MobileButton>
              <MobileButton
                onClick={() => createItemMutation.mutate({
                  title: newTitle,
                  description: newDescription,
                  stage: newStage,
                })}
                disabled={!newTitle || createItemMutation.isPending}
                className="flex-1"
                data-testid="button-save-scope"
              >
                {createItemMutation.isPending ? "Adding..." : "Add Item"}
              </MobileButton>
            </div>
          </div>
        </div>
      </BottomSheet>

      {/* Detail Sheet */}
      <BottomSheet isOpen={isDetailOpen} onClose={() => setIsDetailOpen(false)}>
        {selectedItem && (
          <div className="p-4">
            <h2 className="text-xl font-bold mb-2">{selectedItem.title}</h2>
            <span className="inline-block text-xs bg-muted px-2 py-1 rounded mb-4">
              {selectedItem.stage}
            </span>
            
            {selectedItem.description && (
              <p className="text-sm text-muted-foreground mb-4">
                {selectedItem.description}
              </p>
            )}

            <div className="space-y-3 text-sm">
              {selectedItem.costCodeTitle && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Cost Code:</span>
                  <span>{selectedItem.costCodeTitle}</span>
                </div>
              )}
              {selectedItem.itemType && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Type:</span>
                  <span className="capitalize">{selectedItem.itemType}</span>
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-6">
              <MobileButton
                variant="outline"
                onClick={() => setIsDetailOpen(false)}
                className="flex-1"
                data-testid="button-close-scope-detail"
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
