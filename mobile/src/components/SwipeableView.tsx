import { useRef, useState, useEffect, useCallback } from "react";

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
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const [isSwipeTransition, setIsSwipeTransition] = useState(false);
  const isVerticalScrollRef = useRef(false);
  const prevIndexRef = useRef<number>(-1);

  const currentIndex = tabs.findIndex(t => t.key === currentTab);
  const minSwipeDistance = 50;

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

  const handleTouchStart = useCallback((e: TouchEvent) => {
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
    isVerticalScrollRef.current = false;
    setDragOffset(0);
  }, []);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!touchStartRef.current) return;
    
    const touch = e.touches[0];
    const deltaX = touch.clientX - touchStartRef.current.x;
    const deltaY = touch.clientY - touchStartRef.current.y;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);
    
    // Determine scroll direction once
    if (!isDragging && !isVerticalScrollRef.current) {
      if (absY > absX && absY > 10) {
        isVerticalScrollRef.current = true;
        return;
      } else if (absX > 15) {
        // Only start horizontal dragging if significantly horizontal
        setIsDragging(true);
      }
    }
    
    if (isVerticalScrollRef.current) return;
    
    if (isDragging) {
      const canDragLeft = currentIndex < tabs.length - 1;
      const canDragRight = currentIndex > 0;
      
      let offset = deltaX * 0.5;
      if (deltaX < 0 && !canDragLeft) offset = 0;
      if (deltaX > 0 && !canDragRight) offset = 0;
      
      setDragOffset(offset);
    }
  }, [isDragging, currentIndex, tabs.length]);

  const handleTouchEnd = useCallback((e: TouchEvent) => {
    if (!touchStartRef.current) return;

    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - touchStartRef.current.x;
    const absDistance = Math.abs(deltaX);
    const elapsed = Date.now() - touchStartRef.current.time;

    // Quick tap detection: minimal movement and short duration
    // Don't do anything - let the click event propagate naturally
    if (absDistance < 10 && elapsed < 300 && !isDragging) {
      touchStartRef.current = null;
      setIsDragging(false);
      setDragOffset(0);
      return;
    }

    // Handle actual swipes
    if (isDragging && absDistance > minSwipeDistance) {
      if (deltaX < -minSwipeDistance && currentIndex < tabs.length - 1) {
        setIsSwipeTransition(true);
        onTabChange(tabs[currentIndex + 1].key);
      } else if (deltaX > minSwipeDistance && currentIndex > 0) {
        setIsSwipeTransition(true);
        onTabChange(tabs[currentIndex - 1].key);
      }
    }

    touchStartRef.current = null;
    setIsDragging(false);
    setDragOffset(0);
  }, [isDragging, currentIndex, tabs, onTabChange, minSwipeDistance]);

  // Use native event listeners for better control
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Use passive: false only for touchmove to allow preventDefault if needed
    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: true });
    container.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  const shouldAnimate = !isDragging && isSwipeTransition;

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-hidden relative"
      style={{ touchAction: isDragging ? 'none' : 'pan-y' }}
    >
      <div
        className={`h-full flex ${shouldAnimate ? 'transition-transform duration-300' : ''}`}
        style={{
          transform: `translateX(calc(-${currentIndex * 100}vw + ${dragOffset}px))`,
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
