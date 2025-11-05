import { useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, ChevronRight, ChevronDown, MoreVertical, FileDown, FileText, Download, ZoomIn, ZoomOut } from "lucide-react";
import { format, differenceInDays, addDays, startOfMonth, endOfMonth, eachDayOfInterval } from "date-fns";
import { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import type { GanttStage, GanttSubtask } from "@shared/schema";
import { exportGanttToPDF } from "@/components/GanttPDFExport";

export default function Gantt() {
  const { projectId } = useParams();
  const { toast } = useToast();
  const [addStageOpen, setAddStageOpen] = useState(false);
  const [addSubtaskOpen, setAddSubtaskOpen] = useState(false);
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null);
  const [collapsedStages, setCollapsedStages] = useState<Set<string>>(new Set());
  const [draggingItem, setDraggingItem] = useState<{type: 'stage' | 'subtask', id: string, originalStartDate: Date} | null>(null);
  const [dragStartX, setDragStartX] = useState(0);
  const [ripples, setRipples] = useState<{id: string, x: number, y: number}[]>([]);
  const timelineRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [zoomLevel, setZoomLevel] = useState(1); // 1 = normal, 2 = zoomed in, 0.5 = zoomed out
  const [draggingStageId, setDraggingStageId] = useState<string | null>(null);
  const [dragOverStageId, setDragOverStageId] = useState<string | null>(null);
  const [showBaseline, setShowBaseline] = useState(false);

  // Fetch stages
  const { data: stages = [], isLoading } = useQuery<GanttStage[]>({
    queryKey: [`/api/projects/${projectId}/gantt/stages`],
  });

  // Fetch suppliers for color mapping
  const { data: suppliers = [] } = useQuery<any[]>({
    queryKey: ['/api/suppliers'],
  });

  // Fetch all subtasks for all stages
  const stageIds = stages.map(s => s.id);
  const subtaskQueries = useQuery({
    queryKey: [`/api/projects/${projectId}/gantt/subtasks`, stageIds],
    queryFn: async () => {
      const subtasksByStage: Record<string, GanttSubtask[]> = {};
      for (const stageId of stageIds) {
        const response = await fetch(`/api/projects/${projectId}/gantt/stages/${stageId}/subtasks`);
        if (response.ok) {
          subtasksByStage[stageId] = await response.json();
        } else {
          subtasksByStage[stageId] = [];
        }
      }
      return subtasksByStage;
    },
    enabled: stageIds.length > 0,
  });

  const subtasksByStage = subtaskQueries.data || {};

  // Create stage mutation
  const createStageMutation = useMutation({
    mutationFn: async (data: { name: string; description?: string; startDate: Date; endDate: Date }) => {
      return apiRequest(`/api/projects/${projectId}/gantt/stages`, {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/gantt/stages`] });
      setAddStageOpen(false);
      toast({ title: "Stage created successfully" });
    },
  });

  // Create subtask mutation
  const createSubtaskMutation = useMutation({
    mutationFn: async (data: { stageId: string; name: string; description?: string; startDate: Date; endDate: Date }) => {
      return apiRequest(`/api/projects/${projectId}/gantt/stages/${data.stageId}/subtasks`, {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/gantt/subtasks`] });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/gantt/stages`] });
      setAddSubtaskOpen(false);
      toast({ title: "Subtask created successfully" });
    },
  });

  // Update stage dates mutation
  const updateStageDatesMutation = useMutation({
    mutationFn: async ({ id, startDate, endDate }: { id: string; startDate: Date; endDate: Date }) => {
      return apiRequest(`/api/projects/${projectId}/gantt/stages/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ startDate, endDate }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/gantt/stages`] });
      toast({ title: "Stage dates updated" });
    },
  });

  // Update subtask dates mutation
  const updateSubtaskDatesMutation = useMutation({
    mutationFn: async ({ id, startDate, endDate }: { id: string; startDate: Date; endDate: Date }) => {
      return apiRequest(`/api/projects/${projectId}/gantt/subtasks/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ startDate, endDate }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/gantt/subtasks`] });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/gantt/stages`] });
      toast({ title: "Subtask dates updated" });
    },
  });

  // Delete stage mutation
  const deleteStageMutation = useMutation({
    mutationFn: async (stageId: string) => {
      return apiRequest(`/api/projects/${projectId}/gantt/stages/${stageId}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/gantt/stages`] });
      toast({ title: "Stage deleted successfully" });
    },
  });

  // Delete subtask mutation
  const deleteSubtaskMutation = useMutation({
    mutationFn: async (subtaskId: string) => {
      return apiRequest(`/api/projects/${projectId}/gantt/subtasks/${subtaskId}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/gantt/subtasks`] });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/gantt/stages`] });
      toast({ title: "Subtask deleted successfully" });
    },
  });

  // Toggle collapse mutation
  const toggleCollapseMutation = useMutation({
    mutationFn: async (stageId: string) => {
      return apiRequest(`/api/projects/${projectId}/gantt/stages/${stageId}/toggle-collapse`, {
        method: "POST",
      });
    },
    onSuccess: (updatedStage: GanttStage) => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/gantt/stages`] });
      // Update local state to match server
      setCollapsedStages(prev => {
        const next = new Set(prev);
        if (updatedStage.isCollapsed) {
          next.add(updatedStage.id);
        } else {
          next.delete(updatedStage.id);
        }
        return next;
      });
    },
  });

  // Reorder stages mutation
  const reorderStagesMutation = useMutation({
    mutationFn: async ({ stageId, newIndex }: { stageId: string; newIndex: number }) => {
      return apiRequest(`/api/projects/${projectId}/gantt/stages/${stageId}/reorder`, {
        method: "PATCH",
        body: JSON.stringify({ displayOrder: newIndex }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/gantt/stages`] });
      toast({ title: "Stages reordered" });
    },
  });

  // Save baseline mutation - saves current dates as baseline for stages AND subtasks
  const saveBaselineMutation = useMutation({
    mutationFn: async () => {
      // Save baseline for stages
      const stageUpdates = stages.map(stage => ({
        id: stage.id,
        baselineStartDate: stage.startDate,
        baselineEndDate: stage.endDate,
      }));
      
      const stagePromises = stageUpdates.map(update =>
        apiRequest(`/api/projects/${projectId}/gantt/stages/${update.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            baselineStartDate: update.baselineStartDate,
            baselineEndDate: update.baselineEndDate,
          }),
        })
      );

      // Save baseline for all subtasks
      const allSubtasks = Object.values(subtasksByStage).flat();
      const subtaskPromises = allSubtasks.map(subtask =>
        apiRequest(`/api/projects/${projectId}/gantt/subtasks/${subtask.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            baselineStartDate: subtask.startDate,
            baselineEndDate: subtask.endDate,
          }),
        })
      );
      
      return Promise.all([...stagePromises, ...subtaskPromises]);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/gantt/stages`] });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/gantt/subtasks`] });
      setShowBaseline(true);
      toast({ title: "Baseline saved successfully" });
    },
  });

  // Revert to baseline mutation - reverts stages AND subtasks to baseline
  const revertToBaselineMutation = useMutation({
    mutationFn: async () => {
      // Revert stages
      const stageUpdates = stages
        .filter(stage => stage.baselineStartDate && stage.baselineEndDate)
        .map(stage => ({
          id: stage.id,
          startDate: stage.baselineStartDate,
          endDate: stage.baselineEndDate,
        }));
      
      const stagePromises = stageUpdates.map(update =>
        apiRequest(`/api/projects/${projectId}/gantt/stages/${update.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            startDate: update.startDate,
            endDate: update.endDate,
          }),
        })
      );

      // Revert all subtasks
      const allSubtasks = Object.values(subtasksByStage).flat();
      const subtaskUpdates = allSubtasks
        .filter(subtask => subtask.baselineStartDate && subtask.baselineEndDate)
        .map(subtask => ({
          id: subtask.id,
          startDate: subtask.baselineStartDate,
          endDate: subtask.baselineEndDate,
        }));

      const subtaskPromises = subtaskUpdates.map(update =>
        apiRequest(`/api/projects/${projectId}/gantt/subtasks/${update.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            startDate: update.startDate,
            endDate: update.endDate,
          }),
        })
      );
      
      return Promise.all([...stagePromises, ...subtaskPromises]);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/gantt/stages`] });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/gantt/subtasks`] });
      toast({ title: "Reverted to baseline successfully" });
    },
  });

  // Sync local collapsed state with server state
  useEffect(() => {
    const serverCollapsedIds = stages.filter(s => s.isCollapsed).map(s => s.id);
    setCollapsedStages(new Set(serverCollapsedIds));
  }, [stages]);

  // Calculate timeline range
  const allDates = stages.flatMap(stage => [new Date(stage.startDate), new Date(stage.endDate)]);
  const timelineStart = allDates.length > 0 ? startOfMonth(new Date(Math.min(...allDates.map(d => d.getTime())))) : startOfMonth(new Date());
  const timelineEnd = allDates.length > 0 ? endOfMonth(new Date(Math.max(...allDates.map(d => d.getTime())))) : endOfMonth(addDays(new Date(), 90));
  const timelineDays = eachDayOfInterval({ start: timelineStart, end: timelineEnd });
  const totalDays = timelineDays.length;

  // Today line position
  const today = new Date();
  const todayOffset = differenceInDays(today, timelineStart);
  const todayPercent = (todayOffset / totalDays) * 100;

  // Calculate bar position and width
  const getBarStyle = (startDate: Date, endDate: Date) => {
    const daysFromStart = differenceInDays(new Date(startDate), timelineStart);
    const duration = differenceInDays(new Date(endDate), new Date(startDate)) + 1;
    const leftPercent = (daysFromStart / totalDays) * 100;
    const widthPercent = (duration / totalDays) * 100;
    return {
      left: `${leftPercent}%`,
      width: `${widthPercent}%`,
    };
  };

  // Get bar color based on supplier color or default lilac
  const getBarColor = (supplierId?: string | null, supplierColor?: string | null) => {
    if (supplierId && supplierColor) {
      return supplierColor;
    }
    const supplier = suppliers.find((s: any) => s.id === supplierId);
    if (supplier?.color) {
      return supplier.color;
    }
    return '#bba7db'; // Default lilac
  };

  // Critical path calculation (marks delayed stages)
  const calculateCriticalPath = () => {
    // Mark stages that are delayed (isDelayed flag)
    const criticalStages = new Set<string>();
    stages.forEach(stage => {
      if (stage.isDelayed) {
        criticalStages.add(stage.id);
      }
    });
    return criticalStages;
  };

  const criticalPath = calculateCriticalPath();

  // Drag and drop handlers with global event listeners
  const handleBarMouseDown = (e: React.MouseEvent, type: 'stage' | 'subtask', id: string, startDate: Date) => {
    e.stopPropagation();
    if (!timelineRef.current) return;
    
    setDraggingItem({ type, id, originalStartDate: startDate });
    setDragStartX(e.clientX);

    // Add ripple effect
    const rippleId = Math.random().toString();
    setRipples(prev => [...prev, { id: rippleId, x: e.clientX, y: e.clientY }]);
    setTimeout(() => {
      setRipples(prev => prev.filter(r => r.id !== rippleId));
    }, 600);
  };

  // Global mouse move handler
  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (!draggingItem || !timelineRef.current) return;
      // Visual feedback could be added here (e.g., cursor style)
    };

    const handleGlobalMouseUp = (e: MouseEvent) => {
      if (!draggingItem || !timelineRef.current) return;

      const timelineRect = timelineRef.current.getBoundingClientRect();
      const dragDeltaX = e.clientX - dragStartX;
      const dragDeltaDays = Math.round((dragDeltaX / timelineRect.width) * totalDays);
      
      // Calculate new start date by adding delta to original start date
      const newStartDate = addDays(draggingItem.originalStartDate, dragDeltaDays);

      if (draggingItem.type === 'stage') {
        const stage = stages.find(s => s.id === draggingItem.id);
        if (stage) {
          const duration = differenceInDays(new Date(stage.endDate), new Date(stage.startDate));
          
          // Clamp to timeline bounds accounting for duration
          const maxStartDate = addDays(timelineEnd, -duration);
          const clampedStartDate = newStartDate < timelineStart ? timelineStart : 
                                  newStartDate > maxStartDate ? maxStartDate : newStartDate;
          
          const newEndDate = addDays(clampedStartDate, duration);
          updateStageDatesMutation.mutate({
            id: draggingItem.id,
            startDate: clampedStartDate,
            endDate: newEndDate,
          });
        }
      } else {
        const stageId = Object.keys(subtasksByStage).find(sid => 
          subtasksByStage[sid].some(st => st.id === draggingItem.id)
        );
        if (stageId) {
          const subtask = subtasksByStage[stageId].find(st => st.id === draggingItem.id);
          if (subtask) {
            const duration = differenceInDays(new Date(subtask.endDate), new Date(subtask.startDate));
            
            // Clamp to timeline bounds accounting for duration
            const maxStartDate = addDays(timelineEnd, -duration);
            const clampedStartDate = newStartDate < timelineStart ? timelineStart : 
                                    newStartDate > maxStartDate ? maxStartDate : newStartDate;
            
            const newEndDate = addDays(clampedStartDate, duration);
            updateSubtaskDatesMutation.mutate({
              id: draggingItem.id,
              startDate: clampedStartDate,
              endDate: newEndDate,
            });
          }
        }
      }

      setDraggingItem(null);
    };

    if (draggingItem) {
      window.addEventListener('mousemove', handleGlobalMouseMove);
      window.addEventListener('mouseup', handleGlobalMouseUp);
      
      return () => {
        window.removeEventListener('mousemove', handleGlobalMouseMove);
        window.removeEventListener('mouseup', handleGlobalMouseUp);
      };
    }
  }, [draggingItem, dragStartX, totalDays, timelineStart, timelineEnd, stages, subtasksByStage, updateStageDatesMutation, updateSubtaskDatesMutation]);

  // Mobile swipe handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartX(e.touches[0].clientX);
    if (scrollContainerRef.current) {
      setScrollOffset(scrollContainerRef.current.scrollLeft);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartX === null || !scrollContainerRef.current) return;
    const touchX = e.touches[0].clientX;
    const diff = touchStartX - touchX;
    scrollContainerRef.current.scrollLeft = scrollOffset + diff;
  };

  const handleTouchEnd = () => {
    setTouchStartX(null);
  };

  // PDF Export
  const handleExportPDF = async () => {
    try {
      toast({ title: "Generating PDF...", description: "Your Gantt chart is being exported." });
      await exportGanttToPDF(stages, subtasksByStage, "Project Timeline");
      toast({ title: "PDF exported successfully!", description: "Your Gantt chart has been downloaded." });
    } catch (error) {
      toast({ 
        title: "Export failed", 
        description: "There was an error exporting the PDF.", 
        variant: "destructive" 
      });
    }
  };

  // Template Save/Load
  const handleSaveTemplate = () => {
    toast({ title: "Saving template...", description: "This feature will be available soon." });
    // TODO: Implement template save
  };

  // Drag-to-reorder handlers
  const handleStageDragStart = (e: React.DragEvent, stageId: string) => {
    setDraggingStageId(stageId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleStageDragOver = (e: React.DragEvent, stageId: string) => {
    e.preventDefault();
    if (draggingStageId && draggingStageId !== stageId) {
      setDragOverStageId(stageId);
    }
  };

  const handleStageDrop = (e: React.DragEvent, targetStageId: string) => {
    e.preventDefault();
    if (draggingStageId && draggingStageId !== targetStageId) {
      // Find the indices
      const draggedIndex = stages.findIndex(s => s.id === draggingStageId);
      const targetIndex = stages.findIndex(s => s.id === targetStageId);
      
      if (draggedIndex !== -1 && targetIndex !== -1) {
        // Update the display order on the server
        reorderStagesMutation.mutate({ stageId: draggingStageId, newIndex: targetIndex });
      }
    }
    setDraggingStageId(null);
    setDragOverStageId(null);
  };

  const handleStageDragEnd = () => {
    setDraggingStageId(null);
    setDragOverStageId(null);
  };

  if (isLoading) {
    return <div className="p-6">Loading Gantt chart...</div>;
  }

  return (
    <div className="flex flex-col h-full">
      {/* Top Bar with Actions */}
      <div className="flex items-center justify-between p-4 border-b">
        <h1 className="text-2xl font-semibold" style={{ fontFamily: 'Clash Grotesk, sans-serif' }}>Gantt Chart</h1>
        <div className="flex items-center gap-4">
          {/* Zoom Controls */}
          <TooltipProvider>
            <div className="flex items-center gap-2 px-3 py-1 rounded-lg border">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-7 w-7"
                    onClick={() => setZoomLevel(prev => Math.max(0.5, prev - 0.25))}
                    disabled={zoomLevel <= 0.5}
                    data-testid="button-zoom-out"
                  >
                    <ZoomOut className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Zoom out</TooltipContent>
              </Tooltip>
              <span className="text-sm font-medium w-12 text-center">{Math.round(zoomLevel * 100)}%</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-7 w-7"
                    onClick={() => setZoomLevel(prev => Math.min(2, prev + 0.25))}
                    disabled={zoomLevel >= 2}
                    data-testid="button-zoom-in"
                  >
                    <ZoomIn className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Zoom in</TooltipContent>
              </Tooltip>
            </div>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" onClick={handleSaveTemplate} data-testid="button-save-template">
                  <FileText className="w-4 h-4 mr-2" />
                  Template
                </Button>
              </TooltipTrigger>
              <TooltipContent>Save current timeline as template</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => saveBaselineMutation.mutate()}
                  disabled={saveBaselineMutation.isPending || subtaskQueries.isLoading || subtaskQueries.isFetching || !subtaskQueries.data}
                  data-testid="button-save-baseline"
                >
                  <FileDown className="w-4 h-4 mr-2" />
                  Save Baseline
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {(subtaskQueries.isLoading || subtaskQueries.isFetching) ? "Loading subtasks..." : "Save current dates as baseline for comparison"}
              </TooltipContent>
            </Tooltip>

            {stages.some(s => s.baselineStartDate) && (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      variant={showBaseline ? "default" : "outline"} 
                      size="sm" 
                      onClick={() => setShowBaseline(!showBaseline)}
                      data-testid="button-toggle-baseline"
                    >
                      {showBaseline ? "Hide" : "Show"} Baseline
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Toggle baseline visibility</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => revertToBaselineMutation.mutate()}
                      disabled={revertToBaselineMutation.isPending || subtaskQueries.isLoading || subtaskQueries.isFetching || !subtaskQueries.data}
                      data-testid="button-revert-baseline"
                    >
                      Revert to Baseline
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {(subtaskQueries.isLoading || subtaskQueries.isFetching) ? "Loading subtasks..." : "Revert all dates to baseline schedule"}
                  </TooltipContent>
                </Tooltip>
              </>
            )}

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" onClick={handleExportPDF} data-testid="button-export-pdf">
                  <Download className="w-4 h-4 mr-2" />
                  Export
                </Button>
              </TooltipTrigger>
              <TooltipContent>Export Gantt chart to PDF</TooltipContent>
            </Tooltip>

            <Dialog open={addStageOpen} onOpenChange={setAddStageOpen}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DialogTrigger asChild>
                    <Button size="sm" data-testid="button-add-stage">
                      <Plus className="w-4 h-4 mr-2" />
                      Add Stage
                    </Button>
                  </DialogTrigger>
                </TooltipTrigger>
                <TooltipContent>Add a new stage to the timeline</TooltipContent>
              </Tooltip>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add New Stage</DialogTitle>
                </DialogHeader>
                <AddStageForm onSubmit={(data) => createStageMutation.mutate(data)} />
              </DialogContent>
            </Dialog>
          </TooltipProvider>
        </div>
      </div>

      {/* Gantt Chart */}
      <div 
        ref={scrollContainerRef}
        className="flex-1 overflow-auto p-6"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <Card>
          <CardHeader>
            <CardTitle>Project Timeline</CardTitle>
          </CardHeader>
          <CardContent>
            {/* Timeline Header */}
            <div className="flex border-b mb-4">
              <div className="w-64 flex-shrink-0 font-semibold p-2">Stage / Task</div>
              <div 
                ref={timelineRef}
                className="flex-1 relative h-12"
                style={{ width: `${zoomLevel * 100}%` }}
              >
                {timelineDays.map((day, idx) => {
                  const isFirstOfMonth = day.getDate() === 1;
                  return (
                    <div
                      key={idx}
                      className="absolute top-0 h-full border-l border-border/30 text-xs text-muted-foreground"
                      style={{ left: `${(idx / totalDays) * 100}%` }}
                    >
                      {isFirstOfMonth && (
                        <div className="pl-1 font-semibold">{format(day, 'MMM yyyy')}</div>
                      )}
                    </div>
                  );
                })}
                
                {/* Today Line (Amber) */}
                {todayOffset >= 0 && todayOffset <= totalDays && (
                  <div
                    className="absolute top-0 h-full w-0.5 bg-amber-500 z-10"
                    style={{ left: `${todayPercent}%` }}
                    data-testid="today-line"
                  >
                    <div className="absolute -top-1 -left-2 w-4 h-4 bg-amber-500 rounded-full" />
                  </div>
                )}
              </div>
              <div className="w-48 flex-shrink-0 text-center font-semibold p-2">Assigned</div>
            </div>

            {/* Rows */}
            {stages.length === 0 ? (
              <div className="text-center text-muted-foreground py-12">
                No stages yet. Click "Add Stage" to get started.
              </div>
            ) : (
              <div className="space-y-0">
                {stages.map((stage, stageIdx) => {
                  const isCollapsed = collapsedStages.has(stage.id);
                  const subtasks = subtasksByStage[stage.id] || [];
                  const isCritical = criticalPath.has(stage.id);
                  const nextStage = stages[stageIdx + 1];

                  return (
                    <div key={stage.id}>
                      {/* Stage Row - 40px height, draggable, rounded-xl */}
                      <div
                        draggable
                        onDragStart={(e) => handleStageDragStart(e, stage.id)}
                        onDragOver={(e) => handleStageDragOver(e, stage.id)}
                        onDrop={(e) => handleStageDrop(e, stage.id)}
                        onDragEnd={handleStageDragEnd}
                        className={`flex items-center h-10 hover-elevate rounded-xl transition-all duration-200 cursor-move ${
                          dragOverStageId === stage.id ? 'border-2 border-primary' : ''
                        } ${draggingStageId === stage.id ? 'opacity-50' : ''}`}
                        style={{
                          height: '40px',
                          backgroundColor: '#f8f4ff',
                        }}
                        data-testid={`stage-row-${stage.id}`}
                      >
                        <div className="w-64 flex-shrink-0 flex items-center gap-2 px-3">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleCollapseMutation.mutate(stage.id);
                            }}
                            className="p-1 hover-elevate rounded transition-transform duration-200 hover:scale-110 flex-shrink-0"
                            data-testid={`button-toggle-collapse-${stage.id}`}
                          >
                            {isCollapsed ? (
                              <ChevronRight className="w-4 h-4" />
                            ) : (
                              <ChevronDown className="w-4 h-4" />
                            )}
                          </button>
                          <span className="font-semibold truncate" style={{ fontFamily: 'Clash Grotesk, sans-serif', fontSize: '18px' }}>
                            {stage.name}
                          </span>
                        </div>
                        <div className="flex-1 relative h-full flex items-center" style={{ width: `${zoomLevel * 100}%` }}>
                          {/* Baseline Bar - Dotted gray line underneath */}
                          {showBaseline && stage.baselineStartDate && stage.baselineEndDate && (
                            <div
                              className="absolute h-6 rounded border-2 border-dashed border-gray-400 opacity-60"
                              style={{
                                ...getBarStyle(new Date(stage.baselineStartDate), new Date(stage.baselineEndDate)),
                                backgroundColor: 'transparent',
                                pointerEvents: 'none',
                              }}
                              data-testid={`stage-baseline-${stage.id}`}
                            />
                          )}

                          {/* Stage Bar - Supplier color or lilac with hover lift */}
                          <div
                            className="absolute h-6 rounded flex items-center px-2 text-white text-xs font-medium cursor-move transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5"
                            style={{
                              ...getBarStyle(new Date(stage.startDate), new Date(stage.endDate)),
                              backgroundColor: getBarColor(stage.supplierId, stage.color),
                              border: isCritical ? '2px dashed #ef4444' : 'none',
                            }}
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              handleBarMouseDown(e, 'stage', stage.id, new Date(stage.startDate));
                            }}
                            data-testid={`stage-bar-${stage.id}`}
                          >
                            {stage.name}
                          </div>

                          {/* Critical Path Line to Next Stage - Red dashed for delayed */}
                          {isCritical && nextStage && criticalPath.has(nextStage.id) && (() => {
                            const currentBar = getBarStyle(new Date(stage.startDate), new Date(stage.endDate));
                            const nextBar = getBarStyle(new Date(nextStage.startDate), new Date(nextStage.endDate));
                            const x1 = parseFloat(currentBar.left || '0') + parseFloat(currentBar.width || '0');
                            const x2 = parseFloat(nextBar.left || '0');
                            return (
                              <svg className="absolute inset-0 pointer-events-none" style={{ width: '100%', height: '100%' }} viewBox="0 0 100 100" preserveAspectRatio="none">
                                <line
                                  x1={x1}
                                  y1="50"
                                  x2={x2}
                                  y2="50"
                                  stroke="#ef4444"
                                  strokeWidth="0.8"
                                  strokeDasharray="4,4"
                                  vectorEffect="non-scaling-stroke"
                                />
                              </svg>
                            );
                          })()}
                        </div>
                        {/* Chips Column - Vertical stack, 24px tall */}
                        <div className="w-48 flex-shrink-0 flex flex-col items-start justify-center gap-1 px-3">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {stage.supplierName && (
                              <Badge 
                                variant="secondary" 
                                className="text-xs h-6 px-2 cursor-pointer hover-elevate" 
                                style={{ 
                                  backgroundColor: getBarColor(stage.supplierId, stage.color),
                                  color: 'white',
                                  border: 'none'
                                }}
                                data-testid={`chip-supplier-${stage.id}`}
                              >
                                {stage.supplierName}
                              </Badge>
                            )}
                            {stage.foremanName && (
                              <Badge variant="secondary" className="text-xs h-6 px-2 cursor-pointer hover-elevate" data-testid={`chip-foreman-${stage.id}`}>
                                {stage.foremanName}
                              </Badge>
                            )}
                            {stage.hasRfq && (
                              <Badge variant="outline" className="text-xs h-6 px-2 cursor-pointer hover-elevate" data-testid={`chip-rfq-${stage.id}`}>
                                RFQ
                              </Badge>
                            )}
                            {stage.hasPo && (
                              <Badge variant="outline" className="text-xs h-6 px-2 cursor-pointer hover-elevate" data-testid={`chip-po-${stage.id}`}>
                                PO
                              </Badge>
                            )}
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => e.stopPropagation()}>
                                  <MoreVertical className="w-3 h-3" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent>
                                <DropdownMenuItem
                                  onClick={() => {
                                    setSelectedStageId(stage.id);
                                    setAddSubtaskOpen(true);
                                  }}
                                >
                                  Add Subtask
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => deleteStageMutation.mutate(stage.id)}
                                  className="text-destructive"
                                >
                                  Delete Stage
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      </div>

                      {/* Subtasks - 40px height, indented, dotted bars */}
                      {!isCollapsed && subtasks.map((subtask) => (
                        <div
                          key={subtask.id}
                          className="flex items-center hover-elevate rounded-md ml-8 transition-all duration-200"
                          style={{
                            height: '40px',
                            backgroundColor: '#fafafa',
                          }}
                          data-testid={`subtask-row-${subtask.id}`}
                        >
                          <div className="w-56 flex-shrink-0 px-3">
                            <span className="text-sm truncate" style={{ fontFamily: 'Manrope, sans-serif' }}>
                              {subtask.name}
                            </span>
                          </div>
                          <div className="flex-1 relative h-full flex items-center" style={{ width: `${zoomLevel * 100}%` }}>
                            {/* Baseline Bar for Subtask - Dotted gray line */}
                            {showBaseline && subtask.baselineStartDate && subtask.baselineEndDate && (
                              <div
                                className="absolute h-4 rounded border border-dashed border-gray-400 opacity-60"
                                style={{
                                  ...getBarStyle(new Date(subtask.baselineStartDate), new Date(subtask.baselineEndDate)),
                                  backgroundColor: 'transparent',
                                  pointerEvents: 'none',
                                }}
                                data-testid={`subtask-baseline-${subtask.id}`}
                              />
                            )}

                            {/* Subtask Bar - Supplier color or light lilac with dotted border */}
                            <div
                              className="absolute h-4 rounded flex items-center px-2 text-xs cursor-move transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5"
                              style={{
                                ...getBarStyle(new Date(subtask.startDate), new Date(subtask.endDate)),
                                backgroundColor: subtask.supplierId ? `${getBarColor(subtask.supplierId, null)}40` : '#e5dff5',
                                border: subtask.isDelayed ? '2px dashed #ef4444' : `2px dotted ${getBarColor(subtask.supplierId, null)}`,
                              }}
                              onMouseDown={(e) => handleBarMouseDown(e, 'subtask', subtask.id, new Date(subtask.startDate))}
                              data-testid={`subtask-bar-${subtask.id}`}
                            >
                              {subtask.name}
                            </div>
                          </div>
                          {/* Chips Column - 24px tall */}
                          <div className="w-48 flex-shrink-0 flex flex-col items-start justify-center gap-1 px-3">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {subtask.supplierName && (
                                <Badge 
                                  variant="secondary" 
                                  className="text-xs h-6 px-2 cursor-pointer hover-elevate" 
                                  style={{ 
                                    backgroundColor: getBarColor(subtask.supplierId, null),
                                    color: 'white',
                                    border: 'none'
                                  }}
                                  data-testid={`chip-supplier-${subtask.id}`}
                                >
                                  {subtask.supplierName}
                                </Badge>
                              )}
                              {subtask.assignedToName && (
                                <Badge variant="secondary" className="text-xs h-6 px-2 cursor-pointer hover-elevate" data-testid={`chip-assigned-${subtask.id}`}>
                                  {subtask.assignedToName}
                                </Badge>
                              )}
                              {subtask.hasRfq && (
                                <Badge variant="outline" className="text-xs h-6 px-2 cursor-pointer hover-elevate" data-testid={`chip-rfq-${subtask.id}`}>
                                  RFQ
                                </Badge>
                              )}
                              {subtask.hasPo && (
                                <Badge variant="outline" className="text-xs h-6 px-2 cursor-pointer hover-elevate" data-testid={`chip-po-${subtask.id}`}>
                                  PO
                                </Badge>
                              )}
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => deleteSubtaskMutation.mutate(subtask.id)}
                                data-testid={`button-delete-subtask-${subtask.id}`}
                              >
                                <MoreVertical className="w-3 h-3" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Add Subtask Dialog */}
      <Dialog open={addSubtaskOpen} onOpenChange={setAddSubtaskOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Subtask</DialogTitle>
          </DialogHeader>
          {selectedStageId && (
            <AddSubtaskForm
              stageId={selectedStageId}
              onSubmit={(data) => createSubtaskMutation.mutate(data)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Ripple Effects */}
      {ripples.map((ripple) => (
        <div
          key={ripple.id}
          className="fixed pointer-events-none animate-ripple rounded-full"
          style={{
            left: ripple.x - 20,
            top: ripple.y - 20,
            width: 40,
            height: 40,
            backgroundColor: '#bba7db',
            opacity: 0.6,
          }}
        />
      ))}

      <style>{`
        @keyframes ripple {
          0% {
            transform: scale(0);
            opacity: 0.6;
          }
          100% {
            transform: scale(4);
            opacity: 0;
          }
        }
        .animate-ripple {
          animation: ripple 600ms ease-out;
        }
      `}</style>
    </div>
  );
}

function AddStageForm({ onSubmit }: { onSubmit: (data: any) => void }) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    startDate: format(new Date(), 'yyyy-MM-dd'),
    endDate: format(addDays(new Date(), 14), 'yyyy-MM-dd'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      name: formData.name,
      description: formData.description,
      startDate: new Date(formData.startDate),
      endDate: new Date(formData.endDate),
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="name">Stage Name</Label>
        <Input
          id="name"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="e.g., Framing"
          required
          data-testid="input-stage-name"
        />
      </div>
      <div>
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder="Optional description"
          data-testid="input-stage-description"
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="startDate">Start Date</Label>
          <Input
            id="startDate"
            type="date"
            value={formData.startDate}
            onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
            required
            data-testid="input-stage-start-date"
          />
        </div>
        <div>
          <Label htmlFor="endDate">End Date</Label>
          <Input
            id="endDate"
            type="date"
            value={formData.endDate}
            onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
            required
            data-testid="input-stage-end-date"
          />
        </div>
      </div>
      <Button type="submit" className="w-full" data-testid="button-submit-stage">
        Create Stage
      </Button>
    </form>
  );
}

function AddSubtaskForm({ stageId, onSubmit }: { stageId: string; onSubmit: (data: any) => void }) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    startDate: format(new Date(), 'yyyy-MM-dd'),
    endDate: format(addDays(new Date(), 7), 'yyyy-MM-dd'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      stageId,
      name: formData.name,
      description: formData.description,
      startDate: new Date(formData.startDate),
      endDate: new Date(formData.endDate),
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="subtask-name">Subtask Name</Label>
        <Input
          id="subtask-name"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="e.g., Walls"
          required
          data-testid="input-subtask-name"
        />
      </div>
      <div>
        <Label htmlFor="subtask-description">Description</Label>
        <Textarea
          id="subtask-description"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder="Optional description"
          data-testid="input-subtask-description"
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="subtask-startDate">Start Date</Label>
          <Input
            id="subtask-startDate"
            type="date"
            value={formData.startDate}
            onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
            required
            data-testid="input-subtask-start-date"
          />
        </div>
        <div>
          <Label htmlFor="subtask-endDate">End Date</Label>
          <Input
            id="subtask-endDate"
            type="date"
            value={formData.endDate}
            onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
            required
            data-testid="input-subtask-end-date"
          />
        </div>
      </div>
      <Button type="submit" className="w-full" data-testid="button-submit-subtask">
        Create Subtask
      </Button>
    </form>
  );
}
