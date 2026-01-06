import * as React from "react";
import { useState, useEffect, useRef } from "react";

interface TaskTooltipProps {
  content: string;
  children: React.ReactNode;
  delay?: number;
}

export function TaskTooltip({ content, children, delay = 1500 }: TaskTooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseEnter = (e: React.MouseEvent) => {
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setPosition({ 
      x: e.clientX, 
      y: rect.top - 4
    });
    
    timeoutRef.current = setTimeout(() => {
      setIsVisible(true);
    }, delay);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isVisible) {
      setPosition({ 
        x: e.clientX, 
        y: (e.target as HTMLElement).getBoundingClientRect().top - 4
      });
    }
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setIsVisible(false);
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="contents"
      onMouseEnter={handleMouseEnter}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {children}
      {isVisible && (
        <div
          className="fixed z-[9999] px-2 py-1 text-[10px] bg-neutral-800 text-white rounded shadow-sm pointer-events-none whitespace-nowrap"
          style={{
            left: position.x,
            top: position.y,
            transform: 'translate(-50%, -100%)',
          }}
        >
          {content}
        </div>
      )}
    </div>
  );
}
