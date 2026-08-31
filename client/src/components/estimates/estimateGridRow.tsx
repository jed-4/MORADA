/**
 * The estimate grid's row and cell renderers.
 *
 * Moved here VERBATIM from EstimateDetail.tsx so the estimate page and the
 * estimate-template page can draw the same grid instead of maintaining two
 * lookalikes. Nothing about the markup or behaviour changed in the move —
 * see scripts/estimate-grid-fingerprint.tsx for the proof.
 *
 * These are plain functions returning JSX, not components, on purpose: a new
 * component boundary would change React's tree and with it reconciliation and
 * focus, and focus is load-bearing here (the cursor hands focus back to the
 * grid container when an editor closes).
 */
import React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "@/components/StatusBadge";
import { CostCodeSelect } from "@/components/CostCodeSelect";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  MoreVertical, Plus, Edit, Copy, FileText, Trash2, Palette, ExternalLink,
  ChevronRight, ChevronDown, Eye, Tag, ShoppingCart, GripVertical,
} from "lucide-react";
import { PriceListItemPicker } from "@/components/estimates/PriceListItemPicker";
import type {
  EstimateItem,
  CostCode,
  CostCategory,
  FieldCategoryWithOptions,
} from "@shared/schema";

// Column configuration type - defined outside component to avoid re-creation
export type ColumnConfig = { id: string; label: string; visible: boolean; widthPx: number };

export interface SortableRowProps {
  id: string;
  children: React.ReactNode;
  className?: string;
  isDraggable?: boolean;
  gridTemplate: string;
  dropIndicator?: 'above' | 'below' | null;
  activeDragId?: string | null;
  onDoubleClick?: () => void;
}

/**
 * A grid-cell chip. The visual is the app's StatusBadge — same pill everywhere
 * else in Morada — wrapped in a button so it can cycle its value on click.
 * A real <button> also makes these keyboard-reachable, which the old
 * onClick-on-a-div version was not.
 */
function CellChip({
  onClick,
  onPickFromList,
  disabled,
  className,
  title,
  testId,
  children,
}: {
  onClick: () => void;
  /** Right-click: jump straight to a value instead of cycling to it. */
  onPickFromList?: () => void;
  disabled?: boolean;
  className?: string;
  title?: string;
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); if (!disabled) onClick(); }}
      onDoubleClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => {
        if (!onPickFromList || disabled) return;
        e.preventDefault();
        e.stopPropagation();
        onPickFromList();
      }}
      disabled={disabled}
      title={title}
      className={`inline-flex rounded-[9px] hover-elevate active-elevate-2 disabled:opacity-60 disabled:cursor-not-allowed disabled:pointer-events-none ${className || ''}`}
      data-testid={testId}
    >
      {children}
    </button>
  );
}

export const SortableRow = React.memo(({ id, children, className, isDraggable = true, gridTemplate, dropIndicator, activeDragId, onDoubleClick }: SortableRowProps) => {
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
        className="relative bg-muted/40 border-b border-border"
        data-testid={`row-placeholder-${id}`}
        data-sortable-id={id}
      >
        {/* The row being dragged just holds its space. It used to also carry a
            dashed outline, which made three things saying the same thing at
            once: the ghost under the cursor, the drop indicator, and this. */}
        {/* Render children with visibility hidden to maintain column widths */}
        <div style={{ display: 'contents', visibility: 'hidden' }}>
          {children}
        </div>
      </div>
    );
  }

  // Normal rendering when not dragging.
  // Rows deliberately do NOT shift out of the way. A drop indicator already
  // says exactly where the row will land, so sliding every other row as well
  // was a second, noisier answer to the same question.
  const style: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: gridTemplate,
  };

  return (
    <div
      ref={combinedRef}
      role="row"
      style={style}
      className={`relative ${className} group hover-elevate transition-colors border-b border-border/50 last:border-b-0`}
      data-testid={`row-item-${id}`}
      data-sortable-id={id}
      onDoubleClick={onDoubleClick}
    >
      {/* Drop indicator line - shows above or below based on position */}
      {dropIndicator === 'above' && (
        <div className="absolute -top-px left-0 right-0 h-0.5 bg-primary z-50" />
      )}
      {dropIndicator === 'below' && (
        <div className="absolute -bottom-px left-0 right-0 h-0.5 bg-primary z-50" />
      )}
      {/* Drag handle — its own 20px lane at the left (checkbox is shifted right),
          so it no longer overlaps the checkbox and is actually grabbable. */}
      {isDraggable && (
        <div
          {...attributes}
          {...listeners}
          className="absolute left-0 top-0 h-full w-5 flex items-center justify-center opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing transition-all z-20"
          title="Drag to reorder"
          data-testid={`drag-handle-${id}`}
        >
          <GripVertical className="h-4 w-4" />
        </div>
      )}
      {children}
    </div>
  );
});


