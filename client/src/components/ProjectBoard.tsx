import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { type Project, type FieldOption } from "@shared/schema";
import { useLocation } from "wouter";
import { ChevronLeft, ChevronRight, Columns3, Settings2, Settings, GripVertical } from "lucide-react";
import ProjectCardCompact from "./ProjectCardCompact";
import PhaseTransitionDialog, { type SystemPhase } from "./PhaseTransitionDialog";
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
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "@/components/ui/context-menu";
import { ArrowRight } from "lucide-react";
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
  cardFieldsDialogOpen?: boolean;
  onCardFieldsDialogChange?: (open: boolean) => void;
  editMode?: boolean;
  onPreferencesChange?: (preferences: ViewPreferences | ((prev: ViewPreferences) => ViewPreferences)) => void;
  preferences?: ViewPreferences;
}

export type GroupBy = "phase" | "status";
export type ColumnWidth = 'small' | 'medium' | 'wide';

export interface VisibleFields {
  client: boolean;
  budget: boolean;
  phase: boolean;
  dueDate: boolean;
  progress: boolean;
  foreman: boolean;
}

export interface ViewPreferences {
  groupBy: GroupBy;
  columnWidth: ColumnWidth;
  visibleFields: VisibleFields;
  hideEmptyColumns?: boolean;
}

