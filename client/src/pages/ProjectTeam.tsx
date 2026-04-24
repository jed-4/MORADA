import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { type ColumnDef } from "@tanstack/react-table";
import {
  DataTable,
  type DataTableColumnMeta,
} from "@/components/data-table/DataTable";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { UserPlus, Trash2, Search, Users, Building2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { getUserDisplayName, getUserInitials } from "@/lib/utils";
import AssignUserDialog from "@/components/AssignUserDialog";

interface TeamUser {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  userCategory?: string | null;
  role?: { name?: string | null } | null;
}

export default function ProjectTeam() {
  const [, params] = useRoute("/projects/:projectId/team");
  const projectId = params?.projectId || "";
  const [isAssignDialogOpen, setIsAssignDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const { toast } = useToast();

  const { data: project } = useQuery<{ name?: string }>({
    queryKey: [`/api/projects/${projectId}`],
    queryFn: async () => {
      const response = await fetch(`/api/projects/${projectId}`, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch project");
      return response.json();
    },
    enabled: !!projectId,
  });

  const pageTitle = project?.name ? `${project.name} - Team` : "Project Team";

  const { data: teamMembers = [], isLoading } = useQuery<TeamUser[]>({
    queryKey: [`/api/projects/${projectId}/team`],
    queryFn: async () => {
      const response = await fetch(`/api/projects/${projectId}/team`, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch team members");
      return response.json();
    },
    enabled: !!projectId,
  });

  const teamUsers = teamMembers.filter((user) => user.userCategory === "team");
  const supplierUsers = teamMembers.filter((user) => user.userCategory === "supplier");

  const filterUsers = (users: TeamUser[]) => {
    if (!searchQuery) return users;
    return users.filter((user) => {
      const fullName = `${user.firstName ?? ""} ${user.lastName ?? ""}`.toLowerCase();
      return (
        fullName.includes(searchQuery.toLowerCase()) ||
        user.email?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    });
  };

  const filteredTeamUsers = filterUsers(teamUsers);
  const filteredSupplierUsers = filterUsers(supplierUsers);

  const removeUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      return apiRequest(`/api/projects/${projectId}/team/${userId}`, "DELETE");
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

  const columns = useMemo<ColumnDef<TeamUser, unknown>[]>(() => {
    const cols: (ColumnDef<TeamUser, unknown> & { meta?: DataTableColumnMeta })[] = [
      {
        id: "user",
        header: "User",
        accessorFn: (u) => `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim(),
        cell: ({ row }) => (
          <div className="flex items-center gap-3" data-testid={`cell-user-${row.original.id}`}>
            <Avatar className="h-8 w-8">
              <AvatarFallback className="text-xs bg-primary/10 text-primary">
                {getUserInitials(row.original)}
              </AvatarFallback>
            </Avatar>
            <span className="font-medium text-sm">{getUserDisplayName(row.original)}</span>
          </div>
        ),
        size: 240,
        meta: { defaultWidth: 240, headerLabel: "User" },
      },
      {
        id: "email",
        header: "Email",
        accessorFn: (u) => u.email ?? "",
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground" data-testid={`cell-email-${row.original.id}`}>
            {row.original.email}
          </span>
        ),
        size: 260,
        meta: { defaultWidth: 260, headerLabel: "Email" },
      },
      {
        id: "role",
        header: "Role",
        accessorFn: (u) => u.role?.name ?? "",
        cell: ({ row }) => (
          <Badge
            className="text-[10px] px-1.5 py-0 h-5 rounded-full border no-default-hover-elevate no-default-active-elevate"
            style={{
              backgroundColor: "hsl(var(--primary) / 0.08)",
              color: "hsl(var(--primary))",
              borderColor: "hsl(var(--primary) / 0.19)",
            }}
            data-testid={`cell-role-${row.original.id}`}
          >
            {row.original.role?.name || "No Role"}
          </Badge>
        ),
        size: 160,
        meta: { defaultWidth: 160, headerLabel: "Role" },
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex justify-end" data-testid={`cell-actions-${row.original.id}`}>
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              onClick={(e) => {
                e.stopPropagation();
                handleRemoveUser(row.original.id);
              }}
              data-testid={`button-remove-${row.original.id}`}
            >
              <Trash2 className="h-3 w-3 text-destructive" />
            </Button>
          </div>
        ),
        size: 80,
        meta: { defaultWidth: 80, align: "right", pinned: true, headerLabel: "Actions" },
      },
    ];
    return cols;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col h-full" data-testid="project-team-page">
      {/* Row 1 - Title Bar */}
      <div className="h-9 bg-background flex items-center justify-between px-2 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2">
          <h1 className="text-sm font-semibold text-foreground" data-testid="text-page-title">
            {pageTitle}
          </h1>
        </div>
        <Button
          onClick={() => setIsAssignDialogOpen(true)}
          className="h-6 px-2 text-xs bg-primary hover:bg-primary/90"
          data-testid="button-assign-user"
        >
          <UserPlus className="h-3 w-3 mr-1" />
          Assign User
        </Button>
      </div>

      {/* Row 2 - Search */}
      <div className="h-9 bg-background flex items-center px-2 border-b border-border flex-shrink-0">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search team members..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-6 pl-7 pr-2 text-xs"
            data-testid="input-search-team"
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 p-4 overflow-auto">
        <div className="flex flex-col gap-6">
          {/* Team Members Section */}
          <Card className="border-2">
            <CardContent className="p-0">
              <div className="flex items-center gap-2 px-4 py-3 border-b">
                <Users className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold">Team Members</h2>
              </div>
              {isLoading ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  Loading team members...
                </div>
              ) : filteredTeamUsers.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  {searchQuery
                    ? `No team members found matching "${searchQuery}"`
                    : "No team members assigned to this project"}
                </div>
              ) : (
                <DataTable
                  data={filteredTeamUsers}
                  columns={columns}
                  storageKey="project-team-members"
                  legacyConfigKey="project-team-column-config-v1"
                  rowKey={(row) => row.id}
                />
              )}
            </CardContent>
          </Card>

          {/* Divider */}
          <Separator />

          {/* Suppliers Section */}
          <Card className="border-2">
            <CardContent className="p-0">
              <div className="flex items-center gap-2 px-4 py-3 border-b">
                <Building2 className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold">Suppliers</h2>
              </div>
              {isLoading ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  Loading suppliers...
                </div>
              ) : filteredSupplierUsers.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  {searchQuery
                    ? `No suppliers found matching "${searchQuery}"`
                    : "No suppliers assigned to this project"}
                </div>
              ) : (
                <DataTable
                  data={filteredSupplierUsers}
                  columns={columns}
                  storageKey="project-team-suppliers"
                  legacyConfigKey="project-team-column-config-v1"
                  rowKey={(row) => row.id}
                />
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <AssignUserDialog
        open={isAssignDialogOpen}
        onOpenChange={setIsAssignDialogOpen}
        projectId={projectId}
      />
    </div>
  );
}
