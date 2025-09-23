import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Settings } from "lucide-react";
import { useLocation } from "wouter";
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
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
} from "@dnd-kit/sortable";

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
  const [, navigate] = useLocation();

  // Setup drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

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

  // Handle drag end event for reordering widgets
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    // Guard against invalid drop targets
    if (!over || active.id === over.id) {
      return;
    }

    setWidgets((widgets) => {
      const oldIndex = widgets.findIndex((widget) => widget.id === active.id);
      const newIndex = widgets.findIndex((widget) => widget.id === over.id);

      // Guard against invalid indices
      if (oldIndex === -1 || newIndex === -1) {
        console.warn('Invalid widget indices during drag operation');
        return widgets;
      }

      return arrayMove(widgets, oldIndex, newIndex);
    });
    console.log(`Moved widget from ${active.id} to ${over.id}`);
  };

  const renderWidget = (widget: Widget) => {
    const definition = getWidgetDefinition(widget.type);
    if (!definition) return null;

    const WidgetComponent = definition.component;
    
    return (
      <WidgetContainer
        key={widget.id}
        widget={widget}
        onUpdate={updateWidget}
        onRemove={removeWidget}
        onConfigure={definition.configurable ? setConfiguringWidget : undefined}
        isConfiguring={configuringWidget === widget.id}
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
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-3xl font-bold">{currentProject.name}</h1>
              <p className="text-muted-foreground">
                {currentProject.description || "No description provided"}
              </p>
            </div>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => navigate('/project-settings')}
              className="text-muted-foreground hover:text-foreground"
              data-testid="button-project-settings"
            >
              <Settings className="h-5 w-5" />
            </Button>
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
              <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden">
                <DialogHeader>
                  <DialogTitle className="text-xl">Widgets Center</DialogTitle>
                  <p className="text-muted-foreground">
                    Choose widgets to add to your project dashboard
                  </p>
                </DialogHeader>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-6 overflow-y-auto pr-2">
                  {Object.values(widgetRegistry).map((definition) => (
                    <Card 
                      key={definition.type}
                      className="cursor-pointer hover-elevate group"
                      onClick={() => addWidget(definition.type)}
                      data-testid={`add-widget-${definition.type}`}
                    >
                      <CardContent className="p-4">
                        <div className="space-y-3">
                          {/* Widget Preview Header */}
                          <div className="flex items-center justify-between">
                            <definition.icon className="h-5 w-5 text-primary" />
                            <div className="h-2 w-16 bg-muted rounded-full">
                              <div className="h-full w-3/4 bg-primary rounded-full"></div>
                            </div>
                          </div>
                          
                          {/* Widget Preview Content */}
                          <div className="space-y-2">
                            <div className="h-3 bg-muted rounded w-full"></div>
                            <div className="h-3 bg-muted rounded w-3/4"></div>
                            <div className="h-3 bg-muted rounded w-1/2"></div>
                          </div>
                          
                          {/* Widget Info */}
                          <div className="pt-2 border-t">
                            <h3 className="font-medium text-sm">{definition.name}</h3>
                            <p className="text-xs text-muted-foreground line-clamp-2">
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

      {/* Widgets Grid with Drag & Drop */}
      <DndContext 
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext 
          items={widgets.map(w => w.id)}
          strategy={rectSortingStrategy}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {widgets.map((widget) => renderWidget(widget))}
            
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
        </SortableContext>
      </DndContext>
    </div>
  );
}