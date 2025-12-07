import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { 
  UserPlus, 
  Mail, 
  Search, 
  MoreVertical, 
  Pencil, 
  Users,
  Building2,
  Phone,
  Plus,
  Trash2,
  Briefcase,
  Clock,
  Send,
  XCircle
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import InviteUserDialog from "@/components/InviteUserDialog";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { insertSupplierSchema, type Supplier, type InsertSupplier, type UserInvitation } from "@shared/schema";
import { z } from "zod";

const supplierFormSchema = insertSupplierSchema.extend({
  name: z.string().min(1, "Name is required"),
  email: z.string().optional(),
  phone: z.string().optional(),
  abn: z.string().optional(),
  address: z.string().optional(),
});

type SupplierFormValues = z.infer<typeof supplierFormSchema>;

export default function TeamManagement() {
  const [, navigate] = useLocation();
  const pageTitle = usePageTitle({ pageName: "Team" });
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);
  const [isSupplierDialogOpen, setIsSupplierDialogOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSection, setActiveSection] = useState<"members" | "suppliers">("members");
  const { toast } = useToast();

  const supplierForm = useForm<SupplierFormValues>({
    resolver: zodResolver(supplierFormSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      abn: "",
      address: "",
    },
  });

  const { data: allUsers = [], isLoading: usersLoading } = useQuery({
    queryKey: ["/api/users"],
  });

  const { data: roles = [] } = useQuery({
    queryKey: ["/api/user-roles"],
  });

  const { data: suppliers = [], isLoading: suppliersLoading } = useQuery<Supplier[]>({
    queryKey: ["/api/suppliers"],
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

  const createSupplierMutation = useMutation({
    mutationFn: async (data: InsertSupplier) => {
      return await apiRequest("/api/suppliers", "POST", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/suppliers"] });
      toast({ title: "Supplier created successfully" });
      handleCloseSupplierDialog();
    },
    onError: () => {
      toast({ title: "Failed to create supplier", variant: "destructive" });
    },
  });

  const updateSupplierMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<InsertSupplier> }) => {
      return await apiRequest(`/api/suppliers/${id}`, "PATCH", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/suppliers"] });
      toast({ title: "Supplier updated successfully" });
      handleCloseSupplierDialog();
    },
    onError: () => {
      toast({ title: "Failed to update supplier", variant: "destructive" });
    },
  });

  const deleteSupplierMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/suppliers/${id}`, "DELETE");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/suppliers"] });
      toast({ title: "Supplier deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete supplier", variant: "destructive" });
    },
  });

  const users = allUsers
    .filter((user: any) => user.firstName || user.lastName || user.email)
    .sort((a: any, b: any) => {
      const roleAIndex = roles.findIndex((r: any) => r.id === a.roleId);
      const roleBIndex = roles.findIndex((r: any) => r.id === b.roleId);
      if (roleAIndex === -1) return 1;
      if (roleBIndex === -1) return -1;
      return roleAIndex - roleBIndex;
    });

  const filteredUsers = users.filter((user: any) => {
    if (!searchQuery) return true;
    const searchLower = searchQuery.toLowerCase();
    return (
      `${user.firstName} ${user.lastName}`.toLowerCase().includes(searchLower) ||
      user.email?.toLowerCase().includes(searchLower) ||
      user.role?.name?.toLowerCase().includes(searchLower)
    );
  });

  const filteredSuppliers = suppliers.filter((supplier) => {
    if (!searchQuery) return true;
    const searchLower = searchQuery.toLowerCase();
    return (
      supplier.name.toLowerCase().includes(searchLower) ||
      supplier.email?.toLowerCase().includes(searchLower) ||
      supplier.phone?.toLowerCase().includes(searchLower)
    );
  });

  const handleAddSupplier = () => {
    setEditingSupplier(null);
    supplierForm.reset({
      name: "",
      email: "",
      phone: "",
      abn: "",
      address: "",
    });
    setIsSupplierDialogOpen(true);
  };

  const handleEditSupplier = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    supplierForm.reset({
      name: supplier.name,
      email: supplier.email ?? "",
      phone: supplier.phone ?? "",
      abn: supplier.abn ?? "",
      address: supplier.address ?? "",
    });
    setIsSupplierDialogOpen(true);
  };

  const handleCloseSupplierDialog = () => {
    setIsSupplierDialogOpen(false);
    setEditingSupplier(null);
    supplierForm.reset();
  };

  const onSupplierSubmit = (data: SupplierFormValues) => {
    if (editingSupplier) {
      updateSupplierMutation.mutate({ id: editingSupplier.id, data });
    } else {
      createSupplierMutation.mutate(data);
    }
  };

  const handleDeleteSupplier = (id: string) => {
    if (confirm("Are you sure you want to delete this supplier?")) {
      deleteSupplierMutation.mutate(id);
    }
  };

  return (
    <div className="flex flex-col h-full" data-testid="team-management-page">
      {/* Row 1 - Title Bar */}
      <div className="h-9 bg-background flex items-center px-3 border-b border-border/50 flex-shrink-0">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold" data-testid="text-page-title">{pageTitle}</h2>
          <Badge variant="secondary" className="text-xs">
            {activeSection === "members" ? filteredUsers.length : filteredSuppliers.length}{" "}
            {activeSection === "members" 
              ? (filteredUsers.length === 1 ? "member" : "members")
              : (filteredSuppliers.length === 1 ? "supplier" : "suppliers")}
          </Badge>
        </div>
      </div>

      {/* Row 2 - Section Tabs & Actions */}
      <div className="h-9 bg-background flex items-center justify-between px-3 flex-shrink-0">
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setActiveSection('members')}
            className={`h-6 px-2 text-xs border rounded-md ${
              activeSection === 'members' 
                ? 'bg-[#bba7db] text-white border-[#bba7db]/20' 
                : 'hover-elevate'
            } active-elevate-2 flex items-center gap-1`}
            data-testid="button-section-members"
          >
            <Users className="w-3 h-3" />
            <span>Team Members</span>
            <Badge variant="secondary" className="h-4 text-[10px] px-1">{filteredUsers.length}</Badge>
          </button>

          <button
            onClick={() => setActiveSection('suppliers')}
            className={`h-6 px-2 text-xs border rounded-md ${
              activeSection === 'suppliers' 
                ? 'bg-[#bba7db] text-white border-[#bba7db]/20' 
                : 'hover-elevate'
            } active-elevate-2 flex items-center gap-1`}
            data-testid="button-section-suppliers"
          >
            <Building2 className="w-3 h-3" />
            <span>Suppliers</span>
            <Badge variant="secondary" className="h-4 text-[10px] px-1">{filteredSuppliers.length}</Badge>
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          {activeSection === "members" ? (
            <button
              onClick={() => setIsInviteDialogOpen(true)}
              className="h-6 px-2 text-xs border rounded-md bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90 active-elevate-2 flex items-center gap-0.5"
              data-testid="button-invite-user"
            >
              <UserPlus className="w-3 h-3" />
              <span>Invite Member</span>
            </button>
          ) : (
            <button
              onClick={handleAddSupplier}
              className="h-6 px-2 text-xs border rounded-md bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90 active-elevate-2 flex items-center gap-0.5"
              data-testid="button-add-supplier"
            >
              <Plus className="w-3 h-3" />
              <span>Add Supplier</span>
            </button>
          )}
        </div>
      </div>

      {/* Row 3 - Search & Filters */}
      <div className="h-9 bg-background flex items-center px-2 gap-1.5 border-b border-border flex-shrink-0">
        <div className="relative w-48">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
          <Input
            placeholder={activeSection === "members" ? "Search members..." : "Search suppliers..."}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-7 pr-2 py-0 h-6 text-xs border"
            data-testid="input-search"
          />
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-auto p-3">
        {activeSection === "members" && (
          <>
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
          </>
        )}

        {activeSection === "suppliers" && (
          <>
            {suppliersLoading ? (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                Loading...
              </div>
            ) : filteredSuppliers.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full">
                <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No suppliers found</h3>
                <p className="text-muted-foreground text-sm">
                  {searchQuery ? "Try adjusting your search" : "Add your first supplier to get started"}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {filteredSuppliers.map((supplier) => (
                  <SupplierCard
                    key={supplier.id}
                    supplier={supplier}
                    onEdit={handleEditSupplier}
                    onDelete={handleDeleteSupplier}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Invite User Dialog */}
      <InviteUserDialog
        open={isInviteDialogOpen}
        onOpenChange={setIsInviteDialogOpen}
      />

      {/* Supplier Dialog */}
      <Dialog open={isSupplierDialogOpen} onOpenChange={setIsSupplierDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{editingSupplier ? "Edit Supplier" : "Add Supplier"}</DialogTitle>
            <DialogDescription>
              {editingSupplier ? "Update supplier details" : "Add a new supplier to your team"}
            </DialogDescription>
          </DialogHeader>
          <Form {...supplierForm}>
            <form onSubmit={supplierForm.handleSubmit(onSupplierSubmit)} className="space-y-4">
              <FormField
                control={supplierForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Company Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter company name" {...field} data-testid="input-supplier-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={supplierForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input placeholder="Email address" {...field} data-testid="input-supplier-email" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={supplierForm.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone</FormLabel>
                      <FormControl>
                        <Input placeholder="Phone number" {...field} data-testid="input-supplier-phone" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={supplierForm.control}
                name="abn"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>ABN</FormLabel>
                    <FormControl>
                      <Input placeholder="Australian Business Number" {...field} data-testid="input-supplier-abn" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={supplierForm.control}
                name="address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Address</FormLabel>
                    <FormControl>
                      <Input placeholder="Business address" {...field} data-testid="input-supplier-address" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex justify-end gap-2 pt-4">
                <Button type="button" variant="outline" onClick={handleCloseSupplierDialog}>
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  className="bg-[#bba7db] hover:bg-[#bba7db]/90"
                  disabled={createSupplierMutation.isPending || updateSupplierMutation.isPending}
                  data-testid="button-save-supplier"
                >
                  {editingSupplier ? "Update" : "Add"} Supplier
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
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
  const [isHovered, setIsHovered] = useState(false);
  
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
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
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

        <div className={`flex items-center gap-1 shrink-0 ${isHovered ? 'visible' : 'invisible'}`}>
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
      </CardContent>
    </Card>
  );
}

function SupplierCard({ 
  supplier,
  onEdit,
  onDelete
}: {
  supplier: Supplier;
  onEdit: (supplier: Supplier) => void;
  onDelete: (id: string) => void;
}) {
  const [isHovered, setIsHovered] = useState(false);

  const getInitials = (name: string) => {
    const words = name.split(' ');
    if (words.length >= 2) {
      return `${words[0].charAt(0)}${words[1].charAt(0)}`.toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  return (
    <Card
      className="h-20 border-2 transition-all duration-200 cursor-pointer hover-elevate"
      onClick={() => onEdit(supplier)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      data-testid={`supplier-card-${supplier.id}`}
    >
      <CardContent className="p-3 h-full flex items-center gap-3">
        <Avatar className="h-12 w-12 shrink-0">
          <AvatarFallback className="bg-[#bba7db]/10 text-[#bba7db] font-semibold">
            {getInitials(supplier.name)}
          </AvatarFallback>
        </Avatar>

        <div className="flex-1 min-w-0 flex flex-col justify-between h-full py-0.5">
          <div className="flex items-start gap-1.5">
            <h3 className="text-sm leading-5 truncate flex-1 text-foreground font-medium" data-testid={`supplier-name-${supplier.id}`}>
              {supplier.name}
            </h3>
            
            {supplier.abn && (
              <Badge 
                variant="outline"
                className="text-[10px] px-1.5 py-0 h-4 rounded-full no-default-hover-elevate no-default-active-elevate shrink-0"
              >
                ABN: {supplier.abn}
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
            {supplier.email && (
              <div className="flex items-center gap-1">
                <Mail className="h-2.5 w-2.5 shrink-0" />
                <span className="truncate max-w-32">{supplier.email}</span>
              </div>
            )}
            {supplier.phone && (
              <div className="flex items-center gap-1">
                <Phone className="h-2.5 w-2.5 shrink-0" />
                <span>{supplier.phone}</span>
              </div>
            )}
            {supplier.xeroContactId && (
              <Badge 
                className="text-[10px] px-1.5 py-0 h-4 rounded-full border no-default-hover-elevate no-default-active-elevate shrink-0 bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
              >
                Xero Linked
              </Badge>
            )}
          </div>
        </div>

        <div className={`flex items-center gap-1 shrink-0 ${isHovered ? 'visible' : 'invisible'}`}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={(e) => e.stopPropagation()}
                data-testid={`button-supplier-actions-${supplier.id}`}
              >
                <MoreVertical className="h-3 w-3 text-[#bba7db]" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(supplier); }}>
                <Pencil className="h-3 w-3 mr-2" />
                Edit Supplier
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={(e) => { e.stopPropagation(); onDelete(supplier.id); }}
                className="text-destructive"
              >
                <Trash2 className="h-3 w-3 mr-2" />
                Delete Supplier
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
