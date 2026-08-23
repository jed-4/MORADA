import { useState, useEffect, useMemo, useCallback, lazy, Suspense } from "react";

const PdfInlineViewer = lazy(() => import("@/components/PdfInlineViewer"));
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { usePermission } from "@/hooks/use-permission";
import { usePageTitle } from "@/hooks/usePageTitle";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
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
  DropdownMenuCheckboxItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import {
  ListTree,
  Plus,
  FileDown,
  ChevronsDownUp,
  ChevronsUpDown,
  Filter,
  MoreHorizontal,
  FileText,
  AlignLeft,
  Paperclip,
  Loader2,
} from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { useUpload } from "@/hooks/use-upload";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ScopeItem, ScopeStage, ScopeTemplate, Estimate, ScopeItemTypeDefinition, TaskTemplate, LabourHoursBudget } from "@shared/schema";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { DndContext, closestCenter, DragOverlay, DragEndEvent, DragOverEvent, DragStartEvent, useSensor, useSensors, PointerSensor, KeyboardSensor } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { PDFDownloadLink } from '@react-pdf/renderer';
import { StageCard } from "@/components/scope/StageCard";
import { ScopeItemDetailPanel } from "@/components/scope/ScopeItemDetailPanel";
import { ScopePDF } from "@/components/scope/ScopePDF";
import { useScopeMutations } from "@/components/scope/useScopeMutations";
import {
  PRIMARY_COLOR,
  SCOPE_TYPES,
  type StageState,
  type LinkedPOForStage,
  type LinkedScheduleItemForStage,
  type ProjectChecklistForStage,
  type StageLabourTracker,
} from "@/components/scope/types";