const DEFAULT_PREFERENCES: ViewPreferences = {
  groupBy: "phase",
  columnWidth: "medium",
  visibleFields: {
    client: true,
    budget: true,
    phase: true,
    dueDate: true,
    progress: true,
    foreman: true,
  },
  hideEmptyColumns: false,
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
  { id: "phase", label: "Phase", visible: true, order: 2 },
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

// Draggable Project Card wrapper with context menu for phase transitions
function DraggableProjectCard({ 
  project, 
  onClick,
  visibleFields,
  editMode = false,
  groupBy = "phase",
  phases = [],
  currentPhase,
  onPhaseTransition,
}: { 
  project: Project; 
  onClick?: () => void;
  visibleFields: VisibleFields;
  editMode?: boolean;
  groupBy?: "phase" | "status";
  phases?: Array<{ key: string; name: string; color: string; systemPhase?: string }>;
  currentPhase?: string | null;
  onPhaseTransition?: (project: Project, toPhase: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging,
  } = useSortable({
    id: project.id,
    data: {
      type: "project",
      project,
    },
    // Disable layout change animations to prevent snap-back
    animateLayoutChanges: () => false,
  });

  // When dragging, hide the source card completely (DragOverlay shows the visual)
  // No transform or transition needed - prevents snap-back animation
  const style: React.CSSProperties = {
    transform: isDragging ? undefined : CSS.Transform.toString(transform),
    transition: 'none', // No transition to prevent snap-back
    opacity: isDragging ? 0 : 1,
  };

  // Only apply drag listeners in edit mode
  const dragProps = editMode ? { ...attributes, ...listeners } : {};

  // Filter phases to show only those different from current
  const availablePhases = phases.filter(p => 
    (p.systemPhase || p.key) !== currentPhase
  );

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={setNodeRef}
          style={style}
          {...dragProps}
          className={editMode ? "touch-none cursor-grab active:cursor-grabbing" : ""}
        >
          <ProjectCardCompact 
            project={project} 
            onClick={isDragging ? undefined : onClick}
            isDragging={false}
            editMode={editMode}
            groupBy={groupBy}
            visibleFields={visibleFields}
          />
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ContextMenuSub>
          <ContextMenuSubTrigger className="gap-2">
            <ArrowRight className="h-4 w-4" />
            Move to Phase
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-48">
            {availablePhases.length > 0 ? (
              availablePhases.map((phase) => (
                <ContextMenuItem
                  key={phase.key}
                  onClick={() => onPhaseTransition?.(project, phase.systemPhase || phase.key)}
                  className="gap-2"
                  data-testid={`context-menu-phase-${phase.key}`}
                >
                  <div 
                    className="w-3 h-3 rounded-full flex-shrink-0" 
                    style={{ backgroundColor: phase.color }}
                  />
                  {phase.name}
                </ContextMenuItem>
              ))
            ) : (
              <ContextMenuItem disabled className="text-muted-foreground">
                No other phases available
              </ContextMenuItem>
            )}
          </ContextMenuSubContent>
        </ContextMenuSub>
      </ContextMenuContent>
    </ContextMenu>
  );
}

// Loading skeleton card - exactly 80px (h-20)
function SkeletonCard() {
  return (
    <div className="h-20 rounded-xl border border-border/50 bg-muted/20 animate-pulse p-2">
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
  editMode = false,
  groupBy = "phase",
  phases = [],
  onPhaseTransition,
}: { 
  column: { id: string; title: string; color: string; systemPhase?: string }; 
  projects: Project[];
  onProjectClick?: (project: Project) => void;
  visibleFields: VisibleFields;
  editMode?: boolean;
  groupBy?: "phase" | "status";
  phases?: Array<{ key: string; name: string; color: string; systemPhase?: string }>;
  onPhaseTransition?: (project: Project, toPhase: string) => void;
}) {
  const {
    setNodeRef,
    isOver,
  } = useDroppable({
    id: column.id,
    data: {
      type: "column",
      column, // Now includes systemPhase
    },
  });

  // Calculate total value using price hierarchy: budget → estimate → contract → $0
  const totalValue = projects.reduce((sum, project) => {
    // Price hierarchy: use first available value
    const value = project.budget || project.estimateTotal || project.contractValue || 0;
    return sum + value;
  }, 0);

  const formatCurrency = (cents: number) => {
    if (!cents) return "$0";
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD',
      minimumFractionDigits: 0,
    }).format(cents / 100);
  };

  return (
    <div
      ref={setNodeRef}
      className={`rounded-xl border transition-all duration-200 ${
        isOver ? 'border-2 border-[#bba7db] border-dashed bg-[#bba7db]/5' : 'border-border/50 bg-muted/20'
      }`}
    >
      {/* Column Header */}
      <div className="px-3 py-2.5 border-b border-border/30 bg-muted/30">
        {/* Row 1: Status name + count (if > 0) */}
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div
              className="w-3 h-3 rounded-full flex-shrink-0"
              style={{ backgroundColor: column.color }}
            />
            <h3 className="text-sm font-semibold text-foreground truncate">{column.title}</h3>
          </div>
          {projects.length > 0 && (
            <Badge variant="secondary" className="text-xs px-2 py-0 h-5 rounded-full bg-[#bba7db]/10 text-[#bba7db] border-[#bba7db]/20 no-default-hover-elevate font-semibold flex-shrink-0">
              {projects.length}
            </Badge>
          )}
        </div>
        {/* Row 2: Total value (always reserve space for consistency) */}
        <div className="text-xs text-muted-foreground font-medium h-4">
          {totalValue > 0 ? formatCurrency(totalValue) : ''}
        </div>
      </div>

      {/* Cards Container - max height with scroll */}
      <div className="p-2 space-y-1.5 max-h-[calc(100vh-300px)] overflow-y-auto">
        <SortableContext items={projects.map(project => project.id)} strategy={verticalListSortingStrategy}>
          {projects.length === 0 ? (
            <div className="h-20" />
          ) : (
            projects.map((project) => (
              <DraggableProjectCard 
                key={project.id} 
                project={project} 
                onClick={() => onProjectClick?.(project)}
                visibleFields={visibleFields}
                editMode={editMode}
                groupBy={groupBy}
                phases={phases}
                currentPhase={column.systemPhase}
                onPhaseTransition={onPhaseTransition}
              />
            ))
          )}
        </SortableContext>
      </div>
    </div>
  );
}

