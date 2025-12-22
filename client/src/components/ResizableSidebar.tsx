import { useState, useCallback, useRef, useEffect } from "react";
import { AppSidebar } from "./AppSidebar";

interface ResizableSidebarProps {
  onWidthChange: (width: string) => void;
  initialWidth: string;
}

export function ResizableSidebar({ onWidthChange, initialWidth }: ResizableSidebarProps) {
  const [isResizing, setIsResizing] = useState(false);
  const [currentWidth, setCurrentWidth] = useState(() => parseInt(initialWidth));
  const sidebarRef = useRef<HTMLDivElement>(null);

  const startResizing = useCallback((mouseDownEvent: React.MouseEvent) => {
    setIsResizing(true);
    mouseDownEvent.preventDefault();
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  const stopResizing = useCallback(() => {
    setIsResizing(false);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, []);

  const resize = useCallback(
    (mouseMoveEvent: MouseEvent) => {
      if (isResizing) {
        const newWidth = mouseMoveEvent.clientX;
        
        // Set minimum and maximum widths
        if (newWidth >= 200 && newWidth <= 500) {
          setCurrentWidth(newWidth);
          onWidthChange(`${newWidth}px`);
        }
      }
    },
    [isResizing, onWidthChange]
  );

  useEffect(() => {
    if (isResizing) {
      window.addEventListener("mousemove", resize);
      window.addEventListener("mouseup", stopResizing);
      return () => {
        window.removeEventListener("mousemove", resize);
        window.removeEventListener("mouseup", stopResizing);
      };
    }
  }, [isResizing, resize, stopResizing]);

  return (
    <div className="relative">
      <AppSidebar sidebarWidth={currentWidth} />
      
      {/* Resize handle - more prominent */}
      <div
        className={`absolute top-0 right-0 w-1 h-full cursor-col-resize z-40 bg-transparent hover:bg-primary/20 transition-colors ${
          isResizing ? "bg-primary/30" : ""
        }`}
        onMouseDown={startResizing}
        data-testid="sidebar-resize-handle"
        title="Drag to resize sidebar"
      >
        {/* More visible drag indicator */}
        <div className="absolute top-1/2 right-0 transform -translate-y-1/2 w-1 h-12 bg-primary/30 rounded-l hover:bg-primary/50 transition-colors" />
      </div>
    </div>
  );
}