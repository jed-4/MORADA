import { useMemo } from "react";
import { Link } from "wouter";
import { useQueries, useQuery } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import { AlertCircle } from "lucide-react";
import { DataTable, type DataTableColumnMeta } from "@/components/data-table/DataTable";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/formatters";
import type { ContractMetrics } from "@shared/projectMetrics";

interface Project {
  id: string;
  name: string;
  projectStatus: string | null;
  projectSubStatus?: string | null;
  currentSystemPhase?: string | null;
  isBusiness?: boolean;
}

export interface ProjectInfoRow {
  id: string;
  name: string;
  projectStatus: string | null;
  projectSubStatus: string | null;
  currentSystemPhase: string | null;
  metrics: ContractMetrics | null;
  metricsLoading: boolean;
  metricsError: boolean;
}

// ── Column registry ─────────────────────────────────────────────────────────
// Add new columns here and they automatically become available in the table
// (visibility / order persisted via DataTable's built-in column picker).
type ProjectInfoColumn = ColumnDef<ProjectInfoRow, unknown> & {
  meta: DataTableColumnMeta;
};

const humanise = (s: string) =>
  s.replace(/_/g, " ").replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const moneyCell = (row: ProjectInfoRow, value: number | null | undefined) => {
  if (row.metricsLoading) {
    return <span className="text-muted-foreground/40 text-xs">…</span>;
  }
  if (row.metricsError) {
    return (
      <span className="inline-flex items-center gap-1 text-destructive text-xs" title="Failed to load">
        <AlertCircle className="h-3 w-3" /> error
      </span>
    );
  }
  return <span className="tabular-nums text-xs">{formatCurrency(value ?? null)}</span>;
};

export const PROJECT_INFO_COLUMN_REGISTRY: ProjectInfoColumn[] = [
  {
    id: "name",
    header: "Project",
    accessorFn: (r) => r.name,
    cell: ({ row }) => (
      <Link href={`/projects/${row.original.id}`}>
        <a
          className="text-xs font-medium hover:underline focus-visible:underline"
          data-testid={`link-project-${row.original.id}`}
        >
          {row.original.name}
        </a>
      </Link>
    ),
    size: 280,
    meta: { defaultWidth: 280, headerLabel: "Project" },
  },
  {
    id: "status",
    header: "Status",
    accessorFn: (r) => r.projectStatus ?? "",
    cell: ({ row }) =>
      row.original.projectStatus ? (
        <Badge variant="secondary" className="text-data">
          {humanise(row.original.projectStatus)}
        </Badge>
      ) : (
        <span className="text-muted-foreground/40 text-xs">—</span>
      ),
    size: 150,
    meta: { defaultWidth: 150, headerLabel: "Status" },
  },
  {
    id: "phase",
    header: "Phase",
    accessorFn: (r) => r.currentSystemPhase ?? r.projectSubStatus ?? "",
    cell: ({ row }) => {
      const value = row.original.currentSystemPhase ?? row.original.projectSubStatus;
      return value ? (
        <Badge variant="outline" className="text-data">
          {humanise(value)}
        </Badge>
      ) : (
        <span className="text-muted-foreground/40 text-xs">—</span>
      );
    },
    size: 170,
    meta: { defaultWidth: 170, headerLabel: "Phase / Sub-status" },
  },
  {
    id: "contractExGst",
    header: "Contract Price (ex GST)",
    accessorFn: (r) => r.metrics?.originalContractPriceExGstCents ?? 0,
    cell: ({ row }) => moneyCell(row.original, row.original.metrics?.originalContractPriceExGstCents),
    size: 170,
    meta: { defaultWidth: 170, align: "right", headerLabel: "Contract (ex GST)" },
  },
  {
    id: "contractIncGst",
    header: "Contract Price (inc GST)",
    accessorFn: (r) => r.metrics?.originalContractPriceIncGstCents ?? 0,
    cell: ({ row }) => moneyCell(row.original, row.original.metrics?.originalContractPriceIncGstCents),
    size: 170,
    meta: { defaultWidth: 170, align: "right", headerLabel: "Contract (inc GST)" },
  },
  {
    id: "revisedExGst",
    header: "Revised Contract (ex GST)",
    accessorFn: (r) => r.metrics?.revisedContractPriceExGstCents ?? 0,
    cell: ({ row }) => moneyCell(row.original, row.original.metrics?.revisedContractPriceExGstCents),
    size: 180,
    meta: { defaultWidth: 180, align: "right", headerLabel: "Revised (ex GST)" },
  },
  {
    id: "revisedIncGst",
    header: "Revised Contract (inc GST)",
    accessorFn: (r) => r.metrics?.revisedContractPriceIncGstCents ?? 0,
    cell: ({ row }) => moneyCell(row.original, row.original.metrics?.revisedContractPriceIncGstCents),
    size: 180,
    meta: { defaultWidth: 180, align: "right", headerLabel: "Revised (inc GST)" },
  },
];

// ── Tab ─────────────────────────────────────────────────────────────────────

export default function ProjectInfoTab() {
  const {
    data: projects = [],
    isLoading: projectsLoading,
    isError: projectsError,
    error: projectsErrorObj,
  } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
    queryFn: () =>
      fetch("/api/projects", { credentials: "include" }).then((r) => {
        if (!r.ok) throw new Error("Failed to load projects");
        return r.json();
      }),
  });

  const clientProjects = useMemo(
    () => projects.filter((p) => !p.isBusiness),
    [projects],
  );

  // One query per project for the centralised contract-metrics endpoint.
  // Cheap to fan out and benefits from per-project caching across pages.
  const metricsQueries = useQueries({
    queries: clientProjects.map((p) => ({
      queryKey: ["/api/projects", p.id, "contract-metrics"] as const,
      queryFn: () =>
        fetch(`/api/projects/${p.id}/contract-metrics`, { credentials: "include" }).then((r) => {
          if (!r.ok) throw new Error("Failed to load contract metrics");
          return r.json() as Promise<ContractMetrics>;
        }),
      staleTime: 60_000,
    })),
  });

  const rows = useMemo<ProjectInfoRow[]>(
    () =>
      clientProjects.map((p, idx) => {
        const q = metricsQueries[idx];
        return {
          id: p.id,
          name: p.name,
          projectStatus: p.projectStatus,
          projectSubStatus: p.projectSubStatus ?? null,
          currentSystemPhase: p.currentSystemPhase ?? null,
          metrics: q?.data ?? null,
          metricsLoading: q?.isLoading ?? false,
          metricsError: q?.isError ?? false,
        };
      }),
    [clientProjects, metricsQueries],
  );

  if (projectsError) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div
          className="flex items-center gap-2 text-sm text-destructive"
          data-testid="error-project-info"
        >
          <AlertCircle className="h-4 w-4" />
          {projectsErrorObj instanceof Error
            ? projectsErrorObj.message
            : "Failed to load projects."}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 min-h-0">
        <DataTable
          data={rows}
          columns={PROJECT_INFO_COLUMN_REGISTRY}
          storageKey="business-metrics-project-info"
          rowKey={(r) => r.id}
          emptyState={
            <div className="p-6 text-sm text-muted-foreground">
              {projectsLoading ? "Loading projects…" : "No projects yet."}
            </div>
          }
        />
      </div>
    </div>
  );
}