export function ProjectBoard({ 
  projects, 
  isLoading,
  cardFieldsDialogOpen: externalCardFieldsDialogOpen,
  onCardFieldsDialogChange,
  editMode = false,
  onPreferencesChange,
  preferences: externalPreferences
}: ProjectBoardProps) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  
  // Phase transition dialog state
  const [phaseTransitionData, setPhaseTransitionData] = useState<{
    open: boolean;
    project: Project | null;
    fromPhase: SystemPhase;
    toPhase: SystemPhase;
    newStatusKey: string;
  }>({
    open: false,
    project: null,
    fromPhase: "lead",
    toPhase: "lead",
    newStatusKey: "",
  });
  
  // Load preferences from localStorage (or use external preferences)
  const [internalPreferences, setInternalPreferences] = useState<ViewPreferences>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? { ...DEFAULT_PREFERENCES, ...JSON.parse(stored) } : DEFAULT_PREFERENCES;
    } catch {
      return DEFAULT_PREFERENCES;
    }
  });

  // Use external preferences if provided, otherwise use internal
  const preferences = externalPreferences ?? internalPreferences;
  const setPreferences = (newPrefs: ViewPreferences | ((prev: ViewPreferences) => ViewPreferences)) => {
    if (externalPreferences && onPreferencesChange) {
      // If external, pass updater directly to parent (handles functional updates)
      onPreferencesChange(newPrefs);
    } else {
      // If internal, compute update and persist to localStorage
      const updatedPrefs = typeof newPrefs === 'function' ? newPrefs(internalPreferences) : newPrefs;
      setInternalPreferences(updatedPrefs);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedPrefs));
    }
  };

  // Edit Card Fields dialog state - controlled/uncontrolled
  const [internalCardFieldsDialogOpen, setInternalCardFieldsDialogOpen] = useState(false);
  const cardFieldsDialogOpen = externalCardFieldsDialogOpen ?? internalCardFieldsDialogOpen;
  const setCardFieldsDialogOpen = onCardFieldsDialogChange ?? setInternalCardFieldsDialogOpen;
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

  // Get column width class based on setting (all reduced by 20%)
  const getColumnWidthClass = (isEmpty: boolean = false) => {
    if (isEmpty) {
      // Empty columns are half width to save space
      switch (preferences.columnWidth) {
        case 'small':
          return 'w-24'; // 96px (half of 192px)
        case 'wide':
          return 'w-40'; // 160px (half of 320px)
        case 'medium':
        default:
          return 'w-32'; // 128px (half of 256px)
      }
    }
    
    switch (preferences.columnWidth) {
      case 'small':
        return 'w-48'; // 192px (was 240px)
      case 'wide':
        return 'w-80'; // 320px (was 400px)
      case 'medium':
      default:
        return 'w-64'; // 256px (was 320px)
    }
  };

  // Set up drag sensors - only active in edit mode
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: editMode ? 8 : 999999, // Only allow drag in edit mode
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
  // Sort by sortOrder from database - ASCENDING for left-to-right chronological flow
  const parentStatuses = useMemo(
    () => statusOptions
      .filter(opt => !opt.parentId)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    [statusOptions]
  );

  // Create a map of parent phase sortOrder for sub-status sorting
  const parentSortOrderMap = useMemo(() => {
    const map = new Map<string, number>();
    parentStatuses.forEach(parent => {
      map.set(parent.id, parent.sortOrder ?? 0);
    });
    return map;
  }, [parentStatuses]);

  const subStatuses = useMemo(
    () => statusOptions
      .filter(opt => opt.parentId)
      .sort((a, b) => {
        // First sort by parent phase's sortOrder (ascending for left-to-right)
        const parentOrderA = parentSortOrderMap.get(a.parentId!) ?? 0;
        const parentOrderB = parentSortOrderMap.get(b.parentId!) ?? 0;
        if (parentOrderA !== parentOrderB) {
          return parentOrderA - parentOrderB;
        }
        // Then sort by individual sortOrder within the same phase (ascending)
        return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
      }),
    [statusOptions, parentSortOrderMap]
  );

  // Build columns based on grouping preference
  // Include phase metadata (systemPhase) for cross-phase drop detection
  const columns = useMemo(() => {
    const mainColumns = preferences.groupBy === "phase"
      ? parentStatuses.map(status => ({
          id: status.key,
          title: status.name,
          color: status.color || "#6b7280",
          systemPhase: status.systemPhase || status.key, // Phase itself
          filterFn: (p: Project) => p.projectStatus === status.key,
        }))
      : subStatuses.map(status => ({
          id: status.key,
          title: status.name,
          color: status.color || "#6b7280",
          parentId: status.parentId,
          systemPhase: status.systemPhase, // The phase this sub-status belongs to
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

  // Helper to get system phase from a sub-status
  const getSystemPhaseFromStatus = useCallback((statusKey: string): SystemPhase | null => {
    const option = statusOptions.find(o => o.key === statusKey);
    if (option?.systemPhase) {
      return option.systemPhase as SystemPhase;
    }
    return null;
  }, [statusOptions]);

  // Check if moving to a new sub-status triggers a phase transition
  const checkPhaseTransition = useCallback((project: Project, newSubStatus: string): { 
    isTransition: boolean; 
    fromPhase: SystemPhase | null; 
    toPhase: SystemPhase | null;
  } => {
    const currentPhase = project.currentSystemPhase as SystemPhase | null 
      || getSystemPhaseFromStatus(project.projectSubStatus || "");
    const newPhase = getSystemPhaseFromStatus(newSubStatus);
    
    if (!currentPhase || !newPhase) {
      return { isTransition: false, fromPhase: null, toPhase: null };
    }
    
    const isTransition = currentPhase !== newPhase;
    return { isTransition, fromPhase: currentPhase, toPhase: newPhase };
  }, [getSystemPhaseFromStatus]);

  // Move project to different column (simple move without phase transition)
  // Uses optimistic updates like Estimate drag-and-drop to prevent snap-back
  const moveProjectMutation = useMutation({
    mutationFn: async ({ projectId, newStatus, newSubStatus }: { 
      projectId: string; 
      newStatus?: string;
      newSubStatus?: string;
    }) => {
      const updateData = preferences.groupBy === "phase" 
        ? { projectStatus: newStatus }
        : { projectSubStatus: newSubStatus };
      
      await apiRequest(`/api/projects/${projectId}`, "PATCH", updateData);
    },
    onMutate: async ({ projectId, newStatus, newSubStatus }) => {
      // Cancel outgoing refetches to prevent snap-back
      await queryClient.cancelQueries({ queryKey: ["/api/projects"] });
      
      // Snapshot previous value for rollback
      const previousProjects = queryClient.getQueryData(["/api/projects"]) as Project[];
      
      // Optimistically update the project in cache IMMEDIATELY - this prevents snap-back
      queryClient.setQueryData(
        ["/api/projects"],
        (old: Project[] | undefined) => {
          if (!old) return old;
          return old.map(project => {
            if (project.id === projectId) {
              return {
                ...project,
                ...(newStatus ? { projectStatus: newStatus } : {}),
                ...(newSubStatus ? { projectSubStatus: newSubStatus } : {}),
              };
            }
            return project;
          });
        }
      );
      
      return { previousProjects };
    },
    onError: (error, variables, context) => {
      // Rollback to previous state on error
      if (context?.previousProjects) {
        queryClient.setQueryData(["/api/projects"], context.previousProjects);
      }
      toast({ 
        title: "Failed to move project", 
        description: error.message,
        variant: "destructive" 
      });
      // Refetch on error to ensure server state
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
    },
    onSuccess: () => {
      // NO REFETCH on success - optimistic update is already correct
      // NO TOAST - keeps drag operations fast and silent like Estimates
    },
  });

  // Handle project move with phase transition detection (legacy - kept for compatibility)
  const handleMoveProject = useCallback((project: Project, newSubStatus: string) => {
    const { isTransition, fromPhase, toPhase } = checkPhaseTransition(project, newSubStatus);
    
    if (isTransition && fromPhase && toPhase) {
      // Show phase transition dialog
      setPhaseTransitionData({
        open: true,
        project,
        fromPhase,
        toPhase,
        newStatusKey: newSubStatus,
      });
    } else {
      // Simple move without phase transition
      moveProjectMutation.mutate({
        projectId: project.id,
        newSubStatus,
      });
    }
  }, [checkPhaseTransition, moveProjectMutation]);

  // Handle explicit phase transition from context menu
  const handlePhaseTransition = useCallback((project: Project, toPhaseKey: string) => {
    const fromPhase = (project.currentSystemPhase as SystemPhase) || 
      getSystemPhaseFromStatus(project.projectSubStatus || "") ||
      (project.projectStatus as SystemPhase);
    
    if (!fromPhase) {
      toast({
        title: "Cannot determine current phase",
        description: "Unable to identify the project's current phase.",
        variant: "destructive",
      });
      return;
    }

    // Find the first sub-status in the target phase to use as default
    const targetSubStatus = subStatuses.find(s => s.systemPhase === toPhaseKey);
    const newStatusKey = targetSubStatus?.key || toPhaseKey;

    setPhaseTransitionData({
      open: true,
      project,
      fromPhase: fromPhase as SystemPhase,
      toPhase: toPhaseKey as SystemPhase,
      newStatusKey,
    });
  }, [getSystemPhaseFromStatus, subStatuses, toast]);

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
      phase: cardFields.find(f => f.id === "phase")?.visible ?? false,
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

  // Get phase for a column by its ID
  const getColumnPhase = useCallback((columnId: string): string | null => {
    const column = columns.find(c => c.id === columnId);
    return column?.systemPhase || null;
  }, [columns]);

  // Get phase for a project's current status
  const getProjectPhase = useCallback((project: Project): string | null => {
    if (preferences.groupBy === "phase") {
      return project.projectStatus || null;
    }
    // For sub-status view, find the phase from the sub-status
    const option = statusOptions.find(o => o.key === project.projectSubStatus);
    return option?.systemPhase || null;
  }, [preferences.groupBy, statusOptions]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveProject(null);

    if (!over) return;

    const activeProjectId = active.id as string;
    const draggedProject = projects.find(project => project.id === activeProjectId);
    
    if (!draggedProject) return;

    // Helper to check cross-phase and block if needed
    const checkAndBlockCrossPhase = (targetColumnId: string): boolean => {
      const sourcePhase = getProjectPhase(draggedProject);
      const targetPhase = getColumnPhase(targetColumnId);
      
      if (sourcePhase && targetPhase && sourcePhase !== targetPhase) {
        toast({
          title: "Cannot move across phases",
          description: "Projects can only be moved between statuses within the same phase. Use 'Move to Phase' to transition between phases.",
          variant: "destructive",
        });
        return true; // Blocked
      }
      return false; // Allowed
    };

    // If dropped over a column
    if (over.data.current?.type === "column") {
      const columnId = over.data.current.column.id;
      
      if (preferences.groupBy === "phase") {
        // Phase grouping - allow phase moves (that's the point of this view)
        if (draggedProject.projectStatus !== columnId) {
          // When moving between phases, show the phase transition dialog
          const fromPhase = (draggedProject.currentSystemPhase as SystemPhase) || 
            (draggedProject.projectStatus as SystemPhase);
          const toPhase = columnId as SystemPhase;
          
          if (fromPhase && toPhase && fromPhase !== toPhase) {
            // Find the first sub-status in the target phase to use as default
            const targetSubStatus = subStatuses.find(s => s.systemPhase === toPhase);
            const newStatusKey = targetSubStatus?.key || toPhase;
            
            setPhaseTransitionData({
              open: true,
              project: draggedProject,
              fromPhase,
              toPhase,
              newStatusKey,
            });
          } else {
            // Same phase, just update status directly
            moveProjectMutation.mutate({ 
              projectId: activeProjectId, 
              newStatus: columnId 
            });
          }
        }
      } else {
        // Sub-status grouping - block cross-phase moves
        if (draggedProject.projectSubStatus !== columnId) {
          if (checkAndBlockCrossPhase(columnId)) return;
          moveProjectMutation.mutate({
            projectId: activeProjectId,
            newSubStatus: columnId,
          });
        }
      }
    }
    // If dropped over another project, move to that project's column
    else if (over.data.current?.type === "project") {
      const overProject = over.data.current.project;
      if (preferences.groupBy === "phase") {
        if (draggedProject.projectStatus !== overProject.projectStatus) {
          // When moving between phases, show the phase transition dialog
          const fromPhase = (draggedProject.currentSystemPhase as SystemPhase) || 
            (draggedProject.projectStatus as SystemPhase);
          const toPhase = overProject.projectStatus as SystemPhase;
          
          if (fromPhase && toPhase && fromPhase !== toPhase) {
            // Find the first sub-status in the target phase to use as default
            const targetSubStatus = subStatuses.find(s => s.systemPhase === toPhase);
            const newStatusKey = targetSubStatus?.key || toPhase;
            
            setPhaseTransitionData({
              open: true,
              project: draggedProject,
              fromPhase,
              toPhase,
              newStatusKey,
            });
          } else {
            // Same phase, just update status directly
            moveProjectMutation.mutate({ 
              projectId: activeProjectId, 
              newStatus: overProject.projectStatus 
            });
          }
        }
      } else {
        // Sub-status grouping - block cross-phase moves
        if (draggedProject.projectSubStatus !== overProject.projectSubStatus) {
          // Find the target column to check phase
          const targetStatusKey = overProject.projectSubStatus;
          if (checkAndBlockCrossPhase(targetStatusKey)) return;
          moveProjectMutation.mutate({
            projectId: activeProjectId,
            newSubStatus: targetStatusKey,
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
            <div key={i} className="w-80 flex-shrink-0 rounded-xl border border-border/50 bg-muted/20">
              <div className="px-3 py-2.5 border-b border-border/30 bg-muted/30">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">...</h3>
                  <Badge variant="secondary" className="text-xs px-2 py-0 h-5 rounded-full bg-[#bba7db]/10 text-[#bba7db] border-[#bba7db]/20 font-semibold">...</Badge>
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
              const isEmpty = columnProjects.length === 0;
              
              // Hide empty columns when hideEmptyColumns is true and not in edit mode
              // In edit mode, always show all columns so user can drop projects
              if (isEmpty && preferences.hideEmptyColumns && !editMode) {
                return null;
              }
              
              return (
                <div key={column.id} className={`${getColumnWidthClass(isEmpty)} flex-shrink-0`}>
                  <DroppableColumn
                    column={column}
                    projects={columnProjects}
                    onProjectClick={(project) => navigate(`/projects/${project.id}`)}
                    visibleFields={preferences.visibleFields}
                    editMode={editMode}
                    groupBy={preferences.groupBy}
                    phases={parentStatuses.map(s => ({
                      key: s.key,
                      name: s.name,
                      color: s.color || "#6b7280",
                      systemPhase: s.systemPhase || s.key,
                    }))}
                    onPhaseTransition={handlePhaseTransition}
                  />
                </div>
              );
            })}
          </SortableContext>
        </div>

        {/* Drag Overlay - dropAnimation={null} prevents snap-back */}
        <DragOverlay dropAnimation={null}>
          {activeProject ? (
            <div className="rotate-2 shadow-lg">
              <ProjectCardCompact 
                project={activeProject} 
                onClick={() => {}} 
                isDragging={true}
                editMode={true}
                groupBy={preferences.groupBy}
                visibleFields={preferences.visibleFields}
              />
            </div>
          ) : null}
        </DragOverlay>

        {/* Edit Card Fields Popover Content */}
        {cardFieldsDialogOpen && (
          <div className="fixed inset-0 z-[100]" onClick={() => setCardFieldsDialogOpen(false)}>
            <div 
              className="absolute right-4 top-20 w-80 bg-popover border border-border rounded-md shadow-lg p-4"
              onClick={(e) => e.stopPropagation()}
              data-testid="popover-card-fields-content"
            >
              <div className="space-y-3">
                <div>
                  <h3 className="text-sm font-semibold">Edit Card Fields</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    Customize which fields appear on project cards and their order. Drag to reorder.
                  </p>
                </div>

                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCorners}
                  onDragStart={handleFieldDragStart}
                  onDragEnd={handleFieldDragEnd}
                >
                  <div className="space-y-2">
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

                <div className="flex items-center gap-2 pt-2 border-t border-border">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCardFieldsDialogOpen(false)}
                    className="flex-1"
                    data-testid="button-cancel-card-fields"
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSaveCardFields}
                    className="flex-1"
                    data-testid="button-save-card-fields"
                    style={{ backgroundColor: "#bba7db", color: "white" }}
                  >
                    Save
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
        
        {/* Phase Transition Dialog */}
        {phaseTransitionData.project && (
          <PhaseTransitionDialog
            open={phaseTransitionData.open}
            onOpenChange={(open) => setPhaseTransitionData(prev => ({ ...prev, open }))}
            project={phaseTransitionData.project}
            fromPhase={phaseTransitionData.fromPhase}
            toPhase={phaseTransitionData.toPhase}
            newStatusKey={phaseTransitionData.newStatusKey}
            onConfirm={() => {
              setPhaseTransitionData(prev => ({ ...prev, open: false, project: null }));
            }}
          />
        )}
      </div>
    </DndContext>
  );
}
