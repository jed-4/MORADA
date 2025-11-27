import { useRef, useState, useEffect } from "react";

interface SwipeableViewProps {
  tabs: Array<{
    key: string;
    content: React.ReactNode;
  }>;
  currentTab: string;
  onTabChange: (tab: string) => void;
}

export function SwipeableView({ tabs, currentTab, onTabChange }: SwipeableViewProps) {
  const [isSwipeTransition, setIsSwipeTransition] = useState(false);
  const prevIndexRef = useRef<number>(-1);
  
  // Swipe detection refs
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const isHorizontalSwipeRef = useRef(false);

  const currentIndex = tabs.findIndex(t => t.key === currentTab);
  const minSwipeDistance = 80;

  useEffect(() => {
    const prevIndex = prevIndexRef.current;
    const isAdjacentTab = prevIndex !== -1 && Math.abs(currentIndex - prevIndex) === 1;
    
    if (isSwipeTransition && isAdjacentTab) {
      const timer = setTimeout(() => {
        setIsSwipeTransition(false);
      }, 300);
      return () => clearTimeout(timer);
    } else {
      setIsSwipeTransition(false);
    }
    
    prevIndexRef.current = currentIndex;
  }, [currentIndex, isSwipeTransition]);

  // Edge swipe detection - only detect swipes that start from screen edges
  const handleEdgeSwipe = (direction: 'left' | 'right') => {
    if (direction === 'left' && currentIndex < tabs.length - 1) {
      setIsSwipeTransition(true);
      onTabChange(tabs[currentIndex + 1].key);
    } else if (direction === 'right' && currentIndex > 0) {
      setIsSwipeTransition(true);
      onTabChange(tabs[currentIndex - 1].key);
    }
  };

  // Handle touch on invisible edge zones
  const handleEdgeTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    swipeStartRef.current = { x: touch.clientX, y: touch.clientY };
    isHorizontalSwipeRef.current = false;
  };

  const handleEdgeTouchMove = (e: React.TouchEvent) => {
    if (!swipeStartRef.current) return;
    
    const touch = e.touches[0];
    const deltaX = Math.abs(touch.clientX - swipeStartRef.current.x);
    const deltaY = Math.abs(touch.clientY - swipeStartRef.current.y);
    
    // Only mark as horizontal if clearly horizontal
    if (deltaX > 30 && deltaX > deltaY * 2) {
      isHorizontalSwipeRef.current = true;
    }
  };

  const handleEdgeTouchEnd = (e: React.TouchEvent, edge: 'left' | 'right') => {
    if (!swipeStartRef.current) return;
    
    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - swipeStartRef.current.x;
    
    if (isHorizontalSwipeRef.current && Math.abs(deltaX) > minSwipeDistance) {
      // Swipe from left edge going right = go to previous tab
      // Swipe from right edge going left = go to next tab
      if (edge === 'left' && deltaX > minSwipeDistance) {
        handleEdgeSwipe('right');
      } else if (edge === 'right' && deltaX < -minSwipeDistance) {
        handleEdgeSwipe('left');
      }
    }
    
    swipeStartRef.current = null;
    isHorizontalSwipeRef.current = false;
  };

  return (
    <div className="flex-1 overflow-hidden relative">
      {/* Left edge swipe zone - invisible but captures edge swipes */}
      <div
        className="absolute left-0 top-0 bottom-0 w-8 z-40"
        style={{ touchAction: 'pan-y' }}
        onTouchStart={handleEdgeTouchStart}
        onTouchMove={handleEdgeTouchMove}
        onTouchEnd={(e) => handleEdgeTouchEnd(e, 'left')}
      />
      
      {/* Right edge swipe zone - invisible but captures edge swipes */}
      <div
        className="absolute right-0 top-0 bottom-0 w-8 z-40"
        style={{ touchAction: 'pan-y' }}
        onTouchStart={handleEdgeTouchStart}
        onTouchMove={handleEdgeTouchMove}
        onTouchEnd={(e) => handleEdgeTouchEnd(e, 'right')}
      />
      
      <div
        className={`h-full flex ${isSwipeTransition ? 'transition-transform duration-300' : ''}`}
        style={{
          transform: `translateX(-${currentIndex * 100}vw)`,
        }}
      >
        {tabs.map((tab) => (
          <div
            key={tab.key}
            className="h-full flex-shrink-0 w-screen"
          >
            {tab.content}
          </div>
        ))}
      </div>
    </div>
  );
}
