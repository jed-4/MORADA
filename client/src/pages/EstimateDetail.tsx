import React from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useEffect, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  MeasuringStrategy,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { 
  ArrowLeft, 
  Lock, 
  LockOpen,
  Unlock, 
  FileText, 
  Plus,
  Edit,
  Trash2,
  MoreHorizontal,
  MoreVertical,
  FolderPlus,
  Loader2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Eye,
  EyeOff,
  GripVertical,
  Filter,
  Download,
  Upload,
  Copy,
  Columns,
  Layers,
  Flag,
  Check
} from "lucide-react";
import { type Estimate, type EstimateItem, type EstimateSummary, type Project, type InsertEstimateItem, insertEstimateItemSchema, type EstimateGroup, type InsertEstimateGroup, insertEstimateGroupSchema, type FieldCategoryWithOptions, type FieldOption, type CompanySettings, type CostCode, type CostCategory, type EstimateTemplate } from "@shared/schema";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { logActivity } from "@/lib/activityLogger";
import { ImportEstimateItemsDialog } from "@/components/estimates/ImportEstimateItemsDialog";
import { CatalogSidebar } from "@/components/estimates/CatalogSidebar";
import { EstimateBreadcrumb } from "@/components/estimates/EstimateBreadcrumb";
import { EstimateGroupCard } from "@/components/estimates/EstimateGroupCard";
import { useUndoStack } from "@/hooks/useUndoStack";
import { CreateRFQDialog } from "@/components/rfq/CreateRFQDialog";
import { CreatePOFromEstimateDialog } from "@/components/estimates/CreatePOFromEstimateDialog";
import { Package, Undo2, ChevronsUpDown, Search, ShoppingCart, Pencil, X, SlidersHorizontal, LayoutTemplate } from "lucide-react";
import {
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
// Table imports removed - now using CSS Grid for pixel-perfect alignment
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { RichTextEditor } from "@/components/RichTextEditor";
import { CostCodeSelect } from "@/components/CostCodeSelect";
import { MultiUserSelect } from "@/components/MultiUserSelect";
import { GridRow, GridCell, GridHeaderRow, GridHeaderCell } from "@/components/estimates/GridRow";
import { EstimateGridLayoutProvider, useEstimateGridLayout } from "@/contexts/EstimateGridLayoutContext";
import { EstimateNotesPopover } from "@/components/estimates/EstimateNotesPopover";
import { EstimateChecklistPopover } from "@/components/estimates/EstimateChecklistPopover";
import EstimateEnotes from "@/components/estimates/EstimateEnotes";
import { LabourEstimatePanel } from "@/pages/LabourEstimate";

interface EstimateDetailParams {
  id?: string;
  estimateId?: string;
  projectId?: string;
}

// Column configuration type - defined outside component to avoid re-creation
type ColumnConfig = { id: string; label: string; visible: boolean; widthPx: number };

// Default columns - defined outside component to maintain stable reference
// Compact widths to fit more data on screen
const DEFAULT_COLUMNS: ColumnConfig[] = [
  { id: 'costCode', label: 'Cost Code', visible: true, widthPx: 90 },
  { id: 'costCategoryId', label: 'Category', visible: false, widthPx: 100 },
  { id: 'type', label: 'Type', visible: true, widthPx: 80 },
  { id: 'item', label: 'Item', visible: true, widthPx: 140 },
  { id: 'description', label: 'Description', visible: true, widthPx: 160 },
  { id: 'status', label: 'Status', visible: true, widthPx: 85 },
  { id: 'proposalVisible', label: 'Proposal', visible: true, widthPx: 70 },
  { id: 'shownAs', label: 'Shown As', visible: true, widthPx: 85 },
  { id: 'allowance', label: 'Allowance', visible: true, widthPx: 70 },
  { id: 'quantity', label: 'Qty', visible: true, widthPx: 60 },
  { id: 'wastage', label: 'Waste', visible: true, widthPx: 55 },
  { id: 'unitType', label: 'Unit', visible: true, widthPx: 55 },
  { id: 'unitCostExTax', label: 'Unit Cost', visible: true, widthPx: 90 },
  { id: 'unitCostIncTax', label: 'Unit Inc', visible: true, widthPx: 85 },
  { id: 'builderCost', label: 'Builder Cost', visible: true, widthPx: 100 },
  { id: 'builderCostIncTax', label: 'Builder Inc', visible: true, widthPx: 95 },
  { id: 'markup', label: 'Markup', visible: true, widthPx: 65 },
  { id: 'markupDollarAmount', label: 'Markup $', visible: false, widthPx: 90 },
  { id: 'clientPriceExTax', label: 'Amount', visible: true, widthPx: 90 },
  { id: 'clientTax', label: 'Tax', visible: true, widthPx: 70 },
  { id: 'clientPriceIncTax', label: 'Amount Inc', visible: true, widthPx: 95 },
  { id: 'notes', label: 'Notes', visible: true, widthPx: 60 },
];

// Sortable Row Component for drag & drop - CSS Grid based
// Uses a wrapper to maintain height during drag and prevent layout collapse
interface SortableRowProps {
  id: string;
  children: React.ReactNode;
  className?: string;
  isDraggable?: boolean;
  gridTemplate: string;
  dropIndicator?: 'above' | 'below' | null;
  activeDragId?: string | null;
}

const SortableRow = React.memo(({ id, children, className, isDraggable = true, gridTemplate, dropIndicator, activeDragId }: SortableRowProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ 
    id, 
    disabled: !isDraggable,
    animateLayoutChanges: () => false,
  });

  // Use a ref to store the last measured height - persists across renders
  const lastHeightRef = React.useRef<number>(40);
  const rowRef = React.useRef<HTMLDivElement>(null);
  
  // Measure height synchronously with useLayoutEffect - runs before paint
  // This ensures we capture the height BEFORE any drag state changes
  React.useLayoutEffect(() => {
    if (rowRef.current && !isDragging) {
      const height = rowRef.current.offsetHeight;
      if (height > 0) {
        lastHeightRef.current = height;
      }
    }
  });

  // Combine refs for both measurement and sortable
  const combinedRef = React.useCallback((node: HTMLDivElement | null) => {
    (rowRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
    setNodeRef(node);
  }, [setNodeRef]);

  // When dragging, render a placeholder that maintains the exact height AND width
  // The placeholder must have the same grid layout as the normal row
  if (isDragging) {
    return (
      <div 
        ref={combinedRef}
        role="row"
        style={{ 
          display: 'grid',
          gridTemplateColumns: gridTemplate,
          height: lastHeightRef.current, 
          minHeight: lastHeightRef.current,
        }}
        className="relative bg-muted/50 border-b border-border"
        data-testid={`row-placeholder-${id}`}
      >
        {/* Dashed placeholder visual overlay */}
        <div 
          className="absolute inset-1 rounded border-2 border-dashed border-muted-foreground/30 pointer-events-none"
          style={{ gridColumn: '1 / -1' }}
        />
        {/* Render children with visibility hidden to maintain column widths */}
        <div style={{ display: 'contents', visibility: 'hidden' }}>
          {children}
        </div>
      </div>
    );
  }

  // Normal rendering when not dragging
  // Only apply Y-axis transform to prevent horizontal shifting
  // Skip transform when a group is being dragged (items shouldn't fly around)
  const isGroupBeingDragged = activeDragId && String(activeDragId).startsWith('group-');
  const style: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: gridTemplate,
    transform: (transform && !isGroupBeingDragged) ? `translateY(${Math.round(transform.y)}px)` : undefined,
    transition: transition || 'transform 150ms ease',
  };

  return (
    <div
      ref={combinedRef}
      role="row"
      style={style}
      className={`relative ${className} group hover-elevate transition-colors border-b border-border/50 last:border-b-0`}
      data-testid={`row-item-${id}`}
      data-sortable-id={id}
    >
      {/* Drop indicator line - shows above or below based on position */}
      {dropIndicator === 'above' && (
        <div className="absolute -top-[2px] left-0 right-0 h-1 bg-[#bba7db] z-50 rounded-full shadow-[0_0_8px_rgba(187,167,219,0.6)]" />
      )}
      {dropIndicator === 'below' && (
        <div className="absolute -bottom-[2px] left-0 right-0 h-1 bg-[#bba7db] z-50 rounded-full shadow-[0_0_8px_rgba(187,167,219,0.6)]" />
      )}
      {/* Drag handle — floats in left dead zone, zero grid cost */}
      {isDraggable && (
        <div
          {...attributes}
          {...listeners}
          className="absolute -left-3 top-0 h-full w-4 flex items-center justify-center opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing transition-opacity z-10"
        >
          <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
      )}
      {children}
    </div>
  );
});

// Sortable Group Component for drag & drop groups
// Uses same placeholder approach as SortableRow to prevent layout collapse
interface SortableGroupProps {
  id: string;
  children: (dragHandleProps: { attributes: any; listeners: any }) => React.ReactNode;
  className?: string;
}

const SortableGroup = React.memo(({ id, children, className }: SortableGroupProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ 
    id,
    animateLayoutChanges: () => false,
  });

  // Use refs to store the last measured dimensions - persist across renders
  const lastHeightRef = React.useRef<number>(100);
  const lastWidthRef = React.useRef<number | undefined>(undefined);
  const groupRef = React.useRef<HTMLDivElement>(null);

  // Measure dimensions synchronously with useLayoutEffect - runs before paint
  React.useLayoutEffect(() => {
    if (groupRef.current && !isDragging) {
      const height = groupRef.current.offsetHeight;
      const width = groupRef.current.offsetWidth;
      if (height > 0) {
        lastHeightRef.current = height;
      }
      if (width > 0) {
        lastWidthRef.current = width;
      }
    }
  });

  // Combine refs
  const combinedRef = React.useCallback((node: HTMLDivElement | null) => {
    (groupRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
    setNodeRef(node);
  }, [setNodeRef]);

  // When dragging, render placeholder to maintain dimensions
  if (isDragging) {
    return (
      <div 
        ref={combinedRef}
        style={{ 
          height: lastHeightRef.current, 
          minHeight: lastHeightRef.current,
          width: lastWidthRef.current,
          minWidth: lastWidthRef.current,
        }}
        className={`${className} bg-muted/50 rounded-lg border-2 border-dashed border-muted-foreground/30`}
        data-testid={`group-placeholder-${id}`}
      >
        {/* Render children invisibly to maintain any internal layout */}
        <div style={{ visibility: 'hidden', pointerEvents: 'none' }}>
          {children({ attributes, listeners })}
        </div>
      </div>
    );
  }

  // Normal rendering - only apply Y-axis transform to prevent horizontal shifting
  const style: React.CSSProperties = {
    transform: transform ? `translateY(${Math.round(transform.y)}px)` : undefined,
    transition: transition || 'transform 150ms ease',
  };

  return (
    <div ref={combinedRef} style={style} className={className}>
      {children({ attributes, listeners })}
    </div>
  );
});

// Note: SortableGroupRow removed - EstimateGroupCard now handles all group rendering with CSS Grid

