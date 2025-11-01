import React, { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { Plus, Settings, Filter } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import TaskBoard from "@/components/TaskBoard";
import TaskListCompact from "@/components/TaskListCompact";
import TaskModalAsana from "@/components/TaskModalAsana";
import FilterPanel, { type FilterState } from "@/components/FilterPanel";
import { TaskCalendar } from "@/components/TaskCalendar";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { type Task, type FieldCategoryWithOptions } from "@shared/schema";
import { applyTaskFilters, extractFilterOptions } from "@/utils/taskFilters";
import { useToast } from "@/hooks/use-toast";

export default function BusinessTasks() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("list");
  const [showCreateTaskDialog, setShowCreateTaskDialog] = useState(false);
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [groupBy, setGroupBy] = useState<'none' | 'status' | 'priority' | 'assignee' | 'tags'>('none');
  const [filters, setFilters] = useState<FilterState>({});
  const [cardDisplaySettings, setCardDisplaySettings] = useState({
    showPriority: true,
    showStatus: true,
    showDescription: true,
    showTags: true,
    showLabels: true,
    showAssignee: true,
    showDueDate: true,
    showSubtasks: true,
  });

  // Load card display settings from localStorage
  React.useEffect(() => {
    const savedSettings = localStorage.getItem('cardDisplay_businessTasks');
    if (savedSettings) {
      try {
        setCardDisplaySettings(JSON.parse(savedSettings));
      } catch (e) {
        console.error('Failed to parse card display settings:', e);
      }
    }
  }, []);

  // Save card display settings to localStorage when they change
  React.useEffect(() => {
    localStorage.setItem('cardDisplay_businessTasks', JSON.stringify(cardDisplaySettings));
  }, [cardDisplaySettings]);

  // Fetch business tasks (tasks without a project)
  const { data: allTasks = [], isLoading: tasksLoading } = useQuery<Task[]>({
    queryKey: ["/api/tasks", { businessTasks: true }], 
    queryFn: async () => {
      const response = await fetch('/api/tasks?businessTasks=true', {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch business tasks');
      return response.json();
    },
  });

  // Fetch task status options from field categories
  const { data: fieldCategories = [] } = useQuery<FieldCategoryWithOptions[]>({
    queryKey: ["/api/field-categories"],
  });

  // Group tasks based on selected grouping
  const groupedTasks = React.useMemo(() => {
    const filterOptions = extractFilterOptions(allTasks);
    const filteredTasks = applyTaskFilters(allTasks, filters);
    
    if (groupBy === 'none' || activeTab !== 'list') {
      return { 'All Tasks': filteredTasks };
    }

    const groups: Record<string, Task[]> = {};
    
    filteredTasks.forEach((task) => {
      let groupKey = 'Ungrouped';
      
      switch (groupBy) {
        case 'status':
          groupKey = task.status?.charAt(0).toUpperCase() + task.status?.slice(1) || 'No Status';
          break;
        case 'priority':
          groupKey = task.priority?.charAt(0).toUpperCase() + task.priority?.slice(1) || 'No Priority';
          break;
        case 'assignee':
          groupKey = task.assignee || 'Unassigned';
          break;
        case 'tags':
          groupKey = task.tags && task.tags.length > 0 ? task.tags[0] : 'No Tags';
          break;
      }
      
      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey].push(task);
    });
    
    // Sort groups by name
    const sortedGroups: Record<string, Task[]> = {};
    Object.keys(groups).sort().forEach(key => {
      sortedGroups[key] = groups[key];
    });
    
    return sortedGroups;
  }, [allTasks, filters, groupBy, activeTab]);

  const filterOptions = extractFilterOptions(allTasks);

  return (
    <div className="flex flex-col h-full" data-testid="business-tasks">
      <div className="flex-1 min-h-0 p-6">
        <div className="flex flex-col gap-4 h-full">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">Business Tasks</h1>
              <p className="text-muted-foreground text-sm">
                Company-wide tasks not tied to specific projects
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowFilterPanel(!showFilterPanel)}
                data-testid="button-toggle-filters"
              >
                <Filter className="h-4 w-4 mr-2" />
                Filters
              </Button>
              <Button onClick={() => setShowCreateTaskDialog(true)} data-testid="button-create-task">
                <Plus className="h-4 w-4 mr-2" />
                New Task
              </Button>
            </div>
          </div>

          {showFilterPanel && (
            <FilterPanel
              filters={filters}
              onFiltersChange={setFilters}
              filterOptions={filterOptions}
              onClose={() => setShowFilterPanel(false)}
            />
          )}

          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
            <TabsList>
              <TabsTrigger value="list" data-testid="tab-list">List</TabsTrigger>
              <TabsTrigger value="kanban" data-testid="tab-kanban">Kanban</TabsTrigger>
              <TabsTrigger value="calendar" data-testid="tab-calendar">Calendar</TabsTrigger>
            </TabsList>

            <TabsContent value="kanban" className="flex-1 min-h-0 mt-4" data-testid="content-kanban">
              <TaskBoard
                tasks={applyTaskFilters(allTasks, filters)}
                isLoading={tasksLoading}
                onTaskClick={(task) => {
                  setEditingTask(task);
                  setShowCreateTaskDialog(true);
                }}
                cardDisplaySettings={cardDisplaySettings}
              />
            </TabsContent>

            <TabsContent value="list" className="flex-1 min-h-0 mt-4" data-testid="content-list">
              <TaskListCompact
                groupedTasks={groupedTasks}
                isLoading={tasksLoading}
                onTaskClick={(task) => {
                  setEditingTask(task);
                  setShowCreateTaskDialog(true);
                }}
              />
            </TabsContent>

            <TabsContent value="calendar" className="flex-1 min-h-0 mt-4" data-testid="content-calendar">
              <TaskCalendar
                tasks={applyTaskFilters(allTasks, filters)}
                onTaskClick={(task) => {
                  setEditingTask(task);
                  setShowCreateTaskDialog(true);
                }}
                onDateSelect={(date) => {
                  setShowCreateTaskDialog(true);
                }}
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Task Creation Dialog */}
      {!editingTask && (
        <TaskModalAsana 
          open={showCreateTaskDialog}
          onOpenChange={(open) => {
            setShowCreateTaskDialog(open);
            if (!open) setEditingTask(null);
          }}
          projectId=""
        />
      )}

      {/* Task Editing Dialog */}
      {editingTask && (
        <TaskModalAsana
          task={editingTask}
          open={showCreateTaskDialog}
          onOpenChange={(open) => {
            setShowCreateTaskDialog(open);
            if (!open) setEditingTask(null);
          }}
          projectId={editingTask.projectId || ""}
        />
      )}
    </div>
  );
}
