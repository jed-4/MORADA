import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TaskTooltip } from "@/components/ui/task-tooltip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  ListChecks, 
  Plus, 
  ChevronRight, 
  ChevronDown,
  Filter,
  X,
  Check,
  Circle,
  Calendar,
  User,
  ExternalLink
} from "lucide-react";
import { WidgetProps } from "@/types/widgets";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { type ChecklistInstance, type ChecklistInstanceGroup, type ChecklistInstanceItem, type User as UserType } from "@shared/schema";
import { useProject } from "@/contexts/ProjectContext";
import { useLocation } from "wouter";
import { format } from "date-fns";

interface ChecklistInstanceWithCounts extends ChecklistInstance {
  completedCount: number;
  totalCount: number;
}

interface ChecklistGroupWithItems extends ChecklistInstanceGroup {
  items?: ChecklistInstanceItem[];
  completedCount?: number;
  totalCount?: number;
}

type StatusFilter = "all" | "active" | "in_progress" | "completed" | "actionable";

const COLLAPSED_STATE_KEY = "checklist-widget-collapsed";

function getStoredCollapsedState(projectId: string): { checklists: string[]; groups: string[] } {
  try {
    const stored = localStorage.getItem(`${COLLAPSED_STATE_KEY}-${projectId}`);
    if (stored) return JSON.parse(stored);
  } catch {}
  return { checklists: [], groups: [] };
}

function saveCollapsedState(projectId: string, checklists: string[], groups: string[]) {
  try {
    localStorage.setItem(`${COLLAPSED_STATE_KEY}-${projectId}`, JSON.stringify({ checklists, groups }));
  } catch {}
}

