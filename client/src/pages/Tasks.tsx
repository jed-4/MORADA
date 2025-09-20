import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { Plus, Settings, Filter, MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import TaskBoard from "@/components/TaskBoard";
import TaskList from "@/components/TaskList";
import { type TaskView } from "@shared/schema";

export default function Tasks() {
  const [activeTab, setActiveTab] = useState("kanban");
  const [showViewSettings, setShowViewSettings] = useState(false);

  // Fetch saved task views
  const { data: taskViews = [] } = useQuery<TaskView[]>({
    queryKey: ["/api/task-views"],
  });

  // Default views
  const defaultViews = [
    { id: "kanban", name: "Kanban Board", viewType: "kanban" },
    { id: "list", name: "List View", viewType: "list" },
  ];

  const allViews = [...defaultViews, ...taskViews];

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-border p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <h1 className="text-2xl font-semibold" data-testid="text-page-title">
              Tasks
            </h1>
            <Badge variant="secondary" data-testid="text-task-count">
              All Projects
            </Badge>
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowViewSettings(true)}
              data-testid="button-view-settings"
            >
              <Settings className="h-4 w-4 mr-2" />
              View Settings
            </Button>
            <Button
              variant="outline"
              size="sm"
              data-testid="button-filter"
            >
              <Filter className="h-4 w-4 mr-2" />
              Filter
            </Button>
            <Button size="sm" data-testid="button-add-task">
              <Plus className="h-4 w-4 mr-2" />
              Add Task
            </Button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
        <div className="border-b border-border px-4">
          <div className="flex items-center justify-between">
            <TabsList className="grid w-auto grid-cols-fit gap-0" data-testid="tabs-task-views">
              {allViews.map((view) => (
                <TabsTrigger
                  key={view.id}
                  value={view.id}
                  className="data-[state=active]:bg-background data-[state=active]:text-foreground relative"
                  data-testid={`tab-${view.id}`}
                >
                  {view.name}
                  {view.viewType === "list" && (
                    <Badge variant="outline" className="ml-2 text-xs">
                      NEW
                    </Badge>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>
            
            {/* View Management Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" data-testid="button-view-menu">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem data-testid="menu-create-view">
                  <Plus className="h-4 w-4 mr-2" />
                  Create New View
                </DropdownMenuItem>
                <DropdownMenuItem data-testid="menu-manage-views">
                  <Settings className="h-4 w-4 mr-2" />
                  Manage Views
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-hidden">
          <TabsContent value="kanban" className="h-full m-0 data-[state=active]:flex">
            <TaskBoard />
          </TabsContent>
          
          <TabsContent value="list" className="h-full m-0 data-[state=active]:flex">
            <TaskList />
          </TabsContent>
          
          {/* Custom Views */}
          {taskViews.map((view) => (
            <TabsContent key={view.id} value={view.id} className="h-full m-0 data-[state=active]:flex">
              {view.viewType === "kanban" ? (
                <TaskBoard filters={view.filters as Record<string, any>} />
              ) : (
                <TaskList filters={view.filters as Record<string, any>} columnConfig={view.columnConfig as Record<string, any>} />
              )}
            </TabsContent>
          ))}
        </div>
      </Tabs>
    </div>
  );
}