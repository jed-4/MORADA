import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
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
import { Input } from "@/components/ui/input";
import { UserPlus, Trash2, Search, Users, Building2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import AssignUserDialog from "@/components/AssignUserDialog";

export default function ProjectTeam() {
  const [, params] = useRoute("/projects/:projectId/team");
  const projectId = params?.projectId || "";
  const [isAssignDialogOpen, setIsAssignDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const { toast } = useToast();

  const { data: teamMembers = [], isLoading } = useQuery({
    queryKey: [`/api/projects/${projectId}/team`],
  });

  const teamUsers = teamMembers.filter((user: any) => user.userCategory === "team");
  const supplierUsers = teamMembers.filter((user: any) => user.userCategory === "supplier");

  const filterUsers = (users: any[]) => {
    if (!searchQuery) return users;
    return users.filter((user: any) => {
      const fullName = `${user.firstName} ${user.lastName}`.toLowerCase();
      return fullName.includes(searchQuery.toLowerCase()) || 
             user.email?.toLowerCase().includes(searchQuery.toLowerCase());
    });
  };

  const filteredTeamUsers = filterUsers(teamUsers);
  const filteredSupplierUsers = filterUsers(supplierUsers);

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

  const renderUserTable = (users: any[], type: "team" | "supplier") => (
    <Table>
      <TableHeader>
        <TableRow className="bg-muted/30">
          <TableHead className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground h-8">
            User
          </TableHead>
          <TableHead className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground h-8">
            Email
          </TableHead>
          <TableHead className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground h-8">
            Role
          </TableHead>
          <TableHead className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground h-8 text-right">
            Actions
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {users.map((user: any, index: number) => (
          <TableRow 
            key={user.id} 
            className={`hover-elevate ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}
            data-testid={`${type}-row-${user.id}`}
          >
            <TableCell className="py-2">
              <div className="flex items-center gap-3">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="text-xs bg-[#bba7db]/10 text-[#bba7db]">
                    {getInitials(user.firstName, user.lastName)}
                  </AvatarFallback>
                </Avatar>
                <span className="font-medium text-sm">
                  {user.firstName} {user.lastName}
                </span>
              </div>
            </TableCell>
            <TableCell className="py-2 text-sm text-muted-foreground">
              {user.email}
            </TableCell>
            <TableCell className="py-2">
              <Badge 
                className="text-[10px] px-1.5 py-0 h-5 rounded-full border no-default-hover-elevate no-default-active-elevate"
                style={{
                  backgroundColor: '#bba7db15',
                  color: '#bba7db',
                  borderColor: '#bba7db30'
                }}
              >
                {user.role?.name || "No Role"}
              </Badge>
            </TableCell>
            <TableCell className="py-2 text-right">
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                onClick={() => handleRemoveUser(user.id)}
                data-testid={`button-remove-${user.id}`}
              >
                <Trash2 className="h-3 w-3 text-destructive" />
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );

  return (
    <div className="flex flex-col h-full" data-testid="project-team-page">
      {/* Row 1 - Title Bar */}
      <div className="h-9 bg-white flex items-center justify-between px-2 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2">
          <h1 className="text-sm font-semibold text-foreground">Project Team</h1>
        </div>
        <Button
          onClick={() => setIsAssignDialogOpen(true)}
          className="h-6 px-2 text-xs bg-[#bba7db] hover:bg-[#bba7db]/90"
          data-testid="button-assign-user"
        >
          <UserPlus className="h-3 w-3 mr-1" />
          Assign User
        </Button>
      </div>

      {/* Row 2 - Search */}
      <div className="h-9 bg-white flex items-center px-2 border-b border-border flex-shrink-0">
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
                <Users className="h-4 w-4 text-[#bba7db]" />
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
                    : "No team members assigned to this project"
                  }
                </div>
              ) : (
                renderUserTable(filteredTeamUsers, "team")
              )}
            </CardContent>
          </Card>

          {/* Divider */}
          <Separator />

          {/* Suppliers Section */}
          <Card className="border-2">
            <CardContent className="p-0">
              <div className="flex items-center gap-2 px-4 py-3 border-b">
                <Building2 className="h-4 w-4 text-[#bba7db]" />
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
                    : "No suppliers assigned to this project"
                  }
                </div>
              ) : (
                renderUserTable(filteredSupplierUsers, "supplier")
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
