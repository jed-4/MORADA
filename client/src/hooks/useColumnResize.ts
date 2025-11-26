import { useState, useCallback, useRef, useEffect } from 'react';

interface ColumnConfig {
  id: string;
  label: string;
  visible: boolean;
  widthPx: number;
}

interface ResizeState {
  columnId: string;
  startX: number;
  startWidth: number;
}

const STORAGE_KEY = 'estimate-column-widths';

const MIN_WIDTHS: Record<string, number> = {
  costCode: 100,
  item: 150,
  description: 200,
  status: 80,
  proposalVisible: 80,
  shownAs: 80,
  allowance: 70,
  quantity: 80,
  wastage: 60,
  unitType: 60,
  unitCostExTax: 100,
  unitCostIncTax: 100,
  builderCost: 120,
  builderCostIncTax: 120,
  markup: 80,
  clientPriceExTax: 100,
  clientTax: 80,
  clientPriceIncTax: 100,
  notes: 60,
};

const MAX_WIDTHS: Record<string, number> = {
  description: 600,
  item: 400,
};

export function useColumnResize(
  columns: ColumnConfig[],
  setColumns: React.Dispatch<React.SetStateAction<ColumnConfig[]>>,
  estimateId?: string
) {
  const resizeStateRef = useRef<ResizeState | null>(null);
  const [isResizing, setIsResizing] = useState(false);

  // Load saved widths on mount
  useEffect(() => {
    if (!estimateId) return;
    
    try {
      const saved = localStorage.getItem(`${STORAGE_KEY}-${estimateId}`);
      if (saved) {
        const savedWidths: Record<string, number> = JSON.parse(saved);
        setColumns(prev => prev.map(col => ({
          ...col,
          widthPx: savedWidths[col.id] ?? col.widthPx
        })));
      }
    } catch (e) {
      console.error('Failed to load column widths:', e);
    }
  }, [estimateId, setColumns]);

  // Save widths to localStorage
  const saveWidths = useCallback((cols: ColumnConfig[]) => {
    if (!estimateId) return;
    
    try {
      const widths: Record<string, number> = {};
      cols.forEach(col => {
        widths[col.id] = col.widthPx;
      });
      localStorage.setItem(`${STORAGE_KEY}-${estimateId}`, JSON.stringify(widths));
    } catch (e) {
      console.error('Failed to save column widths:', e);
    }
  }, [estimateId]);

  // Start resize
  const handleResizeStart = useCallback((e: React.MouseEvent, columnId: string) => {
    e.preventDefault();
    e.stopPropagation();
    
    const column = columns.find(c => c.id === columnId);
    if (!column) return;
    
    resizeStateRef.current = {
      columnId,
      startX: e.clientX,
      startWidth: column.widthPx,
    };
    setIsResizing(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [columns]);

  // Handle resize move
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!resizeStateRef.current) return;
      
      const { columnId, startX, startWidth } = resizeStateRef.current;
      const delta = e.clientX - startX;
      const minWidth = MIN_WIDTHS[columnId] || 60;
      const maxWidth = MAX_WIDTHS[columnId] || 800;
      const newWidth = Math.max(minWidth, Math.min(maxWidth, startWidth + delta));
      
      setColumns(prev => prev.map(col => 
        col.id === columnId ? { ...col, widthPx: newWidth } : col
      ));
    };

    const handleMouseUp = () => {
      if (resizeStateRef.current) {
        resizeStateRef.current = null;
        setIsResizing(false);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        
        // Save after resize ends
        setColumns(prev => {
          saveWidths(prev);
          return prev;
        });
      }
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, setColumns, saveWidths]);

  // Generate grid template columns string
  const getGridTemplate = useCallback(() => {
    const visibleCols = columns.filter(c => c.visible);
    // Fixed columns: drag handle (32px), checkbox (24px), actions (80px)
    const colWidths = visibleCols.map(c => `${c.widthPx}px`).join(' ');
    return `32px 24px ${colWidths} 80px`;
  }, [columns]);

  // Get total table width
  const getTableWidth = useCallback(() => {
    const visibleCols = columns.filter(c => c.visible);
    return 32 + 24 + visibleCols.reduce((sum, c) => sum + c.widthPx, 0) + 80;
  }, [columns]);

  return {
    handleResizeStart,
    isResizing,
    getGridTemplate,
    getTableWidth,
  };
}