/**
 * Everything the grid row/cell renderers closed over when they lived inside
 * EstimateDetail. Passing it as one bag keeps the moved bodies verbatim — the
 * alternative was rewriting 1,100 lines of call sites into props, which is
 * exactly the kind of change that hides a regression.
 *
 * `any` here is deliberate: these are react-query mutations and a
 * react-hook-form instance whose real types add nothing at this boundary.
 */
export interface EstimateGridCtx {
  // cursor + editor state
  editingCell: { itemId: string; field: string } | null;
  activeCell: { itemId: string; field: string } | null;
  editingValue: string;
  setEditingValue: (v: string) => void;
  setEditingCell: (v: { itemId: string; field: string } | null) => void;
  setActiveCell: (v: { itemId: string; field: string } | null) => void;
  handleCellEdit: (item: EstimateItem, field: string) => void;
  handleCellSave: (item: EstimateItem, field: string) => void;
  handleCellCancel: () => void;
  handleCellKeyDown: (e: React.KeyboardEvent, item: EstimateItem, field: string) => void;
  handlePriceListSelect: (item: EstimateItem, picked: any) => void;

  // data
  estimate: any;
  columns: ColumnConfig[];
  costCodes: CostCode[];
  costCategories: CostCategory[];
  priceListItemMap: Map<string, any>;
  poLinkMap: Map<string, { poNumber: string }[]>;
  selectionByEstimateItemId: Map<string, { id: string }>;
  estimateItemStatusCategory: FieldCategoryWithOptions | undefined;
  estimateItemUnitCategory: FieldCategoryWithOptions | undefined;

  // derived helpers
  calculatePricingValues: (item: EstimateItem) => any;
  formatCurrency: (amount: number) => string;
  getSubItems: (itemId: string) => EstimateItem[];

  // selection / collapse / drag
  selectedItems: Set<string>;
  handleToggleSelection: (id: string) => void;
  collapsedItems: Set<string>;
  handleToggleItemCollapse: (id: string) => void;
  dropTarget: { id: string; position: 'above' | 'below' } | null;
  activeId: string | null;

  // actions
  updateItemMutation: any;
  createSelectionFromItemMutation: any;
  handleDuplicateItem: (id: string) => void;
  handleCopyItem: (id: string) => void;
  form: any;
  setEditingItemId: (id: string | null) => void;
  setIsEditDialogOpen: (v: boolean) => void;
  setIsAddItemOpen: (v: boolean) => void;
  setItemToDelete: (id: string | null) => void;
  setIsDeleteDialogOpen: (v: boolean) => void;
  setLocation: (path: string) => void;
  toast: (opts: any) => void;
}


