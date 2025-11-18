import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus, MoreVertical, Edit, Trash2, Star } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export interface TaskViewFilters {
  status?: string[];
  priority?: string[];
  assignee?: string[];
  labels?: string[];
  search?: string;
}

export interface TaskView {
  id: string;
  userId: string;
  companyId: string;
  name: string;
  viewType: "board" | "list" | "calendar";
  filters: TaskViewFilters;
  groupBy: "none" | "status" | "priority" | "assignee";
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

interface TaskViewsManagerProps {
  currentViewType: "board" | "list" | "calendar";
  currentFilters: TaskViewFilters;
  currentGroupBy: "none" | "status" | "priority" | "assignee";
  onViewSelect: (view: TaskView) => void;
  selectedViewId?: string;
}

export default function TaskViewsManager({
  currentViewType,
  currentFilters,
  currentGroupBy,
  onViewSelect,
  selectedViewId,
}: TaskViewsManagerProps) {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedView, setSelectedView] = useState<TaskView | null>(null);
  const [viewName, setViewName] = useState("");
  const { toast } = useToast();

  const { data: views = [], isLoading } = useQuery({
    queryKey: ["/api/task-views"],
    queryFn: async () => {
      return await apiRequest("/api/task-views", "GET");
    },
  });

  const createViewMutation = useMutation({
    mutationFn: async (data: { 
      name: string; 
      viewType: string;
      filters: TaskViewFilters; 
      groupBy: string;
      isDefault: boolean 
    }) => {
      return await apiRequest("/api/task-views", "POST", data);
    },
    onSuccess: (newView) => {
      queryClient.invalidateQueries({ queryKey: ["/api/task-views"] });
      toast({ title: "View created successfully" });
      setCreateDialogOpen(false);
      setViewName("");
      onViewSelect(newView);
    },
    onError: () => {
      toast({ title: "Failed to create view", variant: "destructive" });
    },
  });

  const updateViewMutation = useMutation({
    mutationFn: async (data: { 
      id: string; 
      name: string; 
      viewType: string;
      filters: TaskViewFilters; 
      groupBy: string;
    }) => {
      return await apiRequest(`/api/task-views/${data.id}`, "PATCH", {
        name: data.name,
        viewType: data.viewType,
        filters: data.filters,
        groupBy: data.groupBy,
      });
    },
    onSuccess: (updatedView) => {
      queryClient.invalidateQueries({ queryKey: ["/api/task-views"] });
      toast({ title: "View updated successfully" });
      setEditDialogOpen(false);
      setViewName("");
      setSelectedView(null);
      onViewSelect(updatedView);
    },
    onError: () => {
      toast({ title: "Failed to update view", variant: "destructive" });
    },
  });

  const deleteViewMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest(`/api/task-views/${id}`, "DELETE");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/task-views"] });
      toast({ title: "View deleted successfully" });
      setDeleteDialogOpen(false);
      setSelectedView(null);
      
