import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Defect } from "@shared/schema";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
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
    if (!option) return <Badge>{status}</Badge>;
    
    return (
      <Badge
        style={{
          backgroundColor: `#${option.color || "6B7280"}`,
          color: "#fff",
        }}
        data-testid={`badge-status-${status}`}
      >
        {option.name}
      </Badge>
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

  return (
    <>
      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[50px]">ID</TableHead>
              <TableHead className="min-w-[200px]">Title</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Trade</TableHead>
              <TableHead>Location</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {defects.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground">
                  No defects found
                </TableCell>
              </TableRow>
            ) : (
              defects.map((defect) => (
                <TableRow key={defect.id} data-testid={`row-defect-${defect.id}`}>
                  <TableCell className="font-medium" data-testid={`text-id-${defect.id}`}>
                    {defect.id}
                  </TableCell>
                  <TableCell data-testid={`text-title-${defect.id}`}>
                    {defect.title}
                  </TableCell>
                  <TableCell>{getStatusBadge(defect.status)}</TableCell>
                  <TableCell>{getPriorityBadge(defect.priority)}</TableCell>
                  <TableCell data-testid={`text-type-${defect.id}`}>
                    {getTypeLabel(defect.type)}
                  </TableCell>
                  <TableCell data-testid={`text-trade-${defect.id}`}>
                    {getTradeLabel(defect.trade)}
                  </TableCell>
                  <TableCell data-testid={`text-location-${defect.id}`}>
                    {defect.location || "-"}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          data-testid={`button-menu-${defect.id}`}
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => setEditingDefect(defect)}
                          data-testid={`menu-item-edit-${defect.id}`}
                        >
                          <Pencil className="h-4 w-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setDeletingDefect(defect)}
                          className="text-destructive"
                          data-testid={`menu-item-delete-${defect.id}`}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
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
