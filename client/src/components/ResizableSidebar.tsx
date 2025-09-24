import { useState, useCallback, useRef, useEffect } from "react";
import { AppSidebar } from "./AppSidebar";

interface ResizableSidebarProps {
  onWidthChange: (width: string) => void;
  initialWidth: string;
}

export function ResizableSidebar({ onWidthChange, initialWidth }: ResizableSidebarProps) {
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(() => parseInt(initialWidth));

  const startResizing = useCallback((mouseDownEvent: React.MouseEvent) => {
    setIsResizing(true);
    mouseDownEvent.preventDefault();
  }, []);

  const stopResizing = useCallback(() => {
    setIsResizing(false);
  }, []);

  const resize = useCallback(
    (mouseMoveEvent: MouseEvent) => {
      if (isResizing && sidebarRef.current) {
        const newWidth = mouseMoveEvent.clientX;
        
        // Set minimum and maximum widths
        if (newWidth >= 200 && newWidth <= 500) {
          setWidth(newWidth);
          onWidthChange(`${newWidth}px`);
        }
      }
    },
    [isResizing, onWidthChange]
  );

  useEffect(() => {
    window.addEventListener("mousemove", resize);
    window.addEventListener("mouseup", stopResizing);
    return () => {
      window.removeEventListener("mousemove", resize);
      window.removeEventListener("mouseup", stopResizing);
    };
  }, [resize, stopResizing]);

  return (
    <div className="relative">
      <div ref={sidebarRef} style={{ width: `${width}px` }}>
        <AppSidebar />
      </div>
      
      {/* Resize handle */}
      <div
        className={`absolute top-0 right-0 w-1 h-full cursor-col-resize bg-transparent hover:bg-border transition-colors ${
          isResizing ? "bg-border" : ""
        }`}
        onMouseDown={startResizing}
        data-testid="sidebar-resize-handle"
      >
        <div className="absolute top-1/2 right-0 transform -translate-y-1/2 w-1 h-8 bg-muted-foreground/20 rounded-l hover:bg-muted-foreground/40 transition-colors" />
      </div>
    </div>
  );
}