export default function ProjectScope() {
  const { projectId } = useParams<{ projectId: string }>();
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const canViewLabourBudget = usePermission("financial.budget_labour", "view");
  const { toast } = useToast();
  const pageTitle = usePageTitle({ pageName: "Scope" });

  const [stageExpanded, setStageExpanded] = useState<StageState>({});
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; position: 'above' | 'below' } | null>(null);
  const [isTemplateDialogOpen, setIsTemplateDialogOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [isPdfDialogOpen, setIsPdfDialogOpen] = useState(false);
  const [pdfStage, setPdfStage] = useState<string>('');
  const [hideClientCosts, setHideClientCosts] = useState(false); // Client toggle for PDF
  const [addingForStage, setAddingForStage] = useState<string | null>(null); // Inline blank-row add — which stage is in adding mode
  const [detailItemId, setDetailItemId] = useState<string | null>(null); // Which item's detail panel is open

  // Scope 2.0: Type filtering
  const [activeTypeFilters, setActiveTypeFilters] = useState<Set<string>>(new Set(SCOPE_TYPES as readonly string[]));
  const [collapsedItems, setCollapsedItems] = useState<Set<string>>(new Set()); // Minimize/expand
  const [showDescriptionInline, setShowDescriptionInline] = useState(false); // Show description inline instead of on hover

  // Stage editing state
  const [editingStageId, setEditingStageId] = useState<string | null>(null);
  const [editingStageName, setEditingStageName] = useState("");
  const [isAddStageDialogOpen, setIsAddStageDialogOpen] = useState(false);
  const [newStageName, setNewStageName] = useState("");
  const [addStageAfterId, setAddStageAfterId] = useState<string | null>(null);
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);
  // Import from Estimate state
  const [isImportFromEstimateOpen, setIsImportFromEstimateOpen] = useState(false);
  const [selectedEstimateForImport, setSelectedEstimateForImport] = useState<string | null>(null);
  const [selectedGroupsToImport, setSelectedGroupsToImport] = useState<Set<string>>(new Set());


  // Fetch scope items
  const { data: scopeItems = [], isLoading } = useQuery<ScopeItem[]>({
    queryKey: [`/api/projects/${projectId}/scope`],
    enabled: !!projectId,
  });

  // Fetch templates
  const { data: templates = [] } = useQuery<ScopeTemplate[]>({
    queryKey: ['/api/scope-templates'],
  });

  // Fetch estimates
  const { data: estimates = [] } = useQuery<Estimate[]>({
    queryKey: ['/api/estimates'],
    select: (data) => data.filter(est => est.projectId === projectId),
  });

  // Fetch estimate groups for the selected estimate (for fuzzy match import)
  interface EstimateGroup {
    id: string;
    name: string;
    description?: string;
    order: number;
    parentGroupId?: string | null;
  }

  const { data: estimateGroups = [] } = useQuery<EstimateGroup[]>({
    queryKey: ['/api/estimates', selectedEstimateForImport, 'groups'],
    queryFn: async () => {
      if (!selectedEstimateForImport) return [];
      const response = await fetch(`/api/estimates/${selectedEstimateForImport}/groups`, {
        credentials: 'include',
      });
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!selectedEstimateForImport && isImportFromEstimateOpen,
  });

  // Fetch custom scope item type definitions
  const { data: scopeItemTypeDefs = [] } = useQuery<ScopeItemTypeDefinition[]>({
    queryKey: ['/api/scope-item-types'],
    enabled: !!user,
  });

  // When type definitions load, ensure all visible types are active in the filter
  useEffect(() => {
    if (scopeItemTypeDefs.length > 0) {
      setActiveTypeFilters(prev => {
        const next = new Set(prev);
        scopeItemTypeDefs.forEach(def => {
          const key = def.name.toLowerCase();
          // Add new types (not in the initial SCOPE_TYPES set) as active by default
          if (!SCOPE_TYPES.includes(key as typeof SCOPE_TYPES[number])) {
            next.add(key);
          }
        });
        return next;
      });
    }
  }, [scopeItemTypeDefs]);


  // Fetch labour hours budget (for labour tracker feature on stages)
  // Only fetch if user has permission to view labour hours budget
  const { data: labourBudgetData = [] } = useQuery<LabourHoursBudget[]>({
    queryKey: [`/api/projects/${projectId}/labour-hours-budget`],
    enabled: !!projectId && canViewLabourBudget,
  });

  // Fetch scope stages
  const { data: scopeStages = [], isLoading: isLoadingStages } = useQuery<ScopeStage[]>({
    queryKey: [`/api/projects/${projectId}/scope-stages`],
    enabled: !!projectId,
  });

  // Fetch purchase orders for the project (to display linked POs in scope)
  const { data: projectPOs = [] } = useQuery<LinkedPOForStage[]>({
    queryKey: ['/api/purchase-orders', { projectId }],
    queryFn: async () => {
      const response = await fetch(`/api/purchase-orders?projectId=${projectId}`, {
        credentials: 'include',
      });
      if (!response.ok) return [];
      const data = await response.json();
      return data.purchaseOrders || [];
    },
    enabled: !!projectId,
  });

  // Group POs by stage
  const posByStage = useMemo(() => {
    const grouped: Record<string, LinkedPOForStage[]> = {};
    projectPOs.forEach((po) => {
      if (po.scopeStageId) {
        if (!grouped[po.scopeStageId]) {
          grouped[po.scopeStageId] = [];
        }
        grouped[po.scopeStageId].push(po);
      }
    });
    return grouped;
  }, [projectPOs]);

  // Fetch schedule items for the project (to display linked schedule items in scope)
  const { data: projectScheduleItems = [] } = useQuery<LinkedScheduleItemForStage[]>({
    queryKey: ['/api/schedule-items', { projectId }],
    queryFn: async () => {
      const response = await fetch(`/api/schedule-items?projectId=${projectId}`, {
        credentials: 'include',
      });
      if (!response.ok) return [];
      const data = await response.json();
      return data.items || data || [];
    },
    enabled: !!projectId,
  });

  // Group schedule items by stage
  const scheduleItemsByStage = useMemo(() => {
    const grouped: Record<string, LinkedScheduleItemForStage[]> = {};
    projectScheduleItems.forEach((item) => {
      if (item.scopeStageId) {
        if (!grouped[item.scopeStageId]) {
          grouped[item.scopeStageId] = [];
        }
        grouped[item.scopeStageId].push(item);
      }
    });
    return grouped;
  }, [projectScheduleItems]);

  // Fetch checklist instances for this project (used for per-stage badge count)
  const { data: projectChecklistInstances = [] } = useQuery<ProjectChecklistForStage[]>({
    queryKey: ['/api/checklist-instances', { projectId }],
    queryFn: async () => {
      const res = await fetch(`/api/checklist-instances?projectId=${projectId}`, { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!projectId,
  });

  // Count checklists per stage + build inline list
  const checklistCountByStage = useMemo(() => {
    const counts: Record<string, number> = {};
    projectChecklistInstances.forEach(inst => {
      if (inst.scopeStageId) {
        counts[inst.scopeStageId] = (counts[inst.scopeStageId] || 0) + 1;
      }
    });
    return counts;
  }, [projectChecklistInstances]);

  const checklistsByStage = useMemo(() => {
    const grouped: Record<string, typeof projectChecklistInstances> = {};
    projectChecklistInstances.forEach(inst => {
      if (inst.scopeStageId) {
        if (!grouped[inst.scopeStageId]) grouped[inst.scopeStageId] = [];
        grouped[inst.scopeStageId].push(inst);
      }
    });
    return grouped;
  }, [projectChecklistInstances]);

  // Project task templates (scope="project") for linking to stages
  const { data: allTaskTemplates = [] } = useQuery<TaskTemplate[]>({
    queryKey: ['/api/systems/task-templates'],
    enabled: !!projectId,
  });

  const projectTasks = useMemo(
    () => allTaskTemplates.filter(t => t.scope === 'project' && t.projectId === projectId),
    [allTaskTemplates, projectId],
  );

  // Every scope mutation lives in useScopeMutations. The three callbacks are
  // the only points where a mutation reaches back into this page's state.
  const {
    createStageMutation,
    updateStageMutation,
    toggleStageCompleteMutation,
    updateLabourTrackersMutation,
    deleteStageMutation,
    reorderStagesMutation,
    updateItemMutation,
    reorderMutation,
    deleteItemMutation,
    applyTemplateMutation,
    createItemMutation,
    linkPOMutation,
    unlinkPOMutation,
    linkChecklistMutation,
    unlinkChecklistMutation,
    linkTaskMutation,
    unlinkTaskMutation,
    updateStageAttachmentsMutation,
  } = useScopeMutations({
    projectId,
    scopeItems,
    collapseStage: (stageName) => setStageExpanded(prev => ({ ...prev, [stageName]: false })),
    onItemDeleteSettled: () => setDeletingItemId(null),
    onTemplateApplied: () => setIsTemplateDialogOpen(false),
  });

  const handleToggleStageComplete = (stageId: string, isCompleted: boolean) => {
    toggleStageCompleteMutation.mutate({ id: stageId, isCompleted });
  };

  const handleUpdateLabourTrackers = useCallback((stageId: string, trackers: StageLabourTracker[]) => {
    updateLabourTrackersMutation.mutate({ id: stageId, labourTrackers: trackers });
  }, [updateLabourTrackersMutation]);

  const handleNavigateToChecklists = useCallback((stageId: string) => {
    navigate(`/projects/${projectId}/checklists?scopeStageId=${stageId}`);
  }, [navigate, projectId]);

  // Unified DnD sensors for both stages and items
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5, // 5px movement before drag starts for better precision
      },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Stage drag state
  const [activeStageId, setActiveStageId] = useState<string | null>(null);
  const [overStageId, setOverStageId] = useState<string | null>(null);

  // Helper: check if ID is a stage (stages have UUIDs that are in scopeStages)
  const isStageId = useCallback((id: string) => {
    return scopeStages.some(s => s.id === id);
  }, [scopeStages]);

  // Unified drag handlers that distinguish between stages and items
  const handleUnifiedDragStart = (event: DragStartEvent) => {
    const id = event.active.id as string;
    setDropTarget(null); // Clear drop indicator
    if (isStageId(id)) {
      setActiveStageId(id);
      setActiveId(null);
    } else {
      setActiveId(id);
      setActiveStageId(null);
    }
  };

  const handleUnifiedDragOver = (event: DragOverEvent) => {
    const activeId = event.active.id as string;
    const overId = event.over?.id as string || null;

    if (isStageId(activeId)) {
      setOverStageId(overId);
      setOverId(null);
    } else {
      setOverId(overId);
      setOverStageId(null);
    }
  };

  // Handle drag move - track position for visual drop indicator
  const handleDragMove = (event: any) => {
    const { over, active, delta } = event;

    // Reset when cursor leaves any sortable row
    if (!over) {
      setDropTarget(null);
      return;
    }

    if (!active) {
      setDropTarget(null);
      return;
    }

    const activeIdStr = String(active.id);

    // Skip if dragging a stage (stages have their own visual feedback)
    if (isStageId(activeIdStr)) {
      setDropTarget(null);
      return;
    }

    // Find the stage of the active item to scope queries
    const activeItem = scopeItems.find(item => item.id === activeIdStr);
    const activeStage = activeItem?.stage;
    if (!activeStage) {
      setDropTarget(null);
      return;
    }

    // Get cursor Y position from dragged element
    const activeInitialRect = active.rect?.current?.initial;
    if (!activeInitialRect || !delta) {
      setDropTarget(null);
      return;
    }

    // Calculate cursor position (center of dragged element)
    const cursorY = activeInitialRect.top + activeInitialRect.height / 2 + delta.y;

    // Find all sortable item rows in the DOM
    const allRows = document.querySelectorAll('[data-sortable-id]');
    if (allRows.length === 0) {
      setDropTarget(null);
      return;
    }

    // Get IDs of items in the same stage as the active item
    const sameStageItemIds = new Set(
      scopeItems.filter(item => item.stage === activeStage).map(item => item.id)
    );

    // Build array of row positions, only items in the same stage
    const rowPositions: { id: string; top: number; bottom: number; midpoint: number }[] = [];
    allRows.forEach((row) => {
      const id = row.getAttribute('data-sortable-id');
      if (!id || id === activeIdStr || isStageId(id)) return;
      // Only include items from the same stage
      if (!sameStageItemIds.has(id)) return;

      const rect = row.getBoundingClientRect();
      rowPositions.push({
        id,
        top: rect.top,
        bottom: rect.bottom,
        midpoint: rect.top + rect.height / 2,
      });
    });

    if (rowPositions.length === 0) {
      setDropTarget(null);
      return;
    }

    // Sort by visual position (top to bottom)
    rowPositions.sort((a, b) => a.top - b.top);

    // Find where cursor is relative to all rows
    if (cursorY < rowPositions[0].midpoint) {
      setDropTarget({ id: rowPositions[0].id, position: 'above' });
      return;
    }

    const lastRow = rowPositions[rowPositions.length - 1];
    if (cursorY > lastRow.midpoint) {
      setDropTarget({ id: lastRow.id, position: 'below' });
      return;
    }

    // Find the gap between rows where cursor is
    for (let i = 0; i < rowPositions.length; i++) {
      const current = rowPositions[i];
      const next = rowPositions[i + 1];

      if (cursorY <= current.midpoint) {
        setDropTarget({ id: current.id, position: 'above' });
        return;
      } else if (!next || cursorY <= next.midpoint) {
        setDropTarget({ id: current.id, position: 'below' });
        return;
      }
    }

    setDropTarget(null);
  };

  // Helper function to check if a stage is a descendant of another
  const isStageDescendant = (potentialDescendant: ScopeStage, ancestor: ScopeStage): boolean => {
    if (!potentialDescendant.parentId) return false;
    if (potentialDescendant.parentId === ancestor.id) return true;
    const parent = scopeStages.find(s => s.id === potentialDescendant.parentId);
    if (!parent) return false;
    return isStageDescendant(parent, ancestor);
  };

  // Unified drag end handler for both stages and items
  const handleUnifiedDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    const activeIdStr = active.id as string;

    // Clear all drag states
    setActiveStageId(null);
    setOverStageId(null);
    setActiveId(null);
    setOverId(null);
    setDropTarget(null); // Clear drop indicator

    if (!over || active.id === over.id) return;

    // Determine if we're dragging a stage or item
    if (isStageId(activeIdStr)) {
      // Handle stage drag end
      const activeStage = scopeStages.find(s => s.id === activeIdStr);
      const overStage = scopeStages.find(s => s.id === over.id);

      if (!activeStage || !overStage) return;

      // Prevent nesting cycles
      if (isStageDescendant(overStage, activeStage)) {
        toast({
          title: "Cannot nest stage",
          description: "Cannot nest a parent stage under its own child",
          variant: "destructive"
        });
        return;
      }

      // Determine if this is a reorder or a nest operation
      const isSameParent = activeStage.parentId === overStage.parentId;

      if (isSameParent) {
        // Reorder within same parent level
        const siblingStages = scopeStages.filter(s => s.parentId === activeStage.parentId);
        const oldIndex = siblingStages.findIndex(s => s.id === active.id);
        const newIndex = siblingStages.findIndex(s => s.id === over.id);

        if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
          const reordered = arrayMove(siblingStages, oldIndex, newIndex);
          const updates = reordered.map((stage, index) => ({
            id: stage.id,
            displayOrder: index,
            parentId: stage.parentId || null,
          }));

          reorderStagesMutation.mutate(updates);
          toast({ title: "Stages reordered" });
        }
      } else {
        // Nest active stage under over stage
        const targetSiblings = scopeStages.filter(s => s.parentId === overStage.id);
        const newDisplayOrder = targetSiblings.length;

        const updates = [{
          id: activeStage.id,
          displayOrder: newDisplayOrder,
          parentId: overStage.id,
        }];

        reorderStagesMutation.mutate(updates);
        toast({ title: `"${activeStage.name}" nested under "${overStage.name}"` });
      }
    } else {
      // Handle item drag end (existing logic)
      handleItemDragEnd(event);
    }
  };

  // Item-specific drag end logic (extracted from original handleDragEnd)
  const handleItemDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    const overId = over.id as string;
    const activeItem = scopeItems.find(i => i.id === active.id);
    if (!activeItem) return;

    // Check if dragged over a stage
    if (overId.startsWith('stage-')) {
      const targetStage = overId.replace('stage-', '');
      if (activeItem.stage !== targetStage) {
        handleUpdateItem(activeItem.id, {
          stage: targetStage,
          parentId: null,
          displayOrder: getItemsByStage(targetStage).length
        });
        toast({ title: `Item moved to "${targetStage}"` });
      }
      return;
    }

    // Dragged over another item
    const overItem = scopeItems.find(i => i.id === overId);
    if (!overItem) return;

    // If both items are in the same stage, it's a reorder
    if (activeItem.stage === overItem.stage) {
      const stageItems = getItemsByStage(activeItem.stage || '');
      const oldIndex = stageItems.findIndex(i => i.id === active.id);
      const newIndex = stageItems.findIndex(i => i.id === overId);

      if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
        const reordered = arrayMove(stageItems, oldIndex, newIndex);

        // Send updates - reorderMutation handles optimistic updates
        reorderMutation.mutate(reordered.map((item, index) => ({
          id: item.id,
          displayOrder: index
        })));
      }
    } else {
      // Moving to different stage (take stage from target item)
      handleUpdateItem(activeItem.id, {
        stage: overItem.stage,
        parentId: overItem.parentId,
        displayOrder: (overItem.displayOrder || 0) + 1
      });
      toast({ title: `Item moved to "${overItem.stage}"` });
    }
  };

  // Note: We no longer auto-initialize stages - projects can start with empty scope
  // Users can manually add stages or apply a template if needed

  // Initialize stage expanded state when stages load
  if (scopeStages.length > 0 && Object.keys(stageExpanded).length === 0) {
    const initialExpanded: StageState = {};
    scopeStages.forEach(stage => {
      initialExpanded[stage.name] = true;
    });
    setStageExpanded(initialExpanded);

    // Set first stage as default for PDF if not set
    if (!pdfStage && scopeStages[0]) {
      setPdfStage(scopeStages[0].name);
    }
  }

  const handleUpdateItem = (id: string, data: Partial<ScopeItem>) => {
    updateItemMutation.mutate({ id, data });
  };

  const handleDeleteItem = (id: string) => {
    setDeletingItemId(id);
  };

  const confirmDeleteItem = () => {
    if (deletingItemId) {
      deleteItemMutation.mutate(deletingItemId);
      setDeletingItemId(null);
    }
  };

  // Handle view PO - navigate to the PO page
  const handleViewPO = (poId: string) => {
    window.location.href = `/projects/${projectId}/purchase-orders/${poId}`;
  };

  const handleLinkPO = (poId: string, stageId: string) => {
    linkPOMutation.mutate({ poId, stageId });
  };

  const handleUnlinkPO = (poId: string) => {
    unlinkPOMutation.mutate(poId);
  };

  const handleLinkChecklist = (checklistId: string, stageId: string) => {
    linkChecklistMutation.mutate({ checklistId, stageId });
  };

  const handleUnlinkChecklist = (checklistId: string) => {
    unlinkChecklistMutation.mutate(checklistId);
  };

  const handleLinkTask = (taskId: string, stageId: string) => {
    linkTaskMutation.mutate({ taskId, stageId });
  };

  const handleUnlinkTask = (taskId: string) => {
    unlinkTaskMutation.mutate(taskId);
  };

  // Stage file attachments
  const [uploadingStageIds, setUploadingStageIds] = useState<Set<string>>(new Set());
  const [previewAttachment, setPreviewAttachment] = useState<{
    name: string;
    objectPath: string;
    size: number;
  } | null>(null);
  const { uploadFile } = useUpload();

  const handleAddStageAttachment = async (stageId: string, file: File) => {
    if (file.size > 20 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Maximum 20MB per file.",
        variant: "destructive",
      });
      return;
    }

    // One lifecycle toast we update (loading -> success/error) to avoid spam.
    const lifecycle = toast({
      title: "Uploading…",
      description: file.name,
    });

    setUploadingStageIds(prev => {
      const next = new Set(prev);
      next.add(stageId);
      return next;
    });

    try {
      const result = await uploadFile(file);
      if (!result) {
        throw new Error("Upload failed. Please try again.");
      }

      // Read the freshest attachments from the React Query cache so concurrent
      // uploads don't clobber each other (race-safe append).
      const stagesKey = [`/api/projects/${projectId}/scope-stages`];
      const latestStages = queryClient.getQueryData<ScopeStage[]>(stagesKey);
      const latestStage = latestStages?.find(s => s.id === stageId)
        ?? scopeStages.find(s => s.id === stageId);
      const existing = Array.isArray((latestStage as any)?.attachments)
        ? (latestStage as any).attachments
        : [];

      const newAttachment = {
        id: crypto.randomUUID(),
        name: result.metadata.name,
        objectPath: result.objectPath,
        size: result.metadata.size,
        uploadedAt: new Date().toISOString(),
      };

      await updateStageAttachmentsMutation.mutateAsync({
        stageId,
        attachments: [...existing, newAttachment],
      });

      lifecycle.update({
        id: lifecycle.id,
        title: "File attached",
        description: result.metadata.name,
      });
    } catch (err: any) {
      console.error('[Scope] Stage attachment failed:', err);
      const detail =
        err?.payload?.details ||
        err?.payload?.error ||
        err?.message ||
        "Could not attach file. Please try again.";
      lifecycle.update({
        id: lifecycle.id,
        title: "Upload failed",
        description: String(detail),
        variant: "destructive",
      });
    } finally {
      setUploadingStageIds(prev => {
        const next = new Set(prev);
        next.delete(stageId);
        return next;
      });
    }
  };

  const handleDeleteStageAttachment = (stageId: string, attachmentId: string) => {
    const stage = scopeStages.find(s => s.id === stageId);
    const existing = Array.isArray((stage as any)?.attachments) ? (stage as any).attachments : [];
    updateStageAttachmentsMutation.mutate({
      stageId,
      attachments: existing.filter((a: any) => a.id !== attachmentId),
    });
  };

  // Handle view schedule item - navigate to the schedule page
  const handleViewScheduleItem = (itemId: string) => {
    window.location.href = `/projects/${projectId}/schedule`;
  };

  const handleToggleSelect = (id: string) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedItems(newSelected);
  };

  // Inline blank-row item creation handlers
  const handleStartInlineAdd = (stage: string) => {
    setAddingForStage(stage);
  };

  const handleSaveInlineAdd = (title: string, stage: string) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    createItemMutation.mutate({
      title: trimmed,
      description: '',
      stage,
    });
    // Keep adding mode active so the next blank row appears for the same stage
    setAddingForStage(stage);
  };

  const handleCancelInlineAdd = () => {
    setAddingForStage(null);
  };

  // Detail panel handlers
  const handleOpenDetail = (itemId: string) => {
    setDetailItemId(itemId);
  };

  const handleCloseDetail = () => {
    setDetailItemId(null);
  };

  const toggleStage = (stageName: string) => {
    setStageExpanded(prev => ({ ...prev, [stageName]: !prev[stageName] }));
  };

  // Collapse/Expand all stages
  const toggleAllStages = () => {
    const allExpanded = scopeStages.every(stage => stageExpanded[stage.name]);
    const newExpanded: StageState = {};
    scopeStages.forEach(stage => {
      newExpanded[stage.name] = !allExpanded;
    });
    setStageExpanded(newExpanded);
  };

  // Check if all stages are expanded
  const allStagesExpanded = scopeStages.length > 0 && scopeStages.every(stage => stageExpanded[stage.name]);

  // Returns items for a stage, filtered by role visibility AND active UI type chips.
  // The guard uses scopeItemTypeDefs.length (all company definitions) so that a user
  // whose role has zero visible types correctly sees NO items (not all items).
  const getItemsByStage = (stageName: string) => {
    return scopeItems
      .filter(item => item.stage === stageName)
      .filter(item => {
        const type = item.itemType || 'scope';
        // Role visibility filter (only active when company has type definitions configured)
        if (scopeItemTypeDefs.length > 0) {
          const def = visibleTypeDefs.find(d => d.name.toLowerCase() === type.toLowerCase());
          if (!def && !isAdmin) return false;
        }
        // Active type chip filter (UI toggle)
        return activeTypeFilters.has(type);
      })
      .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));
  };

  // Returns items for PDF export — applies role visibility only (ignores UI chip toggles so all
  // role-permitted types export). Guard uses scopeItemTypeDefs.length so a zero-visible-types
  // role correctly exports nothing rather than bypassing the filter.
  const getPdfItemsByStage = (stageName: string) => {
    return scopeItems
      .filter(item => item.stage === stageName)
      .filter(item => {
        const type = item.itemType || 'scope';
        if (scopeItemTypeDefs.length > 0) {
          const def = visibleTypeDefs.find(d => d.name.toLowerCase() === type.toLowerCase());
          if (!def && !isAdmin) return false;
        }
        return true;
      })
      .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));
  };

  // Scope 2.0: Toggle type filter
  const toggleTypeFilter = (type: string) => {
    const newFilters = new Set(activeTypeFilters);
    if (newFilters.has(type)) {
      newFilters.delete(type);
    } else {
      newFilters.add(type);
    }
    setActiveTypeFilters(newFilters);
  };

  // Scope 2.0: Toggle item collapse/expand
  const toggleItemCollapse = (itemId: string) => {
    const newCollapsed = new Set(collapsedItems);
    if (newCollapsed.has(itemId)) {
      newCollapsed.delete(itemId);
    } else {
      newCollapsed.add(itemId);
    }
    setCollapsedItems(newCollapsed);
  };

  // Determine if current user is admin (roleName and roleId are top-level on User type)
  const roleName = user?.roleName ?? '';
  const isAdmin = roleName.toLowerCase().includes('admin') || roleName.toLowerCase().includes('owner') || roleName.toLowerCase().includes('general manager');
  const currentRoleId = user?.roleId ?? null;

  // Compute visible type definitions for the current user
  const visibleTypeDefs = scopeItemTypeDefs.filter(def => {
    const roles = (def.visibleToRoles as string[]) ?? [];
    if (roles.length === 0) return true; // No restriction = everyone can see
    return currentRoleId != null && roles.includes(currentRoleId);
  });

  // Scope 2.0: Type label helper — now uses custom type defs if available
  const getTypeLabel = (type: string | null | undefined): string => {
    if (scopeItemTypeDefs.length > 0) {
      const def = scopeItemTypeDefs.find(d => d.name.toLowerCase() === (type || '').toLowerCase());
      if (def) return def.name.toUpperCase();
    }
    const typeMap: Record<string, string> = {
      'e-note': 'E-NOTE',
      'scope': 'SCOPE',
      'note': 'NOTE',
      'tool': 'TOOL',
      'material': 'MATERIAL',
      'proposal': 'PROPOSAL',
      'checklist': 'CHECKLIST',
    };
    return typeMap[type || 'scope'] || (type?.toUpperCase() ?? 'SCOPE');
  };

  const handleEditStage = (stageId: string, newName: string) => {
    const trimmedNewName = newName.trim();
    if (!trimmedNewName) {
      toast({
        title: "Invalid stage name",
        description: "Stage name cannot be empty",
        variant: "destructive"
      });
      return;
    }
    const isDuplicate = scopeStages.some(s =>
      s.id !== stageId && s.name.trim().toLowerCase() === trimmedNewName.toLowerCase()
    );
    if (isDuplicate) {
      toast({
        title: "Duplicate stage name",
        description: `A stage named "${trimmedNewName}" already exists`,
        variant: "destructive"
      });
      return;
    }
    updateStageMutation.mutate({ id: stageId, name: trimmedNewName });
  };

  const handleDeleteStage = (stageId: string) => {
    deleteStageMutation.mutate(stageId);
  };

  const handleAddNewStage = (afterStageId: string) => {
    setAddStageAfterId(afterStageId);
    setIsAddStageDialogOpen(true);
  };

  const handleCreateNewStage = async () => {
    const trimmedName = newStageName.trim();
    if (!trimmedName || !addStageAfterId) return;

    const isDuplicate = scopeStages.some(s =>
      s.name.trim().toLowerCase() === trimmedName.toLowerCase()
    );
    if (isDuplicate) {
      toast({
        title: "Duplicate stage name",
        description: `A stage named "${trimmedName}" already exists`,
        variant: "destructive"
      });
      return;
    }

    const afterStage = scopeStages.find(s => s.id === addStageAfterId);
    if (!afterStage) return;

    // Find all sibling stages at the same level (same parentId) sorted by displayOrder
    const siblingStages = scopeStages
      .filter(s => s.parentId === afterStage.parentId)
      .sort((a, b) => a.displayOrder - b.displayOrder);

    // Find the index of afterStage in siblings
    const afterStageIndex = siblingStages.findIndex(s => s.id === addStageAfterId);

    // The new stage's displayOrder will always be afterStage.displayOrder + 1
    const displayOrder = afterStage.displayOrder + 1;

    // Check if we need to shift subsequent siblings
    const subsequentSiblings = siblingStages.slice(afterStageIndex + 1);
    const stagesToShift = subsequentSiblings.filter(s => s.displayOrder >= displayOrder);

    if (stagesToShift.length > 0) {
      // Shift all subsequent stages up by 1 to make room
      const updates = stagesToShift.map(s => ({
        id: s.id,
        displayOrder: s.displayOrder + 1,
        parentId: s.parentId || null,
      }));

      // Use the existing reorder mutation with mutateAsync to await completion
      try {
        await reorderStagesMutation.mutateAsync(updates);
      } catch (error) {
        console.error('Failed to shift stages:', error);
        toast({
          title: "Failed to add stage",
          description: "Could not make room for new stage",
          variant: "destructive"
        });
        return;
      }
    }

    // Now create the new stage after reordering is complete
    createStageMutation.mutate({
      name: trimmedName,
      displayOrder,
    });

    setIsAddStageDialogOpen(false);
    setNewStageName("");
    setAddStageAfterId(null);
  };

  // Fuzzy matching helper - checks if a stage already exists with similar name
  const fuzzyMatchStage = (groupName: string): { matched: boolean; existingStage?: string } => {
    const normalizedGroupName = groupName.toLowerCase().trim();
    for (const stage of scopeStages) {
      const normalizedStageName = stage.name.toLowerCase().trim();
      // Exact match
      if (normalizedStageName === normalizedGroupName) {
        return { matched: true, existingStage: stage.name };
      }
      // Contains match (either direction)
      if (normalizedStageName.includes(normalizedGroupName) || normalizedGroupName.includes(normalizedStageName)) {
        return { matched: true, existingStage: stage.name };
      }
      // Word similarity (at least 2 words matching)
      const groupWords = normalizedGroupName.split(/\s+/);
      const stageWords = normalizedStageName.split(/\s+/);
      const matchingWords = groupWords.filter(gw => stageWords.some(sw => sw === gw || sw.includes(gw) || gw.includes(sw)));
      if (matchingWords.length >= Math.min(2, groupWords.length)) {
        return { matched: true, existingStage: stage.name };
      }
    }
    return { matched: false };
  };

  // Import stages from estimate groups
  const handleImportFromEstimate = async () => {
    if (!selectedEstimateForImport || selectedGroupsToImport.size === 0) return;

    const groupsToImport = estimateGroups
      .filter(g => selectedGroupsToImport.has(g.id))
      .sort((a, b) => a.order - b.order);

    const maxDisplayOrder = scopeStages.length > 0
      ? Math.max(...scopeStages.map(s => s.displayOrder)) + 1
      : 0;

    let importCount = 0;
    for (let i = 0; i < groupsToImport.length; i++) {
      const group = groupsToImport[i];
      try {
        await apiRequest(`/api/projects/${projectId}/scope-stages`, 'POST', {
          projectId,
          name: group.name,
          displayOrder: maxDisplayOrder + i,
        });
        importCount++;
      } catch (err) {
        console.error('Failed to import stage:', group.name, err);
      }
    }

    queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/scope-stages`] });
    toast({ title: `Imported ${importCount} stage${importCount !== 1 ? 's' : ''} from estimate` });

    // Reset state
    setIsImportFromEstimateOpen(false);
    setSelectedEstimateForImport(null);
    setSelectedGroupsToImport(new Set());
  };

  // Toggle group selection for import
  const toggleGroupForImport = (groupId: string) => {
    const newSet = new Set(selectedGroupsToImport);
    if (newSet.has(groupId)) {
      newSet.delete(groupId);
    } else {
      newSet.add(groupId);
    }
    setSelectedGroupsToImport(newSet);
  };

  // Auto-select new groups (ones that don't have a fuzzy match)
  const selectAllNewGroups = () => {
    const newGroups = estimateGroups.filter(g => !fuzzyMatchStage(g.name).matched);
    setSelectedGroupsToImport(new Set(newGroups.map(g => g.id)));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">Loading scope...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Single Row Header - Filters & Actions */}
      <div className="h-9 flex items-center justify-between px-3 border-b border-border/50 bg-background gap-2">
        {/* Left: Expand/Collapse + Filter dropdown */}
        <div className="flex items-center gap-1">
          {/* Collapse/Expand All Stages — far left */}
          {scopeStages.length > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={toggleAllStages}
                  className="h-6 w-6 flex items-center justify-center rounded-md border border-border/50 hover-elevate active-elevate-2"
                  data-testid="button-toggle-all-stages"
                >
                  {allStagesExpanded ? (
                    <ChevronsDownUp className="h-3 w-3" />
                  ) : (
                    <ChevronsUpDown className="h-3 w-3" />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{allStagesExpanded ? 'Collapse All' : 'Expand All'}</p>
              </TooltipContent>
            </Tooltip>
          )}

          {/* Type Filter dropdown — collapsed into one button */}
          {(() => {
            const filterDefs = scopeItemTypeDefs.length > 0
              ? visibleTypeDefs
              : SCOPE_TYPES.map(t => ({ id: t, name: t, displayOrder: 0, visibleToRoles: [], companyId: '', createdAt: new Date() }));
            const totalTypes = filterDefs.length;
            const activeCount = filterDefs.filter(d => activeTypeFilters.has(d.name.toLowerCase())).length;
            const allActive = totalTypes > 0 && activeCount === totalTypes;
            const noneActive = activeCount === 0;
            const tooltipLabel = allActive
              ? 'Filter'
              : noneActive
                ? 'Filter (none)'
                : `Filter (${activeCount} of ${totalTypes})`;
            return (
              <DropdownMenu>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                      <button
                        className={`relative h-6 w-6 flex items-center justify-center rounded-md border transition-all hover-elevate active-elevate-2 ${
                          !allActive
                            ? 'bg-primary/10 text-primary border-primary/20'
                            : 'border-border/50 text-muted-foreground'
                        }`}
                        data-testid="button-filter-types"
                        aria-label={tooltipLabel}
                      >
                        <Filter className="h-3 w-3" />
                        {!allActive && !noneActive && (
                          <span
                            className="absolute -top-1 -right-1 min-w-[14px] h-[14px] px-1 rounded-full bg-primary text-white text-[9px] leading-[14px] font-semibold text-center"
                            data-testid="badge-filter-types-count"
                          >
                            {activeCount}
                          </span>
                        )}
                      </button>
                    </DropdownMenuTrigger>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">{tooltipLabel}</TooltipContent>
                </Tooltip>
                <DropdownMenuContent align="start" className="w-48">
                  {filterDefs.map(def => {
                    const type = def.name.toLowerCase();
                    return (
                      <DropdownMenuCheckboxItem
                        key={def.id || def.name}
                        checked={activeTypeFilters.has(type)}
                        onCheckedChange={() => toggleTypeFilter(type)}
                        onSelect={(e) => e.preventDefault()}
                        data-testid={`dropdown-filter-${type}`}
                      >
                        {def.name.charAt(0).toUpperCase() + def.name.slice(1).toLowerCase()}
                      </DropdownMenuCheckboxItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            );
          })()}
        </div>

        {/* Right: One options dropdown */}
        <div className="flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="h-6 w-6 flex items-center justify-center rounded-md border border-border/50 hover-elevate active-elevate-2"
                data-testid="button-scope-options"
                aria-label="Scope options"
              >
                <MoreHorizontal className="h-3 w-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuCheckboxItem
                checked={showDescriptionInline}
                onCheckedChange={(c) => setShowDescriptionInline(!!c)}
                onSelect={(e) => e.preventDefault()}
                data-testid="option-show-descriptions"
              >
                <AlignLeft className="h-3.5 w-3.5 mr-2" />
                Show descriptions
              </DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => {
                  if (scopeStages.length > 0) {
                    setAddStageAfterId(scopeStages[scopeStages.length - 1].id);
                  }
                  setIsAddStageDialogOpen(true);
                }}
                data-testid="option-add-stage"
              >
                <Plus className="h-3.5 w-3.5 mr-2" />
                Add Stage
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setIsTemplateDialogOpen(true)}
                data-testid="option-load-template"
              >
                <FileDown className="h-3.5 w-3.5 mr-2" />
                Load Template
              </DropdownMenuItem>
              {estimates.length > 0 && (
                <DropdownMenuItem
                  onClick={() => setIsImportFromEstimateOpen(true)}
                  data-testid="option-import-stages"
                >
                  <FileText className="h-3.5 w-3.5 mr-2" />
                  Import Stages
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setIsPdfDialogOpen(true)}
                data-testid="option-export-pdf"
              >
                <FileText className="h-3.5 w-3.5 mr-2" />
                Export PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Load Template */}
          <Dialog open={isTemplateDialogOpen} onOpenChange={setIsTemplateDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Apply Scope Template</DialogTitle>
                <DialogDescription>
                  Choose a template to populate your project scope
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Template</Label>
                  <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a template" />
                    </SelectTrigger>
                    <SelectContent>
                      {templates.map((template) => (
                        <SelectItem key={template.id} value={template.id}>
                          {template.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button
                  onClick={() => selectedTemplate && applyTemplateMutation.mutate(selectedTemplate)}
                  disabled={!selectedTemplate || applyTemplateMutation.isPending}
                >
                  {applyTemplateMutation.isPending ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" />Applying...</>) : "Apply Template"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Export PDF */}
          <Dialog open={isPdfDialogOpen} onOpenChange={(open) => {
            setIsPdfDialogOpen(open);
            if (!open) {
              setHideClientCosts(false); // Reset toggle when dialog closes
            }
          }}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Export PDF</DialogTitle>
                <DialogDescription>
                  Select a stage and customize for clients
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Stage</Label>
                  <Select value={pdfStage} onValueChange={setPdfStage}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {scopeStages.map((stage) => (
                        <SelectItem key={stage.id} value={stage.name}>
                          {stage.name} ({getItemsByStage(stage.name).length} items)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="hide-costs"
                    checked={hideClientCosts}
                    onCheckedChange={(checked) => setHideClientCosts(!!checked)}
                    data-testid="checkbox-hide-costs"
                  />
                  <Label htmlFor="hide-costs" className="text-sm font-normal cursor-pointer">
                    Client-facing (hide costs)
                  </Label>
                </div>
                <p className="text-xs text-muted-foreground">
                  Enable to generate a clean PDF without pricing for clients
                </p>
              </div>
              <DialogFooter>
                <PDFDownloadLink
                  document={<ScopePDF stage={pdfStage} items={getPdfItemsByStage(pdfStage)} hideClientCosts={hideClientCosts} />}
                  fileName={`scope-${pdfStage.toLowerCase()}${hideClientCosts ? '-client' : ''}.pdf`}
                >
                  {({ loading }) => (
                    <Button disabled={loading}>
                      {loading ? 'Generating...' : 'Download PDF'}
                    </Button>
                  )}
                </PDFDownloadLink>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Main Content + Detail Panel */}
      <div className="flex-1 flex min-h-0">
      <div className="flex-1 overflow-auto p-6 transition-all duration-200">
        <div className="max-w-5xl mx-auto">
          {scopeItems.length === 0 && scopeStages.length === 0 ? (
            <EmptyState
              variant="card"
              icon={ListTree}
              title="No scope items yet"
              description={'Load the "Standard Slab" template to get started with 12 pre-filled items'}
            />
          ) : (
            // Unified DnD Context for both stages and items
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleUnifiedDragStart}
              onDragOver={handleUnifiedDragOver}
              onDragMove={handleDragMove}
              onDragEnd={handleUnifiedDragEnd}
            >
              <SortableContext
                items={[...scopeStages.map(s => s.id), ...scopeItems.map(i => i.id)]}
                strategy={verticalListSortingStrategy}
              >
                {scopeStages
                  .filter(stage => !stage.parentId) // Only show top-level stages
                  .sort((a, b) => a.displayOrder - b.displayOrder)
                  .map((stage) => (
                    <StageCard
                      key={stage.id}
                      stageData={stage}
                      items={getItemsByStage(stage.name)}
                      isExpanded={stageExpanded[stage.name] ?? true}
                      onToggleExpand={() => toggleStage(stage.name)}
                      onUpdate={handleUpdateItem}
                      onDelete={handleDeleteItem}
                      onToggleSelect={handleToggleSelect}
                      onStartInlineAdd={handleStartInlineAdd}
                      addingForStage={addingForStage}
                      onSaveInlineAdd={handleSaveInlineAdd}
                      onCancelInlineAdd={handleCancelInlineAdd}
                      onOpenDetail={handleOpenDetail}
                      detailItemId={detailItemId}
                      onEditStage={handleEditStage}
                      onDeleteStage={handleDeleteStage}
                      onAddNewStage={handleAddNewStage}
                      selectedItems={selectedItems}
                      isOver={overStageId === stage.id}
                      isDraggingStage={!!activeStageId}
                      allItems={scopeItems}
                      editingStageId={editingStageId}
                      editingStageName={editingStageName}
                      setEditingStageId={setEditingStageId}
                      setEditingStageName={setEditingStageName}
                      children={scopeStages.filter(s => s.parentId === stage.id)}
                      allStages={scopeStages}
                      collapsedItems={collapsedItems} // Scope 2.0
                      onToggleItemCollapse={toggleItemCollapse} // Scope 2.0
                      getTypeLabel={getTypeLabel} // Scope 2.0
                      linkedPOs={posByStage[stage.id] || []}
                      onViewPO={handleViewPO}
                      allProjectPOs={projectPOs}
                      onLinkPO={handleLinkPO}
                      onUnlinkPO={handleUnlinkPO}
                      linkedScheduleItems={scheduleItemsByStage[stage.id] || []}
                      onViewScheduleItem={handleViewScheduleItem}
                      showDescriptionInline={showDescriptionInline}
                      dropTarget={dropTarget}
                      onToggleStageComplete={handleToggleStageComplete}
                      checklistCount={checklistCountByStage[stage.id] || 0}
                      onNavigateToChecklists={handleNavigateToChecklists}
                      linkedChecklists={checklistsByStage[stage.id] || []}
                      allProjectChecklists={projectChecklistInstances}
                      onLinkChecklist={handleLinkChecklist}
                      onUnlinkChecklist={handleUnlinkChecklist}
                      onAddStageAttachment={handleAddStageAttachment}
                      onDeleteStageAttachment={handleDeleteStageAttachment}
                      onPreviewAttachment={setPreviewAttachment}
                      isAttachmentUploading={uploadingStageIds.has(stage.id)}
                      allProjectTasks={projectTasks}
                      onLinkTask={handleLinkTask}
                      onUnlinkTask={handleUnlinkTask}
                      labourBudgetData={labourBudgetData}
                      onUpdateLabourTrackers={handleUpdateLabourTrackers}
                    />
                  ))}
              </SortableContext>

              {/* Unified Drag Overlay - shows either stage or item - dropAnimation null to prevent bounce-back */}
              <DragOverlay dropAnimation={null}>
                {activeStageId && scopeStages.find(s => s.id === activeStageId) ? (
                  <Card className="opacity-90 border-l-4 shadow-lg" style={{ borderLeftColor: PRIMARY_COLOR }}>
                    <CardHeader className="py-2 px-4">
                      <CardTitle className="text-base font-semibold text-primary">
                        {scopeStages.find(s => s.id === activeStageId)?.name}
                      </CardTitle>
                    </CardHeader>
                  </Card>
                ) : activeId && scopeItems.find(i => i.id === activeId) ? (
                  <Card className="opacity-90 border-l-4 shadow-lg" style={{ borderLeftColor: PRIMARY_COLOR }}>
                    <CardContent className="py-2 px-3">
                      <div className="font-medium text-sm">
                        {scopeItems.find(i => i.id === activeId)?.title}
                      </div>
                    </CardContent>
                  </Card>
                ) : null}
              </DragOverlay>
            </DndContext>
          )}
        </div>
      </div>

      {/* Right-side detail panel — shrinks main content (not an overlay) */}
      {detailItemId && (() => {
        const detailItem = scopeItems.find(i => i.id === detailItemId);
        if (!detailItem) return null;
        return (
          <ScopeItemDetailPanel
            item={detailItem}
            onClose={handleCloseDetail}
            onUpdate={handleUpdateItem}
            scopeItemTypeDefs={scopeItemTypeDefs}
            visibleTypeDefs={visibleTypeDefs}
          />
        );
      })()}
      </div>

      {/* Add New Stage Dialog */}
      <Dialog open={isAddStageDialogOpen} onOpenChange={(open) => {
        setIsAddStageDialogOpen(open);
        if (!open) {
          setNewStageName("");
          setAddStageAfterId(null);
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Stage</DialogTitle>
            <DialogDescription>
              Create a new stage after the selected stage
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="stage-name">Stage Name</Label>
              <Input
                id="stage-name"
                value={newStageName}
                onChange={(e) => setNewStageName(e.target.value)}
                placeholder="e.g., Pre-Construction, Finishing"
                data-testid="input-new-stage-name"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newStageName.trim()) {
                    handleCreateNewStage();
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={handleCreateNewStage}
              disabled={!newStageName.trim() || createStageMutation.isPending}
              data-testid="button-create-stage"
            >
              {createStageMutation.isPending ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creating...</>) : "Add Stage"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import from Estimate Dialog */}
      <Dialog open={isImportFromEstimateOpen} onOpenChange={(open) => {
        setIsImportFromEstimateOpen(open);
        if (!open) {
          setSelectedEstimateForImport(null);
          setSelectedGroupsToImport(new Set());
        }
      }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Import Stages from Estimate</DialogTitle>
            <DialogDescription>
              Select estimate groups to create as scope stages. Groups that match existing stages are highlighted.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Estimate Selection */}
            <div>
              <Label>Select Estimate</Label>
              <Select
                value={selectedEstimateForImport || ''}
                onValueChange={(val) => {
                  setSelectedEstimateForImport(val);
                  setSelectedGroupsToImport(new Set());
                }}
              >
                <SelectTrigger data-testid="select-estimate-for-import">
                  <SelectValue placeholder="Choose an estimate" />
                </SelectTrigger>
                <SelectContent>
                  {estimates.map((est) => (
                    <SelectItem key={est.id} value={est.id}>
                      {est.name || 'Untitled Estimate'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Groups List with Fuzzy Match Indicators */}
            {selectedEstimateForImport && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Estimate Groups ({estimateGroups.length})</Label>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 text-xs"
                    onClick={selectAllNewGroups}
                  >
                    Select New Only
                  </Button>
                </div>
                <div className="border rounded-md max-h-[300px] overflow-y-auto">
                  {estimateGroups.length === 0 ? (
                    <EmptyState
                      variant="inline"
                      title="No groups found in this estimate"
                      className="p-4"
                    />
                  ) : (
                    estimateGroups
                      .filter(g => !g.parentGroupId) // Only top-level groups
                      .sort((a, b) => a.order - b.order)
                      .map((group) => {
                        const match = fuzzyMatchStage(group.name);
                        const isSelected = selectedGroupsToImport.has(group.id);

                        return (
                          <div
                            key={group.id}
                            className={`flex items-center gap-3 p-3 border-b last:border-b-0 cursor-pointer hover:bg-muted/50 ${
                              isSelected ? 'bg-primary/10' : ''
                            }`}
                            onClick={() => toggleGroupForImport(group.id)}
                            data-testid={`import-group-${group.id}`}
                          >
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggleGroupForImport(group.id)}
                              className="h-4 w-4"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-sm truncate">{group.name}</div>
                              {group.description && (
                                <div className="text-xs text-muted-foreground truncate">{group.description}</div>
                              )}
                            </div>
                            {match.matched ? (
                              <Badge variant="outline" className="shrink-0 bg-status-warning-bg text-status-warning border-status-warning/30 text-data">
                                Matches: {match.existingStage}
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="shrink-0 bg-status-success-bg text-status-success border-status-success/30 text-data">
                                New
                              </Badge>
                            )}
                          </div>
                        );
                      })
                  )}
                </div>
                {selectedGroupsToImport.size > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {selectedGroupsToImport.size} group{selectedGroupsToImport.size !== 1 ? 's' : ''} selected for import
                  </p>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsImportFromEstimateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleImportFromEstimate}
              disabled={selectedGroupsToImport.size === 0}
              data-testid="button-confirm-import-stages"
            >
              Import {selectedGroupsToImport.size} Stage{selectedGroupsToImport.size !== 1 ? 's' : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Scope Item Confirmation Dialog */}
      <AlertDialog open={!!deletingItemId} onOpenChange={(open) => !open && setDeletingItemId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Scope Item</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{scopeItems.find(i => i.id === deletingItemId)?.title}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-item">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteItem}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete-item"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={!!previewAttachment}
        onOpenChange={(open) => !open && setPreviewAttachment(null)}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="truncate pr-6">
              {previewAttachment?.name ?? 'Attachment'}
            </DialogTitle>
            <DialogDescription>
              {previewAttachment
                ? previewAttachment.size < 1024 * 1024
                  ? `${Math.round(previewAttachment.size / 1024)} KB`
                  : `${(previewAttachment.size / (1024 * 1024)).toFixed(1)} MB`
                : ''}
            </DialogDescription>
          </DialogHeader>
          {previewAttachment && (() => {
            const ext = previewAttachment.name.split('.').pop()?.toLowerCase() ?? '';
            const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(ext);
            const isPdf = ext === 'pdf';
            const isVideo = ['mp4', 'webm', 'mov', 'ogv'].includes(ext);
            const isAudio = ['mp3', 'wav', 'ogg', 'm4a'].includes(ext);
            return (
              <div className="flex flex-col gap-3">
                <div className="rounded-md border border-border bg-muted/30 overflow-hidden flex items-center justify-center min-h-[200px]">
                  {isImage ? (
                    <img
                      src={previewAttachment.objectPath}
                      alt={previewAttachment.name}
                      className="max-h-[60vh] w-auto object-contain"
                      data-testid="img-attachment-preview"
                    />
                  ) : isPdf ? (
                    <Suspense
                      fallback={
                        <div className="p-8 text-sm text-muted-foreground">
                          Loading PDF…
                        </div>
                      }
                    >
                      <PdfInlineViewer url={previewAttachment.objectPath} />
                    </Suspense>
                  ) : isVideo ? (
                    <video
                      src={previewAttachment.objectPath}
                      controls
                      className="max-h-[60vh] w-full"
                      data-testid="video-attachment-preview"
                    />
                  ) : isAudio ? (
                    <audio
                      src={previewAttachment.objectPath}
                      controls
                      className="w-full p-4"
                      data-testid="audio-attachment-preview"
                    />
                  ) : (
                    <div className="flex flex-col items-center gap-2 p-8 text-muted-foreground">
                      <Paperclip className="h-8 w-8" />
                      <div className="text-sm">No inline preview available for this file type.</div>
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-end gap-2">
                  <Button
                    variant="outline"
                    asChild
                    data-testid="button-download-attachment"
                  >
                    <a
                      href={previewAttachment.objectPath}
                      download={previewAttachment.name}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Download
                    </a>
                  </Button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

    </div>
  );
}
