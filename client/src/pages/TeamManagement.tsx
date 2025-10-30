import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
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
import { UserPlus, Mail, Copy, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import InviteUserDialog from "@/components/InviteUserDialog";

export default function TeamManagement() {
  const [, navigate] = useLocation();
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const { toast } = useToast();

  // Fetch current team members
  const { data: allUsers = [], isLoading: usersLoading } = useQuery({
    queryKey: ["/api/users"],
  });

  // Filter out users without names (incomplete data)
  const users = allUsers.filter((user: any) => user.firstName && user.lastName);

  // Fetch pending invitations
  const { data: invitations = [], isLoading: invitationsLoading } = useQuery({
    queryKey: ["/api/invitations"],
  });

  const pendingInvitations = invitations.filter(
    (inv: any) => inv.status === "pending"
  );

  const handleCopyInviteLink = (token: string) => {
    const inviteUrl = `${window.location.origin}/accept-invite/${token}`;
    navigator.clipboard.writeText(inviteUrl);
    setCopiedToken(token);
    toast({
      title: "Invite link copied",
      description: "The invitation link has been copied to your clipboard.",
    });
    setTimeout(() => setCopiedToken(null), 2000);
  };

  return (
    <div className="flex flex-col h-full" data-testid="team-management-page">
      <div className="flex-1 min-h-0 p-6">
        <div className="flex flex-col gap-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">Team Management</h1>
              <p className="text-muted-foreground">
                Manage your team members and send invitations
              </p>
            </div>
            <Button
              onClick={() => setIsInviteDialogOpen(true)}
              data-testid="button-invite-user"
            >
              <UserPlus className="h-4 w-4 mr-2" />
              Invite Team Member
            </Button>
          </div>

          {/* Current Team Members */}
          <Card>
            <CardHeader>
              <CardTitle>Team Members</CardTitle>
              <CardDescription>
                Current users in your company
              </CardDescription>
            </CardHeader>
            <CardContent>
              {usersLoading ? (
                <div className="text-center py-8 text-muted-foreground">
                  Loading team members...
                </div>
              ) : users.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No team members found
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((user: any) => (
                      <TableRow key={user.id} data-testid={`user-row-${user.id}`}>
                        <TableCell className="font-medium">
                          <button
                            onClick={() => navigate(`/business-team/${user.id}`)}
                            className="hover-elevate text-left hover:text-primary transition-colors"
                            data-testid={`link-user-${user.id}`}
                          >
                            {user.firstName} {user.lastName}
                          </button>
                        </TableCell>
                        <TableCell>{user.email}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{user.role?.name || "No Role"}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">
                            {user.userCategory || "team_member"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge 
                            variant={
                              !user.isActive ? "destructive" : 
                              user.isInvitePending ? "secondary" : 
                              "default"
                            }
                            data-testid={`badge-status-${user.id}`}
                          >
                            {!user.isActive ? "Disabled" : 
                             user.isInvitePending ? "Pending" : 
                             "Active"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Pending Invitations */}
          {pendingInvitations.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Pending Invitations</CardTitle>
                <CardDescription>
                  Users who have been invited but haven't accepted yet
                </CardDescription>
              </CardHeader>
              <CardContent>
                {invitationsLoading ? (
                  <div className="text-center py-8 text-muted-foreground">
                    Loading invitations...
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Email</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Sent</TableHead>
                        <TableHead>Expires</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pendingInvitations.map((invitation: any) => (
                        <TableRow
                          key={invitation.id}
                          data-testid={`invitation-row-${invitation.id}`}
                        >
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <Mail className="h-4 w-4 text-muted-foreground" />
                              {invitation.email}
                            </div>
                          </TableCell>
                          <TableCell>
                            {invitation.firstName} {invitation.lastName}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {invitation.role?.name || "No Role"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {new Date(invitation.createdAt).toLocaleDateString()}
                          </TableCell>
                          <TableCell>
                            {new Date(invitation.expiresAt).toLocaleDateString()}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleCopyInviteLink(invitation.inviteToken)}
                              data-testid={`button-copy-invite-${invitation.id}`}
                            >
                              {copiedToken === invitation.inviteToken ? (
                                <>
                                  <Check className="h-4 w-4 mr-2" />
                                  Copied!
                                </>
                              ) : (
                                <>
                                  <Copy className="h-4 w-4 mr-2" />
                                  Copy Link
                                </>
                              )}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Invite User Dialog */}
      <InviteUserDialog
        open={isInviteDialogOpen}
        onOpenChange={setIsInviteDialogOpen}
      />
    </div>
  );
}
