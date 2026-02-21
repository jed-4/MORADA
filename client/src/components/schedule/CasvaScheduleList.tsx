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
  allCollapsed?: boolean;
}

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
  onDeleteItem,
  allCollapsed
}: CasvaScheduleListProps) {
  const [collapsedItems, setCollapsedItems] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (allCollapsed) {
      const parentIds = items.filter(item => !item.parentItemId && items.some(sub => sub.parentItemId === item.id)).map(item => item.id);
      setCollapsedItems(new Set(parentIds));
    } else {
      setCollapsedItems(new Set());
    }
  }, [allCollapsed, items]);

  const [ripples, setRipples] = useState<{id: string, x: number, y: number}[]>([]);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [touchStartY, setTouchStartY] = useState<number | null>(null);

  const [draggingItemId, setDraggingItemId] = useState<string | null>(null);
  const [indicatorY, setIndicatorY] = useState<number | null>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const rowRefsMap = useRef<Map<string, HTMLTableRowElement>>(new Map());
  const dragStartedRef = useRef(false);
  const startMouseYRef = useRef(0);
  const dropAfterRef = useRef<string | null>(null);

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

  const parentItemsList = items
    .filter(item => !item.parentItemId)
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

  const subtasksByParent = items.reduce((acc, item) => {
    if (item.parentItemId) {
      if (!acc[item.parentItemId]) acc[item.parentItemId] = [];
      acc[item.parentItemId].push(item);
    }
    return acc;
  }, {} as Record<string, ScheduleItem[]>);

  for (const key of Object.keys(subtasksByParent)) {
    subtasksByParent[key].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  }

  const getSiblings = useCallback((itemId: string): ScheduleItem[] => {
    const item = items.find(i => i.id === itemId);
    if (!item) return [];
    const parentId = item.parentItemId || null;
    if (parentId) {
      return (subtasksByParent[parentId] || []);
    }
    return parentItemsList;
  }, [items, parentItemsList, subtasksByParent]);

  const getVisibleSiblingRows = useCallback((itemId: string): { id: string; top: number; bottom: number }[] => {
    const siblings = getSiblings(itemId);
    const result: { id: string; top: number; bottom: number }[] = [];
    for (const sib of siblings) {
      const el = rowRefsMap.current.get(sib.id);
      if (el) {
        const rect = el.getBoundingClientRect();
        result.push({ id: sib.id, top: rect.top, bottom: rect.bottom });
      }
    }
    return result;
  }, [getSiblings]);

  const handleMouseDown = useCallback((e: React.MouseEvent, itemId: string) => {
    e.preventDefault();
    e.stopPropagation();
    dragStartedRef.current = false;
    startMouseYRef.current = e.clientY;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaY = Math.abs(moveEvent.clientY - startMouseYRef.current);
      if (!dragStartedRef.current && deltaY < 4) return;

      if (!dragStartedRef.current) {
        dragStartedRef.current = true;
        setDraggingItemId(itemId);
      }

      const siblingRows = getVisibleSiblingRows(itemId);
      if (siblingRows.length === 0) return;

      const mouseY = moveEvent.clientY;
      let bestAfter: string | null = null;
      let bestIndicatorY: number | null = null;

      const containerRect = tableContainerRef.current?.getBoundingClientRect();
      if (!containerRect) return;

      for (let i = 0; i < siblingRows.length; i++) {
        const row = siblingRows[i];
        if (row.id === itemId) continue;
        const midY = (row.top + row.bottom) / 2;

        if (mouseY < midY) {
          const prevRow = i > 0 ? siblingRows[i - 1] : null;
          if (prevRow && prevRow.id !== itemId) {
            bestAfter = prevRow.id;
            bestIndicatorY = row.top - containerRect.top;
          } else if (!prevRow) {
            bestAfter = null;
            bestIndicatorY = row.top - containerRect.top;
          } else {
            const prevPrev = i > 1 ? siblingRows[i - 2] : null;
            bestAfter = prevPrev ? prevPrev.id : null;
            bestIndicatorY = row.top - containerRect.top;
          }
          break;
        }
      }

      if (bestIndicatorY === null) {
        const lastRow = siblingRows[siblingRows.length - 1];
        if (lastRow && lastRow.id !== itemId) {
          bestAfter = lastRow.id;
          bestIndicatorY = lastRow.bottom - containerRect.top;
        } else {
          const secondLast = siblingRows.length > 1 ? siblingRows[siblingRows.length - 2] : null;
          if (secondLast) {
            bestAfter = secondLast.id;
            bestIndicatorY = lastRow.bottom - containerRect.top;
          }
        }
      }

      dropAfterRef.current = bestAfter;
      setIndicatorY(bestIndicatorY);
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';

      if (dragStartedRef.current && onReorderItem && dropAfterRef.current !== undefined) {
        const draggedItem = items.find(i => i.id === itemId);
        const siblings = getSiblings(itemId);
        const hasValidTarget = siblings.filter(s => s.id !== itemId).length > 0;
        if (draggedItem && hasValidTarget) {
          const parentId = draggedItem.parentItemId || null;
          onReorderItem(itemId, dropAfterRef.current, parentId);
        }
      }

      setDraggingItemId(null);
      dropAfterRef.current = null;
      setIndicatorY(null);
      dragStartedRef.current = false;
    };

    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'grabbing';
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [items, getVisibleSiblingRows, getSiblings, onReorderItem]);

  useEffect(() => {
    const handleBlur = () => {
      if (dragStartedRef.current) {
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
        setDraggingItemId(null);
        dropAfterRef.current = null;
        setIndicatorY(null);
        dragStartedRef.current = false;
      }
    };
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('blur', handleBlur);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, []);

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
    if (dragStartedRef.current) return;
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

  if (items.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <p>No schedule items found</p>
      </div>
    );
  }

  const isAllSelected = items.length > 0 && selectedItems.size === items.length;
  const isSomeSelected = selectedItems.size > 0 && selectedItems.size < items.length;

  return (
    <div className="border rounded-lg bg-card overflow-hidden relative" ref={tableContainerRef}>
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
              {visibleColumns.item && <TableHead className="font-semibold h-8 py-0 text-xs pl-0">Item</TableHead>}
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
              const isDragging = draggingItemId === item.id;

              return (
                <Fragment key={item.id}>
                  <TableRow 
                    ref={(el) => { if (el) rowRefsMap.current.set(item.id, el); }}
                    className={`group h-8 border-b cursor-pointer relative overflow-visible transition-colors hover-elevate ${
                      selectedItems.has(item.id) ? 'bg-accent/30' : ''
                    } ${isDragging ? 'opacity-30 bg-muted' : ''}`}
                    data-testid={`schedule-row-${item.id}`}
                    onClick={(e) => handleRowClick(e, item.id)}
                    onTouchStart={(e) => handleTouchStart(e, item)}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={(e) => handleTouchEnd(e, item)}
                  >
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
                      isDraggable={!!onReorderItem}
                      onDragHandleMouseDown={(e) => handleMouseDown(e, item.id)}
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
                  </TableRow>

                  {!isCollapsed && subtasks.map((subtask) => {
                    const subIsDragging = draggingItemId === subtask.id;

                    return (
                      <TableRow 
                        key={subtask.id}
                        ref={(el) => { if (el) rowRefsMap.current.set(subtask.id, el); }}
                        className={`group h-8 border-b cursor-pointer relative overflow-visible transition-colors hover-elevate bg-muted/30 ${
                          selectedItems.has(subtask.id) ? 'bg-accent/30' : ''
                        } ${subIsDragging ? 'opacity-30 bg-muted' : ''}`}
                        data-testid={`schedule-subtask-row-${subtask.id}`}
                        onClick={(e) => handleRowClick(e, subtask.id)}
                        onTouchStart={(e) => handleTouchStart(e, subtask)}
                        onTouchMove={handleTouchMove}
                        onTouchEnd={(e) => handleTouchEnd(e, subtask)}
                      >
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
                          isDraggable={!!onReorderItem}
                          onDragHandleMouseDown={(e) => handleMouseDown(e, subtask.id)}
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
                      </TableRow>
                    );
                  })}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </ScrollArea>

      {draggingItemId && indicatorY !== null && (
        <div
          className="absolute left-0 right-0 pointer-events-none"
          style={{ top: indicatorY, zIndex: 50 }}
        >
          <div className="flex items-center">
            <div className="w-3 h-3 rounded-full bg-primary -ml-0.5 flex-shrink-0 shadow-sm" />
            <div className="h-[3px] bg-primary flex-1 shadow-sm" />
            <div className="w-3 h-3 rounded-full bg-primary -mr-0.5 flex-shrink-0 shadow-sm" />
          </div>
        </div>
      )}
      
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
