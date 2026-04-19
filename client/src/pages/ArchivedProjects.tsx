import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import {
  DataTable,
  DataTableColumnPicker,
  type DataTableColumnMeta,
} from "@/components/data-table/DataTable";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Archive, RotateCcw, Trash2, Columns3 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Project } from "@shared/schema";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProjectIcon } from "@/components/ProjectIcon";

export default function ArchivedProjects() {
  const { toast } = useToast();
  const [projectToRestore, setProjectToRestore] = useState<Project | null>(null);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [columnPickerOpen, setColumnPickerOpen] = useState(false);

  const { data: projects = [], isLoading } = useQuery<Project[]>({
    queryKey: ['/api/projects'],
  });

  const archivedProjects = useMemo(
    () => projects.filter((p) => p.isArchived),
    [projects],
  );

  const restoreMutation = useMutation({
    mutationFn: async (projectId: string) => {
      return apiRequest(`/api/projects/${projectId}`, 'PATCH', {
        isArchived: false
      });
    },
    onSuccess: (_, projectId) => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
      const project = archivedProjects.find(p => p.id === projectId);
      setProjectToRestore(null);
      toast({
        title: "Project Restored",
        description: `${project?.name || 'Project'} has been restored to active projects.`,
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to restore project.",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (projectId: string) => {
      return apiRequest(`/api/projects/${projectId}`, 'DELETE');
    },
    onSuccess: (_, projectId) => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
      const project = archivedProjects.find(p => p.id === projectId);
      setProjectToDelete(null);
      setConfirmText("");
      toast({
        title: "Project Deleted",
        description: `${project?.name || 'Project'} has been permanently deleted.`,
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete project.",
        variant: "destructive",
      });
    },
  });

  const isConfirmValid = projectToDelete && confirmText === projectToDelete.name;

  const columns = useMemo<ColumnDef<Project, unknown>[]>(() => {
    const cols: (ColumnDef<Project, unknown> & { meta?: DataTableColumnMeta })[] = [
      {
        id: "project",
        header: "Project",
        accessorFn: (p) => p.name || "",
        cell: ({ row }) => (
          <div className="flex items-center gap-2" data-testid={`cell-project-${row.original.id}`}>
            <ProjectIcon
              icon={row.original.icon}
              color={row.original.color}
              className="w-6 h-6 flex-shrink-0"
            />
            <span className="font-medium truncate">{row.original.name}</span>
          </div>
        ),
        size: 300,
        meta: { defaultWidth: 300, headerLabel: "Project" },
      },
      {
        id: "type",
        header: "Type",
        accessorFn: (p) => p.projectType || "",
        cell: ({ row }) => (
          row.original.projectType ? (
            <Badge variant="outline" className="text-xs">
              {row.original.projectType}
            </Badge>
          ) : (
            <span className="text-muted-foreground text-xs">—</span>
          )
        ),
        size: 120,
        meta: { defaultWidth: 120, headerLabel: "Type" },
      },
      {
        id: "jobNumber",
        header: "Job Number",
        accessorFn: (p) => p.jobNumber || "",
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground" data-testid={`cell-job-${row.original.id}`}>
            {row.original.jobNumber || '-'}
          </span>
        ),
        size: 120,
        meta: { defaultWidth: 120, headerLabel: "Job Number" },
      },
      {
        id: "description",
        header: "Description",
        accessorFn: (p) => p.description || "",
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground line-clamp-1" data-testid={`cell-desc-${row.original.id}`}>
            {row.original.description || '-'}
          </span>
        ),
        size: 320,
        meta: { defaultWidth: 320, headerLabel: "Description" },
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setProjectToRestore(row.original)}
              data-testid={`button-restore-${row.original.id}`}
            >
              <RotateCcw className="h-3 w-3 mr-1" />
              Restore
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-destructive hover:text-destructive"
              onClick={() => setProjectToDelete(row.original)}
              data-testid={`button-delete-${row.original.id}`}
            >
              <Trash2 className="h-3 w-3 mr-1" />
              Delete
            </Button>
          </div>
        ),
        size: 160,
        meta: { defaultWidth: 160, align: "right", pinned: true, headerLabel: "Actions" },
      },
    ];
    return cols;
  }, []);

  const pickerColumns = useMemo(
    () => [
      { id: "project", label: "Project" },
      { id: "type", label: "Type" },
      { id: "jobNumber", label: "Job Number" },
      { id: "description", label: "Description" },
      { id: "actions", label: "Actions", pinned: true },
    ],
    [],
  );

  return (
    <div className="flex h-full flex-col" data-testid="archived-projects">
      {/* Header Row */}
      <div className="h-9 bg-background flex items-center justify-between gap-2 px-3 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2">
          <Archive className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Archived Projects</span>
          {archivedProjects.length > 0 && (
            <Badge variant="secondary" className="h-5 px-1.5 text-xs">
              {archivedProjects.length}
            </Badge>
          )}
        </div>
        <Popover open={columnPickerOpen} onOpenChange={setColumnPickerOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              data-testid="button-column-picker"
            >
              <Columns3 className="h-3 w-3 mr-1" />
              Columns
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="p-0 w-auto">
            <DataTableColumnPicker storageKey="archived-projects" columns={pickerColumns} />
          </PopoverContent>
        </Popover>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
            Loading archived projects...
          </div>
        ) : archivedProjects.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center">
            <Archive className="h-10 w-10 mb-3 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No archived projects</p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Projects you archive will appear here
            </p>
          </div>
        ) : (
          <DataTable
            data={archivedProjects}
            columns={columns}
            storageKey="archived-projects"
            legacyConfigKey="archived-projects-column-config-v1"
            rowKey={(p) => p.id}
          />
        )}
      </div>

      {/* Restore Dialog */}
      <Dialog open={!!projectToRestore} onOpenChange={(open) => !open && setProjectToRestore(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restore Project?</DialogTitle>
            <DialogDescription>
              This will restore "{projectToRestore?.name}" to your active projects list.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProjectToRestore(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => projectToRestore && restoreMutation.mutate(projectToRestore.id)}
              disabled={restoreMutation.isPending}
              data-testid="button-confirm-restore"
            >
              {restoreMutation.isPending ? "Restoring..." : "Restore Project"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={!!projectToDelete} onOpenChange={(open) => {
        if (!open) {
          setProjectToDelete(null);
          setConfirmText("");
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Project?</DialogTitle>
            <DialogDescription>
              This will permanently delete "{projectToDelete?.name}" and all its data. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="confirm-delete">
                Type <span className="font-semibold">{projectToDelete?.name}</span> to confirm
              </Label>
              <Input
                id="confirm-delete"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={projectToDelete?.name || ''}
                data-testid="input-confirm-delete"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setProjectToDelete(null);
              setConfirmText("");
            }}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => projectToDelete && deleteMutation.mutate(projectToDelete.id)}
              disabled={!isConfirmValid || deleteMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete Project"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
