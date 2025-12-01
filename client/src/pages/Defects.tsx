import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { 
  Plus, 
  LayoutList, 
  Columns3, 
  Search, 
  MoreVertical, 
  Pencil, 
  Trash2,
  MapPin,
  Wrench,
  Clock
} from "lucide-react";
import type { Defect } from "@shared/schema";
import { DefectFormDialog } from "@/components/defects/DefectFormDialog";
import { DefectBoardView } from "@/components/defects/DefectBoardView";
import { useDefectStatusOptions } from "@/hooks/useDefectStatusOptions";
import { useDefectPriorityOptions } from "@/hooks/useDefectPriorityOptions";
import { useDefectTypeOptions } from "@/hooks/useDefectTypeOptions";
import { useDefectTradeOptions } from "@/hooks/useDefectTradeOptions";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { format } from "date-fns";

export default function Defects() {
  const { projectId } = useParams<{ projectId: string }>();
  const { toast } = useToast();
  const [currentView, setCurrentView] = useState<"list" | "kanban">("list");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("All");
  const [selectedPriority, setSelectedPriority] = useState("All");
  const [editingDefect, setEditingDefect] = useState<Defect | null>(null);
  const [deletingDefect, setDeletingDefect] = useState<Defect | null>(null);

  const { statusOptions } = useDefectStatusOptions();
  const { priorityOptions } = useDefectPriorityOptions();
  const { typeOptions } = useDefectTypeOptions();
  const tradeOptions = useDefectTradeOptions();

  const { data: defects = [], isLoading } = useQuery<Defect[]>({
    queryKey: ["/api/defects", projectId],
    queryFn: async () => {
      const url = projectId 
        ? `/api/defects?projectId=${projectId}` 
        : "/api/defects";
      const response = await fetch(url);
      if (!response.ok) throw new Error("Failed to fetch defects");
      return response.json();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/defects/${id}`, "DELETE", null);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/defects"] });
      toast({
        title: "Success",
        description: "Defect deleted successfully",
      });
      setDeletingDefect(null);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete defect",
        variant: "destructive",
      });
    },
  });

  const filteredDefects = defects.filter((defect) => {
    const matchesSearch = 
      defect.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      defect.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      defect.location?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = selectedStatus === "All" || defect.status === selectedStatus;
    const matchesPriority = selectedPriority === "All" || defect.priority === selectedPriority;
    return matchesSearch && matchesStatus && matchesPriority;
  });

  const getStatusInfo = (status: string) => {
    const option = statusOptions.find((o) => o.key === status);
    return {
      label: option?.name || status,
      color: option?.color || "6B7280",
    };
  };

  const getPriorityInfo = (priority: string) => {
    const option = priorityOptions.find((o) => o.key === priority);
    return {
      label: option?.name || priority,
      color: option?.color || "6B7280",
    };
  };

  const getTypeLabel = (type: string) => {
    const option = typeOptions.find((o) => o.key === type);
    return option?.name || type;
  };

  const getTradeLabel = (trade: string | null) => {
    if (!trade) return null;
    const option = tradeOptions.find((o: { value: string; label: string }) => o.value === trade);
    return option?.label || trade;
  };

  return (
    <div className="flex flex-col h-full">
      {/* Row 1 - Title & Actions (36px) */}
      <div className="h-9 bg-background flex items-center justify-between px-2 gap-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold" data-testid="text-page-title">
            Defects
          </h2>
          <Badge variant="secondary" className="text-xs" data-testid="text-defect-count">
            {filteredDefects.length} defects
          </Badge>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            className="h-6 w-auto px-2 text-xs border rounded-md bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90 active-elevate-2 flex items-center gap-0.5"
            onClick={() => setIsCreateDialogOpen(true)}
            data-testid="button-create-defect"
          >
            <Plus className="w-3 h-3" />
            <span>Add Defect</span>
          </button>
        </div>
      </div>

      {/* Row 2 - View Tabs & Filters (36px) */}
      <div className="h-9 bg-background flex items-center justify-between px-2 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-1.5">
          {/* View Tabs */}
          <button
            onClick={() => setCurrentView('list')}
            className={`h-6 w-auto px-2 text-xs border rounded-md ${
              currentView === 'list' 
                ? 'bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90' 
                : 'hover-elevate'
            } active-elevate-2 flex items-center gap-1`}
            data-testid="button-list-view"
          >
            <LayoutList className="w-3 h-3" />
            <span>List</span>
          </button>
          <button
            onClick={() => setCurrentView('kanban')}
            className={`h-6 w-auto px-2 text-xs border rounded-md ${
              currentView === 'kanban' 
                ? 'bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90' 
                : 'hover-elevate'
            } active-elevate-2 flex items-center gap-1`}
            data-testid="button-kanban-view"
          >
            <Columns3 className="w-3 h-3" />
            <span>Kanban</span>
          </button>

          <div className="w-px h-4 bg-border mx-1" />

          {/* Search */}
          <div className="relative w-48">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
            <Input
              placeholder="Search defects..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-7 pr-2 py-0 h-6 text-xs border"
              data-testid="defects-search-input"
            />
          </div>

          {/* Status Filter */}
          <Popover>
            <PopoverTrigger asChild>
              <button 
                className="h-6 w-auto px-2 py-0 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-0.5"
                data-testid="filter-status-popover"
              >
                <span>Status</span>
                {selectedStatus !== "All" && (
                  <Badge variant="destructive" className="ml-1 h-3 w-3 p-0 text-[10px] flex items-center justify-center">
                    1
                  </Badge>
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-2" align="start">
              <div className="space-y-1">
                <button
                  onClick={() => setSelectedStatus("All")}
                  className={`w-full text-left px-2 py-1.5 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors ${
                    selectedStatus === "All" ? "bg-[#bba7db]/10 text-[#bba7db] font-medium" : ""
                  }`}
                  data-testid="filter-status-all"
                >
                  All Status
                </button>
                {statusOptions.map((status) => (
                  <button
                    key={status.key}
                    onClick={() => setSelectedStatus(status.key)}
                    className={`w-full text-left px-2 py-1.5 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors ${
                      selectedStatus === status.key ? "bg-[#bba7db]/10 text-[#bba7db] font-medium" : ""
                    }`}
                    data-testid={`filter-status-${status.key}`}
                  >
                    {status.name}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>

          {/* Priority Filter */}
          <Popover>
            <PopoverTrigger asChild>
              <button 
                className="h-6 w-auto px-2 py-0 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-0.5"
                data-testid="filter-priority-popover"
              >
                <span>Priority</span>
                {selectedPriority !== "All" && (
                  <Badge variant="destructive" className="ml-1 h-3 w-3 p-0 text-[10px] flex items-center justify-center">
                    1
                  </Badge>
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-2" align="start">
              <div className="space-y-1">
                <button
                  onClick={() => setSelectedPriority("All")}
                  className={`w-full text-left px-2 py-1.5 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors ${
                    selectedPriority === "All" ? "bg-[#bba7db]/10 text-[#bba7db] font-medium" : ""
                  }`}
                  data-testid="filter-priority-all"
                >
                  All Priorities
                </button>
                {priorityOptions.map((priority) => (
                  <button
                    key={priority.key}
                    onClick={() => setSelectedPriority(priority.key)}
                    className={`w-full text-left px-2 py-1.5 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors ${
                      selectedPriority === priority.key ? "bg-[#bba7db]/10 text-[#bba7db] font-medium" : ""
                    }`}
                    data-testid={`filter-priority-${priority.key}`}
                  >
                    {priority.name}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-2">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <p className="text-muted-foreground text-sm">Loading defects...</p>
          </div>
        ) : filteredDefects.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-4">
            <p className="text-muted-foreground text-sm">
              {defects.length === 0 ? "No defects found" : "No matching defects"}
            </p>
            {defects.length === 0 && (
              <button
                className="h-7 px-3 text-xs border rounded-md bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90 active-elevate-2 flex items-center gap-1"
                onClick={() => setIsCreateDialogOpen(true)}
                data-testid="button-add-first-defect"
              >
                <Plus className="w-3.5 h-3.5" />
                Add First Defect
              </button>
            )}
          </div>
        ) : currentView === "list" ? (
          /* Card-based List View with aligned columns */
          <div className="space-y-1">
            {filteredDefects.map((defect) => {
              const statusInfo = getStatusInfo(defect.status);
              const priorityInfo = getPriorityInfo(defect.priority);
              const tradeLabel = getTradeLabel(defect.trade);
              
              return (
                <div
                  key={defect.id}
                  className="group border rounded-md p-2 bg-card hover-elevate transition-all cursor-pointer"
                  data-testid={`defect-card-${defect.id}`}
                  onDoubleClick={() => setEditingDefect(defect)}
                >
                  <div className="flex items-center gap-3">
                    {/* Title and Description - flexible width */}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-sm line-clamp-1" data-testid={`defect-title-${defect.id}`}>
                        {defect.title}
                      </h3>
                      {defect.description && (
                        <p className="text-xs text-muted-foreground line-clamp-1">
                          {defect.description}
                        </p>
                      )}
                    </div>

                    {/* Fixed-width columns for metadata alignment */}
                    {/* Status Column */}
                    <div className="w-20 flex-shrink-0">
                      <Badge 
                        className="h-5 px-1.5 text-[10px] w-full justify-center"
                        style={{
                          backgroundColor: `#${statusInfo.color}`,
                          color: "#fff",
                        }}
                        data-testid={`defect-status-${defect.id}`}
                      >
                        {statusInfo.label}
                      </Badge>
                    </div>

                    {/* Priority Column - color coded, no icon */}
                    <div className="w-16 flex-shrink-0">
                      <Badge 
                        className="h-5 px-1.5 text-[10px] w-full justify-center"
                        style={{
                          backgroundColor: `#${priorityInfo.color}`,
                          color: "#fff",
                        }}
                        data-testid={`defect-priority-${defect.id}`}
                      >
                        {priorityInfo.label}
                      </Badge>
                    </div>

                    {/* Type Column */}
                    <div className="w-24 flex-shrink-0">
                      <Badge variant="secondary" className="h-5 px-1.5 text-[10px] w-full justify-center" data-testid={`defect-type-${defect.id}`}>
                        {getTypeLabel(defect.type)}
                      </Badge>
                    </div>

                    {/* Trade Column */}
                    <div className="w-24 flex-shrink-0">
                      {tradeLabel ? (
                        <Badge variant="outline" className="h-5 px-1.5 text-[10px] w-full justify-center" data-testid={`defect-trade-${defect.id}`}>
                          <Wrench className="w-2.5 h-2.5 mr-0.5" />
                          {tradeLabel}
                        </Badge>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">—</span>
                      )}
                    </div>

                    {/* Location Column */}
                    <div className="w-24 flex-shrink-0">
                      {defect.location ? (
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground" data-testid={`defect-location-${defect.id}`}>
                          <MapPin className="h-3 w-3 flex-shrink-0" />
                          <span className="truncate">{defect.location}</span>
                        </div>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">—</span>
                      )}
                    </div>

                    {/* Date Column */}
                    <div className="w-16 flex-shrink-0">
                      {defect.createdAt && (
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <Clock className="h-3 w-3 flex-shrink-0" />
                          <span>{format(new Date(defect.createdAt), "MMM d")}</span>
                        </div>
                      )}
                    </div>

                    {/* Actions Menu */}
                    <div className="w-6 flex-shrink-0">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            className="h-5 w-5 rounded hover:bg-muted flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={(e) => e.stopPropagation()}
                            data-testid={`defect-menu-${defect.id}`}
                          >
                            <MoreVertical className="h-3 w-3" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => setEditingDefect(defect)}
                            data-testid={`defect-edit-${defect.id}`}
                          >
                            <Pencil className="h-4 w-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => setDeletingDefect(defect)}
                            className="text-destructive"
                            data-testid={`defect-delete-${defect.id}`}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Kanban View */
          <DefectBoardView defects={filteredDefects} />
        )}
      </div>

      {/* Dialogs */}
      <DefectFormDialog
        open={isCreateDialogOpen || !!editingDefect}
        onOpenChange={(open) => {
          if (!open) {
            setIsCreateDialogOpen(false);
            setEditingDefect(null);
          }
        }}
        defect={editingDefect || undefined}
      />

      <AlertDialog
        open={!!deletingDefect}
        onOpenChange={(open) => !open && setDeletingDefect(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Defect</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deletingDefect?.title}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingDefect && deleteMutation.mutate(deletingDefect.id)}
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
