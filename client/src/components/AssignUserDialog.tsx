import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { getUserDisplayName, getUserInitials } from "@/lib/utils";
import { UserPlus } from "lucide-react";

interface AssignUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
}

export default function AssignUserDialog({
  open,
  onOpenChange,
  projectId,
}: AssignUserDialogProps) {
  const { toast } = useToast();

  // Fetch all company users
  const { data: allUsers = [] } = useQuery({
    queryKey: ["/api/users"],
  });

  // Fetch current project team members
  const { data: projectTeam = [] } = useQuery({
    queryKey: [`/api/projects/${projectId}/team`],
  });

  // Filter out users already assigned to project
  const assignedUserIds = new Set(projectTeam.map((user: any) => user.id));
  const availableUsers = allUsers.filter(
    (user: any) => !assignedUserIds.has(user.id) && user.firstName && user.lastName
  );

  // Separate by category
  const availableTeam = availableUsers.filter((user: any) => user.userCategory === "team");
  const availableSuppliers = availableUsers.filter((user: any) => user.userCategory === "supplier");

  // Assign user mutation
  const assignUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      return apiRequest(`/api/projects/${projectId}/team/${userId}`, {
        method: "POST",
        body: JSON.stringify({ accessLevel: "view" }),
        headers: {
          "Content-Type": "application/json",
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/team`] });
      toast({
        title: "User assigned",
        description: "User has been assigned to the project.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to assign user to project.",
        variant: "destructive",
      });
    },
  });

  const handleAssignUser = (userId: string) => {
    assignUserMutation.mutate(userId);
  };


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[600px] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Assign User to Project</DialogTitle>
          <DialogDescription>
            Select a user from your company to assign to this project
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Team Members */}
          <div>
            <h3 className="text-sm font-semibold mb-3">Team Members</h3>
            {availableTeam.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                All team members are already assigned to this project
              </p>
            ) : (
              <div className="space-y-2">
                {availableTeam.map((user: any) => (
                  <div
                    key={user.id}
                    className="flex items-center justify-between p-3 rounded-lg border hover-elevate"
                    data-testid={`available-user-${user.id}`}
                  >
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="text-xs">
                          {getUserInitials(user)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium text-sm">
                          {getUserDisplayName(user)}
                        </p>
                        <p className="text-xs text-muted-foreground">{user.email}</p>
                      </div>
                      <Badge variant="outline" className="ml-2">
                        {user.role?.name || "No Role"}
                      </Badge>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => handleAssignUser(user.id)}
                      disabled={assignUserMutation.isPending}
                      data-testid={`button-assign-${user.id}`}
                    >
                      <UserPlus className="h-4 w-4 mr-2" />
                      Assign
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Separator */}
          {availableSuppliers.length > 0 && <Separator />}

          {/* Suppliers */}
          {availableSuppliers.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-3">Suppliers</h3>
              <div className="space-y-2">
                {availableSuppliers.map((user: any) => (
                  <div
                    key={user.id}
                    className="flex items-center justify-between p-3 rounded-lg border hover-elevate"
                    data-testid={`available-supplier-${user.id}`}
                  >
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="text-xs">
                          {getUserInitials(user)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium text-sm">
                          {getUserDisplayName(user)}
                        </p>
                        <p className="text-xs text-muted-foreground">{user.email}</p>
                      </div>
                      <Badge variant="outline" className="ml-2">
                        {user.role?.name || "No Role"}
                      </Badge>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => handleAssignUser(user.id)}
                      disabled={assignUserMutation.isPending}
                      data-testid={`button-assign-${user.id}`}
                    >
                      <UserPlus className="h-4 w-4 mr-2" />
                      Assign
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