      const defaultView = views.find(v => v.isDefault);
      if (defaultView && defaultView.id !== selectedView?.id) {
        onViewSelect(defaultView);
      }
    },
    onError: () => {
      toast({ title: "Failed to delete view", variant: "destructive" });
    },
  });

  const handleCreateView = () => {
    if (!viewName.trim()) {
      toast({ title: "Please enter a view name", variant: "destructive" });
      return;
    }
    
    const isFirstView = views.length === 0;
    createViewMutation.mutate({
      name: viewName,
      viewType: currentViewType,
      filters: currentFilters,
      groupBy: currentGroupBy,
      isDefault: isFirstView,
    });
  };

  const handleUpdateView = () => {
    if (!selectedView || !viewName.trim()) {
      toast({ title: "Please enter a view name", variant: "destructive" });
      return;
    }
    
    updateViewMutation.mutate({
      id: selectedView.id,
      name: viewName,
      viewType: currentViewType,
      filters: currentFilters,
      groupBy: currentGroupBy,
    });
  };

  const handleEditClick = (view: TaskView) => {
    setSelectedView(view);
    setViewName(view.name);
    setEditDialogOpen(true);
  };

  const handleDeleteClick = (view: TaskView) => {
    setSelectedView(view);
    setDeleteDialogOpen(true);
  };

  const handleViewChange = (viewId: string) => {
    const view = views.find(v => v.id === viewId);
    if (view) {
      onViewSelect(view);
    }
  };

  const currentView = views.find(v => v.id === selectedViewId);
  const activeFilterCount = Object.keys(currentFilters).filter(key => {
    const value = currentFilters[key as keyof TaskViewFilters];
    return value && (Array.isArray(value) ? value.length > 0 : true);
  }).length;

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading views...</div>;
  }

  return (
    <div className="flex items-center gap-1.5">
      {views.length > 0 && (
        <>
          <Select value={selectedViewId} onValueChange={handleViewChange}>
            <SelectTrigger className="h-6 w-auto min-w-32 text-xs border rounded-md hover-elevate active-elevate-2" data-testid="select-task-view">
              <SelectValue placeholder="Select a view">
                <div className="flex items-center gap-1">
                  {currentView?.isDefault && <Star className="h-3 w-3 fill-current" />}
                  <span className="text-xs">{currentView?.name || "Select a view"}</span>
                </div>
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {views.map((view: TaskView) => (
                <SelectItem key={view.id} value={view.id}>
                  <div className="flex items-center gap-2">
                    {view.isDefault && <Star className="h-3 w-3 fill-current" />}
                    {view.name}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {currentView && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button 
                  className="h-6 w-6 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center justify-center"
                  data-testid="button-view-actions"
                >
                  <MoreVertical className="h-3 w-3" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleEditClick(currentView)} data-testid="button-edit-view">
                  <Edit className="h-4 w-4 mr-2" />
                  Update View
                </DropdownMenuItem>
                {!currentView.isDefault && (
                  <DropdownMenuItem 
                    onClick={() => handleDeleteClick(currentView)}
                    className="text-destructive"
                    data-testid="button-delete-view"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete View
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </>
      )}

      <button 
        className="h-6 w-auto px-2 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-1"
        onClick={() => {
          setViewName("");
          setCreateDialogOpen(true);
        }}
        data-testid="button-create-view"
      >
        <Plus className="h-3 w-3" />
        <span>Save View</span>
      </button>

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent data-testid="dialog-create-view">
          <DialogHeader>
            <DialogTitle>Save Current View</DialogTitle>
            <DialogDescription>
              Save your current filter settings and grouping as a new view.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="view-name">View Name</Label>
              <Input
                id="view-name"
                placeholder="e.g., My High Priority Tasks"
                value={viewName}
                onChange={(e) => setViewName(e.target.value)}
                data-testid="input-view-name"
              />
            </div>
            <div className="space-y-2">
              <Label>Current Settings</Label>
              <div className="text-sm text-muted-foreground space-y-1">
                <div>View Type: <Badge variant="secondary">{currentViewType}</Badge></div>
                {currentGroupBy !== "none" && (
                  <div>Group By: <Badge variant="secondary">{currentGroupBy}</Badge></div>
                )}
                {activeFilterCount > 0 ? (
                  <div>Active Filters: <Badge variant="secondary">{activeFilterCount}</Badge></div>
                ) : (
                  <div>No filters applied</div>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setCreateDialogOpen(false)}
              data-testid="button-cancel-create-view"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleCreateView}
              disabled={createViewMutation.isPending}
              data-testid="button-confirm-create-view"
            >
              {createViewMutation.isPending ? "Saving..." : "Save View"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent data-testid="dialog-edit-view">
          <DialogHeader>
            <DialogTitle>Update View</DialogTitle>
            <DialogDescription>
              Update this view with your current filter settings and grouping.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-view-name">View Name</Label>
              <Input
                id="edit-view-name"
                placeholder="e.g., My High Priority Tasks"
                value={viewName}
                onChange={(e) => setViewName(e.target.value)}
                data-testid="input-edit-view-name"
              />
            </div>
            <div className="space-y-2">
              <Label>Current Settings</Label>
              <div className="text-sm text-muted-foreground space-y-1">
                <div>View Type: <Badge variant="secondary">{currentViewType}</Badge></div>
                {currentGroupBy !== "none" && (
                  <div>Group By: <Badge variant="secondary">{currentGroupBy}</Badge></div>
                )}
                {activeFilterCount > 0 ? (
                  <div>Active Filters: <Badge variant="secondary">{activeFilterCount}</Badge></div>
                ) : (
                  <div>No filters applied</div>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setEditDialogOpen(false)}
              data-testid="button-cancel-edit-view"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleUpdateView}
              disabled={updateViewMutation.isPending}
              data-testid="button-confirm-edit-view"
            >
              {updateViewMutation.isPending ? "Updating..." : "Update View"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent data-testid="dialog-delete-view">
          <DialogHeader>
            <DialogTitle>Delete View</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{selectedView?.name}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setDeleteDialogOpen(false)}
              data-testid="button-cancel-delete-view"
            >
              Cancel
            </Button>
            <Button 
              variant="destructive"
              onClick={() => selectedView && deleteViewMutation.mutate(selectedView.id)}
              disabled={deleteViewMutation.isPending}
              data-testid="button-confirm-delete-view"
            >
              {deleteViewMutation.isPending ? "Deleting..." : "Delete View"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
