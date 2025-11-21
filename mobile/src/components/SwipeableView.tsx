import { useRef, useState } from "react";

interface SwipeableViewProps {
  tabs: Array<{
    key: string;
    content: React.ReactNode;
  }>;
  currentTab: string;
  onTabChange: (tab: string) => void;
}

export function SwipeableView({ tabs, currentTab, onTabChange }: SwipeableViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null);
  const [touchCurrent, setTouchCurrent] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isVerticalScroll, setIsVerticalScroll] = useState(false);

  const currentIndex = tabs.findIndex(t => t.key === currentTab);
  const minSwipeDistance = 50;

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.targetTouches[0];
    setTouchStart({ x: touch.clientX, y: touch.clientY });
    setTouchCurrent({ x: touch.clientX, y: touch.clientY });
    setIsVerticalScroll(false);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStart) return;
    
    const touch = e.targetTouches[0];
    const deltaX = Math.abs(touch.clientX - touchStart.x);
    const deltaY = Math.abs(touch.clientY - touchStart.y);
    
    // Determine if this is a vertical scroll gesture
    if (!isDragging && !isVerticalScroll) {
      if (deltaY > deltaX && deltaY > 10) {
        setIsVerticalScroll(true);
        return;
      } else if (deltaX > 10) {
        setIsDragging(true);
      }
    }
    
    // If vertical scroll, don't interfere
    if (isVerticalScroll) return;
    
    // Handle horizontal drag
    if (isDragging) {
      setTouchCurrent({ x: touch.clientX, y: touch.clientY });
    }
  };

  const handleTouchEnd = () => {
    if (!touchStart || !touchCurrent || isVerticalScroll) {
      resetTouch();
      return;
    }

    const distance = touchStart.x - touchCurrent.x;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;

    if (isLeftSwipe && currentIndex < tabs.length - 1) {
      onTabChange(tabs[currentIndex + 1].key);
    } else if (isRightSwipe && currentIndex > 0) {
      onTabChange(tabs[currentIndex - 1].key);
    }

    resetTouch();
  };

  const resetTouch = () => {
    setIsDragging(false);
    setIsVerticalScroll(false);
    setTouchStart(null);
    setTouchCurrent(null);
  };

  const getDragOffset = () => {
    if (!isDragging || !touchStart || !touchCurrent) return 0;
    const offset = touchCurrent.x - touchStart.x;
    
    // Limit drag distance
    const canDragLeft = currentIndex < tabs.length - 1;
    const canDragRight = currentIndex > 0;
    
    if (offset < 0 && !canDragLeft) return 0;
    if (offset > 0 && !canDragRight) return 0;
    
    // Add resistance at edges
    return offset * 0.5;
  };

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-hidden relative touch-pan-y"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div
        className="h-full flex transition-transform duration-300"
        style={{
          transform: `translateX(calc(-${currentIndex * 100}% + ${getDragOffset()}px))`,
          width: `${tabs.length * 100}%`,
        }}
      >
        {tabs.map((tab) => (
          <div
            key={tab.key}
            className="h-full flex-shrink-0"
            style={{ width: `${100 / tabs.length}%` }}
          >
            {tab.content}
          </div>
        ))}
      </div>
    </div>
  );
}
