import { useMemo } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import { DataTable, type DataTableColumnMeta } from "@/components/data-table/DataTable";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/formatters";
import type { ContractMetrics } from "@shared/projectMetrics";

interface Project {
  id: string;
  name: string;
  projectStatus: string | null;
  isBusiness?: boolean;
}

export interface ProjectInfoRow {
  id: string;
  name: string;
  projectStatus: string | null;
  metrics: ContractMetrics | null;
  metricsLoading: boolean;
}

// ── Column registry ─────────────────────────────────────────────────────────
// Add new columns here and they automatically become available in the table
// (visibility / order persisted via DataTable's built-in column picker).
type ProjectInfoColumn = ColumnDef<ProjectInfoRow, unknown> & {
  meta: DataTableColumnMeta;
};

const moneyCell = (cents: number | null | undefined) => (
  <span className="tabular-nums text-xs">{formatCurrency(cents ?? null)}</span>
);

export const PROJECT_INFO_COLUMN_REGISTRY: ProjectInfoColumn[] = [
  {
    id: "name",
    header: "Project",
    accessorFn: (r) => r.name,
    cell: ({ row }) => (
      <span className="text-xs font-medium" data-testid={`cell-project-name-${row.original.id}`}>
        {row.original.name}
      </span>
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
        <Badge variant="secondary" className="text-data capitalize">
          {row.original.projectStatus.replace(/-/g, " ")}
        </Badge>
      ) : (
        <span className="text-muted-foreground/40 text-xs">—</span>
      ),
    size: 160,
    meta: { defaultWidth: 160, headerLabel: "Status" },
  },
  {
    id: "contractExGst",
    header: "Contract Price (ex GST)",
    accessorFn: (r) => r.metrics?.originalContractPriceExGstCents ?? 0,
    cell: ({ row }) =>
      row.original.metricsLoading
        ? <span className="text-muted-foreground/40 text-xs">…</span>
        : moneyCell(row.original.metrics?.originalContractPriceExGstCents),
    size: 170,
    meta: { defaultWidth: 170, align: "right", headerLabel: "Contract (ex GST)" },
  },
  {
    id: "contractIncGst",
    header: "Contract Price (inc GST)",
    accessorFn: (r) => r.metrics?.originalContractPriceIncGstCents ?? 0,
    cell: ({ row }) =>
      row.original.metricsLoading
        ? <span className="text-muted-foreground/40 text-xs">…</span>
        : moneyCell(row.original.metrics?.originalContractPriceIncGstCents),
    size: 170,
    meta: { defaultWidth: 170, align: "right", headerLabel: "Contract (inc GST)" },
  },
  {
    id: "revisedExGst",
    header: "Revised Contract (ex GST)",
    accessorFn: (r) => r.metrics?.revisedContractPriceExGstCents ?? 0,
    cell: ({ row }) =>
      row.original.metricsLoading
        ? <span className="text-muted-foreground/40 text-xs">…</span>
        : moneyCell(row.original.metrics?.revisedContractPriceExGstCents),
    size: 180,
    meta: { defaultWidth: 180, align: "right", headerLabel: "Revised (ex GST)" },
  },
  {
    id: "revisedIncGst",
    header: "Revised Contract (inc GST)",
    accessorFn: (r) => r.metrics?.revisedContractPriceIncGstCents ?? 0,
    cell: ({ row }) =>
      row.original.metricsLoading
        ? <span className="text-muted-foreground/40 text-xs">…</span>
        : moneyCell(row.original.metrics?.revisedContractPriceIncGstCents),
    size: 180,
    meta: { defaultWidth: 180, align: "right", headerLabel: "Revised (inc GST)" },
  },
];

// ── Tab ─────────────────────────────────────────────────────────────────────

export default function ProjectInfoTab() {
  const { data: projects = [], isLoading: projectsLoading } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
    queryFn: () => fetch("/api/projects", { credentials: "include" }).then((r) => r.json()),
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
      clientProjects.map((p, idx) => ({
        id: p.id,
        name: p.name,
        projectStatus: p.projectStatus,
        metrics: metricsQueries[idx]?.data ?? null,
        metricsLoading: metricsQueries[idx]?.isLoading ?? false,
      })),
    [clientProjects, metricsQueries],
  );

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
