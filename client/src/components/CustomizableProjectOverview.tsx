import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Settings } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Widget } from "@/types/widgets";
import { widgetRegistry, getWidgetDefinition } from "./widgets/WidgetRegistry";
import WidgetContainer from "./widgets/WidgetContainer";
import { useProject } from "@/contexts/ProjectContext";

// todo: remove mock functionality - Default template setup
const defaultWidgets: Widget[] = [
  {
    id: "1",
    type: "metrics",
    title: "Project Metrics",
    size: "lg",
    config: { metrics: ["budget", "timeline", "completion"] },
  },
  {
    id: "2", 
    type: "tasks",
    title: "Upcoming Tasks",
    size: "md",
    config: { maxTasks: 4, showCompleted: false },
  },
  {
    id: "3",
    type: "schedule",
    title: "Schedule",
    size: "md", 
    config: { maxItems: 4, showOverdue: true },
  },
  {
    id: "4",
    type: "notes",
    title: "Project Notes",
    size: "md",
    config: { maxNotes: 3 },
  },
];

export default function CustomizableProjectOverview() {
  const { currentProject } = useProject();
  const [widgets, setWidgets] = useState<Widget[]>(defaultWidgets);
  const [isAddingWidget, setIsAddingWidget] = useState(false);
  const [configuringWidget, setConfiguringWidget] = useState<string | null>(null);

  // Show loading state if no project is selected
  if (!currentProject) {
    return (
      <div className="p-6 space-y-6" data-testid="customizable-project-overview">
        <div className="text-center py-12 text-muted-foreground">
          <h2 className="text-xl font-medium mb-2">No Project Selected</h2>
          <p>Please select a project from the dropdown to view its overview.</p>
        </div>
      </div>
    );
  }

  const addWidget = (type: string) => {
    const definition = getWidgetDefinition(type);
    if (!definition) return;

    const newWidget: Widget = {
      id: Date.now().toString(),
      type,
      title: definition.name,
      size: definition.defaultSize,
      config: {},
    };

    setWidgets(prev => [...prev, newWidget]);
    setIsAddingWidget(false);
    console.log(`Added widget: ${type}`);
  };

  const removeWidget = (widgetId: string) => {
    setWidgets(prev => prev.filter(w => w.id !== widgetId));
    console.log(`Removed widget: ${widgetId}`);
  };

  const updateWidget = (updatedWidget: Widget) => {
    setWidgets(prev => prev.map(w => w.id === updatedWidget.id ? updatedWidget : w));
    console.log(`Updated widget: ${updatedWidget.id}`);
  };

  const moveWidgetUp = (widgetId: string) => {
    setWidgets(prev => {
      const currentIndex = prev.findIndex(w => w.id === widgetId);
      if (currentIndex <= 0) return prev;
      
      const newWidgets = [...prev];
      [newWidgets[currentIndex - 1], newWidgets[currentIndex]] = 
        [newWidgets[currentIndex], newWidgets[currentIndex - 1]];
      
      return newWidgets;
    });
    console.log(`Moved widget up: ${widgetId}`);
  };

  const moveWidgetDown = (widgetId: string) => {
    setWidgets(prev => {
      const currentIndex = prev.findIndex(w => w.id === widgetId);
      if (currentIndex < 0 || currentIndex >= prev.length - 1) return prev;
      
      const newWidgets = [...prev];
      [newWidgets[currentIndex], newWidgets[currentIndex + 1]] = 
        [newWidgets[currentIndex + 1], newWidgets[currentIndex]];
      
      return newWidgets;
    });
    console.log(`Moved widget down: ${widgetId}`);
  };

  const renderWidget = (widget: Widget, index: number) => {
    const definition = getWidgetDefinition(widget.type);
    if (!definition) return null;

    const WidgetComponent = definition.component;
    const canMoveUp = index > 0;
    const canMoveDown = index < widgets.length - 1;
    
    return (
      <WidgetContainer
        key={widget.id}
        widget={widget}
        onUpdate={updateWidget}
        onRemove={removeWidget}
        onConfigure={definition.configurable ? setConfiguringWidget : undefined}
        onMoveUp={moveWidgetUp}
        onMoveDown={moveWidgetDown}
        isConfiguring={configuringWidget === widget.id}
        canMoveUp={canMoveUp}
        canMoveDown={canMoveDown}
      >
        <WidgetComponent
          widget={widget}
          onUpdate={updateWidget}
          onRemove={removeWidget}
          isConfiguring={configuringWidget === widget.id}
        />
      </WidgetContainer>
    );
  };

  return (
    <div className="p-6 space-y-6" data-testid="customizable-project-overview">
      {/* Project Header */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">{currentProject.name}</h1>
            <p className="text-muted-foreground">
              {currentProject.description || "No description provided"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
              In Progress
            </Badge>
            <Dialog open={isAddingWidget} onOpenChange={setIsAddingWidget}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" data-testid="add-widget-button">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Widget
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Widget to Dashboard</DialogTitle>
                </DialogHeader>
                <div className="grid grid-cols-1 gap-3 mt-4">
                  {Object.values(widgetRegistry).map((definition) => (
                    <Card 
                      key={definition.type}
                      className="cursor-pointer hover-elevate"
                      onClick={() => addWidget(definition.type)}
                      data-testid={`add-widget-${definition.type}`}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                          <definition.icon className="h-6 w-6 text-primary" />
                          <div>
                            <h3 className="font-medium">{definition.name}</h3>
                            <p className="text-sm text-muted-foreground">
                              {definition.description}
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </DialogContent>
            </Dialog>
            <Button variant="outline" size="sm" data-testid="customize-dashboard-button">
              <Settings className="h-4 w-4 mr-2" />
              Customize
            </Button>
          </div>
        </div>
      </div>

      {/* Widgets Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {widgets.map((widget, index) => renderWidget(widget, index))}
        
        {widgets.length === 0 && (
          <div className="col-span-full">
            <Card className="border-dashed">
              <CardContent className="p-8 text-center">
                <div className="space-y-3">
                  <div className="text-muted-foreground">
                    <Settings className="h-12 w-12 mx-auto mb-4" />
                    <h3 className="text-lg font-medium">Customize Your Dashboard</h3>
                    <p className="text-sm">Add widgets to create your personalized project overview</p>
                  </div>
                  <Button onClick={() => setIsAddingWidget(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Your First Widget
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}