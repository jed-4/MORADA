import { ScheduleItem } from "@shared/schema";
import { CasvaScheduleRow } from "./CasvaScheduleRow";
import { Table, TableHeader, TableRow, TableHead, TableBody } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { useState, Fragment, useEffect, useRef, useCallback } from "react";

interface StatusOption {
  id: string;
  value: string;
  label: string;
  color?: string;
}

interface VisibleColumns {
  item: boolean;
  assignee: boolean;
  type: boolean;
  dueDate: boolean;
  status: boolean;
  completion: boolean;
}

export interface CasvaScheduleListProps {
  items: ScheduleItem[];
  noteCounts?: Record<string, number>;
  onEditItem: (item: ScheduleItem) => void;
  onStatusChange?: (itemId: string, newStatus: string) => void;
  onCompletionToggle?: (itemId: string, currentPercent: number) => void;
  statusOptions?: StatusOption[];
  maxHeight?: string;
  visibleColumns?: VisibleColumns;
  selectedItems?: Set<string>;
  onSelectionChange?: (selectedIds: Set<string>) => void;
  onNestItem?: (itemId: string, newParentId: string | null) => void;
  onReorderItem?: (itemId: string, afterItemId: string | null, newParentId: string | null) => void;
  onDuplicateItem?: (item: ScheduleItem) => void;
  onDeleteItem?: (itemId: string) => void;
}

type DropTarget = {
  type: 'between';
  afterItemId: string | null;
  beforeItemId: string | null;
} | {
  type: 'nest';
  targetId: string;
};

