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
  const [startX, setStartX] = useState(0);
  const [currentX, setCurrentX] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const [hasMoved, setHasMoved] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    setStartX(e.touches[0].clientX);
    setIsSwiping(true);
    setHasMoved(false);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isSwiping) return;
    const diff = e.touches[0].clientX - startX;
    if (Math.abs(diff) > 10) {
      setHasMoved(true);
    }
    setCurrentX(diff);
  };

  const handleTouchEnd = () => {
    if (!isSwiping) return;
    
    const swipeThreshold = 100;
    
    if (currentX > swipeThreshold && onSwipeRight) {
      setCurrentX(200);
      setTimeout(() => {
        onSwipeRight();
        setCurrentX(0);
        setIsSwiping(false);
      }, 200);
      return;
    } else if (currentX < -swipeThreshold && onSwipeLeft) {
      setCurrentX(-200);
      setTimeout(() => {
        onSwipeLeft();
        setCurrentX(0);
        setIsSwiping(false);
      }, 200);
      return;
    }
    
    // If minimal movement, treat as a tap
    if (!hasMoved && onClick) {
      onClick();
    }
    
    setCurrentX(0);
    setIsSwiping(false);
  };

  const translateX = Math.max(-150, Math.min(150, currentX));
  const showLeftAction = currentX > 50;
  const showRightAction = currentX < -50;

  return (
    <div className="relative overflow-hidden">
      {/* Left Action */}
      {leftAction && (
        <div
          className={`absolute left-0 top-0 bottom-0 flex items-center justify-start px-6 ${leftAction.color} transition-opacity ${
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

      {/* Right Action */}
      {rightAction && (
        <div
          className={`absolute right-0 top-0 bottom-0 flex items-center justify-end px-6 ${rightAction.color} transition-opacity ${
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

      {/* Card Content */}
      <div
        ref={containerRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
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
