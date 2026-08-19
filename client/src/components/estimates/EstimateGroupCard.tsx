import React, { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ChevronDown,
  ChevronRight,
  MoreVertical,
  GripVertical,
  Plus,
  Edit,
  Copy,
  Trash2,
  FileText,
  FolderPlus,
  Tag,
} from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { useQuery } from "@tanstack/react-query";
import { useSortable } from '@dnd-kit/sortable';
import { StatusBadge } from "@/components/StatusBadge";
import type { EstimateGroup, EstimateItem, CostCode, CostCategory, FieldCategoryWithOptions, FieldOption } from "@shared/schema";

/** Any key configured under Field Settings > Estimate Section Statuses. */
type GroupStatus = string;

/**
 * Used only until the field settings query resolves, or on a company that has
 * no estimate item statuses configured at all.
 */
const FALLBACK_STATUS_OPTIONS: Pick<FieldOption, "key" | "name" | "color">[] = [
  { key: "not_started", name: "Not Started", color: null },
  { key: "in_progress", name: "In Progress", color: null },
  { key: "complete", name: "Complete", color: null },
];

/**
 * A section and the lines inside it are the same kind of thing at different
 * scales, so they share one list of statuses — the estimate_item.status
 * options from Field Settings. Configure them once and both follow.
 */
