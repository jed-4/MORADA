import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useState } from "react";
import type { UserWithRole, UserProjectAccess, UserRole } from "@shared/schema";
import {
  User,
  Mail,
  Phone,
  Shield,
  Briefcase,
  ChevronLeft,
  Trash2,
  AlertTriangle,
  Loader2,
} from "lucide-react";

export default function UserProfileView() {
  const { userId } = useParams();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { user: currentUser } = useAuth();
  const [showDisableDialog, setShowDisableDialog] = useState(false);
  const [showRemoveDialog, setShowRemoveDialog] = useState(false);

  // Fetch user details
  const { data: user, isLoading: userLoading } = useQuery<UserWithRole>({
    queryKey: ["/api/users", userId],
    queryFn: async () => {
      const response = await fetch(`/api/users/${userId}`);
      if (!response.ok) throw new Error("Failed to fetch user");
      return response.json();
    },
    enabled: !!userId,
  });

  // Fetch user's project access
  const { data: projectAccess = [], isLoading: accessLoading } = useQuery<UserProjectAccess[]>({
    queryKey: ["/api/users", userId, "project-access"],
    queryFn: async () => {
      const response = await fetch(`/api/users/${userId}/project-access`);
      if (!response.ok) throw new Error("Failed to fetch project access");
      return response.json();
    },
    enabled: !!userId,
  });

  // Fetch all projects to show project names
  const { data: projects = [] } = useQuery<any[]>({
    queryKey: ["/api/projects"],
  });

  // Fetch available roles
  const { data: roles = [] } = useQuery<UserRole[]>({
    queryKey: ["/api/user-roles"],
  });

  // Update user role mutation
  const updateRoleMutation = useMutation({
    mutationFn: async (roleId: string) => {
      return await apiRequest(`/api/users/${userId}`, "PATCH", { roleId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users", userId] });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({
        title: "Role updated",
        description: "User role has been updated successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update user role.",
        variant: "destructive",
      });
    },
  });

  // Disable user mutation
  const disableUserMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest(`/api/users/${userId}`, "PATCH", { isActive: false });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users", userId] });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setShowDisableDialog(false);
      toast({
        title: "User disabled",
        description: "User has been disabled successfully.",
      });
      navigate("/business-team");
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to disable user.",
        variant: "destructive",
      });
    },
  });

  // Remove user mutation
  const removeUserMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest(`/api/users/${userId}`, "DELETE");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setShowRemoveDialog(false);
      toast({
        title: "User removed",
        description: "User has been permanently removed.",
      });
      navigate("/business-team");
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to remove user.",
        variant: "destructive",
      });
    },
  });

  if (userLoading || accessLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <p className="text-muted-foreground">User not found</p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => navigate("/business-team")}
            data-testid="button-back"
          >
            <ChevronLeft className="h-4 w-4 mr-2" />
            Back to Team
          </Button>
        </div>
      </div>
    );
  }

  const getInitials = (firstName?: string, lastName?: string) => {
    const first = firstName?.[0] || "";
    const last = lastName?.[0] || "";
    return `${first}${last}`.toUpperCase() || "U";
  };

  const isCurrentUser = currentUser?.id === userId;
  const isAdmin = currentUser?.role?.name === "General admin" || currentUser?.role?.name === "Admin";

  return (
    <div className="p-6 space-y-6">
      {/* Header with back button */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate("/business-team")}
          data-testid="button-back"
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-semibold">{user.firstName} {user.lastName}</h1>
          <p className="text-sm text-muted-foreground">User Profile</p>
        </div>
      </div>

      <div className="grid gap-6">
        {/* Overview Card */}
        <Card>
          <CardHeader>
            <CardTitle>Overview</CardTitle>
            <CardDescription>Basic information about this user</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-start gap-4">
              <Avatar className="h-16 w-16">
                <AvatarFallback className="text-lg">
                  {getInitials(user.firstName, user.lastName)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground">Name</p>
                      <p className="font-medium" data-testid="text-user-name">
                        {user.firstName} {user.lastName}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground">Email</p>
                      <p className="font-medium" data-testid="text-user-email">
                        {user.email}
                      </p>
                    </div>
                  </div>
                  {user.phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm text-muted-foreground">Phone</p>
                        <p className="font-medium" data-testid="text-user-phone">
                          {user.phone}
                        </p>
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground">Role</p>
                      <Badge variant="outline" data-testid="badge-user-role">
                        {user.role?.name || "No Role"}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Briefcase className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground">Category</p>
                      <Badge variant="secondary" data-testid="badge-user-category">
                        {user.userCategory || "team"}
                      </Badge>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Project Access Card */}
        <Card>
          <CardHeader>
            <CardTitle>Project Access</CardTitle>
            <CardDescription>
              Projects this user has access to ({projectAccess.length})
            </CardDescription>
          </CardHeader>
          <CardContent>
            {projectAccess.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No project access assigned yet
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Project</TableHead>
                    <TableHead>Access Level</TableHead>
                    <TableHead>Granted</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {projectAccess.map((access: any) => {
                    const project = projects.find((p: any) => p.id === access.projectId);
                    return (
                      <TableRow key={access.id} data-testid={`project-access-${access.id}`}>
                        <TableCell className="font-medium">
                          {project?.name || "Unknown Project"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{access.accessLevel}</Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(access.createdAt).toLocaleDateString()}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Account Settings - Only for admins */}
        {isAdmin && !isCurrentUser && (
          <Card>
            <CardHeader>
              <CardTitle>Account Settings</CardTitle>
              <CardDescription>Manage user role and account status</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Change Role */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Change Role</label>
                <Select
                  value={user.roleId || ""}
                  onValueChange={(value) => updateRoleMutation.mutate(value)}
                  disabled={updateRoleMutation.isPending}
                >
                  <SelectTrigger className="w-full md:w-[300px]" data-testid="select-user-role">
                    <SelectValue placeholder="Select a role" />
                  </SelectTrigger>
                  <SelectContent>
                    {roles.map((role: any) => (
                      <SelectItem key={role.id} value={role.id}>
                        {role.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Separator />

              {/* Dangerous Actions */}
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-destructive flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Dangerous Actions
                </h3>
                <div className="flex flex-wrap gap-3">
                  <Button
                    variant="outline"
                    onClick={() => setShowDisableDialog(true)}
                    disabled={!user.isActive}
                    data-testid="button-disable-user"
                  >
                    Disable User
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => setShowRemoveDialog(true)}
                    data-testid="button-remove-user"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Remove User
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Disabling a user will block their access while preserving their data.
                  Removing a user will permanently delete their account.
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Disable User Dialog */}
      <AlertDialog open={showDisableDialog} onOpenChange={setShowDisableDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disable User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to disable {user.firstName} {user.lastName}? They will no
              longer be able to access the system, but their data will be preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-disable">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => disableUserMutation.mutate()}
              disabled={disableUserMutation.isPending}
              data-testid="button-confirm-disable"
            >
              {disableUserMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Disabling...
                </>
              ) : (
                "Disable User"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Remove User Dialog */}
      <AlertDialog open={showRemoveDialog} onOpenChange={setShowRemoveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove User Permanently</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete {user.firstName}{" "}
              {user.lastName}'s account and remove all their data from the system. All items
              assigned to this user will be reassigned to the general admin.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-remove">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => removeUserMutation.mutate()}
              disabled={removeUserMutation.isPending}
              className="bg-destructive hover:bg-destructive/90"
              data-testid="button-confirm-remove"
            >
              {removeUserMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Removing...
                </>
              ) : (
                "Remove Permanently"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
