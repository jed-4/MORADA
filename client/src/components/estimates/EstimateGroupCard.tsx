import React from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
} from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { EstimateGroup, EstimateItem } from "@shared/schema";

interface EstimateGroupCardProps {
  group: EstimateGroup;
  groupedItems: Record<string, EstimateItem[]>;
  columns: Array<{ id: string; label: string; visible: boolean; widthPx: number }>;
  tableWidth: number;
  gridTemplate?: string;
  handleToggleGroupCollapse: (id: string, currentState: boolean) => void;
  renderItemRow: (item: EstimateItem, groupContext?: { isInGroup?: boolean; isLastInGroup?: boolean }, gridTemplate?: string) => React.ReactNode;
  onDeleteGroup: (groupId: string) => void;
  onEditGroup: (groupId: string) => void;
  onDuplicateGroup: (groupId: string) => void;
  onCopyGroup: (groupId: string) => void;
  onAddSubgroup: (parentGroupId: string) => void;
  onAddItemToGroup: (groupId: string) => void;
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
}

export const EstimateGroupCard: React.FC<EstimateGroupCardProps> = ({
  group,
  groupedItems,
  columns,
  tableWidth,
  gridTemplate: parentGridTemplate,
  handleToggleGroupCollapse,
  renderItemRow,
  onDeleteGroup,
  onEditGroup,
  onDuplicateGroup,
  onCopyGroup,
  onAddSubgroup,
  onAddItemToGroup,
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
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `group-${group.id}` });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: transition || 'transform 200ms ease-in-out',
    opacity: isDragging ? 0.4 : 1,
    minWidth: `${tableWidth}px`,
  };

  const isGroupSelected = selectedGroups.has(group.id);
  const childSubgroups = subgroups
    .filter(sg => sg.parentGroupId === group.id)
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  const isExpanded = !group.isCollapsed;
  const groupItems = groupedItems[group.id] || [];
  
  // Generate CSS Grid template
  const visibleCols = columns.filter(col => col.visible);
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
                return renderItemRow(item, { isInGroup: true, isLastInGroup }, gridTemplate);
              })}
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
                handleToggleGroupCollapse={handleToggleGroupCollapse}
                renderItemRow={renderItemRow}
                onDeleteGroup={onDeleteGroup}
                onEditGroup={onEditGroup}
                onDuplicateGroup={onDuplicateGroup}
                onCopyGroup={onCopyGroup}
                onAddSubgroup={onAddSubgroup}
                onAddItemToGroup={onAddItemToGroup}
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
              />
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
};