export function renderEstimateCell(ctx: EstimateGridCtx, item: EstimateItem, columnId: string) {
  const { editingCell, activeCell, editingValue, setEditingValue, setEditingCell, setActiveCell, estimate, calculatePricingValues, costCodes, costCategories, updateItemMutation, handleCellEdit, handleCellSave, handleCellCancel, handleCellKeyDown, handlePriceListSelect, getSubItems, collapsedItems, handleToggleItemCollapse, priceListItemMap, poLinkMap, toast, estimateItemStatusCategory, estimateItemUnitCategory, formatCurrency } = ctx;
    // The name is edited as the field "name" but lives in the column "item",
    // so both checks below match on the field the column actually edits.
    const cursorField = columnId === 'item' ? 'name' : columnId;
    const isEditing = editingCell?.itemId === item.id && editingCell?.field === cursorField;
    const isCursor =
      !isEditing && activeCell?.itemId === item.id && activeCell?.field === cursorField;
    const isLocked = estimate?.isLocked;
    const pricingValues = calculatePricingValues(item);
    const cellKey = `${item.id}-${columnId}`;
    
    // No outline in either state. A ring around the cell read as a box
    // appearing the moment you clicked, which is the thing that looked wrong.
    // The cursor is a soft tint instead, and editing looks identical to it —
    // only the caret arrives.
    const cellHighlight = "bg-primary/[0.07]";
    // Figures read right-aligned, and the editor has to agree with the display
    // or the number jumps sides the moment you click it.
    const NUMERIC_COLUMNS = new Set([
      'quantity', 'unitCostExTax', 'unitCostIncTax', 'builderCost', 'builderCostIncTax',
      'markup', 'markupDollarAmount', 'clientPriceExTax', 'clientTax', 'clientPriceIncTax',
    ]);
    // The status chip sits in a narrow column and reads better centred under
    // its heading than pinned to the left edge.
    // Chips sit in narrow columns and vary in width with their label — a
    // "Confirmed" is 75px against a "Todo" at 43px. Centred, that variation
    // reads as symmetric rather than ragged, without forcing every chip to a
    // fixed width and going back to the blocky look.
    const CENTERED_COLUMNS = new Set(['status', 'shownAs', 'allowance', 'type']);
    // Computed from the entered figures — nothing here is typed. Muted so the
    // numbers you can actually change come forward. The line's final client
    // price stays at full weight: it's the answer the row exists to give.
    const DERIVED_COLUMNS = new Set([
      'unitCostIncTax', 'builderCost', 'builderCostIncTax',
      'clientTax', 'markupDollarAmount', 'clientPriceExTax', 'clientPriceIncTax',
    ]);
    // Where entering stops and pricing begins. One hairline gives the eye a
    // landmark instead of sixteen columns of equal weight.
    const MONEY_BOUNDARY = 'unitCostExTax';
    const cellBase =
      "h-9 px-2 flex items-center text-sm overflow-hidden" +
      (NUMERIC_COLUMNS.has(columnId) ? " justify-end text-right tabular-nums" : "") +
      (CENTERED_COLUMNS.has(columnId) ? " justify-center" : "") +
      (DERIVED_COLUMNS.has(columnId) ? " text-muted-foreground bg-muted/40" : "") +
      (columnId === MONEY_BOUNDARY ? " border-l border-border" : "") +
      (isCursor ? ` ${cellHighlight}` : "");
    const cellActive = cellHighlight;
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
        const displayCode = matchedCode ? `${matchedCode.code} - ${matchedCode.title}` : (item.costCode || '');
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
          Material: 'bg-teal/10 text-teal dark:bg-teal/20',
          Labour: 'bg-status-success-bg text-status-success',
          Subcontractor: 'bg-amber-light text-amber',
          Fee: 'bg-primary/10 text-primary dark:bg-primary/20',
          Equipment: 'bg-status-warning-bg text-status-warning',
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
                  <SelectItem value="Equipment">Equipment</SelectItem>
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
        const indentClass = isSubItem ? 'pl-6' : '';
        // This column is "item" but it edits the `name` field, and the shared
        // isEditing above compares the field against the COLUMN id — so it was
        // always false here and clicking the name never opened an input.
        const isEditingName = editingCell?.itemId === item.id && editingCell?.field === 'name';

        if (isEditingName) {
          return (
            <div className={`${cellBase} ${indentClass} ${cellActive}`} role="gridcell">
              <PriceListItemPicker
                value={editingValue}
                onChange={setEditingValue}
                onSelect={(picked) => handlePriceListSelect(item, picked)}
                onCommit={() => handleCellSave(item, 'name')}
                onCancel={handleCellCancel}
                onKeyDown={(e) => handleCellKeyDown(e, item, 'name')}
                className="h-full w-full bg-transparent border-0 border-none rounded-none shadow-none outline-none focus:outline-none focus-visible:outline-none focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 px-0 text-xs md:text-xs font-medium"
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
            onDoubleClick={(e) => {
              // Double-click the title also inline-edits it (and must NOT bubble
              // to the row's double-click, which opens the edit dialog).
              e.stopPropagation();
              if (!isLocked) handleCellEdit(item, 'name');
            }}
          >
            <div className="flex items-center gap-2 min-w-0 w-full">
              {hasSubItems && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-4 w-4 p-0"
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
                className="font-medium truncate text-xs flex-1 min-w-0"
                title={isLocked ? item.name : 'Click to edit'}
              >
                {item.name}
              </span>
              {/* Priced from the catalogue. Sits in the same slot as the PO marker
                  and reads the same way: a quiet icon, the detail in the tooltip.
                  It disappears the moment someone edits the unit cost, which is the
                  whole point — the marker only ever claims "this IS the book price". */}
              {item.priceListItemId && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Tag
                      className="w-3 h-3 text-muted-foreground flex-shrink-0"
                      style={priceListItemMap.get(item.priceListItemId)?.listColour
                        ? { color: priceListItemMap.get(item.priceListItemId)!.listColour! }
                        : undefined}
                      data-testid={`marker-price-list-${item.id}`}
                    />
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <p className="text-xs">
                      {(() => {
                        const linked = priceListItemMap.get(item.priceListItemId!);
                        if (!linked) return 'Priced from a price list';
                        return [linked.listName, linked.code].filter(Boolean).join(' · ');
                      })()}
                    </p>
                  </TooltipContent>
                </Tooltip>
              )}
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
                  className={`truncate w-full min-w-0 ${!isLocked ? 'cursor-pointer border-b border-transparent hover:border-primary/30 transition-colors' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!isLocked) {
                      handleCellEdit(item, 'description');
                    }
                  }}
                  dangerouslySetInnerHTML={{ 
                    __html: item.description || '' 
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
              onClick={(e) => {
                e.stopPropagation();
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
              onDoubleClick={(e) => e.stopPropagation()}
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

        // Semantic tones rather than hand-picked classes. "price" used a raw
        // #7c5bb0 literal that sat off Morada's lavender and couldn't follow
        // the theme; "action" is the palette's plum and keeps it purple.
        const shownAsTone =
          currentShownAs === 'price' ? 'action' :
          currentShownAs === 'included' ? 'success' :
          currentShownAs === 'excluded' ? 'danger' :
          'neutral';

        return (
          <div className={cellBase} role="gridcell" key={`${item.id}-shownAs`} data-testid={`cell-shownAs-${item.id}`}>
            <CellChip
              disabled={isLocked}
              title={isLocked ? undefined : 'Click to change how this line is shown'}
              testId={`button-toggle-shownAs-${item.id}`}
              onClick={() => {
                const nextIndex = (validIndex + 1) % shownAsOptions.length;
                updateItemMutation.mutate({
                  itemId: item.id,
                  data: { shownAs: shownAsOptions[nextIndex] }
                });
              }}
            >
              <StatusBadge
                status={currentShownAs}
                tone={shownAsTone}
                label={currentShownAs.charAt(0).toUpperCase() + currentShownAs.slice(1)}
              />
            </CellChip>
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

        // StatusBadge already turns a configured hex into the tint treatment,
        // so it just gets the colour. Legacy statuses that predate field
        // settings have no option to read, and keep their meaning via a tone.
        const legacyStatusTone = (() => {
          const lc = currentStatus?.toLowerCase?.() ?? '';
          if (lc === 'done' || lc === 'complete') return 'success' as const;
          if (lc === 'not relevant' || lc === 'not_relevant') return 'neutral' as const;
          if (lc === 'in progress' || lc === 'in_progress') return 'info' as const;
          return 'warning' as const; // incomplete / todo / pending
        })();

        const statusLabel = statusOption?.name || 
          (currentStatus === 'done' ? 'Done' : currentStatus === 'not relevant' ? 'N/A' : 'Todo');

        return (
          <div className={cellBase} role="gridcell" key={`${item.id}-status`} data-testid={`cell-status-${item.id}`}>
            <CellChip
              disabled={isLocked}
              title={isLocked ? undefined : 'Click to change status'}
              testId={`button-toggle-status-${item.id}`}
              onClick={() => {
                const nextStatusIndex = (validStatusIndex + 1) % statusOptionsKeys.length;
                updateItemMutation.mutate({
                  itemId: item.id,
                  data: { status: statusOptionsKeys[nextStatusIndex] }
                });
              }}
            >
              <StatusBadge
                status={currentStatus}
                label={statusLabel}
                tone={legacyStatusTone}
              />
            </CellChip>
          </div>
        );
      
      case 'allowance':
        const allowanceType = item.allowance || 'None';
        
        // Chip styling for allowance
        // Blue, as it was — and distinct from the plum "Price" chip that sits
        // next to it in the same row.
        const allowanceTone =
          allowanceType === 'Prime Cost' ? 'info' as const :
          allowanceType === 'Provisional Sum' ? 'warning' as const :
          'neutral' as const;

        const allowanceLabel = 
          allowanceType === 'Prime Cost' ? 'PC' : 
          allowanceType === 'Provisional Sum' ? 'PS' : 
          '-';
        // Most lines carry no allowance, and a column of grey dashes saying
        // "nothing" is noise. It fades in on row hover so the cell is still
        // obviously clickable when you want to set one.
        const allowanceFade = allowanceType === 'None'
          ? 'opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity'
          : '';
        
        return (
          <div className={cellBase} role="gridcell" key={`${item.id}-allowance`} data-testid={`cell-allowance-${item.id}`}>
            <CellChip
              disabled={isLocked}
              className={allowanceFade}
              title={isLocked ? undefined : `Allowance: ${allowanceType}. Click to change.`}
              testId={`button-toggle-allowance-${item.id}`}
              onClick={() => {
                // Cycle through: None -> Prime Cost -> Provisional Sum -> None
                const nextAllowance = 
                  item.allowance === 'None' ? 'Prime Cost' :
                  item.allowance === 'Prime Cost' ? 'Provisional Sum' : 'None';
                updateItemMutation.mutate({
                  itemId: item.id,
                  data: { allowance: nextAllowance }
                });
              }}
            >
              <StatusBadge
                status={allowanceType}
                tone={allowanceTone}
                label={allowanceLabel}
              />
            </CellChip>
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
                onFocus={(e) => e.target.select()}
                onDoubleClick={(e) => e.stopPropagation()}
                className="h-full w-full bg-transparent border-0 border-none rounded-none shadow-none outline-none focus:outline-none focus-visible:outline-none focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 px-0 text-sm md:text-sm text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                autoFocus
                min="0"
                step="0.01"
                data-testid={`input-edit-quantity-${item.id}`}
              />
            </div>
          );
        }
        // Show the BASE quantity (not wastage-adjusted) so it's unambiguous
        // which number is the real qty. Wastage's effect is shown as a ring on
        // the Builder Cost cell instead (see the builderCost case).
        const baseQuantity = item.quantity;
        const wastage = (item as any).wastagePercent || 0;

        return (
          <div
            className={`${cellBase} ${cellEditable}`}
            role="gridcell"
            title={isLocked ? '' : `Click to edit${wastage > 0 ? ` (builder cost includes +${wastage}% waste)` : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              if (!isLocked) handleCellEdit(item, 'quantity');
            }}
            data-testid={`cell-quantity-${item.id}`}
          >
            {baseQuantity.toFixed(2).replace(/\.?0+$/, '')}
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
          currentWastage === 10 ? 'bg-status-info-bg text-status-info border-status-info/30' :
          currentWastage === 15 ? 'bg-status-warning-bg text-status-warning border-status-warning/30' :
          'bg-status-danger-bg text-status-danger border-status-danger/30'; // 20%
        
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
                  // Stay on the cell so the next Tab continues along the row
                  // instead of falling out of the grid onto the notes button.
                  setActiveCell({ itemId: item.id, field: 'unitType' });
                }}
                data-testid={`select-edit-unitType-${item.id}`}
                defaultOpen
              >
                <SelectTrigger className="h-full w-full px-0 text-sm bg-transparent border-0 border-none rounded-none shadow-none outline-none focus:outline-none focus-visible:outline-none focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0">
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
            {item.unitType || ''}
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
                onFocus={(e) => e.target.select()}
                onDoubleClick={(e) => e.stopPropagation()}
                className="h-full w-full bg-transparent border-0 border-none rounded-none shadow-none outline-none focus:outline-none focus-visible:outline-none focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 px-0 text-sm md:text-sm text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
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
                onFocus={(e) => e.target.select()}
                onDoubleClick={(e) => e.stopPropagation()}
                className="h-full w-full bg-transparent border-0 border-none rounded-none shadow-none outline-none focus:outline-none focus-visible:outline-none focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 px-0 text-sm md:text-sm text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
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
      
      case 'builderCost': {
        const wastagePct = (item as any).wastagePercent || 0;
        return (
          <div
            className={`${cellBase} ${wastagePct > 0 ? "ring-1 ring-inset ring-amber/60 rounded-sm bg-amber/5" : ""}`}
            role="gridcell"
            data-testid={`cell-builderCost-${item.id}`}
            title={wastagePct > 0 ? `Includes +${wastagePct}% wastage` : undefined}
          >
            {formatCurrency(pricingValues.builderCost)}
          </div>
        );
      }
      
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
                onFocus={(e) => e.target.select()}
                onDoubleClick={(e) => e.stopPropagation()}
                className="h-full w-full bg-transparent border-0 border-none rounded-none shadow-none outline-none focus:outline-none focus-visible:outline-none focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 px-0 text-sm md:text-sm text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
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
}

