import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { UserPlus, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import AssignUserDialog from "@/components/AssignUserDialog";

export default function ProjectTeam() {
  const [, params] = useRoute("/projects/:projectId/team");
  const projectId = params?.projectId || "";
  const [isAssignDialogOpen, setIsAssignDialogOpen] = useState(false);
  const { toast } = useToast();

  // Fetch project team members
  const { data: teamMembers = [], isLoading } = useQuery({
    queryKey: [`/api/projects/${projectId}/team`],
  });

  // Separate team members by category
  const teamUsers = teamMembers.filter((user: any) => user.userCategory === "team");
  const supplierUsers = teamMembers.filter((user: any) => user.userCategory === "supplier");

  // Remove user from project mutation
  const removeUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      return apiRequest(`/api/projects/${projectId}/team/${userId}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/team`] });
      toast({
        title: "User removed",
        description: "User has been removed from the project.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to remove user from project.",
        variant: "destructive",
      });
    },
  });

  const handleRemoveUser = (userId: string) => {
    if (confirm("Are you sure you want to remove this user from the project?")) {
      removeUserMutation.mutate(userId);
    }
  };

  const getInitials = (firstName?: string, lastName?: string) => {
    return `${firstName?.[0] || ""}${lastName?.[0] || ""}`.toUpperCase();
  };

  return (
    <div className="flex flex-col h-full" data-testid="project-team-page">
      <div className="flex-1 min-h-0 p-6">
        <div className="flex flex-col gap-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">Project Team</h1>
              <p className="text-muted-foreground">
                Manage users assigned to this project
              </p>
            </div>
            <Button
              onClick={() => setIsAssignDialogOpen(true)}
              data-testid="button-assign-user"
            >
              <UserPlus className="h-4 w-4 mr-2" />
              Assign User
            </Button>
          </div>

          {/* Team Members */}
          <Card>
            <CardHeader>
              <CardTitle>Team Members</CardTitle>
              <CardDescription>
                Internal team members assigned to this project
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-8 text-muted-foreground">
                  Loading team members...
                </div>
              ) : teamUsers.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No team members assigned to this project
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {teamUsers.map((user: any) => (
                      <TableRow key={user.id} data-testid={`team-row-${user.id}`}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar className="h-8 w-8">
                              <AvatarFallback className="text-xs">
                                {getInitials(user.firstName, user.lastName)}
                              </AvatarFallback>
                            </Avatar>
                            <span className="font-medium">
                              {user.firstName} {user.lastName}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>{user.email}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{user.role?.name || "No Role"}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleRemoveUser(user.id)}
                            data-testid={`button-remove-${user.id}`}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Separator */}
          <Separator />

          {/* Suppliers */}
          <Card>
            <CardHeader>
              <CardTitle>Suppliers</CardTitle>
              <CardDescription>
                External suppliers assigned to this project
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-8 text-muted-foreground">
                  Loading suppliers...
                </div>
              ) : supplierUsers.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No suppliers assigned to this project
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {supplierUsers.map((user: any) => (
                      <TableRow key={user.id} data-testid={`supplier-row-${user.id}`}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar className="h-8 w-8">
                              <AvatarFallback className="text-xs">
                                {getInitials(user.firstName, user.lastName)}
                              </AvatarFallback>
                            </Avatar>
                            <span className="font-medium">
                              {user.firstName} {user.lastName}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>{user.email}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{user.role?.name || "No Role"}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleRemoveUser(user.id)}
                            data-testid={`button-remove-${user.id}`}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Assign User Dialog */}
      <AssignUserDialog
        open={isAssignDialogOpen}
        onOpenChange={setIsAssignDialogOpen}
        projectId={projectId}
      />
    </div>
  );
}
