import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { usePageTitle } from "@/hooks/usePageTitle";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { 
  UserPlus, 
  Mail, 
  Search, 
  Users,
  Clock,
  Send,
  XCircle,
  HardHat,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import InviteUserDialog from "@/components/InviteUserDialog";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { type UserInvitation } from "@shared/schema";

export default function TeamManagement() {
  const [, navigate] = useLocation();
  const pageTitle = usePageTitle({ pageName: "Team" });
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const { toast } = useToast();

  const { data: allUsers = [], isLoading: usersLoading } = useQuery({
    queryKey: ["/api/users"],
  });

  const { data: pendingInvitations = [], isLoading: invitationsLoading } = useQuery<UserInvitation[]>({
    queryKey: ["/api/invitations", "pending"],
    queryFn: async () => {
      const response = await fetch("/api/invitations?status=pending");
      if (!response.ok) throw new Error("Failed to fetch invitations");
      return response.json();
    },
  });

  const resendInvitationMutation = useMutation({
    mutationFn: async (invitationId: string) => {
      return await apiRequest(`/api/invitations/${invitationId}/resend`, "POST");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invitations"] });
      toast({ title: "Invitation resent successfully" });
    },
    onError: () => {
      toast({ title: "Failed to resend invitation", variant: "destructive" });
    },
  });

  const cancelInvitationMutation = useMutation({
    mutationFn: async (invitationId: string) => {
      return await apiRequest(`/api/invitations/${invitationId}`, "DELETE");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invitations"] });
      toast({ title: "Invitation cancelled" });
    },
    onError: () => {
      toast({ title: "Failed to cancel invitation", variant: "destructive" });
    },
  });

  const users = allUsers.filter((user: any) => user.firstName || user.lastName || user.email);

  const filteredUsers = users.filter((user: any) => {
    if (!searchQuery) return true;
    const searchLower = searchQuery.toLowerCase();
    return (
      `${user.firstName} ${user.lastName}`.toLowerCase().includes(searchLower) ||
      user.email?.toLowerCase().includes(searchLower) ||
      user.role?.name?.toLowerCase().includes(searchLower)
    );
  });

  return (
    <div className="flex flex-col h-full" data-testid="team-management-page">
      {/* Row 1 - Title, Search */}
      <div className="h-9 bg-background flex items-center justify-between px-3 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold" data-testid="text-page-title">{pageTitle}</h2>
          
          <div className="relative w-40">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
            <Input
              placeholder="Search members..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-7 pr-2 py-0 h-6 text-xs border"
              data-testid="input-search"
            />
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setIsInviteDialogOpen(true)}
            className="h-6 px-2 text-xs border rounded-md bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90 active-elevate-2 flex items-center gap-0.5"
            data-testid="button-invite-user"
          >
            <UserPlus className="w-3 h-3" />
            <span>Invite Member</span>
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-auto p-3">
        {usersLoading || invitationsLoading ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            Loading...
          </div>
        ) : filteredUsers.length === 0 && pendingInvitations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full">
            <Users className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No team members found</h3>
            <p className="text-muted-foreground text-sm">
              {searchQuery ? "Try adjusting your search" : "Get started by inviting your first team member"}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Pending Invitations Section */}
            {pendingInvitations.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  Pending Invitations ({pendingInvitations.length})
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {pendingInvitations.map((invitation) => (
                    <PendingInvitationCard
                      key={invitation.id}
                      invitation={invitation}
                      onResend={() => resendInvitationMutation.mutate(invitation.id)}
                      onCancel={() => {
                        if (confirm("Are you sure you want to cancel this invitation?")) {
                          cancelInvitationMutation.mutate(invitation.id);
                        }
                      }}
                      isResending={resendInvitationMutation.isPending}
                      isCancelling={cancelInvitationMutation.isPending}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Team Members Section */}
            {filteredUsers.length > 0 && (
              <div className="space-y-2">
                {pendingInvitations.length > 0 && (
                  <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5" />
                    Active Members ({filteredUsers.length})
                  </h3>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {filteredUsers.map((user: any) => (
                    <TeamMemberCard
                      key={user.id}
                      user={user}
                      onView={(id) => navigate(`/business-team/${id}`)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Invite User Dialog */}
      <InviteUserDialog
        open={isInviteDialogOpen}
        onOpenChange={setIsInviteDialogOpen}
      />

    </div>
  );
}

function TeamMemberCard({ 
  user,
  onView
}: {
  user: any;
  onView: (id: string) => void;
}) {
  const getInitials = (firstName?: string | null, lastName?: string | null, email?: string | null) => {
    if (firstName && lastName) {
      return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
    }
    if (firstName) return firstName.charAt(0).toUpperCase();
    if (lastName) return lastName.charAt(0).toUpperCase();
    if (email) return email.charAt(0).toUpperCase();
    return "?";
  };

  const getDisplayName = (user: any) => {
    if (user.firstName && user.lastName) {
      return `${user.firstName} ${user.lastName}`;
    }
    if (user.firstName) return user.firstName;
    if (user.lastName) return user.lastName;
    return user.email || "Unknown";
  };

  const getStatusColor = (user: any) => {
    if (!user.isActive) return { bg: '#ef444415', border: '#ef444430', text: '#ef4444' };
    if (user.isInvitePending) return { bg: '#f59e0b15', border: '#f59e0b30', text: '#f59e0b' };
    return { bg: '#10b98115', border: '#10b98130', text: '#10b981' };
  };

  const statusColor = getStatusColor(user);

  return (
    <Card
      className="h-20 border-2 transition-all duration-200 cursor-pointer hover-elevate"
      onClick={() => onView(user.id)}
      data-testid={`team-member-card-${user.id}`}
    >
      <CardContent className="p-3 h-full flex items-center gap-3">
        <Avatar className="h-12 w-12 shrink-0">
          <AvatarFallback className="bg-[#bba7db]/10 text-[#bba7db] font-semibold">
            {getInitials(user.firstName, user.lastName, user.email)}
          </AvatarFallback>
        </Avatar>

        <div className="flex-1 min-w-0 flex flex-col justify-between h-full py-0.5">
          <div className="flex items-start gap-1.5">
            <h3 className="text-sm leading-5 truncate flex-1 text-foreground font-medium" data-testid={`team-member-name-${user.id}`}>
              {getDisplayName(user)}
            </h3>
            
            <Badge 
              className="text-[10px] px-1.5 py-0 h-4 rounded-full border no-default-hover-elevate no-default-active-elevate shrink-0"
              style={{
                backgroundColor: '#bba7db15',
                color: '#bba7db',
                borderColor: '#bba7db30'
              }}
            >
              {user.role?.name || "No Role"}
            </Badge>
            {user.isSubcontractor && (
              <Badge 
                className="text-[10px] px-1.5 py-0 h-4 rounded-full border no-default-hover-elevate no-default-active-elevate shrink-0"
                style={{
                  backgroundColor: '#f59e0b15',
                  color: '#f59e0b',
                  borderColor: '#f59e0b30'
                }}
              >
                <HardHat className="w-2.5 h-2.5 mr-0.5" />
                Sub
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <Mail className="h-2.5 w-2.5 shrink-0" />
            <span className="truncate flex-1">{user.email}</span>
            
            <Badge 
              className="text-[10px] px-1.5 py-0 h-4 rounded-full border no-default-hover-elevate no-default-active-elevate shrink-0"
              style={{
                backgroundColor: statusColor.bg,
                color: statusColor.text,
                borderColor: statusColor.border
              }}
            >
              {!user.isActive ? "Disabled" : user.isInvitePending ? "Pending" : "Active"}
            </Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function PendingInvitationCard({ 
  invitation,
  onResend,
  onCancel,
  isResending,
  isCancelling
}: {
  invitation: UserInvitation;
  onResend: () => void;
  onCancel: () => void;
  isResending: boolean;
  isCancelling: boolean;
}) {
  const [isHovered, setIsHovered] = useState(false);
  
  const getInitials = (firstName: string | null, lastName: string | null, email: string) => {
    if (firstName && lastName) {
      return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
    }
    return email.slice(0, 2).toUpperCase();
  };

  const getDisplayName = () => {
    if (invitation.firstName && invitation.lastName) {
      return `${invitation.firstName} ${invitation.lastName}`;
    }
    return invitation.email;
  };

  const isExpired = invitation.expiresAt && new Date(invitation.expiresAt) < new Date();

  return (
    <Card
      className="h-20 border-2 transition-all duration-200 hover-elevate"
      style={{
        borderColor: isExpired ? '#ef444430' : '#f59e0b30',
        backgroundColor: isExpired ? '#ef444408' : '#f59e0b08'
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      data-testid={`pending-invitation-card-${invitation.id}`}
    >
      <CardContent className="p-3 h-full flex items-center gap-3">
        <Avatar className="h-12 w-12 shrink-0">
          <AvatarFallback 
            className="font-semibold"
            style={{
              backgroundColor: isExpired ? '#ef444415' : '#f59e0b15',
              color: isExpired ? '#ef4444' : '#f59e0b'
            }}
          >
            {getInitials(invitation.firstName, invitation.lastName, invitation.email)}
          </AvatarFallback>
        </Avatar>

        <div className="flex-1 min-w-0 flex flex-col justify-between h-full py-0.5">
          <div className="flex items-start gap-1.5">
            <h3 className="text-sm leading-5 truncate flex-1 text-foreground font-medium" data-testid={`invitation-name-${invitation.id}`}>
              {getDisplayName()}
            </h3>
            
            <Badge 
              className="text-[10px] px-1.5 py-0 h-4 rounded-full border no-default-hover-elevate no-default-active-elevate shrink-0"
              style={{
                backgroundColor: isExpired ? '#ef444415' : '#f59e0b15',
                color: isExpired ? '#ef4444' : '#f59e0b',
                borderColor: isExpired ? '#ef444430' : '#f59e0b30'
              }}
            >
              {isExpired ? "Expired" : "Pending"}
            </Badge>
          </div>

          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <Mail className="h-2.5 w-2.5 shrink-0" />
            <span className="truncate flex-1">{invitation.email}</span>
            
            {invitation.expiresAt && (
              <span className="shrink-0 text-muted-foreground">
                {isExpired ? "Expired" : `Expires ${new Date(invitation.expiresAt).toLocaleDateString()}`}
              </span>
            )}
          </div>
        </div>

        <div className={`flex items-center gap-1 shrink-0 ${isHovered ? 'visible' : 'invisible'}`}>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={(e) => { e.stopPropagation(); onResend(); }}
            disabled={isResending}
            title="Resend Invitation"
            data-testid={`button-resend-${invitation.id}`}
          >
            <Send className="h-3 w-3 text-[#f59e0b]" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={(e) => { e.stopPropagation(); onCancel(); }}
            disabled={isCancelling}
            title="Cancel Invitation"
            data-testid={`button-cancel-${invitation.id}`}
          >
            <XCircle className="h-3 w-3 text-destructive" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
