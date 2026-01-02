import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, Edit, Trash2, Star, Save, Plus } from "lucide-react";
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
  onViewDeselect?: () => void;
  selectedViewId?: string;
}

export default function TaskViewsManager({
  currentViewType,
  currentFilters,
  currentGroupBy,
  onViewSelect,
  onViewDeselect,
  selectedViewId,
}: TaskViewsManagerProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
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
      name?: string; 
      viewType?: string;
      filters?: TaskViewFilters; 
      groupBy?: string;
    }) => {
      const { id, ...updateData } = data;
      return await apiRequest(`/api/task-views/${id}`, "PATCH", updateData);
    },
    onSuccess: (updatedView) => {
      queryClient.invalidateQueries({ queryKey: ["/api/task-views"] });
      toast({ title: "View updated successfully" });
      setRenameDialogOpen(false);
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
      
      const defaultView = views.find((v: TaskView) => v.isDefault);
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

  const handleRenameView = () => {
    if (!selectedView || !viewName.trim()) {
      toast({ title: "Please enter a view name", variant: "destructive" });
      return;
    }
    
    updateViewMutation.mutate({
      id: selectedView.id,
      name: viewName,
    });
  };

  const handleQuickUpdate = (view: TaskView) => {
    updateViewMutation.mutate({
      id: view.id,
      name: view.name,
      viewType: currentViewType,
      filters: currentFilters,
      groupBy: currentGroupBy,
    });
  };

  const handleViewSelect = (view: TaskView) => {
    setDropdownOpen(false);
    // Toggle behavior: if clicking the already selected view, deselect it
    if (selectedViewId === view.id && onViewDeselect) {
      onViewDeselect();
    } else {
      onViewSelect(view);
    }
  };

  const currentView = views.find((v: TaskView) => v.id === selectedViewId);
  const activeFilterCount = Object.keys(currentFilters).filter(key => {
    const value = currentFilters[key as keyof TaskViewFilters];
    return value && (Array.isArray(value) ? value.length > 0 : true);
  }).length;

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading...</div>;
  }

  return (
    <>
      <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
        <DropdownMenuTrigger asChild>
          <button 
            className="h-6 w-auto px-2 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-1"
            data-testid="dropdown-task-views"
          >
            {currentView ? (
              <div className="flex items-center gap-1">
                {currentView.isDefault && <Star className="h-3 w-3 fill-current text-amber-500" />}
                <span>{currentView.name}</span>
              </div>
            ) : (
              <span>Views</span>
            )}
            <ChevronDown className="h-3 w-3 ml-0.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {views.length > 0 && (
            <>
              <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Saved Views</div>
              {views.map((view: TaskView) => (
                <DropdownMenuItem 
                  key={view.id} 
                  className="flex items-center justify-between group cursor-pointer"
                  onSelect={() => handleViewSelect(view)}
                  data-testid={`view-item-${view.id}`}
                >
                  <div className="flex items-center gap-2 flex-1">
                    {view.isDefault && <Star className="h-3 w-3 fill-current text-amber-500" />}
                    <span className={selectedViewId === view.id ? "font-medium" : ""}>{view.name}</span>
                  </div>
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      className="p-1 rounded hover:bg-muted"
                      onPointerDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setDropdownOpen(false);
                        setTimeout(() => {
                          setSelectedView(view);
                          setViewName(view.name);
                          setRenameDialogOpen(true);
                        }, 0);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          e.stopPropagation();
                          setDropdownOpen(false);
                          setTimeout(() => {
                            setSelectedView(view);
                            setViewName(view.name);
                            setRenameDialogOpen(true);
                          }, 0);
                        }
                      }}
                      title="Rename"
                      data-testid={`button-rename-view-${view.id}`}
                    >
                      <Edit className="h-3 w-3" />
                    </button>
                    {!view.isDefault && (
                      <button
                        className="p-1 rounded hover:bg-muted text-destructive"
                        onPointerDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setDropdownOpen(false);
                          setTimeout(() => {
                            setSelectedView(view);
                            setDeleteDialogOpen(true);
                          }, 0);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            e.stopPropagation();
                            setDropdownOpen(false);
                            setTimeout(() => {
                              setSelectedView(view);
                              setDeleteDialogOpen(true);
                            }, 0);
                          }
                        }}
                        title="Delete"
                        data-testid={`button-delete-view-${view.id}`}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
            </>
          )}
          
          {currentView && (
            <DropdownMenuItem 
              onClick={() => handleQuickUpdate(currentView)}
              data-testid="button-update-view"
            >
              <Save className="h-4 w-4 mr-2" />
              Update View
            </DropdownMenuItem>
          )}
          
          <DropdownMenuItem 
            onClick={() => {
              setViewName("");
              setCreateDialogOpen(true);
            }}
            data-testid="button-save-new-view"
          >
            <Plus className="h-4 w-4 mr-2" />
            Save as New View
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

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

      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent data-testid="dialog-rename-view">
          <DialogHeader>
            <DialogTitle>Rename View</DialogTitle>
            <DialogDescription>
              Enter a new name for this view.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="rename-view-name">View Name</Label>
              <Input
                id="rename-view-name"
                placeholder="e.g., My High Priority Tasks"
                value={viewName}
                onChange={(e) => setViewName(e.target.value)}
                data-testid="input-rename-view-name"
              />
            </div>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setRenameDialogOpen(false)}
              data-testid="button-cancel-rename-view"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleRenameView}
              disabled={updateViewMutation.isPending}
              data-testid="button-confirm-rename-view"
            >
              {updateViewMutation.isPending ? "Renaming..." : "Rename"}
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
    </>
  );
}