function useGroupStatusOptions() {
  const { data } = useQuery<FieldCategoryWithOptions>({
    queryKey: ["/api/field-categories/by-key/estimate_item.status"],
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  const configured = (data?.options || []).filter((o) => o.isActive);
  return configured.length > 0 ? configured : FALLBACK_STATUS_OPTIONS;
}

type ColumnConfig = { id: string; label: string; visible: boolean; widthPx: number };

type GroupTotals = {
  builderCostExTax: number;
  builderCostIncTax: number;
  clientAmountExTax: number;
  clientTax: number;
  clientAmountIncTax: number;
};

interface EstimateGroupCardProps {
  group: EstimateGroup;
  groupedItems: Record<string, EstimateItem[]>;
  columns: ColumnConfig[];
  tableWidth: number;
  gridTemplate?: string;
  visibleCols?: ColumnConfig[];
  handleToggleGroupCollapse: (id: string, currentState: boolean) => void;
  renderItemRow: (item: EstimateItem, groupContext?: { isInGroup?: boolean; isLastInGroup?: boolean }, gridTemplate?: string, visibleCols?: ColumnConfig[], rowIndex?: number) => React.ReactNode;
  onDeleteGroup: (groupId: string) => void;
  onEditGroup: (groupId: string) => void;
  onDuplicateGroup: (groupId: string) => void;
  onCopyGroup: (groupId: string) => void;
  onAddSubgroup: (parentGroupId: string) => void;
  onAddItemToGroup: (groupId: string) => void;
  onInlineAddItem?: (groupId: string, name: string) => Promise<void>;
  isLocked: boolean;
  selectedItems: Set<string>;
  selectedGroups: Set<string>;
  onToggleGroupSelection: (groupId: string) => void;
  nestingLevel?: number;
  groupTotals?: GroupTotals;
  groupTotalsMap?: Record<string, GroupTotals>;
  formatCurrency: (amount: number) => string;
  subgroups?: EstimateGroup[];
  allGroups?: EstimateGroup[];
  onCreateFrom: () => void;
  activeDragId?: string | null;
  hideAddLines?: boolean;
  groupIndex?: number;
  onApplyCostCode?: (groupId: string) => void;
  costCodes?: CostCode[];
  costCategories?: CostCategory[];
  dropIndicator?: 'above' | 'below' | null;
  dropTarget?: { id: string; position: 'above' | 'below' } | null;
  onUpdateStatus?: (groupId: string, status: GroupStatus) => void;
}

export const EstimateGroupCard: React.FC<EstimateGroupCardProps> = ({
  group,
  groupedItems,
  columns,
  tableWidth,
  gridTemplate: parentGridTemplate,
  visibleCols: parentVisibleCols,
  handleToggleGroupCollapse,
  renderItemRow,
  onDeleteGroup,
  onEditGroup,
  onDuplicateGroup,
  onCopyGroup,
  onAddSubgroup,
  onAddItemToGroup,
  onInlineAddItem,
  isLocked,
  selectedItems,
  selectedGroups,
  onToggleGroupSelection,
  nestingLevel = 0,
  groupTotals,
  groupTotalsMap,
  formatCurrency,
  subgroups = [],
  allGroups = [],
  onCreateFrom,
  activeDragId,
  hideAddLines = false,
  groupIndex = 0,
  onApplyCostCode,
  costCodes = [],
  costCategories = [],
  dropIndicator,
  dropTarget,
  onUpdateStatus,
}) => {
  // Resolve this card's totals: prefer the map (accurate for nested groups) over the prop
  const effectiveGroupTotals = groupTotalsMap?.[group.id] ?? groupTotals;
  // Resolve drop indicator: when dropTarget is provided (recursive renders) compute locally
  const effectiveDropIndicator = dropTarget != null
    ? (dropTarget.id === `group-${group.id}` ? dropTarget.position : null)
    : dropIndicator;
  const [isAdding, setIsAdding] = useState(false);

  const handleAddLine = async () => {
    if (!onInlineAddItem || isAdding) return;
    setIsAdding(true);
    try {
      await onInlineAddItem(group.id, '');
    } catch (error) {
      console.error('Failed to add item:', error);
    } finally {
      setIsAdding(false);
    }
  };

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ 
    id: `group-${group.id}`,
    animateLayoutChanges: () => false,
  });

  const isItemBeingDragged = activeDragId && !String(activeDragId).startsWith('group-');
  const shouldApplyTransform = transform && !isItemBeingDragged;
  
  const style = {
    transform: shouldApplyTransform ? `translateY(${Math.round(transform.y)}px)` : undefined,
    transition: transition || 'transform 150ms ease',
    opacity: isDragging ? 0.4 : 1,
    minWidth: `${tableWidth}px`,
  };

  const isGroupSelected = selectedGroups.has(group.id);
  const childSubgroups = subgroups
    .filter(sg => sg.parentGroupId === group.id)
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  const isExpanded = !group.isCollapsed;
  const groupItems = groupedItems[group.id] || [];
  
  const visibleCols = parentVisibleCols || columns.filter(col => col.visible);
  const gridTemplate = parentGridTemplate || `40px ${visibleCols.map(c => `${c.widthPx}px`).join(' ')} 80px`;
  const cellBase = "h-9 px-2 flex items-center text-sm overflow-hidden";

  // Right-click opens the full list; left click just cycles.
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const statusOptions = useGroupStatusOptions();
  const currentStatus = ((group as any).status as GroupStatus) || statusOptions[0]?.key || "not_started";
  const currentStatusOption = statusOptions.find((o) => o.key === currentStatus);
  // A status removed from Field Settings after the fact still has to render.
  const statusLabel = currentStatusOption?.name
    ?? currentStatus.replace(/[_-]+/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative group/grp ${nestingLevel > 0 ? 'ml-8' : ''}`}
      data-sortable-group-id={group.id}
    >
      {effectiveDropIndicator === 'above' && (
        <div className="absolute -top-[2px] left-0 right-0 h-1 bg-primary z-50 rounded-full shadow-[0_0_8px_rgba(168,144,212,0.6)]" />
      )}
      {effectiveDropIndicator === 'below' && (
        <div className="absolute -bottom-[2px] left-0 right-0 h-1 bg-primary z-50 rounded-full shadow-[0_0_8px_rgba(168,144,212,0.6)]" />
      )}
    <Card
      className={`rounded-xl border border-border bg-card shadow-sm mb-4 overflow-hidden ${isGroupSelected ? 'ring-2 ring-primary' : ''}`}
      data-testid={`card-group-${group.id}`}
    >
      {/* Group Header - CSS Grid */}
      <div
        role="row"
        style={{
          display: 'grid',
          gridTemplateColumns: gridTemplate,
          width: `${tableWidth}px`,
          minWidth: `${tableWidth}px`
        }}
        className="relative h-9 group/ghead bg-primary/5 dark:bg-primary/10 hover:bg-primary/10 transition-colors border-b border-border"
        data-testid={`row-group-${group.id}`}
      >
        {/* Drag handle — only on GROUP-ROW hover (not when hovering the group's items) */}
        {!isLocked && (
          <div
            {...attributes}
            {...listeners}
            className="absolute left-0 top-0 h-9 w-5 flex items-center justify-center opacity-0 group-hover/ghead:opacity-100 text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing transition-all z-20"
            data-testid={`drag-handle-group-${group.id}`}
            title="Drag to reorder group"
          >
            <GripVertical className="h-4 w-4" />
          </div>
        )}
        {/* Purple left stripe */}
        <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary z-10 pointer-events-none" />
        {/* Checkbox — pl-5 clears the drag-handle lane at the left */}
        <div className="h-9 pl-5 pr-1 flex items-center" role="gridcell">
          <Checkbox
            checked={isGroupSelected}
            onCheckedChange={() => onToggleGroupSelection(group.id)}
            aria-label={`Select group ${group.name}`}
            data-testid={`checkbox-group-${group.id}`}
            disabled={isLocked}
          />
        </div>
        {/* Dynamic columns */}
        {visibleCols.map(column => {
          if (column.id === 'item') {
            return (
              <div key={column.id} className={`${cellBase} font-semibold`} role="gridcell">
                <div className="flex items-center gap-2 min-w-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 flex-shrink-0"
                    onClick={() => handleToggleGroupCollapse(group.id, group.isCollapsed || false)}
                    data-testid={`button-toggle-group-${group.id}`}
                  >
                    {group.isCollapsed ? (
                      <ChevronRight className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </Button>
                  <span className="font-semibold text-[15px] tracking-tight flex-shrink-0">{group.name}</span>
                  {group.description && (
                    // The name keeps its full width; the description takes what
                    // is left. Previously both truncated equally, so a real
                    // description squeezed the group name down to a few letters.
                    <span
                      className="text-xs text-muted-foreground truncate min-w-0"
                      title={group.description}
                    >
                      {group.description}
                    </span>
                  )}
                  {(group as any).defaultCostCode && costCodes.length > 0 && (() => {
                    const code = costCodes.find(c => c.id === (group as any).defaultCostCode);
                    return code ? (
                      <Badge variant="outline" className="text-xs px-1.5 py-0 h-5 flex-shrink-0">
                        {code.code}
                      </Badge>
                    ) : null;
                  })()}
                  {effectiveGroupTotals && effectiveGroupTotals.builderCostExTax > 0 && (
                    <span className="text-xs font-semibold text-primary ml-auto flex-shrink-0" data-testid={`group-total-badge-${group.id}`}>
                      {formatCurrency(effectiveGroupTotals.builderCostExTax)}
                    </span>
                  )}
                </div>
              </div>
            );
          }

          // Group status badge lives in the Status column, aligned with the
          // line-item status cells below it.
          if (column.id === 'status') {
            return (
              <div key={column.id} className={cellBase} role="gridcell">
                {onUpdateStatus && !isLocked ? (
                  <DropdownMenu open={statusMenuOpen} onOpenChange={setStatusMenuOpen}>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="inline-flex rounded-[9px] hover-elevate active-elevate-2 flex-shrink-0"
                        data-testid={`badge-group-status-${group.id}`}
                        title="Click to cycle, right-click to choose"
                        // Left click cycles, matching the line-item chips below
                        // it. The full list is a right-click away, for jumping
                        // straight to a status rather than clicking through.
                        onPointerDown={(e) => e.preventDefault()}
                        onClick={(e) => {
                          e.stopPropagation();
                          const i = statusOptions.findIndex(o => o.key === currentStatus);
                          const next = statusOptions[(i + 1) % statusOptions.length];
                          if (next) onUpdateStatus(group.id, next.key);
                        }}
                        onDoubleClick={(e) => e.stopPropagation()}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setStatusMenuOpen(true);
                        }}
                      >
                        <StatusBadge status={currentStatus} label={statusLabel} />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" onClick={(e) => e.stopPropagation()}>
                      {statusOptions.map((option) => (
                        <DropdownMenuItem
                          key={option.key}
                          onClick={(e) => {
                            e.stopPropagation();
                            onUpdateStatus(group.id, option.key);
                            setStatusMenuOpen(false);
                          }}
                          className={currentStatus === option.key ? "font-medium" : ""}
                          data-testid={`menu-item-status-${option.key}-${group.id}`}
                        >
                          <StatusBadge status={option.key} label={option.name} />
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : (
                  <span className="flex-shrink-0" data-testid={`badge-group-status-${group.id}`}>
                    <StatusBadge status={currentStatus} label={statusLabel} />
                  </span>
                )}
              </div>
            );
          }

          let cellContent = '';
          if (effectiveGroupTotals) {
            if (column.id === 'builderCost') {
              cellContent = formatCurrency(effectiveGroupTotals.builderCostExTax);
            } else if (column.id === 'builderCostIncTax') {
              cellContent = formatCurrency(effectiveGroupTotals.builderCostIncTax);
            } else if (column.id === 'clientPriceExTax') {
              cellContent = formatCurrency(effectiveGroupTotals.clientAmountExTax);
            } else if (column.id === 'clientTax') {
              cellContent = formatCurrency(effectiveGroupTotals.clientTax);
            } else if (column.id === 'clientPriceIncTax') {
              cellContent = formatCurrency(effectiveGroupTotals.clientAmountIncTax);
            }
          }

          return (
            <div
              key={column.id}
              className={`${cellBase} font-semibold`}
              role="gridcell"
              data-testid={cellContent ? `group-total-${column.id}-${group.id}` : undefined}
            >
              {cellContent}
            </div>
          );
        })}
        {/* Actions menu cell — centered + left divider to match line-item rows */}
        <div className={`${cellBase} justify-center border-l border-border/50`} role="gridcell">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                data-testid={`button-group-menu-${group.id}`}
                disabled={isLocked}
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => onAddSubgroup(group.id)}
                data-testid={`button-add-subgroup-${group.id}`}
                disabled={isLocked}
              >
                <FolderPlus className="w-4 h-4 mr-2" />
                Add Subgroup
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onAddItemToGroup(group.id)}
                data-testid={`button-add-item-to-group-${group.id}`}
                disabled={isLocked}
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Item
              </DropdownMenuItem>
              <Separator />
              <DropdownMenuItem
                onClick={() => onEditGroup(group.id)}
                data-testid={`button-edit-group-${group.id}`}
                disabled={isLocked}
              >
                <Edit className="w-4 h-4 mr-2" />
                Edit Group
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onDuplicateGroup(group.id)}
                data-testid={`button-duplicate-group-${group.id}`}
                disabled={isLocked}
              >
                <Copy className="w-4 h-4 mr-2" />
                Duplicate
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onCopyGroup(group.id)}
                data-testid={`button-copy-group-${group.id}`}
                disabled={isLocked}
              >
                <FileText className="w-4 h-4 mr-2" />
                Copy To...
              </DropdownMenuItem>
              <Separator />
              <DropdownMenuItem
                onClick={onCreateFrom}
                data-testid={`button-create-from-group-${group.id}`}
                disabled={isLocked}
              >
                <Plus className="w-4 h-4 mr-2" />
                Create from...
              </DropdownMenuItem>
              {((group as any).defaultCostCode || (group as any).defaultCostCategoryId) && onApplyCostCode && (
                <>
                  <Separator />
                  <DropdownMenuItem
                    onClick={() => onApplyCostCode(group.id)}
                    data-testid={`button-apply-cost-code-${group.id}`}
                    disabled={isLocked}
                  >
                    <Tag className="w-4 h-4 mr-2" />
                    Apply to all items
                  </DropdownMenuItem>
                </>
              )}
              <Separator />
              <DropdownMenuItem
                onClick={() => onDeleteGroup(group.id)}
                data-testid={`button-delete-group-${group.id}`}
                className="text-destructive"
                disabled={isLocked}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete Group
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Animated Collapsible Content */}
      <div 
        className="grid transition-[grid-template-rows] duration-300 ease-in-out"
        style={{ gridTemplateRows: isExpanded ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden">
          {groupItems.length > 0 && (
            <div 
              role="rowgroup"
              style={{ width: `${tableWidth}px`, minWidth: `${tableWidth}px` }}
            >
              {groupItems.map((item, index, array) => {
                const isLastInGroup = index === array.length - 1 && childSubgroups.length === 0;
                return renderItemRow(item, { isInGroup: true, isLastInGroup }, gridTemplate, visibleCols, index);
              })}
            </div>
          )}

          {!isLocked && !hideAddLines && (
            <div 
              role="row"
              style={{ 
                display: 'grid', 
                gridTemplateColumns: gridTemplate,
                width: `${tableWidth}px`,
                minWidth: `${tableWidth}px`
              }}
              className="h-10 transition-colors border-t border-border hover:bg-primary/5 group/addline cursor-pointer"
            >
              <div className="h-10 px-2 flex items-center" role="gridcell" />
              <div className="h-10 px-2 flex items-center col-span-1" role="gridcell">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-xs font-medium text-primary/70 hover:text-primary transition-colors"
                  onClick={onInlineAddItem ? handleAddLine : () => onAddItemToGroup(group.id)}
                  disabled={isAdding}
                  data-testid={`button-add-line-${group.id}`}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  {isAdding ? 'Adding...' : 'Add Line'}
                </Button>
              </div>
            </div>
          )}

          {childSubgroups.map((childGroup, childIndex) => (
            <div key={`subgroup-${childGroup.id}`} className="border-t border-border/50">
              <EstimateGroupCard
                group={childGroup}
                groupedItems={groupedItems}
                columns={columns}
                tableWidth={tableWidth}
                gridTemplate={gridTemplate}
                visibleCols={visibleCols}
                handleToggleGroupCollapse={handleToggleGroupCollapse}
                renderItemRow={renderItemRow}
                onDeleteGroup={onDeleteGroup}
                onEditGroup={onEditGroup}
                onDuplicateGroup={onDuplicateGroup}
                onCopyGroup={onCopyGroup}
                onAddSubgroup={onAddSubgroup}
                onAddItemToGroup={onAddItemToGroup}
                onInlineAddItem={onInlineAddItem}
                isLocked={isLocked}
                selectedItems={selectedItems}
                selectedGroups={selectedGroups}
                onToggleGroupSelection={onToggleGroupSelection}
                nestingLevel={nestingLevel + 1}
                groupTotals={groupTotalsMap?.[childGroup.id]}
                groupTotalsMap={groupTotalsMap}
                formatCurrency={formatCurrency}
                subgroups={subgroups}
                allGroups={allGroups}
                onCreateFrom={onCreateFrom}
                activeDragId={activeDragId}
                hideAddLines={hideAddLines}
                groupIndex={childIndex}
                onApplyCostCode={onApplyCostCode}
                costCodes={costCodes}
                costCategories={costCategories}
                dropTarget={dropTarget}
                onUpdateStatus={onUpdateStatus}
              />
            </div>
          ))}
        </div>
      </div>
    </Card>
    </div>
  );
};
