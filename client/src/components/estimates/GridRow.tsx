import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';

interface GridRowProps {
  id: string;
  gridTemplate: string;
  children: React.ReactNode;
  className?: string;
  isDraggable?: boolean;
  onClick?: () => void;
}

export const GridRow = React.memo(({ 
  id, 
  gridTemplate, 
  children, 
  className = '', 
  isDraggable = true,
  onClick 
}: GridRowProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled: !isDraggable });

  const style = React.useMemo(() => ({
    display: 'grid',
    gridTemplateColumns: gridTemplate,
    transform: CSS.Transform.toString(transform),
    transition: transition || 'transform 150ms cubic-bezier(0.25, 0.1, 0.25, 1)',
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1000 : 'auto',
  }), [gridTemplate, transform, transition, isDragging]);

  return (
    <div
      ref={setNodeRef}
      role="row"
      style={style}
      className={`${className} group hover:bg-gray-50 dark:hover:bg-muted/50 transition-colors border-b border-gray-100 dark:border-gray-800 ${isDragging ? 'shadow-lg bg-background dark:bg-card' : ''}`}
      data-testid={`row-item-${id}`}
      onClick={onClick}
    >
      {/* Drag handle cell */}
      <div 
        className="h-10 px-1 flex items-center justify-center"
        role="gridcell"
      >
        {isDraggable && (
          <div
            {...attributes}
            {...listeners}
            className="opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing transition-opacity"
          >
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </div>
        )}
      </div>
      {children}
    </div>
  );
});

GridRow.displayName = 'GridRow';

// Grid cell component for consistent styling
interface GridCellProps {
  children?: React.ReactNode;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
  title?: string;
  'data-testid'?: string;
}

export const GridCell = React.memo(({ 
  children, 
  className = '', 
  onClick,
  title,
  'data-testid': testId
}: GridCellProps) => {
  return (
    <div 
      role="gridcell"
      className={`h-10 px-2 flex items-center text-sm overflow-hidden ${className}`}
      onClick={onClick}
      title={title}
      data-testid={testId}
    >
      {children}
    </div>
  );
});

GridCell.displayName = 'GridCell';

// Grid header row (non-sortable)
interface GridHeaderRowProps {
  gridTemplate: string;
  children: React.ReactNode;
  className?: string;
}

export const GridHeaderRow = React.memo(({ 
  gridTemplate, 
  children, 
  className = '' 
}: GridHeaderRowProps) => {
  return (
    <div
      role="row"
      style={{ 
        display: 'grid', 
        gridTemplateColumns: gridTemplate 
      }}
      className={`bg-muted/30 border-b-2 border-gray-200 dark:border-gray-700 ${className}`}
    >
      {/* Empty drag handle column */}
      <div className="h-10 px-1 flex items-center" role="columnheader" />
      {children}
    </div>
  );
});

GridHeaderRow.displayName = 'GridHeaderRow';

// Grid header cell with resize handle
interface GridHeaderCellProps {
  children?: React.ReactNode;
  className?: string;
  columnId: string;
  onResizeStart?: (e: React.MouseEvent, columnId: string) => void;
  isLastColumn?: boolean;
}

export const GridHeaderCell = React.memo(({ 
  children, 
  className = '',
  columnId,
  onResizeStart,
  isLastColumn = false
}: GridHeaderCellProps) => {
  return (
    <div 
      role="columnheader"
      className={`h-10 px-2 flex items-center text-xs font-semibold relative group/header ${className}`}
    >
      <span className="truncate">{children}</span>
      {!isLastColumn && onResizeStart && (
        <div
          className="absolute right-0 top-0 h-full w-1 cursor-col-resize opacity-0 group-hover/header:opacity-100 hover:bg-[#bba7db] bg-gray-300 transition-all z-10"
          onMouseDown={(e) => onResizeStart(e, columnId)}
          data-testid={`resize-handle-${columnId}`}
        />
      )}
    </div>
  );
});

GridHeaderCell.displayName = 'GridHeaderCell';

// Group header row with special styling
interface GridGroupRowProps {
  id: string;
  gridTemplate: string;
  children: React.ReactNode;
  className?: string;
  isDraggable?: boolean;
}

export const GridGroupRow = React.memo(({ 
  id, 
  gridTemplate, 
  children, 
  className = '',
  isDraggable = true 
}: GridGroupRowProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `group-${id}`, disabled: !isDraggable });

  const style = React.useMemo(() => ({
    display: 'grid',
    gridTemplateColumns: gridTemplate,
    transform: CSS.Transform.toString(transform),
    transition: transition || 'transform 200ms ease-in-out',
    opacity: isDragging ? 0.4 : 1,
  }), [gridTemplate, transform, transition, isDragging]);

  return (
    <div
      ref={setNodeRef}
      role="row"
      style={style}
      className={`bg-muted/30 hover:bg-muted/50 transition-colors border-b border-gray-100 dark:border-gray-800 ${isDragging ? 'shadow-lg' : ''} ${className}`}
      data-testid={`row-group-${id}`}
    >
      {/* Drag handle cell */}
      <div className="h-10 px-1 flex items-center justify-center" role="gridcell">
        {isDraggable && (
          <div
            {...attributes}
            {...listeners}
            className="opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing transition-opacity"
          >
            <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
        )}
      </div>
      {children}
    </div>
  );
});

GridGroupRow.displayName = 'GridGroupRow';
