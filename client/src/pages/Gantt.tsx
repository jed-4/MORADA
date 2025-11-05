import { useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, ChevronRight, ChevronDown, MoreVertical } from "lucide-react";
import { format, differenceInDays, addDays, startOfMonth, endOfMonth, eachDayOfInterval } from "date-fns";
import { useState, useEffect } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import type { GanttStage, GanttSubtask } from "@shared/schema";

export default function Gantt() {
  const { projectId } = useParams();
  const { toast } = useToast();
  const [addStageOpen, setAddStageOpen] = useState(false);
  const [addSubtaskOpen, setAddSubtaskOpen] = useState(false);
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null);
  const [collapsedStages, setCollapsedStages] = useState<Set<string>>(new Set());

  // Fetch stages
  const { data: stages = [], isLoading } = useQuery<GanttStage[]>({
    queryKey: [`/api/projects/${projectId}/gantt/stages`],
  });

  // Fetch all subtasks for all stages
  const stageIds = stages.map(s => s.id);
  const subtaskQueries = useQuery({
    queryKey: [`/api/gantt/subtasks`, stageIds],
    queryFn: async () => {
      const subtasksByStage: Record<string, GanttSubtask[]> = {};
      for (const stageId of stageIds) {
        const response = await fetch(`/api/gantt/stages/${stageId}/subtasks`);
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
      return apiRequest(`/api/gantt/stages/${data.stageId}/subtasks`, {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/gantt/subtasks`] });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/gantt/stages`] });
      setAddSubtaskOpen(false);
      toast({ title: "Subtask created successfully" });
    },
  });

  // Delete stage mutation
  const deleteStageMutation = useMutation({
    mutationFn: async (stageId: string) => {
      return apiRequest(`/api/gantt/stages/${stageId}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/gantt/stages`] });
      toast({ title: "Stage deleted successfully" });
    },
  });

  // Delete subtask mutation
  const deleteSubtaskMutation = useMutation({
    mutationFn: async (subtaskId: string) => {
      return apiRequest(`/api/gantt/subtasks/${subtaskId}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/gantt/subtasks`] });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/gantt/stages`] });
      toast({ title: "Subtask deleted successfully" });
    },
  });

  // Toggle collapse mutation
  const toggleCollapseMutation = useMutation({
    mutationFn: async (stageId: string) => {
      return apiRequest(`/api/gantt/stages/${stageId}/toggle-collapse`, {
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

  if (isLoading) {
    return <div className="p-6">Loading Gantt chart...</div>;
  }

  return (
    <div className="flex flex-col h-full">
      {/* Top Bar */}
      <div className="flex items-center justify-between p-4 border-b">
        <h1 className="text-2xl font-semibold" style={{ fontFamily: 'Clash Grotesk, sans-serif' }}>Gantt Chart</h1>
        <Dialog open={addStageOpen} onOpenChange={setAddStageOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-stage">
              <Plus className="w-4 h-4 mr-2" />
              Add Stage
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Stage</DialogTitle>
            </DialogHeader>
            <AddStageForm onSubmit={(data) => createStageMutation.mutate(data)} />
          </DialogContent>
        </Dialog>
      </div>

      {/* Gantt Chart */}
      <div className="flex-1 overflow-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle>Project Timeline</CardTitle>
          </CardHeader>
          <CardContent>
            {/* Timeline Header */}
            <div className="flex border-b mb-4">
              <div className="w-64 flex-shrink-0 font-semibold p-2">Stage / Task</div>
              <div className="flex-1 relative h-12">
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
                {stages.map((stage) => {
                  const isCollapsed = collapsedStages.has(stage.id);
                  const subtasks = subtasksByStage[stage.id] || [];

                  return (
                    <div key={stage.id}>
                      {/* Stage Row */}
                      <div
                        className="flex items-center h-10 hover-elevate rounded-md"
                        style={{
                          backgroundColor: '#f8f4ff',
                        }}
                      >
                        <div className="w-64 flex-shrink-0 flex items-center gap-2 px-2">
                          <button
                            onClick={() => toggleCollapseMutation.mutate(stage.id)}
                            className="p-1 hover-elevate rounded"
                            data-testid={`button-toggle-collapse-${stage.id}`}
                          >
                            {isCollapsed ? (
                              <ChevronRight className="w-4 h-4" />
                            ) : (
                              <ChevronDown className="w-4 h-4" />
                            )}
                          </button>
                          <span className="font-semibold truncate" style={{ fontFamily: 'Clash Grotesk, sans-serif' }}>
                            {stage.name}
                          </span>
                        </div>
                        <div className="flex-1 relative h-full flex items-center">
                          {/* Stage Bar */}
                          <div
                            className="absolute h-6 rounded flex items-center px-2 text-white text-xs font-medium"
                            style={{
                              ...getBarStyle(new Date(stage.startDate), new Date(stage.endDate)),
                              backgroundColor: stage.color || '#bba7db',
                            }}
                          >
                            {stage.name}
                          </div>
                        </div>
                        <div className="w-48 flex-shrink-0 flex items-center justify-center gap-2 px-2">
                          {stage.foremanName && (
                            <Badge variant="secondary" className="text-xs">
                              {stage.foremanName}
                            </Badge>
                          )}
                          {stage.hasRfq && <Badge variant="outline" className="text-xs">RFQ</Badge>}
                          {stage.hasPo && <Badge variant="outline" className="text-xs">PO</Badge>}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-6 w-6">
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

                      {/* Subtasks */}
                      {!isCollapsed && subtasks.map((subtask) => (
                        <div
                          key={subtask.id}
                          className="flex items-center h-10 hover-elevate rounded-md ml-8"
                        >
                          <div className="w-56 flex-shrink-0 px-2">
                            <span className="text-sm truncate" style={{ fontFamily: 'Manrope, sans-serif' }}>
                              {subtask.name}
                            </span>
                          </div>
                          <div className="flex-1 relative h-full flex items-center">
                            {/* Subtask Bar (dotted) */}
                            <div
                              className="absolute h-4 rounded flex items-center px-2 text-xs"
                              style={{
                                ...getBarStyle(new Date(subtask.startDate), new Date(subtask.endDate)),
                                backgroundColor: '#e5dff5',
                                border: '2px dotted #bba7db',
                              }}
                            >
                              {subtask.name}
                            </div>
                          </div>
                          <div className="w-48 flex-shrink-0 flex items-center justify-center gap-2 px-2">
                            {subtask.assignedToName && (
                              <Badge variant="secondary" className="text-xs">
                                {subtask.assignedToName}
                              </Badge>
                            )}
                            {subtask.hasRfq && <Badge variant="outline" className="text-xs">RFQ</Badge>}
                            {subtask.hasPo && <Badge variant="outline" className="text-xs">PO</Badge>}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => deleteSubtaskMutation.mutate(subtask.id)}
                            >
                              <MoreVertical className="w-3 h-3" />
                            </Button>
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
