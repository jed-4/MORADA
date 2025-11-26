import { createContext, useContext, useState, useCallback, useRef, useEffect, useMemo } from 'react';

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

interface EstimateGridLayoutContextValue {
  columns: ColumnConfig[];
  setColumns: React.Dispatch<React.SetStateAction<ColumnConfig[]>>;
  gridTemplateColumns: string;
  tableWidth: number;
  handleResizeStart: (e: React.MouseEvent, columnId: string) => void;
  isResizing: boolean;
}

const EstimateGridLayoutContext = createContext<EstimateGridLayoutContextValue | null>(null);

const STORAGE_KEY = 'estimate-column-widths';

const MIN_WIDTHS: Record<string, number> = {
  costCode: 80,
  item: 120,
  description: 150,
  status: 70,
  proposalVisible: 70,
  shownAs: 70,
  allowance: 60,
  quantity: 70,
  wastage: 50,
  unitType: 50,
  unitCostExTax: 90,
  unitCostIncTax: 90,
  builderCost: 100,
  builderCostIncTax: 100,
  markup: 70,
  clientPriceExTax: 90,
  clientTax: 70,
  clientPriceIncTax: 90,
  notes: 50,
};

const MAX_WIDTHS: Record<string, number> = {
  description: 600,
  item: 500,
};

interface Props {
  children: React.ReactNode;
  initialColumns: ColumnConfig[];
  estimateId?: string;
  onColumnsChange?: (columns: ColumnConfig[]) => void;
}

export function EstimateGridLayoutProvider({ children, initialColumns, estimateId, onColumnsChange }: Props) {
  const [columns, setColumnsInternal] = useState<ColumnConfig[]>(initialColumns);
  const resizeStateRef = useRef<ResizeState | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const rafRef = useRef<number | null>(null);

  // Sync with parent columns
  useEffect(() => {
    setColumnsInternal(initialColumns);
  }, [initialColumns]);

  // Wrapper to notify parent of changes
  const setColumns: React.Dispatch<React.SetStateAction<ColumnConfig[]>> = useCallback((action) => {
    setColumnsInternal(prev => {
      const newCols = typeof action === 'function' ? action(prev) : action;
      return newCols;
    });
  }, []);

  // Save widths to localStorage
  const saveWidths = useCallback((cols: ColumnConfig[]) => {
    if (!estimateId) return;
    try {
      const widths: Record<string, number> = {};
      cols.forEach(col => { widths[col.id] = col.widthPx; });
      localStorage.setItem(`${STORAGE_KEY}-${estimateId}`, JSON.stringify(widths));
      onColumnsChange?.(cols);
    } catch (e) {
      console.error('Failed to save column widths:', e);
    }
  }, [estimateId, onColumnsChange]);

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

  // Handle resize move with RAF for smooth updates
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!resizeStateRef.current) return;
      
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
      
      rafRef.current = requestAnimationFrame(() => {
        if (!resizeStateRef.current) return;
        
        const { columnId, startX, startWidth } = resizeStateRef.current;
        const delta = e.clientX - startX;
        const minWidth = MIN_WIDTHS[columnId] || 50;
        const maxWidth = MAX_WIDTHS[columnId] || 800;
        const newWidth = Math.max(minWidth, Math.min(maxWidth, startWidth + delta));
        
        setColumnsInternal(prev => prev.map(col => 
          col.id === columnId ? { ...col, widthPx: newWidth } : col
        ));
      });
    };

    const handleMouseUp = () => {
      if (resizeStateRef.current) {
        resizeStateRef.current = null;
        setIsResizing(false);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        
        if (rafRef.current) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
        
        // Save after resize ends
        setColumnsInternal(prev => {
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
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [isResizing, saveWidths]);

  // Memoized grid template and width
  const { gridTemplateColumns, tableWidth } = useMemo(() => {
    const visibleCols = columns.filter(c => c.visible);
    const colWidths = visibleCols.map(c => `${c.widthPx}px`).join(' ');
    const template = `32px 24px ${colWidths} 80px`;
    const width = 32 + 24 + visibleCols.reduce((sum, c) => sum + c.widthPx, 0) + 80;
    return { gridTemplateColumns: template, tableWidth: width };
  }, [columns]);

  const value = useMemo(() => ({
    columns,
    setColumns,
    gridTemplateColumns,
    tableWidth,
    handleResizeStart,
    isResizing,
  }), [columns, setColumns, gridTemplateColumns, tableWidth, handleResizeStart, isResizing]);

  return (
    <EstimateGridLayoutContext.Provider value={value}>
      {children}
    </EstimateGridLayoutContext.Provider>
  );
}

export function useEstimateGridLayout() {
  const context = useContext(EstimateGridLayoutContext);
  if (!context) {
    throw new Error('useEstimateGridLayout must be used within EstimateGridLayoutProvider');
  }
  return context;
}
