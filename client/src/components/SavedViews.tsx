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
import type { CalendarFilters } from "./CalendarFilters";

export interface CalendarView {
  id: string;
  userId: string;
  companyId: string;
  name: string;
  calendarType: "personal" | "business";
  filters: CalendarFilters;
  calendarMode: string;
  sharedWith: string[] | null;
  isDefault: boolean;
}

interface SavedViewsProps {
  calendarType: "personal" | "business";
  currentFilters: CalendarFilters;
  currentCalendarMode: string;
  onViewSelect: (view: CalendarView) => void;
  selectedViewId?: string;
}

export default function SavedViews({
  calendarType,
  currentFilters,
  currentCalendarMode,
  onViewSelect,
  selectedViewId,
}: SavedViewsProps) {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedView, setSelectedView] = useState<CalendarView | null>(null);
  const [viewName, setViewName] = useState("");
  const { toast } = useToast();

  const { data: views = [], isLoading } = useQuery({
    queryKey: ["/api/calendar-views", calendarType],
    queryFn: async () => {
      return await apiRequest(`/api/calendar-views?calendarType=${calendarType}`, "GET");
    },
  });

  const createViewMutation = useMutation({
    mutationFn: async (data: { name: string; filters: CalendarFilters; calendarMode: string; isDefault: boolean }) => {
      return await apiRequest("/api/calendar-views", "POST", {
        name: data.name,
        calendarType,
        filters: data.filters,
        calendarMode: data.calendarMode,
        isDefault: data.isDefault,
        sharedWith: null,
      });
    },
    onSuccess: (newView) => {
      queryClient.invalidateQueries({ queryKey: ["/api/calendar-views"] });
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
    mutationFn: async (data: { id: string; name: string; filters: CalendarFilters; calendarMode: string }) => {
      return await apiRequest(`/api/calendar-views/${data.id}`, "PATCH", {
        name: data.name,
        filters: data.filters,
        calendarMode: data.calendarMode,
      });
    },
    onSuccess: (updatedView) => {
      queryClient.invalidateQueries({ queryKey: ["/api/calendar-views"] });
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
      await apiRequest(`/api/calendar-views/${id}`, "DELETE");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/calendar-views"] });
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
      filters: currentFilters,
      calendarMode: currentCalendarMode,
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
      filters: currentFilters,
      calendarMode: currentCalendarMode,
    });
  };

  const handleEditClick = (view: CalendarView) => {
    setSelectedView(view);
    setViewName(view.name);
    setEditDialogOpen(true);
  };

  const handleDeleteClick = (view: CalendarView) => {
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

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading views...</div>;
  }

  return (
    <div className="flex items-center gap-2">
      <Select value={selectedViewId} onValueChange={handleViewChange}>
        <SelectTrigger className="w-48" data-testid="select-calendar-view">
          <SelectValue placeholder="Select a view">
            <div className="flex items-center gap-2">
              {currentView?.isDefault && <Star className="h-3 w-3 fill-current" />}
              {currentView?.name || "Select a view"}
            </div>
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {views.map((view: CalendarView) => (
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
            <Button 
              variant="outline" 
              size="icon" 
              data-testid="button-view-actions"
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => handleEditClick(currentView)} data-testid="button-edit-view">
              <Edit className="h-4 w-4 mr-2" />
              Edit View
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

      <Button 
        variant="outline" 
        size="sm" 
        onClick={() => {
          setViewName("");
          setCreateDialogOpen(true);
        }}
        data-testid="button-create-view"
      >
        <Plus className="h-4 w-4 mr-2" />
        Save View
      </Button>

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent data-testid="dialog-create-view">
          <DialogHeader>
            <DialogTitle>Save Current View</DialogTitle>
            <DialogDescription>
              Save your current filter settings and calendar mode as a new view.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="view-name">View Name</Label>
              <Input
                id="view-name"
                placeholder="e.g., My Weekly View"
                value={viewName}
                onChange={(e) => setViewName(e.target.value)}
                data-testid="input-view-name"
              />
            </div>
            <div className="space-y-2">
              <Label>Current Settings</Label>
              <div className="text-sm text-muted-foreground space-y-1">
                <div>Calendar Mode: <Badge variant="secondary">{currentCalendarMode}</Badge></div>
                {Object.keys(currentFilters).length > 0 ? (
                  <div>Active Filters: <Badge variant="secondary">{Object.keys(currentFilters).length}</Badge></div>
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
              Update this view with your current filter settings and calendar mode.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-view-name">View Name</Label>
              <Input
                id="edit-view-name"
                placeholder="e.g., My Weekly View"
                value={viewName}
                onChange={(e) => setViewName(e.target.value)}
                data-testid="input-edit-view-name"
              />
            </div>
            <div className="space-y-2">
              <Label>Current Settings</Label>
              <div className="text-sm text-muted-foreground space-y-1">
                <div>Calendar Mode: <Badge variant="secondary">{currentCalendarMode}</Badge></div>
                {Object.keys(currentFilters).length > 0 ? (
                  <div>Active Filters: <Badge variant="secondary">{Object.keys(currentFilters).length}</Badge></div>
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
