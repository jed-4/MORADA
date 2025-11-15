import { ScheduleItem } from "@shared/schema";
import { CasvaScheduleRow } from "./CasvaScheduleRow";
import { Table, TableHeader, TableRow, TableHead, TableBody } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useState } from "react";

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
          <TableBody>
            {parentItems.map((item) => {
              const subtasks = subtasksByParent[item.id] || [];
              const isCollapsed = collapsedItems.has(item.id);
              const hasSubtasks = subtasks.length > 0;

              return (
                <>
                  {/* Parent Row */}
                  <TableRow 
                    key={item.id} 
                    className="group casva-row h-10 transition-all duration-200 border-b cursor-pointer relative overflow-hidden hover:shadow-lg hover:scale-[1.01]"
                    style={{ height: '40px' }}
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
                      className="group casva-row h-10 transition-all duration-200 border-b cursor-pointer relative overflow-hidden hover:shadow-lg hover:scale-[1.01]"
                      style={{ height: '40px', backgroundColor: '#fafafa' }}
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
                </>
              );
            })}
          </TableBody>
        </Table>
      </ScrollArea>
      
      {/* Item Count Footer */}
      <div className="px-4 py-2 border-t bg-muted/30 text-xs text-muted-foreground flex items-center justify-between">
        <span>{items.length} {items.length === 1 ? 'item' : 'items'}</span>
        <span className="text-primary font-medium">20+ items visible</span>
      </div>
    </div>
  );
}
