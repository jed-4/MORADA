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
}

export interface WidgetDefinition {
  type: string;
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  component: React.ComponentType<WidgetProps>;
  defaultSize: "sm" | "md" | "lg" | "xl";
  configurable?: boolean;
}

export interface WidgetProps {
  widget: Widget;
  onUpdate?: (widget: Widget) => void;
  onRemove?: (widgetId: string) => void;
  isConfiguring?: boolean;
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