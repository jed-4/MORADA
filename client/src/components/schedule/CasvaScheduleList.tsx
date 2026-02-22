import { ScheduleItem } from "@shared/schema";
import { CasvaScheduleRow } from "./CasvaScheduleRow";
import { Table, TableHeader, TableRow, TableHead, TableBody } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { useState, Fragment, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";

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

interface FlatRow {
  id: string;
  parentId: string | null;
  isParent: boolean;
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
  const [indicatorLine, setIndicatorLine] = useState<{ top: number; left: number; width: number } | null>(null);

  const tableContainerRef = useRef<HTMLDivElement>(null);
  const rowRefsMap = useRef<Map<string, HTMLTableRowElement>>(new Map());
  const ghostElRef = useRef<HTMLDivElement | null>(null);
  const dragStartedRef = useRef(false);
  const startMouseYRef = useRef(0);
  const startMouseXRef = useRef(0);
  const currentMouseYRef = useRef(0);
  const activeListenersRef = useRef<{ move: (e: MouseEvent) => void; up: () => void } | null>(null);

  const dropTargetIdRef = useRef<string | null>(null);
  const dropPositionRef = useRef<'above' | 'below'>('below');
  const nestTargetIdRef = useRef<string | null>(null);
  const [nestHighlightId, setNestHighlightId] = useState<string | null>(null);

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

  const buildFlatRows = useCallback((): FlatRow[] => {
    const rows: FlatRow[] = [];
    for (const parent of parentItemsList) {
      const children = subtasksByParent[parent.id] || [];
      const hasChildren = children.length > 0;
      rows.push({ id: parent.id, parentId: null, isParent: hasChildren });
      if (!collapsedItems.has(parent.id)) {
        for (const child of children) {
          rows.push({ id: child.id, parentId: parent.id, isParent: false });
        }
      }
    }
    return rows;
  }, [parentItemsList, subtasksByParent, collapsedItems]);

  const findDropTarget = useCallback((mouseY: number, draggingId: string): { targetId: string | null; position: 'above' | 'below'; nestInto: string | null } => {
    const flatRows = buildFlatRows();
    const draggingItem = items.find(i => i.id === draggingId);
    let closest: { id: string; dist: number; position: 'above' | 'below' } | null = null;
    let nestCandidate: string | null = null;

    const draggingParentId = draggingItem?.parentItemId || null;
    let isOutsideParentGroup = false;

    if (draggingParentId) {
      const parentEl = rowRefsMap.current.get(draggingParentId);
      if (parentEl) {
        const parentRect = parentEl.getBoundingClientRect();
        const groupChildren = flatRows.filter(r => r.parentId === draggingParentId);
        const lastChild = groupChildren[groupChildren.length - 1];
        const lastChildEl = lastChild ? rowRefsMap.current.get(lastChild.id) : null;
        const groupBottom = lastChildEl ? lastChildEl.getBoundingClientRect().bottom : parentRect.bottom;
        isOutsideParentGroup = mouseY <= parentRect.top || mouseY >= groupBottom;
      }
    }

    for (const row of flatRows) {
      if (row.id === draggingId) continue;
      const el = rowRefsMap.current.get(row.id);
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;

      if (!row.parentId && row.id !== draggingId && !isOutsideParentGroup) {
        const nestZoneTop = rect.top + rect.height * 0.25;
        const nestZoneBottom = rect.top + rect.height * 0.75;
        const alreadyChild = draggingItem?.parentItemId === row.id;
        const isOverThisRow = mouseY >= rect.top && mouseY <= rect.bottom;
        if (isOverThisRow && mouseY >= nestZoneTop && mouseY <= nestZoneBottom && !alreadyChild) {
          nestCandidate = row.id;
        }
      }

      const position: 'above' | 'below' = mouseY < midY ? 'above' : 'below';
      const dist = Math.abs(mouseY - midY);

      if (!closest || dist < closest.dist) {
        closest = { id: row.id, dist, position };
      }
    }

    if (nestCandidate) {
      return { targetId: closest?.id || null, position: closest?.position || 'below', nestInto: nestCandidate };
    }

    return closest ? { targetId: closest.id, position: closest.position, nestInto: null } : { targetId: null, position: 'below', nestInto: null };
  }, [buildFlatRows, items]);

  const computeReorderParams = useCallback((draggingId: string, targetId: string, position: 'above' | 'below'): { afterItemId: string | null; newParentId: string | null } | null => {
    const draggingItem = items.find(i => i.id === draggingId);
    if (!draggingItem) return null;

    const flatRows = buildFlatRows();
    const targetRow = flatRows.find(r => r.id === targetId);
    if (!targetRow) return null;

    const targetItem = items.find(i => i.id === targetId);
    if (!targetItem) return null;

    const draggingParentId = draggingItem.parentItemId || null;

    if (draggingParentId) {
      const parentEl = rowRefsMap.current.get(draggingParentId);
      if (!parentEl) return null;
      const parentRect = parentEl.getBoundingClientRect();

      const siblings = flatRows.filter(r => r.parentId === draggingParentId && r.id !== draggingId);
      const allGroupChildren = flatRows.filter(r => r.parentId === draggingParentId);
      const lastChild = allGroupChildren[allGroupChildren.length - 1];
      const lastChildEl = lastChild ? rowRefsMap.current.get(lastChild.id) : null;
      const groupBottom = lastChildEl ? lastChildEl.getBoundingClientRect().bottom : parentRect.bottom;

      const mouseY = currentMouseYRef.current;

      const isAboveParent = mouseY <= parentRect.top;
      const isBelowGroup = mouseY >= groupBottom;

      if (isAboveParent || isBelowGroup) {
        if (isAboveParent) {
          const targetIdx = flatRows.findIndex(r => r.id === targetId);
          const prevTopLevel = [...parentItemsList].reverse().find(p => {
            const pIdx = flatRows.findIndex(r => r.id === p.id);
            return pIdx < targetIdx;
          });
          return { afterItemId: prevTopLevel?.id || null, newParentId: null };
        } else {
          return { afterItemId: draggingParentId, newParentId: null };
        }
      }

      if (targetRow.parentId === draggingParentId) {
        if (position === 'above') {
          const sibIdx = siblings.findIndex(s => s.id === targetId);
          const prevSib = sibIdx > 0 ? siblings[sibIdx - 1] : null;
          if (prevSib && prevSib.id === draggingId) return null;
          return { afterItemId: prevSib?.id || null, newParentId: draggingParentId };
        } else {
          if (targetId === draggingId) return null;
          return { afterItemId: targetId, newParentId: draggingParentId };
        }
      }

      return { afterItemId: draggingParentId, newParentId: null };
    }

    if (!draggingParentId) {
      let effectiveTargetId = targetId;
      let effectivePosition = position;

      if (targetRow.parentId) {
        effectiveTargetId = targetRow.parentId;
        const parentChildren = flatRows.filter(r => r.parentId === targetRow.parentId);
        const lastChild = parentChildren[parentChildren.length - 1];
        const targetIdx = flatRows.findIndex(r => r.id === targetId);
        const parentIdx = flatRows.findIndex(r => r.id === targetRow.parentId);

        if (targetIdx <= parentIdx || position === 'above') {
          effectivePosition = 'above';
        } else if (lastChild && targetId === lastChild.id && position === 'below') {
          effectivePosition = 'below';
        } else {
          effectivePosition = 'below';
        }
      }

      if (effectivePosition === 'above') {
        const idx = parentItemsList.findIndex(p => p.id === effectiveTargetId);
        const prevParent = idx > 0 ? parentItemsList[idx - 1] : null;
        if (prevParent && prevParent.id === draggingId) return null;
        return { afterItemId: prevParent?.id || null, newParentId: null };
      } else {
        if (effectiveTargetId === draggingId) return null;
        return { afterItemId: effectiveTargetId, newParentId: null };
      }
    }

    return null;
  }, [items, buildFlatRows, parentItemsList]);

  const createGhostElement = useCallback((rowEl: HTMLTableRowElement) => {
    const rect = rowEl.getBoundingClientRect();
    const ghost = document.createElement('div');
    ghost.style.position = 'fixed';
    ghost.style.zIndex = '99999';
    ghost.style.pointerEvents = 'none';
    ghost.style.opacity = '0.7';
    ghost.style.width = `${rect.width}px`;
    ghost.style.height = `${rect.height}px`;
    ghost.style.boxShadow = '0 10px 25px -5px rgba(0,0,0,0.15), 0 8px 10px -6px rgba(0,0,0,0.1)';
    ghost.style.borderRadius = '4px';
    ghost.style.overflow = 'hidden';
    ghost.style.background = 'var(--card)';
    ghost.style.border = '1px solid #bba7db';
    ghost.style.transition = 'none';

    const table = document.createElement('table');
    table.style.width = '100%';
    table.style.height = '100%';
    table.style.borderCollapse = 'collapse';
    table.style.tableLayout = 'fixed';
    
    const clonedRow = rowEl.cloneNode(true) as HTMLElement;
    clonedRow.style.opacity = '1';
    clonedRow.style.background = 'var(--card)';
    table.appendChild(clonedRow);
    ghost.appendChild(table);

    document.body.appendChild(ghost);
    return ghost;
  }, []);

  const removeGhostElement = useCallback(() => {
    if (ghostElRef.current) {
      document.body.removeChild(ghostElRef.current);
      ghostElRef.current = null;
    }
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent, itemId: string) => {
    if (!onReorderItem && !onNestItem) return;
    e.preventDefault();
    e.stopPropagation();
    dragStartedRef.current = false;
    startMouseYRef.current = e.clientY;
    startMouseXRef.current = e.clientX;
    dropTargetIdRef.current = null;
    dropPositionRef.current = 'below';

    const onMouseMove = (moveEvent: MouseEvent) => {
      moveEvent.preventDefault();
      const deltaY = Math.abs(moveEvent.clientY - startMouseYRef.current);
      const deltaX = Math.abs(moveEvent.clientX - startMouseXRef.current);
      if (!dragStartedRef.current && deltaY < 4 && deltaX < 4) return;

      if (!dragStartedRef.current) {
        dragStartedRef.current = true;
        setDraggingItemId(itemId);

        const rowEl = rowRefsMap.current.get(itemId);
        if (rowEl) {
          ghostElRef.current = createGhostElement(rowEl);
          const rect = rowEl.getBoundingClientRect();
          ghostElRef.current.style.left = `${rect.left}px`;
          ghostElRef.current.style.top = `${moveEvent.clientY - rect.height / 2}px`;
        }
      }

      currentMouseYRef.current = moveEvent.clientY;

      if (ghostElRef.current) {
        const rowEl = rowRefsMap.current.get(itemId);
        if (rowEl) {
          const rect = rowEl.getBoundingClientRect();
          ghostElRef.current.style.left = `${rect.left}px`;
          ghostElRef.current.style.top = `${moveEvent.clientY - rect.height / 2}px`;
        }
      }

      const { targetId, position, nestInto } = findDropTarget(moveEvent.clientY, itemId);
      dropTargetIdRef.current = targetId;
      dropPositionRef.current = position;
      nestTargetIdRef.current = nestInto;

      if (nestInto) {
        setIndicatorLine(null);
        setNestHighlightId(nestInto);
      } else if (targetId) {
        setNestHighlightId(null);
        const targetEl = rowRefsMap.current.get(targetId);
        if (targetEl) {
          const rect = targetEl.getBoundingClientRect();
          setIndicatorLine({
            top: position === 'above' ? rect.top : rect.bottom,
            left: rect.left,
            width: rect.width,
          });
        }
      } else {
        setIndicatorLine(null);
        setNestHighlightId(null);
      }
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      activeListenersRef.current = null;
      document.body.style.userSelect = '';
      document.body.style.cursor = '';

      if (dragStartedRef.current) {
        if (nestTargetIdRef.current && onNestItem) {
          onNestItem(itemId, nestTargetIdRef.current);
        } else if (dropTargetIdRef.current && onReorderItem) {
          const params = computeReorderParams(itemId, dropTargetIdRef.current, dropPositionRef.current);
          if (params) {
            onReorderItem(itemId, params.afterItemId, params.newParentId);
          }
        }
      }

      removeGhostElement();
      setDraggingItemId(null);
      setIndicatorLine(null);
      setNestHighlightId(null);
      dropTargetIdRef.current = null;
      nestTargetIdRef.current = null;
      dragStartedRef.current = false;
    };

    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'grabbing';
    activeListenersRef.current = { move: onMouseMove, up: onMouseUp };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [onReorderItem, onNestItem, findDropTarget, computeReorderParams, createGhostElement, removeGhostElement]);

  useEffect(() => {
    return () => {
      if (activeListenersRef.current) {
        document.removeEventListener('mousemove', activeListenersRef.current.move);
        document.removeEventListener('mouseup', activeListenersRef.current.up);
        activeListenersRef.current = null;
      }
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      removeGhostElement();
    };
  }, [removeGhostElement]);

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

  const willUnparent = (() => {
    if (!draggingItemId || !dropTargetIdRef.current || nestHighlightId) return false;
    const draggingItem = items.find(i => i.id === draggingItemId);
    if (!draggingItem?.parentItemId) return false;
    const params = computeReorderParams(draggingItemId, dropTargetIdRef.current, dropPositionRef.current);
    return params?.newParentId === null;
  })();

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
              return (
                <Fragment key={item.id}>
                  <TableRow 
                    ref={(el) => { if (el) rowRefsMap.current.set(item.id, el); }}
                    className={`group h-8 border-b cursor-pointer relative overflow-visible transition-colors hover-elevate ${
                      selectedItems.has(item.id) ? 'bg-accent/30' : ''
                    } ${draggingItemId === item.id ? 'opacity-30' : ''}`}
                    style={nestHighlightId === item.id ? {
                      outline: '2px solid #bba7db',
                      outlineOffset: '-2px',
                      backgroundColor: 'rgba(187, 167, 219, 0.12)',
                      borderRadius: '4px',
                    } : undefined}
                    data-testid={`schedule-row-${item.id}`}
                    draggable={false}
                    onDragStart={(e) => e.preventDefault()}
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
                      isDraggable={!!(onReorderItem || onNestItem)}
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

                  {!isCollapsed && subtasks.map((subtask, subtaskIdx) => {
                    return (
                      <Fragment key={subtask.id}>
                        <TableRow 
                          ref={(el) => { if (el) rowRefsMap.current.set(subtask.id, el); }}
                          className={`group h-8 border-b cursor-pointer relative overflow-visible transition-colors hover-elevate bg-muted/30 ${
                            selectedItems.has(subtask.id) ? 'bg-accent/30' : ''
                          } ${draggingItemId === subtask.id ? 'opacity-30' : ''}`}
                          data-testid={`schedule-subtask-row-${subtask.id}`}
                          draggable={false}
                          onDragStart={(e) => e.preventDefault()}
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
                            isDraggable={!!(onReorderItem || onNestItem)}
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
                      </Fragment>
                    );
                  })}

                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </ScrollArea>
      
      <div className="px-2 h-8 border-t bg-background text-[10px] text-muted-foreground flex items-center justify-between">
        <span>
          {selectedItems.size > 0 
            ? `${selectedItems.size} of ${items.length} selected`
            : `${items.length} ${items.length === 1 ? 'item' : 'items'}`
          }
        </span>
      </div>

      {draggingItemId && nestHighlightId && createPortal(
        (() => {
          const el = rowRefsMap.current.get(nestHighlightId);
          if (!el) return null;
          const rect = el.getBoundingClientRect();
          return (
            <div
              style={{
                position: 'fixed',
                top: rect.bottom + 2,
                left: rect.left + 12,
                fontSize: '9px',
                color: '#bba7db',
                fontWeight: 600,
                whiteSpace: 'nowrap',
                zIndex: 99998,
                pointerEvents: 'none',
              }}
            >
              Drop to nest inside this item
            </div>
          );
        })(),
        document.body
      )}

      {draggingItemId && indicatorLine && createPortal(
        <div
          style={{
            position: 'fixed',
            top: indicatorLine.top - 1,
            left: indicatorLine.left,
            width: indicatorLine.width,
            height: '2px',
            backgroundColor: willUnparent ? '#f97316' : '#bba7db',
            zIndex: 99998,
            pointerEvents: 'none',
            boxShadow: willUnparent 
              ? '0 0 4px rgba(249, 115, 22, 0.5)' 
              : '0 0 4px rgba(187, 167, 219, 0.5)',
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: -4,
              top: -3,
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: willUnparent ? '#f97316' : '#bba7db',
            }}
          />
          <div
            style={{
              position: 'absolute',
              right: -4,
              top: -3,
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: willUnparent ? '#f97316' : '#bba7db',
            }}
          />
          {willUnparent && (
            <div
              style={{
                position: 'absolute',
                left: 12,
                top: 6,
                fontSize: '9px',
                color: '#f97316',
                fontWeight: 600,
                whiteSpace: 'nowrap',
              }}
            >
              Will become top-level item
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
