import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProjectIcon } from "@/components/ProjectIcon";

export default function ArchivedProjects() {
  const { toast } = useToast();

  const { data: projects = [], isLoading } = useQuery<Project[]>({
    queryKey: ['/api/projects'],
  });

  const archivedProjects = projects.filter(p => p.isArchived);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Archive className="h-8 w-8" />
            Archived Projects
          </h1>
          <p className="text-muted-foreground mt-2">
            View and restore archived projects
          </p>
        </div>
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="p-12 text-center text-muted-foreground">
            Loading archived projects...
          </CardContent>
        </Card>
      ) : archivedProjects.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Archive className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground">No archived projects</p>
            <p className="text-sm text-muted-foreground mt-2">
              Projects you archive will appear here
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {archivedProjects.map((project) => (
            <ArchivedProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}
    </div>
  );
}

function ArchivedProjectCard({ project }: { project: Project }) {
  const [showRestoreDialog, setShowRestoreDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const { toast } = useToast();

  const restoreMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('PATCH', `/api/projects/${project.id}`, {
        isArchived: false
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
      setShowRestoreDialog(false);
      toast({
        title: "Project Restored",
        description: `${project.name} has been restored to active projects.`,
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
    mutationFn: async () => {
      const response = await apiRequest('DELETE', `/api/projects/${project.id}`);
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
      setShowDeleteDialog(false);
      setConfirmText("");
      toast({
        title: "Project Deleted",
        description: `${project.name} has been permanently deleted.`,
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

  const isConfirmValid = confirmText === project.name;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <ProjectIcon
              icon={project.icon}
              color={project.color}
              className="w-10 h-10"
            />
            <div>
              <CardTitle className="text-lg">{project.name}</CardTitle>
              {project.projectType && (
                <Badge variant="outline" className="mt-1">
                  {project.projectType}
                </Badge>
              )}
            </div>
          </div>
        </div>
        {project.description && (
          <CardDescription className="mt-2">{project.description}</CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {project.jobNumber && (
          <div className="text-sm text-muted-foreground">
            Job Number: {project.jobNumber}
          </div>
        )}

        <div className="flex gap-2">
          <Dialog open={showRestoreDialog} onOpenChange={setShowRestoreDialog}>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                data-testid={`button-restore-${project.id}`}
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Restore
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Restore Project?</DialogTitle>
                <DialogDescription>
                  This will restore "{project.name}" to your active projects list.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowRestoreDialog(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => restoreMutation.mutate()}
                  disabled={restoreMutation.isPending}
                  data-testid={`button-confirm-restore-${project.id}`}
                >
                  {restoreMutation.isPending ? "Restoring..." : "Restore Project"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
            <DialogTrigger asChild>
              <Button
                variant="destructive"
                size="sm"
                className="flex-1"
                data-testid={`button-delete-${project.id}`}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete Project?</DialogTitle>
                <DialogDescription>
                  This will permanently delete "{project.name}" and all its data. This action cannot be undone.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor={`confirm-delete-${project.id}`}>
                    Type <span className="font-semibold">{project.name}</span> to confirm
                  </Label>
                  <Input
                    id={`confirm-delete-${project.id}`}
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder={project.name}
                    data-testid={`input-confirm-delete-${project.id}`}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => {
                  setShowDeleteDialog(false);
                  setConfirmText("");
                }}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => deleteMutation.mutate()}
                  disabled={!isConfirmValid || deleteMutation.isPending}
                  data-testid={`button-confirm-delete-${project.id}`}
                >
                  {deleteMutation.isPending ? "Deleting..." : "Delete Project"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardContent>
    </Card>
  );
}
