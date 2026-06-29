export type KPIKey =
  | "in_construction"
  | "pre_construction"
  | "revenue_buildpro"
  | "revenue_xero"
  | "outstanding_buildpro"
  | "outstanding_xero"
  | "variations_pending"
  | "variations_approved"
  | "overdue_tasks"
  | "budget_variance"
  | "cash_xero"
  | "avg_margin"
  | "pipeline_value";

export type KPIPeriod = "month" | "quarter" | "year";

export type KPIFormat = "number" | "currency" | "percent";

export type KPIAccent = "teal" | "purple" | "green" | "amber" | "coral";

export interface KPIDefinition {
  key: KPIKey;
  label: string;
  labelDetail?: string;
  description: string;
  format: KPIFormat;
  accent: KPIAccent;
  financialGated: boolean;
  periodFilter: boolean;
  endpoint: string;
  requiresXero?: boolean;
  hasConfig?: boolean;
  showTrend?: boolean;
}

export const ACCENT_VAR: Record<KPIAccent, string> = {
  teal: "--bp-teal",
  purple: "--bp-purple",
  green: "--bp-green",
  amber: "--bp-amber",
  coral: "--bp-coral",
};

export const KPI_DEFINITIONS: Record<KPIKey, KPIDefinition> = {
  in_construction: {
    key: "in_construction",
    label: "In Construction",
    description: "Active projects currently in the construction phase",
    format: "number",
    accent: "teal",
    financialGated: false,
    periodFilter: false,
    endpoint: "/api/kpis/in-construction",
  },
  pre_construction: {
    key: "pre_construction",
    label: "Pre-Construction",
    description: "Projects in the pre-construction phase",
    format: "number",
    accent: "purple",
    financialGated: false,
    periodFilter: false,
    endpoint: "/api/kpis/pre-construction",
  },
  revenue_buildpro: {
    key: "revenue_buildpro",
    label: "Revenue",
    labelDetail: "Morada",
    description: "Total revenue from sent/paid invoices in Morada",
    format: "currency",
    accent: "green",
    financialGated: true,
    periodFilter: true,
    endpoint: "/api/kpis/revenue-buildpro",
  },
  revenue_xero: {
    key: "revenue_xero",
    label: "Revenue",
    labelDetail: "Xero",
    description: "Total revenue from Xero P&L for the selected period",
    format: "currency",
    accent: "green",
    financialGated: true,
    periodFilter: true,
    endpoint: "/api/kpis/revenue-xero",
    requiresXero: true,
  },
  outstanding_buildpro: {
    key: "outstanding_buildpro",
    label: "Outstanding",
    labelDetail: "Morada",
    description: "Total value of unpaid invoices in Morada",
    format: "currency",
    accent: "amber",
    financialGated: true,
    periodFilter: false,
    endpoint: "/api/kpis/outstanding-buildpro",
  },
  outstanding_xero: {
    key: "outstanding_xero",
    label: "Outstanding",
    labelDetail: "Xero",
    description: "Accounts receivable balance from Xero",
    format: "currency",
    accent: "amber",
    financialGated: true,
    periodFilter: false,
    endpoint: "/api/kpis/outstanding-xero",
    requiresXero: true,
  },
  variations_pending: {
    key: "variations_pending",
    label: "Variations Pending",
    description: "Variations sent but not yet approved",
    format: "number",
    accent: "amber",
    financialGated: false,
    periodFilter: false,
    endpoint: "/api/kpis/variations-pending",
  },
  variations_approved: {
    key: "variations_approved",
    label: "Variations Approved",
    description: "Total value of variations approved in the selected period",
    format: "currency",
    accent: "green",
    financialGated: false,
    periodFilter: true,
    endpoint: "/api/kpis/variations-approved",
  },
  overdue_tasks: {
    key: "overdue_tasks",
    label: "Overdue Tasks",
    description: "Tasks that became overdue within the selected period",
    format: "number",
    accent: "coral",
    financialGated: false,
    periodFilter: true,
    endpoint: "/api/kpis/overdue-tasks",
  },
  budget_variance: {
    key: "budget_variance",
    label: "Budget Variance",
    description: "Average variance between actual costs and budget across active projects",
    format: "percent",
    accent: "amber",
    financialGated: true,
    periodFilter: true,
    endpoint: "/api/kpis/budget-variance",
    showTrend: true,
  },
  cash_xero: {
    key: "cash_xero",
    label: "Cash Position",
    labelDetail: "Xero",
    description: "Combined balance of selected Xero bank accounts",
    format: "currency",
    accent: "teal",
    financialGated: true,
    periodFilter: false,
    endpoint: "/api/kpis/cash-xero",
    requiresXero: true,
    hasConfig: true,
  },
  avg_margin: {
    key: "avg_margin",
    label: "Avg Project Margin",
    description: "Average gross margin across active projects in the period",
    format: "percent",
    accent: "green",
    financialGated: true,
    periodFilter: true,
    endpoint: "/api/kpis/avg-margin",
  },
  pipeline_value: {
    key: "pipeline_value",
    label: "Pipeline Value",
    description: "Combined estimated value of all projects in the lead phase",
    format: "currency",
    accent: "purple",
    financialGated: true,
    periodFilter: false,
    endpoint: "/api/kpis/pipeline-value",
  },
};

export const KPI_KEY_ORDER: KPIKey[] = [
  "in_construction",
  "pre_construction",
  "pipeline_value",
  "revenue_buildpro",
  "revenue_xero",
  "outstanding_buildpro",
  "outstanding_xero",
  "variations_pending",
  "variations_approved",
  "overdue_tasks",
  "budget_variance",
  "cash_xero",
  "avg_margin",
];

export const DEFAULT_SELECTED_KPIS: KPIKey[] = [
  "in_construction",
  "pre_construction",
  "revenue_buildpro",
  "outstanding_buildpro",
  "variations_pending",
  "overdue_tasks",
];

export function formatKPIValue(value: number | null | undefined, format: KPIFormat): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  if (format === "currency") {
    const v = value;
    const abs = Math.abs(v);
    if (abs >= 1_000_000) return `${v < 0 ? "-" : ""}$${(abs / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000) return `${v < 0 ? "-" : ""}$${(abs / 1_000).toFixed(0)}K`;
    return `${v < 0 ? "-" : ""}$${abs.toFixed(0)}`;
  }
  if (format === "percent") {
    const sign = value > 0 ? "+" : "";
    return `${sign}${value.toFixed(1)}%`;
  }
  return value.toLocaleString();
}
