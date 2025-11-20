import { useRef, useState } from "react";
import { Haptics, ImpactStyle } from "@capacitor/haptics";

interface UsePullToRefreshOptions {
  onRefresh: () => Promise<void>;
  threshold?: number;
}

export function usePullToRefresh({ onRefresh, threshold = 80 }: UsePullToRefreshOptions) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const startY = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    const container = containerRef.current;
    if (!container) return;
    
    // Only trigger if at the top of the scroll container
    if (container.scrollTop === 0) {
      startY.current = e.touches[0].clientY;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const container = containerRef.current;
    if (!container || isRefreshing) return;
    
    if (container.scrollTop === 0 && startY.current > 0) {
      const currentY = e.touches[0].clientY;
      const distance = Math.max(0, currentY - startY.current);
      
      // Apply resistance (make it harder to pull)
      const resistanceFactor = 0.5;
      setPullDistance(Math.min(distance * resistanceFactor, threshold * 1.5));
    }
  };

  const handleTouchEnd = async () => {
    if (pullDistance >= threshold && !isRefreshing) {
      setIsRefreshing(true);
      Haptics.impact({ style: ImpactStyle.Medium });
      
      try {
        await onRefresh();
        // Add a small delay to show the refresh completed
        await new Promise(resolve => setTimeout(resolve, 300));
      } catch (error) {
        console.error("Refresh error:", error);
      } finally {
        setIsRefreshing(false);
        setPullDistance(0);
      }
    } else {
      setPullDistance(0);
    }
    
    startY.current = 0;
  };

  const pullPercentage = Math.min((pullDistance / threshold) * 100, 100);

  return {
    containerRef,
    isRefreshing,
    pullDistance,
    pullPercentage,
    touchHandlers: {
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
    },
  };
}
