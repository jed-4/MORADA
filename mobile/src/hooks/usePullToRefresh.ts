import { useRef, useState } from "react";
import { ImpactStyle } from "@capacitor/haptics";
import { getHaptics } from "@/lib/capacitor";

interface UsePullToRefreshOptions {
  onRefresh: () => Promise<void>;
  threshold?: number;
}

export function usePullToRefresh({ onRefresh, threshold = 80 }: UsePullToRefreshOptions) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const startY = useRef(0);
  const isPulling = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    const container = containerRef.current;
    if (!container) return;
    
    // Only engage pull-to-refresh if at the top of the scroll container
    if (container.scrollTop === 0) {
      startY.current = e.touches[0].clientY;
      isPulling.current = false;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const container = containerRef.current;
    if (!container || isRefreshing) return;
    
    if (container.scrollTop === 0 && startY.current > 0) {
      const currentY = e.touches[0].clientY;
      const distance = currentY - startY.current;
      
      // Only engage pull-to-refresh for downward pulls (positive distance)
      // and only after moving at least 10px to avoid blocking taps
      if (distance > 10) {
        isPulling.current = true;
        const resistanceFactor = 0.5;
        setPullDistance(Math.min(distance * resistanceFactor, threshold * 1.5));
      }
    }
  };

  const handleTouchEnd = async () => {
    // Only process if we were actually pulling down
    if (!isPulling.current) {
      startY.current = 0;
      return;
    }
    
    if (pullDistance >= threshold && !isRefreshing) {
      setIsRefreshing(true);
      const Haptics = await getHaptics();
      await Haptics.impact({ style: ImpactStyle.Medium });
      
      try {
        await onRefresh();
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
    isPulling.current = false;
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