export function CasvaScheduleList({ 
  items, 
  noteCounts = {},
  onEditItem,
  onStatusChange,
  onCompletionToggle,
  statusOptions = [],
  maxHeight = "calc(100vh - 280px)",
  visibleColumns = { item: true, assignee: true, type: true, dueDate: true, status: true, completion: true },
  selectedItems = new Set(),
  onSelectionChange,
  onNestItem,
  onReorderItem,
  onDuplicateItem,
  onDeleteItem
}: CasvaScheduleListProps) {
  const [collapsedItems, setCollapsedItems] = useState<Set<string>>(new Set());
  const [ripples, setRipples] = useState<{id: string, x: number, y: number}[]>([]);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [touchStartY, setTouchStartY] = useState<number | null>(null);

  const [draggingItemId, setDraggingItemId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverItemRef = useRef<string | null>(null);

  const toggleSelection = (itemId: string, e?: React.MouseEvent) => {
    if (!onSelectionChange) return;
    e?.stopPropagation();
    const newSelection = new Set(Array.from(selectedItems));
    if (newSelection.has(itemId)) {
      newSelection.delete(itemId);
    } else {
      newSelection.add(itemId);
    }
    onSelectionChange(newSelection);
  };

  const toggleSelectAll = () => {
    if (!onSelectionChange) return;
    if (selectedItems.size === items.length) {
      onSelectionChange(new Set<string>());
    } else {
      onSelectionChange(new Set<string>(items.map(i => i.id)));
    }
  };

  const isDescendant = (sourceId: string, targetId: string): boolean => {
    const target = items.find(i => i.id === targetId);
    if (!target) return false;
    if (target.parentItemId === sourceId) return true;
    if (target.parentItemId) {
      return isDescendant(sourceId, target.parentItemId);
    }
    return false;
  };

  const flatRows = (() => {
    const parentItems = items.filter(item => !item.parentItemId);
    const subtasksByParent = items.reduce((acc, item) => {
      if (item.parentItemId) {
        if (!acc[item.parentItemId]) acc[item.parentItemId] = [];
        acc[item.parentItemId].push(item);
      }
      return acc;
    }, {} as Record<string, ScheduleItem[]>);

    const rows: { item: ScheduleItem; isSubtask: boolean; parentId: string | null }[] = [];
    for (const parent of parentItems) {
      rows.push({ item: parent, isSubtask: false, parentId: null });
      const subs = subtasksByParent[parent.id] || [];
      if (!collapsedItems.has(parent.id)) {
        for (const sub of subs) {
          rows.push({ item: sub, isSubtask: true, parentId: parent.id });
        }
      }
    }
    return rows;
  })();

  const handleDragStart = (e: React.DragEvent, itemId: string) => {
    e.dataTransfer.setData("scheduleItemId", itemId);
    e.dataTransfer.effectAllowed = "move";
    setDraggingItemId(itemId);
    setDropTarget(null);
  };

  const droppedRef = useRef(false);

  const handleDragEnd = () => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    hoverItemRef.current = null;
    
    if (!droppedRef.current) {
      setDraggingItemId(null);
      setDropTarget(null);
    }
    droppedRef.current = false;
  };

  const handleDragOver = useCallback((e: React.DragEvent, itemId: string, rowIndex: number) => {
    e.preventDefault();
    if (!draggingItemId || draggingItemId === itemId || isDescendant(draggingItemId, itemId)) {
      e.dataTransfer.dropEffect = "none";
      return;
    }
    e.dataTransfer.dropEffect = "move";

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const y = e.clientY - rect.top;
    const height = rect.height;
    const inTopZone = y < height * 0.3;
    const inBottomZone = y > height * 0.7;

    if (inTopZone) {
      if (hoverTimerRef.current) {
        clearTimeout(hoverTimerRef.current);
        hoverTimerRef.current = null;
      }
      hoverItemRef.current = null;
      const prevRow = rowIndex > 0 ? flatRows[rowIndex - 1] : null;
      setDropTarget({
        type: 'between',
        afterItemId: prevRow ? prevRow.item.id : null,
        beforeItemId: itemId,
      });
    } else if (inBottomZone) {
      if (hoverTimerRef.current) {
        clearTimeout(hoverTimerRef.current);
        hoverTimerRef.current = null;
      }
      hoverItemRef.current = null;
      setDropTarget({
        type: 'between',
        afterItemId: itemId,
        beforeItemId: rowIndex < flatRows.length - 1 ? flatRows[rowIndex + 1].item.id : null,
      });
    } else {
      if (hoverItemRef.current !== itemId) {
        if (hoverTimerRef.current) {
          clearTimeout(hoverTimerRef.current);
        }
        hoverItemRef.current = itemId;
        setDropTarget({
          type: 'between',
          afterItemId: itemId,
          beforeItemId: rowIndex < flatRows.length - 1 ? flatRows[rowIndex + 1].item.id : null,
        });
        hoverTimerRef.current = setTimeout(() => {
          setDropTarget({ type: 'nest', targetId: itemId });
          hoverTimerRef.current = null;
        }, 1000);
      }
    }
  }, [draggingItemId, flatRows]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    const relatedTarget = e.relatedTarget as HTMLElement | null;
    if (relatedTarget && (e.currentTarget as HTMLElement).contains(relatedTarget)) {
      return;
    }
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    hoverItemRef.current = null;
    setDropTarget(null);
  }, []);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    droppedRef.current = true;
    
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    hoverItemRef.current = null;
    
    const currentDrag = draggingItemId;
    const currentTarget = dropTarget;
    
    setDraggingItemId(null);
    setDropTarget(null);
    
    if (currentDrag && currentTarget) {
      if (currentTarget.type === 'nest') {
        if (onNestItem && !isDescendant(currentDrag, currentTarget.targetId)) {
          onNestItem(currentDrag, currentTarget.targetId);
        }
      } else if (currentTarget.type === 'between') {
        const draggedItem = items.find(i => i.id === currentDrag);
        const afterItem = currentTarget.afterItemId ? items.find(i => i.id === currentTarget.afterItemId) : null;
        const targetParentId = afterItem?.parentItemId || null;
        
        if (onReorderItem) {
          onReorderItem(currentDrag, currentTarget.afterItemId, targetParentId);
        } else if (onNestItem && draggedItem?.parentItemId !== targetParentId) {
          onNestItem(currentDrag, targetParentId);
        }
      }
    }
  };

  if (items.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <p>No schedule items found</p>
      </div>
    );
  }

  const toggleCollapse = (itemId: string) => {
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

  const handleRowClick = (e: React.MouseEvent, itemId: string) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const rippleId = `${itemId}-${Date.now()}`;
    setRipples(prev => [...prev, { id: rippleId, x, y }]);
    
    setTimeout(() => {
      setRipples(prev => prev.filter(r => r.id !== rippleId));
    }, 600);
  };

  const handleTouchStart = (e: React.TouchEvent, item: ScheduleItem) => {
    const touch = e.touches[0];
    setTouchStartX(touch.clientX);
    setTouchStartY(touch.clientY);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartX === null || touchStartY === null) return;
    
    const touch = e.touches[0];
    const deltaX = touch.clientX - touchStartX;
    const deltaY = touch.clientY - touchStartY;
    
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 50) {
      e.preventDefault();
    }
  };

  const handleTouchEnd = (e: React.TouchEvent, item: ScheduleItem) => {
    if (touchStartX === null || touchStartY === null) return;
    
    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - touchStartX;
    const deltaY = touch.clientY - touchStartY;
    
    if (Math.abs(deltaX) > Math.abs(deltaY) && deltaX < -100) {
      onEditItem(item);
    }
    
    setTouchStartX(null);
    setTouchStartY(null);
  };

  const parentItemsList = items.filter(item => !item.parentItemId);
  const subtasksByParent = items.reduce((acc, item) => {
    if (item.parentItemId) {
      if (!acc[item.parentItemId]) acc[item.parentItemId] = [];
      acc[item.parentItemId].push(item);
    }
    return acc;
  }, {} as Record<string, ScheduleItem[]>);

  const isAllSelected = items.length > 0 && selectedItems.size === items.length;
  const isSomeSelected = selectedItems.size > 0 && selectedItems.size < items.length;

  const getInsertionLinePosition = (itemId: string): 'top' | 'bottom' | null => {
    if (!dropTarget || dropTarget.type !== 'between' || !draggingItemId) return null;
    if (dropTarget.beforeItemId === itemId) return 'top';
    if (dropTarget.afterItemId === itemId && !dropTarget.beforeItemId) return 'bottom';
    return null;
  };

  const isNestTarget = (itemId: string): boolean => {
    return !!dropTarget && dropTarget.type === 'nest' && dropTarget.targetId === itemId;
  };

  let rowIndex = 0;

  return (
    <div className="border rounded-lg bg-card overflow-hidden">
      <ScrollArea style={{ maxHeight }} className="w-full">
        <Table>
          <TableHeader className="sticky top-0 bg-background z-10">
            <TableRow className="hover:bg-transparent border-b h-8">
              {onSelectionChange && (
                <TableHead className="w-8 h-8 py-0 pl-2">
                  <Checkbox
                    checked={isAllSelected}
                    ref={(el) => {
                      if (el) (el as any).indeterminate = isSomeSelected;
                    }}
                    onCheckedChange={toggleSelectAll}
                    className="h-3.5 w-3.5"
                    data-testid="checkbox-select-all"
                  />
                </TableHead>
              )}
              {visibleColumns.item && <TableHead className="font-semibold h-8 py-0 text-xs">Item</TableHead>}
              {visibleColumns.assignee && <TableHead className="font-semibold w-32 h-8 py-0 text-xs">Assignee</TableHead>}
              {visibleColumns.type && <TableHead className="font-semibold w-24 h-8 py-0 text-xs">Type</TableHead>}
              {visibleColumns.dueDate && <TableHead className="font-semibold w-36 h-8 py-0 text-xs">Due Date & Duration</TableHead>}
              {visibleColumns.status && <TableHead className="font-semibold w-32 h-8 py-0 text-xs">Status</TableHead>}
              <TableHead className="w-8 h-8 py-0 text-xs"></TableHead>
              {visibleColumns.completion && <TableHead className="font-semibold w-28 h-8 py-0 text-xs text-center">Completion %</TableHead>}
              <TableHead className="w-12 h-8 py-0"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {parentItemsList.map((item) => {
              const subtasks = subtasksByParent[item.id] || [];
              const isCollapsed = collapsedItems.has(item.id);
              const hasSubtasks = subtasks.length > 0;
              const currentRowIndex = rowIndex++;
              const insertLine = getInsertionLinePosition(item.id);
              const isNest = isNestTarget(item.id);
              const isDragging = draggingItemId === item.id;

              return (
                <Fragment key={item.id}>
                  <TableRow 
                    key={item.id} 
                    className={`group h-8 transition-colors border-b cursor-pointer relative overflow-visible hover-elevate ${
                      selectedItems.has(item.id) ? 'bg-accent/30' : ''
                    } ${isNest ? 'ring-2 ring-primary ring-inset bg-primary/10' : ''} ${isDragging ? 'opacity-40' : ''}`}
                    data-testid={`schedule-row-${item.id}`}
                    onClick={(e) => handleRowClick(e, item.id)}
                    onTouchStart={(e) => handleTouchStart(e, item)}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={(e) => handleTouchEnd(e, item)}
                    draggable={!!onNestItem}
                    onDragStart={(e) => handleDragStart(e, item.id)}
                    onDragEnd={handleDragEnd}
                    onDragOver={(e) => handleDragOver(e, item.id, currentRowIndex)}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                  >
                    {insertLine === 'top' && (
                      <td colSpan={99} className="absolute left-0 right-0 top-0 h-0 z-20" style={{ padding: 0, border: 'none' }}>
                        <div className="h-0.5 bg-primary rounded-full" />
                      </td>
                    )}
                    {onSelectionChange && (
                      <td className="w-8 h-8 py-0 pl-2">
                        <Checkbox
                          checked={selectedItems.has(item.id)}
                          onCheckedChange={() => toggleSelection(item.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="h-3.5 w-3.5"
                          data-testid={`checkbox-${item.id}`}
                        />
                      </td>
                    )}
                    <CasvaScheduleRow
                      item={item}
                      noteCount={noteCounts[item.id] || 0}
                      onEdit={() => onEditItem(item)}
                      onStatusChange={onStatusChange ? (status) => onStatusChange(item.id, status) : undefined}
                      onDuplicate={onDuplicateItem ? () => onDuplicateItem(item) : undefined}
                      onDelete={onDeleteItem ? () => onDeleteItem(item.id) : undefined}
                      onCompletionToggle={onCompletionToggle ? () => onCompletionToggle(item.id, item.progressPercent || 0) : undefined}
                      statusOptions={statusOptions}
                      visibleColumns={visibleColumns}
                      isDraggable={true}
                      isParent={hasSubtasks}
                      isCollapsed={isCollapsed}
                      onToggleCollapse={hasSubtasks ? () => toggleCollapse(item.id) : undefined}
                      hasSubtasks={hasSubtasks}
                    />
                    
                    {ripples.filter(r => r.id.startsWith(item.id)).map((ripple) => (
                      <span
                        key={ripple.id}
                        className="absolute rounded-full bg-primary opacity-30 animate-ripple pointer-events-none"
                        style={{
                          left: ripple.x,
                          top: ripple.y,
                          width: 0,
                          height: 0,
                          transform: 'translate(-50%, -50%)',
                        }}
                      />
                    ))}
                    {insertLine === 'bottom' && (
                      <td colSpan={99} className="absolute left-0 right-0 bottom-0 h-0 z-20" style={{ padding: 0, border: 'none' }}>
                        <div className="h-0.5 bg-primary rounded-full" />
                      </td>
                    )}
                  </TableRow>

                  {!isCollapsed && subtasks.map((subtask) => {
                    const subRowIndex = rowIndex++;
                    const subInsertLine = getInsertionLinePosition(subtask.id);
                    const subIsNest = isNestTarget(subtask.id);
                    const subIsDragging = draggingItemId === subtask.id;

                    return (
                      <TableRow 
                        key={subtask.id} 
                        className={`group h-8 transition-colors border-b cursor-pointer relative overflow-visible bg-muted/30 hover-elevate ${
                          selectedItems.has(subtask.id) ? 'bg-accent/30' : ''
                        } ${subIsNest ? 'ring-2 ring-primary ring-inset bg-primary/10' : ''} ${subIsDragging ? 'opacity-40' : ''}`}
                        data-testid={`schedule-subtask-row-${subtask.id}`}
                        onClick={(e) => handleRowClick(e, subtask.id)}
                        onTouchStart={(e) => handleTouchStart(e, subtask)}
                        onTouchMove={handleTouchMove}
                        onTouchEnd={(e) => handleTouchEnd(e, subtask)}
                        draggable={!!onNestItem}
                        onDragStart={(e) => handleDragStart(e, subtask.id)}
                        onDragEnd={handleDragEnd}
                        onDragOver={(e) => handleDragOver(e, subtask.id, subRowIndex)}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                      >
                        {subInsertLine === 'top' && (
                          <td colSpan={99} className="absolute left-0 right-0 top-0 h-0 z-20" style={{ padding: 0, border: 'none' }}>
                            <div className="h-0.5 bg-primary rounded-full" />
                          </td>
                        )}
                        {onSelectionChange && (
                          <td className="w-8 h-8 py-0 pl-2">
                            <Checkbox
                              checked={selectedItems.has(subtask.id)}
                              onCheckedChange={() => toggleSelection(subtask.id)}
                              onClick={(e) => e.stopPropagation()}
                              className="h-3.5 w-3.5"
                              data-testid={`checkbox-${subtask.id}`}
                            />
                          </td>
                        )}
                        <CasvaScheduleRow
                          item={subtask}
                          noteCount={noteCounts[subtask.id] || 0}
                          onEdit={() => onEditItem(subtask)}
                          onStatusChange={onStatusChange ? (status) => onStatusChange(subtask.id, status) : undefined}
                          onDuplicate={onDuplicateItem ? () => onDuplicateItem(subtask) : undefined}
                          onDelete={onDeleteItem ? () => onDeleteItem(subtask.id) : undefined}
                          onCompletionToggle={onCompletionToggle ? () => onCompletionToggle(subtask.id, subtask.progressPercent || 0) : undefined}
                          statusOptions={statusOptions}
                          visibleColumns={visibleColumns}
                          isSubtask={true}
                        />
                        
                        {ripples.filter(r => r.id.startsWith(subtask.id)).map((ripple) => (
                          <span
                            key={ripple.id}
                            className="absolute rounded-full bg-primary opacity-30 animate-ripple pointer-events-none"
                            style={{
                              left: ripple.x,
                              top: ripple.y,
                              width: 0,
                              height: 0,
                              transform: 'translate(-50%, -50%)',
                            }}
                          />
                        ))}
                        {subInsertLine === 'bottom' && (
                          <td colSpan={99} className="absolute left-0 right-0 bottom-0 h-0 z-20" style={{ padding: 0, border: 'none' }}>
                            <div className="h-0.5 bg-primary rounded-full" />
                          </td>
                        )}
                      </TableRow>
                    );
                  })}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </ScrollArea>
      
      {/* Item Count Footer */}
      <div className="px-2 h-8 border-t bg-background text-[10px] text-muted-foreground flex items-center justify-between">
        <span>
          {selectedItems.size > 0 
            ? `${selectedItems.size} of ${items.length} selected`
            : `${items.length} ${items.length === 1 ? 'item' : 'items'}`
          }
        </span>
      </div>
    </div>
  );
}
