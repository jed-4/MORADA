import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Archive, RotateCcw, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Project } from "@shared/schema";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProjectIcon } from "@/components/ProjectIcon";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function ArchivedProjects() {
  const { toast } = useToast();
  const [projectToRestore, setProjectToRestore] = useState<Project | null>(null);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [confirmText, setConfirmText] = useState("");

  const { data: projects = [], isLoading } = useQuery<Project[]>({
    queryKey: ['/api/projects'],
  });

  const archivedProjects = projects.filter(p => p.isArchived);

  const restoreMutation = useMutation({
    mutationFn: async (projectId: string) => {
      const response = await apiRequest('PATCH', `/api/projects/${projectId}`, {
        isArchived: false
      });
      return response.json();
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
      const response = await apiRequest('DELETE', `/api/projects/${projectId}`);
      return response;
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

  return (
    <div className="flex h-full flex-col" data-testid="archived-projects">
      {/* Header Row - matches Tasks page design */}
      <div className="h-9 bg-background flex items-center justify-between px-3 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2">
          <Archive className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Archived Projects</span>
          {archivedProjects.length > 0 && (
            <Badge variant="secondary" className="h-5 px-1.5 text-xs">
              {archivedProjects.length}
            </Badge>
          )}
        </div>
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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[300px]">Project</TableHead>
                <TableHead className="w-[120px]">Type</TableHead>
                <TableHead className="w-[120px]">Job Number</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="w-[140px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {archivedProjects.map((project) => (
                <TableRow key={project.id} data-testid={`row-project-${project.id}`}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <ProjectIcon
                        icon={project.icon}
                        color={project.color}
                        className="w-6 h-6 flex-shrink-0"
                      />
                      <span className="font-medium truncate">{project.name}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {project.projectType && (
                      <Badge variant="outline" className="text-xs">
                        {project.projectType}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {project.jobNumber || '-'}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm truncate max-w-[300px]">
                    {project.description || '-'}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => setProjectToRestore(project)}
                        data-testid={`button-restore-${project.id}`}
                      >
                        <RotateCcw className="h-3 w-3 mr-1" />
                        Restore
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                        onClick={() => setProjectToDelete(project)}
                        data-testid={`button-delete-${project.id}`}
                      >
                        <Trash2 className="h-3 w-3 mr-1" />
                        Delete
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
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