export default function EstimateDetail() {
  const { id, estimateId, projectId: projectIdFromParams } = useParams<EstimateDetailParams>();
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  
  // Normalize estimate ID - prioritize estimateId (from project-scoped routes), fall back to id (from global routes)
  const effectiveEstimateId = estimateId || id;
  
  // Check if we're creating a new estimate (check location path since /estimates/new doesn't have :id param)
  const isNewEstimate = location === '/estimates/new' || location.includes('/estimates/new') || effectiveEstimateId === 'new';
  
  // Get project ID - prioritize route params for project-scoped routes, fall back to query params for backwards compatibility
  const urlParams = new URLSearchParams(window.location.search);
  const projectIdFromQuery = urlParams.get('projectId');
  const effectiveProjectId = projectIdFromParams || projectIdFromQuery;
  
  // Inline editing state
  const [isEditingName, setIsEditingName] = useState(false);
  const [isSummaryExpanded, setIsSummaryExpanded] = useState(true);
  const [estimateTab, setEstimateTab] = useState<'estimate' | 'enotes' | 'labour'>('estimate');
  const [editingName, setEditingName] = useState("");
  const [isEditingMarkup, setIsEditingMarkup] = useState(false);
  const [editingMarkup, setEditingMarkup] = useState("");
  
  // Add item modal state
  const [isAddItemOpen, setIsAddItemOpen] = useState(false);
  
  // Add group modal state
  const [isAddGroupOpen, setIsAddGroupOpen] = useState(false);
  
  // Import items modal state
  const [isImportOpen, setIsImportOpen] = useState(false);

  // Load from template modal state
  const [isTemplatePickerOpen, setIsTemplatePickerOpen] = useState(false);
  const [templateSearch, setTemplateSearch] = useState("");
  
  // New estimate creation state
  const [newEstimateName, setNewEstimateName] = useState("");

  // Inline editing state for table cells
  const [editingCell, setEditingCell] = useState<{ itemId: string; field: string } | null>(null);
  const [editingValue, setEditingValue] = useState<any>("");
  // Tracks a newly-created inline item that should auto-open name edit
  const pendingAutoFocusItemId = React.useRef<string | null>(null);

  // State to track collapsed parent items
  const [collapsedItems, setCollapsedItems] = useState<Set<string>>(new Set());
  
  // State to hide add-line rows in groups
  const [hideAddLines, setHideAddLines] = useState(false);

  // State for bulk selection
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());
  
  // Bulk action dialogs
  const [isBulkDeleteDialogOpen, setIsBulkDeleteDialogOpen] = useState(false);
  const [isBulkStatusDialogOpen, setIsBulkStatusDialogOpen] = useState(false);
  const [isBulkGroupDialogOpen, setIsBulkGroupDialogOpen] = useState(false);
  const [isBulkMarkupDialogOpen, setIsBulkMarkupDialogOpen] = useState(false);
  const [bulkMarkupValue, setBulkMarkupValue] = useState("");
  const [bulkActionStatus, setBulkActionStatus] = useState<string>('');
  const [bulkActionGroup, setBulkActionGroup] = useState<string>('');
  
  // RFQ dialog
  const [isCreateRFQOpen, setIsCreateRFQOpen] = useState(false);
  const [isCreatePOOpen, setIsCreatePOOpen] = useState(false);
  
  // Single item delete dialog
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  
  // Group delete dialog
  const [isDeleteGroupDialogOpen, setIsDeleteGroupDialogOpen] = useState(false);
  const [groupToDelete, setGroupToDelete] = useState<string | null>(null);
  const [isDeletingGroup, setIsDeletingGroup] = useState(false);
  
  // Group action handlers
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [parentGroupForNewSubgroup, setParentGroupForNewSubgroup] = useState<string | null>(null);
  const [preselectedGroupId, setPreselectedGroupId] = useState<string | null>(null);

  // Edit item dialog state
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);

  // Edit estimate dialog state
  const [isEditEstimateDialogOpen, setIsEditEstimateDialogOpen] = useState(false);
  const [editEstimateForm, setEditEstimateForm] = useState({ name: "", status: "" });

  // Column configuration state - use lazy initializer to deep clone DEFAULT_COLUMNS
  const [columns, setColumns] = useState<ColumnConfig[]>(() => 
    DEFAULT_COLUMNS.map(col => ({ ...col }))
  );

  // Track if preferences have been loaded and if user has modified any settings
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const isApplyingPreferencesRef = React.useRef(false);
  const hasUserModifiedRef = React.useRef(false);
  const lastAppliedPreferencesRef = React.useRef<string | null>(null);

  // Load user view preferences (columns + filters)
  // staleTime: Infinity prevents refetching, gcTime keeps data cached
  const { data: userPreferences, isError: preferencesError } = useQuery({
    queryKey: ["/api/user-view-preferences", "estimate_detail"],
    queryFn: async () => {
      const response = await fetch("/api/user-view-preferences/estimate_detail", {
        credentials: "include",
      });
      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        throw new Error("Failed to fetch view preferences");
      }
      return response.json();
    },
    enabled: !!effectiveEstimateId && !isNewEstimate,
    staleTime: Infinity,
    gcTime: 1000 * 60 * 30,
  });

  // Apply loaded preferences - runs only once when preferences are first loaded
  // Uses ref-based guard to ensure it never runs more than once
  useEffect(() => {
    // Skip if already loaded preferences once (ref guard is most reliable)
    if (lastAppliedPreferencesRef.current !== null) {
      return;
    }
    
    // Wait for the query to settle
    if (userPreferences === undefined && !preferencesError) {
      return;
    }
    
    if (userPreferences?.preferences) {
      const prefs = userPreferences.preferences;
      lastAppliedPreferencesRef.current = JSON.stringify(prefs);
      
      if (prefs.columns) {
        const savedColumnIds = new Set((prefs.columns as ColumnConfig[]).map(col => col.id));
        const newColumns = DEFAULT_COLUMNS.filter(col => !savedColumnIds.has(col.id));
        if (newColumns.length > 0) {
          const mergedColumns = DEFAULT_COLUMNS.map(col => ({ ...col }));
          (prefs.columns as ColumnConfig[]).forEach((savedCol) => {
            const index = mergedColumns.findIndex(col => col.id === savedCol.id);
            if (index !== -1) {
              mergedColumns[index] = { ...savedCol };
            }
          });
          setColumns(mergedColumns);
        } else {
          setColumns((prefs.columns as ColumnConfig[]).map(col => ({ ...col })));
        }
      }
      if (prefs.filterType) setFilterType(prefs.filterType);
      if (prefs.filterStatus) setFilterStatus(prefs.filterStatus);
      if (prefs.filterGroup) setFilterGroup(prefs.filterGroup);
    } else {
      lastAppliedPreferencesRef.current = 'none';
    }
    
    setPreferencesLoaded(true);
  }, [userPreferences, preferencesError]);

  // Fetch estimate details
  const { data: estimate, isLoading: estimateLoading, error: estimateError } = useQuery<Estimate>({
    queryKey: ["/api/estimates", effectiveEstimateId],
    enabled: !isNewEstimate,
  });

  // Fetch estimate items
  const { data: items = [], isLoading: itemsLoading } = useQuery<EstimateItem[]>({
    queryKey: ["/api/estimates", effectiveEstimateId, "items"],
    enabled: !!effectiveEstimateId && !isNewEstimate,
  });

  // Fetch estimate summary
  const { data: summary } = useQuery<EstimateSummary>({
    queryKey: ["/api/estimates", effectiveEstimateId, "summary"],
    enabled: !!effectiveEstimateId && !isNewEstimate,
  });

  // Fetch project details
  const projectId = isNewEstimate ? effectiveProjectId : estimate?.projectId;
  const { data: project } = useQuery<Project>({
    queryKey: ["/api/projects", projectId],
    enabled: !!projectId,
  });

  // Fetch estimate groups
  const { data: groups = [], isLoading: groupsLoading } = useQuery<EstimateGroup[]>({
    queryKey: ["/api/estimates", effectiveEstimateId, "groups"],
    enabled: !!effectiveEstimateId && !isNewEstimate,
  });

  // Fetch all revisions of this estimate (for version switcher)
  const { data: estimateVersions = [] } = useQuery<Estimate[]>({
    queryKey: ["/api/estimates", effectiveEstimateId, "versions"],
    enabled: !!effectiveEstimateId && !isNewEstimate,
  });

  // E-Notes stats for the compact progress bar in the tab bar
  const { data: enotesStats = [] } = useQuery<any[]>({
    queryKey: ["/api/estimates", effectiveEstimateId, "enotes"],
    queryFn: () => fetch(`/api/estimates/${effectiveEstimateId}/enotes`, { credentials: "include" }).then(r => r.json()),
    enabled: estimateTab === 'enotes' && !!effectiveEstimateId && !isNewEstimate,
  });

  const getRevLabel = (v: number) => "Rev " + String.fromCharCode(64 + v);

  // Fetch PO links for estimate items (which items have linked purchase orders)
  interface POLink {
    estimateItemId: string;
    poId: string;
    poNumber: string;
    poStatus: string;
  }
  const { data: poLinks = [] } = useQuery<POLink[]>({
    queryKey: ["/api/estimates", effectiveEstimateId, "po-links"],
    enabled: !!effectiveEstimateId && !isNewEstimate,
  });
  const poLinkMap = useMemo(() => {
    const map = new Map<string, POLink[]>();
    for (const link of poLinks) {
      const existing = map.get(link.estimateItemId) || [];
      existing.push(link);
      map.set(link.estimateItemId, existing);
    }
    return map;
  }, [poLinks]);

  // Fetch estimate item status field category options
  const { data: estimateItemStatusCategory } = useQuery<FieldCategoryWithOptions>({
    queryKey: ["/api/field-categories/by-key/estimate_item.status"],
  });

  // Fetch estimate item unit field category options
  const { data: estimateItemUnitCategory } = useQuery<FieldCategoryWithOptions>({
    queryKey: ["/api/field-categories/by-key/estimate_item.unit"],
  });

  // Fetch company settings for tax rate
  const { data: companySettings } = useQuery<CompanySettings>({
    queryKey: ["/api/company-settings"],
  });

  // Fetch cost codes
  const { data: costCodes = [], isLoading: isLoadingCostCodes } = useQuery<CostCode[]>({
    queryKey: ["/api/cost-codes"],
  });

  // Fetch cost categories
  const { data: costCategories = [] } = useQuery<CostCategory[]>({
    queryKey: ["/api/cost-categories"],
  });

  // Fetch estimate templates (for "Load from template" picker)
  const { data: estimateTemplates = [] } = useQuery<EstimateTemplate[]>({
    queryKey: ["/api/estimate-templates"],
  });

  // Apply estimate template mutation
  const applyTemplateMutation = useMutation({
    mutationFn: async (templateId: string) => {
      const template = estimateTemplates.find(t => t.id === templateId);
      if (!template) throw new Error("Template not found");
      const templateData = (template.templateData as any[]) || [];
      const lineItems = templateData
        .filter((item: any) => !item.isGroup)
        .map((item: any) => ({
          name: item.name,
          group: item.groupName || item.parentGroupName || "",
          description: item.description || "",
          unitType: item.unit || "ea",
          quantity: item.quantity ?? 1,
          unitCostExTax: (item.unitPrice ?? 0) / 100, // template stores in cents
          markupPercent: item.markup ?? 0,
          allowance: item.allowance || "None",
          wastagePercent: item.wastagePercent ?? 0,
          type: item.type || "Material",
          costCode: item.costCodeTitle || "",
        }));
      if (lineItems.length === 0) throw new Error("This template has no line items to import.");
      return await apiRequest(`/api/estimates/${effectiveEstimateId}/items/import`, "POST", { items: lineItems });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/estimates", effectiveEstimateId, "items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/estimates", effectiveEstimateId, "groups"] });
      queryClient.invalidateQueries({ queryKey: ["/api/estimates", effectiveEstimateId, "summary"] });
      setIsTemplatePickerOpen(false);
      setTemplateSearch("");
      toast({ title: "Template loaded", description: "Groups and items have been imported from the template." });
    },
    onError: (error: any) => {
      toast({ title: "Failed to load template", description: error.message, variant: "destructive" });
    },
  });

  // Get tax rate from company settings (default to 10% if not set)
  const taxRate = companySettings?.taxRate ? parseFloat(companySettings.taxRate.toString()) : 10;

  // Save view preferences mutation
  const saveViewPreferencesMutation = useMutation({
    mutationFn: async (preferences: { columns: ColumnConfig[]; filterType: string; filterStatus: string; filterGroup: string }) => {
      return await apiRequest("/api/user-view-preferences", "POST", {
        viewKey: "estimate_detail",
        preferences,
      });
    },
  });

  // Filter state (declared here so preferences can set them)
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Track active drag item
  const [activeId, setActiveId] = useState<string | null>(null);
  
  // Track drop target and position for indicator line
  const [dropTarget, setDropTarget] = useState<{ id: string; position: 'above' | 'below' } | null>(null);
  const dropTargetRef = React.useRef<{ id: string; position: 'above' | 'below' } | null>(null);
  const setDropTargetSync = (val: { id: string; position: 'above' | 'below' } | null) => {
    dropTargetRef.current = val;
    setDropTarget(val);
  };

  // Native DOM ghost refs — updated directly without React re-render for lag-free drag feedback
  const nativeGhostRef = React.useRef<HTMLElement | null>(null);
  const nativeGhostListenerRef = React.useRef<((e: PointerEvent) => void) | null>(null);
  
  // Catalog Sidebar state
  const [isCatalogOpen, setIsCatalogOpen] = useState(false);
  
  // Undo stack
  const undoStack = useUndoStack(20);
  
  // Register undo handler
  useEffect(() => {
    undoStack.setOnUndo(async (action) => {
      
      switch (action.type) {
        case 'Drag Item':
          // Restore previous item ordering
          if (action.data?.previousState) {
            try {
              await apiRequest("/api/estimate-items/reorder", "PATCH", { 
                items: action.data.previousState 
              });
              queryClient.invalidateQueries({ queryKey: ["/api/estimates", effectiveEstimateId, "items"] });
              queryClient.invalidateQueries({ queryKey: ["/api/estimates", effectiveEstimateId, "summary"] });
              toast({
                title: "Drag Undone",
                description: "Items restored to previous position",
              });
            } catch (error) {
              toast({
                title: "Undo Failed",
                description: "Could not restore previous state",
                variant: "destructive",
              });
            }
          }
          break;
        case 'Drag Group':
          // Restore previous group ordering
          if (action.data?.previousState) {
            try {
              await apiRequest("/api/estimate-groups/reorder", "PATCH", { 
                groups: action.data.previousState 
              });
              queryClient.invalidateQueries({ queryKey: ["/api/estimates", effectiveEstimateId, "groups"] });
              toast({
                title: "Drag Undone",
                description: "Groups restored to previous position",
              });
            } catch (error) {
              toast({
                title: "Undo Failed",
                description: "Could not restore previous state",
                variant: "destructive",
              });
            }
          }
          break;
        case 'Duplicate Item':
          // Delete the duplicated item (stored in action.data.newItemId)
          if (action.data?.newItemId) {
            try {
              await apiRequest(`/api/estimate-items/${action.data.newItemId}`, 'DELETE');
              queryClient.invalidateQueries({ queryKey: ["/api/estimates", effectiveEstimateId, "items"] });
              queryClient.invalidateQueries({ queryKey: ["/api/estimates", effectiveEstimateId, "summary"] });
              toast({
                title: "Duplicate Undone",
                description: "Removed duplicated item",
              });
            } catch (error) {
              toast({
                title: "Undo Failed",
                description: "Could not remove duplicated item",
                variant: "destructive",
              });
            }
          }
          break;
        default:
          toast({
            title: "Undo Not Supported",
            description: `Cannot undo: ${action.type}`,
            variant: "destructive",
          });
      }
    });
  }, [undoStack.setOnUndo, effectiveEstimateId]);

  // Drag and drop sensors with activation constraints
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 3, // Reduced to 3px for faster, more responsive drag activation
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );
  
  // Item action handlers
  const handleDuplicateItem = async (itemId: string) => {
    if (!effectiveEstimateId) return;
    
    try {
      const result = await apiRequest(`/api/estimate-items/${itemId}/duplicate`, 'POST', {});
      
      await queryClient.refetchQueries({ queryKey: ['/api/estimates', effectiveEstimateId, 'items'] });
      await queryClient.refetchQueries({ queryKey: ['/api/estimates', effectiveEstimateId, 'summary'] });
      
      // Track for undo
      undoStack.pushAction('Duplicate Item', { 
        originalItemId: itemId,
        newItemId: result?.id,
        timestamp: Date.now() 
      });
      
      toast({
        title: "Item duplicated",
        description: "Successfully duplicated the item",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to duplicate item",
        variant: "destructive",
      });
    }
  };
  
  // Keyboard shortcuts (G = group, U = ungroup, D = duplicate)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in input/textarea
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }
      
      // G = Group selected items
      if (e.key === 'g' || e.key === 'G') {
        e.preventDefault();
        if (selectedItems.size > 0 && !estimate?.isLocked) {
          setIsAddGroupOpen(true);
          toast({
            title: "Group Selected Items",
            description: `Creating group with ${selectedItems.size} items`,
          });
        }
      }
      
      // U = Ungroup selected items (remove from group)
      if (e.key === 'u' || e.key === 'U') {
        e.preventDefault();
        if (selectedItems.size > 0 && !estimate?.isLocked) {
          // Move selected items to "no group"
          setBulkActionGroup('none');
          setIsBulkGroupDialogOpen(true);
          toast({
            title: "Ungroup Items",
            description: `Moving ${selectedItems.size} items out of their groups`,
          });
        }
      }
      
      // D = Duplicate selected
      if (e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        if (selectedItems.size === 1 && !estimate?.isLocked) {
          const itemId = Array.from(selectedItems)[0];
          handleDuplicateItem(itemId);
        }
      }
      
      // Enter = Edit first selected item
      if (e.key === 'Enter' && selectedItems.size === 1 && !estimate?.isLocked) {
        e.preventDefault();
        const itemId = Array.from(selectedItems)[0];
        setEditingItemId(itemId);
        setIsEditDialogOpen(true);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedItems, estimate?.isLocked, handleDuplicateItem, setEditingItemId, setIsEditDialogOpen, setBulkActionGroup, setIsBulkGroupDialogOpen]);

  // Mutation for reordering items with optimistic updates
  const reorderItemsMutation = useMutation({
    mutationFn: async ({ items, previousState }: { items: { id: string; order: number; groupId?: string | null }[], previousState?: any[] }) => {
      console.log('[REORDER MUTATION] Received items to reorder:', items);
      
      // Filter out any items that might not be persisted yet (temporary IDs, optimistic updates, etc.)
      // Only send items that exist in our current items data
      const currentItems = queryClient.getQueryData(["/api/estimates", effectiveEstimateId, "items"]) as EstimateItem[] || [];
      console.log('[REORDER MUTATION] Current items in cache:', currentItems.length, 'items');
      console.log('[REORDER MUTATION] Current item IDs:', currentItems.map((i: any) => i.id));
      
      const validItems = items.filter((update: any) => {
        const existsInData = currentItems.some((item: any) => item.id === update.id);
        if (!existsInData) {
          console.warn('[REORDER MUTATION] Filtering out non-existent item:', update.id);
        }
        return existsInData;
      });
      
      console.log('[REORDER MUTATION] Valid items after filter:', validItems.length, 'items');
      console.log('[REORDER MUTATION] Sending to API:', validItems);
      
      if (validItems.length === 0) {
        console.warn('[REORDER MUTATION] No valid items to reorder, skipping');
        return { success: true, count: 0 };
      }
      
      return apiRequest("/api/estimate-items/reorder", "PATCH", { items: validItems });
    },
    onMutate: async ({ items }) => {
      // Cancel outgoing refetches to prevent snap-back
      await queryClient.cancelQueries({ queryKey: ["/api/estimates", effectiveEstimateId, "items"] });
      await queryClient.cancelQueries({ queryKey: ["/api/estimates", effectiveEstimateId, "summary"] });
      
      // Snapshot previous value for rollback
      const previousItems = queryClient.getQueryData(["/api/estimates", effectiveEstimateId, "items"]) as EstimateItem[];
      
      // Capture previous state for undo (only affected items)
      const affectedItemIds = new Set(items.map(u => u.id));
      const previousState = previousItems
        ?.filter(item => affectedItemIds.has(item.id))
        .map(item => ({ id: item.id, order: item.order, groupId: item.groupId }));
      
      // Optimistically update to cache IMMEDIATELY - this prevents snap-back
      queryClient.setQueryData(
        ["/api/estimates", effectiveEstimateId, "items"],
        (old: any[]) => {
          if (!old) return old;
          return old.map(item => {
            const update = items.find(u => u.id === item.id);
            if (update) {
              return { 
                ...item, 
                order: update.order,
                ...(update.groupId !== undefined ? { groupId: update.groupId } : {})
              };
            }
            return item;
          });
        }
      );
      
      return { previousItems, previousState };
    },
    onError: (error: any, variables, context) => {
      console.error('[REORDER MUTATION] Failed:', error);
      
      // Rollback to previous state
      if (context?.previousItems) {
        queryClient.setQueryData(
          ["/api/estimates", effectiveEstimateId, "items"],
          context.previousItems
        );
      }
      
      toast({
        title: "Failed to reorder items",
        description: error?.message || "Could not update item order. Please try again.",
        variant: "destructive",
      });
      
      // Refetch on error to restore server state
      queryClient.invalidateQueries({ queryKey: ["/api/estimates", effectiveEstimateId, "items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/estimates", effectiveEstimateId, "summary"] });
    },
    onSuccess: (data, variables, context) => {
      // Push action to undo stack silently
      if (context?.previousState) {
        undoStack.pushAction('Drag Item', { 
          previousState: context.previousState,
          timestamp: Date.now() 
        });
      }
      // NO TOAST - keeps drag operations fast and silent
      // NO REFETCH - optimistic update is already applied, server confirms it's correct
    },
  });

  // Mutation for reordering groups  
  const reorderGroupsMutation = useMutation({
    mutationFn: async ({ groups }: { groups: { id: string; order: number }[] }) => {
      return apiRequest("/api/estimate-groups/reorder", "PATCH", { groups });
    },
    onMutate: async ({ groups }) => {
      // Cancel outgoing refetches to prevent snap-back
      await queryClient.cancelQueries({ queryKey: ["/api/estimates", effectiveEstimateId, "groups"] });
      
      // Snapshot previous groups for rollback
      const previousGroups = queryClient.getQueryData(["/api/estimates", effectiveEstimateId, "groups"]) as any[];
      
      // Capture previous state for undo (only affected groups)
      const affectedGroupIds = new Set(groups.map(u => u.id));
      const previousState = previousGroups
        ?.filter(group => affectedGroupIds.has(group.id))
        .map(group => ({ id: group.id, order: group.order, parentGroupId: group.parentGroupId }));
      
      // Optimistically update cache IMMEDIATELY - this prevents snap-back
      queryClient.setQueryData(
        ["/api/estimates", effectiveEstimateId, "groups"],
        (old: any) => {
          if (!Array.isArray(old)) return old;
          
          // Create a map of order changes
          const orderMap = new Map(groups.map(u => [u.id, u.order]));
          
          // Update the groups with new orders
          return old.map(group => {
            if (orderMap.has(group.id)) {
              return {
                ...group,
                order: orderMap.get(group.id)
              };
            }
            return group;
          });
        }
      );
      
      return { previousGroups, previousState };
    },
    onSuccess: (data, variables, context) => {
      // Push action to undo stack silently
      if (context?.previousState) {
        undoStack.pushAction('Drag Group', { 
          previousState: context.previousState,
          timestamp: Date.now() 
        });
      }
      // NO TOAST - keeps drag operations fast and silent
      // NO REFETCH - optimistic update is already applied
    },
    onError: (error: any, variables, context) => {
      // Rollback to previous state
      if (context?.previousGroups) {
        queryClient.setQueryData(
          ["/api/estimates", effectiveEstimateId, "groups"],
          context.previousGroups
        );
      }
      
      toast({
        title: "Failed to reorder groups",
        description: error?.message || "Could not update group order. Please try again.",
        variant: "destructive",
      });
      
      // Refetch on error to restore server state
      queryClient.invalidateQueries({ queryKey: ["/api/estimates", effectiveEstimateId, "groups"] });
    },
  });

  // Mutation for updating individual group properties (including parentGroupId)
  const updateGroupMutation = useMutation({
    mutationFn: async ({ groupId, updates }: { groupId: string; updates: { parentGroupId?: string | null; order?: number } }) => {
      return apiRequest(`/api/estimate-groups/${groupId}`, "PATCH", updates);
    },
    onMutate: async ({ groupId, updates }) => {
      // Cancel outgoing refetches to prevent snap-back
      await queryClient.cancelQueries({ queryKey: ["/api/estimates", effectiveEstimateId, "groups"] });
      
      // Snapshot previous groups for rollback
      const previousGroups = queryClient.getQueryData(["/api/estimates", effectiveEstimateId, "groups"]) as any[];
      
      // Optimistically update cache IMMEDIATELY
      queryClient.setQueryData(
        ["/api/estimates", effectiveEstimateId, "groups"],
        (old: any) => {
          if (!Array.isArray(old)) return old;
          
          return old.map(group => {
            if (group.id === groupId) {
              return {
                ...group,
                ...updates
              };
            }
            return group;
          });
        }
      );
      
      return { previousGroups };
    },
    onSuccess: () => {
      // NO TOAST - keeps operations fast and silent
      // NO REFETCH - optimistic update is already applied
    },
    onError: (error: any, variables, context) => {
      // Rollback to previous state
      if (context?.previousGroups) {
        queryClient.setQueryData(
          ["/api/estimates", effectiveEstimateId, "groups"],
          context.previousGroups
        );
      }
      
      toast({
        title: "Failed to update group",
        description: error?.message || "Could not update group. Please try again.",
        variant: "destructive",
      });
      
      // Refetch on error to restore server state
      queryClient.invalidateQueries({ queryKey: ["/api/estimates", effectiveEstimateId, "groups"] });
    },
  });

  const applyGroupCostCodeMutation = useMutation({
    mutationFn: async (groupId: string) => {
      return apiRequest(`/api/estimate-groups/${groupId}/apply-cost-code`, "POST", {});
    },
    onSuccess: (data: any, groupId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/estimates", effectiveEstimateId, "items"] });
      toast({
        title: "Applied to all items",
        description: `Updated ${data?.updated ?? 0} item${(data?.updated ?? 0) !== 1 ? 's' : ''} with cost code/category.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to apply",
        description: error?.message || "Could not apply cost code/category to items.",
        variant: "destructive",
      });
    },
  });

  const updateFullGroupMutation = useMutation({
    mutationFn: async ({ groupId, data }: { groupId: string; data: any }) => {
      return apiRequest(`/api/estimate-groups/${groupId}`, "PATCH", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/estimates", effectiveEstimateId, "groups"] });
      setIsAddGroupOpen(false);
      setEditingGroupId(null);
      groupForm.reset();
      toast({ title: "Group updated successfully." });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update group",
        description: error?.message || "Could not update group.",
        variant: "destructive",
      });
    },
  });

  // Handle drag start
  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id));
    setDropTargetSync(null);

    // Create a native DOM ghost immediately — query the DOM directly for the rect
    // because event.active.rect.current?.initial is null at onDragStart time in dnd-kit v6
    const activeIdStr = String(event.active.id);
    const activatorEvent = event.activatorEvent as PointerEvent;

    // Query the source element directly by data attribute
    const sourceEl = activeIdStr.startsWith('group-')
      ? (document.querySelector(`[data-sortable-group-id="${activeIdStr.replace('group-', '')}"]`) as HTMLElement | null)
      : (document.querySelector(`[data-sortable-id="${activeIdStr}"]`) as HTMLElement | null);
    const sourceRect = sourceEl?.getBoundingClientRect();

    if (sourceRect) {
      let displayName = '';
      if (activeIdStr.startsWith('group-')) {
        const groupId = activeIdStr.replace('group-', '');
        displayName = groups.find(g => g.id === groupId)?.name || 'Group';
      } else {
        displayName = items.find(i => i.id === activeIdStr)?.name || 'Item';
      }

      const ghost = document.createElement('div');
      Object.assign(ghost.style, {
        position: 'fixed',
        zIndex: '9999',
        pointerEvents: 'none',
        width: `${sourceRect.width}px`,
        height: '32px',
        top: `${sourceRect.top}px`,
        left: `${sourceRect.left}px`,
        display: 'flex',
        alignItems: 'center',
        padding: '0 12px',
        background: 'rgba(187,167,219,0.25)',
        borderLeft: '2px solid #bba7db',
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        cursor: 'grabbing',
        overflow: 'hidden',
        fontSize: '12px',
        color: 'var(--foreground)',
        whiteSpace: 'nowrap',
        textOverflow: 'ellipsis',
      });
      ghost.textContent = displayName;
      document.body.appendChild(ghost);
      nativeGhostRef.current = ghost;

      const initialY = activatorEvent?.clientY ?? (sourceRect.top + sourceRect.height / 2);
      const handlePointerMove = (e: PointerEvent) => {
        if (!nativeGhostRef.current) return;
        const deltaY = e.clientY - initialY;
        nativeGhostRef.current.style.top = `${sourceRect.top + deltaY}px`;
      };
      window.addEventListener('pointermove', handlePointerMove, { passive: true });
      nativeGhostListenerRef.current = handlePointerMove;
    }
  };
  
  // Helper: remove the native DOM ghost and its pointermove listener
  const removeNativeGhost = () => {
    if (nativeGhostRef.current) {
      document.body.removeChild(nativeGhostRef.current);
      nativeGhostRef.current = null;
    }
    if (nativeGhostListenerRef.current) {
      window.removeEventListener('pointermove', nativeGhostListenerRef.current);
      nativeGhostListenerRef.current = null;
    }
  };

  // Handle drag cancel - clear all drag state
  const handleDragCancel = () => {
    setActiveId(null);
    setDropTargetSync(null);
    removeNativeGhost();
  };
  
  // Handle drag move - track position for Google Sheets-style indicator
  // Uses cursor position to find the exact gap where the item will be inserted
  const handleDragMove = (event: any) => {
    const { over, active, delta } = event;
    
    if (!over || !active) {
      setDropTargetSync(null);
      return;
    }
    
    const activeIdStr = String(active.id);

    // Get the current cursor Y position — query the DOM directly because
    // active.rect?.current?.initial can be stale or null during drag
    const activeEl = activeIdStr.startsWith('group-')
      ? (document.querySelector(`[data-sortable-group-id="${activeIdStr.replace('group-', '')}"]`) as HTMLElement | null)
      : (document.querySelector(`[data-sortable-id="${activeIdStr}"]`) as HTMLElement | null);
    const activeInitialRect = activeEl?.getBoundingClientRect();
    if (!activeInitialRect || !delta) {
      setDropTargetSync(null);
      return;
    }

    // Calculate cursor position (center of dragged element + drag delta)
    const cursorY = activeInitialRect.top + activeInitialRect.height / 2 + delta.y;

    // Handle group drag — show indicator between group cards
    if (activeIdStr.startsWith('group-')) {
      const groupEls = document.querySelectorAll('[data-sortable-group-id]');
      if (groupEls.length === 0) {
        setDropTargetSync(null);
        return;
      }
      const groupPositions: { id: string; top: number; bottom: number; midpoint: number }[] = [];
      groupEls.forEach((el) => {
        const gid = el.getAttribute('data-sortable-group-id');
        if (!gid || `group-${gid}` === activeIdStr) return;
        const rect = el.getBoundingClientRect();
        groupPositions.push({ id: `group-${gid}`, top: rect.top, bottom: rect.bottom, midpoint: rect.top + rect.height / 2 });
      });
      if (groupPositions.length === 0) { setDropTargetSync(null); return; }
      groupPositions.sort((a, b) => a.top - b.top);
      if (cursorY < groupPositions[0].midpoint) {
        setDropTargetSync({ id: groupPositions[0].id, position: 'above' });
        return;
      }
      const lastGrp = groupPositions[groupPositions.length - 1];
      if (cursorY > lastGrp.midpoint) {
        setDropTargetSync({ id: lastGrp.id, position: 'below' });
        return;
      }
      for (let i = 0; i < groupPositions.length; i++) {
        const cur = groupPositions[i];
        const nxt = groupPositions[i + 1];
        if (cursorY <= cur.midpoint) { setDropTargetSync({ id: cur.id, position: 'above' }); return; }
        if (!nxt || cursorY <= nxt.midpoint) { setDropTargetSync({ id: cur.id, position: 'below' }); return; }
      }
      setDropTargetSync(null);
      return;
    }
    
    // Find all sortable item rows in the DOM (excluding the active one)
    const allRows = document.querySelectorAll('[data-sortable-id]');
    if (allRows.length === 0) {
      setDropTargetSync(null);
      return;
    }
    
    // Build an array of row positions, excluding the active dragged item and group headers
    const rowPositions: { id: string; top: number; bottom: number; midpoint: number }[] = [];
    allRows.forEach((row) => {
      const id = row.getAttribute('data-sortable-id');
      if (!id || id === activeIdStr || id.startsWith('group-')) return;
      
      const rect = row.getBoundingClientRect();
      rowPositions.push({
        id,
        top: rect.top,
        bottom: rect.bottom,
        midpoint: rect.top + rect.height / 2,
      });
    });
    
    if (rowPositions.length === 0) {
      setDropTargetSync(null);
      return;
    }
    
    // Sort by visual position (top to bottom)
    rowPositions.sort((a, b) => a.top - b.top);
    
    // Find where the cursor is relative to all rows
    // If cursor is above all rows, show indicator above first row
    if (cursorY < rowPositions[0].midpoint) {
      setDropTargetSync({ id: rowPositions[0].id, position: 'above' });
      return;
    }
    
    // If cursor is below all rows, show indicator below last row
    const lastRow = rowPositions[rowPositions.length - 1];
    if (cursorY > lastRow.midpoint) {
      setDropTargetSync({ id: lastRow.id, position: 'below' });
      return;
    }
    
    // Find the gap between rows where the cursor is
    for (let i = 0; i < rowPositions.length; i++) {
      const current = rowPositions[i];
      const next = rowPositions[i + 1];
      
      if (cursorY <= current.midpoint) {
        // Cursor is in the top half of this row - show indicator above it
        setDropTargetSync({ id: current.id, position: 'above' });
        return;
      } else if (!next || cursorY <= next.midpoint) {
        // Cursor is in the bottom half of current row - show indicator below it
        setDropTargetSync({ id: current.id, position: 'below' });
        return;
      }
    }
    
    // Fallback
    setDropTargetSync(null);
  };

  // Handle drag end for reordering items, groups, and cross-group moves
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    // Read from ref — not state — so we always get the value written by the LAST
    // handleDragMove call, even if React hasn't flushed that setState yet.
    const capturedDropTarget = dropTargetRef.current;
    
    // Clear active drag state, drop target, and native DOM ghost
    setActiveId(null);
    setDropTargetSync(null);
    removeNativeGhost();
    
    const activeIdStr = String(active.id);
    const isDraggingGroup = activeIdStr.startsWith('group-');

    // Both item and group drags use cursor-based capturedDropTarget — dnd-kit's
    // closestCenter can return large-area targets (group cards) instead of the
    // precise row/group the cursor is actually over.
    const effectiveOverId: string | null = capturedDropTarget?.id ?? null;

    if (!effectiveOverId || effectiveOverId === activeIdStr) return;
    
    // Check if dragging a group (groups have IDs prefixed with "group-")
    const isOverGroup = effectiveOverId.startsWith('group-');
    
    if (isDraggingGroup) {
      // Extract group IDs
      const draggedGroupId = String(active.id).replace('group-', '');
      const draggedGroup = groups.find(g => g.id === draggedGroupId);
      
      if (!draggedGroup) {
        return;
      }
      
      
      if (isOverGroup) {
        // Dragging a group onto another group
        const overGroupId = effectiveOverId.replace('group-', '');
        const overGroup = groups.find(g => g.id === overGroupId);
        
        if (!overGroup) {
          return;
        }
        
        // Prevent nesting a group into itself or its own descendants
        if (draggedGroupId === overGroupId) {
          return;
        }
        
        // Check if overGroup is a descendant of draggedGroup (prevent circular nesting)
        // Use a visited set to guard against missing or circular parentGroupId references
        const visited = new Set<string>();
        let checkGroup: typeof overGroup | undefined = overGroup;
        while (checkGroup?.parentGroupId) {
          if (visited.has(checkGroup.id)) break; // circular reference — stop walking
          visited.add(checkGroup.id);
          if (checkGroup.parentGroupId === draggedGroupId) {
            return;
          }
          checkGroup = groups.find(g => g.id === checkGroup!.parentGroupId);
        }
        
        
        // Determine behavior: are they at the same level?
        const sameLevelGroups = groups.filter(g => g.parentGroupId === draggedGroup.parentGroupId);
        const isOverGroupSameLevel = sameLevelGroups.some(g => g.id === overGroupId);
        
        if (isOverGroupSameLevel) {
          // Reorder at same level
          const sortedSameLevelGroups = sameLevelGroups.sort((a, b) => (a.order || 0) - (b.order || 0));
          
          // Remove dragged group, find target in remaining list, then insert before/after
          const withoutDragged = sortedSameLevelGroups.filter(g => g.id !== draggedGroupId);
          const targetIdx = withoutDragged.findIndex(g => g.id === overGroupId);
          if (targetIdx === -1) return;
          const insertBefore = capturedDropTarget?.position === 'above';
          const insertAt = insertBefore ? targetIdx : targetIdx + 1;
          const reorderedGroups = [
            ...withoutDragged.slice(0, insertAt),
            draggedGroup,
            ...withoutDragged.slice(insertAt)
          ];
          const updates = reorderedGroups.map((group, index) => ({
            id: group.id,
            order: index
          }));
          
          reorderGroupsMutation.mutate({ groups: updates });
        } else {
          // Nest into the over group (make draggedGroup a subgroup of overGroup)
          
          // Get siblings left behind in the original level (need to reorder them)
          const oldSiblings = sameLevelGroups.filter(g => g.id !== draggedGroupId);
          const siblingUpdates = oldSiblings.map((group, index) => ({
            id: group.id,
            order: index
          }));
          
          // Get siblings in the new parent
          const newSiblings = groups.filter(g => g.parentGroupId === overGroupId);
          const newOrder = newSiblings.length; // Add at end
          
          // Reorder old siblings first if any
          if (siblingUpdates.length > 0) {
            reorderGroupsMutation.mutate({ groups: siblingUpdates });
          }
          
          // Then update the dragged group's parent and order
          updateGroupMutation.mutate({
            groupId: draggedGroupId,
            updates: { parentGroupId: overGroupId, order: newOrder }
          });
        }
      } else {
        // Dragging group onto an item - ignore this case
      }
      return;
    }
    
    // Find the dragged item and target item
    const draggedItem = items.find(item => item.id === active.id);
    const targetItem = items.find(item => item.id === effectiveOverId);
    
    if (!draggedItem) {
      return;
    }
    
    // Handle dropping onto a group header (cross-group move to end of group)
    if (isOverGroup) {
      const targetGroupId = effectiveOverId.replace('group-', '');
      
      if (targetGroupId === draggedItem.groupId) {
        return;
      }
      
      // Get source and target container items
      const sourceGroupId = draggedItem.groupId || null;
      const sourceContainerItems = items
        .filter(item => !item.parentItemId && (item.groupId || null) === sourceGroupId)
        .sort((a, b) => (a.order || 0) - (b.order || 0));
      
      const targetContainerItems = items
        .filter(i => i.groupId === targetGroupId && !i.parentItemId)
        .sort((a, b) => (a.order || 0) - (b.order || 0));
      
      // Remove from source, add to end of target
      const remainingSourceItems = sourceContainerItems.filter(item => item.id !== draggedItem.id);
      const updatedTargetItems = [...targetContainerItems, draggedItem];
      
      // Build updates for both containers
      const updates: any[] = [];
      
      // Reindex source container
      remainingSourceItems.forEach((item, index) => {
        updates.push({ id: item.id, order: index });
      });
      
      // Reindex target container (including moved item at end)
      updatedTargetItems.forEach((item, index) => {
        if (item.id === draggedItem.id) {
          updates.push({ id: item.id, order: index, groupId: targetGroupId });
          
          // Also update all sub-items to move with parent
          const subItems = items.filter(i => i.parentItemId === draggedItem.id);
          subItems.forEach(subItem => {
            updates.push({ id: subItem.id, groupId: targetGroupId });
          });
        } else {
          updates.push({ id: item.id, order: index });
        }
      });
      
      
      reorderItemsMutation.mutate({ items: updates });
      return;
    }
    
    if (!targetItem) {
      return;
    }
    
    // Determine the container (groupId or null for ungrouped)
    const draggedGroupId = draggedItem.groupId || null;
    const targetGroupId = targetItem.groupId || null;
    
    
    // Get all parent items in the source container, sorted by order
    const sourceContainerItems = items
      .filter(item => !item.parentItemId && (item.groupId || null) === draggedGroupId)
      .sort((a, b) => (a.order || 0) - (b.order || 0));
    
    // Find indices within the source container
    const oldIndex = sourceContainerItems.findIndex(item => item.id === active.id);
    
    if (oldIndex === -1) {
      return;
    }
    
    // If moving to a different group, reindex both containers
    if (targetGroupId !== draggedGroupId) {
      
      // Get target container items to find insertion point
      const targetContainerItems = items
        .filter(item => !item.parentItemId && (item.groupId || null) === targetGroupId)
        .sort((a, b) => (a.order || 0) - (b.order || 0));
      
      const targetIndex = targetContainerItems.findIndex(item => item.id === effectiveOverId);
      const insertionIndex = targetIndex >= 0 ? targetIndex : targetContainerItems.length;
      
      // Remove from source, add to target at insertion point
      const remainingSourceItems = sourceContainerItems.filter(item => item.id !== draggedItem.id);
      const updatedTargetItems = [...targetContainerItems];
      updatedTargetItems.splice(insertionIndex, 0, draggedItem);
      
      // Build updates for both containers
      const updates: any[] = [];
      
      // Reindex source container
      remainingSourceItems.forEach((item, index) => {
        updates.push({ id: item.id, order: index });
      });
      
      // Reindex target container (including moved item)
      updatedTargetItems.forEach((item, index) => {
        if (item.id === draggedItem.id) {
          updates.push({ id: item.id, order: index, groupId: targetGroupId });
          
          // Also update all sub-items to move with parent
          const subItems = items.filter(i => i.parentItemId === draggedItem.id);
          subItems.forEach(subItem => {
            updates.push({ id: subItem.id, groupId: targetGroupId });
          });
        } else {
          updates.push({ id: item.id, order: index });
        }
      });
      
      
      reorderItemsMutation.mutate({ items: updates });
      return;
    }
    
    // Same container - reorder within it using position-aware insertion
    const targetIdx = sourceContainerItems.findIndex(item => item.id === effectiveOverId);
    
    if (targetIdx === -1) {
      return;
    }
    
    const sameContainerDraggedItem = sourceContainerItems[oldIndex];
    const withoutDragged = sourceContainerItems.filter(item => item.id !== sameContainerDraggedItem.id);
    const targetIdxInRemaining = withoutDragged.findIndex(item => item.id === effectiveOverId);
    const insertBefore = capturedDropTarget?.position === 'above';
    const insertAt = insertBefore ? targetIdxInRemaining : targetIdxInRemaining + 1;
    const reorderedItems = [
      ...withoutDragged.slice(0, insertAt),
      sameContainerDraggedItem,
      ...withoutDragged.slice(insertAt)
    ];
    
    // Build updates with new order values (0, 1, 2, ...)
    const updates = reorderedItems.map((item, index) => ({
      id: item.id,
      order: index
    }));
    
    
    reorderItemsMutation.mutate({ items: updates });
  };

  const [filterGroup, setFilterGroup] = useState<string>('all');

  // Resizing state
  const [resizingColumn, setResizingColumn] = useState<string | null>(null);
  const [resizeStartX, setResizeStartX] = useState(0);
  const [resizeStartWidth, setResizeStartWidth] = useState(0);

  // Auto-save preferences when columns or filters change (after user modifies them)
  useEffect(() => {
    // Skip save if user hasn't made any modifications (prevents save on initial load)
    if (!hasUserModifiedRef.current) {
      return;
    }
    
    if (preferencesLoaded && effectiveEstimateId && !isNewEstimate && !resizingColumn) {
      const timer = setTimeout(() => {
        saveViewPreferencesMutation.mutate({
          columns,
          filterType,
          filterStatus,
          filterGroup,
        });
      }, 1000); // Debounce for 1 second
      return () => clearTimeout(timer);
    }
  }, [columns, filterType, filterStatus, filterGroup, effectiveEstimateId, preferencesLoaded, isNewEstimate, resizingColumn]);

  // Early validation - show error if invalid ID for non-new estimates
  if (!effectiveEstimateId && !isNewEstimate) {
    return <div>Invalid estimate ID</div>;
  }

  // Fetch all projects for project selection
  const { data: projects = [], isLoading: projectsLoading } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
    enabled: isNewEstimate && !effectiveProjectId,
  });

  // Fetch estimate statuses from field settings
  const { data: estimateStatusCategory } = useQuery<FieldCategoryWithOptions>({
    queryKey: ["/api/field-categories/by-key/estimate.status"],
  });
  const estimateStatuses = estimateStatusCategory?.options?.filter(o => o.isActive) ?? [];

  // Mutation for creating new estimate
  const createEstimateMutation = useMutation({
    mutationFn: async (data: { name: string; projectId: string }) => {
      return await apiRequest(`/api/estimates`, "POST", data);
    },
    onSuccess: async (newEstimate) => {
      queryClient.invalidateQueries({ queryKey: ["/api/estimates"] });
      toast({
        title: "Success",
        description: "New estimate created successfully.",
      });

      if (user?.id) {
        logActivity({
          projectId: newEstimate.projectId,
          userId: user.id,
          activityType: "estimate",
          action: "created",
          description: `User created estimate '${newEstimate.name}'`,
          entityId: newEstimate.id,
          entityName: newEstimate.name,
          metadata: {}
        });
      }

      // Redirect to the newly created estimate
      setLocation(`/estimates/${newEstimate.id}`);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create estimate.",
        variant: "destructive",
      });
    },
  });

  // Handler for creating new estimate
  const handleCreateEstimate = () => {
    if (!newEstimateName.trim() || !effectiveProjectId) return;
    
    createEstimateMutation.mutate({
      name: newEstimateName.trim(),
      projectId: effectiveProjectId
    });
  };

  // For new estimates without project ID, show project selection
  if (isNewEstimate && !effectiveProjectId) {
    return (
      <div className="flex h-full flex-col">
        <div className="border-b border-border p-4">
          <div className="flex items-center space-x-4">
            <Button variant="ghost" size="icon" onClick={() => setLocation("/estimates")} aria-label="Back to Estimates">
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <h1 className="text-2xl font-semibold">New Estimate</h1>
          </div>
        </div>
        
        <div className="flex-1 p-6">
          <div className="max-w-md mx-auto">
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-medium mb-2">Select Project</h2>
                <p className="text-sm text-muted-foreground mb-4">
                  Choose which project to create the estimate for.
                </p>
              </div>
              
              <div className="space-y-3">
                {projectsLoading ? (
                  <div className="text-center py-4">
                    <div className="text-muted-foreground">Loading projects...</div>
                  </div>
                ) : projects.length === 0 ? (
                  <div className="text-center py-4">
                    <div className="text-muted-foreground">No projects available</div>
                  </div>
                ) : (
                  projects.map((project) => (
                    <Card 
                      key={project.id}
                      className="hover-elevate cursor-pointer p-4"
                      onClick={() => setLocation(`/estimates/new?projectId=${project.id}`)}
                      data-testid={`button-select-project-${project.id}`}
                    >
                      <div className="font-medium">{project.name}</div>
                      <div className="text-sm text-muted-foreground">{project.description || 'No description'}</div>
                    </Card>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Mutation for updating estimate assignees
  const updateAssigneesMutation = useMutation({
    mutationFn: async (assigneeIds: string[]) => {
      return await apiRequest(`/api/estimates/${effectiveEstimateId}`, "PATCH", { assigneeIds });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/estimates", effectiveEstimateId] });
      queryClient.invalidateQueries({ queryKey: ["/api/estimates"] });
      toast({
        title: "Success",
        description: "Assignees updated successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update assignees.",
        variant: "destructive",
      });
    },
  });

  // Mutation for updating estimate name
  const updateEstimateMutation = useMutation({
    mutationFn: async (data: { name: string }) => {
      return await apiRequest(`/api/estimates/${effectiveEstimateId}`, "PATCH", data);
    },
    onSuccess: async (updatedEstimate) => {
      queryClient.invalidateQueries({ queryKey: ["/api/estimates", effectiveEstimateId] });
      queryClient.invalidateQueries({ queryKey: ["/api/estimates"] });
      toast({
        title: "Success",
        description: "Estimate name updated successfully.",
      });

      if (updatedEstimate.projectId && user?.id) {
        logActivity({
          projectId: updatedEstimate.projectId,
          userId: user.id,
          activityType: "estimate",
          action: "updated",
          description: `User updated estimate '${updatedEstimate.name}'`,
          entityId: updatedEstimate.id,
          entityName: updatedEstimate.name,
          metadata: {}
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update estimate name.",
        variant: "destructive",
      });
      // Reset to original name on error
      setEditingName(estimate?.name || "");
    },
  });

  // Mutation for updating markup percentage
  const updateMarkupMutation = useMutation({
    mutationFn: async (data: { projectMarkupPercent: number }) => {
      return await apiRequest(`/api/estimates/${effectiveEstimateId}`, "PATCH", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/estimates", effectiveEstimateId] });
      queryClient.invalidateQueries({ queryKey: ["/api/estimates", effectiveEstimateId, "summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/estimates"] });
      toast({
        title: "Success",
        description: "Markup percentage updated successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update markup percentage.",
        variant: "destructive",
      });
      // Reset to original markup on error
      setEditingMarkup(estimate?.projectMarkupPercent?.toString() || "0");
    },
  });

  const bulkMarkupMutation = useMutation({
    mutationFn: async ({ itemIds, markupPercent }: { itemIds: string[]; markupPercent: number }) => {
      return await apiRequest(`/api/estimates/${effectiveEstimateId}/items/bulk-markup`, "PATCH", { itemIds, markupPercent });
    },
    onSuccess: (_, { itemIds }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/estimates", effectiveEstimateId, "items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/estimates", effectiveEstimateId, "summary"] });
      setIsBulkMarkupDialogOpen(false);
      setSelectedItems(new Set());
      toast({
        title: "Markup updated",
        description: `Updated markup for ${itemIds.length} item${itemIds.length !== 1 ? 's' : ''}.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update markup.",
        variant: "destructive",
      });
    },
  });

  // Mutation for adding estimate items with optimistic updates
  const addItemMutation = useMutation({
    mutationFn: async (data: InsertEstimateItem) => {
      return await apiRequest(`/api/estimates/${effectiveEstimateId}/items`, "POST", data);
    },
    onMutate: async (newItem) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ["/api/estimates", effectiveEstimateId, "items"] });
      
      // Snapshot the previous value
      const previousItems = queryClient.getQueryData(["/api/estimates", effectiveEstimateId, "items"]);
      
      // Convert dollar values to cents for optimistic update (backend stores in cents)
      const optimisticItem = {
        ...newItem,
        id: `temp-${Date.now()}`,
        createdAt: new Date(),
        updatedAt: new Date(),
        // Convert to cents for proper display
        unitCostExTax: typeof newItem.unitCostExTax === 'number' ? Math.round(newItem.unitCostExTax * 100) : 0,
        quantity: typeof newItem.quantity === 'number' ? Math.round(newItem.quantity * 100) : 100,
      };
      
      queryClient.setQueryData(["/api/estimates", effectiveEstimateId, "items"], (old: any) => {
        return old ? [...old, optimisticItem] : [optimisticItem];
      });
      
      return { previousItems };
    },
    onSuccess: () => {
      // Close dialog only on success
      setIsAddItemOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/estimates", effectiveEstimateId, "items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/estimates", effectiveEstimateId, "summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/estimates"] });
      toast({
        title: "Success",
        description: "Estimate item added successfully.",
      });
    },
    onError: (error: any, variables, context) => {
      // Rollback on error
      if (context?.previousItems) {
        queryClient.setQueryData(["/api/estimates", effectiveEstimateId, "items"], context.previousItems);
      }
      // Dialog stays open with form data intact
      toast({
        title: "Error",
        description: error.message || "Failed to add estimate item.",
        variant: "destructive",
      });
    },
  });

  // Mutation for adding estimate groups
  const addGroupMutation = useMutation({
    mutationFn: async (data: InsertEstimateGroup) => {
      return await apiRequest(`/api/estimates/${effectiveEstimateId}/groups`, "POST", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/estimates", effectiveEstimateId, "groups"] });
      queryClient.invalidateQueries({ queryKey: ["/api/estimates", effectiveEstimateId, "items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/estimates"] });
      setIsAddGroupOpen(false);
      groupForm.reset();
      toast({
        title: "Success",
        description: "Estimate group added successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add estimate group.",
        variant: "destructive",
      });
    },
  });

  // Mutation for toggling estimate lock status
  const toggleLockMutation = useMutation({
    mutationFn: async () => {
      const endpoint = estimate?.isLocked ? "unlock" : "lock";
      const data = await apiRequest(`/api/estimates/${effectiveEstimateId}/${endpoint}`, "POST");
      return data;
    },
    onSuccess: (updatedEstimate: Estimate) => {
      queryClient.invalidateQueries({ queryKey: ["/api/estimates", effectiveEstimateId] });
      queryClient.invalidateQueries({ queryKey: ["/api/estimates"] });
      toast({
        title: "Success",
        description: updatedEstimate.isLocked ? "Estimate locked successfully." : "Estimate unlocked successfully.",
      });
    },
    onError: (error: any) => {
      console.error("Lock mutation error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to toggle estimate lock status.",
        variant: "destructive",
      });
    },
  });

  const createVersionMutation = useMutation({
    mutationFn: async (sourceId?: string) => {
      const id = sourceId ?? effectiveEstimateId;
      const res = await apiRequest(`/api/estimates/${id}/version`, "POST");
      return res as unknown as Estimate;
    },
    onSuccess: (newVersion: Estimate) => {
      queryClient.invalidateQueries({ queryKey: ["/api/estimates"] });
      toast({ title: "New revision created", description: `${getRevLabel(newVersion.version)} is ready.` });
      setLocation(`/projects/${newVersion.projectId}/estimates/${newVersion.id}`);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create new revision.", variant: "destructive" });
    },
  });

  const renameRevisionMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      return await apiRequest(`/api/estimates/${id}`, "PATCH", { name });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/estimates", effectiveEstimateId, "versions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/estimates", effectiveEstimateId] });
      toast({ title: "Revision renamed" });
    },
    onError: () => toast({ title: "Error", description: "Failed to rename.", variant: "destructive" }),
  });

  const setAsWorkingMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/estimates/${id}`, "PATCH", { isLocked: false });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/estimates"] });
      toast({ title: "Set as working", description: "This revision is now unlocked for editing." });
    },
    onError: () => toast({ title: "Error", description: "Failed to set as working.", variant: "destructive" }),
  });

  const setAsContractMutation = useMutation({
    mutationFn: async (estimateId: string) => {
      const summary = await apiRequest(`/api/estimates/${estimateId}/summary`);
      const totalCents = Math.round((summary?.total ?? 0) * 100);
      return await apiRequest(`/api/projects/${projectId}`, "PATCH", {
        selectedEstimateId: estimateId,
        contractPrice: totalCents > 0 ? totalCents : null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId] });
      toast({ title: "Contract estimate set", description: "This revision is now the contract estimate." });
    },
    onError: () => toast({ title: "Error", description: "Failed to set as contract.", variant: "destructive" }),
  });

  const deleteRevisionMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/estimates/${id}`, "DELETE");
    },
    onSuccess: (_data, deletedId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/estimates"] });
      toast({ title: "Revision deleted" });
      if (deletedId === effectiveEstimateId && estimateVersions.length > 1) {
        const other = estimateVersions.find(v => v.id !== deletedId);
        if (other) setLocation(`/projects/${other.projectId}/estimates/${other.id}`);
      }
    },
    onError: () => toast({ title: "Error", description: "Failed to delete revision.", variant: "destructive" }),
  });

  const [renamingRevisionId, setRenamingRevisionId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // Mutation for toggling group collapse state with optimistic updates
  const toggleGroupCollapseMutation = useMutation({
    mutationFn: async ({ groupId, isCollapsed }: { groupId: string; isCollapsed: boolean }) => {
      return await apiRequest(`/api/estimate-groups/${groupId}`, "PATCH", { isCollapsed });
    },
    onMutate: async ({ groupId, isCollapsed }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ["/api/estimates", effectiveEstimateId, "groups"] });
      
      // Snapshot the previous value
      const previousGroups = queryClient.getQueryData(["/api/estimates", effectiveEstimateId, "groups"]);
      
      // Optimistically update the cache
      queryClient.setQueryData(["/api/estimates", effectiveEstimateId, "groups"], (old: any) => {
        if (!old) return old;
        return old.map((g: any) => g.id === groupId ? { ...g, isCollapsed } : g);
      });
      
      return { previousGroups };
    },
    onError: (error: any, variables, context) => {
      // Rollback on error
      if (context?.previousGroups) {
        queryClient.setQueryData(["/api/estimates", effectiveEstimateId, "groups"], context.previousGroups);
      }
      toast({
        title: "Error",
        description: error.message || "Failed to toggle group collapse state.",
        variant: "destructive",
      });
    },
    // No onSettled - rely on optimistic update to avoid re-renders that disrupt drag-and-drop
  });

  // Mutation for updating estimate items
  const updateItemMutation = useMutation({
    mutationFn: async ({ itemId, data }: { itemId: string; data: Partial<InsertEstimateItem> }) => {
      return await apiRequest(`/api/estimate-items/${itemId}`, "PATCH", data);
    },
    onMutate: async ({ itemId, data }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ["/api/estimates", effectiveEstimateId, "items"] });
      
      // Snapshot the previous value
      const previousItems = queryClient.getQueryData<EstimateItem[]>(["/api/estimates", effectiveEstimateId, "items"]);
      
      // Keep dollar values as-is for optimistic update (cache stores dollars, same as API returns)
      const optimisticData = { ...data };
      
      // Optimistically update to the new value
      queryClient.setQueryData<EstimateItem[]>(
        ["/api/estimates", effectiveEstimateId, "items"],
        (old) => old?.map(item => item.id === itemId ? { ...item, ...optimisticData } : item)
      );
      
      // Return context with the previous value
      return { previousItems };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/estimates", effectiveEstimateId, "items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/estimates", effectiveEstimateId, "summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/estimates"] });
    },
    onError: (error: any, _variables, context) => {
      // Rollback to previous value on error
      if (context?.previousItems) {
        queryClient.setQueryData(["/api/estimates", effectiveEstimateId, "items"], context.previousItems);
      }
      toast({
        title: "Error",
        description: error.message || "Failed to update item.",
        variant: "destructive",
      });
    },
  });

  // Handlers for inline name editing
  const handleNameEdit = () => {
    if (estimate?.isLocked) {
      toast({
        title: "Cannot Edit",
        description: "This estimate is locked and cannot be modified.",
        variant: "destructive",
      });
      return;
    }
    setEditingName(estimate?.name || "");
    setIsEditingName(true);
  };

  const handleNameSave = () => {
    if (!isEditingName || !estimate) return;
    
    const trimmedName = editingName.trim();
    if (trimmedName === estimate.name) {
      // No changes, just exit edit mode
      setIsEditingName(false);
      return;
    }
    
    if (trimmedName === "") {
      toast({
        title: "Invalid Name",
        description: "Estimate name cannot be empty.",
        variant: "destructive",
      });
      setEditingName(estimate.name);
      return;
    }
    
    // Optimistic update
    setIsEditingName(false);
    updateEstimateMutation.mutate({ name: trimmedName });
  };

  const handleNameCancel = () => {
    setEditingName(estimate?.name || "");
    setIsEditingName(false);
  };

  // Handler to open the edit estimate dialog
  const handleOpenEditEstimateDialog = () => {
    if (!estimate) return;
    setEditEstimateForm({
      name: estimate.name,
      status: estimate.status || "draft"
    });
    setIsEditEstimateDialogOpen(true);
  };

  // Handler to save estimate changes from dialog
  const handleSaveEstimateEdit = () => {
    if (!estimate) return;
    const updates: { name?: string; status?: string } = {};
    
    if (editEstimateForm.name.trim() && editEstimateForm.name !== estimate.name) {
      updates.name = editEstimateForm.name.trim();
    }
    if (editEstimateForm.status && editEstimateForm.status !== estimate.status) {
      updates.status = editEstimateForm.status;
    }
    
    if (Object.keys(updates).length > 0) {
      updateEstimateMutation.mutate(updates);
    }
    setIsEditEstimateDialogOpen(false);
  };

  const handleNameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleNameSave();
    } else if (e.key === "Escape") {
      e.preventDefault();
      handleNameCancel();
    }
  };

  // Handlers for inline markup editing
  const handleMarkupEdit = () => {
    if (estimate?.isLocked) {
      toast({
        title: "Cannot Edit",
        description: "This estimate is locked and cannot be modified.",
        variant: "destructive",
      });
      return;
    }
    setEditingMarkup(estimate?.projectMarkupPercent?.toString() || "0");
    setIsEditingMarkup(true);
  };

  const handleMarkupSave = () => {
    if (!isEditingMarkup || !estimate) return;
    
    const trimmedMarkup = editingMarkup.trim();
    const markupNumber = parseFloat(trimmedMarkup);
    
    // Validation
    if (trimmedMarkup === "" || isNaN(markupNumber)) {
      toast({
        title: "Invalid Percentage",
        description: "Please enter a valid number for markup percentage.",
        variant: "destructive",
      });
      setEditingMarkup(estimate.projectMarkupPercent?.toString() || "0");
      return;
    }
    
    if (markupNumber < 0 || markupNumber > 100) {
      toast({
        title: "Invalid Range",
        description: "Markup percentage must be between 0 and 100.",
        variant: "destructive",
      });
      setEditingMarkup(estimate.projectMarkupPercent?.toString() || "0");
      return;
    }
    
    if (markupNumber === estimate.projectMarkupPercent) {
      // No changes, just exit edit mode
      setIsEditingMarkup(false);
      return;
    }
    
    // Optimistic update
    setIsEditingMarkup(false);
    updateMarkupMutation.mutate({ projectMarkupPercent: markupNumber });
  };

  const handleMarkupCancel = () => {
    setEditingMarkup(estimate?.projectMarkupPercent?.toString() || "0");
    setIsEditingMarkup(false);
  };

  const handleMarkupKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleMarkupSave();
    } else if (e.key === "Escape") {
      e.preventDefault();
      handleMarkupCancel();
    }
  };

  // Handlers for inline cell editing
  const handleCellEdit = (item: EstimateItem, field: string) => {
    
    if (estimate?.isLocked) {
      toast({
        title: "Cannot Edit",
        description: "This estimate is locked and cannot be modified.",
        variant: "destructive",
      });
      return;
    }
    
    setEditingCell({ itemId: item.id, field });
    
    // Set initial value based on field type
    switch (field) {
      case 'quantity':
        setEditingValue(item.quantity.toFixed(2));
        break;
      case 'unitCostExTax':
        setEditingValue(parseFloat(item.unitCostExTax.toFixed(3)).toString());
        break;
      case 'unitCostIncTax':
        const unitCostIncTax = calculatePricingValues(item).unitCostIncTax;
        setEditingValue(parseFloat(unitCostIncTax.toFixed(3)).toString());
        break;
      case 'markup':
      case 'markupPercent':
        // Show markup percentage (10 = 10%)
        setEditingValue(item.markupPercent ?? estimate?.projectMarkupPercent ?? 0);
        break;
      case 'name':
        setEditingValue(item.name);
        break;
      case 'description':
        setEditingValue(item.description || '');
        break;
      case 'costCode':
        setEditingValue(item.costCode || '');
        break;
      case 'costCategoryId':
        setEditingValue((item as any).costCategoryId || '');
        break;
      case 'shownAs':
        setEditingValue(item.shownAs || '');
        break;
      case 'unitType':
        setEditingValue(item.unitType || '');
        break;
      case 'allowance':
        setEditingValue(item.allowance || 'None');
        break;
      default:
        setEditingValue('');
    }
  };

  const handleCellSave = (item: EstimateItem, field: string) => {
    if (!editingCell) return;
    
    // Validate based on field type
    if (field === 'quantity' || field === 'unitCostExTax' || field === 'unitCostIncTax' || field === 'markupPercent' || field === 'markup') {
      const numValue = parseFloat(editingValue);
      if (isNaN(numValue) || numValue < 0) {
        toast({
          title: "Invalid Value",
          description: "Please enter a valid positive number.",
          variant: "destructive",
        });
        // Reset to original value
        if (field === 'unitCostExTax') {
          setEditingValue(parseFloat(item.unitCostExTax.toFixed(3)).toString());
        } else if (field === 'unitCostIncTax') {
          const unitCostIncTax = calculatePricingValues(item).unitCostIncTax;
          setEditingValue(parseFloat(unitCostIncTax.toFixed(3)).toString());
        } else if (field === 'markupPercent' || field === 'markup') {
          setEditingValue(item.markupPercent ?? estimate?.projectMarkupPercent ?? 0);
        } else {
          setEditingValue((item as any)[field]);
        }
        return;
      }
    }
    
    if (field === 'name' && !editingValue.trim()) {
      toast({
        title: "Invalid Name",
        description: "Item name cannot be empty.",
        variant: "destructive",
      });
      setEditingValue(item.name);
      return;
    }
    
    // Prepare update data
    let valueToSave: any;
    let fieldToUpdate = field;
    
    if (field === 'unitCostExTax') {
      // Send actual dollar value to backend (backend will multiply by 100)
      valueToSave = parseFloat(editingValue);
      
      // Skip save if value hasn't meaningfully changed (within 0.0001 tolerance)
      if (Number.isFinite(item.unitCostExTax) && Number.isFinite(valueToSave) && 
          Math.abs(valueToSave - item.unitCostExTax) < 0.0001) {
        setEditingCell(null);
        return;
      }
    } else if (field === 'unitCostIncTax') {
      // User entered inc-tax value, back-calculate to ex-tax
      const incTaxValue = parseFloat(editingValue);
      const taxRate = estimate?.taxRate ?? 10;
      
      // Back-calculate: unitCostExTax = unitCostIncTax / (1 + taxRate/100), rounded to 3dp
      const calculatedExTax = Math.round(incTaxValue / (1 + taxRate / 100) * 1000) / 1000;
      
      // Check if the calculated ex-tax value is different from current
      const currentIncTax = calculatePricingValues(item).unitCostIncTax;
      if (Math.abs(incTaxValue - currentIncTax) < 0.0005) {
        setEditingCell(null);
        return;
      }
      
      // Save the back-calculated ex-tax value (already rounded to 3dp)
      valueToSave = calculatedExTax;
      fieldToUpdate = 'unitCostExTax'; // Update the ex-tax field instead
    } else if (field === 'markupPercent' || field === 'markup') {
      // Save markup as number (supports decimals like 12.5%)
      const markup = parseFloat(editingValue);
      valueToSave = Number.isNaN(markup) ? null : markup;
      fieldToUpdate = 'markupPercent'; // always update the markupPercent field
      
      // Check if value actually changed
      if (valueToSave === (item.markupPercent ?? null)) {
        setEditingCell(null);
        return;
      }
    } else if (field === 'quantity') {
      // Send actual value to backend (backend will multiply by 100)
      valueToSave = parseFloat(editingValue);
      
      // Check if value actually changed (compare actual to stored cents)
      if (Math.abs(valueToSave - item.quantity) < 0.0001) {
        setEditingCell(null);
        return;
      }
    } else {
      valueToSave = editingValue;
      if (valueToSave === (item as any)[field]) {
        setEditingCell(null);
        return;
      }
    }
    
    const updateData: Partial<InsertEstimateItem> = {
      [fieldToUpdate]: valueToSave
    };
    
    // Clear editing state first (optimistic update)
    setEditingCell(null);
    
    // Update the item
    updateItemMutation.mutate({ itemId: item.id, data: updateData });
  };

  const handleCellCancel = () => {
    setEditingCell(null);
    setEditingValue('');
  };

  // Define editable fields in order for Tab navigation
  const editableFields = ['name', 'quantity', 'unitType', 'unitCostExTax', 'markup', 'costCode', 'costCategoryId', 'description'];
  
  const handleCellKeyDown = (e: React.KeyboardEvent, item: EstimateItem, field: string) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleCellSave(item, field);
    } else if (e.key === "Escape") {
      e.preventDefault();
      handleCellCancel();
    } else if (e.key === "Tab") {
      e.preventDefault();
      handleCellSave(item, field);
      
      // Find next editable cell
      const currentFieldIndex = editableFields.indexOf(field);
      const isShift = e.shiftKey;
      
      // Get all visible items in order
      const { sortedGroups, groupedItems, ungroupedItems } = organizeItemsByGroups();
      const allItems: EstimateItem[] = [];
      
      // Add ungrouped items first
      ungroupedItems.forEach(i => {
        allItems.push(i);
        // Add sub-items
        items.filter(sub => sub.parentItemId === i.id).forEach(sub => allItems.push(sub));
      });
      
      // Add grouped items
      sortedGroups.forEach(group => {
        if (!group.isCollapsed && groupedItems[group.id]) {
          groupedItems[group.id].forEach(i => {
            allItems.push(i);
            // Add sub-items
            items.filter(sub => sub.parentItemId === i.id).forEach(sub => allItems.push(sub));
          });
        }
      });
      
      const currentItemIndex = allItems.findIndex(i => i.id === item.id);
      
      if (isShift) {
        // Move backwards
        if (currentFieldIndex > 0) {
          // Previous field in same item
          handleCellEdit(item, editableFields[currentFieldIndex - 1]);
        } else if (currentItemIndex > 0) {
          // Last field of previous item
          handleCellEdit(allItems[currentItemIndex - 1], editableFields[editableFields.length - 1]);
        }
      } else {
        // Move forwards
        if (currentFieldIndex < editableFields.length - 1) {
          // Next field in same item
          handleCellEdit(item, editableFields[currentFieldIndex + 1]);
        } else if (currentItemIndex < allItems.length - 1) {
          // First field of next item
          handleCellEdit(allItems[currentItemIndex + 1], editableFields[0]);
        }
      }
    }
  };

  // Form setup for adding items
  const addItemFormSchema = insertEstimateItemSchema.omit({ 
    estimateId: true,
    taxAmount: true, // Calculated by backend
    priceIncTax: true, // Calculated by backend
  }).extend({
    unitCostExTax: z.number().min(0, "Cost must be positive"),
    quantity: z.number().min(0.01, "Quantity must be greater than 0"),
    markupPercent: z.number().min(0).optional().nullable(),
  });

  const form = useForm<z.infer<typeof addItemFormSchema>>({
    resolver: zodResolver(addItemFormSchema),
    defaultValues: {
      name: "",
      description: "",
      notes: "",
      type: "material",
      quantity: 1,
      unitType: "ea",
      unitCostExTax: 0,
      markupPercent: 0,
      status: "pending",
      groupId: undefined,
      costCode: undefined,
      costCategoryId: undefined,
      allowance: "None",
      attachmentUrl: "",
      requestForQuote: false,
      isSelection: false,
      proposalVisible: true,
      shownAs: "price",
      order: 0,
      trackLabourHours: false,
    },
  });

  // Reset trackLabourHours when type changes away from labour
  React.useEffect(() => {
    const subscription = form.watch((value, { name }) => {
      if (name === "type" && value.type !== "labour" && value.trackLabourHours) {
        form.setValue("trackLabourHours", false);
      }
    });
    return () => subscription.unsubscribe();
  }, [form]);

  // Separate form for editing items
  const editForm = useForm<z.infer<typeof addItemFormSchema>>({
    resolver: zodResolver(addItemFormSchema),
    defaultValues: {
      name: "",
      description: "",
      notes: "",
      type: "material",
      quantity: 1,
      unitType: "ea",
      unitCostExTax: 0,
      markupPercent: 0,
      status: "pending",
      groupId: undefined,
      costCode: undefined,
      costCategoryId: undefined,
      allowance: "None",
      attachmentUrl: "",
      requestForQuote: false,
      isSelection: false,
      proposalVisible: true,
      shownAs: "price",
      order: 0,
      trackLabourHours: false,
    },
  });

  // Reset trackLabourHours when type changes away from labour in edit form
  React.useEffect(() => {
    const subscription = editForm.watch((value, { name }) => {
      if (name === "type" && value.type !== "labour" && value.trackLabourHours) {
        editForm.setValue("trackLabourHours", false);
      }
    });
    return () => subscription.unsubscribe();
  }, [editForm]);

  // Form setup for adding groups
  const addGroupFormSchema = insertEstimateGroupSchema.omit({ 
    estimateId: true 
  });

  const groupForm = useForm<z.infer<typeof addGroupFormSchema>>({
    resolver: zodResolver(addGroupFormSchema),
    defaultValues: {
      name: "",
      description: "",
      order: 0,
      isCollapsed: false,
    },
  });

  // Handlers for adding items
  const handleAddItem = () => {
    if (estimate?.isLocked) {
      toast({
        title: "Cannot Add Item",
        description: "This estimate is locked and cannot be modified.",
        variant: "destructive",
      });
      return;
    }
    setIsAddItemOpen(true);
  };

  const handleSubmitItem = (data: z.infer<typeof addItemFormSchema>) => {
    if (!estimate) return;
    
    // Backend will recalculate taxAmount and priceIncTax based on markup
    const itemData: InsertEstimateItem = {
      ...data,
      estimateId: estimate.id,
      taxAmount: 0, // Backend will recalculate
      priceIncTax: 0, // Backend will recalculate
    };
    
    addItemMutation.mutate(itemData);
  };

  const handleCloseAddItem = () => {
    setIsAddItemOpen(false);
    setPreselectedGroupId(null);
    form.reset();
  };

  // Handlers for adding groups
  const handleAddGroup = () => {
    if (estimate?.isLocked) {
      toast({
        title: "Cannot Add Group",
        description: "This estimate is locked and cannot be modified.",
        variant: "destructive",
      });
      return;
    }
    setIsAddGroupOpen(true);
  };

  // Handler for toggling lock status
  const handleToggleLock = () => {
    if (!estimate) return;
    toggleLockMutation.mutate();
  };

  // Helper function to escape CSV fields
  const escapeCsvField = (field: string): string => {
    return `"${field.replace(/"/g, '""')}"`;
  };

  // Handler for exporting estimate items to CSV
  const handleExportEstimate = () => {
    if (!estimate || !items) return;
    
    // Get all column headers (not filtering by visibility) and add Group column
    const headers = ['Group', ...columns.map(col => col.label)];
    const csvRows = [headers.join(',')];
    
    // Add data rows for items
    items.forEach((item) => {
      const row: string[] = [];
      
      // Add group name first
      const itemGroup = groups.find(g => g.id === item.groupId);
      row.push(escapeCsvField(itemGroup?.name || ''));
      
      columns.forEach(col => {
        switch (col.id) {
          case 'costCode':
            // Look up cost code and format as "CODE - TITLE"
            const matchedCode = costCodes.find(code => code.id === item.costCode);
            const displayCode = matchedCode ? `${matchedCode.code} - ${matchedCode.title}` : '';
            row.push(escapeCsvField(displayCode));
            break;
          case 'type':
            row.push(escapeCsvField(item.type || ''));
            break;
          case 'item':
            row.push(escapeCsvField(item.name || ''));
            break;
          case 'description':
            row.push(escapeCsvField(item.description || ''));
            break;
          case 'proposalVisible':
            row.push(item.proposalVisible ? 'Shown' : 'Hidden');
            break;
          case 'shownAs':
            row.push(escapeCsvField(item.shownAs || ''));
            break;
          case 'quantity':
            row.push((item.quantity || 0).toFixed(2));
            break;
          case 'allowance':
            row.push(escapeCsvField(item.allowance || 'None'));
            break;
          case 'unitType':
            row.push(escapeCsvField(item.unitType || ''));
            break;
          case 'unitCostExTax':
            row.push(item.unitCostExTax.toFixed(2));
            break;
          case 'unitCostIncTax':
            const pricingValsUnit = calculatePricingValues(item);
            row.push(pricingValsUnit.unitCostIncTax.toFixed(2));
            break;
          case 'builderCost':
            const pricingVals = calculatePricingValues(item);
            row.push(pricingVals.builderCost.toFixed(2));
            break;
          case 'builderCostIncTax':
            const pricingValsIncTax = calculatePricingValues(item);
            row.push(pricingValsIncTax.builderCostIncTax.toFixed(2));
            break;
          case 'markup':
            const pricingValues = calculatePricingValues(item);
            row.push(pricingValues.markupPercent?.toString() ?? '');
            break;
          case 'markupDollarAmount': {
            const pricingM = calculatePricingValues(item);
            row.push((pricingM.clientPriceExTax - pricingM.builderCost).toFixed(2));
            break;
          }
          case 'clientPriceExTax':
            const pricing1 = calculatePricingValues(item);
            row.push(pricing1.clientPriceExTax.toFixed(2));
            break;
          case 'clientTax':
            const pricing2 = calculatePricingValues(item);
            row.push(pricing2.clientTax.toFixed(2));
            break;
          case 'clientPriceIncTax':
            const pricing3 = calculatePricingValues(item);
            row.push(pricing3.clientPriceIncTax.toFixed(2));
            break;
          case 'notes':
            row.push(escapeCsvField(item.notes || ''));
            break;
          default:
            row.push('');
        }
      });
      
      csvRows.push(row.join(','));
    });
    
    // Create and download the file
    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', `${estimate.name.replace(/[^a-z0-9]/gi, '_')}_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast({
      title: "Success",
      description: `Exported ${items.length} items to CSV.`,
    });
  };

  // Handler for toggling group collapse
  const handleToggleGroupCollapse = (groupId: string, currentIsCollapsed: boolean) => {
    toggleGroupCollapseMutation.mutate({ 
      groupId, 
      isCollapsed: !currentIsCollapsed 
    });
  };

  // Handler for collapse/expand all groups
  const handleToggleAllGroups = async () => {
    if (!estimate || groups.length === 0) return;
    
    // Determine if we should collapse all or expand all
    // If any group is expanded, collapse all. Otherwise, expand all.
    const anyExpanded = groups.some(group => !group.isCollapsed);
    const targetState = anyExpanded; // true = collapse all, false = expand all
    
    // Optimistically update the cache immediately — no refetch to avoid reorder flicker
    queryClient.setQueryData(
      ["/api/estimates", effectiveEstimateId, "groups"],
      (old: any) => {
        if (!Array.isArray(old)) return old;
        return old.map(group => ({ ...group, isCollapsed: targetState }));
      }
    );
    
    // Fire API calls in parallel (fire-and-forget with error handling)
    const updatePromises = groups.map(group => 
      apiRequest(`/api/estimate-groups/${group.id}`, "PATCH", { isCollapsed: targetState })
    );
    
    try {
      await Promise.all(updatePromises);
    } catch (error: any) {
      // Rollback optimistic update on failure
      queryClient.invalidateQueries({ queryKey: ["/api/estimates", effectiveEstimateId, "groups"] });
      toast({
        title: "Error",
        description: error.message || "Failed to update groups.",
        variant: "destructive",
      });
    }
  };

  const handleSubmitGroup = (data: z.infer<typeof addGroupFormSchema>) => {
    if (!estimate) return;
    
    if (editingGroupId) {
      updateFullGroupMutation.mutate({ groupId: editingGroupId, data });
    } else {
      const groupData: InsertEstimateGroup = {
        ...data,
        estimateId: estimate.id,
        parentGroupId: parentGroupForNewSubgroup,
      };
      addGroupMutation.mutate(groupData);
    }
  };

  const handleCloseAddGroup = () => {
    setIsAddGroupOpen(false);
    setParentGroupForNewSubgroup(null);
    setEditingGroupId(null);
    groupForm.reset();
  };

  useEffect(() => {
    if (isAddGroupOpen && editingGroupId) {
      const group = groups.find(g => g.id === editingGroupId);
      if (group) {
        groupForm.reset({
          name: group.name,
          description: group.description || '',
          order: group.order || 0,
          isCollapsed: group.isCollapsed || false,
          defaultCostCode: group.defaultCostCode || undefined,
          defaultCostCategoryId: (group as any).defaultCostCategoryId || undefined,
        } as any);
      }
    }
  }, [isAddGroupOpen, editingGroupId, groups, groupForm]);

  // Column visibility toggle handler
  const toggleColumn = (columnId: string) => {
    hasUserModifiedRef.current = true;
    setColumns(prev => prev.map(col => 
      col.id === columnId ? { ...col, visible: !col.visible } : col
    ));
  };

  // Column resize handlers
  const handleResizeStart = (e: React.MouseEvent, columnId: string) => {
    e.preventDefault();
    const currentWidth = columns.find(col => col.id === columnId)?.widthPx || 100;
    
    setResizingColumn(columnId);
    setResizeStartX(e.clientX);
    setResizeStartWidth(currentWidth);
    
    // Prevent text selection during resize
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
  };

  // Handle resize effect with per-column min/max constraints
  React.useEffect(() => {
    if (!resizingColumn) return;

    // Define min/max constraints per column type
    const getColumnConstraints = (columnId: string) => {
      if (columnId === 'description' || columnId === 'item') {
        return { min: 80, max: 600 };
      }
      return { min: 40, max: 400 };
    };

    const handleMouseMove = (e: MouseEvent) => {
      const diff = e.clientX - resizeStartX;
      const { min, max } = getColumnConstraints(resizingColumn);
      const newWidth = Math.min(max, Math.max(min, resizeStartWidth + diff));
      
      setColumns(prev => prev.map(col => {
        if (col.id === resizingColumn) {
          return { ...col, widthPx: newWidth };
        }
        return col;
      }));
    };

    const handleMouseUp = () => {
      // Mark as user modified and clear resizing state - this will trigger the database save via debounced useEffect
      hasUserModifiedRef.current = true;
      setResizingColumn(null);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [resizingColumn, resizeStartX, resizeStartWidth]);

  const formatCurrency = (amount: number) => {
    const isWholeNumber = amount % 1 === 0;
    
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD',
      minimumFractionDigits: isWholeNumber ? 0 : 2,
      maximumFractionDigits: 2
    }).format(amount);
  };

  // Helper function to calculate two-tier pricing values
  const calculatePricingValues = (item: EstimateItem) => {
    const round3 = (n: number) => Math.round(n * 1000) / 1000;
    const taxRate = estimate?.taxRate ?? 10;

    // Unit cost with tax
    const unitCostTax = round3(item.unitCostExTax * taxRate / 100);
    const unitCostIncTax = round3(item.unitCostExTax + unitCostTax);

    // Builder's cost (what builder pays)
    const builderCost = round3(item.unitCostExTax * item.quantity);

    // Builder's cost with tax
    const builderCostTax = round3(builderCost * taxRate / 100);
    const builderCostIncTax = round3(builderCost + builderCostTax);

    // Markup — always calculate fresh from the effective markup percent
    const markupPercent = item.markupPercent ?? estimate?.projectMarkupPercent ?? 0;
    const markupAmount = round3(builderCost * markupPercent / 100);
    const clientPriceExTax = round3(builderCost + markupAmount);
    const clientTax = round3(clientPriceExTax * taxRate / 100);
    const clientPriceIncTax = round3(clientPriceExTax + clientTax);

    return {
      unitCostIncTax, // in dollars
      builderCost, // in dollars
      builderCostIncTax, // in dollars
      markupPercent, // percentage (10 = 10%)
      clientPriceExTax, // in dollars
      clientTax, // in dollars
      clientPriceIncTax // in dollars
    };
  };

  const formatQuantity = (quantity: number, unitType: string | null) => {
    const actualQty = quantity.toFixed(2).replace(/\.?0+$/, '');
    return `${actualQty}${unitType ? ` ${unitType}` : ''}`;
  };

  // Helper function to calculate group totals recursively
  const calculateGroupTotals = (groupId: string, allItems: EstimateItem[], allGroups: EstimateGroup[]) => {
    // Get all subgroups for this group
    const subgroups = allGroups.filter(g => g.parentGroupId === groupId);
    
    // Get all items directly in this group (including sub-items)
    // Sub-items have their own individual costs and should be counted
    const groupItems = allItems.filter(item => item.groupId === groupId);
    
    let builderCostExTax = 0;
    let builderCostIncTax = 0;
    let clientAmountExTax = 0;
    let clientTax = 0;
    let clientAmountIncTax = 0;
    
    // Sum up all items in this group (including sub-items)
    groupItems.forEach(item => {
      const values = calculatePricingValues(item);
      builderCostExTax += values.builderCost;
      builderCostIncTax += values.builderCostIncTax;
      clientAmountExTax += values.clientPriceExTax;
      clientTax += values.clientTax;
      clientAmountIncTax += values.clientPriceIncTax;
    });
    
    // Recursively add subgroup totals
    subgroups.forEach(subgroup => {
      const subgroupTotals = calculateGroupTotals(subgroup.id, allItems, allGroups);
      builderCostExTax += subgroupTotals.builderCostExTax;
      builderCostIncTax += subgroupTotals.builderCostIncTax;
      clientAmountExTax += subgroupTotals.clientAmountExTax;
      clientTax += subgroupTotals.clientTax;
      clientAmountIncTax += subgroupTotals.clientAmountIncTax;
    });
    
    return {
      builderCostExTax,
      builderCostIncTax,
      clientAmountExTax,
      clientTax,
      clientAmountIncTax,
    };
  };

  // Filter items based on current filter state
  const getFilteredItems = () => {
    return items.filter(item => {
      // Type filter
      if (filterType !== 'all' && item.type !== filterType) return false;
      
      // Status filter
      if (filterStatus !== 'all' && item.status !== filterStatus) return false;
      
      // Group filter
      if (filterGroup !== 'all') {
        if (filterGroup === 'ungrouped' && item.groupId) return false;
        if (filterGroup !== 'ungrouped' && item.groupId !== filterGroup) return false;
      }
      
      // Search filter - search by name, description, or cost code
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const nameMatch = item.name?.toLowerCase().includes(query);
        const descriptionMatch = item.description?.toLowerCase().includes(query);
        const costCodeMatch = item.costCode?.toLowerCase().includes(query);
        // Also search in matching cost code title
        const matchedCode = costCodes.find(code => code.id === item.costCode);
        const costCodeTitleMatch = matchedCode?.title?.toLowerCase().includes(query) || 
                                   matchedCode?.code?.toLowerCase().includes(query);
        
        if (!nameMatch && !descriptionMatch && !costCodeMatch && !costCodeTitleMatch) {
          return false;
        }
      }
      
      return true;
    });
  };

  // Calculate group totals (memoized for performance)
  const groupTotalsMap = useMemo(() => {
    const totalsMap: Record<string, ReturnType<typeof calculateGroupTotals>> = {};
    groups.forEach(group => {
      totalsMap[group.id] = calculateGroupTotals(group.id, items, groups);
    });
    return totalsMap;
  }, [items, groups]);

  // Auto-select group when adding item from group menu
  useEffect(() => {
    if (isAddItemOpen && preselectedGroupId) {
      const preselectedGroup = groups.find(g => g.id === preselectedGroupId);
      form.reset({
        name: "",
        description: "",
        notes: "",
        type: "material",
        quantity: 1,
        unitType: "ea",
        unitCostExTax: undefined as any,
        markupPercent: 0,
        status: "pending",
        groupId: preselectedGroupId,
        costCode: preselectedGroup?.defaultCostCode || undefined,
        costCategoryId: (preselectedGroup as any)?.defaultCostCategoryId || undefined,
        allowance: "None",
        attachmentUrl: "",
        requestForQuote: false,
        isSelection: false,
        proposalVisible: true,
        trackLabourHours: false,
      });
    }
  }, [isAddItemOpen, preselectedGroupId, form, groups]);

  // Populate edit form when editing item changes
  React.useEffect(() => {
    if (editingItemId && items) {
      const item = items.find(i => i.id === editingItemId);
      if (item) {
        editForm.reset({
          name: item.name,
          description: item.description || '',
          type: item.type,
          quantity: item.quantity,
          unitType: item.unitType || 'ea',
          unitCostExTax: item.unitCostExTax,
          markupPercent: item.markupPercent || undefined,
          groupId: item.groupId || undefined,
          costCode: item.costCode || '',
          costCategoryId: (item as any).costCategoryId || undefined,
          status: item.status || 'pending',
          trackLabourHours: item.trackLabourHours || false,
          notes: item.notes || '',
          attachmentUrl: item.attachmentUrl || '',
          requestForQuote: item.requestForQuote || false,
          isSelection: item.isSelection || false,
          proposalVisible: item.proposalVisible ?? true,
          shownAs: item.shownAs || 'price',
          allowance: item.allowance || 'None',
          order: item.order || 0,
        });
      }
    }
  }, [editingItemId, items, editForm]);

  // Auto-focus name cell on a newly inline-added item once it appears in the list
  React.useEffect(() => {
    const targetId = pendingAutoFocusItemId.current;
    if (!targetId || !items) return;
    const item = items.find(i => i.id === targetId);
    if (!item) return;
    pendingAutoFocusItemId.current = null;
    setEditingCell({ itemId: item.id, field: 'name' });
    setEditingValue(item.name || '');
  }, [items]);

  // Helper function to get sub-items for a parent item
  const getSubItems = (parentItemId: string): EstimateItem[] => {
    const subItems = items.filter(item => item.parentItemId === parentItemId);
    return subItems.sort((a, b) => {
      const orderDiff = (a.order || 0) - (b.order || 0);
      if (orderDiff !== 0) return orderDiff;
      return a.id.localeCompare(b.id); // Stable sort by ID when order is same
    });
  };

  // Toggle parent item collapse
  const handleToggleItemCollapse = (itemId: string) => {
    setCollapsedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  };

  // Selection handlers
  const handleToggleSelection = (itemId: string) => {
    setSelectedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    if (selectedItems.size === items.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(items.map(item => item.id)));
    }
  };

  const handleToggleGroupSelection = (groupId: string) => {
    // Get all items in this group
    const groupItems = items.filter(item => item.groupId === groupId);
    const groupItemIds = groupItems.map(item => item.id);
    
    setSelectedGroups(prev => {
      const newSet = new Set(prev);
      const isSelecting = !newSet.has(groupId);
      
      if (isSelecting) {
        newSet.add(groupId);
      } else {
        newSet.delete(groupId);
      }
      
      // Cascade selection to items in the group
      setSelectedItems(prevItems => {
        const newItemSet = new Set(prevItems);
        
        if (isSelecting) {
          // Add all group items to selection
          groupItemIds.forEach(itemId => newItemSet.add(itemId));
        } else {
          // Remove all group items from selection
          groupItemIds.forEach(itemId => newItemSet.delete(itemId));
        }
        
        return newItemSet;
      });
      
      return newSet;
    });
  };

  const handleClearSelection = () => {
    setSelectedItems(new Set());
    setSelectedGroups(new Set());
  };

  // Single item delete handler
  const confirmDeleteItem = async () => {
    if (!effectiveEstimateId || !itemToDelete) return;
    
    try {
      await apiRequest(`/api/estimate-items/${itemToDelete}`, 'DELETE');
      
      queryClient.invalidateQueries({ queryKey: ['/api/estimates', effectiveEstimateId, 'items'] });
      queryClient.invalidateQueries({ queryKey: ['/api/estimates', effectiveEstimateId, 'summary'] });
      
      setIsDeleteDialogOpen(false);
      setItemToDelete(null);
      
      toast({
        title: "Item deleted",
        description: "Successfully deleted the item",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete item",
        variant: "destructive",
      });
    }
  };
  
  // Group delete handler
  const confirmDeleteGroup = async () => {
    if (!effectiveEstimateId || !groupToDelete || isDeletingGroup) return;
    
    setIsDeletingGroup(true);
    try {
      await apiRequest(`/api/estimate-groups/${groupToDelete}`, 'DELETE');
      
      // Force refetch instead of just invalidating
      await queryClient.refetchQueries({ queryKey: ['/api/estimates', effectiveEstimateId, 'groups'] });
      await queryClient.refetchQueries({ queryKey: ['/api/estimates', effectiveEstimateId, 'items'] });
      
      setIsDeleteGroupDialogOpen(false);
      setGroupToDelete(null);
      
      toast({
        title: "Group deleted",
        description: "Successfully deleted the group and moved items to Ungrouped",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete group",
        variant: "destructive",
      });
    } finally {
      setIsDeletingGroup(false);
    }
  };
  
  // Group action handlers
  const handleEditGroup = (groupId: string) => {
    setEditingGroupId(groupId);
    setIsAddGroupOpen(true);
  };
  
  const handleDuplicateGroup = async (groupId: string) => {
    if (!effectiveEstimateId) return;
    
    try {
      await apiRequest(`/api/estimate-groups/${groupId}/duplicate`, 'POST', {});
      
      await queryClient.refetchQueries({ queryKey: ['/api/estimates', effectiveEstimateId, 'groups'] });
      await queryClient.refetchQueries({ queryKey: ['/api/estimates', effectiveEstimateId, 'items'] });
      
      toast({
        title: "Group duplicated",
        description: "Successfully duplicated the group",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to duplicate group",
        variant: "destructive",
      });
    }
  };
  
  const handleCopyGroup = (groupId: string) => {
    toast({
      title: "Copy group",
      description: "Copy group to another estimate - coming soon",
    });
  };
  
  const handleAddSubgroup = (parentGroupId: string) => {
    setParentGroupForNewSubgroup(parentGroupId);
    setIsAddGroupOpen(true);
  };
  
  const handleAddItemToGroup = (groupId: string) => {
    setPreselectedGroupId(groupId);
    setIsAddItemOpen(true);
  };

  // Inline add item handler - creates item with just a name
  const handleInlineAddItem = async (groupId: string, name: string) => {
    if (!effectiveEstimateId) return;
    
    // Get the group's items to determine the next order value
    const groupItems = items.filter(item => item.groupId === groupId);
    const maxOrder = groupItems.reduce((max, item) => Math.max(max, item.order || 0), -1);
    
    // Inherit defaults from the group
    const group = groups.find(g => g.id === groupId);
    
    const newItem: InsertEstimateItem = {
      estimateId: effectiveEstimateId,
      name: name,
      groupId: groupId,
      type: 'Material',
      quantity: 0,
      unitType: 'each',
      status: 'incomplete',
      unitCostExTax: 0,
      taxAmount: 0,
      priceIncTax: 0,
      allowance: 'None',
      allowanceStatus: 'pending',
      wastagePercent: 0,
      proposalVisible: true,
      requestForQuote: false,
      isSelection: false,
      trackLabourHours: false,
      order: maxOrder + 1,
      costCode: group?.defaultCostCode || undefined,
      ...(group && (group as any).defaultCostCategoryId ? { costCategoryId: (group as any).defaultCostCategoryId } : {}),
    };
    
    addItemMutation.mutate(newItem, {
      onSuccess: (data: any) => {
        if (data?.id) {
          pendingAutoFocusItemId.current = data.id;
        }
      },
    });
  };
  
  const handleCopyItem = (itemId: string) => {
    toast({
      title: "Copy item",
      description: "Copy item to another estimate - coming soon",
    });
  };

  // Bulk action handlers
  const handleBulkDelete = async () => {
    if (!effectiveEstimateId) return;
    
    try {
      const itemIds = Array.from(selectedItems);
      const groupIds = Array.from(selectedGroups);
      
      const itemResults = await Promise.allSettled(
        itemIds.map(itemId =>
          apiRequest(`/api/estimate-items/${itemId}`, 'DELETE')
        )
      );
      
      const groupResults = await Promise.allSettled(
        groupIds.map(groupId =>
          apiRequest(`/api/estimate-groups/${groupId}`, 'DELETE')
        )
      );
      
      const succeeded = [...itemResults, ...groupResults].filter(r => r.status === 'fulfilled').length;
      const failed = [...itemResults, ...groupResults].filter(r => r.status === 'rejected').length;
      
      // Always invalidate to refresh the UI
      queryClient.invalidateQueries({ queryKey: ['/api/estimates', effectiveEstimateId, 'items'] });
      queryClient.invalidateQueries({ queryKey: ['/api/estimates', effectiveEstimateId, 'groups'] });
      queryClient.invalidateQueries({ queryKey: ['/api/estimates', effectiveEstimateId, 'summary'] });
      setSelectedItems(new Set());
      setSelectedGroups(new Set());
      setIsBulkDeleteDialogOpen(false);
      
      if (failed === 0) {
        const totalCount = itemIds.length + groupIds.length;
        const itemWord = totalCount === 1 ? 'item' : 'items';
        toast({
          title: "Deleted successfully",
          description: `Successfully deleted ${totalCount} ${itemWord}`,
        });
      } else if (succeeded > 0) {
        toast({
          title: "Partial success",
          description: `Deleted ${succeeded} of ${itemIds.length + groupIds.length} items. ${failed} failed.`,
          variant: "destructive",
        });
      } else {
        // All deletions failed - find first error message
        const allResults = [...itemResults, ...groupResults];
        const firstRejection = allResults.find((r): r is PromiseRejectedResult => r.status === 'rejected');
        const errorMessage = firstRejection?.reason?.message || 
                            (firstRejection?.reason && String(firstRejection.reason)) ||
                            "All deletions failed";
        toast({
          title: "Delete failed",
          description: errorMessage,
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete items",
        variant: "destructive",
      });
    }
  };

  const handleBulkChangeStatus = async () => {
    if (!effectiveEstimateId || !bulkActionStatus) return;
    
    try {
      const itemIds = Array.from(selectedItems);
      const results = await Promise.allSettled(
        itemIds.map(itemId =>
          apiRequest(`/api/estimate-items/${itemId}`, 'PATCH', {
            status: bulkActionStatus
          })
        )
      );
      
      const succeeded = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;
      
      queryClient.invalidateQueries({ queryKey: ['/api/estimates', effectiveEstimateId, 'items'] });
      setSelectedItems(new Set());
      setIsBulkStatusDialogOpen(false);
      setBulkActionStatus('');
      
      if (failed === 0) {
        toast({
          title: "Status updated",
          description: `Successfully updated ${succeeded} items`,
        });
      } else if (succeeded > 0) {
        toast({
          title: "Partial success",
          description: `Updated ${succeeded} items, ${failed} failed`,
          variant: "destructive",
        });
      } else {
        const firstError = results.find(r => r.status === 'rejected') as PromiseRejectedResult;
        toast({
          title: "Update failed",
          description: firstError?.reason?.message || "Failed to update status",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update status",
        variant: "destructive",
      });
    }
  };

  const handleBulkChangeGroup = async () => {
    if (!effectiveEstimateId) return;
    
    try {
      const itemIds = Array.from(selectedItems);
      const results = await Promise.allSettled(
        itemIds.map(itemId =>
          apiRequest(`/api/estimate-items/${itemId}`, 'PATCH', {
            groupId: bulkActionGroup === 'none' ? null : bulkActionGroup
          })
        )
      );
      
      const succeeded = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;
      
      queryClient.invalidateQueries({ queryKey: ['/api/estimates', effectiveEstimateId, 'items'] });
      setSelectedItems(new Set());
      setIsBulkGroupDialogOpen(false);
      setBulkActionGroup('');
      
      if (failed === 0) {
        toast({
          title: "Group updated",
          description: `Successfully moved ${succeeded} items`,
        });
      } else if (succeeded > 0) {
        toast({
          title: "Partial success",
          description: `Moved ${succeeded} items, ${failed} failed`,
          variant: "destructive",
        });
      } else {
        const firstError = results.find(r => r.status === 'rejected') as PromiseRejectedResult;
        toast({
          title: "Move failed",
          description: firstError?.reason?.message || "Failed to change group",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to change group",
        variant: "destructive",
      });
    }
  };

  // Column reordering functions (auto-saved via debounced useEffect)
  const moveColumnUp = (columnId: string) => {
    hasUserModifiedRef.current = true;
    setColumns(prev => {
      const index = prev.findIndex(col => col.id === columnId);
      if (index > 0) {
        const newColumns = [...prev];
        [newColumns[index - 1], newColumns[index]] = [newColumns[index], newColumns[index - 1]];
        return newColumns;
      }
      return prev;
    });
  };

  const moveColumnDown = (columnId: string) => {
    hasUserModifiedRef.current = true;
    setColumns(prev => {
      const index = prev.findIndex(col => col.id === columnId);
      if (index < prev.length - 1) {
        const newColumns = [...prev];
        [newColumns[index + 1], newColumns[index]] = [newColumns[index], newColumns[index + 1]];
        return newColumns;
      }
      return prev;
    });
  };

  // Helper function to render an item row with its sub-items - CSS Grid based
  // Accepts optional visibleCols parameter to ensure consistency with header columns
  const renderItemWithSubItems = (
    item: EstimateItem, 
    groupContext?: { isInGroup?: boolean; isLastInGroup?: boolean }, 
    gridTemplate?: string,
    visibleCols?: ColumnConfig[]
  ) => {
    const subItems = getSubItems(item.id);
    const isCollapsed = collapsedItems.has(item.id);
    const isLocked = estimate?.isLocked;
    const isInGroup = groupContext?.isInGroup || false;
    const isLastInGroup = groupContext?.isLastInGroup || false;
    
    // Use passed visibleCols for consistency, fallback to filtering columns
    const visibleColumns = visibleCols || columns.filter(col => col.visible);
    
    // Generate grid template if not provided (no 32px handle column)
    const effectiveGridTemplate = gridTemplate || `24px ${visibleColumns.map(c => `${c.widthPx}px`).join(' ')} 80px`;
    
    // Build className for visual containment - 40px row height
    let itemClassName = "";
    if (isInGroup) {
      itemClassName += " item-in-group";
    }
    
    // Add lilac background for selected items
    const isItemSelected = selectedItems.has(item.id);
    if (isItemSelected) {
      itemClassName += " bg-[#f6f3ff]";
    } else {
      // Add subtle status-based color coding when not selected
      // EstimateItem status values: "incomplete", "not relevant", "done"
      switch (item.status) {
        case 'done':
          itemClassName += " bg-green-50/70";
          break;
        case 'not relevant':
          itemClassName += " bg-gray-100/70";
          break;
        case 'incomplete':
        default:
          // No special color for incomplete - default state
          break;
      }
    }
    
    // Active editing row highlight
    if (editingCell?.itemId === item.id) {
      itemClassName += " bg-primary/[0.04]";
    }

    // Calculate drop indicator for this item
    const itemDropIndicator = dropTarget?.id === item.id ? dropTarget.position : undefined;
    
    const rows = [
      // Parent item row - CSS Grid
      <SortableRow key={item.id} id={item.id} className={itemClassName} isDraggable={!isLocked} gridTemplate={effectiveGridTemplate} dropIndicator={itemDropIndicator} activeDragId={activeId}>
        {/* Checkbox cell */}
        <div className="h-9 px-2 flex items-center" role="gridcell">
          <Checkbox
            checked={selectedItems.has(item.id)}
            onCheckedChange={() => handleToggleSelection(item.id)}
            aria-label={`Select ${item.name}`}
            data-testid={`checkbox-item-${item.id}`}
            disabled={estimate?.isLocked}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
        {visibleColumns.map(column => {
          const cell = renderCell(item, column.id);
          return React.cloneElement(cell as React.ReactElement, { key: `${item.id}-${column.id}` });
        })}
        {/* Actions cell */}
        <div className="h-9 px-2 flex items-center" role="gridcell">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="ghost" 
                size="icon" 
                data-testid={`button-actions-${item.id}`}
                disabled={estimate?.isLocked}
              >
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem 
                onClick={() => {
                  if (estimate?.isLocked) return;
                  form.reset({
                    name: '',
                    type: 'Material',
                    quantity: 1,
                    unitCostExTax: 0,
                    markupPercent: 0,
                    groupId: item.groupId || undefined,
                    parentItemId: item.id,
                    status: 'pending',
                    description: '',
                    costCode: '',
                    notes: '',
                    attachmentUrl: '',
                    requestForQuote: false,
                    isSelection: false,
                    proposalVisible: true,
                    shownAs: 'price',
                    order: 0,
                  });
                  setIsAddItemOpen(true);
                }}
                data-testid={`button-add-subitem-${item.id}`}
                disabled={estimate?.isLocked}
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Sub-Item
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => {
                  setEditingItemId(item.id);
                  setIsEditDialogOpen(true);
                }}
                data-testid={`button-edit-item-${item.id}`}
                disabled={estimate?.isLocked}
              >
                <Edit className="w-4 h-4 mr-2" />
                Edit Item
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => handleDuplicateItem(item.id)}
                data-testid={`button-duplicate-item-${item.id}`}
                disabled={estimate?.isLocked}
              >
                <Copy className="w-4 h-4 mr-2" />
                Duplicate
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => handleCopyItem(item.id)}
                data-testid={`button-copy-item-${item.id}`}
                disabled={estimate?.isLocked}
              >
                <FileText className="w-4 h-4 mr-2" />
                Copy To...
              </DropdownMenuItem>
              <Separator />
              <DropdownMenuItem 
                onClick={() => toast({ title: "Create from Item", description: "Coming soon" })}
                data-testid={`button-create-from-item-${item.id}`}
                disabled={estimate?.isLocked}
              >
                <Plus className="w-4 h-4 mr-2" />
                Create from...
              </DropdownMenuItem>
              <Separator />
              <DropdownMenuItem 
                onClick={() => {
                  setItemToDelete(item.id);
                  setIsDeleteDialogOpen(true);
                }}
                data-testid={`button-delete-item-${item.id}`} 
                className="text-destructive"
                disabled={estimate?.isLocked}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete Item
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </SortableRow>
    ];
    
    // Add sub-items if not collapsed - CSS Grid based
    if (!isCollapsed) {
      subItems.forEach(subItem => {
        const subItemDropIndicator = dropTarget?.id === subItem.id ? dropTarget.position : undefined;
        rows.push(
          <SortableRow key={subItem.id} id={subItem.id} className={editingCell?.itemId === subItem.id ? 'bg-primary/[0.04]' : 'bg-muted/20'} isDraggable={!isLocked} gridTemplate={effectiveGridTemplate} dropIndicator={subItemDropIndicator} activeDragId={activeId}>
            <div className="h-9 px-2 flex items-center" role="gridcell">
              <Checkbox
                checked={selectedItems.has(subItem.id)}
                onCheckedChange={() => handleToggleSelection(subItem.id)}
                aria-label={`Select ${subItem.name}`}
                data-testid={`checkbox-item-${subItem.id}`}
                disabled={estimate?.isLocked}
                onClick={(e) => e.stopPropagation()}
              />
            </div>
            {visibleColumns.map(column => {
              const cell = renderCell(subItem, column.id);
              return React.cloneElement(cell as React.ReactElement, { key: `${subItem.id}-${column.id}` });
            })}
            <div className="h-9 px-2 flex items-center" role="gridcell">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    data-testid={`button-actions-${subItem.id}`}
                    disabled={estimate?.isLocked}
                  >
                    <MoreHorizontal className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem 
                    onClick={() => {
                      setEditingItemId(subItem.id);
                      setIsEditDialogOpen(true);
                    }}
                    data-testid={`button-edit-item-${subItem.id}`}
                    disabled={estimate?.isLocked}
                  >
                    <Edit className="w-4 h-4 mr-2" />
                    Edit Item
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={() => handleDuplicateItem(subItem.id)}
                    data-testid={`button-duplicate-item-${subItem.id}`}
                    disabled={estimate?.isLocked}
                  >
                    <Copy className="w-4 h-4 mr-2" />
                    Duplicate
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={() => handleCopyItem(subItem.id)}
                    data-testid={`button-copy-item-${subItem.id}`}
                    disabled={estimate?.isLocked}
                  >
                    <FileText className="w-4 h-4 mr-2" />
                    Copy To...
                  </DropdownMenuItem>
                  <Separator />
                  <DropdownMenuItem 
                    onClick={() => toast({ title: "Create from Item", description: "Coming soon" })}
                    data-testid={`button-create-from-item-${subItem.id}`}
                    disabled={estimate?.isLocked}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Create from...
                  </DropdownMenuItem>
                  <Separator />
                  <DropdownMenuItem 
                    onClick={() => {
                      setItemToDelete(subItem.id);
                      setIsDeleteDialogOpen(true);
                    }}
                    data-testid={`button-delete-item-${subItem.id}`} 
                    className="text-destructive"
                    disabled={estimate?.isLocked}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete Item
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </SortableRow>
        );
      });
    }
    
    return rows;
  };

  // Organize items by groups for display (including sub-items and hierarchical groups)
  const organizeItemsByGroups = () => {
    const filteredItems = getFilteredItems();
    const groupedItems: { [key: string]: EstimateItem[] } = {};
    const ungroupedItems: EstimateItem[] = [];

    // Sort groups by order
    const allSortedGroups = [...groups].sort((a, b) => (a.order || 0) - (b.order || 0));
    
    // Separate parent groups and subgroups
    const parentGroups = allSortedGroups.filter(g => !g.parentGroupId);
    const subgroupsByParent: { [key: string]: EstimateGroup[] } = {};
    
    // Organize subgroups by their parent
    allSortedGroups.filter(g => g.parentGroupId).forEach(subgroup => {
      if (!subgroupsByParent[subgroup.parentGroupId!]) {
        subgroupsByParent[subgroup.parentGroupId!] = [];
      }
      subgroupsByParent[subgroup.parentGroupId!].push(subgroup);
    });

    // Initialize group containers for all groups (parent and sub)
    allSortedGroups.forEach(group => {
      groupedItems[group.id] = [];
    });

    // First, filter only parent items (items without parentItemId)
    const parentItems = filteredItems.filter(item => !item.parentItemId);
    
    // Organize parent items into groups
    parentItems.forEach(item => {
      if (item.groupId && groupedItems[item.groupId]) {
        groupedItems[item.groupId].push(item);
      } else {
        ungroupedItems.push(item);
      }
    });

    // Sort items within each group by order, then by ID for stability
    Object.keys(groupedItems).forEach(groupId => {
      groupedItems[groupId].sort((a, b) => {
        const orderDiff = (a.order || 0) - (b.order || 0);
        if (orderDiff !== 0) return orderDiff;
        return a.id.localeCompare(b.id); // Stable sort by ID when order is same
      });
    });

    // Sort ungrouped items by order, then by ID for stability
    ungroupedItems.sort((a, b) => {
      const orderDiff = (a.order || 0) - (b.order || 0);
      if (orderDiff !== 0) return orderDiff;
      return a.id.localeCompare(b.id); // Stable sort by ID when order is same
    });

    return { 
      sortedGroups: parentGroups, 
      subgroupsByParent,
      groupedItems, 
      ungroupedItems 
    };
  };

  // Render cell based on column ID - returns grid-compatible div elements
  const renderCell = (item: EstimateItem, columnId: string) => {
    const isEditing = editingCell?.itemId === item.id && editingCell?.field === columnId;
    const isLocked = estimate?.isLocked;
    const pricingValues = calculatePricingValues(item);
    const cellKey = `${item.id}-${columnId}`;
    
    // Common grid cell base class
    const cellBase = "h-9 px-2 flex items-center text-sm overflow-hidden";
    // Active cell: inset ring on the cell container (not on the input itself)
    const cellActive = "ring-1 ring-inset ring-primary/60 rounded-[2px]";
    // Editable cell hover: layout-neutral bottom-border underline (border-b space pre-reserved)
    const cellEditable = !isLocked ? "border-b border-transparent hover:border-primary/30 transition-colors cursor-pointer" : "";

    switch (columnId) {
      case 'costCode':
        if (isEditing) {
          return (
            <div className={`${cellBase} ${cellActive}`} role="gridcell">
              <CostCodeSelect
                value={editingValue || ''}
                onValueChange={(value) => {
                  const newValue = value || undefined;
                  setEditingValue(newValue || '');
                  updateItemMutation.mutate({
                    itemId: item.id,
                    data: { costCode: newValue }
                  });
                  setEditingCell(null);
                }}
                placeholder="None"
                triggerClassName="h-8 text-sm border-0 shadow-none focus-visible:ring-0 bg-transparent"
                data-testid={`select-edit-costCode-${item.id}`}
              />
            </div>
          );
        }
        const matchedCode = costCodes.find(code => code.id === item.costCode);
        const displayCode = matchedCode ? `${matchedCode.code} - ${matchedCode.title}` : (item.costCode || '-');
        return (
          <div 
            className={`${cellBase} truncate ${cellEditable}`}
            role="gridcell"
            title={isLocked ? displayCode : 'Click to edit'}
            onClick={(e) => {
              e.stopPropagation();
              if (!isLocked) handleCellEdit(item, 'costCode');
            }}
            data-testid={`cell-costCode-${item.id}`}
          >
            {displayCode}
          </div>
        );
      
      case 'costCategoryId': {
        if (isEditing) {
          return (
            <div className={`${cellBase} ${cellActive}`} role="gridcell">
              <Select
                value={editingValue || 'none'}
                onValueChange={(value) => {
                  const newValue = value === 'none' ? undefined : value;
                  setEditingValue(newValue || '');
                  updateItemMutation.mutate({
                    itemId: item.id,
                    data: { costCategoryId: newValue } as any,
                  });
                  setEditingCell(null);
                }}
              >
                <SelectTrigger className="h-8 text-sm border-0 shadow-none focus:ring-0 bg-transparent" data-testid={`select-edit-costCategoryId-${item.id}`}>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {costCategories.map(cat => (
                    <SelectItem key={cat.id} value={cat.id}>{cat.code} - {cat.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          );
        }
        const matchedCat = costCategories.find(cat => cat.id === (item as any).costCategoryId);
        const displayCat = matchedCat ? `${matchedCat.code} - ${matchedCat.title}` : ((item as any).costCategoryId ? (item as any).costCategoryId : '-');
        return (
          <div
            className={`${cellBase} truncate text-xs ${cellEditable}`}
            role="gridcell"
            onClick={(e) => { e.stopPropagation(); if (!isLocked) handleCellEdit(item, 'costCategoryId'); }}
            data-testid={`cell-costCategoryId-${item.id}`}
          >
            {displayCat}
          </div>
        );
      }

      case 'type': {
        const typeColors: Record<string, string> = {
          Material: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
          Labour: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
          Subcontractor: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
          Fee: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
        };
        const typeColor = typeColors[item.type] || typeColors.Material;
        if (isEditing) {
          return (
            <div className={cellBase} role="gridcell">
              <Select
                value={editingValue || item.type}
                onValueChange={(value) => {
                  updateItemMutation.mutate({ itemId: item.id, data: { type: value as any } });
                  setEditingCell(null);
                }}
              >
                <SelectTrigger className="h-8 text-sm" data-testid={`select-edit-type-${item.id}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Material">Material</SelectItem>
                  <SelectItem value="Labour">Labour</SelectItem>
                  <SelectItem value="Subcontractor">Subcontractor</SelectItem>
                  <SelectItem value="Fee">Fee</SelectItem>
                </SelectContent>
              </Select>
            </div>
          );
        }
        return (
          <div
            className={`${cellBase} ${cellEditable}`}
            role="gridcell"
            onClick={(e) => { e.stopPropagation(); if (!isLocked) handleCellEdit(item, 'type'); }}
            data-testid={`cell-type-${item.id}`}
          >
            <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${typeColor}`}>
              {item.type || 'Material'}
            </span>
          </div>
        );
      }
      
      case 'item':
        const subItems = getSubItems(item.id);
        const hasSubItems = subItems.length > 0;
        const isCollapsed = collapsedItems.has(item.id);
        const isSubItem = !!item.parentItemId;
        const indentClass = isSubItem ? 'pl-16' : 'pl-8';
        
        if (isEditing) {
          return (
            <div className={`${cellBase} ${indentClass} ${cellActive}`} role="gridcell">
              <Input
                value={editingValue}
                onChange={(e) => setEditingValue(e.target.value)}
                onKeyDown={(e) => handleCellKeyDown(e, item, 'name')}
                onBlur={() => handleCellSave(item, 'name')}
                className="h-full w-full bg-transparent border-0 shadow-none focus-visible:ring-0 text-sm"
                autoFocus
                data-testid={`input-edit-name-${item.id}`}
              />
            </div>
          );
        }
        return (
          <div 
            className={`${cellBase} ${indentClass} ${cellEditable}`}
            role="gridcell"
            data-testid={`cell-name-${item.id}`}
            onClick={(e) => {
              e.stopPropagation();
              if (!isLocked) handleCellEdit(item, 'name');
            }}
          >
            <div className="flex items-center gap-2">
              {hasSubItems && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-4 w-4 p-0 -ml-6"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleItemCollapse(item.id);
                  }}
                  data-testid={`button-toggle-item-${item.id}`}
                >
                  {isCollapsed ? (
                    <ChevronRight className="h-3 w-3" />
                  ) : (
                    <ChevronDown className="h-3 w-3" />
                  )}
                </Button>
              )}
              <span 
                className="font-medium truncate max-w-[180px] block text-[12px]"
                title={isLocked ? item.name : 'Click to edit'}
              >
                {item.name}
              </span>
              {poLinkMap.has(item.id) && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <ShoppingCart className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <p className="text-xs">{poLinkMap.get(item.id)!.map(l => l.poNumber).join(', ')}</p>
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          </div>
        );
      
      case 'description':
        return (
          <div 
            className={cellBase}
            role="gridcell"
            data-testid={`cell-description-${item.id}`}
          >
            <HoverCard openDelay={200}>
              <HoverCardTrigger asChild>
                <div 
                  className={`truncate max-w-[200px] ${!isLocked ? 'cursor-pointer border-b border-transparent hover:border-primary/30 transition-colors' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!isLocked) {
                      handleCellEdit(item, 'description');
                    }
                  }}
                  dangerouslySetInnerHTML={{ 
                    __html: item.description || '<span class="text-muted-foreground">-</span>' 
                  }}
                />
              </HoverCardTrigger>
              {item.description && (
                <HoverCardContent className="w-96" align="start">
                  <div 
                    className="prose prose-sm max-w-none"
                    dangerouslySetInnerHTML={{ __html: item.description }}
                  />
                </HoverCardContent>
              )}
            </HoverCard>
          </div>
        );
      
      case 'proposalVisible':
        return (
          <div className={`${cellBase} justify-center`} role="gridcell" data-testid={`cell-proposalVisible-${item.id}`}>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => {
                if (isLocked) {
                  toast({
                    title: "Cannot Edit",
                    description: "This estimate is locked and cannot be modified.",
                    variant: "destructive",
                  });
                  return;
                }
                updateItemMutation.mutate({
                  itemId: item.id,
                  data: { proposalVisible: !item.proposalVisible }
                });
              }}
              disabled={isLocked}
              data-testid={`button-toggle-proposalVisible-${item.id}`}
            >
              {item.proposalVisible ? <Eye className="w-4 h-4" /> : <Eye className="w-4 h-4 opacity-30" />}
            </Button>
          </div>
        );
      
      case 'shownAs':
        const shownAsOptions = ['empty', 'price', 'included', 'excluded'];
        const currentShownAs = item.shownAs || 'price';
        const currentIndex = shownAsOptions.indexOf(currentShownAs);
        const validIndex = currentIndex >= 0 ? currentIndex : 1; // Default to 'price' if invalid
        
        // Chip color based on shown as value
        const shownAsChipClass = 
          currentShownAs === 'price' ? 'bg-[#bba7db]/20 text-[#7c5bb0] border-[#bba7db]/30' :
          currentShownAs === 'included' ? 'bg-green-100 text-green-700 border-green-200' :
          currentShownAs === 'excluded' ? 'bg-red-100 text-red-700 border-red-200' :
          'bg-muted text-muted-foreground border-border';
        
        return (
          <div className={cellBase} role="gridcell" key={`${item.id}-shownAs`} data-testid={`cell-shownAs-${item.id}`}>
            <Badge
              variant="outline"
              className={`h-5 w-16 px-2 text-xs capitalize cursor-pointer hover-elevate justify-center ${shownAsChipClass} ${isLocked ? 'cursor-not-allowed opacity-60' : ''}`}
              onClick={() => {
                if (isLocked) return;
                // Cycle through options
                const nextIndex = (validIndex + 1) % shownAsOptions.length;
                const nextShownAs = shownAsOptions[nextIndex];
                updateItemMutation.mutate({
                  itemId: item.id,
                  data: { shownAs: nextShownAs }
                });
              }}
              data-testid={`button-toggle-shownAs-${item.id}`}
            >
              {currentShownAs}
            </Badge>
          </div>
        );
      
      case 'status':
        // Use field settings options, fallback to hardcoded if not available
        const activeStatusOptions = estimateItemStatusCategory?.options?.filter((opt: any) => opt.isActive) || [];
        const statusOptionsKeys = activeStatusOptions.length > 0 
          ? activeStatusOptions.map((opt: any) => opt.key)
          : ['incomplete', 'not relevant', 'done'];
        const currentStatus = item.status || statusOptionsKeys[0] || 'incomplete';
        const statusIndex = statusOptionsKeys.indexOf(currentStatus);
        const validStatusIndex = statusIndex >= 0 ? statusIndex : 0;
        
        // Find the status option from field settings to get color and name
        const statusOption = activeStatusOptions.find((opt: any) => opt.key === currentStatus);
        
        // Get color from field settings or use fallback colors
        const getStatusChipStyle = () => {
          if (statusOption?.color) {
            const color = statusOption.color;
            // Check if it's a valid hex color
            if (color.startsWith('#') && (color.length === 4 || color.length === 7)) {
              // Use hex color from field settings with alpha
              return {
                backgroundColor: `${color}20`,
                color: color,
                borderColor: `${color}40`
              };
            }
            // For non-hex colors (tailwind tokens, css variables), use a mapping
            const colorMap: Record<string, string> = {
              'green': 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800',
              'amber': 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800',
              'red': 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800',
              'blue': 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800',
              'gray': 'bg-muted text-muted-foreground border-border',
              'muted': 'bg-muted text-muted-foreground border-border',
            };
            // Try to find a matching color class
            const lowerColor = color.toLowerCase();
            for (const [key, className] of Object.entries(colorMap)) {
              if (lowerColor.includes(key)) {
                return { className };
              }
            }
          }
          // Fallback to hardcoded colors for legacy statuses
          if (currentStatus === 'done') return { className: 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800' };
          if (currentStatus === 'not relevant') return { className: 'bg-muted text-muted-foreground border-border' };
          return { className: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800' }; // incomplete/default
        };
        
        const statusChipStyle = getStatusChipStyle();
        const statusLabel = statusOption?.name || 
          (currentStatus === 'done' ? 'Done' : currentStatus === 'not relevant' ? 'N/A' : 'Todo');
        
        return (
          <div className={cellBase} role="gridcell" key={`${item.id}-status`} data-testid={`cell-status-${item.id}`}>
            <Badge
              variant="outline"
              className={`h-5 min-w-[56px] px-2 text-xs cursor-pointer hover-elevate justify-center ${statusChipStyle.className || ''} ${isLocked ? 'cursor-not-allowed opacity-60' : ''}`}
              style={statusChipStyle.className ? undefined : statusChipStyle as React.CSSProperties}
              onClick={() => {
                if (isLocked) return;
                // Cycle through options
                const nextStatusIndex = (validStatusIndex + 1) % statusOptionsKeys.length;
                const nextStatus = statusOptionsKeys[nextStatusIndex];
                updateItemMutation.mutate({
                  itemId: item.id,
                  data: { status: nextStatus }
                });
              }}
              data-testid={`button-toggle-status-${item.id}`}
            >
              {statusLabel}
            </Badge>
          </div>
        );
      
      case 'allowance':
        const allowanceType = item.allowance || 'None';
        
        // Chip styling for allowance
        const allowanceChipClass = 
          allowanceType === 'Prime Cost' ? 'bg-blue-100 text-blue-700 border-blue-200' :
          allowanceType === 'Provisional Sum' ? 'bg-amber-100 text-amber-700 border-amber-200' :
          'bg-muted/50 text-muted-foreground border-border';
        
        const allowanceLabel = 
          allowanceType === 'Prime Cost' ? 'PC' : 
          allowanceType === 'Provisional Sum' ? 'PS' : 
          '-';
        
        return (
          <div className={cellBase} role="gridcell" key={`${item.id}-allowance`} data-testid={`cell-allowance-${item.id}`}>
            <Badge
              variant="outline"
              className={`h-5 w-8 px-2 text-xs cursor-pointer hover-elevate justify-center ${allowanceChipClass} ${isLocked ? 'cursor-not-allowed opacity-60' : ''}`}
              onClick={() => {
                if (isLocked) return;
                // Cycle through: None -> Prime Cost -> Provisional Sum -> None
                const nextAllowance = 
                  item.allowance === 'None' ? 'Prime Cost' :
                  item.allowance === 'Prime Cost' ? 'Provisional Sum' : 'None';
                updateItemMutation.mutate({
                  itemId: item.id,
                  data: { allowance: nextAllowance }
                });
              }}
              data-testid={`button-toggle-allowance-${item.id}`}
            >
              {allowanceLabel}
            </Badge>
          </div>
        );
      
      case 'quantity':
        if (isEditing) {
          return (
            <div className={`${cellBase} ${cellActive}`} role="gridcell">
              <Input
                type="number"
                value={editingValue}
                onChange={(e) => setEditingValue(e.target.value)}
                onKeyDown={(e) => handleCellKeyDown(e, item, 'quantity')}
                onBlur={() => handleCellSave(item, 'quantity')}
                className="h-full w-full bg-transparent border-0 shadow-none focus-visible:ring-0 text-sm"
                autoFocus
                min="0"
                step="0.01"
                data-testid={`input-edit-quantity-${item.id}`}
              />
            </div>
          );
        }
        // Calculate quantity with wastage
        const baseQuantity = item.quantity;
        const wastage = (item as any).wastagePercent || 0;
        const adjustedQuantity = baseQuantity * (1 + wastage / 100);
        const displayQuantity = wastage > 0 ? adjustedQuantity : baseQuantity;
        
        return (
          <div 
            className={`${cellBase} ${cellEditable}`}
            role="gridcell"
            title={isLocked ? '' : `Click to edit (Base: ${baseQuantity.toFixed(2).replace(/\.?0+$/, '')}${wastage > 0 ? `, +${wastage}% waste` : ''})`}
            onClick={(e) => {
              e.stopPropagation();
              if (!isLocked) handleCellEdit(item, 'quantity');
            }}
            data-testid={`cell-quantity-${item.id}`}
          >
            {displayQuantity.toFixed(2).replace(/\.?0+$/, '')}
          </div>
        );
      
      case 'wastage':
        const wastageOptions = [0, 10, 15, 20];
        const currentWastage = (item as any).wastagePercent || 0;
        const wastageIndex = wastageOptions.indexOf(currentWastage);
        const validWastageIndex = wastageIndex >= 0 ? wastageIndex : 0;
        
        // Chip color based on wastage value
        const wastageChipClass = 
          currentWastage === 0 ? 'bg-muted/50 text-muted-foreground border-border' :
          currentWastage === 10 ? 'bg-blue-100 text-blue-700 border-blue-200' :
          currentWastage === 15 ? 'bg-amber-100 text-amber-700 border-amber-200' :
          'bg-orange-100 text-orange-700 border-orange-200'; // 20%
        
        const wastageLabel = currentWastage === 0 ? '-' : `${currentWastage}%`;
        
        return (
          <div className={cellBase} role="gridcell" key={`${item.id}-wastage`} data-testid={`cell-wastage-${item.id}`}>
            <Badge
              variant="outline"
              className={`h-5 w-10 px-1 text-xs cursor-pointer hover-elevate justify-center ${wastageChipClass} ${isLocked ? 'cursor-not-allowed opacity-60' : ''}`}
              onClick={() => {
                if (isLocked) return;
                // Cycle through options
                const nextWastageIndex = (validWastageIndex + 1) % wastageOptions.length;
                const nextWastage = wastageOptions[nextWastageIndex];
                updateItemMutation.mutate({
                  itemId: item.id,
                  data: { wastagePercent: nextWastage }
                });
              }}
              data-testid={`button-toggle-wastage-${item.id}`}
            >
              {wastageLabel}
            </Badge>
          </div>
        );
      
      case 'unitType':
        if (isEditing) {
          return (
            <div className={`${cellBase} ${cellActive}`} role="gridcell">
              <Select
                value={editingValue}
                onValueChange={(value) => {
                  setEditingValue(value);
                  // Auto-save on selection
                  updateItemMutation.mutate({
                    itemId: item.id,
                    data: { unitType: value }
                  });
                  setEditingCell(null);
                }}
                data-testid={`select-edit-unitType-${item.id}`}
              >
                <SelectTrigger className="h-8 text-sm border-0 shadow-none focus:ring-0 bg-transparent">
                  <SelectValue placeholder="Unit" />
                </SelectTrigger>
                <SelectContent>
                  {estimateItemUnitCategory?.options
                    ?.filter(opt => opt.isActive)
                    .sort((a, b) => a.sortOrder - b.sortOrder)
                    .map(option => (
                      <SelectItem key={option.id} value={option.name}>
                        {option.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          );
        }
        return (
          <div 
            className={`${cellBase} truncate ${cellEditable}`}
            role="gridcell"
            title={isLocked ? item.unitType || '' : 'Click to edit'}
            onClick={(e) => {
              e.stopPropagation();
              if (!isLocked) handleCellEdit(item, 'unitType');
            }}
            data-testid={`cell-unitType-${item.id}`}
          >
            {item.unitType || '-'}
          </div>
        );
      
      case 'unitCostExTax':
        if (isEditing) {
          return (
            <div className={`${cellBase} ${cellActive}`} role="gridcell">
              <Input
                type="number"
                value={editingValue}
                onChange={(e) => setEditingValue(e.target.value)}
                onKeyDown={(e) => handleCellKeyDown(e, item, 'unitCostExTax')}
                onBlur={() => handleCellSave(item, 'unitCostExTax')}
                className="h-full w-full bg-transparent border-0 shadow-none focus-visible:ring-0 text-sm"
                autoFocus
                min="0"
                step="0.01"
                data-testid={`input-edit-unitCostExTax-${item.id}`}
              />
            </div>
          );
        }
        return (
          <div 
            className={`${cellBase} ${cellEditable}`}
            role="gridcell"
            title={isLocked ? '' : 'Click to edit'}
            onClick={(e) => {
              e.stopPropagation();
              if (!isLocked) handleCellEdit(item, 'unitCostExTax');
            }}
            data-testid={`cell-unitCostExTax-${item.id}`}
          >
            {formatCurrency(item.unitCostExTax)}
          </div>
        );
      
      case 'unitCostIncTax':
        const unitCostIncTax = pricingValues.unitCostIncTax || 0;
        
        if (isEditing) {
          return (
            <div className={`${cellBase} ${cellActive}`} role="gridcell">
              <Input
                type="number"
                value={editingValue}
                onChange={(e) => setEditingValue(e.target.value)}
                onKeyDown={(e) => handleCellKeyDown(e, item, 'unitCostIncTax')}
                onBlur={() => handleCellSave(item, 'unitCostIncTax')}
                className="h-full w-full bg-transparent border-0 shadow-none focus-visible:ring-0 text-sm"
                autoFocus
                min="0"
                step="0.01"
                data-testid={`input-edit-unitCostIncTax-${item.id}`}
              />
            </div>
          );
        }
        return (
          <div 
            className={`${cellBase} ${cellEditable}`}
            role="gridcell"
            title={isLocked ? '' : 'Click to edit'}
            onClick={(e) => {
              e.stopPropagation();
              if (!isLocked) handleCellEdit(item, 'unitCostIncTax');
            }}
            data-testid={`cell-unitCostIncTax-${item.id}`}
          >
            {formatCurrency(unitCostIncTax)}
          </div>
        );
      
      case 'builderCost':
        return (
          <div className={cellBase} role="gridcell" data-testid={`cell-builderCost-${item.id}`}>
            {formatCurrency(pricingValues.builderCost)}
          </div>
        );
      
      case 'builderCostIncTax':
        return (
          <div className={cellBase} role="gridcell" data-testid={`cell-builderCostIncTax-${item.id}`}>
            {formatCurrency(pricingValues.builderCostIncTax)}
          </div>
        );
      
      case 'markup':
        if (isEditing) {
          return (
            <div className={`${cellBase} ${cellActive}`} role="gridcell">
              <Input
                type="number"
                value={editingValue}
                onChange={(e) => setEditingValue(e.target.value)}
                onKeyDown={(e) => handleCellKeyDown(e, item, 'markup')}
                onBlur={() => handleCellSave(item, 'markup')}
                className="h-full w-full bg-transparent border-0 shadow-none focus-visible:ring-0 text-sm"
                autoFocus
                min="0"
                step="1"
                data-testid={`input-edit-markup-${item.id}`}
              />
            </div>
          );
        }
        return (
          <div 
            className={`${cellBase} ${cellEditable}`}
            role="gridcell"
            title={isLocked ? '' : 'Click to edit'}
            onClick={(e) => {
              e.stopPropagation();
              if (!isLocked) handleCellEdit(item, 'markup');
            }}
            data-testid={`cell-markup-${item.id}`}
          >
            {pricingValues.markupPercent != null ? `${pricingValues.markupPercent}%` : 
             (estimate?.projectMarkupPercent != null ? `${estimate.projectMarkupPercent}% (project)` : '-')}
          </div>
        );
      
      case 'markupDollarAmount':
        return (
          <div className={cellBase} role="gridcell" data-testid={`cell-markupDollarAmount-${item.id}`}>
            {formatCurrency(pricingValues.clientPriceExTax - pricingValues.builderCost)}
          </div>
        );
      
      case 'clientPriceExTax':
        return (
          <div className={cellBase} role="gridcell" data-testid={`cell-clientPriceExTax-${item.id}`}>
            {formatCurrency(pricingValues.clientPriceExTax)}
          </div>
        );
      
      case 'clientTax':
        return (
          <div className={cellBase} role="gridcell" data-testid={`cell-clientTax-${item.id}`}>
            {formatCurrency(pricingValues.clientTax)}
          </div>
        );
      
      case 'clientPriceIncTax':
        return (
          <div className={`${cellBase} font-medium`} role="gridcell" data-testid={`cell-clientPriceIncTax-${item.id}`}>
            {formatCurrency(pricingValues.clientPriceIncTax)}
          </div>
        );
      
      case 'notes':
        return (
          <div className={`${cellBase} justify-center`} role="gridcell" data-testid={`cell-notes-${item.id}`}>
            <Popover>
              <Tooltip>
                <TooltipTrigger asChild>
                  <PopoverTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className={`h-6 w-6 ${item.notes ? 'text-primary' : 'text-muted-foreground/30'}`}
                      disabled={isLocked}
                      data-testid={`button-notes-${item.id}`}
                    >
                      <FileText className="w-4 h-4" />
                    </Button>
                  </PopoverTrigger>
                </TooltipTrigger>
                {item.notes && (
                  <TooltipContent>
                    <p className="max-w-xs">{`${item.notes.substring(0, 100)}${item.notes.length > 100 ? '...' : ''}`}</p>
                  </TooltipContent>
                )}
              </Tooltip>
              <PopoverContent className="w-96" align="start">
                <div className="space-y-3">
                  <h4 className="font-medium text-sm">Notes - {item.name}</h4>
                  <form onSubmit={(e) => {
                    e.preventDefault();
                    const formData = new FormData(e.currentTarget);
                    const notes = formData.get('notes') as string;
                    updateItemMutation.mutate({
                      itemId: item.id,
                      data: { notes }
                    });
                  }}>
                    <Textarea
                      name="notes"
                      defaultValue={item.notes || ''}
                      placeholder="Enter notes..."
                      rows={6}
                      data-testid={`textarea-notes-${item.id}`}
                    />
                    <div className="flex justify-end space-x-2 mt-3">
                      <Button
                        type="submit"
                        size="sm"
                        data-testid={`button-save-notes-${item.id}`}
                      >
                        Save
                      </Button>
                    </div>
                  </form>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        );
      
      default:
        return <div className={cellBase} role="gridcell" />;
    }
  };

  if (estimateLoading) {
    return (
      <div className="flex h-full flex-col">
        <div className="border-b border-border p-4">
          <div className="flex items-center space-x-4">
            <Button variant="ghost" size="icon" onClick={() => setLocation("/estimates")} aria-label="Back to Estimates">
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div className="h-6 bg-gray-300 rounded w-48 animate-pulse"></div>
          </div>
        </div>
        <div className="flex-1 p-4">
          <div className="animate-pulse space-y-4">
            <div className="h-32 bg-gray-300 rounded"></div>
            <div className="h-64 bg-gray-300 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if ((estimateError || !estimate) && !isNewEstimate) {
    return (
      <div className="flex h-full flex-col">
        <div className="border-b border-border p-4">
          <div className="flex items-center space-x-4">
            <Button variant="ghost" size="icon" onClick={() => setLocation("/estimates")} aria-label="Back to Estimates">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <h2 className="text-xl font-semibold mb-2">Estimate Not Found</h2>
            <p className="text-muted-foreground">
              The estimate you're looking for doesn't exist or has been removed.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Helper function to get status badge
  const getStatusBadge = (estimate: Estimate) => {
    if (estimate.isLocked) {
      return <Badge variant="secondary" className="h-6 px-2 text-xs bg-[#bba7db]/10 text-[#bba7db] border-[#bba7db]/20"><Lock className="w-3 h-3 mr-1" />Locked</Badge>;
    }
    
    // Use field settings for status
    const statusOption = estimateStatuses.find(s => s.key === estimate.status);
    if (statusOption && statusOption.color) {
      return (
        <Badge 
          variant="secondary" 
          className="h-6 px-2 text-xs"
          style={{ 
            backgroundColor: `${statusOption.color}20`,
            color: statusOption.color,
            borderColor: `${statusOption.color}40`
          }}
        >
          {statusOption.name}
        </Badge>
      );
    }
    
    // Fallback
    return <Badge variant="outline" className="h-6 px-2 text-xs">{statusOption?.name || estimate.status || 'Draft'}</Badge>;
  };

  // Handle new estimate creation
  if (isNewEstimate) {
    return (
      <div className="flex h-full flex-col">
        {/* Header */}
        <div className="border-b border-border p-4">
          <div className="flex items-center space-x-4">
            <Button variant="ghost" size="icon" onClick={() => setLocation("/estimates")} aria-label="Back to Estimates">
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <h1 className="text-2xl font-semibold">New Estimate</h1>
          </div>
        </div>

        {/* Creation Form */}
        <div className="flex-1 p-6">
          <div className="max-w-md mx-auto">
            <div className="space-y-6">
              <div>
                <label className="text-sm font-medium mb-2 block">Project</label>
                <p className="text-base font-medium text-muted-foreground">
                  {project?.name || 'Loading project...'}
                </p>
              </div>
              
              <div className="space-y-2">
                <label htmlFor="estimate-name" className="text-sm font-medium block">
                  Estimate Name *
                </label>
                <Input
                  id="estimate-name"
                  placeholder="Enter estimate name..."
                  value={newEstimateName}
                  onChange={(e) => setNewEstimateName(e.target.value)}
                  data-testid="input-new-estimate-name"
                />
              </div>

              <div className="flex space-x-3">
                <Button
                  onClick={handleCreateEstimate}
                  disabled={!newEstimateName.trim() || createEstimateMutation.isPending}
                  data-testid="button-create-estimate"
                >
                  {createEstimateMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4 mr-2" />
                      Create Estimate
                    </>
                  )}
                </Button>
                <Button variant="outline" onClick={() => setLocation("/estimates")} data-testid="button-cancel-create-estimate">
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Unified header card — breadcrumb row + finance summary */}
      <div className="mx-3 mt-3 rounded-lg border border-border bg-card flex-shrink-0 overflow-hidden">

      {/* Row 1 - Breadcrumb + Actions */}
      <div className="h-8 flex items-center justify-between px-3 border-b border-border/50">
        {/* Left: Breadcrumb + Status */}
        <div className="flex items-center gap-2 min-w-0">
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-6 w-6 flex-shrink-0"
            onClick={() => setLocation(`/projects/${project?.id}/estimates`)} 
            data-testid="button-back-to-estimates" 
            aria-label="Back to Estimates"
          >
            <ArrowLeft className="w-3 h-3" />
          </Button>
          <div className="flex items-center gap-1.5 text-xs min-w-0">
            <span className="text-muted-foreground flex-shrink-0">{project?.name || 'Project'}</span>
            <span className="text-muted-foreground flex-shrink-0">/</span>
            {isEditingName ? (
              <Input
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                onKeyDown={handleNameKeyDown}
                onBlur={handleNameSave}
                className="h-6 text-xs font-semibold bg-transparent border-b border-primary p-0 px-1 focus-visible:ring-0 focus-visible:ring-offset-0"
                data-testid="input-estimate-name"
                autoFocus
              />
            ) : (
              <span 
                className="font-semibold cursor-pointer hover:text-[#bba7db] transition-colors truncate" 
                data-testid="text-estimate-title"
                onClick={handleNameEdit}
                title="Click to edit estimate name"
              >
                {estimate?.name || 'Estimate'}
              </span>
            )}
            {estimate && <span className="flex-shrink-0">{getStatusBadge(estimate)}</span>}
          </div>
        </div>

        {/* Right: Notes + Collapse summary + Options popover */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {effectiveEstimateId && (
            <EstimateNotesPopover estimateId={effectiveEstimateId} />
          )}
          {summary && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    className="h-6 w-6 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center justify-center"
                    onClick={() => setIsSummaryExpanded(v => !v)}
                    data-testid="button-toggle-summary"
                  >
                    {isSummaryExpanded
                      ? <ChevronUp className="h-3 w-3" />
                      : <ChevronDown className="h-3 w-3" />}
                  </button>
                </TooltipTrigger>
                <TooltipContent>{isSummaryExpanded ? 'Collapse summary' : 'Expand summary'}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          <Popover>
            <PopoverTrigger asChild>
              <button
                className="h-6 w-6 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center justify-center"
                data-testid="button-estimate-options"
              >
                <SlidersHorizontal className="w-3 h-3" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-3" align="end">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-2">Assignees</p>
              <MultiUserSelect
                value={estimate?.assigneeIds || []}
                onValueChange={(assigneeIds) => updateAssigneesMutation.mutate(assigneeIds)}
                placeholder="Assignees"
                disabled={estimate?.isLocked}
                className="w-full"
                data-testid="select-estimate-assignees"
              />
              <div className="flex items-center justify-between mt-3 mb-1.5">
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Revisions</p>
                {estimate?.isLocked && (
                  <button
                    className="flex items-center gap-1 px-2 h-6 text-[11px] rounded border hover-elevate active-elevate-2 disabled:opacity-40 disabled:cursor-not-allowed"
                    onClick={() => createVersionMutation.mutate()}
                    disabled={createVersionMutation.isPending}
                    data-testid="button-new-revision"
                    title="Create new revision from current"
                  >
                    <Plus className="w-3 h-3" />
                    New
                  </button>
                )}
              </div>
              <div className="rounded-md border overflow-hidden">
                {estimateVersions.map(v => {
                  const isContract = v.id === project?.selectedEstimateId;
                  const isCurrent = v.id === effectiveEstimateId;
                  const isRenaming = renamingRevisionId === v.id;
                  return (
                    <div key={v.id} className={`flex items-center group/rev border-b last:border-b-0 ${isCurrent ? 'bg-accent/50' : ''}`}>
                      {isRenaming ? (
                        <form
                          className="flex-1 flex items-center gap-1 px-2 h-8"
                          onSubmit={(e) => {
                            e.preventDefault();
                            if (renameValue.trim()) {
                              renameRevisionMutation.mutate({ id: v.id, name: renameValue.trim() });
                            }
                            setRenamingRevisionId(null);
                          }}
                        >
                          <input
                            autoFocus
                            value={renameValue}
                            onChange={e => setRenameValue(e.target.value)}
                            className="flex-1 text-xs bg-background border rounded px-1.5 py-0.5 outline-none focus:ring-1 focus:ring-[#bba7db]"
                            onBlur={() => setRenamingRevisionId(null)}
                            onKeyDown={e => e.key === 'Escape' && setRenamingRevisionId(null)}
                          />
                          <button type="submit" className="text-[#bba7db]"><Check className="h-3 w-3" /></button>
                        </form>
                      ) : (
                        <button
                          className="flex-1 flex items-center gap-1.5 px-2 h-8 text-xs text-left min-w-0 hover-elevate"
                          onClick={() => setLocation(`/projects/${v.projectId}/estimates/${v.id}`)}
                          data-testid={`revision-item-${v.id}`}
                        >
                          <Layers className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                          <span className="truncate flex-1">{getRevLabel(v.version)}{v.name && v.name !== estimate?.name ? ` — ${v.name}` : ''}</span>
                          {isContract && <Badge className="text-[9px] px-1 h-4 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 no-default-active-elevate">Contract</Badge>}
                          {!isContract && v.isLocked && <Lock className="h-2.5 w-2.5 text-muted-foreground/50 flex-shrink-0" />}
                          {!v.isLocked && isCurrent && <span className="text-[9px] text-[#bba7db] flex-shrink-0">working</span>}
                        </button>
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 invisible group-hover/rev:visible flex-shrink-0 mr-0.5"
                            data-testid={`button-revision-menu-${v.id}`}
                          >
                            <MoreHorizontal className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem
                            onClick={() => { setRenamingRevisionId(v.id); setRenameValue(v.name || getRevLabel(v.version)); }}
                            data-testid={`revision-rename-${v.id}`}
                          >
                            <Pencil className="w-3.5 h-3.5 mr-2" />
                            Rename
                          </DropdownMenuItem>
                          {v.isLocked && (
                            <DropdownMenuItem
                              onClick={() => setAsWorkingMutation.mutate(v.id)}
                              data-testid={`revision-set-working-${v.id}`}
                            >
                              <LockOpen className="w-3.5 h-3.5 mr-2" />
                              Set as Working
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            onClick={() => setAsContractMutation.mutate(v.id)}
                            data-testid={`revision-set-contract-${v.id}`}
                          >
                            {isContract
                              ? <Check className="w-3.5 h-3.5 mr-2 text-emerald-500" />
                              : <Check className="w-3.5 h-3.5 mr-2 opacity-0" />
                            }
                            Set as Contract
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => createVersionMutation.mutate(v.id)}
                            data-testid={`revision-duplicate-${v.id}`}
                          >
                            <Copy className="w-3.5 h-3.5 mr-2" />
                            Duplicate
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => {
                              if (estimateVersions.length <= 1) return;
                              if (!confirm(`Delete ${getRevLabel(v.version)}? This cannot be undone.`)) return;
                              deleteRevisionMutation.mutate(v.id);
                            }}
                            disabled={estimateVersions.length <= 1}
                            className="text-destructive focus:text-destructive"
                            data-testid={`revision-delete-${v.id}`}
                          >
                            <Trash2 className="w-3.5 h-3.5 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  );
                })}
              </div>
              <Separator className="my-3" />
              <div className="flex flex-col gap-0.5">
                <button
                  className="flex items-center gap-2 px-2 py-1.5 text-xs rounded-md hover-elevate w-full text-left"
                  onClick={handleOpenEditEstimateDialog}
                  data-testid="button-edit-estimate"
                >
                  <Edit className="w-3.5 h-3.5 text-muted-foreground" />
                  Edit estimate details
                </button>
                <button
                  className="flex items-center gap-2 px-2 py-1.5 text-xs rounded-md hover-elevate w-full text-left"
                  onClick={handleToggleLock}
                  data-testid="button-toggle-lock"
                >
                  {estimate?.isLocked
                    ? <Lock className="w-3.5 h-3.5 text-muted-foreground" />
                    : <LockOpen className="w-3.5 h-3.5 text-muted-foreground" />}
                  {estimate?.isLocked ? 'Unlock estimate' : 'Lock estimate'}
                </button>
                <button
                  className="flex items-center gap-2 px-2 py-1.5 text-xs rounded-md hover-elevate w-full text-left disabled:opacity-40 disabled:cursor-not-allowed"
                  onClick={() => setIsImportOpen(true)}
                  disabled={estimate?.isLocked}
                  data-testid="button-import-estimate"
                >
                  <Upload className="w-3.5 h-3.5 text-muted-foreground" />
                  Import items
                </button>
                <button
                  className="flex items-center gap-2 px-2 py-1.5 text-xs rounded-md hover-elevate w-full text-left disabled:opacity-40 disabled:cursor-not-allowed"
                  onClick={() => setIsTemplatePickerOpen(true)}
                  disabled={estimate?.isLocked}
                  data-testid="button-load-template"
                >
                  <LayoutTemplate className="w-3.5 h-3.5 text-muted-foreground" />
                  Load from template
                </button>
                <button
                  className="flex items-center gap-2 px-2 py-1.5 text-xs rounded-md hover-elevate w-full text-left disabled:opacity-40 disabled:cursor-not-allowed"
                  onClick={() => setIsCatalogOpen(true)}
                  disabled={estimate?.isLocked}
                  data-testid="button-open-catalog"
                >
                  <Package className="w-3.5 h-3.5 text-muted-foreground" />
                  Browse catalog
                </button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Finance summary — collapsible */}
      {summary && !isSummaryExpanded && (
        <div className="bg-[#bba7db]/10 flex items-center justify-between px-5 py-1.5 border-b border-[#bba7db]/20">
          <span className="text-[11px] text-muted-foreground uppercase tracking-wide font-medium">Summary</span>
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-bold tabular-nums text-[#bba7db]">{formatCurrency(summary.total)}</span>
            <span className="text-[11px] text-muted-foreground">inc. GST</span>
          </div>
        </div>
      )}
      {summary && isSummaryExpanded && (
        <div className="bg-[#bba7db]/10 flex items-center px-5 py-3 gap-6 flex-wrap">

          {/* Hard left — breakdown: builder cost, line markup, global markup (ledger-aligned) */}
          <div className="flex flex-col gap-0.5 text-xs min-w-[220px]">
            <div className="flex items-baseline justify-between gap-4">
              <span className="text-muted-foreground">Builder Cost</span>
              <span className="tabular-nums font-medium text-right" data-testid="text-builder-cost-subtotal">
                {formatCurrency((summary as any).builderCostTotal ?? summary.subtotal)}
              </span>
            </div>
            {((summary as any).lineItemMarkupAmount ?? 0) !== 0 && (
              <div className="flex items-baseline justify-between gap-4">
                <span className="text-muted-foreground">Markup</span>
                <span className="tabular-nums font-medium text-right" data-testid="text-line-item-markup">
                  {formatCurrency((summary as any).lineItemMarkupAmount ?? 0)}
                </span>
              </div>
            )}
            <div className="flex items-baseline justify-between gap-4">
              <span className="text-muted-foreground flex items-baseline gap-1">
                Builder Margin
                {isEditingMarkup ? (
                  <Input
                    value={editingMarkup}
                    onChange={(e) => setEditingMarkup(e.target.value)}
                    onKeyDown={handleMarkupKeyDown}
                    onBlur={handleMarkupSave}
                    className="inline-block w-12 h-5 text-xs bg-transparent border-b border-primary p-0 px-1 focus-visible:ring-0 focus-visible:ring-offset-0"
                    data-testid="input-markup-percentage"
                    autoFocus
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                  />
                ) : (
                  <span
                    className="text-[#bba7db] underline underline-offset-2 decoration-dotted cursor-pointer hover:opacity-80 transition-opacity font-medium"
                    onClick={handleMarkupEdit}
                    title="Click to edit builder margin %"
                    data-testid="text-markup-percentage"
                  >
                    {estimate?.projectMarkupPercent || 0}%<Pencil className="w-2.5 h-2.5 inline ml-0.5 mb-0.5 opacity-60" />
                  </span>
                )}
              </span>
              <span className="tabular-nums font-medium text-right" data-testid="text-global-markup">
                {formatCurrency((summary as any).globalMarkupAmount ?? summary.markupAmount)}
              </span>
            </div>
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Pre-totals: ex-tax and inc-tax stacked, to the left of the big total */}
          <div className="flex flex-col gap-0.5 text-xs items-end">
            <div className="flex items-baseline gap-1.5">
              <span className="text-muted-foreground">Ex-tax</span>
              <span className="text-muted-foreground/40">·</span>
              <span className="tabular-nums font-medium" data-testid="text-total-ex-tax">
                {formatCurrency((summary as any).totalExTax ?? summary.subtotalWithMarkup)}
              </span>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-muted-foreground">GST ({estimate?.taxRate || 10}%)</span>
              <span className="text-muted-foreground/40">·</span>
              <span className="tabular-nums font-medium" data-testid="text-tax">
                {formatCurrency(summary.taxAmount)}
              </span>
            </div>
          </div>

          {/* Divider */}
          <div className="w-px self-stretch bg-[#bba7db]/30" />

          {/* Far right — big total */}
          <div className="flex flex-col items-end">
            <span className="text-2xl font-bold tabular-nums leading-tight" data-testid="text-total-inc-tax">
              {formatCurrency(summary.total)}
            </span>
            <span className="text-[11px] text-muted-foreground mt-0.5">Total (inc. GST)</span>
          </div>

        </div>
      )}

      </div>{/* end header card */}

      {/* Main Content — outer card stays fixed, only table content scrolls horizontally */}
      <div className="flex-1 min-h-0 mx-3 mt-2 mb-4 border border-border rounded-md overflow-hidden flex flex-col">

        {/* Tab navigation */}
        <div className="flex items-center border-b border-border/50 bg-background flex-shrink-0 px-3 gap-0">
          {(['estimate', 'enotes', 'labour'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setEstimateTab(tab)}
              className={`h-8 px-4 text-xs font-medium border-b-2 transition-colors ${
                estimateTab === tab
                  ? 'border-[#bba7db] text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab === 'estimate' ? 'Estimate' : tab === 'enotes' ? 'E-Notes' : 'Labour'}
            </button>
          ))}
          {/* Spacer + E-Notes progress bar + Checklist bar */}
          <div className="flex-1" />
          {estimateTab === 'enotes' && enotesStats.length > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground px-2">
              <span className="tabular-nums">{enotesStats.filter((r: any) => r.completed).length}/{enotesStats.length}</span>
              <div className="w-20 bg-muted rounded-full h-1.5 overflow-hidden">
                <div className="bg-[#bba7db] h-full rounded-full transition-all"
                  style={{ width: `${(enotesStats.filter((r: any) => r.completed).length / enotesStats.length) * 100}%` }} />
              </div>
              <span className="text-[10px]">reviewed</span>
            </div>
          )}
          {effectiveEstimateId && project?.id && (
            <EstimateChecklistPopover estimateId={effectiveEstimateId} projectId={project.id} wide />
          )}
        </div>

        <div className={estimateTab !== 'enotes' ? 'hidden' : 'flex-1 flex flex-col min-h-0'}>
          {effectiveEstimateId && !isNewEstimate ? (
            <EstimateEnotes estimateId={effectiveEstimateId} />
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">Save the estimate first to access E-Notes.</div>
          )}
        </div>

        <div className={estimateTab !== 'labour' ? 'hidden' : 'flex-1 flex flex-col min-h-0'}>
          {project?.id ? (
            <LabourEstimatePanel projectId={project.id} />
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">Loading project…</div>
          )}
        </div>

        <div className={estimateTab !== 'estimate' ? 'hidden' : 'flex-1 flex flex-col min-h-0'}>

        {/* Toolbar row — does NOT scroll horizontally */}
        <div className="h-9 flex items-center justify-between px-3 border-b border-border/50 gap-1.5 bg-background flex-shrink-0">
              {/* Left: Controls + Filter Chips */}
              <div className="flex items-center gap-1.5 flex-1">
                {/* Group Expand/Collapse - Icon only */}
                {groups.length > 0 && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          className="h-6 w-6 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center justify-center"
                          onClick={handleToggleAllGroups}
                          data-testid="button-toggle-all-groups"
                        >
                          {groups.some(group => !group.isCollapsed) ? (
                            <ChevronUp className="h-3 w-3" />
                          ) : (
                            <ChevronDown className="h-3 w-3" />
                          )}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>{groups.some(group => !group.isCollapsed) ? 'Collapse all groups' : 'Expand all groups'}</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
                
                {/* Hide/Show Add Lines toggle */}
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        className={`h-6 w-6 text-xs border rounded-md flex items-center justify-center ${hideAddLines ? 'bg-muted' : ''} hover-elevate active-elevate-2`}
                        onClick={() => setHideAddLines(!hideAddLines)}
                        data-testid="button-toggle-add-lines"
                      >
                        {hideAddLines ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>{hideAddLines ? 'Show add line rows' : 'Hide add line rows'}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                {/* Search Input */}
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                  <Input
                    placeholder="Search items..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-6 pl-7 pr-2 text-xs w-40 border-border/30"
                    data-testid="input-search-items"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-4 w-4 flex items-center justify-center text-muted-foreground hover:text-foreground"
                      data-testid="button-clear-search"
                    >
                      ×
                    </button>
                  )}
                </div>
                
                {/* Filter by Type */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button 
                      className={`h-6 w-auto px-2 text-xs border rounded-md ${
                        filterType !== 'all' 
                          ? 'bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90' 
                          : 'hover-elevate'
                      } active-elevate-2`}
                      data-testid="filter-type"
                    >
                      <span>{filterType === 'all' ? 'All Types' : filterType}</span>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem onClick={() => { hasUserModifiedRef.current = true; setFilterType('all'); }}>All Types</DropdownMenuItem>
                    {Array.from(new Set(items.map(item => item.type))).map(type => (
                      <DropdownMenuItem key={type} onClick={() => { hasUserModifiedRef.current = true; setFilterType(type); }}>{type}</DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Filter by Status */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button 
                      className={`h-6 w-auto px-2 text-xs border rounded-md ${
                        filterStatus !== 'all' 
                          ? 'bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90' 
                          : 'hover-elevate'
                      } active-elevate-2`}
                      data-testid="filter-status"
                    >
                      <span>{filterStatus === 'all' ? 'All Status' : estimateItemStatusCategory?.options?.find((opt: any) => opt.key === filterStatus)?.name || filterStatus}</span>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem onClick={() => { hasUserModifiedRef.current = true; setFilterStatus('all'); }}>All Status</DropdownMenuItem>
                    {estimateItemStatusCategory?.options?.filter((opt: any) => opt.isActive).map((option: any) => (
                      <DropdownMenuItem key={option.key} onClick={() => { hasUserModifiedRef.current = true; setFilterStatus(option.key); }}>{option.name}</DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Right: Controls */}
              <div className="flex items-center gap-1.5">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className="h-6 w-6 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center justify-center"
                      data-testid="button-column-visibility"
                    >
                      <Columns className="w-3 h-3" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-72">
                    <div className="px-2 py-1.5 text-sm font-semibold">Columns (visibility & order)</div>
                    {columns.map((column, index) => (
                      <DropdownMenuItem 
                        key={column.id}
                        onClick={(e) => e.preventDefault()}
                        className="flex items-center justify-between gap-2"
                      >
                        <div className="flex items-center flex-1 min-w-0">
                          <Checkbox
                            checked={column.visible}
                            onCheckedChange={() => toggleColumn(column.id)}
                            className="mr-2 flex-shrink-0"
                          />
                          <span className="truncate">{column.label}</span>
                        </div>
                        <div className="flex items-center gap-0.5 flex-shrink-0">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              moveColumnUp(column.id);
                            }}
                            disabled={index === 0}
                            className={`p-0.5 rounded hover:bg-muted ${index === 0 ? 'opacity-30 cursor-not-allowed' : ''}`}
                            data-testid={`button-move-column-up-${column.id}`}
                          >
                            <ChevronUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              moveColumnDown(column.id);
                            }}
                            disabled={index === columns.length - 1}
                            className={`p-0.5 rounded hover:bg-muted ${index === columns.length - 1 ? 'opacity-30 cursor-not-allowed' : ''}`}
                            data-testid={`button-move-column-down-${column.id}`}
                          >
                            <ChevronDown className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                <button 
                  className="h-6 w-auto px-2 text-xs border rounded-md hover-elevate active-elevate-2 flex items-center gap-0.5"
                  data-testid="button-add-group" 
                  onClick={handleAddGroup}
                  disabled={estimate?.isLocked}
                >
                  <FolderPlus className="w-3 h-3" />
                  <span>Group</span>
                </button>

                <button 
                  className="h-6 w-auto px-2 text-xs bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90 active-elevate-2 flex items-center gap-0.5 rounded-md"
                  data-testid="button-add-item" 
                  onClick={handleAddItem}
                  disabled={estimate?.isLocked}
                >
                  <Plus className="w-3 h-3" />
                  <span>New Item</span>
                </button>
              </div>
        </div>
        {/* Scrollable content area — only this scrolls horizontally */}
        <div className="flex-1 overflow-auto min-h-0">
          <div className="inline-block min-w-full">
            <div className="bg-background">
              {itemsLoading || groupsLoading ? (
                  <div className="animate-pulse space-y-3">
                    {[...Array(3)].map((_, i) => (
                      <div key={i} className="h-32 bg-gray-300 rounded-lg"></div>
                    ))}
                  </div>
                ) : items.length === 0 && groups.length === 0 ? (
                  <div className="text-center py-8">
                    <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-medium mb-2">No items or groups added yet</h3>
                    <p className="text-muted-foreground mb-4">
                      Add a group to organize items, or add items directly.
                    </p>
                    <div className="flex items-center justify-center gap-2">
                      <Button 
                        data-testid="button-add-first-group" 
                        onClick={handleAddGroup}
                        disabled={estimate?.isLocked}
                        variant={estimate?.isLocked ? "secondary" : "outline"}
                      >
                        <FolderPlus className="w-4 h-4 mr-2" />
                        Add Group
                      </Button>
                      <Button 
                        data-testid="button-add-first-item" 
                        onClick={handleAddItem}
                        disabled={estimate?.isLocked}
                        variant={estimate?.isLocked ? "secondary" : "default"}
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Add Item
                      </Button>
                      <Button 
                        data-testid="button-import-items" 
                        onClick={() => setIsImportOpen(true)}
                        disabled={estimate?.isLocked}
                        variant={estimate?.isLocked ? "secondary" : "outline"}
                      >
                        <Upload className="w-4 h-4 mr-2" />
                        Import Items
                      </Button>
                      <Button 
                        data-testid="button-load-template-empty" 
                        onClick={() => setIsTemplatePickerOpen(true)}
                        disabled={estimate?.isLocked}
                        variant={estimate?.isLocked ? "secondary" : "outline"}
                      >
                        <LayoutTemplate className="w-4 h-4 mr-2" />
                        Load Template
                      </Button>
                      <Button 
                        data-testid="button-open-catalog" 
                        onClick={() => setIsCatalogOpen(true)}
                        disabled={estimate?.isLocked}
                        variant={estimate?.isLocked ? "secondary" : "outline"}
                      >
                        <Package className="w-4 h-4 mr-2" />
                        Catalog
                      </Button>
                    </div>
                  </div>
                ) : (
                  <DndContext 
                    sensors={sensors} 
                    collisionDetection={closestCenter} 
                    onDragStart={handleDragStart} 
                    onDragMove={handleDragMove} 
                    onDragEnd={handleDragEnd} 
                    onDragCancel={handleDragCancel}
                    measuring={{
                      droppable: {
                        strategy: MeasuringStrategy.BeforeDragging,
                      },
                    }}
                  >
                    <div className="space-y-4">
{(() => {
                      const { sortedGroups, subgroupsByParent, groupedItems, ungroupedItems } = organizeItemsByGroups();
                      
                      // Create sortable IDs: group IDs prefixed with "group-" and item IDs (including sub-items)
                      const groupIds = sortedGroups.map(g => `group-${g.id}`);
                      // Add subgroup IDs to sortable context
                      const subgroupIds: string[] = [];
                      Object.values(subgroupsByParent).forEach(subgroups => {
                        subgroupIds.push(...subgroups.map(sg => `group-${sg.id}`));
                      });
                      const expandedGroupIds = new Set(groups.filter(g => !g.isCollapsed).map(g => g.id));
                      const allItemIds = [...ungroupedItems.map(i => i.id)];
                      Object.entries(groupedItems).forEach(([groupId, groupItems]) => {
                        if (expandedGroupIds.has(groupId)) {
                          allItemIds.push(...groupItems.map(i => i.id));
                        }
                      });
                      
                      // Add sub-item IDs only from expanded groups (prevents dnd-kit from tracking hidden nodes)
                      items.filter(item => item.parentItemId && (!item.groupId || expandedGroupIds.has(item.groupId))).forEach(subItem => {
                        allItemIds.push(subItem.id);
                      });
                      
                      // Keep SortableContext items stable throughout the entire drag lifecycle.
                      // Changing this list mid-drag causes dnd-kit to lose its `over` state,
                      // which prevents handleDragEnd from receiving a valid drop target.
                      // Item-vs-group interference is handled in SortableRow/EstimateGroupCard
                      // by skipping transforms based on activeDragId.
                      const allSortableIds = [...groupIds, ...subgroupIds, ...allItemIds];
                      
                      const tableWidth = columns.filter(col => col.visible).reduce((sum, col) => sum + col.widthPx, 0) + 80 + 24;
                      
                      // Generate CSS Grid template (no 32px handle column — handle floats in dead zone)
                      const visibleCols = columns.filter(col => col.visible);
                      const gridTemplate = `24px ${visibleCols.map(c => `${c.widthPx}px`).join(' ')} 80px`;
                      
                      // Get all subgroups for passing to EstimateGroupCard
                      const allSubgroups = groups.filter(g => g.parentGroupId);
                      
                      return (
                        <div style={{ minWidth: `${tableWidth}px` }}>
                        <SortableContext items={allSortableIds} strategy={verticalListSortingStrategy}>
                          {/* CSS Grid Header */}
                          <div 
                            className="bg-muted border-b border-border sticky top-0 z-[10] pl-px"
                            role="row"
                            style={{ 
                              display: 'grid', 
                              gridTemplateColumns: gridTemplate,
                              width: `${tableWidth}px`,
                              minWidth: `${tableWidth}px`
                            }}
                          >
                            {/* Checkbox column */}
                            <div className="h-9 px-2 flex items-center" role="columnheader">
                              <Checkbox
                                checked={selectedItems.size > 0 && selectedItems.size === items.length}
                                onCheckedChange={handleSelectAll}
                                aria-label="Select all items"
                                data-testid="checkbox-select-all"
                                disabled={estimate?.isLocked}
                              />
                            </div>
                            {/* Dynamic columns with resize handles */}
                            {visibleCols.map((column, index) => (
                              <div 
                                key={column.id}
                                role="columnheader"
                                className="h-9 px-2 flex items-center relative group/header"
                              >
                                <span className="truncate text-xs font-medium text-muted-foreground uppercase tracking-wide">{column.label}</span>
                                {/* Resize handle - hidden on last column and on mobile */}
                                {index < visibleCols.length - 1 && (
                                  <div
                                    className={`hidden md:block absolute right-0 top-0 h-full w-1 cursor-col-resize transition-all z-10 ${
                                      resizingColumn === column.id 
                                        ? 'opacity-100 bg-[#bba7db] w-[3px]' 
                                        : 'opacity-0 group-hover/header:opacity-100 hover:bg-[#bba7db] bg-gray-300'
                                    }`}
                                    style={{ pointerEvents: 'auto', touchAction: 'none' }}
                                    onMouseDown={(e) => handleResizeStart(e, column.id)}
                                    data-testid={`resize-handle-${column.id}`}
                                  />
                                )}
                              </div>
                            ))}
                            {/* Actions column */}
                            <div className="h-9 px-2 flex items-center" role="columnheader">
                              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Actions</span>
                            </div>
                          </div>
                          
                          <div className="space-y-2 py-2">
                            {/* Ungrouped items - CSS Grid based */}
                            {ungroupedItems.length > 0 && (
                              <Card className="rounded-md overflow-hidden" style={{ minWidth: `${tableWidth}px` }}>
                                <div role="grid" style={{ width: `${tableWidth}px`, minWidth: `${tableWidth}px` }}>
                                  {ungroupedItems.map((item) => renderItemWithSubItems(item, undefined, gridTemplate, visibleCols))}
                                </div>
                              </Card>
                            )}
                            
                            {/* Grouped items using EstimateGroupCard */}
                            {sortedGroups.map((group, groupIndex) => {
                              const groupDropIndicator = dropTarget?.id === `group-${group.id}` ? dropTarget.position : undefined;
                              return (
                                <EstimateGroupCard
                                  key={`group-${group.id}`}
                                  group={group}
                                  groupedItems={groupedItems}
                                  columns={columns}
                                  tableWidth={tableWidth}
                                  gridTemplate={gridTemplate}
                                  visibleCols={visibleCols}
                                  handleToggleGroupCollapse={handleToggleGroupCollapse}
                                  renderItemRow={renderItemWithSubItems}
                                  onDeleteGroup={(groupId) => {
                                    setGroupToDelete(groupId);
                                    setIsDeleteGroupDialogOpen(true);
                                  }}
                                  onEditGroup={handleEditGroup}
                                  onDuplicateGroup={handleDuplicateGroup}
                                  onCopyGroup={handleCopyGroup}
                                  onAddSubgroup={handleAddSubgroup}
                                  onAddItemToGroup={handleAddItemToGroup}
                                  onInlineAddItem={handleInlineAddItem}
                                  isLocked={estimate?.isLocked || false}
                                  selectedItems={selectedItems}
                                  selectedGroups={selectedGroups}
                                  onToggleGroupSelection={handleToggleGroupSelection}
                                  nestingLevel={0}
                                  groupTotals={groupTotalsMap[group.id]}
                                  formatCurrency={formatCurrency}
                                  subgroups={allSubgroups}
                                  allGroups={groups}
                                  onCreateFrom={() => toast({ title: "Create from Group", description: "Coming soon" })}
                                  activeDragId={activeId}
                                  hideAddLines={hideAddLines}
                                  groupIndex={groupIndex}
                                  onApplyCostCode={(groupId) => applyGroupCostCodeMutation.mutate(groupId)}
                                  costCodes={costCodes}
                                  costCategories={costCategories}
                                  dropIndicator={groupDropIndicator}
                                />
                              );
                            })}
                          </div>
                        </SortableContext>
                        </div>
                      );
                    })()}
                  </div>
                </DndContext>
              )}
            </div>{/* end table card */}
          </div>
        </div>
        </div>
      </div>

      {/* Quick Totals Footer - Fixed at bottom outside scroll area */}
      <div className="h-10 bg-muted/30 border-t border-border flex items-center justify-end px-4 gap-5 text-xs flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground uppercase tracking-wide font-medium">Builder Cost</span>
          <span className="tabular-nums font-medium">{formatCurrency((summary as any)?.builderCostTotal ?? summary?.subtotal ?? 0)}</span>
        </div>
        {((summary as any)?.globalMarkupAmount ?? 0) !== 0 && (
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-muted-foreground uppercase tracking-wide font-medium">Builder Margin</span>
            <span className="tabular-nums font-medium">{formatCurrency((summary as any)?.globalMarkupAmount ?? 0)}</span>
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground uppercase tracking-wide font-medium">Subtotal</span>
          <span className="tabular-nums font-medium">{formatCurrency((summary as any)?.totalExTax ?? summary?.subtotalWithMarkup ?? 0)}</span>
        </div>
        <div className="w-px self-stretch bg-border/60 my-2" />
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground uppercase tracking-wide font-medium">Total</span>
          <span className="tabular-nums font-semibold text-[#bba7db]">{formatCurrency(summary?.total || 0)}</span>
        </div>
      </div>

      {/* Add Item Dialog */}
      <Dialog open={isAddItemOpen} onOpenChange={setIsAddItemOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 rounded-xl">
          <DialogHeader className="px-6 pt-6 pb-0">
            <DialogTitle>Add Estimate Item</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmitItem)} className="flex flex-col flex-1 min-h-0">
              <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Item Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Premium Kitchen Cabinets" {...field} data-testid="input-item-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description (Optional)</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Additional details about this item..." {...field} value={field.value || ""} data-testid="input-item-description" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="groupId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Group (Optional)</FormLabel>
                      <Select 
                        onValueChange={(value) => field.onChange(value === "none" ? undefined : value)} 
                        value={field.value || "none"}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-item-group">
                            <SelectValue placeholder="None" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">None (ungrouped)</SelectItem>
                          {groups.map((group) => (
                            <SelectItem key={group.id} value={group.id}>
                              {group.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="costCode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cost Code (Optional)</FormLabel>
                      <FormControl>
                        <CostCodeSelect
                          value={field.value || ''}
                          onValueChange={(value) => {
                            field.onChange(value || undefined);
                            if (value) {
                              const code = costCodes.find(c => c.id === value);
                              if (code?.categoryId && !form.getValues('costCategoryId')) {
                                form.setValue('costCategoryId' as any, code.categoryId);
                              }
                            }
                          }}
                          placeholder="None"
                          data-testid="select-item-costcode"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name={"costCategoryId" as any}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category (Optional)</FormLabel>
                    <Select
                      value={field.value || 'none'}
                      onValueChange={(v) => field.onChange(v === 'none' ? undefined : v)}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="select-item-category">
                          <SelectValue placeholder="None" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {costCategories.map(cat => (
                          <SelectItem key={cat.id} value={cat.id}>{cat.code} - {cat.title}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Type</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-item-type">
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="material">Material</SelectItem>
                          <SelectItem value="labour">Labour</SelectItem>
                          <SelectItem value="equipment">Equipment</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-item-status">
                            <SelectValue placeholder="Select status" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {estimateItemStatusCategory?.options?.filter((opt: any) => opt.isActive).map((option: any) => (
                            <SelectItem key={option.key} value={option.key}>
                              {option.name}
                            </SelectItem>
                          )) || (
                            <>
                              <SelectItem value="pending">Pending</SelectItem>
                              <SelectItem value="quoted">Quoted</SelectItem>
                              <SelectItem value="confirmed">Confirmed</SelectItem>
                            </>
                          )}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Labour Hours Tracking - Only for Labour items */}
              {form.watch("type") === "labour" && (
                <FormField
                  control={form.control}
                  name="trackLabourHours"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                      <FormControl>
                        <Checkbox
                          checked={field.value || false}
                          onCheckedChange={field.onChange}
                          data-testid="checkbox-track-labour-hours"
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel className="cursor-pointer">
                          Track labour hours for this item
                        </FormLabel>
                        <p className="text-sm text-muted-foreground">
                          Include this item in the labour hours budget tracking system
                        </p>
                      </div>
                    </FormItem>
                  )}
                />
              )}

              <Separator className="my-4" />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="quantity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Quantity</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          step="0.01" 
                          min="0.01"
                          placeholder="1"
                          {...field}
                          onChange={(e) => {
                            const qty = parseFloat(e.target.value) || 0;
                            const rounded = Math.round(qty * 100) / 100;
                            field.onChange(rounded);
                          }}
                          data-testid="input-item-quantity"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="unitType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Unit</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-item-unit">
                            <SelectValue placeholder="Unit" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {estimateItemUnitCategory?.options
                            ?.filter(opt => opt.isActive)
                            .sort((a, b) => a.sortOrder - b.sortOrder)
                            .map(option => (
                              <SelectItem key={option.id} value={option.name}>
                                {option.name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Pricing Section */}
              <div className="space-y-4">
                <h4 className="text-sm font-medium">Pricing <span className="text-muted-foreground font-normal">GST on expenses</span></h4>
                
                <div className="grid grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="unitCostExTax"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Unit cost ex. tax *</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                            <Input 
                              type="number" 
                              step="0.001" 
                              min="0"
                              placeholder="Unit cost ex. tax"
                              className="pl-6 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              value={field.value === 0 ? '' : field.value}
                              onChange={(e) => {
                                const value = e.target.value;
                                if (value === '') {
                                  field.onChange(0);
                                } else {
                                  const cost = parseFloat(value) || 0;
                                  const rounded = Math.round(cost * 1000) / 1000;
                                  field.onChange(rounded);
                                }
                              }}
                              onBlur={field.onBlur}
                              name={field.name}
                              ref={field.ref}
                              data-testid="input-item-builder-cost"
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div>
                    <label className="text-sm font-medium mb-2 block">Unit tax</label>
                    <div className="h-9 flex items-center px-3 text-sm text-muted-foreground">
                      ${(() => {
                        const unitCost = form.watch("unitCostExTax") || 0;
                        const taxRate = estimate?.taxRate ?? 10;
                        const tax = Math.round(unitCost * taxRate / 100 * 1000) / 1000;
                        return parseFloat(tax.toFixed(3)).toString();
                      })()}
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium mb-2 block">Unit cost inc. tax *</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                      <Input 
                        type="number" 
                        step="0.001" 
                        min="0"
                        placeholder="Unit cost inc. tax"
                        className="pl-6 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        value={(() => {
                          const unitCost = form.watch("unitCostExTax") || 0;
                          const taxRate = estimate?.taxRate ?? 10;
                          const incTax = Math.round(unitCost * (1 + taxRate / 100) * 1000) / 1000;
                          return incTax === 0 ? '' : parseFloat(incTax.toFixed(3)).toString();
                        })()}
                        onChange={(e) => {
                          const value = e.target.value;
                          if (value === '') {
                            form.setValue("unitCostExTax", 0);
                          } else {
                            const taxRate = estimate?.taxRate ?? 10;
                            const incTax = parseFloat(value) || 0;
                            const exTax = Math.round(incTax / (1 + taxRate / 100) * 1000) / 1000;
                            form.setValue("unitCostExTax", exTax);
                          }
                        }}
                        data-testid="input-item-unit-cost-inc-tax"
                      />
                    </div>
                  </div>
                </div>

                <FormField
                  control={form.control}
                  name="markupPercent"
                  render={({ field }) => (
                    <FormItem className="max-w-[200px]">
                      <FormLabel>Markup</FormLabel>
                      <div className="flex gap-2">
                        <FormControl>
                          <Input 
                            type="number" 
                            step="0.1" 
                            min="0"
                            placeholder="20"
                            className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            {...field}
                            value={field.value ?? ''}
                            onChange={(e) => {
                              const value = e.target.value;
                              field.onChange(value === '' ? undefined : parseFloat(value) || 0);
                            }}
                            data-testid="input-item-markup"
                          />
                        </FormControl>
                        <span className="flex items-center text-sm text-muted-foreground">%</span>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <Separator className="my-4" />

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Internal Notes (Optional)</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Internal notes for the team..." {...field} value={field.value || ""} data-testid="input-item-notes" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="allowance"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Allowance</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-item-allowance">
                          <SelectValue placeholder="Select allowance type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="None">None</SelectItem>
                        <SelectItem value="Prime Cost">Prime Cost</SelectItem>
                        <SelectItem value="Provisional Sum">Provisional Sum</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="attachmentUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Attachment URL (Optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="https://..." {...field} value={field.value || ""} data-testid="input-item-attachment" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="requestForQuote"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                      <FormControl>
                        <input
                          type="checkbox"
                          checked={field.value}
                          onChange={(e) => field.onChange(e.target.checked)}
                          className="h-4 w-4 mt-1"
                          data-testid="checkbox-request-for-quote"
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel>Request for Quote</FormLabel>
                      </div>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="isSelection"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                      <FormControl>
                        <input
                          type="checkbox"
                          checked={field.value}
                          onChange={(e) => field.onChange(e.target.checked)}
                          className="h-4 w-4 mt-1"
                          data-testid="checkbox-is-selection"
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel>Link to Selections</FormLabel>
                      </div>
                    </FormItem>
                  )}
                />
              </div>

              <Separator className="my-4" />

              <div className="space-y-4">
                <h4 className="text-sm font-medium">Proposal Settings</h4>
                
                <FormField
                  control={form.control}
                  name="proposalVisible"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                      <FormControl>
                        <input
                          type="checkbox"
                          checked={field.value}
                          onChange={(e) => field.onChange(e.target.checked)}
                          className="h-4 w-4 mt-1"
                          data-testid="checkbox-visible-in-proposal"
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel>Show in client proposal</FormLabel>
                      </div>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="shownAs"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Show as in proposal</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value || undefined}>
                        <FormControl>
                          <SelectTrigger data-testid="select-show-as-in-proposal">
                            <SelectValue placeholder="Select display format" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="empty">Empty (no price)</SelectItem>
                          <SelectItem value="price">Show price</SelectItem>
                          <SelectItem value="included">Included</SelectItem>
                          <SelectItem value="excluded">Excluded</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              </div>

              {/* Price Summary Footer - Fixed at bottom */}
              <div className="border-t bg-muted/30 p-6 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="text-sm font-medium mb-2">Description</h4>
                    <div className="flex gap-6 text-sm text-muted-foreground">
                      <span>Cost ex. tax ${(() => {
                        const qty = form.watch("quantity") || 0;
                        const unitCost = form.watch("unitCostExTax") || 0;
                        const total = qty * unitCost;
                        return total.toFixed(2);
                      })()}</span>
                      <span>Markup ex. tax ${(() => {
                        const qty = form.watch("quantity") || 0;
                        const unitCost = form.watch("unitCostExTax") || 0;
                        const markup = form.watch("markupPercent") || 0;
                        const cost = qty * unitCost;
                        const markupAmount = cost * (markup / 100);
                        return markupAmount.toFixed(2);
                      })()}</span>
                      <span>Tax ${(() => {
                        const qty = form.watch("quantity") || 0;
                        const unitCost = form.watch("unitCostExTax") || 0;
                        const markup = form.watch("markupPercent") || 0;
                        const cost = qty * unitCost;
                        const markupAmount = cost * (markup / 100);
                        const taxableAmount = cost + markupAmount;
                        const tax = taxableAmount * 0.10;
                        return tax.toFixed(2);
                      })()}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t">
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Amount</p>
                    <p className="text-2xl font-semibold">${(() => {
                      const qty = form.watch("quantity") || 0;
                      const unitCost = form.watch("unitCostExTax") || 0;
                      const markup = form.watch("markupPercent") || 0;
                      const cost = qty * unitCost;
                      const markupAmount = cost * (markup / 100);
                      const taxableAmount = cost + markupAmount;
                      const tax = taxableAmount * 0.10;
                      const total = taxableAmount + tax;
                      return total.toFixed(2);
                    })()}</p>
                  </div>
                  
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" onClick={handleCloseAddItem} data-testid="button-cancel-add-item">
                      Cancel
                    </Button>
                    <Button type="submit" disabled={addItemMutation.isPending} data-testid="button-submit-add-item">
                      {addItemMutation.isPending ? "Adding..." : "Add item"}
                    </Button>
                  </div>
                </div>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Edit Item Dialog */}
      {(() => {
        const editingItem = items.find(item => item.id === editingItemId);
        if (!editingItem) return null;
        
        return (
          <Dialog open={isEditDialogOpen} onOpenChange={(open) => {
            setIsEditDialogOpen(open);
            if (!open) {
              setEditingItemId(null);
            }
          }}>
            <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col rounded-xl p-0">
              <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
                <DialogTitle>Edit Estimate Item</DialogTitle>
              </DialogHeader>
              <Form {...editForm}>
                <form onSubmit={editForm.handleSubmit((data) => {
                  updateItemMutation.mutate(
                    { itemId: editingItem.id, data },
                    {
                      onSuccess: () => {
                        setIsEditDialogOpen(false);
                        setEditingItemId(null);
                      }
                    }
                  );
                })} className="flex flex-col flex-1 overflow-hidden">
                  <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                  <FormField
                    control={editForm.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Item Name</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. Premium Kitchen Cabinets" {...field} data-testid="input-edit-item-name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={editForm.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description (Optional)</FormLabel>
                        <FormControl>
                          <Textarea placeholder="Additional details about this item..." {...field} value={field.value || ""} data-testid="input-edit-item-description" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={editForm.control}
                      name="groupId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Group (Optional)</FormLabel>
                          <Select 
                            onValueChange={(value) => field.onChange(value === "none" ? undefined : value)} 
                            value={field.value || "none"}
                          >
                            <FormControl>
                              <SelectTrigger data-testid="select-edit-item-group">
                                <SelectValue placeholder="None" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="none">None (ungrouped)</SelectItem>
                              {groups.map((group) => (
                                <SelectItem key={group.id} value={group.id}>
                                  {group.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={editForm.control}
                      name="costCode"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Cost Code (Optional)</FormLabel>
                          <FormControl>
                            <CostCodeSelect
                              value={field.value || ''}
                              onValueChange={(value) => {
                                field.onChange(value || undefined);
                                if (value) {
                                  const code = costCodes.find(c => c.id === value);
                                  if (code?.categoryId && !editForm.getValues('costCategoryId' as any)) {
                                    editForm.setValue('costCategoryId' as any, code.categoryId);
                                  }
                                }
                              }}
                              placeholder="None"
                              data-testid="select-edit-item-costcode"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={editForm.control}
                    name={"costCategoryId" as any}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Category (Optional)</FormLabel>
                        <Select
                          value={field.value || 'none'}
                          onValueChange={(v) => field.onChange(v === 'none' ? undefined : v)}
                        >
                          <FormControl>
                            <SelectTrigger data-testid="select-edit-item-category">
                              <SelectValue placeholder="None" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            {costCategories.map(cat => (
                              <SelectItem key={cat.id} value={cat.id}>{cat.code} - {cat.title}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={editForm.control}
                      name="type"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Type</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-edit-item-type">
                                <SelectValue placeholder="Select type" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="material">Material</SelectItem>
                              <SelectItem value="labour">Labour</SelectItem>
                              <SelectItem value="equipment">Equipment</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={editForm.control}
                      name="status"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Status</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-edit-item-status">
                                <SelectValue placeholder="Select status" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {estimateItemStatusCategory?.options?.filter((opt: any) => opt.isActive).map((option: any) => (
                                <SelectItem key={option.key} value={option.key}>
                                  {option.name}
                                </SelectItem>
                              )) || (
                                <>
                                  <SelectItem value="pending">Pending</SelectItem>
                                  <SelectItem value="quoted">Quoted</SelectItem>
                                  <SelectItem value="confirmed">Confirmed</SelectItem>
                                </>
                              )}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* Labour Hours Tracking - Only for Labour items */}
                  {editForm.watch("type") === "labour" && (
                    <FormField
                      control={editForm.control}
                      name="trackLabourHours"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                          <FormControl>
                            <Checkbox
                              checked={field.value || false}
                              onCheckedChange={field.onChange}
                              data-testid="checkbox-edit-track-labour-hours"
                            />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel className="cursor-pointer">
                              Track labour hours for this item
                            </FormLabel>
                            <p className="text-sm text-muted-foreground">
                              Include this item in the labour hours budget tracking system
                            </p>
                          </div>
                        </FormItem>
                      )}
                    />
                  )}

                  <Separator className="my-4" />

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={editForm.control}
                      name="quantity"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Quantity</FormLabel>
                          <FormControl>
                            <Input 
                              type="number" 
                              step="0.01" 
                              min="0.01"
                              placeholder="1"
                              {...field}
                              onChange={(e) => {
                                const qty = parseFloat(e.target.value) || 0;
                                const rounded = Math.round(qty * 100) / 100;
                                field.onChange(rounded);
                              }}
                              data-testid="input-edit-item-quantity"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={editForm.control}
                      name="unitType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Unit</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-edit-item-unit">
                                <SelectValue placeholder="Unit" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {estimateItemUnitCategory?.options
                                ?.filter(opt => opt.isActive)
                                .sort((a, b) => a.sortOrder - b.sortOrder)
                                .map(option => (
                                  <SelectItem key={option.id} value={option.name}>
                                    {option.name}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* Pricing Section */}
                  <div className="space-y-4">
                    <h4 className="text-sm font-medium">Pricing <span className="text-muted-foreground font-normal">GST on expenses</span></h4>
                    
                    <div className="grid grid-cols-3 gap-4">
                      <FormField
                        control={editForm.control}
                        name="unitCostExTax"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Unit cost ex. tax *</FormLabel>
                            <FormControl>
                              <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                                <Input 
                                  type="number" 
                                  step="0.01" 
                                  min="0"
                                  placeholder="Unit cost ex. tax"
                                  className="pl-6 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                  value={field.value === 0 ? '' : field.value}
                                  onChange={(e) => {
                                    const value = e.target.value;
                                    if (value === '') {
                                      field.onChange(0);
                                    } else {
                                      const cost = parseFloat(value) || 0;
                                      const rounded = Math.round(cost * 100) / 100;
                                      field.onChange(rounded);
                                    }
                                  }}
                                  onBlur={field.onBlur}
                                  name={field.name}
                                  ref={field.ref}
                                  data-testid="input-edit-item-builder-cost"
                                />
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <div>
                        <label className="text-sm font-medium mb-2 block">Unit tax</label>
                        <div className="h-9 flex items-center px-3 text-sm text-muted-foreground">
                          ${(() => {
                            const unitCost = editForm.watch("unitCostExTax") || 0;
                            const tax = unitCost * 0.10;
                            return tax.toFixed(2);
                          })()}
                        </div>
                      </div>

                      <div>
                        <label className="text-sm font-medium mb-2 block">Unit cost inc. tax *</label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                          <Input 
                            type="number" 
                            step="0.01" 
                            min="0"
                            placeholder="Unit cost inc. tax"
                            className="pl-6 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            value={(() => {
                              const unitCost = editForm.watch("unitCostExTax") || 0;
                              const incTax = unitCost * 1.10;
                              return incTax === 0 ? '' : incTax.toFixed(2);
                            })()}
                            onChange={(e) => {
                              const value = e.target.value;
                              if (value === '') {
                                editForm.setValue("unitCostExTax", 0);
                              } else {
                                const incTax = parseFloat(value) || 0;
                                const exTax = incTax / 1.10;
                                const rounded = Math.round(exTax * 100) / 100;
                                editForm.setValue("unitCostExTax", rounded);
                              }
                            }}
                            data-testid="input-edit-item-unit-cost-inc-tax"
                          />
                        </div>
                      </div>
                    </div>

                    <FormField
                      control={editForm.control}
                      name="markupPercent"
                      render={({ field }) => (
                        <FormItem className="max-w-[200px]">
                          <FormLabel>Markup</FormLabel>
                          <div className="flex gap-2">
                            <FormControl>
                              <Input 
                                type="number" 
                                step="0.1" 
                                min="0"
                                placeholder="20"
                                className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                {...field}
                                value={field.value ?? ''}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  field.onChange(value === '' ? undefined : parseFloat(value) || 0);
                                }}
                                data-testid="input-edit-item-markup"
                              />
                            </FormControl>
                            <span className="flex items-center text-sm text-muted-foreground">%</span>
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* Calculated Totals */}
                  {(() => {
                    const qty = editForm.watch("quantity") || 0;
                    const unitCost = editForm.watch("unitCostExTax") || 0;
                    const markupRaw = editForm.watch("markupPercent");
                    const markup = markupRaw != null ? markupRaw : (editingItem?.markupPercent ?? estimate?.projectMarkupPercent ?? 0);
                    const taxRate = estimate?.taxRate ?? 10;

                    const round3 = (n: number) => Math.round(n * 1000) / 1000;
                    const builderCostExTax = round3(qty * unitCost);
                    const builderCostTax = round3(builderCostExTax * taxRate / 100);
                    const builderCostIncTax = round3(builderCostExTax + builderCostTax);

                    const markupAmount = round3(builderCostExTax * markup / 100);
                    const clientPriceExTax = round3(builderCostExTax + markupAmount);
                    const clientTax = round3(clientPriceExTax * taxRate / 100);
                    const clientPriceIncTax = round3(clientPriceExTax + clientTax);
                    
                    return (qty > 0 && unitCost > 0) ? (
                      <div className="p-4 bg-muted/30 rounded-lg border space-y-2">
                        <h4 className="text-sm font-semibold mb-2">Calculated Totals</h4>
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div className="space-y-1">
                            <p className="text-muted-foreground">Builder's Cost ex Tax</p>
                            <p className="font-semibold">
                              {formatCurrency(builderCostExTax)}
                            </p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-muted-foreground">Builder's Cost inc Tax</p>
                            <p className="font-semibold">
                              {formatCurrency(builderCostIncTax)}
                            </p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-muted-foreground">Client Price ex Tax</p>
                            <p className="font-semibold">
                              {formatCurrency(clientPriceExTax)}
                            </p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-muted-foreground">Client Price inc Tax</p>
                            <p className="font-semibold text-primary">
                              {formatCurrency(clientPriceIncTax)}
                            </p>
                          </div>
                        </div>
                      </div>
                    ) : null;
                  })()}

                  <Separator className="my-4" />

                  <FormField
                    control={editForm.control}
                    name="notes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Internal Notes (Optional)</FormLabel>
                        <FormControl>
                          <Textarea placeholder="Internal notes for the team..." {...field} value={field.value || ""} data-testid="input-edit-item-notes" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={editForm.control}
                    name="allowance"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Allowance</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-edit-item-allowance">
                              <SelectValue placeholder="Select allowance type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="None">None</SelectItem>
                            <SelectItem value="Prime Cost">Prime Cost</SelectItem>
                            <SelectItem value="Provisional Sum">Provisional Sum</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={editForm.control}
                    name="attachmentUrl"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Attachment URL (Optional)</FormLabel>
                        <FormControl>
                          <Input placeholder="https://..." {...field} value={field.value || ""} data-testid="input-edit-item-attachment" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={editForm.control}
                      name="requestForQuote"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                          <FormControl>
                            <input
                              type="checkbox"
                              checked={field.value}
                              onChange={(e) => field.onChange(e.target.checked)}
                              className="h-4 w-4 mt-1"
                              data-testid="checkbox-edit-request-for-quote"
                            />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel>Request for Quote</FormLabel>
                          </div>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={editForm.control}
                      name="isSelection"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                          <FormControl>
                            <input
                              type="checkbox"
                              checked={field.value}
                              onChange={(e) => field.onChange(e.target.checked)}
                              className="h-4 w-4 mt-1"
                              data-testid="checkbox-edit-is-selection"
                            />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel>Link to Selections</FormLabel>
                          </div>
                        </FormItem>
                      )}
                    />
                  </div>

                  <Separator className="my-4" />

                  <div className="space-y-4">
                    <h4 className="text-sm font-medium">Proposal Settings</h4>
                    
                    <FormField
                      control={editForm.control}
                      name="proposalVisible"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                          <FormControl>
                            <input
                              type="checkbox"
                              checked={field.value}
                              onChange={(e) => field.onChange(e.target.checked)}
                              className="h-4 w-4 mt-1"
                              data-testid="checkbox-edit-visible-in-proposal"
                            />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel>Show in client proposal</FormLabel>
                          </div>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={editForm.control}
                      name="shownAs"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Show as in proposal</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value || undefined}>
                            <FormControl>
                              <SelectTrigger data-testid="select-edit-show-as-in-proposal">
                                <SelectValue placeholder="Select display format" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="empty">Empty (no price)</SelectItem>
                              <SelectItem value="price">Show price</SelectItem>
                              <SelectItem value="included">Included</SelectItem>
                              <SelectItem value="excluded">Excluded</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  </div>
                  <div className="flex justify-end gap-2 px-6 py-4 border-t bg-background shrink-0">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setIsEditDialogOpen(false);
                        setEditingItemId(null);
                      }}
                      data-testid="button-cancel-edit-item"
                    >
                      Cancel
                    </Button>
                    <Button type="submit" disabled={updateItemMutation.isPending} data-testid="button-submit-edit-item">
                      {updateItemMutation.isPending ? "Saving..." : "Save Changes"}
                    </Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        );
      })()}

      {/* Add Group Dialog */}
      <Dialog open={isAddGroupOpen} onOpenChange={(open) => { if (!open) handleCloseAddGroup(); }}>
        <DialogContent className="max-w-md rounded-xl">
          <DialogHeader>
            <DialogTitle>{editingGroupId ? 'Edit Group' : parentGroupForNewSubgroup ? 'Add Subgroup' : 'Add Estimate Group'}</DialogTitle>
          </DialogHeader>
          <Form {...groupForm}>
            <form onSubmit={groupForm.handleSubmit(handleSubmitGroup)} className="space-y-4">
              {parentGroupForNewSubgroup && (
                <div className="rounded-md bg-muted p-3">
                  <p className="text-sm text-muted-foreground">Parent Group:</p>
                  <p className="text-sm font-medium">
                    {groups.find(g => g.id === parentGroupForNewSubgroup)?.name || 'Unknown Group'}
                  </p>
                </div>
              )}
              
              <FormField
                control={groupForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{parentGroupForNewSubgroup ? 'Subgroup Name' : 'Group Name'}</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Kitchen Work" {...field} data-testid="input-group-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={groupForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description (Optional)</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Additional details about this group..." {...field} value={field.value || ""} data-testid="input-group-description" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={groupForm.control}
                name="defaultCostCode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Default Cost Code (Optional)</FormLabel>
                    <FormControl>
                      <CostCodeSelect
                        value={field.value || ''}
                        onValueChange={(value) => field.onChange(value || undefined)}
                        placeholder="None"
                        data-testid="select-group-default-cost-code"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={groupForm.control}
                name={"defaultCostCategoryId" as any}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Default Category (Optional)</FormLabel>
                    <Select
                      value={field.value || 'none'}
                      onValueChange={(v) => field.onChange(v === 'none' ? undefined : v)}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="select-group-default-category">
                          <SelectValue placeholder="None" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {costCategories.map(cat => (
                          <SelectItem key={cat.id} value={cat.id}>{cat.code} - {cat.title}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={groupForm.control}
                name="order"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Display Order</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        min="0"
                        placeholder="0"
                        {...field}
                        onChange={(e) => field.onChange(e.target.value === "" ? "" : parseInt(e.target.value))}
                        onBlur={(e) => field.onChange(parseInt(e.target.value) || 0)}
                        data-testid="input-group-order"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end space-x-2 pt-4">
                <Button type="button" variant="outline" onClick={handleCloseAddGroup} data-testid="button-cancel-add-group">
                  Cancel
                </Button>
                <Button type="submit" disabled={addGroupMutation.isPending || updateFullGroupMutation.isPending} data-testid="button-submit-add-group">
                  {editingGroupId
                    ? (updateFullGroupMutation.isPending ? "Saving..." : "Save Changes")
                    : (addGroupMutation.isPending ? "Adding..." : "Add Group")}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Description Editor Dialog */}
      <Dialog 
        open={editingCell?.field === 'description'} 
        onOpenChange={(open) => {
          if (!open) {
            setEditingCell(null);
            setEditingValue("");
          }
        }}
      >
        <DialogContent className="max-w-2xl rounded-xl">
          <DialogHeader>
            <DialogTitle>Edit Description</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <RichTextEditor
              content={editingValue}
              onChange={(html) => setEditingValue(html)}
              placeholder="Enter description..."
              data-testid={editingCell ? `richtext-edit-description-${editingCell.itemId}` : 'richtext-edit-description'}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={(e) => {
                e.stopPropagation();
                setEditingCell(null);
                setEditingValue("");
              }}
              data-testid={editingCell ? `button-cancel-description-${editingCell.itemId}` : 'button-cancel-description'}
            >
              Cancel
            </Button>
            <Button
              onClick={(e) => {
                e.stopPropagation();
                if (editingCell) {
                  const item = items.find(i => i.id === editingCell.itemId);
                  if (item) {
                    handleCellSave(item, 'description');
                  }
                }
              }}
              data-testid={editingCell ? `button-save-description-${editingCell.itemId}` : 'button-save-description'}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Items Dialog */}
      {effectiveEstimateId && !isNewEstimate && (
        <ImportEstimateItemsDialog
          open={isImportOpen}
          onClose={() => setIsImportOpen(false)}
          estimateId={effectiveEstimateId}
          onImportComplete={() => {
            queryClient.invalidateQueries({ queryKey: ["/api/estimates", effectiveEstimateId, "items"] });
            queryClient.invalidateQueries({ queryKey: ["/api/estimates", effectiveEstimateId, "groups"] });
            queryClient.invalidateQueries({ queryKey: ["/api/estimates", effectiveEstimateId, "summary"] });
          }}
        />
      )}

      {/* Load from Template Dialog */}
      <Dialog open={isTemplatePickerOpen} onOpenChange={(open) => { if (!open) { setIsTemplatePickerOpen(false); setTemplateSearch(""); } }}>
        <DialogContent className="rounded-xl max-w-lg">
          <DialogHeader>
            <DialogTitle>Load from Template</DialogTitle>
            <DialogDescription>
              Choose an estimate template to import its groups and items into this estimate.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
              <input
                className="w-full pl-8 pr-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="Search templates..."
                value={templateSearch}
                onChange={(e) => setTemplateSearch(e.target.value)}
              />
            </div>
            <div className="max-h-72 overflow-y-auto space-y-1 pr-1">
              {estimateTemplates
                .filter(t => !t.isArchived && (
                  t.name.toLowerCase().includes(templateSearch.toLowerCase()) ||
                  (t.description ?? "").toLowerCase().includes(templateSearch.toLowerCase()) ||
                  (t.category ?? "").toLowerCase().includes(templateSearch.toLowerCase())
                ))
                .sort((a, b) => a.name.localeCompare(b.name))
                .map(template => {
                  const itemCount = ((template.templateData as any[]) || []).filter((i: any) => !i.isGroup).length;
                  const groupCount = ((template.templateData as any[]) || []).filter((i: any) => i.isGroup).length;
                  return (
                    <button
                      key={template.id}
                      className="w-full text-left px-3 py-2.5 rounded-md hover-elevate border border-transparent hover:border-border transition-colors"
                      onClick={() => applyTemplateMutation.mutate(template.id)}
                      disabled={applyTemplateMutation.isPending}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{template.name}</p>
                          {template.description && (
                            <p className="text-xs text-muted-foreground truncate">{template.description}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {template.category && (
                            <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                              {template.category}
                            </span>
                          )}
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {groupCount > 0 && `${groupCount}g `}{itemCount} items
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              {estimateTemplates.filter(t => !t.isArchived).length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-6">No estimate templates found.</p>
              )}
              {estimateTemplates.filter(t => !t.isArchived).length > 0 &&
                estimateTemplates.filter(t => !t.isArchived && (
                  t.name.toLowerCase().includes(templateSearch.toLowerCase()) ||
                  (t.description ?? "").toLowerCase().includes(templateSearch.toLowerCase()) ||
                  (t.category ?? "").toLowerCase().includes(templateSearch.toLowerCase())
                )).length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-6">No templates match your search.</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsTemplatePickerOpen(false); setTemplateSearch(""); }}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Estimate Dialog */}
      <Dialog open={isEditEstimateDialogOpen} onOpenChange={setIsEditEstimateDialogOpen}>
        <DialogContent className="rounded-xl max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Estimate</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Name</label>
              <Input
                value={editEstimateForm.name}
                onChange={(e) => setEditEstimateForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Estimate name"
                data-testid="input-edit-estimate-name"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Status</label>
              <Select
                value={editEstimateForm.status}
                onValueChange={(value) => setEditEstimateForm(prev => ({ ...prev, status: value }))}
              >
                <SelectTrigger data-testid="select-edit-estimate-status">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  {estimateStatuses.map((status) => (
                    <SelectItem key={status.key} value={status.key}>
                      <div className="flex items-center gap-2">
                        {status.color && (
                          <div 
                            className="w-2 h-2 rounded-full" 
                            style={{ backgroundColor: status.color }} 
                          />
                        )}
                        {status.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setIsEditEstimateDialogOpen(false)}
              data-testid="button-cancel-edit-estimate"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleSaveEstimateEdit}
              data-testid="button-save-edit-estimate"
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Group Delete Confirmation Dialog */}
      <Dialog open={isDeleteGroupDialogOpen} onOpenChange={setIsDeleteGroupDialogOpen}>
        <DialogContent className="rounded-xl">
          <DialogHeader>
            <DialogTitle>Delete Group</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete this group? All items in this group will be moved to "Ungrouped". This action cannot be undone.
          </p>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setIsDeleteGroupDialogOpen(false);
                setGroupToDelete(null);
              }}
              data-testid="button-cancel-delete-group"
            >
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={confirmDeleteGroup}
              data-testid="button-confirm-delete-group"
              disabled={isDeletingGroup}
            >
              {isDeletingGroup ? "Deleting..." : "Delete Group"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Single Item Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="rounded-xl">
          <DialogHeader>
            <DialogTitle>Delete Item</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete this item? This action cannot be undone.
          </p>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setIsDeleteDialogOpen(false);
                setItemToDelete(null);
              }}
              data-testid="button-cancel-delete"
            >
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={confirmDeleteItem}
              data-testid="button-confirm-delete"
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Delete Confirmation Dialog */}
      <Dialog open={isBulkDeleteDialogOpen} onOpenChange={setIsBulkDeleteDialogOpen}>
        <DialogContent className="rounded-xl">
          <DialogHeader>
            <DialogTitle>Delete {selectedGroups.size > 0 ? 'Groups and Items' : 'Items'}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete {selectedItems.size > 0 && `${selectedItems.size} item${selectedItems.size !== 1 ? 's' : ''}`}
            {selectedItems.size > 0 && selectedGroups.size > 0 && ' and '}
            {selectedGroups.size > 0 && `${selectedGroups.size} group${selectedGroups.size !== 1 ? 's' : ''}`}? This action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsBulkDeleteDialogOpen(false)} data-testid="button-cancel-bulk-delete">
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleBulkDelete} data-testid="button-confirm-bulk-delete">
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Change Status Dialog */}
      <Dialog open={isBulkStatusDialogOpen} onOpenChange={setIsBulkStatusDialogOpen}>
        <DialogContent className="rounded-xl">
          <DialogHeader>
            <DialogTitle>Change Status</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Select a status for {selectedItems.size} item{selectedItems.size !== 1 ? 's' : ''}:
            </p>
            <Select value={bulkActionStatus} onValueChange={setBulkActionStatus}>
              <SelectTrigger data-testid="select-bulk-status">
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                {estimateItemStatusCategory?.options?.filter((opt: any) => opt.isActive).map((option: any) => (
                  <SelectItem key={option.key} value={option.key}>
                    {option.name}
                  </SelectItem>
                )) || (
                  <>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="quoted">Quoted</SelectItem>
                    <SelectItem value="confirmed">Confirmed</SelectItem>
                  </>
                )}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsBulkStatusDialogOpen(false)} data-testid="button-cancel-bulk-status">
              Cancel
            </Button>
            <Button onClick={handleBulkChangeStatus} disabled={!bulkActionStatus} data-testid="button-confirm-bulk-status">
              Update Status
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Change Group Dialog */}
      <Dialog open={isBulkGroupDialogOpen} onOpenChange={setIsBulkGroupDialogOpen}>
        <DialogContent className="rounded-xl">
          <DialogHeader>
            <DialogTitle>Move to Group</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Select a group for {selectedItems.size} item{selectedItems.size !== 1 ? 's' : ''}:
            </p>
            <Select value={bulkActionGroup} onValueChange={setBulkActionGroup}>
              <SelectTrigger data-testid="select-bulk-group">
                <SelectValue placeholder="Select group" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None (ungrouped)</SelectItem>
                {groups.map((group) => (
                  <SelectItem key={group.id} value={group.id}>
                    {group.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsBulkGroupDialogOpen(false)} data-testid="button-cancel-bulk-group">
              Cancel
            </Button>
            <Button onClick={handleBulkChangeGroup} disabled={!bulkActionGroup} data-testid="button-confirm-bulk-group">
              Move Items
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Bulk Markup Dialog */}
      <Dialog open={isBulkMarkupDialogOpen} onOpenChange={setIsBulkMarkupDialogOpen}>
        <DialogContent className="rounded-xl max-w-sm">
          <DialogHeader>
            <DialogTitle>Set Markup %</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Set per-item markup for {selectedItems.size} selected item{selectedItems.size !== 1 ? 's' : ''}:
            </p>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min="0"
                max="1000"
                step="0.1"
                placeholder="e.g. 15"
                value={bulkMarkupValue}
                onChange={(e) => setBulkMarkupValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const pct = parseFloat(bulkMarkupValue);
                    if (!isNaN(pct) && pct >= 0) {
                      bulkMarkupMutation.mutate({ itemIds: Array.from(selectedItems), markupPercent: pct });
                    }
                  }
                }}
                data-testid="input-bulk-markup-percent"
                autoFocus
              />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsBulkMarkupDialogOpen(false)} data-testid="button-cancel-bulk-markup">
              Cancel
            </Button>
            <Button
              onClick={() => {
                const pct = parseFloat(bulkMarkupValue);
                if (!isNaN(pct) && pct >= 0) {
                  bulkMarkupMutation.mutate({ itemIds: Array.from(selectedItems), markupPercent: pct });
                }
              }}
              disabled={bulkMarkupMutation.isPending || bulkMarkupValue === "" || isNaN(parseFloat(bulkMarkupValue)) || parseFloat(bulkMarkupValue) < 0}
              data-testid="button-confirm-bulk-markup"
            >
              {bulkMarkupMutation.isPending ? "Applying..." : "Apply"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create RFQ Dialog */}
      <CreateRFQDialog
        open={isCreateRFQOpen}
        onOpenChange={setIsCreateRFQOpen}
        estimateId={effectiveEstimateId || ""}
        projectId={estimate?.projectId || ""}
        selectedItemIds={selectedItems}
        estimateItems={items}
        estimateName={estimate?.name || ""}
      />
      
      {/* Create PO from Estimate Dialog */}
      <CreatePOFromEstimateDialog
        open={isCreatePOOpen}
        onOpenChange={setIsCreatePOOpen}
        estimateId={effectiveEstimateId || ""}
        projectId={estimate?.projectId || ""}
        selectedItemIds={selectedItems}
        estimateItems={items}
        estimateName={estimate?.name || ""}
      />
      
      {/* Catalog Sidebar */}
      <div className="fixed top-0 right-0 h-full z-50">
        <CatalogSidebar
          isOpen={isCatalogOpen}
          onClose={() => setIsCatalogOpen(false)}
          onAddAssembly={async (assemblyId) => {
            if (!effectiveEstimateId) return;
            
            try {
              // Mock assembly data - in production, fetch from API
              const assemblyItems = {
                'slab-pour': [
                  { description: 'Concrete - 20 MPa', quantity: 12.5, unit: 'm³', rate: 185 },
                  { description: 'Steel mesh - SL82', quantity: 125, unit: 'm²', rate: 8.50 },
                  { description: 'Vapor barrier', quantity: 125, unit: 'm²', rate: 2.75 },
                  { description: 'Labour - concrete pour', quantity: 8, unit: 'hr', rate: 85 },
                ],
                'framing': [
                  { description: 'Pine framing timber - 90x45', quantity: 450, unit: 'lm', rate: 4.20 },
                  { description: 'Steel fixing plates', quantity: 85, unit: 'ea', rate: 3.50 },
                  { description: 'Galv bolts M12x100', quantity: 120, unit: 'ea', rate: 1.80 },
                  { description: 'Labour - framing', quantity: 24, unit: 'hr', rate: 75 },
                ],
              };
              
              const items = assemblyItems[assemblyId as keyof typeof assemblyItems] || [];
              
              // Add each item to the estimate
              for (const item of items) {
                await apiRequest('/api/estimate-items', 'POST', {
                  estimateId: effectiveEstimateId,
                  description: item.description,
                  quantity: item.quantity,
                  unit: item.unit,
                  rate: item.rate,
                  amount: item.quantity * item.rate,
                });
              }
              
              // Refresh data
              await queryClient.refetchQueries({ queryKey: ['/api/estimates', effectiveEstimateId, 'items'] });
              await queryClient.refetchQueries({ queryKey: ['/api/estimates', effectiveEstimateId, 'summary'] });
              
              toast({
                title: "Assembly Added",
                description: `Added ${items.length} items from assembly to your estimate`,
              });
              
              setIsCatalogOpen(false);
            } catch (error: any) {
              toast({
                title: "Error",
                description: error.message || "Failed to add assembly items",
                variant: "destructive",
              });
            }
          }}
        />
      </div>
      
      {/* Fixed Floating Bulk Action Bar */}
      {(selectedItems.size > 0 || selectedGroups.size > 0) && (
        <div className="fixed bottom-4 left-4 right-4 z-50 h-9 bg-background border rounded-lg shadow-lg flex items-center gap-3 px-3" data-testid="bulk-action-bar">
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleClearSelection}
              data-testid="button-clear-selection"
              title="Clear selection"
            >
              <X className="w-4 h-4" />
            </Button>
            <span className="text-sm font-medium">
              {selectedItems.size > 0 && `${selectedItems.size} item${selectedItems.size !== 1 ? 's' : ''}`}
              {selectedItems.size > 0 && selectedGroups.size > 0 && ', '}
              {selectedGroups.size > 0 && `${selectedGroups.size} group${selectedGroups.size !== 1 ? 's' : ''}`}
              {' selected'}
            </span>
            {selectedItems.size > 0 && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setBulkMarkupValue(""); setIsBulkMarkupDialogOpen(true); }}
                  disabled={estimate?.isLocked}
                  data-testid="button-bulk-set-markup"
                >
                  Markup
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsBulkStatusDialogOpen(true)}
                  disabled={estimate?.isLocked}
                  data-testid="button-bulk-change-status"
                >
                  Status
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsBulkGroupDialogOpen(true)}
                  disabled={estimate?.isLocked}
                  data-testid="button-bulk-move-group"
                >
                  Move
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={estimate?.isLocked}
                      data-testid="button-create-from-estimate"
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      Create
                      <ChevronDown className="w-3 h-3 ml-1" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" side="top">
                    <DropdownMenuItem onClick={() => setIsCreatePOOpen(true)}>
                      <ShoppingCart className="w-3.5 h-3.5 mr-2" />
                      Purchase Order
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setIsCreateRFQOpen(true)}>
                      <Package className="w-3.5 h-3.5 mr-2" />
                      RFQ
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setIsBulkDeleteDialogOpen(true)}
              disabled={estimate?.isLocked}
              data-testid="button-bulk-delete"
            >
              <Trash2 className="w-3 h-3 mr-1" />
              Delete
            </Button>
          </div>
        </div>
      )}

      {/* Undo Toast */}
      {undoStack.showUndoToast && undoStack.lastAction && (
        <div className="undo-toast">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Undo2 className="h-4 w-4" />
              <span className="text-sm">{undoStack.lastAction.type}</span>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                const action = undoStack.popAction();
                if (action) {
                  toast({
                    title: "Action Undone",
                    description: `Reversed: ${action.type}`,
                  });
                }
              }}
              data-testid="button-undo"
            >
              <Undo2 className="h-3 w-3 mr-1" />
              Undo (Ctrl+Z)
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}