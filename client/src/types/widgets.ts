import type { ReactNode } from "react";

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
  /**
   * Specific permission required to view this widget. When set, the
   * dashboard renders a locked overlay if the user lacks this permission,
   * matching the backend `requirePermission` middleware on the widget's
   * data endpoint. Takes precedence over the broader `financialGated`
   * "any financial.*" check.
   */
  requiredPermission?: { key: string; action?: "view" | "edit" | "add" | "delete" | "approve" };
  defaultColumns?: number;
  defaultRowSpan?: number;
  /**
   * If true, multiple instances of this widget can be added to the same
   * dashboard with independent configurations (e.g. KPIs widget with
   * different period + selectedKpis per instance).
   */
  multiInstance?: boolean;
}

export interface WidgetProps {
  widget: Widget;
  onUpdate?: (widget: Widget) => void;
  onRemove?: (widgetId: string) => void;
  isConfiguring?: boolean;
  onCloseConfig?: () => void;
  userId?: string;
  /** Called by the widget to push React nodes into the WidgetCard header row */
  onSetHeaderActions?: (actions: ReactNode) => void;
  /**
   * Where this widget's title should lead. Registered by the widget because the
   * destination is usually dynamic (project-scoped routes), so the registry
   * cannot know it. Pass null for a widget with no full page behind it.
   */
  onSetTitleAction?: (action: WidgetTitleAction | null) => void;
}

export interface WidgetTitleAction {
  /** Tooltip and accessible name, e.g. "All bills". */
  label: string;
  onClick: () => void;
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