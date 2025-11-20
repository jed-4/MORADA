import { useState, useRef, TouchEvent } from "react";
import { cn } from "@lib/utils";

interface SwipeableCardProps {
  children: React.ReactNode;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  leftAction?: {
    icon: React.ReactNode;
    label: string;
    color: string;
  };
  rightAction?: {
    icon: React.ReactNode;
    label: string;
    color: string;
  };
  className?: string;
}

export function SwipeableCard({
  children,
  onSwipeLeft,
  onSwipeRight,
  leftAction,
  rightAction,
  className,
}: SwipeableCardProps) {
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const [offset, setOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const minSwipeDistance = 80;

  const onTouchStart = (e: TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
    setIsDragging(true);
  };

  const onTouchMove = (e: TouchEvent) => {
    if (!touchStart) return;
    const currentTouch = e.targetTouches[0].clientX;
    const diff = currentTouch - touchStart;
    setOffset(diff);
    setTouchEnd(currentTouch);
  };

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) {
      setOffset(0);
      setIsDragging(false);
      return;
    }

    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;

    if (isLeftSwipe && onSwipeLeft) {
      onSwipeLeft();
    }
    if (isRightSwipe && onSwipeRight) {
      onSwipeRight();
    }

    setOffset(0);
    setIsDragging(false);
    setTouchStart(null);
    setTouchEnd(null);
  };

  const showLeftAction = offset < -minSwipeDistance / 2 && rightAction;
  const showRightAction = offset > minSwipeDistance / 2 && leftAction;

  return (
    <div className="relative overflow-hidden">
      {/* Right action (shows when swiping left) */}
      {leftAction && (
        <div
          className={cn(
            "absolute right-0 top-0 bottom-0 flex items-center justify-center px-6 rounded-r-xl transition-opacity",
            leftAction.color,
            showRightAction ? "opacity-100" : "opacity-0"
          )}
        >
          <div className="flex flex-col items-center gap-1 text-white">
            {leftAction.icon}
            <span className="text-xs font-medium">{leftAction.label}</span>
          </div>
        </div>
      )}

      {/* Left action (shows when swiping right) */}
      {rightAction && (
        <div
          className={cn(
            "absolute left-0 top-0 bottom-0 flex items-center justify-center px-6 rounded-l-xl transition-opacity",
            rightAction.color,
            showLeftAction ? "opacity-100" : "opacity-0"
          )}
        >
          <div className="flex flex-col items-center gap-1 text-white">
            {rightAction.icon}
            <span className="text-xs font-medium">{rightAction.label}</span>
          </div>
        </div>
      )}

      {/* Card content */}
      <div
        ref={cardRef}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{
          transform: `translateX(${offset}px)`,
          transition: isDragging ? "none" : "transform 0.2s ease-out",
        }}
        className={cn("relative z-10", className)}
      >
        {children}
      </div>
    </div>
  );
}
