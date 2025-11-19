import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { usePageTitle } from "@/hooks/usePageTitle";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { UserPlus, Mail, Search, MoreVertical, Pencil, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import InviteUserDialog from "@/components/InviteUserDialog";

export default function TeamManagement() {
  const [, navigate] = useLocation();
  const pageTitle = usePageTitle({ pageName: "Team" });
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const { toast } = useToast();

  // Fetch current team members
  const { data: allUsers = [], isLoading: usersLoading } = useQuery({
    queryKey: ["/api/users"],
  });

  // Fetch roles to determine display order
  const { data: roles = [] } = useQuery({
    queryKey: ["/api/user-roles"],
  });

  // Filter out users without names (incomplete data) and sort by role order
  const users = allUsers
    .filter((user: any) => user.firstName && user.lastName)
    .sort((a: any, b: any) => {
      // Find role index for each user
      const roleAIndex = roles.findIndex((r: any) => r.id === a.roleId);
      const roleBIndex = roles.findIndex((r: any) => r.id === b.roleId);
      
      // Users without roles go to the end
      if (roleAIndex === -1) return 1;
      if (roleBIndex === -1) return -1;
      
      // Sort by role order
      return roleAIndex - roleBIndex;
    });

  // Filter users based on search query
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
      {/* Single h-9 Header Row */}
      <div className="h-9 bg-background dark:bg-background flex items-center justify-between px-2 border-b border-border flex-shrink-0">
        {/* Left: Title + Count */}
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">{pageTitle}</h2>
          <Badge variant="secondary" className="text-xs">
            {filteredUsers.length} {filteredUsers.length === 1 ? 'member' : 'members'}
          </Badge>
        </div>

        {/* Right: Search + Invite Button */}
        <div className="flex items-center gap-1.5">
          <div className="relative w-64">
            <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <Input
              placeholder="Search team members..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-6 pl-7 text-xs border rounded-md"
              data-testid="input-search"
            />
          </div>
          <Button
            onClick={() => setIsInviteDialogOpen(true)}
            size="sm"
            className="h-6 px-2 text-xs bg-[#bba7db] text-white hover:bg-[#bba7db]/90 gap-0.5"
            data-testid="button-invite-user"
          >
            <UserPlus className="w-3 h-3" />
            <span>Invite Member</span>
          </Button>
        </div>
      </div>

      {/* Content Area - Card Grid */}
      <div className="flex-1 overflow-auto p-3">
        {usersLoading ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            Loading...
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full">
            <Users className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No team members found</h3>
            <p className="text-muted-foreground text-sm">
              {searchQuery ? "Try adjusting your search" : "Get started by inviting your first team member"}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {filteredUsers.map((user: any) => (
              <TeamMemberCard
                key={user.id}
                user={user}
                onView={(id) => navigate(`/business-team/${id}`)}
              />
            ))}
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

// Team Member Card Component
function TeamMemberCard({ 
  user,
  onView
}: {
  user: any;
  onView: (id: string) => void;
}) {
  const [isHovered, setIsHovered] = useState(false);
  
  const getInitials = (firstName: string, lastName: string) => {
    return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
  };

  const getStatusColor = (user: any) => {
    if (!user.isActive) return { bg: '#ef444415', border: '#ef444430', text: '#ef4444' };
    if (user.isInvitePending) return { bg: '#f59e0b15', border: '#f59e0b30', text: '#f59e0b' };
    return { bg: '#10b98115', border: '#10b98130', text: '#10b981' };
  };

  const statusColor = getStatusColor(user);

  return (
    <Card
      className={`h-20 transition-all duration-200 cursor-pointer rounded-xl border-border/50 ${
        isHovered ? 'shadow-xl scale-[1.01]' : 'shadow-sm'
      }`}
      onClick={() => onView(user.id)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      data-testid={`team-member-card-${user.id}`}
    >
      <CardContent className="p-2 h-full flex items-center gap-2">
        {/* Avatar */}
        <Avatar className="h-12 w-12 shrink-0">
          <AvatarFallback className="bg-[#bba7db]/10 text-[#bba7db] font-semibold">
            {getInitials(user.firstName, user.lastName)}
          </AvatarFallback>
        </Avatar>

        {/* Content */}
        <div className="flex-1 min-w-0 flex flex-col justify-between h-full py-0.5">
          {/* Top row: Name + Role Badge */}
          <div className="flex items-start gap-1.5">
            <h3 className="text-sm leading-5 truncate flex-1 text-foreground font-medium" data-testid={`team-member-name-${user.id}`}>
              {user.firstName} {user.lastName}
            </h3>
            
            {/* Role badge */}
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
          </div>

          {/* Bottom row: Email + Status Badge */}
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

        {/* Hover: Edit Icon */}
        {isHovered && (
          <div className="flex items-center gap-1 shrink-0">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={(e) => e.stopPropagation()}
                  data-testid={`button-actions-${user.id}`}
                >
                  <MoreVertical className="h-3 w-3 text-[#bba7db]" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onView(user.id); }}>
                  <Pencil className="h-3 w-3 mr-2" />
                  View Details
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
