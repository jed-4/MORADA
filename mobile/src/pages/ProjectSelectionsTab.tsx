import { useProject } from "@/contexts/ProjectContext";
import { useQuery, useMutation } from "@tanstack/react-query";
import type { Selection } from "@shared/schema";
import { useState } from "react";
import { Plus, Search, Loader2, Calendar, DollarSign, MapPin, Tag, ChevronRight, Edit2, Trash2 } from "lucide-react";
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

const statusOptions = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "declined", label: "Declined" },
];

const statusColors: Record<string, { bg: string; text: string }> = {
  draft: { bg: "bg-gray-100 dark:bg-gray-800", text: "text-gray-600 dark:text-gray-400" },
  pending: { bg: "bg-amber-100 dark:bg-amber-900/30", text: "text-amber-700 dark:text-amber-400" },
  approved: { bg: "bg-green-100 dark:bg-green-900/30", text: "text-green-700 dark:text-green-400" },
  declined: { bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-700 dark:text-red-400" },
};

export function ProjectSelectionsTab() {
  const { currentProject } = useProject();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedSelection, setSelectedSelection] = useState<Selection | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // Form state
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formCategory, setFormCategory] = useState("");
  const [formRoom, setFormRoom] = useState("");
  const [formStatus, setFormStatus] = useState("draft");
  const [formAllowance, setFormAllowance] = useState("");

  const { data: selections = [], isLoading, refetch } = useQuery<Selection[]>({
    queryKey: ["/api/selections", { projectId: currentProject?.id }],
    queryFn: async () => {
      const baseUrl = getApiBaseUrl();
      const res = await fetch(`${baseUrl}/api/selections?projectId=${currentProject?.id}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch selections");
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

  const createSelectionMutation = useMutation({
    mutationFn: async (data: Partial<Selection>) => {
      return await apiRequest(`/api/selections`, "POST", {
        ...data,
        projectId: currentProject?.id,
      });
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["/api/selections", { projectId: currentProject?.id }] });
      const Haptics = await getHaptics();
      await Haptics.impact({ style: ImpactStyle.Medium });
      closeAddSheet();
    },
  });

  const updateSelectionMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Selection> }) => {
      return await apiRequest(`/api/selections/${id}`, "PATCH", data);
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["/api/selections", { projectId: currentProject?.id }] });
      const Haptics = await getHaptics();
      await Haptics.impact({ style: ImpactStyle.Medium });
      closeAddSheet();
      setIsDetailOpen(false);
    },
  });

  const deleteSelectionMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/selections/${id}`, "DELETE", {});
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["/api/selections", { projectId: currentProject?.id }] });
      const Haptics = await getHaptics();
      await Haptics.impact({ style: ImpactStyle.Heavy });
      setIsDetailOpen(false);
      setSelectedSelection(null);
    },
  });

  const resetForm = () => {
    setFormName("");
    setFormDescription("");
    setFormCategory("");
    setFormRoom("");
    setFormStatus("draft");
    setFormAllowance("");
    setIsEditing(false);
  };

  const closeAddSheet = () => {
    setIsAddOpen(false);
    resetForm();
  };

  const openEditSheet = (selection: Selection) => {
    setFormName(selection.name);
    setFormDescription(selection.description || "");
    setFormCategory(selection.category || "");
    setFormRoom(selection.room || "");
    setFormStatus(selection.status);
    setFormAllowance(selection.allowance != null ? (selection.allowance / 100).toString() : "");
    setIsEditing(true);
    setIsAddOpen(true);
  };

  const handleSubmit = () => {
    // Parse allowance - handle empty string vs $0 properly
    let allowanceInCents: number | undefined = undefined;
    if (formAllowance !== "") {
      const parsed = parseFloat(formAllowance);
      if (!isNaN(parsed)) {
        allowanceInCents = Math.round(parsed * 100);
      }
    }
    
    const data = {
      name: formName,
      description: formDescription || undefined,
      category: formCategory || undefined,
      room: formRoom || undefined,
      status: formStatus,
      allowance: allowanceInCents,
    };

    if (isEditing && selectedSelection) {
      updateSelectionMutation.mutate({ id: selectedSelection.id, data });
    } else {
      createSelectionMutation.mutate(data);
    }
  };

  const handleStatusChange = (selection: Selection, newStatus: string) => {
    updateSelectionMutation.mutate({ id: selection.id, data: { status: newStatus } });
  };

  // Filter to only show "selection" type items (not "design" items) and apply search/status filters
  const projectSelections = selections.filter((s) => (s as any).selectionType === "selection" || !(s as any).selectionType);
  
  const filteredSelections = projectSelections.filter((selection) => {
    const matchesSearch = 
      selection.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      selection.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      selection.category?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || selection.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Status counts (based on filtered projectSelections, not all selections)
  const statusCounts: Record<string, number> = {
    all: projectSelections.length,
    draft: projectSelections.filter((s) => s.status === "draft").length,
    pending: projectSelections.filter((s) => s.status === "pending").length,
    approved: projectSelections.filter((s) => s.status === "approved").length,
    declined: projectSelections.filter((s) => s.status === "declined").length,
  };

  // Format currency - show cents when present, handle $0 allowance
  const formatCurrency = (cents: number | null | undefined) => {
    if (cents === null || cents === undefined) return null;
    const dollars = cents / 100;
    const hasCents = cents % 100 !== 0;
    return new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: "AUD",
      minimumFractionDigits: hasCents ? 2 : 0,
      maximumFractionDigits: 2,
    }).format(dollars);
  };

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
      
      {/* Search and Filters */}
      <div className="p-4 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search selections..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-9 pl-9 pr-3 bg-background border rounded-lg text-sm"
            data-testid="input-search-selections"
          />
        </div>

        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-1">
          {statusOptions.map((status) => (
            <button
              key={status.value}
              onClick={() => setStatusFilter(status.value)}
              className={`h-6 px-2.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
                statusFilter === status.value
                  ? "bg-[#bba7db] text-white"
                  : "bg-muted text-muted-foreground hover-elevate"
              }`}
              data-testid={`filter-${status.value}`}
            >
              {status.label} ({statusCounts[status.value]})
            </button>
          ))}
        </div>
      </div>

      {/* Selection List */}
      <div className="flex-1 overflow-y-auto px-4 pb-4" {...pullToRefresh.touchHandlers}>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : projectSelections.length === 0 ? (
          <div className="text-center py-16 px-6">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[#bba7db]/10 flex items-center justify-center">
              <Plus className="w-8 h-8 text-[#bba7db]" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No Selections Yet</h3>
            <p className="text-muted-foreground text-sm mb-6">
              Track client selections for fixtures, finishes, and fittings.
            </p>
            <button
              onClick={() => setIsAddOpen(true)}
              className="inline-flex items-center gap-2 bg-[#bba7db] text-white px-4 py-2 rounded-lg font-medium"
              data-testid="button-add-first-selection"
            >
              <Plus className="w-4 h-4" />
              Add First Selection
            </button>
          </div>
        ) : filteredSelections.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">No matching selections found</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredSelections.map((selection) => (
              <div
                key={selection.id}
                onClick={() => {
                  setSelectedSelection(selection);
                  setIsDetailOpen(true);
                }}
                className="p-3 bg-card border rounded-lg cursor-pointer hover-elevate active-elevate-2"
                data-testid={`selection-card-${selection.id}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium truncate">{selection.name}</h3>
                    {selection.description && (
                      <p className="text-sm text-muted-foreground mt-0.5 line-clamp-1">
                        {selection.description}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`h-6 px-2 flex items-center justify-center rounded-md text-xs font-medium ${statusColors[selection.status]?.bg || "bg-muted"} ${statusColors[selection.status]?.text || "text-muted-foreground"}`}>
                      {selection.status.charAt(0).toUpperCase() + selection.status.slice(1)}
                    </span>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                </div>
                
                <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                  {selection.allowance != null && (
                    <span className="flex items-center gap-1">
                      <DollarSign className="w-3 h-3" />
                      {formatCurrency(selection.allowance)}
                    </span>
                  )}
                  {selection.category && (
                    <span className="flex items-center gap-1">
                      <Tag className="w-3 h-3" />
                      {selection.category}
                    </span>
                  )}
                  {selection.room && (
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      {selection.room}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* FAB */}
      <button
        onClick={() => setIsAddOpen(true)}
        className="absolute bottom-6 right-6 w-14 h-14 bg-[#bba7db] text-white rounded-full shadow-lg flex items-center justify-center z-50"
        data-testid="button-add-selection"
      >
        <Plus className="w-6 h-6" />
      </button>

      {/* Detail Sheet */}
      <BottomSheet isOpen={isDetailOpen} onClose={() => setIsDetailOpen(false)}>
        {selectedSelection && (
          <div className="p-4">
            <div className="flex items-start justify-between gap-2 mb-4">
              <div>
                <h2 className="text-xl font-bold">{selectedSelection.name}</h2>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`h-6 px-2 flex items-center justify-center rounded-md text-xs font-medium ${statusColors[selectedSelection.status]?.bg || "bg-muted"} ${statusColors[selectedSelection.status]?.text || "text-muted-foreground"}`}>
                    {selectedSelection.status.charAt(0).toUpperCase() + selectedSelection.status.slice(1)}
                  </span>
                </div>
              </div>
            </div>
            
            {selectedSelection.description && (
              <div className="mb-4">
                <p className="text-sm text-muted-foreground">{selectedSelection.description}</p>
              </div>
            )}

            {/* Details Grid */}
            <div className="grid grid-cols-2 gap-3 mb-6">
              {selectedSelection.allowance != null && (
                <div className="p-3 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <DollarSign className="w-4 h-4" />
                    <span className="text-xs font-medium">Allowance</span>
                  </div>
                  <p className="font-semibold">{formatCurrency(selectedSelection.allowance)}</p>
                </div>
              )}
              {selectedSelection.category && (
                <div className="p-3 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <Tag className="w-4 h-4" />
                    <span className="text-xs font-medium">Category</span>
                  </div>
                  <p className="font-semibold">{selectedSelection.category}</p>
                </div>
              )}
              {selectedSelection.room && (
                <div className="p-3 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <MapPin className="w-4 h-4" />
                    <span className="text-xs font-medium">Location</span>
                  </div>
                  <p className="font-semibold">{selectedSelection.room}</p>
                </div>
              )}
              {selectedSelection.deadline && (
                <div className="p-3 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <Calendar className="w-4 h-4" />
                    <span className="text-xs font-medium">Deadline</span>
                  </div>
                  <p className="font-semibold">{format(new Date(selectedSelection.deadline), "MMM d, yyyy")}</p>
                </div>
              )}
            </div>

            {/* Status Picker */}
            <div className="mb-6">
              <label className="block text-sm font-medium mb-2">Change Status</label>
              <div className="flex flex-wrap gap-2">
                {statusOptions.filter(s => s.value !== "all").map((status) => (
                  <button
                    key={status.value}
                    onClick={() => handleStatusChange(selectedSelection, status.value)}
                    disabled={updateSelectionMutation.isPending}
                    className={`h-8 px-3 rounded-md text-sm font-medium transition-colors ${
                      selectedSelection.status === status.value
                        ? "bg-[#bba7db] text-white"
                        : "border hover-elevate"
                    }`}
                    data-testid={`status-select-${status.value}`}
                  >
                    {status.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <MobileButton
                variant="outline"
                onClick={() => {
                  openEditSheet(selectedSelection);
                  setIsDetailOpen(false);
                }}
                className="flex-1"
                data-testid="button-edit-selection"
              >
                <Edit2 className="w-4 h-4 mr-2" />
                Edit
              </MobileButton>
              <MobileButton
                variant="outline"
                onClick={() => {
                  if (confirm("Are you sure you want to delete this selection?")) {
                    deleteSelectionMutation.mutate(selectedSelection.id);
                  }
                }}
                className="flex-1 text-red-600 border-red-200 hover:bg-red-50"
                disabled={deleteSelectionMutation.isPending}
                data-testid="button-delete-selection"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </MobileButton>
            </div>
          </div>
        )}
      </BottomSheet>

      {/* Add/Edit Sheet */}
      <BottomSheet isOpen={isAddOpen} onClose={closeAddSheet}>
        <div className="p-4">
          <h2 className="text-xl font-bold mb-6">{isEditing ? "Edit Selection" : "Add Selection"}</h2>
          
          <div className="space-y-4">
            <MobileInput
              label="Name"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="e.g., Kitchen Splashback Tiles"
              data-testid="input-selection-name"
            />

            <MobileTextarea
              label="Description"
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
              placeholder="Enter description..."
              rows={3}
              data-testid="textarea-selection-description"
            />

            <div className="grid grid-cols-2 gap-3">
              <MobileInput
                label="Category"
                value={formCategory}
                onChange={(e) => setFormCategory(e.target.value)}
                placeholder="e.g., Tiles"
                data-testid="input-selection-category"
              />
              <MobileInput
                label="Location/Room"
                value={formRoom}
                onChange={(e) => setFormRoom(e.target.value)}
                placeholder="e.g., Kitchen"
                data-testid="input-selection-room"
              />
            </div>

            <MobileInput
              label="Allowance ($)"
              value={formAllowance}
              onChange={(e) => setFormAllowance(e.target.value)}
              placeholder="0.00"
              type="number"
              data-testid="input-selection-allowance"
            />

            <div>
              <label className="block text-sm font-medium mb-2">Status</label>
              <div className="flex flex-wrap gap-2">
                {statusOptions.filter(s => s.value !== "all").map((status) => (
                  <button
                    key={status.value}
                    onClick={() => setFormStatus(status.value)}
                    className={`h-8 px-3 rounded-md text-sm font-medium ${
                      formStatus === status.value
                        ? "bg-[#bba7db] text-white"
                        : "border hover-elevate"
                    }`}
                    data-testid={`form-status-${status.value}`}
                  >
                    {status.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <MobileButton
                variant="outline"
                onClick={closeAddSheet}
                className="flex-1"
                data-testid="button-cancel-selection"
              >
                Cancel
              </MobileButton>
              <MobileButton
                onClick={handleSubmit}
                disabled={!formName || createSelectionMutation.isPending || updateSelectionMutation.isPending}
                className="flex-1"
                data-testid="button-save-selection"
              >
                {(createSelectionMutation.isPending || updateSelectionMutation.isPending) 
                  ? "Saving..." 
                  : isEditing ? "Save Changes" : "Add Selection"
                }
              </MobileButton>
            </div>
          </div>
        </div>
      </BottomSheet>
    </div>
  );
}
