import { useState, useMemo, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, Users, Lock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { insertProjectSchema, InsertProject, Project, type FieldCategoryWithOptions } from "@shared/schema";
import { useProject } from "@/contexts/ProjectContext";

type CreateProjectDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const formSchema = insertProjectSchema.extend({
  color: insertProjectSchema.shape.color.default("#3b82f6"),
});

type FormData = {
  name: string;
  description?: string;
  color: string;
  isActive: boolean;
  invoicingMethod: "progress_payments" | "cost_plus";
  projectSubStatus: string;
};

type AssignableUser = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  displayName: string;
  email: string | null;
  profileImageUrl: string | null;
  roleId: string | null;
  roleName: string | null;
};

const AUTO_ADD_ROLE_PATTERNS = ["admin", "owner", "general manager", "director"];

function isAutoAddRole(roleName: string | null | undefined): boolean {
  if (!roleName) return false;
  const lower = roleName.toLowerCase();
  return AUTO_ADD_ROLE_PATTERNS.some(pattern => lower.includes(pattern));
}

export default function CreateProjectDialog({ open, onOpenChange }: CreateProjectDialogProps) {
  const { toast } = useToast();
  const { setCurrentProject } = useProject();
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [userSearch, setUserSearch] = useState("");
  
  const { data: fieldCategories = [] } = useQuery<FieldCategoryWithOptions[]>({
    queryKey: ["/api/field-categories"],
  });

  const { data: assignableUsers = [] } = useQuery<AssignableUser[]>({
    queryKey: ["/api/users/assignable"],
    enabled: open,
  });

  useEffect(() => {
    if (open && assignableUsers.length > 0) {
      const autoAddIds = new Set<string>();
      assignableUsers.forEach(user => {
        if (isAutoAddRole(user.roleName)) {
          autoAddIds.add(user.id);
        }
      });
      setSelectedUserIds(autoAddIds);
    }
  }, [open, assignableUsers]);

  const projectStatusCategory = fieldCategories.find(cat => cat.key === "project.status");
  const statusOptions = projectStatusCategory?.options || [];
  const detailedStatusOptions = statusOptions.filter(opt => opt.parentId !== null && opt.parentId !== undefined);
  
  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      description: "",
      color: "#3b82f6",
      isActive: true,
      invoicingMethod: "progress_payments",
      projectSubStatus: "lead_new",
    },
  });

  const filteredUsers = useMemo(() => {
    if (!userSearch) return assignableUsers;
    const lower = userSearch.toLowerCase();
    return assignableUsers.filter(user =>
      user.displayName.toLowerCase().includes(lower) ||
      (user.email?.toLowerCase().includes(lower))
    );
  }, [assignableUsers, userSearch]);

  const usersByRole = useMemo(() => {
    const groups: Record<string, AssignableUser[]> = {};
    filteredUsers.forEach(user => {
      const role = user.roleName || "No Role";
      if (!groups[role]) groups[role] = [];
      groups[role].push(user);
    });
    return groups;
  }, [filteredUsers]);

  const toggleUser = (userId: string) => {
    setSelectedUserIds(prev => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  };

  const toggleAllInRole = (roleName: string, users: AssignableUser[]) => {
    setSelectedUserIds(prev => {
      const next = new Set(prev);
      const allSelected = users.every(u => next.has(u.id));
      if (allSelected) {
        users.forEach(u => next.delete(u.id));
      } else {
        users.forEach(u => next.add(u.id));
      }
      return next;
    });
  };

  const getUserInitials = (user: AssignableUser) => {
    if (user.firstName && user.lastName) {
      return `${user.firstName[0]}${user.lastName[0]}`;
    }
    return user.email?.[0]?.toUpperCase() || "?";
  };

  const createProjectMutation = useMutation({
    mutationFn: async (data: InsertProject) => {
      return await apiRequest("/api/projects", "POST", data) as Project;
    },
    onSuccess: async (newProject) => {
      if (selectedUserIds.size > 0) {
        const grantPromises = Array.from(selectedUserIds).map(userId =>
          apiRequest(`/api/projects/${newProject.id}/team/${userId}`, "POST", {
            accessLevel: "edit",
          }).catch(err => {
            console.error(`Failed to add user ${userId} to project:`, err);
          })
        );
        await Promise.all(grantPromises);
      }

      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      
      setCurrentProject(newProject);
      
      form.reset();
      setSelectedUserIds(new Set());
      setUserSearch("");
      onOpenChange(false);
      
      toast({
        title: "Project created successfully",
        description: `${newProject.name} has been added to your projects.`,
      });
    },
    onError: (error: any) => {
      const isDuplicate = error.message?.startsWith("409:");
      toast({
        title: isDuplicate ? "Duplicate project name" : "Failed to create project",
        description: isDuplicate 
          ? "A project with this name already exists. Please choose a different name."
          : (error.message || "An error occurred while creating the project."),
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: FormData) => {
    const selectedStatus = statusOptions.find(opt => opt.key === data.projectSubStatus);
    const parentStatus = selectedStatus?.parentId 
      ? statusOptions.find(opt => opt.id === selectedStatus.parentId)
      : null;
    
    createProjectMutation.mutate({
      ...data,
      icon: "building",
      status: "active",
      projectStatus: parentStatus?.key || "lead",
    } as InsertProject);
  };

  const handleClose = () => {
    form.reset();
    setSelectedUserIds(new Set());
    setUserSearch("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto" data-testid="dialog-create-project">
        <DialogHeader>
          <DialogTitle>Create New Project</DialogTitle>
          <DialogDescription>
            Add a new project to organize your construction work.
          </DialogDescription>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Project Name *</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g., Sunshine Coast Villa"
                      data-testid="input-project-name"
                      {...field}
                    />
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
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Brief description of the project..."
                      data-testid="input-project-description"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="projectSubStatus"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Status *</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-project-status">
                        <SelectValue placeholder="Select a status" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {detailedStatusOptions.map((status) => (
                        <SelectItem key={status.id} value={status.key}>
                          {status.label || status.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="color"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Project Color</FormLabel>
                  <FormControl>
                    <div className="flex items-center gap-3">
                      <Input
                        type="color"
                        className="w-16 h-10 p-1 border rounded"
                        data-testid="input-project-color"
                        {...field}
                      />
                      <Input
                        type="text"
                        placeholder="#3b82f6"
                        className="flex-1"
                        data-testid="input-project-color-hex"
                        {...field}
                      />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <Label className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Team Members
                </Label>
                {selectedUserIds.size > 0 && (
                  <Badge variant="secondary">
                    {selectedUserIds.size} selected
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Select team members to add to this project. Admin and owner roles are auto-selected.
              </p>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search team members..."
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  className="pl-8 text-sm"
                  data-testid="input-search-team-members"
                />
              </div>
              <ScrollArea className="max-h-[200px] border rounded-md">
                <div className="p-2 space-y-3">
                  {Object.entries(usersByRole).map(([roleName, users]) => {
                    const allSelected = users.every(u => selectedUserIds.has(u.id));
                    const someSelected = users.some(u => selectedUserIds.has(u.id));
                    const isAutoRole = isAutoAddRole(roleName);
                    return (
                      <div key={roleName} className="space-y-1">
                        <button
                          type="button"
                          onClick={() => toggleAllInRole(roleName, users)}
                          className="flex items-center gap-2 w-full text-left px-1 py-0.5 rounded text-xs font-medium text-muted-foreground hover-elevate"
                        >
                          <Checkbox
                            checked={allSelected ? true : someSelected ? "indeterminate" : false}
                            className="h-3.5 w-3.5"
                          />
                          <span>{roleName}</span>
                          {isAutoRole && (
                            <Lock className="h-3 w-3 text-muted-foreground" />
                          )}
                          <span className="ml-auto text-[10px]">{users.length}</span>
                        </button>
                        <div className="space-y-0.5 pl-2">
                          {users.map(user => {
                            const isSelected = selectedUserIds.has(user.id);
                            return (
                              <button
                                type="button"
                                key={user.id}
                                onClick={() => toggleUser(user.id)}
                                className="flex items-center gap-2 w-full text-left px-2 py-1.5 rounded-md text-sm hover-elevate"
                                data-testid={`toggle-team-member-${user.id}`}
                              >
                                <Checkbox
                                  checked={isSelected}
                                  className="h-3.5 w-3.5"
                                />
                                <Avatar className="h-6 w-6">
                                  <AvatarImage src={user.profileImageUrl || undefined} alt={user.displayName} />
                                  <AvatarFallback className="text-[10px]">{getUserInitials(user)}</AvatarFallback>
                                </Avatar>
                                <div className="flex-1 min-w-0">
                                  <div className="text-xs font-medium truncate">{user.displayName}</div>
                                  {user.email && (
                                    <div className="text-[10px] text-muted-foreground truncate">{user.email}</div>
                                  )}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                  {filteredUsers.length === 0 && (
                    <div className="text-xs text-muted-foreground text-center py-4">
                      {userSearch ? "No team members match your search" : "No team members found"}
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                data-testid="button-cancel-create-project"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createProjectMutation.isPending}
                data-testid="button-submit-create-project"
              >
                {createProjectMutation.isPending ? "Creating..." : "Create Project"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