export default function ChecklistWidget({ widget, onUpdate, isConfiguring, onCloseConfig }: WidgetProps) {
  const maxChecklists = widget.config?.maxChecklists || 10;
  const wrapText = widget.config?.wrapText || false;
  const savedStatusFilter = (widget.config?.statusFilter as StatusFilter) || "all";
  const savedAssigneeFilter = widget.config?.assigneeFilter || "all";
  
  const [editingTitle, setEditingTitle] = useState(widget.title);
  const [configMaxChecklists, setConfigMaxChecklists] = useState(maxChecklists);
  const [configWrapText, setConfigWrapText] = useState(wrapText);
  
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(savedStatusFilter);
  const [assigneeFilter, setAssigneeFilter] = useState<string>(savedAssigneeFilter);
  const [expandedChecklists, setExpandedChecklists] = useState<Set<string>>(new Set());
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  
  const { currentProject } = useProject();
  
  useEffect(() => {
    setEditingTitle(widget.title);
    setConfigMaxChecklists(widget.config?.maxChecklists || 10);
    setConfigWrapText(widget.config?.wrapText || false);
  }, [widget.title, widget.config]);

  useEffect(() => {
    if (currentProject?.id) {
      const stored = getStoredCollapsedState(currentProject.id);
      setExpandedChecklists(new Set(stored.checklists));
      setExpandedGroups(new Set(stored.groups));
    }
  }, [currentProject?.id]);
  const [, setLocation] = useLocation();
  
  const { data: checklists = [], isLoading } = useQuery<ChecklistInstanceWithCounts[]>({
    queryKey: ["/api/checklist-instances", currentProject?.id],
    queryFn: async () => {
      if (!currentProject?.id) return [];
      const response = await fetch(`/api/checklist-instances?projectId=${currentProject.id}`, {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error(`${response.status}: ${response.statusText}`);
      }
      return response.json();
    },
    enabled: !!currentProject?.id,
  });

  const { data: users = [] } = useQuery<UserType[]>({
    queryKey: ["/api/users"],
  });

  const uniqueAssignees = useMemo(() => {
    const assigneeMap = new Map<string, { id: string; name: string }>();
    checklists.forEach(c => {
      if (c.assigneeId && c.assigneeName) {
        assigneeMap.set(c.assigneeId, { id: c.assigneeId, name: c.assigneeName });
      }
    });
    return Array.from(assigneeMap.values());
  }, [checklists]);

  const filteredChecklists = useMemo(() => {
    return checklists
      .filter(checklist => {
        if (statusFilter === "actionable") {
          if (checklist.status !== "in_progress" && checklist.status !== "active") return false;
        } else if (statusFilter !== "all" && checklist.status !== statusFilter) {
          return false;
        }
        if (assigneeFilter !== "all" && checklist.assigneeId !== assigneeFilter) return false;
        return true;
      });
  }, [checklists, statusFilter, assigneeFilter]);

  const displayChecklists = filteredChecklists.slice(0, maxChecklists);


  const toggleChecklist = (id: string) => {
    setExpandedChecklists(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      if (currentProject?.id) {
        saveCollapsedState(currentProject.id, Array.from(next), Array.from(expandedGroups));
      }
      return next;
    });
  };

  const handleToggleGroup = (groupId: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      if (currentProject?.id) {
        saveCollapsedState(currentProject.id, Array.from(expandedChecklists), Array.from(next));
      }
      return next;
    });
  };

  const getStatusBadgeColor = (status: string) => {
    const colors: Record<string, string> = {
      'active': 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
      'in_progress': 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
      'completed': 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
      'cancelled': 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
    };
    return colors[status] || colors.active;
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      'active': 'Upcoming',
      'in_progress': 'Action',
      'completed': 'Done',
      'cancelled': 'Cancelled',
    };
    return labels[status] || 'Upcoming';
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  if (!currentProject) {
    return (
      <div className="text-center py-4 text-sm text-muted-foreground">
        Select a project to view checklists
      </div>
    );
  }
  
  if (isConfiguring) {
    const handleSaveConfig = () => {
      if (onUpdate) {
        onUpdate({ 
          ...widget, 
          title: editingTitle,
          config: { 
            ...widget.config, 
            maxChecklists: configMaxChecklists,
            wrapText: configWrapText,
            statusFilter: statusFilter,
            assigneeFilter: assigneeFilter,
          }
        });
      }
      onCloseConfig?.();
    };
    
    const handleCancelConfig = () => {
      setEditingTitle(widget.title);
      setConfigMaxChecklists(widget.config?.maxChecklists || 10);
      setConfigWrapText(widget.config?.wrapText || false);
      onCloseConfig?.();
    };
    
    return (
      <div className="space-y-3 p-2">
        <h4 className="text-sm font-medium">Configure Checklists</h4>
        
        <div className="space-y-2">
          <Label className="text-xs">Widget Name</Label>
          <Input 
            value={editingTitle}
            onChange={(e) => setEditingTitle(e.target.value)}
            className="h-7 text-xs"
            placeholder="Widget title"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-xs">Status Filter</Label>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
            <SelectTrigger className="h-7 text-xs" data-testid="checklist-config-status-filter">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="actionable">Actionable</SelectItem>
              <SelectItem value="active">Upcoming</SelectItem>
              <SelectItem value="in_progress">Action</SelectItem>
              <SelectItem value="completed">Done</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="text-xs">Assignee Filter</Label>
          <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
            <SelectTrigger className="h-7 text-xs" data-testid="checklist-config-assignee-filter">
              <SelectValue placeholder="Assignee" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Assignees</SelectItem>
              {uniqueAssignees.map(a => (
                <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        <div className="space-y-2">
          <Label className="text-xs">Max Items to Show</Label>
          <Input 
            type="number"
            min={1}
            max={50}
            value={configMaxChecklists}
            onChange={(e) => setConfigMaxChecklists(parseInt(e.target.value) || 10)}
            className="h-7 text-xs w-20"
          />
        </div>

        <div className="flex items-center justify-between">
          <Label className="text-xs">Wrap Long Text</Label>
          <Switch 
            checked={configWrapText}
            onCheckedChange={setConfigWrapText}
          />
        </div>
        
        <div className="flex justify-end gap-2 pt-2">
          <Button size="sm" variant="outline" onClick={handleCancelConfig} className="h-6 px-2 text-xs">
            Cancel
          </Button>
          <Button size="sm" onClick={handleSaveConfig} className="h-6 px-2 text-xs">
            Save
          </Button>
        </div>
      </div>
    );
  }

  const allExpanded = displayChecklists.length > 0 && displayChecklists.every(c => expandedChecklists.has(c.id));
  
  const toggleAll = () => {
    if (allExpanded) {
      setExpandedChecklists(new Set());
      if (currentProject?.id) {
        saveCollapsedState(currentProject.id, [], Array.from(expandedGroups));
      }
    } else {
      const allIds = new Set(displayChecklists.map(c => c.id));
      setExpandedChecklists(allIds);
      if (currentProject?.id) {
        saveCollapsedState(currentProject.id, Array.from(allIds), Array.from(expandedGroups));
      }
    }
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-end gap-1">
        <Button 
          size="icon" 
          variant="ghost"
          onClick={toggleAll}
          data-testid="checklist-widget-toggle-all"
        >
          {allExpanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </Button>
        <Button 
          size="icon" 
          variant="ghost"
          onClick={() => setLocation(`/projects/${currentProject.id}/checklists`)}
          data-testid="checklist-widget-view-all"
        >
          <ExternalLink className="h-4 w-4" />
        </Button>
      </div>
      
      <div className="space-y-1">
        {isLoading ? (
          <div className="space-y-1">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse border rounded-md p-2">
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 bg-muted rounded" />
                  <div className="flex-1">
                    <div className="h-3 bg-muted rounded w-3/4 mb-1" />
                    <div className="h-2 bg-muted rounded w-1/2" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : displayChecklists.length === 0 ? (
          <div className="text-center py-4 text-xs text-muted-foreground">
            {(statusFilter !== "all" || assigneeFilter !== "all") ? "No checklists match filters" : "No checklists yet"}
          </div>
        ) : (
          displayChecklists.map((checklist) => (
            <ChecklistAccordionItem
              key={checklist.id}
              checklist={checklist}
              isExpanded={expandedChecklists.has(checklist.id)}
              onToggle={() => toggleChecklist(checklist.id)}
              wrapText={wrapText}
              projectId={currentProject.id}
              getStatusBadgeColor={getStatusBadgeColor}
              getStatusLabel={getStatusLabel}
              getInitials={getInitials}
              expandedGroups={expandedGroups}
              onToggleGroup={handleToggleGroup}
            />
          ))
        )}
      </div>
    </div>
  );
}

function ChecklistAccordionItem({
  checklist,
  isExpanded,
  onToggle,
  wrapText,
  projectId,
  getStatusBadgeColor,
  getStatusLabel,
  getInitials,
  expandedGroups,
  onToggleGroup,
}: {
  checklist: ChecklistInstanceWithCounts;
  isExpanded: boolean;
  onToggle: () => void;
  wrapText: boolean;
  projectId: string;
  getStatusBadgeColor: (status: string) => string;
  getStatusLabel: (status: string) => string;
  getInitials: (name: string) => string;
  expandedGroups: Set<string>;
  onToggleGroup: (groupId: string) => void;
}) {
  const [, setLocation] = useLocation();
  const progressPercent = checklist.totalCount > 0 
    ? Math.round((checklist.completedCount / checklist.totalCount) * 100) 
    : 0;

  const { data: groups = [] } = useQuery<ChecklistGroupWithItems[]>({
    queryKey: ["/api/checklist-instances", checklist.id, "groups"],
    queryFn: async () => {
      const response = await fetch(`/api/checklist-instances/${checklist.id}/groups`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch groups");
      return response.json();
    },
    enabled: isExpanded,
  });

  return (
    <Collapsible open={isExpanded} onOpenChange={onToggle}>
      <div className="border rounded-md overflow-hidden">
        <CollapsibleTrigger asChild>
          <div 
            className="flex items-center gap-2 py-1.5 px-2 hover-elevate cursor-pointer pt-[0px] pb-[0px]"
            data-testid={`checklist-widget-item-${checklist.id}`}
          >
            {isExpanded ? (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            )}
            
            <TaskTooltip content={checklist.name}>
              <span className={`text-xs font-medium flex-1 min-w-0 ${wrapText ? '' : 'truncate'}`}>
                {checklist.name}
              </span>
            </TaskTooltip>
            
            <Badge 
              className={`${getStatusBadgeColor(checklist.status)} text-[10px] px-1.5 py-0 h-4 flex-shrink-0 no-default-hover-elevate no-default-active-elevate`}
            >
              {getStatusLabel(checklist.status)}
            </Badge>
            
            {checklist.dueDate && (
              <div className="flex items-center gap-0.5 text-[10px] text-muted-foreground flex-shrink-0">
                <Calendar className="h-2.5 w-2.5" />
                {format(new Date(checklist.dueDate), "MMM d")}
              </div>
            )}
            
            {checklist.assigneeName && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Avatar className="h-4 w-4 flex-shrink-0">
                    <AvatarFallback className="text-[8px] bg-primary/10 text-primary">
                      {getInitials(checklist.assigneeName)}
                    </AvatarFallback>
                  </Avatar>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p className="text-xs">{checklist.assigneeName}</p>
                </TooltipContent>
              </Tooltip>
            )}
            
            <div className="flex items-center gap-1 flex-shrink-0">
              <Progress value={progressPercent} className="h-1.5 w-12" />
              <span className="text-[10px] text-muted-foreground">
                {checklist.completedCount}/{checklist.totalCount}
              </span>
            </div>

            <Button
              size="sm"
              variant="ghost"
              className="h-5 w-5 p-0 flex-shrink-0"
              onClick={(e) => {
                e.stopPropagation();
                setLocation(`/projects/${projectId}/checklists/${checklist.id}`);
              }}
              data-testid={`checklist-open-${checklist.id}`}
            >
              <ExternalLink className="h-3 w-3" />
            </Button>
          </div>
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          <div className="border-t bg-muted/30 px-2 py-1 space-y-0.5">
            {groups.length === 0 ? (
              <div className="text-[10px] text-muted-foreground text-center py-1">
                No checklists in this group
              </div>
            ) : (
              groups.map((group) => (
                <ChecklistGroupItem
                  key={group.id}
                  group={group}
                  checklistId={checklist.id}
                  projectId={projectId}
                  wrapText={wrapText}
                  isExpanded={expandedGroups.has(group.id)}
                  onToggle={() => onToggleGroup(group.id)}
                  getStatusBadgeColor={getStatusBadgeColor}
                  getStatusLabel={getStatusLabel}
                  getInitials={getInitials}
                />
              ))
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

function ChecklistGroupItem({
  group,
  checklistId,
  projectId,
  wrapText,
  isExpanded,
  onToggle,
  getStatusBadgeColor,
  getStatusLabel,
  getInitials,
}: {
  group: ChecklistGroupWithItems;
  checklistId: string;
  projectId: string;
  wrapText: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  getStatusBadgeColor: (status: string) => string;
  getStatusLabel: (status: string) => string;
  getInitials: (name: string) => string;
}) {
  const [, setLocation] = useLocation();

  const { data: items = [] } = useQuery<ChecklistInstanceItem[]>({
    queryKey: ["/api/checklist-instance-groups", group.id, "items"],
    queryFn: async () => {
      const response = await fetch(`/api/checklist-instance-groups/${group.id}/items`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch items");
      return response.json();
    },
    enabled: isExpanded,
  });

  const completedCount = items.filter(i => i.status === "completed" || i.status === "na").length;
  const totalCount = items.length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const updateItemMutation = useMutation({
    mutationFn: async ({ itemId, status }: { itemId: string; status: string }) => {
      return apiRequest(`/api/checklist-instance-items/${itemId}`, "PATCH", { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/checklist-instance-groups", group.id, "items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/checklist-instances", checklistId, "groups"] });
      queryClient.invalidateQueries({ queryKey: ["/api/checklist-instances"] });
    },
  });

  const toggleItemComplete = (item: ChecklistInstanceItem) => {
    const newStatus = item.status === "completed" ? "pending" : "completed";
    updateItemMutation.mutate({ itemId: item.id, status: newStatus });
  };

  return (
    <Collapsible open={isExpanded} onOpenChange={onToggle}>
      <CollapsibleTrigger asChild>
        <div 
          className="flex items-center gap-1 py-0.5 px-1 rounded hover-elevate cursor-pointer"
          data-testid={`checklist-group-${group.id}`}
        >
          {isExpanded ? (
            <ChevronDown className="h-2.5 w-2.5 text-muted-foreground flex-shrink-0" />
          ) : (
            <ChevronRight className="h-2.5 w-2.5 text-muted-foreground flex-shrink-0" />
          )}
          
          <TaskTooltip content={group.name}>
            <span className={`text-[10px] flex-1 min-w-0 pt-[1px] pb-[1px] ${wrapText ? '' : 'truncate'}`}>
              {group.name}
            </span>
          </TaskTooltip>

          <Badge 
            className={`${getStatusBadgeColor(group.status)} text-[8px] px-0.5 py-0 h-3 flex-shrink-0 no-default-hover-elevate no-default-active-elevate`}
          >
            {getStatusLabel(group.status)}
          </Badge>

          {group.assigneeName && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Avatar className="h-3 w-3 flex-shrink-0">
                  <AvatarFallback className="text-[6px] bg-primary/10 text-primary">
                    {getInitials(group.assigneeName)}
                  </AvatarFallback>
                </Avatar>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p className="text-xs">{group.assigneeName}</p>
              </TooltipContent>
            </Tooltip>
          )}
          
          {isExpanded && totalCount > 0 && (
            <div className="flex items-center gap-0.5 flex-shrink-0">
              <Progress value={progressPercent} className="h-0.5 w-8" />
              <span className="text-[8px] text-muted-foreground">
                {completedCount}/{totalCount}
              </span>
            </div>
          )}
        </div>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="ml-4 pl-2 border-l border-muted space-y-0.5 py-1">
          {items.length === 0 ? (
            <div className="text-xs text-muted-foreground py-1">No items</div>
          ) : (
            items.slice(0, 10).map((item) => (
              <div 
                key={item.id}
                className="flex items-center gap-2 py-0.5 group"
                data-testid={`checklist-item-${item.id}`}
              >
                <button
                  onClick={() => toggleItemComplete(item)}
                  className="flex-shrink-0 hover:scale-110 transition-transform"
                  disabled={updateItemMutation.isPending}
                  data-testid={`checklist-item-toggle-${item.id}`}
                >
                  {item.status === "completed" ? (
                    <Check className="h-3.5 w-3.5 text-green-600" />
                  ) : item.status === "na" ? (
                    <X className="h-3.5 w-3.5 text-gray-400" />
                  ) : (
                    <Circle className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary" />
                  )}
                </button>
                
                <TaskTooltip content={item.description}>
                  <span className={`text-xs flex-1 ${wrapText ? '' : 'truncate'} ${
                    item.status === "completed" ? "line-through text-muted-foreground" : ""
                  }`}>
                    {item.description}
                  </span>
                </TaskTooltip>
              </div>
            ))
          )}
          {items.length > 10 && (
            <div className="text-xs text-muted-foreground pt-1">
              +{items.length - 10} more items
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
