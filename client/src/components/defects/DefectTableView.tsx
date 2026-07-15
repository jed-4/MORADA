import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Defect } from "@shared/schema";
import { type ColumnDef } from "@tanstack/react-table";
import {
  DataTable,
  type DataTableColumnMeta,
} from "@/components/data-table/DataTable";
import { EmptyState } from "@/components/EmptyState";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { MoreVertical, Pencil, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { DefectFormDialog } from "./DefectFormDialog";
import { useDefectStatusOptions } from "@/hooks/useDefectStatusOptions";
import { useDefectPriorityOptions } from "@/hooks/useDefectPriorityOptions";
import { useDefectTypeOptions } from "@/hooks/useDefectTypeOptions";
import { useDefectTradeOptions } from "@/hooks/useDefectTradeOptions";

interface DefectTableViewProps {
  defects: Defect[];
}

export function DefectTableView({ defects }: DefectTableViewProps) {
  const { toast } = useToast();
  const [editingDefect, setEditingDefect] = useState<Defect | null>(null);
  const [deletingDefect, setDeletingDefect] = useState<Defect | null>(null);

  const { statusOptions } = useDefectStatusOptions();
  const { priorityOptions } = useDefectPriorityOptions();
  const { typeOptions } = useDefectTypeOptions();
  const tradeOptions = useDefectTradeOptions();

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/defects/${id}`, "DELETE", null);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/defects"] });
      toast({
        title: "Success",
        description: "Defect deleted successfully",
      });
      setDeletingDefect(null);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete defect",
        variant: "destructive",
      });
    },
  });

  const getStatusBadge = (status: string) => {
    const option = statusOptions.find((o) => o.key === status);
    if (!option) return <StatusBadge status={status} />;

    return (
      <StatusBadge
        status={status}
        label={option.name}
        color={`#${option.color || "6B7280"}`}
        data-testid={`badge-status-${status}`}
      />
    );
  };

  const getPriorityBadge = (priority: string) => {
    const option = priorityOptions.find((o) => o.key === priority);
    if (!option) return <Badge variant="outline">{priority}</Badge>;

    return (
      <Badge
        variant="outline"
        style={{
          borderColor: `#${option.color || "6B7280"}`,
          color: `#${option.color || "6B7280"}`,
        }}
        data-testid={`badge-priority-${priority}`}
      >
        {option.name}
      </Badge>
    );
  };

  const getTypeLabel = (type: string) => {
    const option = typeOptions.find((o) => o.key === type);
    return option?.name || type;
  };

  const getTradeLabel = (trade: string | null) => {
    if (!trade) return "-";
    const option = tradeOptions.find((o: { value: string; label: string; color: string }) => o.value === trade);
    return option?.label || trade;
  };

  const columns = useMemo<ColumnDef<Defect, unknown>[]>(
    () => [
      {
        id: "id",
        header: "ID",
        accessorFn: (d) => d.id,
        cell: ({ row }) => (
          <span className="text-xs font-medium" data-testid={`text-id-${row.original.id}`}>
            {row.original.id}
          </span>
        ),
        size: 80,
        meta: { defaultWidth: 80, headerLabel: "ID" } satisfies DataTableColumnMeta,
      },
      {
        id: "title",
        header: "Title",
        accessorFn: (d) => d.title || "",
        cell: ({ row }) => (
          <span className="text-xs" data-testid={`text-title-${row.original.id}`}>
            {row.original.title}
          </span>
        ),
        size: 260,
        meta: { defaultWidth: 260, headerLabel: "Title" } satisfies DataTableColumnMeta,
      },
      {
        id: "status",
        header: "Status",
        accessorFn: (d) => {
          const option = statusOptions.find((o) => o.key === d.status);
          return option?.name || d.status;
        },
        cell: ({ row }) => getStatusBadge(row.original.status),
        size: 120,
        meta: { defaultWidth: 120, headerLabel: "Status" } satisfies DataTableColumnMeta,
      },
      {
        id: "priority",
        header: "Priority",
        accessorFn: (d) => {
          const option = priorityOptions.find((o) => o.key === d.priority);
          return option?.name || d.priority;
        },
        cell: ({ row }) => getPriorityBadge(row.original.priority),
        size: 110,
        meta: { defaultWidth: 110, headerLabel: "Priority" } satisfies DataTableColumnMeta,
      },
      {
        id: "type",
        header: "Type",
        accessorFn: (d) => getTypeLabel(d.type),
        cell: ({ row }) => (
          <span className="text-xs" data-testid={`text-type-${row.original.id}`}>
            {getTypeLabel(row.original.type)}
          </span>
        ),
        size: 120,
        meta: { defaultWidth: 120, headerLabel: "Type" } satisfies DataTableColumnMeta,
      },
      {
        id: "trade",
        header: "Trade",
        accessorFn: (d) => getTradeLabel(d.trade),
        cell: ({ row }) => (
          <span className="text-xs" data-testid={`text-trade-${row.original.id}`}>
            {getTradeLabel(row.original.trade)}
          </span>
        ),
        size: 120,
        meta: { defaultWidth: 120, headerLabel: "Trade" } satisfies DataTableColumnMeta,
      },
      {
        id: "location",
        header: "Location",
        accessorFn: (d) => d.location || "",
        cell: ({ row }) => (
          <span className="text-xs" data-testid={`text-location-${row.original.id}`}>
            {row.original.location || "-"}
          </span>
        ),
        size: 150,
        meta: { defaultWidth: 150, headerLabel: "Location" } satisfies DataTableColumnMeta,
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={(e) => e.stopPropagation()}
                data-testid={`button-menu-${row.original.id}`}
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => setEditingDefect(row.original)}
                data-testid={`menu-item-edit-${row.original.id}`}
              >
                <Pencil className="h-4 w-4 mr-2" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setDeletingDefect(row.original)}
                className="text-destructive"
                data-testid={`menu-item-delete-${row.original.id}`}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
        size: 50,
        meta: { defaultWidth: 50, align: "center", headerLabel: "Actions" } satisfies DataTableColumnMeta,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [statusOptions, priorityOptions, typeOptions, tradeOptions],
  );

  return (
    <>
      <div className="border rounded-md overflow-hidden">
        <DataTable
          data={defects}
          columns={columns}
          storageKey="defects"
          rowKey={(d) => `defect-${d.id}`}
          emptyState={<EmptyState variant="inline" title="No defects found" />}
        />
      </div>

      <DefectFormDialog
        open={!!editingDefect}
        onOpenChange={(open) => !open && setEditingDefect(null)}
        defect={editingDefect || undefined}
      />

      <AlertDialog
        open={!!deletingDefect}
        onOpenChange={(open) => !open && setDeletingDefect(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Defect</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deletingDefect?.title}"? This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingDefect && deleteMutation.mutate(deletingDefect.id)}
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
