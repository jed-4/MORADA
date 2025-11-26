import React from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from "@/components/ui/table";
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
  handleToggleGroupCollapse: (id: string, currentState: boolean) => void;
  renderItemRow: (item: EstimateItem, groupContext?: { isInGroup?: boolean; isLastInGroup?: boolean }) => React.ReactNode;
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

  return (
    <Card 
      ref={setNodeRef}
      style={style}
      className={`rounded-xl overflow-visible ${nestingLevel > 0 ? 'ml-8' : ''} ${isGroupSelected ? 'ring-2 ring-[#bba7db]' : ''}`}
      data-testid={`card-group-${group.id}`}
    >
      <Table style={{ tableLayout: 'fixed', width: `${tableWidth}px`, minWidth: `${tableWidth}px` }}>
        <colgroup>
          <col style={{ width: '32px' }} />
          <col style={{ width: '24px' }} />
          {columns.filter(col => col.visible).map(column => (
            <col key={column.id} style={{ width: `${column.widthPx}px`, minWidth: `${column.widthPx}px` }} />
          ))}
          <col style={{ width: '80px' }} />
        </colgroup>
        <TableBody>
          {/* Group header row */}
          <TableRow className="h-9 bg-muted/30">
            <TableCell className="py-1 text-xs font-semibold" style={{ width: '32px' }}>
              <div
                {...attributes}
                {...listeners}
                className="cursor-grab active:cursor-grabbing opacity-0 hover:opacity-100 transition-opacity"
                data-testid={`drag-handle-group-${group.id}`}
              >
                <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
            </TableCell>
            <TableCell className="py-1 text-xs font-semibold" style={{ width: '24px' }}>
              <Checkbox
                checked={isGroupSelected}
                onCheckedChange={() => onToggleGroupSelection(group.id)}
                aria-label={`Select group ${group.name}`}
                data-testid={`checkbox-group-${group.id}`}
                disabled={isLocked}
              />
            </TableCell>
            {columns.filter(col => col.visible).map(column => {
              if (column.id === 'item') {
                return (
                  <TableCell key={column.id} className="py-1 text-xs font-semibold" style={{ width: `${column.widthPx}px` }}>
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
                      {/* Group total badge - always visible in header */}
                      {groupTotals && groupTotals.clientAmountIncTax > 0 && (
                        <span className="text-xs font-semibold text-[#7c5bb0] ml-auto flex-shrink-0" data-testid={`group-total-badge-${group.id}`}>
                          {formatCurrency(groupTotals.clientAmountIncTax)}
                        </span>
                      )}
                    </div>
                  </TableCell>
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
                <TableCell
                  key={column.id}
                  className="py-1 text-xs font-semibold"
                  style={{ width: `${column.widthPx}px` }}
                  data-testid={cellContent ? `group-total-${column.id}-${group.id}` : undefined}
                >
                  {cellContent}
                </TableCell>
              );
            })}
            <TableCell className="py-1 text-xs font-semibold" style={{ width: '80px' }}>
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
            </TableCell>
          </TableRow>
          
          {/* Group items */}
          {!group.isCollapsed && groupedItems[group.id]?.map((item, index, array) => {
            const isLastInGroup = index === array.length - 1 && childSubgroups.length === 0;
            return renderItemRow(item, { isInGroup: true, isLastInGroup });
          })}
        </TableBody>
      </Table>

      {!group.isCollapsed && childSubgroups.map((childGroup) => (
        <div key={`subgroup-${childGroup.id}`} className="border-t">
          <EstimateGroupCard
            group={childGroup}
            groupedItems={groupedItems}
            columns={columns}
            tableWidth={tableWidth}
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
    </Card>
  );
};
