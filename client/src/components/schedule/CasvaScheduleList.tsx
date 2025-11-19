import { ScheduleItem } from "@shared/schema";
import { CasvaScheduleRow } from "./CasvaScheduleRow";
import { Table, TableHeader, TableRow, TableHead, TableBody } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useState, Fragment } from "react";

export interface CasvaScheduleListProps {
  items: ScheduleItem[];
  noteCounts?: Record<string, number>;
  onEditItem: (item: ScheduleItem) => void;
  maxHeight?: string;
}

export function CasvaScheduleList({ 
  items, 
  noteCounts = {},
  onEditItem, 
  maxHeight = "calc(100vh - 280px)"
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
          <TableHeader className="sticky top-0 bg-white z-10">
            <TableRow className="hover:bg-transparent border-b h-8">
              <TableHead className="font-semibold h-8 py-0 text-xs">Item</TableHead>
              <TableHead className="font-semibold w-48 h-8 py-0 text-xs">Assignee & Role</TableHead>
              <TableHead className="font-semibold w-40 h-8 py-0 text-xs">Due Date & Duration</TableHead>
              <TableHead className="font-semibold w-32 h-8 py-0 text-xs">Status</TableHead>
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
                    className="group casva-row h-8 transition-colors border-b cursor-pointer relative overflow-hidden hover:bg-gray-50"
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
                        className="absolute rounded-full bg-[#bba7db] opacity-30 animate-ripple pointer-events-none"
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
                      className="group casva-row h-8 transition-colors border-b cursor-pointer relative overflow-hidden hover:bg-gray-50 bg-gray-50"
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
                        isSubtask={true}
                      />
                      
                      {/* Ripple effect */}
                      {ripples.filter(r => r.id.startsWith(subtask.id)).map((ripple) => (
                        <span
                          key={ripple.id}
                          className="absolute rounded-full bg-[#bba7db] opacity-30 animate-ripple pointer-events-none"
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
      <div className="px-2 h-8 border-t bg-white text-[10px] text-muted-foreground flex items-center justify-between">
        <span>{items.length} {items.length === 1 ? 'item' : 'items'}</span>
      </div>
    </div>
  );
}
