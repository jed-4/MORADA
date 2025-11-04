import { useState, useRef, useEffect, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { type Project, type FieldOption } from "@shared/schema";
import { useLocation } from "wouter";
import { ChevronLeft, ChevronRight, Columns3, Settings2, Settings, GripVertical } from "lucide-react";
import ProjectCardCompact from "./ProjectCardCompact";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

// DnD Kit imports
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  useDroppable,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface ProjectBoardProps {
  projects: Project[];
  isLoading: boolean;
}

type GroupBy = "parent" | "substatus";
type ColumnWidth = 'small' | 'medium' | 'wide';

interface VisibleFields {
  client: boolean;
  budget: boolean;
  stage: boolean;
  dueDate: boolean;
  progress: boolean;
  foreman: boolean;
}

interface ViewPreferences {
  groupBy: GroupBy;
  columnWidth: ColumnWidth;
  visibleFields: VisibleFields;
}

const DEFAULT_PREFERENCES: ViewPreferences = {
  groupBy: "parent",
  columnWidth: "medium",
  visibleFields: {
    client: true,
    budget: true,
    stage: true,
    dueDate: true,
    progress: true,
    foreman: true,
  },
};

const STORAGE_KEY = "projectBoardPreferences";
const CARD_FIELDS_STORAGE_KEY = "projectCardFieldsPreferences";

interface CardField {
  id: string;
  label: string;
  visible: boolean;
  order: number;
}

const DEFAULT_CARD_FIELDS: CardField[] = [
  { id: "client", label: "Client", visible: true, order: 0 },
  { id: "budget", label: "Budget", visible: true, order: 1 },
  { id: "stage", label: "Stage", visible: true, order: 2 },
  { id: "dueDate", label: "Due Date", visible: true, order: 3 },
  { id: "progress", label: "Progress %", visible: false, order: 4 },
  { id: "foreman", label: "Foreman", visible: true, order: 5 },
];

// Draggable Field Row for Edit Card Fields dialog
function DraggableFieldRow({
  field,
  onToggle,
}: {
  field: CardField;
  onToggle: (id: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: field.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 h-10 px-3 rounded-md border-2 bg-background ${
        isDragging ? "opacity-50 shadow-lg" : "border-border"
      }`}
      data-testid={`field-row-${field.id}`}
    >
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing touch-none"
      >
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </div>
      
      <Checkbox
        id={field.id}
        checked={field.visible}
        onCheckedChange={() => onToggle(field.id)}
        data-testid={`checkbox-field-${field.id}`}
      />
      
      <label
        htmlFor={field.id}
        className="flex-1 text-sm font-medium cursor-pointer"
        style={{ color: field.visible ? "#bba7db" : "inherit" }}
      >
        {field.label}
      </label>
    </div>
  );
}

// Draggable Project Card wrapper
function DraggableProjectCard({ 
  project, 
  onClick,
  visibleFields 
}: { 
  project: Project; 
  onClick?: () => void;
  visibleFields: VisibleFields;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: project.id,
    data: {
      type: "project",
      project,
    },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="touch-none"
    >
      <ProjectCardCompact 
        project={project} 
        onClick={onClick} 
        isDragging={isDragging}
        visibleFields={visibleFields}
      />
    </div>
  );
}

// Loading skeleton card - exactly 80px (h-20)
function SkeletonCard() {
  return (
    <div className="h-20 rounded-lg border border-border/50 bg-muted/20 animate-pulse p-2">
      <div className="flex items-start gap-1.5">
        <div className="w-3.5 h-3.5 bg-muted rounded mt-0.5" />
        <div className="flex-1 space-y-1.5">
          <div className="h-3 bg-muted rounded w-3/4" />
          <div className="h-2 bg-muted rounded w-1/2" />
        </div>
      </div>
      <div className="flex items-center justify-between mt-2">
        <div className="h-3 w-16 bg-muted rounded-full" />
        <div className="w-5 h-5 bg-muted rounded-full" />
      </div>
    </div>
  );
}

// Droppable Column wrapper
function DroppableColumn({ 
  column, 
  projects,
  onProjectClick,
  visibleFields,
}: { 
  column: { id: string; title: string; color: string }; 
  projects: Project[];
  onProjectClick?: (project: Project) => void;
  visibleFields: VisibleFields;
}) {
  const {
    setNodeRef,
    isOver,
  } = useDroppable({
    id: column.id,
    data: {
      type: "column",
      column,
    },
  });

  return (
    <div
      ref={setNodeRef}
      className={`rounded-lg border transition-all duration-200 ${
        isOver ? 'border-2 border-blue-500 border-dashed bg-blue-500/5' : 'border-border bg-background'
      }`}
    >
      {/* Column Header */}
      <div className="px-3 py-2 border-b border-border/50 bg-muted/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-full flex-shrink-0"
              style={{ backgroundColor: column.color }}
            />
            <h3 className="text-sm font-semibold text-foreground">{column.title}</h3>
          </div>
          <Badge variant="secondary" className="text-xs px-2 py-0 h-5 rounded-full bg-muted/50 no-default-hover-elevate">
            {projects.length}
          </Badge>
        </div>
      </div>

      {/* Cards Container - max height with scroll */}
      <div className="p-2 space-y-1.5 max-h-[calc(100vh-300px)] overflow-y-auto">
        <SortableContext items={projects.map(project => project.id)} strategy={verticalListSortingStrategy}>
          {projects.length === 0 ? (
            <div className="text-center py-12 text-xs text-muted-foreground">
              No projects
            </div>
          ) : (
            projects.map((project) => (
              <DraggableProjectCard 
                key={project.id} 
                project={project} 
                onClick={() => onProjectClick?.(project)}
                visibleFields={visibleFields}
              />
            ))
          )}
        </SortableContext>
      </div>
    </div>
  );
}

export function ProjectBoard({ projects, isLoading }: ProjectBoardProps) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  
  // Load preferences from localStorage
  const [preferences, setPreferences] = useState<ViewPreferences>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? { ...DEFAULT_PREFERENCES, ...JSON.parse(stored) } : DEFAULT_PREFERENCES;
    } catch {
      return DEFAULT_PREFERENCES;
    }
  });

  // Edit Card Fields dialog state
  const [cardFieldsDialogOpen, setCardFieldsDialogOpen] = useState(false);
  const [cardFields, setCardFields] = useState<CardField[]>(() => {
    try {
      const stored = localStorage.getItem(CARD_FIELDS_STORAGE_KEY);
      return stored ? JSON.parse(stored) : DEFAULT_CARD_FIELDS;
    } catch {
      return DEFAULT_CARD_FIELDS;
    }
  });

  // Active field for drag overlay
  const [activeField, setActiveField] = useState<CardField | null>(null);

  // Save preferences to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  }, [preferences]);

  // Scroll container ref for navigation
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [showNavigation, setShowNavigation] = useState(false);

  // Navigation functions for smooth scrolling
  const scrollLeft = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({
        left: -344, // Scroll by column width (320px) + gap (24px)
        behavior: 'smooth'
      });
    }
  };
  
  const scrollRight = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({
        left: 344, // Scroll by column width (320px) + gap (24px)
        behavior: 'smooth'
      });
    }
  };

  // Get column width class based on setting
  const getColumnWidthClass = () => {
    switch (preferences.columnWidth) {
      case 'small':
        return 'w-60'; // 240px
      case 'wide':
        return 'w-[400px]'; // 400px
      case 'medium':
      default:
        return 'w-80'; // 320px (default)
    }
  };

  // Set up drag sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  // Fetch project status field options
  const { data: statusOptions = [], isLoading: isLoadingStatuses } = useQuery<FieldOption[]>({
    queryKey: ['/api/field-options', 'project.status'],
    queryFn: async () => {
      const response = await fetch('/api/field-categories/by-key/project.status');
      if (!response.ok) return [];
      const category = await response.json();
      if (!category?.id) return [];
      
      const optionsResponse = await fetch(`/api/field-categories/${category.id}/options`);
      if (!optionsResponse.ok) return [];
      return await optionsResponse.json();
    },
  });

  // Get parent statuses and substatus options
  const parentStatuses = useMemo(
    () => statusOptions.filter(opt => !opt.parentId).sort((a, b) => a.sortOrder - b.sortOrder),
    [statusOptions]
  );

  const subStatuses = useMemo(
    () => statusOptions.filter(opt => opt.parentId).sort((a, b) => a.sortOrder - b.sortOrder),
    [statusOptions]
  );

  // Build columns based on grouping preference
  const columns = useMemo(() => {
    const mainColumns = preferences.groupBy === "parent"
      ? parentStatuses.map(status => ({
          id: status.key,
          title: status.name,
          color: status.color || "#6b7280",
          filterFn: (p: Project) => p.projectStatus === status.key,
        }))
      : subStatuses.map(status => ({
          id: status.key,
          title: status.name,
          color: status.color || "#6b7280",
          parentId: status.parentId,
          filterFn: (p: Project) => p.projectSubStatus === status.key,
        }));

    return mainColumns;
  }, [preferences.groupBy, parentStatuses, subStatuses]);

  // Robust overflow detection using ResizeObserver
  useEffect(() => {
    const checkOverflow = () => {
      if (scrollContainerRef.current) {
        const container = scrollContainerRef.current;
        const hasOverflow = container.scrollWidth > container.clientWidth;
        setShowNavigation(hasOverflow);
      }
    };

    const container = scrollContainerRef.current;
    if (!container) return;

    // Use ResizeObserver for better detection of size changes
    const resizeObserver = new ResizeObserver(() => {
      // Small delay to ensure content layout is complete
      requestAnimationFrame(checkOverflow);
    });

    resizeObserver.observe(container);

    // Initial check after content loads
    const timer = setTimeout(checkOverflow, 100);

    return () => {
      resizeObserver.disconnect();
      clearTimeout(timer);
    };
  }, [columns]);

  // Move project to different column
  const moveProjectMutation = useMutation({
    mutationFn: async ({ projectId, newStatus, newSubStatus }: { 
      projectId: string; 
      newStatus?: string;
      newSubStatus?: string;
    }) => {
      const updateData = preferences.groupBy === "parent" 
        ? { projectStatus: newStatus }
        : { projectSubStatus: newSubStatus };
      
      const response = await apiRequest(`/api/projects/${projectId}`, "PATCH", updateData);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({ title: "Project moved successfully" });
    },
    onError: (error) => {
      toast({ 
        title: "Failed to move project", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  const updatePreference = <K extends keyof ViewPreferences>(
    key: K,
    value: ViewPreferences[K]
  ) => {
    setPreferences(prev => ({ ...prev, [key]: value }));
  };

  const toggleField = (field: keyof VisibleFields) => {
    setPreferences(prev => ({
      ...prev,
      visibleFields: {
        ...prev.visibleFields,
        [field]: !prev.visibleFields[field],
      },
    }));
  };

  // Card Fields Dialog handlers
  const handleToggleCardField = (fieldId: string) => {
    setCardFields(prev =>
      prev.map(f => (f.id === fieldId ? { ...f, visible: !f.visible } : f))
    );
  };

  const handleFieldDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const field = cardFields.find(f => f.id === active.id);
    if (field) {
      setActiveField(field);
    }
  };

  const handleFieldDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveField(null);

    if (!over || active.id === over.id) return;

    setCardFields(prev => {
      const oldIndex = prev.findIndex(f => f.id === active.id);
      const newIndex = prev.findIndex(f => f.id === over.id);

      const newFields = [...prev];
      const [movedField] = newFields.splice(oldIndex, 1);
      newFields.splice(newIndex, 0, movedField);

      return newFields.map((f, i) => ({ ...f, order: i }));
    });
  };

  const handleSaveCardFields = () => {
    localStorage.setItem(CARD_FIELDS_STORAGE_KEY, JSON.stringify(cardFields));
    
    // Update preferences visibleFields based on cardFields
    const newVisibleFields: VisibleFields = {
      client: cardFields.find(f => f.id === "client")?.visible ?? false,
      budget: cardFields.find(f => f.id === "budget")?.visible ?? false,
      stage: cardFields.find(f => f.id === "stage")?.visible ?? false,
      dueDate: cardFields.find(f => f.id === "dueDate")?.visible ?? false,
      progress: cardFields.find(f => f.id === "progress")?.visible ?? false,
      foreman: cardFields.find(f => f.id === "foreman")?.visible ?? false,
    };
    
    setPreferences(prev => ({ ...prev, visibleFields: newVisibleFields }));
    setCardFieldsDialogOpen(false);
    
    toast({ title: "Card fields updated" });
  };

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    if (active.data.current?.type === "project") {
      setActiveProject(active.data.current.project);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveProject(null);

    if (!over) return;

    const activeProjectId = active.id as string;
    const activeProject = projects.find(project => project.id === activeProjectId);
    
    if (!activeProject) return;

    // If dropped over a column
    if (over.data.current?.type === "column") {
      const columnId = over.data.current.column.id;
      
      if (preferences.groupBy === "parent") {
        if (activeProject.projectStatus !== columnId) {
          moveProjectMutation.mutate({ 
            projectId: activeProjectId, 
            newStatus: columnId 
          });
        }
      } else {
        if (activeProject.projectSubStatus !== columnId) {
          moveProjectMutation.mutate({ 
            projectId: activeProjectId, 
            newSubStatus: columnId 
          });
        }
      }
    }
    // If dropped over another project, move to that project's column
    else if (over.data.current?.type === "project") {
      const overProject = over.data.current.project;
      if (preferences.groupBy === "parent") {
        if (activeProject.projectStatus !== overProject.projectStatus) {
          moveProjectMutation.mutate({ 
            projectId: activeProjectId, 
            newStatus: overProject.projectStatus 
          });
        }
      } else {
        if (activeProject.projectSubStatus !== overProject.projectSubStatus) {
          moveProjectMutation.mutate({ 
            projectId: activeProjectId, 
            newSubStatus: overProject.projectSubStatus 
          });
        }
      }
    }
  };

  if (isLoading || isLoadingStatuses) {
    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">Loading...</span>
          </div>
        </div>
        <div 
          className="flex gap-4 overflow-x-auto pb-4 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100"
          style={{ scrollbarWidth: 'thin' }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="w-80 flex-shrink-0 rounded-lg border border-border bg-background">
              <div className="px-3 py-2 border-b border-border/50 bg-muted/30">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">...</h3>
                  <Badge variant="secondary" className="text-xs px-2 py-0 h-5 rounded-full bg-muted/50">...</Badge>
                </div>
              </div>
              <div className="p-2 space-y-1.5">
                {Array.from({ length: 6 }).map((_, j) => (
                  <SkeletonCard key={j} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!isLoadingStatuses && statusOptions.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-muted-foreground mb-2">No project statuses configured</p>
          <p className="text-sm text-muted-foreground">
            Configure project statuses in Field Settings to use the board view
          </p>
        </div>
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="h-full flex flex-col">
        {/* View Controls */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">
              Group by: {preferences.groupBy === "parent" ? "Parent Status" : "Sub-Status"}
            </span>
            <span className="text-sm text-muted-foreground">•</span>
            <span className="text-sm font-medium text-muted-foreground">
              {preferences.columnWidth === 'small' ? 'Small' : 
               preferences.columnWidth === 'wide' ? 'Wide' : 'Medium'} columns
            </span>
          </div>
          
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="outline"
                  size="sm"
                  data-testid="button-column-width"
                  className="h-9"
                >
                  <Columns3 className="h-4 w-4 mr-2" />
                  {preferences.columnWidth === 'small' ? 'Small' : 
                   preferences.columnWidth === 'wide' ? 'Wide' : 'Medium'}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem 
                  onClick={() => updatePreference('columnWidth', 'small')}
                  data-testid="menu-item-column-small"
                >
                  Small (240px)
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => updatePreference('columnWidth', 'medium')}
                  data-testid="menu-item-column-medium"
                >
                  Medium (320px)
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => updatePreference('columnWidth', 'wide')}
                  data-testid="menu-item-column-wide"
                >
                  Wide (400px)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            
            {showNavigation && (
              <>
                <Button 
                  variant="outline"
                  size="icon"
                  onClick={scrollLeft}
                  data-testid="button-scroll-left"
                  className="h-9 w-9"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button 
                  variant="outline"
                  size="icon"
                  onClick={scrollRight}
                  data-testid="button-scroll-right"
                  className="h-9 w-9"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </>
            )}
            
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCardFieldsDialogOpen(true)}
              data-testid="button-edit-card"
              className="h-9"
            >
              <Settings className="h-4 w-4 mr-2" />
              Edit Card
            </Button>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" data-testid="button-view-settings" className="h-9">
                  <Settings2 className="h-4 w-4 mr-2" />
                  View Options
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Group By</DropdownMenuLabel>
                <DropdownMenuRadioGroup
                  value={preferences.groupBy}
                  onValueChange={(value) => updatePreference("groupBy", value as GroupBy)}
                >
                  <DropdownMenuRadioItem value="parent" data-testid="radio-group-parent">
                    Parent Status
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="substatus" data-testid="radio-group-substatus">
                    Sub-Status
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>

                <DropdownMenuSeparator />

                <DropdownMenuLabel>Show Fields</DropdownMenuLabel>
                <DropdownMenuCheckboxItem
                  checked={preferences.visibleFields.client}
                  onCheckedChange={() => toggleField("client")}
                  data-testid="checkbox-field-client"
                >
                  Client
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={preferences.visibleFields.budget}
                  onCheckedChange={() => toggleField("budget")}
                  data-testid="checkbox-field-budget"
                >
                  Budget
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={preferences.visibleFields.stage}
                  onCheckedChange={() => toggleField("stage")}
                  data-testid="checkbox-field-stage"
                >
                  Location
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={preferences.visibleFields.dueDate}
                  onCheckedChange={() => toggleField("dueDate")}
                  data-testid="checkbox-field-dueDate"
                >
                  Due Date
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={preferences.visibleFields.foreman}
                  onCheckedChange={() => toggleField("foreman")}
                  data-testid="checkbox-field-foreman"
                >
                  Foreman
                </DropdownMenuCheckboxItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Board - Horizontal Scroll */}
        <div 
          ref={scrollContainerRef}
          className="flex gap-4 overflow-x-auto pb-4 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100"
          style={{ 
            scrollbarWidth: 'thin', 
            scrollBehavior: 'smooth'
          }}>
          <SortableContext items={columns.map(col => col.id)} strategy={verticalListSortingStrategy}>
            {columns.map((column) => {
              const columnProjects = projects.filter(column.filterFn);
              
              return (
                <div key={column.id} className={`${getColumnWidthClass()} flex-shrink-0`}>
                  <DroppableColumn
                    column={column}
                    projects={columnProjects}
                    onProjectClick={(project) => navigate(`/projects/${project.id}`)}
                    visibleFields={preferences.visibleFields}
                  />
                </div>
              );
            })}
          </SortableContext>
        </div>

        {/* Drag Overlay */}
        <DragOverlay>
          {activeProject ? (
            <div className="rotate-2">
              <ProjectCardCompact 
                project={activeProject} 
                onClick={() => {}} 
                isDragging={true}
                visibleFields={preferences.visibleFields}
              />
            </div>
          ) : null}
        </DragOverlay>

        {/* Edit Card Fields Dialog */}
        <Dialog open={cardFieldsDialogOpen} onOpenChange={setCardFieldsDialogOpen}>
          <DialogContent className="sm:max-w-md" data-testid="dialog-edit-card-fields">
            <DialogHeader>
              <DialogTitle>Edit Card Fields</DialogTitle>
              <DialogDescription>
                Customize which fields appear on project cards and their order. Drag to reorder.
              </DialogDescription>
            </DialogHeader>

            <DndContext
              sensors={sensors}
              collisionDetection={closestCorners}
              onDragStart={handleFieldDragStart}
              onDragEnd={handleFieldDragEnd}
            >
              <div className="space-y-2 py-4">
                <SortableContext
                  items={cardFields.map(f => f.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {cardFields.map(field => (
                    <DraggableFieldRow
                      key={field.id}
                      field={field}
                      onToggle={handleToggleCardField}
                    />
                  ))}
                </SortableContext>
              </div>

              <DragOverlay>
                {activeField ? (
                  <div className="flex items-center gap-3 h-10 px-3 rounded-md border-2 bg-background border-[#bba7db] shadow-lg opacity-80">
                    <GripVertical className="h-4 w-4 text-muted-foreground" />
                    <Checkbox checked={activeField.visible} />
                    <label
                      className="flex-1 text-sm font-medium"
                      style={{ color: activeField.visible ? "#bba7db" : "inherit" }}
                    >
                      {activeField.label}
                    </label>
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setCardFieldsDialogOpen(false)}
                data-testid="button-cancel-card-fields"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveCardFields}
                data-testid="button-save-card-fields"
                style={{ backgroundColor: "#bba7db", color: "white" }}
                className="hover:opacity-90"
              >
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DndContext>
  );
}
