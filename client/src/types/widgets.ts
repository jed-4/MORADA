export interface Widget {
  id: string;
  type: string;
  title: string;
  size: "sm" | "md" | "lg" | "xl";
  config?: Record<string, any>;
  position?: {
    row: number;
    col: number;
  };
  dimensions?: {
    columns?: number; // 1-8 columns for grid snapping
    width?: number;   // Keep for backwards compatibility and height-only custom sizing
    height?: number;
  };
}

export type WidgetAccent =
  | "purple"
  | "teal"
  | "green"
  | "amber"
  | "coral"
  | "financial"
  | "project"
  | "schedule"
  | "success"
  | "danger";

export interface WidgetDefinition {
  type: string;
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  component: React.ComponentType<WidgetProps>;
  defaultSize: "sm" | "md" | "lg" | "xl";
  configurable?: boolean;
  accent?: WidgetAccent;
  financialGated?: boolean;
  defaultColumns?: number;
  defaultRowSpan?: number;
}

export interface WidgetProps {
  widget: Widget;
  onUpdate?: (widget: Widget) => void;
  onRemove?: (widgetId: string) => void;
  isConfiguring?: boolean;
  onCloseConfig?: () => void;
  userId?: string;
}

export interface ProjectDashboard {
  id: string;
  projectId: string;
  widgets: Widget[];
  layout: {
    cols: number;
    rowHeight: number;
  };
}