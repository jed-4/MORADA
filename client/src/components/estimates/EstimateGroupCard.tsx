import React, { useState, useRef, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
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
  Check,
  X,
} from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { useSortable } from '@dnd-kit/sortable';
import type { EstimateGroup, EstimateItem } from "@shared/schema";

type ColumnConfig = { id: string; label: string; visible: boolean; widthPx: number };

interface EstimateGroupCardProps {
  group: EstimateGroup;
  groupedItems: Record<string, EstimateItem[]>;
  columns: ColumnConfig[];
  tableWidth: number;
  gridTemplate?: string;
  visibleCols?: ColumnConfig[];
  handleToggleGroupCollapse: (id: string, currentState: boolean) => void;
  renderItemRow: (item: EstimateItem, groupContext?: { isInGroup?: boolean; isLastInGroup?: boolean }, gridTemplate?: string, visibleCols?: ColumnConfig[]) => React.ReactNode;
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
  groupTotals?: {
    builderCostExTax: number;
    builderCostIncTax: number;
    clientAmountExTax: number;
    clientTax: number;
    clientAmountIncTax: number;
  };
  formatCurrency: (amount: number) => string;
  subgroups?: EstimateGroup[];
  allGroups?: EstimateGroup[];
  onCreateFrom: () => void;
  activeDragId?: string | null;
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
  formatCurrency,
  subgroups = [],
  allGroups = [],
  onCreateFrom,
  activeDragId,
}) => {
  const [isAddingLine, setIsAddingLine] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when adding line mode is activated
  useEffect(() => {
    if (isAddingLine && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isAddingLine]);

  const handleStartAddLine = () => {
    setIsAddingLine(true);
    setNewItemName('');
  };

  const handleCancelAddLine = () => {
    setIsAddingLine(false);
    setNewItemName('');
  };

  const handleSaveNewLine = async () => {
    if (!newItemName.trim() || !onInlineAddItem) {
      handleCancelAddLine();
      return;
    }
    
    setIsSaving(true);
    try {
      await onInlineAddItem(group.id, newItemName.trim());
      setNewItemName('');
      // Keep input focused for adding more items
      if (inputRef.current) {
        inputRef.current.focus();
      }
    } catch (error) {
      console.error('Failed to add item:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSaveNewLine();
    } else if (e.key === 'Escape') {
      handleCancelAddLine();
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

  // Check if an item (not a group) is being dragged
  // When an item is being dragged, we should NOT apply transforms to groups
  // This prevents groups from flying around when their child items are dragged
  const isItemBeingDragged = activeDragId && !String(activeDragId).startsWith('group-');
  
  // Only apply transforms when this group itself is being dragged OR when a group is being reordered
  // Never apply transforms when an item (line item) is being dragged
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
  
  // Use passed visibleCols for consistency with parent, fallback to filtering columns
  const visibleCols = parentVisibleCols || columns.filter(col => col.visible);
  const gridTemplate = parentGridTemplate || `32px 24px ${visibleCols.map(c => `${c.widthPx}px`).join(' ')} 80px`;
  const cellBase = "h-10 px-2 flex items-center text-sm overflow-hidden";

  return (
    <Card 
      ref={setNodeRef}
      style={style}
      className={`rounded-xl overflow-visible ${nestingLevel > 0 ? 'ml-8' : ''} ${isGroupSelected ? 'ring-2 ring-[#bba7db]' : ''}`}
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
        className="h-10 bg-muted/30 hover:bg-muted/50 transition-colors border-b border-gray-100 dark:border-gray-800"
        data-testid={`row-group-${group.id}`}
      >
        {/* Drag handle */}
        <div className="h-10 px-1 flex items-center justify-center" role="gridcell">
          <div
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing opacity-0 hover:opacity-100 transition-opacity"
            data-testid={`drag-handle-group-${group.id}`}
          >
            <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
        </div>
        {/* Checkbox */}
        <div className="h-10 px-2 flex items-center" role="gridcell">
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
              <div key={column.id} className={`${cellBase} text-xs font-semibold`} role="gridcell">
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
                  <span className="font-semibold text-xs truncate">{group.name}</span>
                  {group.description && (
                    <span className="text-xs text-muted-foreground truncate">- {group.description}</span>
                  )}
                  {groupTotals && groupTotals.clientAmountIncTax > 0 && (
                    <span className="text-xs font-semibold text-[#7c5bb0] ml-auto flex-shrink-0" data-testid={`group-total-badge-${group.id}`}>
                      {formatCurrency(groupTotals.clientAmountIncTax)}
                    </span>
                  )}
                </div>
              </div>
            );
          }

          let cellContent = '';
          if (groupTotals) {
            if (column.id === 'builderCost') {
              cellContent = formatCurrency(groupTotals.builderCostExTax);
            } else if (column.id === 'builderCostIncTax') {
              cellContent = formatCurrency(groupTotals.builderCostIncTax);
            } else if (column.id === 'clientPriceExTax') {
              cellContent = formatCurrency(groupTotals.clientAmountExTax);
            } else if (column.id === 'clientTax') {
              cellContent = formatCurrency(groupTotals.clientTax);
            } else if (column.id === 'clientPriceIncTax') {
              cellContent = formatCurrency(groupTotals.clientAmountIncTax);
            }
          }

          return (
            <div
              key={column.id}
              className={`${cellBase} text-xs font-semibold`}
              role="gridcell"
              data-testid={cellContent ? `group-total-${column.id}-${group.id}` : undefined}
            >
              {cellContent}
            </div>
          );
        })}
        {/* Actions menu cell */}
        <div className={`${cellBase} justify-end`} role="gridcell">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
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

      {/* Animated Collapsible Content - CSS Grid animation for smooth expand/collapse */}
      <div 
        className="grid transition-[grid-template-rows] duration-300 ease-in-out"
        style={{ gridTemplateRows: isExpanded ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden">
          {/* Group items - CSS Grid rows */}
          {groupItems.length > 0 && (
            <div 
              role="rowgroup"
              style={{ width: `${tableWidth}px`, minWidth: `${tableWidth}px` }}
            >
              {groupItems.map((item, index, array) => {
                const isLastInGroup = index === array.length - 1 && childSubgroups.length === 0;
                return renderItemRow(item, { isInGroup: true, isLastInGroup }, gridTemplate, visibleCols);
              })}
            </div>
          )}

          {/* Add Line row - shows inline input when adding, otherwise shows button */}
          {!isLocked && (
            <div 
              role="row"
              style={{ 
                display: 'grid', 
                gridTemplateColumns: gridTemplate,
                width: `${tableWidth}px`,
                minWidth: `${tableWidth}px`
              }}
              className={`h-10 transition-colors border-b border-gray-100 dark:border-gray-800 ${isAddingLine ? 'bg-muted/20' : 'hover:bg-muted/30'} group/addline`}
            >
              {/* Empty drag handle cell */}
              <div className="h-10 px-1 flex items-center justify-center" role="gridcell" />
              {/* Empty checkbox cell */}
              <div className="h-10 px-2 flex items-center" role="gridcell" />
              
              {isAddingLine ? (
                <>
                  {/* Inline input for new item name */}
                  {visibleCols.map((column, idx) => {
                    if (column.id === 'item') {
                      return (
                        <div key={column.id} className="h-10 px-2 flex items-center gap-2" role="gridcell">
                          <Input
                            ref={inputRef}
                            value={newItemName}
                            onChange={(e) => setNewItemName(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Enter item name..."
                            className="h-7 text-sm flex-1"
                            disabled={isSaving}
                            data-testid={`input-new-item-name-${group.id}`}
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-green-600 hover:text-green-700 hover:bg-green-50"
                            onClick={handleSaveNewLine}
                            disabled={isSaving || !newItemName.trim()}
                            data-testid={`button-save-new-item-${group.id}`}
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-foreground"
                            onClick={handleCancelAddLine}
                            disabled={isSaving}
                            data-testid={`button-cancel-new-item-${group.id}`}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      );
                    }
                    return <div key={column.id} className="h-10 px-2 flex items-center text-sm text-muted-foreground" role="gridcell" />;
                  })}
                  {/* Empty actions cell */}
                  <div className="h-10 px-2 flex items-center" role="gridcell" />
                </>
              ) : (
                <>
                  {/* Add line button */}
                  <div className="h-10 px-2 flex items-center col-span-1" role="gridcell">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground opacity-60 group-hover/addline:opacity-100 transition-opacity"
                      onClick={onInlineAddItem ? handleStartAddLine : () => onAddItemToGroup(group.id)}
                      data-testid={`button-add-line-${group.id}`}
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      Add Line
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Child subgroups */}
          {childSubgroups.map((childGroup) => (
            <div key={`subgroup-${childGroup.id}`} className="border-t">
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
                groupTotals={groupTotals}
                formatCurrency={formatCurrency}
                subgroups={subgroups}
                allGroups={allGroups}
                onCreateFrom={onCreateFrom}
                activeDragId={activeDragId}
              />
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
};