export function renderEstimateItemWithSubItems(
  ctx: EstimateGridCtx,
    item: EstimateItem, 
    groupContext?: { isInGroup?: boolean; isLastInGroup?: boolean }, 
    gridTemplate?: string,
    visibleCols?: ColumnConfig[],
    rowIndex: number = 0
) {
  const { getSubItems, collapsedItems, estimate, columns, editingCell, selectedItems, dropTarget, activeId, setEditingItemId, setIsEditDialogOpen, handleToggleSelection, form, setIsAddItemOpen, handleDuplicateItem, handleCopyItem, selectionByEstimateItemId, setLocation, createSelectionFromItemMutation, setItemToDelete, setIsDeleteDialogOpen } = ctx;
  const renderCell = (cellItem: EstimateItem, columnId: string) => renderEstimateCell(ctx, cellItem, columnId);
    const subItems = getSubItems(item.id);
    const isCollapsed = collapsedItems.has(item.id);
    const isLocked = estimate?.isLocked;
    const isInGroup = groupContext?.isInGroup || false;
    const isLastInGroup = groupContext?.isLastInGroup || false;
    
    // Use passed visibleCols for consistency, fallback to filtering columns
    const visibleColumns = visibleCols || columns.filter(col => col.visible);
    
    // Generate grid template if not provided (no 32px handle column)
    const effectiveGridTemplate = gridTemplate || `40px ${visibleColumns.map(c => `${c.widthPx}px`).join(' ')} 80px`;
    
    // Build className for visual containment - 40px row height
    // Helper: precedence pipeline shared by parent & sub-item rows
    // editing > selected > status > zebra
    const buildRowBg = (rowItem: EstimateItem, idx: number): string => {
      if (editingCell?.itemId === rowItem.id) return "bg-primary/[0.04]";
      if (selectedItems.has(rowItem.id)) return "bg-[#f6f3ff]";
      const lc = (rowItem.status || '').toString().toLowerCase();
      if (lc === 'done' || lc === 'complete') return "bg-sage/10";
      if (lc === 'not relevant' || lc === 'not_relevant') return "bg-muted/70";
      // No zebra striping. Rows already answer "which one am I on" three
      // ways — hover, selection tint and the cell cursor — and a fourth
      // signal underneath them was just noise.
      return "bg-card";
    };

    let itemClassName = buildRowBg(item, rowIndex);
    itemClassName += " hover:bg-primary/5 transition-colors";
    // Selected rows get a clear active state.
    if (selectedItems.has(item.id)) {
      itemClassName += " !bg-primary/10 ring-1 ring-inset ring-primary/30";
    }
    if (isInGroup) {
      itemClassName += " item-in-group";
    }

    // Calculate drop indicator for this item
    const itemDropIndicator = dropTarget?.id === item.id ? dropTarget.position : undefined;
    
    const rows = [
      // Parent item row - CSS Grid
      <SortableRow key={item.id} id={item.id} className={itemClassName} isDraggable={!isLocked} gridTemplate={effectiveGridTemplate} dropIndicator={itemDropIndicator} activeDragId={activeId} onDoubleClick={!isLocked ? () => { setEditingItemId(item.id); setIsEditDialogOpen(true); } : undefined}>
        {/* Checkbox cell — pl-5 clears the 20px drag-handle lane at the left */}
        <div className="h-9 pl-5 pr-1 flex items-center" role="gridcell">
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
        {/* Actions cell — vertical 3-dot, centered, with a left divider (matches groups) */}
        <div className="h-9 px-2 flex items-center justify-center border-l border-border/50" role="gridcell">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                data-testid={`button-actions-${item.id}`}
                disabled={estimate?.isLocked}
              >
                <MoreVertical className="w-4 h-4" />
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
              {item.isSelection && (() => {
                const linkedSelection = selectionByEstimateItemId.get(item.id);
                return (<>
                  <Separator />
                  {linkedSelection ? (
                    <DropdownMenuItem
                      onClick={() => setLocation(`/selections/${linkedSelection.id}`)}
                      data-testid={`button-view-selection-${item.id}`}
                    >
                      <ExternalLink className="w-4 h-4 mr-2" />
                      View Selection
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem
                      onClick={() => createSelectionFromItemMutation.mutate(item.id)}
                      data-testid={`button-create-selection-${item.id}`}
                      disabled={createSelectionFromItemMutation.isPending}
                    >
                      <Palette className="w-4 h-4 mr-2" />
                      Create Selection
                    </DropdownMenuItem>
                  )}
                </>);
              })()}
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
      subItems.forEach((subItem, subIndex) => {
        const subItemDropIndicator = dropTarget?.id === subItem.id ? dropTarget.position : undefined;
        rows.push(
          <SortableRow key={subItem.id} id={subItem.id} className={`${buildRowBg(subItem, subIndex)} hover:bg-primary/5 transition-colors`} isDraggable={!isLocked} gridTemplate={effectiveGridTemplate} dropIndicator={subItemDropIndicator} activeDragId={activeId} onDoubleClick={!isLocked ? () => { setEditingItemId(subItem.id); setIsEditDialogOpen(true); } : undefined}>
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
            <div className="h-9 px-2 flex items-center justify-center border-l border-border/50" role="gridcell">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    data-testid={`button-actions-${subItem.id}`}
                    disabled={estimate?.isLocked}
                  >
                    <MoreVertical className="w-4 h-4" />
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
                  {subItem.isSelection && (() => {
                    const linkedSel = selectionByEstimateItemId.get(subItem.id);
                    return (<>
                      <Separator />
                      {linkedSel ? (
                        <DropdownMenuItem
                          onClick={() => setLocation(`/selections/${linkedSel.id}`)}
                          data-testid={`button-view-selection-${subItem.id}`}
                        >
                          <ExternalLink className="w-4 h-4 mr-2" />
                          View Selection
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem
                          onClick={() => createSelectionFromItemMutation.mutate(subItem.id)}
                          data-testid={`button-create-selection-${subItem.id}`}
                          disabled={createSelectionFromItemMutation.isPending}
                        >
                          <Palette className="w-4 h-4 mr-2" />
                          Create Selection
                        </DropdownMenuItem>
                      )}
                    </>);
                  })()}
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
}
