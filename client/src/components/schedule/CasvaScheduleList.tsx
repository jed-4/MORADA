import { ScheduleItem } from "@shared/schema";
import { CasvaScheduleRow } from "./CasvaScheduleRow";
import { Table, TableHeader, TableRow, TableHead, TableBody } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useState, Fragment } from "react";

interface StatusOption {
  id: string;
  value: string;
  label: string;
  color?: string;
}

interface VisibleColumns {
  item: boolean;
  assignee: boolean;
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
}

export function CasvaScheduleList({ 
  items, 
  noteCounts = {},
  onEditItem,
  onStatusChange,
  onCompletionToggle,
  statusOptions = [],
  maxHeight = "calc(100vh - 280px)",
  visibleColumns = { item: true, assignee: true, dueDate: true, status: true, completion: true }
}: CasvaScheduleListProps) {
  const [collapsedItems, setCollapsedItems] = useState<Set<string>>(new Set());
  const [ripples, setRipples] = useState<{id: string, x: number, y: number}[]>([]);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [touchStartY, setTouchStartY] = useState<number | null>(null);

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
    
    // Only recognize horizontal swipes
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 50) {
      e.preventDefault();
    }
  };

  const handleTouchEnd = (e: React.TouchEvent, item: ScheduleItem) => {
    if (touchStartX === null || touchStartY === null) return;
    
    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - touchStartX;
    const deltaY = touch.clientY - touchStartY;
    
    // Swipe left to edit (> 100px)
    if (Math.abs(deltaX) > Math.abs(deltaY) && deltaX < -100) {
      onEditItem(item);
    }
    
    setTouchStartX(null);
    setTouchStartY(null);
  };

  // Group items by parent (if parentId exists)
  const parentItems = items.filter(item => !item.parentId);
  const subtasksByParent = items.reduce((acc, item) => {
    if (item.parentId) {
      if (!acc[item.parentId]) acc[item.parentId] = [];
      acc[item.parentId].push(item);
    }
    return acc;
  }, {} as Record<string, ScheduleItem[]>);

  return (
    <div className="border rounded-lg bg-card overflow-hidden">
      <ScrollArea style={{ maxHeight }} className="w-full">
        <Table>
          <TableHeader className="sticky top-0 bg-background z-10">
            <TableRow className="hover:bg-transparent border-b h-8">
              {visibleColumns.item && <TableHead className="font-semibold h-8 py-0 text-xs">Item</TableHead>}
              {visibleColumns.assignee && <TableHead className="font-semibold w-48 h-8 py-0 text-xs">Assignee & Role</TableHead>}
              {visibleColumns.dueDate && <TableHead className="font-semibold w-40 h-8 py-0 text-xs">Due Date & Duration</TableHead>}
              {visibleColumns.status && <TableHead className="font-semibold w-32 h-8 py-0 text-xs">Status</TableHead>}
              {visibleColumns.completion && <TableHead className="font-semibold w-20 h-8 py-0 text-xs text-center">%</TableHead>}
              <TableHead className="w-12 h-8 py-0"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {parentItems.map((item) => {
              const subtasks = subtasksByParent[item.id] || [];
              const isCollapsed = collapsedItems.has(item.id);
              const hasSubtasks = subtasks.length > 0;

              return (
                <Fragment key={item.id}>
                  {/* Parent Row */}
                  <TableRow 
                    key={item.id} 
                    className="group h-8 transition-colors border-b cursor-pointer relative overflow-hidden hover-elevate"
                    data-testid={`schedule-row-${item.id}`}
                    onClick={(e) => handleRowClick(e, item.id)}
                    onTouchStart={(e) => handleTouchStart(e, item)}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={(e) => handleTouchEnd(e, item)}
                  >
                    <CasvaScheduleRow
                      item={item}
                      noteCount={noteCounts[item.id] || 0}
                      onEdit={() => onEditItem(item)}
                      onStatusChange={onStatusChange ? (status) => onStatusChange(item.id, status) : undefined}
                      onCompletionToggle={onCompletionToggle ? () => onCompletionToggle(item.id, item.progressPercent || 0) : undefined}
                      statusOptions={statusOptions}
                      visibleColumns={visibleColumns}
                      isDraggable={true}
                      isParent={hasSubtasks}
                      isCollapsed={isCollapsed}
                      onToggleCollapse={hasSubtasks ? () => toggleCollapse(item.id) : undefined}
                      hasSubtasks={hasSubtasks}
                    />
                    
                    {/* Ripple effect */}
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

                  {/* Subtask Rows */}
                  {!isCollapsed && subtasks.map((subtask) => (
                    <TableRow 
                      key={subtask.id} 
                      className="group h-8 transition-colors border-b cursor-pointer relative overflow-hidden bg-muted/30 hover-elevate"
                      data-testid={`schedule-subtask-row-${subtask.id}`}
                      onClick={(e) => handleRowClick(e, subtask.id)}
                      onTouchStart={(e) => handleTouchStart(e, subtask)}
                      onTouchMove={handleTouchMove}
                      onTouchEnd={(e) => handleTouchEnd(e, subtask)}
                    >
                      <CasvaScheduleRow
                        item={subtask}
                        noteCount={noteCounts[subtask.id] || 0}
                        onEdit={() => onEditItem(subtask)}
                        onStatusChange={onStatusChange ? (status) => onStatusChange(subtask.id, status) : undefined}
                        onCompletionToggle={onCompletionToggle ? () => onCompletionToggle(subtask.id, subtask.progressPercent || 0) : undefined}
                        statusOptions={statusOptions}
                        visibleColumns={visibleColumns}
                        isSubtask={true}
                      />
                      
                      {/* Ripple effect */}
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
                  ))}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </ScrollArea>
      
      {/* Item Count Footer */}
      <div className="px-2 h-8 border-t bg-background text-[10px] text-muted-foreground flex items-center justify-between">
        <span>{items.length} {items.length === 1 ? 'item' : 'items'}</span>
      </div>
    </div>
  );
}
