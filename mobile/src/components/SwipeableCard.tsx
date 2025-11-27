import { ReactNode, useRef, useState } from "react";

interface SwipeableCardProps {
  children: ReactNode;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onClick?: () => void;
  leftAction?: {
    icon: ReactNode;
    color: string;
    label: string;
  };
  rightAction?: {
    icon: ReactNode;
    color: string;
    label: string;
  };
}

export function SwipeableCard({
  children,
  onSwipeLeft,
  onSwipeRight,
  onClick,
  leftAction,
  rightAction,
}: SwipeableCardProps) {
  const [currentX, setCurrentX] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const hasMovedRef = useRef(false);
  const touchHandledRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    startXRef.current = e.touches[0].clientX;
    startYRef.current = e.touches[0].clientY;
    hasMovedRef.current = false;
    touchHandledRef.current = false;
    setIsSwiping(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isSwiping) return;
    
    const diffX = e.touches[0].clientX - startXRef.current;
    const diffY = e.touches[0].clientY - startYRef.current;
    
    if (Math.abs(diffX) > 10 && Math.abs(diffX) > Math.abs(diffY)) {
      hasMovedRef.current = true;
    }
    
    setCurrentX(diffX);
  };

  const handleTouchEnd = () => {
    console.log("[SwipeableCard] touchEnd - isSwiping:", isSwiping, "hasMoved:", hasMovedRef.current, "onClick:", !!onClick);
    if (!isSwiping) return;
    
    const swipeThreshold = 100;
    
    if (!hasMovedRef.current && onClick) {
      console.log("[SwipeableCard] TAP DETECTED - calling onClick");
      touchHandledRef.current = true;
      setCurrentX(0);
      setIsSwiping(false);
      onClick();
      return;
    }
    
    if (currentX > swipeThreshold && onSwipeRight) {
      setCurrentX(200);
      setTimeout(() => {
        onSwipeRight();
        setCurrentX(0);
        setIsSwiping(false);
      }, 200);
      return;
    }
    
    if (currentX < -swipeThreshold && onSwipeLeft) {
      setCurrentX(-200);
      setTimeout(() => {
        onSwipeLeft();
        setCurrentX(0);
        setIsSwiping(false);
      }, 200);
      return;
    }
    
    setCurrentX(0);
    setIsSwiping(false);
  };

  const handleClick = () => {
    console.log("[SwipeableCard] click - touchHandled:", touchHandledRef.current, "hasMoved:", hasMovedRef.current, "onClick:", !!onClick);
    if (touchHandledRef.current) {
      console.log("[SwipeableCard] click ignored - already handled by touch");
      touchHandledRef.current = false;
      return;
    }
    if (!hasMovedRef.current && onClick) {
      console.log("[SwipeableCard] CLICK - calling onClick");
      onClick();
    }
  };

  const translateX = Math.max(-150, Math.min(150, currentX));
  const showLeftAction = currentX > 50;
  const showRightAction = currentX < -50;

  return (
    <div className="relative overflow-hidden">
      {leftAction && (
        <div
          className={`absolute left-0 top-0 bottom-0 flex items-center justify-start px-6 pointer-events-none ${leftAction.color} transition-opacity ${
            showLeftAction ? "opacity-100" : "opacity-0"
          }`}
          style={{ width: Math.max(0, currentX) }}
        >
          <div className="text-white flex flex-col items-center gap-1">
            {leftAction.icon}
            <span className="text-xs font-medium">{leftAction.label}</span>
          </div>
        </div>
      )}

      {rightAction && (
        <div
          className={`absolute right-0 top-0 bottom-0 flex items-center justify-end px-6 pointer-events-none ${rightAction.color} transition-opacity ${
            showRightAction ? "opacity-100" : "opacity-0"
          }`}
          style={{ width: Math.max(0, -currentX) }}
        >
          <div className="text-white flex flex-col items-center gap-1">
            {rightAction.icon}
            <span className="text-xs font-medium">{rightAction.label}</span>
          </div>
        </div>
      )}

      <div
        ref={containerRef}
        onClick={handleClick}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="relative z-10 cursor-pointer"
        style={{
          transform: `translateX(${translateX}px)`,
          transition: isSwiping ? "none" : "transform 0.3s ease-out",
        }}
      >
        {children}
      </div>
    </div>
  );
}
