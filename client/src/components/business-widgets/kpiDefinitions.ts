import {
  Building2,
  DollarSign,
  FileText,
  GitBranch,
  Mail,
  Activity,
  AlertTriangle,
  UserPlus,
  TrendingUp,
  Wallet,
  Scale,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react";

export type KPIKey =
  | "active_projects"
  | "total_revenue"
  | "outstanding_invoices"
  | "variations_pending"
  | "proposals_open"
  | "team_utilisation"
  | "overdue_tasks"
  | "new_leads"
  | "avg_project_margin"
  | "cash_position"
  | "budget_variance"
  | "safety_incidents";

export type KPIPeriod = "month" | "quarter" | "year";

export type KPIFormat = "number" | "currency" | "percent";

export interface KPIDefinition {
  key: KPIKey;
  label: string;
  shortLabel: string;
  format: KPIFormat;
  accentVar: string; // hsl var name e.g. "--bp-purple"
  icon: LucideIcon;
  financialGated: boolean;
  description?: string;
}

export const KPI_DEFINITIONS: Record<KPIKey, KPIDefinition> = {
  active_projects: {
    key: "active_projects",
    label: "Active Projects",
    shortLabel: "Active Projects",
    format: "number",
    accentVar: "--bp-purple",
    icon: Building2,
    financialGated: false,
  },
  total_revenue: {
    key: "total_revenue",
    label: "Total Revenue",
    shortLabel: "Revenue",
    format: "currency",
    accentVar: "--bp-amber",
    icon: DollarSign,
    financialGated: true,
  },
  outstanding_invoices: {
    key: "outstanding_invoices",
    label: "Outstanding Invoices",
    shortLabel: "Outstanding",
    format: "currency",
    accentVar: "--bp-coral",
    icon: FileText,
    financialGated: true,
  },
  variations_pending: {
    key: "variations_pending",
    label: "Variations Pending",
    shortLabel: "Variations",
    format: "number",
    accentVar: "--bp-teal",
    icon: GitBranch,
    financialGated: false,
  },
  proposals_open: {
    key: "proposals_open",
    label: "Proposals Open",
    shortLabel: "Proposals",
    format: "number",
    accentVar: "--bp-purple",
    icon: Mail,
    financialGated: false,
  },
  team_utilisation: {
    key: "team_utilisation",
    label: "Team Utilisation",
    shortLabel: "Utilisation",
    format: "percent",
    accentVar: "--bp-green",
    icon: Activity,
    financialGated: false,
  },
  overdue_tasks: {
    key: "overdue_tasks",
    label: "Overdue Tasks",
    shortLabel: "Overdue",
    format: "number",
    accentVar: "--bp-coral",
    icon: AlertTriangle,
    financialGated: false,
  },
  new_leads: {
    key: "new_leads",
    label: "New Leads",
    shortLabel: "Leads",
    format: "number",
    accentVar: "--bp-teal",
    icon: UserPlus,
    financialGated: false,
  },
  avg_project_margin: {
    key: "avg_project_margin",
    label: "Avg Project Margin",
    shortLabel: "Margin",
    format: "percent",
    accentVar: "--bp-amber",
    icon: TrendingUp,
    financialGated: true,
  },
  cash_position: {
    key: "cash_position",
    label: "Cash Position",
    shortLabel: "Cash",
    format: "currency",
    accentVar: "--bp-green",
    icon: Wallet,
    financialGated: true,
  },
  budget_variance: {
    key: "budget_variance",
    label: "Budget Variance",
    shortLabel: "Variance",
    format: "currency",
    accentVar: "--bp-amber",
    icon: Scale,
    financialGated: true,
  },
  safety_incidents: {
    key: "safety_incidents",
    label: "Safety Incidents",
    shortLabel: "Incidents",
    format: "number",
    accentVar: "--bp-coral",
    icon: ShieldAlert,
    financialGated: false,
  },
};

export const KPI_KEY_ORDER: KPIKey[] = [
  "active_projects",
  "total_revenue",
  "outstanding_invoices",
  "variations_pending",
  "proposals_open",
  "team_utilisation",
  "overdue_tasks",
  "new_leads",
  "avg_project_margin",
  "cash_position",
  "budget_variance",
  "safety_incidents",
];

export const DEFAULT_SELECTED_KPIS: KPIKey[] = [
  "active_projects",
  "total_revenue",
  "outstanding_invoices",
  "variations_pending",
  "team_utilisation",
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
    return `${value.toFixed(1)}%`;
  }
  return value.toLocaleString();
}
