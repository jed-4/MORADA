import { ScheduleItem } from "@shared/schema";
import { CasvaScheduleRow } from "./CasvaScheduleRow";
import { Table, TableHeader, TableRow, TableHead, TableBody } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronRight, ChevronDown, Pencil, Copy, Trash2, MoreVertical } from "lucide-react";
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
  onAddSubItem?: (item: ScheduleItem) => void;
  allCollapsed?: boolean;
  locked?: boolean;
  isTemplate?: boolean;
  templateReferenceDate?: Date;
}

interface FlatRow {
  id: string;
  parentId: string | null;
  isParent: boolean;
  depth: 0 | 1 | 2;
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
  onAddSubItem,
  allCollapsed,
  locked = false,
  isTemplate = false,
  templateReferenceDate,
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
  const nestHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingNestIdRef = useRef<string | null>(null);
  const [nestHighlightId, setNestHighlightId] = useState<string | null>(null);
  const [nestBlockedId, setNestBlockedId] = useState<string | null>(null);
  const nestIsBlockedRef = useRef(false);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const getDescendantIds = useCallback((rootId: string): Set<string> => {
    const descendants = new Set<string>();
    const queue = [rootId];
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const it of itemsRef.current) {
        if (it.parentItemId === current && !descendants.has(it.id)) {
          descendants.add(it.id);
          queue.push(it.id);
        }
      }
    }
    return descendants;
  }, []);

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
    subtasksByParent[key].sort((a, b) => {
      const aDate = a.startDate ? new Date(a.startDate as string).getTime() : Infinity;
      const bDate = b.startDate ? new Date(b.startDate as string).getTime() : Infinity;
      if (aDate !== bDate) return aDate - bDate;
      return (a.sortOrder || 0) - (b.sortOrder || 0);
    });
  }

  const buildFlatRows = useCallback((): FlatRow[] => {
    const rows: FlatRow[] = [];
    for (const parent of parentItemsList) {
      const children = subtasksByParent[parent.id] || [];
      const hasChildren = children.length > 0;
      rows.push({ id: parent.id, parentId: null, isParent: hasChildren, depth: 0 });
      if (!collapsedItems.has(parent.id)) {
        for (const child of children) {
          const grandchildren = subtasksByParent[child.id] || [];
          rows.push({ id: child.id, parentId: parent.id, isParent: grandchildren.length > 0, depth: 1 });
          for (const grandchild of grandchildren) {
            rows.push({ id: grandchild.id, parentId: child.id, isParent: false, depth: 2 });
          }
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
        const groupChildren = flatRows.filter(r => r.parentId === draggingParentId && r.id !== draggingId);
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
      const lastSibling = siblings[siblings.length - 1];
      const lastSiblingEl = lastSibling ? rowRefsMap.current.get(lastSibling.id) : null;
      const groupBottom = lastSiblingEl ? lastSiblingEl.getBoundingClientRect().bottom : parentRect.bottom;

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
    ghost.style.border = '1px solid hsl(var(--primary))';
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

      if (nestInto) {
        if (pendingNestIdRef.current !== nestInto) {
          if (nestHoldTimerRef.current) clearTimeout(nestHoldTimerRef.current);
          pendingNestIdRef.current = nestInto;
          nestTargetIdRef.current = null;
          setNestHighlightId(null);
          nestHoldTimerRef.current = setTimeout(() => {
            const descendants = getDescendantIds(itemId);
            if (nestInto === itemId || descendants.has(nestInto)) {
              // Invalid: would create a cycle — show red block state
              nestTargetIdRef.current = null;
              nestIsBlockedRef.current = true;
              dropTargetIdRef.current = null;
              setNestBlockedId(nestInto);
              setNestHighlightId(null);
            } else {
              nestTargetIdRef.current = nestInto;
              nestIsBlockedRef.current = false;
              setNestHighlightId(nestInto);
              setNestBlockedId(null);
            }
            setIndicatorLine(null);
          }, 750);
        }
        if (!nestTargetIdRef.current) {
          if (targetId) {
            const targetEl2 = rowRefsMap.current.get(targetId);
            if (targetEl2) {
              const rect2 = targetEl2.getBoundingClientRect();
              setIndicatorLine({
                top: position === 'above' ? rect2.top : rect2.bottom,
                left: rect2.left,
                width: rect2.width,
              });
            }
          }
        } else {
          setIndicatorLine(null);
        }
      } else if (targetId) {
        if (nestHoldTimerRef.current) { clearTimeout(nestHoldTimerRef.current); nestHoldTimerRef.current = null; }
        pendingNestIdRef.current = null;
        nestTargetIdRef.current = null;
        setNestHighlightId(null);
        // Clear any previous blocked-nest state so a normal reorder isn't suppressed
        setNestBlockedId(null);
        nestIsBlockedRef.current = false;
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
        if (nestHoldTimerRef.current) { clearTimeout(nestHoldTimerRef.current); nestHoldTimerRef.current = null; }
        pendingNestIdRef.current = null;
        nestTargetIdRef.current = null;
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
      if (nestHoldTimerRef.current) { clearTimeout(nestHoldTimerRef.current); nestHoldTimerRef.current = null; }

      if (dragStartedRef.current) {
        if (nestTargetIdRef.current && onNestItem) {
          onNestItem(itemId, nestTargetIdRef.current);
        } else if (dropTargetIdRef.current && onReorderItem && !nestIsBlockedRef.current) {
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
      setNestBlockedId(null);
      nestIsBlockedRef.current = false;
      dropTargetIdRef.current = null;
      nestTargetIdRef.current = null;
      pendingNestIdRef.current = null;
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
    <div className="border rounded-lg bg-card overflow-hidden relative" style={{ height: maxHeight }} ref={tableContainerRef}>
      <ScrollArea className="w-full h-full">
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
              {visibleColumns.dueDate && <TableHead className="font-semibold w-36 h-8 py-0 text-xs">{isTemplate ? 'Start Day' : 'Due Date & Duration'}</TableHead>}
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

              // Compute date range and progress roll-up for section headers
              const childDates = subtasks.flatMap(s => {
                const res: Date[] = [];
                if (s.startDate) res.push(new Date(s.startDate as string));
                if (s.endDate) res.push(new Date(s.endDate as string));
                return res;
              });
              const childMinDate = childDates.length > 0 ? new Date(Math.min(...childDates.map(d => d.getTime()))) : null;
              const childMaxDate = childDates.length > 0 ? new Date(Math.max(...childDates.map(d => d.getTime()))) : null;
              const childProgress = hasSubtasks
                ? Math.round(subtasks.reduce((sum, s) => sum + (s.progressPercent || 0), 0) / subtasks.length)
                : (item.progressPercent || 0);

              return (
                <Fragment key={item.id}>
                  <TableRow 
                    ref={(el) => { if (el) rowRefsMap.current.set(item.id, el); }}
                    className={`group border-b cursor-pointer relative overflow-visible transition-colors ${
                      hasSubtasks ? 'h-9 bg-muted/40 hover:bg-muted/60' : 'h-8 hover-elevate'
                    } ${selectedItems.has(item.id) ? 'bg-accent/30' : ''
                    } ${draggingItemId === item.id ? 'opacity-30' : ''}`}
                    style={nestHighlightId === item.id ? {
                      outline: '2px solid hsl(var(--primary))',
                      outlineOffset: '-2px',
                      backgroundColor: 'rgba(168, 144, 212, 0.12)',
                      borderRadius: '4px',
                    } : nestBlockedId === item.id ? {
                      outline: '2px solid hsl(var(--destructive))',
                      outlineOffset: '-2px',
                      backgroundColor: 'rgba(239, 68, 68, 0.08)',
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
                    {hasSubtasks ? (
                      // Section header rendering for depth-0 with children
                      <>
                        {visibleColumns.item && (
                          <td className="py-0 pl-0" colSpan={1}>
                            <div className="flex items-center gap-1.5 px-1">
                              <button
                                onClick={(e) => { e.stopPropagation(); toggleCollapse(item.id); }}
                                className="p-0.5 rounded flex-shrink-0 w-4 h-4 flex items-center justify-center text-muted-foreground hover:text-foreground"
                                data-testid="button-toggle-collapse"
                              >
                                {isCollapsed
                                  ? <ChevronRight className="w-3 h-3" />
                                  : <ChevronDown className="w-3 h-3" />}
                              </button>
                              <span className="font-semibold text-xs truncate" data-testid="schedule-item-title">{item.name}</span>
                              <span className="text-[10px] text-muted-foreground shrink-0 ml-1">{subtasks.length} item{subtasks.length !== 1 ? 's' : ''}</span>
                              {childMinDate && childMaxDate && (
                                <span className="text-[10px] text-muted-foreground shrink-0">
                                  · {childMinDate.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}–{childMaxDate.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                                </span>
                              )}
                            </div>
                          </td>
                        )}
                        {visibleColumns.assignee && <td className="w-32 py-0" />}
                        {visibleColumns.type && <td className="w-24 py-0" />}
                        {visibleColumns.dueDate && <td className="w-36 py-0" />}
                        {visibleColumns.status && <td className="w-32 py-0" />}
                        <td className="w-8 py-0" />
                        {visibleColumns.completion && (
                          <td className="w-28 py-0">
                            <div className="flex items-center justify-center gap-1.5 px-2">
                              <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-primary transition-all"
                                  style={{ width: `${childProgress}%` }}
                                />
                              </div>
                              <span className="text-[10px] text-muted-foreground shrink-0">{childProgress}%</span>
                            </div>
                          </td>
                        )}
                        <td className="w-12 py-0">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                                data-testid={`button-actions-${item.id}`}
                              >
                                <MoreVertical className="h-3 w-3" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => onEditItem(item)}>
                                <Pencil className="h-3.5 w-3.5 mr-2" />
                                Edit
                              </DropdownMenuItem>
                              {onDuplicateItem && (
                                <DropdownMenuItem onClick={() => onDuplicateItem(item)}>
                                  <Copy className="h-3.5 w-3.5 mr-2" />
                                  Duplicate
                                </DropdownMenuItem>
                              )}
                              {onDeleteItem && (
                                <DropdownMenuItem onClick={() => onDeleteItem(item.id)} className="text-destructive">
                                  <Trash2 className="h-3.5 w-3.5 mr-2" />
                                  Delete
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </>
                    ) : (
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
                        isParent={false}
                        isCollapsed={false}
                        locked={locked}
                        isTemplate={isTemplate}
                        templateReferenceDate={templateReferenceDate}
                      />
                    )}
                    
                  </TableRow>

                  {!isCollapsed && subtasks.map((subtask) => {
                    const grandchildren = subtasksByParent[subtask.id] || [];
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
                            indentLevel={1}
                            onAddSubItem={onAddSubItem ? () => onAddSubItem(subtask) : undefined}
                            locked={locked}
                            isTemplate={isTemplate}
                            templateReferenceDate={templateReferenceDate}
                          />
                          
                        </TableRow>

                        {grandchildren.map((grandchild) => (
                          <TableRow
                            key={grandchild.id}
                            ref={(el) => { if (el) rowRefsMap.current.set(grandchild.id, el); }}
                            className={`group h-8 border-b cursor-pointer relative overflow-visible transition-colors hover-elevate bg-muted/50 ${
                              selectedItems.has(grandchild.id) ? 'bg-accent/30' : ''
                            } ${draggingItemId === grandchild.id ? 'opacity-30' : ''}`}
                            data-testid={`schedule-subsubtask-row-${grandchild.id}`}
                            draggable={false}
                            onDragStart={(e) => e.preventDefault()}
                            onClick={(e) => handleRowClick(e, grandchild.id)}
                            onTouchStart={(e) => handleTouchStart(e, grandchild)}
                            onTouchMove={handleTouchMove}
                            onTouchEnd={(e) => handleTouchEnd(e, grandchild)}
                          >
                            {onSelectionChange && (
                              <td className="w-8 h-8 py-0 pl-2">
                                <Checkbox
                                  checked={selectedItems.has(grandchild.id)}
                                  onCheckedChange={() => toggleSelection(grandchild.id)}
                                  onClick={(e) => e.stopPropagation()}
                                  className="h-3.5 w-3.5"
                                  data-testid={`checkbox-${grandchild.id}`}
                                />
                              </td>
                            )}
                            <CasvaScheduleRow
                              item={grandchild}
                              noteCount={noteCounts[grandchild.id] || 0}
                              onEdit={() => onEditItem(grandchild)}
                              onStatusChange={onStatusChange ? (status) => onStatusChange(grandchild.id, status) : undefined}
                              onDuplicate={onDuplicateItem ? () => onDuplicateItem(grandchild) : undefined}
                              onDelete={onDeleteItem ? () => onDeleteItem(grandchild.id) : undefined}
                              onCompletionToggle={onCompletionToggle ? () => onCompletionToggle(grandchild.id, grandchild.progressPercent || 0) : undefined}
                              statusOptions={statusOptions}
                              visibleColumns={visibleColumns}
                              isDraggable={false}
                              isSubtask={true}
                              indentLevel={2}
                              locked={locked}
                              isTemplate={isTemplate}
                              templateReferenceDate={templateReferenceDate}
                            />
                          </TableRow>
                        ))}
                      </Fragment>
                    );
                  })}

                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </ScrollArea>
      
      <div className="px-2 h-8 border-t bg-background text-data text-muted-foreground flex items-center justify-between">
        <span>
          {selectedItems.size > 0 
            ? `${selectedItems.size} of ${items.length} selected`
            : `${items.length} ${items.length === 1 ? 'item' : 'items'}`
          }
        </span>
      </div>

      {draggingItemId && (nestHighlightId || nestBlockedId) && createPortal(
        (() => {
          const activeId = nestHighlightId || nestBlockedId;
          const isBlocked = !!nestBlockedId;
          const el = rowRefsMap.current.get(activeId!);
          if (!el) return null;
          const rect = el.getBoundingClientRect();
          return (
            <div
              style={{
                position: 'fixed',
                top: rect.bottom + 2,
                left: rect.left + 12,
                fontSize: '9px',
                color: isBlocked ? 'hsl(var(--destructive))' : 'hsl(var(--primary))',
                fontWeight: 600,
                whiteSpace: 'nowrap',
                zIndex: 99998,
                pointerEvents: 'none',
              }}
            >
              {isBlocked ? 'Cannot nest here — would create a cycle' : 'Drop to nest inside this item'}
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
            backgroundColor: willUnparent ? '#f97316' : 'hsl(var(--primary))',
            zIndex: 99998,
            pointerEvents: 'none',
            boxShadow: willUnparent 
              ? '0 0 4px rgba(249, 115, 22, 0.5)' 
              : '0 0 4px rgba(168, 144, 212, 0.5)',
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
              backgroundColor: willUnparent ? '#f97316' : 'hsl(var(--primary))',
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
              backgroundColor: willUnparent ? '#f97316' : 'hsl(var(--primary))',
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
