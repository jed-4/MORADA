import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertUserRoleSchema, type UserRole, type Permission, type RolePermission } from "@shared/schema";
import { Search, Plus, Star, Loader2, Shield } from "lucide-react";
import { z } from "zod";

type PermissionAction = "view" | "add" | "edit" | "delete";

interface PermissionMatrix {
  [roleId: string]: {
    [permissionId: string]: PermissionAction[];
  };
}

export default function RolesPermissions() {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [isAddRoleOpen, setIsAddRoleOpen] = useState(false);
  const [isEditRoleOpen, setIsEditRoleOpen] = useState(false);
  const [permissionMatrix, setPermissionMatrix] = useState<PermissionMatrix>({});
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Fetch roles
  const { data: roles = [], isLoading: rolesLoading } = useQuery<UserRole[]>({
    queryKey: ["/api/user-roles"],
  });

  // Fetch permissions
  const { data: permissions = [], isLoading: permissionsLoading } = useQuery<Permission[]>({
    queryKey: ["/api/permissions"],
  });

  // Fetch role permissions for selected role
  const { data: rolePermissions = [] } = useQuery<RolePermission[]>({
    queryKey: ["/api/user-roles", selectedRoleId, "permissions"],
    enabled: !!selectedRoleId,
  });

  // Initialize permission matrix when role permissions load
  useState(() => {
    if (selectedRoleId && rolePermissions.length > 0) {
      const matrix: PermissionMatrix = {};
      if (!matrix[selectedRoleId]) {
        matrix[selectedRoleId] = {};
      }
      rolePermissions.forEach((rp) => {
        matrix[selectedRoleId][rp.permissionId] = rp.allowedActions as PermissionAction[];
      });
      setPermissionMatrix(matrix);
      setHasUnsavedChanges(false);
    }
  });

  // Save role permissions
  const savePermissionsMutation = useMutation({
    mutationFn: async () => {
      if (!selectedRoleId) return;
      
      const permissionsToSave = Object.entries(permissionMatrix[selectedRoleId] || {})
        .filter(([_, actions]) => actions.length > 0)
        .map(([permissionId, allowedActions]) => ({
          permissionId,
          allowedActions,
        }));

      const response = await apiRequest(
        "POST",
        `/api/user-roles/${selectedRoleId}/permissions`,
        { permissions: permissionsToSave }
      );
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user-roles", selectedRoleId, "permissions"] });
      setHasUnsavedChanges(false);
      toast({
        title: "Changes saved",
        description: "Role permissions have been updated successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to save role permissions.",
        variant: "destructive",
      });
    },
  });

  // Toggle permission action
  const togglePermission = (permissionId: string, action: PermissionAction) => {
    if (!selectedRoleId) return;

    setPermissionMatrix((prev) => {
      const newMatrix = { ...prev };
      if (!newMatrix[selectedRoleId]) {
        newMatrix[selectedRoleId] = {};
      }
      if (!newMatrix[selectedRoleId][permissionId]) {
        newMatrix[selectedRoleId][permissionId] = [];
      }

      const actions = newMatrix[selectedRoleId][permissionId];
      if (actions.includes(action)) {
        newMatrix[selectedRoleId][permissionId] = actions.filter((a) => a !== action);
      } else {
        newMatrix[selectedRoleId][permissionId] = [...actions, action];
      }

      return newMatrix;
    });
    setHasUnsavedChanges(true);
  };

  // Check if permission action is enabled
  const isPermissionEnabled = (permissionId: string, action: PermissionAction): boolean => {
    if (!selectedRoleId) return false;
    return permissionMatrix[selectedRoleId]?.[permissionId]?.includes(action) || false;
  };

  // Filter and select role
  const filteredRoles = roles.filter((role) =>
    role.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selectedRole = roles.find((r) => r.id === selectedRoleId);

  // Group permissions by category
  const groupedPermissions = permissions.reduce((acc, permission) => {
    if (!acc[permission.category]) {
      acc[permission.category] = [];
    }
    acc[permission.category].push(permission);
    return acc;
  }, {} as Record<string, Permission[]>);

  const categoryDisplayNames: Record<string, string> = {
    projects: "PROJECT MANAGEMENT",
    financial: "FINANCIAL",
    files: "FILES",
    admin: "ADMIN",
    sales: "SALES",
    messaging: "MESSAGING",
  };

  if (rolesLoading || permissionsLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Auto-select first role if none selected
  if (!selectedRoleId && roles.length > 0) {
    setSelectedRoleId(roles[0].id);
  }

  return (
    <div className="flex h-full bg-background" data-testid="roles-permissions-page">
      {/* Left Sidebar - Roles List */}
      <div className="w-64 border-r bg-card flex flex-col">
        <div className="p-4 border-b">
          <h1 className="text-xl font-semibold mb-4">Roles & Permissions</h1>
          
          {/* Add new role button */}
          <Button
            onClick={() => setIsAddRoleOpen(true)}
            className="w-full mb-3"
            data-testid="button-add-role"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add new role
          </Button>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search for a role"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
              data-testid="input-search-role"
            />
          </div>
        </div>

        {/* Roles list */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-2">
            <p className="text-xs text-muted-foreground px-3 py-2">Team roles</p>
            {filteredRoles.map((role) => (
              <button
                key={role.id}
                onClick={() => setSelectedRoleId(role.id)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-left transition-colors ${
                  selectedRoleId === role.id
                    ? "bg-primary text-primary-foreground"
                    : "hover-elevate active-elevate-2"
                }`}
                data-testid={`role-item-${role.name.toLowerCase().replace(/\s+/g, '-')}`}
              >
                <Star className="h-4 w-4 flex-shrink-0 opacity-50" />
                <span className="flex-1 text-sm">{role.name}</span>
                {role.isBuiltIn && (
                  <Badge variant="secondary" className="text-xs">Built-in</Badge>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content - Permissions Matrix */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedRole ? (
          <>
            {/* Header */}
            <div className="p-6 border-b">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Shield className="h-6 w-6" />
                  <div>
                    <h2 className="text-2xl font-semibold">{selectedRole.name}</h2>
                    {selectedRole.description && (
                      <p className="text-sm text-muted-foreground">{selectedRole.description}</p>
                    )}
                  </div>
                </div>
                <Button
                  onClick={() => savePermissionsMutation.mutate()}
                  disabled={!hasUnsavedChanges || savePermissionsMutation.isPending}
                  data-testid="button-save-changes"
                >
                  {savePermissionsMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Save Changes"
                  )}
                </Button>
              </div>
            </div>

            {/* Permissions Matrix */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="space-y-6">
                {Object.entries(groupedPermissions).map(([category, categoryPermissions]) => (
                  <Card key={category}>
                    <CardContent className="p-6">
                      <h3 className="text-sm font-semibold mb-4 text-muted-foreground">
                        {categoryDisplayNames[category] || category.toUpperCase()}
                      </h3>
                      
                      <div className="space-y-3">
                        {/* Header row */}
                        <div className="grid grid-cols-[1fr,80px,80px,80px,80px] gap-4 pb-2 border-b">
                          <div></div>
                          <div className="text-xs font-medium text-center">View</div>
                          <div className="text-xs font-medium text-center">Add</div>
                          <div className="text-xs font-medium text-center">Edit</div>
                          <div className="text-xs font-medium text-center">Delete</div>
                        </div>

                        {/* Permission rows */}
                        {categoryPermissions.map((permission) => (
                          <div
                            key={permission.id}
                            className="grid grid-cols-[1fr,80px,80px,80px,80px] gap-4 items-center"
                          >
                            <div className="text-sm">{permission.name}</div>
                            
                            {["view", "add", "edit", "delete"].map((action) => {
                              const isAvailable = (permission.actions as PermissionAction[]).includes(action as PermissionAction);
                              return (
                                <div key={action} className="flex justify-center">
                                  {isAvailable ? (
                                    <Checkbox
                                      checked={isPermissionEnabled(permission.id, action as PermissionAction)}
                                      onCheckedChange={() =>
                                        togglePermission(permission.id, action as PermissionAction)
                                      }
                                      data-testid={`checkbox-${permission.key}-${action}`}
                                    />
                                  ) : (
                                    <div className="h-4 w-4" />
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-muted-foreground">Select a role to manage permissions</p>
          </div>
        )}
      </div>

      {/* Add Role Dialog */}
      <AddRoleDialog open={isAddRoleOpen} onOpenChange={setIsAddRoleOpen} />

      {/* Edit Role Dialog */}
      {selectedRole && (
        <EditRoleDialog
          role={selectedRole}
          open={isEditRoleOpen}
          onOpenChange={setIsEditRoleOpen}
        />
      )}
    </div>
  );
}

// Add Role Dialog Component
function AddRoleDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { toast } = useToast();

  const form = useForm({
    resolver: zodResolver(insertUserRoleSchema.omit({ isBuiltIn: true, isActive: true })),
    defaultValues: {
      name: "",
      description: "",
      userCategory: "team" as const,
    },
  });

  const createRoleMutation = useMutation({
    mutationFn: async (data: z.infer<typeof insertUserRoleSchema>) => {
      const response = await apiRequest("POST", "/api/user-roles", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user-roles"] });
      toast({
        title: "Role created",
        description: "New role has been created successfully.",
      });
      onOpenChange(false);
      form.reset();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create role.",
        variant: "destructive",
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add New Role</DialogTitle>
          <DialogDescription>
            Create a new role with custom permissions.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit((data) => createRoleMutation.mutate(data))} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Role Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Project Manager" {...field} data-testid="input-role-name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description (Optional)</FormLabel>
                  <FormControl>
                    <Input placeholder="Brief description of this role" {...field} data-testid="input-role-description" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="userCategory"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>User Category</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-user-category">
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="team">Team</SelectItem>
                      <SelectItem value="supplier">Supplier</SelectItem>
                      <SelectItem value="client">Client</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createRoleMutation.isPending} data-testid="button-create-role">
                {createRoleMutation.isPending ? "Creating..." : "Create Role"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// Edit Role Dialog Component
function EditRoleDialog({
  role,
  open,
  onOpenChange,
}: {
  role: UserRole;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();

  const form = useForm({
    resolver: zodResolver(insertUserRoleSchema.partial().omit({ isBuiltIn: true, isActive: true })),
    values: {
      name: role.name,
      description: role.description || "",
      userCategory: role.userCategory,
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: async (data: Partial<z.infer<typeof insertUserRoleSchema>>) => {
      const response = await apiRequest("PATCH", `/api/user-roles/${role.id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user-roles"] });
      toast({
        title: "Role updated",
        description: "Role has been updated successfully.",
      });
      onOpenChange(false);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update role.",
        variant: "destructive",
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Role</DialogTitle>
          <DialogDescription>
            Update role details. {role.isBuiltIn && "Built-in roles cannot be deleted."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit((data) => updateRoleMutation.mutate(data))} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Role Name</FormLabel>
                  <FormControl>
                    <Input {...field} disabled={role.isBuiltIn} data-testid="input-edit-role-name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description (Optional)</FormLabel>
                  <FormControl>
                    <Input {...field} data-testid="input-edit-role-description" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={updateRoleMutation.isPending} data-testid="button-update-role">
                {updateRoleMutation.isPending ? "Updating..." : "Update Role"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
