import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus,
  Search,
  MoreVertical,
  Edit,
  Archive,
  ArchiveRestore,
  Mail,
  Phone,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { type Contact } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import AddContactDialog from "@/components/AddContactDialog";
import EditContactDialog from "@/components/EditContactDialog";

export default function Contacts() {
  const { toast } = useToast();
  const [selectedTab, setSelectedTab] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [selectedContactType, setSelectedContactType] = useState<"team" | "supplier" | "client" | undefined>();
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [contactToEdit, setContactToEdit] = useState<Contact | null>(null);

  const { data: contacts = [], isLoading } = useQuery<Contact[]>({
    queryKey: ["/api/contacts"],
  });

  const archiveMutation = useMutation({
    mutationFn: (contactId: string) =>
      apiRequest("POST", `/api/contacts/${contactId}/archive`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      toast({
        title: "Contact archived",
        description: "Contact has been archived successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Failed to archive contact",
        variant: "destructive",
      });
    },
  });

  const restoreMutation = useMutation({
    mutationFn: (contactId: string) =>
      apiRequest("POST", `/api/contacts/${contactId}/restore`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      toast({
        title: "Contact restored",
        description: "Contact has been restored successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Failed to restore contact",
        variant: "destructive",
      });
    },
  });

  const filteredContacts = useMemo(() => {
    return contacts.filter((contact) => {
      // Filter by tab
      if (selectedTab !== "all" && contact.contactType !== selectedTab) {
        return false;
      }

      // Filter by search term
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        return (
          contact.name?.toLowerCase().includes(search) ||
          contact.firstName?.toLowerCase().includes(search) ||
          contact.lastName?.toLowerCase().includes(search) ||
          contact.email?.toLowerCase().includes(search) ||
          contact.company?.toLowerCase().includes(search) ||
          contact.phone?.toLowerCase().includes(search)
        );
      }

      return true;
    });
  }, [contacts, selectedTab, searchTerm]);

  const tabCounts = useMemo(() => {
    return {
      all: contacts.length,
      team: contacts.filter((c) => c.contactType === "team").length,
      supplier: contacts.filter((c) => c.contactType === "supplier").length,
      client: contacts.filter((c) => c.contactType === "client").length,
    };
  }, [contacts]);

  const getInitials = (contact: Contact) => {
    if (contact.firstName && contact.lastName) {
      return (contact.firstName[0] + contact.lastName[0]).toUpperCase();
    }
    if (contact.firstName) {
      return contact.firstName.substring(0, 2).toUpperCase();
    }
    if (contact.lastName) {
      return contact.lastName.substring(0, 2).toUpperCase();
    }
    // Fallback to name field if firstName/lastName not available
    if (contact.name) {
      const parts = contact.name.trim().split(" ");
      if (parts.length >= 2) {
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
      }
      return contact.name.substring(0, 2).toUpperCase();
    }
    return "??";
  };

  const handleAddContact = (type?: "team" | "supplier" | "client") => {
    setSelectedContactType(type);
    setIsAddDialogOpen(true);
  };

  const handleArchive = (contactId: string) => {
    archiveMutation.mutate(contactId);
  };

  const handleRestore = (contactId: string) => {
    restoreMutation.mutate(contactId);
  };

  const handleEdit = (contact: Contact) => {
    setContactToEdit(contact);
    setIsEditDialogOpen(true);
  };

  return (
    <div className="h-full flex flex-col">
      <Tabs value={selectedTab} onValueChange={setSelectedTab} className="flex-1 flex flex-col">
        <div className="flex-none border-b px-6">
          <TabsList className="bg-transparent border-0 p-0 h-auto gap-6" data-testid="tabs-contact-type">
            <TabsTrigger
              value="all"
              className="border-0 bg-transparent data-[state=active]:bg-transparent data-[state=active]:shadow-none rounded-none border-b-2 border-transparent data-[state=active]:border-primary px-0 pb-3"
              data-testid="tab-all"
            >
              All
              <Badge variant="secondary" className="ml-2" data-testid="badge-count-all">
                {tabCounts.all}
              </Badge>
            </TabsTrigger>
            <TabsTrigger
              value="team"
              className="border-0 bg-transparent data-[state=active]:bg-transparent data-[state=active]:shadow-none rounded-none border-b-2 border-transparent data-[state=active]:border-primary px-0 pb-3"
              data-testid="tab-team"
            >
              Team
              <Badge variant="secondary" className="ml-2" data-testid="badge-count-team">
                {tabCounts.team}
              </Badge>
            </TabsTrigger>
            <TabsTrigger
              value="supplier"
              className="border-0 bg-transparent data-[state=active]:bg-transparent data-[state=active]:shadow-none rounded-none border-b-2 border-transparent data-[state=active]:border-primary px-0 pb-3"
              data-testid="tab-supplier"
            >
              Suppliers
              <Badge variant="secondary" className="ml-2" data-testid="badge-count-supplier">
                {tabCounts.supplier}
              </Badge>
            </TabsTrigger>
            <TabsTrigger
              value="client"
              className="border-0 bg-transparent data-[state=active]:bg-transparent data-[state=active]:shadow-none rounded-none border-b-2 border-transparent data-[state=active]:border-primary px-0 pb-3"
              data-testid="tab-client"
            >
              Clients
              <Badge variant="secondary" className="ml-2" data-testid="badge-count-client">
                {tabCounts.client}
              </Badge>
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Header with search and actions */}
        <div className="flex-none p-6 border-b">
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search contacts..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
                data-testid="input-search-contacts"
              />
            </div>
            <Button
              onClick={() => handleAddContact(selectedTab === "all" ? undefined : selectedTab as any)}
              data-testid="button-add-contact"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Contact
            </Button>
          </div>
        </div>

        {/* Content area with table */}
        <div className="flex-1 overflow-auto px-6 py-4">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12"></TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Position/Role</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Email</TableHead>
                  {selectedTab === "supplier" && <TableHead>ABN</TableHead>}
                  {selectedTab === "supplier" && <TableHead>Payment Terms</TableHead>}
                  {selectedTab === "team" && <TableHead>Hourly Rate</TableHead>}
                  {selectedTab === "client" && <TableHead>Portal</TableHead>}
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                      Loading contacts...
                    </TableCell>
                  </TableRow>
                ) : filteredContacts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                      No contacts found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredContacts.map((contact) => (
                    <TableRow key={contact.id} data-testid={`row-contact-${contact.id}`}>
                      <TableCell>
                        <Avatar className="h-8 w-8" style={{ backgroundColor: contact.avatarColor || "#6366f1" }}>
                          <AvatarFallback className="text-white" style={{ backgroundColor: "transparent" }}>
                            {getInitials(contact)}
                          </AvatarFallback>
                        </Avatar>
                      </TableCell>
                      <TableCell className="font-medium">
                        {contact.firstName || contact.lastName 
                          ? [contact.firstName, contact.lastName].filter(Boolean).join(" ") 
                          : contact.name || "-"}
                      </TableCell>
                      <TableCell>{contact.company || "-"}</TableCell>
                      <TableCell>
                        {contact.contactType === "team" ? contact.role : contact.position || "-"}
                      </TableCell>
                      <TableCell>
                        {contact.phone ? (
                          <a href={`tel:${contact.phone}`} className="text-primary hover:underline">
                            {contact.phone}
                          </a>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                      <TableCell>
                        {contact.email ? (
                          <a href={`mailto:${contact.email}`} className="text-primary hover:underline">
                            {contact.email}
                          </a>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                      {selectedTab === "supplier" && <TableCell>{contact.abn || "-"}</TableCell>}
                      {selectedTab === "supplier" && <TableCell>{contact.paymentTerms || "-"}</TableCell>}
                      {selectedTab === "team" && (
                        <TableCell>
                          {contact.hourlyRate ? `$${contact.hourlyRate}/hr` : "-"}
                        </TableCell>
                      )}
                      {selectedTab === "client" && (
                        <TableCell>
                          {contact.portalEnabled ? (
                            <Badge variant="secondary">Enabled</Badge>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                      )}
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" data-testid={`button-actions-${contact.id}`}>
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => handleEdit(contact)}
                              data-testid={`menu-edit-${contact.id}`}
                            >
                              <Edit className="h-4 w-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {contact.isArchived ? (
                              <DropdownMenuItem
                                onClick={() => handleRestore(contact.id)}
                                data-testid={`menu-restore-${contact.id}`}
                              >
                                <ArchiveRestore className="h-4 w-4 mr-2" />
                                Restore
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem
                                onClick={() => handleArchive(contact.id)}
                                data-testid={`menu-archive-${contact.id}`}
                              >
                                <Archive className="h-4 w-4 mr-2" />
                                Archive
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </div>
      </Tabs>

      <AddContactDialog
        open={isAddDialogOpen}
        onOpenChange={setIsAddDialogOpen}
        defaultContactType={selectedContactType}
      />

      {contactToEdit && (
        <EditContactDialog
          open={isEditDialogOpen}
          onOpenChange={setIsEditDialogOpen}
          contact={contactToEdit}
        />
      )}
    </div>
  );
}
